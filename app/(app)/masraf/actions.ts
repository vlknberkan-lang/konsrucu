'use server'

/**
 * KonsRücü — Masraflar · server action'lar · app/(app)/masraf/actions.ts
 * Manuel ekleme, cins/taraf atama (+ öğretme), durum akışı (tekil/toplu), silme,
 * makbuz yükle&oku (PDF → çıkarım) ve dosya makbuzlarını tara. Tümü tenant-kapsamlı.
 */
import { revalidatePath } from 'next/cache'
import { Prisma, MasrafTaraf, MasrafDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { MASRAF_CINSLERI, masrafDedupKey, isoHaftaDonem, paraGuvenli } from '@/lib/konsrucu/masraf'
import { ogret } from '@/lib/konsrucu/masraf-cins'
import { belgedenMasrafCikar, dosyaMakbuzlariniTara } from '@/lib/konsrucu/masraf-cikar'

type R = { ok: boolean; error?: string }

const asTaraf = (s: string): MasrafTaraf | null =>
  s === 'BIZ' || s === 'KARSI' || s === 'BELIRSIZ' ? (s as MasrafTaraf) : null
const asDurum = (s: string): MasrafDurum | null =>
  s === 'YENI' || s === 'ONAYLI' || s === 'FATURALANDI' || s === 'TAHSIL' || s === 'ARSIV' ? (s as MasrafDurum) : null

async function dosyaErisim(dosyaId: string, izinli: string[]) {
  if (!dosyaId) return null
  const d = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { id: true, musteriId: true } })
  return d && izinli.includes(d.musteriId) ? d : null
}
async function masrafErisim(id: string, izinli: string[]) {
  if (!id) return null
  const m = await prisma.masraf.findUnique({
    where: { id },
    select: { id: true, dosyaId: true, cinsHam: true, dosya: { select: { musteriId: true } } },
  })
  return m && izinli.includes(m.dosya.musteriId) ? { ...m, musteriId: m.dosya.musteriId } : null
}

/** Manuel masraf ekle (tek kalem). */
export async function masrafEkle(fd: FormData): Promise<R> {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(fd.get('dosyaId') ?? '')
  const d = await dosyaErisim(dosyaId, izinli)
  if (!d) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }

  const tutar = paraGuvenli(String(fd.get('tutar') ?? ''))
  if (tutar == null || tutar <= 0) return { ok: false, error: 'Geçerli bir tutar girin' }

  const tarihStr = String(fd.get('tarih') ?? '').trim()
  const tarih = /^\d{4}-\d{2}-\d{2}$/.test(tarihStr) ? new Date(`${tarihStr}T00:00:00.000Z`) : null

  const cinsRaw = String(fd.get('cins') ?? '').trim()
  const cins = MASRAF_CINSLERI.includes(cinsRaw) ? cinsRaw : null
  const taraf = asTaraf(String(fd.get('taraf') ?? 'BIZ')) ?? MasrafTaraf.BIZ
  const sorumlu = String(fd.get('sorumlu') ?? '').trim() || null
  const dekontNo = String(fd.get('dekontNo') ?? '').trim() || null
  const makbuzSayi = String(fd.get('makbuzSayi') ?? '').trim() || null
  const makbuzNo = String(fd.get('makbuzNo') ?? '').trim() || null

  const kaynakRef = masrafDedupKey({ dekontNo, cinsHam: cins, tutar, tarih: tarih?.toISOString() ?? null })
  if (kaynakRef) {
    const v = await prisma.masraf.findFirst({ where: { dosyaId, kaynakRef }, select: { id: true } })
    if (v) return { ok: false, error: 'Bu makbuz/kalem zaten kayıtlı (mükerrer).' }
  }

  await prisma.masraf.create({
    data: {
      dosyaId, tutar, tarih, cins, cinsHam: cins, cinsGuven: cins ? 1 : null,
      taraf, sorumlu, dekontNo, makbuzSayi, makbuzNo,
      durum: MasrafDurum.YENI, kaynak: 'MANUEL', kaynakRef,
    },
  })
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: 'Masraf eklendi (manuel)' } })
  revalidatePath('/masraf')
  return { ok: true }
}

/** Eşleşmeyen/yanlış cins'i 63 kalemden birine ata + sözlüğe öğret. */
export async function masrafCinsAta(id: string, cins: string): Promise<R> {
  const { izinli } = await ctx()
  const temizle = !cins || cins === 'YOK'
  if (!temizle && !MASRAF_CINSLERI.includes(cins)) return { ok: false, error: 'Geçersiz masraf cinsi' }
  const m = await masrafErisim(id, izinli)
  if (!m) return { ok: false, error: 'Kayıt bulunamadı veya yetkiniz yok' }

  if (temizle) {
    // "Eşleştirilmedi"ye geri al (öğretme yok)
    await prisma.masraf.update({ where: { id }, data: { cins: null, cinsGuven: null } })
    revalidatePath('/masraf')
    return { ok: true }
  }

  await prisma.masraf.update({ where: { id }, data: { cins, cinsGuven: 1 } })
  // öğret: ham açıklama → seçilen kalem (tenant sözlüğü)
  const ay = await prisma.ayarlar.findUnique({ where: { musteriId: m.musteriId }, select: { masrafEslestirJson: true } })
  const yeni = ogret(ay?.masrafEslestirJson ?? null, m.cinsHam ?? cins, cins) as Prisma.InputJsonValue
  await prisma.ayarlar.upsert({
    where: { musteriId: m.musteriId },
    update: { masrafEslestirJson: yeni },
    create: { musteriId: m.musteriId, masrafEslestirJson: yeni },
  })
  revalidatePath('/masraf')
  return { ok: true }
}

/** Taraf ata (belirsiz → BIZ/KARSI). */
export async function masrafTarafAta(id: string, taraf: string): Promise<R> {
  const { izinli } = await ctx()
  const t = asTaraf(taraf)
  if (!t) return { ok: false, error: 'Geçersiz taraf' }
  const m = await masrafErisim(id, izinli)
  if (!m) return { ok: false, error: 'Kayıt bulunamadı veya yetkiniz yok' }
  await prisma.masraf.update({ where: { id }, data: { taraf: t } })
  revalidatePath('/masraf')
  return { ok: true }
}

/** Tekil durum değiştir (Yeni→Onaylı→Faturalandı→Tahsil / Arşiv). */
export async function masrafDurumAta(id: string, durum: string): Promise<R> {
  const { izinli } = await ctx()
  const d = asDurum(durum)
  if (!d) return { ok: false, error: 'Geçersiz durum' }
  const m = await masrafErisim(id, izinli)
  if (!m) return { ok: false, error: 'Kayıt bulunamadı veya yetkiniz yok' }
  const data: Prisma.MasrafUpdateInput = { durum: d }
  if (d === MasrafDurum.FATURALANDI) { data.faturaTarihi = new Date(); data.faturaDonem = isoHaftaDonem() }
  await prisma.masraf.update({ where: { id }, data })
  revalidatePath('/masraf')
  return { ok: true }
}

/** Toplu işlem: durum ata ya da sil. Tenant where ile sınırlı. */
export async function masrafToplu(ids: string[], islem: string): Promise<R & { adet?: number }> {
  const { izinli } = await ctx()
  const temiz = [...new Set((ids ?? []).filter(Boolean))]
  if (!temiz.length) return { ok: false, error: 'Seçili kayıt yok' }
  const where: Prisma.MasrafWhereInput = { id: { in: temiz }, dosya: { is: { musteriId: { in: izinli } } } }

  if (islem === 'SIL') {
    const r = await prisma.masraf.deleteMany({ where })
    revalidatePath('/masraf')
    return { ok: true, adet: r.count }
  }
  const d = asDurum(islem)
  if (!d) return { ok: false, error: 'Geçersiz işlem' }
  const data: Prisma.MasrafUpdateManyMutationInput = { durum: d }
  if (d === MasrafDurum.FATURALANDI) { data.faturaTarihi = new Date(); data.faturaDonem = isoHaftaDonem() }
  const r = await prisma.masraf.updateMany({ where, data })
  revalidatePath('/masraf')
  return { ok: true, adet: r.count }
}

/** Tekil sil. */
export async function masrafSil(id: string): Promise<R> {
  const { izinli } = await ctx()
  const m = await masrafErisim(id, izinli)
  if (!m) return { ok: false, error: 'Kayıt bulunamadı veya yetkiniz yok' }
  await prisma.masraf.delete({ where: { id } })
  revalidatePath('/masraf')
  return { ok: true }
}

/** Makbuz PDF/foto yükle → Belge (DEKONT) + Claude ile oku → Masraf kalemleri. */
export async function makbuzYukleOku(fd: FormData): Promise<{ ok: boolean; eklendi?: number; atlandi?: number; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(fd.get('dosyaId') ?? '')
  const d = await dosyaErisim(dosyaId, izinli)
  if (!d) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }

  const file = fd.get('file')
  if (!(file instanceof File) || !file.size) return { ok: false, error: 'Makbuz dosyası seçilmedi' }
  if (file.size > 8_000_000) return { ok: false, error: 'Dosya çok büyük (8 MB sınırı)' }

  const bytes = Buffer.from(await file.arrayBuffer())
  const adi = (file.name || 'makbuz.pdf').slice(0, 255)
  const safe = adi.replace(/[^\w.\-]+/g, '_').slice(0, 80)
  const sp = `${dosyaId}/makbuz-manuel-${Date.now()}-${safe}`

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage.from('evrak').upload(sp, bytes, { contentType: file.type || 'application/pdf', upsert: false })
  if (upErr && !/already exists/i.test(upErr.message)) return { ok: false, error: `Yükleme hatası: ${upErr.message}` }

  const belge = await prisma.belge.create({ data: { dosyaId, kategori: 'DEKONT', dosyaAdi: adi, storagePath: sp, confidence: 0.9 } })
  const r = await belgedenMasrafCikar(belge.id, { kullaniciId: dbUser.id })
  revalidatePath('/masraf')
  if (r.hata) return { ok: false, error: r.hata }
  return { ok: true, eklendi: r.eklendi, atlandi: r.atlandi }
}

/** Bir dosyanın tüm DEKONT belgelerini (yeniden) tara → eksik masrafları çıkar. */
export async function dosyaMakbuzTara(dosyaId: string): Promise<{ ok: boolean; eklendi?: number; atlandi?: number; belgeAdedi?: number; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const d = await dosyaErisim(dosyaId, izinli)
  if (!d) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const r = await dosyaMakbuzlariniTara(dosyaId, { kullaniciId: dbUser.id })
  revalidatePath('/masraf')
  return { ok: true, ...r }
}
