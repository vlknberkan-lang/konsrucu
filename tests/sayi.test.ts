/**
 * TR sayı parse regresyonları — geçmişte tek-format parser ×100 "milyon" hatası üretti
 * (bkz. hafıza: tr-sayi-parse-iki-format). Bu testler o hatanın geri gelmesini engeller.
 */
import { describe, it, expect } from 'vitest'
import { sayiTR, sayiTRveya0, formatTRInput, toTRInput } from '@/lib/konsrucu/sayi'

describe('sayiTR — iki formatı da çözer', () => {
  it('TR biçimi: nokta binlik + virgül ondalık', () => {
    expect(sayiTR('1.234,56')).toBe(1234.56)
    expect(sayiTR('120.000,50')).toBe(120000.5)
    expect(sayiTR('1.234.567,89')).toBe(1234567.89)
  })
  it('makine/US biçimi: nokta ondalık', () => {
    expect(sayiTR('1234.56')).toBe(1234.56)
    expect(sayiTR('1,234.56')).toBe(1234.56) // US binlik virgül — eski taksit kopyası bunu YANLIŞ okuyordu
  })
  it('düz sayılar ve para simgeleri', () => {
    expect(sayiTR('120000')).toBe(120000)
    expect(sayiTR('₺ 1.234')).toBe(1234)
    expect(sayiTR(1500)).toBe(1500)
  })
  it('"milyon" hatası: 1.234 asla 1234_00 okunmaz', () => {
    expect(sayiTR('1.234')).toBe(1234) // TR binlik
    expect(sayiTR('1.234,00')).toBe(1234)
  })
  it('negatif ve bozuk girdi', () => {
    expect(sayiTR('-1.234,56')).toBe(-1234.56)
    expect(Number.isNaN(sayiTR(''))).toBe(true)
    expect(Number.isNaN(sayiTR('abc'))).toBe(true)
    expect(Number.isNaN(sayiTR(null))).toBe(true)
  })
})

describe('sayiTRveya0', () => {
  it('bozuk girdi 0 döner (canlı hesap panelleri)', () => {
    expect(sayiTRveya0('')).toBe(0)
    expect(sayiTRveya0('x')).toBe(0)
    expect(sayiTRveya0('12,5')).toBe(12.5)
  })
})

describe('formatTRInput — yazarken binlik ayracı', () => {
  it('binlik noktaları ekler', () => {
    expect(formatTRInput('120000')).toBe('120.000')
    expect(formatTRInput('1234567')).toBe('1.234.567')
  })
  it('virgül ondalığı korur, 2 haneye kırpar', () => {
    expect(formatTRInput('120000,5')).toBe('120.000,5')
    expect(formatTRInput('120000,567')).toBe('120.000,56')
  })
})

describe('toTRInput', () => {
  it('sayıyı TR giriş metnine çevirir', () => {
    expect(toTRInput(1234.5)).toBe('1.234,50')
    expect(toTRInput(null)).toBe('')
  })
})
