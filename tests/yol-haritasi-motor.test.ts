/**
 * Dosya Yol Haritası — yönlendirme motoru (S20; 06 §8). Tablo güdümlü: kurgusal tek bir dosya evraktan dava
 * sonrasına kadar yürütülür, her durakta "Şimdi" kartının kuralı beklenenle karşılaştırılır; ayrıca her kural
 * için yalıtılmış vakalar. Son test, ETKİN her kuralın en az bir kez tetiklendiğini doğrular.
 * Veriler kurgusaldır; kişisel veri yok (borçlular yalnız sıra numarasıyla).
 */
import { describe, expect, it } from 'vitest'
import {
  KURALLAR, bosGercekler, siradakiAdim, tekCumle, senaryoKurallari, hazirlikEksikleri,
  type Gercekler, type GBorclu, type GSure, type GOlay, type GAlan, type GBelge, type GDava, type GDavaIslem, type SiradakiAdimSonuc, type Kural,
} from '@/lib/konsrucu/yol-haritasi'

// ─────────────────────────── kurgu yardımcıları ───────────────────────────

/** İstanbul saatiyle gün (varsayılan 09:00). */
const G = (gun: string, saat = '09:00') => new Date(`${gun}T${saat}:00+03:00`)
let sayac = 0
const id = (on: string) => `${on}-${++sayac}`

function belge(o: Partial<GBelge> = {}): GBelge {
  return { id: id('b'), dosyaAdi: 'belge.pdf', kategori: 'DIGER', altTur: null, kaynak: 'HUGO_FOTO', metinDurumu: 'METIN_KATMANI', uyapEvrakTuru: null, uyapDosyaTuru: null, davaId: null, tarih: null, createdAt: G('2026-01-02'), ...o }
}
function alan(alanAdi: string, deger: unknown, o: Partial<GAlan> = {}): GAlan {
  return { id: id('a'), alan: alanAdi, durum: 'ONERI', kaynakTuru: 'KURAL', deger, kaynakBelgeId: null, sayfa: 1, alinti: null, alintiDogru: null, onayAt: null, createdAt: G('2026-01-03'), ...o }
}
function borclu(sira: number, o: Partial<GBorclu> = {}): GBorclu {
  return { id: `borclu-${sira}`, sira, tur: 'GERCEK', teyitli: true, takip: null, ...o }
}
function takip(o: Partial<NonNullable<GBorclu['takip']>> = {}): NonNullable<GBorclu['takip']> {
  return {
    tebligTarihi: null, tebligSonucu: null, tebligSekli: null, tebligKaynakBelgeId: null, itirazVar: null, itirazVerilisTarihi: null, itirazUyapTarihi: null,
    itirazTipi: null, itirazEdilenTutar: null, itirazKaynakBelgeId: null, itirazAlacakliyaTebligTarihi: null, ...o,
  }
}
function olay(o: Partial<GOlay>): GOlay {
  return { id: id('o'), altTip: null, teyit: 'ADAY', borcluId: null, hukukiTarih: null, tarih: null, tutar: null, sonuc: null, kaynakBelgeId: null, kural: 'TEST@1', createdAt: G('2026-01-01'), ...o }
}
function sure(o: Partial<GSure> & { tur: string }): GSure {
  return {
    id: id('s'), dayanak: 'test (teyit gerekli)', borcluId: null, davaId: null, arabuluculukId: null, tetikTarihi: null, tetikTuru: 'TEBLIG', onerilenIhtiyatli: null,
    onerilenSonGun: null, onaylananSonGun: null, onayAt: null, ikinciTeyitAt: null, durum: 'ACIK', kapanisKanitiBelgeId: null, kapanisAt: null, kaynakBelgeId: null,
    kaynakAlinti: null, durmaVar: false, createdAt: G('2026-01-01'), ...o,
  }
}
function dava(o: Partial<GDava> = {}): GDava {
  return {
    id: 'dava-1', asamaId: 'asama-dava-1', rolumuz: 'DAVACI', tur: 'ITIRAZIN_IPTALI', mahkemeTuru: null, usul: null, davaDegeri: null, acilisTarihi: null, esasVar: false,
    durum: 'HAZIRLIK', onKontrol: [], onIncelemeTarihi: null, sonrakiDurusma: null, hukum: null, kararTarihi: null, kararOnayAt: null, gerekceliTebligTarihi: null,
    kesinlesmeTarihi: null, createdAt: G('2026-03-15'), ...o,
  }
}
function islem(o: Partial<GDavaIslem> & { tur: string }): GDavaIslem {
  return { id: id('i'), davaId: 'dava-1', tarih: null, tebligTarihi: null, teyit: 'ADAY', kaynakBelgeId: null, kesinSureSayisi: 0, createdAt: G('2026-04-01'), ...o }
}

/** Test boyunca tetiklenen kural kodları (son testte kapsam denetimi). */
const tetiklenen = new Set<string>()

function hesapla(g: Gercekler, bugun: Date): SiradakiAdimSonuc {
  const s = siradakiAdim(g, bugun)
  for (const a of [...s.tumu, ...(s.bekleme ? [s.bekleme] : []), ...s.bilgi, ...s.ertelenenler]) tetiklenen.add(a.kural)
  return s
}
const kodlar = (s: SiradakiAdimSonuc) => s.tumu.map((a) => a.kural)

// ─────────────────────────── tablo bütünlüğü ───────────────────────────

/** 06 §8.3'teki bütün kodlar, tablodaki sırayla. */
const TASARIM_KODLARI = [
  'GN-01', 'GN-02', 'GN-03', 'GN-04', 'GN-05', 'GN-06', 'GN-07', 'GN-08',
  'EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07',
  'HZ-01', 'HZ-02', 'HZ-03', 'HZ-04', 'HZ-05',
  'ID-01', 'ID-02', 'ID-03', 'ID-04',
  'TK-01', 'TK-02', 'TK-03', 'TK-04',
  'TB-01', 'TB-02', 'TB-03', 'TB-04', 'TB-05', 'TB-06', 'TB-07', 'TB-08', 'TB-09', 'TB-10', 'TB-11',
  'AR-01', 'AR-02', 'AR-03', 'AR-04', 'AR-05', 'AR-06', 'AR-07', 'AR-08', 'AR-09',
  'DA-01', 'DA-02', 'DA-03', 'DA-04', 'DA-05', 'DA-06a', 'DA-06b', 'DA-07',
  'YR-01', 'YR-02', 'YR-03', 'YR-04', 'YR-05', 'YR-06', 'YR-07', 'YR-08', 'YR-09', 'YR-10',
  'SN-01', 'SN-02', 'SN-03', 'SN-04', 'SN-05', 'SN-06', 'SN-07', 'SN-08',
]

/** 06 §8.3 öncelik sütunu (birebir). */
const TASARIM_ONCELIK: Record<string, number> = {
  'GN-01': 0, 'GN-02': 0, 'GN-03': 0, 'GN-04': 1, 'GN-05': 1, 'GN-06': 4, 'GN-07': 5, 'GN-08': 6,
  'EV-01': 5, 'EV-02': 6, 'EV-03': 4, 'EV-04': 4, 'EV-05': 3, 'EV-06': 3, 'EV-07': 4,
  'HZ-01': 1, 'HZ-02': 3, 'HZ-03': 4, 'HZ-04': 5, 'HZ-05': 3,
  'ID-01': 3, 'ID-02': 4, 'ID-03': 2, 'ID-04': 2,
  'TK-01': 5, 'TK-02': 4, 'TK-03': 5, 'TK-04': 5,
  'TB-01': 2, 'TB-02': 3, 'TB-03': 6, 'TB-04': 4, 'TB-05': 3, 'TB-06': 2, 'TB-07': 3, 'TB-08': 2, 'TB-09': 3, 'TB-10': 3, 'TB-11': 4,
  'AR-01': 4, 'AR-02': 3, 'AR-03': 4, 'AR-04': 5, 'AR-05': 4, 'AR-06': 3, 'AR-07': 2, 'AR-08': 5, 'AR-09': 3,
  'DA-01': 5, 'DA-02': 4, 'DA-03': 5, 'DA-04': 5, 'DA-05': 3, 'DA-06a': 2, 'DA-06b': 0, 'DA-07': 2,
  'YR-01': 2, 'YR-02': 3, 'YR-03': 5, 'YR-04': 5, 'YR-05': 5, 'YR-06': 5, 'YR-07': 4, 'YR-08': 1, 'YR-09': 1, 'YR-10': 1,
  'SN-01': 3, 'SN-02': 4, 'SN-03': 4, 'SN-04': 3, 'SN-05': 6, 'SN-06': 4, 'SN-07': 4, 'SN-08': 5,
}

describe('kural tablosu (06 §8.3 birebir)', () => {
  it('bütün kodlar tabloda, tasarımdaki sırayla ve bir kez', () => {
    expect(KURALLAR.map((k) => k.kod)).toEqual(TASARIM_KODLARI)
  })

  it('öncelikler tasarım tablosuyla aynı; öncelik 0 ⇔ engel', () => {
    for (const k of KURALLAR) {
      expect(k.oncelik, k.kod).toBe(TASARIM_ONCELIK[k.kod])
      expect(k.engel, k.kod).toBe(k.oncelik === 0)
    }
  })

  it('her kuralın koşul ve öneri metni, sürümü var; EYLEM kurallarının birincil eylemi var', () => {
    for (const k of KURALLAR) {
      expect(k.kosulMetni.length, k.kod).toBeGreaterThan(5)
      expect(k.oneriMetni.length, k.kod).toBeGreaterThan(5)
      expect(k.surum, k.kod).toBeGreaterThanOrEqual(1)
      if (k.tur === 'EYLEM') expect(k.eylem?.etiket, k.kod).toBeTruthy()
      else expect(k.eylem, k.kod).toBeNull()
    }
  })

  it('verisi bu dilimde gelmeyen kurallar tanımlı ama VERI_BEKLIYOR ve gerekçeli', () => {
    const bekleyen = KURALLAR.filter((k) => k.durumu === 'VERI_BEKLIYOR')
    expect(bekleyen.map((k) => k.kod).sort()).toEqual(['AR-09', 'EV-04', 'SN-05', 'SN-08'])
    for (const k of bekleyen) expect(k.veriNotu, k.kod).toBeTruthy()
  })

  it('madde atfı taşıyan her öneri "teyit gerekli" der', () => {
    for (const k of KURALLAR) {
      if (/(İİK|HMK|İYUK|HUAK|TK) ?\d/.test(k.oneriMetni)) expect(k.oneriMetni + (k.hukukiEtiket ?? ''), k.kod).toMatch(/teyit gerekli/)
    }
  })

  it.each(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const)('senaryo adımı (%s) için birincil eylemli ETKİN kural var', (adim) => {
    const l = senaryoKurallari(adim).filter((k: Kural) => k.durumu === 'ETKIN' && k.eylem)
    expect(l.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────── kurgusal dosyanın yolculuğu ───────────────────────────

describe('kurgusal dosyanın yolculuğu: evraktan dava sonrasına (a–j)', () => {
  it('her durakta Şimdi kartı beklenen kuraldır', () => {
    const g = bosGercekler('dosya-yolculuk')
    const dosya = g.dosya
    const b1 = borclu(1), b2 = borclu(2, { tur: 'OZEL_TUZEL' })
    let bugun = G('2026-01-02', '12:00')
    let taze = false
    const adim = (ad: string, beklenen: string | { bekleme: string } , ekKontrol?: (s: SiradakiAdimSonuc) => void) => {
      if (taze) dosya.uyapSenkronAt = new Date(bugun.getTime() - 3_600_000)
      const s = hesapla(g, bugun)
      if (typeof beklenen === 'string') {
        expect(s.simdi?.kural, `${ad} → ${tekCumle(s)} | tümü: ${kodlar(s).join(',')}`).toBe(beklenen)
      } else {
        expect(s.simdi, `${ad} → ${tekCumle(s)}`).toBeNull()
        expect(s.bekleme?.kural, ad).toBe(beklenen.bekleme)
      }
      ekKontrol?.(s)
      return s
    }

    // (a) evrak
    adim('boş dosya', 'EV-01', (s) => expect(s.simdi?.eylem?.etiket).toBe('Evrak ekle'))
    g.belgeler = [belge({ kategori: 'POLICE', metinDurumu: 'BEKLIYOR' }), belge({ kategori: 'DEKONT', metinDurumu: 'BEKLIYOR' }), belge({ kategori: 'TUTANAK', metinDurumu: 'BEKLIYOR' })]
    adim('evrak okunuyor', { bekleme: 'EV-02' }, (s) => expect(s.bekleme?.metin).toBe('Okunuyor 0/3'))
    g.belgeler.forEach((b) => { b.metinDurumu = 'METIN_KATMANI' })
    const dekontId = g.belgeler[1].id
    g.alanlar = [
      alan('asilAlacak', 61728, { kaynakTuru: 'AI', kaynakBelgeId: dekontId, alinti: 'toplam 61.728,00' }),
      alan('odeme[0].tarih', '2025-12-15', { kaynakBelgeId: dekontId }),
      alan('odeme[0].tutar', 123456, { kaynakBelgeId: dekontId }),
      alan('rucuSebebiKod', 'KASKO_HALEFIYET', { kaynakTuru: 'HUGO' }),
      alan('policeNo', 'P-0001', { kaynakTuru: 'AI' }),
    ]
    adim('öneriler bekliyor', 'EV-05', (s) => {
      expect(s.simdi?.metin).toBe('Bulduğumuz 5 bilgiyi kontrol edin (4 kritik)')
      expect(kodlar(s)).toEqual(expect.arrayContaining(['EV-07', 'HZ-03']))
      expect(s.sonra.find((a) => a.kural === 'EV-07')?.metin).toContain('öneri: KASKO_HALEFIYET')
    })
    g.odemeler = [{ tarih: G('2025-12-15'), tutar: 123456, haricMi: false }]
    dosya.rucuTutari = 123.46
    adim('tutar şüphesi (~1000 kat)', 'GN-02', (s) => { expect(s.simdi?.engel).toBe(true); expect(s.engeller.map((a) => a.kural)).toContain('GN-02') })
    dosya.rucuTutari = 61728
    g.alanlar.push(alan('kazaTarihi', '2025-11-30', { kaynakTuru: 'AI' }), alan('kazaTarihi', '2025-12-01', { kaynakTuru: 'HUGO' }))
    adim('kaynak çelişkisi', 'EV-05', (s) => expect(kodlar(s)).toContain('EV-06'))
    g.alanlar = g.alanlar.filter((a) => !(a.alan === 'kazaTarihi' && a.kaynakTuru === 'HUGO'))
    g.alanlar.forEach((a) => { a.durum = 'ONAYLI'; a.onayAt = G('2026-01-05') })
    dosya.rucuSebebiKod = 'KASKO_HALEFIYET'
    bugun = G('2026-01-05', '12:00')

    // (c) hazırlık ve takip
    adim('hazırlık: borçlu yok', 'HZ-03', (s) => expect(s.simdi?.metin).toBe('Eksik: borçlu bilgisi'))
    g.borclular = [b1, b2]
    dosya.yetkiliIcra = 'İstanbul'
    g.takipTalebi = { id: 'tt-1', asilAlacak: 61728, toplam: 65000, faizTuru: null, faizOraniMetni: null, faizBaslangicTuru: null, faizBaslangic: null, hesapIziVar: false, onaylayanId: null, dondurulduAt: null, takipTarihi: null, createdAt: G('2026-01-05') }
    adim('hazırlık: faiz seçilmedi', 'HZ-03', (s) => expect(s.simdi?.metin).toBe('Eksik: faiz türü'))
    Object.assign(g.takipTalebi, { faizTuru: 'YASAL', faizBaslangicTuru: 'HER_ODEMEDEN', hesapIziVar: true })
    expect(hazirlikEksikleri(g)).toEqual([])
    adim('hazırlık tamam, onay yok', 'HZ-04')
    g.takipTalebi.onaylayanId = 'avukat-1'
    adim('onaylı, tevzi yok', 'TK-01', (s) => expect(s.simdi?.eylem?.etiket).toBe("UYAP'ta takibi aç"))
    g.senkronIsleri = [{ id: 'kop-1', tur: 'KOPILOT', durum: 'HATA', hata: 'MERNİS adresi bulunamadı', createdAt: G('2026-01-05', '13:00'), bittiAt: G('2026-01-05', '13:01') }]
    bugun = G('2026-01-05', '14:00')
    adim('kopilot durdu', 'TK-02', (s) => expect(s.simdi?.metin).toBe('Takip açılamadı: MERNİS adresi bulunamadı'))
    g.senkronIsleri.unshift({ id: 'kop-2', tur: 'KOPILOT', durum: 'TAMAM', hata: null, createdAt: G('2026-01-06', '10:00'), bittiAt: G('2026-01-06', '10:05') })
    dosya.tevzi = { at: G('2026-01-06', '10:05'), birim: 'İstanbul İcra (tevzi)' }
    g.takipTalebi.dondurulduAt = G('2026-01-06', '10:05')
    bugun = G('2026-01-06', '12:00')
    adim('tevzi bugün', { bekleme: 'TK-03' }, (s) => expect(s.bekleme?.metin).toBe('Harç ödemesi bekleniyor'))
    bugun = G('2026-01-08', '12:00')
    adim('tevziden 2 gün sonra', 'TK-03')

    // (d) esas no ve senkron
    dosya.icraDairesi = 'İstanbul 5. İcra Dairesi'; dosya.icraDosyaNo = '2026/123'; dosya.takipTarihi = G('2026-01-12')
    bugun = G('2026-01-14', '12:00')
    adim('esas no girildi, senkron yok', 'TK-04', (s) => expect(s.simdi?.eylem?.etiket).toBe("Kaydet ve UYAP'tan çek"))
    taze = true
    bugun = G('2026-01-17', '12:00')
    adim('takipten 5 gün sonra', { bekleme: 'TB-03' })

    // (e) tebliğ ve itiraz
    bugun = G('2026-02-01', '12:00')
    adim('takipten 20 gün sonra tebliğ yok', 'TB-04')
    g.olaylar.push(olay({ altTip: 'TEBLIG_SONUCU', sonuc: 'TEBLIG', borcluId: b1.id, hukukiTarih: G('2026-01-20') }))
    adim('tebliğ adayı', 'TB-01', (s) => expect(s.simdi?.metin).toBe('Tebliğ tarihini onaylayın; İİK 62 buna bağlı'))
    g.olaylar[0].teyit = 'TEYITLI'
    b1.takip = takip({ tebligTarihi: G('2026-01-20'), tebligSonucu: 'TEBLIG', tebligSekli: 'UETS' })
    const iik62 = sure({ tur: 'IIK62', borcluId: b1.id, tetikTarihi: G('2026-01-20'), onerilenIhtiyatli: G('2026-01-27'), dayanak: 'İİK 62' })
    g.sureler.push(iik62)
    bugun = G('2026-02-05', '12:00')
    adim('onaysız İİK 62 süresi geçmiş', 'GN-04', (s) => {
      expect(s.simdi?.metin).toBe('Son günü onaylayın: Ödeme emrine itiraz süresi, önerilen 27.01.2026')
      expect(s.simdi?.kalanGun).toBe(-9)
      expect(kodlar(s)).toContain('TB-09')
    })
    Object.assign(iik62, { onaylananSonGun: G('2026-01-27'), onayAt: G('2026-02-05'), durum: 'KAPANDI', kapanisAt: G('2026-02-05') })
    adim('İİK 62 geçti, itiraz sinyali yok', 'TB-09', (s) => expect(s.simdi?.metin).toBe("UYAP'ta itiraz yok mu? Teyit edin"))
    g.olaylar.push(olay({ altTip: 'ITIRAZ', borcluId: b1.id, hukukiTarih: G('2026-01-25') }))
    adim('itiraz adayı', 'TB-01', (s) => expect(s.simdi?.metin).toBe('İtirazı onaylayın; İİK 67 buna bağlı'))
    g.olaylar[1].teyit = 'TEYITLI'
    Object.assign(b1.takip, { itirazVar: true, itirazVerilisTarihi: G('2026-01-25') })
    const iik67 = sure({ tur: 'IIK67', borcluId: b1.id, tetikTarihi: G('2026-01-25'), onerilenIhtiyatli: G('2027-01-25'), dayanak: 'İİK 67/1', kaynakAlinti: 'borca ve faize itiraz ediyorum' })
    g.sureler.push(iik67)
    adim('itiraz onaylı, size tebliğ tarihi yok', 'TB-08', (s) => {
      expect(s.simdi?.metin).toBe('İtirazın size tebliğ tarihini girin (İİK 67 başlangıcı)')
      expect(s.simdi?.sonGun).toBe('2027-01-25')
      expect(kodlar(s)).toEqual(expect.arrayContaining(['TB-07', 'AR-01']))
    })
    b1.takip.itirazAlacakliyaTebligTarihi = G('2026-02-01')
    adim('kapsam seçilmedi', 'TB-07')
    b1.takip.itirazTipi = 'TAM'

    // (f) arabuluculuk
    adim('yol seçilmedi', 'AR-01')
    g.yolSecimleri.push({ id: 'yol-1', asama: 'ITIRAZ_SONRASI', secim: 'ARABULUCULUK_IIK67', davaId: null, durum: 'GECERLI', secimAt: G('2026-02-06') })
    bugun = G('2026-02-06', '12:00')
    adim('müvekkil onayı yok', 'AR-02', (s) => expect(s.simdi?.metin).toBe('Müvekkilden onay isteyin (dava, avans)'))
    g.onayKayitlari.push({ id: 'onay-1', tur: 'DAVA_ACMA', sonuc: 'BEKLIYOR', istenmeAt: G('2026-02-06'), alinmaAt: null, yolSecimiId: 'yol-1', davaId: null, createdAt: G('2026-02-06') })
    adim('onay istendi', 'AR-02', (s) => expect(s.simdi?.eylem?.etiket).toBe('Onayı kaydet'))
    Object.assign(g.onayKayitlari[0], { sonuc: 'ONAY', alinmaAt: G('2026-02-10') })
    bugun = G('2026-02-10', '12:00')
    adim('arabuluculuk türü seçilmedi', 'AR-03')
    g.arabuluculuk = { id: 'arb-1', asamaId: 'asama-arb-1', tur: 'DAVA_SARTI', basvuruTarihi: null, sonTutanakTarihi: null, sonuc: null, sonTutanakBelgeId: null, onayAt: null, createdAt: G('2026-02-10') }
    adim('başvuru yok', 'AR-04')
    g.arabuluculuk.basvuruTarihi = G('2026-03-02')
    g.etkinlikler.push({ id: 'top-1', tur: 'ARABULUCULUK_TOPLANTISI', asamaId: 'asama-arb-1', baslar: G('2026-03-10', '14:00'), durum: 'PLANLANDI', teyit: null, kaynak: 'ELLE', createdAt: G('2026-03-02') })
    bugun = G('2026-03-12', '12:00')
    adim('toplantı geçti, sonuç yok', 'AR-05')
    g.etkinlikler[0].durum = 'YAPILDI'
    Object.assign(g.arabuluculuk, { sonuc: 'ANLASAMAMA', sonTutanakTarihi: G('2026-03-10') })
    adim('son tutanak belgesi yok', 'AR-06', (s) => expect(kodlar(s)).toContain('DA-01'))
    g.belgeler.push(belge({ id: 'tutanak-1', altTur: 'ARB_SON_TUTANAK', kategori: 'DIGER' }))
    Object.assign(g.arabuluculuk, { sonTutanakBelgeId: 'tutanak-1', onayAt: G('2026-03-12', '10:00') })
    Object.assign(iik67, { onaylananSonGun: G('2027-02-01'), onayAt: G('2026-02-02'), onerilenSonGun: G('2027-02-24'), durmaVar: true })
    adim('İİK 67 yeniden onay bekliyor', 'AR-07', (s) => expect(s.simdi?.rol).toBe('A+2'))
    iik67.onayAt = G('2026-03-12', '11:00')

    // (g) dava açılışı
    adim('dava yok', 'DA-01')
    g.davalar.push(dava())
    bugun = G('2026-03-20', '12:00')
    adim('ön kontrol eksik', 'DA-02', (s) => expect(s.simdi?.metin).toBe('Eksik: görevli mahkeme (avukat seçer)'))
    Object.assign(g.davalar[0], { mahkemeTuru: 'ASLIYE_HUKUK', usul: 'YAZILI', davaDegeri: 61728 })
    adim('ön kontrol tamam', 'DA-03')
    g.dilekceler.push({ id: 'dil-1', tur: 'DAVA', davaId: 'dava-1', durum: 'TASLAK', sonSurumDurum: 'IMZAYA_HAZIR', createdAt: G('2026-03-22') })
    bugun = G('2026-03-23', '12:00')
    adim('dilekçe imzaya hazır', 'DA-04')
    Object.assign(g.davalar[0], { acilisTarihi: G('2027-03-01'), esasVar: true, durum: 'DERDEST' })
    adim('açılış son günden sonra görünüyor', 'DA-06b', (s) => expect(s.simdi?.engel).toBe(true))
    g.davalar[0].acilisTarihi = G('2026-04-01')
    bugun = G('2026-04-02', '12:00')
    adim('dava açıldı, İİK 67 kapanmaya hazır', 'DA-06a')
    Object.assign(iik67, { durum: 'KAPANDI', kapanisAt: G('2026-04-02') })
    adim('yargılama sürüyor, iş yok', { bekleme: 'GN-08' }, (s) => expect(s.bekleme?.metin).toBe('Beklenen: sonraki duruşma ya da ara karar'))

    // (h)(i) yargılama, dilekçe, süreler
    g.davalar[0].usul = null
    adim('usul boş', 'YR-02')
    g.davalar[0].usul = 'YAZILI'
    g.davaIslemleri.push(islem({ tur: 'CEVAP', tarih: G('2026-04-18'), tebligTarihi: G('2026-04-20') }))
    bugun = G('2026-04-21', '12:00')
    adim('cevap tebliği adayı', 'TB-01', (s) => {
      expect(s.simdi?.metin).toBe('Cevap dilekçesinin tebliğ tarihini onaylayın; cevaba cevap süresi buna bağlı')
      expect(s.simdi?.durak).toBe(7)
    })
    g.davaIslemleri[0].teyit = 'TEYITLI'
    const hmk136 = sure({ tur: 'HMK136', davaId: 'dava-1', tetikTarihi: G('2026-04-20'), onerilenIhtiyatli: G('2026-05-04'), dayanak: 'HMK 136' })
    g.sureler.push(hmk136)
    bugun = G('2026-04-22', '12:00')
    adim('onaysız cevaba cevap süresi', 'GN-04', (s) => expect(kodlar(s)).toContain('YR-03'))
    Object.assign(hmk136, { onaylananSonGun: G('2026-05-04'), onayAt: G('2026-04-22') })
    adim('cevaba cevap', 'YR-03', (s) => expect(s.simdi?.sonGun).toBe('2026-05-04'))
    g.dilekceler.push({ id: 'dil-2', tur: 'CEVABA_CEVAP', davaId: 'dava-1', durum: 'GONDERILDI', sonSurumDurum: 'GONDERILDI_UYAP', createdAt: G('2026-04-28') })
    Object.assign(hmk136, { durum: 'KAPANDI', kapanisAt: G('2026-04-30') })
    g.davaIslemleri.push(islem({ tur: 'TENSIP', tarih: G('2026-04-25'), kesinSureSayisi: 2 }))
    bugun = G('2026-04-30', '12:00')
    adim('tensipte kesin süreler', 'YR-01', (s) => expect(s.simdi?.metin).toBe('Tensipte 2 kesin süre bulundu, onaylayın'))
    g.davaIslemleri[1].teyit = 'TEYITLI'
    const avans = sure({ tur: 'AVANS', davaId: 'dava-1', tetikTarihi: G('2026-04-25'), onerilenIhtiyatli: G('2026-05-20'), onaylananSonGun: G('2026-05-20'), onayAt: G('2026-04-30'), dayanak: 'HMK 120' })
    g.sureler.push(avans)
    bugun = G('2026-05-01', '12:00')
    adim('avans istendi', 'YR-10', (s) => expect(s.simdi?.metin).toBe('Avansı yatırın; kesin süre 20.05.2026 (HMK 120/324, teyit gerekli)'))
    Object.assign(avans, { durum: 'KAPANDI', kapanisAt: G('2026-05-05'), kapanisKanitiBelgeId: 'dekont-avans' })
    g.etkinlikler.push({ id: 'dur-1', tur: 'DURUSMA', asamaId: 'asama-dava-1', baslar: G('2026-05-12', '10:30'), durum: 'PLANLANDI', teyit: 'TEYITLI', kaynak: 'UYAP', createdAt: G('2026-04-26') })
    bugun = G('2026-05-10', '12:00')
    adim('duruşmaya 2 gün', 'YR-06', (s) => expect(s.simdi?.neden).toContain('2 gün sonra'))
    bugun = G('2026-05-14', '12:00')
    adim('duruşma geçti, sonuç yok', 'YR-07')
    g.etkinlikler[1].durum = 'YAPILDI'
    g.davaIslemleri.push(islem({ tur: 'BILIRKISI_RAPORU', teyit: 'TEYITLI', tarih: G('2026-05-28'), tebligTarihi: G('2026-06-01') }))
    const hmk281 = sure({ tur: 'HMK281', davaId: 'dava-1', tetikTarihi: G('2026-06-01'), onerilenIhtiyatli: G('2026-06-15'), onaylananSonGun: G('2026-06-15'), onayAt: G('2026-06-01'), dayanak: 'HMK 281' })
    g.sureler.push(hmk281)
    bugun = G('2026-06-02', '12:00')
    adim('bilirkişi raporu', 'YR-05')
    g.dilekceler.push({ id: 'dil-3', tur: 'BEYAN', davaId: 'dava-1', durum: 'TASLAK', sonSurumDurum: 'TASLAK', createdAt: G('2026-06-05') })
    Object.assign(hmk281, { durum: 'KAPANDI', kapanisAt: G('2026-06-10') })
    g.davalar[0].durum = 'ISLEMDEN_KALDIRILDI'
    bugun = G('2026-06-12', '12:00')
    adim('işlemden kaldırıldı', 'YR-08', (s) => expect(s.simdi?.rol).toBe('A+2'))
    g.davalar[0].durum = 'DERDEST'
    g.davaIslemleri.push(islem({ id: 'gorevsiz-1', tur: 'GOREVSIZLIK', teyit: 'TEYITLI', tarih: G('2026-06-20') }))
    bugun = G('2026-06-21', '12:00')
    adim('görevsizlik kararı', 'YR-09')
    g.davaIslemleri = g.davaIslemleri.filter((i) => i.id !== 'gorevsiz-1')

    // (j) karar ve sonrası
    g.davaIslemleri.push(islem({ tur: 'KARAR', tarih: G('2026-07-01') }))
    bugun = G('2026-07-02', '12:00')
    adim('karar geldi', 'SN-01')
    Object.assign(g.davalar[0], { kararTarihi: G('2026-07-01'), kararOnayAt: G('2026-07-02'), hukum: 'KISMEN_KABUL', durum: 'KARAR' })
    g.davaIslemleri[g.davaIslemleri.length - 1].teyit = 'TEYITLI'
    adim('karar onaylı, gerekçeli tebliğ yok', 'SN-04', (s) => expect(kodlar(s)).toEqual(expect.arrayContaining(['SN-02', 'SN-03'])))
    g.davalar[0].gerekceliTebligTarihi = G('2026-07-20')
    bugun = G('2026-07-21', '12:00')
    adim('sonraki yol seçilmedi', 'SN-02')
    g.yolSecimleri.push({ id: 'yol-2', asama: 'KARAR_SONRASI', secim: 'TAKIBI_DARALT', davaId: 'dava-1', durum: 'GECERLI', secimAt: G('2026-07-21') })
    g.olaylar.push(olay({ altTip: 'TAHSILAT_BORCLUDAN', tutar: 5000, hukukiTarih: G('2026-07-25') }))
    bugun = G('2026-07-26', '12:00')
    adim('tahsilat adayı', 'SN-07', (s) => expect(s.simdi?.metin).toBe('Tahsilatı onaylayın: 5.000,00 ₺ (UYAP hesap özeti)'))
    g.olaylar[g.olaylar.length - 1].teyit = 'TEYITLI'
    dosya.uyapDurum = 'Kapalı'
    adim('UYAP kapalı, kapanış sebebi yok', 'SN-06')
    dosya.kapanisSebebi = 'TAHSIL'; dosya.kapanisAt = G('2026-07-26')
    adim('kapandı', { bekleme: 'GN-08' })
  })
})

// ─────────────────────────── yalıtılmış kural vakaları ───────────────────────────

function takipliDosya(): Gercekler {
  const g = bosGercekler('dosya-yalitim')
  g.belgeler = [belge()]
  g.dosya.rucuSebebiKod = 'KOD'
  g.dosya.icraDosyaNo = '2026/1'
  g.dosya.icraDairesi = 'Ankara 1. İcra Dairesi'
  g.dosya.takipTarihi = G('2026-01-10')
  g.dosya.uyapSenkronAt = G('2026-03-01', '11:00')
  return g
}
const BUGUN = G('2026-03-01', '12:00')

describe('yalıtılmış kural vakaları', () => {
  const vakalar: { ad: string; kural: string; kur: () => { g: Gercekler; bugun?: Date }; simdi?: boolean; metin?: string }[] = [
    { ad: 'onarım bekleyen dosya engel olur', kural: 'GN-01', simdi: true, metin: 'Durum teyit gerekiyor: dosya veri onarımı bekliyor',
      kur: () => { const g = takipliDosya(); g.dosya.onarimDurumu = 'BEKLIYOR'; return { g } } },
    { ad: 'UYAP itiraz derken eski durum kesinleşti', kural: 'GN-01', simdi: true, metin: "Durum teyit gerekiyor: UYAP'ta 'Açık (durdurulmuş : Takibe İtiraz)' yazıyor",
      kur: () => { const g = takipliDosya(); g.dosya.durum = 'KESINLESTI'; g.dosya.uyapDurum = 'Açık (durdurulmuş : Takibe İtiraz)'; return { g } } },
    { ad: 'eksen BILINMIYOR', kural: 'GN-01', simdi: true, metin: "Durum bilinmiyor, UYAP'ta teyit edin",
      kur: () => { const g = takipliDosya(); g.dosya.icraEksen = 'BILINMIYOR'; return { g } } },
    { ad: 'UYAP eşleşmesi başka daire', kural: 'GN-03', simdi: true,
      kur: () => { const g = takipliDosya(); g.dosya.uyapEslesme = 'BASKA_DAIRE'; return { g } } },
    { ad: 'onaylı süreye 3 gün, kanıt yok', kural: 'GN-05', simdi: true, metin: 'İtirazın iptali davası süresi için son 3 gün',
      kur: () => { const g = takipliDosya(); g.sureler.push(sure({ tur: 'IIK67', onaylananSonGun: G('2026-03-04'), onayAt: G('2026-01-01') })); return { g } } },
    { ad: 'UYAP işi bekliyor, nabız 5 dk önce', kural: 'GN-06', metin: "UYAP'ı açın; çekme kendiliğinden başlar",
      kur: () => { const g = takipliDosya(); g.senkronIsleri.push({ id: 'is-1', tur: 'ICRA', durum: 'BEKLIYOR', hata: null, createdAt: G('2026-03-01', '11:50'), bittiAt: null }); g.nabiz = { sonGorulme: G('2026-03-01', '11:55'), uyapOturum: true }; return { g } } },
    { ad: '60 gündür gelişme yok', kural: 'GN-07', simdi: true, metin: "Sessiz dosya: UYAP'ı kontrol edin",
      kur: () => { const g = takipliDosya(); g.olaylar.push(olay({ altTip: 'TEBLIG_SONUCU', teyit: 'TEYITLI', hukukiTarih: G('2026-01-15') })); return { g, bugun: G('2026-04-01', '12:00') } } },
    { ad: 'kritik belge okunamadı', kural: 'EV-03', metin: '1 belge okunamadı: yeniden çekin ya da elle girin',
      kur: () => { const g = bosGercekler(); g.belgeler = [belge({ kategori: 'DEKONT', metinDurumu: 'OKUNAMADI' }), belge({ kategori: 'HASAR_FOTO', metinDurumu: 'OKUNAMADI' })]; g.dosya.rucuSebebiKod = 'KOD'; return { g } } },
    { ad: 'asgari sette eksik evrak (S19 bağlanınca)', kural: 'EV-04', metin: 'Eksik: ödeme dekontu',
      kur: () => { const g = bosGercekler(); g.belgeler = [belge()]; g.dosya.rucuSebebiKod = 'KOD'; g.zorunluEvrak = { eksik: ['ödeme dekontu'] }; return { g } } },
    { ad: 'zamanaşımına 60 gün, takip yok', kural: 'HZ-01', simdi: true,
      kur: () => { const g = bosGercekler(); g.dosya.zamanasimi = G('2026-04-30'); return { g } } },
    { ad: 'kritik alanın onaylı değeri yok', kural: 'HZ-02', simdi: true, metin: 'Takip hazırlığı için önce kritik bilgileri onaylayın',
      kur: () => { const g = bosGercekler(); g.belgeler = [belge()]; g.dosya.rucuSebebiKod = 'KOD'; g.alanlar = [alan('policeNo', 'P', { durum: 'ONAYLI' })]; return { g } } },
    { ad: 'kamu idaresi borçlu, yol kararı yok', kural: 'HZ-05',
      kur: () => { const g = takipliDosya(); g.borclular = [borclu(1, { tur: 'KAMU' })]; return { g } } },
    { ad: 'AI idari öneriyor', kural: 'ID-01', simdi: true, metin: 'AI idari yol öneriyor (güven %82): yolu onaylayın',
      kur: () => { const g = bosGercekler(); g.dosya.yol = 'IDARI'; g.dosya.yolGuven = 0.82; g.dosya.yolNeden = 'Borçlu belediye.'; return { g } } },
    { ad: 'idari yolda başvuru yok', kural: 'ID-02', simdi: true,
      kur: () => { const g = bosGercekler(); g.dosya.durum = 'IDARI_YOL'; g.dosya.yol = 'IDARI'; g.sureler.push(sure({ tur: 'IYUK13_BASVURU', onerilenIhtiyatli: G('2026-06-01'), dayanak: 'İYUK 13/1' })); return { g } } },
    { ad: 'başvurudan 30 gün sonra cevap yok', kural: 'ID-03', simdi: true,
      kur: () => { const g = bosGercekler(); g.dosya.durum = 'IDARI_YOL'; g.sureler.push(sure({ tur: 'IYUK_ZIMNI_RET', tetikTarihi: G('2026-01-15'), dayanak: 'İYUK 10' })); return { g } } },
    { ad: 'ret cevabı tebliğ edildi', kural: 'ID-04', simdi: true,
      kur: () => { const g = bosGercekler(); g.dosya.durum = 'IDARI_YOL'; g.sureler.push(sure({ tur: 'IYUK7_DAVA', tetikTuru: 'TEBLIG', tetikTarihi: G('2026-02-20'), onerilenIhtiyatli: G('2026-04-21'), dayanak: 'İYUK 7' })); return { g } } },
    { ad: 'tebliğ edilemedi (İADE)', kural: 'TB-05', simdi: true,
      kur: () => { const g = takipliDosya(); const b = borclu(1); g.borclular = [b]; g.olaylar.push(olay({ altTip: 'TEBLIG_IADE', borcluId: b.id, hukukiTarih: G('2026-01-25') })); return { g } } },
    { ad: 'UYAP durum metninde itiraz, dilekçe inmedi', kural: 'TB-06', simdi: true, metin: 'İtiraz var (UYAP): itiraz dilekçesini çekin',
      kur: () => { const g = takipliDosya(); g.dosya.icraEksen = 'DURDU_ITIRAZ'; g.dosya.uyapDurum = 'Açık (durdurulmuş : Takibe İtiraz)'; return { g } } },
    { ad: 'itiraz İİK 62 penceresinden sonra', kural: 'TB-10',
      kur: () => {
        const g = takipliDosya(); const b = borclu(1, { takip: takip({ tebligTarihi: G('2026-01-20'), tebligSonucu: 'TEBLIG', itirazVar: true, itirazVerilisTarihi: G('2026-02-10'), itirazTipi: 'TAM', itirazAlacakliyaTebligTarihi: G('2026-02-12') }) })
        g.borclular = [b]; g.yolSecimleri.push({ id: 'y', asama: 'ITIRAZ_SONRASI', secim: 'GENEL_ALACAK', davaId: null, durum: 'GECERLI', secimAt: G('2026-02-15') })
        g.onayKayitlari.push({ id: 'o', tur: 'DAVA_ACMA', sonuc: 'ONAY', istenmeAt: null, alinmaAt: G('2026-02-16'), yolSecimiId: 'y', davaId: null, createdAt: G('2026-02-16') })
        return { g }
      } },
    { ad: 'kısmi itiraz', kural: 'TB-11',
      kur: () => { const g = takipliDosya(); g.borclular = [borclu(1, { takip: takip({ tebligTarihi: G('2026-01-20'), tebligSonucu: 'TEBLIG', itirazVar: true, itirazVerilisTarihi: G('2026-01-25'), itirazTipi: 'KISMI', itirazAlacakliyaTebligTarihi: G('2026-02-01') }) })]; return { g } } },
    { ad: 'UYAP gelişmesi (diğer) onay bekliyor', kural: 'TB-02', simdi: true, metin: "UYAP'tan gelen 2 gelişmeyi onaylayın",
      kur: () => { const g = takipliDosya(); g.olaylar.push(olay({ altTip: 'MUVEKKIL_ALACAGINA_HACIZ', hukukiTarih: G('2026-02-01') }), olay({ altTip: 'ICRAI_HACIZ', hukukiTarih: G('2026-02-02') })); return { g } } },
    { ad: 'arabuluculukta anlaşma, plan yok', kural: 'AR-08', simdi: true,
      kur: () => { const g = takipliDosya(); g.arabuluculuk = { id: 'a', asamaId: 'as', tur: 'DAVA_SARTI', basvuruTarihi: G('2026-02-01'), sonTutanakTarihi: G('2026-02-20'), sonuc: 'ANLASMA', sonTutanakBelgeId: 'bt', onayAt: G('2026-02-21'), createdAt: G('2026-02-01') }; return { g } } },
    { ad: 'tevzi formu görüldü, dava bağlı değil', kural: 'DA-05', simdi: true, metin: 'Bulunan davayı onaylayın',
      kur: () => { const g = takipliDosya(); g.belgeler.push(belge({ kaynak: 'UYAP_ICRA', uyapDosyaTuru: 'ICRA', uyapEvrakTuru: 'Hukuk Mahkemesi Tevzi Formu', tarih: G('2026-02-25') })); return { g } } },
    { ad: 'karşı taraf davası', kural: 'DA-07', simdi: true,
      kur: () => { const g = takipliDosya(); g.davalar.push(dava({ rolumuz: 'DAVALI', acilisTarihi: G('2026-02-20'), esasVar: true, durum: 'DERDEST', usul: 'YAZILI' })); return { g } } },
    { ad: 'basit usulde cevap tebliği', kural: 'YR-04', simdi: true,
      kur: () => {
        const g = takipliDosya(); g.davalar.push(dava({ acilisTarihi: G('2026-02-01'), esasVar: true, durum: 'DERDEST', usul: 'BASIT' }))
        g.davaIslemleri.push(islem({ tur: 'CEVAP', teyit: 'TEYITLI', tarih: G('2026-02-20'), tebligTarihi: G('2026-02-22') }))
        return { g }
      } },
  ]

  it.each(vakalar)('$kural · $ad', ({ kural, kur, simdi, metin }) => {
    const { g, bugun } = kur()
    const s = hesapla(g, bugun ?? BUGUN)
    expect(kodlar(s), tekCumle(s)).toContain(kural)
    if (simdi) expect(s.simdi?.kural, tekCumle(s)).toBe(kural)
    if (metin) expect(s.tumu.find((a) => a.kural === kural)?.metin).toBe(metin)
  })

  it('prova modunda canlı kurallar (GN-06, TK-04) değerlendirilmez', () => {
    const g = takipliDosya()
    g.dosya.uyapSenkronAt = null
    g.senkronIsleri.push({ id: 'is-1', tur: 'ICRA', durum: 'BEKLIYOR', hata: null, createdAt: G('2026-03-01', '11:50'), bittiAt: null })
    expect(kodlar(siradakiAdim(g, BUGUN))).toEqual(expect.arrayContaining(['GN-06']))
    g.senkronIsleri = []
    expect(kodlar(siradakiAdim(g, BUGUN))).toContain('TK-04')
    g.kesimTarihi = BUGUN
    g.senkronIsleri.push({ id: 'is-2', tur: 'ICRA', durum: 'BEKLIYOR', hata: null, createdAt: G('2026-03-01', '11:50'), bittiAt: null })
    const s = siradakiAdim(g, BUGUN)
    expect(kodlar(s)).not.toContain('GN-06')
    expect(kodlar(s)).not.toContain('TK-04')
    expect(s.prova).toBe(true)
  })
})

// ─────────────────────────── öncelik, sıralama, erteleme, güvenlik ───────────────────────────

describe('öncelik merdiveni ve Şimdi/Sonra', () => {
  it('eşit öncelikte en yakın son gün kazanır; Sonra en çok 3, kalanı katlanır', () => {
    const g = takipliDosya()
    g.sureler.push(
      sure({ tur: 'IIK67', onaylananSonGun: G('2026-03-06'), onayAt: G('2026-01-01') }),
      sure({ tur: 'AVANS', davaId: 'd', onaylananSonGun: G('2026-03-03'), onayAt: G('2026-01-01') }),
    )
    g.dosya.zamanasimi = null
    g.olaylar.push(olay({ altTip: 'ICRAI_HACIZ' }))
    g.borclular = [borclu(1, { tur: 'KAMU' })]
    g.dosya.uyapDurum = 'Kapalı'
    g.olaylar.push(olay({ altTip: 'TAHSILAT_BORCLUDAN', tutar: 10 }))
    const s = siradakiAdim(g, BUGUN)
    // GN-05 (1) ve YR-10 (1): YR-10'un son günü 03.03, GN-05'in en yakını da 03.03 → tablo sırası: GN-05 önce
    expect(s.simdi?.kural).toBe('GN-05')
    expect(s.simdi?.sonGun).toBe('2026-03-03')
    expect(s.sonra.length).toBe(3)
    expect(s.sonra[0].kural).toBe('YR-10')
    expect(s.sonraKatlanan).toBe(s.tumu.length - 4)
    expect(s.sonraKatlanan).toBeGreaterThan(0)
  })

  it('engel (öncelik 0) her şeyin önüne geçer ve engeller listesinde durur', () => {
    const g = takipliDosya()
    g.sureler.push(sure({ tur: 'IIK67', onaylananSonGun: G('2026-03-02'), onayAt: G('2026-01-01') }))
    g.dosya.uyapEslesme = 'TARAF_UYUSMAZ'
    const s = siradakiAdim(g, BUGUN)
    expect(s.simdi?.kural).toBe('GN-03')
    expect(s.engeller.map((a) => a.kural)).toEqual(['GN-03'])
    expect(s.sonra[0].kural).toBe('GN-05')
  })

  it('ertelenen adım bitişe kadar Şimdi/Sonra\'ya girmez; süresi dolan erteleme yok sayılır', () => {
    const g = takipliDosya()
    g.olaylar.push(olay({ altTip: 'ICRAI_HACIZ' }))
    expect(siradakiAdim(g, BUGUN).simdi?.kural).toBe('TB-02')
    g.ertelemeler = [{ kural: 'TB-02', bitis: G('2026-03-05', '23:59'), at: G('2026-03-01') }]
    const s = siradakiAdim(g, BUGUN)
    expect(s.simdi?.kural).not.toBe('TB-02')
    expect(s.ertelenenler.map((a) => [a.kural, a.ertelendi])).toEqual([['TB-02', '2026-03-05']])
    expect(siradakiAdim(g, G('2026-03-06', '12:00')).simdi?.kural).toBe('TB-02')
  })

  it('veri engeli, süre riski ve süre başlatan aday ertelenemez', () => {
    const g = takipliDosya()
    g.dosya.onarimDurumu = 'BEKLIYOR'
    g.olaylar.push(olay({ altTip: 'TEBLIG_SONUCU', hukukiTarih: G('2026-02-20') }))
    g.sureler.push(sure({ tur: 'IIK67', onaylananSonGun: G('2026-03-02'), onayAt: G('2026-01-01') }))
    g.ertelemeler = ['GN-01', 'TB-01', 'GN-05'].map((kural) => ({ kural, bitis: G('2026-03-20'), at: G('2026-03-01') }))
    const s = siradakiAdim(g, BUGUN)
    expect(s.ertelenenler).toEqual([])
    expect(s.tumu.map((a) => a.kural)).toEqual(expect.arrayContaining(['GN-01', 'TB-01', 'GN-05']))
  })

  it('hesaplanamayan kural sessizce atlanmaz: "durum bilinmiyor" engeli olur', () => {
    const bozuk: Kural = { ...KURALLAR.find((k) => k.kod === 'EV-01')!, degerlendir: () => { throw new Error('bozuk') } }
    const s = siradakiAdim(bosGercekler(), BUGUN, { kurallar: [bozuk] })
    expect(s.simdi?.kural).toBe('EV-01')
    expect(s.simdi?.engel).toBe(true)
    expect(s.simdi?.metin).toMatch(/^Durum bilinmiyor/)
  })

  it('iş yoksa bekleme kartı ve tek cümle "Bekliyoruz"', () => {
    const g = takipliDosya()
    const s = siradakiAdim(g, G('2026-01-15', '12:00'))
    expect(s.simdi).toBeNull()
    expect(s.bekleme?.kural).toBe('TB-03')
    expect(tekCumle(s)).toBe('Bekliyoruz: Ödeme emrinin tebliği bekleniyor.')
  })
})

// ─────────────────────────── S20 kabul testinin motor karşılığı ───────────────────────────

describe('S20 kabul (motor)', () => {
  /** SEN-01 deseni: 1. borçlu itirazı onaylı, size tebliğ tarihi yok; 2. borçlu kamu idaresi. */
  function sen01(): Gercekler {
    const g = takipliDosya()
    g.belgeler.push(belge({ id: 'itiraz-belge', kaynak: 'UYAP_ICRA', uyapEvrakTuru: 'Borca İtiraz Dilekçesi', tarih: G('2026-01-25') }))
    g.borclular = [
      borclu(1, { takip: takip({ tebligTarihi: G('2026-01-20'), tebligSonucu: 'TEBLIG', itirazVar: true, itirazVerilisTarihi: G('2026-01-25'), itirazTipi: 'TAM', itirazKaynakBelgeId: 'itiraz-belge' }) }),
      borclu(2, { tur: 'KAMU', takip: takip({ tebligTarihi: G('2026-01-21'), tebligSonucu: 'TEBLIG' }) }),
    ]
    g.sureler.push(sure({ tur: 'IIK67', borcluId: 'borclu-1', tetikTarihi: G('2026-01-25'), onerilenIhtiyatli: G('2027-01-25'), dayanak: 'İİK 67/1', kaynakBelgeId: 'itiraz-belge', kaynakAlinti: 'borca, faize ve ferilerine itiraz ederim' }))
    g.sureler.push(sure({ tur: 'IIK62', borcluId: 'borclu-2', onerilenIhtiyatli: G('2026-01-28'), onaylananSonGun: G('2026-01-28'), onayAt: G('2026-01-22'), durum: 'KAPANDI' }))
    return g
  }

  it('SEN-01 → Şimdi TB-08; kamu idaresi borçlusu için HZ-05 Sonra listesinde', () => {
    const s = siradakiAdim(sen01(), BUGUN)
    expect(s.simdi?.kural).toBe('TB-08')
    expect(s.simdi?.metin).toBe('İtirazın size tebliğ tarihini girin (İİK 67 başlangıcı)')
    expect(s.sonra.map((a) => a.kural)).toContain('HZ-05')
  })

  it('SEN-01 tebliğ adayı onaylanmamışken de Şimdi TB-08 (eşit öncelikte son günü olan önce), TB-01 Sonra\'da', () => {
    const g = sen01()
    g.olaylar.push(olay({ altTip: 'TEBLIG_SONUCU', sonuc: 'TEBLIG', borcluId: 'borclu-1', hukukiTarih: G('2026-01-20') }))
    const s = siradakiAdim(g, BUGUN)
    expect(s.simdi?.kural).toBe('TB-08')
    expect(s.sonra.map((a) => a.kural)).toContain('TB-01')
  })

  it('"Neden?" kural kodu, kanıt belgesi ve alıntıyı taşır', () => {
    const a = siradakiAdim(sen01(), BUGUN).simdi!
    expect(a.kural).toBe('TB-08')
    expect(a.neden).toContain('1. borçlu itiraz etti (onaylı, 25.01.2026)')
    expect(a.neden).toContain('İİK 67 ihtiyatlı son gün 25.01.2027 (teyit gerekli)')
    expect(a.kanit.some((k) => k.tur === 'BELGE' && k.belgeId === 'itiraz-belge')).toBe(true)
    expect(a.kanit.some((k) => k.tur === 'SURE' && k.alinti === 'borca, faize ve ferilerine itiraz ederim')).toBe(true)
  })

  it('SEN-06 → Şimdi ID-01 ("AI idari yol öneriyor")', () => {
    const g = bosGercekler()
    g.dosya.yol = 'IDARI'; g.dosya.yolGuven = 0.9; g.dosya.yolNeden = 'Borçlu kamu idaresi.'
    g.belgeler = [belge({ metinDurumu: 'BEKLIYOR' })]
    const s = siradakiAdim(g, BUGUN)
    expect(s.simdi?.kural).toBe('ID-01')
    expect(tekCumle(s)).toBe('Şimdi: AI idari yol öneriyor (güven %90): yolu onaylayın.')
  })

  it('kişisel veri yok: borçlular yalnız sıra numarasıyla anılır', () => {
    const s = siradakiAdim(sen01(), BUGUN)
    const metinler = JSON.stringify(s)
    expect(metinler).toContain('1. borçlu')
    expect(metinler).not.toMatch(/\b\d{11}\b/) // TCKN biçimi yok
  })
})

// ─────────────────────────── kapsam ───────────────────────────

describe('kapsam', () => {
  it('ETKİN her kural bu test dosyasında en az bir kez tetiklendi (bütün kuralları dolaşan kurgu)', () => {
    const etkin = KURALLAR.filter((k) => k.durumu === 'ETKIN').map((k) => k.kod)
    const eksik = etkin.filter((k) => !tetiklenen.has(k))
    expect(eksik).toEqual([])
  })
})
