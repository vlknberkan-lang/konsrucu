/**
 * KonsRücü — Dava Panosu satırı ve genel durum kutusu · lib/konsrucu/dava/pano.ts (saf)
 *
 * 06 2(j): bütün davalar tek tabloda (mahkeme, esas, evre, sonraki duruşma, açık süre, son gelişme, DURUM GÜVENİ).
 * Durum güveni:
 *  - EskIMIŞ: son gelişme 60 günden eski ("60 gündür sessiz").
 *  - TEYITSIZ: kayıt ADAY (geri doldurma/Excel önerisi) ya da hiçbir alt kaydı teyitli değil ve UYAP bağı yok.
 *  - TEYITLI: avukat girdi/onayladı ya da UYAP bağı var ve en az bir teyitli işlem.
 * Genel durum eksenlerden TÜRETİLİR, elle yazılmaz (eksenler S15'in önbelleğinden gelir).
 */
import { gunFarki, trGun } from '../arabuluculuk/tarih'
import { kayitIsaretiOku, mahkemeAdi, esasMetni } from './kayit'
import { DAVA_DURUM_ETIKET, EVRE_ETIKET, ISLEM_ETIKET, SESSIZ_ESIK_GUN, SURE_PENCERE_GUN, type DavaDurumu, type DavaEvresi, type DavaIslemTuru } from './sabitler'

export type DurumGuveni = 'TEYITLI' | 'TEYITSIZ' | 'ESKIMIS'

export type PanoGirdi = {
  davaId: string | null
  dosyaId: string
  hukukDosyaNo: string | null
  mahkemeTuru: string | null
  mahkemeYer: string | null
  mahkemeNo: string | null
  esasYil: number | null
  esasSira: number | null
  evre: string | null
  durum: string | null
  rolumuz: string | null
  sonrakiDurusma: Date | null
  onIncelemeTarihi: Date | null
  uyapDosyaId: string | null
  asamaDetayJson: unknown
  updatedAt: Date | null
  islemler: { tur: string; tarih: Date | null; createdAt: Date; teyit: string }[]
  sureler: { tur: string; onaylananSonGun: Date | null; onerilenIhtiyatli: Date | null; durum: string }[]
}

export type PanoSatiri = {
  anahtar: string
  davaId: string | null
  dosyaId: string
  dosya: string
  mahkemeEsas: string
  evre: string
  evreTuretildi: boolean
  sonraki: Date | null
  sonrakiEtiket: string
  sureKalanGun: number | null
  sureEtiket: string
  sureOnaysiz: boolean
  sonGelisme: Date | null
  sonGelismeEtiket: string
  guven: DurumGuveni
  karsiTaraf: boolean
  davaAcilmadi: boolean
  sessizGun: number | null
}

/** İşlem türünden evre tahmini (Dava.evre boşsa; "türetilmiş" işaretiyle). */
function evreTahmini(islemler: PanoGirdi['islemler']): string | null {
  const sirali = islemler.slice().sort((a, b) => (b.tarih ?? b.createdAt).getTime() - (a.tarih ?? a.createdAt).getTime())
  const son = sirali[0]?.tur
  if (!son) return null
  if (['KARAR', 'GEREKCELI_KARAR'].includes(son)) return 'Karar'
  if (['BILIRKISI_ATAMA', 'BILIRKISI_RAPORU', 'MUZEKKERE', 'MUZEKKERE_CEVABI', 'DURUSMA'].includes(son)) return 'Tahkikat'
  if (son === 'ON_INCELEME') return 'Ön inceleme'
  if (['CEVAP', 'CEVABA_CEVAP', 'IKINCI_CEVAP', 'DELIL_DILEKCESI', 'DEKONT_SUNUMU', 'TENSIP', 'ARA_KARAR'].includes(son)) return 'Dilekçeler'
  return ISLEM_ETIKET[son as DavaIslemTuru] ?? null
}

export function panoSatiri(g: PanoGirdi, simdi: Date = new Date()): PanoSatiri {
  const isaret = kayitIsaretiOku(g.asamaDetayJson)
  const tarihler = [g.updatedAt, ...g.islemler.map((i) => i.tarih ?? i.createdAt)].filter((x): x is Date => !!x)
  const sonGelisme = tarihler.length ? new Date(Math.max(...tarihler.map((d) => d.getTime()))) : null
  const sessizGun = sonGelisme ? gunFarki(sonGelisme, simdi) : null
  const teyitliIslem = g.islemler.some((i) => i.teyit === 'TEYITLI')
  let guven: DurumGuveni
  if (sessizGun != null && sessizGun >= SESSIZ_ESIK_GUN) guven = 'ESKIMIS'
  else if (isaret.teyit !== 'TEYITLI') guven = 'TEYITSIZ'
  else if (!g.uyapDosyaId && isaret.kaynakTuru !== 'ELLE' && !teyitliIslem) guven = 'TEYITSIZ'
  else guven = 'TEYITLI'

  const acik = g.sureler.filter((s) => ['ACIK', 'KAPANMAYA_HAZIR', 'TETIK_BEKLIYOR'].includes(s.durum))
  const gunler = acik
    .map((s) => ({ s, gun: s.onaylananSonGun ? gunFarki(simdi, s.onaylananSonGun) : s.onerilenIhtiyatli ? gunFarki(simdi, s.onerilenIhtiyatli) : null }))
    .filter((x): x is { s: PanoGirdi['sureler'][number]; gun: number } => x.gun != null)
    .sort((a, b) => a.gun - b.gun)
  const enYakin = gunler[0] ?? null

  const sonraki = [g.sonrakiDurusma, g.onIncelemeTarihi].filter((d): d is Date => !!d && gunFarki(simdi, d) >= 0).sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  const evreRaw = g.evre ? EVRE_ETIKET[g.evre as DavaEvresi] ?? g.evre : null
  const tahmin = evreRaw ? null : evreTahmini(g.islemler)
  const durumEt = g.durum && g.durum !== 'DERDEST' ? DAVA_DURUM_ETIKET[g.durum as DavaDurumu] ?? g.durum : null
  const mahkeme = mahkemeAdi(g) ?? '—'
  const esas = esasMetni(g.esasYil, g.esasSira)
  return {
    anahtar: g.davaId ?? `sure:${g.dosyaId}`,
    davaId: g.davaId,
    dosyaId: g.dosyaId,
    dosya: g.hukukDosyaNo ?? g.dosyaId.slice(0, 8),
    mahkemeEsas: g.davaId ? `${mahkeme}${esas ? ` ${esas}` : ''}` : '(dava açılmadı)',
    evre: durumEt ?? evreRaw ?? tahmin ?? (g.davaId ? '—' : 'İİK 67'),
    evreTuretildi: !durumEt && !evreRaw && !!tahmin,
    sonraki,
    sonrakiEtiket: sonraki ? `${sonraki === g.onIncelemeTarihi ? 'Ön inc. ' : ''}${trGun(sonraki)}` : '—',
    sureKalanGun: enYakin?.gun ?? null,
    sureEtiket: enYakin ? `${enYakin.gun} g${enYakin.s.onaylananSonGun ? '' : ' (onaysız)'}` : '—',
    sureOnaysiz: !!enYakin && !enYakin.s.onaylananSonGun,
    sonGelisme,
    sonGelismeEtiket: sonGelisme ? trGun(sonGelisme) : '—',
    guven,
    karsiTaraf: g.rolumuz === 'DAVALI',
    davaAcilmadi: !g.davaId,
    sessizGun,
  }
}

export type PanoSuzgec = 'teyitsiz' | 'sure30' | 'sessiz60' | 'karsi'

export function panoSuz(satirlar: PanoSatiri[], s: PanoSuzgec | null): PanoSatiri[] {
  if (!s) return satirlar
  if (s === 'teyitsiz') return satirlar.filter((x) => x.guven === 'TEYITSIZ')
  if (s === 'sure30') return satirlar.filter((x) => x.sureKalanGun != null && x.sureKalanGun <= SURE_PENCERE_GUN)
  if (s === 'sessiz60') return satirlar.filter((x) => x.sessizGun != null && x.sessizGun >= SESSIZ_ESIK_GUN)
  return satirlar.filter((x) => x.karsiTaraf)
}

/** Sıralama: önce en yakın süre (onaysız önde), sonra sonraki duruşma. */
export function panoSirala(satirlar: PanoSatiri[]): PanoSatiri[] {
  return satirlar.slice().sort((a, b) => {
    const sa = a.sureKalanGun ?? Number.POSITIVE_INFINITY
    const sb = b.sureKalanGun ?? Number.POSITIVE_INFINITY
    if (sa !== sb) return sa - sb
    if (a.sureOnaysiz !== b.sureOnaysiz) return a.sureOnaysiz ? -1 : 1
    return (a.sonraki?.getTime() ?? Number.POSITIVE_INFINITY) - (b.sonraki?.getTime() ?? Number.POSITIVE_INFINITY)
  })
}

// ─────────────────── genel durum kutusu ───────────────────

const ICRA_ET: Record<string, string> = {
  TAKIP_YOK: 'Takip yok', IDARI_YOL: 'İdari yol', TEVZI: 'Tevzi', TEBLIG_BEKLENIYOR: 'Tebliğ bekleniyor', ITIRAZ_SURESI: 'İtiraz süresi',
  DURDU_ITIRAZ: 'Durdu (itiraz)', KISMEN_DURDU: 'Kısmen durdu', KESINLESTI: 'Kesinleşti', INFAZ: 'İnfaz', TAHSIL: 'Tahsil', KAPALI: 'Kapalı', BILINMIYOR: 'Bilinmiyor',
}
const ARAB_ET: Record<string, string> = { YOK: 'Yok', HAZIRLIK: 'Hazırlık', DEVAM: 'Devam', SON_TUTANAK_ANLASMA: 'Anlaşma', SON_TUTANAK_DIGER: 'Anlaşamama' }

export function genelDurum(p: {
  icraEksen: string | null
  arabEksen: string | null
  davaEksen: string | null
  talep: number | null
  tahsil: number
  acikSure: number
  onaysizSure: number
}): { icra: string; arab: string; dava: string; para: { talep: number | null; tahsil: number; kalan: number | null }; acikSure: number; onaysizSure: number; eksenYok: boolean } {
  return {
    icra: p.icraEksen ? ICRA_ET[p.icraEksen] ?? p.icraEksen : '—',
    arab: p.arabEksen ? ARAB_ET[p.arabEksen] ?? p.arabEksen : '—',
    dava: p.davaEksen ? DAVA_DURUM_ETIKET[p.davaEksen as DavaDurumu] ?? p.davaEksen : '—',
    para: { talep: p.talep, tahsil: p.tahsil, kalan: p.talep != null ? Math.round((p.talep - p.tahsil) * 100) / 100 : null },
    acikSure: p.acikSure,
    onaysizSure: p.onaysizSure,
    eksenYok: !p.icraEksen && !p.arabEksen && !p.davaEksen,
  }
}
