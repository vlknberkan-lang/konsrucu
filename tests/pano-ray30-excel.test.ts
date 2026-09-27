/**
 * S30 · "Ray raporunu indir" — GET /atanan-dosyalar/export?rapor=ray (oturum ve Prisma sahte; DB'ye gidilmez).
 * Kabul 4: indirilen dosyada 30 sütun, Ray takip Excel'inin başlıklarıyla birebir (1. satır); dava aşamasındaki dosya
 * mahkeme/esas/duruşmayla; teyitsiz hücre sarı ve notlu; sorgu müvekkil kapsamlı; indirme Aktivite'ye yazılır;
 * rapor kimseye gönderilmez. Bütün veriler kurgusaldır.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  aktivite: vi.fn(),
  kullanici: { id: 'u-avukat', ad: 'Avukat K', rol: 'AVUKAT' },
}))

vi.mock('@/lib/konsrucu/db', () => ({
  ctx: async () => ({ dbUser: h.kullanici, izinli: ['m1'], aktifMusteriId: 'm1' }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    rucuDosyasi: { findMany: h.findMany },
    musteri: { findUnique: async () => ({ ad: 'Kurgusal Sigorta A.Ş.' }) },
    aktivite: { create: h.aktivite },
  },
}))

import { GET } from '@/app/(app)/atanan-dosyalar/export/route'
import { RAY_30_SUTUNLAR } from '@/lib/konsrucu/rapor-mail'

const ileri = (gun: number) => new Date(Date.now() + gun * 86_400_000)

const dosyalar = [
  {
    hukukDosyaNo: 'HK-2026-0001', hasarDosyaNo: 'HS-1', hasarTarihi: new Date('2025-11-02T00:00:00Z'), zamanasimi: new Date('2027-11-02T00:00:00Z'),
    rucuSebebi: 'Hizmet kusuru', rucuSebebiKod: null, rucuOrani: '%100', rucuTutari: '1000.50', davaMiktari: '1000.50',
    kadroluAvukat: 'Avukat K', sozlesmeliAvukat: null, kaynakJson: { incelemeyeGonderen: 'Kişi 1' }, islemYapanYrd: null,
    icraDairesi: 'İstanbul 1. İcra Dairesi', icraDosyaNo: '2026/1', takipTarihi: new Date('2026-07-24T00:00:00Z'),
    durum: 'DAVA', icraEksen: 'DURDU_ITIRAZ', arabEksen: 'SON_TUTANAK_DIGER', davaEksen: 'DERDEST',
    eksenJson: { icra: { teyit: 'TEYITLI' }, arab: { teyit: 'TEYITLI' }, dava: { teyit: 'TEYITLI' } }, kapanisSebebi: null,
    borclular: [{ id: 'b1', adUnvan: 'Kurgusal Borçlu A' }],
    takipTalepleri: [{ toplam: '1100.00', gecerli: true, surum: 1, onaylayanId: 'x', dondurulduAt: new Date(), silindiAt: null }],
    asamalar: [], etkinlikler: [], ihtiyatiHacizler: [],
    davalar: [{
      rolumuz: 'DAVACI', derece: 1, mahkemeTuru: 'ASLIYE_HUKUK', mahkemeYer: 'İstanbul', mahkemeNo: '5', esasYil: 2026, esasSira: 123,
      ustDosyaNoHam: null, acilisTarihi: new Date('2026-09-08T00:00:00Z'), sonrakiDurusma: ileri(20), onIncelemeTarihi: null,
      evre: 'DILEKCELER', durum: 'DERDEST', hukum: null, kararTarihi: null, kararOnayAt: null, kesinlesmeTarihi: null, silindiAt: null,
      createdAt: new Date('2026-09-08T00:00:00Z'), asama: { detayJson: null },
      taraflar: [{ rol: 'DAVALI', borcluId: null, adHam: 'Kurgusal Davalı B', teyit: 'ADAY', silindiAt: null }],
      islemler: [],
    }],
  },
  {
    hukukDosyaNo: 'HK-2026-0002', hasarDosyaNo: null, hasarTarihi: null, zamanasimi: null, rucuSebebi: null, rucuSebebiKod: null,
    rucuOrani: null, rucuTutari: null, davaMiktari: null, kadroluAvukat: null, sozlesmeliAvukat: null, kaynakJson: null, islemYapanYrd: null,
    icraDairesi: null, icraDosyaNo: null, takipTarihi: null, durum: 'HAVUZDA', icraEksen: null, arabEksen: null, davaEksen: null, eksenJson: null, kapanisSebebi: null,
    borclular: [], takipTalepleri: [], asamalar: [], etkinlikler: [], ihtiyatiHacizler: [], davalar: [],
  },
]

async function indir(url = 'http://yerel/atanan-dosyalar/export?rapor=ray') {
  const res = await GET(new Request(url))
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await res.arrayBuffer())
  return { res, wb }
}

beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue(dosyalar)
  h.aktivite.mockReset().mockResolvedValue({})
})

describe('Ray raporu indirme', () => {
  it('xlsx döner; 1. satır Ray başlıklarıyla birebir 30 sütun', async () => {
    const { res, wb } = await indir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Disposition')).toMatch(/Ray-Raporu-30-Sutun-\d{4}-\d{2}-\d{2}\.xlsx/)
    const ws = wb.getWorksheet('Ray Takip')!
    const basliklar = Array.from({ length: 30 }, (_, i) => ws.getRow(1).getCell(i + 1).value)
    expect(basliklar).toEqual(RAY_30_SUTUNLAR.map((s) => s.baslik))
    expect(ws.getRow(1).getCell(31).value).toBeNull()
    expect(ws.rowCount).toBe(3)
  })

  it('dava aşamasındaki dosya mahkeme, esas ve duruşmayla; tarih ve tutar hücreleri türlü', async () => {
    const { wb } = await indir()
    const r = wb.getWorksheet('Ray Takip')!.getRow(2)
    expect(r.getCell(1).value).toBe('HK-2026-0001')
    expect(r.getCell(20).value).toBe('İstanbul 5. Asliye Hukuk Mahkemesi')
    expect(r.getCell(21).value).toBe('2026/123')
    expect(r.getCell(26).value).toBeInstanceOf(Date)
    expect(r.getCell(3).numFmt).toBe('dd.mm.yyyy')
    expect(r.getCell(7).value).toBe(1000.5)
    expect(r.getCell(18).value).toBe(1100)
  })

  it('teyitsiz hücre sarı ve notlu; "Teyit Notları" sayfasında listelenir', async () => {
    const { wb } = await indir()
    const c = wb.getWorksheet('Ray Takip')!.getRow(2).getCell(22)
    expect(c.value).toBe('Kurgusal Davalı B')
    expect(JSON.stringify(c.note)).toMatch(/TEYİTSİZ/)
    expect((c.fill as ExcelJS.FillPattern).fgColor?.argb).toBeTruthy()
    const notlar = wb.getWorksheet('Teyit Notları')!
    const satirlar = notlar.getSheetValues().slice(2).map((v) => (v as unknown[]).slice(1, 3))
    expect(satirlar).toContainEqual(['HK-2026-0001', '#22 DAVALI'])
  })

  it('sütun kaynakları ve rapor bilgisi: program göndermez, e-posta yalnız taslak', async () => {
    const { wb } = await indir()
    expect(wb.getWorksheet('Sütun Kaynakları')!.rowCount).toBe(31)
    const bilgi = wb.getWorksheet('Rapor Bilgisi')!
    const metin = JSON.stringify(bilgi.getSheetValues())
    expect(metin).toContain('Program göndermez')
    expect(metin).toContain('Rücu dosyaları takip raporu')
    expect(metin).not.toContain('Kurgusal Davalı B') // taslak metninde kişisel veri yok
  })

  it('sorgu müvekkil kapsamlı ve Hugo tevdiye kümesiyle aynı; indirme Aktivite’ye yazılır', async () => {
    await indir('http://yerel/atanan-dosyalar/export?rapor=ray&asama=dava')
    const arg = h.findMany.mock.calls[0][0]
    expect(arg.where.musteriId).toBe('m1')
    expect(arg.where.hukukDosyaNo).toEqual({ not: null })
    expect(arg.where.durum).toEqual({ in: ['DAVA'] })
    expect(arg.select.davalar.where).toEqual({ silindiAt: null })
    expect(h.aktivite).toHaveBeenCalledTimes(1)
    const a = h.aktivite.mock.calls[0][0].data
    expect(a).toMatchObject({ kullaniciId: 'u-avukat', eylem: 'Ray raporu indirildi (30 sütun)' })
    expect(a.detayJson).toMatchObject({ musteriId: 'm1', dosya: 2, davaAsamasinda: 1, teyitsizSatir: 2 })
  })

  it('yardımcı indirirse rapor "TASLAK" damgalı; iz yazılamasa da rapor iner', async () => {
    h.kullanici.rol = 'AVUKAT_YRD'
    h.aktivite.mockRejectedValue(new Error('yazılamadı'))
    try {
      const { res, wb } = await indir()
      expect(res.status).toBe(200)
      expect(JSON.stringify(wb.getWorksheet('Rapor Bilgisi')!.getSheetValues())).toContain('TASLAK')
    } finally {
      h.kullanici.rol = 'AVUKAT'
    }
  })

  it('rapor parametresi yoksa eski 16 sütunluk liste değişmeden iner', async () => {
    h.findMany.mockResolvedValue([])
    const { wb } = await indir('http://yerel/atanan-dosyalar/export')
    expect(wb.getWorksheet('Atanan Dosyalar')).toBeTruthy()
    expect(wb.getWorksheet('Ray Takip')).toBeUndefined()
    expect(h.aktivite).not.toHaveBeenCalled()
  })
})
