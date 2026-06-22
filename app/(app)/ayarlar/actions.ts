'use server'

/** KonsRücü — Şirket Bilgileri (Ayarlar) · server action. Takip metni/dilekçe bunları kullanır. */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)
  const aktifId = cookies().get('aktif_musteri')?.value
  const musteriId = aktifId && izinli.includes(aktifId) ? aktifId : (izinli[0] ?? null)
  return { izinli, musteriId }
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
  }
  await prisma.ayarlar.upsert({ where: { musteriId }, create: { musteriId, ...veri }, update: veri })
  revalidatePath('/ayarlar')
  redirect('/ayarlar?ok=1')
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
