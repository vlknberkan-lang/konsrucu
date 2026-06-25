/**
 * KonsRücü — UYAP senkron · POST /api/uyap/evrak
 * Eklenti, UYAP'ta indirdiği YENİ evrak PDF'ini buraya yükler → Supabase 'evrak' bucket → Belge.
 * Dedup: kaynakRef (UYAP evrakId) ile aynı evrak tekrar eklenmez. Tenant-kapsamlı (Bearer oturum).
 *
 * Gövde: { icraDosyaNo, uyapEvrakId, dosyaAdi, tur?, contentBase64, mime? }
 */
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { siniflandir } from '@/lib/konsrucu/belge-siniflandir'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { belgeBorcaItirazMi, onemliOlayTespit } from '@/lib/konsrucu/onemli-olay'
import { belgedenMasrafCikar } from '@/lib/konsrucu/masraf-cikar'

export const dynamic = 'force-dynamic'

const MAX_B64 = 4_400_000 // ~3.3 MB dosya (Vercel gövde sınırı altında kalsın)

export function OPTIONS() {
  return preflight()
}

export async function POST(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401)

  let body: { icraDosyaNo?: string; uyapEvrakId?: string; dosyaAdi?: string; tur?: string; contentBase64?: string; mime?: string }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400) }

  const icraDosyaNo = String(body?.icraDosyaNo ?? '').trim()
  const uyapEvrakId = String(body?.uyapEvrakId ?? '').replace(/"/g, '').trim() // UYAP id'leri tırnaklı gelebilir → temizle (kaynakRef + storage anahtarı)
  const dosyaAdi = String(body?.dosyaAdi ?? '').trim().slice(0, 255)
  const b64 = String(body?.contentBase64 ?? '')
  if (!icraDosyaNo || !uyapEvrakId || !dosyaAdi) return corsJson({ ok: false, error: 'icraDosyaNo + uyapEvrakId + dosyaAdi gerekli' }, 400)

  const dosya = await prisma.rucuDosyasi.findFirst({ where: { icraDosyaNo, musteriId: { in: k.izinli } }, select: { id: true } })
  if (!dosya) return corsJson({ ok: false, error: 'dosya bulunamadı (icraDosyaNo)' }, 404)

  // dedup — bu evrak daha önce indiyse atla
  const mevcut = await prisma.belge.findFirst({ where: { dosyaId: dosya.id, kaynakRef: uyapEvrakId }, select: { id: true } })
  if (mevcut) return corsJson({ ok: true, atlandi: true, sebep: 'zaten var' })

  if (!b64) return corsJson({ ok: false, error: 'contentBase64 gerekli' }, 400)
  if (b64.length > MAX_B64) return corsJson({ ok: false, atlandi: true, sebep: 'dosya çok büyük (elle ekleyin)' }, 413)

  let bytes: Buffer
  try { bytes = Buffer.from(b64, 'base64') } catch { return corsJson({ ok: false, error: 'base64 çözülemedi' }, 400) }
  if (!bytes.length) return corsJson({ ok: false, error: 'boş içerik' }, 400)

  const mime = String(body?.mime ?? 'application/pdf')
  const safe = dosyaAdi.replace(/[^\w.\-]+/g, '_').slice(0, 80)
  const safeId = (uyapEvrakId.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60)) || 'evrak' // storage anahtarı yalnız güvenli karakter
  const sp = `${dosya.id}/uyap-${safeId}-${safe}`

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage.from('evrak').upload(sp, bytes, { contentType: mime, upsert: false })
  if (upErr && !/already exists/i.test(upErr.message)) return corsJson({ ok: false, error: `yükleme: ${upErr.message}` }, 500)

  const snf = siniflandir({ dosyaAdi: `${dosyaAdi} ${body?.tur ?? ''}`.trim(), metin: null, foto: false })
  const belge = await prisma.belge.create({
    data: { dosyaId: dosya.id, kategori: snf.kategori as never, confidence: snf.guven, dosyaAdi, storagePath: sp, kaynakRef: uyapEvrakId },
    select: { id: true },
  })
  await prisma.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: k.userId, eylem: `UYAP'tan evrak indi: ${dosyaAdi}` } })

  // Borca itiraz dilekçesi indiyse → Önemli Olaylar kuyruğu (idempotent; tespit hatası evrak kaydını bozmaz).
  if (belgeBorcaItirazMi(dosyaAdi) || belgeBorcaItirazMi(body?.tur)) {
    try {
      await onemliOlayTespit({ dosyaId: dosya.id, kaynakBelgeId: belge.id, baslik: dosyaAdi, kullaniciId: k.userId })
    } catch {
      /* sessiz — tespit başarısız olsa da evrak yüklendi */
    }
  }

  // Makbuz/dekont indiyse → PDF'i otomatik oku, Masraf kalemlerini çıkar (hata evrak kaydını bozmaz).
  let masraf: { eklendi: number; atlandi: number } | undefined
  if (snf.kategori === 'DEKONT') {
    try {
      const r = await belgedenMasrafCikar(belge.id, { kullaniciId: k.userId })
      masraf = { eklendi: r.eklendi, atlandi: r.atlandi }
    } catch (e) {
      console.error('masraf çıkarım (evrak):', e)
    }
  }

  return corsJson({ ok: true, eklendi: true, kategori: snf.kategori, masraf })
}
