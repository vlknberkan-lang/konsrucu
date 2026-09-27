'use server'

/**
 * KonsRücü — Dosya kartı eylemleri (dilekçe v2, aşama 1) · app/(app)/dilekceler/kart/actions.ts
 *
 * S35 (06 §7.3, 2(h)): kart hazırla, olgu onayla, olgu düzelt, avukat seçimlerini kaydet, savunma işaretle, kilitle.
 * Her eylem: oturum + aktif müvekkil kapsamı + rol + DILEKCE_V2 bayrağı; zod; iyimser kilit (updatedAt);
 * Aktivite kaydı; revalidatePath. Kart silinmez; kilitli (ONAYLI) kartta değişiklik yeni sürüm açar ve eski sürüm
 * ESKIDI olur (aşama 2 yeni sürüm kilitlenene kadar kapalı kalır).
 */
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { AiDurdurulduHata, KrediYetersizHata } from '@/lib/konsrucu/ai-kredi'
import { acilamayanUyarisi, aiKapiHatasiMi, aiOturumu } from '@/lib/ai/cagri'
import { KVKK_KAPALI_MESAJI, yuzeyAcik } from '@/lib/ai/bayrak'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { belgeBaglamiKur } from '@/lib/konsrucu/dilekce-v2/belge-baglami'
import {
  kartIcerigiKur, kayitOlgulari, kilitKontrolu, olguDuzelt, olgulariOnayla, secimleriUygula, type AiCiktisi,
} from '@/lib/konsrucu/dilekce-v2/kart'
import { kartOlgulariniCikar } from '@/lib/konsrucu/dilekce-v2/kart-ai'
import { belgeMetinleriniYukle, gecerliKart, icerikOku, kartVerisiniYukle } from '@/lib/konsrucu/dilekce-v2/kart-veri'
import { KART_MODEL, kartUretici } from '@/lib/konsrucu/dilekce-v2/model'
import { savunmaIsaretle } from '@/lib/konsrucu/dilekce-v2/savunma-matrisi'
import { KART_TUR_ADI, KART_TURLERI, TALEP_KODLARI, type KartIcerik, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'

type Hata = { ok: false; error: string }
type Basari = { ok: true; kartId: string; surum: number; yeniSurum: boolean; uyarilar: string[] }

const uuid = z.string().uuid()
const zaman = z.string().min(10).max(40).refine((s) => !Number.isNaN(new Date(s).getTime()))
const olguId = z.string().regex(/^O-\d{1,3}$/)

const CAKISMA = 'Kart başka bir oturumda değişti. Sayfayı yenileyip güncel sürüm üzerinden devam edin.'
const json = (i: KartIcerik) => i as unknown as Prisma.InputJsonValue

// ───────────────────────── ortak kapılar ─────────────────────────

type Oturum = { kullaniciId: string; rol: string; musteriId: string; avukat: boolean }

async function oturumAl(o: { avukatGerekli: boolean }): Promise<Oturum | Hata> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || dbUser.rol === 'GORUNTULEYEN') return { ok: false, error: 'Dosya kartında değişiklik yetkiniz yok.' }
  if (!aktifMusteriId) return { ok: false, error: 'Aktif müşteri bulunamadı.' }
  if (!dilekceV2Acik(dbUser.rol)) return { ok: false, error: 'Dilekçe v2 bu hesap için henüz açık değil.' }
  const avukat = avukatRoluMu(dbUser.rol)
  if (o.avukatGerekli && !avukat) return { ok: false, error: 'Bu işlemi yalnız avukat yapabilir.' }
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
  if (!musteri) return { ok: false, error: 'Bu müşteri pasif olduğu için dosya kartı değiştirilemez.' }
  return { kullaniciId: dbUser.id, rol: dbUser.rol, musteriId: aktifMusteriId, avukat }
}
const hataMi = (x: unknown): x is Hata => !!x && typeof x === 'object' && (x as Hata).ok === false

function kartYukle(kartId: string, musteriId: string) {
  return prisma.dosyaKarti.findFirst({
    where: { id: kartId, silindiAt: null, dosya: { musteriId } },
    select: { id: true, dosyaId: true, davaId: true, tur: true, surum: true, durum: true, updatedAt: true, icerikJson: true, uretici: true },
  })
}
type YukluKart = NonNullable<Awaited<ReturnType<typeof kartYukle>>>

function yenile(dosyaId: string) {
  revalidatePath('/dilekceler')
  revalidatePath('/dilekceler/kart')
  revalidatePath(`/akilli-giris/${dosyaId}`)
}

/**
 * Kart içeriğini yazar. TASLAK: yerinde (beklenen updatedAt ile). ONAYLI: yeni TASLAK sürüm açılır, eskisi ESKIDI.
 * ESKIDI: yazılmaz.
 */
async function icerikYaz(kart: YukluKart, icerik: KartIcerik, beklenen: string, o: Oturum, eylem: string, detay: Record<string, unknown>): Promise<Basari | Hata> {
  const beklenenAn = new Date(beklenen)
  if (kart.durum === 'ESKIDI') return { ok: false, error: 'Bu kart sürümü eskidi; güncel sürümü açın.' }
  try {
    if (kart.durum === 'TASLAK') {
      const ok = await prisma.$transaction(async (tx) => {
        const r = await tx.dosyaKarti.updateMany({
          where: { id: kart.id, durum: 'TASLAK', silindiAt: null, updatedAt: beklenenAn, dosya: { musteriId: o.musteriId } },
          data: { icerikJson: json(icerik) },
        })
        if (r.count !== 1) return false
        await tx.aktivite.create({ data: { dosyaId: kart.dosyaId, kullaniciId: o.kullaniciId, eylem, detayJson: { kartId: kart.id, surum: kart.surum, ...detay } as Prisma.InputJsonValue } })
        return true
      })
      if (!ok) return { ok: false, error: CAKISMA }
      yenile(kart.dosyaId)
      return { ok: true, kartId: kart.id, surum: kart.surum, yeniSurum: false, uyarilar: [] }
    }
    // ONAYLI → yeni sürüm
    const yeni = await prisma.$transaction(async (tx) => {
      const r = await tx.dosyaKarti.updateMany({
        where: { id: kart.id, durum: 'ONAYLI', silindiAt: null, updatedAt: beklenenAn, dosya: { musteriId: o.musteriId } },
        data: { durum: 'ESKIDI' },
      })
      if (r.count !== 1) return null
      const son = await tx.dosyaKarti.findFirst({ where: { dosyaId: kart.dosyaId, tur: kart.tur }, orderBy: { surum: 'desc' }, select: { surum: true } })
      const k = await tx.dosyaKarti.create({
        data: { dosyaId: kart.dosyaId, davaId: kart.davaId, tur: kart.tur, surum: (son?.surum ?? kart.surum) + 1, durum: 'TASLAK', icerikJson: json(icerik), uretici: kart.uretici },
        select: { id: true, surum: true },
      })
      await tx.aktivite.create({
        data: { dosyaId: kart.dosyaId, kullaniciId: o.kullaniciId, eylem: `${eylem} · kilitli kart için sürüm ${k.surum} açıldı`, detayJson: { kartId: k.id, oncekiKartId: kart.id, surum: k.surum, ...detay } as Prisma.InputJsonValue },
      })
      return k
    })
    if (!yeni) return { ok: false, error: CAKISMA }
    yenile(kart.dosyaId)
    return { ok: true, kartId: yeni.id, surum: yeni.surum, yeniSurum: true, uyarilar: [`Kilitli kart değişmez: sürüm ${yeni.surum} açıldı. Taslağa geçmek için yeni sürümü kilitleyin.`] }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, error: CAKISMA }
    console.error('[dilekce-v2] kart yazılamadı', e instanceof Error ? e.name : 'Bilinmeyen hata')
    return { ok: false, error: 'Kart kaydedilemedi. Lütfen tekrar deneyin.' }
  }
}

// ───────────────────────── kart hazırla ─────────────────────────

const hazirlaGirdi = z.object({ dosyaId: uuid, tur: z.enum(KART_TURLERI) })

/**
 * Kartı kayıtlardan kurar; yapay zekâ yüzeyi açıksa belgelerden kaynaklı olgu ekler. Yeni sürüm açar; önceki
 * eskimemiş sürüm ESKIDI olur (aynı olguların onayı ve avukat seçimleri taşınır).
 */
export async function dosyaKartiHazirla(input: { dosyaId: string; tur: KartTuru }): Promise<Basari | Hata> {
  const o = await oturumAl({ avukatGerekli: false })
  if (hataMi(o)) return o
  const p = hazirlaGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Dosya ya da dilekçe türü geçersiz.' }
  const { dosyaId, tur } = p.data
  try {
    const veri = await kartVerisiniYukle(prisma, o.musteriId, dosyaId)
    if (!veri) return { ok: false, error: 'Dosya aktif müşteride bulunamadı veya erişiminiz yok.' }
    const oncekiKart = await gecerliKart(prisma, o.musteriId, dosyaId, tur)
    const onceki = oncekiKart ? icerikOku(oncekiKart.icerikJson, tur) : null
    const baglam = belgeBaglamiKur(veri.belgeler, tur)
    const uyarilar: string[] = []

    // Yapay zekâ (maskeli sarmalayıcı). Kapalıysa kart kayıtlardan kurulur.
    let ai: { cikti: AiCiktisi | null; durum: KartIcerik['ai']['durum']; model: string | null; uyari: string | null }
    if (!yuzeyAcik('dilekce')) ai = { cikti: null, durum: 'KAPALI', model: null, uyari: `${KVKK_KAPALI_MESAJI} Kart yalnız kayıtlı ve onaylı alanlardan kuruldu.` }
    else if (!process.env.ANTHROPIC_API_KEY) ai = { cikti: null, durum: 'KAPALI', model: null, uyari: 'Sunucuda yapay zekâ bağlantısı yapılandırılmamış; kart yalnız kayıtlardan kuruldu.' }
    else if (!baglam.secilen.length) ai = { cikti: null, durum: 'YOK', model: null, uyari: 'Okunmuş belge metni yok; yapay zekâ çalıştırılmadı.' }
    else {
      try {
        const oturum = aiOturumu({ yuzey: 'dilekce', ai: { musteriId: o.musteriId, dosyaId }, maske: veri.maske })
        const r = await kartOlgulariniCikar({ oturum, tur, belgeler: baglam.secilen, kayitliOlgular: kayitOlgulari(veri.girdi, tur).olgular.map((x) => ({ metin: x.metin })) })
        const notlar = [
          r.cikti ? null : 'Yapay zekâ geçerli bir olgu listesi döndürmedi; kart kayıtlardan kuruldu.',
          r.kesildi ? 'Yapay zekâ yanıtı uzunluk sınırında kesildi; bazı olgular eksik olabilir.' : null,
          acilamayanUyarisi(r.acilamayanJetonlar),
        ].filter((x): x is string => !!x)
        ai = { cikti: r.cikti, durum: r.cikti ? 'KULLANILDI' : 'HATA', model: KART_MODEL, uyari: notlar.join(' ') || null }
      } catch (e) {
        const mesaj = e instanceof KrediYetersizHata || e instanceof AiDurdurulduHata || aiKapiHatasiMi(e) ? e.message : 'Yapay zekâ olguları alınamadı.'
        if (!(e instanceof KrediYetersizHata || e instanceof AiDurdurulduHata || aiKapiHatasiMi(e))) console.error('[dilekce-v2] kart AI', e instanceof Error ? e.name : 'Bilinmeyen hata')
        ai = { cikti: null, durum: 'HATA', model: KART_MODEL, uyari: `${mesaj} Kart kayıtlardan kuruldu; "Kartı yeniden hazırla" ile tekrar deneyebilirsiniz.` }
      }
    }
    if (ai.uyari) uyarilar.push(ai.uyari)

    const icerik = kartIcerigiKur({
      tur, girdi: veri.girdi, belgeMetinleri: veri.belgeMetinleri, ai,
      baglam: { okunamayan: baglam.okunamayan, kisaltilan: baglam.kisaltilan, aiyaGitmeyen: baglam.aiyaGitmeyen },
      onceki,
    })

    const kart = await prisma.$transaction(async (tx) => {
      const hala = await tx.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId: o.musteriId }, select: { id: true } })
      if (!hala) throw new Error('Dosya erişimi değişti')
      const son = await tx.dosyaKarti.findFirst({ where: { dosyaId, tur }, orderBy: { surum: 'desc' }, select: { surum: true } })
      const k = await tx.dosyaKarti.create({
        data: { dosyaId, davaId: veri.girdi.dava?.id ?? null, tur, surum: (son?.surum ?? 0) + 1, durum: 'TASLAK', icerikJson: json(icerik), uretici: kartUretici(ai.durum === 'KULLANILDI') },
        select: { id: true, surum: true },
      })
      await tx.dosyaKarti.updateMany({ where: { dosyaId, tur, id: { not: k.id }, durum: { not: 'ESKIDI' }, silindiAt: null }, data: { durum: 'ESKIDI' } })
      await tx.aktivite.create({
        data: {
          dosyaId, kullaniciId: o.kullaniciId, eylem: `Dosya kartı hazırlandı: ${KART_TUR_ADI[tur]}, sürüm ${k.surum}`,
          detayJson: { kartId: k.id, surum: k.surum, ai: ai.durum, olgu: icerik.olgular.length, kaynaksiz: icerik.kaynaksizlar.length } as Prisma.InputJsonValue,
        },
      })
      return k
    })
    yenile(dosyaId)
    if (icerik.kaynaksizlar.length) uyarilar.push(`${icerik.kaynaksizlar.length} olgunun alıntısı belgede bulunamadı; bunlar karta giremedi.`)
    return { ok: true, kartId: kart.id, surum: kart.surum, yeniSurum: true, uyarilar }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, error: 'Kart aynı anda başka bir oturumda hazırlandı. Sayfayı yenileyin.' }
    console.error('[dilekce-v2] kart hazırlanamadı', e instanceof Error ? e.name : 'Bilinmeyen hata')
    return { ok: false, error: 'Dosya kartı hazırlanamadı. Önceki kartlar korunuyor; lütfen tekrar deneyin.' }
  }
}

// ───────────────────────── olgu onayı ("Doğru") ─────────────────────────

const onayGirdi = z.object({ kartId: uuid, olguIdleri: z.array(olguId).min(1).max(200), beklenenGuncelleme: zaman })

export async function kartOlguOnayla(input: { kartId: string; olguIdleri: string[]; beklenenGuncelleme: string }): Promise<Basari | Hata> {
  const o = await oturumAl({ avukatGerekli: true })
  if (hataMi(o)) return o
  const p = onayGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Onaylanacak olgu seçimi geçersiz.' }
  const kart = await kartYukle(p.data.kartId, o.musteriId)
  if (!kart) return { ok: false, error: 'Kart bulunamadı veya erişiminiz yok.' }
  if (kart.durum !== 'TASLAK') return { ok: false, error: 'Kilitli kartın olguları zaten onaylı; değişiklik için "Düzelt" kullanın.' }
  const icerik = icerikOku(kart.icerikJson, kart.tur as KartTuru)
  if (!icerik) return { ok: false, error: 'Kart içeriği okunamadı; kartı yeniden hazırlayın.' }
  const r = olgulariOnayla(icerik, p.data.olguIdleri, { kullaniciId: o.kullaniciId, at: new Date().toISOString() })
  if (!r.ok) return r
  return icerikYaz(kart, r.icerik, p.data.beklenenGuncelleme, o, `Dosya kartında olgu onaylandı: ${p.data.olguIdleri.join(', ')}`, { olguIdleri: p.data.olguIdleri })
}

// ───────────────────────── olgu düzeltme ─────────────────────────

const duzeltGirdi = z.object({
  kartId: uuid, olguId, beklenenGuncelleme: zaman,
  metin: z.string().trim().min(3).max(600),
  kaynak: z.object({ belgeId: uuid, sayfa: z.number().int().min(1).max(5000).nullable(), alinti: z.string().trim().min(8).max(300) }).optional(),
})

export async function kartOlguDuzelt(input: {
  kartId: string; olguId: string; metin: string; kaynak?: { belgeId: string; sayfa: number | null; alinti: string }; beklenenGuncelleme: string
}): Promise<Basari | Hata> {
  const o = await oturumAl({ avukatGerekli: false })
  if (hataMi(o)) return o
  const p = duzeltGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Olgu metni 3–600 karakter olmalı; alıntı 8–300 karakter.' }
  const kart = await kartYukle(p.data.kartId, o.musteriId)
  if (!kart) return { ok: false, error: 'Kart bulunamadı veya erişiminiz yok.' }
  const icerik = icerikOku(kart.icerikJson, kart.tur as KartTuru)
  if (!icerik) return { ok: false, error: 'Kart içeriği okunamadı; kartı yeniden hazırlayın.' }
  const metinler = p.data.kaynak ? await belgeMetinleriniYukle(prisma, o.musteriId, kart.dosyaId, [p.data.kaynak.belgeId]) : new Map()
  const r = olguDuzelt(icerik, p.data.olguId, { metin: p.data.metin, kaynak: p.data.kaynak }, metinler, { kullaniciId: o.kullaniciId, at: new Date().toISOString(), avukat: o.avukat })
  if (!r.ok) return r
  return icerikYaz(kart, r.icerik, p.data.beklenenGuncelleme, o, `Dosya kartında olgu düzeltildi: ${p.data.olguId}`, { olguId: p.data.olguId, yeniKaynak: !!p.data.kaynak })
}

// ───────────────────────── avukatın seçimleri ─────────────────────────

const secimGirdi = z.object({
  kartId: uuid, beklenenGuncelleme: zaman,
  secimler: z.object({
    mahkeme: z.string().trim().max(300).nullable(),
    usul: z.enum(['YAZILI', 'BASIT']).nullable(),
    esas: z.string().trim().max(60).nullable(),
    davalilar: z.array(z.string().min(1).max(80)).max(50),
    talepler: z.array(z.enum(TALEP_KODLARI)).max(10),
    arabuluculukGerekmez: z.boolean(),
    arabuluculukGerekce: z.string().trim().max(1000).nullable(),
    not: z.string().trim().max(2000).nullable(),
  }),
})

export async function kartSecimleriKaydet(input: z.input<typeof secimGirdi>): Promise<Basari | Hata> {
  const o = await oturumAl({ avukatGerekli: true })
  if (hataMi(o)) return o
  const p = secimGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Seçimler geçersiz. Alanların uzunluğunu kontrol edin.' }
  const kart = await kartYukle(p.data.kartId, o.musteriId)
  if (!kart) return { ok: false, error: 'Kart bulunamadı veya erişiminiz yok.' }
  const icerik = icerikOku(kart.icerikJson, kart.tur as KartTuru)
  if (!icerik) return { ok: false, error: 'Kart içeriği okunamadı; kartı yeniden hazırlayın.' }
  const r = secimleriUygula(icerik, p.data.secimler, { kullaniciId: o.kullaniciId, at: new Date().toISOString() })
  if (!r.ok) return r
  return icerikYaz(kart, r.icerik, p.data.beklenenGuncelleme, o, 'Dosya kartında avukatın seçimleri kaydedildi', { talepler: p.data.secimler.talepler, davaliSayisi: p.data.secimler.davalilar.length })
}

// ───────────────────────── savunma işareti (cevaba cevap) ─────────────────────────

const savunmaGirdi = z.object({ kartId: uuid, savunmaId: z.string().regex(/^S-\d{1,3}$/), isaret: z.enum(['CEVAPLANACAK', 'ONEMSIZ']), beklenenGuncelleme: zaman })

export async function kartSavunmaIsaretle(input: z.input<typeof savunmaGirdi>): Promise<Basari | Hata> {
  const o = await oturumAl({ avukatGerekli: true })
  if (hataMi(o)) return o
  const p = savunmaGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Savunma işareti geçersiz.' }
  const kart = await kartYukle(p.data.kartId, o.musteriId)
  if (!kart) return { ok: false, error: 'Kart bulunamadı veya erişiminiz yok.' }
  const icerik = icerikOku(kart.icerikJson, kart.tur as KartTuru)
  if (!icerik) return { ok: false, error: 'Kart içeriği okunamadı; kartı yeniden hazırlayın.' }
  const satirlar = savunmaIsaretle(icerik.savunmalar, p.data.savunmaId, p.data.isaret, o.kullaniciId, new Date().toISOString())
  if (!satirlar) return { ok: false, error: 'Savunma kartta bulunamadı.' }
  return icerikYaz(kart, { ...icerik, savunmalar: satirlar }, p.data.beklenenGuncelleme, o, `Savunma işaretlendi: ${p.data.savunmaId}`, { savunmaId: p.data.savunmaId, isaret: p.data.isaret })
}

// ───────────────────────── kilitle ("Kart doğru") ─────────────────────────

const kilitGirdi = z.object({ kartId: uuid, beklenenGuncelleme: zaman })

/** Yalnız avukat; kritik olgular onaylı, kritik kümeler dolu ve seçimler tamam değilse kilitlenmez. */
export async function kartiKilitle(input: { kartId: string; beklenenGuncelleme: string }): Promise<Basari | Hata> {
  const o = await oturumAl({ avukatGerekli: true })
  if (hataMi(o)) return o
  const p = kilitGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Kart seçimi geçersiz.' }
  const kart = await kartYukle(p.data.kartId, o.musteriId)
  if (!kart) return { ok: false, error: 'Kart bulunamadı veya erişiminiz yok.' }
  if (kart.durum !== 'TASLAK') return { ok: false, error: kart.durum === 'ONAYLI' ? 'Kart zaten kilitli.' : 'Bu kart sürümü eskidi; güncel sürümü açın.' }
  const icerik = icerikOku(kart.icerikJson, kart.tur as KartTuru)
  if (!icerik) return { ok: false, error: 'Kart içeriği okunamadı; kartı yeniden hazırlayın.' }
  const k = kilitKontrolu(icerik)
  if (!k.kilitlenebilir) return { ok: false, error: `Kart kilitlenemez: ${k.nedenler.join(' ')}` }
  try {
    const ok = await prisma.$transaction(async (tx) => {
      const r = await tx.dosyaKarti.updateMany({
        where: { id: kart.id, durum: 'TASLAK', silindiAt: null, updatedAt: new Date(p.data.beklenenGuncelleme), dosya: { musteriId: o.musteriId } },
        data: { durum: 'ONAYLI', onaylayanId: o.kullaniciId, onayAt: new Date() },
      })
      if (r.count !== 1) return false
      await tx.aktivite.create({
        data: { dosyaId: kart.dosyaId, kullaniciId: o.kullaniciId, eylem: `Dosya kartı kilitlendi: ${KART_TUR_ADI[kart.tur as KartTuru] ?? kart.tur}, sürüm ${kart.surum}`, detayJson: { kartId: kart.id, surum: kart.surum } },
      })
      return true
    })
    if (!ok) return { ok: false, error: CAKISMA }
    yenile(kart.dosyaId)
    return { ok: true, kartId: kart.id, surum: kart.surum, yeniSurum: false, uyarilar: [] }
  } catch {
    return { ok: false, error: 'Kart kilitlenemedi. Lütfen tekrar deneyin.' }
  }
}
