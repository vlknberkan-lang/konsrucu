/** Faiz hesabı regresyonları — dönemsel oran, dekont yardımcıları. Takip tutarını doğrudan belirler. */
import { describe, it, expect } from 'vitest'
import { faizHesapla, odenenToplam, sonDekontTarihi, oranlariOku, type DekontGirdi } from '@/lib/konsrucu/faiz'

const ORANLAR = [
  { baslangic: '2024-01-01', oran: 24 },
  { baslangic: '2025-06-01', oran: 30 },
]

describe('faizHesapla', () => {
  it('tek dönem: anapara × oran × gün/365', () => {
    const r = faizHesapla(100_000, new Date('2024-03-01T00:00:00'), new Date('2024-03-31T00:00:00'), ORANLAR)
    expect(r).not.toBeNull()
    expect(r!.gun).toBe(30)
    expect(r!.faiz).toBeCloseTo(100_000 * 0.24 * (30 / 365), 2)
    expect(r!.toplam).toBeCloseTo(100_000 + r!.faiz, 2)
  })
  it('oran değişimi dönemi böler (24% → 30%)', () => {
    const r = faizHesapla(100_000, new Date('2025-05-01T00:00:00'), new Date('2025-07-01T00:00:00'), ORANLAR)
    expect(r).not.toBeNull()
    expect(r!.detay.length).toBe(2)
    expect(r!.detay[0].oran).toBe(24)
    expect(r!.detay[1].oran).toBe(30)
    const beklenen = 100_000 * 0.24 * (31 / 365) + 100_000 * 0.30 * (30 / 365)
    expect(r!.faiz).toBeCloseTo(beklenen, 1)
  })
  it('geçersiz girdi null döner', () => {
    expect(faizHesapla(0, new Date('2025-01-01'), new Date('2025-02-01'), ORANLAR)).toBeNull()
    expect(faizHesapla(1000, new Date('2025-02-01'), new Date('2025-01-01'), ORANLAR)).toBeNull()
    expect(faizHesapla(1000, new Date('2025-01-01'), new Date('2025-02-01'), [])).toBeNull()
  })
})

describe('dekont yardımcıları', () => {
  const dekontlar: DekontGirdi[] = [
    { tarih: '2025-03-10', tutar: 50_000, haricMi: false },
    { tarih: '2025-05-20', tutar: 30_000, haricMi: false },
    { tarih: '2025-06-01', tutar: 5_000, haricMi: true }, // ekspertiz — anapara/faiz DIŞI
  ]
  it('odenenToplam ekspertizi saymaz', () => {
    expect(odenenToplam(dekontlar)).toBe(80_000)
  })
  it('sonDekontTarihi = ekspertiz hariç en geç dekont (faiz başlangıcı)', () => {
    expect(sonDekontTarihi(dekontlar)).toBe('2025-05-20') // 2025-06-01 hariç (ekspertiz)
  })
  it('oranlariOku bozuk kayıtları süzer', () => {
    const r = oranlariOku({ oranlar: [{ baslangic: '2024-01-01', oran: 24 }, { baslangic: 'bozuk', oran: 9 }, { baslangic: '2025-01-01', oran: 'x' }] })
    expect(r).toEqual([{ baslangic: '2024-01-01', oran: 24 }])
  })
})
