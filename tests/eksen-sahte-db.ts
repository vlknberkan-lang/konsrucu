/**
 * Eksen ve olay kartı testleri için BELLEK İÇİ sahte Prisma (test yardımcısı; kendisi test dosyası değildir).
 *
 * Gerçek veritabanına bağlanılmaz (ortam kuralı). Yalnız bu dilimin kullandığı sorgu biçimlerini destekler:
 * where (eşitlik, Date, null, in, notIn, not, contains/mode, OR/AND), select (ilişkiler dahil), orderBy (tek alan), take,
 * create / update / updateMany (count), benzersizlik (TakipOlayi.dosyaId+tekilAnahtar, BorcluTakip.borcluId → P2002),
 * @updatedAt, TEMBEL (lazy) Prisma sözleri ve $transaction (dizi ya da fonksiyon) için GERİ SARMA.
 * Kişisel veri yok; kimlikler rastgele UUID, adlar "[Kurgusal Borçlu n]".
 */
import { randomUUID } from 'node:crypto'

type Row = Record<string, any>
type Where = Record<string, any>

const TABLOLAR = [
  'musteri', 'rucuDosyasi', 'borclu', 'borcluTakip', 'takipOlayi', 'aktivite', 'asama', 'durumGecisi', 'belge',
  'arabuluculuk', 'yolSecimi', 'dava', 'takipTalebi', 'ayarlar', 'masraf', 'kullanici', 'sure',
] as const
type Tablo = (typeof TABLOLAR)[number]

/** İlişki çözümü: tablo.alan → [hedef tablo, yabancı anahtar, çoğul mu] */
const ILISKI: Record<string, [Tablo, string, 'LISTE' | 'TEK_TERS' | 'TEK_ILERI']> = {
  'rucuDosyasi.borclular': ['borclu', 'dosyaId', 'LISTE'],
  'rucuDosyasi.olaylar': ['takipOlayi', 'dosyaId', 'LISTE'],
  'rucuDosyasi.arabuluculuklar': ['arabuluculuk', 'dosyaId', 'LISTE'],
  'rucuDosyasi.yolSecimleri': ['yolSecimi', 'dosyaId', 'LISTE'],
  'rucuDosyasi.davalar': ['dava', 'dosyaId', 'LISTE'],
  'rucuDosyasi.asamalar': ['asama', 'dosyaId', 'LISTE'],
  'rucuDosyasi.takipTalepleri': ['takipTalebi', 'dosyaId', 'LISTE'],
  'rucuDosyasi.belgeler': ['belge', 'dosyaId', 'LISTE'],
  'rucuDosyasi.musteri': ['musteri', 'musteriId', 'TEK_ILERI'],
  'rucuDosyasi.sureler': ['sure', 'dosyaId', 'LISTE'],
  'sure.dosya': ['rucuDosyasi', 'dosyaId', 'TEK_ILERI'],
  'borclu.takip': ['borcluTakip', 'borcluId', 'TEK_TERS'],
}

const UPDATED_AT: ReadonlySet<Tablo> = new Set(['borcluTakip', 'rucuDosyasi', 'arabuluculuk', 'dava', 'sure'])

export class TekilHata extends Error {
  code = 'P2002'
}

function kopya<T>(v: T): T {
  if (v instanceof Date) return new Date(v.getTime()) as T
  if (Array.isArray(v)) return v.map(kopya) as T
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const o: Row = {}
    for (const [k, x] of Object.entries(v)) o[k] = kopya(x)
    return o as T
  }
  return v
}

function esit(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  if (a == null || b == null) return a == null && b == null
  if (typeof a === 'object' && 'toNumber' in (a as object)) return Number(a) === Number(b)
  return a === b
}

function alanEslesir(deger: unknown, kosul: any): boolean {
  if (kosul === null || kosul instanceof Date || typeof kosul !== 'object') return esit(deger, kosul)
  if ('in' in kosul) return (kosul.in as unknown[]).some((x) => esit(deger, x))
  if ('notIn' in kosul) return !(kosul.notIn as unknown[]).some((x) => esit(deger, x))
  if ('not' in kosul) return kosul.not === null ? deger != null : !esit(deger, kosul.not)
  if ('contains' in kosul) {
    if (deger == null) return false
    const d = String(deger)
    return kosul.mode === 'insensitive' ? d.toLowerCase().includes(String(kosul.contains).toLowerCase()) : d.includes(kosul.contains)
  }
  if ('equals' in kosul) return esit(deger, kosul.equals)
  return false
}

export class SahteDb {
  t: Record<Tablo, Row[]> = Object.fromEntries(TABLOLAR.map((x) => [x, []])) as unknown as Record<Tablo, Row[]>
  transactionSayisi = 0

  eslesir(tablo: Tablo, r: Row, w: Where | undefined): boolean {
    if (!w) return true
    return Object.entries(w).every(([k, v]) => {
      if (k === 'OR') return (v as Where[]).some((x) => this.eslesir(tablo, r, x))
      if (k === 'AND') return (v as Where[]).every((x) => this.eslesir(tablo, r, x))
      const il = ILISKI[`${tablo}.${k}`]
      if (il && v && typeof v === 'object' && !(v instanceof Date)) {
        const [hedef, fk, tur] = il
        const hedefRow = tur === 'TEK_ILERI' ? this.t[hedef].find((x) => x.id === r[fk]) : this.t[hedef].find((x) => x[fk] === r.id)
        return !!hedefRow && this.eslesir(hedef, hedefRow, v)
      }
      return alanEslesir(r[k], v)
    })
  }

  sec(tablo: Tablo, r: Row, select?: Row): Row {
    if (!select) return kopya(r)
    const o: Row = {}
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue
      const il = ILISKI[`${tablo}.${k}`]
      if (il) {
        const [hedef, fk, tur] = il
        const arg = v === true ? {} : (v as Row)
        if (tur === 'LISTE') {
          o[k] = this.bul(hedef, { ...arg, where: { ...(arg.where ?? {}), [fk]: r.id } })
        } else {
          const h = tur === 'TEK_ILERI' ? this.t[hedef].find((x) => x.id === r[fk]) : this.t[hedef].find((x) => x[fk] === r.id)
          o[k] = h ? this.sec(hedef, h, arg.select) : null
        }
      } else {
        o[k] = kopya(r[k])
      }
    }
    return o
  }

  bul(tablo: Tablo, a: { where?: Where; select?: Row; orderBy?: Row | Row[]; take?: number } = {}): Row[] {
    let l = this.t[tablo].filter((r) => this.eslesir(tablo, r, a.where))
    const ob = Array.isArray(a.orderBy) ? a.orderBy[0] : a.orderBy
    if (ob) {
      const [k, yon] = Object.entries(ob)[0] as [string, string]
      const al = (r: Row) => (r[k] instanceof Date ? r[k].getTime() : r[k])
      l = [...l].sort((x, y) => (al(x) < al(y) ? -1 : al(x) > al(y) ? 1 : 0) * (yon === 'desc' ? -1 : 1))
    }
    if (a.take != null) l = l.slice(0, a.take)
    return l.map((r) => this.sec(tablo, r, a.select))
  }

  tekilDenetle(tablo: Tablo, r: Row, haric?: Row) {
    const diger = this.t[tablo].filter((x) => x !== haric)
    if (tablo === 'takipOlayi' && r.tekilAnahtar != null && diger.some((x) => x.dosyaId === r.dosyaId && x.tekilAnahtar === r.tekilAnahtar)) throw new TekilHata('Unique constraint failed (dosyaId, tekilAnahtar)')
    if (tablo === 'borcluTakip' && diger.some((x) => x.borcluId === r.borcluId)) throw new TekilHata('Unique constraint failed (borcluId)')
  }

  static veri(d: Row): Row {
    const o: Row = {}
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue
      // Prisma.DbNull / JsonNull → null
      o[k] = v && typeof v === 'object' && /^Prisma\.(DbNull|JsonNull)$/.test(String(v)) ? null : v
    }
    return o
  }

  ekle(tablo: Tablo, data: Row): Row {
    const r: Row = { id: randomUUID(), createdAt: new Date(), ...(UPDATED_AT.has(tablo) ? { updatedAt: new Date() } : {}), ...SahteDb.veri(data) }
    this.tekilDenetle(tablo, r)
    this.t[tablo].push(r)
    return r
  }

  guncelle(tablo: Tablo, r: Row, data: Row) {
    const yeni = { ...r, ...SahteDb.veri(data) }
    if (UPDATED_AT.has(tablo)) yeni.updatedAt = new Date(Math.max(Date.now(), (r.updatedAt?.getTime?.() ?? 0) + 1))
    this.tekilDenetle(tablo, yeni, r)
    Object.assign(r, yeni)
  }

  /** Prisma istemcisi gibi davranan nesne (vi.mock('@/lib/prisma') ile verilir). */
  istemci(): any {
    const db = this
    const tembel = <T>(fn: () => T) => {
      let bitti = false
      let sonuc: T
      let hata: unknown
      const run = () => {
        if (!bitti) {
          bitti = true
          try { sonuc = fn() } catch (e) { hata = e }
        }
        if (hata) throw hata
        return sonuc
      }
      return { run, then: (ok: (v: T) => unknown, red?: (e: unknown) => unknown) => { try { return Promise.resolve(run()).then(ok, red) } catch (e) { return red ? Promise.resolve(red(e)) : Promise.reject(e) } } }
    }
    const model = (tablo: Tablo) => ({
      findFirst: (a: Row = {}) => tembel(() => db.bul(tablo, { ...a, take: 1 })[0] ?? null),
      findUnique: (a: Row) => tembel(() => db.bul(tablo, { ...a, take: 1 })[0] ?? null),
      findMany: (a: Row = {}) => tembel(() => db.bul(tablo, a)),
      count: (a: Row = {}) => tembel(() => db.bul(tablo, a).length),
      create: (a: Row) => tembel(() => db.sec(tablo, db.ekle(tablo, a.data), a.select)),
      update: (a: Row) => tembel(() => {
        const r = db.t[tablo].find((x) => db.eslesir(tablo, x, a.where))
        if (!r) throw Object.assign(new Error('Record to update not found'), { code: 'P2025' })
        db.guncelle(tablo, r, a.data)
        return db.sec(tablo, r, a.select)
      }),
      updateMany: (a: Row) => tembel(() => {
        const l = db.t[tablo].filter((x) => db.eslesir(tablo, x, a.where))
        for (const r of l) db.guncelle(tablo, r, a.data)
        return { count: l.length }
      }),
    })
    const c: Row = Object.fromEntries(TABLOLAR.map((x) => [x, model(x)]))
    c.$transaction = async (arg: unknown) => {
      db.transactionSayisi++
      const yedek = kopya(db.t)
      try {
        if (Array.isArray(arg)) {
          const out: unknown[] = []
          for (const op of arg) out.push((op as { run: () => unknown }).run())
          return out
        }
        return await (arg as (tx: unknown) => Promise<unknown>)(c)
      } catch (e) {
        db.t = yedek
        throw e
      }
    }
    return c
  }

  // ── kurgusal kurulum yardımcıları ──
  musteri(ad = '[Kurgusal Müvekkil]', aktif = true): Row {
    return this.ekle('musteri', { ad, aktif })
  }

  dosya(musteriId: string, p: Row = {}): Row {
    return this.ekle('rucuDosyasi', {
      musteriId, durum: 'TAKIP_ACILDI', icraDosyaNo: '2026/0001', takipTarihi: null, uyapHesapJson: null, yolOnaylayanId: null,
      kapanisSebebi: null, kapanisAt: null, icraEksen: null, arabEksen: null, davaEksen: null, eksenJson: null, eksenHesapAt: null, ...p,
    })
  }

  borclu(dosyaId: string, adUnvan: string, tur: string | null = 'GERCEK'): Row {
    return this.ekle('borclu', { dosyaId, adUnvan, tur })
  }

  olaylar(dosyaId: string): Row[] {
    return this.t.takipOlayi.filter((o) => o.dosyaId === dosyaId)
  }
}
