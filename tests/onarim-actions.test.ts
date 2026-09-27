import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  ctx: vi.fn(), revalidate: vi.fn(), musteri: vi.fn(),
  karar: vi.fn(), toplu: vi.fn(), uygula: vi.fn(), satirGeri: vi.fn(), partiGeri: vi.fn(), kuru: vi.fn(),
}))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/prisma', () => ({ prisma: { musteri: { findFirst: m.musteri } } }))
vi.mock('@/lib/konsrucu/onarim/servis', () => ({
  URETILEBILIR_KODLAR: ['R0', 'R1', 'R2'],
  satirKarariVer: m.karar, topluOnayVer: m.toplu, partiyiUygula: m.uygula, satiriGeriAl: m.satirGeri, partiyiGeriAl: m.partiGeri, kuruListeOlustur: m.kuru,
}))

import { onarimKuruListe, onarimPartiGeriAl, onarimPartiUygula, onarimSatirGeriAl, onarimSatirKarari, onarimTopluOnay } from '@/app/(app)/yonetim/veri-onarim/actions'

const ID = '00000000-0000-4000-8000-00000000000a'
const kullanici = (rol: string, aktif = true) => ({ dbUser: { id: 'u1', rol, aktif }, aktifMusteriId: 'tenant-1' })

beforeEach(() => {
  vi.resetAllMocks()
  m.musteri.mockResolvedValue({ id: 'tenant-1' })
  m.uygula.mockResolvedValue({ ok: true, uygulanan: 2, atlanan: 1, gecilen: 0, geriAlinan: 0, atlamaSebepleri: [] })
  m.karar.mockResolvedValue({ ok: true })
})

describe('S13 · Veri Onarımı erişimi', () => {
  it.each(['AVUKAT_YRD', 'GORUNTULEYEN'])('%s hiçbir onarım işlemi yapamaz', async (rol) => {
    m.ctx.mockResolvedValue(kullanici(rol))
    const sonuclar = await Promise.all([
      onarimSatirKarari({ id: ID, karar: 'ONAYLA' }),
      onarimTopluOnay({ parti: 'R1-TUTAR-01' }),
      onarimPartiUygula({ parti: 'R1-TUTAR-01' }),
      onarimSatirGeriAl({ id: ID }),
      onarimPartiGeriAl({ parti: 'R1-TUTAR-01' }),
      onarimKuruListe({ kod: 'R1' }),
    ])
    expect(sonuclar.every((r) => !r.ok)).toBe(true)
    for (const f of [m.karar, m.toplu, m.uygula, m.satirGeri, m.partiGeri, m.kuru]) expect(f).not.toHaveBeenCalled()
  })

  it('pasif avukat da erişemez; pasif müşteride işlem yapılmaz', async () => {
    m.ctx.mockResolvedValue(kullanici('AVUKAT', false))
    expect((await onarimPartiUygula({ parti: 'R1-TUTAR-01' })).ok).toBe(false)
    m.ctx.mockResolvedValue(kullanici('ADMIN'))
    m.musteri.mockResolvedValue(null)
    expect((await onarimPartiUygula({ parti: 'R1-TUTAR-01' })).ok).toBe(false)
    expect(m.uygula).not.toHaveBeenCalled()
  })

  it('avukat aktif müvekkil kapsamında uygular ve sonucu sayılarla görür', async () => {
    m.ctx.mockResolvedValue(kullanici('AVUKAT'))
    const r = await onarimPartiUygula({ parti: 'R2-DURUM-01' })
    expect(r).toEqual({ ok: true, mesaj: expect.stringContaining('Uygulanan: 2 · Atlanan: 1') })
    expect(m.uygula).toHaveBeenCalledWith({ musteriId: 'tenant-1', kullaniciId: 'u1', parti: 'R2-DURUM-01' })
    expect(m.revalidate).toHaveBeenCalledWith('/yonetim/veri-onarim')
  })

  it('geçersiz girdi servis katmanına ulaşmaz', async () => {
    m.ctx.mockResolvedValue(kullanici('ADMIN'))
    expect((await onarimSatirKarari({ id: 'uuid-degil', karar: 'ONAYLA' })).ok).toBe(false)
    expect((await onarimPartiUygula({ parti: "R1'; DROP" })).ok).toBe(false)
    expect((await onarimKuruListe({ kod: 'R5' as 'R1' })).ok).toBe(false)
    expect(m.karar).not.toHaveBeenCalled()
    expect(m.uygula).not.toHaveBeenCalled()
    expect(m.kuru).not.toHaveBeenCalled()
  })
})
