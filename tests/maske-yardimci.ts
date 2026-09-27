/**
 * Maskeleme testleri için SENTETİK veri üreticileri (rucu-hukuk-asistani/araclar/evrak-metin/tests/yardimci.py).
 * Bütün kişi adları, TCKN'ler, telefonlar, IBAN'lar ve adresler uydurmadır; adlar Python araç testlerindeki
 * uydurma adlardır. TCKN'ler algoritmaya uygun ama tohumlu sözde-rastgele üretilir (gerçek kişiye ait değildir).
 */
import { tcknGecerli } from '@/lib/ai/maske'

/** Tohumlu sözde-rastgele üretici (mulberry32) — testler her çalıştırmada aynı değerleri üretir. */
export function tohumlu(tohum: number): () => number {
  let a = tohum >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function tcknUret(r: () => number): string {
  const tam = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))
  const d = [tam(1, 9), ...Array.from({ length: 8 }, () => tam(0, 9))]
  d.push((((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10)
  d.push(d.reduce((x, y) => x + y, 0) % 10)
  return d.join('')
}

export function gecersizTckn(t: string): string {
  return t.slice(0, -1) + String((Number(t[t.length - 1]) + 1) % 10)
}

/** Uydurma kişiler (liste). */
export const LISTE_KISILER = ['İlkay Işıkgöz', 'Ferhunde Bıçakçıoğlu', 'Oğuzhan Çamurlu Değirmenci']

/** TCKN algoritmasına uyan poliçe numarası (poliçe/hasar numaralarının ~%1'i böyledir). */
export function algoritmayaUyanPoliceNo(): string {
  for (let n = 10202400001; n < 10202499999; n++) if (tcknGecerli(String(n))) return String(n)
  throw new Error('bulunamadı')
}

/** Tarih + 3 haneli tutar dizisi TCKN algoritmasına uyan örnek ('GG.AA.YYYY TTT,00'). */
export function tarihTutarCakismasi(): string {
  for (let g = 10; g < 29; g++) {
    for (let t = 100; t < 1000; t++) {
      const gg = String(g).padStart(2, '0')
      if (tcknGecerli(`${gg}032025${t}`)) return `${gg}.03.2025 ${t},00`
    }
  }
  throw new Error('bulunamadı')
}

/** Yaygın örnek IBAN (mod-97 geçerli; banka dokümantasyon örneği, kişiye ait değil). */
export const ORNEK_IBAN = 'TR33 0006 1005 1978 6457 8413 26'

export const ayrik = (t: string, ayrac: string) => [t.slice(0, 3), t.slice(3, 6), t.slice(6, 9), t.slice(9)].join(ayrac)
