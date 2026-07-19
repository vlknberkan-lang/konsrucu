/**
 * Taksit planı saf hesap regresyonları — kuruş artığı, ay-sonu vade kayması, gecikme eşiği.
 */
import { describe, it, expect } from 'vitest'
import { ayEkle, taksitTutarlari, taksitProgrami, efektifDurum, taksitOzet, type TaksitGirdi } from '@/lib/konsrucu/taksit'

describe('taksitTutarlari — kuruş artığı son taksitte', () => {
  it('toplam kuruşu kuruşuna korunur', () => {
    const t = taksitTutarlari(1000, 3) // 333.33 + 333.33 + 333.34
    expect(t).toHaveLength(3)
    expect(Math.round(t.reduce((s, x) => s + x, 0) * 100)).toBe(100000)
    expect(t[0]).toBe(333.33)
    expect(t[2]).toBe(333.34)
  })
  it('tam bölünen tutar eşit dağılır', () => {
    expect(taksitTutarlari(900, 3)).toEqual([300, 300, 300])
  })
  it('geçersiz adet boş plan döner', () => {
    expect(taksitTutarlari(1000, 0)).toEqual([])
    expect(taksitTutarlari(1000, -2)).toEqual([])
  })
})

describe('ayEkle — ay sonu sabitleme', () => {
  it('31 Ocak + 1 ay → 28 Şubat (artık olmayan yıl)', () => {
    const v = ayEkle(new Date(2026, 0, 31), 1)
    expect([v.getFullYear(), v.getMonth(), v.getDate()]).toEqual([2026, 1, 28])
  })
  it('31 Ocak + 1 ay → 29 Şubat (artık yıl)', () => {
    const v = ayEkle(new Date(2028, 0, 31), 1)
    expect([v.getFullYear(), v.getMonth(), v.getDate()]).toEqual([2028, 1, 29])
  })
  it('gün taşması yoksa gün korunur', () => {
    const v = ayEkle(new Date(2026, 4, 15), 3)
    expect([v.getFullYear(), v.getMonth(), v.getDate()]).toEqual([2026, 7, 15])
  })
})

describe('taksitProgrami', () => {
  it('N taksit, periyot kadar ay arayla, sıra 1..N', () => {
    const p = taksitProgrami({ toplam: 1000, taksitSayisi: 4, ilkVade: new Date(2026, 6, 1), periyotAy: 2 })
    expect(p.map((x) => x.sira)).toEqual([1, 2, 3, 4])
    expect(p[1].vadeTarihi.getMonth()).toBe(8) // Eylül
    expect(p[3].vadeTarihi.getMonth()).toBe(0) // Ocak (sonraki yıl)
  })
})

const g = (o: Partial<TaksitGirdi> & { sira: number }): TaksitGirdi => ({
  id: `t${o.sira}`, vadeTarihi: new Date(2026, 6, 1), tutar: 100,
  durum: 'BEKLIYOR', odenenTutar: null, odendiTarih: null, ...o,
})

describe('efektifDurum — gecikme eşiği', () => {
  const bugun = new Date(2026, 6, 15, 14, 30) // saat dolu — gün başı normalizasyonu test edilsin
  it('vade bugünse gecikme sayılmaz', () => {
    expect(efektifDurum(g({ sira: 1, vadeTarihi: new Date(2026, 6, 15, 9, 0) }), bugun)).toBe('BEKLIYOR')
  })
  it('vade dünse GECIKTI (kayıtlı durum BEKLIYOR olsa bile)', () => {
    expect(efektifDurum(g({ sira: 1, vadeTarihi: new Date(2026, 6, 14) }), bugun)).toBe('GECIKTI')
  })
  it('ODENDI hiçbir koşulda gecikmez', () => {
    expect(efektifDurum(g({ sira: 1, durum: 'ODENDI', vadeTarihi: new Date(2026, 0, 1) }), bugun)).toBe('ODENDI')
  })
})

describe('taksitOzet', () => {
  const bugun = new Date(2026, 6, 15)
  it('kısmi ödeme tutara sayılır, taksit sayısına sayılmaz; geciken kalanıyla hesaplanır', () => {
    const oz = taksitOzet([
      g({ sira: 1, durum: 'ODENDI', vadeTarihi: new Date(2026, 4, 1) }),
      g({ sira: 2, durum: 'KISMI', odenenTutar: 40, vadeTarihi: new Date(2026, 5, 1) }), // vadesi geçti → GECIKTI
      g({ sira: 3, vadeTarihi: new Date(2026, 7, 1) }),
    ], bugun)
    expect(oz.toplam).toBe(300)
    expect(oz.odenen).toBe(140)
    expect(oz.kalan).toBe(160)
    expect(oz.odenenSayi).toBe(1)
    expect(oz.gecikenSayi).toBe(1)
    expect(oz.gecikenTutar).toBe(60) // 100 − 40 kısmi
    expect(oz.siradaki?.sira).toBe(2)
  })
  it('boş plan güvenli (yüzde 0, sıradaki null)', () => {
    const oz = taksitOzet([], bugun)
    expect(oz.yuzde).toBe(0)
    expect(oz.siradaki).toBeNull()
  })
})
