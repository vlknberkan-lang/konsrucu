'use server'

/**
 * KonsRücü — Atanan Dosyalar · server action(lar)
 * app/(app)/atanan-dosyalar/actions.ts
 *
 * Hugo'dan "çekildi/çekilmedi" takibi. Çekildi işaretlenince durum köprüsü:
 * HAVUZDA → INCELENIYOR (CLAUDE.md akışı). Geri alınınca INCELENIYOR → HAVUZDA.
 * Tenant guard zorunlu; girdi zod ile doğrulanır; sonunda revalidatePath.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DosyaDurum } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export type CekildiSonuc = { ok: boolean; error?: string; cekildi?: boolean }

const Girdi = z.object({
  dosyaId: z.string().uuid({ message: 'Geçersiz dosya kimliği' }),
  hedef: z.boolean(),
})

/** Giriş yapan kullanıcı + erişebildiği müşteri id'leri. */
async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({
    where: { id: user.id },
    include: { musteriler: true },
  })
  if (!dbUser) redirect('/login')
  return { dbUser, izinli: dbUser.musteriler.map((m) => m.musteriId) }
}

/** Bir dosyanın Hugo'dan çekildi bayrağını değiştirir (idempotent, tenant-kapsamlı). */
export async function cekildiDegistir(girdi: { dosyaId: string; hedef: boolean }): Promise<CekildiSonuc> {
  const parsed = Girdi.safeParse(girdi)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Geçersiz girdi' }
  const { dosyaId, hedef } = parsed.data

  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: { musteriId: true, durum: true, hugodanCekildi: true },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) {
    return { ok: false, error: 'Dosya bulunamadı veya bu dosyada yetkiniz yok' }
  }
  if (dosya.hugodanCekildi === hedef) return { ok: true, cekildi: hedef } // zaten o durumda

  // Durum köprüsü — yalnızca güvenli geçişler
  let durum = dosya.durum
  if (hedef && dosya.durum === DosyaDurum.HAVUZDA) durum = DosyaDurum.INCELENIYOR
  if (!hedef && dosya.durum === DosyaDurum.INCELENIYOR) durum = DosyaDurum.HAVUZDA
  const durumDegisti = durum !== dosya.durum

  try {
    await prisma.$transaction([
      prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { hugodanCekildi: hedef, durum } }),
      prisma.aktivite.create({
        data: {
          dosyaId,
          kullaniciId: dbUser.id,
          eylem: hedef
            ? `Hugo'dan çekildi olarak işaretlendi${durumDegisti ? ' → İnceleniyor' : ''}`
            : `Hugo çekme geri alındı${durumDegisti ? ' → Havuzda' : ''}`,
        },
      }),
    ])
  } catch (e) {
    return { ok: false, error: `Kaydedilemedi: ${(e as Error).message}` }
  }

  revalidatePath('/atanan-dosyalar')
  return { ok: true, cekildi: hedef }
}
