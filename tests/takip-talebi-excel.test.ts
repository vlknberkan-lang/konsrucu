/**
 * S21 · Ray takip Excel'inin icra sütunları (#11–#18; 06 §3.5) — kurgusal 30 sütunluk Excel testte üretilir.
 *  - Başlık satırı ada göre bulunur; #21 "ESAS" (dava) icra esas sanılmaz.
 *  - Her değer ÖNERİ olarak girer (AlanDegeri EXCEL/ONERI); ayrıştırılamayan hücre "elle tamamlayın" sorunu olur.
 *  - Aynı öneri ikinci içe aktarmada yeniden açılmaz.
 *  - Avukat esas no'yu onaylayınca dosya /api/uyap/hedefler yanıtına girer (kabul testi 4).
 * Kişi adları ve numaralar kurgusaldır.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

const db = vi.hoisted(() => {
  type Satir = Record<string, unknown>
  const t: Record<string, Satir[]> = {}
  let sayac = 0
  const yeniId = () => `40000000-0000-4000-8000-${String(++sayac).padStart(12, '0')}`
  const nesneMi = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && typeof (v as { toFixed?: unknown }).toFixed !== 'function'
  const OPS = ['in', 'notIn', 'not', 'lt', 'gt', 'equals']
  function eslesir(k: Satir, w: Record<string, unknown> | undefined): boolean {
    for (const [a, v] of Object.entries(w ?? {})) {
      if (a === 'OR') { if (!(v as Record<string, unknown>[]).some((x) => eslesir(k, x))) return false; continue }
      if (a === 'AND') { if (!(v as Record<string, unknown>[]).every((x) => eslesir(k, x))) return false; continue }
      const d = k[a] as unknown
      if (nesneMi(v) && Object.keys(v).some((x) => OPS.includes(x))) {
        const o = v as Record<string, unknown>
        if ('in' in o && !(o.in as unknown[]).includes(d)) return false
        if ('notIn' in o && (o.notIn as unknown[]).includes(d)) return false
        if ('not' in o && (o.not === null ? d == null : d === o.not)) return false
        if ('equals' in o && d !== o.equals) return false
      } else if (nesneMi(v)) {
        if (a === 'dosya') { const dosya = t.rucuDosyasi.find((x) => x.id === k.dosyaId); if (!dosya || !eslesir(dosya, v)) return false; continue }
        if (!nesneMi(d) || !eslesir(d, v)) return false
      } else if (d !== v) return false
    }
    return true
  }
  const iliski: Record<string, Record<string, (s: Satir, q: Record<string, unknown>) => unknown>> = {
    rucuDosyasi: { takipTalepleri: (s, q) => (t.takipTalebi ?? []).filter((x) => x.dosyaId === s.id && eslesir(x, q.where as Record<string, unknown>)).slice(0, (q.take as number) ?? 100) },
  }
  const bagla = (ad: string, s: Satir, q: Record<string, unknown>) => {
    const r: Satir = { ...s }
    const sec = (q?.select ?? q?.include) as Record<string, unknown> | undefined
    for (const [rel, f] of Object.entries(iliski[ad] ?? {})) if (sec?.[rel]) r[rel] = f(s, nesneMi(sec[rel]) ? (sec[rel] as Record<string, unknown>) : {})
    return r
  }
  const tanimli = (o: Satir) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  function model(ad: string) {
    t[ad] ??= []
    const k = () => t[ad]
    return {
      findFirst: async (q: Record<string, unknown> = {}) => { const s = k().find((x) => eslesir(x, q.where as Record<string, unknown>)); return s ? bagla(ad, s, q) : null },
      findUnique: async (q: Record<string, unknown>) => { const s = k().find((x) => eslesir(x, q.where as Record<string, unknown>)); return s ? bagla(ad, s, q) : null },
      findMany: async (q: Record<string, unknown> = {}) => k().filter((x) => eslesir(x, q.where as Record<string, unknown>)).slice(0, (q.take as number) ?? 1000).map((s) => bagla(ad, s, q)),
      count: async (q: Record<string, unknown> = {}) => k().filter((x) => eslesir(x, q.where as Record<string, unknown>)).length,
      aggregate: async (q: { where?: Record<string, unknown> }) => { const l = k().filter((x) => eslesir(x, q.where)); return { _max: { surum: l.length ? Math.max(...l.map((x) => x.surum as number)) : null } } },
      create: async (q: { data: Satir }) => { const s: Satir = { id: yeniId(), createdAt: new Date(), ...(ad === 'alanDegeri' ? { durum: 'ONERI', silindiAt: null, onayAt: null } : {}), ...(ad === 'takipTalebi' ? { gecerli: true, silindiAt: null, dondurulduAt: null } : {}), ...tanimli(q.data) }; k().push(s); return { ...s } },
      update: async (q: { where: Record<string, unknown>; data: Satir }) => { const s = k().find((x) => eslesir(x, q.where)); if (!s) throw new Error(`${ad} yok`); Object.assign(s, tanimli(q.data)); return { ...s } },
      updateMany: async (q: { where: Record<string, unknown>; data: Satir }) => { const l = k().filter((x) => eslesir(x, q.where)); for (const s of l) Object.assign(s, tanimli(q.data)); return { count: l.length } },
    }
  }
  const prisma: Record<string, unknown> = {}
  for (const ad of ['rucuDosyasi', 'alanDegeri', 'takipTalebi', 'aktivite', 'ayarlar', 'eklentiAnahtar', 'senkronIs']) prisma[ad] = model(ad)
  prisma.$transaction = async (x: unknown) => (typeof x === 'function' ? (x as (p: unknown) => unknown)(prisma) : Promise.all(x as Promise<unknown>[]))
  return { t, prisma, sifirla: () => { for (const k of Object.keys(t)) t[k].length = 0 }, ctx: { deger: null as unknown } }
})

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: async () => db.ctx.deger }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { rayExcelIcraCozumle, RAY_EXCEL_SUTUNLARI } from '@/lib/konsrucu/senkron/ray-excel-icra'
import { excelOnerileriGetir, excelOnerisiOnayla, excelOnerisiReddet, rayExcelIcraIceAktar, rayExcelIcraOnizle } from '@/app/(app)/dosya-islem/takip-talebi-actions'
import { GET as hedeflerGET } from '@/app/api/uyap/hedefler/route'

const RAY = 'musteri-ray'
const DOSYA = '50000000-0000-4000-8000-000000000001'
const ESKI_ANAHTAR = 'kr_' + 'de'.repeat(24)

/** Kurgusal 30 sütunluk Ray takip Excel'i (başlığın üstünde bir rapor satırı ile). */
function excel(satirlar: Record<number, unknown>[]): Uint8Array {
  const baslik = RAY_EXCEL_SUTUNLARI.map((s) => s.baslik)
  const aoa: unknown[][] = [['KURGUSAL TAKİP RAPORU'], baslik]
  for (const s of satirlar) aoa.push(baslik.map((_, i) => s[i + 1] ?? ''))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Rapor')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

const SATIR1 = { 1: 'HK-KURGU-1', 11: 'Kurgusal Kişi A', 12: 'Kurgusal Kişi B', 13: 'Kurgusal Kişi C', 14: 'Kurgusal Yardımcı', 15: 'Kurgusal 4. İcra Dairesi', 16: '2026/4321', 17: '15.03.2026', 18: '123.456,78', 21: '2026/99', 20: 'Kurgusal Asliye Ticaret' }
const SATIR2 = { 1: 'HK-KURGU-2', 16: 'bozuk esas', 17: '36.03.2026', 18: 'yüz bin' }

const formVerisi = (bayt: Uint8Array, ad = 'ray-takip.xlsx') => { const fd = new FormData(); fd.set('file', new File([bayt as Uint8Array<ArrayBuffer>], ad)); return fd }
const oturum = (rol = 'AVUKAT') => { db.ctx.deger = { dbUser: { id: 'kullanici-avukat', ad: 'Kurgusal Avukat', rol, aktif: true, musteriler: [{ musteriId: RAY }] }, izinli: [RAY], aktifMusteriId: RAY } }

beforeEach(() => {
  db.sifirla()
  oturum()
  db.t.ayarlar.push({ id: 'ayar-1', musteriId: RAY, senkronToken: ESKI_ANAHTAR, alacakliUnvan: 'Kurgusal Sigorta A.Ş.' })
  db.t.rucuDosyasi.push({ id: DOSYA, musteriId: RAY, hukukDosyaNo: 'HK-KURGU-1', icraDosyaNo: null, icraDairesi: null, yetkiliIcra: null, takipTarihi: null, islemYapanYrd: null, kaynakJson: { kaynak: 'hugo' }, durum: 'INCELENIYOR', rucuTutari: null, asilAlacak: 100000, cikarimJson: {}, uyapDurum: null, uyapSenkronAt: null, hasarDosyaNo: null })
})

describe('ayrıştırma (kuru)', () => {
  it('#11–#18 öneri olur; #21 ESAS (dava) icra esas sanılmaz; başlık rapor satırının altında bulunur', () => {
    const c = rayExcelIcraCozumle(excel([SATIR1]))
    expect(c.baslikSatiri).toBe(2)
    expect(c.eslesenSutunlar).toHaveLength(30)
    expect(c.satirlar).toHaveLength(1)
    const o = Object.fromEntries(c.satirlar[0].oneriler.map((x) => [x.alan, x.deger]))
    expect(o).toEqual({
      'kaynakJson.incelemeyeGonderen': 'Kurgusal Kişi A',
      'kaynakJson.inceleyen': 'Kurgusal Kişi B',
      'kaynakJson.yardimciyaGonderen': 'Kurgusal Kişi C',
      islemYapanYrd: 'Kurgusal Yardımcı',
      icraDairesi: 'Kurgusal 4. İcra Dairesi',
      icraDosyaNo: '2026/4321',
      takipTarihi: '2026-03-15',
      'takipTalebi.toplam': 123456.78,
    })
  })
  it('ayrıştırılamayan hücre öneri olmaz, "elle tamamlayın" sorunu olur', () => {
    const c = rayExcelIcraCozumle(excel([SATIR2]))
    expect(c.satirlar[0].oneriler).toEqual([])
    expect(c.satirlar[0].sorunlar).toHaveLength(3)
    expect(c.satirlar[0].sorunlar.join(' ')).toContain('elle tamamlayın')
  })
  it('hukuk no boş ya da mükerrer satır hata listesine düşer', () => {
    const c = rayExcelIcraCozumle(excel([SATIR1, { 16: '2026/1' }, SATIR1]))
    expect(c.satirlar).toHaveLength(1)
    expect(c.hatalar.map((h) => h.sebep)).toEqual([expect.stringContaining('HUKUK DOSYA NO boş'), expect.stringContaining('Mükerrer')])
  })
  it('Ray Excel\'i olmayan dosya reddedilir', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A', 'B'], [1, 2]]), 'x')
    const c = rayExcelIcraCozumle(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer))
    expect(c.satirlar).toEqual([])
    expect(c.hatalar[0].sebep).toContain('Başlık satırı bulunamadı')
  })
})

describe('içe aktarma ve onay (kabul testi 4)', () => {
  it('önizleme yazmaz; dosyası olmayan satır raporlanır', async () => {
    const r = await rayExcelIcraOnizle(formVerisi(excel([SATIR1, SATIR2])))
    expect(r.ok).toBe(true)
    expect(r.ozet).toEqual({ satir: 2, dosyaBulunan: 1, oneri: 8, bulunamayan: ['HK-KURGU-2'] })
    expect(db.t.alanDegeri).toHaveLength(0)
  })

  it('öneriler AlanDegeri(EXCEL, ONERI) olarak açılır; ikinci içe aktarma yeni öneri açmaz', async () => {
    const r = await rayExcelIcraIceAktar(formVerisi(excel([SATIR1])))
    expect(r).toMatchObject({ ok: true, acilan: 8, atlanan: 0 })
    expect(db.t.alanDegeri.every((a) => a.kaynakTuru === 'EXCEL' && a.durum === 'ONERI' && a.dosyaId === DOSYA)).toBe(true)
    expect(db.t.rucuDosyasi[0].icraDosyaNo).toBeNull() // onaysız hiçbir şey yazılmadı
    const r2 = await rayExcelIcraIceAktar(formVerisi(excel([SATIR1])))
    expect(r2).toMatchObject({ ok: true, acilan: 0, atlanan: 8 })
  })

  it('esas no onaylanınca dosyaya yazılır ve /api/uyap/hedefler yanıtına girer', async () => {
    await rayExcelIcraIceAktar(formVerisi(excel([SATIR1])))
    const oncesi = await (await hedeflerGET(new Request('http://yerel/api/uyap/hedefler?tazeSaat=0', { headers: { authorization: `Bearer ${ESKI_ANAHTAR}` } }))).json()
    expect(oncesi.hedefler).toHaveLength(0)
    const esas = db.t.alanDegeri.find((a) => a.alan === 'icraDosyaNo')!
    const daire = db.t.alanDegeri.find((a) => a.alan === 'icraDairesi')!
    expect((await excelOnerisiOnayla({ alanDegeriId: esas.id as string })).ok).toBe(true)
    expect((await excelOnerisiOnayla({ alanDegeriId: daire.id as string })).ok).toBe(true)
    expect(db.t.rucuDosyasi[0]).toMatchObject({ icraDosyaNo: '2026/4321', icraDairesi: 'Kurgusal 4. İcra Dairesi', durum: 'TAKIP_ACILDI' })
    expect(esas).toMatchObject({ durum: 'ONAYLI', onaylayanId: 'kullanici-avukat' })
    const sonrasi = await (await hedeflerGET(new Request('http://yerel/api/uyap/hedefler?tazeSaat=0', { headers: { authorization: `Bearer ${ESKI_ANAHTAR}` } }))).json()
    expect(sonrasi.hedefler).toEqual([expect.objectContaining({ id: DOSYA, icraDosyaNo: '2026/4321', daire: 'Kurgusal 4. İcra Dairesi', alacakliUnvan: 'Kurgusal Sigorta A.Ş.' })])
    expect(sonrasi.ozellikler).toBeDefined()
    expect(db.t.senkronIs ?? []).toHaveLength(0) // iş kuyruğu bayrağı kapalı: toplu turda çekilir
  })

  it('iş kuyruğu açıkken onaylanan esas no öncelikli anlık çekme açar (icra no girildi)', async () => {
    vi.stubEnv('IS_KUYRUGU', 'acik')
    try {
      await rayExcelIcraIceAktar(formVerisi(excel([SATIR1])))
      const daire = db.t.alanDegeri.find((a) => a.alan === 'icraDairesi')!
      const esas = db.t.alanDegeri.find((a) => a.alan === 'icraDosyaNo')!
      expect((await excelOnerisiOnayla({ alanDegeriId: daire.id as string })).ok).toBe(true)
      const r = await excelOnerisiOnayla({ alanDegeriId: esas.id as string })
      expect(r.bilgi).toContain('sıraya alındı')
      expect(db.t.senkronIs).toHaveLength(1)
      expect(db.t.senkronIs[0]).toMatchObject({ tur: 'ICRA', musteriId: RAY, dosyaId: DOSYA, isteyenId: 'kullanici-avukat', hedefJson: { daire: 'Kurgusal 4. İcra Dairesi', esas: '2026/4321' } })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('takip çıkışı takip talebine, tarih ve kişiler kendi alanlarına yazılır', async () => {
    await rayExcelIcraIceAktar(formVerisi(excel([SATIR1])))
    for (const alan of ['takipTalebi.toplam', 'takipTarihi', 'islemYapanYrd', 'kaynakJson.inceleyen']) {
      const o = db.t.alanDegeri.find((a) => a.alan === alan)!
      expect((await excelOnerisiOnayla({ alanDegeriId: o.id as string })).ok, alan).toBe(true)
    }
    expect(db.t.takipTalebi).toHaveLength(1)
    expect(Number(db.t.takipTalebi[0].toplam)).toBe(123456.78)
    expect(Number(db.t.takipTalebi[0].asilAlacak)).toBe(100000) // mevcut asıl alacaktan; hesap izi ayrıca onaylanır
    const d = db.t.rucuDosyasi[0]
    expect((d.takipTarihi as Date).toISOString().slice(0, 10)).toBe('2026-03-15')
    expect(d.islemYapanYrd).toBe('Kurgusal Yardımcı')
    expect(d.kaynakJson).toEqual({ kaynak: 'hugo', inceleyen: 'Kurgusal Kişi B' })
  })

  it('onay avukat kararıdır; ikinci onay "zaten onaylı"; ret satırı silmez', async () => {
    await rayExcelIcraIceAktar(formVerisi(excel([SATIR1])))
    const esas = db.t.alanDegeri.find((a) => a.alan === 'icraDosyaNo')!
    oturum('AVUKAT_YRD')
    expect((await excelOnerisiOnayla({ alanDegeriId: esas.id as string })).ok).toBe(false)
    const liste = await excelOnerileriGetir({ dosyaId: DOSYA })
    expect(liste).toMatchObject({ ok: true, avukat: false })
    expect(liste.oneriler).toHaveLength(8)
    oturum('AVUKAT')
    expect((await excelOnerisiOnayla({ alanDegeriId: esas.id as string })).ok).toBe(true)
    expect((await excelOnerisiOnayla({ alanDegeriId: esas.id as string })).bilgi).toContain('zaten onaylı')
    const daire = db.t.alanDegeri.find((a) => a.alan === 'icraDairesi')!
    expect((await excelOnerisiReddet({ alanDegeriId: daire.id as string })).ok).toBe(true)
    expect(db.t.alanDegeri.find((a) => a.id === daire.id)).toMatchObject({ durum: 'REDDEDILDI' })
    expect(db.t.rucuDosyasi[0].icraDairesi).toBeNull()
  })

  it('görüntüleyen içe aktaramaz', async () => {
    oturum('GORUNTULEYEN')
    expect((await rayExcelIcraIceAktar(formVerisi(excel([SATIR1])))).ok).toBe(false)
    expect(db.t.alanDegeri).toHaveLength(0)
  })
})
