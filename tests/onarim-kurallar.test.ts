import { describe, expect, it } from 'vitest'
import {
  kararGecisi, onarimDurumuHesapla, ornekTeyitliMi, partiAdi, partilereBol, partiSirasi, topluOnayDurumu, topluOnaylanabilirMi, ORNEK_TEYIT_ONEKI,
} from '@/lib/konsrucu/onarim/kurallar'
import { satirGosterimi } from '@/lib/konsrucu/onarim/gosterim'

describe('S13 · onay kuralı', () => {
  it('durum ve süre partilerinde (R0, R2, R3, R5) toplu onay hiç yok', () => {
    for (const kod of ['R0', 'R2', 'R3', 'R5', 'R7']) {
      expect(topluOnayDurumu(kod, 99).acik, kod).toBe(false)
    }
  })

  it('R1 (tutar): 5 örnek elle teyit edilmeden toplu onay kapalı, sonra açık', () => {
    expect(topluOnayDurumu('R1', 4)).toMatchObject({ acik: false })
    expect(topluOnayDurumu('R1', 4).sebep).toContain('4/5')
    expect(topluOnayDurumu('R1', 5).acik).toBe(true)
  })

  it('toplu onay yalnız kuru ve A sınıfı satırı kapsar', () => {
    expect(topluOnaylanabilirMi({ durum: 'KURU', guvenSinifi: 'A' })).toBe(true)
    expect(topluOnaylanabilirMi({ durum: 'KURU', guvenSinifi: 'B' })).toBe(false)
    expect(topluOnaylanabilirMi({ durum: 'ONAYLI', guvenSinifi: 'A' })).toBe(false)
  })

  it('örnek teyidi: tek tek onaylanmış, önekli not; geri alınan ya da reddedilen sayılmaz', () => {
    expect(ornekTeyitliMi({ durum: 'ONAYLI', not: `${ORNEK_TEYIT_ONEKI}: Hugo ve dekont` })).toBe(true)
    expect(ornekTeyitliMi({ durum: 'UYGULANDI', not: `${ORNEK_TEYIT_ONEKI}: Hugo ve dekont` })).toBe(true)
    expect(ornekTeyitliMi({ durum: 'GERI_ALINDI', not: `${ORNEK_TEYIT_ONEKI}: x` })).toBe(false)
    expect(ornekTeyitliMi({ durum: 'ONAYLI', not: 'TOPLU ONAY' })).toBe(false)
  })

  it('satır kararları: kuru → onaylı/reddedildi; uygulanmış satır kararla değişmez', () => {
    expect(kararGecisi('KURU', 'ONAYLA')).toEqual({ ok: true, yeni: 'ONAYLI' })
    expect(kararGecisi('KURU', 'REDDET')).toEqual({ ok: true, yeni: 'REDDEDILDI' })
    expect(kararGecisi('KURU', 'SONRA')).toEqual({ ok: true, yeni: 'KURU' })
    expect(kararGecisi('ONAYLI', 'KARARI_GERI_AL')).toEqual({ ok: true, yeni: 'KURU' })
    expect(kararGecisi('UYGULANDI', 'REDDET').ok).toBe(false)
    expect(kararGecisi('UYGULANDI', 'ONAYLA').ok).toBe(false)
    expect(kararGecisi('GERI_ALINDI', 'KARARI_GERI_AL').ok).toBe(false)
  })
})

describe('S13 · partiler ve onarım bandı', () => {
  it('partiler en çok 20 satır; sıra devam eder', () => {
    const p = partilereBol(Array.from({ length: 45 }, (_, i) => i), 'R1', 'TUTAR', 3)
    expect(p.map((x) => x.parti)).toEqual(['R1-TUTAR-03', 'R1-TUTAR-04', 'R1-TUTAR-05'])
    expect(p.map((x) => x.satirlar.length)).toEqual([20, 20, 5])
    expect(partiSirasi(partiAdi('R2', 'DURUM', 12), 'R2-DURUM')).toBe(12)
    expect(partiSirasi('R2-DURUMX-01', 'R2-DURUM')).toBeNull()
  })

  it('"Durum teyit gerekiyor" bandı: bekleyen/atlanan/geri alınan varsa BEKLIYOR, hepsi karara bağlanınca ONARILDI', () => {
    expect(onarimDurumuHesapla([])).toBeNull()
    expect(onarimDurumuHesapla(['KURU'])).toBe('BEKLIYOR')
    expect(onarimDurumuHesapla(['UYGULANDI', 'ATLANDI'])).toBe('BEKLIYOR')
    expect(onarimDurumuHesapla(['UYGULANDI', 'GERI_ALINDI'])).toBe('BEKLIYOR')
    expect(onarimDurumuHesapla(['UYGULANDI', 'REDDEDILDI'])).toBe('ONARILDI')
  })

  it('ekran metni: GUNCELLE şimdi/önerilen, EKLE (Sure) öneri günü', () => {
    expect(satirGosterimi({ islem: 'GUNCELLE', hedefTablo: 'RucuDosyasi', alan: 'icraEksen', eskiJson: { deger: null }, yeniJson: { deger: 'DURDU_ITIRAZ' } }))
      .toEqual({ alan: 'İcra ekseni', simdi: '—', onerilen: 'DURDU_ITIRAZ' })
    expect(satirGosterimi({ islem: 'EKLE', hedefTablo: 'Sure', alan: '*', eskiJson: {}, yeniJson: { tur: 'IIK67', onerilenIhtiyatli: '2027-03-12' } }))
      .toEqual({ alan: 'Yeni süre · İİK 67', simdi: '—', onerilen: 'ihtiyatlı 12.03.2027' })
  })
})
