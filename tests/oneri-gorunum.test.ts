/**
 * S18/S19 · panel görünümü (lib/konsrucu/oneri/gorunum.ts): istemciye giden veri maskeli; kaynak türü, sayfa ve
 * alıntı; kaynaksız alanlar; engeller (bin kat, çelişki); toplu onay adayları; rücu sebebi kartı (EV-07, GŞ sürümü,
 * K1 etiketi); yetkili icra kartı. Kurgusal satırlar.
 */
import { describe, expect, it } from 'vitest'
import { bulduklarimizKur, rucuSebebiKur, yetkiliIcraKur, type PanelSatiri } from '@/lib/konsrucu/oneri/gorunum'

const AVUKAT = { duzenleyebilir: true, kararVerebilir: true }
const YARDIMCI = { duzenleyebilir: true, kararVerebilir: false }
let n = 0
const s = (o: Partial<PanelSatiri> & { alan: string; degerJson: unknown }): PanelSatiri => ({
  id: `s${++n}`, kaynakTuru: 'KURAL', kaynakBelgeId: null, durum: 'ONERI', alintiDogru: null, uretici: null,
  sayfa: null, alinti: null, guven: null, onaylayanId: null, onayAt: null, createdAt: new Date('2026-09-01T10:00:00Z'), ...o,
})
const belgeler = [{ id: 'b-police', dosyaAdi: 'police.pdf', storagePath: 'm/d/police.pdf' }, { id: 'b-ktt', dosyaAdi: 'ktt.jpg', storagePath: '' }]

describe('bulduklarimizKur', () => {
  const satirlar = [
    s({ alan: 'policeNo', degerJson: 'KRG-1', kaynakBelgeId: 'b-police', sayfa: 1, alinti: 'Poliçe No: KRG-1 Sigortalı TC: 12345678950', alintiDogru: true, uretici: 'KURAL:POLICE_NO@1', guven: 0.9 }),
    s({ alan: 'karsiPlaka', degerJson: '34 KRG 001', kaynakTuru: 'AI', kaynakBelgeId: 'b-ktt', sayfa: 1, alinti: 'B Aracı Plakası: 34 KRG 001', alintiDogru: true }),
    s({ alan: 'kazaTarihi', degerJson: '2026-03-14', kaynakBelgeId: 'b-ktt', sayfa: 1, alintiDogru: true, uretici: 'KURAL:KAZA_TARIHI@1' }),
    s({ alan: 'kazaTarihi', degerJson: '2026-03-10', kaynakTuru: 'HUGO', uretici: 'HUGO:HASAR_TARIHI@1' }),
    s({ alan: 'kusur.oran', degerJson: '% 100', kaynakTuru: 'AI', alinti: 'Kusur %100', alintiDogru: false }),
    s({ alan: 'odeme[2026-03-14|123456.00]', degerJson: { tarih: '2026-03-14', tutar: 123456 }, kaynakBelgeId: 'b-police', alintiDogru: true, uretici: 'KURAL:DEKONT@1' }),
    s({ alan: 'rucuTutari', degerJson: 12000, durum: 'ONAYLI', kaynakTuru: 'ELLE', onaylayanId: 'u1', onayAt: new Date('2026-09-02T10:00:00Z') }),
    s({ alan: 'rucuTutari', degerJson: 12500, kaynakTuru: 'AI' }),
    s({ alan: 'yetkiliIcra', degerJson: { icraDairesi: 'Adana İcra Dairesi', secenek: 'KAZA_YERI' }, durum: 'ONAYLI', kaynakTuru: 'ELLE' }),
    s({ alan: 'policeBitis', degerJson: '2027-01-03', durum: 'REDDEDILDI' }),
  ]
  const v = bulduklarimizKur({ dosyaId: 'd1', yetki: AVUKAT, aiAcik: false, satirlar, belgeler, kullanicilar: { u1: 'Kurgusal Avukat' }, hugoRucuTutari: 123.46, odemeToplami: null })

  it('alanlar sözlük sırasıyla; yetkili icra kendi bileşeninde; reddedilen satır gösterilmez', () => {
    expect(v.satirlar.map((x) => x.alan)).toEqual(['policeNo', 'kazaTarihi', 'karsiPlaka', 'rucuTutari', 'kusur.oran', 'odeme[2026-03-14|123456.00]'])
  })

  it('istemciye plaka ve alıntıdaki TCKN maskeli gider; kaynak türü, belge ve sayfa taşınır', () => {
    const plaka = v.satirlar.find((x) => x.alan === 'karsiPlaka')!.oneriler[0]
    expect(plaka).toMatchObject({ deger: '34 ••• •01', maskeli: true, kaynakEtiketi: 'AI', belgeAdi: 'ktt.jpg', sayfa: 1, belgeAcilabilir: false })
    expect(plaka.alinti).not.toContain('KRG 001')
    expect(plaka.duzelt).toEqual({ deger: '', tarih: '' })
    const police = v.satirlar.find((x) => x.alan === 'policeNo')!.oneriler[0]
    expect(police).toMatchObject({ deger: 'KRG-1', kaynakEtiketi: 'Kural', alintiDurumu: 'DOGRU', belgeAcilabilir: true })
    expect(police.alinti).not.toContain('12345678950')
  })

  it('onaylı değer kilit olarak, farklı yeni değer ayrı öneri olarak görünür; onaylayan adı yazılır', () => {
    const r = v.satirlar.find((x) => x.alan === 'rucuTutari')!
    expect(r.onayli).toMatchObject({ deger: '12.000,00 ₺', onaylayanAd: 'Kurgusal Avukat', kaynakEtiketi: 'Elle' })
    expect(r.oneriler.map((o) => o.deger)).toEqual(['12.500,00 ₺'])
    expect(r.celiski).toBe(true)
  })

  it('engeller: bin kat tutar şüphesi ve kaynak çelişkisi', () => {
    expect(v.engeller.find((e) => e.tur === 'BIN_KAT')?.aciklama).toMatch(/1000'de biri/)
    expect(v.engeller.filter((e) => e.tur === 'CELISKI').map((e) => e.alan)).toEqual(['kazaTarihi', 'rucuTutari'])
    expect(v.engeller.find((e) => e.alan === 'kazaTarihi')?.aciklama).toBe('Kural: 14.03.2026 · Hugo: 10.03.2026')
  })

  it('kaynaksız alan listelenir; sayılar ve toplu onay adayları doğru', () => {
    expect(v.kaynaksiz).toEqual([{ alan: 'kusur.oran', etiket: 'Kusur oranı' }])
    expect(v.bekleyen).toBe(7)
    expect(v.kritikBekleyen).toBe(4) // kaza tarihi ×2, rücu tutarı, ödeme
    expect(v.topluUygunIds).toEqual([v.satirlar[0].oneriler[0].id]) // yalnız poliçe no
    expect(v.aiAcik).toBe(false)
  })

  it('yardımcı kritik öneriyi onaylayamaz (düğme yerine "avukat onayı bekliyor")', () => {
    const y = bulduklarimizKur({ dosyaId: 'd1', yetki: YARDIMCI, aiAcik: true, satirlar, belgeler, kullanicilar: {}, hugoRucuTutari: null, odemeToplami: null })
    expect(y.satirlar.find((x) => x.alan === 'kazaTarihi')!.oneriler.every((o) => !o.onaylayabilir)).toBe(true)
    expect(y.satirlar.find((x) => x.alan === 'policeNo')!.oneriler[0].onaylayabilir).toBe(true)
    expect(y.engeller.some((e) => e.tur === 'BIN_KAT')).toBe(false)
  })

  it('boş panel', () => {
    const b = bulduklarimizKur({ dosyaId: 'd1', yetki: AVUKAT, aiAcik: false, satirlar: [], belgeler: [], kullanicilar: {}, hugoRucuTutari: null, odemeToplami: null })
    expect(b).toMatchObject({ satirlar: [], engeller: [], bekleyen: 0, topluUygunIds: [] })
  })
})

describe('rucuSebebiKur', () => {
  it('Hugo metni branş bilinmeden kod olmaz: adaylar ve gerekçe; EV-07 kartı görünür', () => {
    const v = rucuSebebiKur({ dosyaId: 'd1', yetki: AVUKAT, hugoHam: 'Alkollü', brans: null, satirlar: [], policeTanzim: null, policeBaslangic: null, kullanicilar: {} })
    expect(v.onayli).toBeNull()
    expect(v.hugoAdaylar).toEqual(['B4_C_ALKOL', 'KASKO_HALEFIYET'])
    expect(v.hugoGerekce).toMatch(/branşı bilinmiyor/)
    expect(v.ev07).toMatchObject({ gerekli: true, teyitGerekli: true })
  })

  it('Hugo önerisi kaynağıyla; seçenekler branşa uygun olanlar önce; K1 etiketi', () => {
    const v = rucuSebebiKur({
      dosyaId: 'd1', yetki: AVUKAT, hugoHam: 'Hizmet kusuru', brans: 'KASKO',
      satirlar: [s({ alan: 'rucuSebebiKod', degerJson: 'KASKO_HIZMET_KUSURU', kaynakTuru: 'HUGO', guven: 0.8 })],
      policeTanzim: null, policeBaslangic: null, kullanicilar: {},
    })
    expect(v.oneriler[0]).toMatchObject({ kod: 'KASKO_HIZMET_KUSURU', kaynakEtiketi: 'Hugo', k1Etiketi: 'K1: bekliyor · teyit gerekli' })
    expect(v.secenekler.slice(0, 3).every((x) => x.bransUygun)).toBe(true)
    expect(v.gsRejimi.rejim).toBe('UYGULANMAZ')
    expect(v.dayanaklar.map((d) => d.etiket)).toContain('TTK m.1472/1 (halefiyet)')
    expect(v.ev07.metin).toContain('öneri: Kasko halefiyeti · kamu idaresinin hizmet kusuru')
  })

  it('onaylı ZMSS B.4/f kodu: "teyit gerekli" etiketi ve poliçe tarihine göre GŞ sürümü', () => {
    const v = rucuSebebiKur({
      dosyaId: 'd1', yetki: AVUKAT, hugoHam: 'Olay yerini terk', brans: 'ZMMS',
      satirlar: [s({ alan: 'rucuSebebiKod', degerJson: 'B4_F', durum: 'ONAYLI', kaynakTuru: 'HUGO', onaylayanId: 'u1' })],
      policeTanzim: '2026-08-01', policeBaslangic: null, kullanicilar: { u1: 'Kurgusal Avukat' },
    })
    expect(v.onayli).toMatchObject({ kod: 'B4_F', teyitGerekli: true, onaylayanAd: 'Kurgusal Avukat' })
    expect(v.gsRejimi).toMatchObject({ rejim: 'GS_2026', esasTur: 'TANZIM' })
    expect(v.ev07).toMatchObject({ gerekli: false, teyitGerekli: true })
  })
})

describe('yetkiliIcraKur', () => {
  it('onaylı seçim yoksa eski kolondaki onaysız değer yalnız bilgi olarak görünür', () => {
    const v = yetkiliIcraKur({ dosyaId: 'd1', yetki: AVUKAT, kazaYeri: 'Seyhan', il: 'Adana', borclular: [], satirlar: [], eskiDeger: 'İstanbul İcra Dairesi', kullanicilar: {} })
    expect(v.onayli).toBeNull()
    expect(v.eskiDeger).toBe('İstanbul İcra Dairesi')
    expect(v.secenekler.map((x) => x.icraDairesi)).toEqual(['Adana İcra Dairesi'])
  })

  it('onaylı seçim gösterilir, eski değer gizlenir', () => {
    const v = yetkiliIcraKur({
      dosyaId: 'd1', yetki: AVUKAT, kazaYeri: 'Seyhan', il: 'Adana', borclular: [], eskiDeger: 'Adana İcra Dairesi', kullanicilar: { u1: 'Kurgusal Avukat' },
      satirlar: [s({ alan: 'yetkiliIcra', degerJson: { icraDairesi: 'Adana İcra Dairesi', secenek: 'KAZA_YERI', gerekce: 'Kaza yeri' }, durum: 'ONAYLI', kaynakTuru: 'ELLE', onaylayanId: 'u1' })],
    })
    expect(v.onayli).toMatchObject({ icraDairesi: 'Adana İcra Dairesi', secenek: 'KAZA_YERI', onaylayanAd: 'Kurgusal Avukat' })
    expect(v.eskiDeger).toBeNull()
  })
})
