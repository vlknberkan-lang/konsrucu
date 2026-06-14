'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma, BelgeKategori, DosyaDurum } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

type DosyaPayload = {
  hasarNo?: string
  alanlar: { plaka: string[]; tc: string[]; tarih: string[]; tutar: string[]; iban: string[] }
  dosyalar: { name: string; kind: 'pdf' | 'belge' | 'foto' | 'diger'; w?: number; h?: number; exifDate?: string; kamera?: string; textLen?: number }[]
}

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

/** İşlenen yığını GERÇEK bir rücu dosyası olarak açar (RucuDosyasi + Belge + cikarimJson). */
export async function dosyaOlustur(payload: DosyaPayload): Promise<{ id: string }> {
  const { dbUser, izinli } = await ctx()
  const aktifId = cookies().get('aktif_musteri')?.value
  const musteriId = aktifId && izinli.includes(aktifId) ? aktifId : izinli[0]
  if (!musteriId) redirect('/dashboard')

  const dosya = await prisma.rucuDosyasi.create({
    data: {
      musteriId,
      hasarDosyaNo: payload.hasarNo || null,
      durum: DosyaDurum.INCELENIYOR,
      cikarimJson: payload as unknown as Prisma.InputJsonValue,
      belgeler: {
        create: payload.dosyalar.map((f) => ({
          kategori: f.kind === 'foto' ? BelgeKategori.HASAR_FOTO : BelgeKategori.DIGER,
          dosyaAdi: f.name,
          storagePath: '',
          genislik: f.w ?? null,
          yukseklik: f.h ?? null,
          kamera: f.kamera ?? null,
        })),
      },
      aktiviteler: {
        create: {
          kullaniciId: dbUser.id,
          eylem: `Yığın işlendi → dosya oluştu (${payload.dosyalar.length} belge, yerel çıkarım)`,
        },
      },
    },
    select: { id: true },
  })

  revalidatePath('/akilli-giris')
  return { id: dosya.id }
}

/** Dosya Detay'daki "Takip Açıldı" eşleştirmesi: UYAP icra no'sunu dosyaya bağlar. */
export async function takipAcildi(formData: FormData) {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(formData.get('dosyaId') ?? '')
  const daire = String(formData.get('daire') ?? '').trim()
  const icraDosyaNo = String(formData.get('no') ?? '').trim()
  const tarihStr = String(formData.get('tarih') ?? '').trim()

  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) redirect('/akilli-giris')

  await prisma.rucuDosyasi.update({
    where: { id: dosyaId },
    data: {
      icraDairesi: daire || null,
      icraDosyaNo: icraDosyaNo || null,
      takipTarihi: tarihStr ? new Date(tarihStr) : null,
      durum: DosyaDurum.TAKIP_ACILDI,
    },
  })
  await prisma.aktivite.create({
    data: { dosyaId, kullaniciId: dbUser.id, eylem: `Takip açıldı & eşleştirildi: ${icraDosyaNo || '—'} · ${daire || '—'}` },
  })

  revalidatePath(`/akilli-giris/${dosyaId}`)
}
