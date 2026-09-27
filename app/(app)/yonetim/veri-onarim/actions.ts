'use server'
/**
 * KonsRücü — Veri Onarımı işlemleri · app/(app)/yonetim/veri-onarim/actions.ts
 *
 * Yalnız ADMIN ve AVUKAT (06 §6.3: "yalnız avukat ve admin"); avukat yardımcısı ve görüntüleyen erişemez.
 * Kapsam: aktif müvekkil. Asıl iş lib/konsrucu/onarim/servis.ts'te; burada yetki + zod + revalidatePath.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { kuruListeOlustur, partiyiGeriAl, partiyiUygula, satiriGeriAl, satirKarariVer, topluOnayVer, URETILEBILIR_KODLAR } from '@/lib/konsrucu/onarim/servis'

export type OnarimSonuc = { ok: true; mesaj?: string } | { ok: false; error: string }

const ROLLER: readonly string[] = ['ADMIN', 'AVUKAT']
const YOL = '/yonetim/veri-onarim'

async function yetki(): Promise<{ ok: true; kullaniciId: string; musteriId: string } | { ok: false; error: string }> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || !ROLLER.includes(dbUser.rol)) return { ok: false, error: 'Veri onarımı yalnız avukat ve yönetici içindir.' }
  if (!aktifMusteriId) return { ok: false, error: 'Aktif müşteri bulunamadı.' }
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
  if (!musteri) return { ok: false, error: 'Bu müşteri pasif.' }
  return { ok: true, kullaniciId: dbUser.id, musteriId: aktifMusteriId }
}

function hata(e: unknown): OnarimSonuc {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'Geçersiz girdi.' }
  return { ok: false, error: (e as Error)?.message || 'Beklenmeyen hata.' }
}

const partiAlani = z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9_-]+$/, 'Geçersiz parti adı')

export async function onarimSatirKarari(input: { id: string; karar: 'ONAYLA' | 'REDDET' | 'SONRA' | 'KARARI_GERI_AL'; gerekce?: string | null; ornekTeyit?: boolean }): Promise<OnarimSonuc> {
  const y = await yetki()
  if (!y.ok) return y
  try {
    const g = z.object({
      id: z.string().uuid(),
      karar: z.enum(['ONAYLA', 'REDDET', 'SONRA', 'KARARI_GERI_AL']),
      gerekce: z.string().trim().max(500).nullish(),
      ornekTeyit: z.boolean().optional(),
    }).parse(input)
    const r = await satirKarariVer({ musteriId: y.musteriId, kullaniciId: y.kullaniciId, ...g })
    if (!r.ok) return r
    revalidatePath(YOL)
    return { ok: true }
  } catch (e) {
    return hata(e)
  }
}

export async function onarimTopluOnay(input: { parti: string }): Promise<OnarimSonuc> {
  const y = await yetki()
  if (!y.ok) return y
  try {
    const { parti } = z.object({ parti: partiAlani }).parse(input)
    const r = await topluOnayVer({ musteriId: y.musteriId, kullaniciId: y.kullaniciId, parti })
    if (!r.ok) return r
    revalidatePath(YOL)
    return { ok: true, mesaj: `${r.onaylanan} satır toplu onaylandı.${r.tekTekKalan ? ` ${r.tekTekKalan} satır (B/C sınıfı) tek tek onay bekliyor.` : ''}` }
  } catch (e) {
    return hata(e)
  }
}

export async function onarimPartiUygula(input: { parti: string }): Promise<OnarimSonuc> {
  const y = await yetki()
  if (!y.ok) return y
  try {
    const { parti } = z.object({ parti: partiAlani }).parse(input)
    const r = await partiyiUygula({ musteriId: y.musteriId, kullaniciId: y.kullaniciId, parti })
    if (!r.ok) return r
    revalidatePath(YOL)
    return { ok: true, mesaj: `Uygulanan: ${r.uygulanan} · Atlanan: ${r.atlanan}${r.atlanan ? ' (araya değişiklik girmiş ya da hedefte kayıt var)' : ''}` }
  } catch (e) {
    return hata(e)
  }
}

export async function onarimSatirGeriAl(input: { id: string }): Promise<OnarimSonuc> {
  const y = await yetki()
  if (!y.ok) return y
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(input)
    const r = await satiriGeriAl({ musteriId: y.musteriId, kullaniciId: y.kullaniciId, id })
    if (!r.ok) return r
    revalidatePath(YOL)
    if (r.geriAlinan === 0) return { ok: false, error: r.atlamaSebepleri[0]?.sebep || 'Satır geri alınamadı.' }
    return { ok: true, mesaj: 'Satır geri alındı.' }
  } catch (e) {
    return hata(e)
  }
}

export async function onarimPartiGeriAl(input: { parti: string }): Promise<OnarimSonuc> {
  const y = await yetki()
  if (!y.ok) return y
  try {
    const { parti } = z.object({ parti: partiAlani }).parse(input)
    const r = await partiyiGeriAl({ musteriId: y.musteriId, kullaniciId: y.kullaniciId, parti })
    if (!r.ok) return r
    revalidatePath(YOL)
    return { ok: true, mesaj: `Geri alınan: ${r.geriAlinan}${r.atlanan ? ` · Geri alınamayan: ${r.atlanan} (değer sonradan değişmiş)` : ''}` }
  } catch (e) {
    return hata(e)
  }
}

export async function onarimKuruListe(input: { kod: 'R0' | 'R1' | 'R2' }): Promise<OnarimSonuc> {
  const y = await yetki()
  if (!y.ok) return y
  try {
    const { kod } = z.object({ kod: z.enum(URETILEBILIR_KODLAR) }).parse(input)
    const r = await kuruListeOlustur({ musteriId: y.musteriId, kullaniciId: y.kullaniciId, kod })
    if (!r.ok) return r
    revalidatePath(YOL)
    if (!r.satir) return { ok: true, mesaj: 'Yeni kuru satır çıkmadı (bekleyen parti varsa önce onu bitirin).' }
    return { ok: true, mesaj: `${r.satir} kuru satır, ${r.partiler.length} parti: ${r.partiler.join(', ')}.${r.kalan ? ` ${r.kalan} satır daha var; bu partiler bitince yeniden oluşturun.` : ''}` }
  } catch (e) {
    return hata(e)
  }
}
