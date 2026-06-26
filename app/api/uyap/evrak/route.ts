/**
 * KonsRücü — UYAP senkron · POST /api/uyap/evrak
 * Eklenti, UYAP'ta indirdiği YENİ evrak PDF'ini buraya yükler → Supabase 'evrak' bucket → Belge.
 *
 * Dedup: İÇERİK MD5 (icerikHash) ile. UYAP, AYNI evrak için her senkronda YENİ şifreli evrakId verir
 * (kaynakRef değişken → güvenilmez); bu yüzden tekrar tespiti içeriğin MD5'ine dayanır (Storage eTag ile birebir).
 * Aynı içerik bu dosyada zaten varsa atlanır → mükerrer evrak/yükleme/masraf-çıkarımı önlenir. Tenant-kapsamlı.
 *
 * Gövde: { icraDosyaNo, uyapEvrakId, dosyaAdi, tur?, contentBase64, mime? }
 */
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { siniflandir, belgeAdindanTarih } from '@/lib/konsrucu/belge-siniflandir'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { belgeBorcaItirazMi, belgeItirazTarihiCikar, onemliOlayTespit } from '@/lib/konsrucu/onemli-olay'
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

  if (!b64) return corsJson({ ok: false, error: 'contentBase64 gerekli' }, 400)
  if (b64.length > MAX_B64) return corsJson({ ok: false, atlandi: true, sebep: 'dosya çok büyük (elle ekleyin)' }, 413)

  let bytes: Buffer
  try { bytes = Buffer.from(b64, 'base64') } catch { return corsJson({ ok: false, error: 'base64 çözülemedi' }, 400) }
  if (!bytes.length) return corsJson({ ok: false, error: 'boş içerik' }, 400)

  // İÇERİK MD5 — dedup'un GERÇEK anahtarı (UYAP'ın değişen evrakId'si değil). Storage eTag ile aynı değer.
  const icerikHash = createHash('md5').update(bytes).digest('hex')

  // dedup — bu İÇERİK bu dosyada zaten varsa atla (her senkronda evrakId değişse de tekrar oluşmaz)
  const mevcut = await prisma.belge.findFirst({ where: { dosyaId: dosya.id, icerikHash }, select: { id: true } })
  if (mevcut) return corsJson({ ok: true, atlandi: true, sebep: 'zaten var (içerik)' })

  const mime = String(body?.mime ?? 'application/pdf')
  const safe = dosyaAdi.replace(/[^\w.\-]+/g, '_').slice(0, 80)
  const sp = `${dosya.id}/uyap-${icerikHash}-${safe}` // içerik-belirli yol → aynı evrak hep aynı dosyaya yazar (orphan olmaz)
  const belgeTarihi = belgeAdindanTarih(dosyaAdi) // belgenin gerçek tarihi (ad sonundan); yoksa null → createdAt

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage.from('evrak').upload(sp, bytes, { contentType: mime, upsert: false })
  if (upErr && !/already exists/i.test(upErr.message)) return corsJson({ ok: false, error: `yükleme: ${upErr.message}` }, 500)

  const snf = siniflandir({ dosyaAdi: `${dosyaAdi} ${body?.tur ?? ''}`.trim(), metin: null, foto: false })
  const belge = await prisma.belge.create({
    data: { dosyaId: dosya.id, kategori: snf.kategori as never, confidence: snf.guven, dosyaAdi, storagePath: sp, kaynakRef: uyapEvrakId, icerikHash, belgeTarihi },
    select: { id: true },
  })
  await prisma.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: k.userId, eylem: `UYAP'tan evrak indi: ${dosyaAdi}` } })

  // Borca itiraz dilekçesi indiyse → Önemli Olaylar kuyruğu. İtiraz TARİHİ belge ADINDAN okunur
  // (UYAP belgesi ad sonunda tarih taşır: "Borca İtiraz Talebi 2026-06-12.pdf"); go-live süzgeci buna göre
  // çalışır (eski itirazlar gelmez). Tarih okunamazsa now() varsayılır. Tespit hatası evrak kaydını bozmaz.
  if (belgeBorcaItirazMi(dosyaAdi) || belgeBorcaItirazMi(body?.tur)) {
    try {
      await onemliOlayTespit({ dosyaId: dosya.id, tetikTarihi: belgeItirazTarihiCikar(dosyaAdi), kaynakBelgeId: belge.id, baslik: dosyaAdi, kullaniciId: k.userId })
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
