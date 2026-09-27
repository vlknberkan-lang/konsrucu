/**
 * KonsRücü — Süre defteri takvim yardımcıları · lib/konsrucu/sure/takvim.ts (saf, client-safe)
 *
 * Hukuki süreler İSTANBUL takvim günüyle sayılır. Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok),
 * bu yüzden "gün numarası" sabit ofsetle güvenle hesaplanır (lib/konsrucu/format.ts ile aynı ilke).
 * Bir gün, o günün İstanbul gece yarısına denk gelen UTC anı olarak saklanır.
 *
 * BİLİNÇLİ SINIRLAR (06 §2(i)): bu modül süreyi UZATMAZ. Hafta sonu ve adli tatil yalnız UYARI üretir;
 * resmî tatil ve bayramlar kontrol edilmez (listesi yıla göre değişir; avukat teyit eder).
 */

const GUN_MS = 86_400_000
const IST_OFSET_MS = 3 * 3_600_000

/** İstanbul takvim günü numarası (1970-01-01 = 0). */
export function gunNo(d: Date): number {
  return Math.floor((d.getTime() + IST_OFSET_MS) / GUN_MS)
}

/** Gün numarasından o günün İstanbul gece yarısı (UTC anı). */
export function gundenTarih(n: number): Date {
  return new Date(n * GUN_MS - IST_OFSET_MS)
}

/** Tarihi İstanbul gününün başına çeker (saat bilgisini atar). */
export function gunBasi(d: Date): Date {
  return gundenTarih(gunNo(d))
}

function parcalar(d: Date): { y: number; m: number; g: number } {
  const u = new Date(gunNo(d) * GUN_MS) // UTC gece yarısı = aynı takvim günü
  return { y: u.getUTCFullYear(), m: u.getUTCMonth(), g: u.getUTCDate() }
}

function parcadanTarih(y: number, m: number, g: number): Date {
  return gundenTarih(Math.floor(Date.UTC(y, m, g) / GUN_MS))
}

/** "YYYY-MM-DD" (İstanbul günü). */
export function isoGun(d: Date): string {
  const { y, m, g } = parcalar(d)
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(g).padStart(2, '0')}`
}

/** "YYYY-MM-DD" → o günün İstanbul gece yarısı. Geçersiz tarih (31.02) → null. */
export function isoGundenTarih(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1]), ay = Number(m[2]) - 1, g = Number(m[3])
  if (ay < 0 || ay > 11 || g < 1) return null
  const t = new Date(Date.UTC(y, ay, g))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== ay || t.getUTCDate() !== g) return null
  return parcadanTarih(y, ay, g)
}

/** d + n gün. Gün olarak belirlenen sürede başladığı gün sayılmaz: son gün = tetik + n. */
export function gunEkle(d: Date, n: number): Date {
  return gundenTarih(gunNo(d) + n)
}

/**
 * d + n ay. Hedef ayda aynı gün yoksa ayın SON günü (31 Mayıs + 3 ay = 31 Ağustos; 30 Kasım + 3 ay =
 * 28/29 Şubat). Mevcut İİK 78 hesabıyla aynı ilke (teblig-gorev.ts hacizSonGun; teyit gerekli).
 */
export function ayEkle(d: Date, n: number): Date {
  const { y, m, g } = parcalar(d)
  const hedefAy = m + n
  const hy = y + Math.floor(hedefAy / 12)
  const hm = ((hedefAy % 12) + 12) % 12
  const ayinSonGunu = new Date(Date.UTC(hy, hm + 1, 0)).getUTCDate()
  return parcadanTarih(hy, hm, Math.min(g, ayinSonGunu))
}

/** d + n yıl (29 Şubat → 28 Şubat). */
export function yilEkle(d: Date, n: number): Date {
  return ayEkle(d, n * 12)
}

/** b − a (İstanbul günü). */
export function gunFarki(a: Date, b: Date): number {
  return gunNo(b) - gunNo(a)
}

/** Haftanın günü (0 = Pazar … 6 = Cumartesi), İstanbul. 1970-01-01 Perşembe'dir. */
export function haftaGunu(d: Date): number {
  return (((gunNo(d) + 4) % 7) + 7) % 7
}

const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

export function gunAdi(d: Date): string {
  return GUN_ADLARI[haftaGunu(d)]
}

export function haftaSonuMu(d: Date): boolean {
  const h = haftaGunu(d)
  return h === 0 || h === 6
}

/** Adli tatil dönemi (20 Temmuz – 31 Ağustos) içinde mi? Yalnız uyarı içindir; uzatma yapılmaz. */
export function adliTatildeMi(d: Date): boolean {
  const { m, g } = parcalar(d)
  return (m === 6 && g >= 20) || m === 7
}

/** Ekranda kısa gösterim: "12.03.2027". */
export function gunTR(d: Date | null | undefined): string {
  if (!d) return '—'
  const { y, m, g } = parcalar(d)
  return `${String(g).padStart(2, '0')}.${String(m + 1).padStart(2, '0')}.${y}`
}

/** Tarih benzeri girdiyi Date'e çevirir (ISO gün, ISO an ya da Date). Geçersizse null. */
export function tarihOku(v: Date | string | null | undefined): Date | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const gun = isoGundenTarih(v)
  if (gun) return gun
  const t = new Date(v)
  return Number.isNaN(t.getTime()) ? null : t
}
