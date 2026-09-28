import { describe, it, expect } from 'vitest'
import { zorunluAracDesteklerMi } from '@/lib/ai/cagri'

describe('zorunlu araç seçimi desteği', () => {
  it('Opus 5.5 ve Fable/Mythos 5.1 desteklemez; Opus 4.8 ve Haiku destekler', () => {
    expect(zorunluAracDesteklerMi('claude-opus-5-5')).toBe(false)
    expect(zorunluAracDesteklerMi('claude-fable-5-1')).toBe(false)
    expect(zorunluAracDesteklerMi('claude-mythos-5-1')).toBe(false)
    expect(zorunluAracDesteklerMi('claude-opus-4-8')).toBe(true)
    expect(zorunluAracDesteklerMi('claude-haiku-4-5')).toBe(true)
    expect(zorunluAracDesteklerMi('claude-opus-5')).toBe(true)
  })
})
