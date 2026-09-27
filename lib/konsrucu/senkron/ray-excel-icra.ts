/**
 * KonsRücü — Ray takip Excel'i: icra sütunları (#11–#18) · lib/konsrucu/senkron/ray-excel-icra.ts (saf; DB yok)
 *
 * 06 §3.5: Excel'den gelen her değer önce `AlanDegeri(kaynakTuru = EXCEL)` ÖNERİSİdir; avukat onaylayınca
 * hedef alana yazılır. Bu dilimde (S21) yalnız icra sütunları öneri olur; #19–#30 (dava) S27'nin işidir.
 * Başlık satırı 30 sütunun hepsiyle aranır (sıra değil ada göre); satır dosyaya HUKUK DOSYA NO (#1) ile bağlanır.
 *
 *  #11 İNCELEMEYE GÖNDEREN KİŞİ      → kaynakJson.incelemeyeGonderen
 *  #12 İNCELEYEN KİŞİ                → kaynakJson.inceleyen
 *  #13 AVUKAT YARD. GÖNDEREN KİŞİ    → kaynakJson.yardimciyaGonderen
 *  #14 İŞLEM YAPAN AVUKAT YARD.      → islemYapanYrd
 *  #15 İCRA MÜDÜRLÜĞÜ                → icraDairesi   (onaylanınca senkron hedefinin dairesi)
 *  #16 İCRA ESAS                     → icraDosyaNo   (onaylanınca dosya /api/uyap/hedefler'e girer)
 *  #17 TAKİP TARİHİ                  → takipTarihi
 *  #18 TAKİP ÇIKIŞI                  → takipTalebi.toplam (UYAP takip talebiyle mutabakata girer)
 *
 * `--kuru` kipinin karşılığı: `rayExcelIcraCozumle()` yalnız öneri listesini döker, hiçbir şey yazmaz.
 */
import * as XLSX from 'xlsx'
import { kanonik, paraTR as excelPara, tarihTR as excelTarih } from '@/lib/import/hugo'
import { esasNoCoz } from './is-saf'

/** 06 §3.5 sütun listesi (başlık satırını bulmak ve raporlamak için). Anahtar: kanonik başlık. */
export const RAY_EXCEL_SUTUNLARI: { no: number; baslik: string; anahtarlar: string[] }[] = [
  { no: 1, baslik: 'HUKUK DOSYA NO', anahtarlar: ['hukukdosyano'] },
  { no: 2, baslik: 'HASAR DOSYA NO', anahtarlar: ['hasardosyano'] },
  { no: 3, baslik: 'HASAR TARİHİ', anahtarlar: ['hasartarihi'] },
  { no: 4, baslik: 'ZAMAN AŞIMI', anahtarlar: ['zamanasimi', 'zamanasimitarihi'] },
  { no: 5, baslik: 'RÜCU SEBEBİ', anahtarlar: ['rucusebebi'] },
  { no: 6, baslik: 'RÜCU ORANI', anahtarlar: ['rucuorani'] },
  { no: 7, baslik: 'RÜCU TUTARI', anahtarlar: ['rucututari'] },
  { no: 8, baslik: 'DAVA MİKTARI', anahtarlar: ['davamiktari'] },
  { no: 9, baslik: 'KADROLU AVUKAT', anahtarlar: ['kadroluavukat'] },
  { no: 10, baslik: 'SÖZLEŞMELİ AVUKAT', anahtarlar: ['sozlesmeliavukat'] },
  { no: 11, baslik: 'İNCELEMEYE GÖNDEREN KİŞİ', anahtarlar: ['incelemeyegonderenkisi', 'incelemeyegonderen'] },
  { no: 12, baslik: 'İNCELEYEN KİŞİ', anahtarlar: ['inceleyenkisi', 'inceleyen'] },
  { no: 13, baslik: 'AVUKAT YARD. GÖNDEREN KİŞİ', anahtarlar: ['avukatyardgonderenkisi', 'avukatyardimcisigonderenkisi', 'avyardgonderen', 'avukatyardgonderen'] },
  { no: 14, baslik: 'İŞLEM YAPAN AVUKAT YARD.', anahtarlar: ['islemyapanavukatyard', 'islemyapanavukatyardimcisi', 'islemyapanavyard'] },
  { no: 15, baslik: 'İCRA MÜDÜRLÜĞÜ', anahtarlar: ['icramudurlugu', 'icradairesi'] },
  { no: 16, baslik: 'İCRA ESAS', anahtarlar: ['icraesas', 'icraesasno', 'icradosyano'] },
  { no: 17, baslik: 'TAKİP TARİHİ', anahtarlar: ['takiptarihi'] },
  { no: 18, baslik: 'TAKİP ÇIKIŞI', anahtarlar: ['takipcikisi', 'takipcikisitutari'] },
  { no: 19, baslik: 'SON DURUM', anahtarlar: ['sondurum'] },
  { no: 20, baslik: 'MAHKEME', anahtarlar: ['mahkeme'] },
  { no: 21, baslik: 'ESAS', anahtarlar: ['esas'] },
  { no: 22, baslik: 'DAVALI', anahtarlar: ['davali'] },
  { no: 23, baslik: 'ÜST DOSYA NO', anahtarlar: ['ustdosyano'] },
  { no: 24, baslik: 'DAVA SON DURUM', anahtarlar: ['davasondurum'] },
  { no: 25, baslik: 'DAVA AÇILIŞ TARİHİ', anahtarlar: ['davaacilistarihi'] },
  { no: 26, baslik: 'DURUŞMA TARİHİ', anahtarlar: ['durusmatarihi'] },
  { no: 27, baslik: 'İHTİYATİ HACİZ', anahtarlar: ['ihtiyatihaciz'] },
  { no: 28, baslik: 'DEKONT', anahtarlar: ['dekont'] },
  { no: 29, baslik: 'DELİL DİLEKÇESİ', anahtarlar: ['delildilekcesi'] },
  { no: 30, baslik: 'MÜZEKKERE CEVAP', anahtarlar: ['muzekkerecevap', 'muzekkerecevabi'] },
]

/** Bu dilimde öneriye dönüşen sütunlar ve hedef alanları. */
export const ICRA_SUTUN_ALANI: Record<number, { alan: string; etiket: string; tur: 'METIN' | 'DAIRE' | 'ESAS' | 'TARIH' | 'PARA' }> = {
  11: { alan: 'kaynakJson.incelemeyeGonderen', etiket: 'İncelemeye gönderen', tur: 'METIN' },
  12: { alan: 'kaynakJson.inceleyen', etiket: 'İnceleyen', tur: 'METIN' },
  13: { alan: 'kaynakJson.yardimciyaGonderen', etiket: 'Avukat yardımcısına gönderen', tur: 'METIN' },
  14: { alan: 'islemYapanYrd', etiket: 'İşlem yapan avukat yardımcısı', tur: 'METIN' },
  15: { alan: 'icraDairesi', etiket: 'İcra dairesi', tur: 'DAIRE' },
  16: { alan: 'icraDosyaNo', etiket: 'İcra esas no', tur: 'ESAS' },
  17: { alan: 'takipTarihi', etiket: 'Takip tarihi', tur: 'TARIH' },
  18: { alan: 'takipTalebi.toplam', etiket: 'Takip çıkışı', tur: 'PARA' },
}

export const ICRA_ALANLARI = Object.values(ICRA_SUTUN_ALANI).map((x) => x.alan)

export type ExcelOnerisi = { no: number; alan: string; etiket: string; deger: string | number; ham: string }
export type ExcelSatiri = { excelSatir: number; hukukDosyaNo: string; oneriler: ExcelOnerisi[]; sorunlar: string[] }
export type ExcelCozum = { satirlar: ExcelSatiri[]; hatalar: { satir: number; sebep: string }[]; baslikSatiri: number | null; eslesenSutunlar: number[] }

const anahtarNo = new Map<string, number>()
for (const s of RAY_EXCEL_SUTUNLARI) for (const a of s.anahtarlar) anahtarNo.set(a, s.no)

function isoGun(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Tek hücreyi hedef alan türüne göre çözer. Çözülemezse null (öneri açılmaz, satır sorunu yazılır). */
export function hucreCoz(tur: 'METIN' | 'DAIRE' | 'ESAS' | 'TARIH' | 'PARA', ham: unknown): string | number | null {
  if (ham == null || String(ham).trim() === '') return null
  switch (tur) {
    case 'METIN':
    case 'DAIRE': {
      const s = String(ham).replace(/\s+/g, ' ').trim()
      return s ? s.slice(0, 160) : null
    }
    case 'ESAS':
      return esasNoCoz(ham)
    case 'TARIH': {
      const d = excelTarih(ham)
      return d ? isoGun(d) : null
    }
    case 'PARA': {
      const n = excelPara(ham)
      return n != null && n > 0 ? n : null
    }
  }
}

/** Başlık satırını 30 sütunun adlarıyla bulur (ilk 20 satır; en çok eşleşen satır). */
function baslikBul(matris: unknown[][]): { idx: number; harita: Map<number, number> } {
  let idx = -1
  let enIyi = 0
  let harita = new Map<number, number>()
  for (let i = 0; i < Math.min(matris.length, 20); i++) {
    const row = matris[i] ?? []
    const h = new Map<number, number>() // kolon → sütun no
    const kullanilan = new Set<number>()
    for (let c = 0; c < row.length; c++) {
      const no = anahtarNo.get(kanonik(row[c]))
      if (no && !kullanilan.has(no)) { h.set(c, no); kullanilan.add(no) }
    }
    if (kullanilan.size > enIyi) { enIyi = kullanilan.size; idx = i; harita = h }
  }
  return { idx: enIyi >= 3 ? idx : -1, harita }
}

/** Ray Excel tamponu → satır başına icra önerileri (kuru; yazmaz). */
export function rayExcelIcraCozumle(buf: ArrayBuffer | Uint8Array | Buffer): ExcelCozum {
  const bos: ExcelCozum = { satirlar: [], hatalar: [], baslikSatiri: null, eslesenSutunlar: [] }
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer), { type: 'array', cellDates: false })
  } catch (e) {
    return { ...bos, hatalar: [{ satir: 0, sebep: `Excel okunamadı: ${(e as Error).message}` }] }
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { ...bos, hatalar: [{ satir: 0, sebep: 'Çalışma sayfası bulunamadı' }] }
  const matris = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })
  const { idx, harita } = baslikBul(matris)
  if (idx < 0) return { ...bos, hatalar: [{ satir: 0, sebep: 'Başlık satırı bulunamadı (Ray takip Excel\'i sütun adları eşleşmedi)' }] }
  const noKolon = new Map<number, number>()
  for (const [c, no] of harita) noKolon.set(no, c)
  if (!noKolon.has(1)) return { ...bos, baslikSatiri: idx + 1, eslesenSutunlar: [...noKolon.keys()].sort((a, b) => a - b), hatalar: [{ satir: idx + 1, sebep: 'HUKUK DOSYA NO sütunu yok — satırlar dosyalara bağlanamaz' }] }

  const satirlar: ExcelSatiri[] = []
  const hatalar: { satir: number; sebep: string }[] = []
  const gorulen = new Set<string>()
  for (let i = idx + 1; i < matris.length; i++) {
    const row = matris[i] ?? []
    const excelSatir = i + 1
    const hukukDosyaNo = String(row[noKolon.get(1) as number] ?? '').trim()
    if (!hukukDosyaNo) {
      if (row.some((v) => String(v ?? '').trim())) hatalar.push({ satir: excelSatir, sebep: 'HUKUK DOSYA NO boş — satır dosyaya bağlanamaz' })
      continue
    }
    if (gorulen.has(hukukDosyaNo)) { hatalar.push({ satir: excelSatir, sebep: `Mükerrer hukuk dosya no: ${hukukDosyaNo}` }); continue }
    gorulen.add(hukukDosyaNo)
    const oneriler: ExcelOnerisi[] = []
    const sorunlar: string[] = []
    for (const [noStr, tanim] of Object.entries(ICRA_SUTUN_ALANI)) {
      const no = Number(noStr)
      const c = noKolon.get(no)
      if (c == null) continue
      const ham = row[c]
      const hamMetin = ham == null ? '' : String(ham).trim()
      if (!hamMetin) continue
      const deger = hucreCoz(tanim.tur, ham)
      if (deger == null) { sorunlar.push(`#${no} ${tanim.etiket}: "${hamMetin.slice(0, 60)}" ayrıştırılamadı, elle tamamlayın`); continue }
      oneriler.push({ no, alan: tanim.alan, etiket: tanim.etiket, deger, ham: hamMetin.slice(0, 200) })
    }
    satirlar.push({ excelSatir, hukukDosyaNo, oneriler, sorunlar })
  }
  return { satirlar, hatalar, baslikSatiri: idx + 1, eslesenSutunlar: [...noKolon.keys()].sort((a, b) => a - b) }
}

/** İki öneri değeri aynı mı? (Aynı öneri ikinci içe aktarmada yeniden açılmasın.) */
export function degerAyni(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Math.abs(Number(a) - Number(b)) < 0.005
  return String(a ?? '').trim().toLocaleLowerCase('tr') === String(b ?? '').trim().toLocaleLowerCase('tr')
}
