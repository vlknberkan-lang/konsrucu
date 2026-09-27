/**
 * S27 · İİK 67 kanıtla kapanış (DA-06a/b; kabul testi 5) ve ihtiyati haciz (Excel #27 ayrıştırma, doğrulama).
 */
import { describe, expect, it } from 'vitest'
import { iik67KapanisKontrol, kapanisNotu } from '@/lib/konsrucu/dava/iik67-kapanis'
import { ihtiyatiHacizDogrula, ihtiyatiHacizExcelCoz, ihtiyatiHacizSureNotu } from '@/lib/konsrucu/dava/ihtiyati-haciz'

const d = (s: string) => new Date(s)

describe('iik67KapanisKontrol', () => {
  it('açılış ≤ onaylanan → kapanmaya hazır (DA-06a); eşit gün de hazır', () => {
    expect(iik67KapanisKontrol({ acilisTarihi: d('2026-08-07'), onaylananSonGun: d('2027-06-23'), onerilenIhtiyatli: d('2027-06-23'), sureDurumu: 'ACIK' }).durum).toBe('KAPANMAYA_HAZIR')
    expect(iik67KapanisKontrol({ acilisTarihi: d('2027-06-23'), onaylananSonGun: d('2027-06-23'), onerilenIhtiyatli: null, sureDurumu: 'ACIK' }).durum).toBe('KAPANMAYA_HAZIR')
  })
  it('açılış > onaylanan → DA-06b kırmızı; "süre kaçtı" hükmü yok, genel alacak notu teyit gerekli', () => {
    const k = iik67KapanisKontrol({ acilisTarihi: d('2027-06-24'), onaylananSonGun: d('2027-06-23'), onerilenIhtiyatli: null, sureDurumu: 'ACIK' })
    expect(k.durum).toBe('SONRA')
    if (k.durum === 'SONRA') {
      expect(k.kod).toBe('DA-06b')
      expect(k.not).toMatch(/teyit gerekli/)
      expect(k.mesaj).not.toMatch(/kaçtı/)
    }
  })
  it('esas no tek başına kapatmaz: açılış yoksa ACILIS_YOK', () => {
    expect(iik67KapanisKontrol({ acilisTarihi: null, onaylananSonGun: d('2027-06-23'), onerilenIhtiyatli: null, sureDurumu: 'ACIK' }).durum).toBe('ACILIS_YOK')
  })
  it('onaylanan gün yoksa önce onay istenir (ihtiyatlıya göre bilgi)', () => {
    const k = iik67KapanisKontrol({ acilisTarihi: d('2026-08-07'), onaylananSonGun: null, onerilenIhtiyatli: d('2027-06-23'), sureDurumu: 'ACIK' })
    expect(k.durum).toBe('ONAYLANAN_YOK')
    if (k.durum === 'ONAYLANAN_YOK') expect(k.ihtiyatliKarsilastirma).toBe('ONCE')
  })
  it('kapalı kayıt yeniden kapatılmaz; not kanıtı yazar', () => {
    expect(iik67KapanisKontrol({ acilisTarihi: d('2026-08-07'), onaylananSonGun: d('2027-06-23'), onerilenIhtiyatli: null, sureDurumu: 'KAPANDI' }).durum).toBe('KAPALI')
    expect(kapanisNotu(d('2026-08-07'), '2026/384')).toMatch(/07\.08\.2026.*2026\/384/)
  })
})

describe('ihtiyatiHacizExcelCoz (#27)', () => {
  it.each([
    ['RET', 'RED'],
    ['KABUL', 'KABUL'],
    ['Kısmen kabul', 'KISMEN'],
    ['talep edildi, bekleniyor', 'BEKLIYOR'],
  ])('%s → %s', (ham, sonuc) => {
    const r = ihtiyatiHacizExcelCoz(ham)
    expect(r.kayitGerekli).toBe(true)
    expect(r.sonuc).toBe(sonuc)
    expect(r.excelHam).toBe(ham)
  })
  it('boş ya da "talep edilmedi" kayıt açmaz', () => {
    expect(ihtiyatiHacizExcelCoz('').kayitGerekli).toBe(false)
    expect(ihtiyatiHacizExcelCoz(null).kayitGerekli).toBe(false)
    expect(ihtiyatiHacizExcelCoz('Talep edilmedi').kayitGerekli).toBe(false)
  })
  it('tarih ve teminat oranı metinden alınır; tutar hesaplanmaz', () => {
    const r = ihtiyatiHacizExcelCoz('Kabul 12.03.2026 %15 teminat')
    expect(r).toMatchObject({ sonuc: 'KABUL', kararTarihi: '2026-03-12', teminatOrani: '%15' })
  })
  it('tanınmayan metin: yalnız excelHam + ayrıştırılamadı', () => {
    const r = ihtiyatiHacizExcelCoz('müvekkil talimatı bekleniyor mu?? belirsiz')
    expect(r.kayitGerekli).toBe(true)
    expect(r.excelHam).toMatch(/belirsiz/)
  })
  it('tamamen serbest metin → ayrıştırılamadı', () => {
    const r = ihtiyatiHacizExcelCoz('dosyaya bakılacak')
    expect(r.sonuc).toBeNull()
    expect(r.ayristirilamadi).toBe(true)
  })
})

describe('ihtiyatiHacizDogrula', () => {
  const simdi = d('2026-09-27T09:00:00Z')
  it('tarih sırası ve ileri tarih', () => {
    expect(ihtiyatiHacizDogrula({ talepTarihi: d('2026-08-10'), kararTarihi: d('2026-08-01'), sonuc: 'KABUL' }, simdi)[0]).toMatch(/talep tarihinden önce/)
    expect(ihtiyatiHacizDogrula({ kararTarihi: d('2026-10-01'), sonuc: 'KABUL' }, simdi)[0]).toMatch(/ileri/)
    expect(ihtiyatiHacizDogrula({ kararTarihi: d('2026-08-01'), sonuc: 'BEKLIYOR' }, simdi)[0]).toMatch(/sonucu da seçin/)
    expect(ihtiyatiHacizDogrula({ talepTarihi: d('2026-08-01'), kararTarihi: d('2026-08-10'), kararTebligTarihi: d('2026-08-12'), sonuc: 'KABUL' }, simdi)).toEqual([])
  })
  it('süre notu yalnız kabulde ve teyit gerekli', () => {
    expect(ihtiyatiHacizSureNotu({ sonuc: 'RED', kararTarihi: null, kararTebligTarihi: null, infazTalepTarihi: null })).toBeNull()
    expect(ihtiyatiHacizSureNotu({ sonuc: 'KABUL', kararTarihi: d('2026-08-10'), kararTebligTarihi: null, infazTalepTarihi: null })).toMatch(/İİK 261.*264.*teyit gerekli/)
  })
})
