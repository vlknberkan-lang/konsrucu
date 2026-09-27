import { describe, expect, it } from 'vitest'
import { alintiBul, aramaNormal, type BelgeMetni } from '@/lib/konsrucu/dilekce-v2/alinti'
import { belgeBaglamiKur, BELGE_UST_SINIR, type BaglamBelgesi } from '@/lib/konsrucu/dilekce-v2/belge-baglami'
import { ekranMaskele } from '@/lib/konsrucu/dilekce-v2/ekran-maske'
import { savunmaIsaretle, cevaplanacaklar } from '@/lib/konsrucu/dilekce-v2/savunma-matrisi'

const belge: BelgeMetni = {
  belgeId: 'b1', ad: 'Tutanak.pdf',
  sayfalar: [
    { sayfaNo: 1, metin: 'KAZA TESPİT TUTANAĞI\nKaza saati 14:30, yer: Örnek Caddesi.' },
    { sayfaNo: 2, metin: 'Sürücü A kural ih-\nlali yapmıştır. “Kusurlu” olarak değerlendirilmiştir.' },
  ],
}

describe('alıntı doğrulama', () => {
  it('belirtilen sayfada bulunur', () => {
    expect(alintiBul('Kaza saati 14:30', belge, 1)).toEqual({ bulundu: true, sayfa: 1, sayfaDuzeltildi: false })
  })
  it('büyük/küçük harf, satır sonu, heceleme tiresi ve tırnak biçimine duyarsız', () => {
    expect(alintiBul('sürücü a kural ihlali yapmıştır. "kusurlu" olarak', belge, 2)).toMatchObject({ bulundu: true, sayfa: 2 })
  })
  it('başka sayfada bulunursa sayfa düzeltilir', () => {
    expect(alintiBul('kural ihlali yapmıştır', belge, 1)).toEqual({ bulundu: true, sayfa: 2, sayfaDuzeltildi: true })
  })
  it('bulunamayan, kısa, kısaltılmış ya da çok uzun alıntı reddedilir', () => {
    expect(alintiBul('kural ihlali yapmamıştır', belge, 2)).toMatchObject({ bulundu: false, neden: 'Alıntı belgede bulunamadı.' })
    expect(alintiBul('Kaza', belge, 1)).toMatchObject({ bulundu: false })
    expect(alintiBul('Kaza saati … Örnek Caddesi', belge, 1)).toMatchObject({ bulundu: false })
    expect(alintiBul('x'.repeat(301), belge, 1)).toMatchObject({ bulundu: false })
    expect(alintiBul('Kaza saati 14:30', undefined, 1)).toMatchObject({ bulundu: false, neden: 'Kaynak belge bu dosyada bulunamadı.' })
  })
  it('sayfasız metinde (tek parça) de aranır', () => {
    const tek: BelgeMetni = { belgeId: 'b2', ad: 'x', sayfalar: [{ sayfaNo: null, metin: 'Ödeme tarihi 10.01.2026' }] }
    expect(alintiBul('ödeme tarihi 10.01.2026', tek, 3)).toEqual({ bulundu: true, sayfa: null, sayfaDuzeltildi: true })
  })
  it('Türkçe küçük harf dönüşümü', () => {
    expect(aramaNormal('İTİRAZ  IŞIK')).toBe('itiraz ışık')
  })
})

describe('belge bağlamı (B40)', () => {
  const b = (ez: Partial<BaglamBelgesi>): BaglamBelgesi => ({
    id: ez.id ?? 'id', ad: ez.ad ?? 'belge.pdf', altTur: null, kategori: 'DIGER', tarih: '2026-01-01', metinDurumu: 'METIN_KATMANI', aiIzni: 'IZINLI',
    metin: { belgeId: ez.id ?? 'id', ad: ez.ad ?? 'belge.pdf', sayfalar: [{ sayfaNo: 1, metin: 'metin' }] }, ...ez,
  })
  it('KVKK yasaklı belge yapay zekâya gitmez; okunamayan adıyla listelenir; fotoğraf atlanır', () => {
    const r = belgeBaglamiKur([
      b({ id: 'a', ad: 'Alkol raporu.pdf', aiIzni: 'YASAK' }),
      b({ id: 'o', ad: 'Taranmış.pdf', metinDurumu: 'OKUNAMADI', metin: null }),
      b({ id: 'f', ad: 'foto.jpg', kategori: 'HASAR_FOTO', metin: null }),
      b({ id: 'd', ad: 'Dekont.pdf', altTur: 'HASAR_DEKONT' }),
    ], 'DAVA')
    expect(r.aiyaGitmeyen).toEqual(['Alkol raporu.pdf'])
    expect(r.okunamayan).toEqual(['Taranmış.pdf'])
    expect(r.secilen.map((s) => s.ad)).toEqual(['Dekont.pdf'])
    expect(r.secilen[0]).toMatchObject({ ref: 'B-1', belgeId: 'd' })
    expect(r.secilen[0].metin).toContain('[Sayfa 1]')
  })
  it('türe göre asıl kaynak önce: dava dilekçesinde itiraz, cevaba cevapta cevap', () => {
    const liste = [b({ id: 'd', ad: 'Dekont.pdf', altTur: 'HASAR_DEKONT' }), b({ id: 'c', ad: 'Cevap.pdf', altTur: 'DAVA_CEVAP' }), b({ id: 'i', ad: 'İtiraz.pdf', altTur: 'ICRA_ITIRAZ' })]
    expect(belgeBaglamiKur(liste, 'DAVA').secilen[0].ad).toBe('İtiraz.pdf')
    expect(belgeBaglamiKur(liste, 'CEVABA_CEVAP').secilen[0].ad).toBe('Cevap.pdf')
  })
  it('uzun belge kısaltılır ve adıyla bildirilir; hedef belge (cevap) daha geniş okunur', () => {
    const uzun = 'a'.repeat(BELGE_UST_SINIR + 5000)
    const r = belgeBaglamiKur([b({ id: 'u', ad: 'Uzun.pdf', metin: { belgeId: 'u', ad: 'Uzun.pdf', sayfalar: [{ sayfaNo: 1, metin: uzun }] } })], 'DAVA')
    expect(r.kisaltilan).toEqual(['Uzun.pdf'])
    const c = belgeBaglamiKur([b({ id: 'c', ad: 'Cevap.pdf', altTur: 'DAVA_CEVAP', metin: { belgeId: 'c', ad: 'Cevap.pdf', sayfalar: [{ sayfaNo: 1, metin: uzun }] } })], 'CEVABA_CEVAP')
    expect(c.kisaltilan).toEqual([])
  })
})

describe('ekranda varsayılan maske', () => {
  it('TCKN, telefon ve IBAN maskelenir; tutar, tarih ve esas no bozulmaz', () => {
    const m = ekranMaskele('Kimlik 12345678950, tel 0532 111 22 33, IBAN TR12 0006 1000 0000 1234 5678 90. Tutar 10.250,50 TL, tarih 10.01.2026, esas 2026/1234.')
    expect(m).not.toContain('12345678950')
    expect(m).toContain('•••••••••50')
    expect(m).not.toContain('111 22 33')
    expect(m).toMatch(/•+33/)
    expect(m).not.toContain('0006 1000')
    expect(m).toContain('7890')
    expect(m).toContain('10.250,50 TL')
    expect(m).toContain('10.01.2026')
    expect(m).toContain('2026/1234')
  })
  it('boş değer', () => {
    expect(ekranMaskele(null)).toBe('')
  })
})

describe('savunma matrisi', () => {
  it('işaretleme ve cevaplanacaklar', () => {
    const s = [{ id: 'S-1', baslik: 'Zamanaşımı', konu: 'ZAMANASIMI' as const, belgeId: 'c', belgeAdi: 'Cevap', sayfa: 1, alinti: 'x', isaret: null, isaretleyenId: null, isaretAt: null }]
    const r = savunmaIsaretle(s, 'S-1', 'CEVAPLANACAK', 'avukat', '2026-09-27T00:00:00.000Z')!
    expect(cevaplanacaklar(r)).toHaveLength(1)
    expect(savunmaIsaretle(s, 'S-9', 'ONEMSIZ', 'avukat', 'x')).toBeNull()
  })
})
