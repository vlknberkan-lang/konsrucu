/**
 * KonsRücü — Hızlı dosya arama · GET /api/arama?q=
 * ⌘K komut paleti için: aktif tenant'ta hukuk/hasar/icra no, sigortalı, borçlu ve plakada arar.
 * Auth zorunlu (ctx), tenant-kapsamlı, en fazla 12 sonuç.
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) return Response.json({ ok: false, sonuclar: [] })

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return Response.json({ ok: true, sonuclar: [] })

  const rows = await prisma.rucuDosyasi.findMany({
    where: {
      musteriId: aktifMusteriId,
      OR: [
        { hukukDosyaNo: { contains: q, mode: 'insensitive' } },
        { hasarDosyaNo: { contains: q, mode: 'insensitive' } },
        { icraDosyaNo: { contains: q, mode: 'insensitive' } },
        { sigortaliUnvan: { contains: q, mode: 'insensitive' } },
        { sigortaliPlaka: { contains: q, mode: 'insensitive' } },
        { karsiPlaka: { contains: q, mode: 'insensitive' } },
        { borclular: { some: { adUnvan: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 12,
    select: {
      id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDosyaNo: true, durum: true,
      borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } },
    },
  })

  return Response.json({
    ok: true,
    sonuclar: rows.map((r) => ({
      id: r.id,
      hukukNo: r.hukukDosyaNo ?? r.hasarDosyaNo,
      hasarNo: r.hasarDosyaNo,
      icraNo: r.icraDosyaNo,
      borclu: r.borclular[0]?.adUnvan ?? null,
      durum: r.durum,
    })),
  })
}
