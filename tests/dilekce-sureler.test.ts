import { describe, expect, it } from 'vitest'
import { dilekceSureleriniHazirla } from '@/lib/konsrucu/dilekce-sureler'

const simdi = new Date('2026-09-20T22:30:00Z') // İstanbul: 21 Eylül 01.30

describe('dilekçe çalışma alanı — kayıtlı tarihler', () => {
  it('İstanbul gece sınırında bugünü doğru gösterir; hukuki son gün üretmez', () => {
    const sonuc = dilekceSureleriniHazirla({
      etkinlikler: [{ id: 'durusma', tur: 'DURUSMA', baslik: 'Duruşma', baslar: new Date('2026-09-21T09:00:00Z'), durum: 'PLANLANDI' }],
    }, simdi)
    expect(sonuc.kayitlar[0]).toMatchObject({ durum: 'BUGUN', kalanGun: 0, tarihEtiketi: 'Kayıtlı tarih' })
  })

  it('gecikmiş, bugün, tarihsiz, yakın ve sonraki işleri sıralar', () => {
    const sonuc = dilekceSureleriniHazirla({
      gorevler: [
        { id: 'sonra', baslik: 'Sonra', sonTarih: '2026-10-02', durum: 'ACIK' },
        { id: 'eksik', baslik: 'Tarih belirle', sonTarih: null, durum: 'ACIK' },
        { id: 'bugun', baslik: 'Bugün', sonTarih: '2026-09-21', durum: 'ACIK' },
        { id: 'yakin', baslik: 'Yakında', sonTarih: '2026-09-23', durum: 'ISLEMDE' },
        { id: 'gecikmis', baslik: 'Gecikti', sonTarih: '2026-09-20', durum: 'ACIK' },
      ],
    }, simdi)
    expect(sonuc.kayitlar.map((k) => k.id)).toEqual(['gecikmis', 'bugun', 'eksik', 'yakin', 'sonra'])
    expect(sonuc.kayitlar.map((k) => k.durum)).toEqual(['GECIKMIS', 'BUGUN', 'TARIH_EKSIK', 'YAKLASAN', 'PLANLI'])
  })

  it('haciz görevinin erken uyarısını hukuki son tarih olarak göstermez', () => {
    const sonuc = dilekceSureleriniHazirla({
      gorevler: [{ id: 'haciz', baslik: 'Haciz isteme süresi (İİK m.78): son gün 21.10.2026', sonTarih: '2026-09-21', durum: 'ACIK', aciklama: '30 gün önce hatırlatma' }],
    }, simdi)
    expect(sonuc.kayitlar[0]).toMatchObject({ tarihEtiketi: 'Hatırlatma tarihi', tarih: '2026-09-21T00:00:00.000Z', aciklama: '30 gün önce hatırlatma' })
  })

  it('tamamlanmış, iptal ve ertelenmiş kayıtları aktif iş gibi göstermez', () => {
    const sonuc = dilekceSureleriniHazirla({
      gorevler: [{ id: 'g', baslik: 'Bitti', sonTarih: '2026-09-20', durum: 'TAMAMLANDI' }],
      onemliOlaylar: [{ id: 'o', baslik: 'İptal', sonTarih: '2026-09-20', durum: 'IPTAL' }],
      etkinlikler: [{ id: 'e', tur: 'DURUSMA', baslik: 'Ertelendi', baslar: '2026-09-20', durum: 'ERTELENDI' }],
    }, simdi)
    expect(sonuc.kayitlar).toEqual([])
  })

  it('geçersiz tarih veya kaynak yokluğunu gizlemez; boş olay başlığına ad verir', () => {
    const sonuc = dilekceSureleriniHazirla({
      onemliOlaylar: [
        { id: 'belgesiz', baslik: null, sonTarih: 'gecersiz', durum: 'ACIK' },
        { id: 'belgeli', baslik: 'Bilirkişi raporu', sonTarih: '2026-09-28', durum: 'ACIK', kaynakBelgeId: 'belge-1' },
      ],
    }, simdi)
    expect(sonuc.kayitlar[0]).toMatchObject({ baslik: 'Önemli olay', tarih: null, durum: 'TARIH_EKSIK', kaynakEksik: true })
    expect(sonuc.kayitlar[1]).toMatchObject({ kaynakEksik: false, durum: 'YAKLASAN', kalanGun: 7 })
  })

  it('aynı öncelikte en erken tarihi önce gösterir ve girdi dizisini değiştirmez', () => {
    const gorevler = [
      { id: 'yarin', baslik: 'Yarın', sonTarih: '2026-09-22', durum: 'ACIK' },
      { id: 'ucgun', baslik: 'Üç gün', sonTarih: '2026-09-24', durum: 'ACIK' },
    ].reverse()
    const sonuc = dilekceSureleriniHazirla({ gorevler }, simdi)
    expect(sonuc.kayitlar.map((k) => k.id)).toEqual(['yarin', 'ucgun'])
    expect(gorevler.map((k) => k.id)).toEqual(['ucgun', 'yarin'])
  })
})

describe('UYAP verisinin güncelliği', () => {
  it('hiç senkron olmayan veya tarihi bozuk dosyayı güncel saymaz', () => {
    expect(dilekceSureleriniHazirla({}, simdi).uyap.durum).toBe('HIC_YOK')
    expect(dilekceSureleriniHazirla({ uyapSenkronAt: 'bozuk' }, simdi).uyap.durum).toBe('HIC_YOK')
  })

  it('24 saati aşan senkronu eski sayar; takvim günü değişimini kullanmaz', () => {
    expect(dilekceSureleriniHazirla({ uyapSenkronAt: '2026-09-19T22:29:59Z' }, simdi).uyap.durum).toBe('ESKI')
    expect(dilekceSureleriniHazirla({ uyapSenkronAt: '2026-09-19T22:30:00Z' }, simdi).uyap.durum).toBe('GUNCEL')
  })

  it('yakın tarihli olsa bile başarısız eşleşmeyi güncel saymaz', () => {
    const sonuc = dilekceSureleriniHazirla({ uyapSenkronAt: simdi, uyapEslesme: 'BULUNAMADI' }, simdi)
    expect(sonuc.uyap.durum).toBe('ESLESME_SORUNU')
  })
})
