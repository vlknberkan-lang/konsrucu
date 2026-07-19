/**
 * Tebliğ süre görevleri regresyonları (Prisma mock'lu) — İİK m.78 haciz görevi üretimi + kapanış:
 *   • Kapanmış dosyada (durum/UYAP) görev ÜRETİLMEZ (2026-07-11'de 49 yanlış görev iptal edilmişti).
 *   • İtiraz penceresi (m.62) görevi artık üretilmez; yalnız HACİZ görevi doğar.
 *   • Vade = tebliğ + 1 yıl − 30 gün; başlıkta gerçek son gün.
 *   • Kapanış kancaları olay tipine göre doğru önekleri IPTAL eder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rucuDosyasi: { findUnique: vi.fn() },
    kullanici: { findFirst: vi.fn() },
    takipGorevi: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    aktivite: { create: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  tebligGorevleriOlustur, tebligGorevleriKapat,
  HACIZ_GOREV_ONEK, ITIRAZ_GOREV_ONEK, HACIZ_UYARI_ERKEN_GUN,
} from '@/lib/konsrucu/teblig-gorev'
import { tarihTR } from '@/lib/konsrucu/format'

const findUnique = vi.mocked(prisma.rucuDosyasi.findUnique)
const gorevFindFirst = vi.mocked(prisma.takipGorevi.findFirst)
const gorevCreate = vi.mocked(prisma.takipGorevi.create)
const updateMany = vi.mocked(prisma.takipGorevi.updateMany)

const aktifDosya = { musteriId: 'm1', atananKullaniciId: 'u1', durum: 'TEBLIG_EDILDI', uyapDurum: 'Açık' }

beforeEach(() => {
  vi.clearAllMocks()
  gorevFindFirst.mockResolvedValue(null as never)
})

describe('tebligGorevleriOlustur', () => {
  it('kapanmış dosyada (durum TAHSIL) görev üretmez', async () => {
    findUnique.mockResolvedValueOnce({ ...aktifDosya, durum: 'TAHSIL' } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(gorevCreate).not.toHaveBeenCalled()
  })

  it('UYAP "Kapalı" diyorsa görev üretmez (durum güncel olmasa bile)', async () => {
    findUnique.mockResolvedValueOnce({ ...aktifDosya, uyapDurum: 'İnfazen kapandı' } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(gorevCreate).not.toHaveBeenCalled()
  })

  it('aktif dosyada YALNIZ haciz görevi doğar; itiraz penceresi üretilmez', async () => {
    findUnique.mockResolvedValueOnce(aktifDosya as never)
    const teblig = new Date(2026, 2, 15) // 15 Mart 2026
    await tebligGorevleriOlustur('d1', teblig, 'u9')
    expect(gorevCreate).toHaveBeenCalledOnce()
    const data = gorevCreate.mock.calls[0][0].data as { baslik: string; sonTarih: Date; sorumluId: string | null }
    expect(data.baslik.startsWith(HACIZ_GOREV_ONEK)).toBe(true)
    expect(data.baslik.includes(ITIRAZ_GOREV_ONEK)).toBe(false)
    // gerçek son gün = tebliğ + 1 yıl; görev vadesi 30 gün önce
    const hacizSon = new Date(2027, 2, 15)
    expect(data.baslik).toContain(tarihTR(hacizSon))
    const beklenenVade = new Date(hacizSon.getTime() - HACIZ_UYARI_ERKEN_GUN * 86_400_000)
    expect(data.sonTarih.getTime()).toBe(beklenenVade.getTime())
    expect(data.sorumluId).toBe('u1') // dosyanın atananı
  })

  it('aynı başlıklı görev varsa ikinciyi açmaz (dedup)', async () => {
    findUnique.mockResolvedValueOnce(aktifDosya as never)
    gorevFindFirst.mockResolvedValueOnce({ id: 'g-var' } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(gorevCreate).not.toHaveBeenCalled()
  })
})

describe('tebligGorevleriKapat — olay tipine göre önekler', () => {
  const onekleri = () => {
    const w = updateMany.mock.calls[0][0].where as { OR: Array<{ baslik: { startsWith: string } }> }
    return w.OR.map((o) => o.baslik.startsWith).sort()
  }

  it('ITIRAZ yalnız itiraz-penceresi görevlerini kapatır (haciz görevi yaşar)', async () => {
    await tebligGorevleriKapat('d1', 'ITIRAZ')
    expect(onekleri()).toEqual([ITIRAZ_GOREV_ONEK])
  })

  it('HACIZ her iki öneki kapatır (takip kesinleşti)', async () => {
    await tebligGorevleriKapat('d1', 'HACIZ')
    expect(onekleri()).toEqual([HACIZ_GOREV_ONEK, ITIRAZ_GOREV_ONEK].sort())
  })

  it('KAPANDI her iki öneki kapatır', async () => {
    await tebligGorevleriKapat('d1', 'KAPANDI')
    expect(onekleri()).toEqual([HACIZ_GOREV_ONEK, ITIRAZ_GOREV_ONEK].sort())
  })

  it('DURUM/TAHSILAT/TEBLIG hiçbir görevi kapatmaz', async () => {
    await tebligGorevleriKapat('d1', 'DURUM')
    await tebligGorevleriKapat('d1', 'TAHSILAT')
    await tebligGorevleriKapat('d1', 'TEBLIG')
    expect(updateMany).not.toHaveBeenCalled()
  })
})
