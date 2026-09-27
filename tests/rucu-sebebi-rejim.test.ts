/**
 * S19 · ZMSS GŞ sürümü: poliçenin akdedildiği (tanzim) tarihe göre iki rejim (GŞ C.11/2; teyit gerekli).
 * Sınırlar bilgi bankasından: 2015 GŞ (01.06.2015) ve RG 12.06.2026 değişikliği (yürürlük 01.07.2026).
 */
import { describe, expect, it } from 'vitest'
import { gsRejimi, GS_SINIR } from '@/lib/konsrucu/rucu-sebebi'

describe('gsRejimi', () => {
  it('sınırlar bilgi bankasındaki tarihlerle aynı', () => {
    expect(GS_SINIR).toEqual({ GS_2015: '2015-06-01', GS_2026: '2026-07-01' })
  })

  it('01.07.2026 öncesi tanzim → 2015 metni; sonrası → 2026 metni', () => {
    expect(gsRejimi({ kod: 'B4_F', policeTanzim: '2026-06-30' }).rejim).toBe('GS_2015')
    expect(gsRejimi({ kod: 'B4_F', policeTanzim: '2026-07-02' }).rejim).toBe('GS_2026')
    expect(gsRejimi({ kod: 'B4_C_ALKOL', policeTanzim: new Date(Date.UTC(2020, 4, 5)) }).rejim).toBe('GS_2015')
  })

  it('yürürlük günü sınırda: rejim yazılır ama ayrıca "teyit gerekli" uyarısı çıkar', () => {
    const r = gsRejimi({ kod: 'B4_A', policeTanzim: '2026-07-01' })
    expect(r.rejim).toBe('GS_2026')
    expect(r.uyarilar.join(' ')).toMatch(/yürürlük gününe denk/)
  })

  it('tanzim tarihi başlangıçtan önce gelir (akdedilme esas): tanzim 2026-06-20, başlangıç 2026-07-05 → 2015', () => {
    const r = gsRejimi({ kod: 'B4_F', policeTanzim: '2026-06-20', policeBaslangic: '2026-07-05' })
    expect(r).toMatchObject({ rejim: 'GS_2015', esasTur: 'TANZIM', esasTarih: '2026-06-20' })
  })

  it('tanzim yoksa başlangıç kullanılır ve bu uyarılır', () => {
    const r = gsRejimi({ kod: 'B4_B', policeBaslangic: '2026-08-01' })
    expect(r).toMatchObject({ rejim: 'GS_2026', esasTur: 'BASLANGIC' })
    expect(r.uyarilar.join(' ')).toMatch(/başlangıç tarihi kullanıldı/)
  })

  it('poliçe tarihi yoksa sürüm belirlenemez (tahmin yok)', () => {
    const r = gsRejimi({ kod: 'B4_F' })
    expect(r.rejim).toBe('BILINMIYOR')
    expect(r.uyarilar[0]).toMatch(/Poliçe tarihi yok/)
  })

  it('2015 öncesi poliçe: eski GŞ, bent harfleri farklı uyarısı', () => {
    const r = gsRejimi({ kod: 'B4_B', policeTanzim: '2014-03-10' })
    expect(r.rejim).toBe('GS_2003')
    expect(r.uyarilar.join(' ')).toMatch(/bent harfleri farklı/)
  })

  it('B.4/f iki rejim uyarısı: 2015\'te bedeni hasar ibaresi, 2026\'da yalnız sağlık kuruluşu istisnası', () => {
    expect(gsRejimi({ kod: 'B4_F', policeTanzim: '2025-01-10' }).uyarilar.join(' ')).toMatch(/bedeni hasara neden olan/)
    expect(gsRejimi({ kod: 'B4_F', policeTanzim: '2026-09-10' }).uyarilar.join(' ')).toMatch(/sağlık kuruluşuna gitme/)
    expect(gsRejimi({ kod: 'B4_C_ALKOL', policeTanzim: '2025-01-10' }).uyarilar).toEqual([])
  })

  it('kasko kodlarında ZMSS GŞ uygulanmaz', () => {
    expect(gsRejimi({ kod: 'KASKO_HIZMET_KUSURU', policeTanzim: '2026-09-10' })).toMatchObject({ rejim: 'UYGULANMAZ', uyarilar: [] })
  })
})
