/**
 * Durum makinesi regresyonları — geç gelen UYAP olayı dosyayı GERİYE çekemez.
 * (dosyaDurumIlerlet DB'ye dokunur; burada saf ileriMi/DURUM_RANK test edilir.)
 */
import { describe, it, expect } from 'vitest'
import { DosyaDurum } from '@prisma/client'
import { ileriMi, DURUM_RANK } from '@/lib/konsrucu/durum'

describe('ileriMi — yalnız ileri yön', () => {
  it('normal akış ileri gider', () => {
    expect(ileriMi(DosyaDurum.HAVUZDA, DosyaDurum.INCELENIYOR)).toBe(true)
    expect(ileriMi(DosyaDurum.INCELENIYOR, DosyaDurum.TAKIP_ACILDI)).toBe(true)
    expect(ileriMi(DosyaDurum.TAKIP_ACILDI, DosyaDurum.TEBLIG_EDILDI)).toBe(true)
    expect(ileriMi(DosyaDurum.TEBLIG_EDILDI, DosyaDurum.KESINLESTI)).toBe(true)
    expect(ileriMi(DosyaDurum.KESINLESTI, DosyaDurum.TAHSIL)).toBe(true)
  })
  it('geç gelen TEBLIG, KESINLESTI/DAVA dosyayı geri çekemez (asıl bug)', () => {
    expect(ileriMi(DosyaDurum.KESINLESTI, DosyaDurum.TEBLIG_EDILDI)).toBe(false)
    expect(ileriMi(DosyaDurum.DAVA, DosyaDurum.TEBLIG_EDILDI)).toBe(false)
    expect(ileriMi(DosyaDurum.DAVA, DosyaDurum.TAKIP_ACILDI)).toBe(false)
    expect(ileriMi(DosyaDurum.ARABULUCULUK, DosyaDurum.ITIRAZ)).toBe(false)
  })
  it('aynı durum ilerleme sayılmaz', () => {
    expect(ileriMi(DosyaDurum.ITIRAZ, DosyaDurum.ITIRAZ)).toBe(false)
  })
  it('KAPANDI dosya TAHSIL e geri dönmez (eşit sıra)', () => {
    expect(ileriMi(DosyaDurum.KAPANDI, DosyaDurum.TAHSIL)).toBe(false)
  })
  it('tüm DosyaDurum değerlerinin sıralaması tanımlı', () => {
    for (const d of Object.values(DosyaDurum)) {
      expect(DURUM_RANK[d], `DURUM_RANK eksik: ${d}`).toBeTypeOf('number')
    }
  })
})
