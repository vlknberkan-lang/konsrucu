/**
 * Hap bilgiler · tek son kontrol (lib/konsrucu/oneri/hap.ts): planlayıcı ve ödeme şüphesi.
 * Ödeme örüntüsü 1199772'den (kurgusal id'lerle): kural katmanı faturayı KDV dahil/hariç ve KDV tutarı olarak buldu.
 */
import { describe, expect, it } from 'vitest'
import { hapPlani, odemeSupheleri, type HapSatiri } from '@/lib/konsrucu/oneri/hap'

let n = 0
const s = (o: Partial<HapSatiri> & { alan: string; degerJson: unknown }): HapSatiri => ({
  id: `s${++n}`, kaynakTuru: 'AI', kaynakBelgeId: null, durum: 'ONERI', alintiDogru: null, uretici: null, guven: null, createdAt: '2026-09-29T10:00:00Z', ...o,
})
const bos = new Set<string>()
const secimler = [s({ alan: 'rucuSebebiKod', degerJson: 'KASKO_KARSI_ARAC', durum: 'ONAYLI' }), s({ alan: 'yetkiliIcra', degerJson: { icraDairesi: 'İstanbul İcra Dairesi', secenek: 'KAZA_YERI' }, durum: 'ONAYLI' })]

describe('hapPlani', () => {
  it('çelişkisiz alanı bir kez onaylar; deterministik kaynak önce gelir', () => {
    const kural = s({ alan: 'kazaTarihi', degerJson: '2025-04-15', kaynakTuru: 'KURAL', alintiDogru: true, uretici: 'KURAL:KAZA_TARIHI@1' })
    const ai = s({ alan: 'kazaTarihi', degerJson: '2025-04-15', guven: 0.99 })
    const p = hapPlani({ satirlar: [...secimler, ai, kural], borclular: [], odemeHaric: bos, borcluHaric: bos })
    expect(p.onaylanacak).toEqual([kural.id])
    expect(p.celiskiler).toEqual([])
    expect(p.eksikSecim).toEqual([])
  })

  it('kritik olmayan alandaki farklı değerler beklemede kalır, kontrolü durdurmaz', () => {
    const p = hapPlani({
      satirlar: [...secimler, s({ alan: 'policeNo', degerJson: '29658377', kaynakTuru: 'EXCEL' }), s({ alan: 'policeNo', degerJson: '100000343234417', kaynakTuru: 'KURAL' })],
      borclular: [], odemeHaric: bos, borcluHaric: bos,
    })
    expect(p).toMatchObject({ onaylanacak: [], celiskiler: [], beklemede: ['Poliçe no'] })
  })

  it('kritik alandaki farklı değerler çelişkidir, otomatik seçilmez', () => {
    const p = hapPlani({
      satirlar: [...secimler, s({ alan: 'rucuTutari', degerJson: 323683.88, kaynakTuru: 'EXCEL' }), s({ alan: 'rucuTutari', degerJson: 137859.37 })],
      borclular: [], odemeHaric: bos, borcluHaric: bos,
    })
    expect(p.onaylanacak).toEqual([])
    expect(p.celiskiler).toEqual(['Rücu tutarı'])
  })

  it('onaylı alandaki farklı öneri dokunulmadan kalır', () => {
    const p = hapPlani({
      satirlar: [...secimler, s({ alan: 'brans', degerJson: 'KASKO', durum: 'ONAYLI' }), s({ alan: 'brans', degerJson: 'ZMMS' })],
      borclular: [], odemeHaric: bos, borcluHaric: bos,
    })
    expect(p).toMatchObject({ onaylanacak: [], celiskiler: [] })
  })

  it('seçim alanları seçilmemişse eksik sayılır; önerisi olsa da otomatik onaylanmaz', () => {
    const p = hapPlani({ satirlar: [s({ alan: 'rucuSebebiKod', degerJson: 'KASKO_KARSI_ARAC', kaynakTuru: 'HUGO' })], borclular: [], odemeHaric: bos, borcluHaric: bos })
    expect(p.eksikSecim).toEqual(['Rücu sebebi', 'Yetkili icra'])
    expect(p.onaylanacak).toEqual([])
  })

  it('aynı ödemeye iki kaynaktan gelen öneri tek kez onaylanır ya da birlikte reddedilir', () => {
    const k1 = s({ alan: 'odeme[2025-07-16|4158.00]', degerJson: { tarih: '2025-07-16', tutar: 4158 }, kaynakTuru: 'KURAL', alintiDogru: true, uretici: 'KURAL:DEKONT@1' })
    const k2 = s({ alan: 'odeme[2025-07-16|4158.00]', degerJson: { tarih: '2025-07-16', tutar: 4158 } })
    expect(hapPlani({ satirlar: [...secimler, k2, k1], borclular: [], odemeHaric: bos, borcluHaric: bos }).onaylanacak).toEqual([k1.id])
    expect(hapPlani({ satirlar: [...secimler, k2, k1], borclular: [], odemeHaric: new Set([k2.id]), borcluHaric: bos }).reddedilecek).toEqual([k2.id, k1.id])
  })

  it('işaretli ödemeler onaylanır, işaretsizler reddedilir', () => {
    const a = s({ alan: 'odeme[2025-05-14|133701.37]', degerJson: { tarih: '2025-05-14', tutar: 133701.37 } })
    const b = s({ alan: 'odeme[|1.00]', degerJson: { tarih: null, tutar: 1 }, kaynakTuru: 'KURAL' })
    const p = hapPlani({ satirlar: [...secimler, a, b], borclular: [], odemeHaric: new Set([b.id]), borcluHaric: bos })
    expect(p.onaylanacak).toEqual([a.id])
    expect(p.reddedilecek).toEqual([b.id])
  })

  it('işaretsiz ve zaten teyitli borçlular teyit listesine girmez', () => {
    const p = hapPlani({
      satirlar: secimler,
      borclular: [{ id: 'b1', teyitDurumu: 'TEYIT_GEREK' }, { id: 'b2', teyitDurumu: 'TEYIT_EDILDI' }, { id: 'b3', teyitDurumu: 'SUPHE' }],
      odemeHaric: bos, borcluHaric: new Set(['b3']),
    })
    expect(p.teyitEdilecek).toEqual(['b1'])
  })
})

describe('odemeSupheleri', () => {
  const o = (id: string, tutar: number, tarih: string | null = null) => ({ id, degerJson: { tarih, tutar } })

  it('1199772 örüntüsü: yalnız iki gerçek ödeme şüphesiz kalır', () => {
    const bekleyen = [
      o('bir', 1), o('kdvHaric1', 111417.81), o('kopya1', 133701.37), o('kopya2', 4158), o('kdv2', 693),
      o('gercek1', 133701.37, '2025-05-14'), o('gercek2', 4158, '2025-07-16'), o('kdvHaric2', 3465, '2025-07-23'),
    ]
    expect(odemeSupheleri(bekleyen, bekleyen)).toEqual({
      bir: 'tutar çok küçük',
      kdvHaric1: 'KDV hariç tutar olabilir',
      kopya1: 'aynı tutarın tarihli kaydı var',
      kopya2: 'aynı tutarın tarihli kaydı var',
      kdv2: 'KDV tutarı olabilir',
      kdvHaric2: 'KDV hariç tutar olabilir',
    })
  })

  it('tek başına tarihsiz ödeme "tarihsiz" diye işaretlenir; onaylı ödemeyle de karşılaştırılır', () => {
    expect(odemeSupheleri([o('x', 5000)], [o('x', 5000)])).toEqual({ x: 'tarihsiz' })
    expect(odemeSupheleri([o('y', 5000)], [o('y', 5000), o('onayli', 5000, '2025-01-02')])).toEqual({ y: 'aynı tutarın tarihli kaydı var' })
    expect(odemeSupheleri([o('z', 5000, '2025-01-02')], [o('z', 5000, '2025-01-02')])).toEqual({})
  })
})
