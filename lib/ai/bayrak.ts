/**
 * KonsRücü — Yapay zekâ bayrakları ve yüzey kapısı · lib/ai/bayrak.ts (saf; sunucu)
 *
 * S02 (F19; B14): kişisel veriyi maskesiz gönderen AI yüzeyleri canlıda KAPALI. S09: yüzeyler maskeli
 * sarmalayıcıdan (lib/ai/cagri.ts) geçer ve canlıda ancak yüzey bayrağıyla, tek tek açılır (açık karar 1a).
 * Bütün kararlar burada; ortam değişkeni adları tek yerde.
 *
 *   AI_ORTAM=staging          → kurgusal veri ortamı: bütün (maskeli) yüzeyler ve maskesiz çağrı açık.
 *                               (Staging şu an yok; yerel geliştirmede kurgusal veriyle kullanılır.)
 *   AI_MASKESIZ=acik          → sarmalayıcı işareti taşımayan (maskesiz) çağrıya izin. Varsayılan: kapalı.
 *   AI_YUZEY_<YÜZEY>=acik     → maskeli yüzey canlıda açılır (ör. AI_YUZEY_SORU=acik). Varsayılan: kapalı
 *                               (açık karar 1a bekleniyor).
 *   AI_GORSEL=acik            → görsel AI (görüntü/PDF bloğu). Varsayılan: kapalı (açık karar 1c).
 *                               Açık olsa bile sağlık ve kimlik görselleri gitmez (lib/ai/gorsel-aday.ts).
 *   ESKI_DILEKCE_HATTI=acik   → eski "Dilekçe üret" hattı (F5). Varsayılan: kapalı.
 *   AI_DURDUR=1               → acil fren (lib/konsrucu/ai-kredi.ts; bütün çağrılar).
 */

/** Sekiz AI yüzeyi (06, 5.6 tablosu). `dilekce_eski` eski dilekçe hattıdır; kapalı kalır. */
export const AI_YUZEYLERI = [
  { yuzey: 'cikarim', ad: 'Dosya AI çıkarımı', kod: 'lib/konsrucu/analiz.ts · analizEt' },
  { yuzey: 'foto', ad: 'Hasar fotoğrafı seçimi', kod: 'lib/konsrucu/analiz.ts · enIyiHasarFotolari' },
  { yuzey: 'dilekce_eski', ad: 'Eski dilekçe anlatımı', kod: 'lib/konsrucu/dilekce-ai.ts · dilekceAnlatim' },
  { yuzey: 'soru', ad: 'Dosyaya Sor', kod: 'lib/konsrucu/dosya-sor.ts · dosyaSor' },
  { yuzey: 'yol', ad: 'Yol Göster', kod: 'lib/konsrucu/dosya-sor.ts · dosyaYolGoster' },
  { yuzey: 'emsal', ad: 'Yargıtay emsal arama', kod: 'lib/konsrucu/emsal-ara.ts · dosyadanEmsal' },
  { yuzey: 'makbuz', ad: 'Makbuz okuma (AI yedeği)', kod: 'lib/konsrucu/masraf-cikar.ts · makbuzCikarDetay' },
  { yuzey: 'dilekce', ad: 'Dilekçe masası', kod: 'app/(app)/dilekceler/actions.ts · davaTaslagiUret' },
] as const
export type AiYuzey = typeof AI_YUZEYLERI[number]['yuzey']

export const KVKK_KAPALI_MESAJI = 'Bu yapay zekâ özelliği KVKK düzenlemesi tamamlanana kadar kapalı.'
export const GORSEL_KAPALI_MESAJI = 'Görsel yapay zekâ KVKK kararına kadar kapalı; görüntü ve PDF yapay zekâya gönderilmez.'

/** Canlıda kapalı yüzeye/maskesiz çağrıya gelen istek. AiKullanim'a satır yazılmaz, kredi düşmez. */
export class AiKvkkKapaliHata extends Error {
  readonly yuzey: string
  constructor(yuzey: string, mesaj = KVKK_KAPALI_MESAJI) {
    super(mesaj)
    this.name = 'AiKvkkKapaliHata'
    this.yuzey = yuzey
  }
}

const acik = (ad: string) => (process.env[ad] ?? '').trim().toLowerCase() === 'acik'

/** 'staging' yalnız açıkça yazılırsa; başka her değer (boş dahil) canlı sayılır (güvenli taraf). */
export function aiOrtami(): 'staging' | 'canli' {
  return (process.env.AI_ORTAM ?? '').trim().toLowerCase() === 'staging' ? 'staging' : 'canli'
}

export const yuzeyBayragi = (yuzey: string) => `AI_YUZEY_${yuzey.toUpperCase()}`

/** Maskeli yüzey açık mı? Staging'de hepsi açık; canlıda yalnız AI_YUZEY_<YÜZEY>=acik ise. */
export function yuzeyAcik(yuzey: string): boolean {
  if (yuzey === 'dilekce_eski' && !eskiDilekceHattiAcik()) return false // hat kapalıyken yüzey de kapalı
  return aiOrtami() === 'staging' || acik(yuzeyBayragi(yuzey))
}

/** Sarmalayıcı işareti taşımayan (maskesiz) çağrıya izin var mı? */
export function maskesizAcik(): boolean {
  return aiOrtami() === 'staging' || acik('AI_MASKESIZ')
}

/** Görsel AI (görüntü/PDF bloğu) açık mı? Yalnız AI_GORSEL=acik ise (staging'de de kapalı). */
export function gorselAiAcik(): boolean {
  return acik('AI_GORSEL')
}

/** Eski "Dilekçe üret" hattı (F5) — yalnız bilinçli geri açma için. */
export function eskiDilekceHattiAcik(): boolean {
  return acik('ESKI_DILEKCE_HATTI')
}

/** Yüzeylerin anlık durumu (yönetim sayfası ve günlük için; değer içermez). */
export function yuzeyDurumlari(): { yuzey: AiYuzey; ad: string; acik: boolean; bayrak: string }[] {
  return AI_YUZEYLERI.map((y) => ({ yuzey: y.yuzey, ad: y.ad, acik: yuzeyAcik(y.yuzey), bayrak: yuzeyBayragi(y.yuzey) }))
}
