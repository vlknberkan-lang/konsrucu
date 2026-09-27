'use server'

/**
 * KonsRücü — Dosya Yol Haritası · server action'lar · app/(app)/dosya-islem/yol-haritasi-actions.ts
 *
 * Hepsi: oturum + aktif müvekkil (musteriId) kapsamı + rol kontrolü (ctx() deseni) + zod doğrulama.
 * Yazan action'lar YALNIZ `Aktivite` günlüğüne ve `RucuDosyasi.yolHaritasiJson` önbelleğine yazar; hiçbir hukuki
 * kaydı açmaz, değiştirmez ya da silmez. Prova yalnız okur (06 §8.5); prova puanı bir günlük kaydıdır.
 *
 *   yolHaritasiGetir        — ekran modeli (canlı ya da ?prova=), salt okur. Her aktif rol.
 *   oneriYanlisBildir       — "Bu öneri yanlış" + gerekçe → Aktivite (kural kodu ve sürümüyle). Görüntüleyen hariç.
 *   oneriErtele             — "Ertele" + zorunlu gerekçe → Aktivite. Öncelik 0–2 (veri engeli, süre riski, süre
 *                             başlatan aday) ertelenemez; avukat kuralını yalnız avukat/yönetici erteler.
 *   provaPuanla             — Provada "doğru / yanlış / eksik" puanı → Aktivite. Yalnız avukat/yönetici.
 *   yolHaritasiOnbellekGuncelle — canlı sonucu yolHaritasiJson önbelleğine yazar (yalnız değiştiyse).
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { kuralBul, ERTELENEMEZ_ONCELIK, onbellekJson, provaTarihiCoz, MOTOR_SURUMU, type YolHaritasiGorunum } from '@/lib/konsrucu/yol-haritasi'
import { ERTELEME_EYLEM_ONEKI } from '@/lib/konsrucu/yol-haritasi/gercekler'
import { onbellekGuncelle, yolHaritasiYukle } from '@/lib/konsrucu/yol-haritasi/yukle'
import { gunSonu, gunMetni } from '@/lib/konsrucu/yol-haritasi/yardimci'

export type YolHaritasiIslemSonuc = { ok: boolean; error?: string; bilgi?: string }
export type YolHaritasiGetirSonuc = { ok: boolean; error?: string; gorunum?: YolHaritasiGorunum }

const AVUKAT_ROLLERI = ['AVUKAT', 'ADMIN'] as const
const avukatMi = (rol: string) => (AVUKAT_ROLLERI as readonly string[]).includes(rol)

const uuid = z.string().uuid('Geçersiz dosya kimliği')
const kuralKodu = z.string().regex(/^[A-Z]{2}-\d{2}[ab]?$/, 'Geçersiz kural kodu').refine((k) => !!kuralBul(k), 'Bilinmeyen kural kodu')
const gerekce = z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı').max(1000, 'Gerekçe en çok 1000 karakter olabilir')
const provaGunu = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Prova tarihi YYYY-AA-GG biçiminde olmalı')

function ilkHata(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Geçersiz girdi'
}

/** Oturum + aktif müvekkil + rol. `yazma` true ise görüntüleyen reddedilir. */
async function kapsam(yazma: boolean): Promise<{ hata: string } | { hata: null; kullaniciId: string; rol: string; musteriId: string }> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif) return { hata: 'Hesabınız pasif; işlem yapılamaz.' }
  if (yazma && dbUser.rol === 'GORUNTULEYEN') return { hata: 'Bu işlem için yetkiniz yok (görüntüleyen rolü).' }
  if (!aktifMusteriId) return { hata: 'Aktif müşteri bulunamadı.' }
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
  if (!musteri) return { hata: 'Aktif müşteri bulunamadı.' }
  return { hata: null, kullaniciId: dbUser.id, rol: dbUser.rol, musteriId: aktifMusteriId }
}

async function dosyaKapsamda(dosyaId: string, musteriId: string): Promise<boolean> {
  const d = await prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId }, select: { id: true } })
  return !!d
}

function yenile(dosyaId: string) {
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath(`/dosya/${dosyaId}`)
}

// ─────────────────────────── okuma ───────────────────────────

const getirSema = z.object({ dosyaId: uuid, prova: provaGunu.nullish() })

/** Ekran modeli (canlı ya da prova). Salt okur. */
export async function yolHaritasiGetir(girdi: { dosyaId: string; prova?: string | null }): Promise<YolHaritasiGetirSonuc> {
  const p = getirSema.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  if (p.data.prova && !provaTarihiCoz(p.data.prova)) return { ok: false, error: 'Prova tarihi geçersiz ya da gelecekte.' }
  const gorunum = await yolHaritasiYukle({ dosyaId: p.data.dosyaId, musteriId: k.musteriId, prova: p.data.prova ?? null })
  if (!gorunum) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  return { ok: true, gorunum }
}

// ─────────────────────────── "Bu öneri yanlış" ───────────────────────────

const yanlisSema = z.object({
  dosyaId: uuid,
  kural: kuralKodu,
  surum: z.number().int().min(1).max(999),
  gerekce,
  prova: provaGunu.nullish(),
})

export async function oneriYanlisBildir(girdi: { dosyaId: string; kural: string; surum: number; gerekce: string; prova?: string | null }): Promise<YolHaritasiIslemSonuc> {
  const p = yanlisSema.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const g = p.data
  if (g.prova && !provaTarihiCoz(g.prova)) return { ok: false, error: 'Prova tarihi geçersiz ya da gelecekte.' }
  // o an ekranda ne gösterildiğini de kaydet: bildirim kural test setine vaka olarak girer
  const gorunum = await yolHaritasiYukle({ dosyaId: g.dosyaId, musteriId: k.musteriId, prova: g.prova ?? null })
  if (!gorunum) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const s = gorunum.sonuc
  const gorunuyordu = [s.simdi, ...s.sonra, s.bekleme].some((a) => a?.kural === g.kural)
  await prisma.aktivite.create({
    data: {
      dosyaId: g.dosyaId, kullaniciId: k.kullaniciId,
      eylem: `Yol haritası · öneri yanlış bildirildi (${g.kural}${g.prova ? ` · prova ${g.prova}` : ''})`,
      detayJson: {
        tur: 'YOL_HARITASI_YANLIS', kural: g.kural, surum: g.surum, motorSurumu: MOTOR_SURUMU, gerekce: g.gerekce,
        prova: g.prova ?? null, gorunuyordu, anlik: onbellekJson(s), rol: k.rol,
      } as Prisma.InputJsonValue,
    },
  })
  yenile(g.dosyaId)
  return { ok: true, bilgi: 'Bildiriminiz kaydedildi; kural test setine eklenecek.' }
}

// ─────────────────────────── "Ertele" ───────────────────────────

const erteleSema = z.object({
  dosyaId: uuid,
  kural: kuralKodu,
  gerekce,
  gun: z.number().int().min(1, 'En az 1 gün').max(30, 'En çok 30 gün ertelenebilir'),
})

export async function oneriErtele(girdi: { dosyaId: string; kural: string; gerekce: string; gun: number }): Promise<YolHaritasiIslemSonuc> {
  const p = erteleSema.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  const kural = kuralBul(g.kural)!
  if (kural.tur !== 'EYLEM' || kural.oncelik <= ERTELENEMEZ_ONCELIK) {
    return { ok: false, error: 'Veri engeli, süre riski ve süre başlatan onaylar ertelenemez.' }
  }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  if ((kural.rol === 'A' || kural.rol === 'A+2') && !avukatMi(k.rol)) {
    return { ok: false, error: 'Bu adımı yalnız avukat ya da yönetici erteleyebilir.' }
  }
  if (!(await dosyaKapsamda(g.dosyaId, k.musteriId))) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const bugun = gunMetni(new Date()) as string
  const bitis = new Date((gunSonu(bugun) as Date).getTime() + g.gun * 86_400_000)
  await prisma.aktivite.create({
    data: {
      dosyaId: g.dosyaId, kullaniciId: k.kullaniciId,
      eylem: `${ERTELEME_EYLEM_ONEKI} (${g.kural}, ${g.gun} gün)`,
      detayJson: {
        tur: 'YOL_HARITASI_ERTELE', kural: g.kural, surum: kural.surum, motorSurumu: MOTOR_SURUMU, gerekce: g.gerekce, gun: g.gun,
        bitis: bitis.toISOString(), rol: k.rol,
      } as Prisma.InputJsonValue,
    },
  })
  const gorunum = await yolHaritasiYukle({ dosyaId: g.dosyaId, musteriId: k.musteriId })
  if (gorunum) await onbellekGuncelle(gorunum, k.musteriId)
  yenile(g.dosyaId)
  return { ok: true, bilgi: `Adım ${gunMetni(bitis)} tarihine kadar ertelendi.` }
}

// ─────────────────────────── prova puanı ───────────────────────────

const puanSema = z.object({
  dosyaId: uuid,
  prova: provaGunu,
  kural: kuralKodu,
  puan: z.enum(['DOGRU', 'YANLIS', 'EKSIK']),
  not: z.string().trim().max(1000).optional(),
})

export async function provaPuanla(girdi: { dosyaId: string; prova: string; kural: string; puan: 'DOGRU' | 'YANLIS' | 'EKSIK'; not?: string }): Promise<YolHaritasiIslemSonuc> {
  const p = puanSema.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  if (!provaTarihiCoz(g.prova)) return { ok: false, error: 'Prova tarihi geçersiz ya da gelecekte.' }
  if ((g.puan === 'YANLIS' || g.puan === 'EKSIK') && !g.not?.trim()) return { ok: false, error: 'Yanlış ya da eksik puanında kısa bir not yazın.' }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  if (!avukatMi(k.rol)) return { ok: false, error: 'Prova puanını yalnız avukat ya da yönetici verebilir.' }
  const gorunum = await yolHaritasiYukle({ dosyaId: g.dosyaId, musteriId: k.musteriId, prova: g.prova })
  if (!gorunum) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  await prisma.aktivite.create({
    data: {
      dosyaId: g.dosyaId, kullaniciId: k.kullaniciId,
      eylem: `Yol haritası · prova puanı: ${g.puan === 'DOGRU' ? 'doğru' : g.puan === 'YANLIS' ? 'yanlış' : 'eksik'} (${g.kural} · ${g.prova})`,
      detayJson: {
        tur: 'YOL_HARITASI_PROVA_PUAN', prova: g.prova, kural: g.kural, puan: g.puan, not: g.not ?? null, motorSurumu: MOTOR_SURUMU,
        anlik: onbellekJson(gorunum.sonuc),
      } as Prisma.InputJsonValue,
    },
  })
  yenile(g.dosyaId)
  return { ok: true, bilgi: 'Puan kaydedildi.' }
}

// ─────────────────────────── önbellek ───────────────────────────

/** Canlı sonucu `yolHaritasiJson` önbelleğine yazar (değiştiyse). Türetilmiş veri; hukuki kayıt değildir. */
export async function yolHaritasiOnbellekGuncelle(dosyaId: string): Promise<YolHaritasiIslemSonuc> {
  const p = uuid.safeParse(dosyaId)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const gorunum = await yolHaritasiYukle({ dosyaId: p.data, musteriId: k.musteriId })
  if (!gorunum) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const yazildi = await onbellekGuncelle(gorunum, k.musteriId)
  return { ok: true, bilgi: yazildi ? 'Önbellek güncellendi.' : 'Önbellek güncel.' }
}
