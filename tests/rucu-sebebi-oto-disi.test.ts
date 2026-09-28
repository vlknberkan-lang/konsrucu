/**
 * Oto dışı (Brans.OTO_DISI: konut, işyeri, yangın, dahili su…) rücu sebebi kodları (OD_*). Zurich, ZMSS/kasko
 * dışında oto dışı dosyalar da gönderir; bu kodlar Hazırlık ekranında bir seçenek listesi sağlar. Kodu avukat
 * seçer — burada yalnız kod tanımları ve Hugo/Zurich "Rücu Nedeni" öneri eşlemesi sınanır.
 */
import { describe, expect, it } from 'vitest'
import {
  RUCU_SEBEBI_KODLARI, RUCU_SEBEBI_TANIM, bransKodlari, hugoRucuNedeniEsle, kodBransaUygunMu, ttk1472Uygulanir,
} from '@/lib/konsrucu/rucu-sebebi'

const OD_KODLARI = RUCU_SEBEBI_KODLARI.filter((k) => k.startsWith('OD_'))

describe('OD_* kod tanımları', () => {
  it('8 kod var, hepsi brans OTO_DISI, halefiyet true, k1 BEKLIYOR, rejimDuyarli false', () => {
    expect(OD_KODLARI).toHaveLength(8)
    for (const k of OD_KODLARI) {
      const t = RUCU_SEBEBI_TANIM[k]
      expect(t.brans, k).toBe('OTO_DISI')
      expect(t.halefiyet, k).toBe(true)
      expect(t.k1, k).toBe('BEKLIYOR')
      expect(t.rejimDuyarli, k).toBe(false)
      expect(ttk1472Uygulanir(k), k).toBe(true)
    }
  })

  it('her OD_* kodunda TTK m.1472/1 (halefiyet) dayanağı var, birebir etiket ve "teyit gerekli"', () => {
    for (const k of OD_KODLARI) {
      const d = RUCU_SEBEBI_TANIM[k].dayanaklar.find((x) => x.etiket === 'TTK m.1472/1 (halefiyet)')
      expect(d, k).toBeTruthy()
      expect(d?.not, k).toBe('teyit gerekli')
    }
  })

  it('her OD_* dayanağı "teyit gerekli" taşır (modül hiçbir hukuku doğrulanmış saymaz)', () => {
    for (const k of OD_KODLARI) {
      for (const d of RUCU_SEBEBI_TANIM[k].dayanaklar) expect(d.not ?? '', `${k}: ${d.etiket}`).toMatch(/teyit gerekli/)
    }
  })

  it('yalnız OD_DIGER gerekçe ister', () => {
    expect(RUCU_SEBEBI_TANIM.OD_DIGER.gerekceZorunlu).toBe(true)
    for (const k of OD_KODLARI.filter((x) => x !== 'OD_DIGER')) expect(RUCU_SEBEBI_TANIM[k].gerekceZorunlu, k).toBe(false)
  })

  it('KTT hiçbir OD_* asgari setinde yok (trafik kazası değildir)', () => {
    for (const k of OD_KODLARI) expect(RUCU_SEBEBI_TANIM[k].asgariSet, k).not.toContain('KTT')
  })

  it('asgari evrak setleri: temel (POLICE, DEKONT, EKSPERTIZ, OLAY_YERI_FOTO) + koda özgü ek', () => {
    const temel = ['POLICE', 'DEKONT', 'EKSPERTIZ', 'OLAY_YERI_FOTO']
    for (const k of OD_KODLARI) for (const t of temel) expect(RUCU_SEBEBI_TANIM[k].asgariSet, k).toContain(t)
    expect(RUCU_SEBEBI_TANIM.OD_AYIPLI_HIZMET.asgariSet).toEqual([...temel, 'SERVIS_KAYDI'])
    expect(RUCU_SEBEBI_TANIM.OD_AYIPLI_URUN.asgariSet).toEqual([...temel, 'SERVIS_KAYDI', 'TEKNIK_RAPOR'])
    expect(RUCU_SEBEBI_TANIM.OD_KOMSU_SU.asgariSet).toEqual([...temel, 'TESPIT_TUTANAGI'])
    expect(RUCU_SEBEBI_TANIM.OD_YONETIM_ORTAK_ALAN.asgariSet).toEqual([...temel, 'TESPIT_TUTANAGI'])
    expect(RUCU_SEBEBI_TANIM.OD_INSAAT_UCUNCU_KISI.asgariSet).toEqual([...temel, 'TESPIT_TUTANAGI'])
    expect(RUCU_SEBEBI_TANIM.OD_ALTYAPI_ISLETMECI.asgariSet).toEqual([...temel, 'TESPIT_TUTANAGI', 'TEKNIK_RAPOR'])
    expect(RUCU_SEBEBI_TANIM.OD_KIRACI.asgariSet).toEqual(temel)
    expect(RUCU_SEBEBI_TANIM.OD_DIGER.asgariSet).toEqual(temel)
  })

  it('bransKodlari/kodBransaUygunMu OTO_DISI\'yi doğru süzer', () => {
    expect(bransKodlari('OTO_DISI').sort()).toEqual([...OD_KODLARI].sort())
    for (const k of OD_KODLARI) {
      expect(kodBransaUygunMu(k, 'OTO_DISI'), k).toBe(true)
      expect(kodBransaUygunMu(k, 'ZMMS'), k).toBe(false)
      expect(kodBransaUygunMu(k, 'KASKO'), k).toBe(false)
    }
  })
})

describe('Hugo/Zurich "Rücu Nedeni" → OD_* öneri (brans OTO_DISI)', () => {
  // Goal'daki beş Zurich örneği: ana "Rücu Nedeni" hücresi + "Rücu Nedeni Detay" (kaynakJson.aciklama) birleşimi.
  it.each([
    ['Dahili Su(Su Sirayeti)', 'OD_KOMSU_SU'],
    ['Diğer Nedenler Mutfak lavabo dolap içindeki Rain Soft marka su arıtma cihazı musluğu patlaması', 'OD_AYIPLI_HIZMET'],
    ['Diğer Nedenler ELEKTRİK TESİSATINDA MEYDANA GELEN ZARARIN SERVİSE RÜCUSU', 'OD_AYIPLI_HIZMET'],
    ['Diğer Nedenler KARŞI İNŞAATAN ÇALIŞMAKTA OLAN BETON MİKSERİNDEN PARÇA SIÇRAMIŞTIR', 'OD_INSAAT_UCUNCU_KISI'],
    ['Diğer Nedenler APARTMAN YÖNETİMİNE', 'OD_YONETIM_ORTAK_ALAN'],
  ])('%s → %s', (metin, kod) => {
    const r = hugoRucuNedeniEsle(metin, 'OTO_DISI')
    expect(r.kod).toBe(kod)
    expect(r.guven).toBeGreaterThan(0)
  })

  it('ayıplı ürün: "servis" YOKKEN ayıplı/üretici/patlayan cihaz ifadesi OD_AYIPLI_URUN önerir', () => {
    expect(hugoRucuNedeniEsle('Üretim hatasından kaynaklanan ayıplı cihaz', 'OTO_DISI').kod).toBe('OD_AYIPLI_URUN')
  })

  it('altyapı işletmecisi: İSKİ, belediye, BEDAŞ gibi ifadeler', () => {
    expect(hugoRucuNedeniEsle('İSKİ kanalizasyon şebekesi patlaması', 'OTO_DISI').kod).toBe('OD_ALTYAPI_ISLETMECI')
    expect(hugoRucuNedeniEsle('BEDAŞ dağıtım şirketi kusuru', 'OTO_DISI').kod).toBe('OD_ALTYAPI_ISLETMECI')
  })

  it('kiracı kusuru', () => {
    expect(hugoRucuNedeniEsle('Kiracının kusuruyla çıkan yangın', 'OTO_DISI').kod).toBe('OD_KIRACI')
  })

  it('eşleşmeyen metin avukata bırakır', () => {
    expect(hugoRucuNedeniEsle('Diğer Nedenler', 'OTO_DISI')).toMatchObject({ kod: null, adaylar: [] })
    expect(hugoRucuNedeniEsle('', 'OTO_DISI')).toMatchObject({ kod: null, adaylar: [] })
  })
})

describe('branş izolasyonu: OD_* ve ZMSS/kasko öneri havuzları hiç karışmaz', () => {
  it('ZMSS dosyasında OD_* hiç önerilmez (oto dışı metin geçse bile)', () => {
    for (const metin of ['Apartman yönetimi ortak alan', 'Dahili su sirayeti', 'İSKİ kanalizasyon']) {
      const r = hugoRucuNedeniEsle(metin, 'ZMMS')
      if (r.kod) expect(r.kod, metin).not.toMatch(/^OD_/)
      for (const a of r.adaylar) expect(a, metin).not.toMatch(/^OD_/)
    }
  })

  it('kasko dosyasında OD_* hiç önerilmez', () => {
    for (const metin of ['Apartman yönetimi ortak alan', 'Dahili su sirayeti', 'Kiracının kusuru']) {
      const r = hugoRucuNedeniEsle(metin, 'KASKO')
      if (r.kod) expect(r.kod, metin).not.toMatch(/^OD_/)
      for (const a of r.adaylar) expect(a, metin).not.toMatch(/^OD_/)
    }
  })

  it('oto dışı dosyasında ZMSS/kasko kodu hiç önerilmez (ZMSS bent atfı bile aranmaz)', () => {
    for (const metin of ['Alkollü araç kullanımı', 'Olay yerini terk', 'B.4/f', 'Hizmet kusuru (yol bakım)', 'Karşı araç kusurlu']) {
      const r = hugoRucuNedeniEsle(metin, 'OTO_DISI')
      if (r.kod) expect(r.kod, metin).toMatch(/^OD_/)
      for (const a of r.adaylar) expect(a, metin).toMatch(/^OD_/)
    }
  })
})
