/**
 * S15 · Tahsilat kuralı (lib/konsrucu/eksen/tahsilat.ts) ve aday tekilleştirme (tekil.ts).
 * SEN-10 deseni: UYAP hesabında "Yatan Para" 0 → 1.000 TL; aynı gövde ikinci kez gelince yeni aday doğmaz.
 */
import { describe, it, expect } from 'vitest'
import { tahsilatAdayMetni, yatanParaFarki, yatanParaOku } from '@/lib/konsrucu/eksen/tahsilat'
import { adayTekilAnahtar, DURUM_METNI_ITIRAZ_ANAHTARI, tahsilatTekilAnahtar, tekilIhlaliMi } from '@/lib/konsrucu/eksen/tekil'

describe('yatanParaOku', () => {
  it('sayı ve TR metni okunur; bozuk/negatif değer okunmaz', () => {
    expect(yatanParaOku({ tahsilat: 1000 })).toBe(1000)
    expect(yatanParaOku({ tahsilat: '1.000,50' })).toBe(1000.5)
    expect(yatanParaOku({ tahsilat: 0 })).toBe(0)
    expect(yatanParaOku({ tahsilat: null })).toBeNull()
    expect(yatanParaOku({ tahsilat: 'abc' })).toBeNull()
    expect(yatanParaOku({ tahsilat: -5 })).toBeNull()
    expect(yatanParaOku(null)).toBeNull()
    expect(yatanParaOku([1])).toBeNull()
  })
})

describe('yatanParaFarki — gerçek tahsilat yalnız Yatan Para artışından', () => {
  it('SEN-10: 0 → 1.000 TL artış = 1.000 TL aday', () => {
    const f = yatanParaFarki({ tahsilat: 0 }, { tahsilat: 1000 })
    expect(f).toEqual({ tur: 'ARTIS', onceki: 0, yeni: 1000, fark: 1000, ilkGorunum: false })
  })
  it('aynı gövde ikinci kez: fark yok → aday yok', () => {
    expect(yatanParaFarki({ tahsilat: 1000 }, { tahsilat: 1000 })).toBeNull()
  })
  it('ilk hesap görüntüsü (önceki yok): önceki 0 sayılır, "ilk görünüm" işaretlenir', () => {
    const f = yatanParaFarki(null, { tahsilat: 250 })
    expect(f?.tur).toBe('ARTIS')
    expect(f && f.tur === 'ARTIS' && f.ilkGorunum).toBe(true)
  })
  it('azalış aday doğurmaz, AZALIS döner (kontrol notu)', () => {
    expect(yatanParaFarki({ tahsilat: 1000 }, { tahsilat: 800 })).toEqual({ tur: 'AZALIS', onceki: 1000, yeni: 800, fark: -200 })
  })
  it('yeni görüntüde tahsilat yoksa karşılaştırma yapılmaz', () => {
    expect(yatanParaFarki({ tahsilat: 1000 }, { bakiye: 5 })).toBeNull()
  })
  it('kuruş hassasiyeti: 0,004 fark sayılmaz; 0,01 sayılır', () => {
    expect(yatanParaFarki({ tahsilat: 100 }, { tahsilat: 100.004 })).toBeNull()
    expect(yatanParaFarki({ tahsilat: 100 }, { tahsilat: 100.01 })?.fark).toBe(0.01)
  })
  it('aday metni hukuki tahsil tarihi olmadığını söyler', () => {
    const f = yatanParaFarki({ tahsilat: 0 }, { tahsilat: 1000 })
    expect(f?.tur).toBe('ARTIS')
    const m = tahsilatAdayMetni(f as Extract<typeof f, { tur: 'ARTIS' }>)
    expect(m).toMatch(/1\.000,00 TL/)
    expect(m).toMatch(/hukuki tahsil tarihi değildir/)
  })
})

describe('tekilleştirme anahtarı (dosya + alt tip + hukuki tarih + birim evrak no)', () => {
  const t = new Date('2026-06-24')
  it('aynı girdi aynı anahtar; açıklama normalize edilir (Türkçe İ, boşluk)', () => {
    const a = adayTekilAnahtar({ altTip: 'ITIRAZ', hukukiTarih: t, metin: 'Borca İtiraz Talebi' })
    const b = adayTekilAnahtar({ altTip: 'ITIRAZ', hukukiTarih: t, metin: '  BORCA  İTİRAZ TALEBİ ' })
    expect(a).toBe(b)
    expect(a.startsWith('ITIRAZ|2026-06-24|m:')).toBe(true)
  })
  it('birim evrak no ve belge kimliği açıklamadan önceliklidir', () => {
    expect(adayTekilAnahtar({ altTip: 'ITIRAZ', hukukiTarih: t, birimEvrakNo: '2026/77', metin: 'x' })).toBe('ITIRAZ|2026-06-24|e:2026/77')
    expect(adayTekilAnahtar({ altTip: 'TEBLIG_SONUCU', hukukiTarih: t, belgeId: 'b1' })).toBe('TEBLIG_SONUCU|2026-06-24|b:b1')
  })
  it('farklı alt tip ya da gün farklı anahtar', () => {
    const a = adayTekilAnahtar({ altTip: 'ITIRAZ', hukukiTarih: t, metin: 'x' })
    expect(adayTekilAnahtar({ altTip: 'TEBLIG_SONUCU', hukukiTarih: t, metin: 'x' })).not.toBe(a)
    expect(adayTekilAnahtar({ altTip: 'ITIRAZ', hukukiTarih: new Date('2026-06-25'), metin: 'x' })).not.toBe(a)
  })
  it('hukuki tarih yoksa olay tarihi ayırt eder; durum metni itirazı dosya başına tek anahtardır', () => {
    expect(adayTekilAnahtar({ altTip: 'DIGER', hukukiTarih: null, olayTarihi: t, metin: 'x' })).toContain('|o:2026-06-24|')
    expect(adayTekilAnahtar({ altTip: 'DURDURMA_ITIRAZ', hukukiTarih: null, olayTarihi: t, metin: 'x' })).toBe(DURUM_METNI_ITIRAZ_ANAHTARI)
    expect(adayTekilAnahtar({ altTip: 'DURDURMA_ITIRAZ', hukukiTarih: null, olayTarihi: new Date('2026-07-01'), metin: 'y' })).toBe(DURUM_METNI_ITIRAZ_ANAHTARI)
  })
  it('anahtar 190 karakteri aşmaz', () => {
    expect(adayTekilAnahtar({ altTip: 'DIGER', hukukiTarih: t, birimEvrakNo: 'x'.repeat(400) }).length).toBeLessThanOrEqual(190)
  })
  it('tahsilat anahtarı önceki→yeni toplamdan', () => {
    expect(tahsilatTekilAnahtar(0, 1000)).toBe('TAHSILAT_BORCLUDAN|0.00>1000.00')
  })
  it('P2002 benzersizlik ihlali tanınır', () => {
    expect(tekilIhlaliMi({ code: 'P2002' })).toBe(true)
    expect(tekilIhlaliMi({ code: 'P2025' })).toBe(false)
    expect(tekilIhlaliMi(null)).toBe(false)
  })
})
