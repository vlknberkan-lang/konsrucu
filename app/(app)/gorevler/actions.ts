'use server'

/**
 * KonsRücü — Takip Görevleri · server action'lar · app/(app)/gorevler/actions.ts
 *
 * Bir etkinlikten (ya da serbest) doğan iş, bir kişiye atanır:
 *   ACIK → (üstlen) ISLEMDE → (tamamla) TAMAMLANDI | (yanlış) sil
 * Sorumlu seçiliyse oluşturulurken ANLIK mail gider (mailGonderildiAt damgalanır).
 * Hepsi: tenant guard + Aktivite log + revalidatePath. Tenant kapsamı dosya üzerinden.
 */
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { mailGonder } from '@/lib/konsrucu/mail'
import { takipGoreviMail } from '@/lib/konsrucu/takip-gorevi-mail'
import { GOREV_INCLUDE, gorevMailGirdisi } from '@/lib/konsrucu/takip-gorevi'
import { silebilir, SILME_YETKISI_YOK } from '@/lib/konsrucu/db'

export type GorevSonuc = { ok: boolean; error?: string; bilgi?: string }

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'

/** Giriş yapan kullanıcı + erişebildiği müşteri id'leri. */
async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  return { dbUser, izinli: dbUser.musteriler.map((m) => m.musteriId) }
}

/** UTC instant ← Türkiye (UTC+3) "YYYY-MM-DDTHH:mm" duvar saati. */
function trDateTime(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5]))
}

/** Görevi tenant-kapsamıyla yükle (yetki + dosya bağlamı). */
async function gorevYukle(gorevId: string, izinli: string[]) {
  const g = await prisma.takipGorevi.findUnique({
    where: { id: gorevId },
    select: { id: true, durum: true, dosyaId: true, sorumluId: true, dosya: { select: { musteriId: true } } },
  })
  if (!g || !izinli.includes(g.dosya.musteriId)) return null
  return g
}

/** Yeni takip görevi oluştur; sorumlu seçiliyse anlık mail gönder. */
export async function takipGoreviKaydet(formData: FormData): Promise<GorevSonuc> {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(formData.get('dosyaId') ?? '')
  const etkinlikId = String(formData.get('etkinlikId') ?? '').trim() || null
  const baslik = String(formData.get('baslik') ?? '').trim()
  const aciklama = String(formData.get('aciklama') ?? '').trim() || null
  const sonTarihStr = String(formData.get('sonTarih') ?? '').trim()
  const sonTarih = sonTarihStr ? trDateTime(sonTarihStr) : null
  const sorumluId = String(formData.get('sorumluId') ?? '').trim() || null
  if (!baslik) return { ok: false, error: 'Görev başlığı gerekli' }

  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }

  // sorumlu aynı tenantta mı?
  let sorumlu: { id: string; ad: string; eposta: string } | null = null
  if (sorumluId) {
    sorumlu = await prisma.kullanici.findFirst({
      where: { id: sorumluId, musteriler: { some: { musteriId: dosya.musteriId } } },
      select: { id: true, ad: true, eposta: true },
    })
    if (!sorumlu) return { ok: false, error: 'Seçilen sorumlu bu müşteride değil' }
  }
  // etkinlik bağlamı bu dosyaya mı ait?
  if (etkinlikId) {
    const etk = await prisma.etkinlik.findUnique({ where: { id: etkinlikId }, select: { dosyaId: true } })
    if (!etk || etk.dosyaId !== dosyaId) return { ok: false, error: 'Etkinlik bu dosyaya ait değil' }
  }

  const gorev = await prisma.takipGorevi.create({ data: { dosyaId, etkinlikId, baslik, aciklama, sonTarih, sorumluId, atayanId: dbUser.id } })

  // anlık mail (sorumlu varsa)
  let bilgi = ''
  if (sorumlu?.eposta) {
    const full = await prisma.takipGorevi.findUnique({ where: { id: gorev.id }, include: GOREV_INCLUDE })
    if (full) {
      const { konu, html, text } = takipGoreviMail(gorevMailGirdisi(full, { atayanAd: dbUser.ad, baseUrl: BASE }))
      const r = await mailGonder({ to: sorumlu.eposta, konu, html, text })
      if (r.ok) { await prisma.takipGorevi.update({ where: { id: gorev.id }, data: { mailGonderildiAt: new Date() } }); bilgi = `${sorumlu.ad}'a mail gönderildi` }
      else bilgi = `Mail gönderilemedi: ${r.error}`
    }
  }

  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `Takip görevi: ${baslik}${sorumlu ? ' → ' + sorumlu.ad : ''}${bilgi ? ' · ' + bilgi : ''}` } })
  revalidatePath('/gorevler')
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath('/takvim')
  return { ok: true, bilgi }
}

/** Görevi üstlen (kilitle): sorumlu = ben, durum = ISLEMDE. Başkası üstlendiyse hata. */
export async function takipGoreviUstlen(gorevId: string): Promise<GorevSonuc> {
  if (!z.string().uuid().safeParse(gorevId).success) return { ok: false, error: 'Geçersiz görev kimliği' }
  const { dbUser, izinli } = await ctx()
  const g = await gorevYukle(gorevId, izinli)
  if (!g) return { ok: false, error: 'Görev bulunamadı veya yetkiniz yok' }
  if (g.durum === 'TAMAMLANDI' || g.durum === 'IPTAL') return { ok: false, error: 'Görev kapanmış' }
  if (g.sorumluId && g.sorumluId !== dbUser.id) return { ok: false, error: 'Bu görevi başka bir kullanıcı üstlendi' }

  await prisma.$transaction([
    prisma.takipGorevi.update({ where: { id: gorevId }, data: { sorumluId: dbUser.id, durum: 'ISLEMDE' } }),
    prisma.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: dbUser.id, eylem: `Takip görevi üstlenildi: ${dbUser.ad}` } }),
  ])
  revalidatePath('/gorevler')
  revalidatePath(`/akilli-giris/${g.dosyaId}`)
  return { ok: true }
}

/** Görevi tamamla: durum = TAMAMLANDI. */
export async function takipGoreviTamamla(gorevId: string): Promise<GorevSonuc> {
  if (!z.string().uuid().safeParse(gorevId).success) return { ok: false, error: 'Geçersiz görev kimliği' }
  const { dbUser, izinli } = await ctx()
  const g = await gorevYukle(gorevId, izinli)
  if (!g) return { ok: false, error: 'Görev bulunamadı veya yetkiniz yok' }
  if (g.durum === 'TAMAMLANDI') return { ok: false, error: 'Görev zaten tamamlandı' }
  if (g.durum === 'IPTAL') return { ok: false, error: 'İptal edilmiş görev tamamlanamaz' }

  await prisma.$transaction([
    prisma.takipGorevi.update({ where: { id: gorevId }, data: { durum: 'TAMAMLANDI' } }),
    prisma.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: dbUser.id, eylem: `Takip görevi tamamlandı: ${dbUser.ad}` } }),
  ])
  revalidatePath('/gorevler')
  revalidatePath(`/akilli-giris/${g.dosyaId}`)
  return { ok: true }
}

/** Görevi kaldır (yanlış/mükerrer açılmış) — HARD DELETE yerine IPTAL (iz kalsın, geri dönülebilsin). Rol/bayrak kapılı. */
export async function takipGoreviSil(gorevId: string): Promise<GorevSonuc> {
  if (!z.string().uuid().safeParse(gorevId).success) return { ok: false, error: 'Geçersiz görev kimliği' }
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  const g = await gorevYukle(gorevId, izinli)
  if (!g) return { ok: false, error: 'Görev bulunamadı veya yetkiniz yok' }
  await prisma.takipGorevi.update({ where: { id: gorevId }, data: { durum: 'IPTAL' } })
  await prisma.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: dbUser.id, eylem: `Takip görevi iptal edildi (kaldırıldı): ${dbUser.ad}` } })
  revalidatePath('/gorevler')
  revalidatePath(`/akilli-giris/${g.dosyaId}`)
  return { ok: true }
}
