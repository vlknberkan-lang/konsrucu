/**
 * S02 (F5; B05–B09, B18, B19) · eski "Dilekçe üret" hattı sunucuda kapalı: ESKI_DILEKCE_HATTI=acik
 * değilse dilekceUret oturuma/veritabanına/AI'a hiç dokunmadan reddeder. Açık olsa bile (S09) anlatım
 * görselsiz ve maskeli sarmalayıcıdan geçer ('dilekce_eski' yüzeyi; canlıda ayrıca kapalı).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getUser: vi.fn(), kullanici: vi.fn(), dosyaBul: vi.fn(), anlatim: vi.fn(), indir: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'kurgusal-musteri' }) }) }))
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`) } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: m.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ download: m.indir }) } }) }))
vi.mock('@/lib/konsrucu/analiz', () => ({ analizEt: vi.fn(), enIyiHasarFotolari: vi.fn() }))
vi.mock('@/lib/konsrucu/dilekce-ai', () => ({ dilekceAnlatim: m.anlatim }))
vi.mock('@/lib/konsrucu/ai-kredi', () => ({ dosyaLimitKontrol: vi.fn() }))
vi.mock('@/lib/konsrucu/mentor-kural', () => ({ mentorKurallariOku: vi.fn(), mentorKurallariMetne: () => '' }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    kullanici: { findUnique: m.kullanici },
    rucuDosyasi: { findUnique: m.dosyaBul },
    ayarlar: { findUnique: vi.fn(async () => null) },
    uretilenCikti: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'kurgusal-cikti' })) },
    ciktiKaynak: { createMany: vi.fn() },
    aktivite: { create: vi.fn() },
  },
}))
import { dilekceUret } from '@/app/(app)/akilli-giris/actions'

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('ESKI_DILEKCE_HATTI', '')
})

describe('eski dilekçe hattı', () => {
  it('bayrak kapalıyken reddeder; oturum, veritabanı ve AI çağrılmaz', async () => {
    const r = await dilekceUret('kurgusal-dosya')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Dilekçe Masası')
    expect(m.getUser).not.toHaveBeenCalled()
    expect(m.dosyaBul).not.toHaveBeenCalled()
    expect(m.anlatim).not.toHaveBeenCalled()
  })

  it('bilinçli açıldığında bile görsel indirilmez/gönderilmez; anlatıma maske kaynağı verilir', async () => {
    vi.stubEnv('ESKI_DILEKCE_HATTI', 'acik')
    m.getUser.mockResolvedValue({ data: { user: { id: 'kurgusal-avukat' } } })
    m.kullanici.mockResolvedValue({ id: 'kurgusal-avukat', rol: 'AVUKAT', aktif: true, musteriler: [{ musteriId: 'kurgusal-musteri' }] })
    m.dosyaBul.mockResolvedValue({
      id: 'kurgusal-dosya', musteriId: 'kurgusal-musteri', borclular: [{ adUnvan: '[Kurgusal Borçlu]', tcVkn: null, adres: null, rol: 'SURUCU' }],
      odemeler: [], asamalar: [], emsaller: [], cikarimJson: {}, rucuTutari: null, asilAlacak: null, faizBaslangic: null, faizBitis: null, faizTutari: null,
      belgeler: [{ id: 'b1', extractedText: 'Kurgusal tutanak', kategori: 'EHLIYET', dosyaAdi: 'ehliyet.jpg', storagePath: 'd/ehliyet.jpg' }],
    })
    m.anlatim.mockResolvedValue('Kurgusal anlatım')
    const r = await dilekceUret('kurgusal-dosya')
    expect(r.ok).toBe(true)
    expect(m.indir).not.toHaveBeenCalled()
    const [girdi, , maske] = m.anlatim.mock.calls[0]
    expect(girdi).not.toHaveProperty('gorseller')
    expect(maske.kisiler).toContain('[Kurgusal Borçlu]')
  })
})
