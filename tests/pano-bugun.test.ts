/**
 * S30 · Bugün masası — lib/konsrucu/rapor-mail.ts
 * Kabul: kurgusal dosyalar aciliyet sırasıyla (06 §8.2 öncelik merdiveni), en üstte onaysız süre; "Benim işlerim",
 * "Herkes", "Onaysız süre" ve "UYAP bağlı değil" süzgeçleri çalışıyor; Şimdi kartı yolHaritasiJson önbelleğinden
 * okunuyor, süre riski önbellekten bağımsız. Bütün veriler kurgusaldır.
 */
import { describe, it, expect } from 'vitest'
import {
  yolHaritasiOku, masaTablosu, masaSuz, masaSayac, masaSuzgecOku, uyapBaglantiSorunu,
  type MasaDosya, type MasaSure, type MasaKim,
} from '@/lib/konsrucu/rapor-mail'
import { onbellekJson } from '@/lib/konsrucu/yol-haritasi/gorunum'

const BUGUN = new Date('2026-09-27T09:00:00Z')
const gunSonra = (n: number) => new Date(BUGUN.getTime() + n * 86_400_000)
const saatOnce = (n: number) => new Date(BUGUN.getTime() - n * 3_600_000)

const AVUKAT: MasaKim = { kullaniciId: 'u-avukat', rol: 'AVUKAT' }
const YRD: MasaKim = { kullaniciId: 'u-yrd', rol: 'AVUKAT_YRD' }

function dosya(id: string, ek: Partial<MasaDosya> = {}): MasaDosya {
  return {
    id, hukukDosyaNo: `HK-${id}`, hasarDosyaNo: null, durum: 'TAKIP_ACILDI', uyapDurum: 'Açık',
    icraDosyaNo: '2026/1', uyapEslesme: 'OK', uyapSenkronAt: saatOnce(2), onarimDurumu: null,
    atananKullaniciId: null, yolHaritasiJson: null, ...ek,
  }
}
const kart = (simdi: Record<string, unknown> | null, ek: Record<string, unknown> = {}) => ({ simdi, sonra: [], at: saatOnce(1).toISOString(), ...ek })
const sure = (dosyaId: string, ek: Partial<MasaSure> = {}): MasaSure => ({ dosyaId, dayanak: 'İİK 67/1', durum: 'ACIK', ...ek })

describe('yolHaritasiOku — önbellek okuma', () => {
  it('siradakiAdim çıktısını esnek okur', () => {
    const o = yolHaritasiOku({
      simdi: { kod: 'TB-08', oneri: 'İtirazın size tebliğ tarihini girin', eylem: { etiket: 'Tarihi gir', hedef: '/dosya/x#tebligler' }, rol: 'H', oncelik: 2, hukukiEtiket: 'teyit gerekli' },
      sonra: [{}, {}], at: '2026-09-27T08:00:00Z',
    })!
    expect(o.simdi).toMatchObject({ metin: 'İtirazın size tebliğ tarihini girin', kural: 'TB-08', oncelik: 2, rol: 'H', eylem: 'Tarihi gir', hedef: '/dosya/x#tebligler', teyitGerekli: true })
    expect(o.sonraSayisi).toBe(2)
    expect(o.at?.toISOString()).toBe('2026-09-27T08:00:00.000Z')
  })
  it('S20 siradakiAdim çıktısı (Adim: kural, sonGun "yyyy-aa-gg", rol "H/A", sembolik hedef, bekleme Adim)', () => {
    const o = yolHaritasiOku({
      simdi: { kural: 'GN-04', surum: 1, oncelik: 1, rol: 'A+2', engel: false, tur: 'EYLEM', metin: 'Son günü onaylayın', eylem: { etiket: 'Onayla', hedef: 'sure-onay' }, sonGun: '2026-10-07', kalanGun: 10, hukukiEtiket: 'İİK 67 (teyit gerekli)' },
      sonra: [], bekleme: null, bugun: '2026-09-27', prova: false,
    })!
    expect(o.simdi).toMatchObject({ kural: 'GN-04', oncelik: 1, rol: 'A+2', eylem: 'Onayla', hedef: null, teyitGerekli: true })
    expect(o.simdi!.sonGun!.toISOString()).toBe('2026-10-07T00:00:00.000Z')
    expect(o.at!.toISOString()).toBe('2026-09-27T00:00:00.000Z')
    expect(yolHaritasiOku({ simdi: { metin: 'x', rol: 'H/A' } })!.simdi!.rol).toBe('H')
    expect(yolHaritasiOku({ simdi: null, bekleme: { kural: 'TB-03', metin: 'Ödeme emrinin tebliği bekleniyor' } })!.bekleme).toBe('Ödeme emrinin tebliği bekleniyor')
    expect(yolHaritasiOku({ simdi: { metin: 'x' }, prova: true })).toBeNull()
  })
  it('sözleşme: S20 önbellek yazıcısının (onbellekJson) çıktısı olduğu gibi okunur', () => {
    const adim = (ek: Record<string, unknown>) => ({
      kural: 'TB-08', surum: 1, grup: 'TB', durak: 4, oncelik: 2, rol: 'H', engel: false, tur: 'EYLEM', metin: 'İtirazın size tebliğ tarihini girin',
      neden: '', eylem: { etiket: 'Tarih gir', hedef: 'itiraz-teblig-tarih' }, sonGun: '2026-10-07', kalanGun: 10, hukukiEtiket: null, kanit: [], adet: 1, ertelendi: null, ...ek,
    })
    const sonuc = { simdi: adim({}), sonra: [adim({ kural: 'HZ-05' })], sonraKatlanan: 0, engeller: [], bekleme: null, bilgi: [], ertelenenler: [], tumu: [], bugun: '2026-09-27', prova: false }
    const json = JSON.parse(JSON.stringify(onbellekJson(sonuc as unknown as Parameters<typeof onbellekJson>[0], BUGUN)))
    const o = yolHaritasiOku(json)!
    expect(o.simdi).toMatchObject({ metin: 'İtirazın size tebliğ tarihini girin', kural: 'TB-08', oncelik: 2, rol: 'H', eylem: 'Tarih gir', hedef: null })
    expect(o.simdi!.sonGun!.toISOString()).toBe('2026-10-07T00:00:00.000Z')
    expect(o.sonraSayisi).toBe(1)
    expect(o.at!.getTime()).toBe(BUGUN.getTime())
    const bekle = JSON.parse(JSON.stringify(onbellekJson({ ...sonuc, simdi: null, sonra: [], bekleme: adim({ kural: 'TB-03', tur: 'BEKLEME', metin: 'Ödeme emrinin tebliği bekleniyor', oncelik: 6 }) } as unknown as Parameters<typeof onbellekJson>[0], BUGUN)))
    expect(yolHaritasiOku(bekle)).toMatchObject({ simdi: null, bekleme: 'Ödeme emrinin tebliği bekleniyor' })
  })
  it('güvensiz hedef atılır (dış adres, //, javascript:)', () => {
    for (const hedef of ['https://ornek.test', '//ornek.test', 'javascript:alert(1)', '/a\\b']) {
      expect(yolHaritasiOku(kart({ metin: 'x', eylem: { etiket: 'Aç', hedef } }))!.simdi!.hedef).toBeNull()
    }
  })
  it('okunamayan önbellek null; metni olmayan Şimdi kartı yok sayılır; bekleme metni okunur', () => {
    expect(yolHaritasiOku(null)).toBeNull()
    expect(yolHaritasiOku([1, 2])).toBeNull()
    expect(yolHaritasiOku('metin')).toBeNull()
    const o = yolHaritasiOku({ simdi: { kod: 'X' }, bekleme: { metin: 'Ödeme emrinin tebliği bekleniyor' } })!
    expect(o.simdi).toBeNull()
    expect(o.bekleme).toBe('Ödeme emrinin tebliği bekleniyor')
  })
  it('öncelik yoksa engel 0, değilse 5; aralık dışı değer sınırlanır', () => {
    expect(yolHaritasiOku(kart({ metin: 'a', engel: true }))!.simdi!.oncelik).toBe(0)
    expect(yolHaritasiOku(kart({ metin: 'a' }))!.simdi!.oncelik).toBe(5)
    expect(yolHaritasiOku(kart({ metin: 'a', oncelik: 42 }))!.simdi!.oncelik).toBe(6)
  })
})

describe('masaTablosu — aciliyet sırası', () => {
  const dosyalar = [
    dosya('01', { yolHaritasiJson: kart({ kod: 'HZ-04', metin: 'Takibe hazırlığı onaylayın', rol: 'A', oncelik: 5, eylem: { etiket: 'Onayla' } }) }),
    dosya('02'), // önbellek yok; onaysız süre 10 gün sonra → GN-04
    dosya('03', { yolHaritasiJson: kart({ kod: 'TB-01', metin: 'Tebliğ tarihini onaylayın', rol: 'A', oncelik: 2 }) }),
    dosya('04', { yolHaritasiJson: kart({ kod: 'YR-03', metin: 'Cevaba cevap taslağını hazırlayın', rol: 'A', oncelik: 5, sonGun: gunSonra(11).toISOString() }) }),
    dosya('05', { yolHaritasiJson: kart(null, { bekleme: 'Ödeme emrinin tebliği bekleniyor' }) }),
  ]
  const sureler = [sure('02', { onerilenIhtiyatli: gunSonra(10) }), sure('04', { onerilenIhtiyatli: gunSonra(40) })]
  const satirlar = masaTablosu(dosyalar, sureler, [], AVUKAT, BUGUN)

  it('en üstte onaysız süre (GN-04), sonra öncelik merdiveni; eşitlikte en yakın son gün', () => {
    const herkes = masaSuz(satirlar, 'herkes')
    expect(herkes.map((s) => s.dosyaNo)).toEqual(['HK-02', 'HK-03', 'HK-04', 'HK-01'])
    expect(herkes[0].simdi).toMatchObject({ kural: 'GN-04', oncelik: 1, rol: 'A+2', eylem: 'Onayla', teyitGerekli: true, kalanGun: 10 })
    expect(herkes[0].simdi!.metin).toBe('Son günü onaylayın: İİK 67/1, önerilen 07.10.2026')
  })
  it('bekleyen dosya iş listesinde değil ama sayılır', () => {
    expect(masaSuz(satirlar, 'herkes').some((s) => s.dosyaNo === 'HK-05')).toBe(false)
    const sayac = masaSayac(satirlar)
    expect(sayac.bekleyen).toBe(1)
    expect(sayac.herkes).toBe(4)
  })
  it('14 günden uzak onaysız süre Şimdi kartını ezmez ama "Onaysız süre" süzgecinde görünür', () => {
    const s04 = satirlar.find((s) => s.dosyaNo === 'HK-04')!
    expect(s04.simdi!.kural).toBe('YR-03')
    expect(masaSuz(satirlar, 'onaysiz').map((s) => s.dosyaNo)).toEqual(['HK-02', 'HK-04'])
    expect(masaSayac(satirlar).onaysizSure).toBe(2)
  })
  it('durum teyidi bekleyen dosya (GN-01, öncelik 0) süre riskinin de önüne geçer', () => {
    const t = masaTablosu([...dosyalar, dosya('06', { onarimDurumu: 'BEKLIYOR' })], sureler, [], AVUKAT, BUGUN)
    expect(masaSuz(t, 'herkes')[0]).toMatchObject({ dosyaNo: 'HK-06', simdi: { kural: 'GN-01', oncelik: 0 } })
  })
})

describe('onaylı süre (GN-05) ve önbellekteki bilgi kartı', () => {
  it('onaylı süreye ≤ 7 gün → sorumluya; geçmişse "geçti, kapanış kanıtı yok"', () => {
    const t = masaTablosu(
      [dosya('10'), dosya('11')],
      [sure('10', { onaylananSonGun: gunSonra(5), sorumluId: 'u-yrd' }), sure('11', { onaylananSonGun: gunSonra(-2) })],
      [], YRD, BUGUN,
    )
    const s10 = t.find((s) => s.dosyaNo === 'HK-10')!
    expect(s10.simdi).toMatchObject({ kural: 'GN-05', oncelik: 1, rol: 'SORUMLU', sorumluId: 'u-yrd' })
    expect(s10.simdi!.metin).toBe('İİK 67/1 için son 5 gün (onaylanan son gün 02.10.2026)')
    expect(s10.benim).toBe(true)
    expect(t.find((s) => s.dosyaNo === 'HK-11')!.simdi!.metin).toMatch(/geçti, kapanış kanıtı yok/)
  })
  it('kapanmaya hazır, tetik bekleyen ve silinen süre risk kartı açmaz', () => {
    const t = masaTablosu([dosya('12')], [
      sure('12', { onerilenIhtiyatli: gunSonra(1), durum: 'KAPANMAYA_HAZIR' }),
      sure('12', { durum: 'TETIK_BEKLIYOR' }),
      sure('12', { onerilenIhtiyatli: gunSonra(1), silindiAt: BUGUN }),
    ], [], AVUKAT, BUGUN)
    expect(t[0].simdi).toBeNull()
    expect(t[0].onaysizSure.sayi).toBe(0)
  })
  it('öncelik 6 (bilgi) kartı iş sayılmaz, bekleme olarak görünür', () => {
    const t = masaTablosu([dosya('13', { yolHaritasiJson: kart({ kod: 'SN-05', metin: 'Karar kesin olabilir', oncelik: 6 }) })], [], [], AVUKAT, BUGUN)
    expect(t[0].simdi).toBeNull()
    expect(t[0].bekleme).toBe('Karar kesin olabilir')
  })
  it('önbelleği olmayan ve işi olmayan dosya "hesaplanmadı" sayılır', () => {
    const t = masaTablosu([
      dosya('14', { yolHaritasiJson: kart({ metin: 'a' }, { at: saatOnce(30).toISOString() }) }),
      dosya('15'),
    ], [], [], AVUKAT, BUGUN)
    expect(t.find((s) => s.dosyaNo === 'HK-14')!.hesaplanmadi).toBe(false)
    expect(masaSayac(t).hesaplanmadi).toBe(1)
  })
})

describe('"Benim işlerim" süzgeci', () => {
  const dosyalar = [
    dosya('20', { yolHaritasiJson: kart({ metin: 'Onaylayın', rol: 'A', oncelik: 3 }), atananKullaniciId: 'u-yrd' }),
    dosya('21', { yolHaritasiJson: kart({ metin: 'Evrak ekleyin', rol: 'H', oncelik: 5 }), atananKullaniciId: 'u-yrd' }),
    dosya('22', { yolHaritasiJson: kart({ metin: 'UYAP’tan çekin', rol: 'H', oncelik: 5 }) }),
    dosya('23', { yolHaritasiJson: kart({ metin: 'Başkasının işi', rol: 'H', oncelik: 5 }), atananKullaniciId: 'u-baska' }),
  ]
  it('avukat: onay işleri (dosya kime atanmış olursa olsun) + atanmamış ya da kendine atanmış herkes işleri', () => {
    expect(masaSuz(masaTablosu(dosyalar, [], [], AVUKAT, BUGUN), 'benim').map((s) => s.dosyaNo)).toEqual(['HK-20', 'HK-22'])
  })
  it('avukat yardımcısı: avukat onayı işleri onda değil', () => {
    expect(masaSuz(masaTablosu(dosyalar, [], [], YRD, BUGUN), 'benim').map((s) => s.dosyaNo)).toEqual(['HK-21', 'HK-22'])
  })
  it('görüntüleyenin işi yoktur; "Herkes" hepsini gösterir', () => {
    const t = masaTablosu(dosyalar, [], [], { kullaniciId: 'u-g', rol: 'GORUNTULEYEN' }, BUGUN)
    expect(masaSuz(t, 'benim')).toEqual([])
    expect(masaSuz(t, 'herkes')).toHaveLength(4)
  })
  it('süzgeç adresten okunur; bilinmeyen değer "Benim işlerim"', () => {
    expect(masaSuzgecOku('uyap')).toBe('uyap')
    expect(masaSuzgecOku(['onaysiz'])).toBe('onaysiz')
    expect(masaSuzgecOku('xx')).toBe('benim')
    expect(masaSuzgecOku(undefined)).toBe('benim')
  })
})

describe('"UYAP bağlı değil" süzgeci', () => {
  it('takip öncesi, idari yol, kapanmış ve UYAP’ta kapalı dosya süzgece girmez', () => {
    expect(uyapBaglantiSorunu({ durum: 'INCELENIYOR', icraDosyaNo: null })).toBeNull()
    expect(uyapBaglantiSorunu({ durum: 'IDARI_YOL', icraDosyaNo: null })).toBeNull()
    expect(uyapBaglantiSorunu({ durum: 'TAHSIL', icraDosyaNo: '2026/1', uyapSenkronAt: null })).toBeNull()
    expect(uyapBaglantiSorunu({ durum: 'ITIRAZ', uyapDurum: 'Kapandı', icraDosyaNo: '2026/1', uyapSenkronAt: null })).toBeNull()
  })
  it('takibi açılmış dosyada: esas no yok, eşleşme sorunu ya da hiç çekilmemiş', () => {
    expect(uyapBaglantiSorunu({ durum: 'TAKIP_ACILDI', icraDosyaNo: ' ' })).toMatch(/esas no girilmemiş/)
    expect(uyapBaglantiSorunu({ durum: 'ITIRAZ', icraDosyaNo: '2026/1', uyapEslesme: 'BASKA_DAIRE', uyapSenkronAt: BUGUN })).toBe('Başka dairede görünüyor')
    expect(uyapBaglantiSorunu({ durum: 'DAVA', icraDosyaNo: '2026/1', uyapEslesme: null, uyapSenkronAt: null })).toBe("UYAP'tan hiç çekilmedi")
    expect(uyapBaglantiSorunu({ durum: 'HAVUZDA', icraDosyaNo: '2026/9', uyapEslesme: null, uyapSenkronAt: null })).toBe("UYAP'tan hiç çekilmedi")
    expect(uyapBaglantiSorunu({ durum: 'ITIRAZ', icraDosyaNo: '2026/1', uyapEslesme: 'OK', uyapSenkronAt: BUGUN })).toBeNull()
  })
  it('GN-03 eşleşme kodları öncelik 0 kart açar; süzgeç bütün eşleşmeyenleri gösterir', () => {
    const t = masaTablosu([
      dosya('30', { uyapEslesme: 'BULUNAMADI' }),
      dosya('31', { icraDosyaNo: null }),
      dosya('32'),
    ], [], [], AVUKAT, BUGUN)
    expect(t.find((s) => s.dosyaNo === 'HK-30')!.simdi).toMatchObject({ kural: 'GN-03', oncelik: 0, rol: 'H' })
    expect(t.find((s) => s.dosyaNo === 'HK-31')!.simdi).toBeNull()
    expect(masaSuz(t, 'uyap').map((s) => s.dosyaNo)).toEqual(['HK-30', 'HK-31'])
  })
})

describe('dava aşamasındaki dosya mahkeme/esas/duruşmayla görünür', () => {
  it('ana dava (davacı, ilk derece) satıra eklenir', () => {
    const t = masaTablosu([dosya('40', { durum: 'DAVA' })], [], [
      { dosyaId: '40', rolumuz: 'DAVALI', mahkemeTuru: 'SULH_HUKUK', mahkemeYer: 'X', mahkemeNo: '1' },
      { dosyaId: '40', rolumuz: 'DAVACI', derece: 1, mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'İstanbul', mahkemeNo: '5', esasYil: 2026, esasSira: 123, sonrakiDurusma: gunSonra(18) },
    ], AVUKAT, BUGUN)
    expect(t[0].dava).toEqual({ mahkeme: 'İstanbul 5. Asliye Hukuk Mahkemesi', esas: '2026/123', durusma: gunSonra(18) })
  })
})
