/**
 * S23 · Onay kartı sunucu eylemleri (app/(app)/dosya-islem/olay-actions.ts).
 * Oturum + AKTİF müvekkil kapsamı + rol (GÖRÜNTÜLEYEN yazamaz; onay yalnız AVUKAT/ADMIN; "Tarih gir" yardımcıya
 * açık) + zod + revalidatePath. Sahte veritabanı; kişisel veri yok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SahteDb } from './eksen-sahte-db'
import { MAZBATA } from './eksen-kurgusal'

const h = vi.hoisted(() => ({ istemci: null as any, ctx: null as any }))
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => h.istemci[k as string] }) }))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: vi.fn(async () => h.ctx) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import {
  adayGeriAlEylem, adayOnaylaEylem, adayReddetEylem, alacakliyaTebligTarihiGirEylem, itirazKapsamGirEylem, mazbatalariOkuEylem,
} from '@/app/(app)/dosya-islem/olay-actions'

let db: SahteDb
let M: string
let d: Record<string, any>
let b1: Record<string, any>
const kullanici = (rol: string, p: Record<string, unknown> = {}) => ({ id: `k-${rol}`, rol, aktif: true, ...p })
const oturum = (rol: string, p: { aktifMusteriId?: string | null; aktif?: boolean } = {}) => {
  h.ctx = { dbUser: kullanici(rol, { aktif: p.aktif ?? true }), izinli: [M], aktifMusteriId: p.aktifMusteriId === undefined ? M : p.aktifMusteriId }
}
const adayEkle = (p: Record<string, unknown>) => db.ekle('takipOlayi', { dosyaId: d.id, tip: 'DURUM', teyit: 'ADAY', kaynakTuru: 'UYAP_EVRAK', kural: 'EK1-TEST@1', hamJson: { kaynak: 'uyap' }, borcluId: null, sonuc: null, tebligSekli: null, muhatap: null, kaynakBelgeId: null, hukukiTarih: new Date('2026-06-26'), ...p })

beforeEach(() => {
  db = new SahteDb()
  h.istemci = db.istemci()
  M = db.musteri().id
  d = db.dosya(M, { takipTarihi: new Date('2026-06-11') })
  b1 = db.borclu(d.id, '[Kurgusal Borçlu Bir]')
  vi.mocked(revalidatePath).mockClear()
  vi.stubEnv('EKSEN_KIPI', 'golge')
})
afterEach(() => vi.unstubAllEnvs())

describe('yetki', () => {
  it('GÖRÜNTÜLEYEN hiçbir şey yazamaz', async () => {
    oturum('GORUNTULEYEN')
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id })).toMatchObject({ ok: false, error: expect.stringMatching(/yalnız avukat/) })
    expect(await alacakliyaTebligTarihiGirEylem({ dosyaId: d.id, tarih: '2026-07-01' })).toMatchObject({ ok: false, error: 'Bu işlem için yetkiniz yok.' })
    expect(await mazbatalariOkuEylem({ dosyaId: d.id })).toMatchObject({ ok: false })
    expect(db.t.takipOlayi.find((x) => x.id === o.id)!.teyit).toBe('ADAY')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('avukat yardımcısı onaylayamaz ve reddedemez ("avukat onayını bekliyor"), ama "Tarih gir" yapabilir', async () => {
    oturum('AVUKAT_YRD')
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id })).toMatchObject({ ok: false, error: expect.stringMatching(/avukat onayını bekliyor/) })
    expect(await adayReddetEylem({ dosyaId: d.id, olayId: o.id, gerekce: 'Yanlış sinyal olabilir' })).toMatchObject({ ok: false })
    db.ekle('borcluTakip', { borcluId: b1.id, dosyaId: d.id, itirazVar: true, itirazVerilisTarihi: new Date('2026-06-26') })
    expect(await alacakliyaTebligTarihiGirEylem({ dosyaId: d.id, borcluId: b1.id, tarih: '2026-07-01' })).toMatchObject({ ok: true })
  })
  it('pasif kullanıcı (avukat olsa da) yazamaz', async () => {
    oturum('AVUKAT', { aktif: false })
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect((await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id })).ok).toBe(false)
  })
})

describe('kapsam', () => {
  it('dosya aktif müvekkilde değilse bulunamaz (başka müvekkil seçiliyken yazılamaz)', async () => {
    const diger = db.musteri('[Kurgusal Diğer]').id
    oturum('AVUKAT', { aktifMusteriId: diger })
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id, itirazTipi: 'TAM' })).toMatchObject({ ok: false, error: 'Dosya bulunamadı veya erişiminiz yok.' })
  })
  it('pasif müvekkilde değişiklik yapılamaz', async () => {
    db.t.musteri[0].aktif = false
    oturum('ADMIN')
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id })).toMatchObject({ ok: false, error: expect.stringMatching(/pasif/) })
  })
})

describe('doğrulama ve yazma', () => {
  beforeEach(() => oturum('AVUKAT'))
  it('geçersiz kimlik ve tarih biçimi anlaşılır hata döner', async () => {
    expect(await adayOnaylaEylem({ dosyaId: 'yok', olayId: 'yok' })).toMatchObject({ ok: false, error: 'Geçersiz istek: alanları kontrol edin.' })
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id, tarih: '26.06.2026' })).toMatchObject({ ok: false, error: 'Geçersiz tarih biçimi.' })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id, tarih: '2026-02-31' })).toMatchObject({ ok: false, error: 'Geçersiz tarih.' })
  })
  it('kısmi itiraz: "1.234,56" TR tutarı okunur ve Decimal yazılır; okunamayan tutar reddedilir', async () => {
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id, itirazTipi: 'KISMI', itirazEdilenTutar: 'abc' })).toMatchObject({ ok: false, error: expect.stringMatching(/tutar okunamadı/) })
    const r = await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id, itirazTipi: 'KISMI', itirazEdilenTutar: '1.234,56', itirazVerilisTarihi: '2026-06-25', itirazKapsam: { faiz: true } })
    expect(r.ok).toBe(true)
    expect(Number(db.t.borcluTakip[0].itirazEdilenTutar)).toBe(1234.56)
    expect(db.t.borcluTakip[0]).toMatchObject({ itirazTipi: 'KISMI', itirazKapsamJson: { faiz: true }, guncelleyenId: 'k-AVUKAT' })
    expect(revalidatePath).toHaveBeenCalledWith(`/akilli-giris/${d.id}`)
    expect(revalidatePath).toHaveBeenCalledWith(`/dosya/${d.id}`)
  })
  it('kesinleşme: ikinci onay olmadan reddedilir; ADMIN ikinci onayla onaylar', async () => {
    const o = adayEkle({ altTip: 'KESINLESME_SERHI', hukukiTarih: new Date('2026-07-15') })
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id })).toMatchObject({ ok: false, error: expect.stringMatching(/ikinci onay/) })
    oturum('ADMIN')
    expect(await adayOnaylaEylem({ dosyaId: d.id, olayId: o.id, kesinlesmeOnay: true })).toMatchObject({ ok: true })
  })
  it('ret gerekçesi en az 5 karakter; geri alma çalışır', async () => {
    const o = adayEkle({ altTip: 'ITIRAZ' })
    expect(await adayReddetEylem({ dosyaId: d.id, olayId: o.id, gerekce: 'yok' })).toMatchObject({ ok: false, error: 'Gerekçe en az 5 karakter olmalı' })
    expect((await adayReddetEylem({ dosyaId: d.id, olayId: o.id, gerekce: 'Başka dosyanın evrakı' })).ok).toBe(true)
    expect((await adayGeriAlEylem({ dosyaId: d.id, olayId: o.id, gerekce: 'Yanlış reddedildi' })).ok).toBe(true)
    expect(db.t.takipOlayi.find((x) => x.id === o.id)!.teyit).toBe('ADAY')
  })
  it('TB-07 "Kapsamı gir": yalnız avukat; TR tutar okunur; ekranın sürümü iyimser kilittir; süre defteri yenilenir', async () => {
    const bt = db.ekle('borcluTakip', { borcluId: b1.id, dosyaId: d.id, itirazVar: true, itirazUyapTarihi: new Date('2026-06-26'), itirazVerilisTarihi: null, itirazTipi: null })
    const surum = bt.updatedAt.toISOString() // ekranın gördüğü sürüm
    oturum('AVUKAT_YRD')
    expect(await itirazKapsamGirEylem({ dosyaId: d.id, borcluId: b1.id, itirazTipi: 'TAM' })).toMatchObject({ ok: false, error: expect.stringMatching(/avukat onayını bekliyor/) })
    oturum('AVUKAT')
    expect(await itirazKapsamGirEylem({ dosyaId: d.id, borcluId: b1.id, itirazTipi: 'KISMI', itirazEdilenTutar: 'x' })).toMatchObject({ ok: false, error: expect.stringMatching(/tutar okunamadı/) })
    expect(await itirazKapsamGirEylem({ dosyaId: d.id, borcluId: b1.id, itirazTipi: 'YARIM' as never })).toMatchObject({ ok: false })
    const r = await itirazKapsamGirEylem({ dosyaId: d.id, borcluId: b1.id, itirazTipi: 'KISMI', itirazEdilenTutar: '12.500,00', itirazVerilisTarihi: '2026-06-25', surum, itirazKapsam: { borc: true } })
    expect(r).toMatchObject({ ok: true })
    expect(db.t.borcluTakip[0]).toMatchObject({ itirazTipi: 'KISMI', itirazKapsamJson: { borc: true } })
    expect(Number(db.t.borcluTakip[0].itirazEdilenTutar)).toBe(12500)
    expect(revalidatePath).toHaveBeenCalledWith('/sureler')
    // aynı eski sürümle ikinci gönderim reddedilir (iki sekme)
    expect(await itirazKapsamGirEylem({ dosyaId: d.id, borcluId: b1.id, itirazTipi: 'TAM', surum })).toMatchObject({ ok: false, error: expect.stringMatching(/bu arada değişti/) })
  })
  it('"Evraktan yeniden oku": okunmuş mazbatadan aday açılır ve sonuç bildirilir', async () => {
    db.ekle('belge', { dosyaId: d.id, dosyaAdi: 'Tebligat Mazbatası.pdf', belgeTarihi: new Date('2026-06-30'), kaynak: 'UYAP_ICRA', extractedText: MAZBATA.d2Tk21Ocr, metinYontemi: 'OCR', metinGuven: 0.8 })
    const r = await mazbatalariOkuEylem({ dosyaId: d.id })
    expect(r).toMatchObject({ ok: true, bilgi: '1 yeni gelişme, 0 gelişme mazbatayla güncellendi.' })
    const a = db.t.takipOlayi.find((x) => x.kaynakBelgeId)!
    expect(a).toMatchObject({ altTip: 'TEBLIG_SONUCU', teyit: 'ADAY', sonuc: 'TEBLIG', tebligSekli: 'TK21_2', borcluId: b1.id, kural: 'MZ-TK21@1' })
    expect(await mazbatalariOkuEylem({ dosyaId: d.id })).toMatchObject({ ok: true, bilgi: 'Okunmuş yeni mazbata bulunamadı.' })
  })
})
