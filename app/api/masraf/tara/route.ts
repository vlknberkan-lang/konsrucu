/**
 * KonsRücü — Makbuz toplu tarama (backfill) · GET/POST /api/masraf/tara
 * Tüm dosyalardaki DEKONT makbuzlarını katmanlı okuyucudan (yerel ₺0 → Haiku fallback) geçirip
 * Masraf üretir. İdempotent: masrafı zaten çıkmış belge + reddiyat/tahsilat makbuzu hızlı atlanır
 * (AI'ya gitmez). Sayfalama: id'e göre stabil cursor (?after=<belgeId>&limit=12).
 * Korumalı: CRON_SECRET.
 *
 * Sürücü (yerel/elle): her çağrı { sonId, bitti } döndürür → bitti=true olana dek after=sonId ile yinele.
 *   GET /api/masraf/tara?key=<CRON_SECRET>&limit=12[&after=<sonId>][&dosyaId=<id>]
 */
import type { DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { belgedenMasrafCikar } from '@/lib/konsrucu/masraf-cikar'
import { KAPALI_DURUMLAR } from '@/lib/konsrucu/aktiflik'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') ?? ''
  const key = url.searchParams.get('key')
  if (!secret) return Response.json({ ok: false, error: 'CRON_SECRET tanımlı değil' }, { status: 500 })
  if (auth !== `Bearer ${secret}` && key !== secret) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const after = url.searchParams.get('after') || undefined
  const dosyaId = url.searchParams.get('dosyaId') || undefined
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 12) || 12, 1), 40)

  // Geniş backfill'de kapanmış (durum) dosyaların makbuzlarını tarama (boşa maliyet). Tek dosya
  // elle verildiyse niyet açıktır → filtre uygulama. (uyapDurum JS-regex, sayfalamayı bozmamak için burada değil.)
  const belgeler = await prisma.belge.findMany({
    where: {
      kategori: 'DEKONT',
      ...(dosyaId ? { dosyaId } : { dosya: { durum: { notIn: KAPALI_DURUMLAR as unknown as DosyaDurum[] } } }),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    take: limit,
  })

  let eklendi = 0
  let atlandi = 0
  let hatali = 0
  for (const b of belgeler) {
    const r = await belgedenMasrafCikar(b.id)
    eklendi += r.eklendi
    atlandi += r.atlandi
    if (r.hata) hatali++
  }

  const sonId = belgeler.length ? belgeler[belgeler.length - 1].id : (after ?? null)
  const bitti = belgeler.length < limit
  return Response.json({ ok: true, islenen: belgeler.length, eklendi, atlandi, hatali, sonId, bitti })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
