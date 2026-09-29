/**
 * KonsRücü — Hugo ve AI sonuçlarını öneriye çevirme · lib/konsrucu/oneri/kaynaklar.ts  (saf; client-safe)
 *
 * S18/S19. Kolonlara doğrudan yazmak yerine bu kaynakların her değeri `AlanDegeri` önerisi olur:
 *   - Hugo satırı (06 §2(a) adım 6): "Rücu Nedeni" → rücu sebebi kodu önerisi (S19), rücu tutarı ve hasar tarihi
 *     (kaza tarihiyle karşılaştırma; bin kat kontrolü). Hugo kolonları içe aktarımda eskisi gibi yazılır; buradaki
 *     öneriler KARŞILAŞTIRMA içindir. Ham hücre metni alıntı olarak saklanır (belge sayfasında aranmaz).
 *   - AI çıkarımı (açık karar 1a olumluysa): analizEt çıktısı öneri modunda. Yetkili icra AI'dan ASLA alınmaz.
 * Bu modül yalnız öneri listesi üretir; yazma servis.ts · onerileriKaydet ile olur (kilit ve tekrar kuralları orada).
 */
import { hugoRucuNedeniEsle } from '@/lib/konsrucu/rucu-sebebi'
import { odemeAlanAnahtari, paraNormal, tarihNormal } from './alanlar'
import type { KaynakTuru } from './alanlar'
import type { YeniOneri } from './tipler'

export const HUGO_URETICI_SURUM = 1

export type HugoDosyaGirdisi = {
  rucuSebebi?: string | null
  brans?: string | null
  rucuTutari?: unknown
  hasarTarihi?: Date | string | null
  /** RucuDosyasi.kaynakJson (içe aktarımda Hugo/Zurich satırının `kaynak` nesnesi). */
  kaynakJson?: unknown
}

const objeMi = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Dosya Hugo ya da Zurich listesinden mi geldi? Değilse null. */
export function listeKaynagi(kaynakJson: unknown): 'hugo' | 'zurich' | null {
  if (!objeMi(kaynakJson)) return null
  return kaynakJson.kaynak === 'hugo' || kaynakJson.kaynak === 'zurich' ? kaynakJson.kaynak : null
}

/**
 * Oto dışı (OTO_DISI) dosyalarda tek başına "Rücu Nedeni" hücresi (ör. "Diğer Nedenler") yetersiz kalabilir;
 * Zurich'in "Rücu Nedeni Detay" hücresi `kaynakJson.aciklama`'ya yazılır (bkz. lib/import/hugo.ts). Eşleştiriciye
 * (`hugoRucuNedeniEsle`) geçirilecek metni bu ikisini birleştirerek kurar. ZMSS/kasko dosyalarında dokunmaz —
 * o davranış "Rücu Nedeni" hücresiyle byte-for-byte aynı kalır.
 */
export function hugoMetniGenislet(rucuSebebi: string | null | undefined, brans: string | null | undefined, kaynakJson: unknown): string | null {
  if (brans !== 'OTO_DISI') return rucuSebebi ?? null
  const ana = String(rucuSebebi ?? '').trim()
  const aciklama = objeMi(kaynakJson) && typeof kaynakJson.aciklama === 'string' ? kaynakJson.aciklama.trim() : ''
  if (!aciklama || ana.includes(aciklama)) return rucuSebebi ?? null
  return ana ? `${ana} ${aciklama}` : aciklama
}

const hamHucre = (kaynakJson: unknown, ...basliklar: string[]): string | null => {
  if (!objeMi(kaynakJson) || !objeMi(kaynakJson.ham)) return null
  const ham = kaynakJson.ham as Record<string, unknown>
  for (const b of basliklar) {
    const k = Object.keys(ham).find((x) => x.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() === b)
    if (k && ham[k] != null && String(ham[k]).trim()) return `${k}: ${String(ham[k]).trim()}`.slice(0, 300)
  }
  return null
}

/**
 * Hugo/Zurich satırından karşılaştırma önerileri. Yalnız listeden gelen dosyada üretilir: elle girilmiş `rucuSebebi`
 * "Hugo" kaynağı sayılmaz (onun kod adayları seçim bileşeninde ayrıca gösterilir).
 */
export function hugoOnerileri(d: HugoDosyaGirdisi): YeniOneri[] {
  const liste = listeKaynagi(d.kaynakJson)
  if (!liste) return []
  const kaynakTuru: KaynakTuru = liste === 'zurich' ? 'EXCEL' : 'HUGO'
  const onek = liste === 'zurich' ? 'ZURICH' : 'HUGO'
  const out: YeniOneri[] = []

  const esle = hugoRucuNedeniEsle(hugoMetniGenislet(d.rucuSebebi, d.brans, d.kaynakJson), d.brans)
  if (esle.kod) {
    out.push({
      alan: 'rucuSebebiKod', deger: esle.kod, kaynakTuru, guven: esle.guven,
      alinti: hamHucre(d.kaynakJson, 'rücu nedeni', 'rücu sebebi') ?? (d.rucuSebebi ? `Rücu Nedeni: ${d.rucuSebebi}`.slice(0, 300) : null),
      uretici: `${onek}:RUCU_NEDENI@${HUGO_URETICI_SURUM}`,
    })
  }
  const tutar = paraNormal(d.rucuTutari)
  if (tutar != null) {
    out.push({
      alan: 'rucuTutari', deger: tutar, kaynakTuru, guven: 0.7,
      alinti: hamHucre(d.kaynakJson, 'rücu tutarı', 'bakiye rücu tutarı'),
      uretici: `${onek}:RUCU_TUTARI@${HUGO_URETICI_SURUM}`,
    })
  }
  const tarih = tarihNormal(d.hasarTarihi)
  if (tarih) {
    out.push({
      alan: 'kazaTarihi', deger: tarih, kaynakTuru, guven: 0.6,
      alinti: hamHucre(d.kaynakJson, 'hasar tarihi'),
      uretici: `${onek}:HASAR_TARIHI@${HUGO_URETICI_SURUM}`,
    })
  }
  if (liste === 'zurich' && objeMi(d.kaynakJson) && typeof d.kaynakJson.policeNo === 'string' && d.kaynakJson.policeNo.trim()) {
    out.push({ alan: 'policeNo', deger: d.kaynakJson.policeNo.trim(), kaynakTuru, guven: 0.8, uretici: `${onek}:POLICE_NO@${HUGO_URETICI_SURUM}` })
  }
  return out
}

/** analizEt (lib/konsrucu/analiz.ts · AnalizSonuc) çıktısının öneriye giren kısmı. */
export type AiAnalizGirdisi = {
  brans?: string | null
  sigortaliPlaka?: string | null
  karsiPlaka?: string | null
  kazaYeri?: string | null
  asilAlacak?: number | null
  rucuTutari?: number | null
  rucuOrani?: string | null
  dekontlar?: { tarih?: string | null; tutar?: number | null; ekspertizMi?: boolean | null }[] | null
  /** S18 çıktı şeması gelince: alan başına belge, sayfa, alıntı. */
  kaynaklar?: Record<string, { belgeId?: string | null; sayfa?: number | null; alinti?: string | null; guven?: number | null }> | null
}

/**
 * Rücu oranını TUTARLARDAN türet (%1–%100): model "yaya → %100" deyip tutarı yarım verebiliyor, tutar esas alınır.
 * Tutarlardan çıkmazsa modelin oranı olduğu gibi kalır.
 */
export function rucuOraniTuret(asilAlacak: unknown, rucuTutari: unknown, modelOrani?: string | null): string | null {
  const aa = paraNormal(asilAlacak), rt = paraNormal(rucuTutari)
  if (aa != null && rt != null && aa > 0) {
    const oran = Math.round((rt / aa) * 100)
    if (oran > 0 && oran <= 100) return `%${oran}`
  }
  return modelOrani?.trim() || null
}

/** analizEt çıktısının kartta onaylanmayan kısmı (lib/konsrucu/analiz.ts · AnalizSonuc). */
export type AiDigerGirdisi = {
  yol?: string | null
  sigortaliUnvan?: string | null
  sigortaliTelefon?: string | null
  il?: string | null
  olusSekli?: string | null
  kusurDurumu?: string | null
  muhatapOzet?: string | null
  aciklama?: string | null
}
export type AiDigerAlan = 'yol' | 'sigortaliUnvan' | 'sigortaliTelefon' | 'il' | 'olusSekli' | 'kusurDurumu' | 'muhatapOzet' | 'aciklama'

const YOL_DB: Record<string, string> = { klasik: 'KLASIK', idari: 'IDARI', belirsiz: 'BELIRSIZ' }

/**
 * Kartta öneri olmayan AI alanları (takip açıklaması, oluş şekli, kusur, sigortalı, il, triyaj yolu). Bunlar eski
 * çıkarım gibi birleştiriciden geçer: yalnız BOŞ kolona yazılır (lib/konsrucu/cikarim-birlestir). Kart alanları
 * (branş, plakalar, kaza yeri, tutarlar, oran) burada YOKTUR — onlar aiOnerileri ile öneri olur; yetkili icra hiç alınmaz.
 */
export function aiDigerAlanlari(a: AiDigerGirdisi): Partial<Record<AiDigerAlan, string>> {
  const out: Partial<Record<AiDigerAlan, string>> = {}
  const yol = a.yol ? YOL_DB[a.yol] : undefined
  if (yol) out.yol = yol
  for (const k of ['sigortaliUnvan', 'sigortaliTelefon', 'il', 'olusSekli', 'kusurDurumu', 'muhatapOzet', 'aciklama'] as const) {
    const v = a[k]?.trim()
    if (v) out[k] = v
  }
  return out
}

/**
 * AI sonucunu öneri modunda listeye çevirir (kolona yazmaz). `yetkiliIcra` bilinçli olarak alınmaz.
 * Ekspertiz dekontları ödeme önerisi olmaz (hesap dışı; faiz başlangıcına girmez).
 */
export function aiOnerileri(a: AiAnalizGirdisi, uretici = 'AI:analizEt'): YeniOneri[] {
  const out: YeniOneri[] = []
  const k = a.kaynaklar ?? {}
  const ekle = (alan: string, deger: unknown, kaynakAnahtari = alan) => {
    if (deger == null || deger === '') return
    const ks = k[kaynakAnahtari] ?? {}
    out.push({ alan, deger, kaynakTuru: 'AI', kaynakBelgeId: ks.belgeId ?? null, sayfa: ks.sayfa ?? null, alinti: ks.alinti ?? null, guven: ks.guven ?? null, uretici })
  }
  ekle('brans', a.brans)
  ekle('sigortaliPlaka', a.sigortaliPlaka)
  ekle('karsiPlaka', a.karsiPlaka)
  ekle('kazaYeri', a.kazaYeri)
  ekle('asilAlacak', a.asilAlacak)
  ekle('rucuTutari', a.rucuTutari)
  ekle('rucuOrani', a.rucuOrani)
  ;(a.dekontlar ?? []).forEach((d, i) => {
    if (d.ekspertizMi) return
    const tutar = paraNormal(d.tutar)
    if (tutar == null) return
    const tarih = tarihNormal(d.tarih)
    ekle(odemeAlanAnahtari({ tarih, tutar }), { tarih, tutar }, `dekontlar[${i}]`)
  })
  return out
}
