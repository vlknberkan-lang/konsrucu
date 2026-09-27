/**
 * KonsRücü — Türkçe metin ve İstanbul günü yardımcıları · lib/konsrucu/eksen/norm.ts (saf, client-safe)
 *
 * docs/04 K1: düz toLowerCase() "İ"yi "i̇" (i + U+0307) yapar ve "Borca İtiraz" /itiraz/ ile eşleşmez.
 * trNorm, eklentinin trNorm'uyla (extension/siniflandir.js) AYNI kuralı uygular: tr-TR küçük harf, birleşik
 * işaretleri sil, ı → i, boşluk sadeleştir. Sonuç ASCII desenlerle güvenle aranır.
 *
 * Tarihler: hukuki günler İSTANBUL takvim günüyle sayılır (Türkiye sabit UTC+3). UYAP'tan gelen "YYYY-MM-DD"
 * UTC gece yarısı, formdan gelen gün İstanbul gece yarısı olabilir; ikisi de aynı gün numarasına düşer.
 */

const GUN_MS = 86_400_000
const IST_OFSET_MS = 3 * 3_600_000

export function trNorm(s: unknown): string {
  let t = String(s ?? '')
  try {
    t = t.toLocaleLowerCase('tr-TR')
  } catch {
    t = t.toLowerCase()
  }
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()
}

/** İstanbul takvim günü numarası (1970-01-01 = 0). */
export function gunNo(d: Date): number {
  return Math.floor((d.getTime() + IST_OFSET_MS) / GUN_MS)
}

/** Gün numarasından o günün İstanbul gece yarısı (UTC anı). */
export function gundenTarih(n: number): Date {
  return new Date(n * GUN_MS - IST_OFSET_MS)
}

/** Tarihe n takvim günü ekler (sonuç İstanbul gece yarısı). */
export function gunEkle(d: Date, n: number): Date {
  return gundenTarih(gunNo(d) + n)
}

/** Tarihe n yıl ekler (29 Şubat → 28 Şubat; ay sonu taşmaz). Sonuç İstanbul gece yarısı. */
export function yilEkle(d: Date, n: number): Date {
  const u = new Date(gunNo(d) * GUN_MS)
  const y = u.getUTCFullYear() + n
  const m = u.getUTCMonth()
  const sonGun = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const g = Math.min(u.getUTCDate(), sonGun)
  return gundenTarih(Math.floor(Date.UTC(y, m, g) / GUN_MS))
}

/** "YYYY-MM-DD" (İstanbul günü). */
export function isoGun(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const u = new Date(gunNo(d) * GUN_MS)
  return u.toISOString().slice(0, 10)
}

/** Geçerli bir takvim günü mü (31.02 gibi taşan günler reddedilir)? Sonuç İstanbul gece yarısı ya da null. */
function gunKur(y: number, m: number, g: number): Date | null {
  if (!Number.isInteger(y) || y < 1990 || y > 2100) return null
  const u = new Date(Date.UTC(y, m - 1, g))
  if (u.getUTCFullYear() !== y || u.getUTCMonth() !== m - 1 || u.getUTCDate() !== g) return null
  return gundenTarih(Math.floor(u.getTime() / GUN_MS))
}

/** "YYYY-MM-DD" → İstanbul gece yarısı; geçersizse null. */
export function isoGundenTarih(s: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim())
  return m ? gunKur(Number(m[1]), Number(m[2]), Number(m[3])) : null
}

/** Metindeki "gg.aa.yyyy" / "gg/aa/yyyy" / "gg-aa-yyyy" tarihi → İstanbul gece yarısı; geçersizse null. */
export function trTarihParse(s: unknown): Date | null {
  const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(String(s ?? ''))
  return m ? gunKur(Number(m[3]), Number(m[2]), Number(m[1])) : null
}

/** Serbest girdi (ISO gün, ISO an ya da gg.aa.yyyy) → Date | null. Uydurma yok: okunamazsa null. */
export function tarihOku(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  return isoGundenTarih(s) ?? (/^\d{4}-\d{2}-\d{2}T/.test(s) ? (() => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d })() : trTarihParse(s))
}

/** İki tarih aynı İstanbul günü mü? */
export function ayniGun(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return !!a && !!b && gunNo(a) === gunNo(b)
}

/** a, b'den sonraki bir gün mü? */
export function gundenSonra(a: Date, b: Date): boolean {
  return gunNo(a) > gunNo(b)
}

/** "gg.aa.yyyy" (İstanbul günü) — ekranda tek tarih biçimi (06 "Görsel dil"). */
export function gunTR(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return '—'
  const iso = isoGun(d) as string
  const [y, m, g] = iso.split('-')
  return `${g}.${m}.${y}`
}
