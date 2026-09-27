/**
 * KonsRücü — evrak metin hattı · DOCX · lib/konsrucu/evrak-metin/docx.ts (saf; jszip)
 * word/document.xml akış halinde taranır (DOM yok): paragraflar satır olur, tablolar "hücre | hücre"
 * satırı olur (sütun bağlamı korunur), izli eklemeler okunur, izli SİLİNMİŞ metin (w:del) ve alan kodları
 * (w:instrText) okunmaz, mc:AlternateContent'in eski (Fallback) kopyası atlanır (aynı metin iki kez gelmesin).
 * Üst/alt bilgi ayrı bölüm olarak eklenir. Gövdeye gömülü büyük görüntü → yerinde "OCR GEREKLİ" işareti.
 * (cikar.py · _docx mantığının sadeleştirilmiş hâli; metin kutuları paragraf içinde yerinde okunur.)
 */
import type JSZip from 'jszip'
import { GORSEL_ALAN_ORANI, anlamliVar, gorselIsareti, hataMesaji, sonuc, type MetinSonucu } from './ortak'
import { XmlBozuk, xmlTara } from './xml'
import { acikBoyut } from './udf'

const AZAMI_XML_BAYT = 30 * 1024 * 1024
const A4_EMU2 = 7560310 * 10692130
/** Alt ağacıyla birlikte okunmayan öğeler (yerel ad) */
const ATLA = new Set(['del', 'movefrom', 'deltext', 'instrtext', 'fallback', 'rpr', 'ppr', 'sectpr'])

type Baglam = { tur: 'govde' | 'hucre'; parca: string[] } | { tur: 'satir'; hucreler: string[] }

/** Tek bir WordprocessingML parçasını (document/header/footer) metne çevir. Bozuk XML'de XmlBozuk fırlatır. */
export function wordXmlMetni(xml: string, gorselIsaretle = false): { metin: string; gorselSayisi: number } {
  const yigin: Baglam[] = [{ tur: 'govde', parca: [] }]
  const yaz = (s: string) => {
    for (let i = yigin.length - 1; i >= 0; i--) {
      const b = yigin[i]
      if (b.tur !== 'satir') { b.parca.push(s); return }
    }
  }
  let atla = 0 // atlanan alt ağaç derinliği
  let metinde = false // <w:t> içinde miyiz
  let sonKapsam = 0 // son wp:extent alanı (EMU²)
  let gorselSayisi = 0
  const gorselYerleri: number[] = []
  for (const o of xmlTara(xml)) {
    if (atla) {
      if (o.tur === 'ac' && !o.kapali) atla++
      else if (o.tur === 'kapa') atla--
      continue
    }
    if (o.tur === 'metin') {
      if (metinde) yaz(o.deger)
      continue
    }
    const ad = o.yerel
    if (o.tur === 'ac') {
      if (ATLA.has(ad)) { if (!o.kapali) atla = 1; continue }
      if (ad === 't') { metinde = !o.kapali; continue }
      if (ad === 'tab') { yaz('\t'); continue }
      if (ad === 'br' || ad === 'cr') { yaz('\n'); continue }
      if (ad === 'nobreakhyphen') { yaz('-'); continue }
      if (ad === 'extent') { sonKapsam = (Number(o.oz.cx) || 0) * (Number(o.oz.cy) || 0); continue }
      if (ad === 'blip' && gorselIsaretle) {
        if (!sonKapsam || sonKapsam >= GORSEL_ALAN_ORANI * A4_EMU2) {
          gorselSayisi++
          gorselYerleri.push(gorselSayisi)
          yaz(`\n\u0000G${gorselSayisi}\u0000\n`) // geçici yer; sayı bitince gerçek işarete çevrilir
        }
        sonKapsam = 0
        continue
      }
      if (o.kapali) continue
      if (ad === 'tr') yigin.push({ tur: 'satir', hucreler: [] })
      else if (ad === 'tc') yigin.push({ tur: 'hucre', parca: [] })
      continue
    }
    // kapanış
    if (ad === 't') { metinde = false; continue }
    if (ad === 'p') { yaz('\n'); continue }
    if (ad === 'tc') {
      const b = yigin[yigin.length - 1]
      if (b?.tur === 'hucre') {
        yigin.pop()
        const ust = yigin[yigin.length - 1]
        if (ust?.tur === 'satir') ust.hucreler.push(b.parca.join('').split(/\s+/).join(' ').trim())
      }
      continue
    }
    if (ad === 'tr') {
      const b = yigin[yigin.length - 1]
      if (b?.tur === 'satir') {
        yigin.pop()
        const h = [...b.hucreler]
        while (h.length && !h[h.length - 1]) h.pop()
        yaz(h.join(' | ') + '\n')
      }
    }
  }
  const kok = yigin[0] as { parca: string[] }
  let metin = kok.parca.join('')
  metin = metin.replace(/\u0000G(\d+)\u0000/g, (_m, k: string) => gorselIsareti(Number(k), gorselSayisi))
  metin = metin.split('\n').map((s) => s.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { metin, gorselSayisi }
}

/** DOCX (açılmış zip) → metin. ASLA fırlatmaz. */
export async function docxMetni(zip: JSZip): Promise<MetinSonucu> {
  const oku = async (f: JSZip.JSZipObject): Promise<string> => {
    const b = acikBoyut(f)
    if (b != null && b > AZAMI_XML_BAYT) throw new Error('parça çok büyük')
    return f.async('string')
  }
  const govdeG = zip.file('word/document.xml')
  if (!govdeG) return sonuc('DOCX', 'HATA', { uyarilar: ['DOCX içinde word/document.xml yok (bozuk ya da farklı biçim)'] })
  try {
    const govde = wordXmlMetni(await oku(govdeG), true)
    const ustler: string[] = []
    const altlar: string[] = []
    const gorulen = new Set<string>()
    const parcalar = zip.file(/^word\/(header|footer)\d*\.xml$/i).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    for (const f of parcalar) {
      try {
        const m = wordXmlMetni(await oku(f)).metin
        if (!m || gorulen.has(m)) continue
        gorulen.add(m)
        ;(/header/i.test(f.name) ? ustler : altlar).push(m)
      } catch { /* üst/alt bilgi okunamazsa gövde yine döner */ }
    }
    let sayfaSayisi: number | undefined
    try {
      const app = zip.file('docProps/app.xml')
      const m = app ? /<(?:\w+:)?Pages>(\d+)</.exec(await app.async('string')) : null
      if (m) sayfaSayisi = Number(m[1])
    } catch { /* sayfa sayısı bilgi amaçlı */ }

    const bolumler: string[] = []
    if (ustler.length) bolumler.push('[Üst bilgi]\n' + ustler.join('\n'))
    bolumler.push(govde.metin)
    if (altlar.length) bolumler.push('[Alt bilgi]\n' + altlar.join('\n'))
    const metin = bolumler.filter((b) => b.trim()).join('\n\n')
    const ocrGerekli = govde.gorselSayisi > 0
    const uyarilar = ocrGerekli
      ? [`DOCX'te ${govde.gorselSayisi} büyük gömülü görüntü var (taranmış evrak olabilir); içeriği okunmadı — OCR gerekli`]
      : []
    const gercek = anlamliVar(govde.metin.replace(/\[Gömülü görüntü \d+\/\d+:[^\]]*\]/g, '')) || anlamliVar(ustler.join('') + altlar.join(''))
    if (!gercek) {
      if (ocrGerekli) return sonuc('DOCX', 'OCR_GEREKLI', { yontem: 'OCR_GEREKLI', ocrGerekli, uyarilar, sayfaSayisi })
      return sonuc('DOCX', 'BOS', { uyarilar: [...uyarilar, 'DOCX içeriği boş'], sayfaSayisi })
    }
    return sonuc('DOCX', 'OKUNDU', { yontem: 'DOCX' + (ocrGerekli ? '+OCR_GEREKLI' : ''), metin, ocrGerekli, uyarilar, sayfaSayisi })
  } catch (e) {
    const neden = e instanceof XmlBozuk ? `XML ayrıştırılamadı (${e.message})` : hataMesaji(e)
    return sonuc('DOCX', 'HATA', { uyarilar: [`DOCX açılamadı (bozuk olabilir) — ${neden}`] })
  }
}
