/**
 * KonsRücü — evrak metin hattı · EYP (e-Yazışma paketi) ve düz ZIP · lib/konsrucu/evrak-metin/paket.ts (saf; jszip)
 * Paket açılır, içindeki her evrak ayrı ayrı okunur ve TEK metinde bölüm başlıklarıyla birleştirilir:
 *   ===== Paket içi 1/3: UstYazi/yazi.pdf =====
 * EYP'de üst yazı önce, ekler sonra gelir. İmza (.p7s/.sgn/.sig), OPC ilişki/tür dosyaları ve üst veri
 * XML'leri metin sayılmaz.
 *
 * - EYP paket yapısı (UstYazi/, Ekler/, Ustveri.xml, PaketOzeti.xml, ImzaCades …; e-Yazışma Teknik Rehberi):
 *   teyit gerekli — bu yüzden yol adına bağımlı değiliz; bilinmeyen parça da içeriğine göre okunur.
 * - Tasarımdaki "içindekiler ayrı Belge olur" (06 · 5.3) ve mükerrer kontrolü (birim evrak no) şema ister → B1b.
 *   v1 çekirdeği paketin metnini paketin kendi Belge satırına yazar.
 * - Zip bombasına karşı: girdi adedi, iddia edilen açılmış boyut ve iç içe zip derinliği sınırlı.
 */
import type JSZip from 'jszip'
import { anlamliVar, hataMesaji, ocrNotu, sonuc, type MetinSonucu } from './ortak'
import { acikBoyut } from './udf'

export type PaketSinir = { azamiGirdi: number; azamiGirdiBayt: number; azamiToplamBayt: number; azamiDerinlik: number }
export const PAKET_SINIR: PaketSinir = {
  azamiGirdi: 100,
  azamiGirdiBayt: 25 * 1024 * 1024,
  azamiToplamBayt: 60 * 1024 * 1024,
  azamiDerinlik: 2,
}

/** Metin sayılmayan paket parçaları (imza, OPC ilişkileri, üst veri, işletim sistemi artıkları). */
const ATLANAN = [
  /(^|\/)\[content_types\]\.xml$/i,
  /(^|\/)_rels\//i,
  /\.rels$/i,
  /\.(p7s|sgn|sig|cer|crt)$/i,
  /(^|\/)__macosx\//i,
  /(^|\/)(\.ds_store|thumbs\.db)$/i,
]
const UST_VERI_XML = /\.xml$/i

/** Paket içi okuma sırası: üst yazı → ekler → diğerleri (doğal sıralama). */
function sira(ad: string): number {
  const a = ad.toLowerCase()
  if (/(^|\/)ustyazi\//.test(a)) return 0
  if (/(^|\/)ekler?\//.test(a)) return 1
  return 2
}

/** EYP mi (OPC tür dosyası + üst yazı klasörü ya da .eyp uzantısı)? */
export function eypMi(zip: JSZip, dosyaAdi: string): boolean {
  if (/\.eyp$/i.test(dosyaAdi)) return true
  let ustYazi = false
  zip.forEach((yol) => { if (/(^|\/)ustyazi\//i.test(yol)) ustYazi = true })
  return ustYazi && !!zip.file('[Content_Types].xml')
}

export type AltOkuyucu = (veri: Uint8Array, ad: string, derinlik: number) => Promise<MetinSonucu>

export async function paketMetni(
  zip: JSZip,
  bicim: 'EYP' | 'ZIP',
  alt: AltOkuyucu,
  derinlik: number,
  sinir: PaketSinir = PAKET_SINIR,
): Promise<MetinSonucu> {
  const uyarilar: string[] = []
  const girdiler: JSZip.JSZipObject[] = []
  let atlanan = 0
  zip.forEach((yol, f) => {
    if (f.dir) return
    const y = yol.replace(/\\/g, '/')
    if (ATLANAN.some((re) => re.test(y))) return
    if (bicim === 'EYP' && UST_VERI_XML.test(y)) { atlanan++; return } // Ustveri/PaketOzeti/NihaiOzet …
    girdiler.push(f)
  })
  if (atlanan) uyarilar.push(`${atlanan} üst veri parçası (XML) metne katılmadı`)
  girdiler.sort((a, b) => sira(a.name) - sira(b.name) || a.name.localeCompare(b.name, 'tr', { numeric: true }))
  if (!girdiler.length) return sonuc(bicim, 'BOS', { uyarilar: [...uyarilar, 'Paket içinde okunacak evrak yok'] })

  let eksik = false
  if (girdiler.length > sinir.azamiGirdi) {
    uyarilar.push(`Pakette ${girdiler.length} evrak var; ilk ${sinir.azamiGirdi} tanesi okundu`)
    girdiler.length = sinir.azamiGirdi
    eksik = true
  }

  const bolumler: string[] = []
  let toplamBayt = 0
  let okunan = 0
  let ocrGerekli = false
  let ocrli = 0
  for (let i = 0; i < girdiler.length; i++) {
    const f = girdiler[i]
    const baslik = `===== Paket içi ${i + 1}/${girdiler.length}: ${f.name} =====`
    const iddia = acikBoyut(f)
    if (iddia != null && (iddia > sinir.azamiGirdiBayt || toplamBayt + iddia > sinir.azamiToplamBayt)) {
      bolumler.push(`${baslik}\n[okunmadı: boyut sınırı aşıldı]`)
      uyarilar.push(`${f.name}: boyut sınırı aşıldı, okunmadı`)
      eksik = true
      continue
    }
    let s: MetinSonucu
    try {
      const veri = await f.async('uint8array')
      toplamBayt += veri.length
      s = derinlik >= sinir.azamiDerinlik && veri[0] === 0x50 && veri[1] === 0x4b
        ? sonuc('ZIP', 'DESTEKLENMIYOR', { uyarilar: ['iç içe paket derinlik sınırı'] })
        : await alt(veri, f.name, derinlik + 1)
    } catch (e) {
      s = sonuc('DESTEKLENMIYOR', 'HATA', { uyarilar: [hataMesaji(e)] })
    }
    if (s.ocrGerekli || s.durum === 'OCR_GEREKLI') { ocrGerekli = true; ocrli++ }
    if (s.eksik) eksik = true
    if (anlamliVar(s.metin)) {
      okunan++
      bolumler.push(`${baslik}\n${s.metin}`)
    } else {
      const neden = s.durum === 'OCR_GEREKLI' ? ocrNotu(s) : s.uyarilar[0] ?? s.durum.toLowerCase()
      bolumler.push(`${baslik}\n[okunmadı: ${neden}]`)
    }
    for (const u of s.uyarilar) uyarilar.push(`${f.name}: ${u}`)
  }
  const yontem = bicim + (ocrGerekli ? '+OCR_GEREKLI' : '')
  if (ocrGerekli) uyarilar.push(`Paketteki ${ocrli} evrakta taranmış içerik var — OCR gerekli`)
  if (!okunan) {
    const durum = ocrGerekli ? 'OCR_GEREKLI' : 'BOS'
    return sonuc(bicim, durum, { yontem: durum, ocrGerekli, uyarilar, eksik })
  }
  return sonuc(bicim, 'OKUNDU', { yontem, metin: bolumler.join('\n\n'), ocrGerekli, uyarilar, eksik })
}
