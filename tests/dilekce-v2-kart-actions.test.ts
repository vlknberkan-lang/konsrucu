import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BelgeMetni } from '@/lib/konsrucu/dilekce-v2/alinti'
import type { KartGirdisi } from '@/lib/konsrucu/dilekce-v2/kart'

const m = vi.hoisted(() => ({
  ctx: vi.fn(), revalidate: vi.fn(), ai: vi.fn(),
  musteri: vi.fn(), dosya: vi.fn(), kartFind: vi.fn(), kartCreate: vi.fn(), kartUpdateMany: vi.fn(), aktivite: vi.fn(),
  veri: vi.fn(), gecerli: vi.fn(), metinler: vi.fn(),
}))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/konsrucu/ai-util', async (orig) => ({ ...(await orig<typeof import('@/lib/konsrucu/ai-util')>()), anthropic: () => ({ messages: { create: m.ai } }) }))
vi.mock('@/lib/prisma', () => {
  const db = {
    musteri: { findFirst: m.musteri }, rucuDosyasi: { findFirst: m.dosya }, aktivite: { create: m.aktivite },
    dosyaKarti: { findFirst: m.kartFind, create: m.kartCreate, updateMany: m.kartUpdateMany },
  }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})
vi.mock('@/lib/konsrucu/dilekce-v2/kart-veri', async (orig) => ({
  ...(await orig<typeof import('@/lib/konsrucu/dilekce-v2/kart-veri')>()),
  kartVerisiniYukle: m.veri, gecerliKart: m.gecerli, belgeMetinleriniYukle: m.metinler,
}))

import { dosyaKartiHazirla, kartiKilitle, kartOlguDuzelt, kartOlguOnayla, kartSecimleriKaydet } from '@/app/(app)/dilekceler/kart/actions'
import { kartIcerigiKur, olgulariOnayla, secimleriUygula } from '@/lib/konsrucu/dilekce-v2/kart'

const dosyaId = '00000000-0000-4000-8000-000000000001'
const kartId = '00000000-0000-4000-8000-0000000000aa'
const dekontId = '00000000-0000-4000-8000-0000000000d1'
const guncelleme = '2026-09-27T10:00:00.000Z'

const girdi: KartGirdisi = {
  dosya: { id: dosyaId, hukukDosyaNo: 'H-1', icraDairesi: 'Örnek 1. İcra Dairesi', icraDosyaNo: '2026/100', takipTarihi: null, rucuSebebi: null, rucuSebebiKod: 'KASKO_HALEFIYET' },
  musteriUnvani: 'Örnek Sigorta A.Ş.',
  borclular: [{ id: 'br1', adUnvan: 'Davalı Bir', takip: { itirazVar: true, itirazTipi: 'TAM', itirazVerilisTarihi: '2026-03-20T00:00:00.000Z', itirazUyapTarihi: null, itirazKapsamJson: { borc: true }, itirazEdilenTutar: null, itirazKaynakBelgeId: null } }],
  takipTalebi: { id: 'tt1', surum: 1, asilAlacak: '5000.00', islemisFaiz: null, toplam: '5000.00', faizTuru: null, faizOraniMetni: null, faizBaslangicTuru: null, faizBaslangic: null, takipTarihi: null, kaynak: 'KOPILOT', kaynakBelgeId: null },
  dava: null,
  arabuluculuk: { id: 'ar1', tur: 'DAVA_SARTI', sonTutanakTarihi: '2026-06-01T00:00:00.000Z', sonuc: 'ANLASAMAMA', sonTutanakBelgeId: null },
  alanlar: [], belgeler: [{ id: dekontId, ad: 'Dekont.pdf', altTur: 'HASAR_DEKONT', kategori: 'DEKONT', tarih: '2026-01-10', metinVar: true }], dayanaklar: [],
}
const metinler = new Map<string, BelgeMetni>([[dekontId, { belgeId: dekontId, ad: 'Dekont.pdf', sayfalar: [{ sayfaNo: 1, metin: 'Ödeme tarihi 10.01.2026, tutar 5.000,00 TL.' }] }]])
const veri = {
  girdi, belgeMetinleri: metinler, maske: { kisiler: ['Davalı Bir'] },
  belgeler: [{ id: dekontId, ad: 'Dekont.pdf', altTur: 'HASAR_DEKONT', kategori: 'DEKONT', tarih: '2026-01-10', metinDurumu: 'METIN_KATMANI', aiIzni: 'IZINLI', metin: metinler.get(dekontId)! }],
}
const aiYaniti = {
  stop_reason: 'tool_use',
  content: [{
    type: 'tool_use', id: 't1', name: 'dosya_karti_olgulari',
    input: {
      olgular: [
        { metin: 'Ödeme 10.01.2026 tarihinde yapıldı', belge: 'B-1', sayfa: 1, alinti: 'Ödeme tarihi 10.01.2026, tutar 5.000,00 TL.', alanlar: ['ODEME', 'LIKIDITE'] },
        { metin: 'Sürücü hız sınırını aştı', belge: 'B-1', sayfa: 1, alinti: 'hız sınırı aşılmıştır', alanlar: ['KAZA'] },
      ],
      celiskiler: [],
    },
  }],
  usage: { input_tokens: 100, output_tokens: 50 },
}

const kayitliKart = (durum: 'TASLAK' | 'ONAYLI', icerik = kartIcerigiKur({ tur: 'DAVA', girdi, belgeMetinleri: metinler })) => ({
  id: kartId, dosyaId, davaId: null, tur: 'DAVA', surum: 1, durum, updatedAt: new Date(guncelleme), icerikJson: icerik, uretici: 'kod+kart-v1',
})
const tamIcerik = () => {
  const k = kartIcerigiKur({ tur: 'DAVA', girdi, belgeMetinleri: metinler, ai: { cikti: { olgular: [{ metin: 'Ödeme yapıldı', belgeId: dekontId, sayfa: 1, alinti: 'Ödeme tarihi 10.01.2026', alanlar: ['ODEME'] }], celiskiler: [], savunmalar: [] }, durum: 'KULLANILDI', model: null, uyari: null } })
  const o = olgulariOnayla(k, k.olgular.filter((x) => x.kritik).map((x) => x.id), { kullaniciId: 'avukat', at: guncelleme })
  if (!o.ok) throw new Error()
  const s = secimleriUygula(o.icerik, { mahkeme: 'Örnek Mahkeme', usul: 'YAZILI', esas: null, davalilar: ['br1'], talepler: ['ITIRAZIN_IPTALI'], arabuluculukGerekmez: false, arabuluculukGerekce: null, not: null }, { kullaniciId: 'avukat', at: guncelleme })
  if (!s.ok) throw new Error()
  return s.icerik
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  vi.stubEnv('AI_ORTAM', 'staging') // kurgusal veri kipi: maskeli 'dilekce' yüzeyi açık
  vi.stubEnv('DILEKCE_V2', 'avukat')
  m.ctx.mockResolvedValue({ dbUser: { id: 'avukat', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: 'tenant-1', izinli: ['tenant-1'] })
  m.musteri.mockResolvedValue({ id: 'tenant-1' })
  m.dosya.mockResolvedValue({ id: dosyaId })
  m.veri.mockResolvedValue(veri)
  m.gecerli.mockResolvedValue(null)
  m.metinler.mockResolvedValue(metinler)
  m.kartCreate.mockResolvedValue({ id: 'yeni-kart', surum: 1 })
  m.kartUpdateMany.mockResolvedValue({ count: 1 })
  m.aktivite.mockResolvedValue({})
  m.ai.mockResolvedValue(aiYaniti)
})

describe('dosya kartı eylemleri: yetki ve kapsam', () => {
  it('görüntüleyen ve pasif kullanıcı kart hazırlayamaz', async () => {
    for (const u of [{ aktif: true, rol: 'GORUNTULEYEN' }, { aktif: false, rol: 'AVUKAT' }]) {
      m.ctx.mockResolvedValue({ dbUser: { id: 'u', ...u }, aktifMusteriId: 'tenant-1', izinli: ['tenant-1'] })
      expect((await dosyaKartiHazirla({ dosyaId, tur: 'DAVA' })).ok).toBe(false)
    }
    expect(m.kartCreate).not.toHaveBeenCalled()
    expect(m.ai).not.toHaveBeenCalled()
  })

  it('DILEKCE_V2 kapalıyken hiçbir şey yapılmaz (eski masa etkilenmez)', async () => {
    vi.stubEnv('DILEKCE_V2', 'kapali')
    const r = await dosyaKartiHazirla({ dosyaId, tur: 'DAVA' })
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/açık değil/) })
    expect(m.veri).not.toHaveBeenCalled()
  })

  it('avukat yardımcısı kart hazırlayabilir ama olgu onaylayamaz ve kilitleyemez', async () => {
    vi.stubEnv('DILEKCE_V2', 'herkes')
    m.ctx.mockResolvedValue({ dbUser: { id: 'yrd', aktif: true, rol: 'AVUKAT_YRD' }, aktifMusteriId: 'tenant-1', izinli: ['tenant-1'] })
    expect((await dosyaKartiHazirla({ dosyaId, tur: 'DAVA' })).ok).toBe(true)
    expect(await kartOlguOnayla({ kartId, olguIdleri: ['O-1'], beklenenGuncelleme: guncelleme })).toMatchObject({ ok: false, error: 'Bu işlemi yalnız avukat yapabilir.' })
    expect(await kartiKilitle({ kartId, beklenenGuncelleme: guncelleme })).toMatchObject({ ok: false, error: 'Bu işlemi yalnız avukat yapabilir.' })
  })

  it('başka müvekkilin kartı yüklenemez (sorgu aktif müvekkille sınırlı)', async () => {
    m.kartFind.mockResolvedValue(null)
    expect((await kartiKilitle({ kartId, beklenenGuncelleme: guncelleme })).ok).toBe(false)
    expect(m.kartFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: kartId, silindiAt: null, dosya: { musteriId: 'tenant-1' } } }))
  })
})

describe('kart hazırla (kabul 1–2)', () => {
  it('yapay zekâ olgusu alıntısıyla karta girer; alıntısı bulunamayan kaynaksız kalır; sürüm 1 TASLAK', async () => {
    const r = await dosyaKartiHazirla({ dosyaId, tur: 'DAVA' })
    expect(r).toMatchObject({ ok: true, kartId: 'yeni-kart', surum: 1 })
    expect(m.ai).toHaveBeenCalledTimes(1)
    const istek = m.ai.mock.calls[0][0]
    expect(istek.model).toBe('claude-opus-4-8')
    expect(JSON.stringify(istek.messages)).not.toContain('Davalı Bir') // maskeli gider
    const data = m.kartCreate.mock.calls[0][0].data
    expect(data).toMatchObject({ dosyaId, tur: 'DAVA', surum: 1, durum: 'TASLAK', uretici: 'claude-opus-4-8+kart-v1' })
    const ai = data.icerikJson.olgular.filter((o: { kaynakTuru: string }) => o.kaynakTuru === 'AI')
    expect(ai).toHaveLength(1)
    expect(ai[0]).toMatchObject({ metin: 'Ödeme 10.01.2026 tarihinde yapıldı', belgeId: dekontId, sayfa: 1, alintiDogru: true, onayli: false })
    expect(data.icerikJson.kaynaksizlar.map((x: { metin: string }) => x.metin)).toContain('Sürücü hız sınırını aştı')
    expect(m.kartUpdateMany).toHaveBeenCalledWith({ where: { dosyaId, tur: 'DAVA', id: { not: 'yeni-kart' }, durum: { not: 'ESKIDI' }, silindiAt: null }, data: { durum: 'ESKIDI' } })
    expect(m.aktivite).toHaveBeenCalled()
    expect(r.ok && r.uyarilar.join(' ')).toMatch(/1 olgunun alıntısı belgede bulunamadı/)
  })

  it('yapay zekâ yüzeyi canlıda kapalıyken kart kayıtlardan kurulur, çağrı yapılmaz', async () => {
    vi.stubEnv('AI_ORTAM', '')
    const r = await dosyaKartiHazirla({ dosyaId, tur: 'DAVA' })
    expect(r.ok).toBe(true)
    expect(m.ai).not.toHaveBeenCalled()
    const data = m.kartCreate.mock.calls[0][0].data
    expect(data.icerikJson.ai.durum).toBe('KAPALI')
    expect(data.uretici).toBe('kod+kart-v1')
  })

  it('önceki sürüm varsa numara artar', async () => {
    m.kartFind.mockResolvedValueOnce({ surum: 3 })
    m.kartCreate.mockResolvedValue({ id: 'yeni-kart', surum: 4 })
    await dosyaKartiHazirla({ dosyaId, tur: 'DAVA' })
    expect(m.kartCreate.mock.calls[0][0].data.surum).toBe(4)
  })

  it('dosya aktif müvekkilde yoksa kart hazırlanmaz', async () => {
    m.veri.mockResolvedValue(null)
    expect((await dosyaKartiHazirla({ dosyaId, tur: 'DAVA' })).ok).toBe(false)
    expect(m.veri).toHaveBeenCalledWith(expect.anything(), 'tenant-1', dosyaId)
    expect(m.kartCreate).not.toHaveBeenCalled()
  })
})

describe('onay, kilit ve sürüm (kabul 3–4)', () => {
  it('kritik olgu onaysızken "Kart doğru" kilitli: yazılmaz', async () => {
    m.kartFind.mockResolvedValue(kayitliKart('TASLAK'))
    const r = await kartiKilitle({ kartId, beklenenGuncelleme: guncelleme })
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Onay bekleyen kritik olgu/) })
    expect(m.kartUpdateMany).not.toHaveBeenCalled()
  })

  it('bütün kritik olgular onaylıysa kilitlenir (ONAYLI, onaylayan, iyimser kilit)', async () => {
    m.kartFind.mockResolvedValue(kayitliKart('TASLAK', tamIcerik()))
    const r = await kartiKilitle({ kartId, beklenenGuncelleme: guncelleme })
    expect(r.ok).toBe(true)
    expect(m.kartUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: kartId, durum: 'TASLAK', updatedAt: new Date(guncelleme), dosya: { musteriId: 'tenant-1' } }),
      data: expect.objectContaining({ durum: 'ONAYLI', onaylayanId: 'avukat' }),
    }))
  })

  it('olgu onayı taslak kartı yerinde günceller; çakışmada başarı bildirmez', async () => {
    m.kartFind.mockResolvedValue(kayitliKart('TASLAK'))
    expect((await kartOlguOnayla({ kartId, olguIdleri: ['O-1', 'O-2'], beklenenGuncelleme: guncelleme })).ok).toBe(true)
    const yazilan = m.kartUpdateMany.mock.calls[0][0].data.icerikJson
    expect(yazilan.olgular.slice(0, 2).every((o: { onayli: boolean; onaylayanId: string }) => o.onayli && o.onaylayanId === 'avukat')).toBe(true)
    m.kartUpdateMany.mockResolvedValue({ count: 0 })
    m.aktivite.mockClear()
    expect(await kartOlguOnayla({ kartId, olguIdleri: ['O-1'], beklenenGuncelleme: guncelleme })).toMatchObject({ ok: false, error: expect.stringMatching(/başka bir oturumda/) })
    expect(m.aktivite).not.toHaveBeenCalled()
  })

  it('kilitli kartta olgu düzeltmek sürüm 2 açar; sürüm 1 ESKIDI olur', async () => {
    const icerik = tamIcerik()
    const aiOlgu = icerik.olgular.find((o) => o.kaynakTuru === 'AI')!
    m.kartFind.mockResolvedValueOnce(kayitliKart('ONAYLI', icerik)).mockResolvedValueOnce({ surum: 1 })
    m.kartCreate.mockResolvedValue({ id: 'kart-2', surum: 2 })
    const r = await kartOlguDuzelt({ kartId, olguId: aiOlgu.id, metin: 'Ödeme 10.01.2026 tarihinde yapılmıştır', beklenenGuncelleme: guncelleme })
    expect(r).toMatchObject({ ok: true, kartId: 'kart-2', surum: 2, yeniSurum: true })
    expect(m.kartUpdateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: kartId, durum: 'ONAYLI' }), data: { durum: 'ESKIDI' } })
    const yeni = m.kartCreate.mock.calls[0][0].data
    expect(yeni).toMatchObject({ dosyaId, tur: 'DAVA', surum: 2, durum: 'TASLAK' })
    expect(yeni.icerikJson.olgular.find((o: { id: string }) => o.id === aiOlgu.id)).toMatchObject({ metin: 'Ödeme 10.01.2026 tarihinde yapılmıştır', duzeltildi: true, onayli: true })
  })

  it('düzeltmede yeni alıntı belgede bulunamazsa yazılmaz', async () => {
    const icerik = tamIcerik()
    const aiOlgu = icerik.olgular.find((o) => o.kaynakTuru === 'AI')!
    m.kartFind.mockResolvedValue(kayitliKart('TASLAK', icerik))
    const r = await kartOlguDuzelt({ kartId, olguId: aiOlgu.id, metin: 'Hız 90', kaynak: { belgeId: dekontId, sayfa: 1, alinti: 'saatte 90 kilometre hız' }, beklenenGuncelleme: guncelleme })
    expect(r).toMatchObject({ ok: false })
    expect(m.metinler).toHaveBeenCalledWith(expect.anything(), 'tenant-1', dosyaId, [dekontId])
    expect(m.kartUpdateMany).not.toHaveBeenCalled()
  })

  it('avukat seçimleri: aday dışı davalı reddedilir; geçerli seçim kaydedilir', async () => {
    m.kartFind.mockResolvedValue(kayitliKart('TASLAK'))
    const temel = { mahkeme: null, usul: null, esas: null, talepler: ['ITIRAZIN_IPTALI' as const], arabuluculukGerekmez: false, arabuluculukGerekce: null, not: null }
    expect((await kartSecimleriKaydet({ kartId, beklenenGuncelleme: guncelleme, secimler: { ...temel, davalilar: ['yabanci'] } })).ok).toBe(false)
    expect((await kartSecimleriKaydet({ kartId, beklenenGuncelleme: guncelleme, secimler: { ...temel, davalilar: ['br1'] } })).ok).toBe(true)
    expect(m.kartUpdateMany.mock.calls[0][0].data.icerikJson.secimler).toMatchObject({ davalilar: ['br1'], talepler: ['ITIRAZIN_IPTALI'], kaydedenId: 'avukat' })
  })
})
