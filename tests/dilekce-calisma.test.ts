import { describe, expect, it } from 'vitest'
import { calismaBaglami, taslakKaydetGirdi, taslakUretGirdi } from '@/lib/konsrucu/dilekce-calisma'

describe('dilekçe çalışma alanının kaynak ve giriş sınırları', () => {
  it('gönderildi durumunu ve aşırı uzun kullanıcı girdisini kabul etmez', () => {
    expect(taslakKaydetGirdi.safeParse({ ciktiId: '00000000-0000-4000-8000-000000000001', icerik: 'Dilekçe', beklenenIcerik: '', durum: 'GONDERILDI' }).success).toBe(false)
    expect(taslakUretGirdi.safeParse({ dosyaId: '00000000-0000-4000-8000-000000000001', tur: 'CEVAP', talimat: 'a'.repeat(8001) }).success).toBe(false)
  })

  it('sadece metni modele verilen belgeleri kaynak bağlantısına alır; okunmamış evrakı bildirir', () => {
    const sonuc = calismaBaglami({
      kunye: { esas: '2026/123' },
      belgeler: [
        { id: 'okunan', ad: 'UYAP bilirkişi raporu.pdf', metin: 'Raporda değer kaybı 5000 TL olarak belirtilmiştir.' },
        { id: 'taranmis', ad: 'Taranmış ek.pdf', metin: null },
      ],
      gecmis: [{ tur: 'NOT', tarih: '2026-09-20', metin: 'Rapordaki araç plakası hatalı.' }],
    })
    expect(sonuc.belgeIds).toEqual(['okunan'])
    expect(sonuc.metin).toContain('Rapordaki araç plakası hatalı.')
    expect(sonuc.metin).toContain('Raporda değer kaybı 5000 TL')
    expect(sonuc.uyarilar.some((u) => u.includes('metni okunamayan'))).toBe(true)
  })

  it('çok büyük evrakta bağlamı sınırlar ve eksiksiz okumuş gibi davranmaz', () => {
    const sonuc = calismaBaglami({
      kunye: {}, gecmis: [],
      belgeler: Array.from({ length: 100 }, (_, i) => ({ id: `belge-${i}`, ad: `Evrak ${i}`, metin: 'a'.repeat(20000) })),
    })
    expect(sonuc.metin.length).toBeLessThan(90000)
    expect(sonuc.belgeIds.length).toBeLessThan(100)
    expect(sonuc.uyarilar.some((u) => u.includes('kısalt'))).toBe(true)
  })
})
