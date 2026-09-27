/**
 * S21 · Takip talebi uçtan uca (program eylemleri + /api/uyap/takip-hedefler + eklenti saf.js + /api/uyap/takip-tevzi),
 * bellek içi sahte DB ile. Kabul testinin karşılıkları:
 *  1. Faiz seçilmeden kopilot kilitli (takip-hedefler engeli; "UYAP'ta takibi aç" reddedilir).
 *  2. "Yasal" + "her ödeme tarihinden" → açıklamada "yasal faizi"; "%......" yok.
 *  3. Hesap izi: dekont toplamı × rücu oranı = asıl alacak; onaylanır, eski kolon aynalanır.
 *  5. Programdaki önizleme ile eklentinin tevzi gövdesi KALEM KALEM aynı (faiz türü, cümle, tutarlar, alacak tarihi).
 *  +  Tevzide takip talebi dondurulur; sonraki düzeltme yeni sürüm açar. 1.9 eklentisi faiz aktaramadığı için kilitli.
 * Taraf, kimlik no ve tutarlar kurgusaldır.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const db = vi.hoisted(() => {
  type Satir = Record<string, unknown>
  const t: Record<string, Satir[]> = {}
  let sayac = 0
  const yeniId = () => `20000000-0000-4000-8000-${String(++sayac).padStart(12, '0')}`
  const nesneMi = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && !(typeof (v as { toFixed?: unknown }).toFixed === 'function')
  const OPS = ['in', 'notIn', 'not', 'lt', 'gt', 'equals']
  function eslesir(k: Satir, w: Record<string, unknown> | undefined): boolean {
    for (const [a, v] of Object.entries(w ?? {})) {
      if (a === 'AND') { if (!(v as Record<string, unknown>[]).every((x) => eslesir(k, x))) return false; continue }
      if (a === 'OR') { if (!(v as Record<string, unknown>[]).some((x) => eslesir(k, x))) return false; continue }
      const d = k[a] as unknown
      if (nesneMi(v) && Object.keys(v).some((x) => OPS.includes(x))) {
        const o = v as Record<string, unknown>
        if ('in' in o && !(o.in as unknown[]).includes(d)) return false
        if ('notIn' in o && (o.notIn as unknown[]).includes(d)) return false
        if ('not' in o && (o.not === null ? d == null : d === o.not)) return false
        if ('lt' in o && !(d != null && (d as number) < (o.lt as number))) return false
        if ('gt' in o && !(d != null && (d as number) > (o.gt as number))) return false
        if ('equals' in o && d !== o.equals) return false
      } else if (nesneMi(v)) {
        if (a === 'dosya') { const dosya = t.rucuDosyasi.find((x) => x.id === k.dosyaId); if (!dosya || !eslesir(dosya, v)) return false; continue }
        if (!nesneMi(d) || !eslesir(d, v)) return false
      } else if (d !== v) return false
    }
    return true
  }
  const cocuk = (tablo: string, anahtar = 'dosyaId') => (s: Satir, q: unknown) => {
    const o = (nesneMi(q) ? q : {}) as { where?: Record<string, unknown>; orderBy?: Record<string, string>; take?: number }
    let l = (t[tablo] ?? []).filter((x) => x[anahtar] === s.id && eslesir(x, o.where))
    if (o.orderBy) { const [f, y] = Object.entries(o.orderBy)[0]; l = [...l].sort((a, b) => ((a[f] as number) > (b[f] as number) ? 1 : -1) * (y === 'desc' ? -1 : 1)) }
    return l.slice(0, o.take ?? 1000).map((x) => ({ ...x }))
  }
  const iliski: Record<string, Record<string, (s: Satir, q: unknown) => unknown>> = {
    rucuDosyasi: { borclular: cocuk('borclu'), odemeler: cocuk('odeme'), belgeler: cocuk('belge'), takipTalepleri: cocuk('takipTalebi') },
    senkronIs: { dosya: (s) => t.rucuDosyasi.find((d) => d.id === s.dosyaId) },
    eklentiAnahtar: { kullanici: (s) => t.kullanici.find((u) => u.id === s.kullaniciId) },
  }
  function bagla(ad: string, s: Satir, sorgu: Record<string, unknown>): Satir {
    const q = sorgu as { select?: Record<string, unknown>; include?: Record<string, unknown> }
    const r: Satir = { ...s }
    for (const [rel, f] of Object.entries(iliski[ad] ?? {})) { const sec = q?.select?.[rel] ?? q?.include?.[rel]; if (sec) r[rel] = f(s, nesneMi(sec) ? sec : {}) }
    return r
  }
  const tanimli = (o: Satir) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  function model(ad: string) {
    t[ad] ??= []
    const k = () => t[ad]
    return {
      findFirst: async (q: Record<string, unknown> = {}) => { let l = k().filter((x) => eslesir(x, q.where as Record<string, unknown>)); const ob = q.orderBy as Record<string, string> | undefined; if (ob) { const [f, y] = Object.entries(ob)[0]; l = [...l].sort((a, b) => ((a[f] as number) > (b[f] as number) ? 1 : -1) * (y === 'desc' ? -1 : 1)) } return l[0] ? bagla(ad, l[0], q) : null },
      findUnique: async (q: Record<string, unknown>) => { const s = k().find((x) => eslesir(x, q.where as Record<string, unknown>)); return s ? bagla(ad, s, q) : null },
      findMany: async (q: Record<string, unknown> = {}) => k().filter((x) => eslesir(x, q.where as Record<string, unknown>)).slice(0, (q.take as number) ?? 1000).map((s) => bagla(ad, s, q)),
      count: async (q: Record<string, unknown> = {}) => k().filter((x) => eslesir(x, q.where as Record<string, unknown>)).length,
      aggregate: async (q: { where?: Record<string, unknown>; _max?: Record<string, boolean> }) => {
        const l = k().filter((x) => eslesir(x, q.where))
        const _max: Record<string, unknown> = {}
        for (const f of Object.keys(q._max ?? {})) _max[f] = l.length ? Math.max(...l.map((x) => x[f] as number)) : null
        return { _max }
      },
      create: async (q: { data: Satir } & Record<string, unknown>) => {
        const s: Satir = { id: yeniId(), createdAt: new Date(), updatedAt: new Date(), ...(ad === 'senkronIs' ? { durum: 'BEKLIYOR' } : {}), ...(ad === 'takipTalebi' ? { gecerli: true, silindiAt: null, dondurulduAt: null } : {}), ...(ad === 'alanDegeri' ? { durum: 'ONERI', silindiAt: null } : {}), ...tanimli(q.data) }
        if (ad === 'takipTalebi' && k().some((x) => x.dosyaId === s.dosyaId && x.surum === s.surum)) throw Object.assign(new Error('P2002'), { code: 'P2002' })
        k().push(s)
        return bagla(ad, s, q)
      },
      update: async (q: { where: Record<string, unknown>; data: Satir }) => { const s = k().find((x) => eslesir(x, q.where)); if (!s) throw new Error(`${ad} yok`); Object.assign(s, tanimli(q.data), { updatedAt: new Date() }); return { ...s } },
      updateMany: async (q: { where: Record<string, unknown>; data: Satir }) => { const l = k().filter((x) => eslesir(x, q.where)); for (const s of l) Object.assign(s, tanimli(q.data), { updatedAt: new Date() }); return { count: l.length } },
    }
  }
  const prisma: Record<string, unknown> = {}
  for (const ad of ['rucuDosyasi', 'borclu', 'odeme', 'belge', 'takipTalebi', 'ayarlar', 'aktivite', 'not', 'senkronIs', 'eklentiAnahtar', 'kullanici', 'alanDegeri', 'musteri']) prisma[ad] = model(ad)
  prisma.$transaction = async (x: unknown) => (typeof x === 'function' ? (x as (p: unknown) => unknown)(prisma) : Promise.all(x as Promise<unknown>[]))
  return { t, prisma, sifirla: () => { for (const k of Object.keys(t)) t[k].length = 0 }, ctx: { deger: null as unknown } }
})

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: async () => db.ctx.deger }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { Prisma } from '@prisma/client'
import { anahtarUret } from '@/lib/konsrucu/senkron/anahtar'
import { takipTalebiGorunumu } from '@/lib/konsrucu/senkron/takip-talebi-db'
import { faizSeciminiKaydet, hesapIziniOnayla, uyaptaTakibiAc } from '@/app/(app)/dosya-islem/takip-talebi-actions'
import { GET as takipHedeflerGET } from '@/app/api/uyap/takip-hedefler/route'
import { POST as takipTevziPOST } from '@/app/api/uyap/takip-tevzi/route'

const RAY = 'musteri-ray'
const DOSYA = '30000000-0000-4000-8000-000000000001'
const dec = (n: number) => new Prisma.Decimal(n)

type SafT = { tevziGovdesi: (h: unknown, u: unknown) => { ok: true; govde: Record<string, string> } | { ok: false; hata: string } }
const safBaglam: { KonsSaf?: SafT } = {}
vm.createContext(safBaglam)
vm.runInContext(readFileSync(path.join(process.cwd(), 'extension', 'saf.js'), 'utf8'), safBaglam)
const SAF = safBaglam.KonsSaf!

let anahtar = ''

function kur() {
  db.sifirla()
  db.t.kullanici.push({ id: 'kullanici-avukat', ad: 'Kurgusal Avukat', aktif: true, rol: 'AVUKAT', musteriler: [{ musteriId: RAY }] })
  const a = anahtarUret(); anahtar = a.anahtar
  db.t.eklentiAnahtar.push({ id: 'anahtar-1', musteriId: RAY, kullaniciId: 'kullanici-avukat', ozet: a.ozet, onek: a.onek, sonKullanma: new Date(Date.now() + 30 * 86_400_000), iptalAt: null, sonGorulme: new Date() })
  db.t.ayarlar.push({ id: 'ayar-1', musteriId: RAY, alacakliUnvan: 'Kurgusal Sigorta A.Ş.', mersis: '0000000000000000', davaciVkn: null, iban: null, aciklamaFooter: null, faizJson: { oranlar: [{ baslangic: '2020-01-01', oran: 24 }] } })
  db.t.rucuDosyasi.push({
    id: DOSYA, musteriId: RAY, hukukDosyaNo: 'HK-KURGU-9', hasarDosyaNo: null, durum: 'INCELENIYOR', icraDosyaNo: null, icraDairesi: null,
    rucuTutari: dec(50000), asilAlacak: null, rucuOrani: '% 50', faizTutari: null, faizBaslangic: null, faizBitis: null,
    kazaTarihi: null, hasarTarihi: null, kazaYeri: 'Seyhan/Adana', il: 'Adana', yetkiliIcra: null, sigortaliPlaka: null, karsiPlaka: null,
    kaynakJson: null, cikarimJson: { onay: { ok: true }, aciklama: 'Kurgusal takip açıklaması' },
  })
  db.t.borclu.push({ id: 'borclu-1', dosyaId: DOSYA, adUnvan: 'KURGUSAL BORÇLU', tcVkn: '99999999990', rol: 'SURUCU', teyitDurumu: 'TEYIT_EDILDI' })
  db.t.odeme.push(
    { id: 'o1', dosyaId: DOSYA, tarih: new Date('2026-01-10T00:00:00Z'), tutar: dec(60000), haricMi: false },
    { id: 'o2', dosyaId: DOSYA, tarih: new Date('2026-02-10T00:00:00Z'), tutar: dec(40000), haricMi: false },
    { id: 'o3', dosyaId: DOSYA, tarih: new Date('2026-02-11T00:00:00Z'), tutar: dec(2500), haricMi: true },
  )
  db.t.belge.push({ id: 'b1', dosyaId: DOSYA, kategori: 'POLICE' }, { id: 'b2', dosyaId: DOSYA, kategori: 'DEKONT' }, { id: 'b3', dosyaId: DOSYA, kategori: 'TUTANAK' })
}

const avukat = (rol = 'AVUKAT') => { db.ctx.deger = { dbUser: { id: 'kullanici-avukat', ad: 'Kurgusal Avukat', rol, aktif: true, musteriler: [{ musteriId: RAY }] }, izinli: [RAY], aktifMusteriId: RAY } }
const hedefler = async (surum: string | null = '2.0.0') => {
  const r = await takipHedeflerGET(new Request('http://yerel/api/uyap/takip-hedefler', { headers: { authorization: `Bearer ${anahtar}`, ...(surum ? { 'x-eklenti-surum': surum } : {}) } }))
  return (await r.json()) as { ok: boolean; hedefler: Record<string, unknown>[] }
}
const YASAL = { dosyaId: DOSYA, faizTuru: 'YASAL', faizOraniMetni: 'değişen oranlarda', faizBaslangicTuru: 'HER_ODEMEDEN', faizBaslangic: null }

beforeEach(() => { kur(); avukat(); vi.unstubAllEnvs(); vi.stubEnv('IS_KUYRUGU', 'acik') })
afterEach(() => vi.unstubAllEnvs())

describe('kilit: faiz seçilmeden takip açılamaz', () => {
  it('takip talebi yokken kopilot listesinde engelli; "UYAP\'ta takibi aç" reddedilir', async () => {
    const h = (await hedefler()).hedefler[0]
    expect(h.engeller).toEqual(expect.arrayContaining(['Takip talebi yok: faiz türü, oranı ve başlangıcı seçilmedi', 'Rücu tutarı hesap izi onaylanmadı']))
    expect(h.faiz).toBeNull()
    const r = await uyaptaTakibiAc({ dosyaId: DOSYA })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('faiz türü, oranı ve başlangıcı seçilmedi')
    expect(db.t.senkronIs).toHaveLength(0)
  })
  it('faiz seçimi karardır: avukat yardımcısı kaydedemez', async () => {
    avukat('AVUKAT_YRD')
    const r = await faizSeciminiKaydet(YASAL)
    expect(r.ok).toBe(false)
    expect(db.t.takipTalebi).toHaveLength(0)
  })
  it('eksik seçim sunucuda da reddedilir', async () => {
    expect((await faizSeciminiKaydet({ ...YASAL, faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: null })).ok).toBe(false)
  })
})

describe('faiz → hesap izi → önizleme = kopilot gövdesi', () => {
  async function hazirla() {
    expect((await faizSeciminiKaydet(YASAL)).ok).toBe(true)
    expect((await hesapIziniOnayla({ dosyaId: DOSYA })).ok).toBe(true)
  }

  it('faiz seçimi taslak takip talebi açar (sürüm 1); hesap izi asıl alacağı yazar ve eski kolonu aynalar', async () => {
    await hazirla()
    expect(db.t.takipTalebi).toHaveLength(1)
    const tt = db.t.takipTalebi[0]
    expect(tt).toMatchObject({ surum: 1, gecerli: true, faizTuru: 'YASAL', faizOraniMetni: 'değişen oranlarda', faizBaslangicTuru: 'HER_ODEMEDEN', kaynak: 'ELLE', onaylayanId: 'kullanici-avukat' })
    expect(Number(tt.asilAlacak)).toBe(50000) // (60.000 + 40.000) × %50 — ekspertiz hariç
    expect((tt.hesapIziJson as { onay: { kullaniciId: string; asilAlacak: number } }).onay).toMatchObject({ kullaniciId: 'kullanici-avukat', asilAlacak: 50000 })
    expect(Number(db.t.rucuDosyasi[0].asilAlacak)).toBe(50000)
    expect(db.t.aktivite.filter((a) => a.kullaniciId === 'kullanici-avukat')).toHaveLength(2)
  })

  it('önizleme: kilit yok, cümlede "yasal faizi", "%......" yok', async () => {
    await hazirla()
    const g = (await takipTalebiGorunumu(DOSYA, RAY))!
    expect(g.kilitSebepleri).toEqual([])
    expect(g.hesapIziGecerli).toBe(true)
    expect(g.talepMetni).toContain('yasal faizi')
    expect(g.talepMetni).not.toContain('%......')
    expect(g.kopilotDestekli).toBe(true)
    expect(g.onizleme.borclular).toEqual([{ ad: 'KURGUSAL BORÇLU', tur: 'gerçek kişi' }])
    expect(JSON.stringify(g)).not.toContain('99999999990') // kimlik no ekrana gitmez
  })

  it('KABUL 5: programdaki önizleme ile eklentinin tevzi gövdesi kalem kalem aynı', async () => {
    await hazirla()
    const g = (await takipTalebiGorunumu(DOSYA, RAY))!
    const h = (await hedefler('2.0.0')).hedefler[0] as { engeller: string[]; alacak: { anapara: number; islemisFaiz: number; faizBaslangic: string }; faiz: { talepMetni: string } }
    expect(h.engeller).toEqual([])
    expect(h.faiz.talepMetni).toBe(g.talepMetni)
    expect(h.alacak).toMatchObject({ anapara: g.alacak.anapara, islemisFaiz: g.alacak.islemisFaiz, faizBaslangic: g.alacak.faizBaslangic })
    let n = 0
    const tg = SAF.tevziGovdesi(h, { adliye: { adliyeBirimID: 'K1', adliyeIsmi: 'KURGUSAL ADLİYESİ' }, sekilAd: 'Örnek 7', yolAd: 'Genel Haciz', mahiyet: { name: 'Diğer', value: 1407 }, tarafList: [{}, {}], rid: () => `r${++n}` })
    expect(tg.ok).toBe(true)
    if (!tg.ok) return
    const idb = JSON.parse(tg.govde.IcraDosyaBilgileri)
    const ilamsiz = JSON.parse(tg.govde.IlamsizList)[0]
    expect(idb.dosyaAciklama_48_4).toBe(g.talepMetni)
    expect(ilamsiz.alacakKalemleri[0].temelBilgileri.alacakTutari).toBe(g.alacak.anapara)
    expect(ilamsiz.alacakKalemleri[1].temelBilgileri.alacakTutari).toBe(g.alacak.islemisFaiz)
    expect(ilamsiz.alacakKalemleri[0].faizBilgileri.selectedFaizTuru.aciklama).toBe('Adi Kanuni Faiz')
    const [y, a, gun] = String(g.alacak.faizBaslangic).split('-')
    expect(ilamsiz.alacakTarihi).toBe(`${gun}/${a}/${y}`)
  })

  it('1.9 eklentisi (sürüm başlığı yok) faiz aktaramaz → kilitli', async () => {
    await hazirla()
    const h = (await hedefler(null)).hedefler[0]
    expect(h.engeller).toEqual(["Eklentiyi 2.0 sürümüne güncelleyin: faiz seçimini UYAP'a yalnız 2.0 aktarır"])
  })

  it('keşifle teyit edilmemiş faiz (avans) kopilotta kilitli; program elle açmayı söyler', async () => {
    expect((await faizSeciminiKaydet({ ...YASAL, faizTuru: 'AVANS' })).ok).toBe(true)
    await hesapIziniOnayla({ dosyaId: DOSYA })
    const h = (await hedefler()).hedefler[0] as { engeller: string[] }
    expect(h.engeller.some((e) => e.includes('kopilotla aktarılamıyor'))).toBe(true)
    const r = await uyaptaTakibiAc({ dosyaId: DOSYA })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('elle')
  })

  it('"UYAP\'ta takibi aç" kopilot işi açar (UYAP\'a yazmaz); bayrak kapalıysa panelden açmayı söyler', async () => {
    await hazirla()
    const r = await uyaptaTakibiAc({ dosyaId: DOSYA })
    expect(r.ok).toBe(true)
    expect(db.t.senkronIs).toHaveLength(1)
    expect(db.t.senkronIs[0]).toMatchObject({ tur: 'KOPILOT', dosyaId: DOSYA, musteriId: RAY, isteyenId: 'kullanici-avukat' })
    vi.stubEnv('IS_KUYRUGU', '')
    db.t.senkronIs.length = 0
    const r2 = await uyaptaTakibiAc({ dosyaId: DOSYA })
    expect(r2.ok).toBe(false)
    expect(r2.error).toContain('Takip Aç')
  })

  it('onaydan sonra yeni ödeme gelirse hesap izi yeniden onay ister', async () => {
    await hazirla()
    db.t.odeme.push({ id: 'o4', dosyaId: DOSYA, tarih: new Date('2026-03-01T00:00:00Z'), tutar: dec(10000), haricMi: false })
    const g = (await takipTalebiGorunumu(DOSYA, RAY))!
    expect(g.hesapIziGecerli).toBe(false)
    expect(g.kilitSebepleri.some((s) => s.includes('yeniden onaylayın'))).toBe(true)
  })
})

describe('kapsam: başka müvekkilin kişisel anahtarı (S14 kabul 4)', () => {
  it('Zurich anahtarı Ray dosyasını kopilot listesinde görmez ve tevzi yazamaz (404); iptal edilen anahtar 401', async () => {
    await faizSeciminiKaydet(YASAL)
    await hesapIziniOnayla({ dosyaId: DOSYA })
    const ZURICH = 'musteri-zurich'
    db.t.kullanici.push({ id: 'kullanici-z', ad: 'Kurgusal Zurich Avukatı', aktif: true, rol: 'AVUKAT', musteriler: [{ musteriId: ZURICH }] })
    const z = anahtarUret()
    db.t.eklentiAnahtar.push({ id: 'anahtar-z', musteriId: ZURICH, kullaniciId: 'kullanici-z', ozet: z.ozet, onek: z.onek, sonKullanma: new Date(Date.now() + 30 * 86_400_000), iptalAt: null, sonGorulme: new Date() })
    const liste = await takipHedeflerGET(new Request('http://yerel/api/uyap/takip-hedefler', { headers: { authorization: `Bearer ${z.anahtar}`, 'x-eklenti-surum': '2.0.0' } }))
    expect(liste.status).toBe(200)
    expect(((await liste.json()) as { hedefler: unknown[] }).hedefler).toEqual([])
    const tevzi = (a: string) => takipTevziPOST(new Request('http://yerel/api/uyap/takip-tevzi', {
      method: 'POST', headers: { authorization: `Bearer ${a}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dosyaId: DOSYA, tevzi: { birimAdi: 'Kurgusal 3. İcra Dairesi' } }),
    }))
    expect((await tevzi(z.anahtar)).status).toBe(404)
    expect(db.t.rucuDosyasi[0].cikarimJson).not.toHaveProperty('tevzi')
    expect(db.t.takipTalebi[0].dondurulduAt).toBeNull()
    db.t.eklentiAnahtar[0].iptalAt = new Date()
    expect((await tevzi(anahtar)).status).toBe(401)
    expect(db.t.takipTalebi[0].dondurulduAt).toBeNull()
  })
})

describe('tevzide dondurma ve sürüm', () => {
  it('tevzi takip talebini dondurur (kişiye bağlı iz); sonraki düzeltme yeni sürüm açar, eskisi değişmez', async () => {
    await faizSeciminiKaydet(YASAL)
    await hesapIziniOnayla({ dosyaId: DOSYA })
    const r = await takipTevziPOST(new Request('http://yerel/api/uyap/takip-tevzi', {
      method: 'POST', headers: { authorization: `Bearer ${anahtar}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dosyaId: DOSYA, tevzi: { birimAdi: 'Kurgusal 3. İcra Dairesi', dosyaAcilisTarihi: '12/03/2026 10:00:00', takibeEsasTutar: 50000 } }),
    }))
    expect(r.status).toBe(200)
    const tt1 = db.t.takipTalebi[0]
    expect(tt1.dondurulduAt).toBeInstanceOf(Date)
    expect(db.t.aktivite.some((a) => a.kullaniciId === 'kullanici-avukat' && String(a.eylem).includes('takip talebi donduruldu'))).toBe(true)
    // tevzi'li dosya kopilot listesinden düşer
    expect((await hedefler()).hedefler).toHaveLength(0)
    // düzeltme = yeni sürüm
    const once = JSON.stringify({ ...tt1, updatedAt: null })
    expect((await faizSeciminiKaydet({ ...YASAL, faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: '2026-02-10' })).bilgi).toContain('sürüm 2')
    expect(db.t.takipTalebi).toHaveLength(2)
    const [eski, yeni] = db.t.takipTalebi
    expect(eski.gecerli).toBe(false)
    expect(JSON.stringify({ ...eski, gecerli: true, updatedAt: null })).toBe(once) // dondurulmuş kaydın içeriği değişmedi
    expect(yeni).toMatchObject({ surum: 2, gecerli: true, dondurulduAt: null, faizBaslangicTuru: 'TEK_TARIH' })
    expect(Number(yeni.asilAlacak)).toBe(50000)
  })
})
