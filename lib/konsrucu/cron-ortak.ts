/**
 * KonsRücü — Cron ortak yardımcıları · lib/konsrucu/cron-ortak.ts (server-only)
 *
 * (1) cronYetkisiz  — CRON_SECRET doğrulaması (Vercel "Authorization: Bearer" ya da ?key=).
 * (2) cronTenantlar — ÇOK-TENANT döngüsü: tüm aktif müşteriler + her birinin alıcı listesi.
 *     Eski desen (admin.musteriler[0]) sıralamasız tek tenant'a kilitleniyordu → ikinci şirketin
 *     (Ray/Zurich) hatırlatmaları hiç gitmiyordu. Artık her cron tenant başına ayrı çalışır.
 * (3) cronYanit    — hata > 0 ise HTTP 500: Vercel cron paneli başarısızlığı görsün; mail
 *     altyapısı sessizce ölmesin.
 */
import { Rol } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** CRON_SECRET kontrolü. Sorun varsa hazır Response döner; geçerliyse null. */
export function cronYetkisiz(req: Request): Response | null {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') ?? ''
  const key = url.searchParams.get('key')
  if (!secret) return Response.json({ ok: false, error: 'CRON_SECRET tanımlı değil' }, { status: 500 })
  if (auth !== `Bearer ${secret}` && key !== secret) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  return null
}

export type CronTenant = {
  musteriId: string
  musteriAd: string
  alicilar: string[]
  aliciAd: string
}

/**
 * Tüm aktif tenant'lar + tenant başına alıcılar (o tenant'ın aktif kullanıcıları; yoksa RAPOR_ALICI).
 * override (?to=) verilirse her tenant'ın alıcısı override edilir — yalnız test içindir (secret zaten doğrulandı).
 */
export async function cronTenantlar(override?: string | null): Promise<CronTenant[]> {
  const musteriler = await prisma.musteri.findMany({
    where: { aktif: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      ad: true,
      kullanicilar: {
        where: { kullanici: { aktif: true } },
        select: { kullanici: { select: { eposta: true, ad: true, rol: true, createdAt: true } } },
      },
    },
  })
  return musteriler.map((m) => {
    const uyeler = m.kullanicilar.map((k) => k.kullanici).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const ekipMail = uyeler.map((u) => u.eposta).filter(Boolean)
    const admin = uyeler.find((u) => u.rol === Rol.ADMIN)
    const alicilar = override ? [override] : ekipMail.length ? ekipMail : process.env.RAPOR_ALICI ? [process.env.RAPOR_ALICI] : []
    const aliciAd = alicilar.length > 1 ? 'Ekip' : (admin?.ad ?? uyeler[0]?.ad)?.split(/\s+/)[0] || 'Avukat'
    return { musteriId: m.id, musteriAd: m.ad, alicilar, aliciAd }
  })
}

/** Mail konusuna tenant adını ekler — iki şirketin mailleri birbirine karışmasın. */
export function konuTenantli(konu: string, musteriAd: string): string {
  return `${konu} · ${musteriAd}`
}

/**
 * Cron yanıtı: gövdedeki hata sayacına göre HTTP durumu belirler.
 * hata > 0 → 500 (Vercel cron'u "failed" olarak işaretler ve panelde görünür) + SistemOlay kaydı
 * (Vercel logları uçucu; kalıcı iz Şirket Bilgileri'ndeki Sistem Olayları kartında).
 */
export async function cronYanit(govde: Record<string, unknown>, kaynak = 'cron'): Promise<Response> {
  const hata = typeof govde.hata === 'number' ? govde.hata : 0
  const ok = hata === 0 && govde.ok !== false
  if (!ok && govde.dry !== true) {
    const { sistemOlayKaydet } = await import('@/lib/konsrucu/sistem-olay')
    await sistemOlayKaydet('CRON_HATA', kaynak, `${hata} hata ile tamamlandı`, govde)
  }
  return Response.json({ ...govde, ok }, { status: ok ? 200 : 500 })
}
