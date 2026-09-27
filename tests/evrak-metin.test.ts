/**
 * S16 · Evrak metin hattı v1 (çekirdek) — lib/konsrucu/evrak-metin.
 * Bütün örnekler KURGUSALDIR ve kodda üretilir (UDF = zip + content.xml/CDATA, PDF elle yazılmış
 * en küçük PDF, DOCX = zip + word/document.xml, EYP = OPC benzeri zip). Gerçek evrak/kişisel veri yok.
 * PDF okuma gerçek pdfjs (legacy build, sunucu yolu: pdf-metin.ts) ile yapılır.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import {
  evrakMetniCikar, goruntuOrani, ocrNotu, sayfalariBirlestir, metinNormallestir, anlamliSay,
  pdfBelgeOku, HIBRIT_ISARET, OCR_GEREKLI_ISARET, type CikarSecenek,
} from '@/lib/konsrucu/evrak-metin'
import { pdfBelgeOkuSunucu, pdfMetinCikar } from '@/lib/konsrucu/pdf-metin'
import { evrakCikar, TARAYICI_TOPLAM_SINIR, TARAYICI_ASGARI_METIN } from '@/lib/konsrucu/evrak-cikar'
import { metniSinirla, ELLE_YUKLEME_METIN_SINIRI } from '@/lib/konsrucu/evrak-metin/ortak'

// ---------------------------------------------------------------------------
// Kurgusal belge üreticileri
// ---------------------------------------------------------------------------
const CP1254: Record<string, number> = { 'ğ': 0xf0, 'Ğ': 0xd0, 'ş': 0xfe, 'Ş': 0xde, 'ı': 0xfd, 'İ': 0xdd, 'ç': 0xe7, 'Ç': 0xc7, 'ö': 0xf6, 'Ö': 0xd6, 'ü': 0xfc, 'Ü': 0xdc }
const cp1254Kodla = (s: string) => Uint8Array.from(Array.from(s).map((c) => CP1254[c] ?? c.charCodeAt(0)))

async function zipYap(uyeler: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const z = new JSZip()
  for (const [ad, veri] of Object.entries(uyeler)) z.file(ad, veri)
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

type UdfSecenek = { gorseller?: { w: number; h: number }[]; yerTutucu?: boolean; kodlama?: 'windows-1254'; yol?: string; ek?: Record<string, string | Uint8Array> }

/** UYAP UDF benzeri: <template><content><![CDATA[metin]]></content><properties/><elements>… */
function udfXml(metin: string, s: UdfSecenek = {}): string {
  const g = s.gorseller ?? []
  const icerik = metin + (s.yerTutucu ? g.map(() => '\n\u{FFFC}\n').join('') : '')
  const gorselXml = g.map((x, i) =>
    `<paragraph><image family="image" imageData="iVBORw0KGgo=" width="${x.w}" height="${x.h}" startOffset="${metin.length + 1 + i * 3}" length="1"/></paragraph>`,
  ).join('')
  return (
    `<?xml version="1.0" encoding="${s.kodlama ?? 'UTF-8'}" ?>\n<template format_id="1.8">\n` +
    `<content><![CDATA[${icerik}]]></content>\n` +
    '<properties><pageFormat mediaSizeName="1" leftMargin="42.5" rightMargin="42.5" topMargin="42.5" bottomMargin="42.5" paperOrientation="1"/></properties>\n' +
    `<elements resolver="hvl-default"><paragraph><content startOffset="0" length="${metin.length}"/></paragraph>${gorselXml}</elements>\n</template>`
  )
}

function udfYap(metin: string, s: UdfSecenek = {}): Promise<Uint8Array> {
  const xml = udfXml(metin, s)
  return zipYap({ [s.yol ?? 'content.xml']: s.kodlama ? cp1254Kodla(xml) : xml, ...(s.ek ?? {}) })
}

type SahteSayfa = { satirlar?: string[]; goruntu?: 'tam' | 'kucuk' }

/** En küçük geçerli PDF (Helvetica metin + isteğe bağlı görüntü XObject). Yalnız ASCII metin. */
function pdfYap(sayfalar: SahteSayfa[]): Uint8Array {
  const nesneler: (string | null)[] = []
  const ekle = (s: string | null) => { nesneler.push(s); return nesneler.length }
  const katalog = ekle(null)
  const kok = ekle(null)
  const font = ekle('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const gri = 'ff00ff00>'
  const img = ekle(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${gri.length} >>\nstream\n${gri}\nendstream`)
  const cocuklar: number[] = []
  for (const s of sayfalar) {
    let ic = ''
    if (s.goruntu === 'tam') ic += 'q 595 0 0 842 0 0 cm /Im1 Do Q\n'
    if (s.goruntu === 'kucuk') ic += 'q 60 0 0 40 20 20 cm /Im1 Do Q\n'
    let y = 800
    for (const satir of s.satirlar ?? []) {
      ic += `BT /F1 11 Tf 50 ${y} Td (${satir.replace(/([()\\])/g, '\\$1')}) Tj ET\n`
      y -= 14
    }
    const icerik = ekle(`<< /Length ${ic.length} >>\nstream\n${ic}endstream`)
    cocuklar.push(ekle(`<< /Type /Page /Parent ${kok} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${img} 0 R >> >> /Contents ${icerik} 0 R >>`))
  }
  nesneler[katalog - 1] = `<< /Type /Catalog /Pages ${kok} 0 R >>`
  nesneler[kok - 1] = `<< /Type /Pages /Kids [${cocuklar.map((c) => `${c} 0 R`).join(' ')}] /Count ${cocuklar.length} >>`
  let out = '%PDF-1.4\n'
  const ofs: number[] = []
  nesneler.forEach((n, i) => { ofs.push(out.length); out += `${i + 1} 0 obj\n${n}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n` + ofs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${nesneler.length + 1} /Root ${katalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(Buffer.from(out, 'latin1'))
}

const UZUN = 'Kurgusal rapor metni: taraflar arasindaki hasar bedeli uyusmazligi incelenmistir ve sonuc asagidadir.'
const EIMZA = 'Bu evrak 5070 sayili Elektronik Imza Kanunu geregince guvenli elektronik imza ile imzalanmistir.'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
function docxYap(govde: string, ek: Record<string, string> = {}): Promise<Uint8Array> {
  return zipYap({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${govde}</w:body></w:document>`,
    ...ek,
  })
}
const p = (s: string) => `<w:p><w:r><w:t xml:space="preserve">${s}</w:t></w:r></w:p>`

const pdfSecenek: CikarSecenek = { pdfOku: pdfBelgeOkuSunucu }
const cikar = (v: Uint8Array, ad: string, s: CikarSecenek = {}) => evrakMetniCikar(v, ad, { ...pdfSecenek, ...s })

// ---------------------------------------------------------------------------
describe('UDF (UYAP) — kurgusal', () => {
  it('content.xml CDATA metni aynen okunur (Türkçe karakter, paragraflar)', async () => {
    const metin = 'T.C.\nKURGUSAL İCRA DAİRESİ\nDosya No: 2099/1 Esas\nBorçluya ödeme emri tebliğ edilmiştir; itiraz süresi işlemektedir.'
    const s = await cikar(await udfYap(metin), 'odeme-emri.udf')
    expect(s.bicim).toBe('UDF')
    expect(s.durum).toBe('OKUNDU')
    expect(s.yontem).toBe('UDF')
    expect(s.metin).toBe(metin)
    expect(s.ocrGerekli).toBe(false)
    // <elements> altındaki <content startOffset…/> biçim öğeleri metne karışmaz
    expect(s.metin).not.toContain('startOffset')
  })

  it("eklenti UDF'yi '.pdf' adıyla gönderse de bayt imzasından UDF okunur", async () => {
    const s = await cikar(await udfYap('Kurgusal tensip zaptı: ön inceleme duruşması günü belirlenmiştir.'), 'Tensip Zaptı 2099-01-02.pdf')
    expect(s.bicim).toBe('UDF')
    expect(s.metin).toContain('ön inceleme duruşması')
  })

  it('bölünmüş CDATA, entity ve CDATA dışı metin birleştirilir', async () => {
    const xml = '<?xml version="1.0"?><template><content><![CDATA[Birinci ]]]]><![CDATA[> kısım]]> &amp; ikinci &lt;kısım&gt; &#305;&#x131;</content><elements><content startOffset="0" length="3"/></elements></template>'
    const s = await cikar(await zipYap({ 'content.xml': xml }), 'x.udf')
    expect(s.metin).toBe('Birinci ]]> kısım & ikinci <kısım> ıı')
  })

  it('büyük gömülü görüntü yer tutucunun yerine "OCR GEREKLİ" işareti alır; küçük logo işaret almaz', async () => {
    const s = await cikar(await udfYap('Vekaletname sureti ektedir.', { gorseller: [{ w: 595, h: 842 }], yerTutucu: true }), 'v.udf')
    expect(s.durum).toBe('OKUNDU')
    expect(s.yontem).toBe('UDF+OCR_GEREKLI')
    expect(s.ocrGerekli).toBe(true)
    expect(s.metin).toContain('Vekaletname sureti ektedir.')
    expect(s.metin).toContain('[Gömülü görüntü 1/1: taranmış içerik okunmadı — OCR GEREKLİ]')
    expect(s.metin).not.toContain('\u{FFFC}')

    const logo = await cikar(await udfYap('Antetli kurgusal dilekçe metni burada yer alır.', { gorseller: [{ w: 40, h: 40 }], yerTutucu: true }), 'l.udf')
    expect(logo.ocrGerekli).toBe(false)
    expect(logo.yontem).toBe('UDF')
    expect(logo.metin).toBe('Antetli kurgusal dilekçe metni burada yer alır.')
  })

  it('yalnız taranmış görüntü içeren UDF: metin yazılmaz, OCR gerekli işareti döner', async () => {
    const s = await cikar(await udfYap('', { gorseller: [{ w: 595, h: 842 }], yerTutucu: true }), 'tarama.udf')
    expect(s.durum).toBe('OCR_GEREKLI')
    expect(s.metin).toBeNull()
    expect(s.ocrGerekli).toBe(true)
    expect(ocrNotu(s)).toBe('taranmış evrak — metin yok, OCR gerekli')
  })

  it("bozuk UDF'ler fırlatmaz: kapanmamış CDATA, content.xml yok, zip değil, <content> yok", async () => {
    const kapanmamis = await cikar(await zipYap({ 'content.xml': '<template><content><![CDATA[yarim kal' }), 'bozuk.udf')
    expect(kapanmamis.durum).toBe('HATA')
    expect(kapanmamis.metin).toBeNull()
    expect(kapanmamis.uyarilar.join(' ')).toMatch(/ayrıştırılamadı/)

    const icsiz = await cikar(await zipYap({ 'baska.txt': 'x' }), 'eksik.udf')
    expect(icsiz.durum).toBe('HATA')
    expect(icsiz.uyarilar.join(' ')).toMatch(/content\.xml yok/)

    const sahte = await cikar(new TextEncoder().encode('bu bir zip degil'), 'sahte.udf')
    expect(sahte.durum).toBe('HATA')
    expect(sahte.bicim).toBe('UDF')

    const ogesiz = await cikar(await zipYap({ 'content.xml': '<?xml version="1.0"?><template><properties/></template>' }), 'ogesiz.udf')
    expect(ogesiz.durum).toBe('HATA')
    expect(ogesiz.uyarilar.join(' ')).toMatch(/<content> öğesi yok/)
  })

  it('imza dosyalı paket ve alt klasördeki content.xml (.udf) okunur — e-imzalı yapı teyit gerekli', async () => {
    const imzali = await cikar(await udfYap('Kurgusal imzalı beyan dilekçesi metni.', { ek: { 'sign.sgn': new Uint8Array([1, 2, 3]) } }), 'imzali.udf')
    expect(imzali.metin).toBe('Kurgusal imzalı beyan dilekçesi metni.')
    const alt = await cikar(await udfYap('Alt klasördeki kurgusal içerik metni.', { yol: 'belge/content.xml' }), 'alt.udf')
    expect(alt.metin).toBe('Alt klasördeki kurgusal içerik metni.')
  })

  it('Windows-1254 kodlamalı content.xml doğru çözülür', async () => {
    const s = await cikar(await udfYap('Şirket ığdır çğüşöİ ÇĞÜŞÖ', { kodlama: 'windows-1254' }), 'eski.udf')
    expect(s.metin).toBe('Şirket ığdır çğüşöİ ÇĞÜŞÖ')
  })
})

// ---------------------------------------------------------------------------
describe('PDF metin katmanı — sayfa bazında', () => {
  it('30 sayfalık PDF: 25. sayfadaki cümle metinde bulunur (sonu kesilmez), sayfa başlıkları var', async () => {
    const sayfalar: SahteSayfa[] = Array.from({ length: 30 }, (_, i) => ({ satirlar: [`${UZUN} Sayfa ${i + 1}.`] }))
    sayfalar[24].satirlar!.push('KANAAT: kurgusal bilirkisi yirmi besinci sayfada bu cumleyi yazmistir.')
    const s = await cikar(pdfYap(sayfalar), 'rapor.pdf')
    expect(s.durum).toBe('OKUNDU')
    expect(s.yontem).toBe('METIN_KATMANI')
    expect(s.sayfaSayisi).toBe(30)
    expect(s.sayfalar).toHaveLength(30)
    expect(s.sayfalar![24]).toContain('yirmi besinci sayfada bu cumleyi')
    expect(s.metin).toContain('===== Sayfa 25/30 =====')
    expect(s.metin).toContain('KANAAT: kurgusal bilirkisi yirmi besinci sayfada bu cumleyi yazmistir.')
    expect(s.metin).toContain('Sayfa 30.')
    expect(s.eksik).toBe(false)
  })

  it('tek sayfada başlık eklenmez; satır yapısı korunur', async () => {
    const s = await cikar(pdfYap([{ satirlar: ['Basvurma Harci   54,40', 'Pesin Harc   120,00', UZUN] }]), 'makbuz.pdf')
    expect(s.metin).toBe(['Basvurma Harci 54,40', 'Pesin Harc 120,00', UZUN].join('\n'))
  })

  it('tamamen taranmış PDF: metin null, OCR gerekli, sayfalar işaretli', async () => {
    const s = await cikar(pdfYap([{ goruntu: 'tam' }, { goruntu: 'tam' }]), 'mazbata.pdf')
    expect(s.durum).toBe('OCR_GEREKLI')
    expect(s.metin).toBeNull()
    expect(s.ocrGerekli).toBe(true)
    expect(s.ocrSayfalari).toEqual([1, 2])
    expect(s.sayfaSayisi).toBe(2)
  })

  it('karışık PDF: metinli sayfa okunur, taranmış sayfanın yerinde OCR işareti', async () => {
    const s = await cikar(pdfYap([{ satirlar: [UZUN] }, { goruntu: 'tam' }]), 'karisik.pdf')
    expect(s.durum).toBe('OKUNDU')
    expect(s.yontem).toBe('METIN_KATMANI+OCR_GEREKLI')
    expect(s.ocrSayfalari).toEqual([2])
    expect(s.metin).toContain(UZUN)
    expect(s.metin).toContain(`===== Sayfa 2/2 =====\n${OCR_GEREKLI_ISARET}`)
    expect(ocrNotu(s)).toBe('1/2 sayfa taranmış — OCR gerekli')
  })

  it('hibrit sayfa: tam sayfa görüntü + e-imza alt bilgisi metinli sayılmaz; küçük logolu sayfa sayılır', async () => {
    const s = await cikar(pdfYap([
      { satirlar: [UZUN, UZUN] },
      { goruntu: 'tam', satirlar: [EIMZA] },
      { goruntu: 'kucuk', satirlar: [EIMZA] },
    ]), 'hibrit.pdf')
    expect(anlamliSay(EIMZA)).toBeGreaterThanOrEqual(50) // eşiği aşan alt bilgi: yalnız görüntü oranı yakalar
    expect(s.ocrSayfalari).toEqual([2])
    expect(s.sayfalar![1]).toContain(HIBRIT_ISARET)
    expect(s.sayfalar![1]).toContain('5070 sayili')
    expect(s.sayfalar![2]).not.toContain('OCR GEREKLİ')
  })

  it('yalnız e-imza alt bilgili taranmış evrak "okundu" sayılmaz', async () => {
    const s = await cikar(pdfYap([{ goruntu: 'tam', satirlar: [EIMZA] }]), 'teblig.pdf')
    expect(s.durum).toBe('OCR_GEREKLI')
    expect(s.metin).toBeNull()
  })

  it('bozuk PDF fırlatmaz → HATA', async () => {
    const bozuk = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> bozuk bayt dizisi')
    const s = await cikar(bozuk, 'bozuk.pdf')
    expect(['HATA', 'BOS']).toContain(s.durum)
    expect(s.metin).toBeNull()
    const adiPdfIcerigiDegil = await cikar(new TextEncoder().encode('merhaba'), 'yanlis.pdf')
    expect(adiPdfIcerigiDegil.durum).toBe('HATA')
  })

  it('süre bütçesi dolarsa kalan sayfalar açıkça "okunmadı" yazılır (sessiz kesme yok)', async () => {
    let t = 0
    const s = await cikar(pdfYap([{ satirlar: [UZUN] }, { satirlar: [UZUN] }, { satirlar: [UZUN] }]), 'uzun.pdf', { butceMs: 0, simdi: () => t++ })
    expect(s.eksik).toBe(true)
    expect(s.sayfalar).toHaveLength(1)
    expect(s.metin).toContain('===== Sayfa 2–3/3: okunmadı (süre sınırı) =====')
    expect(s.uyarilar.join(' ')).toMatch(/Sayfa 2–3 okunmadı/)
  })

  it('pdfBelgeOku kütüphanesiz ya da PDF olmayan girdide fırlatmaz', async () => {
    expect((await pdfBelgeOku(null, pdfYap([{ satirlar: [UZUN] }]))).durum).toBe('KUTUPHANE_YOK')
    expect((await pdfBelgeOku({ getDocument: () => { throw new Error('x') } }, pdfYap([{}]))).durum).toBe('BOZUK')
    expect((await pdfBelgeOkuSunucu(new Uint8Array([1, 2, 3]))).durum).toBe('PDF_DEGIL')
  })

  it('PDF okuyucu verilmezse HATA (tarayıcı/sunucu bağlantısı zorunlu)', async () => {
    const s = await evrakMetniCikar(pdfYap([{ satirlar: [UZUN] }]), 'a.pdf')
    expect(s.durum).toBe('HATA')
  })
})

describe('pdfMetinCikar — geriye uyum (masraf çıkarımı)', () => {
  it('başlıksız, satırlar \\n ile; varsayılan 12 sayfa sınırı korunur', async () => {
    const pdf = Buffer.from(pdfYap(Array.from({ length: 15 }, (_, i) => ({ satirlar: [`Kalem ${i + 1}   10,00`] }))))
    const m = await pdfMetinCikar(pdf)
    expect(m).toBe(Array.from({ length: 12 }, (_, i) => `Kalem ${i + 1} 10,00`).join('\n'))
    expect(m).not.toContain('=====')
  })
  it('PDF değil / boş → null', async () => {
    expect(await pdfMetinCikar(Buffer.from('merhaba'))).toBeNull()
    expect(await pdfMetinCikar(Buffer.alloc(0))).toBeNull()
  })
})

describe('goruntuOrani — operatör listesinden görüntü alanı', () => {
  const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 }
  const view = [0, 0, 100, 200]
  it('tam sayfa görüntü ≈ 1, çeyrek sayfa ≈ 0.25, save/restore dönüşümü geri alır', () => {
    expect(goruntuOrani({ fnArray: [10, 12, 85, 11], argsArray: [null, [100, 0, 0, 200, 0, 0], ['i', 1, 1], null] }, OPS, view)).toBeCloseTo(1)
    expect(goruntuOrani({ fnArray: [10, 12, 85, 11, 85], argsArray: [null, [50, 0, 0, 100, 0, 0], ['i'], null, ['i']] }, OPS, view)).toBeCloseTo(0.25 + 1 / 20000)
  })
  it('form XObject matrisi uygulanır', () => {
    expect(goruntuOrani({ fnArray: [74, 12, 85, 75], argsArray: [[[2, 0, 0, 2, 0, 0], [0, 0, 1, 1]], [25, 0, 0, 50, 0, 0], ['i'], null] }, OPS, view)).toBeCloseTo(0.25)
  })
})

// ---------------------------------------------------------------------------
describe('DOCX / TXT / HTML / biçim tespiti', () => {
  it('DOCX: paragraf, tablo "|" satırı, sekme; izli silinen metin ve Fallback kopyası okunmaz; üst/alt bilgi', async () => {
    const govde =
      p('KURGUSAL CEVAP DİLEKÇESİ') +
      '<w:p><w:r><w:t>Talep</w:t></w:r><w:r><w:tab/><w:t>kabul edilmemektedir.</w:t></w:r><w:del><w:r><w:delText>SİLİNEN METİN</w:delText></w:r></w:del><w:ins><w:r><w:t xml:space="preserve"> Eklenen.</w:t></w:r></w:ins></w:p>' +
      '<w:tbl><w:tr><w:tc>' + p('Hasar Tarihi') + '</w:tc><w:tc>' + p('01.01.2099') + '</w:tc></w:tr>' +
      '<w:tr><w:tc>' + p('Tutar') + '</w:tc><w:tc>' + p('1.000,00 TL') + '</w:tc><w:tc>' + p('') + '</w:tc></w:tr></w:tbl>' +
      '<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:t>Kutu metni</w:t></mc:Choice><mc:Fallback><w:t>Kutu metni</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p>'
    const ust = `<w:hdr ${W}>${p('Kurgusal Hukuk Bürosu')}</w:hdr>`
    const alt = `<w:ftr ${W}>${p('Sayfa altı notu')}</w:ftr>`
    const s = await cikar(await docxYap(govde, { 'word/header1.xml': ust, 'word/footer1.xml': alt, 'docProps/app.xml': '<Properties><Pages>2</Pages></Properties>' }), 'cevap.docx')
    expect(s.bicim).toBe('DOCX')
    expect(s.durum).toBe('OKUNDU')
    expect(s.sayfaSayisi).toBe(2)
    expect(s.metin).toBe(
      '[Üst bilgi]\nKurgusal Hukuk Bürosu\n\nKURGUSAL CEVAP DİLEKÇESİ\nTalep\tkabul edilmemektedir. Eklenen.\nHasar Tarihi | 01.01.2099\nTutar | 1.000,00 TL\nKutu metni\n\n[Alt bilgi]\nSayfa altı notu',
    )
  })

  it('DOCX gövdesine gömülü büyük görüntü → OCR işareti', async () => {
    const resim = '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="7000000" cy="9000000"/><a:graphic><a:graphicData><a:blip r:embed="rId5"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    const s = await cikar(await docxYap(p('Ek: kimlik fotokopisi') + resim), 'ek.docx')
    expect(s.yontem).toBe('DOCX+OCR_GEREKLI')
    expect(s.metin).toContain('[Gömülü görüntü 1/1: taranmış içerik okunmadı — OCR GEREKLİ]')
  })

  it('TXT: UTF-8, UTF-16 BOM, Windows-1254; CSV tabloya çevrilir', async () => {
    expect((await cikar(new TextEncoder().encode('Kurgusal not: ödeme yapıldı.'), 'not.txt')).metin).toBe('Kurgusal not: ödeme yapıldı.')
    const u16 = Uint8Array.from([0xff, 0xfe, ...Array.from('Şık not').flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])])
    expect((await cikar(u16, 'u16.txt')).metin).toBe('Şık not')
    const eski = await cikar(cp1254Kodla('Ödeme ığdır şube'), 'eski.txt')
    expect(eski.metin).toBe('Ödeme ığdır şube')
    expect(eski.uyarilar.join(' ')).toMatch(/Windows-1254/)
    const csv = await cikar(new TextEncoder().encode('Tarih;Tutar;Not\n01.01.2099;"1.000,00";\n02.01.2099;500,00;"a;b"'), 'liste.csv')
    expect(csv.metin).toBe('Tarih | Tutar | Not\n01.01.2099 | 1.000,00\n02.01.2099 | 500,00 | a;b')
  })

  it('HTML: script atılır, tablo hücreleri "|"', async () => {
    const html = '<html><head><script>var x=1</script></head><body><h1>Kurgusal Ekspertiz</h1><table><tr><td>Plaka</td><td>99 ZZ 999</td></tr></table><p>Sonu&ccedil; &amp; kanaat</p></body></html>'
    const s = await cikar(new TextEncoder().encode(html), 'rapor.html')
    expect(s.metin).toBe('Kurgusal Ekspertiz\n\nPlaka | 99 ZZ 999\n\nSonuç & kanaat')
  })

  it('görsel → OCR_GEREKLI; eski Office → DESTEKLENMIYOR; boş/rastgele bayt fırlatmaz', async () => {
    const jpeg = await cikar(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), 'foto.jpg')
    expect(jpeg).toMatchObject({ bicim: 'GORSEL', durum: 'OCR_GEREKLI', ocrGerekli: true, metin: null })
    const ole = await cikar(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), 'eski.doc')
    expect(ole.durum).toBe('DESTEKLENMIYOR')
    expect((await cikar(new Uint8Array(0), 'bos.pdf')).durum).toBe('BOS')
    const rastgele = await cikar(Uint8Array.from({ length: 256 }, (_, i) => (i * 37) % 256), 'x.bin')
    expect(rastgele.durum).toBe('DESTEKLENMIYOR')
    expect(rastgele.metin).toBeNull()
  })

  it('normalleştirme: NUL/C0 atılır (Postgres), NBSP boşluk olur, ý/þ/ð onarılır', async () => {
    expect(metinNormallestir('a\u0000b\u0001c\xA0d\r\ne\xADf\u{2028}g\u{200B}h')).toBe('abc d\nef\ngh')
    const s = await cikar(new TextEncoder().encode('Ýstanbul þirket daðýtým'), 'm.txt')
    expect(s.metin).toBe('İstanbul şirket dağıtım')
    expect(s.uyarilar.join(' ')).toMatch(/onarıldı/)
  })

  it('azami karakter aşılırsa kesildiği metinde ve uyarıda açıkça yazılır', async () => {
    const s = await cikar(new TextEncoder().encode('a'.repeat(500)), 'uzun.txt', { azamiKarakter: 100 })
    expect(s.eksik).toBe(true)
    expect(s.metin!.startsWith('a'.repeat(100) + '\n[… metnin kalanı saklanmadı: toplam 500 karakter]')).toBe(true)
  })

  it('sayfalariBirlestir: tek sayfada başlık yok, çok sayfada var', () => {
    expect(sayfalariBirlestir(['x'])).toBe('x')
    expect(sayfalariBirlestir(['x', 'y'])).toBe('===== Sayfa 1/2 =====\nx\n\n===== Sayfa 2/2 =====\ny')
  })
})

// ---------------------------------------------------------------------------
describe('EYP / ZIP paketi', () => {
  it('EYP: üst yazı önce, ekler sonra; imza, ilişki ve üst veri XML metne girmez', async () => {
    const eyp = await zipYap({
      '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
      '_rels/.rels': '<Relationships/>',
      'Ustveri/Ustveri.xml': '<Ustveri><Konu>GIZLI UST VERI</Konu></Ustveri>',
      'ImzaCades/ImzaCades.p7s': new Uint8Array([0x30, 0x82, 1, 2]),
      'Ekler/ek-2.txt': 'Kurgusal ikinci ek metni.',
      'Ekler/ek-1.udf': await udfYap('Kurgusal birinci ek (UDF) metni.'),
      'UstYazi/ust-yazi.pdf': pdfYap([{ satirlar: [UZUN, 'Kurgusal kurum ust yazisi.'] }]),
    })
    const s = await cikar(eyp, 'yazisma.eyp')
    expect(s.bicim).toBe('EYP')
    expect(s.durum).toBe('OKUNDU')
    expect(s.yontem).toBe('EYP')
    const m = s.metin!
    expect(m).not.toContain('GIZLI UST VERI')
    expect(m).not.toContain('ImzaCades')
    const i0 = m.indexOf('===== Paket içi 1/3: UstYazi/ust-yazi.pdf =====')
    const i1 = m.indexOf('===== Paket içi 2/3: Ekler/ek-1.udf =====')
    const i2 = m.indexOf('===== Paket içi 3/3: Ekler/ek-2.txt =====')
    expect(i0).toBeGreaterThanOrEqual(0)
    expect(i1).toBeGreaterThan(i0)
    expect(i2).toBeGreaterThan(i1)
    expect(m).toContain('Kurgusal kurum ust yazisi.')
    expect(m).toContain('Kurgusal birinci ek (UDF) metni.')
    expect(m).toContain('Kurgusal ikinci ek metni.')
  })

  it('.pdf adıyla gelen EYP de içeriğinden tanınır; taranmış ek OCR işareti alır', async () => {
    const eyp = await zipYap({
      '[Content_Types].xml': '<Types/>',
      'UstYazi/ust.udf': await udfYap('Kurgusal üst yazı: tebligat sonucu ektedir.'),
      'Ekler/mazbata.pdf': pdfYap([{ goruntu: 'tam' }]),
    })
    const s = await cikar(eyp, 'evrak.pdf')
    expect(s.bicim).toBe('EYP')
    expect(s.yontem).toBe('EYP+OCR_GEREKLI')
    expect(s.ocrGerekli).toBe(true)
    expect(s.metin).toContain('Kurgusal üst yazı: tebligat sonucu ektedir.')
    expect(s.metin).toContain('===== Paket içi 2/2: Ekler/mazbata.pdf =====\n[okunmadı: taranmış evrak — metin yok, OCR gerekli]')
  })

  it('düz ZIP: iç içe paket okunur, derinlik sınırını aşan paket okunmaz', async () => {
    const ic = await zipYap({ 'dilekce.udf': await udfYap('İç paketteki kurgusal dilekçe.') })
    const s = await cikar(await zipYap({ 'klasor/ic.zip': ic, 'klasor/not.txt': 'Dış paketteki kurgusal not.' }), 'evrak.zip')
    expect(s.bicim).toBe('ZIP')
    expect(s.metin).toContain('İç paketteki kurgusal dilekçe.')
    expect(s.metin).toContain('Dış paketteki kurgusal not.')

    const cokDerin = await zipYap({ 'a.zip': await zipYap({ 'b.zip': ic }) })
    const d = await cikar(cokDerin, 'derin.zip')
    expect(d.metin ?? '').not.toContain('İç paketteki kurgusal dilekçe.')
  })

  it('girdi sayısı sınırı aşılırsa eksik okunduğu bildirilir; bozuk zip fırlatmaz', async () => {
    const s = await cikar(await zipYap({ '1.txt': 'Birinci kurgusal not.', '2.txt': 'İkinci kurgusal not.', '3.txt': 'Üçüncü kurgusal not.' }), 'p.zip', {
      paketSinir: { azamiGirdi: 2, azamiGirdiBayt: 1e6, azamiToplamBayt: 1e7, azamiDerinlik: 2 },
    })
    expect(s.eksik).toBe(true)
    expect(s.metin).not.toContain('Üçüncü')
    const bozuk = await cikar(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]), 'bozuk.zip')
    expect(bozuk.durum).toBe('HATA')
    expect(bozuk.metin).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('tarayıcı yolu (evrakCikar — "Evrak ekle")', () => {
  it('UDF/TXT metni çıkarılır, bozuk dosya partiyi düşürmez, sınıflandırma metni görür', async () => {
    const udf = await udfYap('KAZA TESPİT TUTANAĞI\nKurgusal kaza yeri ve kaza tarihi ve saati bilgileri.')
    const dosyalar = [
      new File([new Uint8Array(udf)], 'tutanak.udf'),
      new File(['Kurgusal düz not metni.'], 'not.txt', { type: 'text/plain' }),
      new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9])], 'bozuk.udf'),
    ]
    const ilerleme: number[] = []
    const r = await evrakCikar(dosyalar, (d) => ilerleme.push(d))
    expect(r).toHaveLength(3)
    expect(ilerleme).toEqual([1, 2, 3])
    expect(r[0].extractedText).toContain('KAZA TESPİT TUTANAĞI')
    expect(r[0].metinYontemi).toBe('UDF')
    expect(r[0].kategori).toBe('TUTANAK')
    expect(r[1].extractedText).toBe('Kurgusal düz not metni.')
    expect(r[2].extractedText).toBeNull()
    expect(r[2].metinYontemi).toBe('HATA')
  })

  it('uzun metin server action gövdesini aşmaz: belge başına sınır, kesildiği AÇIKÇA yazar (sessiz kesme yok)', async () => {
    const satir = 'Kurgusal bilirkişi raporu satırı; Türkçe karakterler: ğüşıöç İĞÜŞÖÇ.\n'
    const uzun = satir.repeat(Math.ceil(300_000 / satir.length)) + 'SON CÜMLE: kurgusal sonuç.'
    const r = await evrakCikar([new File([uzun], 'rapor.txt', { type: 'text/plain' })])
    const t = r[0].extractedText!
    expect(t.length).toBeLessThanOrEqual(ELLE_YUKLEME_METIN_SINIRI)
    expect(t.startsWith('Kurgusal bilirkişi raporu')).toBe(true)
    expect(t).toMatch(/METİN KESİLDİ: toplam \d+ karakterin ilk \d+ karakteri/)
    expect(r[0].metinKesildi).toBe(true)
  })

  it('parti bütçesi: çok sayıda uzun belgede gövde ~1 MB sınırının altında kalır; her belge başını taşır', async () => {
    const satir = 'Kurgusal tutanak satırı ğüşıöç.\n'
    const uzun = satir.repeat(Math.ceil(150_000 / satir.length))
    const dosyalar = Array.from({ length: 12 }, (_, i) => new File([`BELGE ${i + 1}\n` + uzun], `b${i + 1}.txt`, { type: 'text/plain' }))
    const r = await evrakCikar(dosyalar)
    const toplam = r.reduce((n, b) => n + (b.extractedText?.length ?? 0), 0)
    expect(toplam).toBeLessThanOrEqual(TARAYICI_TOPLAM_SINIR + dosyalar.length * TARAYICI_ASGARI_METIN)
    // gövde: JSON + UTF-8 bayt sayısı 1 MB'ın altında (Next.js server action varsayılanı)
    expect(new TextEncoder().encode(JSON.stringify(r)).length).toBeLessThan(1_000_000)
    r.forEach((b, i) => { expect(b.extractedText!.startsWith(`BELGE ${i + 1}`)).toBe(true); expect(b.metinKesildi).toBe(true) })
  })

  it('kısa metin olduğu gibi kalır (işaret eklenmez)', async () => {
    const r = await evrakCikar([new File(['Kurgusal kısa not.'], 'kisa.txt', { type: 'text/plain' })])
    expect(r[0].extractedText).toBe('Kurgusal kısa not.')
    expect(r[0].metinKesildi).toBeUndefined()
  })

  it('yalnız görüntülü UDF: metin boş, ocrGerekli işareti', async () => {
    const r = await evrakCikar([new File([new Uint8Array(await udfYap('', { gorseller: [{ w: 0, h: 0 }] }))], 'tarama.udf')])
    expect(r[0].extractedText).toBeNull()
    expect(r[0].ocrGerekli).toBe(true)
  })
})

describe('metniSinirla (elle yükleme gövde sınırı)', () => {
  it('sınır içindeyse aynen; aşarsa işaretle birlikte sınırı geçmez ve toplamı söyler', () => {
    expect(metniSinirla('abc', 10)).toEqual({ metin: 'abc', kesildi: false })
    const k = metniSinirla('x'.repeat(5000), 1000)
    expect(k.kesildi).toBe(true)
    expect(k.metin.length).toBeLessThanOrEqual(1000)
    expect(k.metin).toContain('toplam 5000 karakter')
    expect(k.metin.startsWith('xxx')).toBe(true)
  })
  it('vekil çifti (emoji) ortadan bölünmez', () => {
    const m = 'a'.repeat(10) + '\u{1F600}'.repeat(200)
    for (let sinir = 150; sinir < 170; sinir++) {
      const t = metniSinirla(m, sinir).metin
      const once = t.slice(0, t.indexOf('\n\n[…'))
      const son = once.charCodeAt(once.length - 1)
      expect(son >= 0xd800 && son <= 0xdbff).toBe(false)
    }
  })
})
