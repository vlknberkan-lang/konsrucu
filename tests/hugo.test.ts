/**
 * Hugo/Zurich Excel import regresyonları — geçmiş bug'lar: Excel seri no 1-gün kayması, US/TR
 * biçim karışması, çok-değerli ("A + B") hücre toplama, geçersiz tarih (36/03) satırı patlatmamalı,
 * mükerrer hukukDosyaNo. Bu modül testsizdi; parse hatası sessizce yanlış tutar/tarih yazar.
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { paraTR, tarihTR, kanonik, hugoCozumle } from '@/lib/import/hugo'

describe('paraTR — TR para + çok-değerli hücre', () => {
  it('TR biçim ve binlik/ondalık', () => {
    expect(paraTR('1.234.567,89')).toBe(1234567.89)
    expect(paraTR('1.234')).toBe(1234) // nokta binlik (×1000 hatası olmamalı)
    expect(paraTR('71,54')).toBe(71.54)
    expect(paraTR('1234.56')).toBe(1234.56) // yalnız nokta = ondalık
  })
  it('çok-değerli hücre "A + B" TOPLANIR', () => {
    expect(paraTR('1.250,00 + 2.000,00')).toBe(3250)
    expect(paraTR('1.000,00 + 2.000,00 + 500,00')).toBe(3500)
  })
  it('bir parça bozuksa hücre güvenilmez → null', () => {
    expect(paraTR('1.000,00 + abc')).toBeNull()
  })
  it('sayı girdi ve boş/aşırı', () => {
    expect(paraTR(1500)).toBe(1500)
    expect(paraTR(null)).toBeNull()
    expect(paraTR('')).toBeNull()
    expect(paraTR('1e15')).toBeNull() // Decimal(14,2) sınırı dışı
  })
})

describe('tarihTR — gg/aa/yyyy + Excel seri no', () => {
  it('geçerli tarih → UTC gece yarısı (TZ kayması yok)', () => {
    expect(tarihTR('15/06/2024')?.toISOString().slice(0, 10)).toBe('2024-06-15')
    expect(tarihTR('01.02.2024')?.toISOString().slice(0, 10)).toBe('2024-02-01')
  })
  it('REGRESYON: geçersiz tarih → null (satırı patlatma)', () => {
    expect(tarihTR('36/03/2025')).toBeNull()
    expect(tarihTR('31/02/2025')).toBeNull() // taşma
    expect(tarihTR('')).toBeNull()
    expect(tarihTR(null)).toBeNull()
  })
  it('Excel seri no fallback', () => {
    // 45491 = 2024-07-18 (SheetJS cellDates epoch kayması olmadan)
    expect(tarihTR('45491')?.toISOString().slice(0, 10)).toBe('2024-07-18')
  })
  it('gerçek Date hücresi yerel G/A/Y → UTC gece yarısı', () => {
    expect(tarihTR(new Date(2024, 5, 15, 23, 30))?.toISOString().slice(0, 10)).toBe('2024-06-15')
  })
})

describe('kanonik — başlık eşleme normalizasyonu', () => {
  it('Türkçe→ascii, küçük harf, yalnız harf+rakam', () => {
    expect(kanonik('Zaman Aşımı')).toBe('zamanasimi')
    expect(kanonik('Rücu Tutarı')).toBe('rucututari')
    expect(kanonik('Hukuk Dosya No')).toBe('hukukdosyano')
  })
})

describe('hugoCozumle — uçtan uca Excel parse', () => {
  function wbBuf(aoa: unknown[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  it('başlığı ada göre eşler, satırı normalize eder, mükerreri işaretler', () => {
    const buf = wbBuf([
      ['Hukuk Dosya No', 'Hasar Dosya No', 'Hasar Tarihi', 'Zaman Aşımı', 'Rücu Tutarı', 'Rücu Oranı'],
      ['2024/1', 'HA', '01/02/2024', '36/03/2025', '1.000,00 + 2.000,00', '75'],
      ['2024/1', 'HB', '02/02/2024', '01/01/2026', '500', '50'], // mükerrer hukukDosyaNo
    ])
    const r = hugoCozumle(buf)

    expect(r.baslikSatiri).toBe(1)
    expect(r.eslesenKolon).toBe(6)
    expect(r.satirlar).toHaveLength(1)

    const s = r.satirlar[0]
    expect(s.hukukDosyaNo).toBe('2024/1')
    expect(s.rucuTutari).toBe(3000) // çok-değerli hücre toplandı
    expect(s.rucuOrani).toBe('% 75')
    expect(s.hasarTarihi?.toISOString().slice(0, 10)).toBe('2024-02-01')
    expect(s.zamanasimi).toBeNull() // 36/03 geçersiz → null, satır atılmadı

    expect(r.hatalar).toHaveLength(1)
    expect(r.hatalar[0].sebep).toMatch(/mükerrer/i)
  })

  it('başlık eşleşmezse anlamlı hata döner (satır patlatmaz)', () => {
    const r = hugoCozumle(wbBuf([['foo', 'bar'], ['1', '2']]))
    expect(r.satirlar).toHaveLength(0)
    expect(r.hatalar.length).toBeGreaterThan(0)
  })
})
