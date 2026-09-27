import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BelgeMetni } from '@/lib/konsrucu/dilekce-v2/alinti'
import {
  asama2Kapisi, davaDegeriOnerisi, ekListesi, kartIcerigiKur, kilitKontrolu, kodCeliskileri, kurus, likiditeOlguSayisi,
  olguDuzelt, olgulariOnayla, secimleriUygula, type AiCiktisi, type KartGirdisi,
} from '@/lib/konsrucu/dilekce-v2/kart'
import type { KartIcerik } from '@/lib/konsrucu/dilekce-v2/tipler'
import { dilekceV2Acik, dilekceV2Kipi } from '@/lib/konsrucu/dilekce-v2/bayrak'

// Kurgusal dosya: gerçek kişi, TCKN, plaka yok.
const B = { itiraz: 'b0000000-0000-4000-8000-000000000001', tutanak: 'b0000000-0000-4000-8000-000000000002', dekont: 'b0000000-0000-4000-8000-000000000003', cevap: 'b0000000-0000-4000-8000-000000000004' }

function girdi(ez: Partial<KartGirdisi> = {}): KartGirdisi {
  return {
    dosya: { id: 'd1', hukukDosyaNo: 'H-1', icraDairesi: 'Örnek 1. İcra Dairesi', icraDosyaNo: '2026/100', takipTarihi: '2026-03-02T00:00:00.000Z', rucuSebebi: 'Karşı araç kusurlu', rucuSebebiKod: 'KASKO_HALEFIYET' },
    musteriUnvani: 'Örnek Sigorta A.Ş.',
    borclular: [
      { id: 'br1', adUnvan: 'Davalı Bir', takip: { itirazVar: true, itirazTipi: 'TAM', itirazVerilisTarihi: '2026-03-20T00:00:00.000Z', itirazUyapTarihi: null, itirazKapsamJson: { borc: true, faiz: true, feriler: true }, itirazEdilenTutar: null, itirazKaynakBelgeId: B.itiraz } },
      { id: 'br2', adUnvan: 'Davalı İki', takip: { itirazVar: false, itirazTipi: null, itirazVerilisTarihi: null, itirazUyapTarihi: null, itirazKapsamJson: null, itirazEdilenTutar: null, itirazKaynakBelgeId: null } },
    ],
    takipTalebi: { id: 'tt1', surum: 2, asilAlacak: '10000.00', islemisFaiz: '250.50', toplam: '10250.50', faizTuru: 'YASAL', faizOraniMetni: 'değişen oranlarda yasal faiz', faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: '2026-01-10T00:00:00.000Z', takipTarihi: '2026-03-02T00:00:00.000Z', kaynak: 'KOPILOT', kaynakBelgeId: null },
    dava: null,
    arabuluculuk: { id: 'ar1', tur: 'DAVA_SARTI', sonTutanakTarihi: '2026-06-01T00:00:00.000Z', sonuc: 'ANLASAMAMA', sonTutanakBelgeId: B.tutanak },
    alanlar: [{ id: 'al1', alan: 'policeNo', deger: 'P-123', kaynakBelgeId: B.dekont, sayfa: 1, alinti: 'Poliçe No P-123', alintiDogru: true, onaylayanId: 'avukat', onayAt: '2026-02-01T00:00:00.000Z' }],
    belgeler: [
      { id: B.dekont, ad: 'Dekont.pdf', altTur: 'HASAR_DEKONT', kategori: 'DEKONT', tarih: '2026-01-10', metinVar: true },
      { id: B.itiraz, ad: 'İtiraz dilekçesi.pdf', altTur: 'ICRA_ITIRAZ', kategori: 'DIGER', tarih: '2026-03-20', metinVar: true },
      { id: B.tutanak, ad: 'Son tutanak.pdf', altTur: 'ARB_SON_TUTANAK', kategori: 'DIGER', tarih: '2026-06-01', metinVar: true },
    ],
    dayanaklar: [{ id: 'm1', kunye: 'TTK m.1472/1', rucuSebebiKodlari: ['KASKO_HALEFIYET'] }, { id: 'm2', kunye: 'KTK m.95/2', rucuSebebiKodlari: ['B4_C_ALKOL'] }],
    ...ez,
  }
}

const metinler = new Map<string, BelgeMetni>([
  [B.dekont, { belgeId: B.dekont, ad: 'Dekont.pdf', sayfalar: [{ sayfaNo: 1, metin: 'Ödeme tarihi 10.01.2026. Tutar 10.000,00 TL.\nPoliçe No P-123 hasar ödemesi.' }] }],
  [B.itiraz, { belgeId: B.itiraz, ad: 'İtiraz dilekçesi.pdf', sayfalar: [{ sayfaNo: 1, metin: 'Borca, faize ve tüm fer\'ilerine itiraz ediyoruz.' }, { sayfaNo: 2, metin: 'Kaza anında müvekkilimizin hiçbir ku-\nsuru bulunmamaktadır.' }] }],
  [B.tutanak, { belgeId: B.tutanak, ad: 'Son tutanak.pdf', sayfalar: [{ sayfaNo: 1, metin: 'Taraflar arasında anlaşma sağlanamamıştır.' }] }],
])

const ai: AiCiktisi = {
  olgular: [
    { metin: 'Ödeme 10.01.2026 tarihinde 10.000,00 TL olarak yapıldı', belgeId: B.dekont, sayfa: 1, alinti: 'Ödeme tarihi 10.01.2026. Tutar 10.000,00 TL.', alanlar: ['ODEME', 'LIKIDITE'] },
    { metin: 'Borçlu kusuru olmadığını ileri sürdü', belgeId: B.itiraz, sayfa: 1, alinti: 'müvekkilimizin hiçbir kusuru bulunmamaktadır', alanlar: ['KUSUR'] }, // sayfa 2'de, heceleme tireli
    { metin: 'Sürücü saatte 90 km hızla gidiyordu', belgeId: B.dekont, sayfa: 1, alinti: 'hız 90 km', alanlar: ['KAZA'] }, // kaynaksız
    { metin: 'Sigortalı adına [KİŞİ-7] ödeme aldı', belgeId: B.dekont, sayfa: 1, alinti: 'Ödeme tarihi 10.01.2026.', alanlar: ['ODEME'] }, // açılmamış jeton
    { metin: 'Kısaltılmış alıntı', belgeId: B.dekont, sayfa: 1, alinti: 'Ödeme tarihi … Tutar', alanlar: ['ODEME'] },
    { metin: 'Arabuluculukta anlaşma sağlanamadı', belgeId: B.tutanak, sayfa: 1, alinti: 'anlaşma sağlanamamıştır', alanlar: ['SON_TUTANAK'] },
  ],
  celiskiler: [{ aciklama: 'Kusur beyanı tutanakla çelişiyor', olguSiralari: [2, 3] }],
  savunmalar: [],
}

const kur = (ez: Partial<KartGirdisi> = {}, tur: KartIcerik['tur'] = 'DAVA', aiCikti: AiCiktisi | null = ai) =>
  kartIcerigiKur({ tur, girdi: girdi(ez), belgeMetinleri: metinler, ai: { cikti: aiCikti, durum: aiCikti ? 'KULLANILDI' : 'KAPALI', model: aiCikti ? 'claude-opus-4-8' : null, uyari: null } })

const kim = { kullaniciId: 'avukat-1', at: '2026-09-27T10:00:00.000Z' }
/** Kritik olguların hepsini onaylar ve geçerli seçimleri kaydeder. */
function hazirla(icerik: KartIcerik): KartIcerik {
  const o = olgulariOnayla(icerik, icerik.olgular.filter((x) => x.kritik).map((x) => x.id), kim)
  if (!o.ok) throw new Error(o.error)
  const s = secimleriUygula(o.icerik, { mahkeme: 'Örnek Asliye Hukuk Mahkemesi', usul: 'YAZILI', esas: null, davalilar: ['br1'], talepler: ['ITIRAZIN_IPTALI', 'TAKIBIN_DEVAMI'], arabuluculukGerekmez: false, arabuluculukGerekce: null, not: null }, kim)
  if (!s.ok) throw new Error(s.error)
  return s.icerik
}

describe('dosya kartı: kaynaklı olgular (kabul 1–2)', () => {
  it('her olgu kaynaklıdır: kayıt bağı ya da belgede bulunan alıntı', () => {
    const k = kur()
    expect(k.olgular.length).toBeGreaterThan(5)
    for (const o of k.olgular) {
      expect(o.kaynakEtiketi.length, o.id).toBeGreaterThan(0)
      if (o.kaynakTuru === 'KAYIT') expect(o.kayitRef, o.id).not.toBeNull()
      else { expect(o.belgeId, o.id).toBeTruthy(); expect(o.alintiDogru, o.id).toBe(true) }
    }
    expect(k.olgular.map((o) => o.id)).toEqual(k.olgular.map((_, i) => `O-${i + 1}`))
  })

  it('alıntısı bulunamayan, kısaltılmış ya da açılmamış jetonlu olgu karta giremez', () => {
    const k = kur()
    const ai = k.olgular.filter((o) => o.kaynakTuru === 'AI').map((o) => o.metin)
    expect(ai).toEqual(['Ödeme 10.01.2026 tarihinde 10.000,00 TL olarak yapıldı', 'Borçlu kusuru olmadığını ileri sürdü', 'Arabuluculukta anlaşma sağlanamadı'])
    const ks = k.kaynaksizlar.map((x) => [x.metin, x.neden])
    expect(ks).toContainEqual(['Sürücü saatte 90 km hızla gidiyordu', 'Alıntı belgede bulunamadı.'])
    expect(ks.find((x) => x[0].includes('[KİŞİ-7]'))?.[1]).toMatch(/jeton/)
    expect(ks.find((x) => x[0] === 'Kısaltılmış alıntı')?.[1]).toMatch(/kısaltılmış/)
  })

  it('alıntı başka sayfada bulunursa sayfa düzeltilir (heceleme tiresi birleşir)', () => {
    const o = kur().olgular.find((x) => x.metin.startsWith('Borçlu kusuru'))!
    expect(o).toMatchObject({ belgeId: B.itiraz, sayfa: 2, kaynakEtiketi: 'İtiraz dilekçesi.pdf s.2' })
  })

  it('çelişkiler yalnız karta giren olgulara bağlanır', () => {
    const k = kur()
    const kusur = k.olgular.find((x) => x.metin.startsWith('Borçlu kusuru'))!.id
    expect(k.celiskiler[0]).toEqual({ aciklama: 'Kusur beyanı tutanakla çelişiyor', olguIdleri: [kusur] })
  })

  it('kritik kayıt olguları önce: davacı, davalılar, tutar, itiraz, rücu sebebi, son tutanak', () => {
    const k = kur({}, 'DAVA', null)
    const kritik = k.olgular.filter((o) => o.kritik).map((o) => o.kritikAlan)
    expect(kritik).toEqual(['TARAFLAR', 'TARAFLAR', 'TARAFLAR', 'TUTAR', 'TUTAR', 'ITIRAZ_KAPSAMI', 'RUCU_SEBEBI', 'SON_TUTANAK'])
    expect(k.olgular[0].metin).toBe('Davacı: Örnek Sigorta A.Ş.')
    expect(k.olgular.find((o) => o.kaynakTuru === 'ALAN')).toMatchObject({ onayli: true, onaylayanId: 'avukat', kritik: false })
  })

  it('yapay zekâ kapalıyken kart kayıtlardan kurulur', () => {
    const k = kur({}, 'DAVA', null)
    expect(k.ai.durum).toBe('KAPALI')
    expect(k.olgular.every((o) => o.kaynakTuru !== 'AI')).toBe(true)
  })

  it('hukuki sebep dayanakları yalnız rücu sebebi koduna bağlı DOĞRULANDI kayıtlar (B18)', () => {
    expect(kur().dayanaklar).toEqual([{ kaynakId: 'm1', kunye: 'TTK m.1472/1' }])
  })
})

describe('dava değeri (B04) ve tutar', () => {
  it('tam itirazda takip talebi toplamı; takip sonrası faiz eklenmez', () => {
    expect(davaDegeriOnerisi(girdi())).toMatchObject({ kurus: 1025050, kaynak: 'Takip talebi (sürüm 2)' })
  })
  it('toplam yoksa asıl + işlemiş faiz', () => {
    expect(davaDegeriOnerisi(girdi({ takipTalebi: { ...girdi().takipTalebi!, toplam: null } }))?.kurus).toBe(1025050)
  })
  it('kısmi itirazda itiraz edilen tutar (birlikte borçlularda toplanmaz)', () => {
    const t = girdi().borclular[0].takip!
    const g = girdi({ borclular: [
      { id: 'br1', adUnvan: 'Davalı Bir', takip: { ...t, itirazTipi: 'KISMI', itirazEdilenTutar: '4000.00' } },
      { id: 'br2', adUnvan: 'Davalı İki', takip: { ...t, itirazTipi: 'KISMI', itirazEdilenTutar: '3000.00' } },
    ] })
    expect(davaDegeriOnerisi(g)).toMatchObject({ kurus: 400000, kaynak: 'İtiraz kaydı' })
  })
  it('avukatın dava kaydı önceliklidir; takip toplamını aşarsa çelişki', () => {
    const g = girdi({ dava: { id: 'dv1', tur: 'ITIRAZIN_IPTALI', mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'Örnek', mahkemeNo: '3', esasYil: null, esasSira: null, usul: 'YAZILI', davaDegeri: '12000.00', davaDegeriKaynak: 'ELLE', taraflar: [] } })
    expect(davaDegeriOnerisi(g)).toMatchObject({ kurus: 1200000, kaynak: 'Dava kaydı' })
    const k = kartIcerigiKur({ tur: 'DAVA', girdi: g, belgeMetinleri: metinler })
    expect(kodCeliskileri(g, k.olgular)[0].aciklama).toMatch(/aşıyor/)
  })
  it('itiraz yoksa öneri yok', () => {
    expect(davaDegeriOnerisi(girdi({ borclular: [] }))).toBeNull()
  })
  it('kuruş hesabı kayan noktasız', () => {
    expect([kurus('10250.5'), kurus('0.1'), kurus('12'), kurus('abc'), kurus(null)]).toEqual([1025050, 10, 1200, null, null])
  })
})

describe('kilit ve aşama 2 kapısı (kabul 3)', () => {
  it('kritik olgu onaysızken kart kilitlenemez; aşama 2 kapalı', () => {
    const k = kur()
    const r = kilitKontrolu(k)
    expect(r.kilitlenebilir).toBe(false)
    expect(r.nedenler.join(' ')).toMatch(/Onay bekleyen kritik olgu: O-1/)
    expect(asama2Kapisi({ durum: 'TASLAK', icerik: k }).acik).toBe(false)
  })

  it('bütün kritik olgular onaylı ve seçimler tamamsa kilitlenir; ONAYLI kart aşama 2yi açar', () => {
    const k = hazirla(kur())
    expect(kilitKontrolu(k)).toEqual({ kilitlenebilir: true, nedenler: [] })
    expect(asama2Kapisi({ durum: 'TASLAK', icerik: k }).acik).toBe(false) // kilitlenmedi
    expect(asama2Kapisi({ durum: 'ONAYLI', icerik: k })).toEqual({ acik: true, nedenler: [] })
    expect(asama2Kapisi(null).acik).toBe(false)
  })

  it('ONAYLI olsa bile onaysız kritik olgu varsa aşama 2 kapalı (savunma hattı)', () => {
    const k = hazirla(kur())
    const bozuk = { ...k, olgular: k.olgular.map((o, i) => (i === 0 ? { ...o, onayli: false } : o)) }
    expect(asama2Kapisi({ durum: 'ONAYLI', icerik: bozuk }).acik).toBe(false)
  })

  it('B19: müvekkil unvanı yoksa kilitlenmez', () => {
    const k = hazirla(kur({ musteriUnvani: null }))
    expect(kilitKontrolu(k).nedenler.join(' ')).toMatch(/B19/)
  })

  it('B08: itiraz etmeyen borçlu davalı seçilirse kilitlenmez', () => {
    const k = hazirla(kur())
    const s = secimleriUygula(k, { ...k.secimler, davalilar: ['br1', 'br2'] }, kim)
    expect(s.ok && kilitKontrolu(s.icerik).nedenler.join(' ')).toMatch(/Davalı İki \(B08\)/)
  })

  it('davalı ve talep seçilmeden dava dilekçesi kartı kilitlenmez', () => {
    const k = olgulariOnayla(kur(), kur().olgular.filter((x) => x.kritik).map((x) => x.id), kim)
    expect(k.ok && kilitKontrolu(k.icerik).nedenler).toEqual(expect.arrayContaining(['Davalı seçilmedi.', 'Talep seçilmedi.']))
  })

  it('son tutanak yoksa kilitlenmez; "dava şartı değil" seçimi gerekçeyle yazılırsa açılır', () => {
    const k = hazirla(kur({ arabuluculuk: null }, 'DAVA', null))
    expect(kilitKontrolu(k).nedenler.join(' ')).toMatch(/Arabuluculuk son tutanağı/)
    const g1 = secimleriUygula(k, { ...k.secimler, arabuluculukGerekmez: true, arabuluculukGerekce: null }, kim)
    expect(g1.ok && kilitKontrolu(g1.icerik).nedenler.join(' ')).toMatch(/gerekçe/)
    const g2 = secimleriUygula(k, { ...k.secimler, arabuluculukGerekmez: true, arabuluculukGerekce: 'İhtiyari arabuluculuk; dava şartı değil (avukat değerlendirmesi).' }, kim)
    expect(g2.ok && kilitKontrolu(g2.icerik).kilitlenebilir).toBe(true)
  })

  it('yapay zekâ olgusu kritik kümeyi karşılayabilir ama onay ister (son tutanak)', () => {
    const k = kur({ arabuluculuk: null })
    const son = k.olgular.find((o) => o.kritikAlan === 'SON_TUTANAK')!
    expect(son).toMatchObject({ kaynakTuru: 'AI', kritik: true, onayli: false })
    expect(kilitKontrolu(hazirla(k)).kilitlenebilir).toBe(true)
  })

  it('delil dilekçesinde yalnız o türün kritik alt kümesi aranır', () => {
    const dava = { id: 'dv1', tur: 'ITIRAZIN_IPTALI', mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'Örnek', mahkemeNo: '3', esasYil: 2026, esasSira: 55, usul: 'YAZILI', davaDegeri: null, davaDegeriKaynak: null, taraflar: [] }
    const k = kur({ dava }, 'DELIL', null)
    expect(new Set(k.olgular.filter((o) => o.kritik).map((o) => o.kritikAlan))).toEqual(new Set(['TARAFLAR', 'MAHKEME_ESAS']))
    expect(k.olgular.find((o) => o.kritikAlan === 'MAHKEME_ESAS')?.metin).toBe('Mahkeme ve esas: Örnek 3. Asliye Hukuk Mahkemesi 2026/55 E.')
    const o = olgulariOnayla(k, k.olgular.filter((x) => x.kritik).map((x) => x.id), kim)
    expect(o.ok && kilitKontrolu(o.icerik).kilitlenebilir).toBe(true) // davalı/talep seçimi yalnız dava dilekçesinde zorunlu
  })

  it('cevaba cevap: basit usulde önerilmez; işaretlenmemiş savunma kilidi tutar', () => {
    const dava = { id: 'dv1', tur: 'ITIRAZIN_IPTALI', mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'Örnek', mahkemeNo: '3', esasYil: 2026, esasSira: 55, usul: 'BASIT', davaDegeri: null, davaDegeriKaynak: null, taraflar: [] }
    const cevapMetni = new Map(metinler).set(B.cevap, { belgeId: B.cevap, ad: 'Cevap.pdf', sayfalar: [{ sayfaNo: 3, metin: 'Talep zamanaşımına uğramıştır.' }] })
    const cikti: AiCiktisi = { olgular: [], celiskiler: [], savunmalar: [{ baslik: 'Zamanaşımı', konu: 'ZAMANASIMI', belgeId: B.cevap, sayfa: 3, alinti: 'Talep zamanaşımına uğramıştır.' }, { baslik: 'Uydurma savunma', konu: 'KUSUR', belgeId: B.cevap, sayfa: 1, alinti: 'bu cümle cevapta yok' }] }
    const k = kartIcerigiKur({ tur: 'CEVABA_CEVAP', girdi: girdi({ dava }), belgeMetinleri: cevapMetni, ai: { cikti, durum: 'KULLANILDI', model: null, uyari: null } })
    expect(k.savunmalar).toHaveLength(1)
    expect(k.savunmalar[0]).toMatchObject({ id: 'S-1', konu: 'ZAMANASIMI', sayfa: 3, isaret: null })
    expect(k.kaynaksizlar.some((x) => x.metin === 'Savunma: Uydurma savunma')).toBe(true)
    const n = kilitKontrolu(k).nedenler.join(' ')
    expect(n).toMatch(/HMK 317/)
    expect(n).toMatch(/İşaretlenmemiş savunma: S-1/)
  })
})

describe('düzeltme, onay taşıma ve seçimler (kabul 4–5)', () => {
  it('kayıt kaynaklı olgu kartta düzeltilmez', () => {
    const k = kur()
    const r = olguDuzelt(k, 'O-1', { metin: 'Davacı: başka' }, metinler, { ...kim, avukat: true })
    expect(r.ok).toBe(false)
  })

  it('avukatın düzeltmesi onay sayılır; yardımcınınki onaysız kalır', () => {
    const k = kur()
    const id = k.olgular.find((o) => o.kaynakTuru === 'AI')!.id
    const a = olguDuzelt(k, id, { metin: 'Ödeme 10.01.2026 tarihinde yapıldı' }, metinler, { ...kim, avukat: true })
    expect(a.ok && a.icerik.olgular.find((o) => o.id === id)).toMatchObject({ metin: 'Ödeme 10.01.2026 tarihinde yapıldı', duzeltildi: true, onayli: true, onaylayanId: 'avukat-1' })
    const y = olguDuzelt(k, id, { metin: 'Ödeme yapıldı' }, metinler, { kullaniciId: 'yrd', at: kim.at, avukat: false })
    expect(y.ok && y.icerik.olgular.find((o) => o.id === id)).toMatchObject({ onayli: false, onaylayanId: null })
  })

  it('düzeltmede verilen yeni alıntı belgede yoksa düzeltme reddedilir', () => {
    const k = kur()
    const id = k.olgular.find((o) => o.kaynakTuru === 'AI')!.id
    const r = olguDuzelt(k, id, { metin: 'Hız 90', kaynak: { belgeId: B.dekont, sayfa: 1, alinti: 'hız saatte 90 kilometre' } }, metinler, { ...kim, avukat: true })
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.error).toMatch(/Kaynaksız olgu karta giremez/)
  })

  it('yeniden hazırlanan kartta aynı olguların onayı ve avukat seçimleri korunur', () => {
    const onceki = hazirla(kur())
    const yeni = kartIcerigiKur({ tur: 'DAVA', girdi: girdi(), belgeMetinleri: metinler, ai: { cikti: ai, durum: 'KULLANILDI', model: null, uyari: null }, onceki })
    expect(yeni.olgular.filter((o) => o.kritik).every((o) => o.onayli)).toBe(true)
    expect(yeni.secimler.davalilar).toEqual(['br1'])
    // Tutar değişirse o olgu yeniden onay ister
    const degisen = kartIcerigiKur({ tur: 'DAVA', girdi: girdi({ takipTalebi: { ...girdi().takipTalebi!, asilAlacak: '9000.00' } }), belgeMetinleri: metinler, onceki })
    expect(degisen.olgular.find((o) => o.metin.startsWith('Takip talebi'))?.onayli).toBe(false)
  })

  it('onaylı alan olgusu kartta düzeltilmez (öneriler ekranında düzeltilir)', () => {
    const k = kur()
    const id = k.olgular.find((o) => o.kaynakTuru === 'ALAN')!.id
    const r = olguDuzelt(k, id, { metin: 'Poliçe no: başka' }, metinler, { ...kim, avukat: true })
    expect(!r.ok && r.error).toMatch(/onaylı alan/)
  })

  it('yeniden hazırlamada avukatın düzeltmesi korunur; kaynağı kaybolan düzeltme kaynaksız düşer', () => {
    const k = kur()
    const odeme = k.olgular.find((o) => o.metin.startsWith('Ödeme 10.01.2026'))!
    const d1 = olguDuzelt(k, odeme.id, { metin: 'Ödeme 10.01.2026 tarihinde yapılmıştır' }, metinler, { ...kim, avukat: true })
    if (!d1.ok) throw new Error(d1.error)
    const tutanak = d1.icerik.olgular.find((o) => o.metin.startsWith('Arabuluculukta'))!
    const d2 = olguDuzelt(d1.icerik, tutanak.id, { metin: 'Tutanak: anlaşma sağlanamadı' }, metinler, { ...kim, avukat: true })
    if (!d2.ok) throw new Error(d2.error)
    // Yeni çıkarımda ödeme olgusu aynı kaynakla geliyor, tutanak olgusu hiç gelmiyor
    const yeniAi: AiCiktisi = { ...ai, olgular: ai.olgular.filter((o) => !o.metin.startsWith('Arabuluculukta')) }
    const yeni = kartIcerigiKur({ tur: 'DAVA', girdi: girdi(), belgeMetinleri: metinler, ai: { cikti: yeniAi, durum: 'KULLANILDI', model: null, uyari: null }, onceki: d2.icerik })
    expect(yeni.olgular.find((o) => o.alinti === odeme.alinti)).toMatchObject({ metin: 'Ödeme 10.01.2026 tarihinde yapılmıştır', duzeltildi: true, onayli: true })
    expect(yeni.olgular.find((o) => o.metin === 'Tutanak: anlaşma sağlanamadı')).toMatchObject({ duzeltildi: true, alintiDogru: true })
    const metinsiz = new Map(metinler); metinsiz.delete(B.tutanak)
    const kayip = kartIcerigiKur({ tur: 'DAVA', girdi: girdi(), belgeMetinleri: metinsiz, ai: { cikti: yeniAi, durum: 'KULLANILDI', model: null, uyari: null }, onceki: d2.icerik })
    expect(kayip.olgular.some((o) => o.metin === 'Tutanak: anlaşma sağlanamadı')).toBe(false)
    expect(kayip.kaynaksizlar.find((x) => x.metin === 'Tutanak: anlaşma sağlanamadı')?.neden).toMatch(/Önceki sürümde düzeltilen/)
  })

  it('seçim yalnız aday listesindeki davalılardan', () => {
    const k = kur()
    expect(secimleriUygula(k, { ...k.secimler, davalilar: ['baska-dosyanin-borclusu'] }, kim).ok).toBe(false)
  })

  it('sistem önerir, avukat seçer: seçimler boş başlar, öneriler ayrı durur', () => {
    const k = kur()
    expect(k.secimler).toMatchObject({ davalilar: [], talepler: [], mahkeme: null, kaydedenId: null })
    expect(k.oneriler).toMatchObject({ davalilar: ['br1'], talepler: ['ITIRAZIN_IPTALI', 'TAKIBIN_DEVAMI', 'YARGILAMA_GIDERI'] })
  })

  it('inkâr tazminatı için likidite olgu sayısı', () => {
    expect(likiditeOlguSayisi(kur())).toBe(1)
    expect(likiditeOlguSayisi(kur({}, 'DAVA', null))).toBe(0)
  })

  it('EK listesi: son tutanak ilk sırada; dava dilekçesinde mahkeme evrakı yok', () => {
    const g = girdi({ belgeler: [...girdi().belgeler, { id: 'x', ad: 'Tensip.pdf', altTur: 'DAVA_TENSIP', kategori: 'DIGER', tarih: '2026-07-01', metinVar: true }, { id: 'f', ad: 'foto.jpg', altTur: null, kategori: 'HASAR_FOTO', tarih: null, metinVar: false }] })
    expect(ekListesi(g, 'DAVA').map((e) => e.ad)).toEqual(['Son tutanak.pdf', 'İtiraz dilekçesi.pdf', 'Dekont.pdf'])
    expect(ekListesi(g, 'DELIL').map((e) => e.ad)).toContain('Tensip.pdf')
  })
})

describe('DILEKCE_V2 bayrağı', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('varsayılan kapalı; avukat kipinde yalnız ADMIN/AVUKAT; herkes kipinde bütün roller', () => {
    vi.stubEnv('DILEKCE_V2', '')
    expect(dilekceV2Kipi()).toBe('kapali')
    expect(dilekceV2Acik('ADMIN')).toBe(false)
    vi.stubEnv('DILEKCE_V2', 'avukat')
    expect([dilekceV2Acik('ADMIN'), dilekceV2Acik('AVUKAT'), dilekceV2Acik('AVUKAT_YRD')]).toEqual([true, true, false])
    vi.stubEnv('DILEKCE_V2', 'herkes')
    expect(dilekceV2Acik('AVUKAT_YRD')).toBe(true)
    vi.stubEnv('DILEKCE_V2', 'evet')
    expect(dilekceV2Kipi()).toBe('kapali')
  })
})
