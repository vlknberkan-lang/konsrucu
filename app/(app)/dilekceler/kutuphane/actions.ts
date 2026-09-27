'use server'

/**
 * KonsRücü — Atıf kütüphanesi eylemleri (K1) · app/(app)/dilekceler/kutuphane/actions.ts
 *
 * S33 (06 §7.1, §7.2-5, §6.4): doğrulama kaydı (kim, ne zaman, resmî bağlantı), "Zurich'e kopyala" (müvekkil
 * bazında; kopya teyit gerekli başlar), bilgi bankasından yükleme: önce kuru önizleme, sonra yalnız yönetici ve
 * yalnız aynı planla gerçek yükleme; yanlış yükleme yükleme kimliğiyle toplu pasif. Kayıt silinmez.
 */
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { MEVZUAT_DURUMLARI } from '@/lib/konsrucu/mevzuat/sabitler'
import { kopyaVerisi, mevzuatYukle, PlanDegistiHata, yuklemeyiPasifeAl, type MevzuatDb, type YuklemePlani } from '@/lib/konsrucu/mevzuat/yukle'

type Hata = { ok: false; error: string }
const uuid = z.string().uuid()

async function oturumAl(o: { yonetici?: boolean } = {}) {
  const { dbUser, aktifMusteriId, izinli } = await ctx()
  if (!dbUser.aktif || !avukatRoluMu(dbUser.rol)) return { ok: false as const, error: 'Atıf kütüphanesinde yalnız avukat değişiklik yapabilir.' }
  if (o.yonetici && dbUser.rol !== 'ADMIN') return { ok: false as const, error: 'Bu işlemi yalnız yönetici yapabilir.' }
  if (!aktifMusteriId) return { ok: false as const, error: 'Aktif müşteri bulunamadı.' }
  if (!dilekceV2Acik(dbUser.rol)) return { ok: false as const, error: 'Dilekçe v2 bu hesap için henüz açık değil.' }
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true, ad: true } })
  if (!musteri) return { ok: false as const, error: 'Bu müşteri pasif olduğu için kütüphane değiştirilemez.' }
  return { ok: true as const, kullaniciId: dbUser.id, musteriId: aktifMusteriId, musteriAdi: musteri.ad, izinli }
}

const yenile = () => revalidatePath('/dilekceler/kutuphane')

// ───────────────────────── doğrulama kaydı ─────────────────────────

const durumGirdi = z.object({
  kaynakId: uuid,
  durum: z.enum(MEVZUAT_DURUMLARI),
  gerekce: z.string().trim().max(1000).optional(),
  beklenenGuncelleme: z.string().min(10).max(40),
})

/** Avukat kaydı DOĞRULANDI / TEYİT GEREKLİ / KULLANMA olarak işaretler; kim, ne zaman ve hangi resmî bağlantıyla kayda geçer. */
export async function mevzuatDurumKaydet(input: z.input<typeof durumGirdi>): Promise<{ ok: true } | Hata> {
  const o = await oturumAl()
  if (!o.ok) return o
  const p = durumGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Durum seçimi geçersiz.' }
  const kayit = await prisma.mevzuatKaynak.findFirst({ where: { id: p.data.kaynakId, musteriId: o.musteriId }, select: { id: true, kunye: true, durum: true, resmiUrl: true, aktif: true } })
  if (!kayit) return { ok: false, error: 'Kayıt bu müşterinin kütüphanesinde yok.' }
  if (!kayit.aktif) return { ok: false, error: 'Pasife alınmış kayıt işaretlenemez.' }
  if (p.data.durum === 'DOGRULANDI' && !kayit.resmiUrl) return { ok: false, error: 'Resmî bağlantısı olmayan kayıt doğrulanamaz.' }
  if (p.data.durum === 'KULLANMA' && !p.data.gerekce) return { ok: false, error: '"Kullanma" için kısa bir gerekçe yazın.' }
  try {
    const ok = await prisma.$transaction(async (tx) => {
      const r = await tx.mevzuatKaynak.updateMany({
        where: { id: kayit.id, musteriId: o.musteriId, aktif: true, updatedAt: new Date(p.data.beklenenGuncelleme) },
        data: { durum: p.data.durum, dogrulayanId: o.kullaniciId, dogrulamaAt: new Date() },
      })
      if (r.count !== 1) return false
      await tx.aktivite.create({
        data: {
          dosyaId: null, kullaniciId: o.kullaniciId, eylem: `Atıf kütüphanesi: ${kayit.kunye} → ${p.data.durum}`,
          detayJson: { mevzuatKaynakId: kayit.id, musteriId: o.musteriId, onceki: kayit.durum, yeni: p.data.durum, resmiUrl: kayit.resmiUrl, gerekce: p.data.gerekce ?? null },
        },
      })
      return true
    })
    if (!ok) return { ok: false, error: 'Kayıt başka bir oturumda değişti. Sayfayı yenileyin.' }
    yenile()
    return { ok: true }
  } catch {
    return { ok: false, error: 'Durum kaydedilemedi. Lütfen tekrar deneyin.' }
  }
}

// ───────────────────────── başka müvekkile kopyala ─────────────────────────

const kopyaGirdi = z.object({ kaynakId: uuid, hedefMusteriId: uuid })

export async function mevzuatKopyala(input: z.input<typeof kopyaGirdi>): Promise<{ ok: true; hedefAdi: string } | Hata> {
  const o = await oturumAl()
  if (!o.ok) return o
  const p = kopyaGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Kopyalama seçimi geçersiz.' }
  if (p.data.hedefMusteriId === o.musteriId) return { ok: false, error: 'Hedef müşteri aktif müşteriyle aynı.' }
  if (!o.izinli.includes(p.data.hedefMusteriId)) return { ok: false, error: 'Hedef müşteriye erişiminiz yok.' }
  const [kaynak, hedef] = await Promise.all([
    prisma.mevzuatKaynak.findFirst({ where: { id: p.data.kaynakId, musteriId: o.musteriId } }),
    prisma.musteri.findFirst({ where: { id: p.data.hedefMusteriId, aktif: true }, select: { id: true, ad: true } }),
  ])
  if (!kaynak) return { ok: false, error: 'Kayıt bu müşterinin kütüphanesinde yok.' }
  if (!hedef) return { ok: false, error: 'Hedef müşteri bulunamadı ya da pasif.' }
  try {
    await prisma.$transaction(async (tx) => {
      const y = await tx.mevzuatKaynak.create({ data: kopyaVerisi(kaynak, hedef.id) as Prisma.MevzuatKaynakUncheckedCreateInput, select: { id: true } })
      await tx.aktivite.create({
        data: { dosyaId: null, kullaniciId: o.kullaniciId, eylem: `Atıf kütüphanesi: ${kaynak.kunye} → ${hedef.ad} kütüphanesine kopyalandı (teyit gerekli)`, detayJson: { kaynakId: kaynak.id, kopyaId: y.id, hedefMusteriId: hedef.id } },
      })
    })
    yenile()
    return { ok: true, hedefAdi: hedef.ad }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, error: `${hedef.ad} kütüphanesinde bu künye zaten var.` }
    return { ok: false, error: 'Kayıt kopyalanamadı. Lütfen tekrar deneyin.' }
  }
}

// ───────────────────────── bilgi bankasından yükleme (M8) ─────────────────────────

/** Kuru çalıştırma: eklenecek, değişecek, aynı kalacak kayıtlar. Hiçbir şey yazmaz. */
export async function mevzuatKuruOnizle(): Promise<{ ok: true; plan: YuklemePlani } | Hata> {
  const o = await oturumAl()
  if (!o.ok) return o
  const r = await mevzuatYukle(prisma as unknown as MevzuatDb, { musteriId: o.musteriId, kuru: true })
  return { ok: true, plan: r.plan }
}

const yukleGirdi = z.object({ planOzeti: z.string().regex(/^[0-9a-f]{16}$/) })

/** Gerçek yükleme: yalnız yönetici, yalnız onaylanan kuru planla (plan değiştiyse durur), tek işlem. */
export async function mevzuatYukleUygula(input: { planOzeti: string }): Promise<{ ok: true; yuklemeId: string; yazilan: number } | Hata> {
  const o = await oturumAl({ yonetici: true })
  if (!o.ok) return o
  const p = yukleGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Önce kuru önizlemeyi çalıştırın.' }
  const yuklemeId = `S33-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`
  try {
    const r = await prisma.$transaction(async (tx) => {
      const s = await mevzuatYukle(tx as unknown as MevzuatDb, { musteriId: o.musteriId, kuru: false, yuklemeId, beklenenPlanOzeti: p.data.planOzeti })
      await tx.aktivite.create({
        data: { dosyaId: null, kullaniciId: o.kullaniciId, eylem: `Atıf kütüphanesi bilgi bankasından yüklendi (${s.yazilan} kayıt)`, detayJson: { yuklemeId, musteriId: o.musteriId, eklenen: s.plan.eklenecek, degisen: s.plan.degisecek } },
      })
      return s
    }, { timeout: 20_000 })
    yenile()
    return { ok: true, yuklemeId, yazilan: r.yazilan }
  } catch (e) {
    if (e instanceof PlanDegistiHata) return { ok: false, error: e.message }
    return { ok: false, error: 'Yükleme yapılamadı; hiçbir kayıt yazılmadı.' }
  }
}

const pasifGirdi = z.object({ yuklemeId: z.string().trim().min(3).max(60), kuru: z.boolean() })

/** Yanlış yüklemeyi yükleme kimliğiyle toplu pasife alır (aktif=false, KULLANMA). Kuru kipte yalnız listeler. */
export async function mevzuatYuklemePasif(input: z.input<typeof pasifGirdi>): Promise<{ ok: true; etkilenecek: string[]; yazilan: number } | Hata> {
  const o = await oturumAl({ yonetici: true })
  if (!o.ok) return o
  const p = pasifGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Yükleme kimliği geçersiz.' }
  try {
    const r = await prisma.$transaction(async (tx) => {
      const s = await yuklemeyiPasifeAl(tx as unknown as MevzuatDb, { musteriId: o.musteriId, yuklemeId: p.data.yuklemeId, kuru: p.data.kuru })
      if (!p.data.kuru && s.yazilan) {
        await tx.aktivite.create({ data: { dosyaId: null, kullaniciId: o.kullaniciId, eylem: `Atıf kütüphanesi: ${p.data.yuklemeId} yüklemesi pasife alındı (${s.yazilan} kayıt)`, detayJson: { yuklemeId: p.data.yuklemeId, kunyeler: s.etkilenecek } } })
      }
      return s
    })
    if (!p.data.kuru) yenile()
    return { ok: true, ...r }
  } catch {
    return { ok: false, error: 'Pasife alma yapılamadı; hiçbir kayıt değişmedi.' }
  }
}
