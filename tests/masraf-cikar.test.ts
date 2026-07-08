/**
 * Makbuz metin parser regresyonları (KATMAN 1, ₺0) — makbuzParseMetin saf fonksiyonu.
 * guvenli=true SADECE makbuzdaki "Toplam" ile kalemler birebir tutuyorsa (hiçbir kalem kaçmadı).
 * Tutmuyorsa çağıran ucuz LLM'e düşer. Reddiyat/tahsilat makbuzunda kalem yoktur (çift sayma yok).
 *
 * Not: masraf-cikar.ts, pdf-metin (→ 'server-only') ve prisma import eder; vitest bunları
 * stub/sahte-env ile karşılar (bkz. vitest.config.ts + tests/setup.ts). makbuzParseMetin DB'ye gitmez.
 */
import { describe, it, expect } from 'vitest'
import { makbuzParseMetin } from '@/lib/konsrucu/masraf-cikar'

describe('makbuzParseMetin', () => {
  it('metinli makbuz: toplam tutuyor → guvenli, alacak satırı hariç', () => {
    const metin = [
      'T.C. 1. İcra Dairesi Müdürlüğü',
      'Asıl Alacak   5.000,00', // masraf DEĞİL → hariç
      'Başvurma Harcı   54,40',
      'Peşin Harç   120,00',
      'Toplam   174,40',
    ].join('\n')

    const r = makbuzParseMetin(metin)
    expect(r.reddiyat).toBe(false)
    expect(r.guvenli).toBe(true)
    expect(r.kalemler).toHaveLength(2) // Asıl Alacak sayılmadı
    const tutarlar = r.kalemler.map((k) => k.tutar).sort((a, b) => a - b)
    expect(tutarlar).toEqual([54.4, 120])
    expect(r.kalemler.every((k) => k.taraf === 'BIZ')).toBe(true)
  })

  it('REGRESYON: toplam tutmuyorsa guvenli=false (LLM fallback tetiklenir)', () => {
    const metin = ['Başvurma Harcı   54,40', 'Peşin Harç   120,00', 'Toplam   999,00'].join('\n')
    const r = makbuzParseMetin(metin)
    expect(r.kalemler.length).toBeGreaterThanOrEqual(1)
    expect(r.guvenli).toBe(false)
  })

  it('reddiyat/tahsilat makbuzu → kalem yok (çift sayma önlenir)', () => {
    const metin = ['REDDİYAT MAKBUZU', 'Asıl Alacak 5.000,00', 'İşlemiş Faiz 200,00'].join('\n')
    const r = makbuzParseMetin(metin)
    expect(r.reddiyat).toBe(true)
    expect(r.kalemler).toHaveLength(0)
  })
})
