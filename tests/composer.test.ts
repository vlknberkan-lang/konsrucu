import { describe, expect, it } from 'vitest'
import { baglamKur, dilekceyiOlustur, TALEP_METNI, type AiParagrafGirdi, type ComposerGirdisi } from '@/lib/konsrucu/dilekce-v2/composer'
import { iskeletSec } from '@/lib/konsrucu/dilekce-v2/iskelet'
import type { KartIcerik } from '@/lib/konsrucu/dilekce-v2/tipler'
import type { KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'
import { DOGRULANMADI_ISARETI } from '@/lib/konsrucu/mevzuat/sabitler'

// Kurgusal dosya (gerçek kişi, plaka, poliçe, dosya no yok). Kilitli (ONAYLI) kartın sonucu diye kabul edilir;
// asama2Kapisi/kilitKontrolu kontrolü çağıran katmanın (server action) işidir, composer yalnız içeriği işler.
function kartIcerik(ez: Partial<KartIcerik> = {}): KartIcerik {
  return {
    tur: 'DAVA',
    olgular: [
      { id: 'O-1', metin: 'Davacı: Örnek Sigorta A.Ş.', alanlar: [], kritik: true, kritikAlan: 'TARAFLAR', kaynakTuru: 'KAYIT', kaynakEtiketi: 'Müvekkil ayarı', kayitRef: { tablo: 'Ayarlar', id: 'musteri' }, belgeId: null, belgeAdi: null, sayfa: null, alinti: null, alintiDogru: null, onayli: true, onaylayanId: 'avukat-1', onayAt: '2026-09-01T00:00:00.000Z', duzeltildi: false },
      { id: 'O-2', metin: 'Ödeme 10.01.2026 tarihinde 10.000,00 TL olarak yapılmıştır', alanlar: ['ODEME', 'LIKIDITE'], kritik: false, kritikAlan: null, kaynakTuru: 'AI', kaynakEtiketi: 'Dekont.pdf s.1', kayitRef: null, belgeId: 'b-dekont', belgeAdi: 'Dekont.pdf', sayfa: 1, alinti: 'Ödeme tarihi 10.01.2026. Tutar 10.000,00 TL.', alintiDogru: true, onayli: false, onaylayanId: null, onayAt: null, duzeltildi: false },
    ],
    kaynaksizlar: [],
    secimler: { mahkeme: null, usul: 'YAZILI', esas: null, davalilar: ['br1'], talepler: ['ITIRAZIN_IPTALI', 'TAKIBIN_DEVAMI'], arabuluculukGerekmez: false, arabuluculukGerekce: null, not: null, kaydedenId: 'avukat-1', kayitAt: '2026-09-01T00:00:00.000Z' },
    oneriler: { mahkeme: 'Örnek Asliye Hukuk Mahkemesi', usul: 'YAZILI', esas: null, davalilar: ['br1'], talepler: ['ITIRAZIN_IPTALI', 'TAKIBIN_DEVAMI'] },
    davaliAdaylari: [
      { borcluId: 'br1', ad: 'Davalı Bir', itirazVar: true, itirazTipi: 'TAM', itirazTarihi: '2026-03-20T00:00:00.000Z', davaTarafId: null, davaTarafTeyit: null },
      { borcluId: 'br2', ad: 'Davalı İki', itirazVar: false, itirazTipi: null, itirazTarihi: null, davaTarafId: null, davaTarafTeyit: null },
    ],
    ekler: [
      { belgeId: 'b-tutanak', ad: 'Son tutanak.pdf', altTur: 'ARB_SON_TUTANAK', sira: 1 },
      { belgeId: 'b-takip', ad: 'Takip talebi.pdf', altTur: 'TAKIP_TALEBI', sira: 2 },
    ],
    eksikler: [],
    celiskiler: [],
    savunmalar: [],
    dayanaklar: [{ kaynakId: 'm1', kunye: 'TTK m.1472/1' }],
    davaTuru: 'ITIRAZIN_IPTALI',
    ai: { durum: 'KULLANILDI', model: 'claude-opus-4-8', uyari: null },
    okunamayanBelgeler: [],
    kisaltilanBelgeler: [],
    aiyaGitmeyenBelgeler: [],
    ...ez,
  }
}

const kutuphane: KutuphaneKaydi[] = [
  { id: 'm1', kunye: 'TTK m.1472/1', tur: 'MEVZUAT', alinti: 'Sigortacı, ödediği tazminat tutarınca hukuken sigortalının yerine geçer.', durum: 'DOGRULANDI', aktif: true },
]

function girdi(ez: Partial<ComposerGirdisi> = {}): ComposerGirdisi {
  return {
    kart: kartIcerik(),
    davaci: { unvan: 'Örnek Sigorta A.Ş.', adres: 'Örnek Mah. Örnek Cad. No:1 İstanbul', vkn: '1234567890' },
    vekil: { adSoyad: 'Av. Örnek Vekil', uets: '10000000000' },
    mahkemeAdi: 'Örnek Asliye Hukuk Mahkemesi',
    esasNo: null,
    icraDairesi: 'Örnek 1. İcra Dairesi',
    icraEsasNo: '2026/100',
    davaDegeri: { kurus: 1025050, aciklama: 'tam itiraz: takip talebindeki asıl alacak ve işlemiş faiz; takip sonrası faiz eklenmez' },
    tarih: new Date('2026-09-27T10:00:00.000Z'),
    kutuphane,
    ...ez,
  }
}

const bloklar = iskeletSec([], 'DAVA', {}).bloklar
const AI_YUVA = 'B05#1' // DAVA varsayılan iskeletinde AÇIKLAMALAR bloğunun tek AI yuvası

const blokMetni = (sonuc: ReturnType<typeof dilekceyiOlustur>, id: string) => sonuc.bloklar.find((b) => b.id === id)?.metin

describe('composer: koddan basılan bloklar deterministiktir', () => {
  it('taraflar, değer, EKLER ve talep sonucu blokları AI olsun ya da olmasın birebir aynıdır', () => {
    const g = girdi()
    const aiVarken: AiParagrafGirdi[] = [{ yuvaId: AI_YUVA, metin: 'Sigortalı şirket, hasar bedelini ödeyerek halef olmuştur [O-2].' }]
    const r1 = dilekceyiOlustur(g, bloklar, aiVarken)
    const r2 = dilekceyiOlustur(g, bloklar, null) // yapay zekâ hiç çalışmadı
    for (const id of ['B02', 'B04', 'B06', 'B07', 'B08', 'B09']) {
      expect(blokMetni(r1, id), id).toBe(blokMetni(r2, id))
    }
  })

  it('taraflar bloğu yalnız seçili davalıyı basar; seçilmeyen aday görünmez', () => {
    const r = dilekceyiOlustur(girdi(), bloklar, null)
    const taraflar = blokMetni(r, 'B02')!
    expect(taraflar).toContain('Davalı Bir')
    expect(taraflar).not.toContain('Davalı İki')
    expect(taraflar).toContain('Örnek Sigorta A.Ş.')
    expect(taraflar).toContain('Av. Örnek Vekil')
  })

  it('dava değeri ve açıklaması koddan (kart.ts · davaDegeriOnerisi) basılır, uydurulmaz', () => {
    const r = dilekceyiOlustur(girdi(), bloklar, null)
    expect(blokMetni(r, 'B04')).toBe('DAVA DEĞERİ\t: 10.250,50 TL (tam itiraz: takip talebindeki asıl alacak ve işlemiş faiz; takip sonrası faiz eklenmez)')
  })

  it('dava değeri yoksa (kart henüz hesaplayamadıysa) sabit olgu uydurulmaz, yer tutucu kalır', () => {
    const r = dilekceyiOlustur(girdi({ davaDegeri: null }), bloklar, null)
    expect(blokMetni(r, 'B04')).toContain('⟨dava değeri⟩')
    expect(r.yerTutucular.some((y) => y.alan === 'dava_degeri')).toBe(true)
  })

  it('EKLER listesi kart.ekler ile birebir ve sırayla eşleşir', () => {
    const r = dilekceyiOlustur(girdi(), bloklar, null)
    const ekler = blokMetni(r, 'B07')!
    expect(ekler).toBe('HUKUKİ DELİLLER\n1. Son tutanak.pdf\n2. Takip talebi.pdf\n3. Her türlü yasal delil.')
  })

  it('talep sonucu yalnız avukatın seçtiği taleplerden, koddaki metinlerle basılır', () => {
    const r = dilekceyiOlustur(girdi(), bloklar, null)
    const sonuc = blokMetni(r, 'B08')!
    expect(sonuc).toContain(`1. ${TALEP_METNI.ITIRAZIN_IPTALI},`)
    expect(sonuc).toContain(`2. ${TALEP_METNI.TAKIBIN_DEVAMI},`)
    expect(sonuc).not.toContain(TALEP_METNI.INKAR_TAZMINATI)
  })

  it('hukuki sebepler yalnız kartın DOĞRULANDI dayanaklarından basılır', () => {
    const r = dilekceyiOlustur(girdi(), bloklar, null)
    expect(blokMetni(r, 'B06')).toBe('HUKUKİ NEDENLER\n1. TTK m.1472/1')
  })
})

describe('composer: AÇIKLAMALAR — kart dışı olgu reddi (06 §7.4-2)', () => {
  it('geçerli [O-n] içeren paragraf kabul edilir ve olguBaglari listesine girer', () => {
    const ai: AiParagrafGirdi[] = [{ yuvaId: AI_YUVA, metin: '1. Sigortalı şirket, hasar bedelini ödeyerek halef olmuştur [O-2].' }]
    const r = dilekceyiOlustur(girdi(), bloklar, ai)
    const p = r.paragraflar.find((x) => x.yuvaId === AI_YUVA)!
    expect(p.kaynaksiz).toBe(false)
    expect(p.olguIdleri).toEqual(['O-2'])
    expect(r.olguBaglari).toHaveLength(1)
    expect(r.metin).toContain('[O-2]')
    expect(r.metin).not.toContain('KAYNAKSIZ')
  })

  it('kartta olmayan olgu kimliğiyle yazılan paragraf sessizce kabul edilmez: kaynaksız işaretlenir, olguBaglari boş kalır', () => {
    const ai: AiParagrafGirdi[] = [{ yuvaId: AI_YUVA, metin: '1. Sürücü saatte 150 km hızla gidiyordu [O-99].' }]
    const r = dilekceyiOlustur(girdi(), bloklar, ai)
    const p = r.paragraflar.find((x) => x.yuvaId === AI_YUVA)!
    expect(p.kaynaksiz).toBe(true)
    expect(p.olguIdleri).toEqual([])
    expect(p.gecersizIdler).toEqual(['O-99'])
    expect(r.olguBaglari).toHaveLength(0)
    // Metin silinmez (avukat görüp düzeltsin) ama açıkça işaretlenir — sessizce kabul edilmiş olmaz.
    expect(r.metin).toContain('KAYNAKSIZ')
    expect(r.metin).toContain('150 km')
    expect(r.uyarilar.some((u) => u.includes('KAYNAKSIZ'))).toBe(true)
  })

  it('hiç [O-n] içermeyen paragraf da kaynaksız sayılır (referanssız olgu iddiası)', () => {
    const ai: AiParagrafGirdi[] = [{ yuvaId: AI_YUVA, metin: 'Müvekkil şirket zarara uğramıştır.' }]
    const r = dilekceyiOlustur(girdi(), bloklar, ai)
    expect(r.paragraflar[0].kaynaksiz).toBe(true)
  })

  it('yapay zekâ hiç çalışmadıysa (aiSonucu=null) yuva deterministik yer tutucu olur, kaynaksız sayılmaz', () => {
    const r = dilekceyiOlustur(girdi(), bloklar, null)
    const p = r.paragraflar.find((x) => x.yuvaId === AI_YUVA)!
    expect(p.aiUretti).toBe(false)
    expect(p.kaynaksiz).toBe(false)
    expect(r.metin).toContain('⟨açıklama:')
    expect(r.uyarilar.some((u) => u.includes('Yapay zekâ çalışmadı'))).toBe(true)
  })
})

describe('composer: atıf kapısı (06 §7.4-1)', () => {
  it('kütüphanede karşılığı olmayan atıf ⟨DOĞRULANMADI⟩ ile işaretlenir', () => {
    const ai: AiParagrafGirdi[] = [{ yuvaId: AI_YUVA, metin: '1. Ödeme İİK m.67 uyarınca yapılmıştır [O-2].' }]
    const r = dilekceyiOlustur(girdi(), bloklar, ai)
    expect(r.metin).toContain(DOGRULANMADI_ISARETI)
    expect(r.atiflar.some((a) => a.kirmizi && a.metin.includes('İİK'))).toBe(true)
    expect(r.uyarilar.some((u) => u.includes('atıf'))).toBe(true)
  })

  it('kartın DOĞRULANDI dayanağı (hukuki sebepler bloğu) işaretlenmez', () => {
    const r = dilekceyiOlustur(girdi(), bloklar, null)
    expect(r.metin).not.toContain(DOGRULANMADI_ISARETI)
  })
})

describe('baglamKur', () => {
  it('yalnız kilitli kartın ve künyenin verdiği alanları üretir; olgu üretmez', () => {
    const b = baglamKur(girdi())
    expect(b.davaci_unvan).toBe('Örnek Sigorta A.Ş.')
    expect(b.mahkeme_adi).toBe('Örnek Asliye Hukuk Mahkemesi')
    expect(Array.isArray(b.davalilar)).toBe(true)
    expect((b.davalilar as { ad: string }[]).map((x) => x.ad)).toEqual(['Davalı Bir'])
  })
})
