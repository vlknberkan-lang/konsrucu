/**
 * KonsRücü — evrak metin hattı v1 · ortak tipler ve metin yardımcıları · lib/konsrucu/evrak-metin/ortak.ts
 * SAF modül (DB/Node API yok): hem tarayıcıda (evrak-cikar.ts → "Evrak ekle") hem sunucuda
 * (app/api/uyap/evrak) aynı mantık çalışır. rucu-hukuk-asistani/araclar/evrak-metin/cikar.py'nin
 * (yerel, yapay zekâsız çıkarım) TypeScript'e taşınan ortak parçası (06 · 5.1–5.3; S16).
 *
 * İlke: çıkarım ASLA fırlatmaz — sorun `durum = HATA / DESTEKLENMIYOR` ve `uyarilar` ile döner.
 * Anlamlı metin yoksa `metin = null` (Belge.extractedText'i "metin var" gibi dolduran boş/işaret metni
 * yazılmaz; tüketiciler — aiCikar, dilekçe masası, Dosyaya Sor — boş metni metin sanmasın).
 */

export type EvrakBicimi = 'PDF' | 'UDF' | 'DOCX' | 'EYP' | 'ZIP' | 'TXT' | 'HTML' | 'GORSEL' | 'DESTEKLENMIYOR'

/**
 * OKUNDU      : anlamlı metin çıktı (bazı sayfalar/gömülü görseller yine OCR isteyebilir → ocrGerekli)
 * OCR_GEREKLI : metin katmanı yok (taranmış PDF, görsel, yalnız görüntü içeren UDF) — OCR S17'de
 * BOS         : geçerli belge ama içinde metin yok
 * DESTEKLENMIYOR / HATA : okunamadı; sebep `uyarilar`da (bozuk, şifreli, desteklenmeyen biçim)
 * (Kalıcı `Belge.metinDurumu` kolonu B1b şemasıyla gelir; bu değerler ona eşlenecek.)
 */
export type MetinDurum = 'OKUNDU' | 'OCR_GEREKLI' | 'BOS' | 'DESTEKLENMIYOR' | 'HATA'

export type MetinSonucu = {
  durum: MetinDurum
  bicim: EvrakBicimi
  /** 'METIN_KATMANI' | 'UDF' | 'DOCX' | 'TXT' | 'HTML' | 'EYP' | 'ZIP' (+ '+OCR_GEREKLI'), ya da durum adı */
  yontem: string
  /** Belge.extractedText'e yazılacak metin; anlamlı metin yoksa null */
  metin: string | null
  /** PDF: sayfa metinleri (1. sayfa = [0]); BelgeSayfa tablosu gelince (B1b) aynen yazılır */
  sayfalar?: string[]
  sayfaSayisi?: number
  /** Taranmış sayfa / gömülü görüntü var → OCR gerekli (S17) */
  ocrGerekli: boolean
  /** PDF: OCR adayı sayfa numaraları (1'den başlar) */
  ocrSayfalari: number[]
  uyarilar: string[]
  /** Süre/boyut sınırı yüzünden kısmi okundu (uyarılarda hangi kısım) */
  eksik: boolean
}

// ---------------------------------------------------------------------------
// Eşikler (cikar.py ile aynı değerler)
// ---------------------------------------------------------------------------
/** Sayfada bundan az harf/rakam varsa sayfa OCR adayıdır (06 · 5.3). */
export const ANLAMLI_ESIK = 50
/** Sayfanın çoğu görüntüyse ve metin bundan kısaysa (ör. UYAP e-imza alt bilgisi) sayfa yine OCR adayıdır. */
export const HIBRIT_ESIK = 400
export const HIBRIT_GORUNTU_ORANI = 0.5
/** UDF/DOCX'e gömülü görüntü A4 sayfanın bu oranından büyükse taranmış evrak sayılır (logo değil). */
export const GORSEL_ALAN_ORANI = 0.05
/** Sunucuya yazılacak metnin üst sınırı (satır boyutu güvenliği). 3,3 MB'lık UYAP evrakı pratikte buna varmaz. */
export const AZAMI_KARAKTER = 1_000_000
/**
 * Elle yükleme yolu ("Evrak ekle": tarayıcıda çıkarılan metin → belgeEkle server action) için belge başına sınır.
 * Metin sunucuya server action gövdesinde gider ve Next.js bu gövdeyi varsayılan 1 MB'da keser: S16 ile tarayıcıdaki
 * 20 sayfa sınırı kalkınca tek bir uzun PDF bütün partinin kaydını düşürebiliyordu. Sınır aşılırsa metin kesilir ama
 * kesildiği METNİN İÇİNDE açıkça yazar (B40: sessiz kesme yok). Tam metin sunucu hattıyla (B1b kuyruğu / S17 tek
 * giriş yolu: Storage'daki bayttan) gelir; UYAP yolu zaten sunucuda AZAMI_KARAKTER'e kadar saklar.
 */
export const ELLE_YUKLEME_METIN_SINIRI = 100_000

export const OCR_GEREKLI_ISARET = '[Bu sayfada okunabilir metin katmanı yok — OCR GEREKLİ]'
export const HIBRIT_ISARET =
  '[Bu sayfa taranmış görüntü içeriyor; metin katmanı yalnız kısmi (ör. e-imza alt bilgisi) — görüntüdeki içerik okunmadı, OCR GEREKLİ]'
export const gorselIsareti = (k: number, n: number) => `[Gömülü görüntü ${k}/${n}: taranmış içerik okunmadı — OCR GEREKLİ]`

/** Boş (varsayılan alanlı) sonuç. */
export function sonuc(bicim: EvrakBicimi, durum: MetinDurum, ek: Partial<MetinSonucu> = {}): MetinSonucu {
  return { durum, bicim, yontem: durum, metin: null, ocrGerekli: false, ocrSayfalari: [], uyarilar: [], eksik: false, ...ek }
}

// ---------------------------------------------------------------------------
// Metin yardımcıları
// ---------------------------------------------------------------------------
// RegExp kurucusu: \p{..} kaçışları ES2018 ister; tsconfig hedefi ES2017 olduğundan literal yazılmaz.
const ANLAMLI_RE = new RegExp('[\\p{L}\\p{N}]', 'gu')
const ANLAMLI_TEK = new RegExp('[\\p{L}\\p{N}]', 'u')

/** Harf/rakam sayısı (Python str.isalnum karşılığı). Sayfa gibi kısa metinler için. */
export function anlamliSay(s: string | null | undefined): number {
  if (!s) return 0
  const m = s.match(ANLAMLI_RE)
  return m ? m.length : 0
}

/** En az bir harf/rakam var mı (uzun metinde dizi üretmeden). */
export function anlamliVar(s: string | null | undefined): boolean {
  return !!s && ANLAMLI_TEK.test(s)
}

/**
 * NFC, satır sonu birliği, NUL/C0 kontrol, yumuşak tire ve sıfır genişlikli karakter temizliği, özel boşluklar
 * (cikar.py · normallestir). NUL baytı Postgres TEXT'e yazılamaz → burada kesin olarak atılır.
 */
export function metinNormallestir(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\f\v\x85\u{2028}\u{2029}]/gu, '\n')
    .replace(/[\x00-\x08\x0E-\x1F\xAD\u{200B}-\u{200D}\u{2060}\u{FEFF}]/gu, '') // NUL/C0 (tab ve LF hariç), yumuşak tire, sıfır genişlik
    .replace(/[\xA0\u{202F}\u{205F}\u{3000}\u{180E}\u{2000}-\u{200A}]/gu, ' ') // NBSP, en/em/ince/kıl boşlukları
    .replace(/[\u{2010}\u{2011}\u{2212}]/gu, '-')
    .replace(/i\u{0307}/gu, 'i')
}

const MOJIBAKE: Record<string, string> = { 'ý': 'ı', 'þ': 'ş', 'ð': 'ğ', 'Ý': 'İ', 'Þ': 'Ş', 'Ð': 'Ğ' }

/** Türkçe harflerin Latin-1/WinAnsi ile yanlış eşlenmiş hâlini (ý/þ/ð/Ý/Þ/Ð) onarır (eski PDF'ler). */
export function mojibakeOnar(metin: string): { metin: string; onarilan: number } {
  let n = 0
  const m = metin.replace(/[ýþðÝÞÐ]/g, (c) => { n++; return MOJIBAKE[c] })
  return { metin: m, onarilan: n }
}

function coz(etiket: string, veri: Uint8Array, fatal = false): string {
  return new TextDecoder(etiket, { fatal }).decode(veri)
}

/** Windows-1254 (Türkçe) çöz; ortamda yoksa latin1'e düş. */
export function cp1254Coz(veri: Uint8Array): string {
  try { return coz('windows-1254', veri) } catch { return coz('latin1', veri) }
}

/**
 * Baytı metne çevir: UTF-8 (BOM'lu/BOM'suz), UTF-16 (BOM'lu/BOM'suz), yoksa Windows-1254 (cikar.py · metni_coz).
 */
export function metniCoz(veri: Uint8Array): { metin: string; uyari: string | null } {
  if (veri.length >= 3 && veri[0] === 0xef && veri[1] === 0xbb && veri[2] === 0xbf) {
    return { metin: coz('utf-8', veri.subarray(3)), uyari: null }
  }
  if (veri.length >= 2 && veri[0] === 0xff && veri[1] === 0xfe) return { metin: coz('utf-16le', veri.subarray(2)), uyari: null }
  if (veri.length >= 2 && veri[0] === 0xfe && veri[1] === 0xff) return { metin: coz('utf-16be', veri.subarray(2)), uyari: null }
  if (veri.length >= 4) {
    let sifir = 0, tek = 0, cift = 0
    for (let i = 0; i < veri.length; i++) {
      if (veri[i] === 0) { sifir++; if (i % 2) tek++; else cift++ }
    }
    if (sifir * 4 >= veri.length) {
      // BOM'suz UTF-16: NUL baytları tek konumdaysa little-endian ("A\0")
      const kod = tek >= cift ? 'utf-16le' : 'utf-16be'
      try { return { metin: coz(kod, veri, true), uyari: `BOM'suz UTF-16 metin algılandı (${kod.toUpperCase()})` } } catch { /* aşağı düş */ }
    }
  }
  try {
    return { metin: coz('utf-8', veri, true), uyari: null }
  } catch {
    return { metin: cp1254Coz(veri), uyari: "UTF-8 değil; Windows-1254 (Türkçe) olarak okundu" }
  }
}

/**
 * İstisna metnini kısalt; tırnak içi (kütüphaneler dosya adını tırnakla yazar) ve mutlak yollar silinir —
 * klasör/dosya adı kişi adı içerebilir (cikar.py · hata_mesaji).
 */
export function hataMesaji(e: unknown, sinir = 160): string {
  const ad = (e as { name?: string })?.name || 'Hata'
  let msg = String((e as { message?: string })?.message ?? e ?? '')
  msg = msg.replace(/'[^'\n]*'|"[^"\n]*"|‘[^’\n]*’|“[^”\n]*”/g, "'…'")
  msg = msg.replace(/(?:[A-Za-z]:[\\/]|\\\\).*/g, '<yol>')
  msg = msg.replace(/(^|[\s(=])\/(?:[^/\s]+\/)+\S*.*/g, '$1<yol>')
  msg = msg.split(/\s+/).join(' ').trim()
  return msg ? `${ad}: ${msg.slice(0, sinir)}` : ad
}

/** Çok sayfalı metni sayfa başlıklarıyla birleştir (tek sayfada başlık yok — makbuz gibi kısa evrak temiz kalsın). */
export function sayfalariBirlestir(sayfalar: string[], toplam = sayfalar.length): string {
  if (sayfalar.length <= 1 && toplam <= 1) return (sayfalar[0] ?? '').trim()
  return sayfalar.map((s, i) => `===== Sayfa ${i + 1}/${toplam} =====\n${s.trim()}`.trim()).join('\n\n')
}

/**
 * Metni `sinir` karakterde keser ve kesildiğini metnin sonunda AÇIKÇA yazar (sessiz kesme yok; B40).
 * İşaretle birlikte toplam uzunluk `sinir`i aşmaz; vekil çift (emoji vb.) ortadan bölünmez. Sınır içindeyse aynen döner.
 */
export function metniSinirla(metin: string, sinir: number): { metin: string; kesildi: boolean } {
  if (metin.length <= sinir) return { metin, kesildi: false }
  const isaret = (n: number) =>
    `\n\n[… METİN KESİLDİ: toplam ${metin.length} karakterin ilk ${n} karakteri bu yükleme yolunda saklandı; kalan kısım için belgenin kendisini açın]`
  let n = Math.max(0, sinir - isaret(sinir).length)
  const k = metin.charCodeAt(n - 1)
  if (n > 0 && k >= 0xd800 && k <= 0xdbff) n-- // yüksek vekil tek başına kalmasın
  return { metin: metin.slice(0, n) + isaret(n), kesildi: true }
}

/**
 * Son işlem: normalleştir, mojibake onar, uzunluğu sınırla; anlamlı metin yoksa metin = null.
 * Sınır aşılırsa metin kesilir ama bu açıkça yazılır (sessizce kesilen metin yok) ve eksik = true.
 */
export function sonIslem(s: MetinSonucu, azamiKarakter = AZAMI_KARAKTER): MetinSonucu {
  const r: MetinSonucu = { ...s, uyarilar: [...s.uyarilar] }
  if (r.sayfalar) r.sayfalar = r.sayfalar.map((x) => mojibakeOnar(metinNormallestir(x)).metin)
  if (r.metin != null) {
    const { metin, onarilan } = mojibakeOnar(metinNormallestir(r.metin))
    if (onarilan) r.uyarilar.push(`Türkçe karakter bozulması onarıldı (${onarilan} karakter: ý/þ/ð → ı/ş/ğ)`)
    let m = metin.trim()
    if (m.length > azamiKarakter) {
      r.uyarilar.push(`Metin ${m.length} karakter; ilk ${azamiKarakter} karakter saklandı`)
      m = m.slice(0, azamiKarakter) + `\n[… metnin kalanı saklanmadı: toplam ${m.length} karakter]`
      r.eksik = true
    }
    r.metin = anlamliVar(m) ? m : null
  }
  if (r.durum === 'OKUNDU' && r.metin == null) {
    // İşaretten başka metin kalmadıysa "okundu" deme
    r.durum = r.ocrGerekli ? 'OCR_GEREKLI' : 'BOS'
  }
  return r
}

/**
 * Kısa, insan okunur not (Aktivite satırı ve API yanıtı için). OCR gerekmiyorsa null.
 * Kişisel veri içermez: yalnız sayfa numarası/adedi.
 */
export function ocrNotu(s: Pick<MetinSonucu, 'durum' | 'ocrGerekli' | 'ocrSayfalari' | 'sayfaSayisi'>): string | null {
  if (s.durum === 'OCR_GEREKLI') return 'taranmış evrak — metin yok, OCR gerekli'
  if (!s.ocrGerekli) return null
  if (s.ocrSayfalari.length) {
    const n = s.ocrSayfalari.length
    return `${n}${s.sayfaSayisi ? '/' + s.sayfaSayisi : ''} sayfa taranmış — OCR gerekli`
  }
  return 'gömülü taranmış görüntü var — OCR gerekli'
}
