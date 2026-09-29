/**
 * Görsel okuma (lib/konsrucu/evrak-metin/ai-okuma-cozum.ts): modelin düz metin yanıtını çözme ve özet cümlesi.
 * Kurgusal yanıtlar.
 */
import { describe, expect, it } from 'vitest'
import { ayirmaYanitCoz, gorselOkumaMetni, gorselYanitCoz, METINSIZ_TURLER, OKUMA_SISTEMI, TUR_KATEGORI, type GorselOkumaOzeti } from '@/lib/konsrucu/evrak-metin/ai-okuma-cozum'

describe('gorselYanitCoz', () => {
  it('tür, güven ve metni ayırır (el yazısı döküm çok satırlı kalır)', () => {
    const r = gorselYanitCoz('TUR: TUTANAK\nGUVEN: 0.93\n---\nA ARACI\nSürücü adı soyadı: Kurgu KİŞİ\nPlaka: 34 KRG 001\n\nB ARACI\nBeyan: arkadan çarptı [?]')
    expect(r).toEqual({ tur: 'TUTANAK', guven: 0.93, metin: 'A ARACI\nSürücü adı soyadı: Kurgu KİŞİ\nPlaka: 34 KRG 001\n\nB ARACI\nBeyan: arkadan çarptı [?]' })
  })

  it('Türkçe harfli etiket, virgüllü ve yüzdelik güven, CRLF', () => {
    expect(gorselYanitCoz('TÜR: Ekspertiz\r\nGÜVEN: 0,8\r\n---\r\nRapor No: 1')).toEqual({ tur: 'EKSPERTIZ', guven: 0.8, metin: 'Rapor No: 1' })
    expect(gorselYanitCoz('TUR: POLICE\nGUVEN: 85\n---\nx')?.guven).toBe(0.85)
  })

  it('metin yazılmayan türde metin boş; bilinmeyen tür DIGER; güven yoksa 0.5', () => {
    expect(gorselYanitCoz('TUR: KIMLIK\nGUVEN: 0.99\n---\n')).toEqual({ tur: 'KIMLIK', guven: 0.99, metin: '' })
    expect(gorselYanitCoz('TUR: MAKTUP\n---\nbir şey')).toEqual({ tur: 'DIGER', guven: 0.5, metin: 'bir şey' })
  })

  it('biçim tutmazsa null', () => {
    expect(gorselYanitCoz('Bu bir kaza tutanağıdır.')).toBeNull()
    expect(gorselYanitCoz('')).toBeNull()
    expect(gorselYanitCoz(null)).toBeNull()
  })

  it('kimlik Diğer kategorisine düşer; talimat metin yazılmayacak türleri sayar', () => {
    expect(TUR_KATEGORI.KIMLIK).toBe('DIGER')
    expect(TUR_KATEGORI.HASAR_FOTO).toBe('HASAR_FOTO')
    expect(OKUMA_SISTEMI).toContain('EHLIYET, RUHSAT, ALKOL, KIMLIK ya da HASAR_FOTO ise METİN YAZMA')
  })
})

describe('ayirmaYanitCoz', () => {
  it('numaralı satırları sırayla türe çevirir; eksik ve bilinmeyen null', () => {
    expect(ayirmaYanitCoz('#0: HASAR_FOTO\n#1: TUTANAK\n#3: MEKTUP\n#2: **Ehliyet**', 5)).toEqual(['HASAR_FOTO', 'TUTANAK', 'EHLIYET', null, null])
  })
  it('aralık dışı numara ve boş yanıt', () => {
    expect(ayirmaYanitCoz('#9: POLICE', 2)).toEqual([null, null])
    expect(ayirmaYanitCoz(null, 1)).toEqual([null])
  })
  it('kişisel/sağlık belgesi ve fotoğraf metne çevrilmez', () => {
    expect([...METINSIZ_TURLER].sort()).toEqual(['ALKOL', 'EHLIYET', 'HASAR_FOTO', 'KIMLIK', 'RUHSAT'])
  })
})

describe('gorselOkumaMetni', () => {
  const g = (o: Partial<GorselOkumaOzeti>): GorselOkumaOzeti => ({ durum: 'TAMAM', bakilan: 0, okunan: 0, tutanak: 0, fotoAyrilan: 0, kvkkAtlanan: 0, hatali: 0, kalan: 0, hata: null, ...o })

  it('okuma olmadıysa boş', () => {
    expect(gorselOkumaMetni(null)).toBe('')
    expect(gorselOkumaMetni(g({ durum: 'KAPALI' }))).toBe('')
    expect(gorselOkumaMetni(g({ durum: 'YOK' }))).toBe('')
  })

  it('sayıları tek cümlede söyler', () => {
    expect(gorselOkumaMetni(g({ bakilan: 20, okunan: 3, tutanak: 1, fotoAyrilan: 15, kvkkAtlanan: 1, kalan: 2 }))).toBe(
      '20 görüntüye bakıldı, 3 taranmış belge görsel yapay zekâyla okundu (1 tutanak), 15 görüntü hasar fotoğrafı çıktı, 1 kimlik/sağlık belgesinin metni KVKK gereği yazılmadı, 2 belge sırada (tekrar çalıştırın)',
    )
  })
})
