/**
 * KonsRücü — TR sayı parse/format TEK KAYNAK · lib/konsrucu/sayi.ts (client-safe; Prisma yok)
 *
 * Hem TR biçimini (1.234,56 → nokta binlik, virgül ondalık) hem makine/US biçimini (1234.56)
 * çözer. Kural: virgül SON noktadan sonra geliyorsa TR, değilse makine biçimi sayılır.
 * Tek-format parser'lar geçmişte ×100 "milyon" hatası üretti (bkz. hafıza: tr-sayi-parse-iki-format)
 * — bu modül dışında yeni numTR kopyası YAZMA.
 */

/** "1.234,56" | "1234.56" | "₺ 1.234" → number. Boş/bozuk girdi → NaN.
 *  Virgülsüz "1.234" gibi belirsiz girdiler: noktalar tam 3'lü gruplarsa TR BİNLİK sayılır (→ 1234) —
 *  para bağlamında ₺1,234 değil ₺1.234 kastedilir; gerçek 3-ondalıklı tutar bu alanda yoktur. */
export function sayiTR(v: unknown): number {
  const c = String(v ?? '').replace(/[^\d.,-]/g, '')
  if (!c) return NaN
  if (c.includes(',') && c.lastIndexOf(',') > c.lastIndexOf('.')) return Number(c.replace(/\./g, '').replace(',', '.')) // TR: 1.234,56
  const noktasiz = c.replace(/,/g, '') // US binlik virgülleri at: 1,234.56 → 1234.56
  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(noktasiz)) return Number(noktasiz.replace(/\./g, '')) // TR binlik: 1.234 / 1.234.567
  return Number(noktasiz)
}

/** sayiTR ama bozuk girdi → 0 (canlı hesap panellerinde toplam kırılmasın diye). */
export function sayiTRveya0(v: unknown): number {
  const n = sayiTR(v)
  return Number.isFinite(n) ? n : 0
}

/** Yazarken Türkçe binlik ayracı (nokta) ekler; ondalık virgül korunur. "120000" → "120.000". */
export function formatTRInput(raw: string): string {
  const s = (raw ?? '').replace(/[^\d,]/g, '')
  const ci = s.indexOf(',')
  let tam = ci >= 0 ? s.slice(0, ci) : s
  const ondalik = ci >= 0 ? ',' + s.slice(ci + 1).replace(/,/g, '').slice(0, 2) : ''
  tam = tam.replace(/^0+(?=\d)/, '')
  const binlik = tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return binlik + ondalik
}

/** Sayıyı TR girişine hazır metne çevirir (1234.5 → "1.234,50"); null/NaN → ''. */
export function toTRInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
