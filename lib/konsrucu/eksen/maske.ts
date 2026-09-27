/**
 * KonsRücü — Ekran maskesi · lib/konsrucu/eksen/maske.ts (saf, client-safe)
 *
 * Kişisel veri ekranda varsayılan MASKELİDİR (06 §2 "Maskeleme": TCKN, VKN, telefon, IBAN). Onay kartlarında
 * mazbata ve evrak alıntıları gösterilirken bu fonksiyondan geçer. Tarih (gg.aa.yyyy) ve esas no (2026/123)
 * maskelenmez. Yapay zekâ maskelemesi (lib/ai/maske.ts, jetonlama) ayrı iştir; bu yalnız görüntüdür.
 */

const IBAN = /\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi
const TELEFON = /(?<![\d/.])(?:\+?90[\s-]?)?0?\s?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?![\d/.])/g
// TCKN (11) ve VKN (10): başka bir sayının parçası değilse (ondalıklı tutar, esas no, tarih hariç)
const KIMLIK = /(?<![\d/]|\d[.,])\d{10,11}(?![\d/]|[.,]\d)/g

export function ekranMaskele(metin: string | null | undefined): string {
  return String(metin ?? '')
    .replace(IBAN, (m) => `TR•• •••• •••• •••• •••• •••• ••${m.replace(/\s/g, '').slice(-2)}`)
    .replace(TELEFON, '0••• ••• •• ••')
    .replace(KIMLIK, (m) => `${m.slice(0, 2)}${'•'.repeat(m.length - 4)}${m.slice(-2)}`)
}
