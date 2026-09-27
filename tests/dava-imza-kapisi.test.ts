/**
 * "İmzaya hazır" müvekkil onayı kapısı (06 2(f), 2(j); açık karar 4): dava açma, sulh/iskonto ve kanun yolu dilekçesi
 * OnayKaydi (ONAY) olmadan imzaya hazır olamaz; tek istisna dava dilekçesinde süre koruma istisnası. Kurgusal kayıtlar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  db: { rucuDosyasi: { findFirst: vi.fn() }, onayKaydi: { findMany: vi.fn() }, sure: { findMany: vi.fn() } },
}))
vi.mock('@/lib/prisma', () => ({ prisma: m.db }))

import { dilekceOnayTuru, imzaKapisi } from '@/lib/konsrucu/dava/imza-kapisi'
import { imzaKapisiYukle } from '@/lib/konsrucu/dava/imza-kapisi-veri'
import type { OnayKaydiOzet } from '@/lib/konsrucu/arabuluculuk/onay'

const SIMDI = new Date('2026-09-27T09:00:00Z')
const onay = (p: Partial<OnayKaydiOzet>): OnayKaydiOzet => ({ id: 'o', tur: 'DAVA_ACMA', sonuc: 'ONAY', alinmaAt: new Date('2026-08-01'), istisnaGerekce: null, ...p })

describe('dilekceOnayTuru', () => {
  it('dava → dava açma; istinaf/temyiz → kanun yolu; sulh → sulh/iskonto; usul dilekçeleri onay gerektirmez', () => {
    expect(dilekceOnayTuru('DAVA')).toBe('DAVA_ACMA')
    expect(dilekceOnayTuru('istinaf')).toBe('KANUN_YOLU')
    expect(dilekceOnayTuru('TEMYIZ')).toBe('KANUN_YOLU')
    expect(dilekceOnayTuru('SULH')).toBe('SULH_ISKONTO')
    for (const t of ['DELIL', 'CEVABA_CEVAP', 'BEYAN', null, '']) expect(dilekceOnayTuru(t)).toBeNull()
  })
})

describe('imzaKapisi', () => {
  it('dava dilekçesi: onay kaydı yokken kilitli ve mesaj müvekkil kararını söyler', () => {
    const k = imzaKapisi({ dilekceTuru: 'DAVA', onaylar: [], ihtiyatliSonGun: new Date('2027-06-23'), simdi: SIMDI })
    expect(k).toMatchObject({ acik: false, gerekenOnay: 'DAVA_ACMA', neden: 'YOK', istisnaMumkun: false })
    expect(k.mesaj).toMatch(/müvekkilindir/)
  })
  it('bekleyen talep ve ret kapıyı açmaz; ONAY açar', () => {
    expect(imzaKapisi({ dilekceTuru: 'DAVA', onaylar: [onay({ sonuc: 'BEKLIYOR', alinmaAt: null })], simdi: SIMDI }).acik).toBe(false)
    expect(imzaKapisi({ dilekceTuru: 'DAVA', onaylar: [onay({ sonuc: 'RET' })], simdi: SIMDI }).neden).toBe('RET')
    expect(imzaKapisi({ dilekceTuru: 'DAVA', onaylar: [onay({})], simdi: SIMDI })).toMatchObject({ acik: true, neden: 'ONAY' })
  })
  it('süre koruma istisnası yalnız dava dilekçesinde ve ≤ 14 gün kala gerekçeli kayıtla', () => {
    const istisna = onay({ sonuc: 'BEKLIYOR', alinmaAt: null, istisnaGerekce: 'Müvekkile ulaşılamadı, süre koruması gerekiyor.' })
    expect(imzaKapisi({ dilekceTuru: 'DAVA', onaylar: [istisna], ihtiyatliSonGun: new Date('2026-10-07'), simdi: SIMDI })).toMatchObject({ acik: true, neden: 'ISTISNA' })
    expect(imzaKapisi({ dilekceTuru: 'DAVA', onaylar: [istisna], ihtiyatliSonGun: new Date('2026-12-01'), simdi: SIMDI }).acik).toBe(false)
    // kanun yolunda istisna yok
    const ky = imzaKapisi({ dilekceTuru: 'ISTINAF', onaylar: [{ ...istisna, tur: 'KANUN_YOLU' }], ihtiyatliSonGun: new Date('2026-10-01'), simdi: SIMDI })
    expect(ky.acik).toBe(false)
    expect(ky.istisnaMumkun).toBe(false)
  })
  it('kanun yolu onayı davaya bağlıysa yalnız o davayı açar; dava açma onayı kanun yolunu açmaz', () => {
    const ky = onay({ tur: 'KANUN_YOLU', davaId: 'dava-1' })
    expect(imzaKapisi({ dilekceTuru: 'ISTINAF', onaylar: [ky], davaId: 'dava-1', simdi: SIMDI }).acik).toBe(true)
    expect(imzaKapisi({ dilekceTuru: 'ISTINAF', onaylar: [ky], davaId: 'dava-2', simdi: SIMDI }).acik).toBe(false)
    expect(imzaKapisi({ dilekceTuru: 'ISTINAF', onaylar: [onay({})], davaId: 'dava-1', simdi: SIMDI }).acik).toBe(false)
  })
  it('sulh dilekçesi sulh/iskonto onayı ister; silinmiş onay sayılmaz', () => {
    expect(imzaKapisi({ dilekceTuru: 'SULH', onaylar: [onay({ tur: 'SULH_ISKONTO', silindiAt: new Date('2026-09-01') })], simdi: SIMDI }).acik).toBe(false)
    expect(imzaKapisi({ dilekceTuru: 'SULH', onaylar: [onay({ tur: 'SULH_ISKONTO' })], simdi: SIMDI }).acik).toBe(true)
  })
  it('delil, cevaba cevap ve beyan dilekçesi ayrı müvekkil kararı gerektirmez', () => {
    for (const t of ['DELIL', 'CEVABA_CEVAP', 'BEYAN']) expect(imzaKapisi({ dilekceTuru: t, onaylar: [], simdi: SIMDI })).toMatchObject({ acik: true, neden: 'GEREKMIYOR', gerekenOnay: null })
  })
})

describe('imzaKapisiYukle (sahte Prisma)', () => {
  beforeEach(() => vi.resetAllMocks())
  it('dosya aktif müvekkil kapsamında aranır; başka müvekkilin dosyası null', async () => {
    m.db.rucuDosyasi.findFirst.mockResolvedValue(null)
    expect(await imzaKapisiYukle('d1', 'tenant-1', 'DAVA', null, SIMDI)).toBeNull()
    expect(m.db.rucuDosyasi.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'd1', musteriId: 'tenant-1' } }))
    expect(m.db.onayKaydi.findMany).not.toHaveBeenCalled()
  })
  it('silinmemiş onaylar ve İİK 67 ihtiyatlı günüyle kapıyı hesaplar', async () => {
    m.db.rucuDosyasi.findFirst.mockResolvedValue({ id: 'd1' })
    m.db.onayKaydi.findMany.mockResolvedValue([{ id: 'o1', tur: 'DAVA_ACMA', sonuc: 'BEKLIYOR', alinmaAt: null, istisnaGerekce: 'Süre dolmak üzere, müvekkile ulaşılamadı.', silindiAt: null, davaId: null }])
    m.db.sure.findMany.mockResolvedValue([{ onerilenIhtiyatli: new Date('2026-10-05'), durum: 'ACIK', silindiAt: null }])
    const k = await imzaKapisiYukle('d1', 'tenant-1', 'DAVA', null, SIMDI)
    expect(k).toMatchObject({ acik: true, neden: 'ISTISNA' })
    expect(m.db.onayKaydi.findMany).toHaveBeenCalledWith({ where: { dosyaId: 'd1', silindiAt: null } })
  })
})
