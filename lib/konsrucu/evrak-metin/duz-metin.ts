/**
 * KonsRücü — evrak metin hattı · TXT / CSV / HTML · lib/konsrucu/evrak-metin/duz-metin.ts (saf)
 * Kodlama: UTF-8 (BOM'lu/BOM'suz), UTF-16, yoksa Windows-1254 (ortak.metniCoz).
 * CSV/TSV satırları "hücre | hücre" biçimine çevrilir (boş hücreler korunur; sütun bağlamı kaymasın).
 * HTML: script/style atılır, blok öğeler satır, tablo hücreleri "|" olur (cikar.py · html_metne).
 */
import { anlamliVar, cp1254Coz, metniCoz, sonuc, type MetinSonucu } from './ortak'
import { entityCoz } from './xml'

/** Basit CSV ayrıştırıcı (tırnaklı alan, kaçışlı tırnak ""). Ayraç ilk satırdan seçilir. */
export function csvTablo(metin: string): string | null {
  const ilk = metin.split('\n', 1)[0] ?? ''
  const adaylar = [';', ',', '\t', '|']
  const ayrac = adaylar.reduce((en, a) => (ilk.split(a).length > ilk.split(en).length ? a : en), adaylar[0])
  if (ilk.split(ayrac).length < 2) return null
  const satirlar: string[] = []
  let hucre = ''
  let sira: string[] = []
  let tirnak = false
  const bitir = () => {
    const h = sira.map((x) => x.split(/\s+/).join(' ').trim())
    while (h.length && !h[h.length - 1]) h.pop()
    if (h.length) satirlar.push(h.join(' | '))
    sira = []
  }
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i]
    if (tirnak) {
      if (c === '"') {
        if (metin[i + 1] === '"') { hucre += '"'; i++ } else tirnak = false
      } else hucre += c
    } else if (c === '"' && !hucre.trim()) {
      tirnak = true
      hucre = ''
    } else if (c === ayrac) {
      sira.push(hucre); hucre = ''
    } else if (c === '\n') {
      sira.push(hucre); hucre = ''; bitir()
    } else if (c !== '\r') {
      hucre += c
    }
  }
  if (hucre || sira.length) { sira.push(hucre); bitir() }
  return satirlar.join('\n')
}

/** Düz metin / CSV. */
export function txtMetni(veri: Uint8Array, dosyaAdi: string): MetinSonucu {
  const { metin: ham, uyari } = metniCoz(veri)
  const uyarilar = uyari ? [uyari] : []
  let metin = ham
  if (/\.(csv|tsv)$/i.test(dosyaAdi)) {
    const t = csvTablo(ham.replace(/\r\n?/g, '\n'))
    if (t != null) metin = t
  }
  if (!anlamliVar(metin)) return sonuc('TXT', 'BOS', { uyarilar: [...uyarilar, 'Metin dosyası boş'] })
  return sonuc('TXT', 'OKUNDU', { yontem: 'TXT', metin, uyarilar })
}

/** HTML'e özgü, Türkçe evrakta sık adlı entity'ler (XML'in beş entity'si ve sayısal olanlar entityCoz'da). */
const HTML_ENTITY: Record<string, string> = {
  nbsp: ' ', ccedil: 'ç', Ccedil: 'Ç', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', gbreve: 'ğ', Gbreve: 'Ğ',
  scedil: 'ş', Scedil: 'Ş', imath: 'ı', inodot: 'ı', Idot: 'İ', acirc: 'â', Acirc: 'Â', icirc: 'î', ucirc: 'û',
  laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  euro: '€', deg: '°', middot: '·', copy: '©', reg: '®', sect: '§', times: '×',
}
const htmlEntityCoz = (s: string) => entityCoz(s.replace(/&([A-Za-z]+);/g, (tam, ad: string) => HTML_ENTITY[ad] ?? tam))

const BLOK ='p|div|br|li|ul|ol|table|tr|h[1-6]|section|article|header|footer|title|dd|dt|pre|blockquote|hr'
const HUCRE_ISARET = '\u{E000}' // hücre başı (özel kullanım karakteri, geçici)

/** HTML → okunur metin (satır yapısı ve tablo hücreleri korunur). */
export function htmlMetne(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(new RegExp(`<\\/?(?:${BLOK})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<(?:td|th)\b[^>]*>/gi, HUCRE_ISARET)
    .replace(/<[^>]+>/g, '')
  s = htmlEntityCoz(s)
  const satirlar = s.split('\n').map((satir) => {
    if (satir.indexOf(HUCRE_ISARET) < 0) return satir.split(/\s+/).join(' ').trim()
    let p = satir.split(HUCRE_ISARET).map((x) => x.split(/\s+/).join(' ').trim())
    if (!p[0]) p = p.slice(1)
    while (p.length && !p[p.length - 1]) p.pop()
    return p.join(' | ')
  })
  return satirlar.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** HTML dosyası. Türkçe karakter bozulması (�) çoksa Windows-1254 ile yeniden çözülür (Tramer/ekspertiz HTML'leri). */
export function htmlMetni(veri: Uint8Array): MetinSonucu {
  let { metin: ham, uyari } = metniCoz(veri)
  if ((ham.match(/\u{FFFD}/gu) || []).length > 5) { ham = cp1254Coz(veri); uyari = 'Windows-1254 (Türkçe) olarak okundu' }
  const metin = htmlMetne(ham)
  const uyarilar = uyari ? [uyari] : []
  if (!anlamliVar(metin)) return sonuc('HTML', 'BOS', { uyarilar: [...uyarilar, 'HTML içeriği boş'] })
  return sonuc('HTML', 'OKUNDU', { yontem: 'HTML', metin, uyarilar })
}
