import { describe, it, expect } from 'vitest'
import { mahkemeMetni } from '@/lib/konsrucu/dilekce-v2/cikti-temizle'

describe('Word çıktısı: kontrol işaretleri çıkar, yer tutucular kalır', () => {
  it('olgu işaretleri ve kaynak etiketleri silinir', () => {
    expect(mahkemeMetni('Musluk patlamıştır [O-9]. Tarih 07.08.2025 [O-11][O-13].')).toBe('Musluk patlamıştır. Tarih 07.08.2025.')
    expect(mahkemeMetni('Rapor düzenlendi. [Kaynak: KATİ EKSPERTİZ RAPORU-1.pdf]\nSonraki satır')).toBe('Rapor düzenlendi.\nSonraki satır')
  })
  it('yer tutucu ve olağan köşeli parantez korunur', () => {
    expect(mahkemeMetni('⟨davalı unvanı⟩ ve [1] numaralı ek')).toBe('⟨davalı unvanı⟩ ve [1] numaralı ek')
  })
})
