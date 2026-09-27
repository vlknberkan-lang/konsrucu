/**
 * KonsRücü — Veri Onarımı servis katmanı · lib/konsrucu/onarim/servis.ts (server-only)
 *
 * Aktif müvekkil (musteriId) kapsamında: parti özetleri, satır kararları, toplu onay (R1 kuralı),
 * uygula / geri al (tek transaction), kuru liste üretimi (canlı veriden okur; CSV içe aktarma YOK).
 * Yetki (ADMIN/AVUKAT) action katmanında denetlenir; burada her sorgu musteriId ile sınırlıdır.
 */
import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { belgeBorcaItirazMi, belgeItirazTarihiCikar } from '@/lib/konsrucu/onemli-olay'
import { asamaTureviItirazMi, kesinlesmeKaydiMi } from '@/lib/konsrucu/takip-olay'
import {
  DURUM_KODLARI, KOD_META, ORNEK_TEYIT_ONEKI, PARTI_EN_COK, TOPLU_ONAY_NOTU,
  kararGecisi, kodMeta, onarimDurumuHesapla, partilereBol, partiSirasi, topluOnayDurumu, topluOnaylanabilirMi,
  type OnarimKodu, type SatirKarari,
} from './kurallar'
import { sureEkleVerisi } from './hedefler'
import { satirGeriAl, satirlariIsle, satirUygula, type Adaptorler, type IzYazici, type OnarimSatiri, type TopluSonuc, type UygulaBaglami } from './uygula'
import { r0Iik67Teshis, r1TutarTeshis, r2KesinlestiTeshis, type KuruSatir, type R0Dosya, type R0Itiraz } from './teshis'

type Tx = Prisma.TransactionClient
const TX_AYAR = { timeout: 60_000, maxWait: 10_000 }
/** Tek tıkta üretilecek en çok kuru satır (15 parti). Kalan için yeniden üretilir. */
export const URETIM_EN_COK = PARTI_EN_COK * 15

const SATIR_SELECT = {
  id: true, musteriId: true, dosyaId: true, parti: true, kod: true, islem: true, hedefTablo: true, hedefId: true, alan: true,
  eskiJson: true, yeniJson: true, kanit: true, guvenSinifi: true, durum: true, onaylayanId: true, onayAt: true,
  uygulandiAt: true, geriAlindiAt: true, not: true, createdAt: true,
} satisfies Prisma.VeriOnarimSelect

// ───────────────────────────── okuma ─────────────────────────────

export type PartiOzeti = { parti: string; kod: string; toplam: number; sayilar: Record<string, number>; islem: string }

export async function partiOzetleri(musteriId: string): Promise<PartiOzeti[]> {
  const rows = await prisma.veriOnarim.groupBy({ by: ['parti', 'kod', 'islem', 'durum'], where: { musteriId }, _count: { _all: true } })
  const m = new Map<string, PartiOzeti>()
  for (const r of rows) {
    const o = m.get(r.parti) ?? { parti: r.parti, kod: r.kod, islem: r.islem, toplam: 0, sayilar: {} }
    o.sayilar[r.durum] = (o.sayilar[r.durum] ?? 0) + r._count._all
    o.toplam += r._count._all
    m.set(r.parti, o)
  }
  return [...m.values()].sort((a, b) => a.parti.localeCompare(b.parti, 'tr'))
}

export async function partiSatirlari(musteriId: string, parti: string) {
  const rows = await prisma.veriOnarim.findMany({
    where: { musteriId, parti },
    select: { ...SATIR_SELECT, dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const ids = [...new Set(rows.map((r) => r.onaylayanId).filter((x): x is string => !!x))]
  const kullanicilar = ids.length ? await prisma.kullanici.findMany({ where: { id: { in: ids }, musteriler: { some: { musteriId } } }, select: { id: true, ad: true } }) : []
  const ad = new Map(kullanicilar.map((k) => [k.id, k.ad]))
  return rows.map((r) => ({ ...r, dosyaNo: r.dosya.hukukDosyaNo ?? r.dosya.hasarDosyaNo ?? r.dosyaId.slice(0, 8), onaylayanAd: r.onaylayanId ? ad.get(r.onaylayanId) ?? 'Kayıtlı kullanıcı' : null }))
}

export async function ornekTeyitSayisi(musteriId: string, kod: string): Promise<number> {
  return prisma.veriOnarim.count({ where: { musteriId, kod, durum: { in: ['ONAYLI', 'UYGULANDI'] }, not: { startsWith: ORNEK_TEYIT_ONEKI } } })
}

// ───────────────────────────── yazım yardımcıları ─────────────────────────────

function prismaAdaptorleri(tx: Tx, musteriId: string): Adaptorler {
  return {
    RucuDosyasi: {
      async guncelle(s, beklenen, yeni) {
        const r = await tx.rucuDosyasi.updateMany({
          where: { id: s.dosyaId, musteriId, [s.alan]: beklenen ?? null } as Prisma.RucuDosyasiWhereInput,
          data: { [s.alan]: yeni ?? null } as Prisma.RucuDosyasiUpdateManyMutationInput,
        })
        return r.count
      },
    },
    Sure: {
      async ekle(s, b) {
        const v = sureEkleVerisi(s.yeniJson, s.dosyaId, b.kullaniciId, b.simdi)
        const dosya = await tx.rucuDosyasi.findFirst({ where: { id: s.dosyaId, musteriId }, select: { id: true } })
        if (!dosya) return null
        if (v.borcluId) {
          const bo = await tx.borclu.findFirst({ where: { id: v.borcluId, dosyaId: s.dosyaId }, select: { id: true } })
          if (!bo) return null
        }
        const var_ = await tx.sure.findFirst({
          where: { dosyaId: s.dosyaId, tur: v.tur, borcluId: v.borcluId, silindiAt: null, durum: { notIn: ['KAPANDI', 'IPTAL'] } },
          select: { id: true },
        })
        if (var_) return null
        const c = await tx.sure.create({
          data: { ...v, hesapIziJson: v.hesapIziJson == null ? Prisma.DbNull : (v.hesapIziJson as Prisma.InputJsonValue) },
          select: { id: true },
        })
        return c.id
      },
      async ekleGeriAl(s, b) {
        if (!s.hedefId) return 0
        const r = await tx.sure.updateMany({ where: { id: s.hedefId, dosyaId: s.dosyaId, silindiAt: null, dosya: { musteriId } }, data: { silindiAt: b.simdi } })
        return r.count
      },
    },
  }
}

function prismaIz(tx: Tx, musteriId: string): IzYazici {
  return {
    async satirDurumu(id, beklenen, veri) {
      const r = await tx.veriOnarim.updateMany({ where: { id, musteriId, durum: beklenen }, data: veri })
      return r.count
    },
    async durumGecisi(d) {
      await tx.durumGecisi.create({
        data: { dosyaId: d.dosyaId, eksen: d.eksen, eski: d.eski, yeni: d.yeni, teyit: 'TEYITLI', sebep: d.sebep.slice(0, 500), kaynakTuru: 'ONARIM', kaynakId: d.kaynakId, kullaniciId: d.kullaniciId },
      })
    },
    async aktivite(d) {
      await tx.aktivite.create({ data: { dosyaId: d.dosyaId, kullaniciId: d.kullaniciId, eylem: d.eylem.slice(0, 500), detayJson: d.detayJson as Prisma.InputJsonValue } })
    },
  }
}

/** "Durum teyit gerekiyor" bandı (RucuDosyasi.onarimDurumu) — yalnız durum etkileyen kodların satırlarından. */
async function onarimDurumlariniGuncelle(tx: Tx, musteriId: string, dosyaIds: string[]) {
  for (const dosyaId of [...new Set(dosyaIds)]) {
    const satirlar = await tx.veriOnarim.findMany({ where: { musteriId, dosyaId, kod: { in: [...DURUM_KODLARI] } }, select: { durum: true } })
    const yeni = onarimDurumuHesapla(satirlar.map((s) => s.durum))
    if (yeni) await tx.rucuDosyasi.updateMany({ where: { id: dosyaId, musteriId }, data: { onarimDurumu: yeni } })
  }
}

const satirOzu = (r: Prisma.VeriOnarimGetPayload<{ select: typeof SATIR_SELECT }>): OnarimSatiri => ({
  id: r.id, musteriId: r.musteriId, dosyaId: r.dosyaId, parti: r.parti, kod: r.kod, islem: r.islem, hedefTablo: r.hedefTablo,
  hedefId: r.hedefId, alan: r.alan, eskiJson: r.eskiJson, yeniJson: r.yeniJson, durum: r.durum, not: r.not,
})

// ───────────────────────────── kararlar ─────────────────────────────

export type ServisSonuc<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string }

export async function satirKarariVer(g: { musteriId: string; kullaniciId: string; id: string; karar: SatirKarari; gerekce?: string | null; ornekTeyit?: boolean }): Promise<ServisSonuc> {
  const s = await prisma.veriOnarim.findFirst({ where: { id: g.id, musteriId: g.musteriId }, select: SATIR_SELECT })
  if (!s) return { ok: false, error: 'Onarım satırı bulunamadı.' }
  const gecis = kararGecisi(s.durum, g.karar)
  if (!gecis.ok) return { ok: false, error: gecis.hata }
  const gerekce = (g.gerekce ?? '').trim()
  if (g.karar === 'REDDET' && gerekce.length < 3) return { ok: false, error: 'Ret gerekçesini yazın.' }
  if (g.ornekTeyit && (g.karar !== 'ONAYLA' || !kodMeta(s.kod).topluOnay)) return { ok: false, error: 'Örnek teyidi yalnız toplu onaylı partide (R1) satır onaylanırken işaretlenir.' }
  if (g.ornekTeyit && gerekce.length < 5) return { ok: false, error: 'Örnek teyidinde neye bakıldığını yazın (ör. "Hugo ve dekont: 12.345,67 TL").' }
  const not = g.ornekTeyit ? `${ORNEK_TEYIT_ONEKI}: ${gerekce}` : g.karar === 'KARARI_GERI_AL' ? (s.not ? `${s.not} · karar geri alındı` : 'Karar geri alındı') : gerekce || s.not
  const karardanSonra = g.karar === 'ONAYLA' || g.karar === 'REDDET'
  await prisma.$transaction(async (tx) => {
    const r = await tx.veriOnarim.updateMany({
      where: { id: s.id, musteriId: g.musteriId, durum: s.durum },
      data: {
        durum: gecis.yeni,
        not: not ? not.slice(0, 1000) : null,
        ...(karardanSonra ? { onaylayanId: g.kullaniciId, onayAt: new Date() } : g.karar === 'KARARI_GERI_AL' ? { onaylayanId: null, onayAt: null } : {}),
      },
    })
    if (r.count !== 1) throw new Error('Satır bu arada değişti; sayfayı yenileyin.')
    if (g.karar !== 'SONRA') {
      await tx.aktivite.create({
        data: { dosyaId: s.dosyaId, kullaniciId: g.kullaniciId, eylem: `[ONARIM] ${s.parti} · satır ${g.karar === 'ONAYLA' ? 'onaylandı' : g.karar === 'REDDET' ? 'reddedildi' : 'kararı geri alındı'}${g.ornekTeyit ? ' (örnek teyidi)' : ''}`, detayJson: { veriOnarimId: s.id, kod: s.kod } },
      })
    }
    if (kodMeta(s.kod).durumEtkiler) await onarimDurumlariniGuncelle(tx, g.musteriId, [s.dosyaId])
  }, TX_AYAR)
  return { ok: true }
}

export async function topluOnayVer(g: { musteriId: string; kullaniciId: string; parti: string }): Promise<ServisSonuc<{ onaylanan: number; tekTekKalan: number }>> {
  const satirlar = await prisma.veriOnarim.findMany({ where: { musteriId: g.musteriId, parti: g.parti }, select: { id: true, kod: true, durum: true, guvenSinifi: true } })
  if (!satirlar.length) return { ok: false, error: 'Parti bulunamadı.' }
  const kod = satirlar[0].kod
  const d = topluOnayDurumu(kod, await ornekTeyitSayisi(g.musteriId, kod))
  if (!d.acik) return { ok: false, error: d.sebep }
  const uygun = satirlar.filter(topluOnaylanabilirMi).map((s) => s.id)
  const tekTekKalan = satirlar.filter((s) => s.durum === 'KURU' && s.guvenSinifi !== 'A').length
  if (!uygun.length) return { ok: true, onaylanan: 0, tekTekKalan }
  const r = await prisma.$transaction(async (tx) => {
    const u = await tx.veriOnarim.updateMany({
      where: { id: { in: uygun }, musteriId: g.musteriId, kod, durum: 'KURU', guvenSinifi: 'A' },
      data: { durum: 'ONAYLI', onaylayanId: g.kullaniciId, onayAt: new Date(), not: TOPLU_ONAY_NOTU },
    })
    await tx.aktivite.create({ data: { kullaniciId: g.kullaniciId, eylem: `[ONARIM] ${g.parti}: ${u.count} satır toplu onaylandı (5 örnek elle teyit edildikten sonra; yalnız A sınıfı)`, detayJson: { parti: g.parti, kod } } })
    return u
  }, TX_AYAR)
  return { ok: true, onaylanan: r.count, tekTekKalan }
}

// ───────────────────────────── uygula / geri al ─────────────────────────────

export async function partiyiUygula(g: { musteriId: string; kullaniciId: string; parti: string }): Promise<ServisSonuc<TopluSonuc>> {
  const b: UygulaBaglami = { kullaniciId: g.kullaniciId, simdi: new Date() }
  const sonuc = await prisma.$transaction(async (tx) => {
    const satirlar = await tx.veriOnarim.findMany({ where: { musteriId: g.musteriId, parti: g.parti, durum: 'ONAYLI' }, select: SATIR_SELECT, orderBy: { createdAt: 'asc' } })
    const ad = prismaAdaptorleri(tx, g.musteriId)
    const iz = prismaIz(tx, g.musteriId)
    const r = await satirlariIsle(satirlar.map(satirOzu), (s) => satirUygula(s, ad, iz, b))
    const durumDosyalari = satirlar.filter((s) => kodMeta(s.kod).durumEtkiler).map((s) => s.dosyaId)
    if (durumDosyalari.length) await onarimDurumlariniGuncelle(tx, g.musteriId, durumDosyalari)
    return r
  }, TX_AYAR)
  return { ok: true, ...sonuc }
}

async function geriAl(g: { musteriId: string; kullaniciId: string }, where: Prisma.VeriOnarimWhereInput): Promise<ServisSonuc<TopluSonuc>> {
  const b: UygulaBaglami = { kullaniciId: g.kullaniciId, simdi: new Date() }
  const sonuc = await prisma.$transaction(async (tx) => {
    const satirlar = await tx.veriOnarim.findMany({ where: { ...where, musteriId: g.musteriId, durum: 'UYGULANDI' }, select: SATIR_SELECT, orderBy: { createdAt: 'desc' } })
    const ad = prismaAdaptorleri(tx, g.musteriId)
    const iz = prismaIz(tx, g.musteriId)
    const r = await satirlariIsle(satirlar.map(satirOzu), (s) => satirGeriAl(s, ad, iz, b))
    const durumDosyalari = satirlar.filter((s) => kodMeta(s.kod).durumEtkiler).map((s) => s.dosyaId)
    if (durumDosyalari.length) await onarimDurumlariniGuncelle(tx, g.musteriId, durumDosyalari)
    return r
  }, TX_AYAR)
  return { ok: true, ...sonuc }
}

export function satiriGeriAl(g: { musteriId: string; kullaniciId: string; id: string }) {
  return geriAl(g, { id: g.id })
}

export function partiyiGeriAl(g: { musteriId: string; kullaniciId: string; parti: string }) {
  return geriAl(g, { parti: g.parti })
}

// ───────────────────────────── kuru liste üretimi (canlıdan okur) ─────────────────────────────

const TAKIP_ONCESI = ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'] as const

async function bekleyenDosyalar(musteriId: string, kod: OnarimKodu): Promise<Set<string>> {
  const rows = await prisma.veriOnarim.findMany({ where: { musteriId, kod, durum: { in: ['KURU', 'ONAYLI'] } }, select: { dosyaId: true } })
  return new Set(rows.map((r) => r.dosyaId))
}

async function r1Oku(musteriId: string): Promise<KuruSatir[]> {
  const bekleyen = await bekleyenDosyalar(musteriId, 'R1')
  const dosyalar = await prisma.rucuDosyasi.findMany({
    where: { musteriId, kaynakJson: { not: Prisma.DbNull } },
    select: { id: true, rucuTutari: true, davaMiktari: true, kaynakJson: true, icraDosyaNo: true, takipTarihi: true },
  })
  return r1TutarTeshis(dosyalar.filter((d) => !bekleyen.has(d.id)).map((d) => ({
    id: d.id,
    rucuTutari: d.rucuTutari?.toString() ?? null,
    davaMiktari: d.davaMiktari?.toString() ?? null,
    kaynakJson: d.kaynakJson,
    takipAcildi: !!d.icraDosyaNo || !!d.takipTarihi,
  })))
}

async function r0Oku(musteriId: string, simdi: Date): Promise<KuruSatir[]> {
  const bekleyen = await bekleyenDosyalar(musteriId, 'R0')
  const kapsam = { musteriId, durum: { notIn: [...TAKIP_ONCESI] } } satisfies Prisma.RucuDosyasiWhereInput
  const [takipler, olaylar, belgeler, mevcut] = await Promise.all([
    prisma.borcluTakip.findMany({
      where: { silindiAt: null, dosya: kapsam, OR: [{ itirazVerilisTarihi: { not: null } }, { itirazUyapTarihi: { not: null } }] },
      select: { dosyaId: true, borcluId: true, itirazVerilisTarihi: true, itirazUyapTarihi: true, itirazAlacakliyaTebligTarihi: true, itirazKaynakBelgeId: true },
    }),
    prisma.takipOlayi.findMany({
      where: { tip: 'ITIRAZ', dosya: kapsam, OR: [{ teyit: null }, { teyit: { not: 'REDDEDILDI' } }] },
      select: { dosyaId: true, borcluId: true, tarih: true, hukukiTarih: true, aciklama: true, teyit: true, tip: true, kaynakBelgeId: true },
    }),
    prisma.belge.findMany({
      where: { silindiAt: null, dosya: kapsam, OR: [{ dosyaAdi: { contains: 'tiraz', mode: 'insensitive' } }, { dosyaAdi: { contains: 'TİRAZ' } }, { uyapEvrakTuru: { contains: 'tiraz', mode: 'insensitive' } }] },
      select: { id: true, dosyaId: true, dosyaAdi: true, uyapEvrakTuru: true, belgeTarihi: true },
    }),
    prisma.sure.findMany({ where: { tur: 'IIK67', silindiAt: null, durum: { notIn: ['KAPANDI', 'IPTAL'] }, dosya: { musteriId } }, select: { dosyaId: true, borcluId: true } }),
  ])
  const m = new Map<string, R0Dosya>()
  const dosya = (id: string) => {
    const d = m.get(id) ?? { id, itirazlar: [] as R0Itiraz[], mevcutIik67: [] }
    m.set(id, d)
    return d
  }
  for (const t of takipler) {
    const tarih = t.itirazVerilisTarihi ?? t.itirazUyapTarihi
    if (tarih) dosya(t.dosyaId).itirazlar.push({ borcluId: t.borcluId, tarih, kaynak: 'BORCLU_TAKIP', tebligTarihi: t.itirazAlacakliyaTebligTarihi, belgeId: t.itirazKaynakBelgeId, etiket: 'Onaylı itiraz kaydı (borçlu bazında)' })
  }
  for (const o of olaylar) {
    const tarih = o.hukukiTarih ?? o.tarih
    if (!tarih || asamaTureviItirazMi(o)) continue // aşama türevi itirazın tarihi itiraz tarihi değildir (08 §2(c))
    dosya(o.dosyaId).itirazlar.push({ borcluId: o.borcluId, tarih, kaynak: o.teyit === 'TEYITLI' ? 'OLAY_TEYITLI' : 'OLAY_ADAY', belgeId: o.kaynakBelgeId, etiket: o.teyit === 'TEYITLI' ? 'Onaylı itiraz olayı' : 'İtiraz olayı (onaysız)' })
  }
  for (const b of belgeler) {
    if (!belgeBorcaItirazMi(b.dosyaAdi) && !belgeBorcaItirazMi(b.uyapEvrakTuru)) continue
    const tarih = b.belgeTarihi ?? belgeItirazTarihiCikar(b.dosyaAdi)
    if (!tarih) continue
    dosya(b.dosyaId).itirazlar.push({ borcluId: null, tarih, kaynak: 'BELGE', belgeId: b.id, etiket: `${b.uyapEvrakTuru ?? 'Borca itiraz evrakı'} (UYAP evrak tarihi)` })
  }
  for (const s of mevcut) if (m.has(s.dosyaId)) dosya(s.dosyaId).mevcutIik67.push({ borcluId: s.borcluId })
  return r0Iik67Teshis([...m.values()].filter((d) => !bekleyen.has(d.id)), simdi)
}

async function r2Oku(musteriId: string): Promise<KuruSatir[]> {
  const bekleyen = await bekleyenDosyalar(musteriId, 'R2')
  const dosyalar = await prisma.rucuDosyasi.findMany({
    where: { musteriId, durum: 'KESINLESTI' },
    select: {
      id: true, durum: true, icraEksen: true,
      olaylar: { where: { tip: { in: ['KESINLESTI', 'ITIRAZ'] } }, select: { tip: true, aciklama: true, hamJson: true } },
      belgeler: { where: { silindiAt: null, OR: [{ dosyaAdi: { contains: 'tiraz', mode: 'insensitive' } }, { dosyaAdi: { contains: 'TİRAZ' } }] }, select: { dosyaAdi: true, uyapEvrakTuru: true } },
    },
  })
  return r2KesinlestiTeshis(dosyalar.filter((d) => !bekleyen.has(d.id)).map((d) => ({
    id: d.id,
    durum: d.durum,
    icraEksen: d.icraEksen,
    gercekKesinlesme: d.olaylar.some((o) => o.tip === 'KESINLESTI' && kesinlesmeKaydiMi(o)),
    itirazIzi: d.olaylar.some((o) => o.tip === 'ITIRAZ') || d.belgeler.some((b) => belgeBorcaItirazMi(b.dosyaAdi) || belgeBorcaItirazMi(b.uyapEvrakTuru)),
  })))
}

export const URETILEBILIR_KODLAR = ['R0', 'R1', 'R2'] as const
export type UretilebilirKod = (typeof URETILEBILIR_KODLAR)[number]

/** Canlı veriden KURU satırlar üretir ve ≤ 20'lik partilere yazar. Veri alanlarına dokunmaz (yalnız R2'de onarım bandı). */
export async function kuruListeOlustur(g: { musteriId: string; kullaniciId: string; kod: UretilebilirKod; simdi?: Date }): Promise<ServisSonuc<{ satir: number; partiler: string[]; kalan: number }>> {
  const simdi = g.simdi ?? new Date()
  const hepsi = g.kod === 'R1' ? await r1Oku(g.musteriId) : g.kod === 'R0' ? await r0Oku(g.musteriId, simdi) : await r2Oku(g.musteriId)
  if (!hepsi.length) return { ok: true, satir: 0, partiler: [], kalan: 0 }
  const satirlar = hepsi.slice(0, URETIM_EN_COK)
  const onek = `${g.kod}-${KOD_META[g.kod].partiEtiketi}`
  const mevcutPartiler = await prisma.veriOnarim.findMany({ where: { musteriId: g.musteriId, parti: { startsWith: `${onek}-` } }, select: { parti: true }, distinct: ['parti'] })
  const sonSira = Math.max(0, ...mevcutPartiler.map((p) => partiSirasi(p.parti, onek) ?? 0))
  const partiler = partilereBol(satirlar, g.kod, KOD_META[g.kod].partiEtiketi, sonSira + 1)
  await prisma.$transaction(async (tx) => {
    await tx.veriOnarim.createMany({
      data: partiler.flatMap((p) => p.satirlar.map((s) => ({
        musteriId: g.musteriId, dosyaId: s.dosyaId, parti: p.parti, kod: s.kod, islem: s.islem, hedefTablo: s.hedefTablo, alan: s.alan,
        eskiJson: s.eskiJson as Prisma.InputJsonValue, yeniJson: s.yeniJson as Prisma.InputJsonValue, kanit: s.kanit, guvenSinifi: s.guvenSinifi, durum: 'KURU',
      }))),
    })
    if (kodMeta(g.kod).durumEtkiler) await onarimDurumlariniGuncelle(tx, g.musteriId, satirlar.map((s) => s.dosyaId))
    await tx.aktivite.create({ data: { kullaniciId: g.kullaniciId, eylem: `[ONARIM] Kuru liste oluşturuldu: ${g.kod} · ${satirlar.length} satır · ${partiler.length} parti`, detayJson: { kod: g.kod, partiler: partiler.map((p) => p.parti) } } })
  }, TX_AYAR)
  return { ok: true, satir: satirlar.length, partiler: partiler.map((p) => p.parti), kalan: hepsi.length - satirlar.length }
}
