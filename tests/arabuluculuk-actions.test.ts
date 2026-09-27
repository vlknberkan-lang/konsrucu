/**
 * S26 · arabuluculuk server action'ları (sahte Prisma): rol kapısı, aktif müvekkil kapsamı, son tutanak tarihi
 * varsayılanı yok / ileri tarih yok, durma işlenince ihtiyatlı değişmez ve onaylanan gün yeniden onaya düşer,
 * süre koruma istisnası eşiği. Veritabanına bağlanılmaz.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const f = () => vi.fn()
  const db = {
    rucuDosyasi: { findFirst: f() },
    arabuluculuk: { findFirst: f(), create: f(), update: f() },
    asama: { findFirst: f(), create: f(), update: f(), aggregate: f() },
    etkinlik: { findFirst: f(), create: f(), update: f() },
    belge: { findFirst: f(), create: f() },
    borcluTakip: { findMany: f() },
    sure: { findMany: f(), findFirst: f(), update: f() },
    durumGecisi: { create: f() },
    aktivite: { create: f() },
    yolSecimi: { updateMany: f(), create: f() },
    onayKaydi: { create: f(), updateMany: f(), findFirst: f() },
    dava: { findFirst: f() },
    ayarlar: { findUnique: f() },
  }
  return { db, ctx: f(), revalidate: f(), ilerlet: f() }
})
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/konsrucu/durum', () => ({ dosyaDurumIlerlet: m.ilerlet }))
vi.mock('@/lib/prisma', () => ({
  prisma: { ...m.db, $transaction: (x: unknown) => (typeof x === 'function' ? (x as (tx: typeof m.db) => unknown)(m.db) : Promise.all(x as Promise<unknown>[])) },
}))

import { arabuluculukKaydet, arabuluculukTurSec, iik67SonGunYenidenOnayla, onayIstisnasiKaydet, sonTutanakOnayla, yolSec } from '@/app/(app)/dosya-islem/arabuluculuk-actions'

const DOSYA = '00000000-0000-4000-8000-000000000001'
const ARB = '00000000-0000-4000-8000-000000000002'
const SURE = '00000000-0000-4000-8000-000000000003'
const avukat = { dbUser: { id: 'avukat-1', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: 'tenant-1' }
const yardimci = { dbUser: { id: 'yrd-1', aktif: true, rol: 'AVUKAT_YRD' }, aktifMusteriId: 'tenant-1' }
const goruntuleyen = { dbUser: { id: 'g-1', aktif: true, rol: 'GORUNTULEYEN' }, aktifMusteriId: 'tenant-1' }
const arbKayit = { id: ARB, dosyaId: DOSYA, asamaId: 'asama-1', tur: 'DAVA_SARTI', basvuruTarihi: new Date('2026-07-01'), sonuc: null, sonTutanakBelgeId: null, katilmayanTaraf: null, konuMetni: null, asama: { id: 'asama-1' } }
const iik67 = { id: SURE, dosyaId: DOSYA, tur: 'IIK67', durum: 'ACIK', onerilenIhtiyatli: new Date('2027-06-23'), onerilenSonGun: new Date('2027-06-23'), onaylananSonGun: new Date('2027-06-23'), onaylayanId: 'avukat-0', onayAt: new Date('2026-07-01'), durmaJson: null, hesapIziJson: null, bakilanEvrak: null }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T09:00:00Z'))
  m.ctx.mockResolvedValue(avukat)
  m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: DOSYA })
  m.db.arabuluculuk.findFirst.mockResolvedValue(arbKayit)
  m.db.sure.findMany.mockResolvedValue([iik67])
  m.db.borcluTakip.findMany.mockResolvedValue([])
  m.db.asama.aggregate.mockResolvedValue({ _max: { sira: 1 } })
})
afterEach(() => vi.useRealTimers())

describe('rol ve kapsam', () => {
  it('görüntüleyen hiçbir kayıt açamaz', async () => {
    m.ctx.mockResolvedValue(goruntuleyen)
    expect((await arabuluculukKaydet({ dosyaId: DOSYA, basvuruNo: '1' })).ok).toBe(false)
    expect(m.db.arabuluculuk.create).not.toHaveBeenCalled()
  })
  it('avukat yardımcısı kayıt açar ama tür seçemez ve son tutanağı onaylayamaz', async () => {
    m.ctx.mockResolvedValue(yardimci)
    const r = await arabuluculukKaydet({ dosyaId: DOSYA, tur: 'DAVA_SARTI' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/yalnız avukat/)
    expect((await arabuluculukTurSec({ arabuluculukId: ARB, tur: 'IHTIYARI' })).ok).toBe(false)
    expect((await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: 'ANLASAMAMA' })).ok).toBe(false)
    expect(m.db.sure.update).not.toHaveBeenCalled()
  })
  it('başka müvekkilin dosyası bulunamaz (sorgu aktif musteriId ile)', async () => {
    m.ctx.mockResolvedValue(yardimci)
    m.db.rucuDosyasi.findFirst.mockResolvedValue(null)
    expect((await arabuluculukKaydet({ dosyaId: DOSYA, basvuruNo: '1' })).ok).toBe(false)
    expect(m.db.rucuDosyasi.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: DOSYA, musteriId: 'tenant-1' } }))
    m.ctx.mockResolvedValue(avukat)
    m.db.arabuluculuk.findFirst.mockResolvedValue(null)
    await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: 'ANLASAMAMA' })
    expect(m.db.arabuluculuk.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dosya: { musteriId: 'tenant-1' } }) }))
  })
})

describe('elle kayıt', () => {
  it('uzantısız Asama(ARABULUCULUK) yeniden kullanılır; hafta sonu başvurusu uyarı döner', async () => {
    m.db.arabuluculuk.findFirst.mockResolvedValue(null)
    m.db.asama.findFirst.mockResolvedValue({ id: 'asama-eski', detayJson: null })
    m.db.arabuluculuk.create.mockResolvedValue({ id: ARB })
    const r = await arabuluculukKaydet({ dosyaId: DOSYA, basvuruTarihi: '2026-06-28', buroNo: '2026/77' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.uyarilar.join(' ')).toMatch(/hafta sonu/)
    expect(m.db.asama.create).not.toHaveBeenCalled()
    expect(m.db.arabuluculuk.create).toHaveBeenCalledWith({ data: expect.objectContaining({ asamaId: 'asama-eski', dosyaId: DOSYA, buroNo: '2026/77' }) })
    expect(m.db.arabuluculuk.create.mock.calls[0][0].data).not.toHaveProperty('tur') // tür varsayılanı yok
    expect(m.ilerlet).toHaveBeenCalledWith(DOSYA, 'ARABULUCULUK')
  })
  it('aşama yoksa Asama(ARABULUCULUK) ile birlikte açılır; ileri başvuru tarihi reddedilir', async () => {
    m.db.arabuluculuk.findFirst.mockResolvedValue(null)
    m.db.asama.findFirst.mockResolvedValue(null)
    m.db.asama.create.mockResolvedValue({ id: 'asama-yeni' })
    m.db.arabuluculuk.create.mockResolvedValue({ id: ARB })
    expect((await arabuluculukKaydet({ dosyaId: DOSYA, basvuruTarihi: '2026-10-01' })).ok).toBe(false)
    expect((await arabuluculukKaydet({ dosyaId: DOSYA, basvuruNo: 'B-1' })).ok).toBe(true)
    expect(m.db.asama.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tur: 'ARABULUCULUK', detayJson: expect.objectContaining({ kaynakTuru: 'ELLE', teyit: 'TEYITLI' }) }) })
  })
})

describe('sonTutanakOnayla', () => {
  it.each([
    ['boş tarih (bugün varsayılmaz)', ''],
    ['ileri tarih', '2026-09-28'],
    ['başvurudan önce', '2026-06-30'],
  ])('%s reddedilir ve hiçbir şey yazılmaz', async (_ad, tarih) => {
    const r = await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: tarih, sonuc: 'ANLASAMAMA' })
    expect(r.ok).toBe(false)
    expect(m.db.arabuluculuk.update).not.toHaveBeenCalled()
    expect(m.db.sure.update).not.toHaveBeenCalled()
  })
  it('sonuç seçilmeden onaylanmaz', async () => {
    expect((await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: '' })).ok).toBe(false)
  })
  it('onay: durmalı öneri kayar, ihtiyatlı DEĞİŞMEZ, onaylanan gün yeniden onaya düşer (AR-07)', async () => {
    const r = await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: 'ANLASAMAMA' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.durma).toMatchObject({ gun: 23, sayildi: true })
      expect(r.yenidenOnay).toBe(1)
      expect(r.uyarilar.join(' ')).toMatch(/AR-06/) // belge bağlanmadı
    }
    const veri = m.db.sure.update.mock.calls[0][0].data
    expect(veri).not.toHaveProperty('onerilenIhtiyatli')
    expect(veri.onerilenSonGun.toISOString().slice(0, 10)).toBe('2027-07-16')
    expect(veri.onaylananSonGun).toBeNull()
    expect(veri.hesapIziJson.yenidenOnayBekliyor).toBe(true)
    expect(m.db.arabuluculuk.update).toHaveBeenCalledWith({ where: { id: ARB }, data: expect.objectContaining({ sonuc: 'ANLASAMAMA', onaylayanId: 'avukat-1' }) })
    expect(m.db.asama.update).toHaveBeenCalledWith({ where: { id: 'asama-1' }, data: expect.objectContaining({ durum: 'SONUCLANDI', sonuc: 'anlasilmadi' }) })
    expect(m.db.durumGecisi.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eksen: 'ARAB', yeni: 'SON_TUTANAK_DIGER', golge: true, kaynakTuru: 'AVUKAT' }) })
  })
  it('anlaşma/kısmen: sulh-iskonto müvekkil onayı yoksa kayıt engellenmez ama uyarı döner (AR-08)', async () => {
    m.db.onayKaydi.findFirst.mockResolvedValue(null)
    const r = await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: 'ANLASMA' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.uyarilar.join(' ')).toMatch(/sulh\/iskonto onay kaydı yok/)
    expect(m.db.onayKaydi.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dosyaId: DOSYA, tur: 'SULH_ISKONTO', sonuc: 'ONAY', silindiAt: null }) }))
    m.db.onayKaydi.findFirst.mockResolvedValue({ id: 'onay-sulh' })
    const r2 = await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: 'KISMEN', anlasilmayanKalemler: 'faiz' })
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.uyarilar.join(' ')).not.toMatch(/sulh\/iskonto onay kaydı yok/)
  })
  it('anlaşamama sonucunda sulh onayı aranmaz', async () => {
    await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: 'ANLASAMAMA' })
    expect(m.db.onayKaydi.findFirst).not.toHaveBeenCalled()
  })
  it('başka dosyanın belgesi bağlanamaz', async () => {
    m.db.belge.findFirst.mockResolvedValue(null)
    const r = await sonTutanakOnayla({ arabuluculukId: ARB, sonTutanakTarihi: '2026-07-24', sonuc: 'ANLASAMAMA', sonTutanakBelgeId: '00000000-0000-4000-8000-00000000000b' })
    expect(r.ok).toBe(false)
    expect(m.db.belge.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ dosyaId: DOSYA }) }))
  })
})

describe('İİK 67 yeniden onay ve istisna', () => {
  it('önerilen durmalı günden ileri gün onaylanamaz', async () => {
    m.db.sure.findFirst.mockResolvedValue({ ...iik67, onerilenSonGun: new Date('2027-07-16'), onaylananSonGun: null })
    expect((await iik67SonGunYenidenOnayla({ sureId: SURE, sonGun: '2027-07-20' })).ok).toBe(false)
    expect((await iik67SonGunYenidenOnayla({ sureId: SURE, sonGun: '2027-07-16' })).ok).toBe(true)
    expect(m.db.sure.update).toHaveBeenCalledWith({ where: { id: SURE }, data: expect.objectContaining({ onaylayanId: 'avukat-1', hesapIziJson: expect.objectContaining({ yenidenOnayBekliyor: false }) }) })
  })
  it('istisna yalnız ihtiyatlı son güne ≤ 14 gün kaldığında ve gerekçeyle', async () => {
    m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: DOSYA, hukukDosyaNo: 'H', hasarDosyaNo: null, icraDairesi: null, icraDosyaNo: null, musteri: { ad: 'Kurgu Sigorta' } })
    m.db.sure.findMany.mockResolvedValue([{ onerilenIhtiyatli: new Date('2026-12-01'), durum: 'ACIK', silindiAt: null }])
    expect((await onayIstisnasiKaydet({ dosyaId: DOSYA, gerekce: 'Müvekkile ulaşılamadı, süre koruması gerekiyor.' })).ok).toBe(false)
    m.db.sure.findMany.mockResolvedValue([{ onerilenIhtiyatli: new Date('2026-10-07'), durum: 'ACIK', silindiAt: null }])
    m.db.onayKaydi.create.mockResolvedValue({ id: 'onay-1' })
    const r = await onayIstisnasiKaydet({ dosyaId: DOSYA, gerekce: 'Müvekkile ulaşılamadı, süre koruması gerekiyor.' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.bildirimTaslagi).toMatch(/hak kaybını önlemek/)
    expect(m.db.onayKaydi.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tur: 'DAVA_ACMA', sonuc: 'BEKLIYOR', istisnaGerekce: expect.stringMatching(/süre koruması/) }) })
  })
})

describe('yolSec', () => {
  it('önceki geçerli seçim ESKIDI olur (silinmez); aşamaya uymayan yol reddedilir', async () => {
    m.db.yolSecimi.create.mockResolvedValue({ id: 'yol-1' })
    expect((await yolSec({ dosyaId: DOSYA, asama: 'ITIRAZ_SONRASI', secim: 'ISTINAF' })).ok).toBe(false)
    const r = await yolSec({ dosyaId: DOSYA, asama: 'ITIRAZ_SONRASI', secim: 'ARABULUCULUK_IIK67', gerekce: 'Dava şartı olabilir' })
    expect(r.ok).toBe(true)
    expect(m.db.yolSecimi.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ dosyaId: DOSYA, durum: 'GECERLI' }), data: { durum: 'ESKIDI' } })
  })
})
