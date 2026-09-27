/**
 * KonsRücü — evrak metin hattı · küçük XML tarayıcı · lib/konsrucu/evrak-metin/xml.ts (saf)
 * UDF content.xml ve DOCX word/document.xml için yeterli, bağımlılıksız bir akış tarayıcısı: açılış/kapanış
 * etiketleri, metin ve CDATA (entity'ler çözülür); yorum, <?…?> ve DOCTYPE atlanır.
 * Node'da DOMParser yok; tarayıcıda da aynı kod çalışsın diye DOM kullanılmaz.
 * Kapanmamış CDATA/etiket/yorum → XmlBozuk fırlatır (çağıran HATA sonucuna çevirir).
 */

export type XmlOge =
  | { tur: 'ac'; ad: string; yerel: string; oz: Record<string, string>; kapali: boolean }
  | { tur: 'kapa'; ad: string; yerel: string }
  | { tur: 'metin'; deger: string }

export class XmlBozuk extends Error {
  constructor(mesaj: string) {
    super(mesaj)
    this.name = 'XmlBozuk'
  }
}

const ADLI: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** XML entity'lerini çöz (&lt; &#305; &#x131; …). Bilinmeyen adlı entity olduğu gibi kalır. */
export function entityCoz(s: string): string {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (tam, g: string) => {
    if (g[0] === '#') {
      const kod = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
      if (!Number.isFinite(kod) || kod < 0 || kod > 0x10ffff) return tam
      try { return String.fromCodePoint(kod) } catch { return tam }
    }
    return ADLI[g] ?? tam
  })
}

const yerelAd = (ad: string) => {
  const i = ad.indexOf(':')
  return (i >= 0 ? ad.slice(i + 1) : ad).toLowerCase()
}

function oznitelikler(govde: string): Record<string, string> {
  const oz: Record<string, string> = {}
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(govde))) oz[m[1]] = entityCoz(m[3] ?? m[4] ?? '')
  return oz
}

/** Etiketin kapanan '>' konumu (tırnak içindeki '>' sayılmaz). Bulunamazsa -1. */
function etiketSonu(xml: string, bas: number): number {
  let tirnak = ''
  for (let i = bas; i < xml.length; i++) {
    const c = xml[i]
    if (tirnak) {
      if (c === tirnak) tirnak = ''
    } else if (c === '"' || c === "'") {
      tirnak = c
    } else if (c === '>') {
      return i
    }
  }
  return -1
}

/** XML'i sırayla tara (üreteç). */
export function* xmlTara(xml: string): Generator<XmlOge> {
  let i = 0
  const n = xml.length
  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) {
      const kalan = xml.slice(i)
      if (kalan) yield { tur: 'metin', deger: entityCoz(kalan) }
      return
    }
    if (lt > i) yield { tur: 'metin', deger: entityCoz(xml.slice(i, lt)) }
    if (xml.startsWith('<![CDATA[', lt)) {
      const son = xml.indexOf(']]>', lt + 9)
      if (son < 0) throw new XmlBozuk('kapanmamış CDATA')
      yield { tur: 'metin', deger: xml.slice(lt + 9, son) }
      i = son + 3
      continue
    }
    if (xml.startsWith('<!--', lt)) {
      const son = xml.indexOf('-->', lt + 4)
      if (son < 0) throw new XmlBozuk('kapanmamış yorum')
      i = son + 3
      continue
    }
    if (xml.startsWith('<?', lt)) {
      const son = xml.indexOf('?>', lt + 2)
      if (son < 0) throw new XmlBozuk('kapanmamış işlem talimatı')
      i = son + 2
      continue
    }
    if (xml.startsWith('<!', lt)) {
      // DOCTYPE (iç altküme [ … ] olabilir)
      const kose = xml.indexOf('[', lt)
      const gt = xml.indexOf('>', lt)
      const son = kose >= 0 && gt >= 0 && kose < gt ? xml.indexOf(']>', kose) + 1 : gt
      if (son <= 0) throw new XmlBozuk('kapanmamış DOCTYPE')
      i = son + 1
      continue
    }
    const gt = etiketSonu(xml, lt + 1)
    if (gt < 0) throw new XmlBozuk('kapanmamış etiket')
    const govde = xml.slice(lt + 1, gt)
    i = gt + 1
    if (govde[0] === '/') {
      const ad = govde.slice(1).trim()
      yield { tur: 'kapa', ad, yerel: yerelAd(ad) }
      continue
    }
    const kapali = govde.endsWith('/')
    const ic = kapali ? govde.slice(0, -1) : govde
    const m = /^\s*([^\s/>]+)/.exec(ic)
    if (!m) throw new XmlBozuk('adsız etiket')
    const ad = m[1]
    yield { tur: 'ac', ad, yerel: yerelAd(ad), oz: oznitelikler(ic.slice(m[0].length)), kapali }
  }
}

/** XML bildirimindeki kodlamayı oku (<?xml … encoding="windows-1254"?>); yoksa null. */
export function xmlKodlama(bas: Uint8Array): string | null {
  const ilk = String.fromCharCode(...Array.from(bas.subarray(0, 200)))
  const m = /^\s*(?:\u{FEFF}|\xEF\xBB\xBF)?<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/u.exec(ilk)
  return m ? m[1].toLowerCase() : null
}
