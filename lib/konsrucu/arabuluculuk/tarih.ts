/**
 * KonsRücü — hukuki tarih yardımcıları (saf, client-safe) · lib/konsrucu/arabuluculuk/tarih.ts
 *
 * Arabuluculuk ve dava modülleri gün hesabını TEK yerden yapar. Türkiye sabit UTC+3 (DST yok);
 * gün karşılaştırması İstanbul takvim günüyle yapılır (sunucu UTC'dir — lib/konsrucu/format.ts ile aynı ilke).
 * Formdan gelen tarih "yyyy-aa-gg" biçimindedir ve UTC gece yarısı olarak saklanır (mevcut desen:
 * `new Date('2026-06-28')`); İstanbul'da aynı güne düşer.
 */

const GUN_MS = 86_400_000
const IST_OFSET_MS = 3 * 3_600_000

/** İstanbul takvim günü (epoch-gün). */
export function gunNo(d: Date): number {
  return Math.floor((d.getTime() + IST_OFSET_MS) / GUN_MS)
}

/** "yyyy-aa-gg" → Date (UTC gece yarısı). Geçersiz ya da taşan tarih (31.02) → null. */
export function isoGunCoz(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1]), a = Number(m[2]), g = Number(m[3])
  const d = new Date(Date.UTC(y, a - 1, g))
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return null
  return d
}

/** Date → "yyyy-aa-gg" (İstanbul günü). */
export function isoGun(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  const x = new Date(d.getTime() + IST_OFSET_MS)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
}

/** b − a (İstanbul takvim günü). */
export function gunFarki(a: Date, b: Date): number {
  return gunNo(b) - gunNo(a)
}

/** Tarih bugünden (İstanbul) ileride mi? */
export function ileriTarihMi(d: Date, simdi: Date = new Date()): boolean {
  return gunNo(d) > gunNo(simdi)
}

/** n gün ekle (UTC gece yarısı korunur). */
export function gunEkle(d: Date, n: number): Date {
  return new Date(d.getTime() + n * GUN_MS)
}

/** Cumartesi ya da Pazar mı (İstanbul günü)? Resmî tatil listesi burada YOK: yalnız hafta sonu denetlenir. */
export function haftaSonuMu(d: Date): boolean {
  const gun = new Date(d.getTime() + IST_OFSET_MS).getUTCDay()
  return gun === 0 || gun === 6
}

/** "gg.aa.yyyy" gösterimi (İstanbul). */
export function trGun(d: Date | null | undefined): string {
  const s = isoGun(d ?? null)
  if (!s) return '—'
  const [y, a, g] = s.split('-')
  return `${g}.${a}.${y}`
}

/** Metindeki "gg.aa.yyyy" / "gg/aa/yyyy" / "gg-aa-yyyy" tarihini Date'e çevir (taşma reddedilir). */
export function trTarihCoz(s: string): Date | null {
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!m) return null
  const g = Number(m[1]), a = Number(m[2]), y = Number(m[3])
  const d = new Date(Date.UTC(y, a - 1, g))
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return null
  return d
}
