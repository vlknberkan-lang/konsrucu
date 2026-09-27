/**
 * S18 · alıntı doğrulama (B37 "kaynak izi gerçek değil"): alıntı sayfa metninde normalize edilerek aranır;
 * bulunamazsa "kaynaksız". Sayfa metinleri kurgusaldır.
 */
import { describe, expect, it } from 'vitest'
import { alintiDogrula, alintiDogruDegeri, alintiKatla, alintiKisalt, sayfaIndeksi, ALINTI_AZAMI } from '@/lib/konsrucu/oneri/alinti'

const SAYFALAR = [
  { belgeId: 'b-police', sayfaNo: 1, metin: 'KASKO SİGORTA POLİÇESİ\nPoliçe No: KRG-2026-000123\nTanzim Tarihi: 02.01.2026' },
  { belgeId: 'b-police', sayfaNo: 2, metin: 'Özel şartlar: ikame araç yoktur.\nSigorta Ettiren: Kurgusal Ltd.' },
  { belgeId: 'b-ktt', sayfaNo: 1, metin: 'KAZA TESPİT TUTA-\nNAĞI\nKaza Tarihi ve Saati: 14.03.2026 14:30' },
]

describe('alintiKatla', () => {
  it('Türkçe harf, büyük/küçük harf, tırnak ve satır sonu tirelemesi birleşir', () => {
    expect(alintiKatla('POLİÇE “No”')).toBe(alintiKatla('police "no"'))
    expect(alintiKatla('TUTA-\nNAĞI')).toBe('tutanagi')
    expect(alintiKatla('a­b   c')).toBe('ab c')
  })
})

describe('alintiDogrula', () => {
  it('alıntı yoksa YOK (alintiDogru = null)', () => {
    const s = alintiDogrula('', SAYFALAR, { belgeId: 'b-police', sayfa: 1 })
    expect(s.durum).toBe('YOK')
    expect(alintiDogruDegeri(s)).toBeNull()
  })

  it('gösterilen sayfada birebir (normalize) bulunursa DOĞRU', () => {
    const s = alintiDogrula('poliçe no: krg-2026-000123', SAYFALAR, { belgeId: 'b-police', sayfa: 1 })
    expect(s).toEqual({ durum: 'DOGRU', belgeId: 'b-police', sayfa: 1, yerDuzeltildi: false })
    expect(alintiDogruDegeri(s)).toBe(true)
  })

  it('OCR farkı (ASCII) ve tireleme ile de bulunur', () => {
    expect(alintiDogrula('KAZA TESPIT TUTANAGI', SAYFALAR, { belgeId: 'b-ktt', sayfa: 1 }).durum).toBe('DOGRU')
  })

  it('aynı belgenin başka sayfasındaysa yer düzeltilir', () => {
    const s = alintiDogrula('Sigorta Ettiren: Kurgusal Ltd.', SAYFALAR, { belgeId: 'b-police', sayfa: 1 })
    expect(s).toEqual({ durum: 'DOGRU', belgeId: 'b-police', sayfa: 2, yerDuzeltildi: true })
  })

  it('belgede olmayan alıntı KAYNAKSIZ (alintiDogru = false)', () => {
    const s = alintiDogrula('Kusur oranı %100 karşı araçtadır', SAYFALAR, { belgeId: 'b-ktt', sayfa: 1 })
    expect(s.durum).toBe('BULUNAMADI')
    expect(alintiDogruDegeri(s)).toBe(false)
  })

  it('kısa alıntı yalnız gösterilen sayfada aranır (rastlantısal eşleşme kaynak sayılmaz)', () => {
    expect(alintiDogrula('14:30', SAYFALAR, { belgeId: 'b-ktt', sayfa: 1 }).durum).toBe('DOGRU')
    expect(alintiDogrula('14:30', SAYFALAR, { belgeId: 'b-police', sayfa: 1 }).durum).toBe('BULUNAMADI')
  })

  it('önceden katlanmış indeksle aynı sonuç', () => {
    const idx = sayfaIndeksi(SAYFALAR)
    expect(alintiDogrula('Tanzim Tarihi: 02.01.2026', idx, { belgeId: 'b-police', sayfa: 1 }).durum).toBe('DOGRU')
  })

  it('alıntı en çok 300 karakter saklanır', () => {
    expect(alintiKisalt('x'.repeat(400))).toHaveLength(ALINTI_AZAMI)
    expect(alintiKisalt('   ')).toBeNull()
  })
})
