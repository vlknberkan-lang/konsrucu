/**
 * S27 · Ray takip Excel'i (30 sütun, KURGUSAL): #15–#30 hugoCozumle'de kaynak.rayTakip'e içe alınır; #19–#30 dava
 * önerisine eşlenir (06 §3.5). Hugo biçimli dosyada rayTakip anahtarı hiç yoktur (eski kaynakJson değişmez).
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { hugoCozumle, tarihSaatTR } from '@/lib/import/hugo'
import { davalilariEsle, excelDavaOnerisi, isEmriNo, kaynaktanRayDava } from '@/lib/konsrucu/dava/excel-dava'

const BASLIKLAR = [
  'HUKUK DOSYA NO', 'HASAR DOSYA NO', 'HASAR TARIHI', 'ZAMAN AŞIMI', 'RÜCU SEBEBI', 'RÜCU ORANI', 'RÜCU TUTARI', 'DAVA MIKTARI',
  'KADROLU AVUKAT', 'SÖZLEŞMELI AVUKAT', 'İNCELEMEYE GÖNDEREN KIŞI', 'İNCELEYEN KIŞI', 'AVUKAT YARD.GÖNDEREN KIŞI', 'İŞLEM YAPAN AVUKAT YARD.',
  'İCRA MÜDÜRLÜĞÜ', 'İCRA ESAS', 'TAKİP TARİHİ', 'TAKİP ÇIKIŞI', 'SON DURUM', 'MAHKEME', 'ESAS', 'DAVALI', 'ÜST DOSYA NO', 'DAVA SON DURUM',
  'DAVA AÇILIŞ TARİHİ', 'DURUŞMA TARİHİ', 'İHTİYATİ HACİZ', 'DEKONT', 'DELİL DİLEKÇESİ', 'MÜZEKKERE CEVAP',
]
// Kurgusal satırlar (gerçek dosya değildir). Tarihler Excel seri no'su: 46241 = 07.08.2026, 46421.40972 = 03.02.2027 09:50
const SATIR_1 = [
  900001, 'KRG-1', 45652, 46382, 'KASKO KURGU', 1, '100.000,00 TRY', '100.000,00 TRY', 'Av. Kurgu', 'Av. Deneme', 'a', 'b', 'c', 'd',
  'Kurgukent 3. Genel İcra Dairesi \r\n', '2026/11111', 46194, '123.456,78 TRY', 'ÖN İNCELEME', 'Kurgukent 51. Asliye Hukuk Mahkemesi\r\n', '2026/384',
  'Örnek Kurum Genel Müdürlüğü', 'ÜST-7', '', 46241, 'henüz verilmedi', 'RET', '11112222333 iş emri ile sunulmuştur.', '11112222333 iş emri ile sunulmuştur.', '',
]
const SATIR_2 = [
  900002, 'KRG-2', 45652, 46382, 'ZMSS KURGU', 1, '50.000,00 TRY', '50.000,00 TRY', 'Av. Kurgu', 'Av. Deneme', '', '', '', '',
  'Denemeşehir 2. İcra Dairesi', '2026/22222', 46184, '60.000,00 TRY', 'ÖN İNCELEME', 'Denemeşehir Tüketici Mahkemesi', '2026/535',
  'Kurgu Borçlu Bir', '', '', 46246, 46421.40972222222, 'KABUL', '44445555666 iş emri ile sunulmuştur', '44445555666 iş emri ile sunulmuştur', 'EVET',
]

function wb(satirlar: unknown[][]): Buffer {
  const k = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(k, XLSX.utils.aoa_to_sheet(satirlar), 'Sayfa1')
  return XLSX.write(k, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('hugoCozumle · Ray takip Excel icra/dava sütunları', () => {
  const r = hugoCozumle(wb([BASLIKLAR, SATIR_1, SATIR_2]))
  it('30 sütunlu başlık bulunur, iki satır okunur', () => {
    expect(r.hatalar).toEqual([])
    expect(r.satirlar).toHaveLength(2)
  })
  it('#15–#18 icra alanları', () => {
    const i = r.satirlar[0].kaynak.rayTakip?.icra
    expect(i).toMatchObject({ icraMudurlugu: 'Kurgukent 3. Genel İcra Dairesi', icraEsas: '2026/11111', takipTarihi: '2026-06-21', takipCikisi: 123456.78 })
  })
  it('#19–#30 dava alanları (ham + normalize)', () => {
    const d = r.satirlar[0].kaynak.rayTakip?.dava
    expect(d).toMatchObject({
      sonDurum: 'ÖN İNCELEME', mahkeme: 'Kurgukent 51. Asliye Hukuk Mahkemesi', esas: '2026/384', davali: 'Örnek Kurum Genel Müdürlüğü',
      ustDosyaNo: 'ÜST-7', davaSonDurum: null, acilisTarihi: '2026-08-07', durusma: null, durusmaHam: 'henüz verilmedi',
      ihtiyatiHaciz: 'RET', dekont: '11112222333 iş emri ile sunulmuştur.', delilDilekcesi: '11112222333 iş emri ile sunulmuştur.', muzekkereCevap: null,
    })
    expect(r.satirlar[1].kaynak.rayTakip?.dava?.durusma).toEqual({ tarih: '2027-02-03', saat: '09:50' })
  })
  it('mevcut Hugo alanları bozulmaz; tutar ayrıştırıcısı aynı', () => {
    expect(r.satirlar[0]).toMatchObject({ hukukDosyaNo: '900001', rucuTutari: 100000, davaMiktari: 100000, hasarDosyaNo: 'KRG-1' })
  })
  it('Hugo biçimli dosyada rayTakip anahtarı yok', () => {
    const h = hugoCozumle(wb([['Gönderen Birim', 'Hukuk Dosya No', 'Hasar Dosya No', 'Rücu Tutarı'], ['Birim', 'H-1', 'HS-1', '1.000,00']]))
    expect(h.satirlar).toHaveLength(1)
    expect('rayTakip' in h.satirlar[0].kaynak).toBe(false)
  })
})

describe('tarihSaatTR', () => {
  it('seri no (kesirli), metin ve tarih olmayan değer', () => {
    expect(tarihSaatTR(46241)).toEqual({ tarih: '2026-08-07', saat: null })
    expect(tarihSaatTR('03.02.2027 09:50')).toEqual({ tarih: '2027-02-03', saat: '09:50' })
    expect(tarihSaatTR('henüz verilmedi')).toBeNull()
    expect(tarihSaatTR('')).toBeNull()
  })
})

describe('excelDavaOnerisi · 06 §3.5 eşlemesi (#19–#30)', () => {
  const r = hugoCozumle(wb([BASLIKLAR, SATIR_1, SATIR_2]))
  const kurum = { id: 'b-1', adUnvan: 'Örnek Kurum Genel Müdürlüğü' }
  const o1 = excelDavaOnerisi(kaynaktanRayDava(r.satirlar[0].kaynak), [kurum])
  const o2 = excelDavaOnerisi(kaynaktanRayDava(r.satirlar[1].kaynak), [])

  it('#20 mahkeme → tür/yer/no; #21 esas; #25 açılış; #23 üst dosya no ham', () => {
    expect(o1.dava).toMatchObject({ mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'Kurgukent', mahkemeNo: '51', esasYil: 2026, esasSira: 384, acilisTarihi: '2026-08-07', ustDosyaNoHam: 'ÜST-7' })
    expect(o2.dava).toMatchObject({ mahkemeTuru: 'TUKETICI', mahkemeYer: 'Denemeşehir', mahkemeNo: null, esasSira: 535 })
  })
  it('#19 ve #24 YAZILMAZ: yalnız karşılaştırma', () => {
    expect(o1.karsilastirma).toEqual({ sonDurum: 'ÖN İNCELEME', davaSonDurum: null })
    expect(JSON.stringify(o1.dava)).not.toMatch(/ÖN İNCELEME/)
  })
  it('#22 davalı borçluyla eşleşir; eşleşmeyen adHam + uyarı', () => {
    expect(o1.taraflar).toEqual([{ rol: 'DAVALI', borcluId: 'b-1', adHam: 'Örnek Kurum Genel Müdürlüğü', eslesme: 'BORCLU' }])
    expect(o2.taraflar[0]).toMatchObject({ borcluId: null, eslesme: 'YOK' })
    expect(o2.uyarilar.join(' ')).toMatch(/#22/)
  })
  it('#26 duruşma: tarih değilse kayıt yok + uyarı; tarihse sonraki duruşma', () => {
    expect(o1.dava.sonrakiDurusma).toBeNull()
    expect(o1.uyarilar.join(' ')).toMatch(/#26/)
    expect(o2.dava.sonrakiDurusma).toEqual({ tarih: '2027-02-03', saat: '09:50' })
  })
  it('#27 ihtiyati haciz; #28 dekont (iş emri referansNo); #29 delil; #30 müzekkere cevabı', () => {
    expect(o1.ihtiyatiHaciz).toMatchObject({ sonuc: 'RED', excelHam: 'RET' })
    expect(o2.ihtiyatiHaciz).toMatchObject({ sonuc: 'KABUL' })
    expect(o1.islemler.map((i) => [i.sutun, i.tur, i.referansNo])).toEqual([[28, 'DEKONT_SUNUMU', '11112222333'], [29, 'DELIL_DILEKCESI', '11112222333']])
    const m = o2.islemler.find((i) => i.sutun === 30)
    expect(m).toMatchObject({ tur: 'MUZEKKERE_CEVABI', excelHam: 'EVET', referansNo: null })
    expect(o2.uyarilar.join(' ')).toMatch(/#30/)
    expect(new Set(o2.islemler.map((i) => i.tekilAnahtar)).size).toBe(o2.islemler.length)
  })
  it('ayrıştırılamayan #28 yalnız excelHam ile ve etiketle', () => {
    const o = excelDavaOnerisi({ ...kaynaktanRayDava(r.satirlar[0].kaynak)!, dekont: 'sunuldu' })
    expect(o.islemler[0]).toMatchObject({ referansNo: null, excelHam: 'sunuldu', ayristirilamadi: true })
    expect(o.uyarilar.join(' ')).toMatch(/#28 ayrıştırılamadı/)
  })
  it('dava hücresi yoksa öneri boş; eski kaynakJson için rayTakip null', () => {
    expect(excelDavaOnerisi(null).bos).toBe(true)
    expect(kaynaktanRayDava({ kaynak: 'hugo', ham: {} })).toBeNull()
  })
  it('yardımcılar', () => {
    expect(isEmriNo('iş emri 12345')).toBeNull() // 6 haneden kısa
    expect(isEmriNo('No: 1234567')).toBe('1234567')
    expect(davalilariEsle('A Kurgu Ltd\nB Deneme A.Ş.', [{ id: 'x', adUnvan: 'B Deneme Anonim Şirketi' }]).map((t) => t.eslesme)).toEqual(['YOK', 'BORCLU'])
  })
})
