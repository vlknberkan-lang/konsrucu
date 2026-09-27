/**
 * KonsRücü — Dosya kartı veri katmanı · lib/konsrucu/dilekce-v2/kart-veri.ts (sunucu; Prisma)
 *
 * S35: kartın beslendiği kayıtları tek yerde okur (06 §7.3): TakipTalebi (geçerli son sürüm), Dava + DavaTaraf,
 * BorcluTakip, Arabuluculuk, ONAYLI AlanDegeri, belgeler ve sayfa metinleri, aktif müvekkilin DOĞRULANDI kütüphane
 * kayıtları. Her sorgu aktif müvekkil kapsamındadır (M7); hukuki kayıtlar `silindiAt: null` süzgeciyle okunur.
 */
import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { MaskeKaynagi } from '@/lib/ai/cagri'
import type { BelgeMetni } from './alinti'
import type { BaglamBelgesi } from './belge-baglami'
import { asama2Kapisi, kilitKontrolu, type KartGirdisi } from './kart'
import { KART_TURLERI, type KartDurumu, type KartGorunum, type KartIcerik, type KartTuru } from './tipler'

type Db = PrismaClient | Prisma.TransactionClient

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const dec = (d: Prisma.Decimal | null | undefined) => (d == null ? null : d.toString())

/** AlanDegeri.degerJson → okunur metin. */
export function degerMetni(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(degerMetni).filter(Boolean).join(', ')
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${degerMetni(x)}`).join('; ')
  return String(v)
}

export type KartVerisi = {
  girdi: KartGirdisi
  belgeler: BaglamBelgesi[]
  belgeMetinleri: Map<string, BelgeMetni>
  maske: MaskeKaynagi
}

export async function kartVerisiniYukle(db: Db, musteriId: string, dosyaId: string): Promise<KartVerisi | null> {
  const dosya = await db.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId },
    select: {
      id: true, hukukDosyaNo: true, icraDairesi: true, icraDosyaNo: true, takipTarihi: true, rucuSebebi: true, rucuSebebiKod: true,
      sigortaliUnvan: true, sigortaliTelefon: true, sigortaliPlaka: true, karsiPlaka: true,
      borclular: {
        orderBy: { id: 'asc' },
        select: {
          id: true, adUnvan: true, tcVkn: true, telefon: true,
          takip: {
            select: {
              itirazVar: true, itirazTipi: true, itirazVerilisTarihi: true, itirazUyapTarihi: true, itirazKapsamJson: true,
              itirazEdilenTutar: true, itirazKaynakBelgeId: true, silindiAt: true,
            },
          },
        },
      },
    },
  })
  if (!dosya) return null

  const [ayarlar, takipTalebi, dava, arabuluculuk, alanlar, belgeler, dayanaklar] = await Promise.all([
    db.ayarlar.findUnique({ where: { musteriId }, select: { alacakliUnvan: true } }),
    db.takipTalebi.findFirst({ where: { dosyaId, gecerli: true, silindiAt: null }, orderBy: { surum: 'desc' } }),
    db.dava.findFirst({
      where: { dosyaId, silindiAt: null, rolumuz: 'DAVACI' },
      orderBy: [{ derece: 'asc' }, { createdAt: 'desc' }],
      include: { taraflar: { where: { silindiAt: null }, orderBy: { createdAt: 'asc' } } },
    }),
    db.arabuluculuk.findFirst({ where: { dosyaId, silindiAt: null }, orderBy: { createdAt: 'desc' } }),
    db.alanDegeri.findMany({ where: { dosyaId, durum: 'ONAYLI', silindiAt: null }, orderBy: { createdAt: 'asc' } }),
    db.belge.findMany({
      where: { dosyaId, silindiAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, dosyaAdi: true, altTur: true, kategori: true, belgeTarihi: true, createdAt: true, metinDurumu: true, aiIzni: true,
        extractedText: true, sayfalar: { select: { sayfaNo: true, metin: true }, orderBy: { sayfaNo: 'asc' } },
      },
    }),
    db.mevzuatKaynak.findMany({ where: { musteriId, aktif: true, durum: 'DOGRULANDI' }, select: { id: true, kunye: true, rucuSebebiKodlari: true } }),
  ])

  const belgeMetinleri = new Map<string, BelgeMetni>()
  const baglamBelgeleri: BaglamBelgesi[] = belgeler.map((b) => {
    const sayfalar = b.sayfalar.length
      ? b.sayfalar.map((s) => ({ sayfaNo: s.sayfaNo, metin: s.metin }))
      : b.extractedText?.trim() ? [{ sayfaNo: null, metin: b.extractedText }] : []
    const metin: BelgeMetni = { belgeId: b.id, ad: b.dosyaAdi, sayfalar }
    belgeMetinleri.set(b.id, metin)
    return {
      id: b.id, ad: b.dosyaAdi, altTur: b.altTur, kategori: b.kategori, tarih: iso(b.belgeTarihi ?? b.createdAt),
      metinDurumu: b.metinDurumu, aiIzni: b.aiIzni, metin: sayfalar.length ? metin : null,
    }
  })

  const girdi: KartGirdisi = {
    dosya: {
      id: dosya.id, hukukDosyaNo: dosya.hukukDosyaNo, icraDairesi: dosya.icraDairesi, icraDosyaNo: dosya.icraDosyaNo,
      takipTarihi: iso(dosya.takipTarihi), rucuSebebi: dosya.rucuSebebi, rucuSebebiKod: dosya.rucuSebebiKod,
    },
    musteriUnvani: ayarlar?.alacakliUnvan ?? null,
    borclular: dosya.borclular.map((b) => ({
      id: b.id, adUnvan: b.adUnvan,
      takip: b.takip && !b.takip.silindiAt ? {
        itirazVar: b.takip.itirazVar, itirazTipi: b.takip.itirazTipi, itirazVerilisTarihi: iso(b.takip.itirazVerilisTarihi),
        itirazUyapTarihi: iso(b.takip.itirazUyapTarihi), itirazKapsamJson: b.takip.itirazKapsamJson,
        itirazEdilenTutar: dec(b.takip.itirazEdilenTutar), itirazKaynakBelgeId: b.takip.itirazKaynakBelgeId,
      } : null,
    })),
    takipTalebi: takipTalebi ? {
      id: takipTalebi.id, surum: takipTalebi.surum, asilAlacak: takipTalebi.asilAlacak.toString(), islemisFaiz: dec(takipTalebi.islemisFaiz),
      toplam: dec(takipTalebi.toplam), faizTuru: takipTalebi.faizTuru, faizOraniMetni: takipTalebi.faizOraniMetni,
      faizBaslangicTuru: takipTalebi.faizBaslangicTuru, faizBaslangic: iso(takipTalebi.faizBaslangic), takipTarihi: iso(takipTalebi.takipTarihi),
      kaynak: takipTalebi.kaynak, kaynakBelgeId: takipTalebi.kaynakBelgeId,
    } : null,
    dava: dava ? {
      id: dava.id, tur: dava.tur, mahkemeTuru: dava.mahkemeTuru, mahkemeYer: dava.mahkemeYer, mahkemeNo: dava.mahkemeNo,
      esasYil: dava.esasYil, esasSira: dava.esasSira, usul: dava.usul, davaDegeri: dec(dava.davaDegeri), davaDegeriKaynak: dava.davaDegeriKaynak,
      taraflar: dava.taraflar.map((t) => ({ id: t.id, borcluId: t.borcluId, rol: t.rol, itirazEttiMi: t.itirazEttiMi, adHam: t.adHam, teyit: t.teyit })),
    } : null,
    arabuluculuk: arabuluculuk ? {
      id: arabuluculuk.id, tur: arabuluculuk.tur, sonTutanakTarihi: iso(arabuluculuk.sonTutanakTarihi), sonuc: arabuluculuk.sonuc,
      sonTutanakBelgeId: arabuluculuk.sonTutanakBelgeId,
    } : null,
    alanlar: alanlar.map((a) => ({
      id: a.id, alan: a.alan, deger: degerMetni(a.degerJson), kaynakBelgeId: a.kaynakBelgeId, sayfa: a.sayfa, alinti: a.alinti,
      alintiDogru: a.alintiDogru, onaylayanId: a.onaylayanId, onayAt: iso(a.onayAt),
    })),
    belgeler: baglamBelgeleri.map((b) => ({ id: b.id, ad: b.ad, altTur: b.altTur, kategori: b.kategori, tarih: b.tarih, metinVar: !!b.metin })),
    dayanaklar: dayanaklar.map((d) => ({ id: d.id, kunye: d.kunye, rucuSebebiKodlari: d.rucuSebebiKodlari })),
  }

  const maske: MaskeKaynagi = {
    kisiler: [...dosya.borclular.map((b) => b.adUnvan), dosya.sigortaliUnvan, ...(dava?.taraflar ?? []).map((t) => t.adHam)],
    kimlikler: dosya.borclular.map((b) => b.tcVkn),
    telefonlar: [...dosya.borclular.map((b) => b.telefon), dosya.sigortaliTelefon],
    plakalar: [dosya.sigortaliPlaka, dosya.karsiPlaka],
  }
  return { girdi, belgeler: baglamBelgeleri, belgeMetinleri, maske }
}

/** Yalnız belge metinleri (olgu düzeltmesinde alıntı doğrulaması için). */
export async function belgeMetinleriniYukle(db: Db, musteriId: string, dosyaId: string, belgeIds: string[]): Promise<Map<string, BelgeMetni>> {
  const belgeler = await db.belge.findMany({
    where: { id: { in: belgeIds }, dosyaId, silindiAt: null, dosya: { musteriId } },
    select: { id: true, dosyaAdi: true, extractedText: true, sayfalar: { select: { sayfaNo: true, metin: true }, orderBy: { sayfaNo: 'asc' } } },
  })
  return new Map(belgeler.map((b) => [b.id, {
    belgeId: b.id, ad: b.dosyaAdi,
    sayfalar: b.sayfalar.length ? b.sayfalar.map((s) => ({ sayfaNo: s.sayfaNo, metin: s.metin })) : b.extractedText?.trim() ? [{ sayfaNo: null, metin: b.extractedText }] : [],
  }]))
}

/** DosyaKarti.icerikJson → KartIcerik (bozuk ya da eski biçimli içerikte null; ekran "yeniden hazırla" der). */
export function icerikOku(json: unknown, tur: KartTuru): KartIcerik | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Partial<KartIcerik>
  if (!Array.isArray(o.olgular) || !o.secimler || typeof o.secimler !== 'object') return null
  return {
    tur, olgular: o.olgular, kaynaksizlar: o.kaynaksizlar ?? [], secimler: o.secimler, davaliAdaylari: o.davaliAdaylari ?? [],
    oneriler: o.oneriler ?? { mahkeme: null, usul: null, esas: null, davalilar: [], talepler: [] },
    ekler: o.ekler ?? [], eksikler: o.eksikler ?? [], celiskiler: o.celiskiler ?? [], savunmalar: o.savunmalar ?? [],
    dayanaklar: o.dayanaklar ?? [], davaTuru: o.davaTuru ?? null, ai: o.ai ?? { durum: 'YOK', model: null, uyari: null },
    okunamayanBelgeler: o.okunamayanBelgeler ?? [], kisaltilanBelgeler: o.kisaltilanBelgeler ?? [], aiyaGitmeyenBelgeler: o.aiyaGitmeyenBelgeler ?? [],
  }
}

type KartSatiri = { id: string; surum: number; durum: string; updatedAt: Date; onayAt: Date | null; onaylayanId: string | null; icerikJson: unknown }

export function kartGorunumu(k: KartSatiri, tur: KartTuru): KartGorunum | null {
  const icerik = icerikOku(k.icerikJson, tur)
  if (!icerik) return null
  const durum = (['TASLAK', 'ONAYLI', 'ESKIDI'].includes(k.durum) ? k.durum : 'TASLAK') as KartDurumu
  return {
    id: k.id, surum: k.surum, durum, updatedAt: k.updatedAt.toISOString(), onayAt: iso(k.onayAt), onaylayanId: k.onaylayanId, icerik,
    kilit: kilitKontrolu(icerik), asama2: asama2Kapisi({ durum, icerik }),
  }
}

/** Dosyanın o türdeki geçerli (eskimemiş, silinmemiş) son kartı. */
export function gecerliKart(db: Db, musteriId: string, dosyaId: string, tur: KartTuru) {
  return db.dosyaKarti.findFirst({
    where: { dosyaId, tur, silindiAt: null, durum: { not: 'ESKIDI' }, dosya: { musteriId } },
    orderBy: { surum: 'desc' },
    select: { id: true, surum: true, durum: true, updatedAt: true, onayAt: true, onaylayanId: true, icerikJson: true, dosyaId: true },
  })
}

export function kartGecmisi(db: Db, musteriId: string, dosyaId: string, tur: KartTuru) {
  return db.dosyaKarti.findMany({
    where: { dosyaId, tur, silindiAt: null, dosya: { musteriId } },
    orderBy: { surum: 'desc' },
    take: 20,
    select: { id: true, surum: true, durum: true, onayAt: true, createdAt: true },
  })
}

/** Dosya sayfası ve masa için kısa özet: tür başına geçerli kartın sürümü ve durumu. */
export async function dilekceV2Ozeti(db: Db, musteriId: string, dosyaId: string): Promise<{ tur: KartTuru; surum: number; durum: string }[]> {
  const kartlar = await db.dosyaKarti.findMany({
    where: { dosyaId, silindiAt: null, durum: { not: 'ESKIDI' }, dosya: { musteriId } },
    orderBy: { surum: 'desc' },
    select: { tur: true, surum: true, durum: true },
  })
  return KART_TURLERI.flatMap((tur) => {
    const k = kartlar.find((x) => x.tur === tur)
    return k ? [{ tur, surum: k.surum, durum: k.durum }] : []
  })
}
