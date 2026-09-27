/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/haftalik-rapor
 * Her sabah 07:00 (TRT) = 04:00 UTC — Vercel Cron tetikler (bkz. vercel.json).
 * KİŞİ BAŞINA TEK MAİL: önce her aktif tenant'ın (Ray + Zurich…) 7 günlük takvim + zamanaşımı
 * verisi hazırlanır, sonra alıcılar kişi bazında gruplanır — birden fazla şirkete üye olan
 * (Yelda) tüm şirketlerini TEK mailde şirket bantlarıyla alır; tek şirkete üye olan (Sude)
 * yalnız kendi şirketini görür (tenant izolasyonu alıcı bazında korunur).
 * Zamanaşımı radarı TAKİBİ AÇILMAMIŞ açık dosyaları ve İDARİ_YOL dosyalarını izler (takip açılınca rücu
 * zamanaşımı kesilir; idari yolda icra takibi yok — S06, B12); tarihi geçmişler ayrı kırmızı bölümde ASLA
 * gizlenmez, tavan yok.
 * Korumalı: CRON_SECRET (Vercel Bearer header). Hata varsa HTTP 500 (panelde görünür).
 *
 * Manuel test:  GET /api/cron/haftalik-rapor?key=<CRON_SECRET>&to=<test@adres>  (to ops. —
 * override alıcı TÜM tenant'ların birleşik mailini alır; &dry=1 göndermeden listeler)
 */
import { prisma } from '@/lib/prisma'
import { haftalikRaporHtml, type RaporBolum, type RaporEtkinlik, type RaporZamanasimi } from '@/lib/konsrucu/rapor-mail'
import { mailGonder } from '@/lib/konsrucu/mail'
import { cronYetkisiz, cronTenantlar, cronYanit } from '@/lib/konsrucu/cron-ortak'
import { zamanasimiRadarinda, ZAMANASIMI_RADARI } from '@/lib/konsrucu/aktiflik'
import { bugunIstBasi, kalanGun } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'
// Rücu zamanaşımı, takip AÇILANA KADAR koşar — radar ZAMANASIMI_RADARI durumlarıyla sınırlı (takip öncesi +
// İDARİ_YOL; tek kaynak lib/konsrucu/aktiflik — Bugün ve Atanan Dosyalar süzgeciyle aynı küme).

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

  // 1) tenant başına rapor bölümü hazırla
  const bolumler: { tenant: (typeof tenantlar)[number]; bolum: RaporBolum }[] = []
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
        where: { musteriId: t.musteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: { gte: bas, lt: zaSon } },
        orderBy: { zamanasimi: 'asc' },
        select: zaSelect,
      }),
      // GEÇMİŞ: tarihi geçmiş ama takibi hâlâ açılmamış dosyalar — eski gte filtresi bunları tamamen gizliyordu
      prisma.rucuDosyasi.findMany({
        where: { musteriId: t.musteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: { lt: bas } },
        orderBy: { zamanasimi: 'asc' },
        select: zaSelect,
      }),
      // tarihi hiç girilmemiş açık dosyalar — radar dışında kaldıklarını ekip bilsin
      prisma.rucuDosyasi.count({ where: { musteriId: t.musteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: null } }),
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
    const zamanasimi = zaKayit.filter((d) => d.zamanasimi && zamanasimiRadarinda(d)).map(zaSatir)
    const zamanasimiGecti = zaGectiKayit.filter((d) => d.zamanasimi && zamanasimiRadarinda(d)).map(zaSatir)

    bolumler.push({ tenant: t, bolum: { musteriAd: t.musteriAd, etkinlikler, zamanasimi, zamanasimiGecti, zamanasimiBosSayisi: zaBosSayisi } })
  }

  // 2) alıcıları kişi bazında grupla — çok şirkete üye olan tüm bölümlerini tek mailde alır
  const kisiler = new Map<string, { ad: string; bolumler: RaporBolum[]; tenantAdlar: string[] }>()
  for (const { tenant, bolum } of bolumler) {
    for (const eposta of tenant.alicilar) {
      const mevcut = kisiler.get(eposta)
      const ad = tenant.uyeler.find((u) => u.eposta === eposta)?.ad.split(/\s+/)[0] || tenant.aliciAd
      if (mevcut) { mevcut.bolumler.push(bolum); mevcut.tenantAdlar.push(tenant.musteriAd) }
      else kisiler.set(eposta, { ad, bolumler: [bolum], tenantAdlar: [tenant.musteriAd] })
    }
  }

  // 3) kişi başına TEK mail gönder
  for (const [eposta, k] of kisiler) {
    const { konu, html, text } = haftalikRaporHtml({
      aliciAd: k.ad,
      bugun: bas.toISOString(),
      gunSayisi: 7,
      bolumler: k.bolumler,
      panelUrl: `${BASE}/takvim`,
    })
    const ozet = {
      alici: eposta,
      tenantlar: k.tenantAdlar,
      etkinlik: k.bolumler.reduce((n, b) => n + b.etkinlikler.length, 0),
      zamanasimi: k.bolumler.reduce((n, b) => n + (b.zamanasimi?.length ?? 0), 0),
      zamanasimiGecti: k.bolumler.reduce((n, b) => n + (b.zamanasimiGecti?.length ?? 0), 0),
      zamanasimiBos: k.bolumler.reduce((n, b) => n + (b.zamanasimiBosSayisi ?? 0), 0),
    }
    if (dry) { detay.push({ ...ozet, dry: true, konu }); continue }
    const r = await mailGonder({ to: eposta, konu, html, text })
    if (!r.ok) hata++
    detay.push({ ...ozet, ok: r.ok, err: r.error })
  }

  return cronYanit({ ok: hata === 0, dry, tenant: tenantlar.length, alici: kisiler.size, hata, detay }, 'haftalik-rapor')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
