/**
 * Aktiflik kapısı regresyonları — kapanmış dosya pahalı otomasyona (UYAP poll, evrak, AI) girmez.
 * uyapDurum serbest metni açık/kapalı için YETKİLİ kaynak (hafıza: uyap-dosya-durum-kontrol).
 *
 * S06 (B12, F18): tek "kapalı" listesi üçe ayrıldı. İDARİ_YOL otomasyon dışıdır (icra dosyası yok),
 * ama görev hatırlatmasına ve zamanaşımı radarına GİRER.
 */
import { describe, it, expect } from 'vitest'
import { DosyaDurum } from '@prisma/client'
import {
  KAPALI_DURUMLAR, OTOMASYON_DISI, HATIRLATMA_DISI, ZAMANASIMI_RADARI,
  uyapKapaliMi, dosyaAktif, hatirlatmaKapsaminda, zamanasimiRadarinda,
} from '@/lib/konsrucu/aktiflik'

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

describe('üç liste — S06', () => {
  it('OTOMASYON_DISI: TAHSIL, KAPANDI, IDARI_YOL (idari yolda icra dosyası yok)', () => {
    expect([...OTOMASYON_DISI].sort()).toEqual(['IDARI_YOL', 'KAPANDI', 'TAHSIL'])
  })
  it('HATIRLATMA_DISI: yalnız TAHSIL ve KAPANDI; IDARI_YOL hatırlatma alır', () => {
    expect([...HATIRLATMA_DISI].sort()).toEqual(['KAPANDI', 'TAHSIL'])
    expect(HATIRLATMA_DISI as readonly string[]).not.toContain('IDARI_YOL')
  })
  it('ZAMANASIMI_RADARI: takip öncesi üç durum + IDARI_YOL', () => {
    expect([...ZAMANASIMI_RADARI].sort()).toEqual(['HAVUZDA', 'IDARI_YOL', 'INCELENIYOR', 'TAKIBE_HAZIR'])
  })
  it('eski ad KAPALI_DURUMLAR otomasyon listesine işaret eder (UYAP hedefleri, masraf tarama değişmez)', () => {
    expect(KAPALI_DURUMLAR).toBe(OTOMASYON_DISI)
  })
  it('listelerdeki her kod gerçek bir DosyaDurum (Prisma where notIn/in yazım hatası yakalanır)', () => {
    const gecerli = new Set<string>(Object.values(DosyaDurum))
    for (const d of [...OTOMASYON_DISI, ...HATIRLATMA_DISI, ...ZAMANASIMI_RADARI]) expect(gecerli.has(d), d).toBe(true)
  })
})

describe('dosyaAktif — otomasyon kapsamı', () => {
  it('kapalı yaşam döngüsü durumları otomasyondan düşer', () => {
    for (const durum of KAPALI_DURUMLAR) {
      expect(dosyaAktif({ durum }), `${durum} aktif sayılmamalı`).toBe(false)
    }
  })
  it('IDARI_YOL otomasyondan (UYAP sorgusu, evrak, masraf AI) düşer', () => {
    expect(dosyaAktif({ durum: 'IDARI_YOL' })).toBe(false)
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

describe('hatirlatmaKapsaminda — görev hatırlatma e-postası', () => {
  it('IDARI_YOL dosyasının görevi hatırlatılır (B12: eskiden susuyordu)', () => {
    expect(hatirlatmaKapsaminda({ durum: 'IDARI_YOL' })).toBe(true)
    expect(hatirlatmaKapsaminda({ durum: 'IDARI_YOL', uyapDurum: null })).toBe(true)
  })
  it('TAHSIL ve KAPANDI hatırlatılmaz', () => {
    expect(hatirlatmaKapsaminda({ durum: 'TAHSIL' })).toBe(false)
    expect(hatirlatmaKapsaminda({ durum: 'KAPANDI' })).toBe(false)
  })
  it('UYAP kapalı diyorsa hatırlatılmaz', () => {
    expect(hatirlatmaKapsaminda({ durum: 'TAKIP_ACILDI', uyapDurum: 'Kapandı' })).toBe(false)
  })
  it('açık icra evreleri hatırlatılır', () => {
    for (const durum of ['INCELENIYOR', 'TAKIP_ACILDI', 'ITIRAZ', 'DAVA', 'INFAZ']) expect(hatirlatmaKapsaminda({ durum }), durum).toBe(true)
  })
})

describe('zamanasimiRadarinda — radar kümesi', () => {
  it('takip öncesi üç durum ve IDARI_YOL radarda', () => {
    for (const durum of ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR', 'IDARI_YOL']) expect(zamanasimiRadarinda({ durum }), durum).toBe(true)
  })
  it('takip açılmış ya da kapanmış dosya radar dışı (takip zamanaşımını keser)', () => {
    for (const durum of ['TAKIP_ACILDI', 'TEBLIG_EDILDI', 'ITIRAZ', 'KESINLESTI', 'TAHSIL', 'KAPANDI']) expect(zamanasimiRadarinda({ durum }), durum).toBe(false)
  })
  it('durum boşsa radar dışı; UYAP kapalıysa radar dışı', () => {
    expect(zamanasimiRadarinda({ durum: null })).toBe(false)
    expect(zamanasimiRadarinda({ durum: 'INCELENIYOR', uyapDurum: 'Kapalı' })).toBe(false)
  })
})
