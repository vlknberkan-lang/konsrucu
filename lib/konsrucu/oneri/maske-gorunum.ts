/**
 * KonsRücü — Ekranda maskeleme · lib/konsrucu/oneri/maske-gorunum.ts  (saf; SUNUCUDA çağrılır)
 *
 * Kişisel veri ekranda varsayılan maskelidir (TCKN, VKN, telefon, IBAN, e-posta, plaka). Öneri alıntıları belge
 * metninden kesildiği için bu verileri taşıyabilir; istemciye gitmeden önce burada maskelenir. Ham değer yalnız
 * "Göster" eylemiyle (oneri-actions.ts · oneriDegeriniGoster) ve Aktivite kaydıyla açılır.
 * Tespit, yapay zekâ maskeleyicisinin desen katmanıyla (lib/ai/maske.ts · desenTara) aynıdır.
 */
import { desenTara, normallestir, type JetonTuru } from '@/lib/ai/maske'
import { plakaMaskele } from './alanlar'

const MASKELENEN: ReadonlySet<JetonTuru> = new Set<JetonTuru>(['TCKN', 'VKN', 'TEL', 'IBAN', 'EPOSTA', 'PLAKA'])

function parcaMaskele(tur: JetonTuru, deger: string): string {
  const rakam = deger.replace(/\D/g, '')
  switch (tur) {
    case 'PLAKA': return plakaMaskele(deger)
    case 'IBAN': return `TR•• •••• •••• •••• ${rakam.slice(-4)}`
    case 'EPOSTA': return `${deger.slice(0, 1)}•••@•••`
    case 'TEL': return `••• ••• •• ${rakam.slice(-2)}`
    default: return `${'•'.repeat(Math.max(0, rakam.length - 2))}${rakam.slice(-2)}`
  }
}

/** Serbest metindeki kişisel verileri maskele (korunan bağlamdaki poliçe/dosya numaraları dokunulmaz). */
export function ekranMaskele(metin: string | null | undefined): string | null {
  if (metin == null) return null
  if (!metin) return metin
  const n = normallestir(metin)
  const bulgular = desenTara(n)
    .filter((b) => !b.korunan && MASKELENEN.has(b.tur))
    .sort((a, b) => a.bas - b.bas || b.son - a.son)
  let out = ''
  let i = 0
  for (const b of bulgular) {
    if (b.bas < i) continue
    out += n.slice(i, b.bas) + parcaMaskele(b.tur, n.slice(b.bas, b.son))
    i = b.son
  }
  return out + n.slice(i)
}
