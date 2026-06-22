/**
 * KonsRücü — UYAP senkron ucu · app/api/uyap/olay/route.ts
 * UYAP Chrome eklentisi takip olaylarını buraya POST eder (icraDosyaNo ile dosyaya bağlanır).
 * Auth: Bearer UYAP_SYNC_TOKEN (env). Token tanımlı değilse uç kapalıdır (401).
 *
 * Gövde: { icraDosyaNo, tip(TEBLIG|ITIRAZ|KESINLESTI|TAHSILAT|HACIZ|KAPANDI|DURUM), tarih?, tutar?, aciklama?, hamJson? }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { takipOlayKaydet } from '@/lib/konsrucu/takip-olay'

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!process.env.UYAP_SYNC_TOKEN || token !== process.env.UYAP_SYNC_TOKEN) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  let body: { icraDosyaNo?: string; tip?: string; tarih?: string; tutar?: number; aciklama?: string; hamJson?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 })
  }
  const icraDosyaNo = String(body?.icraDosyaNo ?? '').trim()
  const tip = String(body?.tip ?? '').trim()
  if (!icraDosyaNo || !tip) return NextResponse.json({ ok: false, error: 'icraDosyaNo + tip gerekli' }, { status: 400 })

  const dosya = await prisma.rucuDosyasi.findFirst({ where: { icraDosyaNo }, select: { id: true } })
  if (!dosya) return NextResponse.json({ ok: false, error: 'dosya bulunamadı (icraDosyaNo)' }, { status: 404 })

  const tutar = Number(body?.tutar)
  try {
    await takipOlayKaydet(dosya.id, null, {
      tip,
      tarih: body?.tarih ? new Date(body.tarih) : new Date(),
      tutar: Number.isFinite(tutar) && tutar > 0 ? new Prisma.Decimal(tutar) : null,
      aciklama: body?.aciklama ? String(body.aciklama).slice(0, 2000) : null,
      hamJson: (body?.hamJson ?? undefined) as Prisma.InputJsonValue | undefined,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
