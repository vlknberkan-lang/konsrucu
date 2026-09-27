/**
 * S26 · durma: geç başvuruda durma sayılmaz; dava şartı / ihtiyari dayanağı farklı ("teyit gerekli");
 * İİK 67 ihtiyatlı öneri DEĞİŞMEZ, durmalı öneri kayar, onaylanan gün yeniden onaya düşer (AR-07).
 */
import { describe, expect, it } from 'vitest'
import { durmaDayanagi, durmaHesapla, sureyeDurmaIsle, yenidenOnayBekliyorMu, yenidenOnayIziKapat } from '@/lib/konsrucu/arabuluculuk/durma'

const d = (s: string) => new Date(s)

describe('durmaHesapla', () => {
  it('süresinde başvuru: gün = son tutanak − başvuru, sayılır', () => {
    const r = durmaHesapla({ basvuruTarihi: d('2026-07-01'), sonTutanakTarihi: d('2026-07-24'), tur: 'DAVA_SARTI', ihtiyatliSonGun: d('2027-06-23') })
    expect(r.gun).toBe(23)
    expect(r.sayildi).toBe(true)
    expect(r.dayanak).toMatch(/HUAK 18\/A-15.*teyit gerekli/)
    expect(r.aralik).toMatchObject({ bas: '2026-07-01', bit: '2026-07-24', sayildi: true, sebep: 'ARABULUCULUK' })
  })
  it('geç başvuru (ihtiyatlı son günden sonra): durma sayılmaz, uyarı', () => {
    const r = durmaHesapla({ basvuruTarihi: d('2027-07-01'), sonTutanakTarihi: d('2027-07-20'), tur: 'DAVA_SARTI', ihtiyatliSonGun: d('2027-06-23') })
    expect(r.sayildi).toBe(false)
    expect(r.uyarilar.join(' ')).toMatch(/Geç başvuru/)
  })
  it('ihtiyari arabuluculukta dayanak farklı ve teyit gerekli', () => {
    const r = durmaHesapla({ basvuruTarihi: d('2026-07-01'), sonTutanakTarihi: d('2026-07-10'), tur: 'IHTIYARI', ihtiyatliSonGun: d('2027-06-23') })
    expect(r.dayanak).toMatch(/HUAK 16/)
    expect(r.dayanak).toMatch(/teyit gerekli/)
    expect(r.sayildi).toBe(true)
  })
  it('tür seçilmedi/belirsiz: dayanak belirsiz uyarısı', () => {
    expect(durmaDayanagi(null)).toMatch(/seçilmedi/)
    const r = durmaHesapla({ basvuruTarihi: d('2026-07-01'), sonTutanakTarihi: d('2026-07-10'), tur: 'BELIRSIZ', ihtiyatliSonGun: d('2027-06-23') })
    expect(r.uyarilar.join(' ')).toMatch(/belirsiz/)
  })
  it('ihtiyatlı son gün yoksa durma sayılmaz', () => {
    expect(durmaHesapla({ basvuruTarihi: d('2026-07-01'), sonTutanakTarihi: d('2026-07-10'), tur: 'DAVA_SARTI', ihtiyatliSonGun: null }).sayildi).toBe(false)
  })
})

describe('sureyeDurmaIsle', () => {
  const sure = {
    onerilenIhtiyatli: d('2027-06-23'),
    onerilenSonGun: d('2027-06-23'),
    onaylananSonGun: d('2027-06-23'),
    onaylayanId: 'avukat-1',
    onayAt: d('2026-07-01'),
    durmaJson: null,
    hesapIziJson: { kural: 'IIK67@1' },
  }
  const durma = durmaHesapla({ basvuruTarihi: d('2026-07-01'), sonTutanakTarihi: d('2026-07-24'), tur: 'DAVA_SARTI', ihtiyatliSonGun: sure.onerilenIhtiyatli, arabuluculukId: 'arb-1' })

  it('ihtiyatlı DEĞİŞMEZ (güncellemede alan yok), durmalı öneri kayar, onaylanan yeniden onaya düşer', () => {
    const u = sureyeDurmaIsle(sure, durma, d('2026-07-25'))
    expect('onerilenIhtiyatli' in u).toBe(false)
    expect(u.onerilenSonGun?.toISOString().slice(0, 10)).toBe('2027-07-16') // 23.06.2027 + 23 gün
    expect(u.onaylananSonGun).toBeNull()
    expect(u.onaylayanId).toBeNull()
    expect(u.hesapIziJson.yenidenOnayBekliyor).toBe(true)
    expect(u.hesapIziJson.oncekiOnaylanan).toBe('2027-06-23')
    expect(u.hesapIziJson.kural).toBe('IIK67@1') // mevcut iz korunur
    expect(String(u.hesapIziJson.durmaSayimYontemi)).toMatch(/teyit gerekli/)
    expect(yenidenOnayBekliyorMu({ onaylananSonGun: u.onaylananSonGun, hesapIziJson: u.hesapIziJson })).toBe(true)
  })
  it('aynı arabuluculuk yeniden onaylanırsa durma iki kez sayılmaz', () => {
    const bir = sureyeDurmaIsle(sure, durma)
    const iki = sureyeDurmaIsle({ ...sure, durmaJson: bir.durmaJson, onerilenSonGun: bir.onerilenSonGun, onaylananSonGun: null, hesapIziJson: bir.hesapIziJson }, durma)
    expect(iki.durmaJson).toHaveLength(1)
    expect(iki.onerilenSonGun?.toISOString().slice(0, 10)).toBe('2027-07-16')
    expect(iki.hesapIziJson.oncekiOnaylanan).toBe('2027-06-23') // ilk onaylanan kaybolmaz
  })
  it('sayılmayan durma önerilen günü kaydırmaz', () => {
    const gec = durmaHesapla({ basvuruTarihi: d('2027-07-01'), sonTutanakTarihi: d('2027-07-20'), tur: 'DAVA_SARTI', ihtiyatliSonGun: sure.onerilenIhtiyatli, arabuluculukId: 'arb-2' })
    const u = sureyeDurmaIsle(sure, gec)
    expect(u.onerilenSonGun?.toISOString().slice(0, 10)).toBe('2027-06-23')
  })
  it('yeniden onay izi kapanınca AR-07 koşulu düşer', () => {
    const u = sureyeDurmaIsle(sure, durma)
    const iz = yenidenOnayIziKapat(u.hesapIziJson, 'avukat-2')
    expect(yenidenOnayBekliyorMu({ onaylananSonGun: d('2027-07-16'), hesapIziJson: iz })).toBe(false)
    expect(iz.yenidenOnaylayanId).toBe('avukat-2')
  })
})
