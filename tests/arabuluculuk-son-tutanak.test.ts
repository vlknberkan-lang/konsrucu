/**
 * S26 · son tutanak: tarih varsayılanı yok ("bugün" alınmaz), ileri tarih ve başvurudan önceki tarih reddedilir (B02);
 * metinden alıntılı öneri; AR-09 karşı taraf uyumu. Veriler KURGUSALDIR.
 */
import { describe, expect, it } from 'vitest'
import { basvuruTarihiUyarilari, karsiTarafUyumu, sonTutanakOnerisi, sonTutanakTarihiDogrula, trNormal } from '@/lib/konsrucu/arabuluculuk/son-tutanak'

const SIMDI = new Date('2026-09-27T09:00:00Z')

describe('sonTutanakTarihiDogrula', () => {
  it('boş tarih kabul edilmez: "bugün" varsayılmaz', () => {
    const r = sonTutanakTarihiDogrula('', { simdi: SIMDI })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.hata).toMatch(/bugün/)
    expect(sonTutanakTarihiDogrula(undefined, { simdi: SIMDI }).ok).toBe(false)
    expect(sonTutanakTarihiDogrula('   ', { simdi: SIMDI }).ok).toBe(false)
  })
  it('ileri tarih reddedilir, bugün kabul edilir (İstanbul günü)', () => {
    expect(sonTutanakTarihiDogrula('2026-09-28', { simdi: SIMDI }).ok).toBe(false)
    expect(sonTutanakTarihiDogrula('2026-09-27', { simdi: SIMDI }).ok).toBe(true)
    // UTC 22:30 = İstanbul ertesi gün 01:30 → "bugün" 28.09 olur
    expect(sonTutanakTarihiDogrula('2026-09-28', { simdi: new Date('2026-09-27T22:30:00Z') }).ok).toBe(true)
  })
  it('geçersiz ve taşan tarih reddedilir', () => {
    expect(sonTutanakTarihiDogrula('2026-02-31', { simdi: SIMDI }).ok).toBe(false)
    expect(sonTutanakTarihiDogrula('27.09.2026', { simdi: SIMDI }).ok).toBe(false)
  })
  it('başvurudan önceki tutanak reddedilir', () => {
    const r = sonTutanakTarihiDogrula('2026-07-01', { basvuruTarihi: new Date('2026-07-05'), simdi: SIMDI })
    expect(r.ok).toBe(false)
    expect(sonTutanakTarihiDogrula('2026-07-05', { basvuruTarihi: new Date('2026-07-05'), simdi: SIMDI }).ok).toBe(true)
  })
})

describe('basvuruTarihiUyarilari', () => {
  it('hafta sonuna denk gelen başvuru uyarı üretir, engel değildir', () => {
    expect(basvuruTarihiUyarilari(new Date('2026-06-28'), SIMDI).join(' ')).toMatch(/hafta sonu/) // Pazar
    expect(basvuruTarihiUyarilari(new Date('2026-06-29'), SIMDI)).toEqual([]) // Pazartesi
    expect(basvuruTarihiUyarilari(null, SIMDI)).toEqual([])
  })
})

describe('sonTutanakOnerisi (kurgusal metin)', () => {
  const metin = `ARABULUCULUK SON TUTANAĞI
Arabuluculuk Büro No: 2026/9999
Başvuru No : 123456
Taraflar: [Kurgusal Sigorta A.Ş.] ile [Kurgusal Borçlu 1]
Toplantı 10.07.2026 tarihinde yapılmıştır.
Taraflar arasında yapılan görüşmelerde anlaşma sağlanamadığı tespit edilmiştir.
Tutanak tarihi: 14.07.2026`

  it('bağlam sözcüğüne yakın tarihi ve olumsuz sonucu alıntıyla önerir', () => {
    const o = sonTutanakOnerisi(metin, SIMDI)
    expect(o.sonTutanakGibi).toBe(true)
    expect(o.tarih?.deger).toBe('2026-07-14')
    expect(o.tarih?.alinti.metin).toContain('14.07.2026')
    expect(o.sonuc?.deger).toBe('ANLASAMAMA') // "anlaşma sağlanamadı" ANLASMA sayılmaz
    expect(o.sonuc?.alinti.metin.length).toBeLessThanOrEqual(300)
    expect(o.basvuruNo?.deger).toBe('123456')
  })
  it('olumlu anlaşma, kısmen, katılmama ve ulaşılamama ayrışır', () => {
    expect(sonTutanakOnerisi('Son tutanak. Taraflar anlaşmaya varıldı. 01.07.2026', SIMDI).sonuc?.deger).toBe('ANLASMA')
    expect(sonTutanakOnerisi('Son tutanak. Taraflar kısmen anlaştı. 01.07.2026', SIMDI).sonuc?.deger).toBe('KISMEN')
    expect(sonTutanakOnerisi('Son tutanak. Karşı taraf toplantıya katılmadı. 01.07.2026', SIMDI).sonuc?.deger).toBe('KATILMAMA')
    expect(sonTutanakOnerisi('Son tutanak. Karşı tarafa ulaşılamadı. 01.07.2026', SIMDI).sonuc?.deger).toBe('ULASILAMAMA')
  })
  it('ileri tarih önerilmez; tarih yoksa uyarı döner', () => {
    const o = sonTutanakOnerisi('Son tutanak düzenlenmiştir. Tutanak tarihi: 01.12.2026. Anlaşamadılar.', SIMDI)
    expect(o.tarih).toBeNull()
    expect(o.uyarilar.join(' ')).toMatch(/tarih/)
  })
  it('boş metin: yalnız uyarı, öneri yok', () => {
    const o = sonTutanakOnerisi('', SIMDI)
    expect(o.tarih).toBeNull()
    expect(o.sonuc).toBeNull()
    expect(o.uyarilar.length).toBe(1)
  })
  it('son tutanağa benzemeyen metin uyarı taşır', () => {
    expect(sonTutanakOnerisi('Tensip zaptı 01.07.2026', SIMDI).sonTutanakGibi).toBe(false)
  })
})

describe('karsiTarafUyumu (AR-09)', () => {
  it('itiraz eden borçlu tutanakta yoksa uyarı', () => {
    const r = karsiTarafUyumu('Taraflar: [Kurgusal Sigorta] ile Deneme Lojistik Limited Şirketi', ['Örnek Taşımacılık Anonim Şirketi'])
    expect(r.uyumlu).toBe(false)
    expect(r.uyari).toMatch(/AR-09/)
  })
  it('ad parçaları bulunursa uyumlu (Türkçe karakter duyarsız)', () => {
    const r = karsiTarafUyumu('KARŞI TARAF: ÖRNEK TAŞIMACILIK A.Ş.', ['Örnek Taşımacılık Anonim Şirketi'])
    expect(r.uyumlu).toBe(true)
  })
  it('birden çok borçludan biri eksikse kısmi uyarı', () => {
    const r = karsiTarafUyumu('Karşı taraf: Kurgu Yapı Limited', ['Kurgu Yapı Limited Şirketi', 'Deneme Nakliyat Anonim Şirketi'])
    expect(r.bulunan).toBe(1)
    expect(r.uyari).toMatch(/1 tanesi/)
  })
  it('trNormal Türkçe büyük İ/I harflerini doğru indirger', () => {
    expect(trNormal('İTİRAZ IŞIK')).toBe('itiraz isik')
  })
})
