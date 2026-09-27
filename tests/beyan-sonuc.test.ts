import { describe, expect, it } from 'vitest'
import { belgeBaglamiKur, HEDEF_BELGE_UST_SINIR, type BaglamBelgesi } from '@/lib/konsrucu/dilekce-v2/belge-baglami'
import { sonucBolumunuCikar } from '@/lib/konsrucu/dilekce-v2/turler/beyan'

// Kurgusal bilirkişi raporu (gerçek kişi, dosya no yok). S39 kabul 4: "Bilirkişi raporunda SONUÇ bölümü son
// sayfada olsa da tam okunur → beyan taslağında SONUÇ'taki kusur oranı yer alır." (06 §5.7-4, B40)

describe('sonucBolumunuCikar (saf fonksiyon, 06 §5.7-4)', () => {
  it('"SONUÇ" başlığından metnin sonuna kadar olan bölümü bulur', () => {
    const metin = `BİLİRKİŞİ RAPORU\n\nGİRİŞ\nDosya incelenmiştir.\n\nİNCELEME VE DEĞERLENDİRME\nOlay yeri incelenmiştir.\n\nSONUÇ\nKusur oranı %30 sigortalı sürücü, %70 karşı araç sürücüsü olarak takdir edilmiştir.`
    const r = sonucBolumunuCikar(metin)
    expect(r.bulunduMu).toBe(true)
    expect(r.baslik).toBe('SONUÇ')
    expect(r.govde).toContain('Kusur oranı %30')
    expect(r.govde.startsWith('SONUÇ')).toBe(true)
  })

  it('"SONUÇ VE KANAAT", "KANAATİMİZ", "NETİCE-İ TALEP" ve "HÜKÜM" başlık varyantlarını tanır', () => {
    expect(sonucBolumunuCikar('GİRİŞ\nmetin\n\nSONUÇ VE KANAAT\nKusur %40.').baslik).toBe('SONUÇ VE KANAAT')
    expect(sonucBolumunuCikar('GİRİŞ\nmetin\n\nKANAATİMİZ\nKusur %40.').baslik).toBe('KANAATİMİZ')
    expect(sonucBolumunuCikar('GİRİŞ\nmetin\n\nNETİCE-İ TALEP\nTakibin devamı talep olunur.').baslik).toBe('NETİCE-İ TALEP')
    expect(sonucBolumunuCikar('GİRİŞ\nmetin\n\nHÜKÜM\nDavanın kabulüne karar verilmiştir.').baslik).toBe('HÜKÜM')
  })

  it('birden çok aday satır varsa metnin SONUNA en yakın olanı esas alır (içindekiler değil, rapor sonu)', () => {
    const metin = `İÇİNDEKİLER\nSONUÇ ....................... 12\n\nGİRİŞ\nmetin\n\nSONUÇ\nGerçek kusur oranı %25 olarak belirlenmiştir.`
    const r = sonucBolumunuCikar(metin)
    expect(r.bulunduMu).toBe(true)
    expect(r.govde).toContain('%25')
    expect(r.govde).not.toContain('İÇİNDEKİLER')
  })

  it('bir cümlenin ortasında geçen "sonuç olarak" ifadesi başlık sayılmaz', () => {
    const metin = 'GİRİŞ\nSonuç olarak inceleme tamamlanmıştır ve rapor sunulmuştur.'
    expect(sonucBolumunuCikar(metin).bulunduMu).toBe(false)
  })

  it('hiç başlık yoksa bulunamaz', () => {
    const r = sonucBolumunuCikar('GİRİŞ\nİNCELEME\nBaşka bir şey yazılmamıştır.')
    expect(r).toEqual({ bulunduMu: false, baslik: null, govde: '', baslangic: null })
  })
})

describe('belgeBaglamiKur: BEYAN hedef belgesinde SONUÇ bölümü kesilmez (B40)', () => {
  const uzunGovde = 'Olay yerinde yapılan inceleme ve dosyadaki belgeler birlikte değerlendirilmiştir. '.repeat(2000) // ~140.000 karakter

  function raporBelgesi(id: string, altTur: string, ad: string): BaglamBelgesi {
    const metin = `BİLİRKİŞİ RAPORU\n\nGİRİŞ VE İNCELEME\n${uzunGovde}\n\nSONUÇ\nKusur oranı %30 sigortalı sürücü, %70 karşı araç sürücüsü olarak takdir edilmiştir.`
    expect(metin.length).toBeGreaterThan(HEDEF_BELGE_UST_SINIR)
    return {
      id, ad, altTur, kategori: 'DIGER', tarih: '2026-05-01', metinDurumu: 'METIN_KATMANI', aiIzni: 'IZINLI',
      metin: { belgeId: id, ad, sayfalar: [{ sayfaNo: null, metin }] },
    }
  }

  it('BEYAN türünde hedef belge (bilirkişi raporu) kısaltılsa da SONUÇ bölümündeki kusur oranı bağlama girer', () => {
    const r = belgeBaglamiKur([raporBelgesi('rapor-1', 'BILIRKISI_RAPORU', 'Bilirkişi raporu.pdf')], 'BEYAN')
    expect(r.kisaltilan).toEqual(['Bilirkişi raporu.pdf'])
    expect(r.secilen).toHaveLength(1)
    expect(r.secilen[0].metin).toContain('Kusur oranı %30 sigortalı sürücü, %70 karşı araç sürücüsü')
  })

  it('hedef belge OLMAYAN aynı uzunluktaki belgede (ör. DAVA türünde) SONUÇ bölümü özel olarak korunmaz', () => {
    const r = belgeBaglamiKur([raporBelgesi('rapor-2', 'BILIRKISI_RAPORU', 'Bilirkişi raporu.pdf')], 'DAVA')
    expect(r.kisaltilan).toEqual(['Bilirkişi raporu.pdf'])
    // DAVA türünde bu belge "hedef" sayılmaz (HEDEF eşlemesi yalnız CEVABA_CEVAP ve BEYAN'da vardır); eski
    // (baştan kısaltma) davranış sürer, metnin sonundaki SONUÇ bölümü bu yolda korunmaz.
    expect(r.secilen[0].metin).not.toContain('Kusur oranı %30')
  })
})
