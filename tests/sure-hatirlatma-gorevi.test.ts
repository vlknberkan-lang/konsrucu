import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), mail: vi.fn(), olay: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { sure: { findMany: m.findMany, update: m.update } } }))
vi.mock('@/lib/konsrucu/mail', () => ({ mailGonder: m.mail }))
vi.mock('@/lib/konsrucu/sistem-olay', () => ({ sistemOlayKaydet: m.olay }))

import { sureHatirlatmalariniIsle } from '@/lib/konsrucu/sure/hatirlatma-gorevi'
import { gunEkle, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'

const SIMDI = new Date('2026-10-01T07:00:00Z') // İstanbul 10:00
const BUGUN = isoGundenTarih('2026-10-01') as Date
const DOSYA = { id: 'dosya-1', hukukDosyaNo: 'HK-KURGU-07', hasarDosyaNo: null, icraDosyaNo: '2026/1 E.', durum: 'ITIRAZ', uyapDurum: 'Açık' }
const satir = (p: Record<string, unknown> = {}) => ({
  id: 'sure-1', dosyaId: 'dosya-1', borcluId: 'borclu-1', tur: 'IIK67', dayanak: 'İİK 67/1', durum: 'ACIK', silindiAt: null,
  onaylananSonGun: null, onerilenIhtiyatli: gunEkle(BUGUN, 3), hatirlatmaJson: null, dosya: DOSYA, ...p,
})
const girdi = { musteriId: 'tenant-1', musteriAd: 'Kurgusal Sigorta', alicilar: ['ekip@ornek.test'], aliciAd: 'Ekip', simdi: SIMDI, baseUrl: 'https://ornek.test' }

beforeEach(() => {
  vi.resetAllMocks()
  m.update.mockResolvedValue({})
  m.mail.mockResolvedValue({ ok: true, id: 'mail-1' })
})

describe('S24 · süre hatırlatma görevi (etkinlik-hatirlatma cron\'u içinde)', () => {
  it('ihtiyatlı güne 3 gün kala gerçekten gönderir ve eşiği kaydeder; kapsam tenant ile sınırlı', async () => {
    const s = satir()
    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }]).mockResolvedValueOnce([s])
    const r = await sureHatirlatmalariniIsle({ ...girdi, kip: { kip: 'resend', gercek: true } })
    expect(r).toMatchObject({ due: 1, gonderilen: 1, hata: 0, gonderilmedi: 0 })
    expect(m.findMany.mock.calls[0][0].where.dosya).toMatchObject({ musteriId: 'tenant-1' })
    expect(m.mail).toHaveBeenCalledTimes(1)
    const mail = m.mail.mock.calls[0][0]
    expect(mail.to).toEqual(['ekip@ornek.test'])
    expect(mail.konu).toContain('İİK 67')
    expect(mail.html).toContain('teyit gerekli')
    expect(mail.html).toContain('İhtiyatlı öneri')
    const kayit = m.update.mock.calls[0][0].data.hatirlatmaJson
    expect(kayit).toEqual([expect.objectContaining({ esik: 3, hedef: '2026-10-04', gonderildi: true, kip: 'resend', kaynak: 'IHTIYATLI' })])
  })

  it('aynı eşik gönderilmişse ikinci koşuda göndermez', async () => {
    const s = satir({ hatirlatmaJson: [{ esik: 3, hedef: '2026-10-04', kaynak: 'IHTIYATLI', at: SIMDI.toISOString(), kip: 'resend', gonderildi: true }] })
    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }]).mockResolvedValueOnce([s])
    const r = await sureHatirlatmalariniIsle({ ...girdi, kip: { kip: 'resend', gercek: true } })
    expect(r.due).toBe(0)
    expect(m.mail).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })

  it('console kipinde e-posta gönderilmez, gönderilmiş sayılmaz ve SistemOlay yazılır (B52)', async () => {
    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }]).mockResolvedValueOnce([satir()])
    const r = await sureHatirlatmalariniIsle({ ...girdi, kip: { kip: 'console', gercek: false } })
    expect(r).toMatchObject({ due: 1, gonderilen: 0, gonderilmedi: 1, hata: 0 })
    expect(m.mail).not.toHaveBeenCalled()
    expect(m.update.mock.calls[0][0].data.hatirlatmaJson).toEqual([expect.objectContaining({ gonderildi: false, kip: 'console' })])
    expect(m.olay).toHaveBeenCalledWith('MAIL_HATA', 'etkinlik-hatirlatma/sure', expect.stringContaining('GÖNDERİLMEDİ'), expect.anything())
  })

  it('aynı dosya + tür + borçlu için iki satır varsa tek hatırlatma gider', async () => {
    const a = satir({ id: 'sure-a' })
    const b = satir({ id: 'sure-b', onerilenIhtiyatli: gunEkle(BUGUN, 5) })
    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }, { dosyaId: 'dosya-1' }]).mockResolvedValueOnce([a, b])
    const r = await sureHatirlatmalariniIsle({ ...girdi, kip: { kip: 'resend', gercek: true } })
    expect(r.tekilAtlanan).toBe(1)
    expect(m.mail).toHaveBeenCalledTimes(1)
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sure-a' } }))
  })

  it('UYAP\'ta kapalı dosyanın süresi hatırlatılmaz', async () => {
    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }]).mockResolvedValueOnce([satir({ dosya: { ...DOSYA, uyapDurum: 'Kapalı' } })])
    const r = await sureHatirlatmalariniIsle({ ...girdi, kip: { kip: 'resend', gercek: true } })
    expect(r.due).toBe(0)
    expect(m.mail).not.toHaveBeenCalled()
  })

  it('İstanbul 08:00 öncesi göndermez (test alıcısı verilmişse gönderir); dry=1 hiçbir şey yazmaz', async () => {
    const gece = new Date('2026-10-01T02:00:00Z') // 05:00 İstanbul
    expect((await sureHatirlatmalariniIsle({ ...girdi, simdi: gece, kip: { kip: 'resend', gercek: true } })).atlandi).toBe('saat')
    expect(m.findMany).not.toHaveBeenCalled()

    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }]).mockResolvedValueOnce([satir()])
    const r = await sureHatirlatmalariniIsle({ ...girdi, simdi: gece, test: true, dry: true, kip: { kip: 'resend', gercek: true } })
    expect(r.due).toBe(1)
    expect(r.detay[0]).toMatchObject({ esik: 3, ok: true })
    expect(m.mail).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })

  it('test alıcısına (?to=) giden hatırlatma eşiği gönderilmiş saymaz; ekibin gerçek hatırlatması düşmez', async () => {
    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }]).mockResolvedValueOnce([satir()])
    const r = await sureHatirlatmalariniIsle({ ...girdi, alicilar: ['test@ornek.test'], test: true, kip: { kip: 'resend', gercek: true } })
    expect(r.gonderilen).toBe(1)
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: ['test@ornek.test'] }))
    expect(m.update).not.toHaveBeenCalled()
  })

  it('gönderim hatası sayılır ve kayda düşer (sonraki koşu yeniden dener)', async () => {
    m.mail.mockResolvedValue({ ok: false, error: 'Resend 500' })
    m.findMany.mockResolvedValueOnce([{ dosyaId: 'dosya-1' }]).mockResolvedValueOnce([satir()])
    const r = await sureHatirlatmalariniIsle({ ...girdi, kip: { kip: 'resend', gercek: true } })
    expect(r.hata).toBe(1)
    expect(m.update.mock.calls[0][0].data.hatirlatmaJson).toEqual([expect.objectContaining({ gonderildi: false, hata: 'Resend 500' })])
  })
})
