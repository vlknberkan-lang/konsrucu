/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/taksit-hatirlatma
 * Günde bir (Vercel Cron). TÜM AKTİF TENANT'LAR için: aktif taksit planlarındaki ödenmemiş
 * taksitleri tarar; tenant ekibine e-posta atar:
 *   • yaklaşan: vade ≤ hatirlatmaGun gün içinde, henüz hatırlatılmamış → nazik hatırlatma
 *   • geciken:  vade geçmiş, henüz gecikme bildirilmemiş → temerrüt uyarısı + Taksit.durum=GECIKTI
 * Mükerrer önleme: Taksit.hatirlatmaGonderildiAt / gecikmeBildirildiAt. Korumalı: CRON_SECRET.
 * Hata varsa HTTP 500 (Vercel panelinde görünür).
 *
 * Manuel test:  GET /api/cron/taksit-hatirlatma?key=<CRON_SECRET>&dry=1   (dry=1 → göndermeden listeler)
 */
import { prisma } from '@/lib/prisma'
import { taksitHatirlatmaHtml } from '@/lib/konsrucu/taksit-mail'
import { mailGonder } from '@/lib/konsrucu/mail'
import { cronYetkisiz, cronTenantlar, konuTenantli, cronYanit } from '@/lib/konsrucu/cron-ortak'
import { kalanGun as kalanGunIst } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'

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
  let gonderilen = 0
  let hata = 0
  const detay: { tenant: string; id: string; tur: string; sira: number; vade: string; ok: boolean; err?: string }[] = []

  for (const tn of tenantlar) {
    if (!tn.alicilar.length) { hata++; detay.push({ tenant: tn.musteriAd, id: '-', tur: '-', sira: 0, vade: '', ok: false, err: 'Alıcı bulunamadı' }); continue }

    // aday taksitler: aktif plan + ödenmemiş (BEKLIYOR/KISMI/GECIKTI)
    const taksitler = await prisma.taksit.findMany({
      where: {
        durum: { in: ['BEKLIYOR', 'KISMI', 'GECIKTI'] },
        plan: { durum: 'AKTIF', dosya: { musteriId: tn.musteriId } },
      },
      orderBy: { vadeTarihi: 'asc' },
      take: 500,
      include: {
        plan: {
          include: {
            dosya: { include: { borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } } } },
            taksitler: { select: { sira: true, tutar: true, durum: true, odenenTutar: true } },
          },
        },
      },
    })
    aday += taksitler.length

    for (const t of taksitler) {
      const plan = t.plan
      // gün hesabı İSTANBUL takvimiyle (format.kalanGun) — UTC gün başı kullanmak kod tabanı
      // konvansiyonundan sapıyordu; Bugün panosu da aynı kaynakla "geciken" tespiti yapar.
      const kalanGun = kalanGunIst(t.vadeTarihi, now)
      const geciken = kalanGun < 0
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
        aliciAd: tn.aliciAd,
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
      const konuT = tenantlar.length > 1 ? konuTenantli(konu, tn.musteriAd) : konu

      if (dry) { detay.push({ tenant: tn.musteriAd, id: t.id, tur, sira: t.sira, vade: t.vadeTarihi.toISOString(), ok: true }); continue }
      const r = await mailGonder({ to: tn.alicilar, konu: konuT, html, text })
      if (r.ok) {
        await prisma.taksit.update({
          where: { id: t.id },
          data: geciken ? { gecikmeBildirildiAt: new Date(), durum: 'GECIKTI' } : { hatirlatmaGonderildiAt: new Date() },
        })
        gonderilen++
      } else hata++
      detay.push({ tenant: tn.musteriAd, id: t.id, tur, sira: t.sira, vade: t.vadeTarihi.toISOString(), ok: r.ok, err: r.error })
    }
  }

  return cronYanit({ ok: hata === 0, dry, tenant: tenantlar.length, aday, gonderilen, hata, detay }, 'taksit-hatirlatma')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
