import { describe, expect, it } from 'vitest'
import { iskeletSec, sablonKaynagi, sablonKaynagiYaz, type SablonKaydi } from '@/lib/konsrucu/dilekce-v2/iskelet'
import { sablonAlanlari } from '@/lib/konsrucu/dilekce-v2/sablon-dil'

// Kurgusal şablon satırları (gerçek dosya no / kişi yok). `bloklarJson` composer'ın beklediği { kaynak } biçimindedir.
const sablon = (ez: Partial<SablonKaydi>): SablonKaydi => ({
  id: 's-1', tur: 'DAVA', kod: 'kod-1', surum: 1, varyantJson: {}, bloklarJson: sablonKaynagiYaz('{{! [B01] SABİT }}Merhaba {{ad}}'),
  aktif: true, onayAt: '2026-01-01T00:00:00.000Z', ...ez,
})

describe('iskelet seçimi: varsayılana düşme', () => {
  it('hiç şablon yokken (ör. bu müvekkilde hiç onaylı iskelet yok) VARSAYILAN kullanılır ve ayrıştırılabilir', () => {
    for (const tur of ['DAVA', 'DELIL', 'CEVABA_CEVAP', 'BEYAN'] as const) {
      const s = iskeletSec([], tur, {})
      expect(s.kaynak).toBe('VARSAYILAN')
      expect(s.sablonId).toBeNull()
      expect(s.bloklar.length).toBeGreaterThan(1)
      // Her varsayılan iskelette en az bir AI yuvası (AÇIKLAMALAR) olmalı — deterministik olmayan tek bölüm.
      const toplamAiYuvasi = s.bloklar.reduce((n, b) => n + sablonAlanlari(b.dugumler).aiYuvasi, 0)
      expect(toplamAiYuvasi).toBeGreaterThanOrEqual(1)
    }
  })

  it('DAVA varsayılan iskeletinde koddan basılan bloklar (taraflar, değer, ekler, sonuç) yer alır', () => {
    const s = iskeletSec([], 'DAVA', {})
    const idler = s.bloklar.map((b) => b.etiket.id)
    expect(idler).toEqual(expect.arrayContaining(['B02', 'B04', 'B05', 'B06', 'B07', 'B08']))
  })

  it('Ray dosyasından çıkarılan iskelet Zurich sorgusunda hiç görünmez (tenant ayrımı sorgunun kapsamındadır): boş liste her zaman VARSAYILAN döner', () => {
    // "Zurich" server action'ı DilekceSablon'u musteriId'ye göre sorgular; Ray'in kaydı bu listeye hiç girmez.
    const zurichListesi: SablonKaydi[] = [] // Ray'e ait satır bu listede YOK
    const s = iskeletSec(zurichListesi, 'DAVA', {})
    expect(s.kaynak).toBe('VARSAYILAN')
  })
})

describe('iskelet seçimi: onaylı şablon', () => {
  it('aktif + onaylı ve türü uyan şablon seçilir', () => {
    const ray = sablon({ id: 'ray-1', kod: 'ray-dava' })
    const s = iskeletSec([ray], 'DAVA', {})
    expect(s).toMatchObject({ kaynak: 'ONAYLI_SABLON', sablonId: 'ray-1', kod: 'ray-dava' })
  })

  it('onayAt boşsa (yalnız öneri) seçilmez, VARSAYILAN kullanılır', () => {
    const oneri = sablon({ id: 'oneri-1', onayAt: null })
    const s = iskeletSec([oneri], 'DAVA', {})
    expect(s.kaynak).toBe('VARSAYILAN')
  })

  it('pasif (aktif:false) şablon seçilmez', () => {
    const pasif = sablon({ id: 'pasif-1', aktif: false })
    expect(iskeletSec([pasif], 'DAVA', {}).kaynak).toBe('VARSAYILAN')
  })

  it('türü uymayan şablon elenir', () => {
    const delil = sablon({ id: 'delil-1', tur: 'DELIL' })
    expect(iskeletSec([delil], 'DAVA', {}).kaynak).toBe('VARSAYILAN')
  })

  it('bozuk kaynak metni (ayrıştırılamıyor) güvenli biçimde VARSAYILANA düşer, hata fırlatmaz', () => {
    const bozuk = sablon({ id: 'bozuk-1', bloklarJson: sablonKaynagiYaz('{{#a}} kapanmayan koşul') })
    expect(() => iskeletSec([bozuk], 'DAVA', {})).not.toThrow()
    expect(iskeletSec([bozuk], 'DAVA', {}).kaynak).toBe('VARSAYILAN')
  })

  it('varyant puanlaması: daha spesifik (rücu sebebi + mahkeme türü uyan) aday genel adaya tercih edilir', () => {
    const genel = sablon({ id: 'genel', surum: 1, varyantJson: {} })
    const ozel = sablon({ id: 'ozel', surum: 1, varyantJson: { rucuSebebiKod: 'KASKO_HALEFIYET', mahkemeTuru: 'ASLIYE_HUKUK' } })
    const s = iskeletSec([genel, ozel], 'DAVA', { rucuSebebiKod: 'KASKO_HALEFIYET', mahkemeTuru: 'ASLIYE_HUKUK', usul: 'YAZILI' })
    expect(s.sablonId).toBe('ozel')
  })

  it('varyantı isteğe uymayan (çelişen) aday elenir, uymayan alanı boş bırakan genel aday kalır', () => {
    const yanlisVaryant = sablon({ id: 'yanlis', varyantJson: { rucuSebebiKod: 'BASKA_KOD' } })
    const genel = sablon({ id: 'genel-2', varyantJson: {} })
    const s = iskeletSec([yanlisVaryant, genel], 'DAVA', { rucuSebebiKod: 'KASKO_HALEFIYET' })
    expect(s.sablonId).toBe('genel-2')
  })

  it('eşit puanda en yeni sürüm kazanır', () => {
    const eski = sablon({ id: 'eski', surum: 1 })
    const yeni = sablon({ id: 'yeni', surum: 2 })
    expect(iskeletSec([eski, yeni], 'DAVA', {}).sablonId).toBe('yeni')
  })
})

describe('sablonKaynagi', () => {
  it('{ kaynak } dışındaki biçimler null döner (çağıran adayı eler)', () => {
    expect(sablonKaynagi(null)).toBeNull()
    expect(sablonKaynagi('düz metin')).toBeNull()
    expect(sablonKaynagi({ baska: 'x' })).toBeNull()
    expect(sablonKaynagi(sablonKaynagiYaz('{{ad}}'))).toBe('{{ad}}')
  })
})
