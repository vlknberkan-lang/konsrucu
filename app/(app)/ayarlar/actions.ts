'use server'

/** KonsRücü — Şirket Bilgileri (Ayarlar) · server action. Takip metni/dilekçe bunları kullanır. */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { prisma } from '@/lib/prisma'
import { silebilir, SILME_YETKISI_YOK } from '@/lib/konsrucu/db'

async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)
  const aktifId = cookies().get('aktif_musteri')?.value
  const musteriId = aktifId && izinli.includes(aktifId) ? aktifId : (izinli[0] ?? null)
  return { dbUser, izinli, musteriId }
}

export async function ayarlarKaydet(fd: FormData): Promise<void> {
  const { izinli } = await ctx()
  const musteriId = String(fd.get('musteriId') ?? '')
  if (!izinli.includes(musteriId)) redirect('/dashboard')
  const str = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v || null }
  const veri = {
    alacakliUnvan: str('alacakliUnvan'), mersis: str('mersis'), vekilAd: str('vekilAd'), vekilAdres: str('vekilAdres'),
    vekilBaro: str('vekilBaro'), iban: str('iban'), kep: str('kep'), eposta: str('eposta'),
    aciklamaFooter: str('aciklamaFooter'), faizTuru: str('faizTuru') ?? 'Yasal faiz',
    davaciVkn: str('davaciVkn'), davaciAdres: str('davaciAdres'), vekilUets: str('vekilUets'), icraInkarOrani: str('icraInkarOrani') ?? '20',
  }
  await prisma.ayarlar.upsert({ where: { musteriId }, create: { musteriId, ...veri }, update: veri })
  revalidatePath('/ayarlar')
  redirect('/ayarlar?ok=1')
}

/** Vekaletname'yi kaydet — tüm dosyalarda ortak tek belge (Storage yolu + ad).
 *  Mevcut belgeyi DEĞİŞTİRMEK fiilen silmektir → silme-yetkisi kapısına tabidir (ilk yükleme serbest). */
export async function vekaletnameKaydet(musteriId: string, path: string, ad: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!izinli.includes(musteriId)) return { ok: false, error: 'Yetki yok' }
  const mevcutV = await prisma.ayarlar.findUnique({ where: { musteriId }, select: { vekaletnamePath: true } })
  if (mevcutV?.vekaletnamePath && !silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  const p = String(path ?? '').trim()
  if (!p) return { ok: false, error: 'Dosya yolu boş' }
  const veri = { vekaletnamePath: p, vekaletnameAd: String(ad ?? '').slice(0, 255) || null }
  await prisma.ayarlar.upsert({ where: { musteriId }, create: { musteriId, ...veri }, update: veri })
  revalidatePath('/ayarlar')
  return { ok: true }
}

/** Vekaletname'yi sil (kaydı boşalt; Storage dosyası kalsa da referans kalkar). Rol/bayrak kapılı. */
export async function vekaletnameSil(musteriId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  if (!izinli.includes(musteriId)) return { ok: false, error: 'Yetki yok' }
  await prisma.ayarlar.update({ where: { musteriId }, data: { vekaletnamePath: null, vekaletnameAd: null } }).catch(() => null)
  revalidatePath('/ayarlar')
  return { ok: true }
}

/** Vekaletname için kısa ömürlü imzalı URL üret (tenant doğrulanır). */
export async function vekaletnameAc(musteriId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { izinli } = await ctx()
  if (!izinli.includes(musteriId)) return { ok: false, error: 'Yetki yok' }
  const a = await prisma.ayarlar.findUnique({ where: { musteriId }, select: { vekaletnamePath: true } })
  if (!a?.vekaletnamePath) return { ok: false, error: 'Vekaletname yüklenmemiş' }
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from('evrak').createSignedUrl(a.vekaletnamePath, 120)
  if (error || !data?.signedUrl) return { ok: false, error: `Bağlantı oluşturulamadı: ${error?.message ?? 'bilinmeyen'}` }
  return { ok: true, url: data.signedUrl }
}

/** UYAP eklenti senkron anahtarı üret/yenile (eskisi geçersiz olur → eklenti senkronu kırılır!). Rol/bayrak kapılı. */
export async function senkronTokenUret(musteriId: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  if (!izinli.includes(musteriId)) return { ok: false, error: 'Yetki yok' }
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  const token = 'kr_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  await prisma.ayarlar.upsert({ where: { musteriId }, create: { musteriId, senkronToken: token }, update: { senkronToken: token } })
  revalidatePath('/ayarlar')
  return { ok: true, token }
}

/** Senkron anahtarını kaldır (eklenti erişimini kapatır). Rol/bayrak kapılı. */
export async function senkronTokenSil(musteriId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  if (!izinli.includes(musteriId)) return { ok: false, error: 'Yetki yok' }
  await prisma.ayarlar.update({ where: { musteriId }, data: { senkronToken: null } }).catch(() => null)
  revalidatePath('/ayarlar')
  return { ok: true }
}

/** Mentor öğrenilen kuralı sil (tenant doğrulanır). Rol/bayrak kapılı. */
export async function mentorKuralSil(id: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  const k = await prisma.mentorKural.findUnique({ where: { id }, select: { musteriId: true } })
  if (!k || !izinli.includes(k.musteriId)) return { ok: false, error: 'Yetki yok' }
  await prisma.mentorKural.delete({ where: { id } })
  revalidatePath('/ayarlar')
  return { ok: true }
}

/** Mentor kuralını aç/kapat — kapalı kural çıkarımda enjekte edilmez (silmeden devre dışı). */
export async function mentorKuralKapat(id: string, aktif: boolean): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const k = await prisma.mentorKural.findUnique({ where: { id }, select: { musteriId: true } })
  if (!k || !izinli.includes(k.musteriId)) return { ok: false, error: 'Yetki yok' }
  await prisma.mentorKural.update({ where: { id }, data: { aktif } })
  revalidatePath('/ayarlar')
  return { ok: true }
}

/** Dönemsel faiz oranlarını kaydet (faizJson = { oranlar: [...] }). */
export async function faizOranlariKaydet(musteriId: string, oranlar: { baslangic: string; oran: number }[]): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  if (!izinli.includes(musteriId)) return { ok: false, error: 'Yetki yok' }
  const temiz = (Array.isArray(oranlar) ? oranlar : [])
    .filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o?.baslangic) && Number.isFinite(Number(o?.oran)))
    .map((o) => ({ baslangic: o.baslangic, oran: Number(o.oran) }))
    .sort((a, b) => a.baslangic.localeCompare(b.baslangic))
  const faizJson = { oranlar: temiz } as unknown as Prisma.InputJsonValue
  await prisma.ayarlar.upsert({ where: { musteriId }, create: { musteriId, faizJson }, update: { faizJson } })
  revalidatePath('/ayarlar')
  return { ok: true }
}
