/**
 * KonsRücü — sunucu tarafı PDF metin çıkarımı (₺0) · lib/konsrucu/pdf-metin.ts  (server-only)
 * pdfjs-dist legacy build ile Node'da PDF'in METİN KATMANINI okur (canvas/render gerekmez).
 * Amaç: makbuz/dekont gibi METİNLİ PDF'leri LLM'e GÖNDERMEDEN, bedavaya okumak (masraf-cikar katman 1)
 * ve S16'dan beri evrak metin hattının sunucu PDF okuyucusu olmak (evrak-metin/sunucu.ts).
 *
 * - Satır yapısı KORUNUR: pdfjs metni konumsuz parça akışı verir; y-koordinatına göre satırlara,
 *   x'e göre sıralayıp birleştiririz → "Başvurma Harcı   54,40 TL" tek satır olur (cins↔tutar eşlemesi
 *   için şart). Sayfa mantığı artık evrak-metin/pdf.ts'te (tarayıcıyla ORTAK); burada yalnız pdfjs yüklenir.
 * - Taranmış (görüntü) PDF'te metin katmanı yoktur → null döner; çağıran LLM vision'a düşer.
 * - HER hata sessizce null döndürür: regresyon yok (çağıran fallback'e geçer). pdfjs sunucuda
 *   bundle DIŞI tutulur (next.config serverComponentsExternalPackages) → worker/path sorunları olmaz.
 */
import 'server-only'
import { pdfBelgeOku, type PdfOkuma, type PdfOkuSecenek } from './evrak-metin/pdf'

/** pdfjs'i (CJS/UMD legacy) yükle ve default-interop'u normalize et. */
async function pdfLib(): Promise<any | null> {
  try {
    const mod: any = await import('pdfjs-dist/legacy/build/pdf.js')
    const lib = mod?.getDocument ? mod : mod?.default
    if (!lib?.getDocument) return null
    // Node: ayrı worker thread yok — ana iş parçacığında (fake worker) çöz.
    try {
      if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
        const { createRequire } = await import('module')
        const req = createRequire(import.meta.url)
        lib.GlobalWorkerOptions.workerSrc = req.resolve('pdfjs-dist/legacy/build/pdf.worker.js')
      }
    } catch { /* fake worker yine de devreye girer */ }
    return lib
  } catch (e) {
    console.error('pdfLib yükleme hatası:', e)
    return null
  }
}

/**
 * PDF'i SAYFA BAZINDA oku (evrak metin hattı). Sayfa sınırı yok (secenek.maxSayfa ile verilebilir),
 * OCR adayı sayfaları işaretler. ASLA fırlatmaz.
 */
export async function pdfBelgeOkuSunucu(bytes: Uint8Array, secenek?: PdfOkuSecenek): Promise<PdfOkuma> {
  const lib = await pdfLib()
  return pdfBelgeOku(lib, bytes, secenek)
}

/**
 * PDF baytlarından metni çıkar (satır yapısı korunur). Metin katmanı yoksa / hata olursa null.
 * (S16 öncesiyle aynı çıktı: sayfalar '\n' ile birleşir, başlık/işaret eklenmez.)
 * @param bytes    PDF baytları
 * @param maxSayfa okunacak azami sayfa (makbuzlar 1-2 sayfa; varsayılan 12)
 */
export async function pdfMetinCikar(bytes: Buffer, maxSayfa = 12): Promise<string | null> {
  if (!bytes?.length) return null
  // Hızlı eleme: %PDF imzası yoksa uğraşma (görüntü/başka format → çağıran vision'a düşsün).
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return null
  const lib = await pdfLib()
  if (!lib) return null
  const o = await pdfBelgeOku(lib, bytes, { maxSayfa, ocrTespiti: false })
  if (o.durum !== 'OK' || o.sayfalar.some((s) => s.hata)) {
    if (o.durum === 'BOZUK' || o.durum === 'SIFRELI') console.error('pdfMetinCikar hata:', o.hata)
    return null
  }
  const metin = o.sayfalar.map((s) => s.metin).join('\n').trim()
  return metin || null
}
