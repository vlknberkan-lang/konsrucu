/**
 * S19 · rücu sebebi kod listesi (lib/konsrucu/rucu-sebebi.ts): K1 kapısı, dayanak etiketleri, B18 (TTK 1472
 * yalnız halefiyette), B05 düzeltmesi (B.4/f'de sağlık raporu/bedeni hasar zorunlu değil), EV-07 kartı.
 */
import { describe, expect, it } from 'vitest'
import {
  RUCU_SEBEBI_KODLARI, RUCU_SEBEBI_TANIM, EVRAK_TURU_TANIM, bransKodlari, dilekceyeGirebilir, ev07Durumu, k1Etiketi,
  kodBransaUygunMu, rucuSebebiKoduMu, rucuSebebiTanimi, ttk1472Uygulanir,
} from '@/lib/konsrucu/rucu-sebebi'

describe('kod listesi', () => {
  it('ZMSS B.4 bentleri (c: alkol ve uyuşturucu ayrı), GŞ-DİĞER ve kasko halefiyeti/hizmet kusuru kodları var', () => {
    for (const k of ['B4_A', 'B4_B', 'B4_C_ALKOL', 'B4_C_UYUSTURUCU', 'B4_CC', 'B4_D', 'B4_E', 'B4_F', 'GS_DIGER', 'KASKO_HALEFIYET', 'KASKO_HIZMET_KUSURU', 'KASKO_YID']) {
      expect(rucuSebebiKoduMu(k), k).toBe(true)
    }
    expect(rucuSebebiKoduMu('B4_Z')).toBe(false)
    expect(rucuSebebiTanimi(null)).toBeNull()
  })

  it('her kodun en az bir dayanağı var ve her dayanak "teyit gerekli" taşır', () => {
    for (const k of RUCU_SEBEBI_KODLARI) {
      const t = RUCU_SEBEBI_TANIM[k]
      expect(t.kod).toBe(k)
      expect(t.dayanaklar.length, k).toBeGreaterThan(0)
      for (const d of t.dayanaklar) expect(d.not ?? '', `${k}: ${d.etiket}`).toMatch(/teyit gerekli/)
    }
  })

  it('iptal edilen KTK m.110/2 hiçbir dayanakta geçmez (yalnız "kullanılmaz" uyarısı olarak)', () => {
    for (const k of RUCU_SEBEBI_KODLARI) {
      for (const d of RUCU_SEBEBI_TANIM[k].dayanaklar) expect(d.etiket).not.toMatch(/110\/2/)
    }
  })

  it('K1: kod listesi Yelda doğrulayana kadar "bekliyor"; doğrulanmamış kod dilekçeye girmez', () => {
    for (const k of RUCU_SEBEBI_KODLARI) {
      expect(RUCU_SEBEBI_TANIM[k].k1).toBe('BEKLIYOR')
      expect(k1Etiketi(k)).toBe('K1: bekliyor · teyit gerekli')
      expect(dilekceyeGirebilir(k)).toBe(false)
    }
    expect(dilekceyeGirebilir(null)).toBe(false)
  })

  it('B18: TTK m.1472 yalnız kasko halefiyeti kodlarında uygulanır', () => {
    expect(ttk1472Uygulanir('KASKO_HALEFIYET')).toBe(true)
    expect(ttk1472Uygulanir('KASKO_HIZMET_KUSURU')).toBe(true)
    expect(ttk1472Uygulanir('KASKO_YID')).toBe(true)
    for (const k of ['B4_A', 'B4_C_ALKOL', 'B4_F', 'GS_DIGER']) expect(ttk1472Uygulanir(k), k).toBe(false)
    expect(ttk1472Uygulanir(undefined)).toBe(false)
  })

  it('B05 düzeltmesi: B.4/f asgari setinde terk kaydı var, sağlık raporu yok; bent iki rejime duyarlı', () => {
    const f = RUCU_SEBEBI_TANIM.B4_F
    expect(f.asgariSet).toContain('TERK_KANITI')
    expect(f.asgariSet).not.toContain('ALKOL_RAPORU')
    expect(f.rejimDuyarli).toBe(true)
    expect(EVRAK_TURU_TANIM.TERK_KANITI.otomatik).toBe(false)
    expect(RUCU_SEBEBI_KODLARI.filter((k) => RUCU_SEBEBI_TANIM[k].rejimDuyarli)).toEqual(['B4_F'])
  })

  it('alkol kodunun asgari setinde alkol raporu, ehliyet kodunda sürücü belgesi durumu var', () => {
    expect(RUCU_SEBEBI_TANIM.B4_C_ALKOL.asgariSet).toContain('ALKOL_RAPORU')
    expect(RUCU_SEBEBI_TANIM.B4_B.asgariSet).toContain('EHLIYET')
  })

  it('GŞ-DİĞER gerekçe ister; diğerleri istemez', () => {
    expect(RUCU_SEBEBI_TANIM.GS_DIGER.gerekceZorunlu).toBe(true)
    expect(RUCU_SEBEBI_KODLARI.filter((k) => RUCU_SEBEBI_TANIM[k].gerekceZorunlu)).toEqual(['GS_DIGER'])
  })

  it('branşa göre kodlar: ZMMS yalnız B.4 ailesi, KASKO yalnız halefiyet; branş yoksa hepsi', () => {
    expect(bransKodlari('ZMMS').every((k) => k.startsWith('B4_') || k === 'GS_DIGER')).toBe(true)
    expect(bransKodlari('KASKO').every((k) => k.startsWith('KASKO_'))).toBe(true)
    expect(bransKodlari(null)).toHaveLength(RUCU_SEBEBI_KODLARI.length)
    expect(kodBransaUygunMu('B4_F', 'KASKO')).toBe(false)
    expect(kodBransaUygunMu('B4_F', null)).toBe(true)
  })
})

describe('EV-07 kartı', () => {
  it('kod yoksa kart görünür ve "GŞ sürümü teyit gerekli" der; öneri adı yazılır', () => {
    const d = ev07Durumu({ onayliKod: null, oneriKod: 'KASKO_HIZMET_KUSURU' })
    expect(d.gerekli).toBe(true)
    expect(d.teyitGerekli).toBe(true)
    expect(d.metin).toContain('Kasko halefiyeti · kamu idaresinin hizmet kusuru')
    expect(d.metin).toContain('GŞ sürümü teyit gerekli')
  })

  it('onaysız (K1 bekleyen) kodla seçilmiş dosyada "teyit gerekli" etiketi kalır', () => {
    const d = ev07Durumu({ onayliKod: 'B4_C_ALKOL' })
    expect(d.gerekli).toBe(false)
    expect(d.teyitGerekli).toBe(true)
    expect(d.metin).toMatch(/teyit gerekli/)
  })

  it('tanımsız kod yok sayılır', () => {
    expect(ev07Durumu({ onayliKod: 'UYDURMA', oneriKod: 'UYDURMA' })).toMatchObject({ gerekli: true, onayliKod: null, oneriKod: null })
  })
})
