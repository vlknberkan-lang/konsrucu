'use server'
/**
 * KonsLaw — Superadmin işlemleri · app/(app)/yonetim/actions.ts
 * Plan değiştir + kredi ekle. Her mutasyon superadmin kapısından geçer ve Aktivite'ye loglanır.
 * (Havale ile satışta "elle plan açma" buradan yapılır — iyzico gelene dek satış kanalı.)
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { superadminMi } from '@/lib/konsrucu/yonetici'

const PLANLAR = ['FREE', 'BASLANGIC', 'BURO', 'KURUMSAL'] as const
/** Plan değişince yüklenecek aylık kredi (KURUMSAL fiilen sınırsız). */
const PLAN_KREDI: Record<(typeof PLANLAR)[number], number> = {
  FREE: 25,
  BASLANGIC: 150,
  BURO: 500,
  KURUMSAL: 999999,
}

async function yetkiliKullanici() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Oturum yok')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, select: { id: true, eposta: true, ad: true } })
  if (!dbUser || !superadminMi(dbUser.eposta)) throw new Error('Yetkisiz')
  return dbUser
}

export async function planDegistir(girdi: { musteriId: string; plan: string }): Promise<{ ok: boolean; hata?: string }> {
  try {
    const yetkili = await yetkiliKullanici()
    const p = z.object({ musteriId: z.string().uuid(), plan: z.enum(PLANLAR) }).parse(girdi)
    const eski = await prisma.musteri.findUnique({ where: { id: p.musteriId }, select: { ad: true, plan: true } })
    if (!eski) return { ok: false, hata: 'Müşteri bulunamadı' }
    await prisma.$transaction([
      prisma.musteri.update({
        where: { id: p.musteriId },
        data: { plan: p.plan, aiKredi: PLAN_KREDI[p.plan] }, // plan geçişinde dönem kredisi yüklenir
      }),
      prisma.aktivite.create({
        data: {
          kullaniciId: yetkili.id,
          eylem: `[YÖNETİM] Plan değişti: ${eski.ad} · ${eski.plan} → ${p.plan} (+${PLAN_KREDI[p.plan]} kredi)`,
        },
      }),
    ])
    revalidatePath('/yonetim')
    return { ok: true }
  } catch (e) {
    return { ok: false, hata: (e as Error).message }
  }
}

export async function krediEkle(girdi: { musteriId: string; adet: number }): Promise<{ ok: boolean; hata?: string }> {
  try {
    const yetkili = await yetkiliKullanici()
    const p = z.object({ musteriId: z.string().uuid(), adet: z.number().int().min(-1000).max(10000) }).parse(girdi)
    if (p.adet === 0) return { ok: true }
    const m = await prisma.musteri.findUnique({ where: { id: p.musteriId }, select: { ad: true } })
    if (!m) return { ok: false, hata: 'Müşteri bulunamadı' }
    await prisma.$transaction([
      prisma.musteri.update({ where: { id: p.musteriId }, data: { aiKredi: { increment: p.adet } } }),
      prisma.aktivite.create({
        data: { kullaniciId: yetkili.id, eylem: `[YÖNETİM] Kredi ${p.adet > 0 ? '+' : ''}${p.adet}: ${m.ad}` },
      }),
    ])
    revalidatePath('/yonetim')
    return { ok: true }
  } catch (e) {
    return { ok: false, hata: (e as Error).message }
  }
}

export async function demoDurumGuncelle(girdi: { id: string; durum: string }): Promise<{ ok: boolean; hata?: string }> {
  try {
    await yetkiliKullanici()
    const p = z.object({ id: z.string().uuid(), durum: z.enum(['YENI', 'ARANDI', 'DEMO_YAPILDI', 'KAZANILDI', 'KAYBEDILDI']) }).parse(girdi)
    await prisma.demoKaydi.update({ where: { id: p.id }, data: { durum: p.durum } })
    revalidatePath('/yonetim')
    return { ok: true }
  } catch (e) {
    return { ok: false, hata: (e as Error).message }
  }
}
