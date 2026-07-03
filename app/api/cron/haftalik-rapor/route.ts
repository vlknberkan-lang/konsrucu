/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/haftalik-rapor
 * Her sabah 07:00 (TRT) = 04:00 UTC — Vercel Cron tetikler (bkz. vercel.json).
 * TÜM AKTİF TENANT'LAR için (Ray + Zurich…) ayrı ayrı: önümüzdeki 7 günün takvim raporu +
 * yaklaşan/GEÇMİŞ zamanaşımıları + zamanaşımı-boş dosya sayısı, tenant ekibine e-posta gider.
 * Zamanaşımı radarı yalnız TAKİBİ AÇILMAMIŞ açık dosyaları izler (takip açılınca rücu
 * zamanaşımı kesilir); tarihi geçmişler ayrı kırmızı bölümde ASLA gizlenmez, tavan yok.
 * Korumalı: CRON_SECRET (Vercel Bearer header). Hata varsa HTTP 500 (panelde görünür).
 *
 * Manuel test:  GET /api/cron/haftalik-rapor?key=<CRON_SECRET>&to=<test@adres>  (to ops.)
 */
import { prisma } from '@/lib/prisma'
import { haftalikRaporHtml, type RaporEtkinlik, type RaporZamanasimi } from '@/lib/konsrucu/rapor-mail'
import { mailGonder } from '@/lib/konsrucu/mail'
import { cronYetkisiz, cronTenantlar, konuTenantli, cronYanit } from '@/lib/konsrucu/cron-ortak'
import { dosyaAktif } from '@/lib/konsrucu/aktiflik'
import { bugunIstBasi, kalanGun } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'
// Rücu zamanaşımı, takip AÇILANA KADAR koşar — radar bu durumlarla sınırlı.
const TAKIP_ONCESI = ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'] as const

async function handle(req: Request) {
  const yetkisiz = cronYetkisiz(req)
  if (yetkisiz) return yetkisiz
  const url = new URL(req.url)
  const override = url.searchParams.get('to') // sadece test için (secret zaten doğrulandı)
  const dry = url.searchParams.get('dry') === '1'

  const tenantlar = await cronTenantlar(override)
  if (!tenantlar.length) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  const simdi = new Date()
  const bas = bugunIstBasi(simdi)
  const son = new Date(bas.getTime() + 7 * 86_400_000)
  const zaSon = new Date(bas.getTime() + 30 * 86_400_000)

  let hata = 0
  const detay: Record<string, unknown>[] = []

  for (const t of tenantlar) {
    if (!t.alicilar.length) { hata++; detay.push({ tenant: t.musteriAd, ok: false, err: 'Alıcı bulunamadı (aktif kullanıcı / RAPOR_ALICI yok)' }); continue }

    const zaSelect = { hukukDosyaNo: true, hasarDosyaNo: true, zamanasimi: true, durum: true, uyapDurum: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' as const } } }
    const [kayit, zaKayit, zaGectiKayit, zaBosSayisi] = await Promise.all([
      prisma.etkinlik.findMany({
        where: { dosya: { musteriId: t.musteriId }, baslar: { gte: bas, lt: son } },
        orderBy: { baslar: 'asc' },
        include: { dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } },
      }),
      // yaklaşan: önümüzdeki 30 gün — tavan YOK (eski take:12 13. dosyayı sessizce düşürüyordu)
      prisma.rucuDosyasi.findMany({
        where: { musteriId: t.musteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { gte: bas, lt: zaSon } },
        orderBy: { zamanasimi: 'asc' },
        select: zaSelect,
      }),
      // GEÇMİŞ: tarihi geçmiş ama takibi hâlâ açılmamış dosyalar — eski gte filtresi bunları tamamen gizliyordu
      prisma.rucuDosyasi.findMany({
        where: { musteriId: t.musteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { lt: bas } },
        orderBy: { zamanasimi: 'asc' },
        select: zaSelect,
      }),
      // tarihi hiç girilmemiş açık dosyalar — radar dışında kaldıklarını ekip bilsin
      prisma.rucuDosyasi.count({ where: { musteriId: t.musteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: null } }),
    ])

    const etkinlikler: RaporEtkinlik[] = kayit.map((e) => ({
      tur: e.tur,
      baslik: e.baslik,
      baslar: e.baslar.toISOString(),
      biter: e.biter ? e.biter.toISOString() : null,
      yer: e.yer,
      online: e.online,
      hukukNo: e.dosya.hukukDosyaNo ?? e.dosya.hasarDosyaNo,
      borclu: e.dosya.borclular[0]?.adUnvan ?? null,
    }))
    const zaSatir = (d: (typeof zaKayit)[number]): RaporZamanasimi => ({
      hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
      borclu: d.borclular[0]?.adUnvan ?? null,
      tarih: d.zamanasimi!.toISOString(),
      kalanGun: kalanGun(d.zamanasimi!, simdi),
    })
    // UYAP "kapalı" diyorsa (serbest metin) radar dışı — aktiflik kapısıyla aynı kural
    const zamanasimi = zaKayit.filter((d) => d.zamanasimi && dosyaAktif(d)).map(zaSatir)
    const zamanasimiGecti = zaGectiKayit.filter((d) => d.zamanasimi && dosyaAktif(d)).map(zaSatir)

    const { konu, html, text } = haftalikRaporHtml({
      aliciAd: t.aliciAd,
      bugun: bas.toISOString(),
      gunSayisi: 7,
      etkinlikler,
      zamanasimi,
      zamanasimiGecti,
      zamanasimiBosSayisi: zaBosSayisi,
      panelUrl: `${BASE}/takvim`,
    })
    const konuT = tenantlar.length > 1 ? konuTenantli(konu, t.musteriAd) : konu

    if (dry) {
      detay.push({ tenant: t.musteriAd, dry: true, alicilar: t.alicilar, etkinlik: etkinlikler.length, zamanasimi: zamanasimi.length, zamanasimiGecti: zamanasimiGecti.length, zamanasimiBos: zaBosSayisi, konu: konuT })
      continue
    }
    const r = await mailGonder({ to: t.alicilar, konu: konuT, html, text })
    if (!r.ok) hata++
    detay.push({ tenant: t.musteriAd, ok: r.ok, alicilar: t.alicilar, etkinlik: etkinlikler.length, zamanasimi: zamanasimi.length, zamanasimiGecti: zamanasimiGecti.length, zamanasimiBos: zaBosSayisi, err: r.error })
  }

  return cronYanit({ ok: hata === 0, dry, tenant: tenantlar.length, hata, detay }, 'haftalik-rapor')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
