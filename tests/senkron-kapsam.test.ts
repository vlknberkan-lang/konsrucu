import { describe, expect, it } from 'vitest'
import { senkronKapsamiOku, senkronKapsamKosulu } from '@/lib/konsrucu/senkron-kapsam'

describe('senkron kapsamı', () => {
  it('ortam değişkeni yoksa kapsam yok (eski davranış)', () => {
    expect(senkronKapsamiOku({})).toBeNull()
    expect(senkronKapsamKosulu(null)).toEqual({})
  })

  it('hukuk no listesini boşluk ve boş öğeleri atarak okur', () => {
    const k = senkronKapsamiOku({ UYAP_SENKRON_KAPSAMI: ' 100001, 100002 ,,100003 ' })
    expect(k?.hukukNolar).toEqual(['100001', '100002', '100003'])
    expect(k?.yeniDosyaBaslangic).toBeNull()
    expect(senkronKapsamKosulu(k)).toEqual({ AND: [{ OR: [{ hukukDosyaNo: { in: ['100001', '100002', '100003'] } }] }] })
  })

  it('yeni dosya başlangıç tarihiyle sonradan eklenen dosyaları da kapsar', () => {
    const k = senkronKapsamiOku({ UYAP_SENKRON_KAPSAMI: '100001', UYAP_SENKRON_YENI_DOSYA_BASLANGIC: '2026-09-27T12:00:00Z' })
    expect(senkronKapsamKosulu(k)).toEqual({
      AND: [{ OR: [{ hukukDosyaNo: { in: ['100001'] } }, { createdAt: { gte: new Date('2026-09-27T12:00:00Z') } }] }],
    })
  })

  it('geçersiz tarih yok sayılır; yalnız geçersiz tarih varsa kapsam yok', () => {
    expect(senkronKapsamiOku({ UYAP_SENKRON_YENI_DOSYA_BASLANGIC: 'dün' })).toBeNull()
  })
})
