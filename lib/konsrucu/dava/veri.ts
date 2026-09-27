/**
 * KonsRücü — dava paneli ve Dava Panosu veri yükleyicileri (server-only) · lib/konsrucu/dava/veri.ts
 *
 * - `davaPaneli`: dosya ekranındaki bütün dava kartlarının (dava kaydı, ön kontrol, Excel önerisi, ihtiyati haciz,
 *   İİK 67 kapanışı, karar, tahsilat, genel durum, kapanış) prop'ları tek çağrıda.
 * - `davaPanosu`: aktif müvekkilin bütün davaları + davası açılmamış açık İİK 67 kayıtları (Dava Panosu).
 * Kapsam: her sorgu `musteriId` ile (M7). Tarihler istemciye ISO metin gider. Kişisel veri istemcide maskelenir.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { arabuluculukSonucBildirimi, kararBildirimi, tahsilatBildirimi } from '../arabuluculuk/bildirim-taslak'
import { type KuralSonucu } from '../arabuluculuk/kurallar'
import { musteriOnayiKapisi, type OnayKaydiOzet } from '../arabuluculuk/onay'
import { isoGun } from '../arabuluculuk/tarih'
import { enErkenIhtiyatli } from '../arabuluculuk/veri'
import { avukatMi, yazabilir, type Kullanici } from '../arabuluculuk/yetki'
import { excelDavaOnerisi, kaynaktanRayDava, type ExcelDavaOnerisi } from './excel-dava'
import { iik67KapanisKontrol, type Iik67KapanisDurumu } from './iik67-kapanis'
import { kararKontrol, kararSonrasiAdimlar, type KararSonrasiAdim, type KararUyari } from './karar'
import { kayitIsaretiOku, mahkemeAdi, esasMetni } from './kayit'
import { davaKurallari } from './kurallar'
import { davaOnKontrol, gecisleriOku, type OnKontrolMaddesi } from './on-kontrol'
import { genelDurum, panoSatiri, type PanoSatiri } from './pano'
import { kapaliRadarda } from './kapali-radar'
import { paraOzeti, tahsilatAdaylari, type TahsilatOlayi } from './tahsilat-onay'

const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()))
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const ACIK = ['TETIK_BEKLIYOR', 'ACIK', 'KAPANMAYA_HAZIR']

export type DavaUI = {
  id: string
  asamaId: string
  durum: string
  tur: string | null
  rolumuz: string
  mahkemeTuru: string | null
  mahkemeYer: string | null
  mahkemeNo: string | null
  mahkemeAdi: string | null
  esas: string | null
  acilisTarihi: string | null
  usul: string | null
  davaDegeri: number | null
  ustDosyaNoHam: string | null
  uyapDosyaId: string | null
  sonrakiDurusma: string | null
  onIncelemeTarihi: string | null
  evre: string | null
  arabuluculukId: string | null
  teyit: string
  kaynakTuru: string
  harcAvans: string | null
  taraflar: { id: string; rol: string; borcluId: string | null; ad: string | null; teyit: string; kaynakTuru: string | null }[]
  islemler: { id: string; tur: string; tarih: string | null; tebligTarihi: string | null; referansNo: string | null; excelHam: string | null; ozet: string | null; teyit: string; kaynakTuru: string | null }[]
  ihtiyatiHacizler: {
    id: string; asama: string; talepTarihi: string | null; sonuc: string; kararTarihi: string | null; kararTebligTarihi: string | null
    teminatOrani: string | null; teminatTutari: number | null; teminatYatirildiAt: string | null; infazTalepTarihi: string | null
    excelHam: string | null; teyit: string; kaynakTuru: string | null
  }[]
  karar: {
    kararTarihi: string | null; kararNo: string | null; hukum: string | null; kabulAsil: number | null; kabulFaizBaslangic: string | null
    inkarTazminati: number | null; inkarTazminatiYon: string | null; yargilamaGideri: number | null; yargilamaGideriAleyhe: number | null
    vekaletUcreti: number | null; vekaletUcretiAleyhe: number | null; vekaletUcretiYon: string | null
    kararOnayAt: string | null; gerekceliTebligTarihi: string | null; kesinlesmeTarihi: string | null
  }
  kararUyarilari: KararUyari[]
  kararSonrasi: KararSonrasiAdim[]
  kararSonrasiYol: { secim: string; gerekce: string | null } | null
  kanunYoluKapisi: { acik: boolean; mesaj: string | null }
  iik67: { sureId: string; kontrol: Iik67KapanisDurumu; onaylananSonGun: string | null }[]
}

export type OnKontrolUI = {
  kilitli: boolean
  kilitMesaji: string | null
  maddeler: OnKontrolMaddesi[]
  imzayaHazir: boolean
  ilkEksik: OnKontrolMaddesi | null
  istisnaMumkun: boolean
  kalanGun: number | null
}

export type DavaPaneliVeri = {
  dosyaId: string
  yetki: { yazabilir: boolean; avukat: boolean }
  davalar: DavaUI[]
  hazirlik: DavaUI | null
  onKontrol: OnKontrolUI
  borclular: { id: string; adUnvan: string }[]
  arabuluculuklar: { id: string; etiket: string }[]
  excelOnerisi: ExcelDavaOnerisi | null
  tahsilat: { adaylar: { id: string; tutar: number | null; gorulme: string | null }[]; talep: number | null; tahsil: number; kalan: number | null }
  genelDurum: ReturnType<typeof genelDurum>
  kapanis: { uyapDurum: string | null; kapanisSebebi: string | null; kapanisAt: string | null; radarda: boolean }
  kurallar: KuralSonucu[]
  bildirimler: { konu: 'KARAR' | 'ARABULUCULUK_SONUCU' | 'TAHSILAT'; refId: string; baslik: string; taslak: string }[]
}

type DavaSatir = Awaited<ReturnType<typeof davaSorgu>>[number]
function davaSorgu(dosyaId: string) {
  return prisma.dava.findMany({
    where: { dosyaId, silindiAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      asama: { select: { detayJson: true } },
      taraflar: { where: { silindiAt: null }, orderBy: { createdAt: 'asc' } },
      islemler: { where: { silindiAt: null }, orderBy: [{ tarih: 'asc' }, { createdAt: 'asc' }] },
      ihtiyatiHacizler: { where: { silindiAt: null }, orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function davaPaneli(dosyaId: string, musteriId: string, kullanici: Kullanici, simdi: Date = new Date()): Promise<DavaPaneliVeri | null> {
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId },
    select: {
      id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDairesi: true, icraDosyaNo: true, asilAlacak: true, kaynakJson: true,
      uyapDurum: true, kapanisSebebi: true, kapanisAt: true, icraEksen: true, arabEksen: true, davaEksen: true, musteri: { select: { ad: true } },
    },
  })
  if (!dosya) return null
  const [davalar, borclular, takipler, onaylar, sureler, yollar, arablar, talep, vekaletSay, olaylar, dilekceler, gecisAkt, bildirimAkt, ayar, kararBelgeSay] = await Promise.all([
    davaSorgu(dosyaId),
    prisma.borclu.findMany({ where: { dosyaId }, select: { id: true, adUnvan: true }, orderBy: { id: 'asc' } }),
    prisma.borcluTakip.findMany({ where: { dosyaId, silindiAt: null, itirazVar: true }, select: { itirazEdilenTutar: true } }),
    prisma.onayKaydi.findMany({ where: { dosyaId, silindiAt: null } }),
    prisma.sure.findMany({ where: { dosyaId, silindiAt: null } }),
    prisma.yolSecimi.findMany({ where: { dosyaId, durum: 'GECERLI', silindiAt: null }, orderBy: { secimAt: 'desc' } }),
    prisma.arabuluculuk.findMany({ where: { dosyaId, silindiAt: null }, orderBy: { createdAt: 'desc' } }),
    prisma.takipTalebi.findFirst({ where: { dosyaId, gecerli: true, silindiAt: null }, orderBy: { surum: 'desc' }, select: { toplam: true, asilAlacak: true } }),
    prisma.belge.count({ where: { dosyaId, silindiAt: null, OR: [{ dosyaAdi: { contains: 'ekaletname', mode: 'insensitive' } }, { dosyaAdi: { contains: 'ekâletname', mode: 'insensitive' } }, { altTur: { contains: 'VEKALET' } }] } }),
    prisma.takipOlayi.findMany({ where: { dosyaId, altTip: { in: ['TAHSILAT_BORCLUDAN', 'DAVA_ACILDI_SINYALI'] } }, select: { id: true, tip: true, altTip: true, teyit: true, tutar: true, tarih: true, createdAt: true } }),
    prisma.uretilenCikti.findMany({ where: { dosyaId, tip: 'DILEKCE', OR: [{ tur: 'DAVA' }, { tur: null }] }, select: { durum: true, tur: true } }),
    prisma.aktivite.findMany({ where: { dosyaId, detayJson: { path: ['tur'], equals: 'ON_KONTROL_GECIS' } }, select: { detayJson: true }, orderBy: { createdAt: 'asc' } }),
    prisma.aktivite.findMany({ where: { dosyaId, detayJson: { path: ['tur'], equals: 'MUSTERI_BILDIRIMI' } }, select: { detayJson: true } }),
    prisma.ayarlar.findUnique({ where: { musteriId }, select: { alacakliUnvan: true } }),
    prisma.belge.count({ where: { dosyaId, silindiAt: null, altTur: { in: ['DAVA_KARAR', 'DAVA_GEREKCELI_KARAR'] } } }),
  ])
  const onayOzet: OnayKaydiOzet[] = onaylar.map((o) => ({ id: o.id, tur: o.tur, sonuc: o.sonuc, alinmaAt: o.alinmaAt, istisnaGerekce: o.istisnaGerekce, silindiAt: o.silindiAt, tutar: n(o.tutar), onaylayanUnvan: o.onaylayanUnvan, davaId: o.davaId }))
  const iik67 = sureler.filter((s) => s.tur === 'IIK67')
  const ihtiyatli = enErkenIhtiyatli(iik67)
  const onaylananlar = iik67.filter((s) => ACIK.includes(s.durum) && s.onaylananSonGun).map((s) => (s.onaylananSonGun as Date).getTime())
  const onaylananSonGun = onaylananlar.length ? new Date(Math.min(...onaylananlar)) : null
  const yolItiraz = yollar.find((y) => y.asama === 'ITIRAZ_SONRASI') ?? null
  const arab = arablar[0] ?? null
  const bildirimRef = new Set(bildirimAkt.map((a) => (a.detayJson as { konu?: string; refId?: string } | null)).filter(Boolean).map((d) => `${d!.konu}:${d!.refId ?? ''}`))
  const kunye = { musteriUnvani: ayar?.alacakliUnvan ?? dosya.musteri.ad, hukukDosyaNo: dosya.hukukDosyaNo, hasarDosyaNo: dosya.hasarDosyaNo, icraDairesi: dosya.icraDairesi, icraEsas: dosya.icraDosyaNo }
  const takipToplam = n(talep?.toplam) ?? n(talep?.asilAlacak) ?? n(dosya.asilAlacak)

  const davaUI = (d: DavaSatir): DavaUI => {
    const isaret = kayitIsaretiOku(d.asama.detayJson)
    const okj = d.onKontrolJson && typeof d.onKontrolJson === 'object' ? (d.onKontrolJson as { harcAvans?: string }) : {}
    const karar = {
      kararTarihi: isoGun(d.kararTarihi), kararNo: d.kararNo, hukum: d.hukum, kabulAsil: n(d.kabulAsil), kabulFaizBaslangic: isoGun(d.kabulFaizBaslangic),
      inkarTazminati: n(d.inkarTazminati), inkarTazminatiYon: d.inkarTazminatiYon, yargilamaGideri: n(d.yargilamaGideri), yargilamaGideriAleyhe: n(d.yargilamaGideriAleyhe),
      vekaletUcreti: n(d.vekaletUcreti), vekaletUcretiAleyhe: n(d.vekaletUcretiAleyhe), vekaletUcretiYon: d.vekaletUcretiYon,
      kararOnayAt: iso(d.kararOnayAt), gerekceliTebligTarihi: isoGun(d.gerekceliTebligTarihi), kesinlesmeTarihi: isoGun(d.kesinlesmeTarihi),
    }
    const kyol = yollar.find((y) => y.asama === 'KARAR_SONRASI' && (!y.davaId || y.davaId === d.id)) ?? null
    const kapi = musteriOnayiKapisi('KANUN_YOLU', onayOzet, { davaId: d.id, simdi })
    return {
      id: d.id, asamaId: d.asamaId, durum: d.durum, tur: d.tur, rolumuz: d.rolumuz,
      mahkemeTuru: d.mahkemeTuru, mahkemeYer: d.mahkemeYer, mahkemeNo: d.mahkemeNo, mahkemeAdi: mahkemeAdi(d), esas: esasMetni(d.esasYil, d.esasSira),
      acilisTarihi: isoGun(d.acilisTarihi), usul: d.usul, davaDegeri: n(d.davaDegeri), ustDosyaNoHam: d.ustDosyaNoHam, uyapDosyaId: d.uyapDosyaId,
      sonrakiDurusma: iso(d.sonrakiDurusma), onIncelemeTarihi: iso(d.onIncelemeTarihi), evre: d.evre, arabuluculukId: d.arabuluculukId,
      teyit: isaret.teyit, kaynakTuru: isaret.kaynakTuru, harcAvans: okj.harcAvans ?? null,
      taraflar: d.taraflar.map((t) => ({ id: t.id, rol: t.rol, borcluId: t.borcluId, ad: t.borcluId ? borclular.find((b) => b.id === t.borcluId)?.adUnvan ?? t.adHam : t.adHam, teyit: t.teyit, kaynakTuru: t.kaynakTuru })),
      islemler: d.islemler.map((i) => ({ id: i.id, tur: i.tur, tarih: isoGun(i.tarih), tebligTarihi: isoGun(i.tebligTarihi), referansNo: i.referansNo, excelHam: i.excelHam, ozet: i.ozet, teyit: i.teyit, kaynakTuru: i.kaynakTuru })),
      ihtiyatiHacizler: d.ihtiyatiHacizler.map((h) => ({
        id: h.id, asama: h.asama, talepTarihi: isoGun(h.talepTarihi), sonuc: h.sonuc, kararTarihi: isoGun(h.kararTarihi), kararTebligTarihi: isoGun(h.kararTebligTarihi),
        teminatOrani: h.teminatOrani, teminatTutari: n(h.teminatTutari), teminatYatirildiAt: isoGun(h.teminatYatirildiAt), infazTalepTarihi: isoGun(h.infazTalepTarihi),
        excelHam: h.excelHam, teyit: h.teyit, kaynakTuru: h.kaynakTuru,
      })),
      karar,
      kararUyarilari: d.kararOnayAt ? kararKontrol({ hukum: d.hukum, kabulAsil: n(d.kabulAsil), davaDegeri: n(d.davaDegeri), takipToplam, kararTarihi: d.kararTarihi, vekaletUcretiAleyhe: n(d.vekaletUcretiAleyhe), yargilamaGideriAleyhe: n(d.yargilamaGideriAleyhe), vekaletUcretiYon: d.vekaletUcretiYon, inkarTazminatiYon: d.inkarTazminatiYon }, simdi) : [],
      kararSonrasi: d.kararOnayAt ? kararSonrasiAdimlar({ hukum: d.hukum, gerekceliTebligTarihi: d.gerekceliTebligTarihi, kesinlesmeTarihi: d.kesinlesmeTarihi, rolumuz: d.rolumuz }) : [],
      kararSonrasiYol: kyol ? { secim: kyol.secim, gerekce: kyol.gerekce } : null,
      kanunYoluKapisi: kapi.acik ? { acik: true, mesaj: null } : { acik: false, mesaj: kapi.mesaj },
      iik67: iik67
        .filter((s) => s.durum !== 'IPTAL')
        .map((s) => ({ sureId: s.id, onaylananSonGun: isoGun(s.onaylananSonGun), kontrol: iik67KapanisKontrol({ acilisTarihi: d.acilisTarihi, onaylananSonGun: s.onaylananSonGun, onerilenIhtiyatli: s.onerilenIhtiyatli, sureDurumu: s.durum }) })),
    }
  }

  const tumu = davalar.map(davaUI)
  const hazirlik = tumu.find((d) => d.durum === 'HAZIRLIK') ?? null
  const hazirlikSatir = davalar.find((d) => d.durum === 'HAZIRLIK') ?? null
  const acilmis = tumu.filter((d) => d.durum !== 'HAZIRLIK')

  const ok = davaOnKontrol({
    onaylar: onayOzet,
    ihtiyatliSonGun: ihtiyatli,
    onaylananSonGun,
    yolSecimi: yolItiraz?.secim ?? null,
    arabuluculuk: arab ? { tur: arab.tur, sonTutanakTarihi: arab.sonTutanakTarihi, sonuc: arab.sonuc, sonTutanakBelgeId: arab.sonTutanakBelgeId } : null,
    itirazEdenTeyitliSayisi: takipler.length,
    itirazEdilenToplam: takipler.length ? takipler.reduce((a, t) => a + (n(t.itirazEdilenTutar) ?? 0), 0) : null,
    takipTalebiVar: !!talep,
    mahkemeTuru: hazirlik?.mahkemeTuru ?? null,
    usul: hazirlik?.usul ?? null,
    vekaletnameVar: vekaletSay > 0,
    harcAvansGirildi: !!hazirlik?.harcAvans,
    gecisler: gecisleriOku(hazirlikSatir?.onKontrolJson, ...gecisAkt.map((a) => a.detayJson)),
  }, simdi)

  // Excel önerisi: Ray takip Excel'inin dava hücreleri var ve aynı esasla dava açılmamışsa
  const rayDava = kaynaktanRayDava(dosya.kaynakJson)
  let excelOnerisi: ExcelDavaOnerisi | null = null
  if (rayDava) {
    const o = excelDavaOnerisi(rayDava, borclular)
    const ayniEsas = o.dava.esasYil && davalar.some((d) => d.esasYil === o.dava.esasYil && d.esasSira === o.dava.esasSira)
    if (!o.bos && !ayniEsas) excelOnerisi = o
  }

  const tahsilOlaylari: TahsilatOlayi[] = olaylar.filter((o) => o.altTip === 'TAHSILAT_BORCLUDAN').map((o) => ({ id: o.id, tip: o.tip, altTip: o.altTip, teyit: o.teyit, tutar: n(o.tutar), tarih: o.tarih, createdAt: o.createdAt }))
  const para = paraOzeti({ talep: takipToplam, olaylar: tahsilOlaylari })
  const adaylar = tahsilatAdaylari(tahsilOlaylari)

  const bildirimler: DavaPaneliVeri['bildirimler'] = []
  for (const d of davalar) {
    if (d.kararOnayAt && !bildirimRef.has(`KARAR:${d.id}`)) {
      bildirimler.push({
        konu: 'KARAR', refId: d.id, baslik: `Karar bildirimi · ${esasMetni(d.esasYil, d.esasSira) ?? ''}`,
        taslak: kararBildirimi({ kunye, mahkeme: mahkemeAdi(d), esas: esasMetni(d.esasYil, d.esasSira), kararTarihi: d.kararTarihi, hukum: d.hukum, kabulAsil: n(d.kabulAsil), davaDegeri: n(d.davaDegeri), aleyheVekalet: n(d.vekaletUcretiAleyhe), aleyheGider: n(d.yargilamaGideriAleyhe) }),
      })
    }
  }
  if (arab?.onayAt && arab.sonuc && arab.sonTutanakTarihi && !bildirimRef.has(`ARABULUCULUK_SONUCU:${arab.id}`)) {
    bildirimler.push({ konu: 'ARABULUCULUK_SONUCU', refId: arab.id, baslik: 'Arabuluculuk sonucu bildirimi', taslak: arabuluculukSonucBildirimi({ kunye, sonuc: arab.sonuc as 'ANLASMA', sonTutanakTarihi: arab.sonTutanakTarihi }) })
  }
  for (const o of tahsilOlaylari.filter((x) => x.teyit === 'TEYITLI' && !bildirimRef.has(`TAHSILAT:${x.id}`))) {
    bildirimler.push({ konu: 'TAHSILAT', refId: o.id, baslik: 'Tahsilat bildirimi', taslak: tahsilatBildirimi({ kunye, tutar: o.tutar ?? 0, gorulmeTarihi: o.tarih ?? o.createdAt, toplamTahsil: para.tahsil }) })
  }

  const ilkDava = davalar.find((d) => d.durum !== 'HAZIRLIK') ?? null
  const iik67Birincil = iik67.find((s) => ACIK.includes(s.durum)) ?? iik67[0] ?? null
  const dilekceDurumu: 'YOK' | 'TASLAK' | 'IMZAYA_HAZIR' = dilekceler.some((c) => c.durum === 'IMZAYA_GIDEN' || c.durum === 'IMZAYA_HAZIR') ? 'IMZAYA_HAZIR' : dilekceler.length ? 'TASLAK' : 'YOK'
  const kurallar = davaKurallari({
    arabuluculuk: arab ? { sonuc: arab.sonuc, sonTutanakTarihi: arab.sonTutanakTarihi } : null,
    yolSecimi: yolItiraz?.secim ?? null,
    dava: ilkDava ? { rolumuz: ilkDava.rolumuz, acilisTarihi: ilkDava.acilisTarihi, hukum: ilkDava.hukum, kararOnayAt: ilkDava.kararOnayAt, gerekceliTebligTarihi: ilkDava.gerekceliTebligTarihi } : null,
    onKontrol: hazirlik || ok.imzayaHazir ? ok : null,
    dilekceDurumu,
    davaAdayiVar: olaylar.some((o) => o.altTip === 'DAVA_ACILDI_SINYALI' && o.teyit === 'ADAY'),
    iik67: iik67Birincil ? { durum: iik67Birincil.durum, onaylananSonGun: iik67Birincil.onaylananSonGun, onerilenIhtiyatli: iik67Birincil.onerilenIhtiyatli } : null,
    kararEvrakiVar: kararBelgeSay > 0 || davalar.some((d) => d.islemler.some((i) => i.tur === 'KARAR' && i.teyit === 'ADAY')),
    kararSonrasiYolSecildi: !!ilkDava && yollar.some((y) => y.asama === 'KARAR_SONRASI' && (!y.davaId || y.davaId === ilkDava.id)),
    uyapDurum: dosya.uyapDurum,
    kapanisSebebi: dosya.kapanisSebebi,
    tahsilatAdayi: { sayi: adaylar.length, tutar: adaylar.length === 1 ? adaylar[0].tutar : adaylar.reduce((a, x) => a + (x.tutar ?? 0), 0) || null },
    bildirimBekleyen: bildirimler.map((b) => b.konu),
  })

  return {
    dosyaId,
    yetki: { yazabilir: yazabilir(kullanici), avukat: avukatMi(kullanici) },
    davalar: acilmis,
    hazirlik,
    onKontrol: {
      kilitli: ok.kilitli, kilitMesaji: ok.kilitMesaji, maddeler: ok.maddeler, imzayaHazir: ok.imzayaHazir, ilkEksik: ok.ilkEksik,
      istisnaMumkun: !ok.onayKapisi.acik && ok.onayKapisi.istisnaMumkun, kalanGun: !ok.onayKapisi.acik ? ok.onayKapisi.kalanGun : null,
    },
    borclular,
    arabuluculuklar: arablar.map((a) => ({ id: a.id, etiket: [a.uyapDosyaNo ?? a.buroNo ?? a.basvuruNo ?? 'Arabuluculuk', a.sonuc ?? ''].filter(Boolean).join(' · ') })),
    excelOnerisi,
    tahsilat: { adaylar: adaylar.map((a) => ({ id: a.id, tutar: a.tutar, gorulme: iso(a.tarih ?? a.createdAt) })), talep: para.talep, tahsil: para.tahsil, kalan: para.kalan },
    genelDurum: genelDurum({
      icraEksen: dosya.icraEksen, arabEksen: dosya.arabEksen, davaEksen: dosya.davaEksen, talep: takipToplam, tahsil: para.tahsil,
      acikSure: sureler.filter((s) => ACIK.includes(s.durum)).length,
      onaysizSure: sureler.filter((s) => ACIK.includes(s.durum) && !s.onaylananSonGun).length,
    }),
    kapanis: { uyapDurum: dosya.uyapDurum, kapanisSebebi: dosya.kapanisSebebi, kapanisAt: iso(dosya.kapanisAt), radarda: kapaliRadarda({ uyapDurum: dosya.uyapDurum, kapanisSebebi: dosya.kapanisSebebi }) },
    kurallar,
    bildirimler,
  }
}

// ─────────────────── Dava Panosu ───────────────────

export type PanoSatiriUI = Omit<PanoSatiri, 'sonraki' | 'sonGelisme'> & { sonraki: string | null; sonGelisme: string | null }

export async function davaPanosu(musteriId: string, simdi: Date = new Date()): Promise<PanoSatiriUI[]> {
  const [davalar, bosIik67] = await Promise.all([
    prisma.dava.findMany({
      where: { silindiAt: null, durum: { not: 'HAZIRLIK' }, dosya: { musteriId } },
      take: 2000,
      include: {
        asama: { select: { detayJson: true } },
        islemler: { where: { silindiAt: null }, select: { tur: true, tarih: true, createdAt: true, teyit: true } },
        dosya: { select: { hukukDosyaNo: true, sureler: { where: { silindiAt: null, durum: { in: ACIK } }, select: { tur: true, onaylananSonGun: true, onerilenIhtiyatli: true, durum: true } } } },
      },
    }),
    prisma.sure.findMany({
      where: { tur: 'IIK67', silindiAt: null, durum: { in: ACIK }, dosya: { musteriId, davalar: { none: { silindiAt: null, durum: { not: 'HAZIRLIK' } } } } },
      take: 2000,
      select: { dosyaId: true, tur: true, onaylananSonGun: true, onerilenIhtiyatli: true, durum: true, updatedAt: true, dosya: { select: { hukukDosyaNo: true } } },
    }),
  ])
  const satirlar: PanoSatiri[] = davalar.map((d) => panoSatiri({
    davaId: d.id, dosyaId: d.dosyaId, hukukDosyaNo: d.dosya.hukukDosyaNo, mahkemeTuru: d.mahkemeTuru, mahkemeYer: d.mahkemeYer, mahkemeNo: d.mahkemeNo,
    esasYil: d.esasYil, esasSira: d.esasSira, evre: d.evre, durum: d.durum, rolumuz: d.rolumuz, sonrakiDurusma: d.sonrakiDurusma, onIncelemeTarihi: d.onIncelemeTarihi,
    uyapDosyaId: d.uyapDosyaId, asamaDetayJson: d.asama.detayJson, updatedAt: d.updatedAt, islemler: d.islemler, sureler: d.dosya.sureler,
  }, simdi))
  const grup = new Map<string, typeof bosIik67>()
  for (const s of bosIik67) grup.set(s.dosyaId, [...(grup.get(s.dosyaId) ?? []), s])
  for (const [dosyaId, ss] of grup) {
    satirlar.push(panoSatiri({
      davaId: null, dosyaId, hukukDosyaNo: ss[0].dosya.hukukDosyaNo, mahkemeTuru: null, mahkemeYer: null, mahkemeNo: null, esasYil: null, esasSira: null,
      evre: null, durum: null, rolumuz: 'DAVACI', sonrakiDurusma: null, onIncelemeTarihi: null, uyapDosyaId: null,
      asamaDetayJson: { kaynakTuru: 'KURAL', teyit: ss.some((s) => s.onaylananSonGun) ? 'TEYITLI' : 'ADAY' },
      updatedAt: new Date(Math.max(...ss.map((s) => s.updatedAt.getTime()))), islemler: [], sureler: ss,
    }, simdi))
  }
  return satirlar.map((s) => ({ ...s, sonraki: iso(s.sonraki), sonGelisme: iso(s.sonGelisme) }))
}
