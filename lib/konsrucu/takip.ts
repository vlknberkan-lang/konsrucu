/**
 * KonsRücü — takip açıklaması footer'ı · lib/konsrucu/takip.ts (saf)
 * Açıklamanın SONUNA yalnız SERBEST footer (K/Partners iletişim satırı) eklenir.
 * Alacaklı/MERSİS/IBAN/vekil açıklamada TEKRARLANMAZ — bunlar UYAP'ın kendi alanlarında
 * (tevzi payload'ı `alacakli` nesnesi) gider; açıklamaya yazınca metin şişiyordu (Berkan 2026-07-07).
 */
export type FooterAyar = {
  aciklamaFooter?: string | null
}

export function footerOlustur(a: FooterAyar | null | undefined): string {
  return (a?.aciklamaFooter ?? '').trim()
}

/** Gövde footer'ı zaten içeriyor mu? (AI çıkarımı sona ekletir — ikinci kez yapıştırma.) */
export function footerIcerir(govde: string | null | undefined, footer: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
  const f = norm(footer)
  return !!f && norm(govde ?? '').includes(f)
}

/** Açıklama gövdesi + footer'ı birleştir (kopyalanacak tam metin). Footer gövdede varsa eklemez. */
export function aciklamaTam(govde: string | null | undefined, footer: string): string {
  const g = (govde ?? '').trim()
  if (!footer) return g
  if (!g) return footer
  if (footerIcerir(g, footer)) return g
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
