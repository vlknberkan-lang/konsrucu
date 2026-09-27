/**
 * S05/S15 · Eski `durum` alanında ASİMETRİK kural (lib/konsrucu/takip-olay.ts, lib/konsrucu/durum.ts) ve bayraklar.
 *
 * 06 M3: UYAP olayı eski durumu yalnız riski ARTIRAN yönde değiştirir (gerçek tebliğ, itiraz). UYAP'tan gelen
 * kesinleşme ve kapanış kaydedilir ama durumu değiştirmez ve görev KAPATMAZ. Elle girilen olay avukat kararıdır.
 * kip verilmeyen eski çağıranlar Faz 1 davranışını korur (tests/takip-olay.test.ts ayrıca kilitler).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DosyaDurum } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rucuDosyasi: { findUnique: vi.fn(), update: vi.fn((a: unknown) => a) },
    takipOlayi: { create: vi.fn((a: unknown) => ({ id: 'olay-1', ...(a as object) })), findFirst: vi.fn(), findMany: vi.fn(async () => []) },
    asama: { findMany: vi.fn(async () => []) },
    aktivite: { create: vi.fn(() => ({ id: 'akt-1' })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))
vi.mock('@/lib/konsrucu/onemli-olay', async (orijinal) => ({ ...(await orijinal<typeof import('@/lib/konsrucu/onemli-olay')>()), onemliOlayTespit: vi.fn() }))
vi.mock('@/lib/konsrucu/teblig-gorev', async (orijinal) => ({
  ...(await orijinal<typeof import('@/lib/konsrucu/teblig-gorev')>()), tebligGorevleriOlustur: vi.fn(), tebligGorevleriKapat: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { olayHedefDurum, takipOlayKaydet } from '@/lib/konsrucu/takip-olay'
import { riskiAzaltirMi, RISKI_AZALTAN_DURUMLAR } from '@/lib/konsrucu/durum'
import { eksenAcik, eksenKipi, uyapOlayDurumKipi } from '@/lib/konsrucu/eksen/bayrak'
import { tebligGorevleriKapat, tebligGorevleriOlustur } from '@/lib/konsrucu/teblig-gorev'

const UYAP = { kaynak: 'uyap' }
const findUnique = vi.mocked(prisma.rucuDosyasi.findUnique)
const update = vi.mocked(prisma.rucuDosyasi.update)
const olayCreate = vi.mocked(prisma.takipOlayi.create)

beforeEach(() => vi.clearAllMocks())

describe('bayraklar — güvenli varsayılan', () => {
  it('UYAP_OLAY_DURUM varsayılan asimetrik; bilinmeyen değer asimetrik', () => {
    expect(uyapOlayDurumKipi({})).toBe('asimetrik')
    expect(uyapOlayDurumKipi({ UYAP_OLAY_DURUM: 'kapali' })).toBe('kapali')
    expect(uyapOlayDurumKipi({ UYAP_OLAY_DURUM: 'ESKI' })).toBe('eski')
    expect(uyapOlayDurumKipi({ UYAP_OLAY_DURUM: 'acik' })).toBe('asimetrik')
  })
  it('EKSEN_KIPI varsayılan kapalı (yeni davranış bayrak arkasında); yalnız "golge" açar', () => {
    expect(eksenKipi({})).toBe('kapali')
    expect(eksenAcik({})).toBe(false)
    expect(eksenKipi({ EKSEN_KIPI: 'golge' })).toBe('golge')
    expect(eksenAcik({ EKSEN_KIPI: 'GOLGE' })).toBe(true)
    expect(eksenKipi({ EKSEN_KIPI: 'canli' })).toBe('kapali')
  })
})

describe('riskiAzaltirMi', () => {
  it('kesinleşme, infaz, tahsil, kapanış riski azaltır; tebliğ ve itiraz azaltmaz', () => {
    for (const d of [DosyaDurum.KESINLESTI, DosyaDurum.INFAZ, DosyaDurum.TAHSIL, DosyaDurum.KAPANDI]) expect(riskiAzaltirMi(d)).toBe(true)
    for (const d of [DosyaDurum.TEBLIG_EDILDI, DosyaDurum.ITIRAZ, DosyaDurum.DAVA]) expect(riskiAzaltirMi(d)).toBe(false)
    expect(RISKI_AZALTAN_DURUMLAR.size).toBe(4)
  })
})

describe('olayHedefDurum — kip', () => {
  it('asimetrik: UYAP KESİNLEŞTİ ve KAPANDI durumu DEĞİŞTİRMEZ; UYAP itiraz ve gerçek tebliğ değiştirir', () => {
    const k = { kip: 'asimetrik' as const }
    expect(olayHedefDurum({ tip: 'KESINLESTI', aciklama: 'Kesinleşme Bilgisi Kaydedildi', hamJson: UYAP }, DosyaDurum.TEBLIG_EDILDI, k)).toBeUndefined()
    expect(olayHedefDurum({ tip: 'KAPANDI', hamJson: UYAP }, DosyaDurum.ITIRAZ, k)).toBeUndefined()
    expect(olayHedefDurum({ tip: 'ITIRAZ', aciklama: 'Borca İtiraz', hamJson: UYAP }, DosyaDurum.TEBLIG_EDILDI, k)).toBe(DosyaDurum.ITIRAZ)
    expect(olayHedefDurum({ tip: 'TEBLIG', aciklama: 'Tebligat Mazbatası', hamJson: UYAP }, DosyaDurum.TAKIP_ACILDI, k)).toBe(DosyaDurum.TEBLIG_EDILDI)
  })
  it('asimetrik: UYAP itirazı kanıtsız KESİNLEŞTİ\'yi geri alır (riski artıran yön)', () => {
    expect(olayHedefDurum({ tip: 'ITIRAZ', hamJson: UYAP }, DosyaDurum.KESINLESTI, { kip: 'asimetrik', gercekKesinlesmeVar: false })).toBe(DosyaDurum.ITIRAZ)
  })
  it('asimetrik: ELLE girilen kesinleşme ve kapanış avukat kararıdır → durumu değiştirir', () => {
    expect(olayHedefDurum({ tip: 'KESINLESTI' }, DosyaDurum.TEBLIG_EDILDI, { kip: 'asimetrik' })).toBe(DosyaDurum.KESINLESTI)
    expect(olayHedefDurum({ tip: 'KAPANDI' }, DosyaDurum.ITIRAZ, { kip: 'asimetrik' })).toBe(DosyaDurum.KAPANDI)
  })
  it('kapali: UYAP olayı durumu hiç değiştirmez; elle olay değiştirir', () => {
    expect(olayHedefDurum({ tip: 'TEBLIG', aciklama: 'Tebligat Mazbatası', hamJson: UYAP }, DosyaDurum.TAKIP_ACILDI, { kip: 'kapali' })).toBeUndefined()
    expect(olayHedefDurum({ tip: 'ITIRAZ', hamJson: UYAP }, DosyaDurum.TEBLIG_EDILDI, { kip: 'kapali' })).toBeUndefined()
    expect(olayHedefDurum({ tip: 'ITIRAZ' }, DosyaDurum.TEBLIG_EDILDI, { kip: 'kapali' })).toBe(DosyaDurum.ITIRAZ)
  })
  it('eski ya da kip yok: Faz 1 davranışı (UYAP gerçek kesinleşme kaydı ilerletir)', () => {
    expect(olayHedefDurum({ tip: 'KESINLESTI', hamJson: UYAP }, DosyaDurum.ITIRAZ, { kip: 'eski' })).toBe(DosyaDurum.KESINLESTI)
    expect(olayHedefDurum({ tip: 'KESINLESTI', hamJson: UYAP }, DosyaDurum.ITIRAZ)).toBe(DosyaDurum.KESINLESTI)
  })
  it('HACIZ hiçbir kipte durum değiştirmez (docs/04 K2)', () => {
    for (const kip of ['asimetrik', 'kapali', 'eski'] as const) {
      expect(olayHedefDurum({ tip: 'HACIZ', hamJson: UYAP }, DosyaDurum.TEBLIG_EDILDI, { kip })).toBeUndefined()
    }
  })
})

describe('takipOlayKaydet — asimetrik kip ve aday kolonları', () => {
  it('UYAP KESİNLEŞTİ: olay kaydedilir, durum değişmez, İİK 78 görevi KAPANMAZ', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.ITIRAZ } as never)
    const id = await takipOlayKaydet('d1', null, { tip: 'KESINLESTI', tarih: new Date('2026-07-10'), tutar: null, aciklama: 'Kesinleşme Bilgisi Kaydedildi', hamJson: UYAP }, { kip: 'asimetrik' })
    expect(id).toBe('olay-1')
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledTimes(1)
    expect(vi.mocked(tebligGorevleriKapat)).not.toHaveBeenCalled()
  })
  it('UYAP KAPANDI asimetrikte görev kapatmaz; eski kipte kapatır', async () => {
    findUnique.mockResolvedValue({ durum: DosyaDurum.TEBLIG_EDILDI } as never)
    await takipOlayKaydet('d1', null, { tip: 'KAPANDI', tarih: new Date('2026-07-10'), tutar: null, aciklama: 'Kapandı', hamJson: UYAP }, { kip: 'asimetrik' })
    expect(vi.mocked(tebligGorevleriKapat)).not.toHaveBeenCalled()
    await takipOlayKaydet('d1', null, { tip: 'KAPANDI', tarih: new Date('2026-07-10'), tutar: null, aciklama: 'Kapandı', hamJson: UYAP }, { kip: 'eski' })
    expect(vi.mocked(tebligGorevleriKapat)).toHaveBeenCalledTimes(1)
    findUnique.mockReset()
  })
  it('gerçek tebliğ görevi (erken hatırlatma) her kipte üretilir', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TAKIP_ACILDI } as never)
    await takipOlayKaydet('d1', null, { tip: 'TEBLIG', tarih: new Date('2026-06-25'), tutar: null, aciklama: 'Tebligat Mazbatası', hamJson: UYAP }, { kip: 'kapali' })
    expect(vi.mocked(tebligGorevleriOlustur)).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled() // kapalı kip: durum donuk
  })
  it('aday kolonları aynı satıra yazılır', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TEBLIG_EDILDI } as never)
    await takipOlayKaydet('d1', null, {
      tip: 'ITIRAZ', tarih: new Date('2026-06-24'), tutar: null, aciklama: 'Borca İtiraz Talebi', hamJson: UYAP,
      aday: { altTip: 'ITIRAZ', teyit: 'ADAY', kaynakTuru: 'UYAP_EVRAK', kural: 'EK1-ITIRAZ@1', hukukiTarih: new Date('2026-06-24'), tekilAnahtar: 'ITIRAZ|2026-06-24|m:x' },
    }, { kip: 'asimetrik' })
    const data = (olayCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ tip: 'ITIRAZ', altTip: 'ITIRAZ', teyit: 'ADAY', kural: 'EK1-ITIRAZ@1', tekilAnahtar: 'ITIRAZ|2026-06-24|m:x' })
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.ITIRAZ } })
  })
  it('aday verilmezse satır eskisi gibi (teyit yok)', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TEBLIG_EDILDI } as never)
    await takipOlayKaydet('d1', 'u1', { tip: 'DURUM', tarih: null, tutar: null, aciklama: 'not' })
    const data = (olayCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).not.toHaveProperty('teyit')
    expect(data.tarih).toBeNull() // tarih uydurulmaz
  })
})
