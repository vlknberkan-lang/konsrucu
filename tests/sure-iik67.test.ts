import { describe, expect, it } from 'vitest'
import { sureOnerisiHesapla, yenidenOnayGerekirMi } from '@/lib/konsrucu/sure/hesap'
import { arabuluculukDurmalari } from '@/lib/konsrucu/sure/durma'
import { isoGun, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'

const g = (s: string) => isoGundenTarih(s) as Date
const gun = (d: Date | null) => (d ? isoGun(d) : null)

describe('S24 · İİK 67 önerisi (borçlu bazında, teyit gerekli)', () => {
  it('D1 deseni: tebliğ tarihi yok → ihtiyatlı alt sınır itiraz + 1 yıl, hesap izi yazılır, durmalı öneri yok', () => {
    const o = sureOnerisiHesapla({ tur: 'IIK67', itirazTarihi: g('2026-03-12') })
    expect(o.durum).toBe('ACIK')
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-03-12')
    expect(o.onerilenSonGun).toBeNull()
    expect(o.iz.join('\n')).toContain('tebliğ tarihi yok')
    expect(o.iz[0]).toContain('İİK 67/1 (teyit gerekli)')
    expect(o.eksik).toBeNull()
  })

  it('D2 deseni: itirazın alacaklıya tebliğinden 1 yıl; durma yoksa önerilen = ihtiyatlı', () => {
    const o = sureOnerisiHesapla({ tur: 'IIK67', tetikTarihi: g('2026-04-02'), tetikTuru: 'TEBLIG', itirazTarihi: g('2026-03-20') })
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-04-02')
    expect(gun(o.onerilenSonGun)).toBe('2027-04-02')
    expect(o.durmaGun).toBe(0)
  })

  it('UETS: ihtiyatlı ulaşma gününden, önerilen ulaşmayı izleyen 5. günden sayılır', () => {
    const o = sureOnerisiHesapla({ tur: 'IIK67', tetikTarihi: g('2026-04-02'), tetikTuru: 'UETS_ULASMA' })
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-04-02')
    expect(gun(o.onerilenSonGun)).toBe('2027-04-07')
    expect(o.iz.join('\n')).toContain('Tebligat K. 7/a')
  })

  it('arabuluculuk durması yalnız önerilen (durmalı) güne eklenir; ihtiyatlı gün değişmez', () => {
    const durmalar = arabuluculukDurmalari([{ id: 'arb-1', tur: 'DAVA_SARTI', basvuruTarihi: g('2026-06-01'), sonTutanakTarihi: g('2026-06-24') }])
    const o = sureOnerisiHesapla({ tur: 'IIK67', tetikTarihi: g('2026-01-10'), tetikTuru: 'TEBLIG', durmalar })
    expect(o.durmaGun).toBe(23)
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-01-10')
    expect(gun(o.onerilenSonGun)).toBe('2027-02-02')
    expect(o.durmalar[0]).toMatchObject({ sayildi: true, gun: 23, kaynakId: 'arb-1' })
    expect(o.iz.join('\n')).toContain('HUAK 18/A-15')
  })

  it('süre dolduktan sonra yapılan başvuru durma sayılmaz ve uyarı verir', () => {
    const durmalar = [{ bas: g('2026-02-01'), bit: g('2026-02-20'), sebep: 'Arabuluculuk' }]
    const o = sureOnerisiHesapla({ tur: 'IIK67', tetikTarihi: g('2025-01-10'), tetikTuru: 'TEBLIG', durmalar })
    expect(o.durmaGun).toBe(0)
    expect(gun(o.onerilenSonGun)).toBe('2026-01-10')
    expect(o.uyarilar.join(' ')).toContain('Geç başvuru')
  })

  it('son tutanak yoksa durmalı öneri bekler; hatırlatma ihtiyatlı güne göre gider', () => {
    const durmalar = [{ bas: g('2026-06-01'), bit: null, sebep: 'Arabuluculuk' }]
    const o = sureOnerisiHesapla({ tur: 'IIK67', tetikTarihi: g('2026-01-10'), tetikTuru: 'TEBLIG', durmalar })
    expect(o.onerilenSonGun).toBeNull()
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-01-10')
    expect(o.uyarilar.join(' ')).toContain('Durma sürüyor')
  })

  it('tebliğ yokken durma varsa durmalı öneri de itiraz tarihinden (alt sınır) hesaplanır', () => {
    const durmalar = [{ bas: g('2026-05-01'), bit: g('2026-05-21'), sebep: 'Arabuluculuk' }]
    const o = sureOnerisiHesapla({ tur: 'IIK67', itirazTarihi: g('2026-03-12'), durmalar })
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-03-12')
    expect(gun(o.onerilenSonGun)).toBe('2027-04-01')
    expect(o.iz.join('\n')).toContain('itiraz tarihinden hesaplandı')
  })

  it('hak düşürücü sürede adli tatil uzatması uygulanmaz, yalnız not düşer', () => {
    const o = sureOnerisiHesapla({ tur: 'IIK67', tetikTarihi: g('2026-07-25'), tetikTuru: 'TEBLIG' })
    expect(gun(o.onerilenIhtiyatli)).toBe('2027-07-25')
    expect(o.uyarilar.join(' ')).toContain('hak düşürücü')
  })

  it('ne tebliğ ne itiraz tarihi varsa tetik bekler ve tek eksik sorulur', () => {
    const o = sureOnerisiHesapla({ tur: 'IIK67' })
    expect(o.durum).toBe('TETIK_BEKLIYOR')
    expect(o.onerilenIhtiyatli).toBeNull()
    expect(o.eksik).toContain('İtirazın alacaklıya tebliği')
  })

  it('önerilen gün değişince onaylanan gün yeniden onaya düşer', () => {
    const eski = { onaylananSonGun: g('2027-03-12'), onerilenSonGun: null, onerilenIhtiyatli: g('2027-03-12') }
    expect(yenidenOnayGerekirMi(eski, { onerilenSonGun: null, onerilenIhtiyatli: g('2027-03-12') })).toBe(false)
    expect(yenidenOnayGerekirMi(eski, { onerilenSonGun: g('2027-04-01'), onerilenIhtiyatli: g('2027-03-12') })).toBe(true)
    expect(yenidenOnayGerekirMi({ ...eski, onaylananSonGun: null }, { onerilenSonGun: g('2027-04-01'), onerilenIhtiyatli: g('2027-03-12') })).toBe(false)
  })
})
