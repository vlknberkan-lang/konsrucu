/**
 * Aktiflik kapısı regresyonları — kapanmış dosya pahalı otomasyona (UYAP poll, evrak, AI) girmez.
 * uyapDurum serbest metni açık/kapalı için YETKİLİ kaynak (hafıza: uyap-dosya-durum-kontrol).
 */
import { describe, it, expect } from 'vitest'
import { KAPALI_DURUMLAR, uyapKapaliMi, dosyaAktif } from '@/lib/konsrucu/aktiflik'

describe('uyapKapaliMi — UYAP serbest metin', () => {
  it('kapalı varyantları yakalar (Türkçe İ/ı bağımsız)', () => {
    expect(uyapKapaliMi('Kapalı')).toBe(true)
    expect(uyapKapaliMi('KAPALI')).toBe(true)
    expect(uyapKapaliMi('Kapandı')).toBe(true)
    expect(uyapKapaliMi('İnfazen kapandı')).toBe(true)
    expect(uyapKapaliMi('Takipsizlik nedeniyle kapandı')).toBe(true)
  })
  it('açık dosya metinlerinde tetiklenmez', () => {
    expect(uyapKapaliMi('Açık')).toBe(false)
    expect(uyapKapaliMi('Derdest')).toBe(false)
    expect(uyapKapaliMi(null)).toBe(false)
    expect(uyapKapaliMi(undefined)).toBe(false)
    expect(uyapKapaliMi('')).toBe(false)
  })
})

describe('dosyaAktif — otomasyon kapsamı', () => {
  it('kapalı yaşam döngüsü durumları otomasyondan düşer', () => {
    for (const durum of KAPALI_DURUMLAR) {
      expect(dosyaAktif({ durum }), `${durum} aktif sayılmamalı`).toBe(false)
    }
  })
  it('durum açık ama UYAP kapalı diyorsa yine düşer (UYAP yetkili)', () => {
    expect(dosyaAktif({ durum: 'TAKIP_ACILDI', uyapDurum: 'Kapalı' })).toBe(false)
    expect(dosyaAktif({ durum: 'TEBLIG_EDILDI', uyapDurum: 'İnfazen kapandı' })).toBe(false)
  })
  it('açık dosya aktif kalır', () => {
    expect(dosyaAktif({ durum: 'TAKIP_ACILDI', uyapDurum: 'Açık' })).toBe(true)
    expect(dosyaAktif({ durum: 'HAVUZDA' })).toBe(true)
    expect(dosyaAktif({ durum: null, uyapDurum: null })).toBe(true)
  })
})
