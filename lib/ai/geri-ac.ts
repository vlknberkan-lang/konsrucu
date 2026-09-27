/**
 * KonsRücü — Jetonları gerçek değerlere çevirir · lib/ai/geri-ac.ts (saf; YALNIZ sunucuda, bellekte)
 *
 * rucu-hukuk-asistani/araclar/evrak-metin/geri_ac.py'nin TypeScript karşılığı (06, 5.6; S09).
 * Model jetonu biraz farklı yazmış olabilir: [KISI-1], [ KİŞİ - 1 ], [E-POSTA-2], en/em tire, bölünmez
 * tire, eksi işareti, alt çizgi, tiresiz boşluk, NFD 'KİŞİ', tam genişlik ［ ］ — hepsi açılır.
 * Açılamayan ya da jetona benzeyen her ifade (`(KİŞİ-1)`, `[KİŞİ-99]`) `bilinmeyen` listesine düşer:
 * çağıran bunu "açılmamış/yabancı jeton" uyarısı olarak gösterir (kırmızı kapı; 06, 5.6).
 */
import { katla } from './maske'

const TIRE = '[\\-\\u2010-\\u2015\\u2212\\uFE63\\uFF0D_]'
const KISI = 'K\\s*[İIıi]\\u0307?\\s*[ŞSşs]\\u0327?\\s*[İIıi]\\u0307?'
const TURLER = `(TCKN|VKN|TEL|IBAN|E\\s*${TIRE}?\\s*POSTA|PLAKA|${KISI}|ADRES)`
const NW = '[^\\p{L}\\p{N}_]' // Python \W
const ESNEK_KAYNAK = `[\\[\\uFF3B]\\s*${TURLER}\\s*${TIRE}?\\s*(\\d+)\\s*[\\]\\uFF3D]`
const ARTIK_KAYNAK =
  `[\\[\\uFF3B(\\uFF08{\\u27E6]\\s*(?:TCKN|VKN|TEL|IBAN|E${NW}{0,2}POSTA|PLAKA|K${NW}{0,2}[İIıi]${NW}{0,2}[ŞSşs]${NW}{0,2}[İIıi]` +
  `|ADRES)${NW}{0,3}\\d{1,5}\\s*[\\]\\uFF3D)\\uFF09}\\u27E7]`
const ESNEK_G = new RegExp(ESNEK_KAYNAK, 'giu')
const ARTIK_G = new RegExp(ARTIK_KAYNAK, 'giu')

function kanonikTur(tur: string): string {
  const k = katla(tur.normalize('NFC')).replace(/[^\p{L}\p{N}]/gu, '')
  return ({ kisi: 'KİŞİ', eposta: 'EPOSTA' } as Record<string, string>)[k] ?? k.toUpperCase()
}

export type GeriAcSonuc = { acik: string; sayi: number; bilinmeyen: string[] }

/** Döner: açılmış metin, açılan jeton sayısı, bilinmeyen/açılamayan jetonlar. */
export function geriAc(metin: string, eslesme: Readonly<Record<string, string>>): GeriAcSonuc {
  let sayi = 0
  const bilinmeyen: string[] = []
  // Artık kontrolü açılmadan ÖNCEKİ metinde yapılır (açılmış gerçek değer uyarıya yazılmasın)
  const taninan = [...metin.matchAll(ESNEK_G)].map((m) => [m.index!, m.index! + m[0].length] as const)
  for (const m of metin.matchAll(ARTIK_G)) {
    const bas = m.index!, son = bas + m[0].length
    if (taninan.some(([a, b]) => a < son && bas < b)) continue
    if (!bilinmeyen.includes(m[0])) bilinmeyen.push(m[0])
  }
  const acik = metin.replace(ESNEK_G, (tam: string, tur: string, no: string) => {
    const jeton = `[${kanonikTur(tur)}-${Number(no)}]`
    if (Object.prototype.hasOwnProperty.call(eslesme, jeton)) { sayi++; return eslesme[jeton] }
    if (!bilinmeyen.includes(tam)) bilinmeyen.push(tam)
    return tam
  })
  return { acik, sayi, bilinmeyen }
}

/** Metinde jeton biçiminde bir şey kalmış mı (açılmamış ya da yabancı jeton)? */
export function jetonKaldiMi(metin: string): boolean {
  return new RegExp(ESNEK_KAYNAK, 'iu').test(metin) || new RegExp(ARTIK_KAYNAK, 'iu').test(metin)
}

/** Derin geri açma: nesne/dizi içindeki bütün metin değerlerini açar (tool_use girdisi için). */
export function derinGeriAc(deger: unknown, eslesme: Readonly<Record<string, string>>, bilinmeyen: string[] = []): { deger: unknown; bilinmeyen: string[]; sayi: number } {
  let sayi = 0
  const gez = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = geriAc(v, eslesme)
      sayi += r.sayi
      for (const b of r.bilinmeyen) if (!bilinmeyen.includes(b)) bilinmeyen.push(b)
      return r.acik
    }
    if (Array.isArray(v)) return v.map(gez)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, gez(x)]))
    return v
  }
  return { deger: gez(deger), bilinmeyen, sayi }
}
