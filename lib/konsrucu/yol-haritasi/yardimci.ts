/**
 * KonsRücü — Dosya Yol Haritası · küçük saf yardımcılar · lib/konsrucu/yol-haritasi/yardimci.ts (client-safe)
 *
 * Gün hesabı İSTANBUL takvimiyle yapılır (lib/konsrucu/format.ts ile aynı ilke: Vercel UTC çalışır, TR sabit
 * UTC+3). Motor hiçbir süreyi hesaplayıp kesinleştirmez; bu yardımcılar yalnız "kaç gün kaldı / geçti" ve
 * "bu olgu kesimden önce mi" sorularını yanıtlar.
 */
import { kalanGun, tarihTR, paraTR } from '@/lib/konsrucu/format'

const GUN_MS = 86_400_000
const IST_OFSET_MS = 3 * 3_600_000

/** İstanbul takvim günü (epoch-gün). */
export function istGun(d: Date): number {
  return Math.floor((d.getTime() + IST_OFSET_MS) / GUN_MS)
}

/** Date → "YYYY-MM-DD" (İstanbul günü). */
export function gunMetni(d: Date | null | undefined): string | null {
  if (!d) return null
  const t = new Date(istGun(d) * GUN_MS)
  return t.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" → o günün İstanbul gün SONU (23:59:59.999, UTC instant). Bozuksa null. */
export function gunSonu(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = +m[1], ay = +m[2], g = +m[3]
  const bas = Date.UTC(y, ay - 1, g)
  const kontrol = new Date(bas)
  if (kontrol.getUTCFullYear() !== y || kontrol.getUTCMonth() !== ay - 1 || kontrol.getUTCDate() !== g) return null
  return new Date(bas - IST_OFSET_MS + GUN_MS - 1)
}

/** Hedefe kalan gün (İstanbul günü; negatif = geçti). */
export function kalan(hedef: Date, bugun: Date): number {
  return kalanGun(hedef, bugun)
}

/** a'dan b'ye geçen gün (b − a, İstanbul günü). */
export function gecenGun(a: Date, b: Date): number {
  return istGun(b) - istGun(a)
}

/** Ekranda tarih: "31.12.2026". */
export function tarihKisa(d: Date | null | undefined): string {
  return tarihTR(d, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Ekranda tutar: "1.234,56 ₺". */
export function tutarMetni(n: number | null | undefined): string {
  return paraTR(n ?? null)
}

/** Türkçe güvenli küçük harf + ASCII katlama ("İtiraz" → "itiraz", "KAPALI" → "kapali"). */
export function trNorm(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim()
}

/** En erken tarih (null'lar atlanır). */
export function enErken(ds: (Date | null | undefined)[]): Date | null {
  let m: Date | null = null
  for (const d of ds) if (d && (!m || d.getTime() < m.getTime())) m = d
  return m
}

/** En geç tarih (null'lar atlanır). */
export function enGec(ds: (Date | null | undefined)[]): Date | null {
  let m: Date | null = null
  for (const d of ds) if (d && (!m || d.getTime() > m.getTime())) m = d
  return m
}

/** "1. borçlu" — ekranda ve kayıtta borçlu adı yerine. */
export function borcluEtiketi(sira: number): string {
  return `${sira}. borçlu`
}

/** Metni tek satıra indirip kısaltır (hata/gerekçe gibi serbest metinler için). */
export function kisalt(s: string | null | undefined, n = 120): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Sure.tur → ekranda işlem adı. Madde atıfı ayrıca "teyit gerekli" etiketiyle gösterilir. */
export const SURE_ADI: Record<string, string> = {
  IIK62: 'Ödeme emrine itiraz süresi',
  IIK67: 'İtirazın iptali davası süresi',
  IIK78: 'Haciz isteme süresi',
  HMK127: 'Cevap süresi',
  HMK136: 'Cevaba cevap süresi',
  HMK281: 'Rapora itiraz süresi',
  HMK345: 'İstinaf süresi',
  HMK361: 'Temyiz süresi',
  HMK150: 'Yenileme süresi',
  HMK20: 'Gönderme talebi süresi',
  AVANS: 'Avans süresi',
  TEBLIGAT_ADRES: 'Tebligat adresi süresi',
  SON_TUTANAK_EKI: 'Son tutanak eki süresi',
  IIK261: 'İhtiyati haciz infaz süresi',
  IIK264: 'İhtiyati haciz sonrası dava/takip süresi',
  ARA_KARAR: 'Ara karar kesin süresi',
  IYUK13_BASVURU: 'İdareye başvuru süresi',
  IYUK_ZIMNI_RET: 'Zımni ret süresi',
  IYUK7_DAVA: 'İdari dava süresi',
  DIGER: 'Süre',
}

export function sureAdi(tur: string): string {
  return SURE_ADI[tur] ?? tur
}

/** Kısa kanıt alıntısı (en çok 300 karakter — AlanDegeri.alinti ile aynı sınır). */
export function alintiKisa(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > 300 ? `${t.slice(0, 299)}…` : t
}
