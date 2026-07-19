/**
 * takipOlayKaydet regresyonları (Prisma mock'lu) — en riskli yazma yolunun davranış kilitleri:
 *   • TAHSILAT dosya durumunu İLERLETMEZ (eski bug: kısmi tahsilat açık dosyayı TAHSIL'e çekiyordu).
 *   • HACIZ → KESINLESTI (takip kesinleşmiş demektir).
 *   • Geç gelen TEBLIG ileri evredeki dosyayı GERİ çekemez; olayın kendisi yine kaydedilir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DosyaDurum } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rucuDosyasi: { findUnique: vi.fn(), update: vi.fn((a: unknown) => a) },
    takipOlayi: { create: vi.fn(() => ({ id: 'olay-1' })) },
    aktivite: { create: vi.fn(() => ({ id: 'akt-1' })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))
vi.mock('@/lib/konsrucu/onemli-olay', () => ({
  borcaItirazMi: vi.fn(() => false),
  onemliOlayTespit: vi.fn(),
}))
vi.mock('@/lib/konsrucu/teblig-gorev', () => ({
  tebligGorevleriOlustur: vi.fn(),
  tebligGorevleriKapat: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { takipOlayKaydet } from '@/lib/konsrucu/takip-olay'

const findUnique = vi.mocked(prisma.rucuDosyasi.findUnique)
const update = vi.mocked(prisma.rucuDosyasi.update)
const olayCreate = vi.mocked(prisma.takipOlayi.create)

const olay = (tip: string) => ({ tip, tarih: new Date(2026, 6, 1), tutar: null, aciklama: null })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('takipOlayKaydet — olay → durum', () => {
  it('TAHSILAT durumu asla ilerletmez (kısmi tahsilat kapatmaz)', async () => {
    await takipOlayKaydet('d1', null, olay('TAHSILAT'))
    expect(findUnique).not.toHaveBeenCalled() // eşleme dışı tip için durum sorgusu bile yok
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce() // olay kaydı yine düşer
  })

  it('HACIZ, TEBLIG_EDILDI dosyayı KESINLESTI yapar', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TEBLIG_EDILDI } as never)
    await takipOlayKaydet('d1', null, olay('HACIZ'))
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.KESINLESTI } })
  })

  it('geç gelen TEBLIG, DAVA dosyayı geri çekemez; olay yine kaydedilir', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.DAVA } as never)
    await takipOlayKaydet('d1', null, olay('TEBLIG'))
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce()
  })

  it('TEBLIG, TAKIP_ACILDI dosyayı TEBLIG_EDILDI yapar (normal akış)', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TAKIP_ACILDI } as never)
    await takipOlayKaydet('d1', null, olay('TEBLIG'))
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.TEBLIG_EDILDI } })
  })

  it('bilinmeyen tip (DURUM vb.) durum değiştirmez ama kaydedilir — kör nokta kalmasın', async () => {
    await takipOlayKaydet('d1', null, olay('DURUM'))
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce()
  })
})
