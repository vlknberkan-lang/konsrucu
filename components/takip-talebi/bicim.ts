/** KonsRücü — takip talebi ekranları için biçim yardımcıları (istemciye güvenli). 06 "Görsel dil": tutar "1.234,56 TL", tarih gg.aa.yyyy. */
export function tl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' TL'
}

/** "2026-03-01" → "01.03.2026". */
export function gunTR(iso: string | null | undefined): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—'
}
