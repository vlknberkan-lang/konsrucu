/**
 * Dosya Yol Haritası — server action'lar (S20): oturum + aktif müvekkil kapsamı + rol + zod; yalnız Aktivite ve
 * önbellek yazılır; prova yalnız okur; ertele kapıları. Veritabanı ve yükleyici taklit edilir (kurgusal veri).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bosGercekler, yolHaritasiHesapla } from '@/lib/konsrucu/yol-haritasi'

const m = vi.hoisted(() => ({
  ctx: vi.fn(), musteri: vi.fn(), dosya: vi.fn(), aktivite: vi.fn(), revalidate: vi.fn(), yukle: vi.fn(), onbellek: vi.fn(),
}))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/prisma', () => ({ prisma: { musteri: { findFirst: m.musteri }, rucuDosyasi: { findFirst: m.dosya }, aktivite: { create: m.aktivite } } }))
vi.mock('@/lib/konsrucu/yol-haritasi/yukle', () => ({ yolHaritasiYukle: m.yukle, onbellekGuncelle: m.onbellek }))

import { oneriErtele, oneriYanlisBildir, provaPuanla, yolHaritasiGetir, yolHaritasiOnbellekGuncelle } from '@/app/(app)/dosya-islem/yol-haritasi-actions'

const dosyaId = '00000000-0000-4000-8000-000000000001'
const SIMDI = new Date('2026-09-27T09:00:00Z')

/** Kurgusal görünüm: iki UYAP gelişmesi (TB-02, öncelik 3) Şimdi kartında. */
function gorunum(prova?: string) {
  const g = bosGercekler(dosyaId)
  g.belgeler = [{ id: 'b', dosyaAdi: 'x.pdf', kategori: 'DIGER', altTur: null, kaynak: 'HUGO_FOTO', metinDurumu: 'METIN_KATMANI', uyapEvrakTuru: null, uyapDosyaTuru: null, davaId: null, tarih: null, createdAt: SIMDI }]
  Object.assign(g.dosya, { rucuSebebiKod: 'KOD', icraDosyaNo: '2026/1', takipTarihi: new Date('2026-09-01T09:00:00Z'), uyapSenkronAt: SIMDI })
  g.olaylar = [{ id: 'o', altTip: 'ICRAI_HACIZ', teyit: 'ADAY', borcluId: null, hukukiTarih: new Date('2026-09-20T09:00:00Z'), tarih: null, tutar: null, sonuc: null, kaynakBelgeId: null, kural: null, createdAt: SIMDI }]
  return yolHaritasiHesapla(g, { simdi: SIMDI, kesim: prova ? new Date(`${prova}T20:59:59.999Z`) : null })
}

beforeEach(() => {
  vi.resetAllMocks()
  m.ctx.mockResolvedValue({ dbUser: { id: 'avukat-1', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: 'tenant-1' })
  m.musteri.mockResolvedValue({ id: 'tenant-1' })
  m.dosya.mockResolvedValue({ id: dosyaId })
  m.aktivite.mockResolvedValue({})
  m.yukle.mockImplementation(async (s: { prova?: string | null }) => gorunum(s.prova ?? undefined))
  m.onbellek.mockResolvedValue(true)
})

describe('yolHaritasiGetir (salt okur)', () => {
  it('aktif müvekkil kapsamıyla yükler; görüntüleyen de okuyabilir; hiçbir şey yazmaz', async () => {
    m.ctx.mockResolvedValue({ dbUser: { id: 'g', aktif: true, rol: 'GORUNTULEYEN' }, aktifMusteriId: 'tenant-1' })
    const r = await yolHaritasiGetir({ dosyaId })
    expect(r.ok).toBe(true)
    expect(r.gorunum?.sonuc.simdi?.kural).toBe('TB-02')
    expect(m.yukle).toHaveBeenCalledWith({ dosyaId, musteriId: 'tenant-1', prova: null })
    expect(m.aktivite).not.toHaveBeenCalled()
    expect(m.onbellek).not.toHaveBeenCalled()
  })

  it('başka müvekkilin dosyası bulunamaz', async () => {
    m.yukle.mockResolvedValue(null)
    const r = await yolHaritasiGetir({ dosyaId })
    expect(r).toEqual({ ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' })
  })

  it('prova tarihi doğrulanır; gelecek tarih reddedilir', async () => {
    expect((await yolHaritasiGetir({ dosyaId, prova: '2026/01/01' })).ok).toBe(false)
    expect((await yolHaritasiGetir({ dosyaId, prova: '2999-01-01' })).error).toBe('Prova tarihi geçersiz ya da gelecekte.')
    const r = await yolHaritasiGetir({ dosyaId, prova: '2026-09-25' })
    expect(r.gorunum?.prova).toEqual({ tarih: '2026-09-25' })
    expect(m.yukle).toHaveBeenLastCalledWith({ dosyaId, musteriId: 'tenant-1', prova: '2026-09-25' })
  })

  it('pasif müvekkil ya da pasif kullanıcı reddedilir; geçersiz kimlik reddedilir', async () => {
    m.musteri.mockResolvedValue(null)
    expect((await yolHaritasiGetir({ dosyaId })).ok).toBe(false)
    m.musteri.mockResolvedValue({ id: 'tenant-1' })
    m.ctx.mockResolvedValue({ dbUser: { id: 'x', aktif: false, rol: 'AVUKAT' }, aktifMusteriId: 'tenant-1' })
    expect((await yolHaritasiGetir({ dosyaId })).ok).toBe(false)
    expect((await yolHaritasiGetir({ dosyaId: 'abc' })).error).toBe('Geçersiz dosya kimliği')
    expect(m.yukle).not.toHaveBeenCalled()
  })
})

describe('oneriYanlisBildir', () => {
  const girdi = { dosyaId, kural: 'TB-02', surum: 1, gerekce: 'Bu hacizler eski, zaten onaylandı.' }

  it('Aktivite\'ye kural kodu, sürüm, gerekçe ve o an gösterilenle yazar', async () => {
    const r = await oneriYanlisBildir(girdi)
    expect(r.ok).toBe(true)
    expect(m.aktivite).toHaveBeenCalledTimes(1)
    const data = m.aktivite.mock.calls[0][0].data
    expect(data).toMatchObject({ dosyaId, kullaniciId: 'avukat-1', eylem: 'Yol haritası · öneri yanlış bildirildi (TB-02)' })
    expect(data.detayJson).toMatchObject({ tur: 'YOL_HARITASI_YANLIS', kural: 'TB-02', surum: 1, motorSurumu: 'yh-1', gerekce: girdi.gerekce, gorunuyordu: true, prova: null })
    expect(data.detayJson.anlik.simdi.kural).toBe('TB-02')
    expect(m.revalidate).toHaveBeenCalledWith(`/akilli-giris/${dosyaId}`)
  })

  it('provadaki bildirim prova tarihiyle kaydedilir', async () => {
    await oneriYanlisBildir({ ...girdi, prova: '2026-09-25' })
    expect(m.aktivite.mock.calls[0][0].data.detayJson.prova).toBe('2026-09-25')
    expect(m.aktivite.mock.calls[0][0].data.eylem).toContain('prova 2026-09-25')
  })

  it.each([
    [{ ...girdi, gerekce: 'yok' }, 'Gerekçe en az 5 karakter olmalı'],
    [{ ...girdi, kural: 'XX-99' }, 'Bilinmeyen kural kodu'],
    [{ ...girdi, kural: 'tb-02; DROP' }, 'Geçersiz kural kodu'],
  ])('geçersiz girdi reddedilir: %j', async (g, hata) => {
    const r = await oneriYanlisBildir(g)
    expect(r).toEqual({ ok: false, error: hata })
    expect(m.aktivite).not.toHaveBeenCalled()
  })

  it('görüntüleyen bildiremez; başka müvekkilin dosyasına yazılmaz', async () => {
    m.ctx.mockResolvedValue({ dbUser: { id: 'g', aktif: true, rol: 'GORUNTULEYEN' }, aktifMusteriId: 'tenant-1' })
    expect((await oneriYanlisBildir(girdi)).ok).toBe(false)
    m.ctx.mockResolvedValue({ dbUser: { id: 'avukat-1', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: 'tenant-1' })
    m.yukle.mockResolvedValue(null)
    expect((await oneriYanlisBildir(girdi)).ok).toBe(false)
    expect(m.aktivite).not.toHaveBeenCalled()
  })
})

describe('oneriErtele', () => {
  const girdi = { dosyaId, kural: 'TB-02', gerekce: 'UYAP bakımda, pazartesi bakarız.', gun: 3 }

  it('gerekçeli erteleme Aktivite\'ye bitiş günüyle yazılır ve önbellek tazelenir', async () => {
    const r = await oneriErtele(girdi)
    expect(r.ok).toBe(true)
    const data = m.aktivite.mock.calls[0][0].data
    expect(data.eylem).toBe('Yol haritası · ertelendi (TB-02, 3 gün)')
    expect(data.detayJson).toMatchObject({ tur: 'YOL_HARITASI_ERTELE', kural: 'TB-02', gun: 3, gerekce: girdi.gerekce })
    expect(new Date(data.detayJson.bitis).getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000)
    expect(m.dosya).toHaveBeenCalledWith({ where: { id: dosyaId, musteriId: 'tenant-1' }, select: { id: true } })
    expect(m.onbellek).toHaveBeenCalledTimes(1)
  })

  it.each(['GN-01', 'GN-04', 'TB-01', 'TB-08', 'EV-02', 'GN-08'])('%s ertelenemez (veri engeli, süre riski, süre başlatan aday ya da bekleme)', async (kural) => {
    const r = await oneriErtele({ ...girdi, kural })
    expect(r.ok).toBe(false)
    expect(m.aktivite).not.toHaveBeenCalled()
  })

  it('avukat kuralını yardımcı erteleyemez; herkes kuralını erteleyebilir', async () => {
    m.ctx.mockResolvedValue({ dbUser: { id: 'yrd', aktif: true, rol: 'AVUKAT_YRD' }, aktifMusteriId: 'tenant-1' })
    expect((await oneriErtele({ ...girdi, kural: 'AR-01' })).error).toBe('Bu adımı yalnız avukat ya da yönetici erteleyebilir.')
    expect((await oneriErtele(girdi)).ok).toBe(true)
  })

  it('gerekçe zorunlu; gün 1–30', async () => {
    expect((await oneriErtele({ ...girdi, gerekce: '   ' })).ok).toBe(false)
    expect((await oneriErtele({ ...girdi, gun: 45 })).error).toBe('En çok 30 gün ertelenebilir')
    expect(m.aktivite).not.toHaveBeenCalled()
  })

  it('kapsam dışı dosya ertelenemez', async () => {
    m.dosya.mockResolvedValue(null)
    expect((await oneriErtele(girdi)).error).toBe('Dosya bulunamadı veya yetkiniz yok.')
    expect(m.aktivite).not.toHaveBeenCalled()
  })
})

describe('provaPuanla', () => {
  const girdi = { dosyaId, prova: '2026-09-25', kural: 'TB-02', puan: 'DOGRU' as const }

  it('avukat puanı Aktivite\'ye prova tarihi ve o an gösterilenle yazılır; hukuki kayıt değişmez', async () => {
    const r = await provaPuanla(girdi)
    expect(r.ok).toBe(true)
    const data = m.aktivite.mock.calls[0][0].data
    expect(data.eylem).toBe('Yol haritası · prova puanı: doğru (TB-02 · 2026-09-25)')
    expect(data.detayJson).toMatchObject({ tur: 'YOL_HARITASI_PROVA_PUAN', prova: '2026-09-25', kural: 'TB-02', puan: 'DOGRU' })
    expect(m.yukle).toHaveBeenCalledWith({ dosyaId, musteriId: 'tenant-1', prova: '2026-09-25' })
    expect(m.onbellek).not.toHaveBeenCalled()
  })

  it('yalnız avukat/yönetici puanlar; yanlış/eksik için not zorunlu; prova tarihi zorunlu', async () => {
    m.ctx.mockResolvedValue({ dbUser: { id: 'yrd', aktif: true, rol: 'AVUKAT_YRD' }, aktifMusteriId: 'tenant-1' })
    expect((await provaPuanla(girdi)).error).toBe('Prova puanını yalnız avukat ya da yönetici verebilir.')
    m.ctx.mockResolvedValue({ dbUser: { id: 'avukat-1', aktif: true, rol: 'ADMIN' }, aktifMusteriId: 'tenant-1' })
    expect((await provaPuanla({ ...girdi, puan: 'YANLIS' })).error).toBe('Yanlış ya da eksik puanında kısa bir not yazın.')
    expect((await provaPuanla({ ...girdi, prova: '2999-01-01' })).ok).toBe(false)
    expect(m.aktivite).not.toHaveBeenCalled()
    expect((await provaPuanla({ ...girdi, puan: 'EKSIK', not: 'Önce tebliğ sorulmalıydı.' })).ok).toBe(true)
  })
})

describe('yolHaritasiOnbellekGuncelle', () => {
  it('canlı sonucu önbelleğe yazar (değiştiyse); prova parametresi almaz', async () => {
    const r = await yolHaritasiOnbellekGuncelle(dosyaId)
    expect(r).toEqual({ ok: true, bilgi: 'Önbellek güncellendi.' })
    expect(m.yukle).toHaveBeenCalledWith({ dosyaId, musteriId: 'tenant-1' })
    m.onbellek.mockResolvedValue(false)
    expect((await yolHaritasiOnbellekGuncelle(dosyaId)).bilgi).toBe('Önbellek güncel.')
  })
})
