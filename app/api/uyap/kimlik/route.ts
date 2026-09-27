/**
 * KonsRücü — UYAP eklenti · GET /api/uyap/kimlik
 * Eklenti, girilen anahtarın hangi müvekkile ait olduğunu ve türünü öğrenir: eski şirket anahtarı mı,
 * kişisel anahtar mı; kişiselse kaç gün geçerli. Eklenti bununla aynı müvekkil için kişisel anahtar
 * girildiğinde eski anahtarı bırakır ve süre dolumu yaklaşınca uyarır (S14). Kişisel veri dönmez.
 */
import { prisma } from '@/lib/prisma'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { anahtarKalanGun } from '@/lib/konsrucu/senkron/anahtar'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

export async function GET(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401, req)
  const musteriId = k.izinli[0]
  const musteri = await prisma.musteri.findUnique({ where: { id: musteriId }, select: { ad: true } })
  let sonKullanma: string | null = null
  let kalanGun: number | null = null
  if (k.tur === 'YENI' && k.anahtarId) {
    const a = await prisma.eklentiAnahtar.findUnique({ where: { id: k.anahtarId }, select: { sonKullanma: true } })
    if (a) { sonKullanma = a.sonKullanma.toISOString(); kalanGun = anahtarKalanGun(a.sonKullanma) }
  }
  return corsJson({ ok: true, tur: k.tur ?? 'ESKI', musteriId, musteriAd: musteri?.ad ?? null, sonKullanma, kalanGun }, 200, req)
}
