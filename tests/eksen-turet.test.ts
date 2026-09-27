/**
 * S15 · Üç eksen türetme (lib/konsrucu/eksen/turet.ts) — asimetri vakaları ve D1–D3 desenleri.
 *
 * Kilitler (06 M2/M3; docs/04 §3):
 *   • Riski ARTIRAN aday (itiraz, durum metni) teyitsiz de görünür; riski AZALTAN geçiş (kesinleşme, tahsil,
 *     kapanış, anlaşma, davada kesinleşme) yalnız avukat onaylı olgudan.
 *   • HACİZ hiçbir türüyle kesinleşme değildir (K2). İADE tebliğ değildir (K3). İcra ve dava ayrı eksen (K2).
 *   • Eski satır (teyit null) ve reddedilen aday hesaba girmez; veri yokken program "bilmiyorum" der.
 * Kurgusal kimlikler; kişisel veri yok.
 */
import { describe, it, expect } from 'vitest'
import { eksenJsonKur, eksenTuret, type EksenGirdi, type EksenOlay } from '@/lib/konsrucu/eksen/turet'
import { eksenGecisleri } from '@/lib/konsrucu/eksen/kaydet'

const g = (p: Partial<EksenGirdi> = {}): EksenGirdi => ({
  durum: 'TAKIP_ACILDI', icraDosyaNo: '2026/0001', takipTarihi: new Date('2026-06-21'), tevziVar: false, yolOnayli: false,
  kapanisSebebi: null, kapanisAt: null, borclular: [], olaylar: [], arabuluculuk: null, yolSecimi: null, davalar: [], eskiAsamalar: [], ...p,
})
let n = 0
const olay = (altTip: string, teyit: string | null = 'ADAY', p: Partial<EksenOlay> = {}): EksenOlay => ({
  id: `o${++n}`, altTip, teyit, borcluId: null, hukukiTarih: new Date('2026-06-24'), sonuc: null, kural: 'EK1-TEST@1', ...p,
})
const bt = (p: Record<string, unknown> = {}) => ({
  id: `bt${++n}`, tebligTarihi: null, tebligSonucu: null, itirazVar: null, itirazTipi: null, itirazAlacakliyaTebligTarihi: null, ...p,
}) as NonNullable<EksenGirdi['borclular'][number]['takip']>

describe('İCRA — takip öncesi, idari yol, kapanış', () => {
  it('takip yoksa TAKIP_YOK; tevzi var esas yoksa TEVZI', () => {
    expect(eksenTuret(g({ durum: 'INCELENIYOR', icraDosyaNo: null, takipTarihi: null })).icra.deger).toBe('TAKIP_YOK')
    expect(eksenTuret(g({ durum: 'TAKIBE_HAZIR', icraDosyaNo: null, takipTarihi: null, tevziVar: true })).icra.deger).toBe('TEVZI')
  })
  it('İDARİ_YOL ekseni yalnız avukat onaylı yoldan (B12)', () => {
    expect(eksenTuret(g({ durum: 'IDARI_YOL', icraDosyaNo: null, takipTarihi: null, yolOnayli: true })).icra).toMatchObject({ deger: 'IDARI_YOL', teyit: 'TEYITLI', kaynak: 'AVUKAT' })
    const onaysiz = eksenTuret(g({ durum: 'IDARI_YOL', icraDosyaNo: null, takipTarihi: null, yolOnayli: false })).icra
    expect(onaysiz.deger).toBe('TAKIP_YOK')
    expect(onaysiz.notlar.join(' ')).toMatch(/onaylayın/)
  })
  it('TAHSIL/KAPALI yalnız avukatın kapanış kaydından; BILINMIYOR sebep dosyayı kapatmaz', () => {
    expect(eksenTuret(g({ kapanisSebebi: 'TAHSIL', kapanisAt: new Date() })).icra.deger).toBe('TAHSIL')
    expect(eksenTuret(g({ kapanisSebebi: 'SULH', kapanisAt: new Date() })).icra.deger).toBe('KAPALI')
    expect(eksenTuret(g({ kapanisSebebi: 'BILINMIYOR', kapanisAt: new Date() })).icra.deger).not.toBe('KAPALI')
    expect(eksenTuret(g({ durum: 'KAPANDI' })).icra.deger).not.toBe('KAPALI') // eski durum kapanış değildir
  })
})

describe('İCRA — asimetrik güven', () => {
  it('S15 kabul 1: UYAP itiraz adayı → "Durdu - itiraz (UYAP, teyitsiz)"', () => {
    const s = eksenTuret(g({ olaylar: [olay('ITIRAZ')], borclular: [{ id: 'b1', takip: null }] }))
    expect(s.icra).toMatchObject({ deger: 'DURDU_ITIRAZ', teyit: 'TEYITSIZ', kaynak: 'UYAP' })
  })
  it('durum metni adayı (tarihsiz) da riski artırır → DURDU_ITIRAZ teyitsiz', () => {
    const s = eksenTuret(g({ olaylar: [olay('DURDURMA_ITIRAZ', 'ADAY', { hukukiTarih: null })], borclular: [{ id: 'b1', takip: null }] }))
    expect(s.icra.deger).toBe('DURDU_ITIRAZ')
  })
  it('S15 kabul 5: KESİNLEŞME adayı ekseni KESİNLEŞTİ yapmaz; yalnız not düşer', () => {
    const s = eksenTuret(g({ durum: 'TEBLIG_EDILDI', olaylar: [olay('KESINLESME_SERHI')], borclular: [{ id: 'b1', takip: bt({ tebligSonucu: 'TEBLIG', tebligTarihi: new Date('2026-06-01') }) }] }))
    expect(s.icra.deger).not.toBe('KESINLESTI')
    expect(s.icra.deger).toBe('ITIRAZ_SURESI')
    expect(s.icra.notlar.join(' ')).toMatch(/kesinleşme sinyali/)
  })
  it('onaylı kesinleşme → KESİNLEŞTİ (avukat); onaylı borçlu malı haczi varsa İNFAZ', () => {
    const b = [{ id: 'b1', takip: bt({ tebligSonucu: 'TEBLIG', tebligTarihi: new Date('2026-06-01'), itirazVar: false }) }]
    expect(eksenTuret(g({ olaylar: [olay('KESINLESME_SERHI', 'TEYITLI')], borclular: b })).icra).toMatchObject({ deger: 'KESINLESTI', teyit: 'TEYITLI', kaynak: 'AVUKAT' })
    expect(eksenTuret(g({ olaylar: [olay('KESINLESME_SERHI', 'TEYITLI'), olay('ICRAI_HACIZ', 'TEYITLI')], borclular: b })).icra.deger).toBe('INFAZ')
  })
  it('K2: hiçbir haciz türü (dosya alacağına, ihtiyati, borçlu malı — onaylı bile) kesinleşme üretmez', () => {
    for (const h of ['MUVEKKIL_ALACAGINA_HACIZ', 'IHTIYATI_HACIZ', 'ICRAI_HACIZ']) {
      for (const t of ['ADAY', 'TEYITLI']) {
        const s = eksenTuret(g({ durum: 'TEBLIG_EDILDI', olaylar: [olay(h, t)], borclular: [{ id: 'b1', takip: bt({ tebligSonucu: 'TEBLIG', tebligTarihi: new Date('2026-06-01') }) }] }))
        expect(['KESINLESTI', 'INFAZ'], `${h}/${t}`).not.toContain(s.icra.deger)
      }
    }
  })
  it('tebliğ adayı onaylanana kadar "Tebliğ bekleniyor · tebliğ sinyali (teyitsiz)"', () => {
    const s = eksenTuret(g({ olaylar: [olay('TEBLIG_SONUCU', 'ADAY', { borcluId: 'b1' })], borclular: [{ id: 'b1', takip: null }] }))
    expect(s.icra.deger).toBe('TEBLIG_BEKLENIYOR')
    expect(s.icra.notlar.join(' ')).toMatch(/tebliğ sinyali \(teyitsiz\)/i)
  })
  it('onaylı tebliğ → İTİRAZ SÜRESİ (onaylı); onaylı İADE → tebliğ bekleniyor, süre yok (K3)', () => {
    expect(eksenTuret(g({ borclular: [{ id: 'b1', takip: bt({ tebligSonucu: 'TEBLIG', tebligTarihi: new Date('2026-06-25') }) }] })).icra)
      .toMatchObject({ deger: 'ITIRAZ_SURESI', teyit: 'TEYITLI' })
    const iade = eksenTuret(g({ borclular: [{ id: 'b1', takip: bt({ tebligSonucu: 'IADE' }) }] })).icra
    expect(iade.deger).toBe('TEBLIG_BEKLENIYOR')
    expect(iade.notlar.join(' ')).toMatch(/İADE/)
  })
  it('S23 kabul 5: iki borçlu farklı durumda → "Kısmen durdu"', () => {
    const s = eksenTuret(g({
      borclular: [
        { id: 'b1', takip: bt({ tebligSonucu: 'TEBLIG', tebligTarihi: new Date('2026-06-25'), itirazVar: true, itirazTipi: 'TAM' }) },
        { id: 'b2', takip: null },
      ],
    }))
    expect(s.icra.deger).toBe('KISMEN_DURDU')
    expect(s.borclular.map((b) => b.deger)).toEqual(['DURDU_ITIRAZ', 'TEBLIG_BEKLENIYOR'])
  })
  it('kısmi itiraz tek borçluda da "Kısmen durdu" (itiraz edilmeyen kısım için takip sürer)', () => {
    const s = eksenTuret(g({ borclular: [{ id: 'b1', takip: bt({ itirazVar: true, itirazTipi: 'KISMI' }) }] }))
    expect(s.icra.deger).toBe('KISMEN_DURDU')
  })
  it('bütün borçlular onaylı tam itiraz → DURDU_ITIRAZ (onaylı)', () => {
    const s = eksenTuret(g({ borclular: [{ id: 'b1', takip: bt({ itirazVar: true, itirazTipi: 'TAM', itirazAlacakliyaTebligTarihi: new Date('2026-07-01') }) }] }))
    expect(s.icra).toMatchObject({ deger: 'DURDU_ITIRAZ', teyit: 'TEYITLI', kaynak: 'AVUKAT' })
    expect(s.icra.notlar).toEqual([])
  })
  it('avukat "itiraz yok" dedi ama UYAP itiraz sinyali geldi → teyitsiz DURDU ve çelişki notu (riski artıran görünür)', () => {
    const s = eksenTuret(g({ olaylar: [olay('ITIRAZ', 'ADAY', { borcluId: 'b1' })], borclular: [{ id: 'b1', takip: bt({ tebligSonucu: 'TEBLIG', tebligTarihi: new Date('2026-06-01'), itirazVar: false }) }] }))
    expect(s.icra.deger).toBe('DURDU_ITIRAZ')
    expect(s.icra.teyit).toBe('TEYITSIZ')
    expect(s.borclular[0].notlar.join(' ')).toMatch(/çelişiyor/)
  })
  it('reddedilen aday ve eski satır (teyit null) hesaba girmez', () => {
    const s = eksenTuret(g({ olaylar: [olay('ITIRAZ', 'REDDEDILDI'), olay('ITIRAZ', null)], borclular: [{ id: 'b1', takip: null }] }))
    expect(s.icra.deger).toBe('TEBLIG_BEKLENIYOR')
    expect(s.icra.kaynak).toBe('TAHMIN')
  })
  it('veri yok + eski durum ilerlemiş (itiraz/dava) → BİLİNMİYOR "teyit edin" (güvenli hata); takip açılışında tahmin', () => {
    expect(eksenTuret(g({ durum: 'DAVA', borclular: [{ id: 'b1', takip: null }] })).icra.deger).toBe('BILINMIYOR')
    expect(eksenTuret(g({ durum: 'KESINLESTI', borclular: [{ id: 'b1', takip: null }] })).icra.deger).toBe('BILINMIYOR')
    expect(eksenTuret(g({ durum: 'TAKIP_ACILDI', borclular: [{ id: 'b1', takip: null }] })).icra).toMatchObject({ deger: 'TEBLIG_BEKLENIYOR', kaynak: 'TAHMIN' })
  })
})

describe('ARABULUCULUK ekseni', () => {
  const a = (p: Record<string, unknown>) => ({ id: 'a1', basvuruTarihi: null, sonTutanakTarihi: null, sonuc: null, onayAt: null, ...p }) as EksenGirdi['arabuluculuk']
  it('kayıt yok → YOK; yol seçimi arabuluculuk → HAZIRLIK', () => {
    expect(eksenTuret(g()).arab.deger).toBe('YOK')
    expect(eksenTuret(g({ yolSecimi: { id: 'y1', secim: 'ARABULUCULUK_IIK67' } })).arab).toMatchObject({ deger: 'HAZIRLIK', teyit: 'TEYITLI' })
  })
  it('başvuru → DEVAM; anlaşamama → SON_TUTANAK_DIGER (onaysız da görünür: riski artırır)', () => {
    expect(eksenTuret(g({ arabuluculuk: a({ basvuruTarihi: new Date('2026-07-01') }) })).arab.deger).toBe('DEVAM')
    expect(eksenTuret(g({ arabuluculuk: a({ basvuruTarihi: new Date('2026-07-01'), sonTutanakTarihi: new Date('2026-07-20'), sonuc: 'ANLASAMAMA' }) })).arab)
      .toMatchObject({ deger: 'SON_TUTANAK_DIGER', teyit: 'TEYITSIZ' })
  })
  it('ANLAŞMA riski azaltır: onaysızken DEVAM, onaylıyken SON_TUTANAK_ANLASMA', () => {
    const t = { basvuruTarihi: new Date('2026-07-01'), sonTutanakTarihi: new Date('2026-07-20'), sonuc: 'ANLASMA' }
    expect(eksenTuret(g({ arabuluculuk: a(t) })).arab.deger).toBe('DEVAM')
    expect(eksenTuret(g({ arabuluculuk: a({ ...t, onayAt: new Date() }) })).arab.deger).toBe('SON_TUTANAK_ANLASMA')
  })
  it('eski Asama kaydı teyitsiz okunur; eski "anlaşıldı" riski azaltmaz (DEVAM)', () => {
    expect(eksenTuret(g({ eskiAsamalar: [{ id: 'as1', tur: 'ARABULUCULUK', durum: 'DEVAM', sonuc: null }] })).arab).toMatchObject({ deger: 'DEVAM', kaynak: 'ESKI_KAYIT' })
    expect(eksenTuret(g({ eskiAsamalar: [{ id: 'as1', tur: 'ARABULUCULUK', durum: 'SONUCLANDI', sonuc: 'anlasilmadi' }] })).arab.deger).toBe('SON_TUTANAK_DIGER')
    expect(eksenTuret(g({ eskiAsamalar: [{ id: 'as1', tur: 'ARABULUCULUK', durum: 'SONUCLANDI', sonuc: 'anlasildi' }] })).arab.deger).toBe('DEVAM')
  })
})

describe('DAVA ekseni (icradan ayrı — K2)', () => {
  const d = (p: Record<string, unknown>) => ({ id: 'd1', durum: 'DERDEST', rolumuz: 'DAVACI', derece: 1, kesinlesmeTarihi: null, kesinlesmeBelgeId: null, kararOnayAt: null, ...p }) as EksenGirdi['davalar'][number]
  it('dava kaydı → DERDEST (onaylı); icra ekseni ayrı kalır', () => {
    const s = eksenTuret(g({ davalar: [d({})], borclular: [{ id: 'b1', takip: bt({ itirazVar: true, itirazTipi: 'TAM' }) }] }))
    expect(s.dava).toMatchObject({ deger: 'DERDEST', teyit: 'TEYITLI' })
    expect(s.icra.deger).toBe('DURDU_ITIRAZ')
  })
  it('kesinleşme şerhi yokken dava kesinleşmiş gösterilmez; karar kartı onaysızsa KARAR teyitsiz', () => {
    expect(eksenTuret(g({ davalar: [d({ durum: 'KESINLESTI' })] })).dava).toMatchObject({ deger: 'KARAR', teyit: 'TEYITSIZ' })
    expect(eksenTuret(g({ davalar: [d({ durum: 'KESINLESTI', kesinlesmeTarihi: new Date(), kesinlesmeBelgeId: 'bx' })] })).dava.deger).toBe('KESINLESTI')
    expect(eksenTuret(g({ davalar: [d({ durum: 'KARAR' })] })).dava.teyit).toBe('TEYITSIZ')
  })
  it('UYAP dava açıldı sinyali davayı DERDEST yapmaz (İİK 67 kapanmış sanılmasın); yalnız not', () => {
    const s = eksenTuret(g({ olaylar: [olay('DAVA_ACILDI_SINYALI')] }))
    expect(s.dava.deger).toBe('YOK')
    expect(s.dava.notlar.join(' ')).toMatch(/dava açıldı sinyali/)
  })
  it('anlaşamama son tutanağından sonra dava yoksa HAZIRLIK; karşı taraf davası notu', () => {
    const s = eksenTuret(g({ arabuluculuk: { id: 'a1', basvuruTarihi: new Date('2026-07-01'), sonTutanakTarihi: new Date('2026-07-20'), sonuc: 'ANLASAMAMA', onayAt: new Date() } }))
    expect(s.dava.deger).toBe('HAZIRLIK')
    expect(eksenTuret(g({ davalar: [d({ rolumuz: 'DAVALI' })] })).dava.notlar.join(' ')).toMatch(/Karşı taraf davası/)
  })
})

describe('önbellek JSON ve gölge geçişleri', () => {
  it('eksenJson: {icra:{teyit,kaynakTuru,kanitIds}, arab, dava, borclular, surum}', () => {
    const j = eksenJsonKur(eksenTuret(g({ olaylar: [olay('ITIRAZ')], borclular: [{ id: 'b1', takip: null }] })))
    expect(j.icra).toMatchObject({ deger: 'DURDU_ITIRAZ', teyit: 'TEYITSIZ', kaynakTuru: 'UYAP' })
    expect(j.icra.kanitIds.length).toBe(1)
    expect(j.surum).toBe(1)
    expect(j.borclular[0].borcluId).toBe('b1')
  })
  it('geçiş yalnız değer ya da güven değişince yazılır', () => {
    const s = eksenTuret(g({ olaylar: [olay('ITIRAZ')], borclular: [{ id: 'b1', takip: null }] }))
    const ilk = eksenGecisleri({ icra: null, arab: null, dava: null, json: null }, s)
    expect(ilk.map((x) => x.eksen)).toEqual(['ICRA', 'ARAB', 'DAVA'])
    const ayni = eksenGecisleri({ icra: s.icra.deger, arab: s.arab.deger, dava: s.dava.deger, json: eksenJsonKur(s) }, s)
    expect(ayni).toEqual([])
    const teyitDegisti = eksenGecisleri({ icra: 'DURDU_ITIRAZ', arab: s.arab.deger, dava: s.dava.deger, json: { ...eksenJsonKur(s), icra: { teyit: 'TEYITLI' } } }, s)
    expect(teyitDegisti.map((x) => x.eksen)).toEqual(['ICRA'])
  })
})
