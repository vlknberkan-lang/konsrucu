/**
 * S30 · Ray takip raporu (30 sütun) — lib/konsrucu/rapor-mail.ts
 * Kabul: 30 sütun, Ray takip Excel'inin başlıklarıyla birebir (docs 04 §4.2); her sütun bir kaynağa bağlı, "yeri
 * olmadığı için boş" sütun yok (06 §3.5); dava aşamasındaki dosya mahkeme/esas/duruşmayla görünür; teyitsiz
 * hücre ve satır işaretli; e-posta yalnız taslak (avukat onayıyla, elle gönderilir).
 * Bütün veriler kurgusaldır.
 */
import { describe, it, expect } from 'vitest'
import {
  RAY_30_SUTUNLAR, raySatiri, rayRaporTablo, rayRaporMailTaslagi, genelSonDurum, excelGunu, mahkemeAdi, esasNo,
  type RayDosyaGirdi, type RayDava,
} from '@/lib/konsrucu/rapor-mail'

// docs/04 §4.2 tablosundaki yazım, sırasıyla (Ray'in Excel başlıkları)
const RAY_BASLIKLARI = [
  'HUKUK DOSYA NO', 'HASAR DOSYA NO', 'HASAR TARİHİ', 'ZAMAN AŞIMI', 'RÜCU SEBEBİ', 'RÜCU ORANI', 'RÜCU TUTARI',
  'DAVA MİKTARI', 'KADROLU AVUKAT', 'SÖZLEŞMELİ AVUKAT', 'İNCELEMEYE GÖNDEREN KİŞİ', 'İNCELEYEN KİŞİ',
  'AVUKAT YARD. GÖNDEREN KİŞİ', 'İŞLEM YAPAN AVUKAT YARD.', 'İCRA MÜDÜRLÜĞÜ', 'İCRA ESAS', 'TAKİP TARİHİ',
  'TAKİP ÇIKIŞI', 'SON DURUM', 'MAHKEME', 'ESAS', 'DAVALI', 'ÜST DOSYA NO', 'DAVA SON DURUM', 'DAVA AÇILIŞ TARİHİ',
  'DURUŞMA TARİHİ', 'İHTİYATİ HACİZ', 'DEKONT', 'DELİL DİLEKÇESİ', 'MÜZEKKERE CEVAP',
]

const BUGUN = new Date('2026-09-27T09:00:00Z')
const col = (no: number) => no - 1

function tamDava(ek: Partial<RayDava> = {}): RayDava {
  return {
    rolumuz: 'DAVACI', derece: 1,
    mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'İstanbul', mahkemeNo: '5', esasYil: 2026, esasSira: 123,
    ustDosyaNoHam: 'UST-0001', acilisTarihi: new Date('2026-09-08T00:00:00+03:00'),
    sonrakiDurusma: new Date('2026-10-15T10:00:00+03:00'), evre: 'DILEKCELER', durum: 'DERDEST',
    createdAt: new Date('2026-09-08T12:00:00Z'),
    taraflar: [{ rol: 'DAVALI', borcluId: 'b1', teyit: 'TEYITLI' }],
    islemler: [
      { tur: 'DEKONT_SUNUMU', tarih: new Date('2026-09-10T00:00:00+03:00'), referansNo: 'IE-777', teyit: 'TEYITLI' },
      { tur: 'DELIL_DILEKCESI', tarih: new Date('2026-09-12T00:00:00+03:00'), teyit: 'TEYITLI' },
      { tur: 'MUZEKKERE', tarih: new Date('2026-09-14T00:00:00+03:00'), referansNo: 'Kurum-A 2026/5', teyit: 'TEYITLI' },
      { tur: 'MUZEKKERE_CEVABI', tarih: new Date('2026-09-20T00:00:00+03:00'), referansNo: 'Kurum-A', teyit: 'TEYITLI' },
    ],
    ...ek,
  }
}

function tamDosya(ek: Partial<RayDosyaGirdi> = {}): RayDosyaGirdi {
  return {
    hukukDosyaNo: 'HK-2026-0001', hasarDosyaNo: 'HS-0001',
    hasarTarihi: new Date('2025-11-02T00:00:00+03:00'), zamanasimi: new Date('2027-11-02T00:00:00+03:00'),
    rucuSebebi: 'Hizmet kusuru', rucuSebebiKod: null, rucuOrani: '%100',
    rucuTutari: '125000.50', davaMiktari: { toString: () => '125000.50' },
    kadroluAvukat: 'Avukat K', sozlesmeliAvukat: 'Avukat S',
    kaynakJson: { incelemeyeGonderen: 'Kişi 1', inceleyen: 'Kişi 2', avYardGonderen: 'Kişi 3' },
    islemYapanYrd: 'Yardımcı Y', icraDairesi: 'İstanbul 1. İcra Dairesi', icraDosyaNo: '2026/1001',
    takipTarihi: new Date('2026-07-24T00:00:00+03:00'),
    durum: 'DAVA', icraEksen: 'DURDU_ITIRAZ', arabEksen: 'SON_TUTANAK_DIGER', davaEksen: 'DERDEST',
    eksenJson: { icra: { teyit: 'TEYITLI' }, arab: { teyit: 'TEYITLI' }, dava: { teyit: 'TEYITLI' } },
    borclular: [{ id: 'b1', adUnvan: 'Kurgusal Borçlu A' }],
    takipTalepleri: [{ toplam: '130000.00', gecerli: true, surum: 2, onaylayanId: 'avk-1', dondurulduAt: new Date('2026-07-24T10:00:00Z') }],
    etkinlikler: [],
    ihtiyatiHacizler: [{ talepTarihi: new Date('2026-07-20T00:00:00+03:00'), sonuc: 'KABUL', kararTarihi: new Date('2026-07-22T00:00:00+03:00'), teminatOrani: '%15', teyit: 'TEYITLI' }],
    davalar: [tamDava()],
    ...ek,
  }
}

describe('RAY_30_SUTUNLAR — Ray takip Excel düzeni', () => {
  it('30 sütun, Ray başlıklarıyla birebir ve sırasıyla', () => {
    expect(RAY_30_SUTUNLAR).toHaveLength(30)
    expect(RAY_30_SUTUNLAR.map((s) => s.baslik)).toEqual(RAY_BASLIKLARI)
    expect(RAY_30_SUTUNLAR.map((s) => s.no)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  })
  it('her sütun bir kaynağa bağlı (boş kaynak yok)', () => {
    for (const s of RAY_30_SUTUNLAR) expect(s.kaynak.trim().length, `#${s.no}`).toBeGreaterThan(3)
  })
  it('tarih ve para sütunları doğru türde', () => {
    const tur = Object.fromEntries(RAY_30_SUTUNLAR.map((s) => [s.no, s.tur]))
    for (const n of [3, 4, 17, 25, 26, 29]) expect(tur[n]).toBe('tarih')
    for (const n of [7, 8, 18]) expect(tur[n]).toBe('para')
  })
})

describe('raySatiri — tam kurgusal dosya', () => {
  const s = raySatiri(tamDosya(), BUGUN)

  it('30 hücrenin hepsi dolu (her sütun veriden geliyor)', () => {
    expect(s.hucreler).toHaveLength(30)
    s.hucreler.forEach((h, i) => expect(h.deger, `#${i + 1} ${RAY_BASLIKLARI[i]}`).not.toBeNull())
  })
  it('teyitli kayıtlarda satır işaretsiz', () => {
    expect(s.teyitsiz).toBe(false)
    expect(s.teyitNotlari).toEqual([])
  })
  it('künye ve icra sütunları doğrudan alanlardan', () => {
    expect(s.hucreler[col(1)].deger).toBe('HK-2026-0001')
    expect(s.hucreler[col(7)].deger).toBe(125000.5)
    expect(s.hucreler[col(8)].deger).toBe(125000.5)
    expect(s.hucreler[col(11)].deger).toBe('Kişi 1')
    expect(s.hucreler[col(12)].deger).toBe('Kişi 2')
    expect(s.hucreler[col(13)].deger).toBe('Kişi 3') // eski anahtar (avYardGonderen)
    expect(s.hucreler[col(15)].deger).toBe('İstanbul 1. İcra Dairesi')
    expect(s.hucreler[col(16)].deger).toBe('2026/1001')
    expect(s.hucreler[col(18)].deger).toBe(130000)
  })
  it('tarihler İstanbul günüyle Excel gününe çevrilir (gün kaymaz)', () => {
    expect((s.hucreler[col(3)].deger as Date).toISOString()).toBe('2025-11-02T00:00:00.000Z')
    expect((s.hucreler[col(17)].deger as Date).toISOString()).toBe('2026-07-24T00:00:00.000Z')
  })
  it('dava aşamasındaki dosya mahkeme, esas ve duruşmayla görünür', () => {
    expect(s.davaAsamasinda).toBe(true)
    expect(s.hucreler[col(20)].deger).toBe('İstanbul 5. Asliye Hukuk Mahkemesi')
    expect(s.hucreler[col(21)].deger).toBe('2026/123')
    expect(s.hucreler[col(22)].deger).toBe('Kurgusal Borçlu A')
    expect(s.hucreler[col(23)].deger).toBe('UST-0001')
    expect(s.hucreler[col(24)].deger).toBe('Derdest · Dilekçeler')
    expect((s.hucreler[col(25)].deger as Date).toISOString()).toBe('2026-09-08T00:00:00.000Z')
    expect((s.hucreler[col(26)].deger as Date).toISOString()).toBe('2026-10-15T00:00:00.000Z')
  })
  it('#27, #28, #29, #30 dava işlemlerinden', () => {
    expect(s.hucreler[col(27)].deger).toBe('Talep 20.07.2026 · Kabul 22.07.2026 · teminat %15')
    expect(s.hucreler[col(28)].deger).toBe('10.09.2026 · iş emri no IE-777')
    expect((s.hucreler[col(29)].deger as Date).toISOString()).toBe('2026-09-12T00:00:00.000Z')
    expect(s.hucreler[col(30)].deger).toBe('Müzekkere 14.09.2026 (Kurum-A 2026/5); Cevap 20.09.2026 (Kurum-A)')
  })
  it('#19 SON DURUM üç eksenden türetilir', () => {
    expect(s.hucreler[col(19)].deger).toBe('İcra: Durdu (itiraz) · Arabuluculuk: Anlaşma yok (son tutanak) · Dava: Derdest')
    expect(s.hucreler[col(19)].teyitsiz).toBeNull()
  })
})

describe('teyitsiz işaretleme', () => {
  it('onaysız davalı önerisi → #22 ve satır işaretli, not başlıkla', () => {
    const s = raySatiri(tamDosya({ davalar: [tamDava({ taraflar: [{ rol: 'DAVALI', adHam: 'Kurgusal Davalı B', teyit: 'ADAY' }] })] }), BUGUN)
    expect(s.hucreler[col(22)].deger).toBe('Kurgusal Davalı B')
    expect(s.hucreler[col(22)].teyitsiz).toMatch(/onaylanmadı/)
    expect(s.teyitsiz).toBe(true)
    expect(s.teyitNotlari.some((n) => n.startsWith('#22 DAVALI'))).toBe(true)
  })
  it('onaylanmamış dava kaydı (Excel/geri doldurma önerisi) → mahkeme, esas ve açılış işaretli', () => {
    const s = raySatiri(tamDosya({ davalar: [tamDava({ asamaDetayJson: { kaynakTuru: 'EXCEL', teyit: 'ADAY' } })] }), BUGUN)
    for (const n of [20, 21, 25]) expect(s.hucreler[col(n)].teyitsiz, `#${n}`).toBe('Dava kaydı önerisi onaylanmadı')
    const t = raySatiri(tamDosya({ davalar: [tamDava({ asamaDetayJson: { kaynakTuru: 'ELLE', teyit: 'TEYITLI' } })] }), BUGUN)
    expect(t.hucreler[col(20)].teyitsiz).toBeNull()
  })
  it('teyitsiz eksen → #19 işaretli', () => {
    const s = raySatiri(tamDosya({ eksenJson: { icra: { teyit: 'TEYITSIZ' }, arab: { teyit: 'TEYITLI' }, dava: { teyit: 'TEYITLI' } } }), BUGUN)
    expect(s.hucreler[col(19)].teyitsiz).toMatch(/icra/)
  })
  it('onaylanmamış takip talebi → #18 işaretli; silinen sürüm ve eski sürüm okunmaz', () => {
    const s = raySatiri(tamDosya({
      takipTalepleri: [
        { toplam: '1.00', gecerli: true, surum: 9, onaylayanId: 'x', silindiAt: new Date() },
        { toplam: '2.00', gecerli: true, surum: 3, onaylayanId: null, dondurulduAt: null },
        { toplam: '3.00', gecerli: true, surum: 1, onaylayanId: 'x' },
      ],
    }), BUGUN)
    expect(s.hucreler[col(18)].deger).toBe(2)
    expect(s.hucreler[col(18)].teyitsiz).toMatch(/onay/)
  })
  it('ayrıştırılamayan Excel hücresi yalnız ham değerle ve işaretle (#27, #28, #30)', () => {
    const s = raySatiri(tamDosya({
      ihtiyatiHacizler: [{ excelHam: 'İH talep edildi ?', teyit: 'ADAY' }],
      davalar: [tamDava({ islemler: [
        { tur: 'DEKONT_SUNUMU', excelHam: 'dekont verildi', teyit: 'ADAY' },
        { tur: 'MUZEKKERE_CEVABI', excelHam: 'cevap geldi', teyit: 'ADAY' },
      ] })],
    }), BUGUN)
    expect(s.hucreler[col(27)].deger).toBe('İH talep edildi ? (ayrıştırılamadı, elle tamamlayın)')
    expect(s.hucreler[col(28)].deger).toBe('dekont verildi (ayrıştırılamadı, elle tamamlayın)')
    expect(s.hucreler[col(30)].deger).toBe('cevap geldi (ayrıştırılamadı, elle tamamlayın)')
    for (const n of [27, 28, 30]) expect(s.hucreler[col(n)].teyitsiz).toMatch(/ayrıştırılamadı/)
    expect(s.hucreler[col(29)].deger).toBeNull()
  })
  it('UYAP ve Excel duruşma tarihleri farklıysa ikisi yan yana, işaretli', () => {
    const s = raySatiri(tamDosya({
      davalar: [tamDava({ sonrakiDurusma: null, onIncelemeTarihi: null })],
      etkinlikler: [
        { tur: 'DURUSMA', baslar: new Date('2026-10-12T10:00:00+03:00'), kaynak: 'UYAP', teyit: 'TEYITLI', durum: 'PLANLANDI' },
        { tur: 'DURUSMA', baslar: new Date('2026-10-14T10:00:00+03:00'), kaynak: 'EXCEL', teyit: 'ADAY', durum: 'PLANLANDI' },
      ],
    }), BUGUN)
    expect(s.hucreler[col(26)].deger).toBe('12.10.2026 (UYAP) / 14.10.2026 (Excel)')
    expect(s.hucreler[col(26)].teyitsiz).toMatch(/farklı/)
  })
  it('geçmiş ya da iptal edilmiş duruşma "duruşma tarihi" sayılmaz', () => {
    const s = raySatiri(tamDosya({
      davalar: [tamDava({ sonrakiDurusma: new Date('2026-09-01T10:00:00+03:00'), onIncelemeTarihi: null })],
      etkinlikler: [{ tur: 'DURUSMA', baslar: new Date('2026-11-01T10:00:00+03:00'), kaynak: 'UYAP', teyit: 'TEYITLI', durum: 'IPTAL' }],
    }), BUGUN)
    expect(s.hucreler[col(26)].deger).toBeNull()
  })
})

describe('silinen ve reddedilen kayıtlar rapora girmez', () => {
  it('silinmiş dava, reddedilmiş taraf ve silinmiş işlem okunmaz', () => {
    const s = raySatiri(tamDosya({
      davalar: [
        tamDava({ mahkemeYer: 'Silinmiş', silindiAt: new Date() }),
        tamDava({
          taraflar: [{ rol: 'DAVALI', adHam: 'Reddedilen', teyit: 'REDDEDILDI' }],
          islemler: [{ tur: 'DELIL_DILEKCESI', tarih: new Date('2026-09-12T00:00:00+03:00'), teyit: 'TEYITLI', silindiAt: new Date() }],
        }),
      ],
      ihtiyatiHacizler: [{ talepTarihi: new Date(), teyit: 'REDDEDILDI' }],
    }), BUGUN)
    expect(s.hucreler[col(20)].deger).toBe('İstanbul 5. Asliye Hukuk Mahkemesi')
    expect(s.hucreler[col(22)].deger).toBeNull()
    expect(s.hucreler[col(29)].deger).toBeNull()
    expect(s.hucreler[col(27)].deger).toBeNull()
  })
})

describe('eski kayıtlar ve eksik veri', () => {
  it('Dava kaydı yoksa Asama(DAVA) aynası kullanılır', () => {
    const s = raySatiri(tamDosya({
      davalar: [], davaEksen: null,
      asamalar: [{ tur: 'DAVA', birim: 'Ankara 3. Asliye Ticaret Mahkemesi', kimlikNo: '2025/88 E.', baslangic: new Date('2025-12-01T00:00:00+03:00'), sonuc: 'derdest', durum: 'DEVAM' }],
    }), BUGUN)
    expect(s.hucreler[col(20)].deger).toBe('Ankara 3. Asliye Ticaret Mahkemesi')
    expect(s.hucreler[col(21)].deger).toBe('2025/88 E.')
    expect(s.hucreler[col(24)].deger).toBe('derdest')
    expect(s.hucreler[col(24)].teyitsiz).toMatch(/eski aşama/)
    expect((s.hucreler[col(25)].deger as Date).toISOString()).toBe('2025-12-01T00:00:00.000Z')
    expect(s.davaAsamasinda).toBe(true)
  })
  it('eksen hesaplanmamışsa #19 eski durum, teyitsiz', () => {
    const g = genelSonDurum({ durum: 'ITIRAZ', icraEksen: null, arabEksen: null, davaEksen: null, eksenJson: null })
    expect(g.metin).toBe('İtiraz')
    expect(g.teyitsiz).toMatch(/hesaplanmadı/)
  })
  it('kapanış sebebi girilmişse #19 kapanışı söyler', () => {
    expect(genelSonDurum({ durum: 'KAPANDI', kapanisSebebi: 'SULH' }).metin).toBe('Kapandı: Sulh')
  })
  it('kesinleşme şerhi yoksa "kesinleşti" yazılmaz', () => {
    const s = raySatiri(tamDosya({ davaEksen: 'KESINLESTI', davalar: [tamDava({ kesinlesmeTarihi: null })] }), BUGUN)
    expect(s.hucreler[col(24)].deger).not.toMatch(/^Kesinleşti/)
    expect(s.hucreler[col(24)].teyitsiz).toMatch(/şerhi/)
    const t = raySatiri(tamDosya({ davaEksen: 'KESINLESTI', davalar: [tamDava({ kesinlesmeTarihi: new Date('2026-09-01T00:00:00+03:00') })] }), BUGUN)
    expect(t.hucreler[col(24)].deger).toBe('Kesinleşti (01.09.2026)')
  })
  it('takip öncesi boş dosya: çökmez, dava sütunları boş, dava aşamasında değil', () => {
    const s = raySatiri({
      hukukDosyaNo: 'HK-2026-0002', hasarDosyaNo: null, hasarTarihi: null, zamanasimi: null, rucuSebebi: null, rucuOrani: null,
      rucuTutari: null, davaMiktari: '', kadroluAvukat: null, sozlesmeliAvukat: null, kaynakJson: null, islemYapanYrd: null,
      icraDairesi: null, icraDosyaNo: null, takipTarihi: null, durum: 'HAVUZDA',
    }, BUGUN)
    expect(s.hucreler).toHaveLength(30)
    expect(s.hucreler[col(1)].deger).toBe('HK-2026-0002')
    expect(s.hucreler[col(8)].deger).toBeNull()
    expect(s.hucreler.slice(19).every((h) => h.deger == null || typeof h.deger === 'string')).toBe(true)
    expect(s.hucreler[col(20)].deger).toBeNull()
    expect(s.davaAsamasinda).toBe(false)
  })
})

describe('yardımcılar', () => {
  it('excelGunu: İstanbul gece yarısı bir gün geri kaymaz', () => {
    expect(excelGunu('2026-03-14T21:30:00Z')!.toISOString()).toBe('2026-03-15T00:00:00.000Z')
    expect(excelGunu(null)).toBeNull()
    expect(excelGunu('geçersiz')).toBeNull()
  })
  it('mahkemeAdi kısaltmasız; esasNo yarımsa null', () => {
    expect(mahkemeAdi({ mahkemeTuru: 'TUKETICI', mahkemeYer: 'İzmir', mahkemeNo: '2.' })).toBe('İzmir 2. Tüketici Mahkemesi')
    expect(mahkemeAdi({})).toBeNull()
    expect(esasNo({ esasYil: 2026, esasSira: null })).toBeNull()
  })
})

describe('rayRaporTablo ve e-posta taslağı', () => {
  it('özet: dosya, dava aşamasında ve teyitsiz satır sayıları', () => {
    const t = rayRaporTablo([
      tamDosya(),
      tamDosya({ hukukDosyaNo: 'HK-2026-0003', davalar: [tamDava({ taraflar: [{ rol: 'DAVALI', adHam: 'X', teyit: 'ADAY' }] })] }),
      tamDosya({ hukukDosyaNo: 'HK-2026-0004', durum: 'TAKIP_ACILDI', davaEksen: 'YOK', arabEksen: 'YOK', davalar: [], asamalar: [] }),
    ], BUGUN)
    expect(t.basliklar).toEqual(RAY_BASLIKLARI)
    expect(t.satirlar).toHaveLength(3)
    expect(t.ozet).toEqual({ dosya: 3, davaAsamasinda: 2, teyitsizSatir: 1 })
  })
  it('taslak: program göndermez; gövde yalnız sayılar içerir, teyit uyarısı avukata', () => {
    const m = rayRaporMailTaslagi({ musteriAd: 'Kurgusal Sigorta A.Ş.', hazirlayanAd: 'Avukat K', bugun: BUGUN, dosyaSayisi: 3, davaSayisi: 2, teyitsizSatir: 1 })
    expect(m.konu).toBe('Rücu dosyaları takip raporu · 27.09.2026')
    expect(m.govde).toContain('3 dosya')
    expect(m.govde).toContain('2 tanesi dava aşamasında')
    expect(m.govde).not.toMatch(/teyitsiz/i)
    expect(m.uyarilar[0]).toMatch(/göndermez/)
    expect(m.uyarilar.some((u) => u.includes('1 satırda teyitsiz'))).toBe(true)
  })
})
