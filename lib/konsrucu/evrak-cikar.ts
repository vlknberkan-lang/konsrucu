/**
 * KonsRücü — yerel evrak çıkarımı (tarayıcıda, ₺0) · lib/konsrucu/evrak-cikar.ts
 * Sürüklenen dosyalar SUNUCUYA GİTMEDEN işlenir: pdf.js ile PDF metni, EXIF (tarih/kamera),
 * görsel boyutu, dosya adından kategori tahmini. Sonuç sunucuya yazılır (belgeEkle).
 * (ingest-panel.tsx içindeki mantığın paylaşılan, yeniden kullanılabilir hâli.)
 *
 * S16 (evrak metin hattı v1): PDF, UDF, EYP/zip, DOCX ve TXT metni sunucudaki UYAP yoluyla AYNI ortak
 * çıkarıcıdan (lib/konsrucu/evrak-metin) geçer: PDF sayfa bazında ve satır yapısıyla okunur, eski 20 sayfa
 * sınırı kalktı (sınıflandırma bütün metni görür; sunucuya giden metin aşağıdaki gövde sınırına tabidir ve kesilirse
 * bu metnin içinde açıkça yazar), taranmış sayfa "OCR GEREKLİ" işaretiyle yerinde gösterilir;
 * tamamen taranmış belgede metin boş kalır ve `ocrGerekli` işareti döner (OCR S17'de).
 * Biçim dosya adından değil bayt imzasından anlaşılır. Tek dosyanın hatası partiyi düşürmez.
 *
 * Gövde sınırı: metin sunucuya belgeEkle server action'ının gövdesinde gider (Next.js varsayılanı 1 MB). Bu yüzden
 * belge başına ELLE_YUKLEME_METIN_SINIRI ve parti başına TARAYICI_TOPLAM_SINIR uygulanır; aşılan metin kesilir ama
 * kesildiği metnin içinde açıkça yazar (sessiz kesme yok). Tam metin: sunucu hattı (B1b kuyruğu / S17).
 */

import { siniflandir } from './belge-siniflandir'
import type { PdfOkuyucu } from './evrak-metin/pdf'
import { ELLE_YUKLEME_METIN_SINIRI, metniSinirla } from './evrak-metin/ortak'

export type IslenmisBelge = {
  dosyaAdi: string
  kategori: string // BelgeKategori değerleri
  guven?: number // sınıflandırma güveni (0-1) → confidence
  extractedText: string | null
  genislik?: number
  yukseklik?: number
  kamera?: string
  exifTarih?: string // ISO
  storagePath?: string // Supabase Storage yolu (bayt yüklendiyse)
  /** Metin yöntemi (METIN_KATMANI, UDF, DOCX, EYP, TXT … +OCR_GEREKLI) — bilgi amaçlı; sunucu şu an saklamaz */
  metinYontemi?: string
  /** Taranmış sayfa/görüntü var → OCR gerekli (S17). Kalıcı durum kolonu B1b şemasıyla gelir. */
  ocrGerekli?: boolean
  /** Metin gövde sınırı yüzünden kesildi (metnin sonunda açık işaret var). */
  metinKesildi?: boolean
}

function imgDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url) }
    img.src = url
  })
}

// Ağır kütüphaneler yalnız gerektiğinde yüklenir (UDF/TXT için pdf.js, görsel olmayan için exifr inmesin).
let pdfjsSozu: Promise<any> | null = null
function pdfjsYukle(): Promise<any> {
  if (!pdfjsSozu) {
    pdfjsSozu = import('pdfjs-dist').then((pdfjs: any) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
      return pdfjs
    })
    pdfjsSozu.catch(() => { pdfjsSozu = null }) // yükleme hatası kalıcı olmasın
  }
  return pdfjsSozu
}
let exifrSozu: Promise<any> | null = null
const exifrYukle = () => (exifrSozu ??= import('exifr').then((m: any) => m.default ?? m))

/** Tarayıcı PDF okuyucusu: ortak sayfa mantığı (evrak-metin/pdf) + tarayıcı pdf.js. */
const tarayiciPdfOku: PdfOkuyucu = async (veri, secenek) => {
  const [pdfjs, { pdfBelgeOku }] = await Promise.all([pdfjsYukle(), import('./evrak-metin/pdf')])
  return pdfBelgeOku(pdfjs, veri, secenek)
}

/** Tarayıcıda dosya başına süre bütçesi (çok büyük belgede sekme kilitlenmesin; aşılırsa kalan sayfa açıkça yazılır). */
const TARAYICI_BUTCE_MS = 120_000

/** Tek partide (tek belgeEkle çağrısı) sunucuya giden toplam metin bütçesi — 1 MB server action gövdesinin altında
 *  kalsın (Türkçe metin UTF-8'de ≈1,1 bayt/karakter + JSON kaçışları). Bütçe bitince sonraki belgeler yine
 *  en az TARAYICI_ASGARI_METIN karakterle (başlık, taraflar) gider. */
export const TARAYICI_TOPLAM_SINIR = 500_000
export const TARAYICI_ASGARI_METIN = 2_000

/** Dosyaları tarayıcıda işle → sunucuya yazılacak normalize belge listesi. */
export async function evrakCikar(
  files: File[],
  onProgress?: (done: number, total: number, ad: string) => void,
): Promise<IslenmisBelge[]> {
  const out: IslenmisBelge[] = []
  let kalanButce = TARAYICI_TOPLAM_SINIR
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const lower = f.name.toLowerCase()
    let foto = false
    let text: string | null = null
    let w: number | undefined
    let h: number | undefined
    let kamera: string | undefined
    let exifTarih: string | undefined
    let metinYontemi: string | undefined
    let ocrGerekli: boolean | undefined

    try {
      if (f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp|gif)$/.test(lower)) {
        const dim = await imgDims(f)
        w = dim.w; h = dim.h
        const exifr = await exifrYukle()
        const ex = await exifr.parse(f, ['DateTimeOriginal', 'Make', 'Model']).catch(() => null)
        if (ex?.DateTimeOriginal) { try { exifTarih = new Date(ex.DateTimeOriginal).toISOString() } catch { /* */ } }
        const kam = [ex?.Make, ex?.Model].filter(Boolean).join(' ').trim()
        if (kam) kamera = kam
        const aspect = w && h ? h / w : 0
        // dikey ~A4 + büyük = belge taraması; aksi halde hasar fotoğrafı
        foto = !(aspect > 1.2 && aspect < 1.75 && Math.max(w ?? 0, h ?? 0) > 1000)
        if (!foto) { ocrGerekli = true; metinYontemi = 'OCR_GEREKLI' } // taranmış belge görüntüsü: OCR S17'de
      } else if (lower.endsWith('.html') || lower.endsWith('.htm') || f.type === 'text/html') {
        const buf = await f.arrayBuffer()
        let html = new TextDecoder('utf-8').decode(buf)
        // Türkçe karakter bozulması (�) varsa windows-1254 ile yeniden çöz (Tramer/ekspertiz HTML'leri)
        if ((html.match(/�/g) || []).length > 5) {
          try { html = new TextDecoder('windows-1254').decode(buf) } catch { /* */ }
        }
        text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim() || null
      } else {
        // PDF, UDF, EYP/zip, DOCX, TXT … — ortak çıkarıcı (ASLA fırlatmaz)
        const veri = new Uint8Array(await f.arrayBuffer())
        const { evrakMetniCikar } = await import('./evrak-metin')
        const s = await evrakMetniCikar(veri, f.name, { pdfOku: tarayiciPdfOku, butceMs: TARAYICI_BUTCE_MS })
        text = s.metin
        metinYontemi = s.yontem
        if (s.ocrGerekli || s.durum === 'OCR_GEREKLI') ocrGerekli = true
      }
    } catch { /* tek dosya hatası tüm partiyi düşürmesin */ }

    const snf = siniflandir({ dosyaAdi: f.name, metin: text, foto }) // sınıflandırma tam metni görür
    let metinKesildi: boolean | undefined
    if (text) {
      const pay = Math.min(ELLE_YUKLEME_METIN_SINIRI, Math.max(TARAYICI_ASGARI_METIN, kalanButce))
      const k = metniSinirla(text, pay)
      text = k.metin
      if (k.kesildi) metinKesildi = true
      kalanButce -= text.length
    }
    out.push({ dosyaAdi: f.name, kategori: snf.kategori, guven: snf.guven, extractedText: text, genislik: w, yukseklik: h, kamera, exifTarih, metinYontemi, ocrGerekli, metinKesildi })
    onProgress?.(i + 1, files.length, f.name)
  }
  return out
}
