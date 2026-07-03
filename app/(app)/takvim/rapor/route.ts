/**
 * KonsRücü — Haftalık takvim raporu ÖNİZLEME · GET /takvim/rapor
 * Aktif tenant'ın önümüzdeki 7 günlük etkinliklerini + yaklaşan/GEÇMİŞ zamanaşımılarını rapor
 * e-postası olarak render eder (lib/konsrucu/rapor-mail). Zamanlı gönderim aynı üreticiyi kullanır.
 * Zamanaşımı radarı yalnız takibi açılmamış açık dosyaları izler; tavan yok (eski take:12 kalktı).
 * Tenant-kapsamlı, auth zorunlu (giriş yapılmış tarayıcıda açılır).
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { haftalikRaporHtml, type RaporEtkinlik, type RaporZamanasimi } from '@/lib/konsrucu/rapor-mail'
import { dosyaAktif } from '@/lib/konsrucu/aktiflik'
import { bugunIstBasi, kalanGun } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'

const TAKIP_ONCESI = ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'] as const

export async function GET(req: Request) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) return new Response('Aktif müşteri seçili değil', { status: 400 })

  const simdi = new Date()
  const bas = bugunIstBasi(simdi)
  const son = new Date(bas.getTime() + 7 * 86_400_000)
  const zaSon = new Date(bas.getTime() + 30 * 86_400_000)

  const zaSelect = { hukukDosyaNo: true, hasarDosyaNo: true, zamanasimi: true, durum: true, uyapDurum: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' as const } } }
  const [kayit, zaKayit, zaGectiKayit, zaBosSayisi] = await Promise.all([
    prisma.etkinlik.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, baslar: { gte: bas, lt: son } },
      orderBy: { baslar: 'asc' },
      include: { dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } },
    }),
    prisma.rucuDosyasi.findMany({
      where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { gte: bas, lt: zaSon } },
      orderBy: { zamanasimi: 'asc' },
      select: zaSelect,
    }),
    prisma.rucuDosyasi.findMany({
      where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { lt: bas } },
      orderBy: { zamanasimi: 'asc' },
      select: zaSelect,
    }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: null } }),
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
  const zamanasimi = zaKayit.filter((d) => d.zamanasimi && dosyaAktif(d)).map(zaSatir)
  const zamanasimiGecti = zaGectiKayit.filter((d) => d.zamanasimi && dosyaAktif(d)).map(zaSatir)

  const { html } = haftalikRaporHtml({
    aliciAd: 'Yelda',
    bugun: bas.toISOString(),
    gunSayisi: 7,
    etkinlikler,
    zamanasimi,
    zamanasimiGecti,
    zamanasimiBosSayisi: zaBosSayisi,
    panelUrl: new URL('/takvim', req.url).toString(),
  })

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
