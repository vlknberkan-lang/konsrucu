/**
 * S06 · İdari yol yaması (F18; B12) — AI triyajı İDARİ_YOL'u onaysız atamaz; geçişi yalnız AVUKAT/ADMIN yapar
 * (sunucu tarafında denetlenir); onay Aktivite'ye yazılır. Veriler kurgusaldır (SEN-06 deseni); kişisel veri yok.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  idariYolOnaylayabilir, idariYolaAlinabilirMi, idariYolOnerisiBekliyor, idariYolAktiviteMetni, guvenYuzde,
  IDARI_YOL_YETKI_YOK,
} from '@/lib/konsrucu/idari-yol'

describe('idari-yol — saf kurallar', () => {
  it('yalnız aktif AVUKAT ve ADMIN idari yola alabilir', () => {
    expect(idariYolOnaylayabilir({ rol: 'AVUKAT', aktif: true })).toBe(true)
    expect(idariYolOnaylayabilir({ rol: 'ADMIN' })).toBe(true)
    expect(idariYolOnaylayabilir({ rol: 'AVUKAT_YRD', aktif: true })).toBe(false)
    expect(idariYolOnaylayabilir({ rol: 'GORUNTULEYEN', aktif: true })).toBe(false)
    expect(idariYolOnaylayabilir({ rol: 'AVUKAT', aktif: false })).toBe(false)
    expect(idariYolOnaylayabilir(null)).toBe(false)
  })
  it('yalnız takip öncesi dosya idari yola alınabilir', () => {
    for (const d of ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR']) expect(idariYolaAlinabilirMi(d), d).toBe(true)
    for (const d of ['IDARI_YOL', 'TAKIP_ACILDI', 'ITIRAZ', 'DAVA', 'KAPANDI', null]) expect(idariYolaAlinabilirMi(d), String(d)).toBe(false)
  })
  it('bant: AI idari önerdi ve dosya takip öncesi → görünür; idari yoldaysa ya da öneri klasikse görünmez', () => {
    expect(idariYolOnerisiBekliyor({ yol: 'IDARI', durum: 'INCELENIYOR' })).toBe(true)
    expect(idariYolOnerisiBekliyor({ yol: 'IDARI', durum: 'IDARI_YOL' })).toBe(false)
    expect(idariYolOnerisiBekliyor({ yol: 'KLASIK', durum: 'INCELENIYOR' })).toBe(false)
    expect(idariYolOnerisiBekliyor({ yol: 'IDARI', durum: 'TAKIP_ACILDI' })).toBe(false)
  })
  it('aktivite metni önceki durumu, güveni ve kısaltılmış gerekçeyi taşır', () => {
    const t = idariYolAktiviteMetni({ yolGuven: 0.823, yolNeden: 'Kurgusal gerekçe: borçlulardan biri kamu idaresi', oncekiDurum: 'INCELENIYOR' })
    expect(t).toContain('avukat kararı')
    expect(t).toContain('INCELENIYOR')
    expect(t).toContain('%82')
    expect(t).toContain('kamu idaresi')
    expect(idariYolAktiviteMetni({ yolNeden: 'x'.repeat(400), oncekiDurum: 'HAVUZDA' }).length).toBeLessThan(260)
    expect(guvenYuzde(null)).toBeNull()
    expect(guvenYuzde(1.4)).toBe(100)
  })
})

// ───────────────── server action'lar (mock DB) ─────────────────

const m = vi.hoisted(() => ({
  getUser: vi.fn(), kullanici: vi.fn(), dosyaBul: vi.fn(), dosyaOlustur: vi.fn(), updateMany: vi.fn(), aktivite: vi.fn(),
  ayarlar: vi.fn(), analizEt: vi.fn(), revalidate: vi.fn(),
  gorevler: vi.fn(), gorevGuncelle: vi.fn(), kullanicilar: vi.fn(), mail: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'kurgusal-musteri' }) }) }))
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`) } }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: m.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/konsrucu/analiz', () => ({ analizEt: m.analizEt, enIyiHasarFotolari: vi.fn() }))
vi.mock('@/lib/konsrucu/ai-kredi', () => ({ dosyaLimitKontrol: vi.fn() }))
vi.mock('@/lib/konsrucu/mentor-kural', () => ({ mentorKurallariOku: vi.fn(), mentorKurallariMetne: () => '' }))
vi.mock('@/lib/konsrucu/mail', () => ({ mailGonder: m.mail }))
vi.mock('@/lib/konsrucu/cron-ortak', () => ({ cronYetkisiz: () => null, cronYanit: async (g: Record<string, unknown>) => Response.json(g) }))
vi.mock('@/lib/prisma', () => {
  const tx = { rucuDosyasi: { updateMany: m.updateMany }, aktivite: { create: m.aktivite } }
  return {
    prisma: {
      kullanici: { findUnique: m.kullanici, findMany: m.kullanicilar },
      rucuDosyasi: { findUnique: m.dosyaBul, create: m.dosyaOlustur },
      takipGorevi: { findMany: m.gorevler, update: m.gorevGuncelle },
      aktivite: { create: m.aktivite },
      ayarlar: { findUnique: m.ayarlar },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
import { dosyaOlustur, idariYolaAl } from '@/app/(app)/akilli-giris/actions'
import { GET as hatirlatmaCron } from '@/app/api/cron/takip-gorevi-hatirlatma/route'

const kullanici = (rol: string, aktif = true) => ({ id: 'kurgusal-kullanici', ad: 'Kurgusal Kullanıcı', rol, aktif, musteriler: [{ musteriId: 'kurgusal-musteri' }] })
const sen06 = (durum = 'INCELENIYOR', musteriId = 'kurgusal-musteri') => ({
  musteriId, durum, yol: 'IDARI', yolGuven: 0.82, yolNeden: 'Kurgusal gerekçe: borçlulardan biri kamu idaresi',
})

beforeEach(() => {
  vi.resetAllMocks()
  m.getUser.mockResolvedValue({ data: { user: { id: 'kurgusal-kullanici' } } })
  m.kullanici.mockResolvedValue(kullanici('AVUKAT'))
  m.dosyaBul.mockResolvedValue(sen06())
  m.updateMany.mockResolvedValue({ count: 1 })
  m.aktivite.mockResolvedValue({})
  m.ayarlar.mockResolvedValue(null)
  m.dosyaOlustur.mockResolvedValue({ id: 'kurgusal-dosya' })
})

describe('dosyaOlustur — AI "idari" dese de durum İNCELENİYOR', () => {
  it('öneri yol/yolGuven/yolNeden alanlarında kalır, durum değişmez', async () => {
    m.analizEt.mockResolvedValue({
      yol: 'idari', yolGuven: 0.82, yolNeden: 'Kurgusal gerekçe', olayTuru: 'kurgusal', aciklama: '', olayBaglami: '', teyit: [], borclular: [], dekontlar: [],
    })
    const r = await dosyaOlustur({ metin: 'Kurgusal belge metni', alanlar: { plaka: [], tc: [], tarih: [], tutar: [], iban: [] }, dosyalar: [] })
    expect(r.id).toBe('kurgusal-dosya')
    const data = m.dosyaOlustur.mock.calls[0][0].data
    expect(data.durum).toBe('INCELENIYOR')
    expect(data.yol).toBe('IDARI')
    expect(data.yolGuven).toBe(0.82)
    expect(data.yolNeden).toBe('Kurgusal gerekçe')
    expect(data.aktiviteler.create.eylem).toContain('idari yol kararı avukatta')
  })
})

describe('idariYolaAl — rol kontrolü sunucuda', () => {
  it.each(['AVUKAT_YRD', 'GORUNTULEYEN'])('%s reddedilir; dosyaya dokunulmaz', async (rol) => {
    m.kullanici.mockResolvedValue(kullanici(rol))
    const r = await idariYolaAl('kurgusal-dosya')
    expect(r).toEqual({ ok: false, error: IDARI_YOL_YETKI_YOK })
    expect(m.dosyaBul).not.toHaveBeenCalled()
    expect(m.updateMany).not.toHaveBeenCalled()
    expect(m.aktivite).not.toHaveBeenCalled()
  })

  it('pasifleştirilmiş avukat reddedilir', async () => {
    m.kullanici.mockResolvedValue(kullanici('AVUKAT', false))
    expect((await idariYolaAl('kurgusal-dosya')).ok).toBe(false)
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it.each(['AVUKAT', 'ADMIN'])('%s → durum İDARİ_YOL (koşullu yazım) ve Aktivite kaydı', async (rol) => {
    m.kullanici.mockResolvedValue(kullanici(rol))
    const r = await idariYolaAl('kurgusal-dosya')
    expect(r.ok).toBe(true)
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: 'kurgusal-dosya', durum: 'INCELENIYOR' }, data: { durum: 'IDARI_YOL', yol: 'IDARI' } })
    const akt = m.aktivite.mock.calls[0][0].data
    expect(akt.dosyaId).toBe('kurgusal-dosya')
    expect(akt.kullaniciId).toBe('kurgusal-kullanici')
    expect(akt.eylem).toContain('İdari yola alındı')
    expect(akt.detayJson).toMatchObject({ tur: 'IDARI_YOL_ONAY', oncekiDurum: 'INCELENIYOR', aiYol: 'IDARI', yolGuven: 0.82, onaylayanId: 'kurgusal-kullanici', onaylayanRol: rol })
    expect(m.revalidate).toHaveBeenCalledWith('/akilli-giris/kurgusal-dosya')
  })

  it('takibi açılmış dosya idari yola alınamaz', async () => {
    m.dosyaBul.mockResolvedValue(sen06('TAKIP_ACILDI'))
    expect((await idariYolaAl('kurgusal-dosya')).ok).toBe(false)
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('zaten idari yoldaysa ikinci kez yazılmaz', async () => {
    m.dosyaBul.mockResolvedValue(sen06('IDARI_YOL'))
    expect((await idariYolaAl('kurgusal-dosya')).ok).toBe(false)
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('başka müvekkilin dosyası reddedilir', async () => {
    m.dosyaBul.mockResolvedValue(sen06('INCELENIYOR', 'baska-musteri'))
    expect((await idariYolaAl('kurgusal-dosya')).ok).toBe(false)
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('durum bu arada değiştiyse (count 0) başarı ve Aktivite bildirmez', async () => {
    m.updateMany.mockResolvedValue({ count: 0 })
    const r = await idariYolaAl('kurgusal-dosya')
    expect(r.ok).toBe(false)
    expect(m.aktivite).not.toHaveBeenCalled()
  })
})

describe('takip-gorevi-hatirlatma cron — İDARİ_YOL dosyasının görevi hatırlatılır (B12)', () => {
  /** SEN-06 deseni: idari yoldaki dosyada elle eklenmiş, son tarihi yarın olan görev. */
  const gorev = (durum: string, uyapDurum: string | null = null) => ({
    id: `gorev-${durum}`, baslik: 'Kurgusal elle görev', aciklama: null, sonTarih: new Date('2026-09-28T09:00:00.000Z'), atayanId: null,
    sorumlu: { id: 'kurgusal-kullanici', ad: 'Kurgusal Avukat', eposta: 'test-alicisi@example.invalid' }, etkinlik: null,
    dosya: {
      id: 'kurgusal-dosya', hukukDosyaNo: 'KURGU-06', hasarDosyaNo: null, icraDosyaNo: null, yetkiliIcra: null,
      durum, uyapDurum, asilAlacak: null, rucuTutari: null, faizTutari: null, zamanasimi: null, borclular: [],
    },
  })

  it('sorgu yalnız TAHSIL/KAPANDI dosyalarını dışarıda bırakır; IDARI_YOL görevine e-posta gider', async () => {
    m.gorevler.mockResolvedValue([gorev('IDARI_YOL')])
    m.kullanicilar.mockResolvedValue([])
    m.mail.mockResolvedValue({ ok: true })
    m.gorevGuncelle.mockResolvedValue({})
    const res = await hatirlatmaCron(new Request('http://yerel/api/cron/takip-gorevi-hatirlatma'))
    const govde = await res.json()

    const where = m.gorevler.mock.calls[0][0].where
    expect(where.dosya.durum.notIn).toEqual(['TAHSIL', 'KAPANDI'])
    expect(where.dosya.durum.notIn).not.toContain('IDARI_YOL')
    expect(m.mail).toHaveBeenCalledTimes(1)
    expect(m.mail.mock.calls[0][0].to).toBe('test-alicisi@example.invalid')
    expect(govde).toMatchObject({ gonderilen: 1, atlananKapali: 0 })
  })

  it('UYAP "kapandı" diyen dosyanın görevi yine atlanır', async () => {
    m.gorevler.mockResolvedValue([gorev('TAKIP_ACILDI', 'İnfazen kapandı')])
    m.kullanicilar.mockResolvedValue([])
    const res = await hatirlatmaCron(new Request('http://yerel/api/cron/takip-gorevi-hatirlatma'))
    expect(await res.json()).toMatchObject({ gonderilen: 0, atlananKapali: 1 })
    expect(m.mail).not.toHaveBeenCalled()
  })
})
