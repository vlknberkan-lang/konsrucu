/**
 * KonsRücü — Yeniden çıkarım birleştirici · lib/konsrucu/cikarim-birlestir.ts  (saf; DB/Prisma yok, client-safe)
 *
 * Sorun (F13; B36, B37): "AI ile yeniden çıkar" dolu alanları AI değeriyle eziyordu (avukatın düzelttiği asıl
 * alacak dahil), teyitsiz borçluları silip yeniden yazıyordu (elle eklenenler de gidiyordu), cikarimJson'u baştan
 * yazdığı için tevzi kaydını ve dayanak fotoğraf seçimini siliyordu; AI'ın bulduğu dekontlar onaysız Odeme olup
 * faiz başlangıcını değiştiriyordu.
 *
 * Erken yama kuralı (S07; kalıcı çözüm S18'deki alan kilidi):
 *   - Yalnız BOŞ alan yazılır. Dolu alanda farklı değer → öneri {alan, mevcut, önerilen, zaman}; aynı değer → işlem yok.
 *   - cikarimJson BİRLEŞTİRİLİR: tevzi, dayanakFotoIds, onay, alanlar ve bilinmeyen anahtarlar korunur; yalnız AI'ın
 *     kendi analiz anahtarları (olayTuru, olayBaglami, sonrakiAdimlar, teyit, llm) tazelenir. UYAP takip açıklaması
 *     (aciklama) avukatça düzenlenebildiği için ALAN gibi davranır (doluysa korunur, farklıysa öneri).
 *   - Borçlu SİLİNMEZ. Mevcut herhangi bir borçluyla (TCKN/VKN ya da normalize ad) eşleşmeyen AI borçlusu eklenir;
 *     teyit kararını çağıran verir (yeniden çıkarımda hep teyitsiz).
 *   - AI dekontları Odeme'ye YAZILMAZ: `cikarimJson.oneriler.dekontlar`'a gider; faiz başlangıcına dokunulmaz.
 *   - Bir alan yazıldıysa ya da borçlu eklendiyse avukat onayı (cikarimJson.onay) düşer — takibe giden veri değişti.
 */
import { tcknGecerli } from '@/lib/ai/maske'

/** Birleştiricinin tanıdığı alanlar ve ekrandaki adları. `aciklama` kolon değil, cikarimJson.aciklama'dır. */
export const ALAN_ETIKET = {
  yol: 'Yol önerisi (triyaj)',
  brans: 'Branş',
  sigortaliUnvan: 'Sigortalı',
  sigortaliTelefon: 'Sigortalı telefonu',
  sigortaliPlaka: 'Sigortalı plaka',
  karsiPlaka: 'Karşı taraf plaka',
  il: 'İl',
  kazaYeri: 'Kaza yeri',
  olusSekli: 'Oluş şekli',
  kusurDurumu: 'Kusur durumu',
  asilAlacak: 'Asıl alacak',
  rucuTutari: 'Rücu tutarı',
  rucuOrani: 'Rücu oranı',
  yetkiliIcra: 'Yetkili icra',
  muhatapOzet: 'Muhatap özeti',
  aciklama: 'UYAP takip açıklaması',
} as const

export type AlanAdi = keyof typeof ALAN_ETIKET
export const ALANLAR = Object.keys(ALAN_ETIKET) as AlanAdi[]
/** Tutar (Decimal) alanları: sayısal karşılaştırılır (kuruş hassasiyetinde). */
export const PARA_ALANLARI: readonly AlanAdi[] = ['asilAlacak', 'rucuTutari']
/** AI'ın kendi analiz anahtarları: her çıkarımda tazelenir (avukat bunları yerinde düzenlemez). */
export const ANALIZ_ANAHTARLARI = ['olayTuru', 'olayBaglami', 'sonrakiAdimlar', 'teyit', 'llm'] as const

/** Saf alan değeri: metin ya da sayı (para). Boş = null. */
export type AlanDegeri = string | number | null
export type AlanOnerisi = {
  alan: AlanAdi
  mevcut: string | number
  onerilen: string | number
  zaman: string
  /** yol önerisinin eşlik eden AI bilgileri — uygulanırsa bunlar da yazılır. */
  ek?: { yolGuven: number | null; yolNeden: string | null }
}
export type DekontOnerisi = { anahtar: string; tarih: string | null; tutar: number; haricMi: boolean; aciklama: string | null; zaman: string }
export type CikarimOnerileri = { alanlar: AlanOnerisi[]; dekontlar: DekontOnerisi[] }

/** Kolon karşılığı olan yazılabilir anahtarlar (aciklama hariç) + yol eşlikçileri. */
export type YazilacakAnahtar = Exclude<AlanAdi, 'aciklama'> | 'yolGuven' | 'yolNeden'

type BorcluBenzeri = { adUnvan: string; tcVkn?: string | null; adres?: string | null; telefon?: string | null }

/** Mevcut borçlunun boş alanına AI'dan gelen değer (yalnız boş alan; dolu alan değişmez). */
export type BorcluTamamlama = { index: number; alanlar: { tcVkn?: string; adres?: string; telefon?: string } }
type DekontGirdi = { tarih: Date | string | null; tutar: unknown; haricMi?: boolean | null; aciklama?: string | null }

export type BirlestirGirdi<B extends BorcluBenzeri> = {
  mevcut: {
    /** DB'deki güncel değerler (Decimal ise Number'a çevrilmiş ya da çevrilebilir). */
    alanlar: Partial<Record<Exclude<AlanAdi, 'aciklama'>, unknown>>
    cikarimJson: unknown
    borclular: BorcluBenzeri[]
    odemeler: { tarih: Date | string | null; tutar: unknown }[]
  }
  ai: {
    alanlar: Partial<Record<AlanAdi, unknown>>
    yolGuven?: number | null
    yolNeden?: string | null
    analiz: Partial<Record<(typeof ANALIZ_ANAHTARLARI)[number], unknown>>
    borclular: B[]
    dekontlar: DekontGirdi[]
  }
  simdi?: Date
}

export type BirlestirSonuc<B> = {
  /** Yalnız BOŞ alanlara yazılacak değerler (+ yol yazıldıysa ya da aynıysa yolGuven/yolNeden). */
  yazilacak: Partial<Record<YazilacakAnahtar, string | number>>
  /** Bu çalıştırmada doğan alan önerileri (dolu alanda farklı değer). */
  oneriler: AlanOnerisi[]
  /** Bu çalıştırmada doğan dekont önerileri (Odeme'ye yazılmadı). */
  dekontOnerileri: DekontOnerisi[]
  /** Mevcut hiçbir borçluyla eşleşmeyen AI borçluları (eklenecek). */
  yeniBorclular: B[]
  /** Mevcut borçlularla eşleşen AI borçlularından boş alanlara yazılacaklar (index = mevcut.borclular sırası). */
  borcluTamamlama: BorcluTamamlama[]
  /** Birleştirilmiş cikarimJson (korunan anahtarlar + tazelenen analiz + öneri listeleri). */
  cikarimJson: Record<string, unknown>
  /** Takibe giden veri değişti mi (alan yazıldı / borçlu eklendi) → avukat onayı düştü. */
  degisti: boolean
}

// ───────────────────────── değer yardımcıları ─────────────────────────

const objeMi = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Para değeri → 2 haneli sayı (bozuk/boş → null). */
function paraSayi(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Alan değerini saf biçime getir: para alanında sayı, ötekilerde kırpılmış metin; boşsa null. */
export function degerOku(alan: AlanAdi, v: unknown): AlanDegeri {
  if (PARA_ALANLARI.includes(alan)) return paraSayi(v)
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Karşılaştırma normali: Türkçe küçük harf, boşluksuz ("34 ABC 123" = "34abc123"). */
const esNorm = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, '')

/** İki değer bu alan için aynı mı? (para: kuruş eşitliği; metin: büyük/küçük harf ve boşluk duyarsız) */
export function ayniDeger(alan: AlanAdi, a: unknown, b: unknown): boolean {
  const x = degerOku(alan, a)
  const y = degerOku(alan, b)
  if (x == null || y == null) return x === y
  if (PARA_ALANLARI.includes(alan)) return Math.round(Number(x) * 100) === Math.round(Number(y) * 100)
  return esNorm(String(x)) === esNorm(String(y))
}

/** Tarih → "YYYY-MM-DD" (bozuksa null). */
function gunIso(v: Date | string | null | undefined): string | null {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Dekont kimliği: gün + tutar (mükerrer kontrolü; mevcut Odeme'lerle aynı anahtar). */
export function dekontAnahtari(tarih: Date | string | null | undefined, tutar: unknown): string {
  const n = paraSayi(tutar)
  return `${gunIso(tarih) ?? ''}|${n != null ? n.toFixed(2) : ''}`
}

const tcNorm = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
/** Geçerli TCKN (kontrol haneli) ya da 10 haneli VKN. El yazısından yanlış okunan kimlik yazılmasın. */
const kimlikGecerli = (d: string) => (d.length === 11 && tcknGecerli(d)) || d.length === 10
const adNorm = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

// ───────────────────────── öneri listesi okuma/yazma ─────────────────────────

/** cikarimJson.oneriler'i güvenle oku (bozuk kayıtlar atlanır). Ekranlar ve öneri action'ları bunu kullanır. */
export function onerileriOku(cikarimJson: unknown): CikarimOnerileri {
  const o = objeMi(cikarimJson) && objeMi(cikarimJson.oneriler) ? cikarimJson.oneriler : null
  const alanlar: AlanOnerisi[] = []
  const dekontlar: DekontOnerisi[] = []
  if (o && Array.isArray(o.alanlar)) {
    for (const x of o.alanlar) {
      if (!objeMi(x) || typeof x.alan !== 'string' || !(x.alan in ALAN_ETIKET)) continue
      const alan = x.alan as AlanAdi
      const mevcut = degerOku(alan, x.mevcut), onerilen = degerOku(alan, x.onerilen)
      if (mevcut == null || onerilen == null) continue
      const ek = objeMi(x.ek)
        ? { yolGuven: typeof x.ek.yolGuven === 'number' ? x.ek.yolGuven : null, yolNeden: typeof x.ek.yolNeden === 'string' ? x.ek.yolNeden : null }
        : undefined
      alanlar.push({ alan, mevcut, onerilen, zaman: typeof x.zaman === 'string' ? x.zaman : '', ...(ek ? { ek } : {}) })
    }
  }
  if (o && Array.isArray(o.dekontlar)) {
    for (const x of o.dekontlar) {
      if (!objeMi(x)) continue
      const tutar = paraSayi(x.tutar)
      if (tutar == null || tutar <= 0) continue
      const tarih = typeof x.tarih === 'string' ? gunIso(x.tarih) : null
      dekontlar.push({
        anahtar: typeof x.anahtar === 'string' && x.anahtar ? x.anahtar : dekontAnahtari(tarih, tutar),
        tarih, tutar, haricMi: x.haricMi === true,
        aciklama: typeof x.aciklama === 'string' && x.aciklama.trim() ? x.aciklama.trim().slice(0, 200) : null,
        zaman: typeof x.zaman === 'string' ? x.zaman : '',
      })
    }
  }
  return { alanlar, dekontlar }
}

/** Öneri listesini cikarimJson'a yaz (ikisi de boşsa anahtar kaldırılır). Girdi kopyalanır. */
function onerileriYaz(cj: Record<string, unknown>, o: CikarimOnerileri): Record<string, unknown> {
  const yeni = { ...cj }
  if (o.alanlar.length || o.dekontlar.length) yeni.oneriler = { alanlar: o.alanlar, dekontlar: o.dekontlar }
  else delete yeni.oneriler
  return yeni
}

export function alanOnerisiBul(cikarimJson: unknown, alan: string): AlanOnerisi | null {
  return onerileriOku(cikarimJson).alanlar.find((o) => o.alan === alan) ?? null
}

export function dekontOnerisiBul(cikarimJson: unknown, anahtar: string): DekontOnerisi | null {
  return onerileriOku(cikarimJson).dekontlar.find((d) => d.anahtar === anahtar) ?? null
}

/** Alan önerisini listeden düşür (uygulandı / yoksayıldı / bayatladı). Öteki anahtarlar korunur. */
export function alanOnerisiniKaldir(cikarimJson: unknown, alan: string): Record<string, unknown> {
  const cj = objeMi(cikarimJson) ? cikarimJson : {}
  const o = onerileriOku(cj)
  return onerileriYaz(cj, { alanlar: o.alanlar.filter((x) => x.alan !== alan), dekontlar: o.dekontlar })
}

/** Dekont önerisini listeden düşür (ödemeye eklendi / yoksayıldı). Öteki anahtarlar korunur. */
export function dekontOnerisiniKaldir(cikarimJson: unknown, anahtar: string): Record<string, unknown> {
  const cj = objeMi(cikarimJson) ? cikarimJson : {}
  const o = onerileriOku(cj)
  return onerileriYaz(cj, { alanlar: o.alanlar, dekontlar: o.dekontlar.filter((d) => d.anahtar !== anahtar) })
}

// ───────────────────────── birleştirme ─────────────────────────

/** Mevcut dosya + AI sonucu → ne yazılacak, ne öneri olacak. Saf: girdiyi değiştirmez, DB'ye gitmez. */
export function cikarimBirlestir<B extends BorcluBenzeri>(g: BirlestirGirdi<B>): BirlestirSonuc<B> {
  const zaman = (g.simdi ?? new Date()).toISOString()
  const cjEski = objeMi(g.mevcut.cikarimJson) ? g.mevcut.cikarimJson : {}

  // 1) alanlar: boşsa yaz, doluysa ve farklıysa öneri
  const yazilacak: BirlestirSonuc<B>['yazilacak'] = {}
  const oneriler: AlanOnerisi[] = []
  const dokunulan = new Set<AlanAdi>() // AI'ın bu çalıştırmada değer döndürdüğü alanlar (eski öneri tazelenir)
  let aciklamaYaz: string | null = null
  let alanYazildi = false
  const yolEk = { yolGuven: typeof g.ai.yolGuven === 'number' && Number.isFinite(g.ai.yolGuven) ? g.ai.yolGuven : null, yolNeden: g.ai.yolNeden?.trim() || null }

  for (const alan of ALANLAR) {
    const aiV = degerOku(alan, g.ai.alanlar[alan])
    if (aiV == null) continue // AI bulamadı → mevcut değer ve eski öneri yerinde kalır
    dokunulan.add(alan)
    const mevcutV = degerOku(alan, alan === 'aciklama' ? cjEski.aciklama : g.mevcut.alanlar[alan])
    if (mevcutV == null) {
      alanYazildi = true
      if (alan === 'aciklama') aciklamaYaz = String(aiV)
      else yazilacak[alan] = aiV
      if (alan === 'yol') {
        if (yolEk.yolGuven != null) yazilacak.yolGuven = yolEk.yolGuven
        if (yolEk.yolNeden != null) yazilacak.yolNeden = yolEk.yolNeden
      }
    } else if (!ayniDeger(alan, mevcutV, aiV)) {
      oneriler.push({ alan, mevcut: mevcutV, onerilen: aiV, zaman, ...(alan === 'yol' ? { ek: yolEk } : {}) })
    } else if (alan === 'yol') {
      // aynı yol: güven ve gerekçe AI'ın kendi bilgisidir, tazelenir (takibe giden veri değil → onay düşmez)
      if (yolEk.yolGuven != null) yazilacak.yolGuven = yolEk.yolGuven
      if (yolEk.yolNeden != null) yazilacak.yolNeden = yolEk.yolNeden
    }
  }

  // 2) borçlular: hiçbiri silinmez; mevcut herhangi biriyle eşleşmeyen AI borçlusu eklenir (AI içi mükerrer de elenir)
  const gorulenTc = new Set(g.mevcut.borclular.map((b) => tcNorm(b.tcVkn)).filter(Boolean))
  const gorulenAd = new Set(g.mevcut.borclular.map((b) => adNorm(b.adUnvan)).filter(Boolean))
  const yeniBorclular: B[] = []
  const tamamlama = new Map<number, BorcluTamamlama['alanlar']>()
  for (const b of g.ai.borclular ?? []) {
    const ad = adNorm(b.adUnvan)
    if (!ad) continue
    const tc = tcNorm(b.tcVkn)
    // eşleşen mevcut borçlu: boş kimlik/adres/telefon AI'dan tamamlanır (el yazısından okunan kimlik kontrol hanesinden geçmeli)
    const i = g.mevcut.borclular.findIndex((m) => (tc && tcNorm(m.tcVkn) === tc) || adNorm(m.adUnvan) === ad)
    if (i >= 0) {
      const m = g.mevcut.borclular[i]
      const ek: BorcluTamamlama['alanlar'] = { ...tamamlama.get(i) }
      if (!tcNorm(m.tcVkn) && !ek.tcVkn && kimlikGecerli(tc)) ek.tcVkn = tc
      const adres = (b as BorcluBenzeri).adres?.trim(), telefon = (b as BorcluBenzeri).telefon?.trim()
      if (!m.adres?.trim() && !ek.adres && adres) ek.adres = adres.slice(0, 500)
      if (!m.telefon?.trim() && !ek.telefon && telefon) ek.telefon = telefon.slice(0, 40)
      if (Object.keys(ek).length) tamamlama.set(i, ek)
    }
    if ((tc && gorulenTc.has(tc)) || gorulenAd.has(ad)) continue
    yeniBorclular.push(b)
    if (tc) gorulenTc.add(tc)
    gorulenAd.add(ad)
  }

  // 3) dekontlar: Odeme'ye yazılmaz → öneri. Mevcut ödemeyle ya da bekleyen öneriyle aynı olan tekrar önerilmez.
  const eski = onerileriOku(cjEski)
  const odemeAnahtar = new Set(g.mevcut.odemeler.map((o) => dekontAnahtari(o.tarih, o.tutar)))
  const kalanDekont = eski.dekontlar.filter((d) => !odemeAnahtar.has(d.anahtar)) // elle girilmiş olanlar listeden düşer
  const gorulenDekont = new Set([...odemeAnahtar, ...kalanDekont.map((d) => d.anahtar)])
  const dekontOnerileri: DekontOnerisi[] = []
  for (const d of g.ai.dekontlar ?? []) {
    const tutar = paraSayi(d.tutar)
    if (tutar == null || tutar <= 0) continue
    const tarih = gunIso(d.tarih)
    const anahtar = dekontAnahtari(tarih, tutar)
    if (gorulenDekont.has(anahtar)) continue
    gorulenDekont.add(anahtar)
    dekontOnerileri.push({ anahtar, tarih, tutar, haricMi: !!d.haricMi, aciklama: d.aciklama?.trim().slice(0, 200) || null, zaman })
  }

  // 4) cikarimJson: korunan anahtarlar + tazelenen analiz + öneri listeleri
  let cj: Record<string, unknown> = { ...cjEski }
  for (const k of ANALIZ_ANAHTARLARI) {
    const v = g.ai.analiz[k]
    if (v === undefined || v === null) continue // AI döndürmediyse eski analiz kalır
    if (typeof v === 'string' && !v.trim()) continue
    cj[k] = v
  }
  if (aciklamaYaz != null) cj.aciklama = aciklamaYaz
  cj = onerileriYaz(cj, {
    alanlar: [...eski.alanlar.filter((o) => !dokunulan.has(o.alan)), ...oneriler],
    dekontlar: [...kalanDekont, ...dekontOnerileri],
  })

  const borcluTamamlama = [...tamamlama].map(([index, alanlar]) => ({ index, alanlar }))
  const degisti = alanYazildi || yeniBorclular.length > 0 || borcluTamamlama.length > 0
  if (degisti) delete cj.onay

  return { yazilacak, oneriler, dekontOnerileri, yeniBorclular, borcluTamamlama, cikarimJson: cj, degisti }
}
