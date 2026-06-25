'use server'

/**
 * KonsRücü — Önemli Olaylar · server action'lar · app/(app)/onemli-olaylar/actions.ts
 *
 * Borca itiraz → arabuluculuk iş akışının durum makinesi:
 *   ACIK → (üstlen) ISLEMDE → (tamamla = resmî teyit) TAMAMLANDI   | (mükerrer) IPTAL
 * Manuel üstlenme (kilitle): bir kişi üstlenince diğeri üstlenemez → çift iş engeli.
 * Tamamlanınca dosya ARABULUCULUK aşamasına geçer + Asama(ARABULUCULUK) oluşturulur/garantilenir.
 * Hepsi: tenant guard + zod + Aktivite log + revalidatePath.
 */
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DosyaDurum, AsamaTur, Prisma } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

export type OlaySonuc = { ok: boolean; error?: string }

/** Giriş yapan kullanıcı + erişebildiği müşteri id'leri. */
async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  return { dbUser, izinli: dbUser.musteriler.map((m) => m.musteriId) }
}

/** Olayı tenant-kapsamıyla yükle (yetki + dosya bağlamı). */
async function olayYukle(olayId: string, izinli: string[]) {
  const olay = await prisma.onemliOlay.findUnique({
    where: { id: olayId },
    select: { id: true, durum: true, dosyaId: true, sorumluId: true, dosya: { select: { musteriId: true } } },
  })
  if (!olay || !izinli.includes(olay.dosya.musteriId)) return null
  return olay
}

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}/)

/** Olayı üstlen (kilitle): ACIK→ISLEMDE, sorumlu = ben. Başkası kilitlediyse hata. */
export async function onemliOlayUstlen(olayId: string): Promise<OlaySonuc> {
  if (!z.string().uuid().safeParse(olayId).success) return { ok: false, error: 'Geçersiz olay kimliği' }
  const { dbUser, izinli } = await ctx()
  const olay = await olayYukle(olayId, izinli)
  if (!olay) return { ok: false, error: 'Olay bulunamadı veya yetkiniz yok' }
  if (olay.durum === 'TAMAMLANDI' || olay.durum === 'IPTAL') return { ok: false, error: 'Olay kapanmış' }
  if (olay.sorumluId && olay.sorumluId !== dbUser.id) return { ok: false, error: 'Bu olayı başka bir kullanıcı üstlendi' }
  if (olay.sorumluId === dbUser.id && olay.durum === 'ISLEMDE') return { ok: true } // zaten benim

  try {
    await prisma.$transaction([
      prisma.onemliOlay.update({ where: { id: olayId }, data: { sorumluId: dbUser.id, durum: 'ISLEMDE', ustlenildiAt: new Date() } }),
      prisma.aktivite.create({ data: { dosyaId: olay.dosyaId, kullaniciId: dbUser.id, eylem: `Önemli olay üstlenildi: ${dbUser.ad}` } }),
    ])
  } catch (e) {
    return { ok: false, error: `Üstlenilemedi: ${(e as Error).message}` }
  }
  revalidatePath('/onemli-olaylar')
  revalidatePath(`/akilli-giris/${olay.dosyaId}`)
  return { ok: true }
}

/** Son tarihi elle gir/temizle (otomatik kural yok). */
export async function onemliOlaySonTarihGuncelle(olayId: string, sonTarih: string | null): Promise<OlaySonuc> {
  if (!z.string().uuid().safeParse(olayId).success) return { ok: false, error: 'Geçersiz olay kimliği' }
  const tarih = sonTarih && iso.safeParse(sonTarih).success ? new Date(sonTarih) : null
  if (sonTarih && !tarih) return { ok: false, error: 'Geçersiz tarih' }
  const { dbUser, izinli } = await ctx()
  const olay = await olayYukle(olayId, izinli)
  if (!olay) return { ok: false, error: 'Olay bulunamadı veya yetkiniz yok' }

  await prisma.onemliOlay.update({ where: { id: olayId }, data: { sonTarih: tarih } })
  await prisma.aktivite.create({ data: { dosyaId: olay.dosyaId, kullaniciId: dbUser.id, eylem: tarih ? `Önemli olay son tarihi: ${sonTarih}` : 'Önemli olay son tarihi temizlendi' } })
  revalidatePath('/onemli-olaylar')
  revalidatePath(`/akilli-giris/${olay.dosyaId}`)
  return { ok: true }
}

const TamamlaGirdi = z.object({
  olayId: z.string().uuid({ message: 'Geçersiz olay kimliği' }),
  basvuruNo: z.string().trim().max(100).optional(),
  basvuruTarihi: z.string().trim().optional(),
  arabulucu: z.string().trim().max(200).optional(),
  not: z.string().trim().max(2000).optional(),
})

/**
 * Arabuluculuğu tamamla (resmî sistem teyidi): olay → TAMAMLANDI; dosya → ARABULUCULUK;
 * Asama(ARABULUCULUK) oluştur/garantile (kimlikNo=başvuru no). Tamamlanan Olaylar'a geçer.
 */
export async function onemliOlayTamamla(girdi: z.input<typeof TamamlaGirdi>): Promise<OlaySonuc> {
  const parsed = TamamlaGirdi.safeParse(girdi)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Geçersiz girdi' }
  const { olayId, basvuruNo, basvuruTarihi, arabulucu, not } = parsed.data
  const basTarih = basvuruTarihi && iso.safeParse(basvuruTarihi).success ? new Date(basvuruTarihi) : null

  const { dbUser, izinli } = await ctx()
  const olay = await olayYukle(olayId, izinli)
  if (!olay) return { ok: false, error: 'Olay bulunamadı veya yetkiniz yok' }
  if (olay.durum === 'TAMAMLANDI') return { ok: false, error: 'Olay zaten tamamlandı' }
  if (olay.durum === 'IPTAL') return { ok: false, error: 'İptal edilmiş olay tamamlanamaz' }

  // Asama(ARABULUCULUK) oluştur/garantile (asamaKaydet mantığıyla aynı dili konuşur).
  const mevcutAsama = await prisma.asama.findFirst({ where: { dosyaId: olay.dosyaId, tur: AsamaTur.ARABULUCULUK }, select: { id: true } })
  const asamaDetay = arabulucu ? ({ arabulucu } as Prisma.InputJsonValue) : undefined
  // asamaOp HER İKİ dalda da PrismaPromise olmalı (await edersek transaction DIŞINDA çalışır). sıra için aggregate önce yapılır.
  let asamaOp: Prisma.PrismaPromise<unknown>
  if (mevcutAsama) {
    asamaOp = prisma.asama.update({ where: { id: mevcutAsama.id }, data: { kimlikNo: basvuruNo || undefined, baslangic: basTarih ?? undefined, detayJson: asamaDetay } })
  } else {
    const max = await prisma.asama.aggregate({ where: { dosyaId: olay.dosyaId }, _max: { sira: true } })
    asamaOp = prisma.asama.create({ data: { dosyaId: olay.dosyaId, tur: AsamaTur.ARABULUCULUK, kimlikNo: basvuruNo || null, baslangic: basTarih, detayJson: asamaDetay, sira: (max._max.sira ?? 0) + 1 } })
  }

  try {
    await prisma.$transaction([
      prisma.onemliOlay.update({
        where: { id: olayId },
        data: {
          durum: 'TAMAMLANDI',
          basvuruNo: basvuruNo || null,
          basvuruTarihi: basTarih,
          arabulucu: arabulucu || null,
          not: not || null,
          tamamlayanId: dbUser.id,
          tamamlanmaAt: new Date(),
        },
      }),
      asamaOp,
      prisma.rucuDosyasi.update({ where: { id: olay.dosyaId }, data: { durum: DosyaDurum.ARABULUCULUK } }),
      prisma.aktivite.create({
        data: { dosyaId: olay.dosyaId, kullaniciId: dbUser.id, eylem: `Arabuluculuk başlatıldı (program teyidi)${basvuruNo ? ' · başvuru ' + basvuruNo : ''} · ${dbUser.ad}` },
      }),
    ])
  } catch (e) {
    return { ok: false, error: `Tamamlanamadı: ${(e as Error).message}` }
  }
  revalidatePath('/onemli-olaylar')
  revalidatePath('/tamamlanan-olaylar')
  revalidatePath(`/akilli-giris/${olay.dosyaId}`)
  return { ok: true }
}

/** Mükerrer/yanlış olayı iptal et (kuyruktan kaldırır, Tamamlanan'da iptal olarak görünür). */
export async function onemliOlayIptal(olayId: string, sebep?: string): Promise<OlaySonuc> {
  if (!z.string().uuid().safeParse(olayId).success) return { ok: false, error: 'Geçersiz olay kimliği' }
  const { dbUser, izinli } = await ctx()
  const olay = await olayYukle(olayId, izinli)
  if (!olay) return { ok: false, error: 'Olay bulunamadı veya yetkiniz yok' }
  if (olay.durum === 'TAMAMLANDI') return { ok: false, error: 'Tamamlanmış olay iptal edilemez' }

  await prisma.$transaction([
    prisma.onemliOlay.update({ where: { id: olayId }, data: { durum: 'IPTAL', not: (sebep ?? '').trim().slice(0, 2000) || null } }),
    prisma.aktivite.create({ data: { dosyaId: olay.dosyaId, kullaniciId: dbUser.id, eylem: `Önemli olay iptal edildi${sebep ? ' · ' + sebep.trim().slice(0, 120) : ''}` } }),
  ])
  revalidatePath('/onemli-olaylar')
  revalidatePath('/tamamlanan-olaylar')
  revalidatePath(`/akilli-giris/${olay.dosyaId}`)
  return { ok: true }
}
