import { describe, it, expect } from 'vitest'
import { davaliTuruTahmin, varyantIstegi } from '@/lib/konsrucu/dilekce-v2/varyant'

describe('davalı türü tahmini', () => {
  it('kamu, tüzel, gerçek', () => {
    expect(davaliTuruTahmin('ŞİŞLİ BELEDİYE BAŞKANLIĞI')).toBe('KAMU')
    expect(davaliTuruTahmin('Karayolları Genel Müdürlüğü')).toBe('KAMU')
    expect(davaliTuruTahmin('RENK SU VE ENERJİ SİSTEMLERİ SANAYİ VE TİCARET ANONİM ŞİRKETİ')).toBe('OZEL_TUZEL')
    expect(davaliTuruTahmin('Has Kuzucu Et Ürünleri Tic. Ltd. Şti.')).toBe('OZEL_TUZEL')
    expect(davaliTuruTahmin('YUSUF GÖRÜR')).toBe('GERCEK')
    expect(davaliTuruTahmin('')).toBeNull()
  })
})

describe('varyant isteği', () => {
  it('mahkeme türü dava kaydından, yoksa mahkeme adından', () => {
    expect(varyantIstegi({ rucuSebebiKod: null, davaMahkemeTuru: 'ASLIYE_HUKUK', mahkemeAdi: null, usul: 'BASIT', davaliAdlari: ['X A.Ş.'] }))
      .toEqual({ rucuSebebiKod: null, mahkemeTuru: 'ASLIYE_HUKUK', usul: 'BASIT', davaliTur: 'OZEL_TUZEL' })
    expect(varyantIstegi({ rucuSebebiKod: 'B4_C_ALKOL', davaMahkemeTuru: null, mahkemeAdi: 'Sakarya Tüketici Mahkemesi', usul: null, davaliAdlari: ['Ali Veli'] }).mahkemeTuru).toBe('TUKETICI')
  })
})
