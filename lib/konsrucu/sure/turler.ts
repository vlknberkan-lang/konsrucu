/**
 * KonsRücü — Süre türleri kataloğu · lib/konsrucu/sure/turler.ts (saf, client-safe)
 *
 * Kaynak: 06 §2(e), §2(i), §3.3 `Sure.tur`, §8.3 (ID-02…ID-04, GN-04). HER TÜR "teyit gerekli"dir:
 * sistem önerilen son günü sayar, onaylanan son günü yalnız avukat girer. Burada yazmayan bir kural
 * uydurulmaz; kuralı belirsiz tür (avans, ara karar, diğer) hâkimin verdiği gün sayısıyla hesaplanır.
 *
 * `eposta = false` olan türler hatırlatma e-postası almaz (Şimdi kartı ve defterde görünmeye devam eder):
 *  - İİK 62: borçlunun itiraz penceresi; Yelda 09.07.2026'da bu görevin e-postasını istemedi (teblig-gorev.ts).
 *  - İİK 78: Yelda 11.07.2026 "mail seli istenmiyor" (takip-gorevi-hatirlatma); eski görev kaydı sürer.
 *  - İYUK zımni ret: bizim işlem süremiz değil, dava süresinin başladığı gündür (ID-03 kartı sorar).
 */

export const SURE_TUR_KODLARI = [
  'IIK62', 'IIK67', 'IIK78',
  'HMK127', 'HMK136', 'HMK281', 'HMK345', 'HMK361', 'HMK150', 'HMK20',
  'AVANS', 'ARA_KARAR',
  'IYUK13_BASVURU', 'IYUK_ZIMNI_RET', 'IYUK7_DAVA',
  'DIGER',
] as const
export type SureTurKodu = (typeof SURE_TUR_KODLARI)[number]

export const TETIK_TURLERI = ['TEBLIG', 'UETS_ULASMA', 'TEFHIM', 'KARAR', 'ELLE'] as const
export type TetikTuru = (typeof TETIK_TURLERI)[number]

export const TETIK_TURU_ETIKET: Record<TetikTuru, string> = {
  TEBLIG: 'Tebliğ',
  UETS_ULASMA: 'UETS ulaşma',
  TEFHIM: 'Tefhim',
  KARAR: 'Karar / kesinleşme',
  ELLE: 'Elle girilen tarih',
}

export type SureKurali =
  | { tip: 'GUN'; gun: number }
  | { tip: 'AY'; ay: number }
  | { tip: 'YIL'; yil: number }
  | { tip: 'HAKIM' } // hâkimin verdiği kesin süre (gün) — avukat girer

export type SureGrubu = 'ICRA' | 'DAVA' | 'IDARI' | 'DIGER'

export type SureTuru = {
  kod: SureTurKodu
  etiket: string // ekranda: "İİK 67"
  ad: string // "İtirazın iptali davası süresi"
  dayanak: string // Sure.dayanak'a yazılır; arayüzde her zaman "teyit gerekli" ile
  kural: SureKurali
  tetik: string // "İtirazın alacaklıya tebliği"
  grup: SureGrubu
  borcluBazinda: boolean
  kritik: boolean // ikinci kişi teyidi önerilir (açık karar 5: alan var, zorunlu değil)
  eposta: boolean
  hakDusurucu: boolean // adli tatil uzatması hiç düşünülmez (06 §2(i))
  not?: string
}

export const TEYIT_GEREKLI = 'teyit gerekli'

const T = (t: SureTuru) => t

export const SURE_TURLERI: Record<SureTurKodu, SureTuru> = {
  IIK62: T({
    kod: 'IIK62', etiket: 'İİK 62', ad: 'Ödeme emrine itiraz süresi (borçlu)', dayanak: 'İİK 62/1',
    kural: { tip: 'GUN', gun: 7 }, tetik: 'Ödeme emrinin borçluya tebliği', grup: 'ICRA',
    borcluBazinda: true, kritik: false, eposta: false, hakDusurucu: false,
    not: 'Borçlunun itiraz penceresidir; kesinleşme hiçbir zaman otomatik yazılmaz.',
  }),
  IIK67: T({
    kod: 'IIK67', etiket: 'İİK 67', ad: 'İtirazın iptali davası süresi', dayanak: 'İİK 67/1',
    kural: { tip: 'YIL', yil: 1 }, tetik: 'İtirazın alacaklıya tebliği', grup: 'ICRA',
    borcluBazinda: true, kritik: true, eposta: true, hakDusurucu: true,
    not: 'Tebliğ tarihi yoksa ihtiyatlı alt sınır: itiraz tarihi + 1 yıl. Durmalı öneri ayrıca tutulur.',
  }),
  IIK78: T({
    kod: 'IIK78', etiket: 'İİK 78', ad: 'Haciz isteme süresi', dayanak: 'İİK 78/2',
    kural: { tip: 'YIL', yil: 1 }, tetik: 'Ödeme emrinin borçluya tebliği', grup: 'ICRA',
    borcluBazinda: true, kritik: false, eposta: false, hakDusurucu: false,
    not: 'İtiraz ve dava süresince işlemeyebilir (İİK 78/2); durma dönemini avukat girer.',
  }),
  HMK127: T({
    kod: 'HMK127', etiket: 'HMK 127', ad: 'Cevap süresi', dayanak: 'HMK 127',
    kural: { tip: 'GUN', gun: 14 }, tetik: 'Dava dilekçesinin davalıya tebliği', grup: 'DAVA',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: false,
  }),
  HMK136: T({
    kod: 'HMK136', etiket: 'HMK 136', ad: 'Cevaba cevap süresi', dayanak: 'HMK 136/1',
    kural: { tip: 'GUN', gun: 14 }, tetik: 'Cevap dilekçesinin tebliği', grup: 'DAVA',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: false,
    not: 'Yalnız yazılı yargılama usulünde; usul seçilmeden öneri yapılmaz.',
  }),
  HMK281: T({
    kod: 'HMK281', etiket: 'HMK 281', ad: 'Bilirkişi raporuna itiraz süresi', dayanak: 'HMK 281/1',
    kural: { tip: 'GUN', gun: 14 }, tetik: 'Bilirkişi raporunun tebliği', grup: 'DAVA',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: false,
  }),
  HMK345: T({
    kod: 'HMK345', etiket: 'HMK 345', ad: 'İstinaf süresi', dayanak: 'HMK 345',
    kural: { tip: 'GUN', gun: 14 }, tetik: 'Kararın tebliği', grup: 'DAVA',
    borcluBazinda: false, kritik: true, eposta: true, hakDusurucu: false,
  }),
  HMK361: T({
    kod: 'HMK361', etiket: 'HMK 361', ad: 'Temyiz süresi', dayanak: 'HMK 361/1',
    kural: { tip: 'GUN', gun: 14 }, tetik: 'Bölge adliye mahkemesi kararının tebliği', grup: 'DAVA',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: false,
  }),
  HMK150: T({
    kod: 'HMK150', etiket: 'HMK 150', ad: 'İşlemden kaldırılan dosyanın yenilenmesi', dayanak: 'HMK 150/5',
    kural: { tip: 'AY', ay: 3 }, tetik: 'Dosyanın işlemden kaldırıldığı gün', grup: 'DAVA',
    borcluBazinda: false, kritik: true, eposta: true, hakDusurucu: false,
    not: 'Süre işlemden kaldırma gününden başlar (tebliğ beklenmez).',
  }),
  HMK20: T({
    kod: 'HMK20', etiket: 'HMK 20', ad: 'Görevsizlik / yetkisizlik sonrası gönderme talebi', dayanak: 'HMK 20/1',
    kural: { tip: 'GUN', gun: 14 }, tetik: 'Görevsizlik ya da yetkisizlik kararının kesinleşmesi', grup: 'DAVA',
    borcluBazinda: false, kritik: true, eposta: true, hakDusurucu: false,
  }),
  AVANS: T({
    kod: 'AVANS', etiket: 'Gider avansı', ad: 'Gider avansı kesin süresi', dayanak: 'HMK 120 · HMK 324',
    kural: { tip: 'HAKIM' }, tetik: 'Ara kararın tebliği ya da tefhimi', grup: 'DAVA',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: false,
    not: 'Süreyi mahkeme verir; gün sayısını ara karardan girin. Kesin süre ihtarını avukat işaretler.',
  }),
  ARA_KARAR: T({
    kod: 'ARA_KARAR', etiket: 'Ara karar', ad: 'Ara kararla verilen kesin süre', dayanak: 'HMK 94',
    kural: { tip: 'HAKIM' }, tetik: 'Ara kararın tebliği ya da tefhimi', grup: 'DAVA',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: false,
    not: 'Günü kod sayar; "kesin süre ihtarı var mı" işaretini avukat verir.',
  }),
  IYUK13_BASVURU: T({
    kod: 'IYUK13_BASVURU', etiket: 'İYUK 13', ad: 'İdareye başvuru süresi', dayanak: 'İYUK 13/1',
    kural: { tip: 'YIL', yil: 1 }, tetik: 'Eylemin öğrenildiği gün (her hâlde eylemden 5 yıl)', grup: 'IDARI',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: true,
    not: 'Öğrenme tarihi yoksa ihtiyatlı: eylem tarihi + 1 yıl.',
  }),
  IYUK_ZIMNI_RET: T({
    kod: 'IYUK_ZIMNI_RET', etiket: 'Zımni ret', ad: 'İdarenin cevap vermemesi (zımni ret)', dayanak: 'İYUK 13/1',
    kural: { tip: 'GUN', gun: 30 }, tetik: 'İdareye başvuru', grup: 'IDARI',
    borcluBazinda: false, kritik: false, eposta: false, hakDusurucu: false,
    not: 'Bu gün dava süresinin başladığı gündür; dava süresini ayrıca onaylayın (İYUK 7).',
  }),
  IYUK7_DAVA: T({
    kod: 'IYUK7_DAVA', etiket: 'İYUK 7', ad: 'İdari dava açma süresi', dayanak: 'İYUK 7/1',
    kural: { tip: 'GUN', gun: 60 }, tetik: 'Ret cevabının tebliği ya da zımni ret günü', grup: 'IDARI',
    borcluBazinda: false, kritik: true, eposta: true, hakDusurucu: true,
  }),
  DIGER: T({
    kod: 'DIGER', etiket: 'Diğer', ad: 'Diğer süre', dayanak: 'Avukatın belirttiği dayanak',
    kural: { tip: 'HAKIM' }, tetik: 'Avukatın girdiği tetik', grup: 'DIGER',
    borcluBazinda: false, kritik: false, eposta: true, hakDusurucu: false,
    not: 'Gün sayısını ve dayanağı avukat girer.',
  }),
}

export function sureTuruMu(kod: string): kod is SureTurKodu {
  return (SURE_TUR_KODLARI as readonly string[]).includes(kod)
}

/** Katalogda olmayan (B2'de büyüyen) tür kodu da güvenle gösterilsin. */
export function sureTuru(kod: string): SureTuru {
  if (sureTuruMu(kod)) return SURE_TURLERI[kod]
  return { ...SURE_TURLERI.DIGER, kod: 'DIGER', etiket: kod, ad: kod }
}

export const GRUP_ETIKET: Record<SureGrubu, string> = {
  ICRA: 'İcra takibi',
  DAVA: 'Dava',
  IDARI: 'İdari yol',
  DIGER: 'Diğer',
}

/** Açık sayılan (hatırlatma alan, Şimdi kartına çıkabilen) durumlar. */
export const ACIK_DURUMLAR = ['ACIK', 'KAPANMAYA_HAZIR'] as const
export const SURE_DURUMLARI = ['TETIK_BEKLIYOR', 'ACIK', 'KAPANMAYA_HAZIR', 'KAPANDI', 'IPTAL'] as const
export type SureDurumKodu = (typeof SURE_DURUMLARI)[number]
