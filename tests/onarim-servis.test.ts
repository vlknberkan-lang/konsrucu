import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  voFindFirst: vi.fn(), voFindMany: vi.fn(), voUpdateMany: vi.fn(), voCount: vi.fn(), voCreateMany: vi.fn(),
  rdUpdateMany: vi.fn(), rdFindFirst: vi.fn(), rdFindMany: vi.fn(),
  sureFindFirst: vi.fn(), sureCreate: vi.fn(), sureUpdateMany: vi.fn(),
  borcluFindFirst: vi.fn(), gecis: vi.fn(), aktivite: vi.fn(),
}))
vi.mock('@/lib/prisma', () => {
  const db = {
    veriOnarim: { findFirst: m.voFindFirst, findMany: m.voFindMany, updateMany: m.voUpdateMany, count: m.voCount, createMany: m.voCreateMany },
    rucuDosyasi: { updateMany: m.rdUpdateMany, findFirst: m.rdFindFirst, findMany: m.rdFindMany },
    sure: { findFirst: m.sureFindFirst, create: m.sureCreate, updateMany: m.sureUpdateMany },
    borclu: { findFirst: m.borcluFindFirst },
    durumGecisi: { create: m.gecis },
    aktivite: { create: m.aktivite },
  }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})

import { kuruListeOlustur, partiyiGeriAl, partiyiUygula, satirKarariVer, topluOnayVer } from '@/lib/konsrucu/onarim/servis'
import { isoGun } from '@/lib/konsrucu/sure/takvim'

const T = { musteriId: 'tenant-1', kullaniciId: 'avukat-1' }
const satir = (p: Record<string, unknown> = {}) => ({
  id: 'v1', musteriId: 'tenant-1', dosyaId: 'd1', parti: 'R2-DURUM-01', kod: 'R2', islem: 'GUNCELLE', hedefTablo: 'RucuDosyasi', hedefId: null, alan: 'icraEksen',
  eskiJson: { deger: null }, yeniJson: { deger: 'DURDU_ITIRAZ' }, kanit: 'k', guvenSinifi: 'B', durum: 'ONAYLI', onaylayanId: 'avukat-1', onayAt: null,
  uygulandiAt: null, geriAlindiAt: null, not: null, createdAt: new Date(), ...p,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.voUpdateMany.mockResolvedValue({ count: 1 })
  m.rdUpdateMany.mockResolvedValue({ count: 1 })
  m.aktivite.mockResolvedValue({})
  m.gecis.mockResolvedValue({})
})

describe('S13 · toplu onay kuralı (servis)', () => {
  it('R2 (durum) partisinde toplu onay reddedilir', async () => {
    m.voFindMany.mockResolvedValueOnce([{ id: 'v1', kod: 'R2', durum: 'KURU', guvenSinifi: 'A' }])
    const r = await topluOnayVer({ ...T, parti: 'R2-DURUM-01' })
    expect(r.ok).toBe(false)
    expect(m.voUpdateMany).not.toHaveBeenCalled()
  })

  it('R1: 5 örnek teyidi yokken kapalı; varken yalnız KURU + A sınıfını onaylar', async () => {
    const satirlar = [{ id: 'a', kod: 'R1', durum: 'KURU', guvenSinifi: 'A' }, { id: 'b', kod: 'R1', durum: 'KURU', guvenSinifi: 'B' }]
    m.voFindMany.mockResolvedValue(satirlar)
    m.voCount.mockResolvedValueOnce(4)
    const kapali = await topluOnayVer({ ...T, parti: 'R1-TUTAR-01' })
    expect(kapali.ok).toBe(false)
    expect(!kapali.ok && kapali.error).toContain('4/5')
    expect(m.voCount).toHaveBeenCalledWith({ where: expect.objectContaining({ musteriId: 'tenant-1', kod: 'R1', not: { startsWith: 'ÖRNEK TEYİT' } }) })

    m.voCount.mockResolvedValueOnce(5)
    m.voUpdateMany.mockResolvedValue({ count: 1 })
    const acik = await topluOnayVer({ ...T, parti: 'R1-TUTAR-01' })
    expect(acik).toMatchObject({ ok: true, onaylanan: 1, tekTekKalan: 1 })
    expect(m.voUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ['a'] }, musteriId: 'tenant-1', durum: 'KURU', guvenSinifi: 'A' }) }))
  })
})

describe('S13 · satır kararı', () => {
  it('ret gerekçe ister; örnek teyidi yalnız R1 onayında ve açıklamayla', async () => {
    m.voFindFirst.mockResolvedValue(satir({ durum: 'KURU' }))
    expect((await satirKarariVer({ ...T, id: 'v1', karar: 'REDDET' })).ok).toBe(false)
    expect((await satirKarariVer({ ...T, id: 'v1', karar: 'ONAYLA', ornekTeyit: true, gerekce: 'Hugo ve dekont' })).ok).toBe(false) // R2
    m.voFindFirst.mockResolvedValue(satir({ kod: 'R1', parti: 'R1-TUTAR-01', durum: 'KURU', alan: 'rucuTutari' }))
    const r = await satirKarariVer({ ...T, id: 'v1', karar: 'ONAYLA', ornekTeyit: true, gerekce: 'Hugo ve dekont: 1.234.567,89 TL' })
    expect(r.ok).toBe(true)
    expect(m.voUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'v1', musteriId: 'tenant-1', durum: 'KURU' },
      data: expect.objectContaining({ durum: 'ONAYLI', onaylayanId: 'avukat-1', not: 'ÖRNEK TEYİT: Hugo ve dekont: 1.234.567,89 TL' }),
    }))
  })

  it('başka müvekkilin satırı bulunmaz', async () => {
    m.voFindFirst.mockResolvedValue(null)
    expect((await satirKarariVer({ ...T, id: 'v1', karar: 'ONAYLA' })).ok).toBe(false)
    expect(m.voFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'v1', musteriId: 'tenant-1' } }))
  })
})

describe('S13 · parti uygula / geri al (tek işlem, iz)', () => {
  it('GUNCELLE: WHERE eski değer korumasıyla yazar, DurumGecisi(ONARIM) ve onarım bandını günceller', async () => {
    m.voFindMany.mockResolvedValueOnce([satir()]).mockResolvedValueOnce([{ durum: 'UYGULANDI' }])
    const r = await partiyiUygula({ ...T, parti: 'R2-DURUM-01' })
    expect(r).toMatchObject({ ok: true, uygulanan: 1, atlanan: 0 })
    expect(m.rdUpdateMany.mock.calls[0][0]).toEqual({ where: { id: 'd1', musteriId: 'tenant-1', icraEksen: null }, data: { icraEksen: 'DURDU_ITIRAZ' } })
    expect(m.gecis).toHaveBeenCalledWith({ data: expect.objectContaining({ dosyaId: 'd1', eksen: 'ICRA', yeni: 'DURDU_ITIRAZ', kaynakTuru: 'ONARIM', teyit: 'TEYITLI', kaynakId: 'v1' }) })
    expect(m.voUpdateMany).toHaveBeenCalledWith({ where: { id: 'v1', musteriId: 'tenant-1', durum: 'ONAYLI' }, data: expect.objectContaining({ durum: 'UYGULANDI' }) })
    expect(m.rdUpdateMany).toHaveBeenLastCalledWith({ where: { id: 'd1', musteriId: 'tenant-1' }, data: { onarimDurumu: 'ONARILDI' } })
  })

  it('araya değişiklik girmişse satır ATLANDI ve bant BEKLIYOR kalır', async () => {
    m.rdUpdateMany.mockResolvedValueOnce({ count: 0 })
    m.voFindMany.mockResolvedValueOnce([satir()]).mockResolvedValueOnce([{ durum: 'ATLANDI' }])
    const r = await partiyiUygula({ ...T, parti: 'R2-DURUM-01' })
    expect(r).toMatchObject({ ok: true, uygulanan: 0, atlanan: 1 })
    expect(m.gecis).not.toHaveBeenCalled()
    expect(m.voUpdateMany).toHaveBeenCalledWith({ where: { id: 'v1', musteriId: 'tenant-1', durum: 'ONAYLI' }, data: expect.objectContaining({ durum: 'ATLANDI' }) })
    expect(m.rdUpdateMany).toHaveBeenLastCalledWith({ where: { id: 'd1', musteriId: 'tenant-1' }, data: { onarimDurumu: 'BEKLIYOR' } })
  })

  it('R0 EKLE: Sure satırı açılır (öneri, onaysız); geri almada Sure.silindiAt dolar', async () => {
    const ekle = satir({ id: 'r0', kod: 'R0', parti: 'R0-IIK67-01', islem: 'EKLE', hedefTablo: 'Sure', alan: '*', eskiJson: {},
      yeniJson: { tur: 'IIK67', dayanak: 'İİK 67/1', borcluId: null, itirazTarihi: '2026-03-12', onerilenIhtiyatli: '2027-03-12' } })
    m.voFindMany.mockResolvedValueOnce([ekle])
    m.rdFindFirst.mockResolvedValue({ id: 'd1' })
    m.sureFindFirst.mockResolvedValue(null)
    m.sureCreate.mockResolvedValue({ id: 'sure-yeni' })
    const r = await partiyiUygula({ ...T, parti: 'R0-IIK67-01' })
    expect(r).toMatchObject({ ok: true, uygulanan: 1 })
    const data = m.sureCreate.mock.calls[0][0].data
    expect(data).toMatchObject({ dosyaId: 'd1', tur: 'IIK67', onaylananSonGun: null, onaylayanId: null, durum: 'ACIK' })
    expect(isoGun(data.onerilenIhtiyatli)).toBe('2027-03-12')
    expect(m.voUpdateMany).toHaveBeenCalledWith({ where: { id: 'r0', musteriId: 'tenant-1', durum: 'ONAYLI' }, data: expect.objectContaining({ durum: 'UYGULANDI', hedefId: 'sure-yeni' }) })

    vi.clearAllMocks()
    m.voUpdateMany.mockResolvedValue({ count: 1 })
    m.sureUpdateMany.mockResolvedValue({ count: 1 })
    m.voFindMany.mockResolvedValueOnce([{ ...ekle, durum: 'UYGULANDI', hedefId: 'sure-yeni' }])
    const g = await partiyiGeriAl({ ...T, parti: 'R0-IIK67-01' })
    expect(g).toMatchObject({ ok: true, geriAlinan: 1 })
    expect(m.sureUpdateMany).toHaveBeenCalledWith({ where: { id: 'sure-yeni', dosyaId: 'd1', silindiAt: null, dosya: { musteriId: 'tenant-1' } }, data: { silindiAt: expect.any(Date) } })
    expect(m.voUpdateMany).toHaveBeenCalledWith({ where: { id: 'r0', musteriId: 'tenant-1', durum: 'UYGULANDI' }, data: expect.objectContaining({ durum: 'GERI_ALINDI' }) })
  })

  it('R0 EKLE: aynı dosya ve borçlu için açık İİK 67 varsa satır atlanır', async () => {
    m.voFindMany.mockResolvedValueOnce([satir({ id: 'r0', kod: 'R0', islem: 'EKLE', hedefTablo: 'Sure', alan: '*', eskiJson: {}, yeniJson: { tur: 'IIK67', dayanak: 'İİK 67/1', onerilenIhtiyatli: '2027-03-12' } })])
    m.rdFindFirst.mockResolvedValue({ id: 'd1' })
    m.sureFindFirst.mockResolvedValue({ id: 'mevcut' })
    const r = await partiyiUygula({ ...T, parti: 'R0-IIK67-01' })
    expect(r).toMatchObject({ uygulanan: 0, atlanan: 1 })
    expect(m.sureCreate).not.toHaveBeenCalled()
  })
})

describe('S13 · kuru liste oluşturma (canlıdan okur, veriye dokunmaz)', () => {
  it('R1: canlı dosyalardan KURU satırlar yazar, parti sırası devam eder, dosya alanları değişmez', async () => {
    m.voFindMany
      .mockResolvedValueOnce([]) // bekleyen R1
      .mockResolvedValueOnce([{ parti: 'R1-TUTAR-02' }]) // mevcut partiler
    m.rdFindMany.mockResolvedValue([
      { id: 'd1', rucuTutari: { toString: () => '1234.57' }, davaMiktari: null, kaynakJson: { ham: { rucuTutari: '1,234,567.89' } }, icraDosyaNo: null, takipTarihi: null },
      { id: 'd2', rucuTutari: { toString: () => '1234.56' }, davaMiktari: null, kaynakJson: { ham: { rucuTutari: '1.234,56' } }, icraDosyaNo: null, takipTarihi: null },
    ])
    m.voCreateMany.mockResolvedValue({ count: 1 })
    const r = await kuruListeOlustur({ ...T, kod: 'R1' })
    expect(r).toMatchObject({ ok: true, satir: 1, partiler: ['R1-TUTAR-03'], kalan: 0 })
    expect(m.rdFindMany.mock.calls[0][0].where).toMatchObject({ musteriId: 'tenant-1' })
    expect(m.voCreateMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ musteriId: 'tenant-1', dosyaId: 'd1', parti: 'R1-TUTAR-03', kod: 'R1', durum: 'KURU', guvenSinifi: 'A' })])
    expect(m.rdUpdateMany).not.toHaveBeenCalled()
  })
})
