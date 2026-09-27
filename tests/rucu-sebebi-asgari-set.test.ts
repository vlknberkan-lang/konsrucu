/**
 * S19 · koda bağlı asgari evrak seti ↔ dosyadaki belgeler; eksik evrak kartı ve Ray'e istek taslağı (EV-04).
 */
import { describe, expect, it } from 'vitest'
import { asgariSetDurumu, belgeEvrakTuruMu, zorunluEvrakEksikleri } from '@/lib/konsrucu/rucu-sebebi'
import { eksikEvrakKur } from '@/lib/konsrucu/oneri/gorunum'

const YETKI = { duzenleyebilir: true, kararVerebilir: true }

describe('asgariSetDurumu', () => {
  it('kasko halefiyeti: poliçe, tutanak, ekspertiz var; ödeme dekontu EKSİK', () => {
    const d = asgariSetDurumu('KASKO_HALEFIYET', [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }, { kategori: 'EKSPERTIZ' }, { kategori: 'HASAR_FOTO' }])
    expect(d.ogeler.map((o) => [o.tur, o.durum])).toEqual([['POLICE', 'VAR'], ['KTT', 'VAR'], ['DEKONT', 'EKSIK'], ['EKSPERTIZ', 'VAR']])
    expect(d.eksikler.map((o) => o.ad)).toEqual(['Ödeme dekontu'])
    expect(d.tamam).toBe(false)
  })

  it('alt tür "HASAR_DEKONT" dekontu karşılar; arabuluculuk tutanağı kaza tutanağı sayılmaz', () => {
    expect(belgeEvrakTuruMu({ kategori: 'DIGER', altTur: 'HASAR_DEKONT' }, 'DEKONT')).toBe(true)
    expect(belgeEvrakTuruMu({ kategori: 'DIGER', altTur: 'ARB_SON_TUTANAK' }, 'KTT')).toBe(false)
    expect(belgeEvrakTuruMu({ kategori: 'DIGER', altTur: 'ICRA_TEBLIG_MAZBATASI' }, 'KTT')).toBe(false)
  })

  it('silinmiş belge sayılmaz', () => {
    const d = asgariSetDurumu('B4_A', [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }, { kategori: 'DEKONT', silindiAt: new Date() }])
    expect(d.eksikler.map((o) => o.tur)).toEqual(['DEKONT'])
  })

  it('B.4/f: terk kaydı belge türünden anlaşılamaz → "kontrol edin"; eksik sayılmaz', () => {
    const d = asgariSetDurumu('B4_F', [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }, { kategori: 'DEKONT' }])
    expect(d.tamam).toBe(true)
    expect(d.kontrolEdilecekler.map((o) => o.tur)).toEqual(['TERK_KANITI'])
  })

  it('Yol Haritası köprüsü (EV-04): onaylı kod yoksa null, varsa eksik adları', () => {
    expect(zorunluEvrakEksikleri(null, [])).toBeNull()
    expect(zorunluEvrakEksikleri('UYDURMA', [])).toBeNull()
    expect(zorunluEvrakEksikleri('KASKO_HALEFIYET', [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }, { kategori: 'EKSPERTIZ' }])).toEqual({ eksik: ['Ödeme dekontu'] })
  })

  it('alkol kodu: alkol raporu yoksa eksik', () => {
    const d = asgariSetDurumu('B4_C_ALKOL', [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }, { kategori: 'DEKONT' }])
    expect(d.eksikler.map((o) => o.tur)).toEqual(['ALKOL_RAPORU'])
  })
})

describe('eksik evrak kartı', () => {
  const temel = { dosyaId: 'd1', yetki: YETKI, hukukDosyaNo: 'HK-KURGU-1', hasarDosyaNo: 'HS-KURGU-2', buroAdi: 'Kurgusal Hukuk Bürosu' }

  it('kod yoksa liste yok ("önce rücu sebebini seçin")', () => {
    const v = eksikEvrakKur({ ...temel, onayliKod: null, oneriKod: null, belgeler: [] })
    expect(v).toMatchObject({ kod: null, ogeler: [], rayTaslagi: null })
  })

  it('onaylı kod yoksa öneriye göre hesaplanır ve bu belirtilir', () => {
    const v = eksikEvrakKur({ ...temel, onayliKod: null, oneriKod: 'KASKO_HALEFIYET', belgeler: [{ kategori: 'POLICE' }] })
    expect(v.oneriyeGore).toBe(true)
    expect(v.k1Etiketi).toBe('K1: bekliyor · teyit gerekli')
  })

  it('eksik "ödeme dekontu" için Ray\'e istek taslağı hazır; kişisel veri yok', () => {
    const v = eksikEvrakKur({ ...temel, onayliKod: 'KASKO_HALEFIYET', oneriKod: null, belgeler: [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }, { kategori: 'EKSPERTIZ' }] })
    expect(v.eksikSayisi).toBe(1)
    expect(v.rayTaslagi?.konu).toContain('HK-KURGU-1')
    expect(v.rayTaslagi?.govde).toContain('1. Ödeme dekontu')
    expect(v.rayTaslagi?.govde).toContain('Kurgusal Hukuk Bürosu')
  })

  it('B.4/f\'de eksik varsa terk kaydı taslağa "varsa" diye eklenir', () => {
    const v = eksikEvrakKur({ ...temel, onayliKod: 'B4_F', oneriKod: null, belgeler: [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }] })
    expect(v.rayTaslagi?.govde).toContain('Ödeme dekontu')
    expect(v.rayTaslagi?.govde).toContain('Olay yerini terki gösteren kayıt (varsa)')
  })

  it('eksik yoksa taslak yok', () => {
    const v = eksikEvrakKur({ ...temel, onayliKod: 'B4_A', oneriKod: null, belgeler: [{ kategori: 'POLICE' }, { kategori: 'TUTANAK' }, { kategori: 'DEKONT' }] })
    expect(v.eksikSayisi).toBe(0)
    expect(v.rayTaslagi).toBeNull()
  })
})
