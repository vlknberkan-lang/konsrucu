/**
 * lib/ai/gorsel-aday.ts — S02: sağlık ve kimlik görselleri hiçbir zaman, öteki görseller KVKK kararına
 * kadar (AI_GORSEL) yapay zekâya gitmez. Kurgusal belge kayıtları (kişisel veri yok).
 */
import { describe, expect, it } from 'vitest'
import { gorselAdaylari, gorselAktiviteMetni, hassasGorselMi } from '@/lib/ai/gorsel-aday'

const b = (kategori: string, dosyaAdi: string, storagePath: string | null = `d1/${dosyaAdi}`) => ({ kategori, dosyaAdi, storagePath })

describe('hassas görsel', () => {
  it('ALKOL, EHLIYET, RUHSAT kategorileri her zaman hassas', () => {
    for (const k of ['ALKOL', 'EHLIYET', 'RUHSAT']) expect(hassasGorselMi(b(k, 'foto.jpg')), k).toBe(true)
  })
  it('yanlış sınıflanmış kimlik/sağlık görseli dosya adından yakalanır', () => {
    for (const ad of ['kimlik_on_yuz.jpg', 'Nüfus Cüzdanı.png', 'alkol raporu.jpeg', 'Promil_olcum.jpg', 'ehliyet arka.jpg', 'ruhsat.png', 'hastane epikriz.jpg', 'Adli Tıp raporu.png']) {
      expect(hassasGorselMi(b('DIGER', ad)), ad).toBe(true)
      expect(hassasGorselMi(b('HASAR_FOTO', ad)), ad).toBe(true)
    }
  })
  it('hasar fotoğrafı ve tutanak görseli hassas değil', () => {
    for (const ad of ['on_tampon.jpg', 'IMG_2024.jpg', 'kaza tespit tutanagi.jpg']) expect(hassasGorselMi(b('HASAR_FOTO', ad)), ad).toBe(false)
  })
})

describe('gorselAdaylari', () => {
  const belgeler = [
    b('ALKOL', 'alkol_raporu.jpg'), // SEN-02 benzeri: kurgusal alkol raporu görseli
    b('HASAR_FOTO', 'on_tampon.jpg'),
    b('TUTANAK', 'tutanak.pdf'), // görsel değil (uzantı yok, kategori HASAR_FOTO değil)
    b('HASAR_FOTO', 'yan.jpg', null), // baytı yok
    b('EHLIYET', 'ehliyet.png'),
  ]
  it('görsel AI kapalı (varsayılan): hiçbir görsel gönderilmez; hassaslar ayrı sayılır', () => {
    const s = gorselAdaylari(belgeler, { gorselAcik: false })
    expect(s.gonderilecek).toEqual([])
    expect(s.hassas.map((x) => x.dosyaAdi)).toEqual(['alkol_raporu.jpg', 'ehliyet.png'])
    expect(s.kapali.map((x) => x.dosyaAdi)).toEqual(['on_tampon.jpg'])
    expect(gorselAktiviteMetni(s)).toBe('0 görsel gönderildi (3 görsel KVKK nedeniyle atlandı)')
  })
  it('görsel AI açık olsa bile sağlık/kimlik görseli gönderilmez', () => {
    const s = gorselAdaylari(belgeler, { gorselAcik: true })
    expect(s.gonderilecek.map((x) => x.dosyaAdi)).toEqual(['on_tampon.jpg'])
    expect(s.hassas).toHaveLength(2)
  })
  it('yalnız alkol raporu görseli olan dosya: "0 görsel gönderildi (1 görsel KVKK nedeniyle atlandı)"', () => {
    expect(gorselAktiviteMetni(gorselAdaylari([b('ALKOL', 'alkol.jpg')], { gorselAcik: false }))).toBe('0 görsel gönderildi (1 görsel KVKK nedeniyle atlandı)')
  })
  it('kategori süzgeci ve üst sınır', () => {
    const s = gorselAdaylari([b('HASAR_FOTO', 'a.jpg'), b('DIGER', 'b.jpg'), b('HASAR_FOTO', 'c.jpg')], { gorselAcik: true, kategoriler: new Set(['HASAR_FOTO']), enFazla: 1 })
    expect(s.gonderilecek.map((x) => x.dosyaAdi)).toEqual(['a.jpg'])
  })
  it('aday yoksa aktivite metni boş', () => {
    expect(gorselAktiviteMetni(gorselAdaylari([b('TUTANAK', 'x.pdf')], { gorselAcik: false }))).toBe('')
  })
})
