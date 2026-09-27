/**
 * KonsRücü — UYAP dava ayrıntısından icra ↔ dava ↔ arabuluculuk bağı · lib/konsrucu/senkron/ilgili-dosya.ts (saf)
 *
 * Kaynak (05): `dosyaAyrintiBilgileri_brd.ajx` → `ilgiliDosyaListesiStr`, ör.
 *   "Ankara 5. Genel İcra Dairesi 2026/49096, Ankara Arabuluculuk Daire Başkanlığı 2026/1234"
 * Eklenti ham metni gönderir, yorumu burası yapar (06 §4.3). Dava no ve arabuluculuk no ELLE GİRİLMEZ:
 * bu ayrıştırma bağ ÖNERİSİ üretir, bağı avukat onay kartında kurar.
 *
 * Kurallar:
 *  - Kimlik = daire + esas (esas tek başına kimlik değil; content.js ile aynı ilke).
 *  - Eşleşme tek dosyaysa TEK, birden çoksa COKLU (avukat seçer), hiç yoksa YOK ("sahipsiz dava").
 *  - Taraf kontrolü: müvekkil unvanı davacılar arasındaysa DAVACI, davalılar arasındaysa DAVALI (karşı taraf davası).
 */
import { esasCoz, type EsasNo } from '@/lib/konsrucu/dava/kayit'

/** AlanDegeri.alan — UYAP'ta bulunan, avukat onayı bekleyen dava bağı önerisi. */
export const DAVA_ADAYI_ALAN = 'davaAdayi'

export type IlgiliTur = 'ICRA' | 'ARABULUCULUK' | 'HUKUK' | 'DIGER'
export type IlgiliDosya = { tur: IlgiliTur; birim: string; esas: EsasNo | null; ham: string }

/** Türkçe güvenli küçük harf + sadeleştirme ("İ" → "i", noktalama boşluğa). */
export function trNorm(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr-TR')
    .replace(/[.,;:()"'’`]/g, ' ').replace(/\s+/g, ' ').trim()
}

function turBul(birim: string): IlgiliTur {
  const n = trNorm(birim)
  if (/arabulucu/.test(n)) return 'ARABULUCULUK'
  if (/icra hukuk/.test(n) || /mahkeme/.test(n) || /hukuk dairesi/.test(n)) return 'HUKUK'
  if (/icra (dairesi|müdürlüğü)|icra$|icra dair/.test(n)) return 'ICRA'
  return 'DIGER'
}

/** "A İcra Dairesi 2026/1, B Arabuluculuk 2026/2" → parçalar. Esas bulunamayan parça esas=null ile döner. */
export function ilgiliDosyaCoz(ham: string | null | undefined): IlgiliDosya[] {
  if (!ham) return []
  const metin = String(ham).replace(/\r?\n/g, ',')
  // Parça sınırı: esas numarasından sonra gelen virgül/noktalı virgül. Birim adında virgül beklenmez.
  const re = /([^,;]*?)(\d{4}\s*\/\s*\d{1,7})([^,;]*)/g
  const out: IlgiliDosya[] = []
  let m: RegExpExecArray | null
  let son = 0
  while ((m = re.exec(metin))) {
    const birim = m[1].replace(/^[\s,;]+/, '').replace(/\b(sayılı|numaralı|esas|no)\s*:?\s*$/i, '').trim()
    const parca = (m[0] ?? '').trim()
    out.push({ tur: turBul(birim), birim, esas: esasCoz(m[2]), ham: parca })
    son = re.lastIndex
  }
  const kalan = metin.slice(son).replace(/^[\s,;]+/, '').trim()
  if (kalan) for (const p of kalan.split(/[,;]/).map((x) => x.trim()).filter(Boolean)) out.push({ tur: turBul(p), birim: p, esas: null, ham: p })
  return out
}

/**
 * Daire adı karşılaştırması: "Ankara 5. Genel İcra Dairesi" ≈ "ANKARA 5. İCRA DAİRESİ" ≈ "Ankara 5 İcra".
 * Yer = numaradan (numarasızsa "icra"dan) önceki TÜM kelimeler: "İstanbul Anadolu 11." ≠ "İstanbul 11.".
 */
function daireAnahtar(s: string | null | undefined): { yer: string; no: string | null; tam: string } {
  const n = trNorm(s).replace(/(^| )genel( |$)/g, ' ').replace(/(^| )(dairesi|müdürlüğü|başkanlığı)( |$)/g, ' ').replace(/\s+/g, ' ').trim()
  const m = n.match(/^(.*?)\s*(\d{1,3})\s*icra/)
  if (m) return { yer: m[1].trim(), no: m[2], tam: n }
  return { yer: n.split(/\s*icra( |$)/)[0].trim(), no: null, tam: n }
}

export function daireEsit(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const x = daireAnahtar(a), y = daireAnahtar(b)
  if (!x.tam || !y.tam) return false
  if (x.tam === y.tam) return true
  return !!x.yer && x.yer === y.yer && x.no === y.no
}

export type IcraAday = { id: string; icraDosyaNo: string | null; icraDairesi: string | null; yetkiliIcra: string | null }
export type BagOnerisi = {
  durum: 'TEK' | 'COKLU' | 'YOK'
  dosyaIdler: string[]
  icra: IlgiliDosya | null
  arabuluculuk: IlgiliDosya | null
  /** daire bilinmeyen (programda boş) ama esası tutan dosyalar — zayıf eşleşme, onayda uyarı */
  zayif: boolean
}

/** İlgili dosyalardaki icra parçasını programın icra dosyalarıyla eşleştirir. */
export function davaBagOnerisi(ilgili: IlgiliDosya[], adaylar: IcraAday[]): BagOnerisi {
  const arabuluculuk = ilgili.find((x) => x.tur === 'ARABULUCULUK' && x.esas) ?? null
  const icralar = ilgili.filter((x) => x.tur === 'ICRA' && x.esas)
  const esasAyni = (a: EsasNo, ham: string | null) => { const e = esasCoz(ham); return !!e && e.yil === a.yil && e.sira === a.sira }
  for (const icra of icralar) {
    const esasTutan = adaylar.filter((d) => esasAyni(icra.esas!, d.icraDosyaNo))
    const daireTutan = esasTutan.filter((d) => daireEsit(icra.birim, d.icraDairesi) || daireEsit(icra.birim, d.yetkiliIcra))
    if (daireTutan.length) return { durum: daireTutan.length === 1 ? 'TEK' : 'COKLU', dosyaIdler: daireTutan.map((d) => d.id), icra, arabuluculuk, zayif: false }
    // programda daire boşsa esas tek başına zayıf eşleşmedir: öneri çıkar ama "daireyi kontrol edin" uyarısıyla
    const dairesiz = esasTutan.filter((d) => !d.icraDairesi && !d.yetkiliIcra)
    if (dairesiz.length) return { durum: dairesiz.length === 1 ? 'TEK' : 'COKLU', dosyaIdler: dairesiz.map((d) => d.id), icra, arabuluculuk, zayif: true }
  }
  return { durum: 'YOK', dosyaIdler: [], icra: icralar[0] ?? null, arabuluculuk, zayif: false }
}

export type UyapTaraf = { ad?: string | null; rol?: string | null }

/** Müvekkilin bu davadaki rolü. Unvan eşleşmesi ilk iki anlamlı kelimeyle yapılır ("ray sigorta"). */
export function rolumuzCoz(taraflar: UyapTaraf[], alacakliUnvan: string | null | undefined): 'DAVACI' | 'DAVALI' | null {
  const u = trNorm(alacakliUnvan).split(' ').filter((w) => w.length > 1 && !/^(a|anonim|şirketi|ş|aş|türk)$/.test(w)).slice(0, 2).join(' ')
  if (!u) return null
  for (const t of taraflar) {
    if (!trNorm(t.ad).includes(u)) continue
    const r = trNorm(t.rol)
    if (/davacı|davaci|başvuran/.test(r)) return 'DAVACI'
    if (/davalı|davali/.test(r)) return 'DAVALI'
  }
  return null
}

/** davaTurleriStr → Dava.tur (yalnız açık kalıplar; gerisi DIGER). */
export function davaTuruCoz(ham: string | null | undefined): 'ITIRAZIN_IPTALI' | 'ALACAK' | 'MENFI_TESPIT' | 'DIGER' | null {
  const n = trNorm(ham)
  if (!n) return null
  if (/itirazın iptali/.test(n)) return 'ITIRAZIN_IPTALI'
  if (/menfi tespit/.test(n)) return 'MENFI_TESPIT'
  if (/alacak/.test(n)) return 'ALACAK'
  return 'DIGER'
}

/** UYAP tarihleri: "22.10.2026", "22/10/2026 10:30", "2026-10-22T…", epoch ms. Geçersizse null. */
export function uyapTarih(v: unknown): Date | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) { const d = new Date(v); return isNaN(d.getTime()) ? null : d }
  const s = String(v).trim()
  const tr = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (tr) {
    const [, g, a, y, sa, dk] = tr
    // Türkiye saati (UTC+3, yaz saati yok) → UTC
    const d = new Date(Date.UTC(Number(y), Number(a) - 1, Number(g), sa ? Number(sa) - 3 : 9, dk ? Number(dk) : 0))
    return isNaN(d.getTime()) || Number(a) > 12 || Number(g) > 31 ? null : d
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s); return isNaN(d.getTime()) ? null : d }
  return null
}
