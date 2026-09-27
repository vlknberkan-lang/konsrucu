/**
 * S22 · Anlık senkron iş kuyruğu — uçtan uca (uçlar + veritabanı katmanı + program eylemleri), bellek içi sahte DB ile.
 * Kimlik GERÇEK (lib/konsrucu/uyap-auth): anahtarlar test içinde üretilir, yalnız sha256 özeti "DB"ye yazılır.
 *
 * Kabul testinin karşılıkları:
 *  - "Kaydet ve UYAP'tan çek" öncelikli iş açar; eklenti /is/sira'da görür, /al ile üstlenir, adımlar akar, /bitir.
 *  - İki eklenti aynı anda → iş yalnız birine gider (atomik üstlenme; ikincisi 409).
 *  - Zurich anahtarı Ray işini alamaz (404) ve göremez.
 *  - Eski şirket anahtarı ve iptal edilmiş anahtar yeni uçlara giremez (401).
 *  - 5 dk hareketsiz iş ZAMAN_ASIMI olur ve Sistem Olayları'na yazılır.
 * Veriler kurgusaldır; kişisel veri yok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const db = vi.hoisted(() => {
  type Satir = Record<string, unknown>
  const t: Record<string, Satir[]> = {}
  let sayac = 0
  const yeniId = () => `00000000-0000-4000-8000-${String(++sayac).padStart(12, '0')}`
  const nesneMi = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)
  const OPS = ['in', 'notIn', 'not', 'lt', 'gt', 'gte', 'lte', 'equals', 'startsWith']
  function eslesir(k: Satir, w: Record<string, unknown> | undefined): boolean {
    for (const [a, v] of Object.entries(w ?? {})) {
      if (a === 'AND') { if (!(v as Record<string, unknown>[]).every((x) => eslesir(k, x))) return false; continue }
      if (a === 'OR') { if (!(v as Record<string, unknown>[]).some((x) => eslesir(k, x))) return false; continue }
      const d = k[a] as unknown
      if (nesneMi(v) && Object.keys(v).some((x) => OPS.includes(x))) {
        const o = v as Record<string, unknown>
        const ci = o.mode === 'insensitive'
        const n = (x: unknown) => (ci && typeof x === 'string' ? x.toLocaleLowerCase('tr') : x)
        if ('in' in o && !(o.in as unknown[]).includes(d)) return false
        if ('notIn' in o && (o.notIn as unknown[]).includes(d)) return false
        if ('not' in o && (o.not === null ? d == null : d === o.not)) return false
        if ('lt' in o && !(d != null && (d as number) < (o.lt as number))) return false
        if ('gt' in o && !(d != null && (d as number) > (o.gt as number))) return false
        if ('equals' in o && n(d) !== n(o.equals)) return false
      } else if (nesneMi(v)) {
        if (!nesneMi(d) || !eslesir(d, v)) return false
      } else if (d !== v && !(d instanceof Date && v instanceof Date && d.getTime() === v.getTime())) return false
    }
    return true
  }
  const iliski: Record<string, Record<string, (s: Satir) => unknown>> = {
    senkronIs: { dosya: (s) => t.rucuDosyasi.find((d) => d.id === s.dosyaId) },
    eklentiAnahtar: { kullanici: (s) => t.kullanici.find((u) => u.id === s.kullaniciId) },
  }
  function bagla(ad: string, s: Satir, q?: Record<string, unknown>): Satir {
    const sec = q as { select?: Record<string, unknown>; include?: Record<string, unknown> } | undefined
    const r: Satir = { ...s }
    for (const [rel, f] of Object.entries(iliski[ad] ?? {})) if (sec?.select?.[rel] || sec?.include?.[rel]) r[rel] = f(s)
    return r
  }
  function sirala(l: Satir[], orderBy: unknown): Satir[] {
    const o = (Array.isArray(orderBy) ? orderBy[0] : orderBy) as Record<string, unknown> | undefined
    if (!o) return l
    const [alan, yon] = Object.entries(o)[0]
    const y = (typeof yon === 'string' ? yon : (yon as { sort: string }).sort) === 'desc' ? -1 : 1
    return [...l].sort((a, b) => ((a[alan] as number) > (b[alan] as number) ? y : (a[alan] as number) < (b[alan] as number) ? -y : 0))
  }
  function model(ad: string) {
    t[ad] ??= []
    const kaynak = () => t[ad]
    return {
      findFirst: async (q: { where?: Record<string, unknown>; orderBy?: unknown } & Record<string, unknown> = {}) => { const s = sirala(kaynak().filter((k) => eslesir(k, q.where)), q.orderBy)[0]; return s ? bagla(ad, s, q) : null },
      findUnique: async (q: { where: Record<string, unknown> } & Record<string, unknown>) => { const s = kaynak().find((k) => eslesir(k, q.where)); return s ? bagla(ad, s, q) : null },
      findMany: async (q: { where?: Record<string, unknown>; orderBy?: unknown; take?: number } & Record<string, unknown> = {}) => sirala(kaynak().filter((k) => eslesir(k, q.where)), q.orderBy).slice(0, q.take ?? 10_000).map((s) => bagla(ad, s, q)),
      count: async (q: { where?: Record<string, unknown> } = {}) => kaynak().filter((k) => eslesir(k, q.where)).length,
      create: async (q: { data: Satir } & Record<string, unknown>) => { const s: Satir = { id: yeniId(), createdAt: new Date(), updatedAt: new Date(), durum: ad === 'senkronIs' ? 'BEKLIYOR' : undefined, ...q.data }; kaynak().push(s); return bagla(ad, s, q) },
      update: async (q: { where: Record<string, unknown>; data: Satir }) => { const s = kaynak().find((k) => eslesir(k, q.where)); if (!s) throw new Error(`${ad} yok`); Object.assign(s, tanimli(q.data), { updatedAt: new Date() }); return { ...s } },
      updateMany: async (q: { where: Record<string, unknown>; data: Satir }) => { const l = kaynak().filter((k) => eslesir(k, q.where)); for (const s of l) Object.assign(s, tanimli(q.data), { updatedAt: new Date() }); return { count: l.length } },
      upsert: async (q: { where: Record<string, Record<string, unknown>>; create: Satir; update: Satir }) => {
        const w = Object.values(q.where)[0]
        const s = kaynak().find((k) => eslesir(k, w))
        if (s) { Object.assign(s, tanimli(q.update)); return { ...s } }
        const y: Satir = { id: yeniId(), createdAt: new Date(), ...q.create }
        kaynak().push(y)
        return { ...y }
      },
    }
  }
  const prisma: Record<string, unknown> = {}
  // Prisma'da undefined alan "değiştirme" demektir; sahte DB de öyle davranır
  const tanimli = (o: Satir) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  for (const ad of ['senkronIs', 'eklentiNabiz', 'eklentiAnahtar', 'ayarlar', 'aktivite', 'sistemOlay', 'rucuDosyasi', 'kullanici', 'takipTalebi']) prisma[ad] = model(ad)
  prisma.$transaction = async (x: unknown) => (typeof x === 'function' ? (x as (p: unknown) => unknown)(prisma) : Promise.all(x as Promise<unknown>[]))
  const sifirla = () => { for (const k of Object.keys(t)) t[k].length = 0 }
  return { t, prisma, sifirla, ctx: { deger: null as unknown } }
})

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: async () => db.ctx.deger }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { anahtarUret } from '@/lib/konsrucu/senkron/anahtar'
import { isOlustur, senkronIsZamanAsimi } from '@/lib/konsrucu/senkron/is-kuyrugu'
import { GET as siraGET } from '@/app/api/uyap/is/sira/route'
import { POST as alPOST } from '@/app/api/uyap/is/[id]/al/route'
import { POST as adimPOST } from '@/app/api/uyap/is/[id]/adim/route'
import { POST as bitirPOST } from '@/app/api/uyap/is/[id]/bitir/route'
import { GET as saglikGET } from '@/app/api/uyap/is/saglik/route'
import { icraNoKaydetVeCek, senkronIsDurumu, uyaptanCek } from '@/app/(app)/dosya-islem/senkron-actions'

const RAY = 'musteri-ray'
const ZURICH = 'musteri-zurich'
const DOSYA = '10000000-0000-4000-8000-000000000001'
const DOSYA2 = '10000000-0000-4000-8000-000000000002'
const CIHAZ_A = 'ck_aaaaaaaaaaaaaaaaaaaaaaaa'
const CIHAZ_B = 'ck_bbbbbbbbbbbbbbbbbbbbbbbb'
const ESKI_RAY = 'kr_' + 'ab'.repeat(24)

let yeniRay = ''
let yeniZurich = ''
let iptalli = ''

function kur() {
  db.sifirla()
  db.t.kullanici.push(
    { id: 'kullanici-yelda', ad: 'Kurgusal Avukat', aktif: true, rol: 'AVUKAT', musteriler: [{ musteriId: RAY }] },
    { id: 'kullanici-z', ad: 'Kurgusal Zurich Avukatı', aktif: true, rol: 'AVUKAT', musteriler: [{ musteriId: ZURICH }] },
  )
  const a = anahtarUret(); yeniRay = a.anahtar
  const z = anahtarUret(); yeniZurich = z.anahtar
  const i = anahtarUret(); iptalli = i.anahtar
  const gelecek = new Date(Date.now() + 30 * 86_400_000)
  db.t.eklentiAnahtar.push(
    { id: 'anahtar-ray', musteriId: RAY, kullaniciId: 'kullanici-yelda', ozet: a.ozet, onek: a.onek, sonKullanma: gelecek, iptalAt: null, sonGorulme: null },
    { id: 'anahtar-z', musteriId: ZURICH, kullaniciId: 'kullanici-z', ozet: z.ozet, onek: z.onek, sonKullanma: gelecek, iptalAt: null, sonGorulme: null },
    { id: 'anahtar-iptal', musteriId: RAY, kullaniciId: 'kullanici-yelda', ozet: i.ozet, onek: i.onek, sonKullanma: gelecek, iptalAt: new Date(), sonGorulme: null },
  )
  db.t.ayarlar.push({ id: 'ayar-ray', musteriId: RAY, senkronToken: ESKI_RAY, alacakliUnvan: 'Kurgusal Sigorta A.Ş.' })
  db.t.rucuDosyasi.push(
    { id: DOSYA, musteriId: RAY, hukukDosyaNo: 'HK-KURGU-1', icraDosyaNo: null, icraDairesi: 'Kurgusal 1. İcra Dairesi', yetkiliIcra: null, durum: 'INCELENIYOR', cikarimJson: { tevzi: { birimAdi: 'Kurgusal 1. İcra Dairesi', uyapDosyaId: 'SIFRELI-KURGU' } } },
    { id: DOSYA2, musteriId: RAY, hukukDosyaNo: 'HK-KURGU-2', icraDosyaNo: '2026/555', icraDairesi: 'Kurgusal 2. İcra Dairesi', yetkiliIcra: null, durum: 'TEBLIG_EDILDI', cikarimJson: {} },
  )
}

const bearer = (anahtar: string) => ({ authorization: `Bearer ${anahtar}`, 'content-type': 'application/json' })
const sira = (anahtar: string, cihaz = CIHAZ_A, oturum = '1') => siraGET(new Request(`http://yerel/api/uyap/is/sira?cihaz=${cihaz}&surum=2.0.0&oturum=${oturum}`, { headers: bearer(anahtar) }))
const post = (fn: (r: Request, c: { params: { id: string } }) => Promise<Response>, id: string, anahtar: string, govde: unknown) =>
  fn(new Request(`http://yerel/api/uyap/is/${id}`, { method: 'POST', headers: bearer(anahtar), body: JSON.stringify(govde) }), { params: { id } })
const json = async (r: Response) => ({ status: r.status, govde: await r.json() })

function oturum(rol = 'AVUKAT', aktif = true) {
  db.ctx.deger = { dbUser: { id: 'kullanici-yelda', rol, aktif, ad: 'Kurgusal Avukat', musteriler: [{ musteriId: RAY }] }, izinli: [RAY], aktifMusteriId: RAY }
}

beforeEach(() => {
  kur()
  vi.unstubAllEnvs()
  vi.stubEnv('IS_KUYRUGU', 'acik')
  oturum()
})
afterEach(() => vi.unstubAllEnvs())

describe('yeni uçlar yalnız kişisel anahtarla', () => {
  it('eski şirket anahtarı /is/sira\'ya giremez (401) — eski uçlarda çalışmaya devam eder', async () => {
    const r = await json(await sira(ESKI_RAY))
    expect(r.status).toBe(401)
    expect(r.govde.error).toContain('yeni eklenti anahtarı')
  })
  it('iptal edilmiş anahtar → 401', async () => {
    expect((await sira(iptalli)).status).toBe(401)
  })
  it('geçersiz cihaz kimliği → 400', async () => {
    expect((await sira(yeniRay, 'x')).status).toBe(400)
  })
})

describe('nabız — "UYAP bağlı mı?" ölçülür', () => {
  it('her yoklama (musteri, cihaz) başına tek nabız satırı yazar; kişi ve anahtar izli', async () => {
    await sira(yeniRay, CIHAZ_A, '1')
    await sira(yeniRay, CIHAZ_A, '0')
    expect(db.t.eklentiNabiz).toHaveLength(1)
    expect(db.t.eklentiNabiz[0]).toMatchObject({ musteriId: RAY, cihaz: CIHAZ_A, surum: '2.0.0', uyapOturum: false, kullaniciId: 'kullanici-yelda', anahtarId: 'anahtar-ray' })
  })
  it('bayrak kapalıyken iş dağıtılmaz ama nabız yazılır', async () => {
    vi.stubEnv('IS_KUYRUGU', '')
    await isOlustur({ musteriId: RAY, dosyaId: DOSYA, tur: 'ICRA', hedef: { esas: '2026/1234' }, isteyenId: 'kullanici-yelda' })
    const r = await json(await sira(yeniRay))
    expect(r.govde).toMatchObject({ ok: true, bekleyen: 0, isler: [], ozellikler: { isKuyrugu: false } })
    expect(db.t.eklentiNabiz).toHaveLength(1)
  })
})

describe('program: "Kaydet ve UYAP\'tan çek"', () => {
  it('esas no yazılır, durum yalnız ileri yönde TAKIP_ACILDI, öncelikli ICRA işi açılır (daire tevziden)', async () => {
    const r = await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: ' 2026 / 1234 ' })
    expect(r.ok).toBe(true)
    expect(r.isId).toBeTruthy()
    const d = db.t.rucuDosyasi.find((x) => x.id === DOSYA)!
    expect(d).toMatchObject({ icraDosyaNo: '2026/1234', icraDairesi: 'Kurgusal 1. İcra Dairesi', durum: 'TAKIP_ACILDI' })
    expect(db.t.senkronIs).toHaveLength(1)
    expect(db.t.senkronIs[0]).toMatchObject({ tur: 'ICRA', durum: 'BEKLIYOR', musteriId: RAY, dosyaId: DOSYA, isteyenId: 'kullanici-yelda', hedefJson: { daire: 'Kurgusal 1. İcra Dairesi', esas: '2026/1234', uyapDosyaId: 'SIFRELI-KURGU' } })
    expect(db.t.aktivite.some((a) => a.kullaniciId === 'kullanici-yelda' && String(a.eylem).includes('2026/1234'))).toBe(true)
  })
  it('iki kez basmak ikinci iş açmaz (sürmekte olan iş döner)', async () => {
    await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: '2026/1234' })
    const r = await uyaptanCek({ dosyaId: DOSYA })
    expect(r.ok).toBe(true)
    expect(db.t.senkronIs).toHaveLength(1)
  })
  it('ileri evredeki dosyada esas no düzeltmek durumu geri çekmez', async () => {
    await icraNoKaydetVeCek({ dosyaId: DOSYA2, esasNo: '2026/556' })
    expect(db.t.rucuDosyasi.find((x) => x.id === DOSYA2)!.durum).toBe('TEBLIG_EDILDI')
  })
  it('aynı daire + esas başka dosyada kayıtlıysa reddedilir', async () => {
    const r = await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: '2026/555', daire: 'kurgusal 2. icra dairesi' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('başka bir dosyada')
  })
  it('bayrak kapalı: esas no kaydedilir, iş açılmaz, toplu tur bilgisi', async () => {
    vi.stubEnv('IS_KUYRUGU', '')
    const r = await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: '2026/1234' })
    expect(r).toMatchObject({ ok: true, kuyrukKapali: true })
    expect(db.t.senkronIs).toHaveLength(0)
  })
  it('geçersiz esas no ve GÖRÜNTÜLEYEN rolü reddedilir', async () => {
    expect((await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: '1234' })).ok).toBe(false)
    oturum('GORUNTULEYEN')
    const r = await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: '2026/1234' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('yetkiniz yok')
    expect(db.t.rucuDosyasi.find((x) => x.id === DOSYA)!.icraDosyaNo).toBeNull()
  })
})

describe('eklenti: sıra → üstlen → adımlar → bitir', () => {
  async function isAc() {
    const r = await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: '2026/1234' })
    return r.isId as string
  }

  it('iş sırada görünür; üstlenen eklentiye hedef (daire, esas, alacaklı) gider', async () => {
    const id = await isAc()
    const s = await json(await sira(yeniRay))
    expect(s.govde).toMatchObject({ ok: true, bekleyen: 1, isler: [{ id, tur: 'ICRA' }], ozellikler: { isKuyrugu: true } })
    expect(JSON.stringify(s.govde)).not.toContain('HK-KURGU') // sıra yanıtı yalnız kimlik ve tür taşır
    const al = await json(await post(alPOST, id, yeniRay, { cihaz: CIHAZ_A, surum: '2.0.0' }))
    expect(al.status).toBe(200)
    expect(al.govde.is).toMatchObject({ id, tur: 'ICRA', dosyaId: DOSYA, hedef: { id: DOSYA, icraDosyaNo: '2026/1234', daire: 'Kurgusal 1. İcra Dairesi', alacakliUnvan: 'Kurgusal Sigorta A.Ş.', uyapDosyaId: 'SIFRELI-KURGU' } })
    expect(db.t.senkronIs[0]).toMatchObject({ durum: 'ALINDI', cihaz: CIHAZ_A, eklentiSurum: '2.0.0', anahtarId: 'anahtar-ray' })
  })

  it('iki eklenti aynı anda → iş yalnız birine gider (ikincisi 409)', async () => {
    const id = await isAc()
    const [a, b] = await Promise.all([post(alPOST, id, yeniRay, { cihaz: CIHAZ_A }), post(alPOST, id, yeniRay, { cihaz: CIHAZ_B })])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect((await json(await sira(yeniRay))).govde.bekleyen).toBe(0)
  })

  it('Zurich anahtarı Ray işini göremez ve alamaz (404)', async () => {
    const id = await isAc()
    expect((await json(await sira(yeniZurich))).govde.isler).toEqual([])
    expect((await post(alPOST, id, yeniZurich, { cihaz: CIHAZ_A })).status).toBe(404)
    expect(db.t.senkronIs[0].durum).toBe('BEKLIYOR')
  })

  it('adımı yalnız işi üstlenen cihaz yazar; bilinmeyen adım 400; bitince adım yazılamaz', async () => {
    const id = await isAc()
    await post(alPOST, id, yeniRay, { cihaz: CIHAZ_A })
    expect((await post(adimPOST, id, yeniRay, { cihaz: CIHAZ_B, adim: { adim: 'HESAP', durum: 'TAMAM' } })).status).toBe(409)
    expect((await post(adimPOST, id, yeniRay, { cihaz: CIHAZ_A, adim: { adim: 'UYAPA_YAZ', durum: 'TAMAM' } })).status).toBe(400)
    expect((await post(adimPOST, id, yeniRay, { cihaz: CIHAZ_A, adim: { adim: 'EVRAK_INDIRME', durum: 'CALISIYOR', sayac: { n: 7, toplam: 18 }, mesaj: 'Ödeme İcra Emri' } })).status).toBe(200)
    expect(db.t.senkronIs[0].durum).toBe('CALISIYOR')
    const b = await post(bitirPOST, id, yeniRay, { cihaz: CIHAZ_A, durum: 'TAMAM', ozet: { evrakSayisi: 18, yeniEvrak: 3, eslesme: 'OK', serbest: 'atılır' } })
    expect(b.status).toBe(200)
    expect(db.t.senkronIs[0]).toMatchObject({ durum: 'TAMAM', ozetJson: { evrakSayisi: 18, yeniEvrak: 3, eslesme: 'OK' } })
    expect((db.t.senkronIs[0].ozetJson as Record<string, unknown>).serbest).toBeUndefined()
    expect((await post(adimPOST, id, yeniRay, { cihaz: CIHAZ_A, adim: { adim: 'HESAP', durum: 'TAMAM' } })).status).toBe(409)
    // Aktivite işi üstlenen KİŞİNİN adıyla (kişiye bağlı anahtar)
    expect(db.t.aktivite.some((a) => a.kullaniciId === 'kullanici-yelda' && String(a.eylem).includes('anlık senkron tamamlandı'))).toBe(true)
  })

  it('canlı panel: adımlar, özet ve bağlantı', async () => {
    const id = await isAc()
    await sira(yeniRay)
    await post(alPOST, id, yeniRay, { cihaz: CIHAZ_A })
    await post(adimPOST, id, yeniRay, { cihaz: CIHAZ_A, adim: { adim: 'ESLESTIRME', durum: 'TAMAM', mesaj: 'Kurgusal 1. İcra Dairesi 2026/1234' } })
    const d = await senkronIsDurumu({ dosyaId: DOSYA })
    expect(d.ok).toBe(true)
    expect(d.baglanti?.durum).toBe('ACIK')
    expect(d.is?.surerMi).toBe(true)
    expect(d.is?.adimlar.slice(0, 2).map((a) => a.durum)).toEqual(['TAMAM', 'TAMAM'])
  })
})

describe('sağlık cron\'u: takılı iş', () => {
  it('5 dk hareketsiz iş ZAMAN_ASIMI olur ve Sistem Olayları\'na yazılır; tazesi dokunulmaz', async () => {
    const simdi = new Date()
    const eski = new Date(simdi.getTime() - 6 * 60_000)
    const taze = new Date(simdi.getTime() - 60_000)
    db.t.senkronIs.push(
      { id: 'is-eski', musteriId: RAY, dosyaId: DOSYA, tur: 'ICRA', durum: 'CALISIYOR', cihaz: CIHAZ_A, createdAt: eski, updatedAt: eski },
      { id: 'is-taze', musteriId: RAY, dosyaId: DOSYA2, tur: 'ICRA', durum: 'CALISIYOR', cihaz: CIHAZ_A, createdAt: taze, updatedAt: taze },
      { id: 'is-bekleyen', musteriId: RAY, dosyaId: DOSYA2, tur: 'ICRA', durum: 'BEKLIYOR', createdAt: new Date(simdi.getTime() - 25 * 3_600_000), updatedAt: new Date(simdi.getTime() - 25 * 3_600_000) },
    )
    const r = await senkronIsZamanAsimi(simdi)
    expect(r).toEqual({ hareketsiz: 1, ustlenilmeyen: 1 })
    expect(db.t.senkronIs.find((x) => x.id === 'is-eski')!.durum).toBe('ZAMAN_ASIMI')
    expect(db.t.senkronIs.find((x) => x.id === 'is-taze')!.durum).toBe('CALISIYOR')
    expect(db.t.senkronIs.find((x) => x.id === 'is-bekleyen')!.durum).toBe('ZAMAN_ASIMI')
    expect(db.t.sistemOlay).toHaveLength(1)
    expect(db.t.sistemOlay[0]).toMatchObject({ tip: 'SENKRON_UYARI', kaynak: 'uyap-is-kuyrugu' })
  })
  it('takılı iş yoksa Sistem Olayı yazılmaz', async () => {
    expect(await senkronIsZamanAsimi(new Date())).toEqual({ hareketsiz: 0, ustlenilmeyen: 0 })
    expect(db.t.sistemOlay).toHaveLength(0)
  })

  it('kapsamlı tarama yalnız o müvekkilin / dosyanın işine dokunur', async () => {
    const eski = new Date(Date.now() - 6 * 60_000)
    db.t.senkronIs.push(
      { id: 'is-ray', musteriId: RAY, dosyaId: DOSYA, tur: 'ICRA', durum: 'CALISIYOR', createdAt: eski, updatedAt: eski },
      { id: 'is-ray-2', musteriId: RAY, dosyaId: DOSYA2, tur: 'ICRA', durum: 'CALISIYOR', createdAt: eski, updatedAt: eski },
      { id: 'is-zurich', musteriId: ZURICH, dosyaId: 'dosya-zurich', tur: 'ICRA', durum: 'CALISIYOR', createdAt: eski, updatedAt: eski },
    )
    expect(await senkronIsZamanAsimi(new Date(), { musteriIds: [RAY], dosyaId: DOSYA })).toEqual({ hareketsiz: 1, ustlenilmeyen: 0 })
    expect(db.t.senkronIs.map((x) => [x.id, x.durum])).toEqual([['is-ray', 'ZAMAN_ASIMI'], ['is-ray-2', 'CALISIYOR'], ['is-zurich', 'CALISIYOR']])
    expect(await senkronIsZamanAsimi(new Date(), { musteriIds: [] })).toEqual({ hareketsiz: 0, ustlenilmeyen: 0 })
  })

  it('canlı panel takılı işi 5 dakikada ZAMAN_ASIMI\'na çeker (cron beklenmez) ve Sistem Olayları\'na yazar', async () => {
    const r0 = await icraNoKaydetVeCek({ dosyaId: DOSYA, esasNo: '2026/1234' })
    const id = r0.isId as string
    await post(alPOST, id, yeniRay, { cihaz: CIHAZ_A })
    await post(adimPOST, id, yeniRay, { cihaz: CIHAZ_A, adim: { adim: 'ESLESTIRME', durum: 'CALISIYOR' } })
    // taze iş: panel dokunmaz
    expect((await senkronIsDurumu({ dosyaId: DOSYA })).is?.durum).toBe('CALISIYOR')
    expect(db.t.sistemOlay).toHaveLength(0)
    // eklenti adım göndermeyi yarıda kesti: son hareket 6 dk önce
    db.t.senkronIs[0].updatedAt = new Date(Date.now() - 6 * 60_000)
    const d = await senkronIsDurumu({ dosyaId: DOSYA })
    expect(d.is?.durum).toBe('ZAMAN_ASIMI')
    expect(d.is?.uyari?.tur).toBe('ZAMAN_ASIMI')
    expect(d.is?.surerMi).toBe(false)
    expect(db.t.sistemOlay).toHaveLength(1)
    // eklenti geç kalırsa artık adım yazamaz
    expect((await post(adimPOST, id, yeniRay, { cihaz: CIHAZ_A, adim: { adim: 'ESLESTIRME', durum: 'TAMAM' } })).status).toBe(409)
  })
})

describe('sağlık ucu /api/uyap/is/saglik', () => {
  const saglik = (yol: string, baslik?: string) => saglikGET(new Request(`http://yerel${yol}`, { headers: baslik ? { authorization: baslik } : {} }))

  it('sır yalnız Authorization başlığıyla: başlıksız, yanlış ya da adres satırında → 401', async () => {
    vi.stubEnv('CRON_SECRET', 'kurgusal-sir-123')
    expect((await saglik('/api/uyap/is/saglik')).status).toBe(401)
    expect((await saglik('/api/uyap/is/saglik?key=kurgusal-sir-123')).status).toBe(401)
    expect((await saglik('/api/uyap/is/saglik', 'Bearer yanlis-sir-12')).status).toBe(401)
  })
  it('sır tanımsızsa 500', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await saglik('/api/uyap/is/saglik', 'Bearer x')).status).toBe(500)
  })
  it('doğru başlıkla kiracılar arası tarar', async () => {
    vi.stubEnv('CRON_SECRET', 'kurgusal-sir-123')
    const eski = new Date(Date.now() - 6 * 60_000)
    db.t.senkronIs.push({ id: 'is-z', musteriId: ZURICH, dosyaId: 'dosya-zurich', tur: 'ICRA', durum: 'ALINDI', createdAt: eski, updatedAt: eski })
    const r = await saglik('/api/uyap/is/saglik', 'Bearer kurgusal-sir-123')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, hareketsiz: 1, ustlenilmeyen: 0 })
    expect(db.t.senkronIs[0].durum).toBe('ZAMAN_ASIMI')
  })
})
