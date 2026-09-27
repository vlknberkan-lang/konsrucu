/**
 * KonsRücü — Dilekçe iskeleti (aşama 2, seçim) · lib/konsrucu/dilekce-v2/iskelet.ts (saf; client-safe)
 *
 * S36 (06 §7.1 "İskelet", §7.3 Aşama 2): "Tür × usul × mahkeme × rücu ailesi için bölüm sırası, sabit
 * bloklar, koşullu bloklar … Olgu içeren her cümlede yer tutucu vardır, sabit olgu yoktur." İskelet
 * MÜVEKKİL (tenant) BAZINDADIR ve avukat onaylıdır: "Ray'den çıkarılan bir iskelet Zurich'te ancak
 * 'kopyala ve Zurich için onayla' adımıyla kullanılır" (06 §7.1).
 *
 * Bu modül DB'ye erişmez. Tenant ayrımı, çağıranın (server action) `DilekceSablon` sorgusunu zaten
 * `musteriId`ye göre filtrelemesinden gelir (M7) — bu dosya yalnız kendisine verilen adaylar arasından
 * seçer; başka müvekkilin kaydını asla görmez. Onaylı (aktif + onayAt dolu) şablon yoksa VARSAYILAN
 * iskelete düşülür: iskelet de AI'a bağlı değildir, "AI kullanılamıyorsa deterministik iskelet yine
 * üretilir" ilkesi burada da geçerlidir (06 §7.3).
 */
import { bloklaraBol, sablonAyristir, type SablonBlogu } from './sablon-dil'
import { KART_TURLERI, type KartTuru } from './tipler'

// ───────────────────────── türler ─────────────────────────

/** DilekceSablon.varyantJson biçimi (06 §7.1: "tür × usul × mahkeme × rücu ailesi"). Alan boşsa/undefinedse
 *  o şablon bu eksende GENELdir (her değere uyar); dolu alan yalnız aynı değeri isteyen dosyaya uyar. */
export type VaryantAnahtari = {
  rucuSebebiKod?: string | null
  mahkemeTuru?: string | null
  usul?: string | null
  davaliTur?: string | null
}

const VARYANT_ALANLARI = ['rucuSebebiKod', 'mahkemeTuru', 'usul', 'davaliTur'] as const

/** `DilekceSablon` satırının iskelet seçimi için gereken alanları (sunucu tipi burada tekrar edilmez). */
export type SablonKaydi = {
  id: string
  tur: string
  kod: string
  surum: number
  varyantJson: unknown
  /** Şablon kaynağı `{{...}}` dilinde düz metindir; `bloklarJson` bu metni `{ kaynak }` biçiminde taşır. */
  bloklarJson: unknown
  aktif: boolean
  onayAt: string | Date | null
}

export type IskeletKaynagi = 'ONAYLI_SABLON' | 'VARSAYILAN'

export type IskeletSecimi = {
  kaynak: IskeletKaynagi
  sablonId: string | null
  kod: string
  surum: number
  bloklar: SablonBlogu[]
}

// ───────────────────────── yardımcılar ─────────────────────────

function varyantOku(v: unknown): VaryantAnahtari {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const o = v as Record<string, unknown>
  const s = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : null)
  return { rucuSebebiKod: s(o.rucuSebebiKod), mahkemeTuru: s(o.mahkemeTuru), usul: s(o.usul), davaliTur: s(o.davaliTur) }
}

/** `bloklarJson` → şablon kaynak metni (`{{...}}` dili). Biçim bozuksa null; çağıran o adayı eler. */
export function sablonKaynagi(bloklarJson: unknown): string | null {
  if (!bloklarJson || typeof bloklarJson !== 'object' || Array.isArray(bloklarJson)) return null
  const k = (bloklarJson as Record<string, unknown>).kaynak
  return typeof k === 'string' && k.trim() ? k : null
}

/** Yazma tarafı: onay ekranının kaydettiği JSON biçimi (tek yerde, sürüklenmesin). */
export const sablonKaynagiYaz = (kaynakMetni: string): { kaynak: string } => ({ kaynak: kaynakMetni })

/**
 * Aday şablon ile istenen varyant arasındaki uyum puanı. Adayın boş bıraktığı eksen "genel"dir (uyar,
 * puan almaz); adayın belirttiği eksen istenenle FARKLI ya da istenende yoksa aday tamamen elenir (null) —
 * yanlış varyantı "yakın" diye seçmek yerine güvenli tarafta kal (VARSAYILAN'a düş).
 */
function uyumPuani(aday: VaryantAnahtari, istenen: VaryantAnahtari): number | null {
  let puan = 0
  for (const alan of VARYANT_ALANLARI) {
    const a = aday[alan]
    if (a == null) continue
    if (istenen[alan] == null || istenen[alan] !== a) return null
    puan++
  }
  return puan
}

// ───────────────────────── varsayılan iskeletler ─────────────────────────

/**
 * Kod içinde yazılı, hiçbir onaya bağlı olmayan güvenli taban: hiç `DilekceSablon` onaylanmamış bir
 * müvekkilde bile aşama 2 çalışır. Olgu içeren tek bölüm AÇIKLAMALAR'dır ve yapay zekâ yuvasıdır; geri
 * kalan her şey koddan gelen alanlar ya da sabit metindir (B06: sabit olgu yok).
 */
const VARSAYILAN_KAYNAK: Record<KartTuru, string> = {
  DAVA: `{{! [B01 BASLIK] SABİT }}
{{mahkeme_adi|buyuk}}

{{! [B02 TARAFLAR] SABİT }}
DAVACI\t: {{davaci_unvan}}
{{#davaci_adres}}ADRES\t: {{davaci_adres}}
{{/davaci_adres}}
VEKİLİ\t: {{vekil_ad_soyad}}
{{#vekil_uets}}(UETS No\t: {{vekil_uets}})
{{/vekil_uets}}
{{#davalilar}}DAVALI {{n}}\t: {{ad}}
{{/davalilar}}
{{#esas_no}}ESAS NO\t: {{esas_no}}
{{/esas_no}}

{{! [B03 KONU] SABİT }}
KONU\t: {{icra_dairesi|buyuk_ilk}}{{#icra_esas}} {{icra_esas}} sayılı{{/icra_esas}} icra takibine vaki itirazın iptali ile takibin devamı talebimizden ibarettir.

{{! [B04 DEGER] SABİT }}
DAVA DEĞERİ\t: {{dava_degeri|para}} TL{{#dava_degeri_aciklama}} ({{dava_degeri_aciklama}}){{/dava_degeri_aciklama}}

{{! [B05 ACIKLAMALAR] ÖZGÜ }}
AÇIKLAMALAR

{{AI: Dosya kartındaki olgulara dayanarak olayın gelişimini, ödemeyi, halefiyeti ve borçlunun itirazını kısa numaralı paragraflarla anlat. Her olgu cümlesinin sonuna, o cümleyi hangi olgu(lar) desteklediyse onların kimliğini [O-n] biçiminde ekle. Kartta karşılığı olmayan hiçbir tarih, tutar, isim, plaka ya da olay yazma.}}

{{! [B06 HUKUKI_SEBEPLER] SABİT }}
HUKUKİ NEDENLER
{{#hukuki_sebepler}}{{n}}. {{kunye}}
{{/hukuki_sebepler}}
{{^hukuki_sebepler}}İlgili mevzuat ve Yargıtay içtihatları.
{{/hukuki_sebepler}}

{{! [B07 DELILLER] SABİT }}
HUKUKİ DELİLLER
{{#ekler}}{{n}}. {{ad}}
{{/ekler}}{{n}}. Her türlü yasal delil.

{{! [B08 SONUC] SABİT }}
SONUÇ VE İSTEM\t: Yukarıda arz ve izah edilen ve resen gözetilecek nedenlerle;
{{#talepler}}{{n}}. {{metin}},
{{/talepler}}{{n}}. Yargılama giderleri ve vekâlet ücretinin davalı taraf üzerinde bırakılmasına karar verilmesini vekaleten arz ve talep ederiz. {{tarih|tarih}}

{{! [B09 IMZA] SABİT }}
{{vekil_ad_soyad}}
Davacı Vekili`,

  DELIL: `{{! [B01 BASLIK] SABİT }}
{{mahkeme_adi|buyuk}}
{{#esas_no}}ESAS NO\t: {{esas_no}}
{{/esas_no}}

{{! [B02 TARAFLAR] SABİT }}
DAVACI\t: {{davaci_unvan}}
VEKİLİ\t: {{vekil_ad_soyad}}
{{#davalilar}}DAVALI {{n}}\t: {{ad}}
{{/davalilar}}

{{! [B03 KONU] SABİT }}
KONU\t: Delil ve tanık listemizin sunulmasından ibarettir.

{{! [B04 ACIKLAMALAR] ÖZGÜ }}
AÇIKLAMALAR

{{AI: Dosya kartındaki olgulara dayanarak hangi vakıanın hangi delille kanıtlandığını kısa numaralı paragraflarla anlat; her cümlenin sonuna [O-n] kaynağını ekle. Kartta karşılığı olmayan hiçbir olgu yazma.}}

{{! [B05 DELILLER] SABİT }}
DELİLLERİMİZ
{{#ekler}}{{n}}. {{ad}}
{{/ekler}}{{n}}. Tanık beyanı, bilirkişi incelemesi ve her türlü yasal delil.

{{! [B06 SONUC] SABİT }}
SONUÇ VE İSTEM\t: Yukarıda belirtilen delillerin dosyaya kabulüne karar verilmesini vekaleten arz ve talep ederiz. {{tarih|tarih}}

{{! [B07 IMZA] SABİT }}
{{vekil_ad_soyad}}
Davacı Vekili`,

  CEVABA_CEVAP: `{{! [B01 BASLIK] SABİT }}
{{mahkeme_adi|buyuk}}
{{#esas_no}}ESAS NO\t: {{esas_no}}
{{/esas_no}}

{{! [B02 TARAFLAR] SABİT }}
DAVACI\t: {{davaci_unvan}}
VEKİLİ\t: {{vekil_ad_soyad}}
{{#davalilar}}DAVALI {{n}}\t: {{ad}}
{{/davalilar}}

{{! [B03 KONU] SABİT }}
KONU\t: Davalı tarafın cevap dilekçesine karşı beyanlarımızdan ibarettir.

{{! [B04 ACIKLAMALAR] ÖZGÜ }}
AÇIKLAMALAR

{{AI: Karşı tarafın cevap dilekçesindeki savunma matrisinde "cevaplanacak" işaretli her savunmayı kısaca özetleyip, yalnız dosya kartındaki olgulara dayanarak karşılık ver; her cümlenin sonuna [O-n] kaynağını ekle. Kartta karşılığı olmayan hiçbir olgu yazma.}}

{{! [B05 SONUC] SABİT }}
SONUÇ VE İSTEM\t: Yukarıda arz ve izah edilen nedenlerle davamızın kabulüne karar verilmesini vekaleten arz ve talep ederiz. {{tarih|tarih}}

{{! [B06 IMZA] SABİT }}
{{vekil_ad_soyad}}
Davacı Vekili`,

  BEYAN: `{{! [B01 BASLIK] SABİT }}
{{mahkeme_adi|buyuk}}
{{#esas_no}}ESAS NO\t: {{esas_no}}
{{/esas_no}}

{{! [B02 TARAFLAR] SABİT }}
DAVACI\t: {{davaci_unvan}}
VEKİLİ\t: {{vekil_ad_soyad}}
{{#davalilar}}DAVALI {{n}}\t: {{ad}}
{{/davalilar}}

{{! [B03 KONU] SABİT }}
KONU\t: {{#hedef_belge}}{{hedef_belge}} karşı beyanlarımızın{{/hedef_belge}}{{^hedef_belge}}Beyanlarımızın{{/hedef_belge}} sunulmasından ibarettir.

{{! [B04 ACIKLAMALAR] ÖZGÜ }}
AÇIKLAMALAR

{{AI: Dosya kartındaki olgulara dayanarak hedef belgeyle (bilirkişi raporu ya da ara karar) kart arasındaki farkı ve büronun buna karşı beyanını kısa numaralı paragraflarla anlat; her cümlenin sonuna [O-n] kaynağını ekle. Kartta karşılığı olmayan hiçbir olgu yazma.}}

{{! [B05 SONUC] SABİT }}
SONUÇ VE İSTEM\t: Yukarıda arz edilen beyanlarımızın dikkate alınmasını vekaleten arz ve talep ederiz. {{tarih|tarih}}

{{! [B06 IMZA] SABİT }}
{{vekil_ad_soyad}}
Davacı Vekili`,
}

/** Bozuk şablon dilinde bile geçmeyecek şekilde önceden ayrıştırılmış varsayılan bloklar (modül yüklenirken bir kez). */
const VARSAYILAN_BLOKLAR: Record<KartTuru, SablonBlogu[]> = Object.fromEntries(
  KART_TURLERI.map((t) => [t, bloklaraBol(sablonAyristir(VARSAYILAN_KAYNAK[t]))]),
) as Record<KartTuru, SablonBlogu[]>

// ───────────────────────── seçim ─────────────────────────

/**
 * Onaylı (aktif + onayAt dolu) şablolar arasından türe ve varyanta en uygun olanı seçer: en yüksek uyum
 * puanı, eşitlikte en yeni sürüm. Hiçbiri yoksa, hiçbiri bu türde değilse ya da kaynağı ayrıştırılamıyorsa
 * (bozuk şablon canlıyı kilitlemesin) VARSAYILAN iskelete güvenle düşer.
 */
export function iskeletSec(sablonlar: readonly SablonKaydi[], tur: KartTuru, istenen: VaryantAnahtari = {}): IskeletSecimi {
  const adaylar = sablonlar
    .filter((s) => s.tur === tur && s.aktif && !!s.onayAt)
    .map((s) => ({ s, puan: uyumPuani(varyantOku(s.varyantJson), istenen), kaynak: sablonKaynagi(s.bloklarJson) }))
    .filter((x): x is { s: SablonKaydi; puan: number; kaynak: string } => x.puan != null && !!x.kaynak)
    .sort((a, b) => b.puan - a.puan || b.s.surum - a.s.surum || b.s.id.localeCompare(a.s.id))

  for (const aday of adaylar) {
    try {
      return { kaynak: 'ONAYLI_SABLON', sablonId: aday.s.id, kod: aday.s.kod, surum: aday.s.surum, bloklar: bloklaraBol(sablonAyristir(aday.kaynak)) }
    } catch {
      // Bozuk şablon: bir sonraki adaya (yoksa VARSAYILAN'a) düş, canlıyı durdurma.
    }
  }
  return { kaynak: 'VARSAYILAN', sablonId: null, kod: `varsayilan-${tur.toLowerCase()}`, surum: 0, bloklar: VARSAYILAN_BLOKLAR[tur] }
}
