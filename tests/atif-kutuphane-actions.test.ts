import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  ctx: vi.fn(), revalidate: vi.fn(), musteri: vi.fn(), mkFindFirst: vi.fn(), mkFindMany: vi.fn(), mkCreate: vi.fn(), mkUpdate: vi.fn(), mkUpdateMany: vi.fn(), aktivite: vi.fn(),
}))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/prisma', () => {
  const db = {
    musteri: { findFirst: m.musteri }, aktivite: { create: m.aktivite },
    mevzuatKaynak: { findFirst: m.mkFindFirst, findMany: m.mkFindMany, create: m.mkCreate, update: m.mkUpdate, updateMany: m.mkUpdateMany },
  }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})
import { mevzuatDurumKaydet, mevzuatKopyala, mevzuatKuruOnizle, mevzuatYukleUygula, mevzuatYuklemePasif } from '@/app/(app)/dilekceler/kutuphane/actions'

const RAY = '00000000-0000-4000-8000-00000000000a'
const ZURICH = '00000000-0000-4000-8000-00000000000b'
const BASKA = '00000000-0000-4000-8000-00000000000c'
const kaynakId = '00000000-0000-4000-8000-0000000000f1'
const guncelleme = '2026-09-27T10:00:00.000Z'
const kayit = {
  id: kaynakId, musteriId: RAY, tur: 'MEVZUAT', kunye: 'İİK m.67/1', alinti: 'metin', resmiUrl: 'https://www.mevzuat.gov.tr/mevzuatmetin/1.3.2004.pdf',
  erisimTarihi: null, yururlukBas: null, yururlukBit: null, etiket: 'YERLESIK', durum: 'DOGRULANDI', kapsamNotu: null, rucuSebebiKodlari: [],
  bilgiBankasiYolu: null, icerikOzet: 'x', aktif: true, dogrulayanId: 'yelda', dogrulamaAt: new Date(), yuklemeId: 'yk-1', kopyaKaynakId: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('DILEKCE_V2', 'avukat')
  m.ctx.mockResolvedValue({ dbUser: { id: 'yelda', aktif: true, rol: 'ADMIN' }, aktifMusteriId: RAY, izinli: [RAY, ZURICH] })
  m.musteri.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === BASKA ? null : { id: where.id, ad: where.id === RAY ? 'Ray' : 'Zurich' }))
  m.mkFindFirst.mockResolvedValue(kayit)
  m.mkFindMany.mockResolvedValue([])
  m.mkCreate.mockResolvedValue({ id: 'kopya' })
  m.mkUpdateMany.mockResolvedValue({ count: 1 })
  m.aktivite.mockResolvedValue({})
})

describe('atıf kütüphanesi eylemleri', () => {
  it('avukat olmayan kullanıcı işaretleyemez', async () => {
    m.ctx.mockResolvedValue({ dbUser: { id: 'yrd', aktif: true, rol: 'AVUKAT_YRD' }, aktifMusteriId: RAY, izinli: [RAY] })
    expect((await mevzuatDurumKaydet({ kaynakId, durum: 'DOGRULANDI', beklenenGuncelleme: guncelleme })).ok).toBe(false)
    expect(m.mkUpdateMany).not.toHaveBeenCalled()
  })

  it('doğrulama kaydı: kim, ne zaman, resmî bağlantı Aktivite\'ye yazılır; sorgu müvekkille sınırlı', async () => {
    m.mkFindFirst.mockResolvedValue({ ...kayit, durum: 'TEYIT_GEREKLI' })
    expect((await mevzuatDurumKaydet({ kaynakId, durum: 'DOGRULANDI', beklenenGuncelleme: guncelleme })).ok).toBe(true)
    expect(m.mkFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: kaynakId, musteriId: RAY } }))
    expect(m.mkUpdateMany).toHaveBeenCalledWith({
      where: { id: kaynakId, musteriId: RAY, aktif: true, updatedAt: new Date(guncelleme) },
      data: expect.objectContaining({ durum: 'DOGRULANDI', dogrulayanId: 'yelda', dogrulamaAt: expect.any(Date) }),
    })
    expect(m.aktivite.mock.calls[0][0].data.detayJson).toMatchObject({ onceki: 'TEYIT_GEREKLI', yeni: 'DOGRULANDI', resmiUrl: kayit.resmiUrl })
  })

  it('resmî bağlantısı olmayan kayıt doğrulanamaz; KULLANMA gerekçe ister', async () => {
    m.mkFindFirst.mockResolvedValue({ ...kayit, resmiUrl: null })
    expect(await mevzuatDurumKaydet({ kaynakId, durum: 'DOGRULANDI', beklenenGuncelleme: guncelleme })).toMatchObject({ ok: false, error: expect.stringMatching(/Resmî bağlantısı/) })
    m.mkFindFirst.mockResolvedValue(kayit)
    expect((await mevzuatDurumKaydet({ kaynakId, durum: 'KULLANMA', beklenenGuncelleme: guncelleme })).ok).toBe(false)
    expect(m.mkUpdateMany).not.toHaveBeenCalled()
  })

  it('Zurich\'e kopyala: kopya TEYİT GEREKLİ başlar, doğrulayan ve yükleme kimliği taşınmaz (kabul 5)', async () => {
    const r = await mevzuatKopyala({ kaynakId, hedefMusteriId: ZURICH })
    expect(r).toEqual({ ok: true, hedefAdi: 'Zurich' })
    expect(m.mkCreate.mock.calls[0][0].data).toMatchObject({ musteriId: ZURICH, kunye: 'İİK m.67/1', durum: 'TEYIT_GEREKLI', dogrulayanId: null, dogrulamaAt: null, yuklemeId: null, kopyaKaynakId: kaynakId })
  })

  it('erişilmeyen ya da aynı müşteriye kopyalanamaz', async () => {
    expect((await mevzuatKopyala({ kaynakId, hedefMusteriId: BASKA })).ok).toBe(false)
    expect((await mevzuatKopyala({ kaynakId, hedefMusteriId: RAY })).ok).toBe(false)
    expect(m.mkCreate).not.toHaveBeenCalled()
  })

  it('kuru önizleme hiçbir şey yazmaz', async () => {
    const r = await mevzuatKuruOnizle()
    expect(r.ok && r.plan.eklenecek).toHaveLength(20)
    expect(m.mkCreate).not.toHaveBeenCalled()
    expect(m.mkUpdate).not.toHaveBeenCalled()
    expect(m.mkFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { musteriId: RAY } }))
  })

  it('gerçek yükleme yalnız yönetici ve onaylanan planla', async () => {
    m.ctx.mockResolvedValue({ dbUser: { id: 'av', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: RAY, izinli: [RAY] })
    expect((await mevzuatYukleUygula({ planOzeti: '0123456789abcdef' })).ok).toBe(false)
    m.ctx.mockResolvedValue({ dbUser: { id: 'yelda', aktif: true, rol: 'ADMIN' }, aktifMusteriId: RAY, izinli: [RAY] })
    expect(await mevzuatYukleUygula({ planOzeti: '0123456789abcdef' })).toMatchObject({ ok: false, error: expect.stringMatching(/kuru çalıştırmadan sonra değişti/) })
    expect(m.mkCreate).not.toHaveBeenCalled()
    const kuru = await mevzuatKuruOnizle()
    const r = await mevzuatYukleUygula({ planOzeti: kuru.ok ? kuru.plan.ozet : '' })
    expect(r).toMatchObject({ ok: true, yazilan: 20 })
    expect(m.mkCreate).toHaveBeenCalledTimes(20)
    expect(m.mkCreate.mock.calls.every((c) => c[0].data.musteriId === RAY && String(c[0].data.yuklemeId).startsWith('S33-'))).toBe(true)
  })

  it('yükleme kimliğiyle toplu pasif: kuru kip yazmaz', async () => {
    m.mkFindMany.mockResolvedValue([{ id: 'a', kunye: 'İİK m.67/1', icerikOzet: 'x', aktif: true, durum: 'TEYIT_GEREKLI', yuklemeId: 'yk-1' }])
    expect(await mevzuatYuklemePasif({ yuklemeId: 'yk-1', kuru: true })).toMatchObject({ ok: true, etkilenecek: ['İİK m.67/1'], yazilan: 0 })
    expect(m.mkUpdateMany).not.toHaveBeenCalled()
    expect(await mevzuatYuklemePasif({ yuklemeId: 'yk-1', kuru: false })).toMatchObject({ ok: true, yazilan: 1 })
    expect(m.mkUpdateMany).toHaveBeenCalledWith({ where: { musteriId: RAY, yuklemeId: 'yk-1', aktif: true }, data: { aktif: false, durum: 'KULLANMA' } })
  })
})
