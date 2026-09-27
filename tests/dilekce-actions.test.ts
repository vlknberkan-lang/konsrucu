import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  ctx: vi.fn(), findMusteri: vi.fn(), findDosya: vi.fn(), findCikti: vi.fn(), ayarlar: vi.fn(), create: vi.fn(), updateMany: vi.fn(), aktivite: vi.fn(), ai: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/konsrucu/ai-util', () => ({ anthropic: () => ({ messages: { create: m.ai } }) }))
vi.mock('@/lib/prisma', () => {
  const db = { musteri: { findFirst: m.findMusteri }, rucuDosyasi: { findFirst: m.findDosya }, uretilenCikti: { findFirst: m.findCikti, create: m.create, updateMany: m.updateMany }, ayarlar: { findUnique: m.ayarlar }, aktivite: { create: m.aktivite } }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})
import { davaTaslagiKaydet, davaTaslagiUret } from '@/app/(app)/dilekceler/actions'

const dosyaId = '00000000-0000-4000-8000-000000000001'
const ciktiId = '00000000-0000-4000-8000-000000000002'
const belgeId = '00000000-0000-4000-8000-000000000003'
const uretGirdi = { dosyaId, tur: 'BEYAN' as const, talimat: 'Ödeme dekontunu sun.' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  m.ctx.mockResolvedValue({ dbUser: { id: 'avukat', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: 'tenant-1' })
  m.findMusteri.mockResolvedValue({ id: 'tenant-1' })
  m.ayarlar.mockResolvedValue(null)
  m.create.mockResolvedValue({ id: ciktiId })
  m.aktivite.mockResolvedValue({})
  m.findDosya.mockResolvedValue({
    id: dosyaId, musteriId: 'tenant-1', hukukDosyaNo: 'H-1', borclular: [],
    belgeler: [{ id: belgeId, dosyaAdi: 'UYAP.pdf', extractedText: 'Tarafça ödeme dekontu dosyaya sunuldu.', kategori: 'DIGER' }],
    asamalar: [], notlar: [], olaylar: [], ciktilar: [], odemeler: [],
  })
  m.ai.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '⟨Mahkeme⟩ SAYIN HÂKİMLİĞİNE\nKONU: Ödeme dekontunun sunulmasıdır.\nAÇIKLAMALAR: Ödeme dekontu ekte sunulmuştur.\nSONUÇ VE İSTEM: ⟨Talep⟩' }] })
})

describe('dilekçe mutasyon güvenliği', () => {
  it('pasif müşteri için üretim ve düzenleme yapmaz', async () => {
    m.findMusteri.mockResolvedValue(null)
    m.findCikti.mockResolvedValue({ dosyaId, durum: 'TASLAK' })
    m.updateMany.mockResolvedValue({ count: 1 })
    expect((await davaTaslagiUret(uretGirdi)).ok).toBe(false)
    expect((await davaTaslagiKaydet({ ciktiId, icerik: 'Yeni metin', beklenenIcerik: null, durum: 'TASLAK' })).ok).toBe(false)
    expect(m.findMusteri).toHaveBeenCalledWith({ where: { id: 'tenant-1', aktif: true }, select: { id: true } })
    expect(m.ai).not.toHaveBeenCalled()
    expect(m.updateMany).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  it.each([{ aktif: false, rol: 'AVUKAT' }, { aktif: true, rol: 'GORUNTULEYEN' }])('pasif/görüntüleyen kullanıcı üretim ve kaydetme yapamaz: %j', async (user) => {
    m.ctx.mockResolvedValue({ dbUser: { id: 'user', ...user }, aktifMusteriId: 'tenant-1' })
    expect((await davaTaslagiUret(uretGirdi)).ok).toBe(false)
    expect((await davaTaslagiKaydet({ ciktiId, icerik: 'Yeni metin', beklenenIcerik: null, durum: 'TASLAK' })).ok).toBe(false)
    expect(m.ai).not.toHaveBeenCalled()
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('aktif tenant kapsamında bulunamayan dosyayı üretime göndermez', async () => {
    m.findDosya.mockResolvedValue(null)
    expect((await davaTaslagiUret(uretGirdi)).ok).toBe(false)
    expect(m.findDosya).toHaveBeenCalledWith(expect.objectContaining({ where: { id: dosyaId, musteriId: 'tenant-1' } }))
    expect(m.ai).not.toHaveBeenCalled()
  })

  it('yeniden üretimde mevcut çıktıyı değiştirmeden yeni kaynaklı taslak oluşturur', async () => {
    const r = await davaTaslagiUret(uretGirdi)
    expect(r.ok).toBe(true)
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ dosyaId, durum: 'TASLAK', tip: 'DILEKCE', kaynaklar: { create: [{ belgeId }] } }) }))
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('eşzamanlı düzenleme çakışırsa başarı veya yeni aktivite bildirmez', async () => {
    m.findCikti.mockResolvedValue({ dosyaId, durum: 'TASLAK' })
    m.updateMany.mockResolvedValue({ count: 0 })
    const r = await davaTaslagiKaydet({ ciktiId, icerik: 'Yeni metin', beklenenIcerik: 'Eski metin', durum: 'TASLAK' })
    expect(r.ok).toBe(false)
    expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: ciktiId, icerik: 'Eski metin', dosya: { musteriId: 'tenant-1' } }) }))
    expect(m.aktivite).not.toHaveBeenCalled()
  })

  it('üretim token sınırında kesilirse eksik dilekçe kaydetmez', async () => {
    m.ai.mockResolvedValue({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Eksik metin' }] })
    expect((await davaTaslagiUret(uretGirdi)).ok).toBe(false)
    expect(m.create).not.toHaveBeenCalled()
  })
})
