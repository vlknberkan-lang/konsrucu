/**
 * KonsRücü — evrak metin hattı v1 (S16 çekirdeği) · lib/konsrucu/evrak-metin/index.ts (saf; tarayıcı + sunucu)
 *
 * Tek giriş: evrakMetniCikar(bayt, dosyaAdi, { pdfOku }) → MetinSonucu. ASLA fırlatmaz.
 * Biçim önce BAYT İMZASINDAN anlaşılır, uzantı yalnız ikincil ipucudur: eklenti UDF/EYP'yi
 * `application/octet-stream` sayıp ".pdf" uzantısıyla gönderebiliyor (06 · eklenti tablosu, fetchB64).
 *   %PDF            → PDF metin katmanı, sayfa bazında (pdfOku: ortama göre pdfjs)
 *   PK + content.xml→ UYAP UDF
 *   PK + word/…     → DOCX
 *   PK (diğer)      → EYP / ZIP paketi (içindekiler tek tek okunur)
 *   JPEG/PNG/TIFF…  → OCR_GEREKLI (OCR S17'de)
 *   .txt/.csv/.html → düz metin
 * Katmanlar ucuzdan pahalıya (06 · 5.1): burada yalnız yapay zekâsız, ₺0 katmanlar var.
 *
 * Sunucu kullanımı: ./sunucu.ts (pdfjs legacy + DB yazımı). Tarayıcı: lib/konsrucu/evrak-cikar.ts.
 */
import JSZip from 'jszip'
import { docxMetni } from './docx'
import { htmlMetni, txtMetni } from './duz-metin'
import { AZAMI_KARAKTER, hataMesaji, sonIslem, sonuc, type MetinSonucu } from './ortak'
import { PAKET_SINIR, eypMi, paketMetni, type PaketSinir } from './paket'
import { pdfImzasiVar, pdfOkumasiniSonuca, type PdfOkuSecenek, type PdfOkuyucu } from './pdf'
import { udfMetni } from './udf'

export * from './ortak'
export { sayfaSatirla, pdfBelgeOku, pdfOkumasiniSonuca, goruntuOrani } from './pdf'
export type { PdfOkuma, PdfOkuSecenek, PdfOkuyucu, PdfSayfa } from './pdf'
export { udfMetni } from './udf'
export { docxMetni } from './docx'
export { txtMetni, htmlMetni, htmlMetne, csvTablo } from './duz-metin'
export { paketMetni, PAKET_SINIR } from './paket'

export type CikarSecenek = {
  /** PDF okuyucu (sunucu: pdf-metin.pdfBelgeOkuSunucu; tarayıcı: pdfjs-dist). Yoksa PDF "HATA: kütüphane yok". */
  pdfOku?: PdfOkuyucu
  /** Toplam süre bütçesi (ms) — PDF sayfaları ve paket içi evraklar arasında paylaşılır */
  butceMs?: number
  /** PDF başına azami sayfa (varsayılan sınırsız) */
  maxSayfa?: number
  /** Saklanacak metnin üst sınırı (varsayılan AZAMI_KARAKTER) */
  azamiKarakter?: number
  paketSinir?: PaketSinir
  simdi?: () => number
}

const DESTEKLENMEYEN: Record<string, string> = {
  doc: "Eski Word (DOC) desteklenmiyor — Word'de açıp DOCX veya PDF olarak kaydedin",
  xls: 'Eski Excel (XLS) desteklenmiyor — XLSX olarak kaydedin',
  msg: 'Outlook MSG desteklenmiyor — e-postayı PDF olarak kaydedin',
  eml: 'EML e-posta desteklenmiyor — e-postayı PDF olarak kaydedin',
  rtf: 'RTF desteklenmiyor — DOCX veya PDF olarak kaydedin',
}

const uzanti = (ad: string) => (/\.([A-Za-z0-9]+)$/.exec(ad.trim())?.[1] ?? '').toLowerCase()

const bas = (v: Uint8Array, ...b: number[]) => b.every((x, i) => v[i] === x)

/** Bayt imzasından görsel mi (JPEG, PNG, GIF, TIFF, WEBP, HEIC/HEIF, BMP)? */
export function gorselImzasi(v: Uint8Array): boolean {
  if (bas(v, 0xff, 0xd8, 0xff) || bas(v, 0x89, 0x50, 0x4e, 0x47) || bas(v, 0x47, 0x49, 0x46, 0x38)) return true
  if (bas(v, 0x49, 0x49, 0x2a, 0x00) || bas(v, 0x4d, 0x4d, 0x00, 0x2a) || bas(v, 0x42, 0x4d)) return true
  if (bas(v, 0x52, 0x49, 0x46, 0x46) && v[8] === 0x57 && v[9] === 0x45 && v[10] === 0x42 && v[11] === 0x50) return true
  // ISO-BMFF: [4]='ftyp' + heic/heix/mif1/heif
  if (v[4] === 0x66 && v[5] === 0x74 && v[6] === 0x79 && v[7] === 0x70) {
    const marka = String.fromCharCode(v[8], v[9], v[10], v[11])
    return /^(heic|heix|hevc|mif1|msf1|heif|avif)$/.test(marka)
  }
  return false
}

const zipImzasi = (v: Uint8Array) => bas(v, 0x50, 0x4b, 0x03, 0x04) || bas(v, 0x50, 0x4b, 0x05, 0x06)
const oleImzasi = (v: Uint8Array) => bas(v, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)

async function cikarIc(veri: Uint8Array, dosyaAdi: string, s: CikarSecenek, derinlik: number, bitis: number | null): Promise<MetinSonucu> {
  const uz = uzanti(dosyaAdi)
  const simdi = s.simdi ?? (() => Date.now())

  if (!veri?.length) return sonuc('DESTEKLENMIYOR', 'BOS', { uyarilar: ['Boş dosya'] })

  if (pdfImzasiVar(veri)) {
    if (!s.pdfOku) return sonuc('PDF', 'HATA', { uyarilar: ['PDF okuyucu verilmedi'] })
    const secenek: PdfOkuSecenek = { maxSayfa: s.maxSayfa, simdi: s.simdi }
    if (bitis != null) secenek.butceMs = Math.max(0, bitis - simdi())
    return pdfOkumasiniSonuca(await s.pdfOku(veri, secenek))
  }

  if (zipImzasi(veri)) {
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(veri)
    } catch (e) {
      const bicim = uz === 'udf' ? 'UDF' : uz === 'docx' ? 'DOCX' : 'ZIP'
      return sonuc(bicim, 'HATA', { uyarilar: [`Zip paketi açılamadı (bozuk ya da şifreli) — ${hataMesaji(e)}`] })
    }
    if (zip.file('word/document.xml')) return docxMetni(zip)
    if (zip.file('xl/workbook.xml')) return sonuc('DESTEKLENMIYOR', 'DESTEKLENMIYOR', { uyarilar: ['XLSX metni v1 hattında okunmuyor'] })
    const mimetype = zip.file('mimetype')
    if (mimetype && /opendocument/i.test(await mimetype.async('string').catch(() => ''))) {
      // ODT/ODS de kökte content.xml taşır; UDF sanılmasın
      return sonuc('DESTEKLENMIYOR', 'DESTEKLENMIYOR', { uyarilar: ['OpenDocument (ODT/ODS) desteklenmiyor — DOCX veya PDF olarak kaydedin'] })
    }
    // UDF: content.xml kökte; .udf uzantılıysa zip içinde herhangi bir klasörde de aranır
    // (e-imzalı UDF'nin paket yapısı teyit gerekli). content.xml hiç yoksa udfMetni açık HATA döner.
    if (zip.file('content.xml') || uz === 'udf') return udfMetni(zip)
    const alt = (v: Uint8Array, ad: string, d: number) => cikarIc(v, ad, s, d, bitis)
    return paketMetni(zip, eypMi(zip, dosyaAdi) ? 'EYP' : 'ZIP', alt, derinlik, s.paketSinir ?? PAKET_SINIR)
  }

  if (gorselImzasi(veri)) {
    return sonuc('GORSEL', 'OCR_GEREKLI', { ocrGerekli: true, uyarilar: ['Görsel evrak: metin katmanı yok — OCR gerekli'] })
  }

  if (oleImzasi(veri) || DESTEKLENMEYEN[uz]) {
    return sonuc('DESTEKLENMIYOR', 'DESTEKLENMIYOR', { uyarilar: [DESTEKLENMEYEN[uz] ?? 'Eski Office (OLE) biçimi desteklenmiyor'] })
  }

  // Uzantısı paket/PDF diyor ama imzası tutmuyor → açık "bozuk" sebebi (desteklenmiyor değil)
  if (uz === 'udf' || uz === 'docx' || uz === 'eyp' || uz === 'zip') {
    const bicim = uz === 'udf' ? 'UDF' : uz === 'docx' ? 'DOCX' : uz === 'eyp' ? 'EYP' : 'ZIP'
    return sonuc(bicim, 'HATA', { uyarilar: [`${bicim} açılamadı: geçerli bir zip paketi değil (bozuk dosya)`] })
  }
  if (uz === 'pdf') return sonuc('PDF', 'HATA', { uyarilar: ['PDF imzası yok (%PDF): dosya PDF değil ya da bozuk'] })

  if (uz === 'html' || uz === 'htm') return htmlMetni(veri)
  if (uz === 'txt' || uz === 'csv' || uz === 'tsv' || uz === 'md' || uz === 'log') return txtMetni(veri, dosyaAdi)

  return sonuc('DESTEKLENMIYOR', 'DESTEKLENMIYOR', { uyarilar: [`'${uz || 'uzantısız'}' biçimi desteklenmiyor`] })
}

/**
 * Evrak baytından metin çıkar. ASLA fırlatmaz: her beklenmeyen hata `durum = HATA` olarak döner.
 * @param veri     dosya baytları (Buffer da olur)
 * @param dosyaAdi yalnız ipucu (uzantı); asıl karar bayt imzasından
 */
export async function evrakMetniCikar(veri: Uint8Array, dosyaAdi: string, secenek: CikarSecenek = {}): Promise<MetinSonucu> {
  try {
    const simdi = secenek.simdi ?? (() => Date.now())
    const bitis = secenek.butceMs != null ? simdi() + secenek.butceMs : null
    const v = veri instanceof Uint8Array ? veri : new Uint8Array(veri as ArrayBufferLike)
    const s = await cikarIc(v, dosyaAdi ?? '', secenek, 0, bitis)
    return sonIslem(s, secenek.azamiKarakter ?? AZAMI_KARAKTER)
  } catch (e) {
    return sonuc('DESTEKLENMIYOR', 'HATA', { uyarilar: [`Beklenmeyen hata — ${hataMesaji(e)}`] })
  }
}
