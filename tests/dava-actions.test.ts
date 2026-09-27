/**
 * S27 + S31 · dava server action'ları (sahte Prisma) — "dava-kapsam" entegrasyon testinin birim karşılığı:
 * alt kayıtların dosyaId'si daima üst davadan (M7), aktif müvekkil kapsamı, müvekkil onayı kilidi, İİK 67 kanıtla
 * kapanış, karar kırmızısı için gerekçe, tahsilat yalnız UYAP farkından, kapanış sebebinde müvekkil kararı,
 * Excel önerisinin tekrar uygulanınca çift kayıt açmaması.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  const f = () => vi.fn()
  const db = {
    rucuDosyasi: { findFirst: f(), update: f() },
    dava: { findFirst: f(), create: f(), update: f() },
    davaTaraf: { findFirst: f(), create: f() },
    davaIslem: { findFirst: f(), create: f() },
    ihtiyatiHaciz: { findFirst: f(), create: f(), update: f() },
    asama: { findFirst: f(), create: f(), update: f(), aggregate: f() },
    sure: { findMany: f(), findFirst: f(), update: f(), create: f() },
    onayKaydi: { findMany: f(), findFirst: f() },
    arabuluculuk: { findFirst: f() },
    borclu: { count: f() },
    belge: { findFirst: f() },
    takipTalebi: { findFirst: f() },
    takipOlayi: { findFirst: f(), updateMany: f() },
    durumGecisi: { create: f() },
    aktivite: { create: f() },
    etkinlik: { findFirst: f(), create: f() },
  }
  return { db, ctx: f(), revalidate: f(), ilerlet: f() }
})
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/konsrucu/durum', () => ({ dosyaDurumIlerlet: m.ilerlet }))
vi.mock('@/lib/prisma', () => ({
  prisma: { ...m.db, $transaction: (x: unknown) => (typeof x === 'function' ? (x as (tx: typeof m.db) => unknown)(m.db) : Promise.all(x as Promise<unknown>[])) },
}))

import {
  davaHazirligiBaslat, davaIslemEkle, davaKaydet, excelDavaOnerisiUygula, ihtiyatiHacizKaydet, iik67Kapat, kapanisSebebiKaydet,
  kararOnayla, onKontrolMaddesiGec, tahsilatKarar,
} from '@/app/(app)/dosya-islem/dava-actions'

const DOSYA = '00000000-0000-4000-8000-00000000000a'
const DAVA = '00000000-0000-4000-8000-00000000000d'
const SURE = '00000000-0000-4000-8000-000000000005'
const OLAY = '00000000-0000-4000-8000-000000000007'
const avukat = { dbUser: { id: 'avukat-1', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: 'tenant-1' }
const yardimci = { dbUser: { id: 'yrd-1', aktif: true, rol: 'AVUKAT_YRD' }, aktifMusteriId: 'tenant-1' }
const dava = { id: DAVA, dosyaId: 'dosya-A', asamaId: 'asama-d', durum: 'DERDEST', acilisTarihi: new Date('2026-08-07'), esasYil: 2026, esasSira: 384, davaDegeri: '1000', kararTarihi: null, gerekceliTebligTarihi: null, onKontrolJson: null, asama: { id: 'asama-d', detayJson: null } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T09:00:00Z'))
  m.ctx.mockResolvedValue(avukat)
  m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: DOSYA })
  m.db.dava.findFirst.mockResolvedValue(dava)
  m.db.onayKaydi.findMany.mockResolvedValue([])
  m.db.sure.findMany.mockResolvedValue([])
  m.db.asama.aggregate.mockResolvedValue({ _max: { sira: 2 } })
  m.db.takipTalebi.findFirst.mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

describe('alt kayıt kapsamı (M7)', () => {
  it('işlem dosyaId\'sini istemciden değil davadan alır; dava aktif müvekkil kapsamında aranır', async () => {
    m.db.davaIslem.create.mockResolvedValue({ id: 'i1' })
    m.ctx.mockResolvedValue(yardimci)
    const r = await davaIslemEkle({ davaId: DAVA, tur: 'TENSIP', tarih: '2026-08-17' })
    expect(r.ok).toBe(true)
    expect(m.db.dava.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: DAVA, silindiAt: null, dosya: { musteriId: 'tenant-1' } } }))
    expect(m.db.davaIslem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ davaId: DAVA, dosyaId: 'dosya-A', tur: 'TENSIP', kaynakTuru: 'ELLE' }) })
  })
  it('başka müvekkilin davasına işlem yazılamaz', async () => {
    m.db.dava.findFirst.mockResolvedValue(null)
    expect((await davaIslemEkle({ davaId: DAVA, tur: 'TENSIP' })).ok).toBe(false)
    expect(m.db.davaIslem.create).not.toHaveBeenCalled()
  })
  it('ihtiyati haciz: davanın dosyası farklıysa yazma durur', async () => {
    m.db.dava.findFirst.mockResolvedValue({ id: DAVA, dosyaId: 'baska-dosya' })
    const r = await ihtiyatiHacizKaydet({ dosyaId: DOSYA, davaId: DAVA, asama: 'DAVADA', sonuc: 'RED' })
    expect(r.ok).toBe(false)
    expect(m.db.ihtiyatiHaciz.create).not.toHaveBeenCalled()
  })
  it('işlem tarihi ileri olamaz; tebliğ işlemden önce olamaz', async () => {
    expect((await davaIslemEkle({ davaId: DAVA, tur: 'CEVAP', tarih: '2026-10-01' })).ok).toBe(false)
    expect((await davaIslemEkle({ davaId: DAVA, tur: 'CEVAP', tarih: '2026-09-10', tebligTarihi: '2026-09-01' })).ok).toBe(false)
  })
})

describe('müvekkil onayı kilidi ve ön kontrol', () => {
  it('onay kaydı yokken dava hazırlığı başlatılamaz', async () => {
    const r = await davaHazirligiBaslat({ dosyaId: DOSYA })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/kilitli/)
    expect(m.db.dava.create).not.toHaveBeenCalled()
  })
  it('onay varsa hazırlık (HAZIRLIK davası + Asama(DAVA)) açılır', async () => {
    m.db.onayKaydi.findMany.mockResolvedValue([{ id: 'o', tur: 'DAVA_ACMA', sonuc: 'ONAY', alinmaAt: new Date('2026-09-01'), istisnaGerekce: null, silindiAt: null }])
    m.db.dava.findFirst.mockResolvedValue(null)
    m.db.asama.create.mockResolvedValue({ id: 'asama-h' })
    m.db.dava.create.mockResolvedValue({ id: 'dava-h' })
    expect((await davaHazirligiBaslat({ dosyaId: DOSYA })).ok).toBe(true)
    expect(m.db.dava.create).toHaveBeenCalledWith({ data: expect.objectContaining({ durum: 'HAZIRLIK', asamaId: 'asama-h' }) })
  })
  it('istisna ≤ 14 gün: gerekçeli bekleyen kayıt kilidi açar', async () => {
    m.db.onayKaydi.findMany.mockResolvedValue([{ id: 'o', tur: 'DAVA_ACMA', sonuc: 'BEKLIYOR', alinmaAt: null, istisnaGerekce: 'Süre koruması, müvekkile ulaşılamadı.', silindiAt: null }])
    m.db.sure.findMany.mockResolvedValue([{ onerilenIhtiyatli: new Date('2026-10-07'), durum: 'ACIK', silindiAt: null }])
    m.db.dava.findFirst.mockResolvedValue(null)
    m.db.asama.create.mockResolvedValue({ id: 'asama-h' })
    m.db.dava.create.mockResolvedValue({ id: 'dava-h' })
    expect((await davaHazirligiBaslat({ dosyaId: DOSYA })).ok).toBe(true)
  })
  it('müvekkil onayı maddesi gerekçeyle geçilemez; kilitliyken hiçbir madde geçilemez', async () => {
    expect((await onKontrolMaddesiGec({ dosyaId: DOSYA, kod: 'MUVEKKIL_ONAYI', gerekce: 'bu madde geçilemez olmalı' })).ok).toBe(false)
    const r = await onKontrolMaddesiGec({ dosyaId: DOSYA, kod: 'USUL', gerekce: 'usulü sonra seçeceğim, gerekçe' })
    expect(r.ok).toBe(false)
    expect(m.db.aktivite.create).not.toHaveBeenCalled()
  })
  it('kapı açıkken gerekçe Aktivite\'ye ON_KONTROL_GECIS olarak yazılır', async () => {
    m.db.onayKaydi.findMany.mockResolvedValue([{ id: 'o', tur: 'DAVA_ACMA', sonuc: 'ONAY', alinmaAt: new Date('2026-09-01'), istisnaGerekce: null, silindiAt: null }])
    m.db.dava.findFirst.mockResolvedValue(null)
    expect((await onKontrolMaddesiGec({ dosyaId: DOSYA, kod: 'CK-TICARET-IHTIYARI', gerekce: 'Temel ilişki haksız fiil; avukat değerlendirmesi.' })).ok).toBe(true)
    expect(m.db.aktivite.create).toHaveBeenCalledWith({ data: expect.objectContaining({ detayJson: expect.objectContaining({ tur: 'ON_KONTROL_GECIS', kod: 'CK-TICARET-IHTIYARI' }) }) })
  })
})

describe('elle dava kaydı ve İİK 67', () => {
  it('ileri açılış tarihi ve bozuk esas reddedilir', async () => {
    expect((await davaKaydet({ dosyaId: DOSYA, esas: '2026/384', acilisTarihi: '2026-10-01' })).ok).toBe(false)
    expect((await davaKaydet({ dosyaId: DOSYA, esas: '384' })).ok).toBe(false)
  })
  it('yeni dava Asama(DAVA) ile birlikte açılır; açılış ≤ onaylanan → İİK 67 KAPANMAYA_HAZIR', async () => {
    m.db.dava.findFirst.mockResolvedValue(null)
    m.db.asama.findFirst.mockResolvedValue(null)
    m.db.asama.create.mockResolvedValue({ id: 'asama-yeni' })
    m.db.dava.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: DAVA, ...data }))
    m.db.sure.findMany.mockResolvedValue([{ id: SURE, onaylananSonGun: new Date('2027-06-23'), onerilenIhtiyatli: new Date('2027-06-23'), durum: 'ACIK' }])
    const r = await davaKaydet({ dosyaId: DOSYA, mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'Kurgukent', mahkemeNo: '51', esas: '2026/384', acilisTarihi: '2026-08-07' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.iik67).toEqual({ hazir: 1, sonra: 0 })
    expect(m.db.dava.create).toHaveBeenCalledWith({ data: expect.objectContaining({ asamaId: 'asama-yeni', dosyaId: DOSYA, esasYil: 2026, esasSira: 384, durum: 'DERDEST' }) })
    expect(m.db.asama.update).toHaveBeenCalledWith({ where: { id: 'asama-yeni' }, data: expect.objectContaining({ kimlikNo: '2026/384', birim: 'Kurgukent 51. Asliye Hukuk Mahkemesi' }) })
    expect(m.db.davaTaraf.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rol: 'DAVACI', dosyaId: DOSYA, davaId: DAVA }) })
    expect(m.db.sure.update).toHaveBeenCalledWith({ where: { id: SURE }, data: { durum: 'KAPANMAYA_HAZIR' } })
    expect(m.ilerlet).toHaveBeenCalledWith(DOSYA, 'DAVA')
  })
  it('İİK 67 kapanışı: açılış son günden sonraysa reddedilir; önceyse KAPANDI + kanıt notu', async () => {
    m.db.sure.findFirst.mockResolvedValue({ id: SURE, dosyaId: 'dosya-A', durum: 'KAPANMAYA_HAZIR', onaylananSonGun: new Date('2026-08-01'), onerilenIhtiyatli: null })
    expect((await iik67Kapat({ sureId: SURE, davaId: DAVA })).ok).toBe(false)
    m.db.sure.findFirst.mockResolvedValue({ id: SURE, dosyaId: 'dosya-A', durum: 'KAPANMAYA_HAZIR', onaylananSonGun: new Date('2027-06-23'), onerilenIhtiyatli: null })
    expect((await iik67Kapat({ sureId: SURE, davaId: DAVA })).ok).toBe(true)
    expect(m.db.sure.update).toHaveBeenCalledWith({ where: { id: SURE }, data: expect.objectContaining({ durum: 'KAPANDI', davaId: DAVA, kapatanId: 'avukat-1', kapanisNot: expect.stringMatching(/07\.08\.2026/) }) })
  })
  it('İİK 67 kapanışını avukat yardımcısı yapamaz', async () => {
    m.ctx.mockResolvedValue(yardimci)
    expect((await iik67Kapat({ sureId: SURE, davaId: DAVA })).ok).toBe(false)
    expect(m.db.sure.update).not.toHaveBeenCalled()
  })
})

describe('karar kartı (S31)', () => {
  it('kabul > dava değeri kırmızı: gerekçesiz onay reddedilir, gerekçeyle yazılır ve istinaf TETİK BEKLİYOR açılır', async () => {
    const r1 = await kararOnayla({ davaId: DAVA, kararTarihi: '2026-09-20', hukum: 'KABUL', kabulAsil: '2.000,00' })
    expect(r1.ok).toBe(false)
    expect(m.db.dava.update).not.toHaveBeenCalled()
    m.db.davaIslem.findFirst.mockResolvedValue(null)
    m.db.sure.findFirst.mockResolvedValue(null)
    const r2 = await kararOnayla({ davaId: DAVA, kararTarihi: '2026-09-20', hukum: 'KABUL', kabulAsil: '2.000,00', kirmiziGerekce: 'Islah edildi, dava değeri güncellenecek.' })
    expect(r2.ok).toBe(true)
    expect(m.db.dava.update).toHaveBeenCalledWith({ where: { id: DAVA }, data: expect.objectContaining({ hukum: 'KABUL', kararOnaylayanId: 'avukat-1', durum: 'KARAR' }) })
    expect(m.db.sure.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tur: 'HMK345', durum: 'TETIK_BEKLIYOR', dayanak: 'HMK 345 (teyit gerekli)', davaId: DAVA, dosyaId: 'dosya-A' }) })
    expect(m.db.davaIslem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tur: 'KARAR', dosyaId: 'dosya-A' }) })
  })
  it('karar tarihi açılıştan önce ya da ileri olamaz', async () => {
    expect((await kararOnayla({ davaId: DAVA, kararTarihi: '2026-08-01', hukum: 'RET' })).ok).toBe(false)
    expect((await kararOnayla({ davaId: DAVA, kararTarihi: '2026-10-01', hukum: 'RET' })).ok).toBe(false)
  })
})

describe('tahsilat onayı ve kapanış (S31)', () => {
  it('evrak adından gelen iz (TAHSILAT_SINYALI) onaylanamaz; UYAP farkı adayı onaylanır', async () => {
    m.db.takipOlayi.findFirst.mockResolvedValue({ id: OLAY, dosyaId: DOSYA, altTip: 'TAHSILAT_SINYALI', teyit: 'ADAY', tutar: 1000 })
    expect((await tahsilatKarar({ olayId: OLAY, karar: 'TEYITLI' })).ok).toBe(false)
    m.db.takipOlayi.findFirst.mockResolvedValue({ id: OLAY, dosyaId: DOSYA, altTip: 'TAHSILAT_BORCLUDAN', teyit: 'ADAY', tutar: 1000 })
    m.db.takipOlayi.updateMany.mockResolvedValue({ count: 1 })
    expect((await tahsilatKarar({ olayId: OLAY, karar: 'TEYITLI' })).ok).toBe(true)
    expect(m.db.takipOlayi.updateMany).toHaveBeenCalledWith({ where: { id: OLAY, teyit: 'ADAY' }, data: expect.objectContaining({ teyit: 'TEYITLI', teyitEdenId: 'avukat-1' }) })
  })
  it('eşzamanlı karar: ikinci onay başarı bildirmez', async () => {
    m.db.takipOlayi.findFirst.mockResolvedValue({ id: OLAY, dosyaId: DOSYA, altTip: 'TAHSILAT_BORCLUDAN', teyit: 'ADAY', tutar: 1000 })
    m.db.takipOlayi.updateMany.mockResolvedValue({ count: 0 })
    expect((await tahsilatKarar({ olayId: OLAY, karar: 'TEYITLI' })).ok).toBe(false)
    expect(m.db.aktivite.create).not.toHaveBeenCalled()
  })
  it('sulh kapanışı müvekkil onayı ister; bilinmiyor radarda tutar (kapanisAt yok)', async () => {
    m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: DOSYA, kapanisSebebi: null })
    m.db.onayKaydi.findFirst.mockResolvedValue(null)
    expect((await kapanisSebebiKaydet({ dosyaId: DOSYA, sebep: 'SULH' })).ok).toBe(false)
    expect((await kapanisSebebiKaydet({ dosyaId: DOSYA, sebep: 'BILINMIYOR' })).ok).toBe(true)
    expect(m.db.rucuDosyasi.update).toHaveBeenCalledWith({ where: { id: DOSYA }, data: expect.objectContaining({ kapanisSebebi: 'BILINMIYOR', kapanisAt: null }) })
  })
})

describe('Excel dava önerisi (S27 kabul 1–2)', () => {
  const kaynakJson = {
    kaynak: 'hugo', ham: {},
    rayTakip: { icra: null, dava: { sonDurum: 'ÖN İNCELEME', mahkeme: 'Kurgukent 51. Asliye Hukuk Mahkemesi', esas: '2026/384', davali: 'Kurgu Kurum', ustDosyaNo: 'ÜST-1', davaSonDurum: null, acilisTarihi: '2026-08-07', durusma: null, durusmaHam: null, ihtiyatiHaciz: 'RET', dekont: '11112222333 iş emri', delilDilekcesi: null, muzekkereCevap: null } },
  }
  it('ilk uygulama: dava (#23 ustDosyaNoHam), #27 ihtiyati haciz, #28 dekont (referansNo) açılır; ikinci uygulama çift kayıt açmaz', async () => {
    m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: DOSYA, kaynakJson, borclular: [{ id: 'b1', adUnvan: 'Kurgu Kurum' }] })
    m.db.dava.findFirst.mockResolvedValue(null)
    m.db.asama.create.mockResolvedValue({ id: 'asama-x' })
    m.db.dava.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: DAVA, ...data }))
    m.db.davaTaraf.findFirst.mockResolvedValue(null)
    m.db.davaIslem.findFirst.mockResolvedValue(null)
    m.db.ihtiyatiHaciz.findFirst.mockResolvedValue(null)
    const r1 = await excelDavaOnerisiUygula({ dosyaId: DOSYA })
    expect(r1.ok).toBe(true)
    expect(m.db.dava.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ustDosyaNoHam: 'ÜST-1', esasYil: 2026, esasSira: 384, mahkemeTuru: 'ASLIYE_HUKUK' }) })
    expect(m.db.davaIslem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tur: 'DEKONT_SUNUMU', referansNo: '11112222333', kaynakTuru: 'EXCEL', dosyaId: DOSYA, davaId: DAVA }) })
    expect(m.db.ihtiyatiHaciz.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sonuc: 'RED', excelHam: 'RET', davaId: DAVA }) })
    expect(JSON.stringify(m.db.dava.create.mock.calls[0][0].data)).not.toMatch(/ÖN İNCELEME/) // #19 yazılmaz

    vi.clearAllMocks()
    m.ctx.mockResolvedValue(avukat)
    m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: DOSYA, kaynakJson, borclular: [{ id: 'b1', adUnvan: 'Kurgu Kurum' }] })
    m.db.dava.findFirst.mockResolvedValue({ ...dava, dosyaId: DOSYA })
    m.db.davaTaraf.findFirst.mockResolvedValue({ id: 't' })
    m.db.davaIslem.findFirst.mockResolvedValue({ id: 'i' })
    m.db.ihtiyatiHaciz.findFirst.mockResolvedValue({ id: 'h' })
    m.db.sure.findMany.mockResolvedValue([])
    const r2 = await excelDavaOnerisiUygula({ dosyaId: DOSYA })
    expect(r2.ok).toBe(true)
    if (r2.ok) expect(r2.eklenen).toBe(0)
    expect(m.db.dava.create).not.toHaveBeenCalled()
    expect(m.db.davaIslem.create).not.toHaveBeenCalled()
    expect(m.db.etkinlik.create).not.toHaveBeenCalled() // #26 boş: takvim kaydı yok
  })
  it('#26 duruşma → Dava.sonrakiDurusma + Etkinlik(DURUSMA, kaynak EXCEL, ADAY; TR saati); ikinci uygulamada çift açılmaz', async () => {
    const kj = { ...kaynakJson, rayTakip: { icra: null, dava: { ...kaynakJson.rayTakip.dava, durusma: { tarih: '2027-02-03', saat: '09:50' }, durusmaHam: '2027-02-03 09:50' } } }
    m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: DOSYA, kaynakJson: kj, borclular: [] })
    m.db.dava.findFirst.mockResolvedValue(null)
    m.db.asama.create.mockResolvedValue({ id: 'asama-x' })
    m.db.dava.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: DAVA, ...data }))
    m.db.davaTaraf.findFirst.mockResolvedValue(null)
    m.db.davaIslem.findFirst.mockResolvedValue(null)
    m.db.ihtiyatiHaciz.findFirst.mockResolvedValue(null)
    m.db.etkinlik.findFirst.mockResolvedValue(null)
    m.db.sure.findMany.mockResolvedValue([])
    expect((await excelDavaOnerisiUygula({ dosyaId: DOSYA })).ok).toBe(true)
    const an = new Date('2027-02-03T06:50:00.000Z') // 09:50 TR = 06:50 UTC
    expect(m.db.dava.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sonrakiDurusma: an }) })
    expect(m.db.etkinlik.create).toHaveBeenCalledWith({ data: expect.objectContaining({ dosyaId: DOSYA, asamaId: 'asama-x', tur: 'DURUSMA', baslar: an, kaynak: 'EXCEL', teyit: 'ADAY' }) })
    m.db.etkinlik.create.mockClear()
    m.db.dava.findFirst.mockResolvedValue({ ...dava, dosyaId: DOSYA })
    m.db.etkinlik.findFirst.mockResolvedValue({ id: 'e1' })
    expect((await excelDavaOnerisiUygula({ dosyaId: DOSYA })).ok).toBe(true)
    expect(m.db.etkinlik.create).not.toHaveBeenCalled()
  })
})
