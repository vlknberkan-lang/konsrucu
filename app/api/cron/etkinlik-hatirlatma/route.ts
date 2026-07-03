/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/etkinlik-hatirlatma
 * ~15 dk'da bir (Vercel Cron) — TÜM AKTİF TENANT'LAR için: hatırlatma zamanı gelmiş
 * (baslar - hatirlatmaDk) ve henüz gönderilmemiş etkinliklere tenant ekibine e-posta yollar.
 * Tolerans: art arda başarısız koşularda hatırlatma tamamen düşmesin diye başlangıcı
 * 3 saate kadar geçmiş etkinlikler de kapsanır ("az önce başladı" bilgisi hâlâ değerli).
 * Mükerrer önleme: Etkinlik.hatirlatmaGonderildiAt. Korumalı: CRON_SECRET. Hata → HTTP 500.
 *
 * Manuel test:  GET /api/cron/etkinlik-hatirlatma?key=<CRON_SECRET>&dry=1   (dry=1 → göndermeden listeler)
 */
import { prisma } from '@/lib/prisma'
import { etkinlikHatirlatmaHtml } from '@/lib/konsrucu/hatirlatma-mail'
import { durumAsama, ASAMA_META } from '@/lib/konsrucu/asama'
import { mailGonder } from '@/lib/konsrucu/mail'
import { cronYetkisiz, cronTenantlar, konuTenantli, cronYanit } from '@/lib/konsrucu/cron-ortak'
import { kalanGun } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'
const TOLERANS_MS = 3 * 60 * 60 * 1000 // başlangıcı 3 saate kadar geçmiş etkinlikler hâlâ hatırlatılır

async function handle(req: Request) {
  const yetkisiz = cronYetkisiz(req)
  if (yetkisiz) return yetkisiz
  const url = new URL(req.url)
  const override = url.searchParams.get('to')
  const dry = url.searchParams.get('dry') === '1'

  const tenantlar = await cronTenantlar(override)
  if (!tenantlar.length) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  const now = new Date()
  let aday = 0
  let dueToplam = 0
  let gonderilen = 0
  let hata = 0
  const detay: { tenant: string; id: string; baslik: string; baslar: string; ok: boolean; err?: string }[] = []

  for (const t of tenantlar) {
    if (!t.alicilar.length) { hata++; detay.push({ tenant: t.musteriAd, id: '-', baslik: '(alıcı yok)', baslar: '', ok: false, err: 'Alıcı bulunamadı' }); continue }

    // adaylar: hatırlatması olan, henüz gönderilmemiş, yakın geçmiş/gelecek etkinlikler (per-event hatirlatmaDk JS'te süzülür)
    const adaylar = await prisma.etkinlik.findMany({
      where: { dosya: { musteriId: t.musteriId }, hatirlatmaDk: { not: null }, hatirlatmaGonderildiAt: null, baslar: { gte: new Date(now.getTime() - TOLERANS_MS) } },
      orderBy: { baslar: 'asc' },
      take: 100,
      include: { dosya: { include: { borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } } } } },
    })
    aday += adaylar.length
    // zamanı gelenler: (baslar - hatirlatmaDk dk) <= şimdi
    const due = adaylar.filter((e) => e.hatirlatmaDk != null && e.baslar.getTime() - e.hatirlatmaDk * 60_000 <= now.getTime())
    dueToplam += due.length

    for (const e of due) {
      const d = e.dosya
      const za = d.zamanasimi
      const { konu, html, text } = etkinlikHatirlatmaHtml({
        aliciAd: t.aliciAd,
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
          zamanasimiKalan: za ? kalanGun(za, now) : null,
        },
        dosyaUrl: `${BASE}/akilli-giris/${d.id}`,
      })
      const konuT = tenantlar.length > 1 ? konuTenantli(konu, t.musteriAd) : konu
      if (dry) { detay.push({ tenant: t.musteriAd, id: e.id, baslik: e.baslik, baslar: e.baslar.toISOString(), ok: true }); continue }
      const r = await mailGonder({ to: t.alicilar, konu: konuT, html, text })
      if (r.ok) { await prisma.etkinlik.update({ where: { id: e.id }, data: { hatirlatmaGonderildiAt: new Date() } }); gonderilen++ }
      else hata++
      detay.push({ tenant: t.musteriAd, id: e.id, baslik: e.baslik, baslar: e.baslar.toISOString(), ok: r.ok, err: r.error })
    }
  }

  return cronYanit({ ok: hata === 0, dry, tenant: tenantlar.length, aday, due: dueToplam, gonderilen, hata, detay }, 'etkinlik-hatirlatma')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
