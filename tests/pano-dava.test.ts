/**
 * S30 · Pano'daki Dava Panosu özeti — lib/konsrucu/rapor-mail.ts
 * Satır ve "durum güveni" lib/konsrucu/dava/pano.ts'ten gelir (Davalar tablosuyla tek kaynak); burada girdinin
 * kurulması (silinen/reddedilen kayıt girmez, dava açılmamış İİK 67 satırı) ve özet kartlarının sayıları sınanır.
 * Bütün veriler kurgusaldır.
 */
import { describe, it, expect } from 'vitest'
import {
  davaPanoGirdileri, davaPanoOzeti, davaPanoEnAcil, DAVA_GUVEN_ETIKET, DAVA_PANO_KARTLARI,
  type DavaPanoKaydi, type DavasizSureKaydi,
} from '@/lib/konsrucu/rapor-mail'
import { panoSatiri, type PanoSatiri } from '@/lib/konsrucu/dava/pano'

const BUGUN = new Date('2026-09-27T09:00:00Z')
const gun = (n: number) => new Date(BUGUN.getTime() + n * 86_400_000)

function kayit(ek: Partial<DavaPanoKaydi> = {}): DavaPanoKaydi {
  return {
    id: 'd1', dosyaId: 'f1', hukukDosyaNo: 'HK-2026-0001',
    mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'İstanbul', mahkemeNo: '5', esasYil: 2026, esasSira: 123,
    evre: 'ON_INCELEME', durum: 'DERDEST', rolumuz: 'DAVACI', sonrakiDurusma: gun(10), onIncelemeTarihi: null,
    uyapDosyaId: 'u-1', asamaDetayJson: null, updatedAt: gun(-2), islemler: [], sureler: [], ...ek,
  }
}
const davasiz = (ek: Partial<DavasizSureKaydi> = {}): DavasizSureKaydi => ({
  dosyaId: 'f9', hukukDosyaNo: 'HK-2026-0009', dosyaUpdatedAt: gun(-1), tur: 'IIK67', onaylananSonGun: null, onerilenIhtiyatli: gun(6), durum: 'ACIK', ...ek,
})

describe('davaPanoGirdileri — veritabanı satırlarından pano girdisi', () => {
  it('silinen dava, silinen ya da reddedilen işlem ve silinen süre girmez', () => {
    const g = davaPanoGirdileri([
      kayit({
        islemler: [
          { tur: 'TENSIP', tarih: gun(-20), createdAt: gun(-20), teyit: 'TEYITLI' },
          { tur: 'CEVAP', tarih: gun(-5), createdAt: gun(-5), teyit: 'REDDEDILDI' },
          { tur: 'ARA_KARAR', tarih: gun(-3), createdAt: gun(-3), teyit: 'ADAY', silindiAt: gun(-1) },
        ],
        sureler: [
          { tur: 'HMK127', onaylananSonGun: gun(4), onerilenIhtiyatli: null, durum: 'ACIK' },
          { tur: 'HMK136', onaylananSonGun: gun(1), onerilenIhtiyatli: null, durum: 'ACIK', silindiAt: gun(-1) },
        ],
      }),
      kayit({ id: 'd2', dosyaId: 'f2', silindiAt: gun(-1) }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].islemler.map((i) => i.tur)).toEqual(['TENSIP'])
    expect(g[0].sureler.map((s) => s.tur)).toEqual(['HMK127'])
    expect(g[0]).not.toHaveProperty('silindiAt')
  })
  it('davası olmayan dosyanın açık İİK 67 süresi "(dava açılmadı)" satırı olur; davası olanınki ve kapanan süre olmaz', () => {
    const g = davaPanoGirdileri([kayit()], [
      davasiz(),
      davasiz({ tur: 'IIK62' }),
      davasiz({ dosyaId: 'f1', hukukDosyaNo: 'HK-2026-0001' }),
      davasiz({ dosyaId: 'f8', durum: 'KAPANDI' }),
      davasiz({ dosyaId: 'f7', silindiAt: gun(-1) }),
    ])
    expect(g.map((x) => x.davaId ?? `davasiz:${x.dosyaId}`)).toEqual(['d1', 'davasiz:f9'])
    const satir = panoSatiri(g[1], BUGUN)
    expect(satir.davaAcilmadi).toBe(true)
    expect(satir.dosya).toBe('HK-2026-0009')
  })
})

describe('davaPanoOzeti — kart sayıları süzgeçlerle aynı kaynaktan', () => {
  const satir = (ek: Partial<PanoSatiri>): PanoSatiri => ({
    anahtar: 'x', davaId: 'x', dosyaId: 'f', dosya: 'HK', mahkemeEsas: '', evre: '', evreTuretildi: false,
    sonraki: null, sonrakiEtiket: '—', sureKalanGun: null, sureEtiket: '—', sureOnaysiz: false,
    sonGelisme: null, sonGelismeEtiket: '—', guven: 'TEYITLI', karsiTaraf: false, davaAcilmadi: false, sessizGun: 3, ...ek,
  })
  const satirlar = [
    satir({ anahtar: 'a' }),
    satir({ anahtar: 'b', guven: 'TEYITSIZ', sureKalanGun: 12, sureOnaysiz: true }),
    satir({ anahtar: 'c', karsiTaraf: true, sonraki: gun(3) }),
    satir({ anahtar: 'd', guven: 'ESKIMIS', sessizGun: 75 }),
    satir({ anahtar: 'e', davaId: null, davaAcilmadi: true, sureKalanGun: 6 }),
    satir({ anahtar: 'f', sureKalanGun: 45, sonraki: gun(20) }),
  ]
  it('sayılar', () => {
    expect(davaPanoOzeti(satirlar, BUGUN)).toEqual({
      toplam: 6, dava: 5, davaAcilmadi: 1, teyitsiz: 1, eskimis: 1, sure30: 2, sureOnaysiz: 1, sessiz60: 1, karsi: 1, durusma7: 1,
    })
  })
  it('en acil davalar Davalar tablosunun sırasıyla ve sınırlı', () => {
    expect(davaPanoEnAcil(satirlar, 3).map((s) => s.anahtar)).toEqual(['e', 'b', 'f'])
  })
})

describe('etiketler', () => {
  it('durum güveni beş durum rolünden ve yazıyla', () => {
    expect(DAVA_GUVEN_ETIKET).toEqual({
      TEYITLI: { etiket: 'TEYİTLİ', ton: 'success' },
      TEYITSIZ: { etiket: 'TEYİTSİZ', ton: 'info' },
      ESKIMIS: { etiket: 'GÜNCEL DEĞİL', ton: 'steel' },
    })
  })
  it('özet kartları Davalar tablosunun dört süzgecine gider', () => {
    expect(DAVA_PANO_KARTLARI.map((k) => k.id)).toEqual(['teyitsiz', 'sure30', 'sessiz60', 'karsi'])
  })
})
