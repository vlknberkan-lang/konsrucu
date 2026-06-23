/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/haftalik-rapor
 * Her sabah 07:00 (TRT) = 04:00 UTC — Vercel Cron tetikler (bkz. vercel.json).
 * Ana avukatı (Kullanici.rol = ADMIN) bulur, önümüzdeki 7 günün takvim raporunu + yaklaşan
 * zamanaşımılarını e-posta olarak ona gönderir. Korumalı: CRON_SECRET (Vercel Bearer header).
 *
 * Manuel test:  GET /api/cron/haftalik-rapor?key=<CRON_SECRET>&to=<test@adres>  (to ops.)
 */
import { Rol } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { haftalikRaporHtml, type RaporEtkinlik, type RaporZamanasimi } from '@/lib/konsrucu/rapor-mail'
import { mailGonder } from '@/lib/konsrucu/mail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'

async function handle(req: Request) {
  // ── yetki: Vercel Cron "Authorization: Bearer <CRON_SECRET>" yollar; ya da ?key= ──
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') ?? ''
  const key = url.searchParams.get('key')
  if (!secret) return Response.json({ ok: false, error: 'CRON_SECRET tanımlı değil' }, { status: 500 })
  if (auth !== `Bearer ${secret}` && key !== secret) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // ── ana avukat (ADMIN) = alıcı + tenant ──
  const admin = await prisma.kullanici.findFirst({
    where: { rol: Rol.ADMIN, aktif: true },
    orderBy: { createdAt: 'asc' },
    include: { musteriler: true },
  })
  const aliciOverride = url.searchParams.get('to') // sadece test için (secret zaten doğrulandı)
  const alici = aliciOverride || process.env.RAPOR_ALICI || admin?.eposta || null
  const aliciAd = admin?.ad?.split(/\s+/)[0] || 'Avukat'
  const musteriId = admin?.musteriler[0]?.musteriId || (await prisma.musteri.findFirst({ where: { aktif: true }, orderBy: { createdAt: 'asc' } }))?.id

  if (!alici) return Response.json({ ok: false, error: 'Alıcı bulunamadı (ADMIN kullanıcı / RAPOR_ALICI yok)' }, { status: 500 })
  if (!musteriId) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  // ── veri (önizleme route'u ile aynı pencere) ──
  const simdi = new Date()
  const bas = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate())
  const son = new Date(bas.getTime() + 7 * 86_400_000)
  const zaSon = new Date(bas.getTime() + 30 * 86_400_000)

  const [kayit, zaKayit] = await Promise.all([
    prisma.etkinlik.findMany({
      where: { dosya: { musteriId }, baslar: { gte: bas, lt: son } },
      orderBy: { baslar: 'asc' },
      include: { dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } },
    }),
    prisma.rucuDosyasi.findMany({
      where: { musteriId, zamanasimi: { gte: bas, lt: zaSon } },
      orderBy: { zamanasimi: 'asc' },
      take: 12,
      select: { hukukDosyaNo: true, hasarDosyaNo: true, zamanasimi: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } },
    }),
  ])

  const etkinlikler: RaporEtkinlik[] = kayit.map((e) => ({
    tur: e.tur,
    baslik: e.baslik,
    baslar: e.baslar.toISOString(),
    biter: e.biter ? e.biter.toISOString() : null,
    yer: e.yer,
    online: e.online,
    hukukNo: e.dosya.hukukDosyaNo ?? e.dosya.hasarDosyaNo,
    borclu: e.dosya.borclular[0]?.adUnvan ?? null,
  }))
  const zamanasimi: RaporZamanasimi[] = zaKayit
    .filter((d) => d.zamanasimi)
    .map((d) => ({
      hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
      borclu: d.borclular[0]?.adUnvan ?? null,
      tarih: d.zamanasimi!.toISOString(),
      kalanGun: Math.ceil((d.zamanasimi!.getTime() - bas.getTime()) / 86_400_000),
    }))

  const { konu, html, text } = haftalikRaporHtml({
    aliciAd,
    bugun: bas.toISOString(),
    gunSayisi: 7,
    etkinlikler,
    zamanasimi,
    panelUrl: `${BASE}/takvim`,
  })

  // dry=1 → göndermeden çözümlenen alıcı + sayıları döndür (doğrulama için)
  if (url.searchParams.get('dry') === '1') {
    return Response.json({ ok: true, dry: true, alici, aliciAd, musteriId, etkinlik: etkinlikler.length, zamanasimi: zamanasimi.length, konu })
  }

  const r = await mailGonder({ to: alici, konu, html, text })
  return Response.json({ ok: r.ok, gonderildi: r.ok, alici, etkinlik: etkinlikler.length, zamanasimi: zamanasimi.length, hata: r.error })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
