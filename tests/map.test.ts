/** UI durum eşlemesi — her DosyaDurum bir rozet/adım almalı; ARABULUCULUK/DAVA/INFAZ "İşleniyor"a düşmemeli. */
import { describe, it, expect } from 'vitest'
import { DosyaDurum } from '@prisma/client'
import { mapDurum, durumStep } from '@/lib/konsrucu/map'

describe('mapDurum / durumStep — tam kapsam', () => {
  it('ARABULUCULUK/DAVA/INFAZ artık "isleniyor" değil (bug fix)', () => {
    expect(mapDurum('ARABULUCULUK')).toBe('gonderildi')
    expect(mapDurum('DAVA')).toBe('gonderildi')
    expect(mapDurum('INFAZ')).toBe('gonderildi')
    expect(durumStep('ARABULUCULUK')).toBe(5)
    expect(durumStep('DAVA')).toBe(5)
    expect(durumStep('INFAZ')).toBe(5)
  })
  it('hiçbir gerçek durum default dalına düşmez', () => {
    for (const d of Object.values(DosyaDurum)) {
      if (d === 'HAVUZDA') continue // bilinçli: step 1 / isleniyor
      expect(durumStep(d), `durumStep default'a düştü: ${d}`).not.toBe(2)
    }
  })
})
