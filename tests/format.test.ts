/** İstanbul-güvenli tarih yardımcıları — Vercel UTC'de gün kayması regresyonları. */
import { describe, it, expect } from 'vitest'
import { kalanGun, bugunIstBasi, tarihTR } from '@/lib/konsrucu/format'

describe('kalanGun — İstanbul takvim günü', () => {
  it('UTC gece yarısına yakın saatte gün KAYMAZ (asıl bug)', () => {
    // 4 Tem 22:30 UTC = 5 Tem 01:30 İstanbul → "bugün" İstanbul'da 5 Temmuz'dur
    const simdi = new Date('2026-07-04T22:30:00Z')
    const hedef = new Date('2026-07-05T00:00:00Z') // 5 Tem 03:00 İstanbul
    expect(kalanGun(hedef, simdi)).toBe(0) // aynı İstanbul günü
  })
  it('düz günler doğru sayılır', () => {
    const simdi = new Date('2026-07-04T09:00:00Z')
    expect(kalanGun(new Date('2026-07-11T09:00:00Z'), simdi)).toBe(7)
    expect(kalanGun(new Date('2026-07-01T09:00:00Z'), simdi)).toBe(-3)
  })
})

describe('bugunIstBasi', () => {
  it('İstanbul gün başlangıcının UTC karşılığı 21:00 önceki gün', () => {
    const b = bugunIstBasi(new Date('2026-07-04T22:30:00Z')) // İstanbul 5 Tem 01:30
    expect(b.toISOString()).toBe('2026-07-04T21:00:00.000Z') // 5 Tem 00:00 İstanbul
  })
  it('gündüz saatinde aynı günün başı', () => {
    const b = bugunIstBasi(new Date('2026-07-04T10:00:00Z')) // İstanbul 13:00
    expect(b.toISOString()).toBe('2026-07-03T21:00:00.000Z') // 4 Tem 00:00 İstanbul
  })
})

describe('tarihTR', () => {
  it('UTC geceye yakın tarihi İstanbul gününde gösterir', () => {
    expect(tarihTR(new Date('2026-07-04T22:30:00Z'))).toBe('05.07.2026')
  })
  it('bozuk/boş girdi — döner', () => {
    expect(tarihTR(null)).toBe('—')
    expect(tarihTR('bozuk')).toBe('—')
  })
})
