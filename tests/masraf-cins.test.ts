/**
 * Masraf cinsi eşleştirme regresyonları — UYAP ham adı 63 sabit kaleme doğru bağlanmalı; öğrenilen
 * sözlük tam eşleşmeyi ezmeli; eşik altı null ("Eşleştirilmedi"). Bu modül testsizdi.
 */
import { describe, it, expect } from 'vitest'
import { normCins, cinsEslesti, ogrenilenMap, CINS_ESIK } from '@/lib/konsrucu/masraf-cins'

describe('normCins', () => {
  it('TR→ascii, küçük harf, parantez içeriğini korur', () => {
    expect(normCins('Başvurma Harcı')).toBe('basvurma harci')
    expect(normCins('Vekâlet Harcı')).toBe('vekalet harci')
    expect(normCins('Temyiz Karar Harcı (Nispi)')).toBe('temyiz karar harci nispi')
  })
})

describe('cinsEslesti', () => {
  it('tam eşleşme / alias yüksek güven', () => {
    expect(cinsEslesti('Peşin Harç').cins).toBe('Peşin Harç')
    expect(cinsEslesti('Başvurma Harcı').cins).toBe('Başvuru Harcı') // alias
    expect(cinsEslesti('tebligat gideri').cins).toBe('Tebliğ Gideri') // alias
    expect(cinsEslesti('Peşin Harç').guven).toBeGreaterThanOrEqual(0.95)
  })
  it('tanınmayan → null (eşik altı)', () => {
    const r = cinsEslesti('zzzqqq wwww xxxx')
    expect(r.cins).toBeNull()
    expect(r.guven).toBeLessThan(CINS_ESIK)
    expect(cinsEslesti('').cins).toBeNull()
  })
  it('öğrenilen sözlük tam eşleşmeyi ezer (güven 1)', () => {
    const ogr = ogrenilenMap({ 'özel masraf kalemi': 'Muhtelif Diğer' })
    const r = cinsEslesti('Özel Masraf Kalemi', ogr)
    expect(r.cins).toBe('Muhtelif Diğer')
    expect(r.guven).toBe(1)
  })
  it('ogrenilenMap geçersiz cinsi (63 listede yok) atar', () => {
    const ogr = ogrenilenMap({ 'x': 'Olmayan Kalem', 'baro pulu': 'Baro Pulu' })
    expect(ogr.has('x')).toBe(false)
    expect(ogr.get('baro pulu')).toBe('Baro Pulu')
  })
})
