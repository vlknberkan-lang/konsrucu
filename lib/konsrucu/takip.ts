/**
 * KonsRücü — takip açıklaması footer'ı · lib/konsrucu/takip.ts (saf)
 * AI'ın ürettiği açıklamanın SONUNA eklenecek standart blok (alacaklı/MERSİS/IBAN/vekil + serbest footer).
 * Numaralar deterministik (AI'ya bırakılmaz) — Ayarlar'dan gelir.
 */
export type FooterAyar = {
  alacakliUnvan?: string | null
  mersis?: string | null
  iban?: string | null
  vekilAd?: string | null
  vekilBaro?: string | null
  vekilAdres?: string | null
  aciklamaFooter?: string | null
}

export function footerOlustur(a: FooterAyar | null | undefined): string {
  if (!a) return ''
  const satir: string[] = []
  if (a.alacakliUnvan) satir.push(`Alacaklı: ${a.alacakliUnvan}${a.mersis ? ` — MERSİS: ${a.mersis}` : ''}`)
  else if (a.mersis) satir.push(`MERSİS: ${a.mersis}`)
  if (a.iban) satir.push(`IBAN: ${a.iban}`)
  if (a.vekilAd) satir.push(`Vekil: ${a.vekilAd}${a.vekilBaro ? ` (${a.vekilBaro})` : ''}`)
  if (a.vekilAdres) satir.push(a.vekilAdres)
  if (a.aciklamaFooter) satir.push(a.aciklamaFooter.trim())
  return satir.join('\n')
}

/** Açıklama gövdesi + footer'ı birleştir (kopyalanacak tam metin). */
export function aciklamaTam(govde: string | null | undefined, footer: string): string {
  const g = (govde ?? '').trim()
  if (!footer) return g
  if (!g) return footer
  return `${g}\n\n${footer}`
}
