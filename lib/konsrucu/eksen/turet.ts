/**
 * KonsRücü — Üç eksen TÜRETME · lib/konsrucu/eksen/turet.ts (saf, client-safe; DB yok)
 *
 * 06 M3: icra, arabuluculuk ve dava tek bir saf fonksiyondan, ONAYLI olgulardan türetilir; eski `durum`
 * alanı ayrı kalır (docs/04 K2: icra ve dava tek eksende değil). Asimetrik güven (06 M2):
 *
 *   • Riski ARTIRAN aday (UYAP itirazı, durum metnindeki "durdurulmuş: itiraz") onaysız da eksende
 *     "teyitsiz" görünür → İCRA "Durdu - itiraz (UYAP, teyitsiz)".
 *   • Riski AZALTAN geçiş (kesinleşme, infaz, tahsil, kapanış, arabuluculukta anlaşma, davada kesinleşme)
 *     YALNIZ avukat onaylı olgudan yazılır. UYAP kesinleşme ADAYI eksen değerini değiştirmez; yalnız not düşer.
 *   • Tebliğ adayı onaylanana kadar eksen "Tebliğ bekleniyor · tebliğ sinyali (teyitsiz)" kalır (06 §2(e) kartı).
 *   • İADE tebliğ değildir: süre başlamaz (docs/04 K3).
 *   • HACİZ hiçbir türüyle kesinleşme sayılmaz (docs/04 K2); dosya alacağına haciz ve ihtiyati haciz eksene girmez.
 *   • Borçlu bazında hesaplanır: iki borçlu farklı durumdaysa dosya "Kısmen durdu" (06 §2(e); B08).
 *   • Eski olay satırları (teyit = null) yeni hesaba girmez; reddedilen aday (REDDEDILDI) sayılmaz.
 *   • İDARİ_YOL ekseni yalnız avukat onaylı yoldan (yolOnaylayanId; B12).
 *
 * Veri yoksa program "bilmiyorum" der: eski durumu ilerlemiş (tebliğ/itiraz/dava) ama hiç doğrulanmış olgusu
 * olmayan dosya BILINMIYOR ("teyit edin") görünür — güvenli hata (06 §1 "Güvenlik").
 */
import { trNorm } from './norm'
import {
  EKSEN_KURAL_SURUM, type ArabEksen, type DavaEksen, type EksenKaynak, type EksenTeyit, type IcraEksen,
} from './sabitler'

// ── Girdi ────────────────────────────────────────────────────────────────────
export type EksenOlay = {
  id: string
  altTip: string | null
  teyit: string | null
  borcluId: string | null
  hukukiTarih: Date | null
  sonuc: string | null
  kural: string | null
}

export type EksenBorcluTakip = {
  id: string
  tebligTarihi: Date | null
  tebligSonucu: string | null
  itirazVar: boolean | null
  itirazTipi: string | null
  itirazAlacakliyaTebligTarihi: Date | null
}

export type EksenGirdi = {
  /** Eski tek eksenli durum (DosyaDurum adı). Yalnız "takip var mı" ve "veri yok" kararında okunur. */
  durum: string
  icraDosyaNo: string | null
  takipTarihi: Date | null
  /** TakipTalebi dondurulmuş (tevzi yapılmış) ama esas no yok (S21). */
  tevziVar?: boolean
  /** İdari yolu avukat onayladı mı (yolOnaylayanId dolu). */
  yolOnayli: boolean
  kapanisSebebi: string | null
  kapanisAt: Date | null
  borclular: { id: string; takip: EksenBorcluTakip | null }[]
  /** Yalnız aday kolonlu olaylar (teyit dolu); eski satırlar gönderilmez ya da süzülür. */
  olaylar: EksenOlay[]
  arabuluculuk: { id: string; basvuruTarihi: Date | null; sonTutanakTarihi: Date | null; sonuc: string | null; onayAt: Date | null } | null
  /** Geçerli ITIRAZ_SONRASI yol seçimi (S26). */
  yolSecimi: { id: string; secim: string } | null
  davalar: {
    id: string; durum: string; rolumuz: string; derece: number; kesinlesmeTarihi: Date | null
    kesinlesmeBelgeId: string | null; kararOnayAt: Date | null; createdAt?: Date
  }[]
  /** Eski Asama kayıtları (ARABULUCULUK / DAVA; IPTAL hariç). Yalnız yeni kayıt yoksa, teyitsiz okunur. */
  eskiAsamalar: { id: string; tur: string; durum: string; sonuc: string | null }[]
}

// ── Çıktı ────────────────────────────────────────────────────────────────────
export type EksenDeger<T extends string> = {
  deger: T
  teyit: EksenTeyit
  kaynak: EksenKaynak
  /** Kanıt kayıtları: TakipOlayi / BorcluTakip / Arabuluculuk / Dava kimlikleri */
  kanitIds: string[]
  /** Kararı veren eksen kuralı (DurumGecisi.sebep'e yazılır) */
  kural: string
  notlar: string[]
}

export type BorcluEksen = { borcluId: string } & EksenDeger<IcraEksen>

export type EksenSonuc = {
  icra: EksenDeger<IcraEksen>
  arab: EksenDeger<ArabEksen>
  dava: EksenDeger<DavaEksen>
  borclular: BorcluEksen[]
  surum: number
}

const k = (kod: string) => `EKS-${kod}@${EKSEN_KURAL_SURUM}`

function deger<T extends string>(d: T, teyit: EksenTeyit, kaynak: EksenKaynak, kural: string, kanitIds: string[] = [], notlar: string[] = []): EksenDeger<T> {
  return { deger: d, teyit, kaynak, kural: k(kural), kanitIds: [...new Set(kanitIds)], notlar }
}

const aktif = (o: EksenOlay) => o.teyit === 'ADAY' || o.teyit === 'TEYITLI'

/** Eski durumun takip açıldıktan sonraki değerleri (lib/konsrucu/durum DURUM_RANK ≥ TAKIP_ACILDI; İDARİ_YOL hariç). */
const TAKIP_SONRASI_DURUMLAR: ReadonlySet<string> = new Set([
  'TAKIP_ACILDI', 'TEBLIG_EDILDI', 'ITIRAZ', 'ARABULUCULUK', 'DAVA', 'KESINLESTI', 'INFAZ', 'TAHSIL', 'KAPANDI',
])
/** Veri yokken "tebliğ bekleniyor" tahmininin yapılabildiği eski durumlar; daha ileri durumda program "bilmiyorum" der. */
const TAHMIN_EDILEBILIR_DURUMLAR: ReadonlySet<string> = new Set(['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR', 'TAKIP_ACILDI'])
const ITIRAZ_ADAY = new Set(['ITIRAZ', 'DURDURMA_ITIRAZ'])

// ── İCRA ─────────────────────────────────────────────────────────────────────
function borcluIcra(b: EksenGirdi['borclular'][number], olaylar: EksenOlay[], dosyaItirazAdaylari: EksenOlay[]): BorcluEksen & { veriVar: boolean } {
  const bt = b.takip
  const kendi = olaylar.filter((o) => o.borcluId === b.id && aktif(o))
  const itirazAday = kendi.filter((o) => o.teyit === 'ADAY' && ITIRAZ_ADAY.has(o.altTip ?? ''))
  const tebligAday = kendi.filter((o) => o.teyit === 'ADAY' && o.altTip === 'TEBLIG_SONUCU')
  const iadeAday = kendi.filter((o) => o.teyit === 'ADAY' && o.altTip === 'TEBLIG_IADE')
  const veriVar = !!bt || kendi.length > 0
  const sonuc = (d: IcraEksen, teyit: EksenTeyit, kaynak: EksenKaynak, kural: string, kanit: string[], notlar: string[]) =>
    ({ borcluId: b.id, veriVar, ...deger(d, teyit, kaynak, kural, kanit, notlar) })

  // 1) Avukat onaylı itiraz (tam → durdu; kısmi → kısmen durdu: itiraz edilmeyen kısım için takip sürer)
  if (bt?.itirazVar === true) {
    const notlar = bt.itirazAlacakliyaTebligTarihi ? [] : ['İtirazın size tebliğ tarihi girilmedi (İİK 67 başlangıcı, teyit gerekli).']
    if (bt.itirazTipi === 'KISMI') return sonuc('KISMEN_DURDU', 'TEYITLI', 'AVUKAT', 'BORCLU-ITIRAZ-KISMI', [bt.id], ['Kısmi itiraz: itiraz edilmeyen kısım için takibe devam (teyit gerekli).', ...notlar])
    return sonuc('DURDU_ITIRAZ', 'TEYITLI', 'AVUKAT', 'BORCLU-ITIRAZ', [bt.id], notlar)
  }
  // 2) UYAP itiraz adayı (riski artırır → teyitsiz de görünür). Avukat "itiraz yok" demişse de çelişki olarak görünür.
  if (itirazAday.length) {
    const notlar = ['UYAP itiraz sinyali: onayınızı bekliyor.']
    if (bt?.itirazVar === false) notlar.push('Borçlu kaydında "itiraz yok" yazıyor; UYAP sinyaliyle çelişiyor, kontrol edin.')
    return sonuc('DURDU_ITIRAZ', 'TEYITSIZ', 'UYAP', 'BORCLU-ITIRAZ-ADAY', itirazAday.map((o) => o.id), notlar)
  }
  // 3) Dosya düzeyindeki itiraz sinyali (borçlusu belirsiz): avukat bu borçlu için "itiraz yok" demediyse uygulanır.
  if (dosyaItirazAdaylari.length && bt?.itirazVar !== false) {
    return sonuc('DURDU_ITIRAZ', 'TEYITSIZ', 'UYAP', 'DOSYA-ITIRAZ-ADAY', dosyaItirazAdaylari.map((o) => o.id), ['UYAP itiraz sinyali (borçlu belirsiz): onayınızı bekliyor.'])
  }
  // 4) Avukat onaylı tebliğ → itiraz süresi (kesinleşme ayrıca onay ister)
  if (bt?.tebligSonucu === 'TEBLIG' && bt.tebligTarihi) {
    const notlar: string[] = []
    if (bt.itirazVar === false) notlar.push('İtiraz yok (avukat kaydı); kesinleşme onayı bekleniyor.')
    if (dosyaItirazAdaylari.length) notlar.push('UYAP durum metninde itiraz var; bu borçlu için "itiraz yok" kaydını kontrol edin.')
    return sonuc('ITIRAZ_SURESI', 'TEYITLI', 'AVUKAT', 'BORCLU-TEBLIG', [bt.id], notlar)
  }
  // 5) Onaylı İADE: tebliğ yok, süre başlamadı
  if (bt?.tebligSonucu === 'IADE') {
    const notlar = ['Tebliğ edilemedi (İADE): yeni adres ya da TK 21/35 kararı (teyit gerekli).']
    if (tebligAday.length) notlar.push('Yeni tebliğ sinyali (teyitsiz): onayınızı bekliyor.')
    return sonuc('TEBLIG_BEKLENIYOR', 'TEYITLI', 'AVUKAT', 'BORCLU-IADE', [bt.id, ...tebligAday.map((o) => o.id)], notlar)
  }
  // 6) Tebliğ bekleniyor; adaylar yalnız not düşer (onaylanana kadar süre açılmaz)
  const notlar: string[] = []
  if (tebligAday.length) notlar.push('Tebliğ sinyali (teyitsiz): onayınızı bekliyor.')
  if (iadeAday.length) notlar.push('İADE sinyali (teyitsiz): tebliğ yapılamamış olabilir.')
  return sonuc('TEBLIG_BEKLENIYOR', 'TEYITSIZ', veriVar ? 'UYAP' : 'TAHMIN', 'BORCLU-TEBLIG-BEKLENIYOR', [...tebligAday, ...iadeAday].map((o) => o.id), notlar)
}

export function icraTuret(g: EksenGirdi): { icra: EksenDeger<IcraEksen>; borclular: BorcluEksen[] } {
  const olaylar = g.olaylar.filter(aktif)
  const bos = { borclular: [] as BorcluEksen[] }

  // Kapanış yalnız avukattan (S31: kapanisSebebi/kapanisAt). BILINMIYOR sebep dosyayı kapatmaz (radarda kalır, B25).
  if (g.kapanisAt && g.kapanisSebebi && g.kapanisSebebi !== 'BILINMIYOR') {
    const tahsil = g.kapanisSebebi === 'TAHSIL' || g.kapanisSebebi === 'HARICEN_TAHSIL'
    return { ...bos, icra: deger(tahsil ? 'TAHSIL' : 'KAPALI', 'TEYITLI', 'AVUKAT', tahsil ? 'KAPANIS-TAHSIL' : 'KAPANIS') }
  }
  if (g.durum === 'IDARI_YOL') {
    if (g.yolOnayli) return { ...bos, icra: deger('IDARI_YOL', 'TEYITLI', 'AVUKAT', 'IDARI-YOL') }
    return { ...bos, icra: deger('TAKIP_YOK', 'TEYITSIZ', 'KURAL', 'IDARI-YOL-ONAYSIZ', [], ['İdari yol avukat onayıyla kayda geçmemiş; yolu onaylayın.']) }
  }

  const takipVar = !!g.icraDosyaNo || !!g.takipTarihi || TAKIP_SONRASI_DURUMLAR.has(g.durum)
  if (!takipVar) {
    if (g.tevziVar) return { ...bos, icra: deger('TEVZI', 'TEYITSIZ', 'KURAL', 'TEVZI', [], ['Tevzi yapıldı; icra esas no girilmedi.']) }
    return { ...bos, icra: deger('TAKIP_YOK', 'TEYITSIZ', 'KURAL', 'TAKIP-YOK') }
  }

  const kesinlesmeTeyitli = olaylar.filter((o) => o.altTip === 'KESINLESME_SERHI' && o.teyit === 'TEYITLI')
  const kesinlesmeAday = olaylar.filter((o) => o.altTip === 'KESINLESME_SERHI' && o.teyit === 'ADAY')
  const icraiHacizTeyitli = olaylar.filter((o) => o.altTip === 'ICRAI_HACIZ' && o.teyit === 'TEYITLI')
  const dosyaItirazAdaylari = olaylar.filter((o) => !o.borcluId && o.teyit === 'ADAY' && ITIRAZ_ADAY.has(o.altTip ?? ''))
  const dosyaTebligAdaylari = olaylar.filter((o) => !o.borcluId && o.teyit === 'ADAY' && (o.altTip === 'TEBLIG_SONUCU' || o.altTip === 'TEBLIG_IADE'))
  const ortakNot: string[] = []
  if (kesinlesmeAday.length) ortakNot.push('UYAP kesinleşme sinyali (teyitsiz): avukat onaylamadan kesinleşmiş sayılmaz.')
  if (dosyaTebligAdaylari.length) ortakNot.push(`Borçlusu belirsiz ${dosyaTebligAdaylari.length} tebliğ sinyali onay bekliyor.`)

  const borclular = g.borclular.map((b) => borcluIcra(b, olaylar, dosyaItirazAdaylari))
  const veriVar = borclular.some((b) => b.veriVar) || olaylar.length > 0
  const temiz = (x: ReturnType<typeof borcluIcra>): BorcluEksen => { const { veriVar: _v, ...r } = x; return r }
  const bSonuc = borclular.map(temiz)

  // Hiç doğrulanmış ya da aday olgu yoksa: eski durum takip açılışındaysa "tebliğ bekleniyor (tahmin)";
  // eski durum daha ileriyse (tebliğ, itiraz, dava …) program bilmiyor → teyit istenir.
  if (!veriVar) {
    if (TAHMIN_EDILEBILIR_DURUMLAR.has(g.durum)) {
      return { borclular: bSonuc, icra: deger('TEBLIG_BEKLENIYOR', 'TEYITSIZ', 'TAHMIN', 'VERI-YOK-TAKIP', [], ['Ödeme emrinin tebliği bekleniyor.', ...ortakNot]) }
    }
    return { borclular: bSonuc, icra: deger('BILINMIYOR', 'TEYITSIZ', 'TAHMIN', 'VERI-YOK', [], ['Eski kayıtlar doğrulanmadı: tebliğ ve itiraz durumunu UYAP\'tan teyit edin.', ...ortakNot]) }
  }

  // Borçlu kaydı yoksa yalnız dosya düzeyi olgular
  if (!borclular.length) {
    if (dosyaItirazAdaylari.length) return { borclular: [], icra: deger('DURDU_ITIRAZ', 'TEYITSIZ', 'UYAP', 'DOSYA-ITIRAZ-ADAY', dosyaItirazAdaylari.map((o) => o.id), ['UYAP itiraz sinyali: onayınızı bekliyor.', ...ortakNot]) }
    if (kesinlesmeTeyitli.length) return { borclular: [], icra: deger(icraiHacizTeyitli.length ? 'INFAZ' : 'KESINLESTI', 'TEYITLI', 'AVUKAT', 'KESINLESME', [...kesinlesmeTeyitli, ...icraiHacizTeyitli].map((o) => o.id), ortakNot) }
    return { borclular: [], icra: deger('TEBLIG_BEKLENIYOR', 'TEYITSIZ', 'UYAP', 'DOSYA-TEBLIG-BEKLENIYOR', [], ortakNot) }
  }

  const degerler = new Set(bSonuc.map((b) => b.deger))
  const tumKanit = bSonuc.flatMap((b) => b.kanitIds)
  const tumTeyitli = bSonuc.every((b) => b.teyit === 'TEYITLI')
  const teyit: EksenTeyit = tumTeyitli ? 'TEYITLI' : 'TEYITSIZ'
  const kaynak: EksenKaynak = tumTeyitli ? 'AVUKAT' : bSonuc.some((b) => b.kaynak === 'UYAP') ? 'UYAP' : bSonuc.some((b) => b.kaynak === 'AVUKAT') ? 'KURAL' : 'TAHMIN'
  const durduSayisi = bSonuc.filter((b) => b.deger === 'DURDU_ITIRAZ' || b.deger === 'KISMEN_DURDU').length

  if (durduSayisi > 0) {
    if (durduSayisi === bSonuc.length && degerler.size === 1 && degerler.has('DURDU_ITIRAZ')) {
      return { borclular: bSonuc, icra: deger('DURDU_ITIRAZ', teyit, kaynak, 'TUM-BORCLULAR-DURDU', tumKanit, ortakNot) }
    }
    const ozet = bSonuc.map((b, i) => `borçlu ${i + 1}: ${b.deger === 'DURDU_ITIRAZ' ? 'itiraz' : b.deger === 'KISMEN_DURDU' ? 'kısmi itiraz' : b.deger === 'ITIRAZ_SURESI' ? 'tebliğ edildi' : 'tebliğ yok'}`).join(' · ')
    return { borclular: bSonuc, icra: deger('KISMEN_DURDU', teyit, kaynak, 'KISMEN-DURDU', tumKanit, [ozet, ...ortakNot]) }
  }

  if (kesinlesmeTeyitli.length) {
    const d: IcraEksen = icraiHacizTeyitli.length ? 'INFAZ' : 'KESINLESTI'
    return { borclular: bSonuc, icra: deger(d, 'TEYITLI', 'AVUKAT', d === 'INFAZ' ? 'INFAZ' : 'KESINLESME', [...kesinlesmeTeyitli, ...icraiHacizTeyitli].map((o) => o.id), ortakNot) }
  }
  if (degerler.has('ITIRAZ_SURESI')) {
    const notlar = degerler.has('TEBLIG_BEKLENIYOR') ? ['Bazı borçlulara tebliğ yapılmadı.', ...ortakNot] : ortakNot
    return { borclular: bSonuc, icra: deger('ITIRAZ_SURESI', teyit, kaynak, 'ITIRAZ-SURESI', tumKanit, notlar) }
  }
  return { borclular: bSonuc, icra: deger('TEBLIG_BEKLENIYOR', teyit, kaynak, 'TEBLIG-BEKLENIYOR', tumKanit, [...new Set(bSonuc.flatMap((b) => b.notlar)), ...ortakNot]) }
}

// ── ARABULUCULUK ─────────────────────────────────────────────────────────────
export function arabTuret(g: EksenGirdi): EksenDeger<ArabEksen> {
  const a = g.arabuluculuk
  if (a) {
    if (a.sonuc && a.sonTutanakTarihi) {
      if (a.sonuc === 'ANLASMA') {
        // Anlaşma riski azaltır (dava gerekmez) → yalnız onaylı son tutanak
        if (a.onayAt) return deger('SON_TUTANAK_ANLASMA', 'TEYITLI', 'AVUKAT', 'ARB-ANLASMA', [a.id])
        return deger('DEVAM', 'TEYITSIZ', 'KURAL', 'ARB-ANLASMA-ONAYSIZ', [a.id], ['Son tutanak "anlaşma" görünüyor; onaylanana kadar arabuluculuk sürüyor sayılır.'])
      }
      const notlar = a.sonuc === 'KISMEN' ? ['Kısmen anlaşma: dava yalnız anlaşılmayan kalemle sınırlı.'] : []
      return deger('SON_TUTANAK_DIGER', a.onayAt ? 'TEYITLI' : 'TEYITSIZ', a.onayAt ? 'AVUKAT' : 'KURAL', 'ARB-SON-TUTANAK', [a.id], notlar)
    }
    if (a.basvuruTarihi) return deger('DEVAM', 'TEYITLI', 'AVUKAT', 'ARB-BASVURU', [a.id])
    return deger('HAZIRLIK', 'TEYITLI', 'AVUKAT', 'ARB-KAYIT', [a.id])
  }
  if (g.yolSecimi?.secim === 'ARABULUCULUK_IIK67') return deger('HAZIRLIK', 'TEYITLI', 'AVUKAT', 'ARB-YOL-SECIMI', [g.yolSecimi.id])

  const eski = g.eskiAsamalar.find((x) => x.tur === 'ARABULUCULUK' && x.durum !== 'IPTAL')
  if (eski) {
    if (eski.durum === 'SONUCLANDI') {
      const s = trNorm(eski.sonuc)
      if (/anlasilmad|anlasama|anlasmama|ulasilama|katilma/.test(s)) return deger('SON_TUTANAK_DIGER', 'TEYITSIZ', 'ESKI_KAYIT', 'ARB-ESKI-SONUC', [eski.id], ['Eski arabuluculuk kaydı: son tutanak tarihini ve belgesini girin.'])
      return deger('DEVAM', 'TEYITSIZ', 'ESKI_KAYIT', 'ARB-ESKI-SONUC-BELIRSIZ', [eski.id], ['Eski kayıtta arabuluculuk sonuçlandırılmış; sonucu ve son tutanağı teyit edin.'])
    }
    return deger('DEVAM', 'TEYITSIZ', 'ESKI_KAYIT', 'ARB-ESKI', [eski.id], ['Eski arabuluculuk kaydı: başvuru bilgilerini teyit edin.'])
  }
  return deger('YOK', 'TEYITSIZ', 'KURAL', 'ARB-YOK')
}

// ── DAVA ─────────────────────────────────────────────────────────────────────
const DAVA_DEGERLERI: readonly DavaEksen[] = ['HAZIRLIK', 'DERDEST', 'ISLEMDEN_KALDIRILDI', 'KARAR', 'KANUN_YOLU', 'KESINLESTI']

export function davaTuret(g: EksenGirdi, arab: EksenDeger<ArabEksen>): EksenDeger<DavaEksen> {
  const sinyaller = g.olaylar.filter((o) => o.teyit === 'ADAY' && o.altTip === 'DAVA_ACILDI_SINYALI')
  const sinyalNot = sinyaller.length ? ['UYAP\'ta dava açıldı sinyali (teyitsiz): davayı bağlamayı onaylayın.'] : []
  const davalar = [...g.davalar].sort((a, b) =>
    (a.rolumuz === 'DAVACI' ? 0 : 1) - (b.rolumuz === 'DAVACI' ? 0 : 1) || b.derece - a.derece || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  const d = davalar[0]
  if (d) {
    const notlar = [...sinyalNot]
    if (d.rolumuz === 'DAVALI') notlar.push('Karşı taraf davası: cevap süresini onaylayın (teyit gerekli).')
    const durum = (DAVA_DEGERLERI as readonly string[]).includes(d.durum) ? (d.durum as DavaEksen) : 'DERDEST'
    // Kesinleşme şerhi yokken "kesinleşti" gösterilmez (06 §2(j)).
    if (durum === 'KESINLESTI' && !(d.kesinlesmeTarihi && d.kesinlesmeBelgeId)) {
      return deger('KARAR', 'TEYITSIZ', 'KURAL', 'DAVA-KESINLESME-SERHSIZ', [d.id], ['Kesinleşme şerhi yok: dava kesinleşmiş gösterilmez.', ...notlar])
    }
    if (durum === 'KARAR' && !d.kararOnayAt) return deger('KARAR', 'TEYITSIZ', 'KURAL', 'DAVA-KARAR-ONAYSIZ', [d.id], ['Karar kartı onay bekliyor.', ...notlar])
    return deger(durum, 'TEYITLI', 'AVUKAT', 'DAVA-KAYIT', [d.id], notlar)
  }
  const eski = g.eskiAsamalar.find((x) => x.tur === 'DAVA' && x.durum !== 'IPTAL')
  if (eski) {
    return deger(eski.durum === 'SONUCLANDI' ? 'KARAR' : 'DERDEST', 'TEYITSIZ', 'ESKI_KAYIT', 'DAVA-ESKI', [eski.id], ['Eski dava kaydı: mahkeme, esas no ve açılış tarihini teyit edin.', ...sinyalNot])
  }
  const davaYolu = g.yolSecimi && (g.yolSecimi.secim === 'GENEL_ALACAK' || g.yolSecimi.secim === 'IIK68_KALDIRMA')
  if (arab.deger === 'SON_TUTANAK_DIGER' || davaYolu) {
    return deger('HAZIRLIK', 'TEYITSIZ', 'KURAL', 'DAVA-HAZIRLIK', arab.deger === 'SON_TUTANAK_DIGER' ? arab.kanitIds : [g.yolSecimi!.id], ['Dava açılışı bekleniyor: ön kontrolü tamamlayın.', ...sinyalNot])
  }
  return deger('YOK', 'TEYITSIZ', 'KURAL', 'DAVA-YOK', sinyaller.map((o) => o.id), sinyalNot)
}

/** Üç ekseni tek seferde türetir. Saf: aynı girdi → aynı çıktı. */
export function eksenTuret(g: EksenGirdi): EksenSonuc {
  const { icra, borclular } = icraTuret(g)
  const arab = arabTuret(g)
  const dava = davaTuret(g, arab)
  return { icra, arab, dava, borclular, surum: EKSEN_KURAL_SURUM }
}

/** Önbellek JSON'u (RucuDosyasi.eksenJson): {icra:{teyit,kaynakTuru,kanitIds,…}, arab, dava, borclular, surum}. */
export function eksenJsonKur(s: EksenSonuc) {
  const parca = <T extends string>(e: EksenDeger<T>) => ({ deger: e.deger, teyit: e.teyit, kaynakTuru: e.kaynak, kanitIds: e.kanitIds, kural: e.kural, notlar: e.notlar })
  return {
    icra: parca(s.icra), arab: parca(s.arab), dava: parca(s.dava),
    borclular: s.borclular.map((b) => ({ borcluId: b.borcluId, ...parca(b) })),
    surum: s.surum,
  }
}
