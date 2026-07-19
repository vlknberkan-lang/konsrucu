/**
 * AI kredi katmanı regresyonları — PARA yolu kilitleri:
 * fiyat tablosu, kredi bedelleri, atomik düşüm (yarış/yetersiz bakiye), KURUMSAL muafiyeti,
 * FREE dosya limiti. (Prisma mock'lu; gerçek DB'ye gidilmez.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    musteri: { findUnique: vi.fn(), updateMany: vi.fn() },
    rucuDosyasi: { count: vi.fn() },
    aiKullanim: { create: vi.fn() },
    sistemOlay: { create: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  KREDI_BEDELI, maliyetUsd, krediDus, krediIade, dosyaLimitKontrol,
  KrediYetersizHata, FREE_DOSYA_LIMITI, aiDurduruldu,
} from '@/lib/konsrucu/ai-kredi'

const findUnique = vi.mocked(prisma.musteri.findUnique)
const updateMany = vi.mocked(prisma.musteri.updateMany)
const dosyaCount = vi.mocked(prisma.rucuDosyasi.count)

beforeEach(() => vi.clearAllMocks())

describe('KREDI_BEDELI — pazarlama tablosuyla birebir (değişirse bilinçli değiştir)', () => {
  it('bedeller sabit', () => {
    expect(KREDI_BEDELI).toEqual({ cikarim: 3, dilekce: 3, emsal: 2, soru: 1, yol: 1, makbuz: 0, foto: 0 })
  })
})

describe('maliyetUsd', () => {
  it('Sonnet: 1M giriş = $3, 1M çıkış = $15', () => {
    expect(maliyetUsd('claude-sonnet-4-6', 1_000_000, 0)).toBeCloseTo(3)
    expect(maliyetUsd('claude-sonnet-4-6', 0, 1_000_000)).toBeCloseTo(15)
  })
  it('Haiku: $1/$5', () => {
    expect(maliyetUsd('claude-haiku-4-5-20251001', 1_000_000, 1_000_000)).toBeCloseTo(6)
  })
  it('tipik çıkarım (~30K giriş + 2K çıkış, Sonnet) ≈ $0.12', () => {
    expect(maliyetUsd('claude-sonnet-4-6', 30_000, 2_000)).toBeCloseTo(0.12)
  })
  it('bilinmeyen model muhafazakâr Sonnet fiyatına düşer', () => {
    expect(maliyetUsd('claude-yeni-model', 1_000_000, 0)).toBeCloseTo(3)
  })
})

describe('krediDus — atomik düşüm', () => {
  it('KURUMSAL plan hiç düşmez (updateMany çağrılmaz)', async () => {
    findUnique.mockResolvedValueOnce({ plan: 'KURUMSAL' } as never)
    await krediDus('m1', 3)
    expect(updateMany).not.toHaveBeenCalled()
  })
  it('FREE + yeterli bakiye: koşullu (gte) decrement — yarış koşulu DB seviyesinde çözülür', async () => {
    findUnique.mockResolvedValueOnce({ plan: 'FREE' } as never)
    updateMany.mockResolvedValueOnce({ count: 1 } as never)
    await krediDus('m1', 3)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', aiKredi: { gte: 3 } },
      data: { aiKredi: { decrement: 3 } },
    })
  })
  it('yetersiz bakiye (count=0) → KrediYetersizHata, bakiye değişmez', async () => {
    findUnique.mockResolvedValueOnce({ plan: 'FREE' } as never)
    updateMany.mockResolvedValueOnce({ count: 0 } as never)
    await expect(krediDus('m1', 3)).rejects.toBeInstanceOf(KrediYetersizHata)
  })
  it('bedel 0 → hiçbir sorgu yok (makbuz/foto yüzeyleri)', async () => {
    await krediDus('m1', 0)
    expect(findUnique).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })
})

describe('krediIade', () => {
  it('KURUMSAL hariç increment; hata yutulur (akış bozulmaz)', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 } as never)
    await krediIade('m1', 3)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', plan: { not: 'KURUMSAL' } },
      data: { aiKredi: { increment: 3 } },
    })
    updateMany.mockRejectedValueOnce(new Error('db down'))
    await expect(krediIade('m1', 3)).resolves.toBeUndefined() // fırlatmaz
  })
})

describe('dosyaLimitKontrol — FREE 20 aktif dosya', () => {
  it('FREE + limit dolu → hata; kapalı dosyalar sayılmaz (notIn süzgeci)', async () => {
    findUnique.mockResolvedValueOnce({ plan: 'FREE' } as never)
    dosyaCount.mockResolvedValueOnce(FREE_DOSYA_LIMITI as never)
    await expect(dosyaLimitKontrol('m1', 1)).rejects.toThrow(/aktif dosya/)
    expect(dosyaCount).toHaveBeenCalledWith({
      where: { musteriId: 'm1', durum: { notIn: ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] } },
    })
  })
  it('toplu import limiti aşacaksa daha başlamadan reddedilir', async () => {
    findUnique.mockResolvedValueOnce({ plan: 'FREE' } as never)
    dosyaCount.mockResolvedValueOnce(5 as never)
    await expect(dosyaLimitKontrol('m1', 100)).rejects.toThrow(/aktif dosya/)
  })
  it('KURUMSAL/BASLANGIC limite takılmaz', async () => {
    findUnique.mockResolvedValueOnce({ plan: 'KURUMSAL' } as never)
    await dosyaLimitKontrol('m1', 500)
    expect(dosyaCount).not.toHaveBeenCalled()
  })
})

describe('aiDurduruldu — acil fren', () => {
  it('AI_DURDUR=1 iken true', () => {
    const eski = process.env.AI_DURDUR
    process.env.AI_DURDUR = '1'
    expect(aiDurduruldu()).toBe(true)
    process.env.AI_DURDUR = ''
    expect(aiDurduruldu()).toBe(false)
    if (eski === undefined) delete process.env.AI_DURDUR
    else process.env.AI_DURDUR = eski
  })
})
