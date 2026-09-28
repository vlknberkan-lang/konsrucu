import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  anatomiUslupKurallariCikar,
  uslupIcerikOzeti,
  uslupYuklemePlani,
  UslupKaynakHatasi,
  type AnatomiKuralAdayi,
} from '@/lib/konsrucu/dilekce-v2/uslup-kaynak'

const ANATOMI_MD = 'C:\\Users\\SENFONİ-Berkan\\Desktop\\Yazılım\\rucu-hukuk-asistani\\bilgi-bankasi\\dilekce\\anatomi-ve-uslup.md'
const varMi = fs.existsSync(ANATOMI_MD)

describe.skipIf(!varMi)('uslup-kaynak · anatomi-ve-uslup.md §1 (gerçek dosya)', () => {
  const md = () => fs.readFileSync(ANATOMI_MD, 'utf8')

  it('Y1-Y9 + Mutlak ifadeler = 10 kural çıkarır', () => {
    const adaylar = anatomiUslupKurallariCikar(md())
    expect(adaylar.map((a) => a.id)).toEqual(['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'MUTLAK_IFADELER'])
  })

  it('Y7 dışında hepsi HEPSİ kapsamında; Y7 yalnız CEVABA_CEVAP', () => {
    const adaylar = anatomiUslupKurallariCikar(md())
    const kapsam = Object.fromEntries(adaylar.map((a) => [a.id, a.kapsam]))
    expect(kapsam.Y7).toBe('CEVABA_CEVAP')
    for (const id of ['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y8', 'Y9', 'MUTLAK_IFADELER']) expect(kapsam[id], id).toBe('HEPSI')
  })

  it('her metin kendi [id] önekiyle başlar, markdown ** ve ` işaretleri temizlenmiş', () => {
    const adaylar = anatomiUslupKurallariCikar(md())
    for (const a of adaylar) {
      expect(a.metin.startsWith(`[${a.id}] `), a.id).toBe(true)
      expect(a.metin, a.id).not.toContain('**')
      expect(a.metin, a.id).not.toContain('`')
    }
  })

  it('Y1 metni "Yerine ne yazılır" bölümünü içerir (Yasak + Yerine tek metinde)', () => {
    const adaylar = anatomiUslupKurallariCikar(md())
    const y1 = adaylar.find((a) => a.id === 'Y1')!
    expect(y1.metin).toContain('Uydurma olgu')
    expect(y1.metin).toContain('Yerine ne yazılır:')
    expect(y1.metin).toContain('EKSİK')
  })

  it('her adayın örneği (Neden sütunu) dolu, MUTLAK_IFADELER için "Örnek:" cümlesinden çıkarılmış', () => {
    const adaylar = anatomiUslupKurallariCikar(md())
    for (const a of adaylar) expect(a.ornek, a.id).toBeTruthy()
    const mutlak = adaylar.find((a) => a.id === 'MUTLAK_IFADELER')!
    expect(mutlak.ornek).toContain('D2')
  })

  it('bilgiBankasiYolu her adayda dolu', () => {
    const adaylar = anatomiUslupKurallariCikar(md())
    for (const a of adaylar) expect(a.bilgiBankasiYolu).toBe('bilgi-bankasi/dilekce/anatomi-ve-uslup.md#1')
  })
})

describe('uslup-kaynak · saf yardımcılar (dosyasız)', () => {
  it('bölüm bulunamazsa UslupKaynakHatasi fırlatır', () => {
    expect(() => anatomiUslupKurallariCikar('# başka bir dosya\n\nİçerik yok.')).toThrow(UslupKaynakHatasi)
  })

  it('tablo eksikse UslupKaynakHatasi fırlatır', () => {
    const md = ['## 1. Mutlak yasaklar (kalite kapısı: ENGEL)', '', 'Tablo yok.', '', '## 2. Sonraki bölüm'].join('\n')
    expect(() => anatomiUslupKurallariCikar(md)).toThrow(UslupKaynakHatasi)
  })

  it('uslupIcerikOzeti: aynı girdi aynı hash, metin değişince hash değişir', () => {
    const temel = { kapsam: 'HEPSI', metin: '[Y1] a', ornek: 'ö' }
    expect(uslupIcerikOzeti(temel)).toBe(uslupIcerikOzeti({ ...temel }))
    expect(uslupIcerikOzeti(temel)).not.toBe(uslupIcerikOzeti({ ...temel, metin: '[Y1] b' }))
  })
})

describe('uslup-kaynak · uslupYuklemePlani (idempotent [id] önekiyle eşleme)', () => {
  const aday = (id: string, metin: string): AnatomiKuralAdayi => ({ id, kapsam: 'HEPSI', metin: `[${id}] ${metin}`, ornek: 'ö', bilgiBankasiYolu: 'x#1' })

  it('DB boşsa hepsi eklenecek, surum=1', () => {
    const plan = uslupYuklemePlani([], [aday('Y1', 'a')])
    expect(plan.eklenecek).toEqual([{ id: 'Y1', surum: 1, kapsam: 'HEPSI' }])
  })

  it('içerik aynıysa aynı kalacak', () => {
    const a = aday('Y1', 'a')
    const plan = uslupYuklemePlani([{ id: '1', kapsam: 'HEPSI', metin: a.metin, ornek: 'ö', surum: 1, durum: 'ONERI' }], [a])
    expect(plan.ayniKalacak).toEqual([{ id: 'Y1', surum: 1, kapsam: 'HEPSI' }])
    expect(plan.eklenecek).toEqual([])
    expect(plan.yeniSurum).toEqual([])
  })

  it('içerik değiştiyse yeni sürüm açılır; ONAYLI eski satıra dokunulmaz', () => {
    const eski = aday('Y1', 'eski metin')
    const yeni = aday('Y1', 'yeni metin')
    const plan = uslupYuklemePlani([{ id: '1', kapsam: 'HEPSI', metin: eski.metin, ornek: 'ö', surum: 2, durum: 'ONAYLI' }], [yeni])
    expect(plan.yeniSurum).toHaveLength(1)
    expect(plan.yeniSurum[0]).toMatchObject({ id: 'Y1', surum: 3, oncekiSurum: 2, oncekiOnayli: true })
  })

  it('PASİF satırlar yok sayılır (yeniden eklenecek sayılır, üstüne yazılmaz)', () => {
    const a = aday('Y1', 'a')
    const plan = uslupYuklemePlani([{ id: '1', kapsam: 'HEPSI', metin: a.metin, ornek: 'ö', surum: 1, durum: 'PASIF' }], [a])
    expect(plan.eklenecek).toEqual([{ id: 'Y1', surum: 1, kapsam: 'HEPSI' }])
  })

  it('[id] önekiyle eşleşmeyen (elle girilmiş) satırlar dokunulmadan yok sayılır', () => {
    const a = aday('Y1', 'a')
    const plan = uslupYuklemePlani([{ id: '1', kapsam: 'HEPSI', metin: 'elle girilmiş, önek yok', ornek: null, surum: 1, durum: 'ONAYLI' }], [a])
    expect(plan.eklenecek).toEqual([{ id: 'Y1', surum: 1, kapsam: 'HEPSI' }])
  })
})
