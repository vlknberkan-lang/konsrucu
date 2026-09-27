/**
 * S18 · öneri alanları sözlüğü: normalizasyon, eşitlik, ekran metni (maskeli plaka), onay anında ayna (M5).
 */
import { describe, expect, it } from 'vitest'
import {
  alanTanimi, aynaPlani, degerEsit, degerGorunum, degerNormal, odemeAlanAnahtari, oranNormal, paraNormal, plakaMaskele, plakaNormal, tarihNormal,
} from '@/lib/konsrucu/oneri/alanlar'

describe('alan tanımları', () => {
  it('kritik alanlar: tutar, ödeme, kaza tarihi, rücu sebebi, yetkili icra', () => {
    for (const a of ['asilAlacak', 'rucuTutari', 'kazaTarihi', 'rucuSebebiKod', 'yetkiliIcra', 'odeme[2026-03-14|12500.00]']) {
      expect(alanTanimi(a)?.kritik, a).toBe(true)
    }
    expect(alanTanimi('policeNo')?.kritik).toBe(false)
  })

  it('tutar ve tarih toplu onaylanamaz; yetkili icraya AI yazamaz', () => {
    for (const a of ['asilAlacak', 'rucuTutari', 'kazaTarihi', 'policeBaslangic', 'policeTanzimTarihi', 'odeme[x]']) {
      expect(alanTanimi(a)?.topluOnaylanabilir, a).toBe(false)
    }
    expect(alanTanimi('yetkiliIcra')).toMatchObject({ aiYasak: true, karar: true })
  })

  it('bilinmeyen alan null', () => {
    expect(alanTanimi('tcVkn')).toBeNull()
    expect(alanTanimi('odeme[]')).toBeNull()
    expect(alanTanimi(undefined)).toBeNull()
  })
})

describe('normalizasyon', () => {
  it('para: TR ve ABD biçimi, sıfır/negatif/aşırı değer reddedilir', () => {
    expect(paraNormal('12.500,00')).toBe(12500)
    expect(paraNormal('12,500.50')).toBe(12500.5)
    expect(paraNormal(99.999)).toBe(100)
    expect(paraNormal('0')).toBeNull()
    expect(paraNormal(-5)).toBeNull()
    expect(paraNormal('abc')).toBeNull()
  })

  it('tarih: ISO ve gg.aa.yyyy; geçersiz gün reddedilir', () => {
    expect(tarihNormal('14.03.2026')).toBe('2026-03-14')
    expect(tarihNormal('2026-03-14')).toBe('2026-03-14')
    expect(tarihNormal('31.02.2026')).toBeNull()
    expect(tarihNormal('36/03/2025')).toBeNull()
    expect(tarihNormal(new Date(Date.UTC(2026, 0, 2)))).toBe('2026-01-02')
  })

  it('plaka: Türk plakası biçimi ve harf/rakam uzunluğu', () => {
    expect(plakaNormal('34abc123')).toBe('34 ABC 123')
    expect(plakaNormal('06 A 1234')).toBe('06 A 1234')
    expect(plakaNormal('06 A 12')).toBeNull() // tek harfte 4-5 rakam
    expect(plakaNormal('99 AB 123')).toBeNull() // il kodu 81'i aşamaz
    expect(plakaNormal('34 QW 123')).toBeNull() // Q, W plakada yok
    expect(plakaNormal('34 kri 12')).toBe('34 KRI 12')
  })

  it('oran ve branş', () => {
    expect(oranNormal('100')).toBe('% 100')
    expect(oranNormal('% 75,5')).toBe('% 75,5')
    expect(oranNormal(120)).toBeNull()
    expect(degerNormal('BRANS', 'zmss')).toBe('ZMMS')
    expect(degerNormal('BRANS', 'Kasko')).toBe('KASKO')
    expect(degerNormal('RUCU_KOD', 'B4_F')).toBe('B4_F')
    expect(degerNormal('RUCU_KOD', 'B4_X')).toBeNull()
  })

  it('ödeme ve yetkili icra değerleri', () => {
    expect(degerNormal('ODEME', { tarih: '14.03.2026', tutar: '12.500,00' })).toEqual({ tarih: '2026-03-14', tutar: 12500 })
    expect(degerNormal('ODEME', { tarih: null, tutar: 0 })).toBeNull()
    expect(degerNormal('YETKILI_ICRA', 'Adana İcra Dairesi')).toEqual({ icraDairesi: 'Adana İcra Dairesi', secenek: 'ELLE' })
    expect(odemeAlanAnahtari({ tarih: '2026-03-14', tutar: 12500 })).toBe('odeme[2026-03-14|12500.00]')
  })
})

describe('eşitlik ve ekran metni', () => {
  it('para kuruşla, metin büyük/küçük harf ve boşluk duyarsız', () => {
    expect(degerEsit('PARA', '12.500,00', 12500)).toBe(true)
    expect(degerEsit('PARA', 12500, 12500.01)).toBe(false)
    expect(degerEsit('METIN', 'POL 123', 'pol123')).toBe(true)
    expect(degerEsit('PLAKA', '34abc123', '34 ABC 123')).toBe(true)
    expect(degerEsit('YETKILI_ICRA', { icraDairesi: 'Adana İcra Dairesi', secenek: 'KAZA_YERI' }, 'adana icra dairesi')).toBe(true)
  })

  it('plaka ekranda maskeli: il kodu ve son iki rakam görünür', () => {
    expect(plakaMaskele('34 ABC 123')).toBe('34 ••• •23')
    expect(degerGorunum('PLAKA', '34ABC123', true)).toBe('34 ••• •23')
    expect(degerGorunum('PLAKA', '34ABC123', false)).toBe('34 ABC 123')
    expect(degerGorunum('PLAKA_LISTE', ['34ABC123', '06KR4567'], true)).toBe('06 •• ••67, 34 ••• •23') // sıralı
  })

  it('para, tarih, ödeme ve kod ekranda Türkçe biçimde', () => {
    expect(degerGorunum('PARA', 1234.5)).toBe('1.234,50 ₺')
    expect(degerGorunum('TARIH', '2026-03-14')).toBe('14.03.2026')
    expect(degerGorunum('ODEME', { tarih: null, tutar: 10 })).toBe('10,00 ₺ · tarihsiz')
    expect(degerGorunum('RUCU_KOD', 'B4_F')).toBe('ZMSS B.4/f · olay yerini terk')
  })
})

describe('ayna (M5)', () => {
  it('tarih UTC gece yarısı, para sayı, yetkili icra daire adı; bilgi alanı aynalanmaz', () => {
    expect(aynaPlani(alanTanimi('kazaTarihi')!, '2026-03-14')).toEqual({ tur: 'KOLON', kolon: 'kazaTarihi', deger: new Date('2026-03-14T00:00:00.000Z') })
    expect(aynaPlani(alanTanimi('asilAlacak')!, '12.500,00')).toEqual({ tur: 'KOLON', kolon: 'asilAlacak', deger: 12500 })
    expect(aynaPlani(alanTanimi('yetkiliIcra')!, { icraDairesi: 'Adana İcra Dairesi', secenek: 'KAZA_YERI' })).toMatchObject({ kolon: 'yetkiliIcra', deger: 'Adana İcra Dairesi' })
    expect(aynaPlani(alanTanimi('policeTanzimTarihi')!, '2026-01-01')).toBeNull()
    expect(aynaPlani(alanTanimi('kusur.oran')!, '% 50')).toBeNull()
  })

  it('ödeme Odeme satırına gider (anahtar gün|tutar)', () => {
    expect(aynaPlani(alanTanimi('odeme[2026-03-14|12500.00]')!, { tarih: '2026-03-14', tutar: 12500 }))
      .toEqual({ tur: 'ODEME', tarih: new Date('2026-03-14T00:00:00.000Z'), tutar: 12500, anahtar: '2026-03-14|12500.00' })
  })
})
