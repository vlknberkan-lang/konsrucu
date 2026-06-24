/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/etkinlik-hatirlatma
 * ~15 dk'da bir (Vercel Cron) — hatırlatma zamanı gelmiş (baslar - hatirlatmaDk) ve henüz
 * gönderilmemiş etkinlikler için ana avukata (ADMIN = Yelda) tek-etkinlik hatırlatma e-postası yollar.
 * Mükerrer önleme: Etkinlik.hatirlatmaGonderildiAt. Korumalı: CRON_SECRET (Bearer ya da ?key=).
 *
 * Manuel test:  GET /api/cron/etkinlik-hatirlatma?key=<CRON_SECRET>&dry=1   (dry=1 → göndermeden listeler)
 */
import { Rol } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { etkinlikHatirlatmaHtml } from '@/lib/konsrucu/hatirlatma-mail'
import { durumAsama, ASAMA_META } from '@/lib/konsrucu/asama'
import { mailGonder } from '@/lib/konsrucu/mail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') ?? ''
  const key = url.searchParams.get('key')
  if (!secret) return Response.json({ ok: false, error: 'CRON_SECRET tanımlı değil' }, { status: 500 })
  if (auth !== `Bearer ${secret}` && key !== secret) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // ── alıcı = ana avukat (ADMIN = Yelda); RAPOR_ALICI override ──
  const admin = await prisma.kullanici.findFirst({ where: { rol: Rol.ADMIN, aktif: true }, orderBy: { createdAt: 'asc' }, include: { musteriler: true } })
  const musteriId = admin?.musteriler[0]?.musteriId || (await prisma.musteri.findFirst({ where: { aktif: true }, orderBy: { createdAt: 'asc' } }))?.id
  if (!musteriId) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  // alıcılar = tenant'taki tüm aktif kullanıcılar (Yelda + Sude + Ervanur). ?to= test override, RAPOR_ALICI yedek.
  const ekip = await prisma.kullanici.findMany({ where: { aktif: true, musteriler: { some: { musteriId } } }, orderBy: { createdAt: 'asc' }, select: { eposta: true } })
  const ekipMail = ekip.map((k) => k.eposta).filter(Boolean)
  const override = url.searchParams.get('to')
  const alicilar = override ? [override] : ekipMail.length ? ekipMail : process.env.RAPOR_ALICI ? [process.env.RAPOR_ALICI] : admin?.eposta ? [admin.eposta] : []
  const aliciAd = alicilar.length > 1 ? 'Ekip' : admin?.ad?.split(/\s+/)[0] || 'Avukat'
  if (!alicilar.length) return Response.json({ ok: false, error: 'Alıcı bulunamadı (aktif kullanıcı / RAPOR_ALICI yok)' }, { status: 500 })

  const now = new Date()
  // adaylar: hatırlatması olan, henüz gönderilmemiş, gelecekteki etkinlikler (per-event hatirlatmaDk JS'te süzülür)
  const adaylar = await prisma.etkinlik.findMany({
    where: { dosya: { musteriId }, hatirlatmaDk: { not: null }, hatirlatmaGonderildiAt: null, baslar: { gte: now } },
    orderBy: { baslar: 'asc' },
    take: 100,
    include: { dosya: { include: { borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } } } } },
  })
  // zamanı gelenler: (baslar - hatirlatmaDk dk) <= şimdi
  const due = adaylar.filter((e) => e.hatirlatmaDk != null && e.baslar.getTime() - e.hatirlatmaDk * 60_000 <= now.getTime())

  const dry = url.searchParams.get('dry') === '1'
  let gonderilen = 0
  let hata = 0
  const detay: { id: string; baslik: string; baslar: string; ok: boolean; err?: string }[] = []

  for (const e of due) {
    const d = e.dosya
    const za = d.zamanasimi
    const { konu, html, text } = etkinlikHatirlatmaHtml({
      aliciAd,
      etkinlik: { tur: e.tur, baslik: e.baslik, baslar: e.baslar.toISOString(), biter: e.biter ? e.biter.toISOString() : null, yer: e.yer, online: e.online, hatirlatmaDk: e.hatirlatmaDk },
      dosya: {
        hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
        borclu: d.borclular[0]?.adUnvan ?? null,
        borcluSayisi: d.borclular.length,
        asilAlacak: d.asilAlacak != null ? Number(d.asilAlacak) : d.rucuTutari != null ? Number(d.rucuTutari) : null,
        asama: ASAMA_META[durumAsama(d.durum)]?.label ?? null,
        yetkiliIcra: d.yetkiliIcra ?? null,
        icraNo: d.icraDosyaNo ?? null,
        zamanasimi: za ? za.toISOString() : null,
        zamanasimiKalan: za ? Math.ceil((za.getTime() - now.getTime()) / 86_400_000) : null,
      },
      dosyaUrl: `${BASE}/akilli-giris/${d.id}`,
    })
    if (dry) { detay.push({ id: e.id, baslik: e.baslik, baslar: e.baslar.toISOString(), ok: true }); continue }
    const r = await mailGonder({ to: alicilar, konu, html, text })
    if (r.ok) { await prisma.etkinlik.update({ where: { id: e.id }, data: { hatirlatmaGonderildiAt: new Date() } }); gonderilen++ }
    else hata++
    detay.push({ id: e.id, baslik: e.baslik, baslar: e.baslar.toISOString(), ok: r.ok, err: r.error })
  }

  return Response.json({ ok: true, dry, alicilar, aday: adaylar.length, due: due.length, gonderilen, hata, detay })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
