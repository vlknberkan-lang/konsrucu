/**
 * Adlî Rehber (HSK, 13.05.2026): ilçe → bağlı adliye; eski ilçe adları; il dışı bağlılık; UYAP'taki parantezsiz ad.
 */
import { describe, expect, it } from 'vitest'
import { adliyeBul, yetkiliIcraOner } from '@/lib/konsrucu/adli-rehber'

describe('adli rehber 2026', () => {
  it('kendi adliyesi olmayan ilçe bağlı adliyeye gider', () => {
    const r = yetkiliIcraOner('Seyhan/Adana', 'Adana')
    expect(r?.icraDairesi).toBe('Adana İcra Dairesi')
    expect(r?.kendiAdliyesiVar).toBe(false)
  })

  it('yenilenen bağlılıklar: Eyüpsultan → Gaziosmanpaşa, Seydikemer artık kendi adliyesi', () => {
    expect(adliyeBul('Eyüpsultan', 'İstanbul')?.icraDairesi).toBe('Gaziosmanpaşa İcra Dairesi')
    const s = adliyeBul('Seydikemer', 'Muğla')
    expect(s?.icraDairesi).toBe('Seydikemer İcra Dairesi')
    expect(s?.kendiAdliyesiVar).toBe(true)
  })

  it('eski ilçe adı yeni adına çözülür; il tutmuyorsa uygulanmaz', () => {
    expect(yetkiliIcraOner('EYÜP/İSTANBUL', 'İstanbul')?.adliye).toBe('Gaziosmanpaşa')
    expect(adliyeBul('19 Mayıs', 'Samsun')?.adliye).toBe('Bafra')
    expect(adliyeBul('Aydınlar')?.ilce).toBe('Tillo')
    expect(adliyeBul('Akköy', 'Aydın')).toBeNull()
  })

  it('başka ildeki adliyeye bağlı ilçe: adliyenin ili ayrıca gelir (UYAP il kodu buna göre)', () => {
    const r = adliyeBul('Sarıyahşi', 'Aksaray')
    expect(r?.adliye).toBe('Şereflikoçhisar')
    expect(r?.il).toBe('Aksaray')
    expect(r?.adliyeIl).toBe('Ankara')
  })

  it('aynı adlı adliyeler: rehber adı ayrışır, resmî ad parantezsiz', () => {
    const r = adliyeBul('Gölbaşı', 'Ankara')
    expect(r?.adliye).toBe('Gölbaşı (Ankara)')
    expect(r?.adliyeAdi).toBe('Gölbaşı')
    expect(r?.icraDairesi).toBe('Gölbaşı İcra Dairesi')
    expect(adliyeBul('Gölbaşı', 'Adıyaman')?.adliye).toBe('Gölbaşı (Adıyaman)')
  })
})
