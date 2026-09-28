/**
 * Dosya Yol Haritası — gerçekler (şemadan anlık görüntü) ve veritabanı okuyucusu (S20; 06 §8.1).
 * `hamdanGercekler` saf dönüştürücüdür; `yukle.ts` sorguyu aktif müvekkil kapsamıyla yapar ve önbelleği yalnız
 * değiştiyse yazar. Kurgusal veri; kişisel veri kolonları sorguda seçilmez.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HAM_SELECT, hamdanGercekler, ertelemeOku, type HamDosya } from '@/lib/konsrucu/yol-haritasi/gercekler'
import { onbellekDegisti, onbellekJson, siradakiAdim, bosGercekler, durakDurumlari, eksenOzeti } from '@/lib/konsrucu/yol-haritasi'

const m = vi.hoisted(() => ({ findFirst: vi.fn(), ayar: vi.fn(), nabiz: vi.fn(), updateMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { rucuDosyasi: { findFirst: m.findFirst, updateMany: m.updateMany }, ayarlar: { findUnique: m.ayar }, eklentiNabiz: { findFirst: m.nabiz } },
}))
import { gerceklerOku, onbellekGuncelle, yolHaritasiYukle } from '@/lib/konsrucu/yol-haritasi/yukle'

const T = (s: string) => new Date(s)
const ondalik = (n: number) => ({ toString: () => String(n), valueOf: () => String(n) }) // Prisma.Decimal benzeri

function ham(): HamDosya {
  return {
    id: 'd1', hukukDosyaNo: 'HK-2026-001', durum: 'ITIRAZ', yol: 'KLASIK', yolGuven: 0.7, yolNeden: null, yolOnayAt: null, yolOnaylayanId: null,
    icraEksen: 'DURDU_ITIRAZ', arabEksen: null, davaEksen: null, eksenJson: { icra: { teyit: 'TEYITLI', kanitIds: [] } }, onarimDurumu: null, rucuSebebiKod: 'KOD', brans: 'ZMMS',
    zamanasimi: null, yetkiliIcra: 'İstanbul', icraDairesi: 'İstanbul 5. İcra Dairesi', icraDosyaNo: '2026/5', takipTarihi: T('2026-01-10T06:00:00Z'),
    uyapDurum: 'Açık', uyapSenkronAt: T('2026-09-27T08:00:00Z'), uyapEslesme: 'OK', uyapEslesmeNot: null, uyapHesapJson: { tahsilat: 1500 },
    rucuTutari: ondalik(61728.5), asilAlacak: null, kapanisSebebi: null, kapanisAt: null,
    cikarimJson: { onay: { ok: true, tarih: '2026-01-06T10:00:00.000Z' }, tevzi: { at: '2026-01-07T10:00:00.000Z', birimAdi: 'İstanbul İcra' }, aciklama: 'serbest metin' },
    createdAt: T('2026-01-02T06:00:00Z'),
    musteri: { ad: 'Ray Sigorta A.Ş.' },
    belgeler: [{ id: 'b1', dosyaAdi: 'police.pdf', kategori: 'POLICE', altTur: null, kaynak: 'HUGO_FOTO', metinDurumu: 'OCR', uyapEvrakTuru: null, uyapDosyaTuru: null, davaId: null, belgeTarihi: null, icerikTarihi: T('2025-12-01T06:00:00Z'), createdAt: T('2026-01-02T06:00:00Z') }],
    odemeler: [{ tarih: T('2025-12-15T06:00:00Z'), tutar: ondalik(123457), haricMi: false }],
    borclular: [
      { id: 'br1', tur: 'GERCEK', teyitDurumu: 'TEYIT_EDILDI', takip: { tebligTarihi: T('2026-01-20T06:00:00Z'), tebligSonucu: 'TEBLIG', tebligSekli: 'UETS', tebligKaynakBelgeId: null, itirazVar: true, itirazVerilisTarihi: T('2026-01-25T06:00:00Z'), itirazUyapTarihi: null, itirazTipi: 'TAM', itirazEdilenTutar: ondalik(61728.5), itirazKaynakBelgeId: null, itirazAlacakliyaTebligTarihi: null, silindiAt: null } },
      { id: 'br2', tur: 'KAMU', teyitDurumu: 'TEYIT_GEREK', takip: { tebligTarihi: null, tebligSonucu: null, tebligSekli: null, tebligKaynakBelgeId: null, itirazVar: null, itirazVerilisTarihi: null, itirazUyapTarihi: null, itirazTipi: null, itirazEdilenTutar: null, itirazKaynakBelgeId: null, itirazAlacakliyaTebligTarihi: null, silindiAt: T('2026-02-01T06:00:00Z') } },
    ],
    olaylar: [{ id: 'o1', altTip: 'ITIRAZ', teyit: 'TEYITLI', borcluId: 'br1', hukukiTarih: T('2026-01-25T06:00:00Z'), tarih: null, tutar: null, sonuc: null, kaynakBelgeId: null, kural: 'TB-DURUM@1', createdAt: T('2026-01-26T06:00:00Z') }],
    alanDegerleri: [{ id: 'a1', alan: 'rucuSebebiKod', durum: 'ONAYLI', kaynakTuru: 'HUGO', degerJson: 'KOD', kaynakBelgeId: null, sayfa: null, alinti: null, alintiDogru: null, onayAt: T('2026-01-05T06:00:00Z'), createdAt: T('2026-01-03T06:00:00Z') }],
    takipTalepleri: [{ id: 't1', asilAlacak: ondalik(61728.5), toplam: ondalik(65000), faizTuru: 'YASAL', faizOraniMetni: null, faizBaslangicTuru: 'HER_ODEMEDEN', faizBaslangic: null, hesapIziJson: { dekontlar: [] }, onaylayanId: 'avukat', dondurulduAt: T('2026-01-07T10:00:00Z'), takipTarihi: null, createdAt: T('2026-01-05T06:00:00Z') }],
    sureler: [{ id: 's1', tur: 'IIK67', dayanak: 'İİK 67/1', borcluId: 'br1', davaId: null, arabuluculukId: null, tetikTarihi: T('2026-01-25T06:00:00Z'), tetikTuru: 'TEBLIG', onerilenIhtiyatli: T('2027-01-25T06:00:00Z'), onerilenSonGun: null, onaylananSonGun: null, onayAt: null, ikinciTeyitAt: null, durum: 'ACIK', kapanisKanitiBelgeId: null, kapanisAt: null, kaynakBelgeId: null, kaynakAlinti: null, durmaJson: [{ bas: '2026-02-01' }], createdAt: T('2026-01-26T06:00:00Z') }],
    senkronIsleri: [],
    arabuluculuklar: [],
    etkinlikler: [],
    yolSecimleri: [],
    onayKayitlari: [],
    davalar: [{ id: 'dv1', asamaId: 'as1', rolumuz: 'DAVACI', tur: null, mahkemeTuru: null, usul: null, davaDegeri: null, acilisTarihi: null, esasYil: null, esasSira: null, uyapDosyaId: null, durum: 'HAZIRLIK', onKontrolJson: [{ kod: 'VEKALETNAME', durum: 'EKSIK' }, { bozuk: true }], onIncelemeTarihi: null, sonrakiDurusma: null, hukum: null, kararTarihi: null, kararOnayAt: null, gerekceliTebligTarihi: null, kesinlesmeTarihi: null, createdAt: T('2026-03-01T06:00:00Z') }],
    davaIslemleri: [{ id: 'i1', davaId: 'dv1', tur: 'TENSIP', tarih: null, tebligTarihi: null, teyit: 'ADAY', kaynakBelgeId: null, detayJson: { kesinSureler: [{}, {}] }, createdAt: T('2026-03-02T06:00:00Z') }],
    ciktilar: [{ id: 'c1', tur: 'DAVA', davaId: 'dv1', durum: 'TASLAK', createdAt: T('2026-03-03T06:00:00Z'), surumler: [{ durum: 'IMZAYA_HAZIR' }] }],
    taksitPlanlari: [],
    aktiviteler: [
      { detayJson: { tur: 'YOL_HARITASI_ERTELE', kural: 'TB-02', bitis: '2026-10-01T20:59:59.999Z' }, createdAt: T('2026-09-27T06:00:00Z') },
      { detayJson: { tur: 'BASKA' }, createdAt: T('2026-09-27T06:00:00Z') },
    ],
    _count: { veriOnarimlari: 2 },
  } as unknown as HamDosya
}

describe('HAM_SELECT (şema sözleşmesi, kişisel veri seçilmez)', () => {
  it('borçlu adı, TCKN/VKN, telefon, adres ve IBAN seçilmez', () => {
    const s = JSON.stringify(HAM_SELECT)
    for (const alan of ['"adUnvan":true', 'tcVkn', 'telefon', '"adres"', 'iban', 'sigortaliTelefon', 'extractedText']) expect(s).not.toContain(alan)
  })
  it('silinmiş hukuki kayıtlar okunmaz (silindiAt: null süzgeci)', () => {
    for (const k of ['belgeler', 'alanDegerleri', 'takipTalepleri', 'sureler', 'arabuluculuklar', 'yolSecimleri', 'onayKayitlari', 'davalar', 'davaIslemleri'] as const) {
      expect((HAM_SELECT[k] as { where?: { silindiAt?: null } }).where?.silindiAt, k).toBeNull()
    }
  })
})

describe('hamdanGercekler', () => {
  const g = hamdanGercekler(ham(), { ayar: { alacakliUnvan: 'Ray', mersis: '0123', vekaletnamePath: null }, nabiz: null })

  it('cikarimJson onay/tevzi, eksen teyidi, onarım sayısı, UYAP tahsilatı', () => {
    expect(g.dosya.eskiOnay?.at?.toISOString()).toBe('2026-01-06T10:00:00.000Z')
    expect(g.dosya.tevzi).toEqual({ at: T('2026-01-07T10:00:00.000Z'), birim: 'İstanbul İcra' })
    expect(g.dosya.eksenTeyit).toEqual({ icra: 'TEYITLI', arab: null, dava: null })
    expect(g.dosya.onarimBekleyen).toBe(2)
    expect(g.dosya.uyapTahsilat).toBe(1500)
    expect(g.dosya.muvekkilAd).toBe('Ray Sigorta A.Ş.')
  })
  it('ondalıklar sayıya; borçlular sıra numaralı; silinmiş BorcluTakip yok sayılır', () => {
    expect(g.dosya.rucuTutari).toBe(61728.5)
    expect(g.odemeler[0].tutar).toBe(123457)
    expect(g.borclular.map((b) => [b.sira, b.teyitli, !!b.takip])).toEqual([[1, true, true], [2, false, false]])
    expect(g.borclular[0].takip?.itirazEdilenTutar).toBe(61728.5)
  })
  it('belge tarihi (belgeTarihi ?? icerikTarihi), süre durması, ön kontrol maddeleri, kesin süre sayısı, dilekçe son sürümü', () => {
    expect(g.belgeler[0].tarih?.toISOString()).toBe('2025-12-01T06:00:00.000Z')
    expect(g.sureler[0].durmaVar).toBe(true)
    expect(g.davalar[0].onKontrol).toEqual([{ kod: 'VEKALETNAME', durum: 'EKSIK' }])
    expect(g.davaIslemleri[0].kesinSureSayisi).toBe(2)
    expect(g.dilekceler[0].sonSurumDurum).toBe('IMZAYA_HAZIR')
    expect(g.takipTalebi?.hesapIziVar).toBe(true)
    expect(g.ayar).toEqual({ alacakliUnvanVar: true, mersisVar: true, vekaletnameVar: false })
  })
  it('yalnız yol haritası ertelemeleri okunur', () => {
    expect(g.ertelemeler).toEqual([{ kural: 'TB-02', bitis: T('2026-10-01T20:59:59.999Z'), at: T('2026-09-27T06:00:00Z') }])
    expect(ertelemeOku({ tur: 'YOL_HARITASI_ERTELE', kural: 'TB-02', bitis: 'bozuk' }, new Date())).toBeNull()
  })
  it('gerçekler motordan geçer (uçtan uca, kişisel veri yok)', () => {
    const s = siradakiAdim(g, T('2026-09-27T09:00:00Z'))
    expect(s.simdi?.kural).toBe('GN-01') // 2 onarım satırı bekliyor
    expect(JSON.stringify(s)).not.toMatch(/adUnvan|tcVkn/)
  })
})

describe('yukle.ts (server-only okuyucu)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.findFirst.mockResolvedValue(ham())
    m.ayar.mockResolvedValue({ alacakliUnvan: 'Ray', mersis: '1', vekaletnamePath: 'v.pdf' })
    m.nabiz.mockResolvedValue({ sonGorulme: T('2026-09-27T08:59:30Z'), uyapOturum: true })
    m.updateMany.mockResolvedValue({ count: 1 })
  })

  it('sorgu her zaman dosya + müvekkil kapsamlı; nabız ve ayar müvekkil kapsamlı', async () => {
    const g = await gerceklerOku('d1', 'tenant-1')
    expect(g?.dosya.id).toBe('d1')
    expect(m.findFirst).toHaveBeenCalledWith({ where: { id: 'd1', musteriId: 'tenant-1' }, select: HAM_SELECT })
    expect(m.ayar).toHaveBeenCalledWith(expect.objectContaining({ where: { musteriId: 'tenant-1' } }))
    expect(m.nabiz).toHaveBeenCalledWith(expect.objectContaining({ where: { musteriId: 'tenant-1' } }))
  })

  it('başka müvekkilin dosyası null döner', async () => {
    m.findFirst.mockResolvedValue(null)
    expect(await yolHaritasiYukle({ dosyaId: 'd1', musteriId: 'tenant-2' })).toBeNull()
  })

  it('prova parametresi uygulanır; gelecek/bozuk prova canlıya düşer; S19 eksik evrakı enjekte edilebilir', async () => {
    const simdi = T('2026-09-27T09:00:00Z')
    const p = await yolHaritasiYukle({ dosyaId: 'd1', musteriId: 't', prova: '2026-01-22', simdi })
    expect(p?.prova).toEqual({ tarih: '2026-01-22' })
    const c = await yolHaritasiYukle({ dosyaId: 'd1', musteriId: 't', prova: '2027-01-01', simdi, zorunluEvrak: { eksik: ['ekspertiz raporu'] } })
    expect(c?.prova).toBeNull()
    expect(c?.uyap.durum).toBe('ACIK')
    expect(c?.sonuc.tumu.map((a) => a.kural)).toContain('EV-04')
  })

  it('önbellek yalnız canlı görünümde ve değiştiyse yazılır, müvekkil kapsamlı', async () => {
    const simdi = T('2026-09-27T09:00:00Z')
    const canli = (await yolHaritasiYukle({ dosyaId: 'd1', musteriId: 't', simdi }))!
    m.findFirst.mockResolvedValueOnce({ yolHaritasiJson: null })
    expect(await onbellekGuncelle(canli, 't')).toBe(true)
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: 'd1', musteriId: 't' }, data: { yolHaritasiJson: expect.objectContaining({ kural: 'GN-01', motorSurumu: 'yh-1' }) } })
    m.updateMany.mockClear()
    m.findFirst.mockResolvedValueOnce({ yolHaritasiJson: onbellekJson(canli.sonuc) })
    expect(await onbellekGuncelle(canli, 't')).toBe(false)
    expect(m.updateMany).not.toHaveBeenCalled()
    const prova = (await yolHaritasiYukle({ dosyaId: 'd1', musteriId: 't', prova: '2026-01-22', simdi }))!
    expect(await onbellekGuncelle(prova, 't')).toBe(false)
    expect(m.updateMany).not.toHaveBeenCalled()
  })
})

describe('önbellek, duraklar ve künye', () => {
  it('onbellekJson şekli {simdi, sonra[], bekleme, kural, at}; onbellekDegisti yalnız anlamlı değişimde', () => {
    const s = siradakiAdim(bosGercekler(), T('2026-09-27T09:00:00Z'))
    const j = onbellekJson(s, T('2026-09-27T09:00:00Z'))
    expect(j).toMatchObject({ simdi: { kural: 'EV-01' }, sonra: [], bekleme: null, kural: 'EV-01', at: '2026-09-27T09:00:00.000Z' })
    expect(onbellekDegisti(j, { ...j, at: '2030-01-01T00:00:00.000Z' })).toBe(false)
    expect(onbellekDegisti(null, j)).toBe(true)
  })

  it('duraklar: sekiz durak; itiraz aşamasındaki dosyada 1–3 tamam, 4 şimdi, uyarı "İtirazın size tebliği: girilmedi"', () => {
    const g = hamdanGercekler(ham(), { ayar: null, nabiz: null })
    g.dosya.onarimBekleyen = 0
    g.davalar = []; g.davaIslemleri = []; g.dilekceler = []
    const s = siradakiAdim(g, T('2026-09-27T09:00:00Z'))
    expect(s.simdi?.kural).toBe('TB-08')
    const d = durakDurumlari(g, s)
    expect(d.map((x) => x.durum)).toEqual(['TAMAM', 'TAMAM', 'TAMAM', 'SIMDI', 'SIRADA', 'SIRADA', 'SIRADA', 'SIRADA'])
    expect(d[3].uyari).toBe('İtirazın size tebliği: girilmedi')
    expect(d[3].ozet).toContain('1. borçlu: tebliğ 20.01.2026: tam itiraz')
  })

  it('arabuluculukta anlaşma olunca 6–7 "gerekmedi"', () => {
    const g = bosGercekler()
    g.arabuluculuk = { id: 'a', asamaId: 'as', tur: 'DAVA_SARTI', basvuruTarihi: T('2026-02-01T06:00:00Z'), sonTutanakTarihi: T('2026-02-20T06:00:00Z'), sonuc: 'ANLASMA', sonTutanakBelgeId: 'b', onayAt: T('2026-02-21T06:00:00Z'), createdAt: T('2026-02-01T06:00:00Z') }
    const d = durakDurumlari(g, siradakiAdim(g, T('2026-03-01T09:00:00Z')))
    expect(d[5].durum).toBe('GEREKMEDI')
    expect(d[6].durum).toBe('GEREKMEDI')
  })

  it('künye: kayıtlı eksen yoksa tahmin, kesinleşme teyitsizse "Kesinleşti" yazılmaz', () => {
    const g = bosGercekler()
    Object.assign(g.dosya, { icraDosyaNo: '2026/9', takipTarihi: T('2026-01-10T06:00:00Z') })
    g.borclular = [{ id: 'b', sira: 1, tur: 'GERCEK', teyitli: true, takip: { tebligTarihi: T('2026-01-20T06:00:00Z'), tebligSonucu: 'TEBLIG', tebligSekli: null, tebligKaynakBelgeId: null, itirazVar: null, itirazVerilisTarihi: null, itirazUyapTarihi: null, itirazTipi: null, itirazEdilenTutar: null, itirazKaynakBelgeId: null, itirazAlacakliyaTebligTarihi: null } }]
    const e = eksenOzeti(g)
    expect(e[0]).toMatchObject({ eksen: 'ICRA', deger: 'ITIRAZ_SURESI', kaynak: 'TAHMIN', kaynakMetni: 'tahmin, teyit edin' })
    g.dosya.uyapDurum = 'Açık (durdurulmuş : Takibe İtiraz)'
    expect(eksenOzeti(g)[0]).toMatchObject({ deger: 'DURDU_ITIRAZ', kaynak: 'UYAP_TEYITSIZ', kaynakMetni: 'UYAP, teyitsiz' })
  })
})
