/**
 * S31 · karar kartı (talebe bağlılık kırmızısı, kısmi kabul, istinaf TETİK BEKLİYOR), tahsilat onayı (yalnız onaylı
 * UYAP "Yatan Para" farkı toplama girer; makbuz evrakı girmez), kapalı dosya radarı (SN-06), Dava Panosu ve genel durum,
 * DA/SN kuralları. Kurgusal veriler.
 */
import { describe, expect, it } from 'vitest'
import { istinafSureOnerisi, kararKontrol, kararSonrasiAdimlar, type KararGirdi } from '@/lib/konsrucu/dava/karar'
import { paraOzeti, tahsilatAdaylari, tahsilatKararVerilebilirMi, tahsilToplami, type TahsilatOlayi } from '@/lib/konsrucu/dava/tahsilat-onay'
import { kapaliRadarda, kapanisOnayTuru, uyapKapaliMi, yenidenSorguGerekli } from '@/lib/konsrucu/dava/kapali-radar'
import { genelDurum, panoSatiri, panoSirala, panoSuz, type PanoGirdi } from '@/lib/konsrucu/dava/pano'
import { davaKurallari, type DavaGercekleri } from '@/lib/konsrucu/dava/kurallar'
import { kararBildirimi, tahsilatBildirimi } from '@/lib/konsrucu/arabuluculuk/bildirim-taslak'

const SIMDI = new Date('2026-09-27T09:00:00Z')
const karar: KararGirdi = { hukum: 'KISMEN_KABUL', kabulAsil: 1000000, davaDegeri: 1234567.89, takipToplam: 1300000, kararTarihi: new Date('2026-09-20'), vekaletUcretiAleyhe: null, yargilamaGideriAleyhe: null, vekaletUcretiYon: null, inkarTazminatiYon: null }

describe('karar kartı (SEN-08 deseni)', () => {
  it('kısmi kabul: SN-03 daraltma uyarısı, kırmızı yok', () => {
    const u = kararKontrol(karar, SIMDI)
    expect(u.map((x) => x.kod)).toContain('SN-03')
    expect(u.some((x) => x.seviye === 'KIRMIZI')).toBe(false)
    expect(u.find((x) => x.kod === 'SN-05')?.mesaj).toMatch(/HMK 341.*teyit gerekli/)
  })
  it('kabul edilen tutar dava değerini aşınca KIRMIZI (talebe bağlılık)', () => {
    const u = kararKontrol({ ...karar, hukum: 'KABUL', kabulAsil: 1300000 }, SIMDI)
    expect(u.find((x) => x.kod === 'KR-TALEBE-BAGLILIK')?.seviye).toBe('KIRMIZI')
  })
  it('hüküm/tarih eksik ya da ileri tarih kırmızı; aleyhe vekâlet ücreti bildirim ister', () => {
    expect(kararKontrol({ ...karar, hukum: null, kararTarihi: null }, SIMDI).filter((x) => x.seviye === 'KIRMIZI').map((x) => x.kod)).toEqual(['KR-HUKUM', 'KR-TARIH'])
    expect(kararKontrol({ ...karar, kararTarihi: new Date('2026-10-20') }, SIMDI).some((x) => x.kod === 'KR-TARIH')).toBe(true)
    expect(kararKontrol({ ...karar, vekaletUcretiAleyhe: 5000 }, SIMDI).some((x) => x.kod === 'KR-ALEYHE')).toBe(true)
  })
  it('karar sonrası: takibe devam, daraltma, istinaf TETİK BEKLİYOR (gerekçeli tebliğ yok), İİK 78, SN-08', () => {
    const a = kararSonrasiAdimlar({ hukum: 'KISMEN_KABUL', gerekceliTebligTarihi: null, kesinlesmeTarihi: null, rolumuz: 'DAVACI' })
    expect(a.map((x) => x.kod)).toEqual(['TAKIBE_DEVAM', 'SN-03', 'ISTINAF', 'IIK78', 'SN-08', 'KESINLESME'])
    expect(a.find((x) => x.kod === 'ISTINAF')).toMatchObject({ durum: 'TETIK_BEKLIYOR', onayGerekir: 'KANUN_YOLU' })
    expect(kararSonrasiAdimlar({ hukum: 'RET', gerekceliTebligTarihi: new Date('2026-09-25'), kesinlesmeTarihi: new Date('2026-10-20'), rolumuz: 'DAVACI' }).find((x) => x.kod === 'ISTINAF')?.durum).toBe('ACIK')
  })
  it('istinaf süresi önerisi: tebliğ + 2 hafta, ihtiyatlı, teyit gerekli', () => {
    const o = istinafSureOnerisi(new Date('2026-09-25'))
    expect(o.onerilenIhtiyatli.toISOString().slice(0, 10)).toBe('2026-10-09')
    expect(o.dayanak).toMatch(/teyit gerekli/)
  })
  it('karar bildirimi taslağı aleyhe kalemleri söyler', () => {
    const m = kararBildirimi({ kunye: { musteriUnvani: 'Kurgu Sigorta', hukukDosyaNo: 'H', hasarDosyaNo: null, icraDairesi: null, icraEsas: null }, mahkeme: 'Kurgukent 1. Asliye Hukuk', esas: '2026/1', kararTarihi: new Date('2026-09-20'), hukum: 'KISMEN_KABUL', kabulAsil: 1000, davaDegeri: 2000, aleyheVekalet: 300, aleyheGider: null })
    expect(m).toMatch(/kısmen kabulüne/)
    expect(m).toMatch(/Aleyhimize hükmedilen vekâlet ücreti/)
  })
})

describe('tahsilat onayı (SEN-10 deseni)', () => {
  const olaylar: TahsilatOlayi[] = [
    { id: 't1', tip: 'TAHSILAT', altTip: 'TAHSILAT_BORCLUDAN', teyit: 'ADAY', tutar: 1000, tarih: new Date('2026-09-20'), createdAt: new Date('2026-09-20') },
    { id: 't2', tip: 'DURUM', altTip: 'TAHSILAT_SINYALI', teyit: 'ADAY', tutar: 1000, tarih: null, createdAt: new Date('2026-09-20'), aciklama: 'Tahsilat Makbuzu' },
    { id: 't3', tip: 'TAHSILAT', altTip: null, teyit: null, tutar: 500, tarih: null, createdAt: new Date('2026-01-01') },
  ]
  it('onaydan önce toplam 0; aday yalnız TAHSILAT_BORCLUDAN', () => {
    expect(tahsilToplami(olaylar)).toBe(0)
    expect(tahsilatAdaylari(olaylar).map((o) => o.id)).toEqual(['t1'])
  })
  it('onaydan sonra "tahsil 1.000 TL"; makbuz sinyali ve eski TAHSİLAT satırı toplama girmez', () => {
    const onayli = olaylar.map((o) => (o.id === 't1' ? { ...o, teyit: 'TEYITLI' } : o))
    expect(tahsilToplami(onayli)).toBe(1000)
    expect(paraOzeti({ talep: 5000, olaylar: onayli })).toEqual({ talep: 5000, tahsil: 1000, kalan: 4000, bekleyenAday: 0 })
  })
  it('yalnız ADAY TAHSILAT_BORCLUDAN karara bağlanabilir', () => {
    expect(tahsilatKararVerilebilirMi({ altTip: 'TAHSILAT_SINYALI', teyit: 'ADAY' }).ok).toBe(false)
    expect(tahsilatKararVerilebilirMi({ altTip: 'TAHSILAT_BORCLUDAN', teyit: 'TEYITLI' }).ok).toBe(false)
    expect(tahsilatKararVerilebilirMi({ altTip: 'TAHSILAT_BORCLUDAN', teyit: 'ADAY' }).ok).toBe(true)
  })
  it('tahsilat bildirimi hukuki tahsil tarihi olmadığını söyler', () => {
    expect(tahsilatBildirimi({ kunye: { musteriUnvani: 'K', hukukDosyaNo: null, hasarDosyaNo: null, icraDairesi: null, icraEsas: null }, tutar: 1000, gorulmeTarihi: new Date('2026-09-20'), toplamTahsil: 1000 })).toMatch(/hukuki tahsil tarihi değildir/)
  })
})

describe('kapalı dosya radarı (SEN-09 deseni)', () => {
  it('UYAP kapalı + sebep yok/BILINMIYOR → radarda', () => {
    expect(uyapKapaliMi('Kapalı')).toBe(true)
    expect(uyapKapaliMi('Açık (durdurulmuş : Takibe İtiraz)')).toBe(false)
    expect(kapaliRadarda({ uyapDurum: 'KAPALI', kapanisSebebi: null })).toBe(true)
    expect(kapaliRadarda({ uyapDurum: 'KAPALI', kapanisSebebi: 'BILINMIYOR' })).toBe(true)
    expect(kapaliRadarda({ uyapDurum: 'KAPALI', kapanisSebebi: 'TAHSIL' })).toBe(false)
  })
  it('haftada bir yeniden sorgu; müvekkil kararı gerektiren sebepler', () => {
    expect(yenidenSorguGerekli({ uyapDurum: 'Kapalı', kapanisSebebi: null, uyapSenkronAt: new Date('2026-09-19') }, SIMDI)).toBe(true)
    expect(yenidenSorguGerekli({ uyapDurum: 'Kapalı', kapanisSebebi: null, uyapSenkronAt: new Date('2026-09-25') }, SIMDI)).toBe(false)
    expect(kapanisOnayTuru('SULH')).toBe('SULH_ISKONTO')
    expect(kapanisOnayTuru('TAHSIL')).toBeNull()
  })
})

describe('Dava Panosu', () => {
  const taban: PanoGirdi = {
    davaId: 'd1', dosyaId: 'f1', hukukDosyaNo: 'H-1', mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'Kurgukent', mahkemeNo: '51', esasYil: 2026, esasSira: 384,
    evre: null, durum: 'DERDEST', rolumuz: 'DAVACI', sonrakiDurusma: new Date('2026-10-15T07:00:00Z'), onIncelemeTarihi: null, uyapDosyaId: null,
    asamaDetayJson: { kaynakTuru: 'GERI_DOLDURMA', teyit: 'ADAY' }, updatedAt: new Date('2026-09-20'),
    islemler: [{ tur: 'CEVABA_CEVAP', tarih: new Date('2026-09-21'), createdAt: new Date('2026-09-21'), teyit: 'ADAY' }],
    sureler: [{ tur: 'IIK67', onaylananSonGun: null, onerilenIhtiyatli: new Date('2026-10-10'), durum: 'ACIK' }],
  }
  it('geri doldurma kaydı TEYITSIZ; evre işlemden türetilir; en yakın süre onaysız', () => {
    const s = panoSatiri(taban, SIMDI)
    expect(s.guven).toBe('TEYITSIZ')
    expect(s.evre).toBe('Dilekçeler')
    expect(s.evreTuretildi).toBe(true)
    expect(s.sureKalanGun).toBe(13)
    expect(s.sureOnaysiz).toBe(true)
    expect(s.mahkemeEsas).toBe('Kurgukent 51. Asliye Hukuk 2026/384')
  })
  it('elle ve teyitli kayıt TEYITLI; 60 gün sessiz ESKIMIS', () => {
    expect(panoSatiri({ ...taban, asamaDetayJson: { kaynakTuru: 'ELLE', teyit: 'TEYITLI' } }, SIMDI).guven).toBe('TEYITLI')
    expect(panoSatiri({ ...taban, asamaDetayJson: null, updatedAt: new Date('2026-07-01'), islemler: [] }, SIMDI).guven).toBe('ESKIMIS')
  })
  it('süzgeçler ve sıralama: onaysız ve yakın süre önde; dava açılmamış İİK 67 satırı', () => {
    const a = panoSatiri(taban, SIMDI)
    const b = panoSatiri({ ...taban, davaId: 'd2', rolumuz: 'DAVALI', asamaDetayJson: { kaynakTuru: 'ELLE', teyit: 'TEYITLI' }, sureler: [{ tur: 'HMK127', onaylananSonGun: new Date('2026-12-01'), onerilenIhtiyatli: null, durum: 'ACIK' }] }, SIMDI)
    const c = panoSatiri({ ...taban, davaId: null, esasYil: null, esasSira: null, islemler: [], sureler: [{ tur: 'IIK67', onaylananSonGun: new Date('2026-10-05'), onerilenIhtiyatli: null, durum: 'ACIK' }] }, SIMDI)
    expect(c.mahkemeEsas).toBe('(dava açılmadı)')
    expect(c.davaAcilmadi).toBe(true)
    expect(panoSirala([b, a, c]).map((x) => x.anahtar)).toEqual(['sure:f1', 'd1', 'd2'])
    expect(panoSuz([a, b, c], 'teyitsiz').map((x) => x.anahtar)).toContain('d1')
    expect(panoSuz([a, b, c], 'karsi').map((x) => x.anahtar)).toEqual(['d2'])
    expect(panoSuz([a, b, c], 'sure30').map((x) => x.anahtar)).toEqual(['d1', 'sure:f1'])
  })
  it('genel durum eksenlerden türetilir; para kalanı hesaplanır', () => {
    const g = genelDurum({ icraEksen: 'DURDU_ITIRAZ', arabEksen: 'SON_TUTANAK_DIGER', davaEksen: 'KARAR', talep: 1234567.89, tahsil: 1000, acikSure: 2, onaysizSure: 1 })
    expect(g).toMatchObject({ icra: 'Durdu (itiraz)', arab: 'Anlaşamama', dava: 'Karar', acikSure: 2, eksenYok: false })
    expect(g.para.kalan).toBe(1233567.89)
    expect(genelDurum({ icraEksen: null, arabEksen: null, davaEksen: null, talep: null, tahsil: 0, acikSure: 0, onaysizSure: 0 }).eksenYok).toBe(true)
  })
})

describe('DA / SN kuralları', () => {
  const taban: DavaGercekleri = {
    arabuluculuk: null, yolSecimi: null, dava: null, onKontrol: null, dilekceDurumu: 'YOK', davaAdayiVar: false, iik67: null,
    kararEvrakiVar: false, kararSonrasiYolSecildi: false, uyapDurum: null, kapanisSebebi: null, tahsilatAdayi: { sayi: 0, tutar: null }, bildirimBekleyen: [],
  }
  const kod = (g: Partial<DavaGercekleri>) => davaKurallari({ ...taban, ...g }).map((k) => k.kod)
  const dava = { rolumuz: 'DAVACI', acilisTarihi: new Date('2026-08-07'), hukum: null, kararOnayAt: null, gerekceliTebligTarihi: null }
  it('DA-01 anlaşamama sonrası dava yok', () => expect(kod({ arabuluculuk: { sonuc: 'ANLASAMAMA', sonTutanakTarihi: new Date('2026-07-24') } })).toContain('DA-01'))
  it('anlaşma sonrası DA-01 yok', () => expect(kod({ arabuluculuk: { sonuc: 'ANLASMA', sonTutanakTarihi: new Date('2026-07-24') } })).not.toContain('DA-01'))
  it('DA-04 dilekçe imzaya hazır, dava yok', () => expect(kod({ yolSecimi: 'GENEL_ALACAK', dilekceDurumu: 'IMZAYA_HAZIR' })).toContain('DA-04'))
  it('DA-05 aday dava', () => expect(kod({ davaAdayiVar: true })).toContain('DA-05'))
  it('DA-06a / DA-06b', () => {
    expect(kod({ dava, iik67: { durum: 'ACIK', onaylananSonGun: new Date('2027-06-23'), onerilenIhtiyatli: null } })).toContain('DA-06a')
    const r = davaKurallari({ ...taban, dava, iik67: { durum: 'ACIK', onaylananSonGun: new Date('2026-08-01'), onerilenIhtiyatli: null } })
    expect(r[0].kod).toBe('DA-06b')
    expect(r[0].oncelik).toBe(0)
  })
  it('DA-07 karşı taraf davası', () => expect(kod({ dava: { ...dava, rolumuz: 'DAVALI' } })).toContain('DA-07'))
  it('SN-01 … SN-05', () => {
    expect(kod({ dava, kararEvrakiVar: true })).toContain('SN-01')
    const k = kod({ dava: { ...dava, hukum: 'KISMEN_KABUL', kararOnayAt: new Date() } })
    expect(k).toEqual(expect.arrayContaining(['SN-02', 'SN-03', 'SN-04', 'SN-05']))
  })
  it('SN-06 kapalı radar, SN-07 tahsilat, SN-08 bildirim', () => {
    expect(kod({ uyapDurum: 'Kapalı' })).toContain('SN-06')
    expect(davaKurallari({ ...taban, tahsilatAdayi: { sayi: 1, tutar: 1000 } }).find((k) => k.kod === 'SN-07')?.oneri).toMatch(/1\.000,00 TL/)
    expect(kod({ bildirimBekleyen: ['KARAR'] })).toContain('SN-08')
  })
})
