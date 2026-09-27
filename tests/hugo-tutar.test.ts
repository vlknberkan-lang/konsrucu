/**
 * Hugo/Ray Excel tutar ayrıştırma — docs/04 K6 regresyonu: Hugo ham verisinde ABD biçimli
 * "493,210.00" değeri, virgülü ondalık sanan eski kod yüzünden 493,21 okunuyordu (1000'e bölünme).
 * Aynı kaynakta TR biçimi ("1.978.000,00 TRY") de geliyor → biçim DEĞER bazında tespit edilmeli.
 * Tüm tutarlar uydurmadır (gerçek dosya verisi yok).
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { paraTR, hugoCozumle } from '@/lib/import/hugo'

describe('paraTR — ABD biçimi (virgül binlik, nokta ondalık)', () => {
  it('REGRESYON: "493,210.00" 1000\'e bölünmez', () => {
    expect(paraTR('493,210.00')).toBe(493210)
    expect(paraTR('493,210.00 TRY')).toBe(493210)
  })
  it('çok gruplu ve kuruşlu', () => {
    expect(paraTR('1,234,567.89')).toBe(1234567.89)
    expect(paraTR('2,345,678.9')).toBe(2345678.9)
    expect(paraTR('12,500.05')).toBe(12500.05)
  })
})

describe('paraTR — TR biçimi (nokta binlik, virgül ondalık)', () => {
  it('Ray takip raporundaki biçim: "N.NNN,NN TRY"', () => {
    expect(paraTR('412.305,70 TRY')).toBe(412305.7)
    expect(paraTR('2.345.678,90 TRY')).toBe(2345678.9)
    expect(paraTR('1.000,00')).toBe(1000)
  })
  it('binliksiz ondalık', () => {
    expect(paraTR('71,54')).toBe(71.54)
    expect(paraTR('1234,5')).toBe(1234.5)
  })
})

describe('paraTR — para birimi eki ve boşluklar', () => {
  it('TL / TRY / ₺ / YTL eki, önde ya da arkada, bitişik ya da boşluklu', () => {
    expect(paraTR('1.250,50 TL')).toBe(1250.5)
    expect(paraTR('1.250,50TL')).toBe(1250.5)
    expect(paraTR('₺1.250,50')).toBe(1250.5)
    expect(paraTR('₺ 1,250.50')).toBe(1250.5)
    expect(paraTR('1,250.50 try')).toBe(1250.5)
    expect(paraTR('TRY 1.250,50')).toBe(1250.5)
    expect(paraTR('1.250,50 YTL')).toBe(1250.5)
  })
  it('boşluk binlik ayracı ve NBSP / ince boşluk', () => {
    expect(paraTR(' 1 234 567,89 ')).toBe(1234567.89)
    expect(paraTR('1 234,56')).toBe(1234.56)
    expect(paraTR('12 500 TL')).toBe(12500)
    expect(paraTR('1 234 567.89')).toBe(1234567.89)
  })
  it('yabancı para birimi sessizce TL sayılmaz → null', () => {
    expect(paraTR('1.000,00 USD')).toBeNull()
    expect(paraTR('€100')).toBeNull()
    expect(paraTR('$1,000.00')).toBeNull()
  })
  it('yalnız ek / yalnız boşluk → null', () => {
    expect(paraTR('TRY')).toBeNull()
    expect(paraTR('   ')).toBeNull()
  })
})

describe('paraTR — çok-değerli hücre ("A + B" toplanır)', () => {
  it('aynı biçimli parçalar, ekli', () => {
    expect(paraTR('1.000,00 TRY + 2.000,00 TRY')).toBe(3000)
    expect(paraTR('1,000.00 + 2,500.50')).toBe(3500.5)
  })
  it('karışık biçim: her parça kendi biçimiyle çözülür', () => {
    expect(paraTR('120,500.00 + 1.000,00 TL')).toBe(121500)
    expect(paraTR('1,234 + 1.234')).toBe(2468)
  })
  it('boş ya da bozuk parça → hücrenin tamamı null', () => {
    expect(paraTR('1.000,00 +')).toBeNull()
    expect(paraTR('+ 1.000,00')).toBeNull()
    expect(paraTR('1,000.00 + 1.2.3')).toBeNull()
  })
})

describe('paraTR — Excel sayı hücresi (number)', () => {
  it('number olduğu gibi alınır, 2 haneye yuvarlanır', () => {
    expect(paraTR(493210)).toBe(493210)
    expect(paraTR(493210.004)).toBe(493210)
    expect(paraTR(0.1 + 0.2)).toBe(0.3)
    expect(paraTR(-1500.5)).toBe(-1500.5)
  })
  it('sonsuz / NaN / Decimal(14,2) dışı → null', () => {
    expect(paraTR(Number.NaN)).toBeNull()
    expect(paraTR(Number.POSITIVE_INFINITY)).toBeNull()
    expect(paraTR(1e12)).toBeNull()
  })
})

describe('paraTR — belirsiz tek ayraç kuralı', () => {
  it('tek ayraç + TAM 3 hane → binlik (TR ve ABD okuması aynı)', () => {
    expect(paraTR('1,234')).toBe(1234)
    expect(paraTR('1.234')).toBe(1234)
    expect(paraTR('12,345 TL')).toBe(12345)
    expect(paraTR('123.456')).toBe(123456)
  })
  it('tek ayraç + 1–2 hane → ondalık', () => {
    expect(paraTR('1234.56')).toBe(1234.56)
    expect(paraTR('1234,5')).toBe(1234.5)
    expect(paraTR('0,50')).toBe(0.5)
    expect(paraTR('0.5')).toBe(0.5)
  })
  it('tek ayraç + 4+ hane → ondalık (binlik grubu olamaz), 2 haneye yuvarlanır', () => {
    expect(paraTR('1234.5678')).toBe(1234.57)
    expect(paraTR('493210.00000001')).toBe(493210)
  })
  it('3 hane ama gruplama geçersiz → tahmin yok, null', () => {
    expect(paraTR('0,125')).toBeNull()
    expect(paraTR('0.125')).toBeNull()
    expect(paraTR('1234,567')).toBeNull()
  })
})

describe('paraTR — bozuk girdiler null döner (tahmin yürütülmez)', () => {
  it('iki ayraçlı değerde 3+ ondalık hane yuvarlanmaz → null (tek ayraçlı "1234,567" ile tutarlı)', () => {
    expect(paraTR('1.234,567')).toBeNull()
    expect(paraTR('1,234.5678')).toBeNull()
    expect(paraTR('1.234,567 TL')).toBeNull()
    expect(paraTR('1.000,00 + 1.234,567')).toBeNull() // bozuk parça → hücre null
    // 1–2 ondalık hane geçerli kalır
    expect(paraTR('1.234,5')).toBe(1234.5)
    expect(paraTR('1,234.56')).toBe(1234.56)
  })
  it('geçersiz gruplama', () => {
    expect(paraTR('1.23.456')).toBeNull()
    expect(paraTR('12,34,567.00')).toBeNull() // Hint gruplaması
    expect(paraTR('1,234.567,89')).toBeNull() // ondalık ayraç iki kez
    expect(paraTR('1.234,56.78')).toBeNull()
  })
  it('yarım ayraç, harf, üstel gösterim', () => {
    expect(paraTR('1.234,')).toBeNull()
    expect(paraTR(',50')).toBeNull()
    expect(paraTR('12a34')).toBeNull()
    expect(paraTR('4.9321E+5')).toBeNull()
    expect(paraTR('abc')).toBeNull()
  })
  it('negatif işaret korunur', () => {
    expect(paraTR('-1.234,50')).toBe(-1234.5)
    expect(paraTR('-1,234.50 TL')).toBe(-1234.5)
  })
})

describe('hugoCozumle — tutar kolonları uçtan uca', () => {
  function wbBuf(aoa: unknown[][], duzenle?: (ws: XLSX.WorkSheet) => void): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    duzenle?.(ws)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sayfa1')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  it('ABD metni, TR metni ve biçimli sayı hücresi aynı dosyada doğru okunur', () => {
    const buf = wbBuf(
      [
        // Ray takip raporundaki büyük harfli başlıklar ("DAVA MIKTARI" noktasız I ile)
        ['HUKUK DOSYA NO', 'HASAR DOSYA NO', 'RÜCU TUTARI', 'DAVA MIKTARI'],
        ['900001', 'H-1', '412,305.70 TRY', '412,305.70 TRY'], // ABD biçimli metin
        ['900002', 'H-2', '1.250.000,00 TRY', '1.250.000,00 TRY'], // TR biçimli metin
        ['900003', 'H-3', 98765.4, 98765.4], // Excel sayı hücresi
        ['900004', 'H-4', '1.000,00 + 2,000.00', ''], // çok-değerli, karışık; boş dava miktarı
      ],
      (ws) => {
        // Sayı hücresine ABD görünümlü biçim kodu ver: raw okumada değeri etkilememeli
        ws['C4'].z = '#,##0.00'
        ws['D4'].z = '#,##0.00 "TL"'
      },
    )
    const r = hugoCozumle(buf)

    expect(r.hatalar).toHaveLength(0)
    expect(r.satirlar).toHaveLength(4)
    const [abd, tr, sayi, cok] = r.satirlar

    expect(abd.rucuTutari).toBe(412305.7)
    expect(abd.davaMiktari).toBe(412305.7)
    expect(abd.kaynak.ham.rucuTutari).toBe('412,305.70 TRY') // denetim izi ham kalır

    expect(tr.rucuTutari).toBe(1250000)
    expect(tr.davaMiktari).toBe(1250000)

    expect(sayi.rucuTutari).toBe(98765.4)
    expect(sayi.davaMiktari).toBe(98765.4)

    expect(cok.rucuTutari).toBe(3000)
    expect(cok.davaMiktari).toBeNull()
  })
})
