import { describe, expect, it } from 'vitest'
import { sureOnerisiHesapla } from '@/lib/konsrucu/sure/hesap'
import { isoGun, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'
import { SURE_TURLERI, SURE_TUR_KODLARI } from '@/lib/konsrucu/sure/turler'

const g = (s: string) => isoGundenTarih(s) as Date
const gun = (d: Date | null) => (d ? isoGun(d) : null)

describe('S24 · İİK 62 (UETS + 5 gün)', () => {
  it('UETS ulaşmasında tebliğ 5. günün sonu; önerilen = tebliğ + 7, ihtiyatlı = ulaşma + 7', () => {
    const o = sureOnerisiHesapla({ tur: 'IIK62', tetikTarihi: g('2026-03-02'), tetikTuru: 'UETS_ULASMA' })
    expect(gun(o.baslangic)).toBe('2026-03-07')
    expect(gun(o.onerilenSonGun)).toBe('2026-03-14')
    expect(gun(o.onerilenIhtiyatli)).toBe('2026-03-09')
  })

  it('tebliğ ve UETS ulaşma tarihi ayrı tutulur; aradaki fark 5 değilse uyarı çıkar', () => {
    const o = sureOnerisiHesapla({ tur: 'IIK62', tetikTarihi: g('2026-03-04'), tetikTuru: 'TEBLIG', uetsUlasmaTarihi: g('2026-03-02') })
    expect(gun(o.onerilenSonGun)).toBe('2026-03-11')
    expect(o.uyarilar.join(' ')).toContain('UETS ulaşma')
  })
})

describe('S24 · İYUK (idari yol) — teyit gerekli önerileri', () => {
  it('İYUK 13: öğrenme + 1 yıl ile eylem + 5 yıldan erken olan', () => {
    const o = sureOnerisiHesapla({ tur: 'IYUK13_BASVURU', tetikTarihi: g('2026-05-10'), tetikTuru: 'ELLE', eylemTarihi: g('2022-01-15') })
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-01-15') // eylem + 5 yıl, öğrenme + 1 yıldan (2027-05-10) önce
    expect(o.iz.join('\n')).toContain('İYUK 13/1 (teyit gerekli)')
  })

  it('İYUK 13: öğrenme tarihi yoksa ihtiyatlı öneri eylem + 1 yıl', () => {
    const o = sureOnerisiHesapla({ tur: 'IYUK13_BASVURU', eylemTarihi: g('2026-02-01') })
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-02-01')
    expect(o.onerilenSonGun).toBeNull()
  })

  it('zımni ret başvurudan 30 gün; idari dava süresi 60 gün', () => {
    expect(gun(sureOnerisiHesapla({ tur: 'IYUK_ZIMNI_RET', tetikTarihi: g('2026-09-01'), tetikTuru: 'ELLE' }).onerilenIhtiyatli)).toBe('2026-10-01')
    expect(gun(sureOnerisiHesapla({ tur: 'IYUK7_DAVA', tetikTarihi: g('2026-10-01'), tetikTuru: 'TEBLIG' }).onerilenIhtiyatli)).toBe('2026-11-30')
  })

  it('idari tarih hiç yoksa tetik bekler', () => {
    const o = sureOnerisiHesapla({ tur: 'IYUK13_BASVURU' })
    expect(o.durum).toBe('TETIK_BEKLIYOR')
    expect(o.eksik).toBeTruthy()
  })
})

describe('S24 · HMK süreleri ve mahkemenin verdiği süreler', () => {
  it('HMK 136: usul seçilmeden öneri yok; basit usulde uygulanmaz; yazılıda 2 hafta', () => {
    expect(sureOnerisiHesapla({ tur: 'HMK136', tetikTarihi: g('2026-10-05'), tetikTuru: 'TEBLIG' }).eksik).toContain('usul')
    const basit = sureOnerisiHesapla({ tur: 'HMK136', tetikTarihi: g('2026-10-05'), tetikTuru: 'TEBLIG', usul: 'BASIT' })
    expect(basit.onerilenIhtiyatli).toBeNull()
    expect(basit.uyarilar.join(' ')).toContain('Basit yargılama')
    expect(gun(sureOnerisiHesapla({ tur: 'HMK136', tetikTarihi: g('2026-10-05'), tetikTuru: 'TEBLIG', usul: 'YAZILI' }).onerilenIhtiyatli)).toBe('2026-10-19')
  })

  it('HMK 150: işlemden kaldırmadan 3 ay; HMK 345 ve 361: 2 hafta; HMK 20: 2 hafta', () => {
    expect(gun(sureOnerisiHesapla({ tur: 'HMK150', tetikTarihi: g('2026-11-30'), tetikTuru: 'TEFHIM' }).onerilenIhtiyatli)).toBe('2027-02-28')
    expect(gun(sureOnerisiHesapla({ tur: 'HMK345', tetikTarihi: g('2026-10-01'), tetikTuru: 'TEBLIG' }).onerilenIhtiyatli)).toBe('2026-10-15')
    expect(gun(sureOnerisiHesapla({ tur: 'HMK361', tetikTarihi: g('2026-10-01'), tetikTuru: 'TEBLIG' }).onerilenIhtiyatli)).toBe('2026-10-15')
    expect(gun(sureOnerisiHesapla({ tur: 'HMK20', tetikTarihi: g('2026-10-01'), tetikTuru: 'KARAR' }).onerilenIhtiyatli)).toBe('2026-10-15')
  })

  it('gider avansı ve ara karar: mahkemenin verdiği gün girilmeden hesap yok', () => {
    expect(sureOnerisiHesapla({ tur: 'AVANS', tetikTarihi: g('2026-10-01'), tetikTuru: 'TEBLIG' }).eksik).toContain('Mahkemenin verdiği')
    expect(gun(sureOnerisiHesapla({ tur: 'AVANS', tetikTarihi: g('2026-10-01'), tetikTuru: 'TEBLIG', hakimSuresiGun: 14 }).onerilenIhtiyatli)).toBe('2026-10-15')
    expect(gun(sureOnerisiHesapla({ tur: 'ARA_KARAR', tetikTarihi: g('2026-10-01'), tetikTuru: 'TEFHIM', hakimSuresiGun: 7 }).onerilenIhtiyatli)).toBe('2026-10-08')
  })

  it('dava süresinin son günü adli tatilde ya da hafta sonunda ise süre uzatılmaz, uyarı çıkar', () => {
    const o = sureOnerisiHesapla({ tur: 'HMK281', tetikTarihi: g('2027-07-18'), tetikTuru: 'TEBLIG' }) // son gün 2027-08-01 Pazar
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-08-01')
    const u = o.uyarilar.join(' ')
    expect(u).toContain('HMK 104')
    expect(u).toContain('Pazar')
  })

  it('katalogdaki her tür "teyit gerekli" dayanakla hesap izine girer', () => {
    for (const k of SURE_TUR_KODLARI) {
      const o = sureOnerisiHesapla({ tur: k, tetikTarihi: g('2026-01-05'), tetikTuru: 'TEBLIG', hakimSuresiGun: 10, usul: 'YAZILI', eylemTarihi: g('2026-01-01') })
      expect(o.iz[0], k).toContain(`${SURE_TURLERI[k].dayanak} (teyit gerekli)`)
    }
  })
})
