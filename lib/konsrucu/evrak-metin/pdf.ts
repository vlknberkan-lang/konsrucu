/**
 * KonsRücü — evrak metin hattı · PDF metin katmanı, SAYFA BAZINDA · lib/konsrucu/evrak-metin/pdf.ts (saf)
 * pdfjs kütüphanesini ÇAĞIRAN verir (sunucu: pdf-metin.ts → legacy build; tarayıcı: evrak-cikar.ts →
 * 'pdfjs-dist'), bu modül pdfjs'i kendisi yüklemez → iki ortamda aynı sayfa mantığı.
 *
 * - Satır yapısı korunur (sayfaSatirla — eskiden pdf-metin.ts içindeydi, masraf çıkarımı buna dayanır).
 * - Sayfa sınırı YOK (varsayılan); yalnız süre bütçesi. Bütçe dolarsa okunmayan sayfalar açıkça bildirilir
 *   (uzun belgenin sonu sessizce kesilmez; B40). Tarayıcıdaki eski 20 sayfa sınırı kalktı.
 * - OCR adayı: sayfada ANLAMLI_ESIK'ten az harf/rakam → TARANMIS; tam sayfa görüntü + kısa metin
 *   (UYAP e-imza alt bilgisi taranmış sayfayı metinli göstermesin) → HIBRIT (06 · 5.3; cikar.py ile aynı eşikler).
 */
import {
  ANLAMLI_ESIK, HIBRIT_ESIK, HIBRIT_GORUNTU_ORANI, HIBRIT_ISARET, OCR_GEREKLI_ISARET,
  anlamliSay, hataMesaji, sayfalariBirlestir, sonuc, type MetinSonucu,
} from './ortak'

type PdfItem = { str?: unknown; transform?: number[] }

export type PdfSayfa = {
  no: number
  metin: string
  anlamli: number
  /** OCR adayı mı: TARANMIS (metin katmanı yok) | HIBRIT (tam sayfa görüntü + kısa metin) | null */
  ocr: 'TARANMIS' | 'HIBRIT' | null
  /** Sayfa okunurken hata oldu (metin boş) */
  hata?: boolean
}

export type PdfOkuma = {
  durum: 'OK' | 'SIFRELI' | 'BOZUK' | 'PDF_DEGIL' | 'KUTUPHANE_YOK'
  toplamSayfa: number
  sayfalar: PdfSayfa[]
  /** Bütçe ya da maxSayfa yüzünden okunmayan sayfa sayısı (sondaki sayfalar) */
  okunmayan: number
  sureDoldu?: boolean
  hata?: string
}

export type PdfOkuSecenek = {
  /** Okunacak azami sayfa (varsayılan: sınırsız) */
  maxSayfa?: number
  /** Süre bütçesi (ms); dolunca kalan sayfalar okunmaz ve `okunmayan`da bildirilir. En az 1 sayfa her zaman okunur. */
  butceMs?: number
  /** Hibrit sayfa tespiti için görüntü alanı ölçülsün mü (varsayılan true) */
  ocrTespiti?: boolean
  /** Test için saat */
  simdi?: () => number
}

/** PDF okuyucu imzası (ortama göre pdfjs'i bağlayan sarmalayıcı) */
export type PdfOkuyucu = (veri: Uint8Array, secenek?: PdfOkuSecenek) => Promise<PdfOkuma>

/** Tek sayfanın parça akışını satırlara dök (y bandına göre grupla, x'e göre sırala). */
export function sayfaSatirla(items: PdfItem[]): string {
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
 * Sayfadaki görüntülerin kapladığı alan / sayfa alanı (0–1). pdfjs operatör listesinde dönüşüm matrisinin
 * determinantı izlenir: görüntü birim kareye çizildiği için alanı |det(CTM)|'dir. Kırpma ve üst üste binme
 * hesaba katılmaz (kaba ölçü; yalnız "sayfanın çoğu görüntü mü" sorusu için).
 */
export function goruntuOrani(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>, view: number[]): number {
  const alan = Math.abs(((view?.[2] ?? 0) - (view?.[0] ?? 0)) * ((view?.[3] ?? 0) - (view?.[1] ?? 0))) || 1
  const det = (m: unknown): number => {
    const a = m as number[]
    return Array.isArray(a) && a.length >= 4 ? Number(a[0]) * Number(a[3]) - Number(a[1]) * Number(a[2]) : 1
  }
  const gorselOp = new Set(
    ['paintImageXObject', 'paintInlineImageXObject', 'paintJpegXObject', 'paintImageMaskXObject']
      .map((k) => OPS[k]).filter((v) => typeof v === 'number'),
  )
  let d = 1
  const yigin: number[] = []
  let toplam = 0
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown[] | null
    if (fn === OPS.save) yigin.push(d)
    else if (fn === OPS.restore) d = yigin.length ? (yigin.pop() as number) : d
    else if (fn === OPS.transform) d *= det(args)
    else if (fn === OPS.paintFormXObjectBegin) { yigin.push(d); if (args?.[0]) d *= det(args[0]) }
    else if (fn === OPS.paintFormXObjectEnd) d = yigin.length ? (yigin.pop() as number) : d
    else if (gorselOp.has(fn)) toplam += Math.abs(d)
    else if (fn === OPS.paintImageXObjectRepeat || fn === OPS.paintImageMaskXObjectRepeat) {
      // args: [nesne, ölçekX, ölçekY, konumlar[]] (maske tekrarında [nesne, ölçekX, 0, 0, ölçekY, konumlar])
      const a = args ?? []
      const konum = a[a.length - 1] as unknown[] | undefined
      const adet = Array.isArray(konum) || ArrayBuffer.isView(konum) ? Math.floor((konum as { length: number }).length / 2) : 1
      const sx = Number(a[1]) || 1
      const sy = Number(a.length >= 6 ? a[4] : a[2]) || 1
      toplam += Math.abs(d * sx * sy) * adet
    }
  }
  return Math.min(1, toplam / alan)
}

function sayfaSinifi(anlamli: number, oran: () => Promise<number>): Promise<PdfSayfa['ocr']> {
  if (anlamli < ANLAMLI_ESIK) return Promise.resolve('TARANMIS')
  if (anlamli >= HIBRIT_ESIK) return Promise.resolve(null)
  return oran().then((o) => (o >= HIBRIT_GORUNTU_ORANI ? 'HIBRIT' : null)).catch(() => null)
}

/**
 * PDF'i sayfa sayfa oku. ASLA fırlatmaz. `lib` = yüklenmiş pdfjs modülü (getDocument + OPS).
 */
export async function pdfBelgeOku(lib: any, veri: Uint8Array, secenek: PdfOkuSecenek = {}): Promise<PdfOkuma> {
  const bos = (durum: PdfOkuma['durum'], hata?: string): PdfOkuma => ({ durum, toplamSayfa: 0, sayfalar: [], okunmayan: 0, hata })
  if (!veri?.length) return bos('PDF_DEGIL')
  if (!pdfImzasiVar(veri)) return bos('PDF_DEGIL')
  if (!lib?.getDocument) return bos('KUTUPHANE_YOK')
  const simdi = secenek.simdi ?? (() => Date.now())
  const baslangic = simdi()
  const ocrTespiti = secenek.ocrTespiti !== false
  let doc: any = null
  try {
    doc = await lib.getDocument({
      data: new Uint8Array(veri), // kopya: pdfjs tamponu devralabilir, çağıranın baytı bozulmasın
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    }).promise
  } catch (e) {
    const ad = (e as { name?: string })?.name
    if (ad === 'PasswordException') return bos('SIFRELI', 'Şifreli PDF: parola gerekli')
    return bos('BOZUK', hataMesaji(e))
  }
  try {
    const toplam = Number(doc.numPages) || 0
    const hedef = Math.min(toplam, secenek.maxSayfa ?? toplam)
    const sayfalar: PdfSayfa[] = []
    let sureDoldu = false
    for (let p = 1; p <= hedef; p++) {
      if (p > 1 && secenek.butceMs != null && simdi() - baslangic > secenek.butceMs) { sureDoldu = true; break }
      let page: any = null
      try {
        page = await doc.getPage(p)
        const c = await page.getTextContent()
        const metin = sayfaSatirla(c.items as PdfItem[])
        const anlamli = anlamliSay(metin)
        const ocr = ocrTespiti
          ? await sayfaSinifi(anlamli, async () => goruntuOrani(await page.getOperatorList(), lib.OPS ?? {}, page.view))
          : null
        sayfalar.push({ no: p, metin, anlamli, ocr })
      } catch {
        sayfalar.push({ no: p, metin: '', anlamli: 0, ocr: ocrTespiti ? 'TARANMIS' : null, hata: true })
      } finally {
        try { page?.cleanup?.() } catch { /* yoksay */ }
      }
    }
    return { durum: 'OK', toplamSayfa: toplam, sayfalar, okunmayan: toplam - sayfalar.length, sureDoldu }
  } catch (e) {
    return bos('BOZUK', hataMesaji(e))
  } finally {
    try { await doc?.destroy?.() } catch { /* yoksay */ }
  }
}

/** %PDF imzası ilk 1 KB içinde mi (bazı üreticiler başa çöp bayt koyar; pdfjs bunu tolere eder). */
export function pdfImzasiVar(veri: Uint8Array): boolean {
  const n = Math.min(veri.length - 3, 1024)
  for (let i = 0; i < n; i++) {
    if (veri[i] === 0x25 && veri[i + 1] === 0x50 && veri[i + 2] === 0x44 && veri[i + 3] === 0x46) return true
  }
  return false
}

/** Sayfa okumasını ortak sonuca çevir (OCR işaretleri sayfanın yerinde). */
export function pdfOkumasiniSonuca(o: PdfOkuma): MetinSonucu {
  if (o.durum === 'SIFRELI') return sonuc('PDF', 'HATA', { uyarilar: ['Şifreli PDF: parola gerekli, metin çıkarılamadı'] })
  if (o.durum === 'BOZUK') return sonuc('PDF', 'HATA', { uyarilar: [`PDF açılamadı (bozuk olabilir) — ${o.hata ?? 'bilinmeyen hata'}`] })
  if (o.durum === 'PDF_DEGIL') return sonuc('PDF', 'HATA', { uyarilar: ['PDF imzası yok (%PDF): dosya PDF değil ya da bozuk'] })
  if (o.durum === 'KUTUPHANE_YOK') return sonuc('PDF', 'HATA', { uyarilar: ['PDF kütüphanesi yüklenemedi'] })
  if (o.toplamSayfa === 0) return sonuc('PDF', 'BOS', { sayfaSayisi: 0, uyarilar: ["PDF'de sayfa yok"] })

  const uyarilar: string[] = []
  const ocrSayfalari: number[] = []
  const metinler: string[] = []
  let metinliSayfa = 0
  for (const s of o.sayfalar) {
    if (s.hata) uyarilar.push(`Sayfa ${s.no} metni okunamadı`)
    if (s.ocr === 'TARANMIS') {
      ocrSayfalari.push(s.no)
      metinler.push([OCR_GEREKLI_ISARET, s.metin.trim()].filter(Boolean).join('\n'))
    } else if (s.ocr === 'HIBRIT') {
      ocrSayfalari.push(s.no)
      uyarilar.push(`Sayfa ${s.no}: taranmış görüntü + kısa metin katmanı; görüntüdeki içerik okunmadı (OCR gerekli)`)
      metinler.push([HIBRIT_ISARET, s.metin.trim()].filter(Boolean).join('\n'))
    } else {
      if (s.anlamli > 0) metinliSayfa++
      metinler.push(s.metin)
    }
  }
  const eksik = o.okunmayan > 0
  const ilkOkunmayan = o.sayfalar.length + 1
  if (eksik) {
    uyarilar.push(
      `Sayfa ${ilkOkunmayan}–${o.toplamSayfa} okunmadı (${o.sureDoldu ? 'süre bütçesi doldu' : 'sayfa sınırı'}); yeniden okuma gerekli`,
    )
  }
  const ocrGerekli = ocrSayfalari.length > 0
  const yontem = 'METIN_KATMANI' + (ocrGerekli ? '+OCR_GEREKLI' : '')
  if (!metinliSayfa) {
    // Hiçbir sayfada gerçek metin katmanı yok: tamamen taranmış (ya da yalnız e-imza alt bilgili) evrak.
    // Metin YAZILMAZ (işaret metni "metin var" sanılmasın); işaret durum + ocrSayfalari ile taşınır.
    return sonuc('PDF', ocrGerekli ? 'OCR_GEREKLI' : 'BOS', {
      yontem: ocrGerekli ? 'OCR_GEREKLI' : 'BOS',
      sayfalar: metinler, sayfaSayisi: o.toplamSayfa, ocrGerekli, ocrSayfalari, uyarilar, eksik,
    })
  }
  let metin = sayfalariBirlestir(metinler, o.toplamSayfa)
  if (eksik) metin += `\n\n===== Sayfa ${ilkOkunmayan}–${o.toplamSayfa}/${o.toplamSayfa}: okunmadı (${o.sureDoldu ? 'süre sınırı' : 'sayfa sınırı'}) =====`
  return sonuc('PDF', 'OKUNDU', { yontem, metin, sayfalar: metinler, sayfaSayisi: o.toplamSayfa, ocrGerekli, ocrSayfalari, uyarilar, eksik })
}
