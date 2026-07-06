/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/takip-gorevi-hatirlatma
 * Günde bir (Vercel Cron) — son tarihi yaklaşan/geçen, açık (ACIK/ISLEMDE), sorumlusu olan ve
 * henüz hatırlatılmamış takip görevleri için SORUMLUSUNA hatırlatma e-postası yollar.
 * Mükerrer önleme: TakipGorevi.hatirlatmaGonderildiAt. Korumalı: CRON_SECRET (Bearer ya da ?key=).
 *
 * Manuel test:  GET /api/cron/takip-gorevi-hatirlatma?key=<CRON_SECRET>&dry=1   (göndermeden listeler)
 */
import { prisma } from '@/lib/prisma'
import { mailGonder } from '@/lib/konsrucu/mail'
import { takipGoreviMail } from '@/lib/konsrucu/takip-gorevi-mail'
import { GOREV_INCLUDE, gorevMailGirdisi } from '@/lib/konsrucu/takip-gorevi'
import { cronYetkisiz, cronYanit } from '@/lib/konsrucu/cron-ortak'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'
const PENCERE_MS = 24 * 60 * 60 * 1000 // son tarihten 1 gün önce hatırlat (veya geçtiyse)

async function handle(req: Request) {
  const yetkisiz = cronYetkisiz(req)
  if (yetkisiz) return yetkisiz
  const url = new URL(req.url)

  const now = new Date()
  // adaylar: açık, sorumlusu var, son tarihi var, henüz hatırlatılmamış, son tarihi 1 günden yakın veya geçmiş.
  // AKTİFLİK: pasifleştirilen kullanıcıya (ofisten ayrılan) ya da pasif tenant'ın dosyasına mail GİTMEZ —
  // diğer cron'lar cronTenantlar ile aynı süzgeci uygular; bu rota görev-bazlı olduğundan where'de uygular.
  const due = await prisma.takipGorevi.findMany({
    where: {
      durum: { in: ['ACIK', 'ISLEMDE'] },
      sorumluId: { not: null },
      sorumlu: { is: { aktif: true } },
      dosya: { musteri: { aktif: true } },
      sonTarih: { not: null, lte: new Date(now.getTime() + PENCERE_MS) },
      hatirlatmaGonderildiAt: null,
    },
    orderBy: { sonTarih: 'asc' },
    take: 200,
    include: GOREV_INCLUDE,
  })

  // atayan adlarını toplu çek (mail başlığı için)
  const atayanIds = [...new Set(due.map((g) => g.atayanId).filter((x): x is string => !!x))]
  const atayanlar = atayanIds.length ? await prisma.kullanici.findMany({ where: { id: { in: atayanIds } }, select: { id: true, ad: true } }) : []
  const atayanMap = new Map(atayanlar.map((a) => [a.id, a.ad]))

  const override = url.searchParams.get('to')
  const dry = url.searchParams.get('dry') === '1'
  let gonderilen = 0
  let hata = 0
  const detay: { id: string; baslik: string; sorumlu: string | null; sonTarih: string | null; ok: boolean; err?: string }[] = []

  for (const g of due) {
    const alici = override || g.sorumlu?.eposta
    if (!alici) { detay.push({ id: g.id, baslik: g.baslik, sorumlu: null, sonTarih: g.sonTarih?.toISOString() ?? null, ok: false, err: 'sorumlu e-postası yok' }); hata++; continue }
    const atayanAd = g.atayanId ? atayanMap.get(g.atayanId) ?? null : null
    const { konu, html, text } = takipGoreviMail(gorevMailGirdisi(g, { atayanAd, baseUrl: BASE }))
    if (dry) { detay.push({ id: g.id, baslik: g.baslik, sorumlu: g.sorumlu?.ad ?? null, sonTarih: g.sonTarih?.toISOString() ?? null, ok: true }); continue }
    const r = await mailGonder({ to: alici, konu, html, text })
    if (r.ok) { await prisma.takipGorevi.update({ where: { id: g.id }, data: { hatirlatmaGonderildiAt: new Date() } }); gonderilen++ }
    else hata++
    detay.push({ id: g.id, baslik: g.baslik, sorumlu: g.sorumlu?.ad ?? null, sonTarih: g.sonTarih?.toISOString() ?? null, ok: r.ok, err: r.error })
  }

  return cronYanit({ ok: hata === 0, dry, aday: due.length, gonderilen, hata, detay }, 'takip-gorevi-hatirlatma')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
