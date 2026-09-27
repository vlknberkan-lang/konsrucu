/**
 * lib/ai/bayrak.ts — AI bayrakları tek yerde (S02). Varsayılan her şey KAPALI (güvenli taraf);
 * yalnız açıkça yazılmış değer açar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_YUZEYLERI, aiOrtami, eskiDilekceHattiAcik, gorselAiAcik, maskesizAcik, yuzeyAcik, yuzeyBayragi, yuzeyDurumlari,
} from '@/lib/ai/bayrak'

beforeEach(() => {
  vi.unstubAllEnvs()
  for (const k of Object.keys(process.env)) if (/^AI_(YUZEY_|ORTAM|MASKESIZ|GORSEL)|^ESKI_DILEKCE_HATTI$/.test(k)) vi.stubEnv(k, '')
})

describe('varsayılanlar', () => {
  it('ortam değişkeni yokken: canlı, bütün yüzeyler kapalı, görsel ve maskesiz kapalı, eski hat kapalı', () => {
    expect(aiOrtami()).toBe('canli')
    for (const y of AI_YUZEYLERI) expect(yuzeyAcik(y.yuzey), y.yuzey).toBe(false)
    expect(gorselAiAcik()).toBe(false)
    expect(maskesizAcik()).toBe(false)
    expect(eskiDilekceHattiAcik()).toBe(false)
    expect(yuzeyDurumlari().every((d) => !d.acik)).toBe(true)
  })
  it('bilinmeyen/yanlış yazılmış değer açmaz', () => {
    vi.stubEnv('AI_ORTAM', 'prod')
    vi.stubEnv('AI_YUZEY_SORU', '1')
    vi.stubEnv('AI_GORSEL', 'true')
    expect(aiOrtami()).toBe('canli')
    expect(yuzeyAcik('soru')).toBe(false)
    expect(gorselAiAcik()).toBe(false)
  })
})

describe('açma', () => {
  it('staging bütün maskeli yüzeyleri ve maskesiz çağrıyı açar; görseli ve eski hattı AÇMAZ', () => {
    vi.stubEnv('AI_ORTAM', 'Staging')
    for (const y of AI_YUZEYLERI.filter((x) => x.yuzey !== 'dilekce_eski')) expect(yuzeyAcik(y.yuzey), y.yuzey).toBe(true)
    expect(maskesizAcik()).toBe(true)
    expect(gorselAiAcik()).toBe(false)
    expect(yuzeyAcik('dilekce_eski')).toBe(false)
    vi.stubEnv('ESKI_DILEKCE_HATTI', 'acik')
    expect(yuzeyAcik('dilekce_eski')).toBe(true)
  })
  it('canlıda yüzey yalnız kendi bayrağıyla açılır (tek tek; açık karar 1a)', () => {
    expect(yuzeyBayragi('soru')).toBe('AI_YUZEY_SORU')
    vi.stubEnv('AI_YUZEY_SORU', 'acik')
    expect(yuzeyAcik('soru')).toBe(true)
    expect(yuzeyAcik('yol')).toBe(false)
    expect(yuzeyAcik('cikarim')).toBe(false)
  })
  it('görsel AI ve maskesiz çağrı ayrı bayraklarla', () => {
    vi.stubEnv('AI_GORSEL', 'ACIK')
    vi.stubEnv('AI_MASKESIZ', 'acik')
    expect(gorselAiAcik()).toBe(true)
    expect(maskesizAcik()).toBe(true)
  })
})
