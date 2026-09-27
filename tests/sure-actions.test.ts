import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  ctx: vi.fn(), revalidate: vi.fn(), musteri: vi.fn(), dosya: vi.fn(), dava: vi.fn(), belge: vi.fn(),
  sureFind: vi.fn(), sureCreate: vi.fn(), sureUpdateMany: vi.fn(), aktivite: vi.fn(), arabuluculuk: vi.fn(), mail: vi.fn(), olay: vi.fn(),
}))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/konsrucu/mail', () => ({ mailGonder: m.mail }))
vi.mock('@/lib/konsrucu/sistem-olay', () => ({ sistemOlayKaydet: m.olay }))
vi.mock('@/lib/prisma', () => {
  const db = {
    musteri: { findFirst: m.musteri }, rucuDosyasi: { findFirst: m.dosya }, dava: { findFirst: m.dava }, belge: { findFirst: m.belge },
    sure: { findFirst: m.sureFind, create: m.sureCreate, updateMany: m.sureUpdateMany }, aktivite: { create: m.aktivite }, arabuluculuk: { findMany: m.arabuluculuk },
  }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})

import { sureIkinciTeyit, sureKapat, sureOnayla, sureOner, sureTestHatirlatmasi, sureTetikGuncelle } from '@/app/(app)/sureler/actions'
import { isoGun } from '@/lib/konsrucu/sure/takvim'

const DOSYA = '00000000-0000-4000-8000-000000000001'
const BORCLU = '00000000-0000-4000-8000-000000000002'
const SURE = '00000000-0000-4000-8000-000000000003'
const avukat = { id: 'avukat-1', ad: 'Kurgu Avukat', eposta: 'avukat@ornek.test', rol: 'AVUKAT', aktif: true }
const kayitliSure = (p: Record<string, unknown> = {}) => ({
  id: SURE, dosyaId: DOSYA, tur: 'IIK67', durum: 'ACIK', borcluId: BORCLU, onaylananSonGun: null, onaylayanId: null, onayAt: null,
  onerilenSonGun: null, onerilenIhtiyatli: new Date('2027-03-11T21:00:00Z'), hesapIziJson: null, ikinciTeyitId: null,
  tetikTarihi: null, tetikTuru: null, uetsUlasmaTarihi: null, hakimSuresiGun: null, ...p,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.ctx.mockResolvedValue({ dbUser: avukat, aktifMusteriId: 'tenant-1' })
  m.musteri.mockResolvedValue({ id: 'tenant-1' })
  m.dosya.mockResolvedValue({ id: DOSYA, borclular: [{ id: BORCLU }] })
  m.sureFind.mockResolvedValue(null)
  m.sureCreate.mockResolvedValue({ id: SURE })
  m.sureUpdateMany.mockResolvedValue({ count: 1 })
  m.aktivite.mockResolvedValue({})
  m.arabuluculuk.mockResolvedValue([])
})

describe('S24 · süre defteri yetki ve kapsam', () => {
  it('görüntüleyen ve pasif kullanıcı öneri ekleyemez; avukat yardımcısı öneri ekler ama onaylayamaz', async () => {
    m.ctx.mockResolvedValue({ dbUser: { ...avukat, rol: 'GORUNTULEYEN' }, aktifMusteriId: 'tenant-1' })
    expect((await sureOner({ dosyaId: DOSYA, tur: 'IIK67', borcluId: BORCLU, itirazTarihi: '2026-03-12' })).ok).toBe(false)
    m.ctx.mockResolvedValue({ dbUser: { ...avukat, aktif: false }, aktifMusteriId: 'tenant-1' })
    expect((await sureOner({ dosyaId: DOSYA, tur: 'IIK67', borcluId: BORCLU, itirazTarihi: '2026-03-12' })).ok).toBe(false)
    expect(m.sureCreate).not.toHaveBeenCalled()

    m.ctx.mockResolvedValue({ dbUser: { ...avukat, rol: 'AVUKAT_YRD' }, aktifMusteriId: 'tenant-1' })
    expect((await sureOner({ dosyaId: DOSYA, tur: 'IIK67', borcluId: BORCLU, itirazTarihi: '2026-03-12' })).ok).toBe(true)
    const r = await sureOnayla({ sureId: SURE, onaylananSonGun: '2027-03-10', bakilanEvrak: 'İtiraz dilekçesi' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('avukat')
    expect(m.sureUpdateMany).not.toHaveBeenCalled()
  })

  it('başka müvekkilin dosyasına süre eklenmez (sorgu aktif müvekkille sınırlı)', async () => {
    m.dosya.mockResolvedValue(null)
    const r = await sureOner({ dosyaId: DOSYA, tur: 'IIK67', borcluId: BORCLU, itirazTarihi: '2026-03-12' })
    expect(r.ok).toBe(false)
    expect(m.dosya).toHaveBeenCalledWith(expect.objectContaining({ where: { id: DOSYA, musteriId: 'tenant-1' } }))
    expect(m.sureCreate).not.toHaveBeenCalled()
  })
})

describe('S24 · süre önerisi, onay ve kapanış', () => {
  it('İİK 67 borçlu bazındadır: dosyada borçlu varken borçlu seçilmeden eklenmez', async () => {
    const r = await sureOner({ dosyaId: DOSYA, tur: 'IIK67', itirazTarihi: '2026-03-12' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('borçlu')
  })

  it('ileri tarihli tetik kabul edilmez', async () => {
    const r = await sureOner({ dosyaId: DOSYA, tur: 'HMK345', tetikTarihi: '2099-01-01', tetikTuru: 'TEBLIG' })
    expect(r.ok).toBe(false)
    expect(m.sureCreate).not.toHaveBeenCalled()
  })

  it('İİK 67 önerisi ihtiyatlı ve durmalı günü yazar, onaylanan günü YAZMAZ; arabuluculuk durması eklenir', async () => {
    m.arabuluculuk.mockResolvedValue([{ id: 'arb-1', tur: 'DAVA_SARTI', basvuruTarihi: new Date('2026-04-30T21:00:00Z'), sonTutanakTarihi: new Date('2026-05-20T21:00:00Z') }])
    const r = await sureOner({ dosyaId: DOSYA, tur: 'IIK67', borcluId: BORCLU, itirazTarihi: '2026-03-12' })
    expect(r.ok).toBe(true)
    const data = m.sureCreate.mock.calls[0][0].data
    expect(isoGun(data.onerilenIhtiyatli)).toBe('2027-03-12')
    expect(isoGun(data.onerilenSonGun)).toBe('2027-04-01')
    expect(data).not.toHaveProperty('onaylananSonGun')
    expect(data.arabuluculukId).toBe('arb-1')
    expect(data.dayanak).toBe('İİK 67/1')
    expect(data.hesapIziJson.iz.join(' ')).toContain('teyit gerekli')
    expect(m.aktivite).toHaveBeenCalled()
    expect(m.revalidate).toHaveBeenCalledWith(`/akilli-giris/${DOSYA}`)
  })

  it('aynı dosya + tür + borçlu için açık süre varken ikinci öneri açılmaz', async () => {
    m.sureFind.mockResolvedValue({ id: 'baska' })
    const r = await sureOner({ dosyaId: DOSYA, tur: 'IIK67', borcluId: BORCLU, itirazTarihi: '2026-03-12' })
    expect(r.ok).toBe(false)
    expect(m.sureCreate).not.toHaveBeenCalled()
  })

  it('onay: bakılan evrak zorunlu; kapsamlı ve korumalı yazar; ikinci teyit sıfırlanır', async () => {
    m.sureFind.mockResolvedValue(kayitliSure())
    expect((await sureOnayla({ sureId: SURE, onaylananSonGun: '2027-03-10', bakilanEvrak: '' })).ok).toBe(false)
    const r = await sureOnayla({ sureId: SURE, onaylananSonGun: '2027-03-10', bakilanEvrak: 'İtirazın tebliğ mazbatası (UETS)' })
    expect(r.ok).toBe(true)
    const arg = m.sureUpdateMany.mock.calls[0][0]
    expect(arg.where).toMatchObject({ id: SURE, silindiAt: null, dosya: { musteriId: 'tenant-1' } })
    expect(isoGun(arg.data.onaylananSonGun)).toBe('2027-03-10')
    expect(arg.data).toMatchObject({ onaylayanId: 'avukat-1', ikinciTeyitId: null, bakilanEvrak: 'İtirazın tebliğ mazbatası (UETS)' })
    expect(r.ok && r.uyari).toContain('ikinci')
  })

  it('ikinci teyidi günü onaylayan kişi veremez', async () => {
    m.sureFind.mockResolvedValue(kayitliSure({ onaylananSonGun: new Date('2027-03-09T21:00:00Z'), onaylayanId: 'avukat-1' }))
    const r = await sureIkinciTeyit({ sureId: SURE })
    expect(r.ok).toBe(false)
    expect(m.sureUpdateMany).not.toHaveBeenCalled()
  })

  it('tetik değişip öneri kayınca onaylanan gün yeniden onaya düşer', async () => {
    m.sureFind.mockResolvedValue(kayitliSure({ onaylananSonGun: new Date('2027-03-09T21:00:00Z'), onaylayanId: 'avukat-2', onerilenIhtiyatli: new Date('2027-03-11T21:00:00Z') }))
    const r = await sureTetikGuncelle({ sureId: SURE, tetikTarihi: '2026-04-02', tetikTuru: 'TEBLIG' })
    expect(r.ok).toBe(true)
    const data = m.sureUpdateMany.mock.calls[0][0].data
    expect(data).toMatchObject({ onaylananSonGun: null, onaylayanId: null, ikinciTeyitId: null })
    expect(isoGun(data.onerilenIhtiyatli)).toBe('2027-04-02')
    expect(r.ok && r.uyari).toContain('yeniden onay')
  })

  it('"dilekçe hazırlandı" süreyi kapatmaz; kanıtla kapanır', async () => {
    m.sureFind.mockResolvedValue(kayitliSure())
    const r = await sureKapat({ sureId: SURE, kapanisNot: 'Dilekçe hazırlandı, imzaya gidecek' })
    expect(r.ok).toBe(false)
    expect(m.sureUpdateMany).not.toHaveBeenCalled()
    const r2 = await sureKapat({ sureId: SURE, kapanisNot: 'İtirazın iptali dava dilekçesi UYAP\'a gönderildi, evrak listesinde görünüyor' })
    expect(r2.ok).toBe(true)
    expect(m.sureUpdateMany.mock.calls[0][0].data).toMatchObject({ durum: 'KAPANDI', kapatanId: 'avukat-1' })
  })

  it('test hatırlatması console kipinde gönderilmez ve bunu açıkça söyler (B52)', async () => {
    vi.stubEnv('EMAIL_SERVICE', 'console')
    m.sureFind.mockResolvedValue({ id: SURE, tur: 'IIK67', dayanak: 'İİK 67/1', dosyaId: DOSYA, onaylananSonGun: null, onerilenIhtiyatli: new Date('2027-03-11T21:00:00Z'), dosya: { hukukDosyaNo: 'HK-KURGU-1', hasarDosyaNo: null, icraDosyaNo: null } })
    const r = await sureTestHatirlatmasi({ sureId: SURE })
    expect(r.ok && r.uyari).toContain('GÖNDERİLMEDİ')
    expect(m.mail).not.toHaveBeenCalled()
    expect(m.olay).toHaveBeenCalled()

    vi.stubEnv('EMAIL_SERVICE', 'resend')
    m.mail.mockResolvedValue({ ok: true })
    const r2 = await sureTestHatirlatmasi({ sureId: SURE })
    expect(r2.ok).toBe(true)
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: 'avukat@ornek.test', konu: expect.stringContaining('[TEST]') }))
    vi.unstubAllEnvs()
  })
})
