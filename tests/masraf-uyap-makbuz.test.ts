/**
 * UYAP "sütun dökümü" makbuzları (pdfjs metni sütun sütun döker). Örnekler Zurich dosyalarındaki gerçek makbuzlardan,
 * kişi adları değiştirildi. Satır-temelli parser bunları okuyamıyordu → masraf hiç çıkmıyordu (AI yedeği KVKK kapalı).
 */
import { describe, it, expect } from 'vitest'
import { uyapMakbuzParse, makbuzParseMetin, yaziyiSayiyaCevir } from '@/lib/konsrucu/masraf-cikar'

const SAYMAN = `732,00 864,61 104,00
1.700,61
Miktar (TL)
AB2026 318714322 131964
: : :
1 1 1
Adet
Toplam
SERİ SIRA NO ÖZEL NO
29/06/2026
İmza - Mühür
1007860 AVUKAT PORTAL İŞLEMİ
SAYMAN MUTEMEDİ ALINDISI
Küçükçekmece İcra Dairesi ZURICH SİGORTA ANONİM ŞİRKETİ Adına Avukat AV ÖRNEK Yatırmıştır.
: 8330076811 : 2026/55023 (İcra Dosyası)
:
Binyedıyüz Türk Lirası Altmışbir Kuruş Tahsil Edilmiştir.
UYAP Bilişim Sistemindeki bu dökümana https://evrakdogrula.uyap.gov.tr/x adresinden erişebilirsiniz.
T.C. KUCUKCEKMECE MALMUD(MERKEZ)
Tahsilatı Yapan Birim Teslim Edenin Adi, Soyadi : T.C. / Vergi Kimlik No Dosya No Alındı (Harç) Türü Başvurma Harcı Peşin Harç Vekalet Suret Harcı`

const MASRAF = `28,70 TL 28,70 TL
Miktarı ( TL )
MSR2026 217490749 223672
: : : :
1
Adet
Toplam
Seri No Sıra No Özel No Fiziksel Makbuz No
05/08/2026 Düzenleyen
İmza - Mühür
MASRAF MAKBUZU
282237 GÖREVLİ ÖRNEK
Büyükçekmece İcra Dairesi ZURICH SİGORTA ANONİM ŞİRKETİ adına AV ÖRNEK 2026/62353 (İcra Dosyası) Büyükçekmece İcra Dairesi
: : : : :
Alındı (Masraf) Türü
T.C.
UYAP Bilişim Sistemindeki bu dökümana https://evrakdogrula.uyap.gov.tr/y adresinden erişebilirsiniz.
ADALET BAKANLIĞI
Tahsilatı Yapan Birim Adı Teslim Edenin Adı, Soyadı Dosya No Birim Adı Açıklama Posta Masrafı Yirmisekiz Türk Lirası Yetmiş Kuruş tahsil edilmiştir.`

describe('yazıyla sayı', () => {
  it('bitişik ve dotless ı yazımları', () => {
    expect(yaziyiSayiyaCevir('Binyedıyüz')).toBe(1700)
    expect(yaziyiSayiyaCevir('Yirmisekiz')).toBe(28)
    expect(yaziyiSayiyaCevir('Altmışbir')).toBe(61)
    expect(yaziyiSayiyaCevir('İkibinüçyüzkırkbeş')).toBe(2345)
    expect(yaziyiSayiyaCevir('Posta')).toBeNull()
  })
})

describe('UYAP sütun dökümü makbuz', () => {
  it('sayman mutemedi alındısı: 3 harç kalemi, toplam ve yazıyla toplam tutar', () => {
    const r = uyapMakbuzParse(SAYMAN)!
    expect(r.guvenli).toBe(true)
    expect(r.kalemler.map((k) => [k.cinsHam, k.tutar])).toEqual([['Başvurma Harcı', 732], ['Peşin Harç', 864.61], ['Vekalet Suret Harcı', 104]])
    expect(r.kalemler[0].tarih).toBe('2026-06-29')
    expect(r.kalemler[0].makbuzNo).toBe('AB2026/318714322')
  })
  it('tek kalemli masraf makbuzu: cins Açıklama cümlesinden', () => {
    const r = uyapMakbuzParse(MASRAF)!
    expect(r.guvenli).toBe(true)
    expect(r.kalemler).toHaveLength(1)
    expect(r.kalemler[0]).toMatchObject({ cinsHam: 'Posta Masrafı', tutar: 28.7, tarih: '2026-08-05', taraf: 'BIZ' })
  })
  it('makbuzParseMetin bu düzeni artık yerelde çözer (LLM gerekmez)', () => {
    expect(makbuzParseMetin(MASRAF).guvenli).toBe(true)
    expect(makbuzParseMetin(SAYMAN).kalemler).toHaveLength(3)
  })
  it('toplam tutmazsa güvenli değil (yanlış masraf yazılmaz)', () => {
    const bozuk = SAYMAN.replace('1.700,61', '1.800,61')
    expect(uyapMakbuzParse(bozuk)!.guvenli).toBe(false)
  })
  it('tahsilat makbuzu masraf değildir', () => {
    expect(makbuzParseMetin('TAHSİLAT MAKBUZU\n1.000,00').reddiyat).toBe(true)
  })
})

describe('kayan sütun (peşin harç ayrı satıra düşer)', () => {
  it('tutarlar doğru kalemlere dağılır, toplam tutar', () => {
    const kayik = SAYMAN.replace('732,00 864,61 104,00\n1.700,61', '732,00 104,00\n1.047,63\n1.883,63').replace('Binyedıyüz Türk Lirası Altmışbir Kuruş', 'Binsekizyüzseksenüç Türk Lirası Altmışüç Kuruş')
    const r = uyapMakbuzParse(kayik)!
    expect(r.guvenli).toBe(true)
    expect(r.kalemler.map((k) => [k.cinsHam, k.tutar])).toEqual([['Başvurma Harcı', 732], ['Peşin Harç', 1047.63], ['Vekalet Suret Harcı', 104]])
  })
})

describe('ad + yazıyla tutar aynı satırda', () => {
  it('Vekalet Suret Harcı Yüzdört Türk Lirası → tek kalem 104', () => {
    const m = `104,00 104,00\nMiktarı (TL)\nAB2026 118889 118889\n10/09/2026\nSAYMAN MUTEMEDİ ALINDISI\nT.C. ISTANBUL IL MUHASEBE MD. Tahsilatı Yapan Birim Adı Teslim Edenin Adı, Soyadı Dosya No Birim Adı Alındı (Harç) Türü Vekalet Suret Harcı Yüzdört Türk Lirası tahsil edilmiştir.`
    const r = uyapMakbuzParse(m)!
    expect(r.guvenli).toBe(true)
    expect(r.kalemler.map((k) => [k.cinsHam, k.tutar])).toEqual([['Vekalet Suret Harcı', 104]])
  })
})
