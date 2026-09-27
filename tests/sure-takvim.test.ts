import { describe, expect, it } from 'vitest'
import { adliTatildeMi, ayEkle, gunEkle, gunFarki, haftaGunu, haftaSonuMu, isoGun, isoGundenTarih, yilEkle } from '@/lib/konsrucu/sure/takvim'

const g = (s: string) => isoGundenTarih(s) as Date

describe('S24 · süre takvimi (İstanbul günü, uzatma yok)', () => {
  it('geçersiz tarihi reddeder, geçerliyi İstanbul gece yarısına çevirir', () => {
    expect(isoGundenTarih('2027-02-31')).toBeNull()
    expect(isoGundenTarih('12.03.2027')).toBeNull()
    expect(g('2027-03-12').toISOString()).toBe('2027-03-11T21:00:00.000Z')
  })

  it('UTC gece yarısına yakın an İstanbul gününe göre okunur', () => {
    expect(isoGun(new Date('2027-03-11T22:30:00Z'))).toBe('2027-03-12') // İstanbul 01:30
    expect(isoGun(new Date('2027-03-11T20:59:00Z'))).toBe('2027-03-11') // İstanbul 23:59
  })

  it('gün ekleme ay ve yıl sınırını aşar; başladığı gün sayılmaz', () => {
    expect(isoGun(gunEkle(g('2026-12-25'), 7))).toBe('2027-01-01')
    expect(gunFarki(g('2026-12-25'), g('2027-01-01'))).toBe(7)
  })

  it('yıl eklemede 29 Şubat → 28 Şubat; ay eklemede ayın son günü korunur', () => {
    expect(isoGun(yilEkle(g('2028-02-29'), 1))).toBe('2029-02-28')
    expect(isoGun(ayEkle(g('2027-05-31'), 3))).toBe('2027-08-31')
    expect(isoGun(ayEkle(g('2026-11-30'), 3))).toBe('2027-02-28')
    expect(isoGun(ayEkle(g('2027-11-30'), 3))).toBe('2028-02-29')
  })

  it('hafta sonu ve adli tatil yalnız tespit edilir', () => {
    expect(haftaGunu(g('2024-01-01'))).toBe(1) // Pazartesi
    expect(haftaSonuMu(g('2024-01-06'))).toBe(true) // Cumartesi
    expect(haftaSonuMu(g('2024-01-07'))).toBe(true) // Pazar
    expect(haftaSonuMu(g('2024-01-08'))).toBe(false)
    expect(adliTatildeMi(g('2027-07-19'))).toBe(false)
    expect(adliTatildeMi(g('2027-07-20'))).toBe(true)
    expect(adliTatildeMi(g('2027-08-31'))).toBe(true)
    expect(adliTatildeMi(g('2027-09-01'))).toBe(false)
  })
})
