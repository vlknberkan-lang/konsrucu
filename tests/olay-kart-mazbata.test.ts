/**
 * S23 · Mazbata okuma (lib/konsrucu/eksen/mazbata.ts) — deterministik kalıplar, yapay zekâsız.
 * 06 §2(e): İADE ile tebliğ ayrımı evrak adından değil METİNDEN; tek başına "iade" kalıp değildir; UETS'te ulaşma
 * + 5 gün; muhatap borçlu listesiyle sunucuda eşleşir; tarih uydurulmaz. Metinler kurgusaldır; kişisel veri yok.
 */
import { describe, it, expect } from 'vitest'
import { borcluEslestir, mazbataBelgesiMi, mazbataOku, UETS_TEBLIG_GUN } from '@/lib/konsrucu/eksen/mazbata'
import { mazbataAltTipi, mazbataPlani } from '@/lib/konsrucu/eksen/mazbata-aday'
import { isoGun } from '@/lib/konsrucu/eksen/norm'
import { ekranMaskele } from '@/lib/konsrucu/eksen/maske'
import { MAZBATA } from './eksen-kurgusal'

const B = [{ id: 'b1', adUnvan: '[Kurgusal Borçlu Bir]' }, { id: 'b2', adUnvan: '[Kurgusal Borçlu İki]' }]

describe('sonuç: tebliğ mi, İADE mi?', () => {
  it('bila tebliğ → İADE; tarih okunmuyorsa uydurulmaz', () => {
    const o = mazbataOku(MAZBATA.d2Iade, B)!
    expect(o.sonuc).toBe('IADE')
    expect(o.kural).toBe('MZ-IADE@1')
    expect(o.tarih).toBeNull()
    expect(o.borcluId).toBe('b1')
  })
  it('"adreste bulunamadığından muhtara teslim ... kapısına yapıştırıldı" GEÇERLİ tebliğdir (pozitif ifade üstün)', () => {
    const o = mazbataOku(MAZBATA.d2Tk21Ocr, B)!
    expect(o.sonuc).toBe('TEBLIG')
    expect(o.sekil).toBe('TK21_2')
    expect(isoGun(o.tarih)).toBe('2026-06-25')
  })
  it('"tebliğ edilemedi" ve "adresten taşınmış" → İADE', () => {
    expect(mazbataOku('Tebligat mazbatası: muhatap tebliğ edilemedi, adres kapalı.', B)!.sonuc).toBe('IADE')
    expect(mazbataOku('Mazbata: muhatap adresten taşınmış olup bila iade.', B)!.sonuc).toBe('IADE')
  })
  it('tek başına "iade" kelimesi kalıp değildir (harç iadesi tebliğ sonucu değildir)', () => {
    const o = mazbataOku('Makbuz: harç iadesi yapılmıştır, iade tutarı hesaba geçti.', B)!
    expect(o.sonuc).toBe('BELIRSIZ')
  })
})

describe('şekil ve tarih', () => {
  it(`UETS: ulaşma tarihi + ${UETS_TEBLIG_GUN} gün önerilir ve uyarı yazılır (Tebligat K. 7/a, teyit gerekli)`, () => {
    const o = mazbataOku(MAZBATA.d1Uets, [{ id: 'bi', adUnvan: '[Kurgusal Borçlu İdare] Belediye Başkanlığı' }])!
    expect(o.sekil).toBe('UETS')
    expect(o.sonuc).toBe('TEBLIG')
    expect(isoGun(o.uetsUlasma)).toBe('2026-06-23')
    expect(isoGun(o.tarih)).toBe('2026-06-28')
    expect(o.uyarilar.join(' ')).toMatch(/ulaşma \+ 5 gün/)
    expect(o.borcluId).toBe('bi')
    expect(o.kural).toBe('MZ-UETS@1')
  })
  it('UETS metninde açık okunduğu tarih varsa o önerilir; alacaklı vekiline giden tebliğ muhatap ALACAKLI_VEKILI', () => {
    const o = mazbataOku(MAZBATA.d2Alacakliya, B)!
    expect(isoGun(o.tarih)).toBe('2026-07-01')
    expect(o.muhatap).toBe('ALACAKLI_VEKILI')
    expect(mazbataAltTipi(o)).toBe('ITIRAZIN_ALACAKLIYA_TEBLIGI')
  })
  it('TK 21/1 açıkça yazılıysa TK21_1; yalnız "muhtara teslim" ise 21/2 ve teyit uyarısı', () => {
    expect(mazbataOku('Tebliğ evrakı 01.07.2026 tarihinde muhtara teslim edildi, TK 21/1 gereği ihbarname kapıya yapıştırıldı.', B)!.sekil).toBe('TK21_1')
    const o = mazbataOku('Tebliğ evrakı 01.07.2026 tarihinde muhtara teslim edildi, ihbarname kapıya yapıştırıldı.', B)!
    expect(o.sekil).toBe('TK21_2')
    expect(o.uyarilar.join(' ')).toMatch(/21\/1 mi 21\/2 mi/)
  })
  it('bizzat teslim → MUHATABA; "tebliğ tarihi:" satırı okunur', () => {
    const o = mazbataOku('Tebliğ tarihi: 03.07.2026. Evrak muhatabın bizzat kendisine teslim edildi, imzası alındı.', B)!
    expect(o.sekil).toBe('MUHATABA')
    expect(isoGun(o.tarih)).toBe('2026-07-03')
  })
  it('tarih tebliğe bağlanamıyorsa tahmin yapılmaz, "tarihi girin" uyarısı', () => {
    const o = mazbataOku('Tebligat mazbatası. Evrak 12.06.2026 düzenlendi. Tebliğ edildi.', B)!
    expect(o.sonuc).toBe('TEBLIG')
    expect(o.tarih).toBeNull()
    expect(o.uyarilar.join(' ')).toMatch(/tarihi girin/)
  })
  it('geçersiz takvim günü okunmaz (31.02)', () => {
    expect(mazbataOku('Tebliğ tarihi: 31.02.2026 tebliğ edildi', B)!.tarih).toBeNull()
  })
})

describe('muhatap eşleştirme ve OCR', () => {
  it('tek borçlu eşleşirse kimlik; iki borçlu adı geçerse belirsiz ve uyarı', () => {
    expect(borcluEslestir('Muhatap: [Kurgusal Borçlu İki]', B)).toEqual({ borcluId: 'b2', adet: 1 })
    const o = mazbataOku('Muhatap: [Kurgusal Borçlu Bir] ve [Kurgusal Borçlu İki]. Tebliğ edildi.', B)!
    expect(o.borcluId).toBeNull()
    expect(o.uyarilar.join(' ')).toMatch(/birden çok borçlu/)
  })
  it('ad listede yoksa "borçlu belirsiz"', () => {
    const o = mazbataOku('Muhatap: [Başka Kişi]. Tebliğ edildi.', B)!
    expect(o.muhatap).toBe('BELIRSIZ')
    expect(o.uyarilar.join(' ')).toMatch(/Borçlu belirsiz/)
  })
  it('düşük OCR güveni uyarı üretir', () => {
    expect(mazbataOku(MAZBATA.d2Tk21Ocr, B, 0.55)!.uyarilar.join(' ')).toMatch(/OCR.*%55/)
    expect(mazbataOku(MAZBATA.d2Tk21Ocr, B, 0.9)!.uyarilar.join(' ')).not.toMatch(/OCR/)
  })
  it('alıntı kısa ve kişisel veri maskeli (TCKN, telefon)', () => {
    const iade = mazbataOku(MAZBATA.d2Iade, B)!
    expect(iade.alinti).toMatch(/Bila tebliğ iade/)
    const tk = mazbataOku(MAZBATA.d2Tk21Ocr, B)!
    expect(tk.alinti).not.toMatch(/0532 111 22 33/)
    expect((tk.alinti ?? '').length).toBeLessThan(260)
  })
  it('boş ya da çok kısa metin okunmaz', () => {
    expect(mazbataOku('', B)).toBeNull()
    expect(mazbataOku('abc', B)).toBeNull()
  })
})

describe('ekran maskesi', () => {
  it('TCKN/VKN, telefon ve IBAN maskelenir; tarih ve esas no maskelenmez', () => {
    const m = ekranMaskele('TCKN 12345678950, VKN 1234567890, tel 0532 111 22 33, IBAN TR12 0006 1005 1978 6457 8413 26, tarih 01.07.2026, esas 2026/123')
    expect(m).not.toMatch(/12345678950|1234567890|0532 111 22 33|0006 1005/)
    expect(m).toMatch(/01\.07\.2026/)
    expect(m).toMatch(/2026\/123/)
  })
})

describe('mazbata belgesi ve aday planı', () => {
  it('mazbata belgesi tanınır; talep/dilekçe mazbata değildir', () => {
    expect(mazbataBelgesiMi({ altTur: 'ICRA_TEBLIG_MAZBATASI' })).toBe(true)
    expect(mazbataBelgesiMi({ dosyaAdi: 'E-Tebligat Mazbatası 2026-06-29.pdf' })).toBe(true)
    expect(mazbataBelgesiMi({ uyapEvrakTuru: 'Bila Tebliğ Evrakı' })).toBe(true)
    expect(mazbataBelgesiMi({ dosyaAdi: 'Tebligat Talebi.pdf' })).toBe(false)
    expect(mazbataBelgesiMi({ dosyaAdi: 'Dekont.pdf' })).toBe(false)
  })
  it('±3 gün içindeki belgesiz aday zenginleştirilir; yoksa yeni aday; belge bir kez kullanılır', () => {
    const belge = { id: 'm1', dosyaAdi: 'Mazbata.pdf', altTur: null, uyapEvrakTuru: null, kaynak: 'UYAP_ICRA', belgeTarihi: new Date('2026-06-30'), extractedText: MAZBATA.d2Tk21Ocr, metinYontemi: 'OCR', metinGuven: 0.7 }
    const okuma = mazbataOku(belge.extractedText, B)!
    const aday = { id: 'o1', altTip: 'TEBLIG_SONUCU', teyit: 'ADAY', borcluId: null, hukukiTarih: new Date('2026-06-25'), tarih: new Date('2026-06-25'), kaynakBelgeId: null }
    expect(mazbataPlani(belge, okuma, [aday])).toMatchObject({ tur: 'ZENGINLESTIR', olayId: 'o1', altTip: 'TEBLIG_SONUCU' })
    expect(mazbataPlani(belge, okuma, [{ ...aday, hukukiTarih: new Date('2026-06-01'), tarih: new Date('2026-06-01') }])).toMatchObject({ tur: 'YENI' })
    expect(mazbataPlani(belge, okuma, [{ ...aday, teyit: 'TEYITLI' }])).toMatchObject({ tur: 'YENI' }) // onaylı aday değiştirilmez
    expect(mazbataPlani(belge, okuma, [{ ...aday, kaynakBelgeId: 'm1' }])).toBeNull()
  })
})
