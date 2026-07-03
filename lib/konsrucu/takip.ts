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

/** Tarihi UYAP açıklaması için TR biçimine çevir (GG.AA.YYYY) ya da yer tutucu döndür. */
function trTarih(d: Date | string | null | undefined): string {
  if (!d) return '[kaza tarihi]'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(dt.getTime())) return '[kaza tarihi]'
  return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' })
}

export type AciklamaAlan = {
  kazaTarihi?: Date | string | null
  sigortaliPlaka?: string | null
  karsiPlaka?: string | null
  alacakliUnvan?: string | null
}

/**
 * Standart rücu takip açıklaması GÖVDESİNİ alanlardan deterministik üret (sabit kalıp; footer hariç).
 * Avukat alanları düzeltince "Şablondan üret" ile yeniden doldurmak için. DETAY VERMEZ (promil/tür yazmaz).
 */
export function aciklamaUret(p: AciklamaAlan): string {
  const tarih = trTarih(p.kazaTarihi)
  const alacakli = (p.alacakliUnvan ?? '').trim() || '[alacaklı sigorta şirketi]'
  const sig = (p.sigortaliPlaka ?? '').trim() || '[sigortalı plaka]'
  const karsi = (p.karsiPlaka ?? '').trim()
  const arac = karsi ? `${sig} plakalı araç ile ${karsi} plakalı araç arasında` : `${sig} plakalı araç ile`
  return `${tarih} tarihinde ${alacakli} nezdinde sigortalı bulunan ${arac} meydana gelen trafik kazası neticesinde sigortalıya ödenen tazminatın kusurlu taraftan rücu bedeline ilişkindir.`
}
