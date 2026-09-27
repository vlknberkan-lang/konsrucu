/**
 * KonsRücü — evrak metin hattı · UYAP UDF · lib/konsrucu/evrak-metin/udf.ts (saf; jszip)
 * UDF = zip içinde content.xml; belge metni <template><content><![CDATA[…]]></content> içindedir,
 * <elements> altındaki <content startOffset=… length=…/> öğeleri bu metne işaret eder (biçim bilgisi).
 * Gömülü görüntüler <image imageData="base64" width=… height=…/> ve metinde U+FFFC yer tutucuyla durur.
 * (cikar.py · _udf mantığı.)
 *
 * - E-imzalı UDF'nin paket yapısı teyit gerekli (06 · 5.3): content.xml kökte değilse zip içinde adıyla aranır,
 *   imza dosyaları (ör. sign.sgn) yok sayılır.
 * - Büyük gömülü görüntü (taranmış vekâletname, kimlik fotokopisi) → yerinde "OCR GEREKLİ" işareti (OCR S17'de).
 * - Testlerde yalnız KURGUSAL UDF kullanılır (kodda üretilir); gerçek evrak repoya girmez.
 */
import JSZip from 'jszip'
import { GORSEL_ALAN_ORANI, anlamliVar, cp1254Coz, gorselIsareti, hataMesaji, sonuc, type MetinSonucu } from './ortak'
import { XmlBozuk, xmlKodlama, xmlTara } from './xml'

const YER_TUTUCU = '\u{FFFC}' // gömülü nesnenin metindeki yeri (OBJECT REPLACEMENT CHARACTER)
/** content.xml için iddia edilen açılmış boyut sınırı (zip bombasına karşı) */
const AZAMI_XML_BAYT = 30 * 1024 * 1024
const A4_ALAN = 595 * 842

/** zip girdisinin (iddia edilen) açılmış boyutu; bilinmiyorsa null. */
export function acikBoyut(f: JSZip.JSZipObject): number | null {
  const n = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  return typeof n === 'number' && n >= 0 ? n : null
}

/** Zip içindeki content.xml girdisi: önce kökte, yoksa herhangi bir klasörde adıyla. */
export function udfIcerikGirdisi(zip: JSZip): JSZip.JSZipObject | null {
  const kok = zip.file('content.xml')
  if (kok) return kok
  let bulunan: JSZip.JSZipObject | null = null
  zip.forEach((yol, f) => {
    if (!bulunan && !f.dir && yol.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === 'content.xml') bulunan = f
  })
  return bulunan
}

function xmlCoz(bayt: Uint8Array): { xml: string; uyari: string | null } {
  const kod = xmlKodlama(bayt) ?? 'utf-8'
  if (kod !== 'utf-8' && kod !== 'utf8') {
    try { return { xml: new TextDecoder(kod).decode(bayt), uyari: null } } catch { /* bilinmeyen etiket → UTF-8 dene */ }
  }
  try {
    return { xml: new TextDecoder('utf-8', { fatal: true }).decode(bayt), uyari: null }
  } catch {
    return { xml: cp1254Coz(bayt), uyari: "content.xml UTF-8 değil; Windows-1254 (Türkçe) olarak okundu" }
  }
}

type Gorsel = { genislik: number; yukseklik: number }

/** content.xml metnini ve görüntülerini çıkar. Bozuk XML'de XmlBozuk fırlatır. */
export function udfXmlAyristir(xml: string): { metin: string | null; gorseller: Gorsel[] } {
  let metin: string | null = null
  const parca: string[] = []
  const gorseller: Gorsel[] = []
  let icerikDerinlik = -1 // ilk (kök) <content> öğesinin derinliği
  let derinlik = 0
  for (const o of xmlTara(xml)) {
    if (o.tur === 'ac') {
      if (o.yerel === 'image') {
        gorseller.push({ genislik: Number(o.oz.width ?? 0) || 0, yukseklik: Number(o.oz.height ?? 0) || 0 })
      }
      if (metin == null && icerikDerinlik < 0 && o.yerel === 'content') {
        if (o.kapali) { metin = ''; continue }
        icerikDerinlik = derinlik
      }
      if (!o.kapali) derinlik++
    } else if (o.tur === 'kapa') {
      derinlik--
      if (icerikDerinlik >= 0 && derinlik === icerikDerinlik && o.yerel === 'content') {
        metin = parca.join('')
        icerikDerinlik = -2 // bulundu; bir daha aranmaz
      }
    } else if (icerikDerinlik >= 0 && metin == null) {
      parca.push(o.deger)
    }
  }
  if (icerikDerinlik >= 0) throw new XmlBozuk('<content> kapanmadı')
  return { metin, gorseller }
}

/** UDF baytından (ya da açılmış zip'ten) metin. ASLA fırlatmaz. */
export async function udfMetni(girdi: Uint8Array | JSZip): Promise<MetinSonucu> {
  let zip: JSZip
  try {
    zip = girdi instanceof Uint8Array ? await JSZip.loadAsync(girdi) : girdi
  } catch (e) {
    return sonuc('UDF', 'HATA', { uyarilar: [`UDF açılamadı: geçerli bir zip değil (bozuk dosya) — ${hataMesaji(e)}`] })
  }
  const g = udfIcerikGirdisi(zip)
  if (!g) return sonuc('UDF', 'HATA', { uyarilar: ['UDF içinde content.xml yok (bozuk ya da farklı biçim)'] })
  const boyut = acikBoyut(g)
  if (boyut != null && boyut > AZAMI_XML_BAYT) {
    return sonuc('UDF', 'HATA', { uyarilar: [`UDF content.xml çok büyük (${Math.round(boyut / 1048576)} MB); okunmadı`] })
  }
  let bayt: Uint8Array
  try {
    bayt = await g.async('uint8array')
  } catch (e) {
    return sonuc('UDF', 'HATA', { uyarilar: [`UDF okunamadı (şifreli ya da bozuk olabilir) — ${hataMesaji(e)}`] })
  }
  const { xml, uyari } = xmlCoz(bayt)
  const uyarilar: string[] = uyari ? [uyari] : []
  let ayr: ReturnType<typeof udfXmlAyristir>
  try {
    ayr = udfXmlAyristir(xml)
  } catch (e) {
    return sonuc('UDF', 'HATA', { uyarilar: [`UDF bozuk: content.xml ayrıştırılamadı (${e instanceof XmlBozuk ? e.message : hataMesaji(e)})`] })
  }
  if (ayr.metin == null) return sonuc('UDF', 'HATA', { uyarilar: ['UDF bozuk: content.xml içinde <content> öğesi yok'] })

  let metin = ayr.metin
  // Büyük görüntü = taranmış evrak adayı (logo/imza küçük kalır). Boyutsuz görüntü büyük sayılır (temkinli).
  const buyukler = ayr.gorseller.filter((x) => x.genislik <= 0 || x.yukseklik <= 0 || x.genislik * x.yukseklik >= GORSEL_ALAN_ORANI * A4_ALAN)
  const isaretler = buyukler.map((_, i) => gorselIsareti(i + 1, buyukler.length))
  const yerTutucu = metin.split(YER_TUTUCU).length - 1
  if (buyukler.length && ayr.gorseller.length === buyukler.length && yerTutucu === buyukler.length) {
    // Her yer tutucu sırasıyla kendi görüntüsünün işaretini alır (metindeki yeri korunur)
    metin = metin.split(YER_TUTUCU).map((parca, i) => (i ? `\n${isaretler[i - 1]}\n` : '') + parca).join('')
  } else {
    metin = metin.split(YER_TUTUCU).join('')
    if (isaretler.length) metin = metin.replace(/\s+$/, '') + '\n\n' + isaretler.join('\n\n')
  }
  const ocrGerekli = buyukler.length > 0
  if (ocrGerekli) {
    uyarilar.push(`UDF'de ${buyukler.length} büyük gömülü görüntü var (taranmış evrak olabilir); içeriği okunmadı — OCR gerekli`)
  }
  const gercekMetin = anlamliVar(metin.split(/\n/).filter((s) => !isaretler.includes(s.trim())).join('\n'))
  if (!gercekMetin) {
    if (ocrGerekli) return sonuc('UDF', 'OCR_GEREKLI', { yontem: 'OCR_GEREKLI', ocrGerekli, uyarilar })
    return sonuc('UDF', 'BOS', { uyarilar: [...uyarilar, 'UDF içeriği boş'] })
  }
  return sonuc('UDF', 'OKUNDU', { yontem: 'UDF' + (ocrGerekli ? '+OCR_GEREKLI' : ''), metin, ocrGerekli, uyarilar })
}
