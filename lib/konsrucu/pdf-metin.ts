/**
 * KonsRücü — sunucu tarafı PDF metin çıkarımı (₺0) · lib/konsrucu/pdf-metin.ts  (server-only)
 * pdfjs-dist legacy build ile Node'da PDF'in METİN KATMANINI okur (canvas/render gerekmez).
 * Amaç: makbuz/dekont gibi METİNLİ PDF'leri LLM'e GÖNDERMEDEN, bedavaya okumak (masraf-cikar katman 1).
 *
 * - Satır yapısı KORUNUR: pdfjs metni konumsuz parça akışı verir; y-koordinatına göre satırlara,
 *   x'e göre sıralayıp birleştiririz → "Başvurma Harcı   54,40 TL" tek satır olur (cins↔tutar eşlemesi
 *   için şart).
 * - Taranmış (görüntü) PDF'te metin katmanı yoktur → null döner; çağıran LLM vision'a düşer.
 * - HER hata sessizce null döndürür: regresyon yok (çağıran fallback'e geçer). pdfjs sunucuda
 *   bundle DIŞI tutulur (next.config serverComponentsExternalPackages) → worker/path sorunları olmaz.
 */
import 'server-only'

type PdfItem = { str?: unknown; transform?: number[] }

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

/** Tek sayfanın parça akışını satırlara dök (y bandına göre grupla, x'e göre sırala). */
function sayfaSatirla(items: PdfItem[]): string {
  type Parca = { x: number; y: number; s: string }
  const parcalar: Parca[] = []
  for (const it of items) {
    const s = typeof it?.str === 'string' ? it.str : ''
    if (!s) continue
    const t = it.transform
    const x = Array.isArray(t) ? Number(t[4]) || 0 : 0
    const y = Array.isArray(t) ? Number(t[5]) || 0 : 0
    parcalar.push({ x, y, s })
  }
  if (!parcalar.length) return ''
  // y bandına göre grupla (2px tolerans) — üstten alta
  parcalar.sort((a, b) => b.y - a.y || a.x - b.x)
  const satirlar: Parca[][] = []
  let aktif: Parca[] = []
  let sonY = Number.NaN
  for (const p of parcalar) {
    if (Number.isNaN(sonY) || Math.abs(p.y - sonY) <= 2) {
      aktif.push(p)
    } else {
      satirlar.push(aktif)
      aktif = [p]
    }
    sonY = p.y
  }
  if (aktif.length) satirlar.push(aktif)
  return satirlar
    .map((sat) => sat.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * PDF baytlarından metni çıkar (satır yapısı korunur). Metin katmanı yoksa / hata olursa null.
 * @param bytes    PDF baytları
 * @param maxSayfa okunacak azami sayfa (makbuzlar 1-2 sayfa; varsayılan 12)
 */
export async function pdfMetinCikar(bytes: Buffer, maxSayfa = 12): Promise<string | null> {
  if (!bytes?.length) return null
  // Hızlı eleme: %PDF imzası yoksa uğraşma (görüntü/başka format → çağıran vision'a düşsün).
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return null
  const lib = await pdfLib()
  if (!lib) return null
  try {
    const doc = await lib.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
    }).promise
    const n = Math.min(doc.numPages || 0, maxSayfa)
    const sayfalar: string[] = []
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p)
      const c = await page.getTextContent()
      sayfalar.push(sayfaSatirla(c.items as PdfItem[]))
      try { page.cleanup?.() } catch { /* yoksay */ }
    }
    try { await doc.destroy() } catch { /* yoksay */ }
    const metin = sayfalar.join('\n').trim()
    return metin || null
  } catch (e) {
    console.error('pdfMetinCikar hata:', e)
    return null
  }
}
