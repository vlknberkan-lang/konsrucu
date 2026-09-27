/**
 * KonsRücü — Kişisel veri maskeleyici · lib/ai/maske.ts (saf; sunucu + test)
 *
 * rucu-hukuk-asistani/araclar/evrak-metin/maskele.py'nin TypeScript karşılığı (06, 5.6; S09).
 * Yapay zekâ kullanmaz. Aynı değer her yerde aynı jetonu alır: [TCKN-1], [KİŞİ-2], [PLAKA-1] …
 *
 * Maskelenen türler: TCKN (kontrol haneli), VKN, TEL, IBAN, EPOSTA, PLAKA, KİŞİ, ADRES.
 * Korunanlar: tarih, tutar, yüzde, mahkeme/icra dairesi adı, esas/karar no, poliçe/hasar no, madde no,
 * sigorta şirketi, il/ilçe adı, Yargıtay/Danıştay daire atfı.
 *
 * KALICI EŞLEME TABLOSU YOKTUR: jetonlar bellekteki Maskeleyici'de, dosyadaki kayıtlardan deterministik
 * sırayla üretilir (lib/ai/cagri.ts · maskeleyiciKur). Geri açma aynı süreçte, bellekte yapılır.
 * Bu katman TAKMA ADLANDIRMADIR, anonimleştirme değildir; KVKK yükümlülükleri sürer.
 *
 * Python → JS farkları (bilinçli):
 *  - Python `\w` Unicode'dur; burada `[\p{L}\p{N}_]` (W sabiti), `[^\W_]` → `[\p{L}\p{N}]`.
 *  - Konumlar UTF-16 birimidir; katla() birim birim uzunluğu korur (Python'daki kod noktası eşdeğeri).
 *  - Dosya okuma/yazma (kaydet/yukle, kisileri_oku) yok; `eslesmedenKur` bellekteki eşlemeden kurar.
 */

// ───────────────────────────── regex yardımcıları ─────────────────────────────
/** Python `\w` (Unicode harf/rakam/alt çizgi) karakter sınıfı içeriği. */
const W = '\\p{L}\\p{N}_'
/** Python `[^\W_]` (harf ya da rakam). */
const HR = '\\p{L}\\p{N}'
const rx = (kaynak: string, bayrak = '') => new RegExp(kaynak, 'u' + bayrak)
/** Python re.escape karşılığı ('u' kipinde geçerli kaçışlar; '-' ve boşluk kaçırılmaz). */
export function kacis(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')
}
/** Yapışkan (sticky) eşleşme: Python `pattern.match(s, i)`. */
function yapisik(re: RegExp, s: string, i: number): RegExpExecArray | null {
  re.lastIndex = i
  return re.exec(s)
}
const buyukHarfMi = (c: string | undefined): boolean => !!c && c !== c.toLowerCase() && c === c.toUpperCase()
const rakamMi = (c: string | undefined): boolean => !!c && c >= '0' && c <= '9'
const bosluklaBol = (s: string): string[] => s.split(/\s+/u).filter(Boolean)
function sagKirp(s: string, k: string): string { let e = s.length; while (e > 0 && k.includes(s[e - 1])) e--; return s.slice(0, e) }
function solKirp(s: string, k: string): string { let b = 0; while (b < s.length && k.includes(s[b])) b++; return s.slice(b) }
const kirp = (s: string, k: string) => solKirp(sagKirp(s, k), k)
/** Python str.rfind(ch, 0, son). */
const rfind = (s: string, ch: string, son: number) => (son <= 0 ? -1 : s.lastIndexOf(ch, son - 1))
/** bisect_right / bisect_left */
function bisectSag(a: readonly number[], x: number): number { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (x < a[m]) h = m; else l = m + 1 } return l }
function bisectSol(a: readonly number[], x: number): number { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (a[m] < x) l = m + 1; else h = m } return l }
const uzunlugaGore = (a: string, b: string) => b.length - a.length // sorted(key=len, reverse=True) — kararlı

// ───────────────────────────── jetonlar ─────────────────────────────
export const JETON_TURLERI = ['TCKN', 'VKN', 'TEL', 'IBAN', 'EPOSTA', 'PLAKA', 'KİŞİ', 'ADRES'] as const
export type JetonTuru = typeof JETON_TURLERI[number]
const JETON_KAYNAK = '\\[(TCKN|VKN|TEL|IBAN|EPOSTA|PLAKA|KİŞİ|ADRES)-(\\d+)\\]'
/** Tek jeton araması (durumsuz). */
export const JETON_RE = rx(JETON_KAYNAK)
const JETON_G = rx(JETON_KAYNAK, 'g')
const JETON_TAM = rx('^' + JETON_KAYNAK + '$')

// ───────────────────────────── Türkçe harf işlemleri ─────────────────────────────
const TIRELER = '\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D'
const TAM_RAKAMLAR = Array.from({ length: 10 }, (_, i) => String.fromCharCode(0xff10 + i)).join('')
const kodla = (c: string) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
function harita(kaynak: string, hedef: string): { re: RegExp; m: Record<string, string> } {
  const m: Record<string, string> = {}
  for (let i = 0; i < kaynak.length; i++) m[kaynak[i]] = hedef[i]
  return { re: new RegExp('[' + Object.keys(m).map(kodla).join('') + ']', 'g'), m }
}
// ý/þ/ð: Türkçe ı/ş/ğ'nin Latin-1/WinAnsi ile yanlış eşlenmiş hâli (eski sistem PDF'leri)
const KATLA_H = harita('çğıöşüâîûýþð' + TIRELER + TAM_RAKAMLAR, 'cgiosuaiuisg' + '-'.repeat(TIRELER.length) + '0123456789')
// Desen görünümü: tireler '-', tam genişlik rakamlar ASCII, sekme boşluk (1:1, konum korunur)
const DUZ_H = harita(TIRELER + TAM_RAKAMLAR + '\t', '-'.repeat(TIRELER.length) + '0123456789' + ' ')

function harfHarf(s: string, f: (c: string) => string): string {
  let o = ''
  for (const c of s) { const d = f(c); o += d.length === c.length ? d : c }
  return o
}
/** Türkçe küçük harf: İ→i, I→ı. Uzunluğu korur ('İ'.toLowerCase() iki birim olur). */
export function trKucuk(s: string): string {
  const t = s.replace(/İ/g, 'i').replace(/I/g, 'ı')
  const k = t.toLowerCase()
  return k.length === t.length ? k : harfHarf(t, (c) => c.toLowerCase())
}
/** Türkçe büyük harf: i→İ, ı→I. */
export function trBuyuk(s: string): string {
  const t = s.replace(/i/g, 'İ').replace(/ı/g, 'I')
  const b = t.toUpperCase()
  return b.length === t.length ? b : harfHarf(t, (c) => c.toUpperCase())
}
/** Karşılaştırma için katlama: Türkçe küçük harf + ç/ğ/ı/ö/ş/ü → c/g/i/o/s/u, tireler '-'. Uzunluğu korur. */
export function katla(s: string): string {
  return trKucuk(s).replace(KATLA_H.re, (c) => KATLA_H.m[c])
}
function duz(s: string): string {
  return s.replace(DUZ_H.re, (c) => DUZ_H.m[c])
}

const NORMAL_SIL = /[\u0000\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g
const NORMAL_BOSLUK = /[\u00A0\u202F\u205F\u3000\u180E\u2000-\u200A]/g
const NORMAL_TIRE = /[\u2010\u2011\u2212]/g
const NORMAL_SATIR = /[\u2028\u2029\u0085]/g
/** NFC, satır sonu birliği, NUL / yumuşak tire / sıfır genişlikli karakter temizliği, özel boşluklar. */
export function normallestir(s: string | null | undefined): string {
  let t = (s ?? '').normalize('NFC')
  t = t.replace(/\r\n/g, '\n').replace(/[\r\f\v]/g, '\n')
  t = t.replace(NORMAL_SIL, '').replace(NORMAL_BOSLUK, ' ').replace(NORMAL_TIRE, '-').replace(NORMAL_SATIR, '\n')
  return t.split('i\u0307').join('i')
}
/** Dosya adını tarama için metne çevirir: '_' boşluk sayılır (uzunluk korunur). */
export function adGorunumu(ad: string): string {
  return normallestir(ad).replace(/_/g, ' ')
}

// ───────────────────────────── bulgu ve yardımcılar ─────────────────────────────
export type Bulgu = { tur: JetonTuru; bas: number; son: number; anahtar: string; deger: string; korunan: boolean }
const bulgu = (tur: JetonTuru, bas: number, son: number, anahtar: string, deger: string, korunan = false): Bulgu =>
  ({ tur, bas, son, anahtar, deger, korunan })

/** TCKN algoritma kontrolü (11 hane, ilk hane 0 değil, 10. ve 11. hane kontrol basamağı). */
export function tcknGecerli(r: string): boolean {
  if (!/^\d{11}$/.test(r) || r[0] === '0') return false
  const n = r.split('').map(Number)
  const d10 = (((n[0] + n[2] + n[4] + n[6] + n[8]) * 7 - (n[1] + n[3] + n[5] + n[7])) % 10 + 10) % 10
  if (d10 !== n[9]) return false
  return n.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === n[10]
}
/** TR IBAN'ın 24 hanesi için mod-97 kontrolü (TR öneki yazılmamış IBAN'ı tanımak için). */
export function ibanGecerli(r: string): boolean {
  if (!/^\d{24}$/.test(r)) return false
  let m = 0
  for (const c of r.slice(2) + '2927' + r.slice(0, 2)) m = (m * 10 + Number(c)) % 97
  return m === 1
}
const rakam = (s: string) => duz(s).replace(/\D/g, '')
export const tekBosluk = (s: string) => bosluklaBol(s).join(' ')

const TARIH_RE = rx('(?<!\\d)(?:0?[1-9]|[12]\\d|3[01])[./\\-](?:0?[1-9]|1[0-2])[./\\-](?:19|20)?\\d{2}(?!\\d)')
/** '10.03.2025 148' gibi tarih + tutar dizileri TCKN sanılmasın. */
const tarihIceriyor = (s: string) => TARIH_RE.test(s)

/** Aynı değerin farklı yazımlarını tek anahtara indirger (tutarlı jeton için). */
export function anahtarHesapla(tur: JetonTuru, deger: string): string {
  if (tur === 'TCKN' || tur === 'VKN') return rakam(deger)
  if (tur === 'TEL') return rakam(deger).slice(-10)
  if (tur === 'IBAN') return 'TR' + rakam(deger)
  if (tur === 'EPOSTA') return deger.replace(/\s+/gu, '').toLowerCase()
  if (tur === 'PLAKA') return deger.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  return katla(tekBosluk(deger))
}

// ───────────── etiketler: korunan (poliçe/hasar/esas … no) ve kişisel (TCKN, telefon, borçlu …) ─────────────
const KORUNAN_ETIKETLER = [
  'police', 'hasar', 'dosya', 'esas', 'karar', 'sozlesme', 'fatura', 'ihbar', 'referans',
  'siparis', 'makbuz', 'dekont', 'basvuru', 'takip', 'sasi', 'motor', 'seri', 'sicil',
  'mersis', 'evrak', 'barkod', 'kayit', 'tescil', 'ruhsat', 'sayi', 'sira', 'musteri',
  'abone', 'ilam', 'teklif', 'islem', 'tahsilat', 'odeme', 'rapor', 'ekspertiz', 'muallak',
]
const KISISEL_ETIKETLER = [
  'tckn', 'kimlik', 'tel', 'telefon', 'gsm', 'cep', 'faks', 'fax', 'mobil', 'iletisim', 'irtibat',
  'vergi', 'vkn', 'iban', 'hesap', 'borclu', 'davali', 'davaci', 'surucu', 'sigortali', 'sahibi',
  'maliki', 'adi', 'soyadi', 'soyad', 'isim', 'plaka', 'plakali', 'isleten', 'tc', 'muhatap',
  'nufus', 'ehliyet', 'eposta', 'adres',
]
const KORUNAN_ETIKET_G = rx(`(?<![${W}.])(?:${KORUNAN_ETIKETLER.join('|')})[${W}]{0,4}(?![${W}])`, 'g')
const KISISEL_ETIKET_KAYNAK = `(?<![${W}.])(?:t\\.\\s?c\\.(?:\\s?k\\.\\s?n\\.?)?|v\\.\\s?k\\.\\s?n\\.?|e-posta|(?:${KISISEL_ETIKETLER.join('|')})[${W}]{0,4}(?![${W}]))`
const KISISEL_ETIKET_G = rx(KISISEL_ETIKET_KAYNAK, 'g')
const KISISEL_ETIKET_RE = rx(KISISEL_ETIKET_KAYNAK)
const KORUNAN_ETIKET_RE = rx(`(?<![${W}.])(?:${KORUNAN_ETIKETLER.join('|')})[${W}]{0,4}(?![${W}])`)
const ETIKET_ARASI_RE = rx(`^[ \\t:.\\-#/()'’=]*(?:(?:no|nosu|numarasi|numara|num|nr|numarali|sayisi|kodu)(?![${W}])[ \\t:.\\-#/()'’=]*)?$`)
const TEL_ETIKET_RE = rx('(?<![a-z])(?:tel|telefon|gsm|cep|mobil|faks|fax|iletisim|irtibat)')
const VKN_ETIKET_RE = rx('(?<![a-z])(?:vkn|v\\.k\\.n|vergi)')
const IBAN_ETIKET_RE = rx('(?<![a-z])iban')

/** Numaranın hemen önündeki (aynı satır/hücre) etiket: 'korunan', 'kisisel' ya da null. */
function satirIciKarar(parca: string): 'korunan' | 'kisisel' | null {
  let sonK: RegExpMatchArray | null = null
  let sonS: RegExpMatchArray | null = null
  for (const m of parca.matchAll(KORUNAN_ETIKET_G)) sonK = m
  for (const m of parca.matchAll(KISISEL_ETIKET_G)) sonS = m
  const son = (m: RegExpMatchArray) => (m.index ?? 0) + m[0].length
  if (sonK && (sonS === null || son(sonS) <= son(sonK))) {
    return ETIKET_ARASI_RE.test(parca.slice(son(sonK))) ? 'korunan' : null
  }
  if (sonS && ETIKET_ARASI_RE.test(parca.slice(son(sonS)))) return 'kisisel'
  return null
}

/** Sütun başlığı / etiket hücresi: kişisel etiket her zaman önce gelir (güvenli taraf). */
function etiketTuru(etiket: string): 'korunan' | 'kisisel' | null {
  if (KISISEL_ETIKET_RE.test(etiket)) return 'kisisel'
  if (KORUNAN_ETIKET_RE.test(etiket)) return 'korunan'
  return null
}

// ───────────────────────────── tablo yapısı (' | ' ile birleştirilmiş satırlar) ─────────────────────────────
const GENEL_BASLIKLAR = [
  'tutar', 'alacak', 'borc', 'bakiye', 'tarih', 'durum', 'aciklama', 'adres', 'ilce', 'sira',
  'unvan', 'mail', 'miktar', 'faiz', 'masraf', 'harc', 'asil', 'toplam', 'doviz', 'adet', 'konu',
  'taraf', 'mahkeme', 'icra', 'daire', 'marka', 'model', 'sube', 'banka', 'numara', 'ucret', 'bedel',
  'oran', 'vade', 'sonuc', 'statu', 'sigorta', 'alacakli', 'vekil', 'tanik', 'eksper',
]
// Kısa başlık sözcükleri yalnız tam kelime olarak sayılır ('İl' başlığı ≠ 'Ilgın' adı, 'Ad' ≠ 'Ada')
const KISA_BASLIKLAR = ['il', 'ili', 'no', 'nosu', 'ad', 'adi', 'tur', 'turu', 'tip', 'tipi', 'rol', 'rolu',
  'yil', 'yili', 'not', 'notu', 'notlar', 'tel', 'cep', 'gsm', 'fax', 'tc', 'vkn', 'kod', 'kodu']
const BASLIK_SOZLUK_RE = rx(
  '(?<![a-z0-9])(?:(?:' +
    Array.from(new Set([...KORUNAN_ETIKETLER, ...KISISEL_ETIKETLER, ...GENEL_BASLIKLAR])).filter((e) => e.length > 3).sort(uzunlugaGore).join('|') +
    `)[${W}]{0,4}|(?:` + [...KISA_BASLIKLAR].sort(uzunlugaGore).join('|') + '))(?![a-z0-9])',
)
const SAF_ETIKET_EK = new Set([
  'no', 'nosu', 'numarasi', 'numara', 'num', 'nr', 'numarali', 'kodu', 'sayisi', 've', 'ile', 'veya',
  'kasko', 'trafik', 'zmms', 'zorunlu', 'mali', 'sorumluluk', 'sigorta', 'sigortasi', 'arac',
  'aracin', 'kisi', 'kisinin', 'bilgisi', 'bilgileri', 'turu', 'tipi', 'sinifi', 'unvani', 'unvan',
  'ticari', 'ettiren', 'eden', 'goren', 'karsi', 'taraf',
])
const SAF_ETIKET_KOK = Array.from(new Set([...KORUNAN_ETIKETLER, ...KISISEL_ETIKETLER])).sort(uzunlugaGore)

/** Hücre yalnız etiketten mi oluşuyor ('Poliçe No', 'T.C. Kimlik No:', 'Telefon')? (katlanmış metin) */
function safEtiketMi(h0: string): boolean {
  let h = h0.trim()
  if (!h || h.length > 60 || /\d/.test(h) || JETON_RE.test(h)) return false
  h = h.replace(/(?:[a-z]\.){1,4}/g, ' ') // t.c., v.k.n.
  const kelimeler = h.match(/\p{L}+/gu) ?? []
  if (!kelimeler.length) return false
  let etiketVar = false
  for (const k of kelimeler) {
    if (SAF_ETIKET_EK.has(k)) continue
    const kok = SAF_ETIKET_KOK.some((e) => k.startsWith(e) && k.length - e.length <= 4)
    if (!kok && !AD_ETIKET_TAM.test(k)) return false
    etiketVar = true
  }
  return etiketVar
}

function baslikSatiriMi(hucreler: string[]): boolean {
  const dolu = hucreler.map((h) => h.trim()).filter(Boolean)
  if (dolu.length < 2) return false
  let etiketli = 0
  for (const h of dolu) {
    if ((h.match(/\d/g) ?? []).length > 2 || bosluklaBol(h).length > 6 || h.includes('@') || h.includes('[')) return false
    if (!/\p{L}/u.test(h)) return false
    if (BASLIK_SOZLUK_RE.test(h)) etiketli++
  }
  return etiketli >= 2 && etiketli * 2 >= dolu.length
}

type Hucre = { bas: number; son: number; baslik: string; sol: string; baslikSatiri: boolean }
type Tablo = { baslar: number[]; hucreler: Hucre[] }
// Python lru_cache karşılığı; küçük tutulur (belge metni sürecin belleğinde gereğinden uzun kalmasın).
const tabloOnbellek = new Map<string, Tablo>()
function tablo(katli: string): Tablo {
  const onceki = tabloOnbellek.get(katli)
  if (onceki) return onceki
  const satirlar: [number, string][] = []
  let ofset = 0
  for (const s of katli.split('\n')) { satirlar.push([ofset, s]); ofset += s.length + 1 }
  const hucreler: Hucre[] = []
  let i = 0
  while (i < satirlar.length) {
    if (!satirlar[i][1].includes(' | ')) { i++; continue }
    const blok: [number, number, string][][] = []
    while (i < satirlar.length && satirlar[i][1].includes(' | ')) {
      const [bas, s] = satirlar[i]
      const parcalar: [number, number, string][] = []
      let j = 0
      for (const p of s.split(' | ')) { parcalar.push([bas + j, bas + j + p.length, p]); j += p.length + 3 }
      blok.push(parcalar)
      i++
    }
    let baslikNo: number | null = null
    for (let n = 0; n < Math.min(3, blok.length); n++) if (baslikSatiriMi(blok[n].map((p) => p[2]))) { baslikNo = n; break }
    blok.forEach((sira, n) => {
      const basliklar = baslikNo !== null && n > baslikNo ? blok[baslikNo] : null
      sira.forEach(([b, e], k) => {
        const baslik = basliklar && k < basliklar.length ? basliklar[k][2].trim() : ''
        let sol = k > 0 ? sira[k - 1][2].trim() : ''
        sol = safEtiketMi(sol) ? sol : ''
        hucreler.push({ bas: b, son: e, baslik, sol, baslikSatiri: n === baslikNo })
      })
    })
  }
  const t = { baslar: hucreler.map((h) => h.bas), hucreler }
  tabloOnbellek.set(katli, t)
  if (tabloOnbellek.size > 4) tabloOnbellek.delete(tabloOnbellek.keys().next().value as string)
  return t
}

/** Tablo önbelleğini boşaltır: belge metni istek bittikten sonra modül belleğinde tutulmasın. */
export function tabloOnbellegiTemizle(): void {
  tabloOnbellek.clear()
}

function hucreBul(katli: string, konum: number): Hucre | null {
  const { baslar, hucreler } = tablo(katli)
  const i = bisectSag(baslar, konum) - 1
  if (i >= 0 && hucreler[i].bas <= konum && konum <= hucreler[i].son) return hucreler[i]
  return null
}

/**
 * Numaranın bağlamı: 'korunan' (poliçe/hasar/esas no …), 'kisisel' ya da null.
 * Bağlam satır sonunu ve tablo hücresi sınırını aşmaz. Hücrenin başındaki değer için sütun başlığı,
 * yoksa soldaki (yalnız etiketten oluşan) hücre bakılır.
 */
function baglamKarari(katli: string, bas: number, pencere = 40): 'korunan' | 'kisisel' | null {
  const h = hucreBul(katli, bas)
  if (h) {
    const on = katli.slice(h.bas, bas)
    const karar = satirIciKarar(on.slice(-pencere))
    if (karar) return karar
    if (kirp(on, ' \t:()') === '') {
      for (const etiket of [h.baslik, h.sol]) {
        if (etiket) { const t = etiketTuru(etiket); if (t) return t }
      }
    }
    return null
  }
  const satirBas = rfind(katli, '\n', bas) + 1
  return satirIciKarar(katli.slice(Math.max(satirBas, bas - pencere), bas))
}
const korunanBaglamMi = (katli: string, bas: number) => baglamKarari(katli, bas) === 'korunan'

// ───────────── desen tabanlı bulucular (metin: normalleştirilmiş özgün, katli: katla(metin)) ─────────────
const EPOSTA_G = rx(`(?<![${W}.+\\-])[${W}.+\\-]+[ \\t]?@[ \\t]?[${W}\\-]+(?:\\.[${W}\\-]+)*\\.[A-Za-z]{2,}(?![${W}\\-])`, 'g')
function bulEposta(metin: string): Bulgu[] {
  return [...metin.matchAll(EPOSTA_G)].map((m) =>
    bulgu('EPOSTA', m.index!, m.index! + m[0].length, anahtarHesapla('EPOSTA', m[0]), m[0].replace(/\s+/gu, '')))
}

const IBAN_ARA = '(?:[ \\t]{0,3}-?[ \\t]{0,3}|[ \\t]*\\n[ \\t]*)'
const IBAN_G = rx(`(?<![A-Za-z0-9])[Tt][Rr]${IBAN_ARA}\\d(?:${IBAN_ARA}\\d){23}(?!\\d)`, 'g')
const IBAN_CIPLAK_G = rx(`(?=((?<![A-Za-z0-9])\\d(?:${IBAN_ARA}\\d){23}(?!\\d)))`, 'g')
const IBAN_ONCESI_RE = rx(`(?<![a-z])iban[${W}]{0,4}(?![${W}])[^\\d\\n]{0,25}(?:\\n[^\\d\\n]{0,10})?$`)
function ibanBicimle(r: string): string {
  const s = 'TR' + r
  const o: string[] = []
  for (let i = 0; i < s.length; i += 4) o.push(s.slice(i, i + 4))
  return o.join(' ')
}
function bulIban(metin: string, katli: string): Bulgu[] {
  const g = duz(metin)
  const sonuc: Bulgu[] = []
  for (const m of g.matchAll(IBAN_G)) {
    const d = rakam(m[0])
    sonuc.push(bulgu('IBAN', m.index!, m.index! + m[0].length, 'TR' + d, ibanBicimle(d)))
  }
  // TR öneki yazılmamış IBAN: 'IBAN' etiketinden sonra ya da mod-97 kontrolüne uyuyorsa
  let son = -1
  for (const m of g.matchAll(IBAN_CIPLAK_G)) {
    const bas = m.index!, bit = bas + m[1].length
    if (bas < son) continue
    const d = rakam(m[1])
    const etiketli = IBAN_ONCESI_RE.test(katli.slice(Math.max(0, bas - 45), bas))
    if (etiketli || ibanGecerli(d)) { sonuc.push(bulgu('IBAN', bas, bit, 'TR' + d, ibanBicimle(d))); son = bit }
  }
  return sonuc
}

const TCKN_AYRAC = '(?:[ ]{1,3}|[ ]{0,2}[.\\-][ ]{0,2}|[ ]*-?[ ]*\\n[ ]*)'
const TCKN_BITISIK_G = rx('(?<!\\d)\\d{11}(?!\\d)', 'g')
const TCKN_AYRIK_G = rx(`(?=((?<!\\d)\\d(?:${TCKN_AYRAC}?\\d){10}(?!\\d)))`, 'g')
const KOMSU_ONCE_RE = rx('\\d[ ]{0,3}[.\\-]?[ ]{0,3}$')
const KOMSU_SONRA_RE = rx('^[ ]{0,3}[.\\-]?[ ]{0,3}\\d')
const VIRGUL_RAKAM = /^,\d/

function tcknAdayiUygun(g: string, bas: number, son: number, ayrik: boolean): boolean {
  if (VIRGUL_RAKAM.test(g.slice(son, son + 2))) return false // '...,00' → tutar
  if (!ayrik) return true
  if (tarihIceriyor(g.slice(bas, son))) return false
  // aynı satırda daha uzun bir rakam dizisinin parçası mı?
  const satirBas = rfind(g, '\n', bas) + 1
  let satirSon = g.indexOf('\n', son)
  satirSon = satirSon < 0 ? g.length : satirSon
  if (KOMSU_ONCE_RE.test(g.slice(Math.max(satirBas, bas - 7), bas))) return false
  if (KOMSU_SONRA_RE.test(g.slice(son, Math.min(satirSon, son + 7)))) return false
  return true
}

function bulTckn(metin: string, katli: string): Bulgu[] {
  const g = duz(metin)
  const adaylar = new Map<string, [number, number]>()
  for (const m of g.matchAll(TCKN_BITISIK_G)) {
    const bas = m.index!, son = bas + m[0].length
    if (tcknGecerli(m[0]) && tcknAdayiUygun(g, bas, son, false)) adaylar.set(`${bas}:${son}`, [bas, son])
  }
  for (const m of g.matchAll(TCKN_AYRIK_G)) {
    const bas = m.index!, son = bas + m[1].length
    if (tcknGecerli(rakam(m[1])) && tcknAdayiUygun(g, bas, son, true)) adaylar.set(`${bas}:${son}`, [bas, son])
  }
  const sonuc: Bulgu[] = []
  let bitis = -1
  for (const [bas, son] of [...adaylar.values()].sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    if (bas < bitis) continue
    const d = rakam(g.slice(bas, son))
    sonuc.push(bulgu('TCKN', bas, son, d, d, korunanBaglamMi(katli, bas)))
    bitis = son
  }
  return sonuc
}

const VKN_AYRAC = '[ \\t]{0,2}[.\\-]?[ \\t]{0,2}'
const VKN_G = rx(
  `(?<![${W}.])(?:v\\.?\\s?k\\.?\\s?n\\.?|vergi(?:\\s+kimlik)?(?:\\s+(?:no|numarasi|numara|nosu)\\.?)?)(?![a-z])` +
    `[^\\d\\n]{0,40}?(?:\\n[^\\d\\n]{0,15}?)?(?<!\\d)(\\d{3}${VKN_AYRAC}\\d{3}${VKN_AYRAC}\\d{4})(?!\\d)(?![ \\t.\\-]\\d)`,
  'g',
)
function bulVkn(_metin: string, katli: string): Bulgu[] {
  // Grup 1 eşleşmenin sonundadır (ardından yalnız ileri bakışlar): başlangıcı = bitiş − grup uzunluğu
  return [...katli.matchAll(VKN_G)].map((m) => {
    const son = m.index! + m[0].length, bas = son - m[1].length
    const d = rakam(m[1])
    return bulgu('VKN', bas, son, d, d)
  })
}

const A = '(?:[ ]{0,2}[\\-./][ ]{0,2}|[ ]{1,2})?'
const TEL_GLER = [
  rx(`(?<![\\d+])(?:\\+[ ]?|00[ ]?)90${A}\\(?0?\\d{3}\\)?${A}\\d{3}${A}\\d{2}${A}\\d{2}(?!\\d)`, 'g'),
  rx(`(?<![\\d+])90${A}\\(?0?5\\d{2}\\)?${A}\\d{3}${A}\\d{2}${A}\\d{2}(?!\\d)`, 'g'),
  rx(`(?<![\\d(])\\(?0[ ]?\\(?[2-58]\\d{2}\\)?${A}\\d{3}${A}\\d{2}${A}\\d{2}(?!\\d)`, 'g'),
  rx(`(?<![\\d(])\\([2-58]\\d{2}\\)${A}\\d{3}${A}\\d{2}${A}\\d{2}(?!\\d)`, 'g'),
]
const TEL_AYR = '(?:[ \\t]{0,2}[\\-./][ \\t]{0,2}|[ \\t]{1,2})?'
const TEL_BAGLAM_G = rx(
  `(?<![${W}.])(?:tel|telefon|gsm|cep|mobil|faks|fax|iletisim|irtibat)[${W}]{0,6}(?![${W}])` +
    `[^\\d\\n]{0,20}?(?:\\n[^\\d\\n]{0,10}?)?(?<!\\d)` +
    `([2-58]\\d{2}${TEL_AYR}\\d{3}${TEL_AYR}\\d{2}${TEL_AYR}\\d{2})(?!\\d)`,
  'g',
)
function bulTel(metin: string, katli: string): Bulgu[] {
  const g = duz(metin)
  const sonuc: Bulgu[] = []
  for (const re of TEL_GLER) {
    for (const m of g.matchAll(re)) {
      const bas = m.index!, son = bas + m[0].length
      const deger = metin.slice(bas, son)
      // Poliçe/dosya numarası gibi bitişik yazılmış ve korunan etiketli numara korunur;
      // boşluklu/ayraçlı yazılmış telefon her zaman maskelenir.
      const korunan = /^\d+$/.test(g.slice(bas, son)) && korunanBaglamMi(katli, bas)
      sonuc.push(bulgu('TEL', bas, son, anahtarHesapla('TEL', deger), tekBosluk(deger), korunan))
    }
  }
  for (const m of katli.matchAll(TEL_BAGLAM_G)) {
    const son = m.index! + m[0].length, bas = son - m[1].length
    const deger = metin.slice(bas, son)
    sonuc.push(bulgu('TEL', bas, son, anahtarHesapla('TEL', deger), tekBosluk(deger)))
  }
  return sonuc
}

const PLAKA_AYRAC = '(?:[ ]{1,3}|[ ]*-[ ]*)?'
const PLAKA_G = rx(`(?<![${HR}])(0[1-9]|[1-7]\\d|8[01])${PLAKA_AYRAC}([A-Za-z]{1,3})${PLAKA_AYRAC}(\\d{2,4})(?![${HR}])`, 'g')
const PLAKA_SONU_RE = rx('(?:0[1-9]|[1-7]\\d|8[01])[ \\-]?[A-Za-z]{1,3}[ \\-]?\\d{2,4}$')
const PLAKA_BASI_RE = rx('^[ ]?(?:0[1-9]|[1-7]\\d|8[01])[ \\-]?[A-Za-z]{1,3}[ \\-]?\\d{2,4}(?!\\d)')
const PLAKA_HER_ZAMAN_DEGIL = new Set(['tl', 'ytl', 'usd', 'eur', 'gbp', 'chf', 'try', 'kg', 'km', 'cc', 'hp',
  'kw', 'no', 'adt', 'kdv', 'otv', 'mtv', 'sgk', 'bsmv'])
const PLAKA_KUCUKSE_DEGIL = new Set(['ay', 'yil', 'gun', 'cm', 'mm', 'm', 'lt', 'l', 'gr', 'g', 'ton', 'ha',
  'sa', 'dk', 'sn', 'kat', 'x', 'e', 'k', 's', 've', 'de', 'da', 'ile', 'ml',
  'mg', 'dm', 'lira', 'a', 'b', 'c', 'd', 't', 'adet', 'kr', 'krs', 'yas'])
const AY_KISALTMA = new Set(['oca', 'sub', 'mar', 'nis', 'may', 'haz', 'tem', 'agu', 'eyl', 'eki', 'kas', 'ara'])
const SURE_KELIMELERI = new Set(['gun', 'gunu', 'ay', 'yil', 'hafta', 'saat', 'dakika', 'sn', 'dk'])
const DAIRE_ONCESI = new Set(['yargitay', 'danistay', 'bam', 'bim', 'bolge', 'istinaf', 'hgk', 'cgk', 'idd', 'vddk'])

function plakaGecerli(g: string, katli: string, m: RegExpMatchArray): boolean {
  const [, il, harf, rakamlar] = m
  const bas = m.index!, son = bas + m[0].length
  const kucuk = katla(harf)
  if (PLAKA_HER_ZAMAN_DEGIL.has(kucuk)) return false
  if (!/^[A-Z]+$/.test(harf) && PLAKA_KUCUKSE_DEGIL.has(kucuk)) return false
  // '15 Kas 2024', '20-TEM-2025': kısaltılmış ay adlı tarih (3 harf + 4 hane plaka biçimi değildir)
  if (AY_KISALTMA.has(kucuk) && Number(il) <= 31 &&
    ((rakamlar.length === 4 && ['19', '20'].includes(rakamlar.slice(0, 2))) || /^[A-Z][a-z]*$/.test(harf))) return false
  const onceki = katli.slice(Math.max(0, bas - 20), bas).match(/\p{L}+/gu) ?? []
  const sonraki = /^[ \t]*(\p{L}+)/u.exec(katli.slice(son, son + 15))
  // '1 YIL 10 AY 20 GÜN' gibi süreler
  if (SURE_KELIMELERI.has(kucuk) && ((sonraki && SURE_KELIMELERI.has(sonraki[1])) || (onceki.length && SURE_KELIMELERI.has(onceki[onceki.length - 1])))) return false
  // 'Yargıtay 17 HD 2019/4567 E.' gibi daire atıfları
  if (onceki.length && DAIRE_ONCESI.has(onceki[onceki.length - 1])) return false
  const once = bas > 0 ? g[bas - 1] : ''
  if (once && '/.,%'.includes(once)) {
    if (!'/,'.includes(once) || !PLAKA_SONU_RE.test(g.slice(Math.max(0, bas - 13), bas - 1))) return false
  }
  const sonra = g.slice(son, son + 2)
  if (/^[/.,]\d/.test(sonra)) {
    if (!'/,'.includes(sonra[0]) || !PLAKA_BASI_RE.test(g.slice(son + 1, son + 14))) return false
  }
  return true
}

function bulPlaka(metin: string, katli: string): Bulgu[] {
  const g = duz(metin)
  const sonuc: Bulgu[] = []
  for (const m of g.matchAll(PLAKA_G)) {
    if (!plakaGecerli(g, katli, m)) continue
    const deger = `${m[1]} ${m[2].toUpperCase()} ${m[3]}`
    sonuc.push(bulgu('PLAKA', m.index!, m.index! + m[0].length, anahtarHesapla('PLAKA', deger), deger))
  }
  return sonuc
}

function telRakamiMi(d: string): boolean {
  return (d.length === 10 && '23458'.includes(d[0])) || (d.length === 11 && d[0] === '0' && '23458'.includes(d[1])) ||
    (d.length === 12 && d.slice(0, 2) === '90' && '23458'.includes(d[2]))
}

/** Etiketi sütun başlığında ya da soldaki hücrede olan telefon / VKN / IBAN değerleri
 *  (Excel'de sayı olarak saklanıp baştaki 0'ı silinmiş telefon, TR'siz IBAN …). */
function bulTablo(metin: string, katli: string): Bulgu[] {
  const g = duz(metin)
  const sonuc: Bulgu[] = []
  for (const h of tablo(katli).hucreler) {
    const etiketler = [h.baslik, h.sol].filter(Boolean)
    if (!etiketler.length || h.baslikSatiri) continue
    const ham = g.slice(h.bas, h.son)
    const deger = ham.trim()
    if (!deger || !/^(?:[Tt][Rr])?[\d \t.\-()/+]+$/.test(deger)) continue
    const bas = h.bas + (ham.length - ham.trimStart().length)
    const son = bas + deger.length
    const d = rakam(deger)
    for (const etiket of etiketler) {
      if (TEL_ETIKET_RE.test(etiket) && telRakamiMi(d)) sonuc.push(bulgu('TEL', bas, son, d.slice(-10), tekBosluk(deger)))
      else if (VKN_ETIKET_RE.test(etiket) && d.length === 10) sonuc.push(bulgu('VKN', bas, son, d, d))
      else if (IBAN_ETIKET_RE.test(etiket) && d.length === 24) sonuc.push(bulgu('IBAN', bas, son, 'TR' + d, ibanBicimle(d)))
      else continue
      break
    }
  }
  return sonuc
}

type Bulucu = (metin: string, katli: string) => Bulgu[]
const DESEN_BULUCULARI: Bulucu[] = [bulEposta, bulIban, bulTckn, bulVkn, bulTel, bulPlaka, bulTablo]

/** Tüm desen bulucularını çalıştırır (korunan bağlamdakiler korunan=true ile döner). */
export function desenTara(metin0: string): Bulgu[] {
  const metin = normallestir(metin0)
  const katli = katla(metin)
  return DESEN_BULUCULARI.flatMap((f) => f(metin, katli))
}

// ───────────────────────────── adres (en iyi çaba) ─────────────────────────────
const ADRES_GUCLU_G = rx(
  `(?<![${W}])(?:(?:mahallesi|caddesi|sokagi|sokak|bulvari|apartmani)(?![${W}])|(?:mah|cad|sok|bulv|blv|apt)(?:\\.|(?![${W}]))|(?:mh|cd|sk)\\.)`,
  'g',
)
const ADRES_DEGER = '\\d+[a-z]?(?:\\s*[/\\-]\\s*[a-z0-9]+)?'
const ADRES_ZAYIF_G = rx(
  `(?<![${W}])(?:no\\s*:\\s*${ADRES_DEGER}|no\\s+${ADRES_DEGER}|d\\s*:\\s*${ADRES_DEGER}` +
    `|daire\\s*:?\\s*${ADRES_DEGER}|kat\\s*:?\\s*\\d+|[a-z]\\s*blok|blok\\s*:?\\s*[a-z0-9]+)(?![${W}])`,
  'g',
)
const MAHKEME_KELIMELERI = new Set([
  'asliye', 'ticaret', 'hukuk', 'ceza', 'sulh', 'tuketici', 'is', 'aile', 'idare', 'idari', 'vergi',
  'bolge', 'agir', 'icra', 'kadastro', 'haklar', 'denizcilik', 'cocuk', 'infaz', 'anayasa',
  'askeri', 'fikri', 'sinai', 'ihtisas', 'mahkemesi', 'adliye', 'hakimligi',
])
const ADRES_GERI_DUR = new Set([
  'adres', 'adresi', 'adresinde', 'adresindeki', 'adresimiz', 'ikametgah', 'ikametgahi',
  'yerlesim', 'yeri', 'tebligat', 'mukim', 'sakin', 'is', 'ev', 'davali', 'borclu', 'davaci',
])

function geriGenislet(satir: string, bas: number): number {
  let j = bas
  for (let t = 0; t < 4; t++) {
    let k = j
    while (k > 0 && ' \t'.includes(satir[k - 1])) k--
    if (k === 0 || (k === j && j !== bas)) break
    let tBas = k
    while (tBas > 0 && !/\s/u.test(satir[tBas - 1])) tBas--
    const tok = satir.slice(tBas, k)
    if (!tok || ',;:|)]"”'.includes(tok[tok.length - 1]) || '[("“'.includes(tok[0]) || tok.includes(']') || tok.includes('[')) break
    if (!(buyukHarfMi(tok[0]) || rakamMi(tok[0]))) break
    if (ADRES_GERI_DUR.has(kirp(katla(tok), '.:'))) break
    j = tBas
  }
  return j
}

type Oge = [number, number, boolean]
function bulAdres(metin: string, katli: string): Bulgu[] {
  const sonuc: Bulgu[] = []
  let ofset = 0
  for (const satir of metin.split('\n')) {
    const kSatir = katli.slice(ofset, ofset + satir.length)
    const ogeler: Oge[] = []
    for (const m of kSatir.matchAll(ADRES_GUCLU_G)) {
      const bas = m.index!, son = bas + m[0].length
      const kelime = sagKirp(m[0], '.')
      if (kelime === 'mah' || kelime === 'mh') {
        const onceki = kSatir.slice(Math.max(0, bas - 30), bas).match(rx(`[${W}]+`, 'g')) ?? []
        const sonraki = rx(`^\\s*([${W}]+)`).exec(kSatir.slice(son))
        if (onceki.length && MAHKEME_KELIMELERI.has(onceki[onceki.length - 1])) continue
        if (sonraki && (sonraki[1].startsWith('hakim') || sonraki[1].startsWith('baskan'))) continue
      }
      ogeler.push([bas, son, true])
    }
    for (const m of kSatir.matchAll(ADRES_ZAYIF_G)) ogeler.push([m.index!, m.index! + m[0].length, false])
    if (ogeler.some((o) => o[2])) {
      ogeler.sort((a, b) => a[0] - b[0] || a[1] - b[1] || Number(a[2]) - Number(b[2]))
      const kumeler: Oge[][] = []
      let kume: Oge[] = [ogeler[0]]
      for (const oge of ogeler.slice(1)) {
        const sonOge = kume[kume.length - 1]
        const bosluk = satir.slice(sonOge[1], oge[0])
        if (oge[0] < sonOge[1]) {
          if (oge[1] > sonOge[1]) kume[kume.length - 1] = [sonOge[0], oge[1], sonOge[2] || oge[2]]
          continue
        }
        if (bosluk.length <= 45 && !/[;[\]|]/.test(bosluk)) kume.push(oge)
        else { kumeler.push(kume); kume = [oge] }
      }
      kumeler.push(kume)
      for (const k of kumeler) {
        const guclu = k.filter((o) => o[2]).length
        // Kişisel adres: kapı no/daire/kat içerir ya da mahalle+cadde/sokak gibi 2 öğe.
        // Tek başına 'Bağdat Caddesi' gibi kamusal yer adı (kaza yeri) maskelenmez.
        if (!guclu || k.length < 2) continue
        let bas = k[0][0]
        if (k[0][2]) bas = geriGenislet(satir, bas)
        const son = k[k.length - 1][1]
        const deger = satir.slice(bas, son).trim()
        if (deger.length < 4) continue
        sonuc.push(bulgu('ADRES', ofset + bas, ofset + son, anahtarHesapla('ADRES', deger), tekBosluk(deger)))
      }
    }
    ofset += satir.length + 1
  }
  return sonuc
}

// ───────────────────── kişi adı sezgisi (etiketten sonra gelen 2-4 büyük harfli kelime) ─────────────────────
const AD_ETIKETLERI = [
  'davali', 'davalilar', 'davaci', 'davacilar', 'borclu', 'borclular', 'alacakli',
  'surucu', 'surucusu', 'sigortali', 'sigorta ettiren', 'ruhsat sahibi', 'arac sahibi',
  'arac maliki', 'isleten', 'adi soyadi', 'adi ve soyadi', 'adi soyad', 'ad soyad', 'ad soyadi',
  'ad ve soyad', 'sayin', 'musteki', 'supheli', 'sanik', 'magdur', 'tanik', 'yarali',
  'vefat eden', 'muris', 'mirasci', 'mirascilari', 'karsi taraf', 'kusurlu', 'av.', 'avukat',
  'vekili', 'vekil', 'kanuni temsilcisi', 'temsilcisi', 'kefil', 'hak sahibi',
  'zarar goren', 'kazazede', 'yolcu', 'yaya',
  'muhatap', 'muhatabi', 'talep eden', 'hasar goren', 'ihbar eden', 'ihtar eden', 'ihtar edilen',
  'beyan eden', 'vekil eden', 'tebellug eden', 'alici', 'eksper', 'bilirkisi', 'mal sahibi',
  'sikayetci', 'sikayet eden', 'basvuran', 'basvuru sahibi',
]
// Tek kelimelik ad/soyad alanları (nüfus kaydı, ehliyet, form): 'Adı : ŞÜKRÜ', 'Soyadı | KAYA'
const TEK_KELIME_ETIKETLERI = ['adi', 'ad', 'ismi', 'isim', 'soyadi', 'soyad', 'baba adi', 'ana adi',
  'anne adi', 'kizlik soyadi', 'onceki soyadi', 'ikinci adi']
const TEK_KUME = new Set(TEK_KELIME_ETIKETLERI)
const TEK_ONCESI_UYGUN = new Set([
  'baba', 'ana', 'anne', 'es', 'esi', 'esinin', 'kizlik', 'onceki', 'ikinci', 'ilk', 'sigortali',
  'sigortalinin', 'surucu', 'surucunun', 'borclu', 'borclunun', 'davali', 'davalinin', 'davaci',
  'davacinin', 'muhatap', 'muhatabin', 'tanik', 'tanigin', 'yarali', 'yaralinin', 'musteri',
  'musterinin', 'kisi', 'kisinin', 'sahibi', 'sahibinin', 'malik', 'malikin', 'isleten',
  'isletenin', 'alici', 'alicinin', 'vekil', 'vekilin', 'hasta', 'hastanin', 'kefil', 'kefilin',
])
const UNVAN_EKI = `(?:[ \\t]*/[ \\t]*(?:ticari[ \\t]+)?unvan[${W}]{0,3})?`
const AD_ETIKET_KAYNAK =
  `(?<![${W}.])(?:` +
  [...AD_ETIKETLERI, ...TEK_KELIME_ETIKETLERI].sort(uzunlugaGore)
    .map((e) => e.split(' ').map(kacis).join('[\\s\\-/]+')).join('|') +
  ')' + UNVAN_EKI + `(?![${W}])`
const AD_ETIKET_G = rx(AD_ETIKET_KAYNAK, 'g')
const AD_ETIKET_Y = rx(AD_ETIKET_KAYNAK, 'y')
const AD_ETIKET_RE = rx(AD_ETIKET_KAYNAK)
const AD_ETIKET_TAM = rx('^(?:' + AD_ETIKET_KAYNAK + ')$')
const ETIKET_ONEK_Y = rx('(?:[ \\t]*(?:\\([^)\\n]{0,40}\\)|\\.{2,}|…+|[:：\\-–—|]))*[ \\t]*(?:\\n[ \\t]*)?', 'y')
const KELIME_Y = rx('\\S+', 'y')
const KELIME_ARASI_Y = rx('[ \\t]*(?:\\n[ \\t]*)?', 'y')
const BUYUK = 'A-ZÇĞİÖŞÜÂÎÛÝÞÐ'
const AD_KELIME_RE = rx(`^[${BUYUK}][A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîûÝÞÐýþð]+$`)

const ATLANABILIR = new Set([
  'av', 'avukat', 'vekili', 'vekil', 'sayin', 'sn', 'bay', 'bayan', 'dr', 'prof', 'doc', 'arac',
  'aracin', 'surucusu', 'surucu', 'sahibi', 'maliki', 'isleteni', 'mirascisi', 'mirascilari',
  'merhum', 'muris', 'sigortali', 'borclu', 'davali', 'davaci', 'karsi', 'arac surucusu', 'uzm',
  'op', 'ogr', 'gor',
])
const KISALTMA = new Set(['av', 'sn', 'dr', 'prof', 'doc', 'uzm', 'op', 'ogr', 'gor'])
const FIRMA_TAM = new Set([
  'as', 'ao', 'ltd', 'sti', 'ltdsti', 'tic', 'san', 've', 'koop', 'inc', 'llc', 'gmbh', 'co',
  'holding', 'grup', 'group', 'hazine', 'hazinesi', 'vakfi', 'vakif', 'dernegi', 'kurumu',
  'bankasi', 'bank', 'limited', 'anonim', 'sirketi', 'sirket', 'sirketler', 'firma', 'firmasi',
  'fon', 'fonu', 'turk', 'milli', 'genel', 'idaresi', 'odasi', 'kurulu', 'kurul', 'bolge',
])
const FIRMA_ONEK = [
  'sigorta', 'reasurans', 'emeklilik', 'holding', 'ticaret', 'sanayi', 'insaat', 'turizm',
  'otomotiv', 'nakliyat', 'nakliye', 'lojistik', 'tasimacilik', 'petrol', 'gida', 'enerji',
  'finans', 'leasing', 'faktoring', 'belediye', 'bakanl', 'mudurl', 'baskanl', 'universite',
  'hastane', 'kooperatif', 'pazarlama', 'danismanlik', 'yazilim', 'bilisim', 'teknoloji',
  'elektrik', 'tekstil', 'madencilik', 'ithalat', 'ihracat', 'katilim', 'yatirim', 'sirket',
  'mahkeme', 'noterl',
  // kurum/kuruluş adları (Güvence Hesabı, Hakem Heyeti, Uyuşmazlık Hakemi …) kişi sayılmaz
  'hesab', 'heyet', 'hakem', 'guvence', 'uyusmazlik', 'tahkim', 'komisyon', 'emniyet', 'nufus',
  'tapu', 'valilig', 'kaymakam', 'jandarma', 'polis', 'savcil', 'sendika', 'birlig', 'sandig',
  'merkez', 'daire', 'fakulte', 'klinik', 'eczane', 'idare', 'kurum', 'federasyon', 'sekreterl',
  'dernek', 'cumhuriyet', 'turkiye', 'genel mud',
]
const ILLER = new Set([
  'adana', 'adiyaman', 'afyonkarahisar', 'afyon', 'agri', 'amasya', 'ankara', 'antalya', 'artvin',
  'balikesir', 'bilecik', 'bingol', 'bitlis', 'bolu', 'burdur', 'bursa', 'canakkale', 'cankiri',
  'corum', 'denizli', 'diyarbakir', 'edirne', 'elazig', 'erzincan', 'erzurum', 'eskisehir',
  'gaziantep', 'giresun', 'gumushane', 'hakkari', 'hatay', 'isparta', 'mersin', 'icel', 'istanbul',
  'izmir', 'kars', 'kastamonu', 'kayseri', 'kirklareli', 'kirsehir', 'kocaeli', 'konya', 'kutahya',
  'malatya', 'manisa', 'kahramanmaras', 'mardin', 'mugla', 'mus', 'nevsehir', 'nigde', 'ordu',
  'rize', 'sakarya', 'samsun', 'siirt', 'sinop', 'sivas', 'tekirdag', 'tokat', 'trabzon',
  'tunceli', 'sanliurfa', 'usak', 'van', 'yozgat', 'zonguldak', 'aksaray', 'bayburt', 'karaman',
  'kirikkale', 'batman', 'sirnak', 'bartin', 'ardahan', 'igdir', 'yalova', 'karabuk', 'kilis',
  'osmaniye', 'duzce', 'anadolu', 'trakya', 'turkiye', 'kktc',
])
const AYLAR_GUNLER = [
  'ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim',
  'kasim', 'aralik', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar',
]
const AD_DEGIL = new Set([
  've', 'ile', 'veya', 'bu', 'su', 'olan', 'olarak', 'adina', 'hakkinda', 'tarafindan', 'tc',
  'no', 'nolu', 'numarali', 'tel', 'gsm', 'baba', 'ana', 'anne', 'adi', 'soyadi', 'dogum',
  'yeri', 'uyrugu', 'cinsiyeti', 'medeni', 'hali', 'is', 'sn', 'bey', 'hanim', 'bay', 'bayan',
  'dr', 'prof', 'doc', 'muhterem', 'tckn', 'vkn', 'iban', 'adsoyad', 'konu', 'konusu', 'sonuc', 'istem',
  'taraf', 'taraflar', 'lira', 'tl', 'faiz', 'faizi', 'mali', 'yan', 'vs', 'vb', 'dava', 'davasi',
  'icin', 'gibi', 'ait', 'aittir', 'hk', 'ilgi', 'ek', 'ekler', 'eki', 'not', 'tarih', 'tarihi',
  'sayi', 'ozet', 'harc', 'gider', 'masraf', 'bilgi', 'bilgileri', 'kimlik', 'unvan', 'unvani',
  'sube', 'vergi', 'dairesi', 'daire', 'hesap', 'mahalle', 'cadde', 'sokak', 'il', 'ilce',
  'kaza', 'yer', 'saat', 'gun', 'ay', 'yil', 'sirket', 'yetkili', 'temsilci', 'merkez',
  'genel', 'mudur', 'mudurlugu', 'a', 'an', 'ad', 'avukat', 'av', 'vekili', 'vekil', 'dosya',
  'esas', 'karar', 'police', 'hasar', 'plaka', 'arac', 'yok', 'var', 'evet', 'hayir',
  'birlikte', 'aleyhine', 'lehine', 'bakiye', 'toplam', 'tutar', 'tutari', 'bedel', 'bedeli',
  'olay', 'trafik', 'kusur', 'kusuru', 'rucu', 'tazminat', 'zorunlu', 'kasko',
  'sorumluluk', 'teminat', 'limit', 'hukuki', 'sebepler', 'deliller', 'aciklamalar', 'talep',
  'netice', 'resmi', 'ihtiyati', 'haciz', 'icra', 'ilami', 'ilamsiz', 'takip', 'odeme', 'emri',
  'sicil', 'son', 'durum', 'durumu', 'tip', 'tipi', 'tur', 'turu', 'sira', 'numara', 'numarasi',
  'notlar', 'rol', 'rolu', 'liste', 'listesi', 'ozeti', 'email', 'eposta', 'posta', 'isim', 'ismi',
  'soyad', 'sayfa', 'tablo', 'satir', 'sutun', 'kod', 'kodu', 'adet', 'oran', 'orani',
  ...AYLAR_GUNLER,
])
const AD_DEGIL_ONEK = [
  'mahkeme', 'hakim', 'baskan', 'mudurl', 'icra', 'sigorta', 'sirket', 'vekil', 'avukat',
  'surucu', 'sigortal', 'belge', 'kusur', 'tutanak', 'tutanag', 'davaci', 'davali', 'borclu',
  'alacakl', 'hazine', 'belediye', 'bakanlik', 'bakanlig', 'kurum', 'bolge', 'noter', 'savcil',
  'ticaret', 'hukuk', 'ceza', 'adliye', 'asliye', 'tuketici', 'tarih', 'adres', 'telefon',
  'kimlik', 'dogum', 'plaka', 'arac', 'ruhsat', 'polic', 'hasar', 'dosya', 'esas', 'karar',
  'tutar', 'bedel', 'masraf', 'ekspertiz', 'bilirkis', 'rapor', 'dilekce', 'davanin', 'davaya',
  'davada', 'davay', 'talep', 'itiraz', 'odeme', 'tebligat', 'teblig', 'vekalet', 'muvekkil',
  'aciklama', 'sonuc', 'delil', 'madde', 'kanun', 'yonetmelik', 'genelge', 'karayol',
  'trafik', 'teminat', 'hukuki', 'sebep', 'mahalle', 'cadde', 'sokak', 'bulvar', 'apartman',
  'cumhuriyet', 'basvuru', 'sayin', 'turkiye', 'ilgili', 'yukarida', 'asagida', 'hakkinda',
  'tazminat', 'rucu', 'zarar', 'hizmet', 'istinaf', 'temyiz', 'yargitay', 'danistay',
  'anayasa', 'gazete', 'karsi', 'sahib', 'malik', 'isleten', 'yetkil',
  'temsilc', 'mirasc', 'tanik', 'musteki', 'supheli', 'sanik', 'magdur', 'ilam',
  'kaza', 'olay', 'yaral', 'vefat', 'olum', 'yangin', 'tespit', 'beyan', 'ifade', 'imza', 'taraf',
  'fotokopi', 'fotograf', 'goruntu', 'eksper', 'muhatab', 'tebellug', 'ihtar', 'ihbar',
]
// Aynı zamanda sık kullanılan sözcük olan adlar: tek başına geçişi ancak güçlü bağlamda maskelenir
const YAYGIN_KELIME_ADLAR = new Set([
  'umut', 'deniz', 'baris', 'ozgur', 'dogan', 'gunes', 'can', 'nur', 'bahar', 'ekin', 'irmak', 'ulku',
  'sevgi', 'hayat', 'yildiz', 'aslan', 'arslan', 'kaplan', 'gul', 'nese', 'sevinc', 'huzur', 'bulut',
  'yagmur', 'derya', 'ceylan', 'inci', 'ipek', 'mercan', 'elmas', 'altin', 'demir', 'kaya', 'ates',
  'toprak', 'ova', 'nil', 'ada', 'doga', 'ilke', 'onur', 'metin', 'kemal', 'cemal', 'hilal', 'dilek',
  'umit', 'murat', 'cagri', 'isik', 'safak', 'tan', 'seher', 'zafer', 'erdem', 'sevda', 'hasret',
  'kader', 'devrim', 'cihan', 'dunya', 'alev', 'basak', 'cicek', 'lale', 'menekse', 'yasemin',
  'ferah', 'gonca', 'kutlu', 'mutlu', 'saadet', 'sukran', 'seref', 'serif', 'temel', 'tuna', 'ugur',
  'yuksel', 'zeki', 'adalet', 'hikmet', 'kerem', 'mehtap', 'ruzgar', 'sefa', 'safa', 'serap',
  'vefa', 'yigit', 'cesur', 'bulbul', 'sahin', 'kartal', 'tufan', 'yalcin', 'ozlem', 'hulya',
  'berk', 'bora', 'poyraz', 'kivanc', 'cansu', 'ilkay',
])

/** Kelime şirket/kurum adı parçası mı ('A.Ş.', 'Ltd.', 'Sigorta', 'Müdürlüğü' …)? */
export function firmaMi(kelime: string): boolean {
  const f = katla(kelime).replace(/\./g, '')
  return FIRMA_TAM.has(f) || FIRMA_ONEK.some((o) => f.startsWith(o))
}

function adKelimesiMi(kelime: string): boolean {
  if (!AD_KELIME_RE.test(kelime)) return false
  const f = katla(kelime)
  if (!/[aeiou]/.test(f)) return false // sesli harfsiz kısaltma (TCKN, VKN, GSM) ad değildir
  return !(AD_DEGIL.has(f) || ILLER.has(f) || AD_DEGIL_ONEK.some((o) => f.startsWith(o)))
}

/** Hücre değeri bir kişi adı mı (2-4 ad kelimesi; tek kelimelik alanlarda 1-3)? */
function adDizisi(deger: string, tek = false): string | null {
  const kelimeler = bosluklaBol(deger)
  if (!kelimeler.length || kelimeler.some(firmaMi)) return null
  let j = 0
  while (j < kelimeler.length && j < 3 && ATLANABILIR.has(katla(kelimeler[j]).replace(/\./g, ''))) j++
  const ad = kelimeler.slice(j)
  if (!ad.length || !ad.every(adKelimesiMi)) return null
  const [alt, ust] = tek ? [1, 3] : [2, 4]
  return alt <= ad.length && ad.length <= ust ? ad.join(' ') : null
}

function etiketAdi(eslesen: string): string {
  return eslesen.split(/[\s\-/]+/u).join(' ').replace(rx(`[ \\t]*/[ \\t]*(?:ticari[ \\t]+)?unvan[${W}]*$`), '')
}

const BELIRSIZ_TEK_ETIKET = new Set(['adi', 'ad', 'ismi', 'isim', 'soyadi', 'soyad'])

function tekEtiketUygun(katli: string, mBas: number, onek: string, etiket: string): boolean {
  if (!/[:：|\n]|\.{2,}|…/.test(onek)) return false
  if (!BELIRSIZ_TEK_ETIKET.has(etiket)) return true // 'Baba Adı', 'Kızlık Soyadı' … her zaman kişi alanı
  const satirBas = rfind(katli, '\n', mBas) + 1
  const once = katli.slice(satirBas, mBas)
  const onceki = once.match(/[a-z]+/g) ?? []
  // alan başı: satır başı, hücre başı ya da önceki alandan 2+ boşluk / sekme ile ayrılmış
  const sagi = sagKirp(once, ' \t')
  if (!onceki.length || sagi.endsWith('|') || sagi.endsWith(':') || /(?:[ ]{2,}|\t)$/.test(once)) return true
  // 'Şirket Adı:', 'Dosya Adı:' … kişi alanı değildir; yalnız 'Sürücünün Adı', 'Eşinin Adı' gibi
  return TEK_ONCESI_UYGUN.has(onceki[onceki.length - 1])
}

type AdSpan = [string, number, number]
type DiziOgesi = [string, boolean, boolean, number, number] // sade, kes, kesme, bas, son

/** Etiketin bittiği yerden sonra gelen kişi adını bulur. Döner: [ad, bas, son] ya da null. */
function etiketSonrasiAdSpan(metin: string, katli: string, i0: number, tek = false, baslikSatiri = false): AdSpan | null {
  const om = yapisik(ETIKET_ONEK_Y, metin, i0)!
  const onek = om[0]
  if (onek.includes('|') && baslikSatiri) return null // tablo başlık satırında bir sonraki hücre de başlıktır
  let i = i0 + onek.length
  const dizi: DiziOgesi[] = []
  let satirGecildi = false
  while (dizi.length < 10 && i < metin.length) {
    const m = yapisik(KELIME_Y, metin, i)
    if (!m) break
    const mBas = m.index, mSon = m.index + m[0].length
    if (yapisik(AD_ETIKET_Y, katli, mBas) && !KISALTMA.has(sagKirp(katla(m[0]), '.:'))) break // yeni alan etiketi
    let temiz = m[0]
    let kes = false, kesme = false
    const ap = /['’]/.exec(temiz)
    if (ap) { temiz = temiz.slice(0, ap.index); kes = true; kesme = true }
    let sade = sagKirp(temiz, '.,;:!?)"”»')
    if (sade !== temiz) {
      if ([...temiz.slice(sade.length)].some((c) => ',;:!?)"”»'.includes(c))) kes = true
      else if (!KISALTMA.has(katla(sade))) kes = true
    }
    const onKirp = sade.length - solKirp(sade, '("“«').length
    sade = sade.slice(onKirp)
    if (!sade || !buyukHarfMi(sade[0])) break
    dizi.push([sade, kes, kesme, mBas + onKirp, mBas + onKirp + sade.length])
    if (kes) break
    const b = yapisik(KELIME_ARASI_Y, metin, mSon)!
    if (b.index + b[0].length === mSon) break
    if (b[0].includes('\n')) {
      if (satirGecildi || dizi.length !== 1) break
      satirGecildi = true
    }
    i = b.index + b[0].length
  }
  if (dizi.some(([s]) => firmaMi(s))) return null
  let j = 0
  while (j < dizi.length && j < 3 && ATLANABILIR.has(katla(dizi[j][0]).replace(/\./g, ''))) j++
  const ad: DiziOgesi[] = []
  for (const oge of dizi.slice(j)) { if (!adKelimesiMi(oge[0])) break; ad.push(oge) }
  const kalan = dizi.length - j
  if (ad.length > 4 || (ad.length === kalan && kalan > 4)) return null
  const [alt, ust] = tek ? [1, 3] : [2, 4]
  if ((alt <= ad.length && ad.length <= ust) || (ad.length === 1 && ad[0][2])) { // tek kelime + kesme: 'Davalı Kaya'nın'
    return [ad.map((o) => o[0]).join(' '), ad[0][3], ad[ad.length - 1][4]]
  }
  return null
}

const KISISEL_SAYI_BASLIK_RE = rx('(?<![a-z])(?:tckn|kimlik|tel|telefon|gsm|vergi|vkn|iban|no|plaka|adres)')

/** [ad, bas, son] üçlüleri: etiketten sonra gelen ve sütun başlığı ad etiketi olan adlar. */
function etiketliAdlar(metin: string, katli: string): AdSpan[] {
  const sonuc: AdSpan[] = []
  for (const m of katli.matchAll(AD_ETIKET_G)) {
    const bas = m.index!, son = bas + m[0].length
    const etiket = etiketAdi(m[0])
    const tek = TEK_KUME.has(etiket)
    const onek = yapisik(ETIKET_ONEK_Y, metin, son)![0]
    if (tek && !tekEtiketUygun(katli, bas, onek, etiket)) continue
    const h = hucreBul(katli, bas)
    const s = etiketSonrasiAdSpan(metin, katli, son, tek, !!(h && h.baslikSatiri))
    if (s) sonuc.push(s)
  }
  for (const h of tablo(katli).hucreler) {
    if (!h.baslik || h.baslikSatiri) continue
    const bm = AD_ETIKET_RE.exec(h.baslik)
    if (!bm || KISISEL_SAYI_BASLIK_RE.test(h.baslik)) continue
    const ham = metin.slice(h.bas, h.son)
    const ad = adDizisi(ham.trim(), TEK_KUME.has(etiketAdi(bm[0])))
    if (ad) {
      const bas = h.bas + ham.length - ham.trimStart().length
      sonuc.push([ad, bas, bas + ham.trim().length])
    }
  }
  return sonuc
}

/** Etiketlerden ('Davalı', 'Sürücü', 'Adı Soyadı', 'Sayın', 'Muhatap' …) ve ad sütunlarından kişi adlarını bulur. */
export function sezgiselAdlar(metin0: string): string[] {
  const metin = normallestir(metin0)
  const katli = katla(metin)
  const adlar: string[] = []
  for (const [ad] of etiketliAdlar(metin, katli)) if (!adlar.includes(ad)) adlar.push(ad)
  return adlar
}

// ───────────────────────────── ad formu → regex ─────────────────────────────
const HECE_BOL = '(?:-[ \\t]*\\n[ \\t]*)?'
const AD_ARASI = '(?:[ \\t]*,[ \\t]*(?:\\n[ \\t]*)?|[ \\t]*[_\\-][ \\t]*|[ \\t]+(?:\\n[ \\t]*)?|[ \\t]*\\n[ \\t]*)'
const SINIR_ONCE = `(?<![${HR}])` // '_' sınır sayılır: 'Sevgul_Ordekcioglu_kimlik.pdf'
const SINIR_SONRA = `(?![${HR}])`

function formDeseni(form: string): string {
  return form.split(' ').map((k) => [...k].map(kacis).join(HECE_BOL)).join(AD_ARASI)
}
function formAdaylari(eslesenKatli: string): string[] {
  const s = kirp(eslesenKatli.replace(/-[ \t]*\n[ \t]*/g, ''), ' \t\n,_')
  const bir = s.split(/[\s,_]+/u).join(' ')
  const iki = s.split(/[\s,_\-]+/u).join(' ')
  return bir !== iki ? [bir, iki] : [bir]
}

/** Eşlemeden yüklenen kişi değeri hâlâ kişi adı sayılır mı (eski sürümün kurum adı hatası)? */
function kisiDegeriGecerli(deger: string): boolean {
  const k = bosluklaBol(deger)
  return k.length > 0 && !k.some(firmaMi) && k.every((x) => /\p{L}/u.test(x))
}

// ───────────────────────────── bağımsız kaba taramalar (kontrol.py) ─────────────────────────────
const KABA_RAKAM_G = rx('\\d+(?:(?:[ ._/\\-]{1,3}|[ ]*\\n[ ]*)\\d+)*', 'g')

/** Ayraç türünden bağımsız: aynı dizide toplam 11 hanesi TCKN algoritmasına uyan her rakam grubu. */
export function kabaTcknTara(metin: string, katli: string): Bulgu[] {
  const g = duz(metin)
  const sonuc: Bulgu[] = []
  for (const m of g.matchAll(KABA_RAKAM_G)) {
    const gruplar = [...m[0].matchAll(/\d+/g)].map((x) => [x.index! + m.index!, x.index! + m.index! + x[0].length] as const)
    for (let i = 0; i < gruplar.length; i++) {
      let toplam = 0
      for (let j = i; j < gruplar.length; j++) {
        toplam += gruplar[j][1] - gruplar[j][0]
        if (toplam > 11) break
        if (toplam === 11) {
          const bas = gruplar[i][0], son = gruplar[j][1]
          const parca = g.slice(bas, son)
          const d = rakam(parca)
          if (tcknGecerli(d) && !tarihIceriyor(parca) && !VIRGUL_RAKAM.test(g.slice(son, son + 2))) {
            sonuc.push(bulgu('TCKN', bas, son, d, d, korunanBaglamMi(katli, bas)))
          }
        }
      }
    }
  }
  return sonuc
}

/** Etiketten sonra maskelenmeden kalmış ad (ör. 'Davalı Kaya'nın', 'Adı : ŞÜKRÜ'). */
function etiketliAdTara(metin: string, katli: string): Bulgu[] {
  return etiketliAdlar(metin, katli).map(([ad, bas, son]) => bulgu('KİŞİ', bas, son, katla(ad), ad))
}

// ───────────────────────────── maskeleyici ─────────────────────────────
type AdKaydi = { anahtarlar: Set<string>; gorunen: string }
const cift = (a: string, b: string) => `${a}\u0000${b}`

/** Bir süreç (istek) boyunca durum tutan maskeleyici. Aynı değer → aynı jeton. */
export class Maskeleyici {
  private es = new Map<string, string>() // jeton → gerçek değer
  private jetonOf = new Map<string, string>() // tür\0anahtar → jeton
  private sayac: Record<string, number> = {}
  private kisiDeger = new Map<string, string>()
  private formlar = new Map<string, string>()
  private soyadlar = new Map<string, AdKaydi>()
  private ilkAdlar = new Map<string, AdKaydi>()
  private ciftler = new Map<string, string>()
  private kisiRe: RegExp | false | null = null
  private ilkAdRe: RegExp | false = false
  private ortaRe: RegExp | false = false
  private etkinFormlar = new Map<string, string>()
  private etkinIlk = new Map<string, string>()
  private bilinenRe: Map<JetonTuru, RegExp> | null = null

  constructor(kisiler: Iterable<string> = []) {
    for (const ad of kisiler) this.kisiEkle(ad)
  }

  /** jeton → gerçek değer (kopya). YALNIZ bellekte kullanılır; AI'a ya da kalıcı depoya gitmez. */
  get eslesme(): Record<string, string> {
    return Object.fromEntries(this.es)
  }

  private jeton(tur: JetonTuru, anahtar: string, deger: string): string {
    const k = cift(tur, anahtar)
    let j = this.jetonOf.get(k)
    if (j === undefined) {
      this.sayac[tur] = (this.sayac[tur] ?? 0) + 1
      j = `[${tur}-${this.sayac[tur]}]`
      this.jetonOf.set(k, j)
      this.es.set(j, deger)
      if (tur !== 'KİŞİ') this.bilinenRe = null // kişi adları ayrı regex'te
    }
    return j
  }

  /** Bilinen bir değeri (dosyadaki borçlunun TCKN'si, telefonu, plakası …) kaydeder; jetonunu döner. */
  degerEkle(tur: Exclude<JetonTuru, 'KİŞİ'>, deger: string): string {
    return this.jeton(tur, anahtarHesapla(tur, deger), tekBosluk(deger))
  }

  /** maskele.py `Maskeleyici.yukle` karşılığı (dosyasız): eşleme nesnesinden kurar. */
  static eslesmedenKur(veri: Record<string, unknown>, kisiler: Iterable<string> = []): Maskeleyici {
    const m = new Maskeleyici()
    for (const [jeton, deger] of Object.entries(veri)) {
      const mm = JETON_TAM.exec(String(jeton))
      if (!mm || typeof deger !== 'string') continue
      const tur = mm[1] as JetonTuru, no = Number(mm[2])
      const anahtar = anahtarHesapla(tur, deger)
      m.es.set(jeton, deger)
      if (!m.jetonOf.has(cift(tur, anahtar))) m.jetonOf.set(cift(tur, anahtar), jeton)
      m.sayac[tur] = Math.max(m.sayac[tur] ?? 0, no)
      if (tur === 'KİŞİ' && kisiDegeriGecerli(deger)) m.kisiKaydet(deger, { anahtar, soyad: true, ucle: false })
    }
    for (const ad of kisiler) m.kisiEkle(ad)
    return m
  }

  // ---- kişiler ----
  private kisiKaydet(ad0: string, o: { anahtar?: string; soyad?: boolean; ucle?: boolean; ilkAd?: boolean } = {}): boolean {
    const { soyad = true, ucle = true, ilkAd = false } = o
    const ad = tekBosluk(normallestir(ad0))
    if (!ad) return false
    const parca = ad.split(' ')
    const kp = parca.map(katla)
    const tam = kp.join(' ')
    const yeni = !this.formlar.has(tam)
    let anahtar = o.anahtar
    if (anahtar === undefined) {
      anahtar = this.formlar.get(tam)
      if (anahtar === undefined && kp.length >= 3) anahtar = this.ciftler.get(cift(kp[0], kp[kp.length - 1])) // orta adıyla yazılmış bilinen kişi
      anahtar = anahtar || tam
    }
    if (!this.kisiDeger.has(anahtar)) this.kisiDeger.set(anahtar, ad)
    const formlar = [tam]
    if (kp.length >= 2) {
      const son = kp[kp.length - 1]
      formlar.push([son, ...kp.slice(0, -1)].join(' '))
      formlar.push(kp.join('')) // bitişik (dosya adı: SevgulOrdekcioglu)
      if (kp.length >= 3 && ucle) formlar.push(`${kp[0]} ${son}`, `${son} ${kp[0]}`, kp[0] + son)
      if (!this.ciftler.has(cift(kp[0], son))) this.ciftler.set(cift(kp[0], son), anahtar)
      if (soyad && son.length >= 3) {
        if (!this.soyadlar.has(son)) this.soyadlar.set(son, { anahtarlar: new Set(), gorunen: parca[parca.length - 1] })
        this.soyadlar.get(son)!.anahtarlar.add(anahtar)
      }
      if (ilkAd && kp[0].length >= 3) {
        if (!this.ilkAdlar.has(kp[0])) this.ilkAdlar.set(kp[0], { anahtarlar: new Set(), gorunen: parca[0] })
        this.ilkAdlar.get(kp[0])!.anahtarlar.add(anahtar)
      }
    }
    for (const f of formlar) if (!this.formlar.has(f)) this.formlar.set(f, anahtar)
    this.kisiRe = null
    return yeni
  }

  /** Kişiler listesinden ad: tam, ters sıra, bitişik, (3+ kelimede ad+soyad), orta adlı yazım, yalnız soyadı
   *  ve büyük harfle başlayan yalnız ilk adı maskelenir. */
  kisiEkle(ad: string, o: { jetonAyir?: boolean } = {}): void {
    this.kisiKaydet(ad, { soyad: true, ucle: true, ilkAd: true })
    if (o.jetonAyir) this.kisiJetonuAyir(ad)
  }

  /** Şirket/kurum adı gibi YALNIZ tam yazımıyla maskelenecek ad (soyad/ilk ad parçaları maskelenmez:
   *  'Ltd. Şti.' gibi ekler her yerde jetona dönmesin). */
  tamAdEkle(ad: string, o: { jetonAyir?: boolean } = {}): void {
    this.kisiKaydet(ad, { soyad: false, ucle: false, ilkAd: false })
    if (o.jetonAyir) this.kisiJetonuAyir(ad)
  }

  /** Bilinen kişiye jetonu HEMEN ayırır: jeton numarası metindeki ilk geçişe değil kayıt sırasına bağlanır
   *  (dosyadaki kayıtlardan deterministik jeton: [KİŞİ-1] = ilk kayıtlı borçlu; 06, 5.6). Python aracında
   *  jeton ilk geçişte verilir; sunucu tarafındaki bu ek, aynı dosyanın çağrıları arasında tutarlılık içindir. */
  private kisiJetonuAyir(ad0: string): void {
    const ad = tekBosluk(normallestir(ad0))
    if (!ad) return
    const anahtar = this.formlar.get(ad.split(' ').map(katla).join(' '))
    if (anahtar !== undefined) this.jeton('KİŞİ', anahtar, this.kisiDeger.get(anahtar) ?? ad)
  }

  private bilinenAdParcasi(k: string): boolean {
    return this.formlar.has(k) || this.soyadlar.has(k) || this.ilkAdlar.has(k)
  }

  private kisiRegex(): RegExp | false {
    if (this.kisiRe === null) {
      const formlar = new Map(this.formlar)
      for (const [soyad, { anahtarlar, gorunen }] of this.soyadlar) {
        if (formlar.has(soyad)) continue
        if (anahtarlar.size === 1) formlar.set(soyad, [...anahtarlar][0])
        else { // ortak soyad: kime ait olduğu belirsiz → ayrı jeton
          if (!this.kisiDeger.has(soyad)) this.kisiDeger.set(soyad, gorunen)
          formlar.set(soyad, soyad)
        }
      }
      this.etkinFormlar = formlar
      this.kisiRe = formlar.size
        ? rx(`${SINIR_ONCE}(?:${[...formlar.keys()].sort(uzunlugaGore).map(formDeseni).join('|')})${SINIR_SONRA}`, 'g')
        : false
      const ilk = new Map<string, string>()
      for (const [ad, { anahtarlar, gorunen }] of this.ilkAdlar) {
        if (formlar.has(ad)) continue
        if (anahtarlar.size === 1) ilk.set(ad, [...anahtarlar][0])
        else { if (!this.kisiDeger.has(ad)) this.kisiDeger.set(ad, gorunen); ilk.set(ad, ad) }
      }
      this.etkinIlk = ilk
      this.ilkAdRe = ilk.size ? rx(`${SINIR_ONCE}(?:${[...ilk.keys()].sort(uzunlugaGore).map(kacis).join('|')})${SINIR_SONRA}`, 'g') : false
      const ilkler = new Set<string>(), soyadlar = new Set<string>()
      for (const k of this.ciftler.keys()) {
        const [i, s] = k.split('\u0000')
        if (i.length >= 2 && s.length >= 3) { ilkler.add(i); soyadlar.add(s) }
      }
      this.ortaRe = ilkler.size
        ? rx(`${SINIR_ONCE}(${[...ilkler].sort(uzunlugaGore).map(kacis).join('|')})((?:[ \\t]+\\p{L}+\\.?){1,2})[ \\t]+(${[...soyadlar].sort(uzunlugaGore).map(kacis).join('|')})${SINIR_SONRA}`, 'g')
        : false
    }
    return this.kisiRe
  }

  private formAnahtari(eslesen: string): string {
    const adaylar = formAdaylari(eslesen)
    for (const f of adaylar) { const a = this.etkinFormlar.get(f); if (a !== undefined) return a }
    return adaylar[0]
  }

  private gucluIlkAdBaglami(katli: string, bas: number, son: number, anahtar: string): boolean {
    const once = katli.slice(Math.max(0, bas - 14), bas)
    const sonra = katli.slice(son, son + 60)
    if (/(?<![a-z])(?:sayin|sn\.?|av\.|dr\.|bay|bayan|merhum|mrh\.)[ \t]*$/.test(once)) return true
    if (/^[ \t]*(?:bey|hanim|beyefendi|hanimefendi)/.test(sonra) || /^['’][a-z]/.test(sonra)) return true
    const kayit = this.ilkAdlar.get(katli.slice(bas, son))
    const anahtarlar = kayit && kayit.anahtarlar.size ? kayit.anahtarlar : new Set([anahtar])
    for (const a of anahtarlar) {
      const deger = this.kisiDeger.get(a) ?? a
      const kel = bosluklaBol(katla(deger))
      const soyad = kel.length ? kel[kel.length - 1] : ''
      if (soyad && rx(`^[ \\t]*(?:,|ve|ile|&)[ \\t]*\\p{L}+[ \\t]+${kacis(soyad)}${SINIR_SONRA}`).test(sonra)) return true
    }
    return false
  }

  /** Bilinen kişilerin (liste + keşfedilen) geçişleri. */
  bulKisi(metin: string, katli: string): Bulgu[] {
    const re = this.kisiRegex()
    const sonuc: Bulgu[] = []
    if (re) {
      for (const m of katli.matchAll(re)) {
        const bas = m.index!, son = bas + m[0].length
        const anahtar = this.formAnahtari(m[0])
        sonuc.push(bulgu('KİŞİ', bas, son, anahtar, this.kisiDeger.get(anahtar) ?? tekBosluk(metin.slice(bas, son))))
      }
    }
    if (this.ortaRe) { // 'ŞÜKRÜ KEMAL KÖPÜKÇÜLER' (listede 'Şükrü Köpükçüler')
      for (const m of katli.matchAll(this.ortaRe)) {
        const bas = m.index!, son = bas + m[0].length
        const anahtar = this.ciftler.get(cift(m[1], m[3]))
        if (anahtar === undefined) continue
        const g2 = bas + m[1].length // grup 2, grup 1'in hemen ardından başlar
        const orta = [...m[2].matchAll(/\S+/gu)].map((x) => [x.index! + g2, x[0]] as const)
        if (!orta.every(([p, k]) => buyukHarfMi(metin[p]) && !AD_DEGIL.has(sagKirp(katla(k), '.')))) continue
        sonuc.push(bulgu('KİŞİ', bas, son, anahtar, this.kisiDeger.get(anahtar) ?? tekBosluk(metin.slice(bas, son))))
      }
    }
    if (this.ilkAdRe) { // listedeki kişinin yalnız ilk adı: 'Sayın Şükrü Bey', 'Kerimcan ve …'
      for (const m of katli.matchAll(this.ilkAdRe)) {
        const bas = m.index!, son = bas + m[0].length
        if (!buyukHarfMi(metin[bas])) continue
        const anahtar = this.etkinIlk.get(m[0])
        if (anahtar === undefined) continue
        if (YAYGIN_KELIME_ADLAR.has(m[0]) && !this.gucluIlkAdBaglami(katli, bas, son, anahtar)) continue
        sonuc.push(bulgu('KİŞİ', bas, son, anahtar, this.kisiDeger.get(anahtar) ?? metin.slice(bas, son)))
      }
    }
    return sonuc
  }

  // ---- bilinen değerler ----
  private bilinenRegexler(): Map<JetonTuru, RegExp> {
    if (this.bilinenRe === null) {
      const gruplar = new Map<JetonTuru, string[]>()
      const ayr = '(?:[ \\t]{0,3}[.\\-]?[ \\t]{0,3}|[ \\t]*-?[ \\t]*\\n[ \\t]*)'
      for (const [jeton, deger] of this.es) {
        const tur = JETON_TAM.exec(jeton)![1] as JetonTuru
        if (tur === 'KİŞİ') continue
        let desen: string
        if (tur === 'TCKN' || tur === 'VKN') {
          const d = rakam(deger)
          if (!d) continue
          desen = '(?<!\\d)' + d.split('').join(ayr) + '(?!\\d)(?!,\\d)'
        } else if (tur === 'TEL') {
          const d = rakam(deger).slice(-10)
          if (!d) continue
          desen = '(?<![\\d+])(?:(?:\\+|00)?[ \\t]?90|0)?[ \\t\\-.(/]{0,3}' + d.split('').join('[ \\t\\-.()/]{0,3}') + '(?!\\d)'
        } else if (tur === 'IBAN') {
          const d = rakam(deger)
          if (!d) continue
          desen = '(?<![a-z0-9])(?:tr' + ayr + ')?' + d.split('').join(ayr) + '(?!\\d)'
        } else if (tur === 'PLAKA') {
          if (!bulPlaka(deger, katla(deger)).length) continue // eski sürümün plaka sandığı tarih/daire atfı yeniden maskelenmez
          const d = katla(deger.replace(/[^0-9A-Za-z]/g, ''))
          desen = SINIR_ONCE + '(?<![/.,%])' + [...d].map(kacis).join('(?:[ \\t]{0,3}-?[ \\t]{0,3})') + SINIR_SONRA + '(?![/.,]\\d)'
        } else if (tur === 'EPOSTA') {
          const t = katla(deger.replace(/\s+/gu, ''))
          const at = t.indexOf('@')
          const yerel = at < 0 ? t : t.slice(0, at), alan = at < 0 ? '' : t.slice(at + 1)
          desen = `(?<![${W}.+\\-])` + kacis(yerel) + '[ \\t]?@[ \\t]?' + kacis(alan) + `(?![${W}\\-])`
        } else { // ADRES
          const kel = katla(tekBosluk(deger)).split(' ')
          desen = `(?<![${W}])` + kel.map(kacis).join('\\s+') + `(?![${W}])`
        }
        if (!gruplar.has(tur)) gruplar.set(tur, [])
        gruplar.get(tur)!.push(desen)
      }
      this.bilinenRe = new Map([...gruplar].map(([tur, d]) => [tur, rx([...d].sort(uzunlugaGore).join('|'), 'g')]))
    }
    return this.bilinenRe
  }

  /** Eşlemede kayıtlı gerçek değerlerin (her yazımıyla) kalan geçişlerini bulur. */
  bulBilinen(metin: string, katli: string, turler?: ReadonlySet<JetonTuru>): Bulgu[] {
    const sonuc: Bulgu[] = []
    for (const [tur, re] of this.bilinenRegexler()) {
      if (turler && !turler.has(tur)) continue
      for (const m of katli.matchAll(re)) {
        const bas = m.index!, son = bas + m[0].length
        const ham = metin.slice(bas, son)
        if (tur === 'TCKN' && tarihIceriyor(duz(ham))) continue
        const anahtar = anahtarHesapla(tur, ham)
        const j = this.jetonOf.get(cift(tur, anahtar))
        const deger = j ? this.es.get(j) ?? tekBosluk(ham) : tekBosluk(ham)
        sonuc.push(bulgu(tur, bas, son, anahtar, deger))
      }
    }
    return sonuc
  }

  // ---- keşif ----
  /** Ön tarama: sezgisel kişi adlarını ve desen değerlerini kaydeder (jetonlar metin sırasıyla).
   *  Birden çok parça maskelenecekse ÖNCE hepsi keşfedilir, sonra `maskele(…, false)` çağrılır. */
  kesfet(metin0: string): string[] {
    const metin = normallestir(metin0)
    const katli = katla(metin)
    const yeni: string[] = []
    const adlar = sezgiselAdlar(metin).map((a, i) => [a, i] as const)
      .sort((a, b) => bosluklaBol(b[0]).length - bosluklaBol(a[0]).length || a[1] - b[1]).map(([a]) => a)
    for (const ad of adlar) {
      if (bosluklaBol(ad).length === 1 && this.bilinenAdParcasi(katla(ad))) continue // 'Davalı Kaya'nın': bilinen kişinin parçası
      if (this.kisiKaydet(ad, { soyad: true, ucle: true })) yeni.push(ad)
    }
    for (const f of DESEN_BULUCULARI) {
      for (const b of f(metin, katli)) if (!b.korunan) this.jeton(b.tur, b.anahtar, b.deger)
    }
    return yeni
  }

  // ---- maskeleme ----
  private uygula(metin: string, bulgular: Bulgu[], sayim: Record<string, number>): string {
    if (!bulgular.length) return metin
    const jetonlar = [...metin.matchAll(JETON_G)].map((m) => [m.index!, m.index! + m[0].length] as const)
    const jBas = jetonlar.map(([a]) => a)
    const secilen: Bulgu[] = []
    let son = -1
    for (const b of [...bulgular].sort((a, c) => a.bas - c.bas || (c.son - c.bas) - (a.son - a.bas))) {
      if (b.korunan || b.bas < son || b.son <= b.bas) continue
      const i = bisectSol(jBas, b.son)
      if (i > 0 && jetonlar[i - 1][1] > b.bas) continue // mevcut bir jetonla çakışıyor
      secilen.push(b)
      son = b.son
    }
    const parcalar: string[] = []
    let onceki = 0
    for (const b of secilen) {
      parcalar.push(metin.slice(onceki, b.bas), this.jeton(b.tur, b.anahtar, b.deger))
      onceki = b.son
      sayim[b.tur] = (sayim[b.tur] ?? 0) + 1
    }
    parcalar.push(metin.slice(onceki))
    return parcalar.join('')
  }

  /** Metni maskeler. Döner: maskeli metin + türe göre maskelenen öğe sayısı. */
  maskele(metin0: string, kesfet = true): { metin: string; sayim: Record<string, number> } {
    let metin = normallestir(metin0)
    if (kesfet) this.kesfet(metin)
    const sayim: Record<string, number> = {}
    const adimlar: Bulucu[] = [
      ...DESEN_BULUCULARI,
      (m, k) => this.bulBilinen(m, k, new Set<JetonTuru>(['TCKN', 'VKN', 'TEL', 'IBAN', 'EPOSTA', 'PLAKA'])),
      (m, k) => this.bulKisi(m, k),
      bulAdres,
      (m, k) => this.bulBilinen(m, k, new Set<JetonTuru>(['ADRES'])),
    ]
    for (const adim of adimlar) metin = this.uygula(metin, adim(metin, katla(metin)), sayim)
    return { metin, sayim }
  }

  /** Dosya/klasör adını maskeler ('_' boşluk sayılır). Değişiklik yoksa özgün ad döner. */
  adMaskele(ad: string): string {
    const gorunen = adGorunumu(ad)
    const { metin } = this.maskele(gorunen, true)
    if (metin === gorunen) return ad
    return metin.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '_'
  }

  /**
   * Maskeli metinde kalan kişisel veri şüphelerini bulur (kontrol.py). Maskeleyicinin desenlerine ek
   * olarak bağımsız kaba taramalar da çalışır: ayraçtan bağımsız TCKN ve etiketten sonra kalmış ad.
   * Konumlar normallestir(metin) üzerindedir.
   */
  sizintiTara(metin0: string): Bulgu[] {
    const metin = normallestir(metin0)
    const katli = katla(metin)
    const bulgular: Bulgu[] = [
      ...DESEN_BULUCULARI.flatMap((f) => f(metin, katli)),
      ...this.bulBilinen(metin, katli),
      ...this.bulKisi(metin, katli),
      ...kabaTcknTara(metin, katli),
      ...etiketliAdTara(metin, katli),
    ]
    const secilen: Bulgu[] = []
    for (const b of bulgular.sort((a, c) => Number(a.korunan) - Number(c.korunan) || a.bas - c.bas || (c.son - c.bas) - (a.son - a.bas))) {
      if (secilen.some((s) => s.tur === b.tur && s.bas < b.son && b.bas < s.son)) continue
      secilen.push(b)
    }
    return secilen.sort((a, c) => a.bas - c.bas)
  }
}
