/**
 * S27 · dava kaydı yardımcıları: esas/mahkeme ayrıştırma (uydurma yok), Asama aynası, alt kayıt kapsamı (M7),
 * kayıt kaynağı/teyit işareti. Kurgusal mahkeme adları.
 */
import { describe, expect, it } from 'vitest'
import { altKayit, altKayitDosyaDenetle, arabuluculukAsamaAynasi, asamaAynasi, esasCoz, esasMetni, KapsamHatasi, kayitIsaretiOku, kayitIsaretiYaz, mahkemeAdi, mahkemeCoz } from '@/lib/konsrucu/dava/kayit'

describe('esasCoz', () => {
  it.each([
    ['2026/384', { yil: 2026, sira: 384 }],
    ['2026 / 384 E.', { yil: 2026, sira: 384 }],
    ['Esas: 2025/12', { yil: 2025, sira: 12 }],
  ])('%s', (ham, beklenen) => expect(esasCoz(ham)).toEqual(beklenen))
  it('geçersiz esas uydurulmaz', () => {
    expect(esasCoz('384')).toBeNull()
    expect(esasCoz('1890/5')).toBeNull()
    expect(esasCoz(null)).toBeNull()
  })
  it('esasMetni', () => {
    expect(esasMetni(2026, 384)).toBe('2026/384')
    expect(esasMetni(null, 3)).toBeNull()
  })
})

describe('mahkemeCoz', () => {
  it('numaralı mahkeme: yer, no, tür', () => {
    expect(mahkemeCoz('Kurgukent 51. Asliye Hukuk Mahkemesi\r\n')).toMatchObject({ tur: 'ASLIYE_HUKUK', yer: 'Kurgukent', no: '51', ayristirilamadi: false })
  })
  it('numarasız mahkeme ve çok kelimeli yer', () => {
    expect(mahkemeCoz('Denemeşehir Tüketici Mahkemesi')).toMatchObject({ tur: 'TUKETICI', yer: 'Denemeşehir', no: null })
    expect(mahkemeCoz('Kurgukent Anadolu 7. Asliye Ticaret Mahkemesi')).toMatchObject({ tur: 'ASLIYE_TICARET', yer: 'Kurgukent Anadolu', no: '7' })
  })
  it('tanınmayan tür: tur null + ayrıştırılamadı (uydurma yok)', () => {
    expect(mahkemeCoz('Kurgukent 3. İş Mahkemesi')).toMatchObject({ tur: null, ayristirilamadi: true })
    expect(mahkemeCoz('')).toBeNull()
  })
  it('mahkemeAdi ve Asama aynası', () => {
    const d = { mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'Kurgukent', mahkemeNo: '51', esasYil: 2026, esasSira: 384, acilisTarihi: new Date('2026-08-07') }
    expect(mahkemeAdi(d)).toBe('Kurgukent 51. Asliye Hukuk')
    expect(asamaAynasi(d)).toEqual({ kimlikNo: '2026/384', birim: 'Kurgukent 51. Asliye Hukuk Mahkemesi', baslangic: d.acilisTarihi })
    expect(arabuluculukAsamaAynasi({ buroNo: '2026/9', basvuruTarihi: new Date('2026-07-01'), sonTutanakTarihi: null })).toMatchObject({ kimlikNo: '2026/9', bitis: null })
  })
})

describe('alt kayıt kapsamı (M7)', () => {
  it('alt kaydın dosyaId\'si DAİMA üst davadan gelir', () => {
    const r = altKayit({ id: 'dava-1', dosyaId: 'dosya-A' }, { tur: 'TENSIP', dosyaId: 'dosya-B' } as Record<string, unknown>)
    expect(r.dosyaId).toBe('dosya-A')
    expect(r.davaId).toBe('dava-1')
  })
  it('farklı dosya yazma yardımcısında durur', () => {
    expect(() => altKayitDosyaDenetle({ dosyaId: 'A' }, { dosyaId: 'B' })).toThrow(KapsamHatasi)
    expect(() => altKayitDosyaDenetle({ dosyaId: '' }, { dosyaId: '' })).toThrow(KapsamHatasi)
    expect(() => altKayitDosyaDenetle({ dosyaId: 'A' }, { dosyaId: 'A' })).not.toThrow()
  })
})

describe('kayıt işareti (Asama.detayJson)', () => {
  it('işaretsiz eski kayıt elle ve teyitli sayılır', () => {
    expect(kayitIsaretiOku(null)).toEqual({ kaynakTuru: 'ELLE', teyit: 'TEYITLI' })
    expect(kayitIsaretiOku({ arabulucu: 'x' })).toEqual({ kaynakTuru: 'ELLE', teyit: 'TEYITLI' })
  })
  it('geri doldurma işareti (üst düzey ya da yeniden kullanılan aşamada iç içe) ADAY okunur', () => {
    expect(kayitIsaretiOku({ kaynakTuru: 'GERI_DOLDURMA', teyit: 'ADAY' })).toEqual({ kaynakTuru: 'GERI_DOLDURMA', teyit: 'ADAY' })
    expect(kayitIsaretiOku({ arabulucu: 'x', geriDoldurma: { kaynakTuru: 'GERI_DOLDURMA', teyit: 'ADAY' } })).toEqual({ kaynakTuru: 'GERI_DOLDURMA', teyit: 'ADAY' })
  })
  it('teyit yazılınca mevcut alanlar korunur, iç içe işaret de güncellenir', () => {
    const y = kayitIsaretiYaz({ arabulucu: 'x', geriDoldurma: { kaynakTuru: 'GERI_DOLDURMA', teyit: 'ADAY' } }, { kaynakTuru: 'GERI_DOLDURMA', teyit: 'TEYITLI', girenId: 'u1' })
    expect(y.arabulucu).toBe('x')
    expect(kayitIsaretiOku(y).teyit).toBe('TEYITLI')
    expect((y.geriDoldurma as { teyit: string }).teyit).toBe('TEYITLI')
  })
})
