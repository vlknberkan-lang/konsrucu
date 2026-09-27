/**
 * KonsRücü — ekranda kişisel veri maskesi · lib/konsrucu/dava/maske.ts (saf, client-safe)
 *
 * Davalı adı (DavaTaraf.adHam), arabulucu adı, TCKN, telefon ve IBAN ekranda VARSAYILAN MASKELİ gösterilir
 * (06 §3.3 "(M)"). Tüzel kişi/kurum adı kişisel veri değildir ama tutarlılık için yalnız ilk kelime açık kalır.
 * Maskeyi açmak bir kullanıcı eylemidir (MaskeliMetin bileşeni); sunucu tam değeri yalnız yetkili ekrana verir.
 */

/** "Ahmet Yılmaz" → "A**** Y*****". */
export function adMaskele(ad: string | null | undefined): string {
  if (!ad) return '—'
  return ad
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((p) => (p.length <= 1 ? p : p[0] + '*'.repeat(Math.min(6, p.length - 1))))
    .join(' ')
}

/** TCKN/VKN: son 2 hane açık. */
export function kimlikMaskele(s: string | null | undefined): string {
  if (!s) return '—'
  const t = s.replace(/\s/g, '')
  return t.length <= 2 ? '**' : '*'.repeat(t.length - 2) + t.slice(-2)
}

/** Telefon: son 2 hane açık. */
export function telefonMaskele(s: string | null | undefined): string {
  if (!s) return '—'
  const d = s.replace(/\D/g, '')
  return d.length <= 2 ? '**' : `*** *** ** ${d.slice(-2)}`
}

/** IBAN: TR + son 4. */
export function ibanMaskele(s: string | null | undefined): string {
  if (!s) return '—'
  const t = s.replace(/\s/g, '').toUpperCase()
  return t.length <= 6 ? '****' : `${t.slice(0, 2)}** **** … ${t.slice(-4)}`
}
