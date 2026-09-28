import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { bloklaraBol, sablonAlanlari, sablonAyristir } from '@/lib/konsrucu/dilekce-v2/sablon-dil'
import {
  mdDenSablonAdaylariCikar,
  mdMetaVerisiOku,
  metinVaryantCikar,
  sablonIcerikOzeti,
  sablonYuklemePlani,
  type SablonAdayi,
} from '@/lib/konsrucu/dilekce-v2/sablon-kaynak'

// Gerçek bilgi bankası — sablon-yukle.ts CLI'sinin --kaynak varsayılanıyla aynı dizin (araclar/sablon-yukle.ts).
const SABLONLAR_DIR = 'C:\\Users\\SENFONİ-Berkan\\Desktop\\Yazılım\\rucu-hukuk-asistani\\bilgi-bankasi\\dilekce\\sablonlar'
const varMi = fs.existsSync(SABLONLAR_DIR)

function oku(dosyaAdi: string): string {
  return fs.readFileSync(path.join(SABLONLAR_DIR, dosyaAdi), 'utf8')
}

describe.skipIf(!varMi)('sablon-kaynak · bilgi bankası md → DilekceSablon adayı (gerçek 5 dosya)', () => {
  const DOSYALAR = [
    'beyan.md',
    'cevaba-cevap.md',
    'delil-dilekcesi.md',
    'itirazin-iptali-kasko-hizmet-kusuru-kamu-idaresi.md',
    'itirazin-iptali-zmss-alkol.md',
  ]

  it('beklenen dosyalar diskte var', () => {
    for (const d of DOSYALAR) expect(fs.existsSync(path.join(SABLONLAR_DIR, d)), d).toBe(true)
  })

  it('kasko dosyası: tek aday, DAVA, doğru varyant', () => {
    const adaylar = mdDenSablonAdaylariCikar(oku('itirazin-iptali-kasko-hizmet-kusuru-kamu-idaresi.md'), 'itirazin-iptali-kasko-hizmet-kusuru-kamu-idaresi.md')
    expect(adaylar).toHaveLength(1)
    const [a] = adaylar
    expect(a.kod).toBe('itirazin-iptali-kasko-hizmet-kusuru-kamu-idaresi')
    expect(a.tur).toBe('DAVA')
    expect(a.varyantJson).toEqual({ rucuSebebiKod: 'KASKO_HIZMET_KUSURU', mahkemeTuru: 'ASLIYE_HUKUK', usul: 'YAZILI', davaliTur: 'KAMU' })
    expect(a.bilgiBankasiYolu).toBe('bilgi-bankasi/dilekce/sablonlar/itirazin-iptali-kasko-hizmet-kusuru-kamu-idaresi.md#3')
  })

  it('zmss-alkol dosyası: tek aday, DAVA, doğru varyant', () => {
    const adaylar = mdDenSablonAdaylariCikar(oku('itirazin-iptali-zmss-alkol.md'), 'itirazin-iptali-zmss-alkol.md')
    expect(adaylar).toHaveLength(1)
    const [a] = adaylar
    expect(a.kod).toBe('itirazin-iptali-zmss-alkol')
    expect(a.tur).toBe('DAVA')
    expect(a.varyantJson).toEqual({ rucuSebebiKod: 'B4_C_ALKOL', mahkemeTuru: 'TUKETICI', usul: 'BASIT', davaliTur: 'GERCEK' })
  })

  it('cevaba-cevap dosyası: tek aday, CEVABA_CEVAP, yalnız usul=YAZILI (rücu ailesi belirsiz → GENEL)', () => {
    const adaylar = mdDenSablonAdaylariCikar(oku('cevaba-cevap.md'), 'cevaba-cevap.md')
    expect(adaylar).toHaveLength(1)
    const [a] = adaylar
    expect(a.kod).toBe('cevaba-cevap')
    expect(a.tur).toBe('CEVABA_CEVAP')
    expect(a.varyantJson).toEqual({ usul: 'YAZILI' })
  })

  it('delil-dilekcesi dosyası: tek aday, DELIL, tamamen GENEL (her iki aile + her iki usul)', () => {
    const adaylar = mdDenSablonAdaylariCikar(oku('delil-dilekcesi.md'), 'delil-dilekcesi.md')
    expect(adaylar).toHaveLength(1)
    const [a] = adaylar
    expect(a.kod).toBe('delil-dilekcesi')
    expect(a.tur).toBe('DELIL')
    expect(a.varyantJson).toEqual({})
  })

  it('beyan dosyası: altı aday (§1–§6), tur=BEYAN, yalnız §3 usul=BASIT taşır', () => {
    const adaylar = mdDenSablonAdaylariCikar(oku('beyan.md'), 'beyan.md')
    expect(adaylar).toHaveLength(6)
    expect(adaylar.map((a) => a.kod)).toEqual(['beyan-1', 'beyan-2', 'beyan-3', 'beyan-4', 'beyan-5', 'beyan-6'])
    for (const a of adaylar) expect(a.tur).toBe('BEYAN')
    const varyantlar = Object.fromEntries(adaylar.map((a) => [a.kod, a.varyantJson]))
    expect(varyantlar['beyan-1']).toEqual({})
    expect(varyantlar['beyan-2']).toEqual({})
    expect(varyantlar['beyan-3']).toEqual({ usul: 'BASIT' })
    expect(varyantlar['beyan-4']).toEqual({})
    expect(varyantlar['beyan-5']).toEqual({})
    expect(varyantlar['beyan-6']).toEqual({})
  })

  it('bütün adaylar geçerli {{...}} dili: sablonAyristir hiç fırlatmaz, en az bir blok ve alan üretir', () => {
    const tumAdaylar: SablonAdayi[] = DOSYALAR.flatMap((d) => mdDenSablonAdaylariCikar(oku(d), d))
    expect(tumAdaylar.length).toBe(10) // 4×tek aday + beyan.md×6
    for (const a of tumAdaylar) {
      const dugumler = sablonAyristir(a.kaynakMetni)
      const bloklar = bloklaraBol(dugumler)
      expect(bloklar.length, a.kod).toBeGreaterThan(0)
      const { alanlar, aiYuvasi } = sablonAlanlari(dugumler)
      expect(alanlar.length, `${a.kod}: alan yok`).toBeGreaterThan(0)
      expect(aiYuvasi, a.kod).toBeGreaterThanOrEqual(0)
    }
  })

  it('kod alanı bütün dosyalarda tekildir (DilekceSablon unique anahtarının parçası)', () => {
    const tumAdaylar = DOSYALAR.flatMap((d) => mdDenSablonAdaylariCikar(oku(d), d))
    const kodlar = tumAdaylar.map((a) => a.kod)
    expect(new Set(kodlar).size).toBe(kodlar.length)
  })

  it('her adayın kaynakOrnek ve bilgiBankasiYolu değeri dolu', () => {
    const tumAdaylar = DOSYALAR.flatMap((d) => mdDenSablonAdaylariCikar(oku(d), d))
    for (const a of tumAdaylar) {
      expect(a.kaynakOrnek, a.kod).toBeTruthy()
      expect(a.bilgiBankasiYolu, a.kod).toContain(`${a.dosyaAdi}#${a.bolumNo}`)
    }
  })
})

describe('sablon-kaynak · saf yardımcılar (dosyasız)', () => {
  it('mdMetaVerisiOku: ilk --- ayracına kadarki | Özellik | Değer | tablosunu okur, sonrasını yok sayar', () => {
    const md = [
      '# Başlık',
      '',
      '| Özellik | Değer |',
      '|---|---|',
      '| Tür | `DAVA` |',
      '| Varyant | mahkeme: Tüketici · usul: BASİT |',
      '',
      '---',
      '',
      '| Alan | Açıklama | Kaynak | Program alanı |',
      '|---|---|---|---|',
      '| `x` | y | z | w |',
    ].join('\n')
    const meta = mdMetaVerisiOku(md)
    expect(meta['Tür']).toBe('`DAVA`')
    expect(meta['Varyant']).toBe('mahkeme: Tüketici · usul: BASİT')
    expect(meta['Alan']).toBeUndefined()
  })

  it('metinVaryantCikar: "yalnız yazılı usul" + ayrıca "basit" geçse bile YAZILI kesinliğini korur', () => {
    const v = metinVaryantCikar('CEVABA_CEVAP (yalnız **yazılı usul**). Basit usulde `beyan.md` kullanılır.')
    expect(v.usul).toBe('YAZILI')
  })

  it('metinVaryantCikar: hem yazılı hem basit belirsizce geçerse usul boş kalır (GENEL)', () => {
    const v = metinVaryantCikar('Yazılı ve basit usul')
    expect(v.usul).toBeUndefined()
  })

  it('metinVaryantCikar: branş belirsizse (kasko ve zmss birlikte) rücu sebebi kodu boş kalır', () => {
    const v = metinVaryantCikar('(B) kasko + hizmet kusuru; (C) ZMSS + alkol')
    expect(v.rucuSebebiKod).toBeUndefined()
  })

  it('sablonIcerikOzeti: aynı girdi aynı hash, kaynak metni değişince hash değişir', () => {
    const temel = { tur: 'DAVA', kod: 'x', varyantJson: {}, kaynakMetni: '{{! [B01] SABİT }}\nA' }
    expect(sablonIcerikOzeti(temel)).toBe(sablonIcerikOzeti({ ...temel }))
    expect(sablonIcerikOzeti(temel)).not.toBe(sablonIcerikOzeti({ ...temel, kaynakMetni: '{{! [B01] SABİT }}\nB' }))
  })
})

describe('sablon-kaynak · sablonYuklemePlani (idempotent surum mantığı)', () => {
  const aday = (kod: string, kaynakMetni: string): SablonAdayi => ({
    kod, tur: 'DAVA', varyantJson: {}, kaynakMetni, dosyaAdi: 'x.md', bolumNo: 1, bolumBasligi: 'x', kaynakOrnek: 'ÖE', bilgiBankasiYolu: 'x.md#1',
  })

  it('DB boşsa hepsi eklenecek, surum=1', () => {
    const plan = sablonYuklemePlani([], [aday('a', 'gövde-1')])
    expect(plan.eklenecek).toEqual([{ kod: 'a', surum: 1, tur: 'DAVA', bolumBasligi: 'x' }])
    expect(plan.yeniSurum).toEqual([])
    expect(plan.ayniKalacak).toEqual([])
  })

  it('içerik aynıysa aynı kalacak (yazma yok)', () => {
    const a = aday('a', 'gövde-1')
    const ozet = sablonIcerikOzeti(a)
    const plan = sablonYuklemePlani([{ id: '1', kod: 'a', surum: 1, icerikOzet: ozet, aktif: true, onayAt: new Date() }], [a])
    expect(plan.ayniKalacak).toEqual([{ kod: 'a', surum: 1, tur: 'DAVA', bolumBasligi: 'x' }])
    expect(plan.eklenecek).toEqual([])
    expect(plan.yeniSurum).toEqual([])
  })

  it('içerik değiştiyse yeni sürüm açılır; onaylı eski satıra hiç dokunulmaz', () => {
    const eskiOzet = sablonIcerikOzeti(aday('a', 'gövde-1'))
    const yeni = aday('a', 'gövde-2')
    const plan = sablonYuklemePlani([{ id: '1', kod: 'a', surum: 3, icerikOzet: eskiOzet, aktif: true, onayAt: new Date() }], [yeni])
    expect(plan.yeniSurum).toHaveLength(1)
    expect(plan.yeniSurum[0]).toMatchObject({ kod: 'a', surum: 4, oncekiSurum: 3, oncekiOnayli: true })
    expect(plan.eklenecek).toEqual([])
    expect(plan.ayniKalacak).toEqual([])
  })

  it('adaylar arasında kod tekrarı hata fırlatır', () => {
    expect(() => sablonYuklemePlani([], [aday('a', '1'), aday('a', '2')])).toThrow(/iki kez/)
  })

  it('DB kodu adaylarda yoksa katalogDışı listelenir, dokunulmaz', () => {
    const plan = sablonYuklemePlani([{ id: '1', kod: 'eski-kod', surum: 1, icerikOzet: 'h', aktif: true, onayAt: new Date() }], [aday('a', '1')])
    expect(plan.katalogDisi).toEqual(['eski-kod'])
  })

  it('ozet (plan hash) yalnız plan içeriğine bağlı — aynı girdi aynı hash üretir', () => {
    const a = aday('a', 'gövde-1')
    const p1 = sablonYuklemePlani([], [a])
    const p2 = sablonYuklemePlani([], [aday('a', 'gövde-1')])
    expect(p1.ozet).toBe(p2.ozet)
  })
})
