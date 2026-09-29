import { describe, expect, it } from 'vitest'
import { sorumluAlicilari, type CronTenant } from '@/lib/konsrucu/cron-ortak'

const t = (ek: Partial<CronTenant> = {}): CronTenant => ({
  musteriId: 'm1',
  musteriAd: 'Zurich',
  alicilar: ['yelda@x', 'melis@x', 'irem@x'],
  aliciAd: 'Ekip',
  test: false,
  uyeler: [
    { id: 'u-yelda', eposta: 'yelda@x', ad: 'Yelda', rol: 'ADMIN' },
    { id: 'u-melis', eposta: 'melis@x', ad: 'Melis', rol: 'AVUKAT_YRD' },
    { id: 'u-irem', eposta: 'irem@x', ad: 'İrem', rol: 'AVUKAT_YRD' },
  ],
  ...ek,
})

describe('sorumluAlicilari — hatırlatma yalnız işin sahibine', () => {
  it('ilk aktif aday üyeye gider', () => {
    expect(sorumluAlicilari(t(), 'u-melis', 'u-irem')).toEqual(['melis@x'])
    expect(sorumluAlicilari(t(), null, 'u-irem')).toEqual(['irem@x'])
  })
  it('aday yoksa ya da ayrılmış (üye değil) kişiyse avukata gider', () => {
    expect(sorumluAlicilari(t())).toEqual(['yelda@x'])
    expect(sorumluAlicilari(t(), 'u-ayrilan-sude')).toEqual(['yelda@x'])
  })
  it('avukat yoksa eski davranış: tüm ekip', () => {
    const tn = t({ uyeler: [{ id: 'u-melis', eposta: 'melis@x', ad: 'Melis', rol: 'AVUKAT_YRD' }], alicilar: ['melis@x'] })
    expect(sorumluAlicilari(tn)).toEqual(['melis@x'])
  })
  it('test çağrısında (?to=) yalnız test adresi', () => {
    expect(sorumluAlicilari(t({ test: true, alicilar: ['test@x'] }), 'u-melis')).toEqual(['test@x'])
  })
})
