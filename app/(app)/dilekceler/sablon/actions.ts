'use server'

/**
 * KonsRücü — İskelet ve üslup kartı eylemleri (dilekçe v2, aşama 2 yapılandırması) · app/(app)/dilekceler/sablon/actions.ts
 *
 * S36 (06 §7.1): iskelet (`DilekceSablon`) ve üslup kartı (`UslupKurali`) müvekkil (tenant) bazındadır ve avukat
 * onaylıdır. Bu turun basit akışı: yalnız avukat kaydeder ve kayıt kaydedilir kaydedilmez onaylanmış sayılır
 * (`onayAt`/`onaylayanId` doldurulur) — ayrı bir "öneri → onay" kuyruğu bu turda yok (S40'a bırakılır).
 * Kayıt silinmez; "Pasife al" ile devre dışı bırakılır (iskelet.ts / uslup.ts yalnız aktif+onaylı olanı kullanır).
 */
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { sablonKaynagiYaz } from '@/lib/konsrucu/dilekce-v2/iskelet'
import { sablonAyristir, SablonHatasi } from '@/lib/konsrucu/dilekce-v2/sablon-dil'
import { KART_TURLERI } from '@/lib/konsrucu/dilekce-v2/tipler'

type Hata = { ok: false; error: string }
const uuid = z.string().uuid()
const jsonVeri = (v: unknown) => v as Prisma.InputJsonValue

async function oturumAl() {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || !avukatRoluMu(dbUser.rol)) return { ok: false as const, error: 'İskelet ve üslup kartında yalnız avukat değişiklik yapabilir.' }
  if (!aktifMusteriId) return { ok: false as const, error: 'Aktif müşteri bulunamadı.' }
  if (!dilekceV2Acik(dbUser.rol)) return { ok: false as const, error: 'Dilekçe v2 bu hesap için henüz açık değil.' }
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
  if (!musteri) return { ok: false as const, error: 'Bu müşteri pasif olduğu için değişiklik yapılamaz.' }
  return { ok: true as const, kullaniciId: dbUser.id, musteriId: aktifMusteriId }
}

const yenile = () => revalidatePath('/ayarlar/dilekce-sablon')

// ───────────────────────── iskelet (DilekceSablon) ─────────────────────────

const sablonGirdi = z.object({
  kod: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9-]*$/, 'Kod yalnız küçük harf, rakam ve tire içerebilir.'),
  tur: z.enum(KART_TURLERI),
  rucuSebebiKod: z.string().trim().max(60).optional(),
  mahkemeTuru: z.string().trim().max(60).optional(),
  usul: z.string().trim().max(20).optional(),
  davaliTur: z.string().trim().max(60).optional(),
  kaynakMetni: z.string().trim().min(20).max(20_000),
})

/** Bu müvekkilin bu kod'undaki yeni iskelet sürümünü kaydeder ve hemen onaylar (aktif + onaylı). */
export async function sablonKaydetVeOnayla(input: z.input<typeof sablonGirdi>): Promise<{ ok: true; id: string } | Hata> {
  const o = await oturumAl()
  if (!o.ok) return o
  const p = sablonGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Alanlar geçersiz.' }
  try {
    sablonAyristir(p.data.kaynakMetni)
  } catch (e) {
    return { ok: false, error: e instanceof SablonHatasi ? `Şablon dili hatası: ${e.message}` : 'Şablon metni ayrıştırılamadı.' }
  }
  const varyantJson: Record<string, string> = {}
  if (p.data.rucuSebebiKod) varyantJson.rucuSebebiKod = p.data.rucuSebebiKod
  if (p.data.mahkemeTuru) varyantJson.mahkemeTuru = p.data.mahkemeTuru
  if (p.data.usul) varyantJson.usul = p.data.usul
  if (p.data.davaliTur) varyantJson.davaliTur = p.data.davaliTur
  try {
    const son = await prisma.dilekceSablon.findFirst({ where: { musteriId: o.musteriId, kod: p.data.kod }, orderBy: { surum: 'desc' }, select: { surum: true } })
    const surum = (son?.surum ?? 0) + 1
    const kayit = await prisma.dilekceSablon.create({
      data: {
        musteriId: o.musteriId, kod: p.data.kod, tur: p.data.tur, surum, varyantJson: jsonVeri(varyantJson),
        bloklarJson: jsonVeri(sablonKaynagiYaz(p.data.kaynakMetni)), aktif: true, onaylayanId: o.kullaniciId, onayAt: new Date(),
      },
      select: { id: true },
    })
    await prisma.aktivite.create({ data: { dosyaId: null, kullaniciId: o.kullaniciId, eylem: `Dilekçe iskeleti kaydedildi ve onaylandı: ${p.data.kod} sürüm ${surum} (${p.data.tur})` } })
    yenile()
    return { ok: true, id: kayit.id }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, error: 'Bu kod ve sürüm zaten kayıtlı; sayfayı yenileyip tekrar deneyin.' }
    return { ok: false, error: 'İskelet kaydedilemedi. Lütfen tekrar deneyin.' }
  }
}

export async function sablonPasifeAl(input: { id: string }): Promise<{ ok: true } | Hata> {
  const o = await oturumAl()
  if (!o.ok) return o
  const id = uuid.safeParse(input.id)
  if (!id.success) return { ok: false, error: 'Geçersiz kayıt.' }
  const r = await prisma.dilekceSablon.updateMany({ where: { id: id.data, musteriId: o.musteriId }, data: { aktif: false } })
  if (!r.count) return { ok: false, error: 'Kayıt bulunamadı.' }
  await prisma.aktivite.create({ data: { dosyaId: null, kullaniciId: o.kullaniciId, eylem: 'Dilekçe iskeleti pasife alındı', detayJson: { sablonId: id.data } } })
  yenile()
  return { ok: true }
}

// ───────────────────────── üslup kartı (UslupKurali) ─────────────────────────

const KAPSAM = ['HEPSI', 'DAVA', 'DELIL', 'CEVABA_CEVAP', 'BEYAN'] as const

const uslupGirdi = z.object({
  kapsam: z.enum(KAPSAM),
  metin: z.string().trim().min(5).max(2000),
  ornek: z.string().trim().max(4000).optional(),
})

export async function uslupKaydetVeOnayla(input: z.input<typeof uslupGirdi>): Promise<{ ok: true; id: string } | Hata> {
  const o = await oturumAl()
  if (!o.ok) return o
  const p = uslupGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Alanlar geçersiz.' }
  const kayit = await prisma.uslupKurali.create({
    data: {
      musteriId: o.musteriId, kapsam: p.data.kapsam, metin: p.data.metin, ornek: p.data.ornek || null,
      kaynak: 'ELLE', durum: 'ONAYLI', surum: 1, onaylayanId: o.kullaniciId, onayAt: new Date(),
    },
    select: { id: true },
  })
  await prisma.aktivite.create({ data: { dosyaId: null, kullaniciId: o.kullaniciId, eylem: `Üslup kuralı eklendi ve onaylandı (${p.data.kapsam})` } })
  yenile()
  return { ok: true, id: kayit.id }
}

export async function uslupPasifeAl(input: { id: string }): Promise<{ ok: true } | Hata> {
  const o = await oturumAl()
  if (!o.ok) return o
  const id = uuid.safeParse(input.id)
  if (!id.success) return { ok: false, error: 'Geçersiz kayıt.' }
  const r = await prisma.uslupKurali.updateMany({ where: { id: id.data, musteriId: o.musteriId }, data: { durum: 'PASIF' } })
  if (!r.count) return { ok: false, error: 'Kayıt bulunamadı.' }
  await prisma.aktivite.create({ data: { dosyaId: null, kullaniciId: o.kullaniciId, eylem: 'Üslup kuralı pasife alındı', detayJson: { uslupKuraliId: id.data } } })
  yenile()
  return { ok: true }
}
