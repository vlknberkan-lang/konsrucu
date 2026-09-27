import { describe, expect, it } from 'vitest'
import { calismayiOku, calismayiSakla, calismayiSil, kurtarmaIleBaslat, type TaslakKaydi } from '../components/dilekceler/dilekce-kurtarma'

const taslak: TaslakKaydi = { id: 'taslak-a', icerik: 'İlk metin', durum: 'TASLAK', createdAt: '2026-09-21T08:00:00.000Z' }

describe('Dilekçe için yalnız bellekte çalışma kurtarma', () => {
  it('başka dosyaya gidip dönüldüğünde doğru dosyanın değişikliğini geri getirir', () => {
    calismayiSakla('dosya-a', taslak, 'A dosyasındaki değişiklik')
    calismayiSakla('dosya-b', { ...taslak, id: 'taslak-b' }, 'B dosyasındaki değişiklik')
    const a = kurtarmaIleBaslat([taslak], calismayiOku('dosya-a'))
    const b = kurtarmaIleBaslat([], calismayiOku('dosya-b'))
    expect(a).toMatchObject({ seciliId: 'taslak-a', metin: 'A dosyasındaki değişiklik', kurtarildi: true })
    expect(b).toMatchObject({ seciliId: 'taslak-b', metin: 'B dosyasındaki değişiklik', kurtarildi: true })
    calismayiSil('dosya-a')
    calismayiSil('dosya-b')
  })

  it('sunucudaki metin değişse bile eski baz metnini saklayarak çakışmayı gizlemez', () => {
    calismayiSakla('cakisma', taslak, 'Yerel değişiklik')
    const sonuc = kurtarmaIleBaslat([{ ...taslak, icerik: 'Başka kullanıcının yeni metni', durum: 'IMZAYA_GIDEN' }], calismayiOku('cakisma'))
    expect(sonuc.taslaklar[0].icerik).toBe('İlk metin')
    expect(sonuc.taslaklar[0].durum).toBe('IMZAYA_GIDEN')
    expect(sonuc.metin).toBe('Yerel değişiklik')
    calismayiSil('cakisma')
  })

  it('sonradan gönderilen kaydın salt okunur durumunu korur', () => {
    calismayiSakla('gonderilmis', taslak, 'Gönderilmeden önceki yerel değişiklik')
    const sonuc = kurtarmaIleBaslat([{ ...taslak, durum: 'GONDERILDI' }], calismayiOku('gonderilmis'))
    expect(sonuc.taslaklar[0].durum).toBe('GONDERILDI')
    expect(sonuc.metin).toBe('Gönderilmeden önceki yerel değişiklik')
    calismayiSil('gonderilmis')
  })

  it('değişiklik geri alındığında veya açıkça silindiğinde kurtarma metnini kaldırır', () => {
    calismayiSakla('temiz', taslak, 'Değişiklik')
    calismayiSakla('temiz', taslak, taslak.icerik!)
    expect(calismayiOku('temiz')).toBeUndefined()
    calismayiSakla('temiz', taslak, 'İkinci değişiklik')
    calismayiSil('temiz')
    expect(calismayiOku('temiz')).toBeUndefined()
  })

  it('kurtarılan kayıt son listeye girmese de metni korur ve kopyası belleği değiştirmez', () => {
    calismayiSakla('eski', taslak, 'Kaybolmaması gereken metin')
    const kopya = calismayiOku('eski')!
    kopya.taslak.icerik = 'Dışarıdan değişiklik'
    const sonuc = kurtarmaIleBaslat([], calismayiOku('eski'))
    expect(sonuc.taslaklar[0].icerik).toBe('İlk metin')
    expect(sonuc.seciliId).toBe(taslak.id)
    expect(sonuc.metin).toBe('Kaybolmaması gereken metin')
    calismayiSil('eski')
  })

  it('önceki ekrandan geç dönen kayıt cevabı daha yeni değişikliği silmez', () => {
    calismayiSakla('bekleyen', taslak, 'İlk kayıt isteği')
    calismayiSakla('bekleyen', taslak, 'Geri dönüldükten sonra yeni değişiklik')
    calismayiSil('bekleyen', { ciktiId: taslak.id, metin: 'İlk kayıt isteği' })
    expect(calismayiOku('bekleyen')?.metin).toBe('Geri dönüldükten sonra yeni değişiklik')
    calismayiSil('bekleyen')
  })
})
