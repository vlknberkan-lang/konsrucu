'use server'

/**
 * KonsRücü — Hugo tevdiye Excel'i içe aktarma · server action
 * app/(app)/akilli-giris/iceri-aktar/actions.ts
 *
 * Akış: yüklenen .xls/.xlsx → lib/import/hugo (saf parse) → `hukukDosyaNo` ile UPSERT.
 *  - Yeni       → RucuDosyasi (durum=HAVUZDA, hugodanCekildi=false, aktif tenant).
 *  - Mevcut     → ATLA (mevcut dosya asla ezilmez).
 *  - Hatalı satır tüm partiyi düşürmez; raporlanır. Yazma tek transaction'da atomiktir.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma, DosyaDurum } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { hugoCozumle, type ImportSonuc } from '@/lib/import/hugo'

/** Giriş yapan kullanıcı + aktif (tenant) müşteri id'si. */
async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({
    where: { id: user.id },
    include: { musteriler: true },
  })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)
  const aktifId = cookies().get('aktif_musteri')?.value
  const musteriId = aktifId && izinli.includes(aktifId) ? aktifId : (izinli[0] ?? null)
  return { dbUser, musteriId }
}

const boslukSonuc = (hatalar: ImportSonuc['hatalar']): ImportSonuc => ({
  toplam: hatalar.length, eklenen: 0, atlanan: 0, hatali: hatalar.length, baslikSatiri: null, eslesenKolon: 0, hatalar,
})

export async function hugoIceriAktar(formData: FormData): Promise<ImportSonuc> {
  const { dbUser, musteriId } = await ctx()
  if (!musteriId) redirect('/dashboard')

  const file = formData.get('dosya')
  if (!(file instanceof File) || file.size === 0) {
    return boslukSonuc([{ satir: 0, sebep: 'Dosya alınamadı' }])
  }
  const adLower = file.name.toLowerCase()
  if (!adLower.endsWith('.xls') && !adLower.endsWith('.xlsx')) {
    return boslukSonuc([{ satir: 0, sebep: 'Yalnız .xls / .xlsx desteklenir' }])
  }

  const { satirlar, hatalar, baslikSatiri, eslesenKolon } = hugoCozumle(Buffer.from(await file.arrayBuffer()))
  const toplam = satirlar.length + hatalar.length

  if (satirlar.length === 0) {
    return { toplam, eklenen: 0, atlanan: 0, hatali: hatalar.length, baslikSatiri, eslesenKolon, hatalar }
  }

  // Mevcut dosyaları tek sorguda bul (tenant kapsamı) → ezme, atla.
  const mevcut = await prisma.rucuDosyasi.findMany({
    where: { musteriId, hukukDosyaNo: { in: satirlar.map((s) => s.hukukDosyaNo) } },
    select: { hukukDosyaNo: true },
  })
  const mevcutSet = new Set(mevcut.map((m) => m.hukukDosyaNo))
  const yeniler = satirlar.filter((s) => !mevcutSet.has(s.hukukDosyaNo))
  const atlanan = satirlar.length - yeniler.length

  let eklenen = 0
  if (yeniler.length > 0) {
    const veriler: Prisma.RucuDosyasiCreateManyInput[] = yeniler.map((s) => ({
      musteriId,
      durum: DosyaDurum.HAVUZDA,
      hugodanCekildi: false,
      hukukDosyaNo: s.hukukDosyaNo,
      gonderenBirim: s.gonderenBirim,
      hasarDosyaNo: s.hasarDosyaNo,
      hasarTarihi: s.hasarTarihi,
      zamanasimi: s.zamanasimi,
      rucuSebebi: s.rucuSebebi,
      rucuOrani: s.rucuOrani,
      rucuTutari: s.rucuTutari != null ? new Prisma.Decimal(s.rucuTutari) : null,
      davaMiktari: s.davaMiktari != null ? new Prisma.Decimal(s.davaMiktari) : null,
      kadroluAvukat: s.kadroluAvukat,
      sozlesmeliAvukat: s.sozlesmeliAvukat,
      islemYapanYrd: s.islemYapanYrd,
      atanmaTarihi: s.atanmaTarihi,
      bitisTarihi: s.bitisTarihi,
      hugoDurum: s.hugoDurum,
      kaynakJson: s.kaynak as unknown as Prisma.InputJsonValue,
    }))

    try {
      // Atomik: createMany + denetim kaydı aynı transaction'da.
      const [, sonuc] = await prisma.$transaction([
        prisma.aktivite.create({
          data: {
            kullaniciId: dbUser.id,
            eylem: `Hugo Excel içe aktarıldı: ${yeniler.length} yeni · ${atlanan} mevcut · ${hatalar.length} hatalı — ${file.name}`,
            detayJson: {
              kaynak: 'hugo', dosyaAdi: file.name, eklenen: yeniler.length, atlanan, hatali: hatalar.length,
            } as Prisma.InputJsonValue,
          },
        }),
        prisma.rucuDosyasi.createMany({ data: veriler }),
      ])
      eklenen = sonuc.count
    } catch (e) {
      // Tüm parti geri alındı (atomik). Satırları "hatalı" raporla, mevcutlar yine de atlanmıştı.
      return {
        toplam, eklenen: 0, atlanan, hatali: hatalar.length + yeniler.length, baslikSatiri, eslesenKolon,
        hatalar: [...hatalar, { satir: 0, sebep: `Kayıt yazılamadı, parti geri alındı: ${(e as Error).message}` }],
      }
    }
  }

  revalidatePath('/akilli-giris')
  return { toplam, eklenen, atlanan, hatali: hatalar.length, baslikSatiri, eslesenKolon, hatalar }
}
