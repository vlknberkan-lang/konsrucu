/**
 * Dosya Yol Haritası — PROVA modu (S20; 06 §8.5). Onaylı olgular HUKUKİ TARİHE göre süzülür (onay anına göre
 * değil); kararlar kendi karar anına göre; riski azaltan geçişler kesimden sonraysa geri alınır; canlı sinyaller
 * yok sayılır; prova girdiyi değiştirmez. Veriler kurgusaldır; kişisel veri yok.
 */
import { describe, expect, it } from 'vitest'
import {
  bosGercekler, kesimUygula, provaTarihiCoz, siradakiAdim, yolHaritasiHesapla,
  type Gercekler, type GOlay, type GSure,
} from '@/lib/konsrucu/yol-haritasi'

const G = (gun: string, saat = '09:00') => new Date(`${gun}T${saat}:00+03:00`)
const SIMDI = G('2026-09-27', '12:00')

function olay(o: Partial<GOlay>): GOlay {
  return { id: `o-${Math.random()}`, altTip: null, teyit: 'TEYITLI', borcluId: 'borclu-1', hukukiTarih: null, tarih: null, tutar: null, sonuc: null, kaynakBelgeId: null, kural: 'TEST@1', createdAt: G('2026-06-01'), ...o }
}
function sure(o: Partial<GSure> & { tur: string }): GSure {
  return {
    id: `s-${o.tur}`, dayanak: o.tur, borcluId: null, davaId: null, arabuluculukId: null, tetikTarihi: null, tetikTuru: 'TEBLIG', onerilenIhtiyatli: null, onerilenSonGun: null,
    onaylananSonGun: null, onayAt: null, ikinciTeyitAt: null, durum: 'ACIK', kapanisKanitiBelgeId: null, kapanisAt: null, kaynakBelgeId: null, kaynakAlinti: null,
    durmaVar: false, createdAt: G('2026-06-01'), ...o,
  }
}

/**
 * D1–D3 desenli kurgusal dosya: kayıtların çoğu sonradan (Haziran'da) girildi ya da onaylandı; hukuki tarihler
 * Ocak–Nisan. SEN-01'deki gibi tebliğ adayı onaylanmamış, itiraz onaylı.
 */
function gecmisliDosya(): Gercekler {
  const g = bosGercekler('dosya-prova')
  g.belgeler = [
    { id: 'police', dosyaAdi: 'police.pdf', kategori: 'POLICE', altTur: null, kaynak: 'HUGO_FOTO', metinDurumu: 'METIN_KATMANI', uyapEvrakTuru: null, uyapDosyaTuru: null, davaId: null, tarih: null, createdAt: G('2026-06-01') },
    { id: 'itiraz-belge', dosyaAdi: 'Borca itiraz 2026-01-25.pdf', kategori: 'DIGER', altTur: 'ICRA_ITIRAZ', kaynak: 'UYAP_ICRA', metinDurumu: 'METIN_KATMANI', uyapEvrakTuru: 'Borca İtiraz Dilekçesi', uyapDosyaTuru: 'ICRA', davaId: null, tarih: G('2026-01-25'), createdAt: G('2026-06-01') },
  ]
  Object.assign(g.dosya, {
    rucuSebebiKod: 'KOD', icraDairesi: 'İzmir 3. İcra Dairesi', icraDosyaNo: '2026/77', takipTarihi: G('2026-01-10'),
    uyapDurum: 'Açık (durdurulmuş : Takibe İtiraz)', icraEksen: 'DURDU_ITIRAZ', eksenTeyit: { icra: 'TEYITLI', arab: null, dava: null },
    uyapSenkronAt: G('2026-09-27', '11:00'), onarimDurumu: 'BEKLIYOR', uyapEslesme: 'OK',
  })
  g.borclular = [{
    id: 'borclu-1', sira: 1, tur: 'GERCEK', teyitli: true,
    takip: {
      tebligTarihi: null, tebligSonucu: null, tebligSekli: null, tebligKaynakBelgeId: null,
      itirazVar: true, itirazVerilisTarihi: G('2026-01-25'), itirazUyapTarihi: G('2026-01-26'), itirazTipi: 'TAM', itirazEdilenTutar: 1000,
      itirazKaynakBelgeId: 'itiraz-belge', itirazAlacakliyaTebligTarihi: null,
    },
  }]
  g.olaylar = [
    // tebliğ adayı onaylanmadı (SEN-01): hukuki tarih 20.01
    olay({ id: 'teblig', altTip: 'TEBLIG_SONUCU', sonuc: 'TEBLIG', teyit: 'ADAY', hukukiTarih: G('2026-01-20') }),
    // itiraz Haziran'da onaylandı ama hukuki tarihi 25.01
    olay({ id: 'itiraz', altTip: 'ITIRAZ', teyit: 'TEYITLI', hukukiTarih: G('2026-01-25') }),
  ]
  g.sureler = [sure({ tur: 'IIK67', borcluId: 'borclu-1', tetikTarihi: G('2026-01-25'), onerilenIhtiyatli: G('2027-01-25') })]
  g.senkronIsleri = [{ id: 'is', tur: 'ICRA', durum: 'BEKLIYOR', hata: null, createdAt: G('2026-09-27', '11:58'), bittiAt: null }]
  g.nabiz = { sonGorulme: G('2026-09-27', '11:59'), uyapOturum: true }
  return g
}

describe('provaTarihiCoz', () => {
  it('YYYY-MM-DD → o günün İstanbul gün sonu', () => {
    const d = provaTarihiCoz('2026-07-01', SIMDI)!
    expect(d.toISOString()).toBe('2026-07-01T20:59:59.999Z')
  })
  it.each([['2026-7-1'], ['01.07.2026'], ['2026-02-30'], [''], [null], ['2026-09-28']])('geçersiz ya da gelecek tarih yok sayılır: %s', (s) => {
    expect(provaTarihiCoz(s as string | null, SIMDI)).toBeNull()
  })
  it('dizi parametrede ilk değer; bugün geçerli', () => {
    expect(provaTarihiCoz(['2026-09-27', '2026-01-01'], SIMDI)?.toISOString()).toBe('2026-09-27T20:59:59.999Z')
  })
})

describe('kesimUygula: olgular hukuki tarihe göre, onay anına göre değil', () => {
  it('S20 kabul 3: itirazdan önceki tarihte Şimdi kartı "Tebliğ tarihini onaylayın" (TB-01)', () => {
    const g = gecmisliDosya()
    const canli = siradakiAdim(g, SIMDI)
    expect(canli.simdi?.kural).toBe('GN-01') // canlıda onarım bekliyor
    const kesim = provaTarihiCoz('2026-01-22', SIMDI)!
    const s = siradakiAdim(kesimUygula(g, kesim), kesim)
    expect(s.simdi?.kural).toBe('TB-01')
    expect(s.simdi?.metin).toBe('Tebliğ tarihini onaylayın; İİK 62 buna bağlı')
    expect(s.prova).toBe(true)
  })

  it('itirazdan sonraki tarihte onay sonradan verilmiş olsa bile itiraz onaylı sayılır → TB-08 (SEN-01), tebliğ adayı Sonra\'da', () => {
    const kesim = provaTarihiCoz('2026-02-10', SIMDI)!
    const pg = kesimUygula(gecmisliDosya(), kesim)
    expect(pg.olaylar.find((o) => o.id === 'itiraz')?.teyit).toBe('TEYITLI')
    expect(pg.borclular[0].takip?.itirazVar).toBe(true)
    const s = siradakiAdim(pg, kesim)
    // ikisi de öncelik 2 (süre başlatan): son günü olan (İİK 67 ihtiyatlı) önce gelir
    expect(s.simdi?.kural).toBe('TB-08')
    expect(s.sonra.map((a) => a.kural)).toContain('TB-01')
  })

  it('kesimden sonraki olay, belge ve borçlu olgusu düşer', () => {
    const pg = kesimUygula(gecmisliDosya(), provaTarihiCoz('2026-01-22', SIMDI)!)
    expect(pg.olaylar.map((o) => o.id)).toEqual(['teblig'])
    expect(pg.belgeler.map((b) => b.id)).toEqual(['police']) // tarihsiz Ray/Hugo evrakı korunur; UYAP itiraz evrakı düşer
    expect(pg.borclular[0].takip?.itirazVar).toBeNull()
    expect(pg.borclular[0].takip?.itirazKaynakBelgeId).toBeNull()
    expect(pg.sureler).toEqual([]) // İİK 67'nin tetiği (itiraz) kesimden sonra
  })

  it('takipten önceki tarihte takip bilgisi yok', () => {
    const pg = kesimUygula(gecmisliDosya(), provaTarihiCoz('2026-01-05', SIMDI)!)
    expect(pg.dosya.icraDosyaNo).toBeNull()
    expect(pg.dosya.takipTarihi).toBeNull()
  })

  it('bugünü yansıtan önbellek ve canlı sinyaller provada yok: eksen, UYAP durumu, onarım, senkron işi, nabız', () => {
    const pg = kesimUygula(gecmisliDosya(), provaTarihiCoz('2026-03-01', SIMDI)!)
    expect(pg.dosya.icraEksen).toBeNull()
    expect(pg.dosya.uyapDurum).toBeNull()
    expect(pg.dosya.onarimDurumu).toBeNull()
    expect(pg.dosya.uyapEslesme).toBeNull()
    expect(pg.senkronIsleri).toEqual([])
    expect(pg.nabiz).toBeNull()
    expect(pg.ertelemeler).toEqual([])
    expect(pg.kesimTarihi?.toISOString()).toBe('2026-03-01T20:59:59.999Z')
  })

  it('prova girdiyi değiştirmez (yalnız okur)', () => {
    const g = gecmisliDosya()
    const once = JSON.stringify(g)
    kesimUygula(g, provaTarihiCoz('2026-01-22', SIMDI)!)
    expect(JSON.stringify(g)).toBe(once)
  })
})

describe('kesimUygula: kararlar kendi anına göre; riski azaltan geçişler geri alınır', () => {
  function davaliDosya(): Gercekler {
    const g = gecmisliDosya()
    g.dosya.onarimDurumu = null
    g.borclular[0].takip!.itirazAlacakliyaTebligTarihi = G('2026-02-01')
    g.olaylar[0].teyit = 'TEYITLI'
    g.borclular[0].takip!.tebligTarihi = G('2026-01-20'); g.borclular[0].takip!.tebligSonucu = 'TEBLIG'
    g.yolSecimleri = [{ id: 'y', asama: 'ITIRAZ_SONRASI', secim: 'ARABULUCULUK_IIK67', davaId: null, durum: 'GECERLI', secimAt: G('2026-02-05') }]
    g.onayKayitlari = [{ id: 'o', tur: 'DAVA_ACMA', sonuc: 'ONAY', istenmeAt: G('2026-02-05'), alinmaAt: G('2026-02-08'), yolSecimiId: 'y', davaId: null, createdAt: G('2026-06-01') }]
    g.arabuluculuk = { id: 'arb', asamaId: 'as-arb', tur: 'DAVA_SARTI', basvuruTarihi: G('2026-02-10'), sonTutanakTarihi: G('2026-03-10'), sonuc: 'ANLASAMAMA', sonTutanakBelgeId: 'tt', onayAt: G('2026-06-01'), createdAt: G('2026-06-01') }
    g.etkinlikler = [{ id: 'top', tur: 'ARABULUCULUK_TOPLANTISI', asamaId: 'as-arb', baslar: G('2026-03-03', '14:00'), durum: 'YAPILDI', teyit: null, kaynak: 'ELLE', createdAt: G('2026-06-01') }]
    g.davalar = [{
      id: 'dava', asamaId: 'as-dava', rolumuz: 'DAVACI', tur: 'ITIRAZIN_IPTALI', mahkemeTuru: 'ASLIYE_HUKUK', usul: 'YAZILI', davaDegeri: 1000, acilisTarihi: G('2026-04-01'),
      esasVar: true, durum: 'KARAR', onKontrol: [], onIncelemeTarihi: null, sonrakiDurusma: null, hukum: 'KABUL', kararTarihi: G('2026-08-01'), kararOnayAt: G('2026-08-02'),
      gerekceliTebligTarihi: null, kesinlesmeTarihi: null, createdAt: G('2026-06-01'),
    }]
    g.sureler = [sure({
      tur: 'IIK67', borcluId: 'borclu-1', tetikTarihi: G('2026-02-01'), onerilenIhtiyatli: G('2027-02-01'), onerilenSonGun: G('2027-03-01'), onaylananSonGun: G('2027-03-01'),
      onayAt: G('2026-06-02'), durum: 'KAPANDI', kapanisAt: G('2026-06-03'),
    })]
    return g
  }

  it('yol seçimi kesimden sonraysa provada yok → AR-01 (S47: itiraz günü → TB-08 ya da AR-01)', () => {
    const kesim = provaTarihiCoz('2026-02-03', SIMDI)!
    const s = siradakiAdim(kesimUygula(davaliDosya(), kesim), kesim)
    expect(s.tumu.map((a) => a.kural)).toContain('AR-01')
  })

  it('müvekkil onayı kesimden sonra alındıysa bekliyor görünür (AR-02 "Onayı kaydet")', () => {
    const kesim = provaTarihiCoz('2026-02-06', SIMDI)!
    const pg = kesimUygula(davaliDosya(), kesim)
    expect(pg.onayKayitlari[0].sonuc).toBe('BEKLIYOR')
    const s = siradakiAdim(pg, kesim)
    expect(s.simdi?.kural).toBe('AR-02')
    expect(s.simdi?.eylem?.etiket).toBe('Onayı kaydet')
  })

  it('başvuru sonrası, son tutanak öncesi: toplantı geçti, sonuç yok → AR-05 (S47)', () => {
    const kesim = provaTarihiCoz('2026-03-05', SIMDI)!
    const pg = kesimUygula(davaliDosya(), kesim)
    expect(pg.arabuluculuk?.sonuc).toBeNull()
    expect(siradakiAdim(pg, kesim).simdi?.kural).toBe('AR-05')
  })

  it('son tutanaktan sonraki gün: İİK 67 onayı kesimden sonra → yeniden onay (AR-07) ve dava ön kontrolü (DA-01) (S47)', () => {
    const g = davaliDosya()
    g.arabuluculuk!.onayAt = G('2026-03-10', '15:00')
    const kesim = provaTarihiCoz('2026-03-11', SIMDI)!
    const s = siradakiAdim(kesimUygula(g, kesim), kesim)
    expect(s.simdi?.kural).toBe('AR-07')
    expect(s.tumu.map((a) => a.kural)).toContain('DA-01')
  })

  it('dava açılışından sonraki gün: kapanış sonradan yapıldıysa İİK 67 açık görünür → DA-06a (S47)', () => {
    const g = davaliDosya()
    g.sureler[0].onayAt = G('2026-03-20')
    const kesim = provaTarihiCoz('2026-04-02', SIMDI)!
    const pg = kesimUygula(g, kesim)
    expect(pg.sureler[0].durum).toBe('ACIK')
    expect(pg.davalar[0].hukum).toBeNull() // karar kesimden sonra
    expect(pg.davalar[0].durum).toBe('DERDEST')
    expect(siradakiAdim(pg, kesim).simdi?.kural).toBe('DA-06a')
  })

  it('kesimden sonraki duruşma provada "planlandı" görünür; bağlı aşaması düşen etkinlik düşer', () => {
    const g = davaliDosya()
    g.etkinlikler.push({ id: 'dur', tur: 'DURUSMA', asamaId: 'as-dava', baslar: G('2026-05-10', '10:00'), durum: 'YAPILDI', teyit: 'TEYITLI', kaynak: 'UYAP', createdAt: G('2026-06-01') })
    const pg = kesimUygula(g, provaTarihiCoz('2026-05-08', SIMDI)!)
    expect(pg.etkinlikler.find((e) => e.id === 'dur')?.durum).toBe('PLANLANDI')
    const erken = kesimUygula(g, provaTarihiCoz('2026-02-01', SIMDI)!)
    expect(erken.etkinlikler).toEqual([]) // arabuluculuk ve dava henüz yok
    expect(erken.davalar).toEqual([])
    expect(erken.arabuluculuk).toBeNull()
  })
})

describe('yolHaritasiHesapla ile prova', () => {
  it('prova görünümü tarih taşır, bugün = kesim, UYAP bağlantısı gösterilmez', () => {
    const v = yolHaritasiHesapla(gecmisliDosya(), { simdi: SIMDI, kesim: provaTarihiCoz('2026-01-22', SIMDI) })
    expect(v.prova).toEqual({ tarih: '2026-01-22' })
    expect(v.sonuc.bugun).toBe('2026-01-22')
    expect(v.bugun).toBe('2026-09-27')
    expect(v.uyap.durum).toBe('PROVA')
    expect(v.tekCumle).toBe('Şimdi: Tebliğ tarihini onaylayın; İİK 62 buna bağlı.')
    // künye provada kayıtlı eksen önbelleğini değil tahmini gösterir
    expect(v.eksenler.find((e) => e.eksen === 'ICRA')?.kaynak).toBe('TAHMIN')
  })

  it('canlı görünümde kayıtlı eksen kaynağıyla, UYAP bağlantısı nabızdan', () => {
    const v = yolHaritasiHesapla(gecmisliDosya(), { simdi: SIMDI })
    expect(v.prova).toBeNull()
    expect(v.eksenler[0]).toMatchObject({ eksen: 'ICRA', deger: 'DURDU_ITIRAZ', kaynak: 'AVUKAT_ONAYLI', kaynakMetni: 'avukat onaylı' })
    expect(v.uyap.durum).toBe('ACIK')
    expect(v.duraklar).toHaveLength(8)
  })
})
