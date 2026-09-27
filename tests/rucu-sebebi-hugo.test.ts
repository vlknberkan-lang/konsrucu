/**
 * S19 · Hugo "Rücu Nedeni" → kod ÖNERİSİ eşleme tablosu (B05). Girdiler kurgusal serbest metinlerdir (gerçek
 * Hugo hücresi değil); kişisel veri yoktur. Kodu avukat seçer; burada yalnız öneri ve adaylar sınanır.
 */
import { describe, expect, it } from 'vitest'
import { hugoRucuNedeniEsle, rucuNedeniNormal } from '@/lib/konsrucu/rucu-sebebi'

describe('normalize anahtar', () => {
  it('Türkçe büyük harf, noktalama ve boşluk birliği', () => {
    expect(rucuNedeniNormal('ALKOLLÜ ARAÇ KULLANIMI')).toBe('alkollu arac kullanimi')
    expect(rucuNedeniNormal('Olay Yerini  Terk / (Kaçma)')).toBe('olay yerini terk kacma')
    expect(rucuNedeniNormal('İHMAL')).toBe('ihmal')
  })
})

describe('ZMSS (branş ZMMS)', () => {
  it.each([
    ['Alkollü araç kullanımı', 'B4_C_ALKOL'],
    ['SÜRÜCÜ ALKOLLÜ (1,20 promil)', 'B4_C_ALKOL'],
    ['Uyuşturucu etkisinde sürüş', 'B4_C_UYUSTURUCU'],
    ['Olay yerini terk', 'B4_F'],
    ['Kaza yerini terk etmiş', 'B4_F'],
    ['Çarpıp kaçma', 'B4_F'],
    ['Ehliyetsiz sürücü', 'B4_B'],
    ['Sürücü belgesi yok', 'B4_B'],
    ['Kasten çarpma', 'B4_A'],
    ['Ağır kusur', 'B4_A'],
    ['Aşırı yük taşıma', 'B4_CC'],
    ['Araç çalıntı', 'B4_E'],
    ['B.1 yükümlülüklerinin ihlali', 'B4_D'],
  ])('%s → %s', (ham, kod) => {
    const r = hugoRucuNedeniEsle(ham, 'ZMMS')
    expect(r.kod).toBe(kod)
    expect(r.guven).toBeGreaterThan(0)
    expect(r.gerekce).toContain('Hugo')
  })

  it('"yükümlülük" kısa "yük" ifadesine düşmez (tam kelime)', () => {
    expect(hugoRucuNedeniEsle('Sigortalının yükümlülük ihlali', 'ZMMS').kod).toBe('B4_D')
  })

  it('açık bent atfı (B.4-ç, B4/c uyuşturucu) doğrudan koda gider', () => {
    expect(hugoRucuNedeniEsle('GŞ B.4-ç', 'ZMMS').kod).toBe('B4_CC')
    expect(hugoRucuNedeniEsle('B4/c uyuşturucu', 'ZMMS').kod).toBe('B4_C_UYUSTURUCU')
    expect(hugoRucuNedeniEsle('B.4/f', 'ZMMS')).toMatchObject({ kod: 'B4_F', eslesen: 'B.4/f' })
  })

  it('hizmet kusuru ZMSS\'de kod önermez (kasko halefiyeti hâlidir)', () => {
    expect(hugoRucuNedeniEsle('Hizmet kusuru', 'ZMMS').kod).toBeNull()
  })
})

describe('Kasko (branş KASKO)', () => {
  it.each([
    ['Hizmet kusuru', 'KASKO_HIZMET_KUSURU'],
    ['Yol kusuru (çukur)', 'KASKO_HIZMET_KUSURU'],
    ['KGM', 'KASKO_HIZMET_KUSURU'],
    ['Belediye yol bakım', 'KASKO_HIZMET_KUSURU'],
    ['YİD otoyol işletmecisi', 'KASKO_YID'],
    ['Karşı araç kusurlu', 'KASKO_HALEFIYET'],
    // B05: kaskoda "çarpıp kaçma" ya da alkol KARŞI ARACIN durumudur → halefiyet, ZMSS terk bloğu değil
    ['Çarpıp kaçma', 'KASKO_HALEFIYET'],
    ['Karşı sürücü alkollü', 'KASKO_HALEFIYET'],
  ])('%s → %s', (ham, kod) => {
    expect(hugoRucuNedeniEsle(ham, 'KASKO').kod).toBe(kod)
  })

  it('kasko dosyasında ZMSS bent atfı tek kod olarak önerilmez; aday olur', () => {
    const r = hugoRucuNedeniEsle('B.4-c', 'KASKO')
    expect(r.kod).toBeNull()
    expect(r.adaylar).toEqual(['B4_C_ALKOL'])
  })
})

describe('branş bilinmiyor ya da eşleşme yok', () => {
  it('branşa göre farklı koda giden ifade: kod yok, iki aday', () => {
    const r = hugoRucuNedeniEsle('Alkollü', null)
    expect(r.kod).toBeNull()
    expect(r.adaylar).toEqual(['B4_C_ALKOL', 'KASKO_HALEFIYET'])
    expect(r.gerekce).toMatch(/branşı bilinmiyor/)
  })

  it('tek adaylı ifade de branş onaylanmadan tek kod olmaz', () => {
    const r = hugoRucuNedeniEsle('Hizmet kusuru', undefined)
    expect(r.kod).toBeNull()
    expect(r.adaylar).toEqual(['KASKO_HIZMET_KUSURU'])
  })

  it('boş ya da tanınmayan metin öneri üretmez', () => {
    expect(hugoRucuNedeniEsle('', 'ZMMS')).toMatchObject({ kod: null, adaylar: [] })
    expect(hugoRucuNedeniEsle(null, 'KASKO')).toMatchObject({ kod: null, adaylar: [] })
    expect(hugoRucuNedeniEsle('Diğer', 'ZMMS')).toMatchObject({ kod: null, adaylar: [] })
  })
})
