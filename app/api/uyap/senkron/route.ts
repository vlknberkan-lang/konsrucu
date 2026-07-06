/**
 * KonsRücü — UYAP senkron · POST /api/uyap/senkron
 * Eklenti her takip için durum + finansal + yeni olayları gönderir; icraDosyaNo ile dosyaya bağlanır.
 * Idempotent: aynı olay (tip+tarih+açıklama) tekrar yazılmaz. Tenant-kapsamlı (Bearer program oturumu).
 *
 * Gövde: { icraDosyaNo, dosyaId?, durum?, hesap?:{asilAlacak,islemisFaiz,tahsilat,bakiye,...},
 *          olaylar?:[{tip, tarih?, tutar?, aciklama?}] }
 * Eşleşme: dosyaId varsa KESİN eşleşme (hedefler zaten id gönderiyor — çok-adliyeli portföyde aynı
 * esas no'lu iki dosya karışmasın); yoksa icraDosyaNo fallback (eski eklenti sürümleri).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { takipOlayKaydet, OLAY_TIPLERI, type OlayTip } from '@/lib/konsrucu/takip-olay'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return preflight()
}

const dec = (v: unknown): Prisma.Decimal | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? new Prisma.Decimal(Math.round(n * 100) / 100) : null
}
const tarihParse = (v: unknown): Date | null => {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401)

  let body: {
    icraDosyaNo?: string; dosyaId?: string; durum?: string; hesap?: Record<string, unknown>
    olaylar?: { tip?: string; tarih?: string; tutar?: number; aciklama?: string }[]
    // v1 eklenti eşleşme raporu: dosya UYAP'ta bulunamasa bile POST gelir — kör nokta kalmaz
    eslesme?: { durum?: string; not?: string }
    // v1 yapılandırılmış masraf kalemleri (kaynak ekran belirlenince eklenti dolduracak)
    masraflar?: { tarih?: string; ad?: string; tutar?: number; makbuzNo?: string }[]
  }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400) }

  const icraDosyaNo = String(body?.icraDosyaNo ?? '').trim()
  const dosyaIdGirdi = String(body?.dosyaId ?? '').trim()
  if (!icraDosyaNo && !dosyaIdGirdi) return corsJson({ ok: false, error: 'icraDosyaNo veya dosyaId gerekli' }, 400)

  // dosyaId (hedefler'den gelen kesin kimlik) öncelikli; yoksa icraDosyaNo (esas no adliyeye özgü DEĞİL).
  const dosya = dosyaIdGirdi
    ? await prisma.rucuDosyasi.findFirst({ where: { id: dosyaIdGirdi, musteriId: { in: k.izinli } }, select: { id: true } })
    : await prisma.rucuDosyasi.findFirst({ where: { icraDosyaNo, musteriId: { in: k.izinli } }, select: { id: true } })
  if (!dosya) return corsJson({ ok: false, error: `dosya bulunamadı (${dosyaIdGirdi ? 'dosyaId' : 'icraDosyaNo'})` }, 404)

  // eşleşme raporu (v1): beyaz-listeli durum + teşhis notu. OK dışı = "senkron dışı" radarına düşer.
  const ESLESME_DURUMLARI = ['OK', 'DAIRE_EKSIK', 'DAIRE_COZULEMEDI', 'BULUNAMADI', 'BASKA_DAIRE', 'COKLU_BELIRSIZ', 'TARAF_UYUSMAZ', 'HATA']
  const eslesmeHam = String(body?.eslesme?.durum ?? '').trim().toUpperCase()
  const eslesme = ESLESME_DURUMLARI.includes(eslesmeHam) ? eslesmeHam : undefined
  const eslesmeNot = body?.eslesme?.not ? String(body.eslesme.not).slice(0, 1000) : eslesme ? null : undefined

  // durum + finansal snapshot + eşleşme. uyapSenkronAt bulunamayan dosyada da damgalanır:
  // "kontrol edildi" demektir — hedef penceresi ve sağlık bekçisi buna göre çalışır.
  // İSTİSNA: yalnız masraf taşıyan gönderi (Ödeme İşlemlerim taraması) damga ATMAZ — dosya
  // artımlı senkron penceresinden düşmesin (olay/evrak senkronu gecikmesin).
  const yalnizMasraf = !body?.durum && !body?.hesap && !Array.isArray(body?.olaylar) && !eslesme && Array.isArray(body?.masraflar)
  await prisma.rucuDosyasi.update({
    where: { id: dosya.id },
    data: {
      uyapDurum: body?.durum ? String(body.durum).slice(0, 80) : undefined,
      uyapSenkronAt: yalnizMasraf ? undefined : new Date(),
      uyapHesapJson: body?.hesap && typeof body.hesap === 'object' ? (body.hesap as Prisma.InputJsonValue) : undefined,
      uyapEslesme: eslesme,
      uyapEslesmeNot: eslesmeNot,
    },
  })

  // yeni olaylar (tip+tarih+açıklama tekrarını atla)
  let eklenen = 0
  const olaylar = Array.isArray(body?.olaylar) ? body!.olaylar! : []
  for (const o of olaylar) {
    const hamTip = String(o?.tip ?? '').trim().slice(0, 40)
    if (!hamTip) continue
    // Beyaz liste: eklentiden gelen serbest tip DB'yi kirletmesin — bilinmeyen tip 'DURUM'a katlanır,
    // orijinali hamJson'da saklanır (OLAY_DURUM lookup'ı ve rozetler tanımlı tiplerle çalışır).
    const tip = (OLAY_TIPLERI as readonly string[]).includes(hamTip) ? (hamTip as OlayTip) : 'DURUM'
    const tarih = tarihParse(o?.tarih)
    const aciklama = o?.aciklama ? String(o.aciklama).slice(0, 2000) : null
    const mevcut = await prisma.takipOlayi.findFirst({ where: { dosyaId: dosya.id, tip, tarih, aciklama }, select: { id: true } })
    if (mevcut) continue
    await takipOlayKaydet(dosya.id, null, { tip, tarih: tarih ?? new Date(), tutar: dec(o?.tutar), aciklama, hamJson: { kaynak: 'uyap', ...(tip !== hamTip ? { hamTip } : {}) } as Prisma.InputJsonValue })
    eklenen++
  }

  // v1: yapılandırılmış masraf kalemleri (UYAP hesap/tahsilat ekranından — PDF okumadan kesin veri).
  // Dedup: @@unique([dosyaId, kaynakRef]); kaynakRef = UYAPH|makbuzNo|tarih|tutar (içerik-temelli).
  let masrafEklenen = 0
  const masraflar = Array.isArray(body?.masraflar) ? body!.masraflar! : []
  for (const m of masraflar.slice(0, 200)) {
    const tutar = Number(m?.tutar)
    if (!Number.isFinite(tutar) || tutar <= 0) continue
    const tarih = tarihParse(m?.tarih)
    const ad = String(m?.ad ?? '').trim().slice(0, 200) || null
    const makbuzNo = String(m?.makbuzNo ?? '').trim().slice(0, 60) || null
    const kaynakRef = `UYAPH|${makbuzNo ?? ''}|${tarih ? tarih.toISOString().slice(0, 10) : ''}|${Math.round(tutar * 100)}`.slice(0, 190)
    try {
      await prisma.masraf.create({
        data: {
          dosyaId: dosya.id, tutar: new Prisma.Decimal(Math.round(tutar * 100) / 100), tarih,
          cinsHam: ad, makbuzNo, taraf: 'BIZ', kaynak: 'UYAP_HESAP', kaynakRef,
        },
      })
      masrafEklenen++
    } catch (e) {
      // P2002 = aynı kalem zaten var (dedup) — sessiz geç; başka hata masraf dışı akışı bozmasın
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) console.error('uyap masraf yazımı:', (e as Error).message)
    }
  }

  return corsJson({ ok: true, dosyaId: dosya.id, yeniOlay: eklenen, yeniMasraf: masrafEklenen })
}
