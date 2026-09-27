/**
 * KonsRücü — Öneri alanları sözlüğü · lib/konsrucu/oneri/alanlar.ts  (saf; DB/Prisma yok, client-safe)
 *
 * S18 (06 §2(a), M5; F13 kalıcı; B36, B37, B38). Her önerilen değer bir `AlanDegeri` satırıdır; bu dosya hangi
 * `alan` anahtarlarının geçerli olduğunu, değerin nasıl normalize edileceğini, iki değerin ne zaman "aynı" sayılacağını,
 * ekranda nasıl yazılacağını ve onay anında hangi eski kolona aynalanacağını (M5) tek yerde tanımlar.
 *
 * Kurallar:
 *   - Kritik alan (tutar, ödeme, kaza tarihi, rücu sebebi, yetkili icra) yalnız AVUKAT/ADMIN onayıyla kilitlenir (HZ-02).
 *   - Toplu onay yalnız `topluOnaylanabilir` alanlarda ve deterministik kaynakta (karar.ts). Tutar ve tarih ASLA toplu
 *     onaylanmaz (06 §9.1).
 *   - `aiYasak`: AI kaynaklı öneri bu alana hiç yazılmaz (yetkili icra; 06 §2(c) adım 4).
 *   - `karar`: değer öneriden değil avukatın seçiminden gelir (rücu sebebi kodu, yetkili icra).
 */
import { sayiTR } from '@/lib/konsrucu/sayi'
import { rucuSebebiKoduMu, RUCU_SEBEBI_TANIM } from '@/lib/konsrucu/rucu-sebebi'

export const KAYNAK_TURLERI = ['AI', 'HUGO', 'EXCEL', 'UYAP', 'ELLE', 'KURAL'] as const
export type KaynakTuru = (typeof KAYNAK_TURLERI)[number]
export const ALAN_DURUMLARI = ['ONERI', 'ONAYLI', 'REDDEDILDI', 'ESKIDI'] as const
export type AlanDurumu = (typeof ALAN_DURUMLARI)[number]

export const KAYNAK_ETIKET: Record<KaynakTuru, string> = {
  AI: 'AI', HUGO: 'Hugo', EXCEL: 'Ray Excel', UYAP: 'UYAP', ELLE: 'Elle', KURAL: 'Kural',
}

export type AlanTipi =
  | 'PARA' | 'TARIH' | 'METIN' | 'ORAN' | 'BRANS' | 'RUCU_KOD' | 'PLAKA' | 'PLAKA_LISTE' | 'ODEME' | 'YETKILI_ICRA'

/** RucuDosyasi'nda yalnız onaylı AlanDegeri'nden aynalanan kolonlar. */
export type RucuKolon =
  | 'asilAlacak' | 'rucuTutari' | 'rucuOrani' | 'brans' | 'policeNo' | 'policeBaslangic' | 'policeBitis'
  | 'kazaTarihi' | 'kazaYeri' | 'sigortaliPlaka' | 'karsiPlaka' | 'rucuSebebiKod' | 'yetkiliIcra'

export type AlanTanimi = {
  anahtar: string
  etiket: string
  tip: AlanTipi
  kritik: boolean
  karar: boolean
  topluOnaylanabilir: boolean
  aiYasak: boolean
  /** Onay anında aynalanan kolon; 'ODEME' = Odeme satırı; null = yalnız AlanDegeri (bilgi alanı). */
  ayna: RucuKolon | 'ODEME' | null
  /** Ekranda varsayılan maskeli mi (plaka). */
  maskeli: boolean
  sira: number
}

const t = (anahtar: string, etiket: string, tip: AlanTipi, sira: number, o: Partial<Omit<AlanTanimi, 'anahtar' | 'etiket' | 'tip' | 'sira'>> = {}): AlanTanimi => ({
  anahtar, etiket, tip, sira,
  kritik: o.kritik ?? false, karar: o.karar ?? false, topluOnaylanabilir: o.topluOnaylanabilir ?? false,
  aiYasak: o.aiYasak ?? false, ayna: o.ayna ?? null, maskeli: o.maskeli ?? false,
})

/** Sabit anahtarlı alanlar. Ödemeler `odeme[<gün>|<tutar>]` biçiminde dinamiktir (bkz. alanTanimi). */
export const ALAN_TANIMLARI: Record<string, AlanTanimi> = {
  brans: t('brans', 'Branş', 'BRANS', 10, { topluOnaylanabilir: true, ayna: 'brans' }),
  policeNo: t('policeNo', 'Poliçe no', 'METIN', 20, { topluOnaylanabilir: true, ayna: 'policeNo' }),
  policeTanzimTarihi: t('policeTanzimTarihi', 'Poliçe tanzim tarihi', 'TARIH', 21),
  policeBaslangic: t('policeBaslangic', 'Poliçe başlangıcı', 'TARIH', 22, { ayna: 'policeBaslangic' }),
  policeBitis: t('policeBitis', 'Poliçe bitişi', 'TARIH', 23, { ayna: 'policeBitis' }),
  kazaTarihi: t('kazaTarihi', 'Kaza tarihi', 'TARIH', 30, { kritik: true, ayna: 'kazaTarihi' }),
  kazaYeri: t('kazaYeri', 'Kaza yeri', 'METIN', 31, { topluOnaylanabilir: true, ayna: 'kazaYeri' }),
  sigortaliPlaka: t('sigortaliPlaka', 'Sigortalı plaka', 'PLAKA', 40, { topluOnaylanabilir: true, ayna: 'sigortaliPlaka', maskeli: true }),
  karsiPlaka: t('karsiPlaka', 'Karşı taraf plaka', 'PLAKA', 41, { topluOnaylanabilir: true, ayna: 'karsiPlaka', maskeli: true }),
  tutanakPlakalari: t('tutanakPlakalari', 'Tutanaktaki plakalar', 'PLAKA_LISTE', 42, { topluOnaylanabilir: true, maskeli: true }),
  rucuTutari: t('rucuTutari', 'Rücu tutarı', 'PARA', 50, { kritik: true, ayna: 'rucuTutari' }),
  asilAlacak: t('asilAlacak', 'Asıl alacak', 'PARA', 51, { kritik: true, ayna: 'asilAlacak' }),
  rucuOrani: t('rucuOrani', 'Rücu oranı', 'ORAN', 52, { kritik: true, ayna: 'rucuOrani' }),
  'kusur.oran': t('kusur.oran', 'Kusur oranı', 'ORAN', 53),
  rucuSebebiKod: t('rucuSebebiKod', 'Rücu sebebi', 'RUCU_KOD', 70, { kritik: true, karar: true, ayna: 'rucuSebebiKod' }),
  yetkiliIcra: t('yetkiliIcra', 'Yetkili icra', 'YETKILI_ICRA', 80, { kritik: true, karar: true, aiYasak: true, ayna: 'yetkiliIcra' }),
}

const ODEME_TANIM = t('odeme', 'Ödeme', 'ODEME', 60, { kritik: true, ayna: 'ODEME' })
const ODEME_RE = /^odeme\[[^\]]{1,40}\]$/

/** Alan anahtarının tanımı (bilinmeyen anahtar → null; yazılmaz). */
export function alanTanimi(alan: string | null | undefined): AlanTanimi | null {
  if (!alan) return null
  if (Object.prototype.hasOwnProperty.call(ALAN_TANIMLARI, alan)) return ALAN_TANIMLARI[alan]
  if (ODEME_RE.test(alan)) return { ...ODEME_TANIM, anahtar: alan }
  return null
}

// ───────────────────────── değer normalizasyonu ─────────────────────────

export type OdemeDegeri = { tarih: string | null; tutar: number }
export type YetkiliIcraDegeri = { icraDairesi: string; secenek: 'KAZA_YERI' | 'YERLESIM_YERI' | 'ELLE'; gerekce?: string }
export type AlanDegeriJson = number | string | string[] | OdemeDegeri | YetkiliIcraDegeri

const objeMi = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const tekBosluk = (s: string) => s.replace(/\s+/g, ' ').trim()
const trKucuk = (s: string) => s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
const trBuyuk = (s: string) => s.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase()

export function paraNormal(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : sayiTR(v)
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) return null
  return Math.round(n * 100) / 100
}

/** "YYYY-MM-DD" | "gg.aa.yyyy" | Date → "YYYY-MM-DD" (UTC takvim günü; geçersiz → null). */
export function tarihNormal(v: unknown): string | null {
  if (v == null || v === '') return null
  let y: number, a: number, g: number
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s)
  if (m) { y = +m[1]; a = +m[2]; g = +m[3] } else {
    m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s)
    if (!m) return null
    g = +m[1]; a = +m[2]; y = +m[3]
  }
  if (y < 1990 || y > 2100 || a < 1 || a > 12 || g < 1 || g > 31) return null
  const d = new Date(Date.UTC(y, a - 1, g))
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return null
  return d.toISOString().slice(0, 10)
}

/** Oran → "% 75" (0–100; ondalık virgülle). */
export function oranNormal(v: unknown): string | null {
  if (v == null || v === '') return null
  let n: number
  if (typeof v === 'number') n = v
  else {
    const m = /(\d+(?:[.,]\d+)?)/.exec(String(v))
    if (!m) return null
    n = Number(m[1].replace(',', '.'))
  }
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return `% ${String(Math.round(n * 100) / 100).replace('.', ',')}`
}

const PLAKA_HARF = 'ABCDEFGHIJKLMNOPRSTUVYZ' // Q, W, X ve Türkçe harfler plakada yok
/** Türk plakası → "34 ABC 123" (geçersiz → null). Harf sayısına göre rakam uzunluğu: 1→4-5, 2→3-4, 3→2-3. */
export function plakaNormal(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).replace(/[İıi]/g, 'I').toUpperCase().replace(/[\s\-.]/g, '')
  const m = /^(\d{2})([A-Z]{1,3})(\d{2,5})$/.exec(s)
  if (!m) return null
  const il = Number(m[1])
  if (il < 1 || il > 81) return null
  const harf = m[2], rakam = m[3]
  if ([...harf].some((c) => !PLAKA_HARF.includes(c))) return null
  const [min, max] = harf.length === 1 ? [4, 5] : harf.length === 2 ? [3, 4] : [2, 3]
  if (rakam.length < min || rakam.length > max) return null
  return `${m[1]} ${harf} ${rakam}`
}

const BRANS_ES: Record<string, 'KASKO' | 'ZMMS' | 'OTO_DISI'> = { KASKO: 'KASKO', ZMMS: 'ZMMS', ZMSS: 'ZMMS', TRAFIK: 'ZMMS', OTO_DISI: 'OTO_DISI' }

/** Değeri alan tipine göre normalize et; geçersizse null (yazılmaz). */
export function degerNormal(tip: AlanTipi, v: unknown): AlanDegeriJson | null {
  switch (tip) {
    case 'PARA': return paraNormal(v)
    case 'TARIH': return tarihNormal(v)
    case 'ORAN': return oranNormal(v)
    case 'METIN': {
      if (v == null) return null
      const s = tekBosluk(String(v))
      return s && s.length <= 300 ? s : null
    }
    case 'BRANS': {
      const k = trBuyuk(String(v ?? '')).replace(/[^A-Z_]/g, '')
      return BRANS_ES[k] ?? null
    }
    case 'RUCU_KOD': return rucuSebebiKoduMu(v) ? v : null
    case 'PLAKA': return plakaNormal(v)
    case 'PLAKA_LISTE': {
      if (!Array.isArray(v)) return null
      const l = [...new Set(v.map(plakaNormal).filter((x): x is string => !!x))].sort()
      return l.length ? l : null
    }
    case 'ODEME': {
      if (!objeMi(v)) return null
      const tutar = paraNormal(v.tutar)
      if (tutar == null) return null
      return { tarih: tarihNormal(v.tarih), tutar }
    }
    case 'YETKILI_ICRA': {
      const ham = typeof v === 'string' ? { icraDairesi: v, secenek: 'ELLE' } : v
      if (!objeMi(ham)) return null
      const daire = tekBosluk(String(ham.icraDairesi ?? ''))
      if (!daire || daire.length > 120) return null
      const secenek = ham.secenek === 'KAZA_YERI' || ham.secenek === 'YERLESIM_YERI' ? ham.secenek : 'ELLE'
      const gerekce = typeof ham.gerekce === 'string' && ham.gerekce.trim() ? tekBosluk(ham.gerekce).slice(0, 500) : undefined
      return { icraDairesi: daire, secenek, ...(gerekce ? { gerekce } : {}) }
    }
  }
}

/** İki değer bu alan tipinde aynı mı? (para kuruşla; metin büyük/küçük harf ve boşluk duyarsız; yetkili icra daireyle) */
export function degerEsit(tip: AlanTipi, a: unknown, b: unknown): boolean {
  const x = degerNormal(tip, a), y = degerNormal(tip, b)
  if (x == null || y == null) return x === y
  switch (tip) {
    case 'PARA': return Math.round(Number(x) * 100) === Math.round(Number(y) * 100)
    case 'METIN': return trKucuk(String(x)).replace(/\s+/g, '') === trKucuk(String(y)).replace(/\s+/g, '')
    case 'ODEME': return odemeAnahtari(x as OdemeDegeri) === odemeAnahtari(y as OdemeDegeri)
    case 'YETKILI_ICRA': return trKucuk((x as YetkiliIcraDegeri).icraDairesi) === trKucuk((y as YetkiliIcraDegeri).icraDairesi)
    default: return JSON.stringify(x) === JSON.stringify(y)
  }
}

/** Ödeme kimliği (gün + tutar) — cikarim-birlestir.dekontAnahtari ile aynı biçim. */
export function odemeAnahtari(o: { tarih: string | null; tutar: number }): string {
  return `${o.tarih ?? ''}|${o.tutar.toFixed(2)}`
}

/** Ödeme önerisinin alan anahtarı: her dekont ayrı alan (tek onaylı değer kısıtı alan başınadır). */
export function odemeAlanAnahtari(o: { tarih: string | null; tutar: number }): string {
  return `odeme[${odemeAnahtari(o)}]`
}

// ───────────────────────── ekranda gösterim ─────────────────────────

const paraYaz = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'
const tarihYaz = (iso: string) => iso.split('-').reverse().join('.')
const BRANS_AD: Record<string, string> = { KASKO: 'Kasko', ZMMS: 'ZMSS (trafik)', OTO_DISI: 'Oto dışı' }

/** "34 ABC 123" → "34 ••• •23" (il kodu ve son iki rakam görünür). */
export function plakaMaskele(p: string): string {
  const n = plakaNormal(p)
  if (!n) return '•••'
  const [il, harf, rakam] = n.split(' ')
  return `${il} ${'•'.repeat(harf.length)} ${'•'.repeat(Math.max(0, rakam.length - 2))}${rakam.slice(-2)}`
}

/** Değerin ekrandaki metni. `maskeli` ise plaka gibi kişisel veriler gizlenir. */
export function degerGorunum(tip: AlanTipi, v: unknown, maskeli = false): string {
  const x = degerNormal(tip, v)
  if (x == null) return '—'
  switch (tip) {
    case 'PARA': return paraYaz(Number(x))
    case 'TARIH': return tarihYaz(String(x))
    case 'BRANS': return BRANS_AD[String(x)] ?? String(x)
    case 'RUCU_KOD': return rucuSebebiKoduMu(x) ? RUCU_SEBEBI_TANIM[x].ad : String(x)
    case 'PLAKA': return maskeli ? plakaMaskele(String(x)) : String(x)
    case 'PLAKA_LISTE': return (x as string[]).map((p) => (maskeli ? plakaMaskele(p) : p)).join(', ')
    case 'ODEME': { const o = x as OdemeDegeri; return `${paraYaz(o.tutar)} · ${o.tarih ? tarihYaz(o.tarih) : 'tarihsiz'}` }
    case 'YETKILI_ICRA': return (x as YetkiliIcraDegeri).icraDairesi
    default: return String(x)
  }
}

// ───────────────────────── onay anında ayna (M5) ─────────────────────────

export type AynaPlani =
  | { tur: 'KOLON'; kolon: RucuKolon; deger: number | string | Date }
  | { tur: 'ODEME'; tarih: Date | null; tutar: number; anahtar: string }
  | null

const utcGun = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

/** Onaylı değer hangi eski kolona nasıl yazılır? (Tarihler UTC gece yarısı — Hugo içe aktarımıyla aynı.) */
export function aynaPlani(tanim: AlanTanimi, v: unknown): AynaPlani {
  if (!tanim.ayna) return null
  const x = degerNormal(tanim.tip, v)
  if (x == null) return null
  if (tanim.ayna === 'ODEME') {
    const o = x as OdemeDegeri
    return { tur: 'ODEME', tarih: o.tarih ? utcGun(o.tarih) : null, tutar: o.tutar, anahtar: odemeAnahtari(o) }
  }
  switch (tanim.tip) {
    case 'TARIH': return { tur: 'KOLON', kolon: tanim.ayna, deger: utcGun(String(x)) }
    case 'YETKILI_ICRA': return { tur: 'KOLON', kolon: tanim.ayna, deger: (x as YetkiliIcraDegeri).icraDairesi }
    case 'PARA': return { tur: 'KOLON', kolon: tanim.ayna, deger: Number(x) }
    default: return { tur: 'KOLON', kolon: tanim.ayna, deger: String(x) }
  }
}
