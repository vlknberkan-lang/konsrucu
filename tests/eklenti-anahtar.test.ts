/**
 * S14 · Eklenti anahtarı (F17, B51): kişiye bağlı, özetlenmiş, süreli, iptal edilebilir; eski şirket anahtarı
 * eski uçlarda çalışmaya devam eder; yeni uçlar yalnız yeni anahtar; CORS yalnız eklenti kökeni;
 * aynı müvekkil için yeni anahtar girilince eklenti eskisini kullanmaz (saf.js · anahtarlariTekillestir).
 * DB sahte (vi.mock); anahtarlar test içinde üretilir, kişisel veri yok.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const m = vi.hoisted(() => ({
  anahtarBul: vi.fn(),
  anahtarGuncelle: vi.fn(),
  anahtarOlustur: vi.fn(),
  anahtarSay: vi.fn(),
  anahtarIlk: vi.fn(),
  anahtarListe: vi.fn(),
  ayarBul: vi.fn(),
  aktivite: vi.fn(),
  nabizListe: vi.fn(),
  musteriBul: vi.fn(),
  ctx: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    eklentiAnahtar: { findUnique: m.anahtarBul, update: m.anahtarGuncelle, create: m.anahtarOlustur, count: m.anahtarSay, findFirst: m.anahtarIlk, findMany: m.anahtarListe },
    ayarlar: { findFirst: m.ayarBul },
    aktivite: { create: m.aktivite },
    eklentiNabiz: { findMany: m.nabizListe },
    musteri: { findUnique: m.musteriBul },
  },
}))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  anahtarDurumu, anahtarGosterim, anahtarKarari, anahtarKalanGun, anahtarOlusturabilir, anahtarOzet, anahtarUret, yeniAnahtarMi, ANAHTAR_OMRU_GUN,
} from '@/lib/konsrucu/senkron/anahtar'
import { izinliKoken, uyapKimlik, yeniAnahtarKimligi, corsJson } from '@/lib/konsrucu/uyap-auth'
import { eklentiAnahtarIptal, eklentiAnahtarOlustur } from '@/app/(app)/dosya-islem/senkron-actions'
import { GET as kimlikGET } from '@/app/api/uyap/kimlik/route'

const GUN = 86_400_000
const SIMDI = new Date('2026-09-27T09:00:00Z')
const RAY = 'musteri-ray-0000'
const ZURICH = 'musteri-zurich-00'

const istek = (anahtar: string, origin?: string) =>
  new Request('http://yerel/api/uyap/hedefler', { headers: { authorization: `Bearer ${anahtar}`, ...(origin ? { origin } : {}) } })

function kayit(o: Partial<{ iptalAt: Date | null; sonKullanma: Date; aktif: boolean; rol: string; uyeler: string[]; musteriId: string; sonGorulme: Date | null }> = {}) {
  return {
    id: 'anahtar-1', musteriId: o.musteriId ?? RAY, kullaniciId: 'kullanici-yelda', iptalAt: o.iptalAt ?? null,
    sonKullanma: o.sonKullanma ?? new Date(Date.now() + 30 * GUN), sonGorulme: o.sonGorulme === undefined ? null : o.sonGorulme,
    kullanici: { aktif: o.aktif ?? true, rol: o.rol ?? 'AVUKAT', musteriler: (o.uyeler ?? [RAY]).map((musteriId) => ({ musteriId })) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.anahtarGuncelle.mockResolvedValue({})
  m.aktivite.mockResolvedValue({})
  m.nabizListe.mockResolvedValue([])
})

describe('anahtar üretimi ve biçimi', () => {
  it('yeni anahtar kr2_ önekli, 43 karakter gövdeli; yalnız sha256 özeti ve ilk 6 karakter saklanır', () => {
    const u = anahtarUret(SIMDI)
    expect(u.anahtar).toMatch(/^kr2_[A-Za-z0-9_-]{43}$/)
    expect(u.ozet).toBe(createHash('sha256').update(u.anahtar).digest('hex'))
    expect(u.ozet).not.toContain(u.anahtar.slice(4))
    expect(u.onek).toBe(u.anahtar.slice(4, 10))
    expect(anahtarGosterim(u.onek)).toBe(`kr2_${u.onek}…`)
    expect(u.sonKullanma.getTime() - SIMDI.getTime()).toBe(ANAHTAR_OMRU_GUN * GUN)
  })

  it('her üretim farklı anahtar verir', () => {
    const a = new Set(Array.from({ length: 20 }, () => anahtarUret().anahtar))
    expect(a.size).toBe(20)
  })

  it('yeni ve eski biçim ayırt edilir', () => {
    expect(yeniAnahtarMi(anahtarUret().anahtar)).toBe(true)
    expect(yeniAnahtarMi('kr_' + 'ab'.repeat(24))).toBe(false)
    expect(yeniAnahtarMi('')).toBe(false)
    expect(yeniAnahtarMi('kr2_kisa')).toBe(false)
  })
})

describe('anahtar durumu ve kararı', () => {
  it('iptal > süresi doldu > yakında dolacak > etkin', () => {
    expect(anahtarDurumu({ iptalAt: SIMDI, sonKullanma: new Date(SIMDI.getTime() + 50 * GUN) }, SIMDI)).toBe('IPTAL')
    expect(anahtarDurumu({ iptalAt: null, sonKullanma: new Date(SIMDI.getTime() - 1) }, SIMDI)).toBe('SURESI_DOLDU')
    expect(anahtarDurumu({ iptalAt: null, sonKullanma: new Date(SIMDI.getTime() + 10 * GUN) }, SIMDI)).toBe('YAKINDA_DOLACAK')
    expect(anahtarDurumu({ iptalAt: null, sonKullanma: new Date(SIMDI.getTime() + 60 * GUN) }, SIMDI)).toBe('AKTIF')
    expect(anahtarKalanGun(new Date(SIMDI.getTime() + 10 * GUN + 5), SIMDI)).toBe(10)
  })

  it('iptal, süre, pasif kullanıcı, GÖRÜNTÜLEYEN ve kiracı dışı reddedilir', () => {
    expect(anahtarKarari(kayit())).toEqual({ ok: true })
    expect(anahtarKarari(kayit({ iptalAt: new Date() }))).toEqual({ ok: false, sebep: 'IPTAL' })
    expect(anahtarKarari(kayit({ sonKullanma: new Date(Date.now() - 1000) }))).toEqual({ ok: false, sebep: 'SURESI_DOLDU' })
    expect(anahtarKarari(kayit({ aktif: false }))).toEqual({ ok: false, sebep: 'KULLANICI_PASIF' })
    expect(anahtarKarari(kayit({ rol: 'GORUNTULEYEN' }))).toEqual({ ok: false, sebep: 'YETKI_YOK' })
    expect(anahtarKarari(kayit({ uyeler: [ZURICH] }))).toEqual({ ok: false, sebep: 'KAPSAM_DISI' })
  })

  it('anahtarı yalnız aktif ve görüntüleyen dışı kullanıcı oluşturur', () => {
    expect(anahtarOlusturabilir({ aktif: true, rol: 'AVUKAT_YRD' })).toBe(true)
    expect(anahtarOlusturabilir({ aktif: true, rol: 'GORUNTULEYEN' })).toBe(false)
    expect(anahtarOlusturabilir({ aktif: false, rol: 'ADMIN' })).toBe(false)
  })
})

describe('uyapKimlik — eski ve yeni anahtar (geri uyum)', () => {
  it('yeni anahtar: özetle aranır, kişi ve kiracı döner; düz anahtar sorguya girmez', async () => {
    const u = anahtarUret()
    m.anahtarBul.mockResolvedValue(kayit())
    const k = await uyapKimlik(istek(u.anahtar))
    expect(k).toEqual({ userId: 'kullanici-yelda', izinli: [RAY], anahtarId: 'anahtar-1', tur: 'YENI' })
    expect(m.anahtarBul).toHaveBeenCalledWith(expect.objectContaining({ where: { ozet: anahtarOzet(u.anahtar) } }))
    expect(JSON.stringify(m.anahtarBul.mock.calls)).not.toContain(u.anahtar)
    expect(m.ayarBul).not.toHaveBeenCalled()
  })

  it('iptal edilen anahtarla aynı istek artık reddedilir (401)', async () => {
    const u = anahtarUret()
    m.anahtarBul.mockResolvedValue(kayit({ iptalAt: new Date() }))
    expect(await uyapKimlik(istek(u.anahtar))).toBeNull()
    const y = await yeniAnahtarKimligi(istek(u.anahtar))
    expect(y.ok).toBe(false)
  })

  it('GÖRÜNTÜLEYEN rolünün anahtarı eklenti uçlarına giremez (veri yazar)', async () => {
    m.anahtarBul.mockResolvedValue(kayit({ rol: 'GORUNTULEYEN' }))
    expect(await uyapKimlik(istek(anahtarUret().anahtar))).toBeNull()
  })

  it('eski şirket anahtarı eski uçlarda çalışmaya devam eder (1.9)', async () => {
    m.ayarBul.mockResolvedValue({ musteriId: RAY })
    const eski = 'kr_' + 'c3'.repeat(24)
    expect(await uyapKimlik(istek(eski))).toEqual({ userId: null, izinli: [RAY], anahtarId: null, tur: 'ESKI' })
    expect(m.anahtarBul).not.toHaveBeenCalled()
  })

  it('yeni uçlar eski şirket anahtarını KABUL ETMEZ', async () => {
    m.ayarBul.mockResolvedValue({ musteriId: RAY })
    const y = await yeniAnahtarKimligi(istek('kr_' + 'c3'.repeat(24)))
    expect(y).toEqual({ ok: false, status: 401, error: expect.stringContaining('yeni eklenti anahtarı') })
  })

  it('son görülme damgası en çok dakikada bir yazılır', async () => {
    m.anahtarBul.mockResolvedValue(kayit({ sonGorulme: new Date(Date.now() - 5_000) }))
    await uyapKimlik(istek(anahtarUret().anahtar))
    expect(m.anahtarGuncelle).not.toHaveBeenCalled()
    m.anahtarBul.mockResolvedValue(kayit({ sonGorulme: new Date(Date.now() - 120_000) }))
    await uyapKimlik(istek(anahtarUret().anahtar))
    expect(m.anahtarGuncelle).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/uyap/kimlik — eklenti anahtarın türünü öğrenir (eski → kişisel geçişi)', () => {
  it('kişisel anahtar: müvekkil, tür ve kalan gün döner; kişisel veri dönmez', async () => {
    const son = new Date(Date.now() + 20 * GUN + 60_000)
    m.anahtarBul.mockResolvedValueOnce(kayit({ sonKullanma: son })).mockResolvedValueOnce({ sonKullanma: son })
    m.musteriBul.mockResolvedValue({ ad: 'Kurgusal Sigorta' })
    const r = await kimlikGET(istek(anahtarUret().anahtar))
    expect(r.status).toBe(200)
    const g = await r.json()
    expect(g).toEqual({ ok: true, tur: 'YENI', musteriId: RAY, musteriAd: 'Kurgusal Sigorta', sonKullanma: son.toISOString(), kalanGun: 20 })
  })
  it('eski şirket anahtarı: tur ESKI, süre yok (1.9 ayarı bozulmaz)', async () => {
    m.ayarBul.mockResolvedValue({ musteriId: RAY })
    m.musteriBul.mockResolvedValue({ ad: 'Kurgusal Sigorta' })
    const g = await (await kimlikGET(istek('kr_' + 'c3'.repeat(24)))).json()
    expect(g).toMatchObject({ ok: true, tur: 'ESKI', musteriId: RAY, sonKullanma: null, kalanGun: null })
  })
  it('iptal edilmiş anahtar 401 (eklenti şeridi "geçersiz" der)', async () => {
    m.anahtarBul.mockResolvedValue(kayit({ iptalAt: new Date() }))
    expect((await kimlikGET(istek(anahtarUret().anahtar))).status).toBe(401)
  })
})

describe('CORS — yalnız eklenti kökeni', () => {
  const eklenti = 'chrome-extension://' + 'abcdefghijklmnopabcdefghijklmnop'
  it('eklenti kökeni yansıtılır; başka web sitesi yansıtılmaz (eskiden *)', () => {
    expect(izinliKoken(eklenti, {})).toBe(eklenti)
    expect(izinliKoken('https://kotu-site.example', {})).toBeNull()
    expect(izinliKoken(null, {})).toBeNull()
    const r1 = corsJson({ ok: true }, 200, istek('x', eklenti))
    expect(r1.headers.get('access-control-allow-origin')).toBe(eklenti)
    const r2 = corsJson({ ok: true }, 200, istek('x', 'https://kotu-site.example'))
    expect(r2.headers.get('access-control-allow-origin')).toBeNull()
  })
  it('EKLENTI_KOKENLERI tanımlıysa yalnız o liste', () => {
    const baska = 'chrome-extension://' + 'ponmlkjihgfedcbaponmlkjihgfedcba'
    expect(izinliKoken(eklenti, { EKLENTI_KOKENLERI: baska })).toBeNull()
    expect(izinliKoken(baska, { EKLENTI_KOKENLERI: baska })).toBe(baska)
  })
})

describe('Ayarlar > Eklenti anahtarları (server action)', () => {
  const kullanici = (rol: string, aktif = true) => ({ dbUser: { id: 'kullanici-yelda', rol, aktif, musteriler: [{ musteriId: RAY }] }, izinli: [RAY], aktifMusteriId: RAY })

  it('oluştur: düz anahtar yalnız bu yanıtta döner; veritabanına özet yazılır; Aktivite kişiyle', async () => {
    m.ctx.mockResolvedValue(kullanici('AVUKAT'))
    m.anahtarSay.mockResolvedValue(0)
    m.anahtarOlustur.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'yeni-anahtar', ad: data.ad, onek: data.onek, iptalAt: null, sonKullanma: data.sonKullanma, sonGorulme: null, createdAt: new Date(), kullaniciId: data.kullaniciId, kullanici: { ad: 'Kurgusal Avukat' },
    }))
    const r = await eklentiAnahtarOlustur({ ad: 'Büro bilgisayarı' })
    expect(r.ok).toBe(true)
    expect(r.anahtar).toMatch(/^kr2_/)
    const yazilan = m.anahtarOlustur.mock.calls[0][0].data
    expect(yazilan.ozet).toBe(anahtarOzet(r.anahtar!))
    expect(JSON.stringify(yazilan)).not.toContain(r.anahtar!.slice(4))
    expect(yazilan).toMatchObject({ musteriId: RAY, kullaniciId: 'kullanici-yelda', ad: 'Büro bilgisayarı' })
    expect(r.satir?.gosterim).toBe(`kr2_${yazilan.onek}…`)
    expect(m.aktivite).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kullaniciId: 'kullanici-yelda' }) }))
  })

  it('GÖRÜNTÜLEYEN ve pasif kullanıcı anahtar oluşturamaz', async () => {
    m.ctx.mockResolvedValue(kullanici('GORUNTULEYEN'))
    expect((await eklentiAnahtarOlustur({})).ok).toBe(false)
    m.ctx.mockResolvedValue(kullanici('AVUKAT', false))
    expect((await eklentiAnahtarOlustur({})).ok).toBe(false)
    expect(m.anahtarOlustur).not.toHaveBeenCalled()
  })

  it('en çok 5 etkin anahtar', async () => {
    m.ctx.mockResolvedValue(kullanici('AVUKAT'))
    m.anahtarSay.mockResolvedValue(5)
    const r = await eklentiAnahtarOlustur({})
    expect(r.ok).toBe(false)
    expect(m.anahtarOlustur).not.toHaveBeenCalled()
  })

  it('iptal: satır silinmez, iptalAt yazılır; başkasının anahtarını yalnız yönetici iptal eder', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    m.ctx.mockResolvedValue(kullanici('AVUKAT_YRD'))
    m.anahtarIlk.mockResolvedValue({ id, kullaniciId: 'baska-kullanici', onek: 'abcdef', iptalAt: null })
    expect((await eklentiAnahtarIptal({ id })).ok).toBe(false)
    expect(m.anahtarGuncelle).not.toHaveBeenCalled()

    m.ctx.mockResolvedValue(kullanici('ADMIN'))
    const r = await eklentiAnahtarIptal({ id })
    expect(r.ok).toBe(true)
    expect(m.anahtarGuncelle).toHaveBeenCalledWith({ where: { id }, data: { iptalAt: expect.any(Date) } })
    expect(m.anahtarIlk).toHaveBeenCalledWith(expect.objectContaining({ where: { id, musteriId: RAY } }))
  })
})

describe('eklenti (saf.js) — yeni anahtar ayarlanınca ona geçilir', () => {
  const baglam: { KonsSaf?: { anahtarlariTekillestir: (l: string[], b: Record<string, unknown>) => string[]; yeniAnahtarMi: (t: string) => boolean } } = {}
  vm.createContext(baglam)
  vm.runInContext(readFileSync(path.join(process.cwd(), 'extension', 'saf.js'), 'utf8'), baglam, { filename: 'saf.js' })
  const S = baglam.KonsSaf!
  const eskiRay = 'kr_' + 'aa'.repeat(24)
  const eskiZurich = 'kr_' + 'bb'.repeat(24)
  const yeniRay = 'kr2_' + 'R'.repeat(43)

  it('aynı müvekkil için yeni anahtar varsa eski anahtar düşer; diğer müvekkilin eski anahtarı kalır', () => {
    const bilgi = { [eskiRay]: { musteriId: RAY, tur: 'ESKI' }, [eskiZurich]: { musteriId: ZURICH, tur: 'ESKI' }, [yeniRay]: { musteriId: RAY, tur: 'YENI' } }
    expect(JSON.parse(JSON.stringify(S.anahtarlariTekillestir([eskiRay, eskiZurich, yeniRay], bilgi)))).toEqual([eskiZurich, yeniRay])
  })
  it('kimliği henüz bilinmeyen anahtarlar olduğu gibi kalır (geri uyum: 1.9 ayarı bozulmaz)', () => {
    expect(JSON.parse(JSON.stringify(S.anahtarlariTekillestir([eskiRay, yeniRay], {})))).toEqual([eskiRay, yeniRay])
    expect(JSON.parse(JSON.stringify(S.anahtarlariTekillestir([eskiRay, eskiRay], {})))).toEqual([eskiRay])
  })
  it('saf.js ile sunucu aynı anahtar biçimini tanır', () => {
    const u = anahtarUret().anahtar
    expect(S.yeniAnahtarMi(u)).toBe(true)
    expect(S.yeniAnahtarMi(eskiRay)).toBe(false)
  })
})
