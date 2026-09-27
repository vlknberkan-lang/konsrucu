/**
 * S26 · "5 Arabuluculuk" kuralları AR-01 … AR-09 (06 §8.3), tablo güdümlü; kurgusal durumlar.
 * Ayrıca "Telefon hazır" özeti ve yapay zekâsız müvekkil yazısı taslakları.
 */
import { describe, expect, it } from 'vitest'
import { arabuluculukKurallari, type ArabuluculukGercekleri } from '@/lib/konsrucu/arabuluculuk/kurallar'
import { telefonHazirOzeti } from '@/lib/konsrucu/arabuluculuk/telefon-hazir'
import { arabuluculukSonucBildirimi, istisnaBildirimTaslagi, onayTalebiTaslagi } from '@/lib/konsrucu/arabuluculuk/bildirim-taslak'

const SIMDI = new Date('2026-09-27T09:00:00Z')
const taban: ArabuluculukGercekleri = {
  itirazOnayli: true, yolSecimi: null, onaylar: [], arabuluculuk: null, toplantilar: [],
  iik67YenidenOnayBekleyen: 0, karsiTarafUyumsuz: false, davaVar: false, ihtiyatliSonGun: new Date('2027-06-23'),
}
const kodlar = (g: Partial<ArabuluculukGercekleri>) => arabuluculukKurallari({ ...taban, ...g }, SIMDI).map((k) => k.kod)
const arab = (p: Partial<NonNullable<ArabuluculukGercekleri['arabuluculuk']>> = {}) => ({ tur: null, basvuruTarihi: null, sonTutanakTarihi: null, sonTutanakBelgeId: null, sonuc: null, onayAt: null, ...p })

describe('arabuluculukKurallari', () => {
  it.each([
    ['AR-01 itiraz onaylı, yol yok', {}, 'AR-01'],
    ['AR-02 yol seçildi, müvekkil onayı yok', { yolSecimi: { secim: 'ARABULUCULUK_IIK67' } }, 'AR-02'],
    ['AR-03 tür seçilmedi', { yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, arabuluculuk: arab() }, 'AR-03'],
    ['AR-04 tür seçildi, başvuru yok', { yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, arabuluculuk: arab({ tur: 'DAVA_SARTI' }) }, 'AR-04'],
    ['AR-05 geçmiş toplantı sonuçsuz', { arabuluculuk: arab({ tur: 'DAVA_SARTI' }), toplantilar: [{ baslar: new Date('2026-09-01'), durum: 'PLANLANDI' }] }, 'AR-05'],
    ['AR-06 süreç bitti, tutanak yok', { arabuluculuk: arab({ tur: 'DAVA_SARTI' }), davaVar: true }, 'AR-06'],
    ['AR-07 yeniden onay bekliyor', { arabuluculuk: arab({ tur: 'DAVA_SARTI', onayAt: new Date('2026-09-01'), sonuc: 'ANLASAMAMA', sonTutanakTarihi: new Date('2026-09-01'), sonTutanakBelgeId: 'b1' }), iik67YenidenOnayBekleyen: 1 }, 'AR-07'],
    ['AR-08 anlaşma', { arabuluculuk: arab({ tur: 'DAVA_SARTI', onayAt: new Date('2026-09-01'), sonuc: 'ANLASMA', sonTutanakTarihi: new Date('2026-09-01'), sonTutanakBelgeId: 'b1' }) }, 'AR-08'],
    ['AR-09 karşı taraf uyumsuz', { karsiTarafUyumsuz: true }, 'AR-09'],
  ] as [string, Partial<ArabuluculukGercekleri>, string][])('%s', (_ad, g, kod) => {
    expect(kodlar(g)).toContain(kod)
  })

  it('müvekkil onayı varsa AR-02 düşer', () => {
    expect(kodlar({ yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, onaylar: [{ id: 'o1', tur: 'DAVA_ACMA', sonuc: 'ONAY', alinmaAt: new Date('2026-08-01'), istisnaGerekce: null }] })).not.toContain('AR-02')
  })
  it('AR-07 en yüksek öncelikli (2) ve ikinci teyit rolü (A+2)', () => {
    const r = arabuluculukKurallari({ ...taban, yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, arabuluculuk: arab({ tur: 'DAVA_SARTI', onayAt: new Date(), sonuc: 'ANLASAMAMA', sonTutanakTarihi: new Date('2026-09-01'), sonTutanakBelgeId: 'b' }), iik67YenidenOnayBekleyen: 2, onaylar: [{ id: 'o', tur: 'DAVA_ACMA', sonuc: 'ONAY', alinmaAt: new Date('2026-08-01'), istisnaGerekce: null }] }, SIMDI)
    expect(r[0].kod).toBe('AR-07')
    expect(r[0].rol).toBe('A+2')
    expect(r[0].etiket).toMatch(/teyit gerekli/)
  })
  it('gelecekteki toplantı AR-05 üretmez; dava varken AR-04 üretmez', () => {
    expect(kodlar({ arabuluculuk: arab({ tur: 'IHTIYARI' }), toplantilar: [{ baslar: new Date('2026-10-10'), durum: 'PLANLANDI' }] })).not.toContain('AR-05')
    expect(kodlar({ yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, arabuluculuk: arab({ tur: 'DAVA_SARTI' }), davaVar: true })).not.toContain('AR-04')
  })
  it('AR-08: anlaşma müvekkil kararıdır — sulh/iskonto onayı yoksa önce onay kaydı (öncelik 3), varsa plan', () => {
    const anlasma = arab({ tur: 'DAVA_SARTI', onayAt: new Date('2026-09-01'), sonuc: 'ANLASMA', sonTutanakTarihi: new Date('2026-09-01'), sonTutanakBelgeId: 'b1' })
    const onaysiz = arabuluculukKurallari({ ...taban, arabuluculuk: anlasma }, SIMDI).find((k) => k.kod === 'AR-08')
    expect(onaysiz).toMatchObject({ hedef: 'onay-kaydi', oncelik: 3 })
    expect(onaysiz?.oneri).toMatch(/müvekkil kararıdır/)
    const onayli = arabuluculukKurallari({ ...taban, arabuluculuk: anlasma, onaylar: [{ id: 's', tur: 'SULH_ISKONTO', sonuc: 'ONAY', alinmaAt: new Date('2026-08-30'), istisnaGerekce: null, tutar: 500000 }] }, SIMDI).find((k) => k.kod === 'AR-08')
    expect(onayli).toMatchObject({ hedef: 'taksit', oncelik: 5 })
    expect(kodlar({ arabuluculuk: { ...anlasma, sonuc: 'KISMEN' } })).toContain('AR-08')
  })
  it('S26 kabul 3: tür seçilmeden başvuru adımı (AR-04) açılmaz, önce AR-03; "belirsiz" → başvuru önerisi', () => {
    const turYok = arabuluculukKurallari({ ...taban, yolSecimi: { secim: 'ARABULUCULUK_IIK67' } }, SIMDI).map((k) => k.kod)
    expect(turYok).toContain('AR-03')
    expect(turYok).not.toContain('AR-04')
    expect(kodlar({ yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, arabuluculuk: arab() })).not.toContain('AR-04')
    const belirsiz = arabuluculukKurallari({ ...taban, yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, arabuluculuk: arab({ tur: 'BELIRSIZ' }) }, SIMDI).find((k) => k.kod === 'AR-04')
    expect(belirsiz?.oneri).toMatch(/belirsiz: arabuluculuğa başvurun/i)
    expect(belirsiz?.etiket).toBe('teyit gerekli')
    // başvurusu zaten girilmiş (geri doldurma) kayıtta başvuru adımı yok
    expect(kodlar({ yolSecimi: { secim: 'ARABULUCULUK_IIK67' }, arabuluculuk: arab({ tur: 'BELIRSIZ', basvuruTarihi: new Date('2026-06-29') }) })).not.toContain('AR-04')
  })
})

describe('telefonHazirOzeti', () => {
  it('tutar, itiraz kapsamı ve onay sınırını tek özette verir; kişisel veri içermez', () => {
    const t = telefonHazirOzeti({
      hukukDosyaNo: 'H-KURGU-1', icra: { daire: 'Kurgu 1. İcra Dairesi', esas: '2026/1' }, takipToplam: 1234567.89,
      itirazlar: [{ sira: 1, tip: 'TAM', tutar: 1234567.89, kapsam: { borc: true, faiz: true } }],
      arabuluculuk: { tur: 'DAVA_SARTI', basvuruNo: '1', buroNo: '2026/5', uyapDosyaNo: null, sonuc: null },
      toplantilar: [{ baslar: new Date('2026-07-13T08:00:00Z'), durum: 'YAPILDI', sonucNot: 'Karşı taraf %50 iskonto istedi' }],
      onaylar: [{ id: 'o', tur: 'SULH_ISKONTO', sonuc: 'ONAY', alinmaAt: new Date('2026-07-01'), istisnaGerekce: null, tutar: 1000000, onaylayanUnvan: 'Birim Müdürü' }],
    })
    expect(t.onaySiniri).toMatch(/1\.000\.000,00 TL/)
    expect(t.metin).toMatch(/Borçlu-1: tam itiraz/)
    expect(t.metin).toMatch(/Görüşmeler: 13\.07\.2026 · yapıldı/)
    expect(t.metin).not.toMatch(/\b\d{11}\b/) // TCKN yok
    expect(t.uyarilar).toEqual([])
  })
  it('onay sınırı yoksa uyarı', () => {
    const t = telefonHazirOzeti({ hukukDosyaNo: null, icra: { daire: null, esas: null }, takipToplam: null, itirazlar: [], arabuluculuk: null, toplantilar: [], onaylar: [] })
    expect(t.uyarilar.join(' ')).toMatch(/onay sınırı yok/i)
  })
})

describe('müvekkil yazısı taslakları (yapay zekâsız)', () => {
  const kunye = { musteriUnvani: 'Kurgusal Sigorta A.Ş.', hukukDosyaNo: 'H-1', hasarDosyaNo: null, icraDairesi: 'Kurgu İcra', icraEsas: '2026/1' }
  it('onay talebi: yol, tutar ve ihtiyatlı son gün (teyit gerekli) içerir', () => {
    const m = onayTalebiTaslagi({ kunye, onayTuru: 'DAVA_ACMA', yol: 'ARABULUCULUK_IIK67', takipToplam: 1000, itirazEdilen: 900, ihtiyatliSonGun: new Date('2027-06-23'), ekonomi: { harc: '1.000 TL' } })
    expect(m).toMatch(/Dava açma için onay talebi/)
    expect(m).toMatch(/Arabuluculuk \+ itirazın iptali/)
    expect(m).toMatch(/23\.06\.2027 \(teyit gerekli\)/)
    expect(m).toMatch(/Tahmini harç: 1\.000 TL/)
  })
  it('istisna ve arabuluculuk sonucu taslakları', () => {
    expect(istisnaBildirimTaslagi({ kunye, ihtiyatliSonGun: new Date('2026-10-01'), gerekce: 'Süre koruma' })).toMatch(/hak kaybını önlemek/)
    expect(arabuluculukSonucBildirimi({ kunye, sonuc: 'KISMEN', sonTutanakTarihi: new Date('2026-07-24') })).toMatch(/anlaşılamayan kalemle sınırlı/)
  })
})
