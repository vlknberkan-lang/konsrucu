/**
 * S21 · Takip talebi saf kuralları (lib/konsrucu/senkron/takip-talebi.ts) — B04, B10, B26.
 *  - Faiz türü, oranı ve başlangıcı için VARSAYILAN YOK; eksikse talep cümlesi kurulmaz, kilit açılmaz.
 *  - "Yasal" + "her ödeme tarihinden" → cümlede "yasal faizi"; "%......" hiçbir zaman yok.
 *  - Rücu tutarı hesap izi: dekont toplamı × rücu oranı = asıl alacak (K1 dışı kalemler formüle girmez).
 *  - Oran tablosunun kapsamadığı dönemde işlemiş faiz HESAPLANMAZ (B26).
 *  - Değişmez kayıt: taslak güncellenir, dondurulmuş kayıt yeni sürüm açar.
 * Tutarlar kurgusaldır.
 */
import { describe, it, expect } from 'vitest'
import {
  faizHazirlikMaddesi, faizSecimiEksikleri, faizTalepMetni, hesapIziHalaGecerli, kopilotFaizDestekli, oranCoz, oranKapsami,
  rucuHesapIzi, rucuOraniCoz, surumKarari, takipAlacakHesapla, takipTalebiKilitSebepleri, type FaizSecimi,
} from '@/lib/konsrucu/senkron/takip-talebi'

const YASAL_HER: FaizSecimi = { faizTuru: 'YASAL', faizOraniMetni: 'değişen oranlarda', faizBaslangicTuru: 'HER_ODEMEDEN', faizBaslangic: null }
const ORANLAR = [{ baslangic: '2024-01-01', oran: 24 }, { baslangic: '2025-06-01', oran: 30 }]

describe('faiz seçimi — varsayılan yok', () => {
  it('hiçbir şey seçilmemişse üç eksik', () => {
    expect(faizSecimiEksikleri({ faizTuru: null, faizOraniMetni: null, faizBaslangicTuru: null, faizBaslangic: null })).toEqual(['Faiz türü seçilmedi', 'Faiz oranı seçilmedi', 'Faiz başlangıcı seçilmedi'])
    expect(faizSecimiEksikleri(null)).toHaveLength(3)
  })
  it('tek tarihte tarih zorunlu; diğer türde yüzde zorunlu', () => {
    expect(faizSecimiEksikleri({ ...YASAL_HER, faizBaslangicTuru: 'TEK_TARIH' })).toEqual(['Faiz başlangıç tarihi girilmedi'])
    expect(faizSecimiEksikleri({ ...YASAL_HER, faizTuru: 'DIGER' })).toEqual(['Diğer faiz türünde yıllık oran (%) girilmeli'])
    expect(faizSecimiEksikleri({ ...YASAL_HER, faizTuru: 'DIGER', faizOraniMetni: '%9,5' })).toEqual([])
  })
  it('bilinmeyen tür ya da okunamayan oran eksik sayılır (tahmin yürütülmez)', () => {
    expect(faizSecimiEksikleri({ ...YASAL_HER, faizTuru: 'TICARI' })).toContain('Faiz türü seçilmedi')
    expect(faizSecimiEksikleri({ ...YASAL_HER, faizOraniMetni: 'yüksek' })).toContain('Faiz oranı seçilmedi')
    expect(oranCoz('%250')).toBeNull()
    expect(oranCoz('24')).toEqual({ tip: 'YUZDE', yuzde: 24 })
    expect(oranCoz('Değişen oranlarda')).toEqual({ tip: 'DEGISEN' })
  })
})

describe('talep cümlesi (dosyaAciklama_48_4)', () => {
  it('"Yasal" + "her ödeme tarihinden" → "yasal faizi"; "%......" yok (kabul testi 2)', () => {
    const m = faizTalepMetni(YASAL_HER)!
    expect(m).toBe("Alacağın her bir ödeme tarihinden itibaren tahsili tarihine kadar değişen oranlarda yasal faizi, masraf ve vekalet ücreti ile tahsili, kısmi ödemelerde BK.100'e göre yapılmasını talep ederim.")
    expect(m).not.toContain('%......')
  })
  it('tek tarih ve sabit oran', () => {
    expect(faizTalepMetni({ faizTuru: 'AVANS', faizOraniMetni: '%9,75', faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: '2026-01-05' })).toContain('05.01.2026 tarihinden itibaren tahsili tarihine kadar yıllık %9,75 oranında avans faizi')
    expect(faizTalepMetni({ faizTuru: 'DIGER', faizOraniMetni: '12', faizBaslangicTuru: 'HER_ODEMEDEN', faizBaslangic: null })).toContain('yıllık %12 oranında faizi')
  })
  it('DB\'den gelen Date (İstanbul günü) doğru güne çevrilir', () => {
    expect(faizTalepMetni({ ...YASAL_HER, faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: new Date('2026-01-04T21:00:00Z') })).toContain('05.01.2026')
    expect(faizTalepMetni({ ...YASAL_HER, faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: new Date('2026-01-05T00:00:00Z') })).toContain('05.01.2026')
  })
  it('seçim eksikse cümle kurulmaz', () => {
    expect(faizTalepMetni({ ...YASAL_HER, faizTuru: null })).toBeNull()
  })
  it('kopilot yalnız keşifle kanıtlı seçimi aktarır: yasal + değişen oran', () => {
    expect(kopilotFaizDestekli(YASAL_HER)).toBe(true)
    expect(kopilotFaizDestekli({ ...YASAL_HER, faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: '2026-01-05' })).toBe(true)
    expect(kopilotFaizDestekli({ ...YASAL_HER, faizTuru: 'AVANS' })).toBe(false)
    expect(kopilotFaizDestekli({ ...YASAL_HER, faizOraniMetni: '%24' })).toBe(false)
    expect(kopilotFaizDestekli({ ...YASAL_HER, faizBaslangicTuru: null })).toBe(false)
  })
  it('hazırlık listesi maddesi', () => {
    expect(faizHazirlikMaddesi(null)).toEqual({ tamam: false, metin: 'Faiz türü, oranı ve başlangıcı seçilmedi' })
    expect(faizHazirlikMaddesi(YASAL_HER)).toEqual({ tamam: true, metin: 'Faiz: Yasal faiz, değişen oranlarda, her ödeme tarihinden' })
  })
})

describe('rücu tutarı hesap izi (B10) — kabul testi 3', () => {
  const dekontlar = [
    { tarih: '2026-01-10', tutar: 60000, haricMi: false },
    { tarih: '2026-02-10', tutar: 40000, haricMi: false },
    { tarih: '2026-02-11', tutar: 2500, haricMi: true }, // ekspertiz
  ]
  it('dekont toplamı × rücu oranı = asıl alacak; hariç ödeme toplama girmez', () => {
    const iz = rucuHesapIzi({ dekontlar, rucuOrani: '% 50', hugoRucuTutari: 50000 })
    expect(iz).toMatchObject({ dekontSayisi: 2, dekontToplami: 100000, haricToplam: 2500, oran: 0.5, asilAlacak: 50000, fark: 0, tutarli: true, durdu: null })
    expect(iz.adimlar.map((a) => a.etiket)).toEqual(['Dekont toplamı', 'Rücu oranı', 'Asıl alacak', 'Hugo rücu tutarı'])
  })
  it('Hugo tutarıyla fark gösterilir', () => {
    const iz = rucuHesapIzi({ dekontlar, rucuOrani: '50', hugoRucuTutari: 52000 })
    expect(iz).toMatchObject({ asilAlacak: 50000, fark: 2000, tutarli: false })
  })
  it('sovtaj, muafiyet ve kusur K1 teyidine kadar formüle girmez, "dahil edilmedi" satırıdır', () => {
    const iz = rucuHesapIzi({ dekontlar, rucuOrani: '%100', hugoRucuTutari: null, sovtaj: 5000, muafiyet: 1000, kusurOrani: '%75' })
    expect(iz.asilAlacak).toBe(100000)
    expect(iz.dahilEdilmeyen.map((d) => d.etiket)).toEqual(['Sovtaj', 'Muafiyet', 'Kusur oranı'])
    expect(iz.formulSurumu).toContain('K1')
  })
  it('rücu oranı belirsiz ya da yoksa, ödeme yoksa hesap DURUR', () => {
    expect(rucuHesapIzi({ dekontlar, rucuOrani: '1', hugoRucuTutari: null })).toMatchObject({ asilAlacak: null, durdu: expect.stringContaining('okunamadı') })
    expect(rucuHesapIzi({ dekontlar, rucuOrani: null, hugoRucuTutari: null }).durdu).toContain('Rücu oranı yok')
    expect(rucuHesapIzi({ dekontlar: [], rucuOrani: '%50', hugoRucuTutari: null }).durdu).toContain('ödeme')
  })
  it('oran biçimleri', () => {
    expect(rucuOraniCoz('% 100')).toBe(1)
    expect(rucuOraniCoz('%50')).toBe(0.5)
    expect(rucuOraniCoz('75')).toBe(0.75)
    expect(rucuOraniCoz('0,25')).toBe(0.25)
    expect(rucuOraniCoz('1/2')).toBe(0.5)
    expect(rucuOraniCoz('1')).toBeNull()
    expect(rucuOraniCoz('%150')).toBeNull()
  })
  it('onaydan sonra hesap değişirse onay geçersiz', () => {
    expect(hesapIziHalaGecerli(50000, 50000)).toBe(true)
    expect(hesapIziHalaGecerli(50000, 51000)).toBe(false)
    expect(hesapIziHalaGecerli(null, 50000)).toBe(false)
  })
})

describe('işlemiş faiz — oran tablosu kapsamı (B26)', () => {
  const temel = { anapara: 100000, islemisFaizElle: null, dekontlar: [{ tarih: '2025-01-01', tutar: 100000, haricMi: false }], faizBaslangic: null, faizBitis: '2026-01-01', oranlar: ORANLAR, bugun: '2026-09-27' }
  it('kapsanan dönemde dönemsel oranla hesaplar (başlangıç = son ödeme, ihtiyatlı)', () => {
    const r = takipAlacakHesapla(temel)
    expect(r.kaynak).toBe('HESAP')
    expect(r.faizBaslangic).toBe('2025-01-01')
    // 2025-01-01 → 2025-06-01: 151 gün %24; 2025-06-01 → 2026-01-01: 214 gün %30
    const beklenen = Math.round((100000 * 0.24 * 151 / 365 + 100000 * 0.30 * 214 / 365) * 100) / 100
    expect(r.islemisFaiz).toBe(beklenen)
    expect(r.toplam).toBe(Math.round((100000 + beklenen) * 100) / 100)
  })
  it('oran tablosu başlangıcı kapsamıyorsa hesap DURUR ve sebebini söyler', () => {
    const r = takipAlacakHesapla({ ...temel, faizBaslangic: '2023-06-01' })
    expect(r.islemisFaiz).toBeNull()
    expect(r.uyari).toContain('oran tablosu bu dönemi kapsamıyor')
    expect(oranKapsami(ORANLAR, '2023-12-31')).toEqual({ ok: false, enEski: '2024-01-01' })
    expect(takipAlacakHesapla({ ...temel, oranlar: [] }).uyari).toContain('boş')
  })
  it('elle girilen işlemiş faiz önceliklidir', () => {
    expect(takipAlacakHesapla({ ...temel, islemisFaizElle: 1234.567 })).toMatchObject({ islemisFaiz: 1234.57, toplam: 101234.57, kaynak: 'ELLE' })
  })
  it('bitiş yoksa bugün (İstanbul günü) kullanılır', () => {
    expect(takipAlacakHesapla({ ...temel, faizBitis: null }).faizBitis).toBe('2026-09-27')
  })
})

describe('kilit ve sürüm', () => {
  it('takip talebi yoksa kilitli; faiz + hesap izi + asıl alacak tamamsa açık', () => {
    expect(takipTalebiKilitSebepleri(null)).toHaveLength(2)
    expect(takipTalebiKilitSebepleri({ ...YASAL_HER, asilAlacak: 50000, hesapIziOnayli: false, dondurulduAt: null })).toEqual(['Rücu tutarı hesap izi onaylanmadı'])
    expect(takipTalebiKilitSebepleri({ ...YASAL_HER, faizTuru: null, asilAlacak: 50000, hesapIziOnayli: true, dondurulduAt: null })).toEqual(['Faiz türü seçilmedi'])
    expect(takipTalebiKilitSebepleri({ ...YASAL_HER, asilAlacak: 0, hesapIziOnayli: true, dondurulduAt: null })).toEqual(['Asıl alacak yok'])
    expect(takipTalebiKilitSebepleri({ ...YASAL_HER, asilAlacak: 50000, hesapIziOnayli: true, dondurulduAt: null })).toEqual([])
  })
  it('değişmez kayıt: yoksa oluştur, taslağı güncelle, dondurulmuşa yeni sürüm', () => {
    expect(surumKarari(null)).toBe('OLUSTUR')
    expect(surumKarari({ dondurulduAt: null })).toBe('GUNCELLE')
    expect(surumKarari({ dondurulduAt: new Date() })).toBe('YENI_SURUM')
  })
})
