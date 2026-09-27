/**
 * KonsRücü — Ekranda varsayılan maske · lib/konsrucu/dilekce-v2/ekran-maske.ts (saf; client-safe)
 *
 * Ortak kural: kişisel veri ekranda varsayılan maskeli (TCKN, telefon, IBAN). Olgu metinleri ve alıntılar belgeden
 * geldiği için bu değerleri içerebilir; kart ekranı bunları "Kişisel veriyi göster" seçilene kadar maskeler.
 * Yalnız görünümdür: kayıttaki değer değişmez.
 */

const nokta = (n: number) => '•'.repeat(Math.max(0, n))

export function ekranMaskele(metin: string | null | undefined): string {
  if (!metin) return ''
  return metin
    // IBAN (TR + 24 hane, boşluklu ya da bitişik) → son 4 hane
    .replace(/\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi, (m) => `TR${nokta(2)} ${nokta(4)} … ${m.replace(/\s/g, '').slice(-4)}`)
    // TCKN (11 hane, başka rakamla bitişik değil) → son 2 hane
    .replace(/(?<!\d)[1-9]\d{10}(?!\d)/g, (m) => `${nokta(9)}${m.slice(-2)}`)
    // Cep ve sabit telefon (0 5xx xxx xx xx, +90 …) → son 2 hane
    .replace(/(?<![\d•])(?:\+90[\s-]?)?\(?0?[2-5]\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g, (m) => {
      const d = m.replace(/\D/g, '')
      return d.length >= 10 ? `${nokta(d.length - 2)}${d.slice(-2)}` : m
    })
}
