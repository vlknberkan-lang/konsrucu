/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/taksit-hatirlatma
 * Günde bir (Vercel Cron). Aktif taksit planlarındaki ödenmemiş taksitleri tarar; ekibe e-posta atar:
 *   • yaklaşan: vade ≤ hatirlatmaGun gün içinde, henüz hatırlatılmamış → nazik hatırlatma
 *   • geciken:  vade geçmiş, henüz gecikme bildirilmemiş → temerrüt uyarısı + Taksit.durum=GECIKTI
 * Mükerrer önleme: Taksit.hatirlatmaGonderildiAt / gecikmeBildirildiAt. Korumalı: CRON_SECRET.
 *
 * Manuel test:  GET /api/cron/taksit-hatirlatma?key=<CRON_SECRET>&dry=1   (dry=1 → göndermeden listeler)
 */
import { Rol } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { taksitHatirlatmaHtml } from '@/lib/konsrucu/taksit-mail'
import { mailGonder } from '@/lib/konsrucu/mail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'
const GUN_MS = 86_400_000
const gunBasi = (d: Date) => { const t = new Date(d.getTime()); t.setHours(0, 0, 0, 0); return t.getTime() }

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') ?? ''
  const key = url.searchParams.get('key')
  if (!secret) return Response.json({ ok: false, error: 'CRON_SECRET tanımlı değil' }, { status: 500 })
  if (auth !== `Bearer ${secret}` && key !== secret) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // ── alıcı = tenant (ana avukat ADMIN üzerinden) ──
  const admin = await prisma.kullanici.findFirst({ where: { rol: Rol.ADMIN, aktif: true }, orderBy: { createdAt: 'asc' }, include: { musteriler: true } })
  const musteriId = admin?.musteriler[0]?.musteriId || (await prisma.musteri.findFirst({ where: { aktif: true }, orderBy: { createdAt: 'asc' } }))?.id
  if (!musteriId) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  const ekip = await prisma.kullanici.findMany({ where: { aktif: true, musteriler: { some: { musteriId } } }, orderBy: { createdAt: 'asc' }, select: { eposta: true } })
  const ekipMail = ekip.map((k) => k.eposta).filter(Boolean)
  const override = url.searchParams.get('to')
  const alicilar = override ? [override] : ekipMail.length ? ekipMail : process.env.RAPOR_ALICI ? [process.env.RAPOR_ALICI] : admin?.eposta ? [admin.eposta] : []
  const aliciAd = alicilar.length > 1 ? 'Ekip' : admin?.ad?.split(/\s+/)[0] || 'Avukat'
  if (!alicilar.length) return Response.json({ ok: false, error: 'Alıcı bulunamadı (aktif kullanıcı / RAPOR_ALICI yok)' }, { status: 500 })

  const now = new Date()
  // aday taksitler: aktif plan + ödenmemiş (BEKLIYOR/KISMI/GECIKTI)
  const taksitler = await prisma.taksit.findMany({
    where: {
      durum: { in: ['BEKLIYOR', 'KISMI', 'GECIKTI'] },
      plan: { durum: 'AKTIF', dosya: { musteriId } },
    },
    orderBy: { vadeTarihi: 'asc' },
    take: 500,
    include: {
      plan: {
        include: {
          dosya: { include: { borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } } }, },
          taksitler: { select: { sira: true, tutar: true, durum: true, odenenTutar: true } },
        },
      },
    },
  })

  const dry = url.searchParams.get('dry') === '1'
  let gonderilen = 0
  let hata = 0
  const detay: { id: string; tur: string; sira: number; vade: string; ok: boolean; err?: string }[] = []

  for (const t of taksitler) {
    const plan = t.plan
    const vadeGun = gunBasi(t.vadeTarihi)
    const kalanGun = Math.round((vadeGun - gunBasi(now)) / GUN_MS)
    const geciken = vadeGun < gunBasi(now)
    const yaklasan = !geciken && plan.hatirlatmaGun > 0 && kalanGun <= plan.hatirlatmaGun

    // hangi uyarı? geciken → gecikmeBildirildiAt boşsa; yaklaşan → hatirlatmaGonderildiAt boşsa
    const tur: 'geciken' | 'yaklasan' | null = geciken
      ? (t.gecikmeBildirildiAt ? null : 'geciken')
      : yaklasan
        ? (t.hatirlatmaGonderildiAt ? null : 'yaklasan')
        : null
    if (!tur) continue

    // plan kalanı (ödenmemiş taksitler)
    const odenmemis = plan.taksitler.filter((x) => x.durum !== 'ODENDI')
    const kalanTutar = odenmemis.reduce((s, x) => s + (Number(x.tutar) - (x.odenenTutar != null ? Number(x.odenenTutar) : 0)), 0)
    const d = plan.dosya

    const { konu, html, text } = taksitHatirlatmaHtml({
      tur,
      aliciAd,
      taksit: { sira: t.sira, toplamSayi: plan.taksitSayisi, vadeTarihi: t.vadeTarihi.toISOString(), tutar: Number(t.tutar), kalanGun },
      plan: { kalanTutar: Math.round(kalanTutar * 100) / 100, kalanSayi: odenmemis.length, temerrutSarti: plan.temerrutSarti },
      dosya: {
        hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo,
        borclu: d.borclular[0]?.adUnvan ?? null,
        borcluSayisi: d.borclular.length,
        icraNo: d.icraDosyaNo ?? null,
        yetkiliIcra: d.yetkiliIcra ?? null,
      },
      dosyaUrl: `${BASE}/akilli-giris/${d.id}`,
    })

    if (dry) { detay.push({ id: t.id, tur, sira: t.sira, vade: t.vadeTarihi.toISOString(), ok: true }); continue }
    const r = await mailGonder({ to: alicilar, konu, html, text })
    if (r.ok) {
      await prisma.taksit.update({
        where: { id: t.id },
        data: geciken ? { gecikmeBildirildiAt: new Date(), durum: 'GECIKTI' } : { hatirlatmaGonderildiAt: new Date() },
      })
      gonderilen++
    } else hata++
    detay.push({ id: t.id, tur, sira: t.sira, vade: t.vadeTarihi.toISOString(), ok: r.ok, err: r.error })
  }

  return Response.json({ ok: true, dry, alicilar, aday: taksitler.length, gonderilen, hata, detay })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
