/**
 * KonsRücü — arabuluculuk paneli veri yükleyicisi (server-only) · lib/konsrucu/arabuluculuk/veri.ts
 *
 * Dosya ekranına ("Bağla" aşaması) tek çağrıda bütün arabuluculuk kartlarının prop'larını verir. Kapsam:
 * dosya `musteriId` ile birlikte aranır (M7); başka müvekkilin dosyası `null` döner. Tarihler istemciye
 * ISO metin olarak gider (RSC serileştirmesi). Kişisel veri (borçlu, arabulucu adı) istemcide VARSAYILAN MASKELİ
 * gösterilir; TCKN/telefon/IBAN bu yükleyiciden hiç çıkmaz.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { onayTalebiTaslagi } from './bildirim-taslak'
import { yenidenOnayBekliyorMu } from './durma'
import { arabuluculukKurallari, type KuralSonucu } from './kurallar'
import { musteriOnayiKapisi, type OnayKaydiOzet } from './onay'
import { YOL_ONAY_TURU, type ItirazSonrasiYol, type OnayTuru } from './sabitler'
import { isoGun } from './tarih'
import { telefonHazirOzeti, type TelefonHazirOzet } from './telefon-hazir'
import { avukatMi, yazabilir, type Kullanici } from './yetki'
import { kayitIsaretiOku } from '../dava/kayit'

const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()))
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export type OnayUI = {
  id: string
  tur: string
  sonuc: string
  istenmeAt: string | null
  alinmaAt: string | null
  onaylayanUnvan: string | null
  tutar: number | null
  istisnaGerekce: string | null
}

export type ArabuluculukUI = {
  id: string
  asamaId: string
  tur: string | null
  turGerekce: string | null
  basvuruTarihi: string | null
  basvuruNo: string | null
  buroNo: string | null
  uyapDosyaNo: string | null
  arabulucu: string | null
  surecBaslangic: string | null
  sonTutanakTarihi: string | null
  sonuc: string | null
  katilmayanTaraf: string | null
  kismen: { anlasilan?: string; anlasilmayan?: string } | null
  konuMetni: string | null
  sonTutanakBelgeId: string | null
  onayAt: string | null
  teyit: string
  kaynakTuru: string
}

export type SureUI = {
  id: string
  borcluSira: number | null
  onerilenIhtiyatli: string | null
  onerilenSonGun: string | null
  onaylananSonGun: string | null
  durum: string
  yenidenOnayBekliyor: boolean
  durmalar: { bas: string; bit: string; gun: number; sayildi: boolean; dayanak: string }[]
  oncekiOnaylanan: string | null
}

export type ArabuluculukPaneliVeri = {
  dosyaId: string
  yetki: { yazabilir: boolean; avukat: boolean }
  itirazOnayli: boolean
  itirazEdenAdlari: string[]
  yolSecimi: { id: string; secim: string; gerekce: string | null; ekonomi: Record<string, string> | null; secimAt: string } | null
  onaylar: OnayUI[]
  onayKapisi: { acik: boolean; neden: string; mesaj: string | null; istisnaMumkun: boolean; kalanGun: number | null }
  gerekenOnayTuru: OnayTuru | null
  ihtiyatliSonGun: string | null
  arabuluculuk: ArabuluculukUI | null
  toplantilar: { id: string; baslar: string; durum: string; sonucNot: string | null; yer: string | null; online: boolean }[]
  sureler: SureUI[]
  belgeler: { id: string; dosyaAdi: string; altTur: string | null }[]
  davaVar: boolean
  kurallar: KuralSonucu[]
  telefon: TelefonHazirOzet
  onayTaslagi: string | null
}

/** Açık İİK 67 kayıtlarının en erken ihtiyatlı son günü (kilit ve istisna hesabı için). */
export function enErkenIhtiyatli(sureler: { onerilenIhtiyatli: Date | null; durum: string; silindiAt?: Date | null }[]): Date | null {
  const t = sureler
    .filter((s) => !s.silindiAt && ['ACIK', 'KAPANMAYA_HAZIR', 'TETIK_BEKLIYOR'].includes(s.durum) && s.onerilenIhtiyatli)
    .map((s) => (s.onerilenIhtiyatli as Date).getTime())
  return t.length ? new Date(Math.min(...t)) : null
}

export async function arabuluculukPaneli(dosyaId: string, musteriId: string, kullanici: Kullanici, simdi: Date = new Date()): Promise<ArabuluculukPaneliVeri | null> {
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId },
    select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDairesi: true, icraDosyaNo: true, asilAlacak: true, musteri: { select: { ad: true } } },
  })
  if (!dosya) return null
  const [takipler, yol, onaylar, arab, sureler, talep, belgeler, davaSay, ayar] = await Promise.all([
    prisma.borcluTakip.findMany({ where: { dosyaId, silindiAt: null }, select: { itirazVar: true, itirazTipi: true, itirazEdilenTutar: true, itirazKapsamJson: true, borcluId: true, borclu: { select: { adUnvan: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.yolSecimi.findFirst({ where: { dosyaId, asama: 'ITIRAZ_SONRASI', durum: 'GECERLI', silindiAt: null }, orderBy: { secimAt: 'desc' } }),
    prisma.onayKaydi.findMany({ where: { dosyaId, silindiAt: null }, orderBy: { createdAt: 'desc' } }),
    prisma.arabuluculuk.findFirst({ where: { dosyaId, silindiAt: null }, orderBy: { createdAt: 'desc' }, include: { asama: { select: { detayJson: true } } } }),
    prisma.sure.findMany({ where: { dosyaId, tur: 'IIK67', silindiAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.takipTalebi.findFirst({ where: { dosyaId, gecerli: true, silindiAt: null }, orderBy: { surum: 'desc' }, select: { toplam: true, asilAlacak: true } }),
    prisma.belge.findMany({ where: { dosyaId, silindiAt: null }, select: { id: true, dosyaAdi: true, altTur: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.dava.count({ where: { dosyaId, silindiAt: null, durum: { not: 'HAZIRLIK' } } }),
    prisma.ayarlar.findUnique({ where: { musteriId }, select: { alacakliUnvan: true } }),
  ])
  const toplantilar = await prisma.etkinlik.findMany({
    where: { dosyaId, tur: 'ARABULUCULUK_TOPLANTISI', ...(arab ? { OR: [{ asamaId: arab.asamaId }, { asamaId: null }] } : {}) },
    orderBy: { baslar: 'asc' },
    select: { id: true, baslar: true, durum: true, sonucNot: true, yer: true, online: true },
  })

  const onayOzet: OnayKaydiOzet[] = onaylar.map((o) => ({ id: o.id, tur: o.tur, sonuc: o.sonuc, alinmaAt: o.alinmaAt, istisnaGerekce: o.istisnaGerekce, silindiAt: o.silindiAt, tutar: n(o.tutar), onaylayanUnvan: o.onaylayanUnvan, davaId: o.davaId }))
  const ihtiyatli = enErkenIhtiyatli(sureler)
  const itirazlar = takipler.filter((t) => t.itirazVar === true)
  const gerekenOnayTuru = yol ? YOL_ONAY_TURU[yol.secim as ItirazSonrasiYol] ?? null : null
  const kapi = musteriOnayiKapisi(gerekenOnayTuru ?? 'DAVA_ACMA', onayOzet, { ihtiyatliSonGun: ihtiyatli, simdi })
  const isaret = arab ? kayitIsaretiOku(arab.asama.detayJson) : null
  const takipToplam = n(talep?.toplam) ?? n(talep?.asilAlacak) ?? n(dosya.asilAlacak)
  const yenidenBekleyen = sureler.filter((s) => yenidenOnayBekliyorMu(s)).length

  const kurallar = arabuluculukKurallari({
    itirazOnayli: itirazlar.length > 0,
    yolSecimi: yol ? { secim: yol.secim } : null,
    onaylar: onayOzet,
    arabuluculuk: arab ? { tur: arab.tur, basvuruTarihi: arab.basvuruTarihi, sonTutanakTarihi: arab.sonTutanakTarihi, sonTutanakBelgeId: arab.sonTutanakBelgeId, sonuc: arab.sonuc, onayAt: arab.onayAt } : null,
    toplantilar: toplantilar.map((t) => ({ baslar: t.baslar, durum: t.durum })),
    iik67YenidenOnayBekleyen: yenidenBekleyen,
    karsiTarafUyumsuz: false, // AR-09 son tutanak onayında hesaplanır (belge metni gerekir)
    davaVar: davaSay > 0,
    ihtiyatliSonGun: ihtiyatli,
  }, simdi)

  const telefon = telefonHazirOzeti({
    hukukDosyaNo: dosya.hukukDosyaNo,
    icra: { daire: dosya.icraDairesi, esas: dosya.icraDosyaNo },
    takipToplam,
    itirazlar: itirazlar.map((t, i) => ({ sira: i + 1, tip: t.itirazTipi, tutar: n(t.itirazEdilenTutar), kapsam: t.itirazKapsamJson })),
    arabuluculuk: arab ? { tur: arab.tur, basvuruNo: arab.basvuruNo, buroNo: arab.buroNo, uyapDosyaNo: arab.uyapDosyaNo, sonuc: arab.sonuc } : null,
    toplantilar: toplantilar.map((t) => ({ baslar: t.baslar, durum: t.durum, sonucNot: t.sonucNot })),
    onaylar: onayOzet,
  })

  const onayTaslagi = gerekenOnayTuru
    ? onayTalebiTaslagi({
        kunye: { musteriUnvani: ayar?.alacakliUnvan ?? dosya.musteri.ad, hukukDosyaNo: dosya.hukukDosyaNo, hasarDosyaNo: dosya.hasarDosyaNo, icraDairesi: dosya.icraDairesi, icraEsas: dosya.icraDosyaNo },
        onayTuru: gerekenOnayTuru,
        yol: yol?.secim as ItirazSonrasiYol,
        gerekce: yol?.gerekce ?? null,
        takipToplam,
        itirazEdilen: itirazlar.length ? itirazlar.reduce((a, t) => a + (n(t.itirazEdilenTutar) ?? 0), 0) : null,
        ekonomi: (yol?.ekonomiJson as Record<string, string> | null) ?? null,
        ihtiyatliSonGun: ihtiyatli,
      })
    : null

  const kismen = arab?.kismenJson && typeof arab.kismenJson === 'object' ? (arab.kismenJson as { anlasilan?: string; anlasilmayan?: string }) : null
  return {
    dosyaId,
    yetki: { yazabilir: yazabilir(kullanici), avukat: avukatMi(kullanici) },
    itirazOnayli: itirazlar.length > 0,
    itirazEdenAdlari: itirazlar.map((t) => t.borclu.adUnvan),
    yolSecimi: yol ? { id: yol.id, secim: yol.secim, gerekce: yol.gerekce, ekonomi: (yol.ekonomiJson as Record<string, string> | null) ?? null, secimAt: yol.secimAt.toISOString() } : null,
    onaylar: onaylar.map((o) => ({ id: o.id, tur: o.tur, sonuc: o.sonuc, istenmeAt: iso(o.istenmeAt), alinmaAt: iso(o.alinmaAt), onaylayanUnvan: o.onaylayanUnvan, tutar: n(o.tutar), istisnaGerekce: o.istisnaGerekce })),
    onayKapisi: kapi.acik
      ? { acik: true, neden: kapi.neden, mesaj: null, istisnaMumkun: false, kalanGun: null }
      : { acik: false, neden: kapi.neden, mesaj: kapi.mesaj, istisnaMumkun: kapi.istisnaMumkun, kalanGun: kapi.kalanGun },
    gerekenOnayTuru,
    ihtiyatliSonGun: isoGun(ihtiyatli),
    arabuluculuk: arab
      ? {
          id: arab.id, asamaId: arab.asamaId, tur: arab.tur, turGerekce: arab.turGerekce,
          basvuruTarihi: isoGun(arab.basvuruTarihi), basvuruNo: arab.basvuruNo, buroNo: arab.buroNo, uyapDosyaNo: arab.uyapDosyaNo,
          arabulucu: arab.arabulucu, surecBaslangic: isoGun(arab.surecBaslangic), sonTutanakTarihi: isoGun(arab.sonTutanakTarihi),
          sonuc: arab.sonuc, katilmayanTaraf: arab.katilmayanTaraf, kismen, konuMetni: arab.konuMetni,
          sonTutanakBelgeId: arab.sonTutanakBelgeId, onayAt: iso(arab.onayAt), teyit: isaret?.teyit ?? 'TEYITLI', kaynakTuru: isaret?.kaynakTuru ?? 'ELLE',
        }
      : null,
    toplantilar: toplantilar.map((t) => ({ id: t.id, baslar: t.baslar.toISOString(), durum: t.durum, sonucNot: t.sonucNot, yer: t.yer, online: t.online })),
    sureler: sureler.map((s) => {
      const iz = s.hesapIziJson && typeof s.hesapIziJson === 'object' ? (s.hesapIziJson as Record<string, unknown>) : {}
      const sira = s.borcluId ? takipler.findIndex((t) => t.borcluId === s.borcluId) : -1
      return {
        id: s.id,
        borcluSira: sira >= 0 ? sira + 1 : null,
        onerilenIhtiyatli: isoGun(s.onerilenIhtiyatli),
        onerilenSonGun: isoGun(s.onerilenSonGun),
        onaylananSonGun: isoGun(s.onaylananSonGun),
        durum: s.durum,
        yenidenOnayBekliyor: yenidenOnayBekliyorMu(s),
        durmalar: (Array.isArray(s.durmaJson) ? (s.durmaJson as { bas: string; bit: string; gun: number; sayildi: boolean; dayanak: string }[]) : []).map((d) => ({ bas: d.bas, bit: d.bit, gun: Number(d.gun) || 0, sayildi: !!d.sayildi, dayanak: String(d.dayanak ?? '') })),
        oncekiOnaylanan: typeof iz.oncekiOnaylanan === 'string' ? iz.oncekiOnaylanan : null,
      }
    }),
    belgeler: belgeler.map((b) => ({ id: b.id, dosyaAdi: b.dosyaAdi, altTur: b.altTur })),
    davaVar: davaSay > 0,
    kurallar,
    telefon,
    onayTaslagi,
  }
}
