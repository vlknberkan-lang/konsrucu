/**
 * Masraf modülü regresyonları — içerik-temelli mükerrer anahtarı (aynı makbuz iki kez girilmesin) ve
 * TR para parse (×100 "milyon" hatası). Bu modül testsizdi.
 */
import { describe, it, expect } from 'vitest'
import { masrafDedupKey, paraGuvenli, isoHaftaDonem } from '@/lib/konsrucu/masraf'

describe('masrafDedupKey — güçlü anahtar şart', () => {
  it('dekontNo + tarih varsa deterministik anahtar üretir', () => {
    const k = masrafDedupKey({ dekontNo: '123', cinsHam: 'Başvuru Harcı', tutar: 54.4, tarih: '2024-01-01' })
    expect(k).toBe('123|başvuru harcı|54.40|2024-01-01')
  })
  it('aynı içerik → aynı anahtar (Date/string tarih farkı önemsiz)', () => {
    const a = masrafDedupKey({ dekontNo: '9', cinsHam: 'Peşin Harç', tutar: 120, tarih: '2024-03-05' })
    const b = masrafDedupKey({ dekontNo: '9', cinsHam: 'peşin harç', tutar: 120, tarih: new Date('2024-03-05T10:00:00Z') })
    expect(a).toBe(b)
  })
  it('REGRESYON: dekontNo VE tarih yoksa null (farklı kalemler mükerrer sayılmasın)', () => {
    expect(masrafDedupKey({ cinsHam: 'Baro Pulu', tutar: 5 })).toBeNull()
    expect(masrafDedupKey({ dekontNo: '', tarih: null, tutar: 5 })).toBeNull()
  })
  it('yalnız tarih varsa (dekont yok) yine anahtar üretir', () => {
    expect(masrafDedupKey({ cinsHam: 'x', tutar: 5, tarih: '2024-01-01' })).toBe('|x|5.00|2024-01-01')
  })
})

describe('paraGuvenli — TR/US para parse', () => {
  it('biçimleri doğru çözer', () => {
    expect(paraGuvenli('1.234,56')).toBe(1234.56)
    expect(paraGuvenli('71.54')).toBe(71.54) // nokta ondalık
    expect(paraGuvenli('1.234')).toBe(1234) // nokta binlik
    expect(paraGuvenli('1234,56')).toBe(1234.56)
    expect(paraGuvenli('1.234.567,89')).toBe(1234567.89)
    expect(paraGuvenli('₺ 1.500,00')).toBe(1500)
  })
  it('sayı passthrough + bozuk → null', () => {
    expect(paraGuvenli(54.4)).toBe(54.4)
    expect(paraGuvenli('')).toBeNull()
    expect(paraGuvenli('abc')).toBeNull()
    expect(paraGuvenli(null)).toBeNull()
  })
})

describe('isoHaftaDonem', () => {
  it('ISO hafta biçimi YYYY-Www', () => {
    expect(isoHaftaDonem(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01')
    expect(isoHaftaDonem(new Date(Date.UTC(2026, 5, 30)))).toMatch(/^2026-W\d{2}$/)
  })
})
