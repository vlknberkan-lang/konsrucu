/**
 * S18 · saf öneri kararları: yetki, yazma planı (alan kilidi: ONAYLI satıra hiçbir otomasyon dokunmaz),
 * toplu onay uygunluğu (06 §9.1) ve bin kat tutar şüphesi.
 */
import { describe, expect, it } from 'vitest'
import {
  binKatSuphesi, calismaPlani, celiskiVar, deterministikMi, kullaniciYetkisi, onaylayabilir, oneriHazirla, topluOnayUygunMu, type AlanKaydi, type HazirOneri,
} from '@/lib/konsrucu/oneri/karar'
import { alanTanimi } from '@/lib/konsrucu/oneri/alanlar'
import type { YeniOneri } from '@/lib/konsrucu/oneri/tipler'

const hazir = (y: YeniOneri): HazirOneri => {
  const h = oneriHazirla(y)
  if (!h.ok) throw new Error(h.sebep)
  return h.oneri
}
const kayit = (o: Partial<AlanKaydi> & { id: string; alan: string; degerJson: unknown }): AlanKaydi =>
  ({ kaynakTuru: 'KURAL', kaynakBelgeId: null, durum: 'ONERI', alintiDogru: null, uretici: null, ...o })

describe('yetki', () => {
  it('GORUNTULEYEN ve pasif kullanıcı hiçbir şey yazamaz; yardımcı düzenler; avukat karar verir', () => {
    expect(kullaniciYetkisi({ rol: 'GORUNTULEYEN', aktif: true })).toEqual({ duzenleyebilir: false, kararVerebilir: false })
    expect(kullaniciYetkisi({ rol: 'AVUKAT', aktif: false })).toEqual({ duzenleyebilir: false, kararVerebilir: false })
    expect(kullaniciYetkisi({ rol: 'AVUKAT_YRD', aktif: true })).toEqual({ duzenleyebilir: true, kararVerebilir: false })
    expect(kullaniciYetkisi({ rol: 'ADMIN', aktif: true })).toEqual({ duzenleyebilir: true, kararVerebilir: true })
    expect(kullaniciYetkisi(null)).toEqual({ duzenleyebilir: false, kararVerebilir: false })
  })

  it('kritik alanı (tutar) yardımcı onaylayamaz; kritik olmayanı (poliçe no) onaylayabilir', () => {
    const yrd = kullaniciYetkisi({ rol: 'AVUKAT_YRD', aktif: true })
    expect(onaylayabilir(yrd, alanTanimi('rucuTutari')!)).toBe(false)
    expect(onaylayabilir(yrd, alanTanimi('rucuSebebiKod')!)).toBe(false)
    expect(onaylayabilir(yrd, alanTanimi('policeNo')!)).toBe(true)
  })
})

describe('oneriHazirla', () => {
  it('AI\'ın yetkili icra önerisi reddedilir (seçim avukatta)', () => {
    const h = oneriHazirla({ alan: 'yetkiliIcra', deger: 'Adana İcra Dairesi', kaynakTuru: 'AI' })
    expect(h.ok).toBe(false)
  })

  it('bilinmeyen alan, bilinmeyen kaynak ve geçersiz değer reddedilir', () => {
    expect(oneriHazirla({ alan: 'tcVkn', deger: 'x', kaynakTuru: 'AI' }).ok).toBe(false)
    expect(oneriHazirla({ alan: 'policeNo', deger: 'x', kaynakTuru: 'TAHMIN' as never }).ok).toBe(false)
    expect(oneriHazirla({ alan: 'kazaTarihi', deger: '31.02.2026', kaynakTuru: 'KURAL' }).ok).toBe(false)
  })

  it('güven 0–1\'e kırpılır, alıntı 300 karaktere kısalır, değer normalize edilir', () => {
    const h = hazir({ alan: 'asilAlacak', deger: '12.500,00', kaynakTuru: 'AI', guven: 3, alinti: 'a'.repeat(500), sayfa: 0 })
    expect(h).toMatchObject({ deger: 12500, guven: 1, sayfa: null })
    expect(h.alinti).toHaveLength(300)
  })
})

describe('calismaPlani (alan kilidi)', () => {
  it('onaylı değerle aynı yeni öneri yazılmaz; onaylı satır hiçbir zaman eskitilmez', () => {
    const mevcut = [kayit({ id: 'k1', alan: 'asilAlacak', degerJson: 12000, durum: 'ONAYLI', kaynakTuru: 'ELLE' })]
    const p = calismaPlani(mevcut, [hazir({ alan: 'asilAlacak', deger: 12000, kaynakTuru: 'AI' })])
    expect(p.eklenecek).toEqual([])
    expect(p.atlanan[0].sebep).toBe('ONAYLI_AYNI')
    expect(p.eskitilecek).toEqual([])
  })

  it('onaylı değerden farklı yeni değer AYRI ÖNERİ olur; kilit yerinde kalır', () => {
    const mevcut = [kayit({ id: 'k1', alan: 'asilAlacak', degerJson: 12000, durum: 'ONAYLI', kaynakTuru: 'ELLE' })]
    const p = calismaPlani(mevcut, [hazir({ alan: 'asilAlacak', deger: 12500, kaynakTuru: 'AI' })])
    expect(p.eklenecek.map((e) => e.deger)).toEqual([12500])
    expect(p.eskitilecek).toEqual([])
  })

  it('reddedilen değer aynı kaynaktan tekrar önerilmez; başka kaynaktan gelirse önerilir', () => {
    const mevcut = [kayit({ id: 'r1', alan: 'policeNo', degerJson: 'KRG-1', durum: 'REDDEDILDI', kaynakTuru: 'AI' })]
    expect(calismaPlani(mevcut, [hazir({ alan: 'policeNo', deger: 'krg-1', kaynakTuru: 'AI' })]).atlanan[0].sebep).toBe('REDDEDILMIS')
    expect(calismaPlani(mevcut, [hazir({ alan: 'policeNo', deger: 'KRG-1', kaynakTuru: 'KURAL' })]).eklenecek).toHaveLength(1)
  })

  it('aynı kaynaktan aynı bekleyen öneri tekrar yazılmaz; çalıştırma içi tekrar da elenir', () => {
    const mevcut = [kayit({ id: 'o1', alan: 'kazaTarihi', degerJson: '2026-03-14', kaynakTuru: 'KURAL', kaynakBelgeId: 'b1' })]
    const y = hazir({ alan: 'kazaTarihi', deger: '14.03.2026', kaynakTuru: 'KURAL', kaynakBelgeId: 'b1' })
    const p = calismaPlani(mevcut, [y, y])
    expect(p.atlanan.map((a) => a.sebep)).toEqual(['AYNI_ONERI_VAR', 'CALISMADA_TEKRAR'])
    expect(p.eklenecek).toEqual([])
  })

  it('aynı kaynağın (tür + belge) bu çalıştırmada üretmediği eski öneri eskir; başka belgenin önerisi kalır', () => {
    const mevcut = [
      kayit({ id: 'eski', alan: 'kazaTarihi', degerJson: '2026-03-13', kaynakTuru: 'KURAL', kaynakBelgeId: 'b1' }),
      kayit({ id: 'baska', alan: 'kazaTarihi', degerJson: '2026-03-10', kaynakTuru: 'KURAL', kaynakBelgeId: 'b2' }),
      kayit({ id: 'onayli', alan: 'kazaTarihi', degerJson: '2026-03-01', kaynakTuru: 'KURAL', kaynakBelgeId: 'b1', durum: 'ONAYLI' }),
    ]
    const p = calismaPlani(mevcut, [hazir({ alan: 'kazaTarihi', deger: '2026-03-14', kaynakTuru: 'KURAL', kaynakBelgeId: 'b1' })])
    expect(p.eskitilecek).toEqual(['eski'])
    expect(p.eklenecek).toHaveLength(1)
  })

  it('aynı belgenin iki farklı değeri birbirini eskitmez (ikisi de bu çalıştırmada üretildi)', () => {
    const mevcut = [kayit({ id: 'a', alan: 'policeNo', degerJson: 'A-1111', kaynakBelgeId: 'b1' })]
    const p = calismaPlani(mevcut, [
      hazir({ alan: 'policeNo', deger: 'A-1111', kaynakTuru: 'KURAL', kaynakBelgeId: 'b1' }),
      hazir({ alan: 'policeNo', deger: 'B-2222', kaynakTuru: 'KURAL', kaynakBelgeId: 'b1' }),
    ])
    expect(p.eskitilecek).toEqual([])
    expect(p.eklenecek.map((e) => e.deger)).toEqual(['B-2222'])
  })
})

describe('toplu onay (06 §9.1)', () => {
  const kural = (o: Partial<AlanKaydi> & { id: string; alan: string; degerJson: unknown }) => kayit({ alintiDogru: true, uretici: 'KURAL:POLICE_NO@1', ...o })

  it('deterministik: kural kodu + doğrulanmış alıntı ya da UYAP yapısal alanı; AI ve kaynaksız değil', () => {
    expect(deterministikMi({ kaynakTuru: 'KURAL', alintiDogru: true, uretici: 'KURAL:X@1' })).toBe(true)
    expect(deterministikMi({ kaynakTuru: 'KURAL', alintiDogru: false, uretici: 'KURAL:X@1' })).toBe(false)
    expect(deterministikMi({ kaynakTuru: 'AI', alintiDogru: true, uretici: 'AI:analizEt' })).toBe(false)
    expect(deterministikMi({ kaynakTuru: 'HUGO', alintiDogru: null, uretici: 'HUGO:RUCU_TUTARI@1' })).toBe(false)
  })

  it('poliçe no (kural + doğru alıntı, kilitsiz, çelişkisiz) uygun', () => {
    const s = kural({ id: '1', alan: 'policeNo', degerJson: 'KRG-1' })
    expect(topluOnayUygunMu(s, [s])).toBe(true)
  })

  it('tutar ve tarih hiçbir koşulda toplu onaylanmaz', () => {
    const t = kural({ id: '1', alan: 'rucuTutari', degerJson: 100, uretici: 'KURAL:DEKONT@1' })
    const d = kural({ id: '2', alan: 'kazaTarihi', degerJson: '2026-03-14', uretici: 'KURAL:KAZA_TARIHI@1' })
    const o = kural({ id: '3', alan: 'odeme[2026-03-14|100.00]', degerJson: { tarih: '2026-03-14', tutar: 100 }, uretici: 'KURAL:DEKONT@1' })
    expect(topluOnayUygunMu(t, [t])).toBe(false)
    expect(topluOnayUygunMu(d, [d])).toBe(false)
    expect(topluOnayUygunMu(o, [o])).toBe(false)
  })

  it('kilitli ya da çelişkili alanda toplu onay yok', () => {
    const s = kural({ id: '1', alan: 'policeNo', degerJson: 'KRG-1' })
    const kilit = kayit({ id: 'k', alan: 'policeNo', degerJson: 'KRG-1', durum: 'ONAYLI' })
    const diger = kayit({ id: '2', alan: 'policeNo', degerJson: 'KRG-2', kaynakTuru: 'HUGO' })
    expect(topluOnayUygunMu(s, [s, kilit])).toBe(false)
    expect(topluOnayUygunMu(s, [s, diger])).toBe(false)
    expect(celiskiVar(alanTanimi('policeNo')!, [s, diger])).toBe(true)
  })
})

describe('bin kat tutar şüphesi', () => {
  it('~1000 kat fark şüphelidir (Hugo "123,456.00" → 123,46 okuma hatası)', () => {
    expect(binKatSuphesi(123.46, 123456)).toBe(true)
    expect(binKatSuphesi(123456, 123.46)).toBe(true)
    expect(binKatSuphesi(120000, 123456)).toBe(false)
    expect(binKatSuphesi(12, 123456)).toBe(false) // 10.000 kat: başka bir hata, bu kural değil
    expect(binKatSuphesi(null, 5)).toBe(false)
  })
})
