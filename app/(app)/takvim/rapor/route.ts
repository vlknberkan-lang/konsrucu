/**
 * KonsRücü — Haftalık takvim raporu ÖNİZLEME · GET /takvim/rapor
 * Aktif tenant'ın önümüzdeki 7 günlük etkinliklerini + yaklaşan zamanaşımılarını rapor e-postası
 * olarak render eder (lib/konsrucu/rapor-mail). Zamanlı gönderim aynı üreticiyi kullanacak.
 * Tenant-kapsamlı, auth zorunlu (giriş yapılmış tarayıcıda açılır).
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { haftalikRaporHtml, type RaporEtkinlik, type RaporZamanasimi } from '@/lib/konsrucu/rapor-mail'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) return new Response('Aktif müşteri seçili değil', { status: 400 })

  const simdi = new Date()
  const bas = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate())
  const son = new Date(bas.getTime() + 7 * 86_400_000)
  const zaSon = new Date(bas.getTime() + 30 * 86_400_000)

  const [kayit, zaKayit] = await Promise.all([
    prisma.etkinlik.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, baslar: { gte: bas, lt: son } },
      orderBy: { baslar: 'asc' },
      include: { dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } },
    }),
    prisma.rucuDosyasi.findMany({
      where: { musteriId: aktifMusteriId, zamanasimi: { gte: bas, lt: zaSon } },
      orderBy: { zamanasimi: 'asc' },
      take: 12,
      select: { hukukDosyaNo: true, hasarDosyaNo: true, zamanasimi: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } },
    }),
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
  const zamanasimi: RaporZamanasimi[] = zaKayit
    .filter((d) => d.zamanasimi)
    .map((d) => ({
      hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
      borclu: d.borclular[0]?.adUnvan ?? null,
      tarih: d.zamanasimi!.toISOString(),
      kalanGun: Math.ceil((d.zamanasimi!.getTime() - bas.getTime()) / 86_400_000),
    }))

  const { html } = haftalikRaporHtml({
    aliciAd: 'Yelda',
    bugun: bas.toISOString(),
    gunSayisi: 7,
    etkinlikler,
    zamanasimi,
    panelUrl: new URL('/takvim', req.url).toString(),
  })

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
