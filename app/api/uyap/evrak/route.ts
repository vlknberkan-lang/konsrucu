/**
 * KonsRücü — UYAP senkron · POST /api/uyap/evrak
 * Eklenti, UYAP'ta indirdiği YENİ evrak PDF'ini buraya yükler → Supabase 'evrak' bucket → Belge.
 *
 * Dedup: UYAP EVRAK KİMLİĞİ = uyapEvrakId'nin İLK 20 karakteri. UYAP aynı evrağı her indirişte
 * byte-FARKLI PDF üretir (içerik MD5 her seferinde değişir → güvenilmez) VE evrakId'nin sonuna değişen
 * bir oturum jetonu ekler; ama evrakId'nin ilk ~20 karakteri (şifre bloğu sınırı) evrak başına SABİTtir.
 * Aynı (dosya + ad + evrak-kimliği) bu dosyada varsa atlanır → upload + AI + masraf-çıkarımı HİÇ çalışmaz.
 * Aynı gün aynı adlı AYRI evraklar (ör. 3 borçluya 3 tebligat) farklı önek taşır → ayrı tutulur (kaybolmaz).
 *
 * Gövde: { icraDosyaNo, uyapEvrakId, dosyaAdi, tur?, contentBase64, mime? }
 */
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { siniflandir, belgeAdindanTarih } from '@/lib/konsrucu/belge-siniflandir'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { belgeBorcaItirazMi, belgeItirazTarihiCikar, onemliOlayTespit } from '@/lib/konsrucu/onemli-olay'
import { belgedenMasrafCikar } from '@/lib/konsrucu/masraf-cikar'
import { dosyaAktif } from '@/lib/konsrucu/aktiflik'

export const dynamic = 'force-dynamic'

const MAX_B64 = 4_400_000 // ~3.3 MB dosya (Vercel gövde sınırı altında kalsın)
const EVRAK_ONEK = 20 // uyapEvrakId'nin stabil kimlik öneki (ilk şifre bloğu; 21+ = değişen oturum jetonu)

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

  const dosya = await prisma.rucuDosyasi.findFirst({ where: { icraDosyaNo, musteriId: { in: k.izinli } }, select: { id: true, durum: true, uyapDurum: true } })
  if (!dosya) return corsJson({ ok: false, error: 'dosya bulunamadı (icraDosyaNo)' }, 404)
  const aktif = dosyaAktif(dosya) // kapalı dosya: evrak SAKLANIR ama masraf AI çalışmaz (boşa maliyet)

  // DEDUP (pahalı işlemlerden ÖNCE) — UYAP aynı evrağı her indirişte byte-farklı üretir; gerçek kimlik
  // = uyapEvrakId'nin ilk 20 karakteri (sonu değişen oturum jetonu). Aynı (dosya + ad + önek) varsa atla
  // → base64 çöz + upload + masraf-AI HİÇ çalışmaz. LEFT(...) ile tam eşleşme (LIKE joker riski yok).
  const evrakKimlik = uyapEvrakId.slice(0, EVRAK_ONEK)
  const mevcut = await prisma.$queryRaw<{ x: number }[]>(
    Prisma.sql`SELECT 1 AS x FROM "Belge"
               WHERE "dosyaId" = ${dosya.id} AND "dosyaAdi" = ${dosyaAdi}
                 AND LEFT("kaynakRef", ${Prisma.raw(String(EVRAK_ONEK))}) = ${evrakKimlik}
               LIMIT 1`,
  )
  if (mevcut.length) return corsJson({ ok: true, atlandi: true, sebep: 'zaten var (UYAP evrak kimliği)' })

  if (!b64) return corsJson({ ok: false, error: 'contentBase64 gerekli' }, 400)
  if (b64.length > MAX_B64) return corsJson({ ok: false, atlandi: true, sebep: 'dosya çok büyük (elle ekleyin)' }, 413)

  let bytes: Buffer
  try { bytes = Buffer.from(b64, 'base64') } catch { return corsJson({ ok: false, error: 'base64 çözülemedi' }, 400) }
  if (!bytes.length) return corsJson({ ok: false, error: 'boş içerik' }, 400)

  // İÇERİK MD5 — yalnız storage yolu + bilgi amaçlı (dedup ARTIK evrak kimliğine dayanıyor, içeriğe değil).
  const icerikHash = createHash('md5').update(bytes).digest('hex')

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
  // Kapalı dosyada YENİ masraf gerekmez → AI çağırma (Faz 0 maliyet kapısı; evrak yine saklandı).
  let masraf: { eklendi: number; atlandi: number } | undefined
  if (snf.kategori === 'DEKONT' && aktif) {
    try {
      const r = await belgedenMasrafCikar(belge.id, { kullaniciId: k.userId })
      masraf = { eklendi: r.eklendi, atlandi: r.atlandi }
    } catch (e) {
      console.error('masraf çıkarım (evrak):', e)
    }
  }

  return corsJson({ ok: true, eklendi: true, kategori: snf.kategori, masraf })
}
