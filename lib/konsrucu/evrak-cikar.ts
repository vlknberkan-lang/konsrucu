/**
 * KonsRücü — yerel evrak çıkarımı (tarayıcıda, ₺0) · lib/konsrucu/evrak-cikar.ts
 * Sürüklenen dosyalar SUNUCUYA GİTMEDEN işlenir: pdf.js ile PDF metni, EXIF (tarih/kamera),
 * görsel boyutu, dosya adından kategori tahmini. Sonuç sunucuya yazılır (belgeEkle).
 * (ingest-panel.tsx içindeki mantığın paylaşılan, yeniden kullanılabilir hâli.)
 */

import { siniflandir } from './belge-siniflandir'

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

/** Dosyaları tarayıcıda işle → sunucuya yazılacak normalize belge listesi. */
export async function evrakCikar(
  files: File[],
  onProgress?: (done: number, total: number, ad: string) => void,
): Promise<IslenmisBelge[]> {
  const pdfjs: any = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
  const exifr: any = (await import('exifr')).default

  const out: IslenmisBelge[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const lower = f.name.toLowerCase()
    let foto = false
    let text: string | null = null
    let w: number | undefined
    let h: number | undefined
    let kamera: string | undefined
    let exifTarih: string | undefined

    try {
      if (f.type === 'application/pdf' || lower.endsWith('.pdf')) {
        const buf = await f.arrayBuffer()
        const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise
        let txt = ''
        const n = Math.min(doc.numPages, 20)
        for (let p = 1; p <= n; p++) {
          const page = await doc.getPage(p)
          const c = await page.getTextContent()
          txt += c.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' ') + '\n'
        }
        text = txt.trim() || null
        try { await doc.destroy() } catch { /* yoksay */ }
      } else if (f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp|gif)$/.test(lower)) {
        const dim = await imgDims(f)
        w = dim.w; h = dim.h
        const ex = await exifr.parse(f, ['DateTimeOriginal', 'Make', 'Model']).catch(() => null)
        if (ex?.DateTimeOriginal) { try { exifTarih = new Date(ex.DateTimeOriginal).toISOString() } catch { /* */ } }
        const kam = [ex?.Make, ex?.Model].filter(Boolean).join(' ').trim()
        if (kam) kamera = kam
        const aspect = w && h ? h / w : 0
        // dikey ~A4 + büyük = belge taraması; aksi halde hasar fotoğrafı
        foto = !(aspect > 1.2 && aspect < 1.75 && Math.max(w ?? 0, h ?? 0) > 1000)
      } else if (lower.endsWith('.html') || lower.endsWith('.htm') || f.type === 'text/html') {
        const buf = await f.arrayBuffer()
        let html = new TextDecoder('utf-8').decode(buf)
        // Türkçe karakter bozulması (�) varsa windows-1254 ile yeniden çöz (Tramer/ekspertiz HTML'leri)
        if ((html.match(/�/g) || []).length > 5) {
          try { html = new TextDecoder('windows-1254').decode(buf) } catch { /* */ }
        }
        text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim() || null
      }
    } catch { /* tek dosya hatası tüm partiyi düşürmesin */ }

    const snf = siniflandir({ dosyaAdi: f.name, metin: text, foto })
    out.push({ dosyaAdi: f.name, kategori: snf.kategori, guven: snf.guven, extractedText: text, genislik: w, yukseklik: h, kamera, exifTarih })
    onProgress?.(i + 1, files.length, f.name)
  }
  return out
}
