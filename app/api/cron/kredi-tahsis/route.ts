/**
 * KonsLaw — Aylık AI kredi tahsisi · GET /api/cron/kredi-tahsis (günlük 05:00 TRT)
 * Paralı planlarda (BASLANGIC/BURO) donemBasi + 30 gün dolan hesapların kredisi plan
 * kotasına YENİLENİR (birikmez — kullan ya da kaybet) ve donemBasi ilerletilir.
 * FREE (tek seferlik kredi) ve KURUMSAL (sınırsız) donemBasi=null → hiç dokunulmaz.
 * İdempotent: aynı gün ikinci koşu donemBasi ilerlediği için tekrar yenilemez.
 * Manuel test: GET /api/cron/kredi-tahsis?key=<CRON_SECRET>&dry=1
 */
import { prisma } from '@/lib/prisma'
import { cronYetkisiz, cronYanit } from '@/lib/konsrucu/cron-ortak'
import { PLAN_AYLIK_KREDI, donemYenileHesabi } from '@/lib/konsrucu/ai-kredi'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(req: Request) {
  const yetkisiz = cronYetkisiz(req)
  if (yetkisiz) return yetkisiz
  const dry = new URL(req.url).searchParams.get('dry') === '1'

  const adaylar = await prisma.musteri.findMany({
    where: { aktif: true, donemBasi: { not: null }, plan: { in: ['BASLANGIC', 'BURO'] } },
    select: { id: true, ad: true, plan: true, aiKredi: true, donemBasi: true },
  })

  const simdi = new Date()
  let yenilenen = 0
  let hata = 0
  const detay: { ad: string; plan: string; eskiKredi: number; ok: boolean; err?: string }[] = []

  for (const m of adaylar) {
    const { yenile, yeniDonemBasi } = donemYenileHesabi(m.donemBasi as Date, simdi)
    if (!yenile) continue
    const kota = PLAN_AYLIK_KREDI[m.plan] ?? 0
    if (dry) { detay.push({ ad: m.ad, plan: m.plan, eskiKredi: m.aiKredi, ok: true }); yenilenen++; continue }
    try {
      await prisma.$transaction([
        prisma.musteri.update({ where: { id: m.id }, data: { aiKredi: kota, donemBasi: yeniDonemBasi } }),
        prisma.aktivite.create({
          data: { eylem: `[SISTEM] Aylık kredi tahsisi: ${m.ad} · ${m.plan} → ${kota} kredi (kalan ${m.aiKredi} sıfırlandı)` },
        }),
      ])
      yenilenen++
      detay.push({ ad: m.ad, plan: m.plan, eskiKredi: m.aiKredi, ok: true })
    } catch (e) {
      hata++
      detay.push({ ad: m.ad, plan: m.plan, eskiKredi: m.aiKredi, ok: false, err: (e as Error).message })
    }
  }

  return cronYanit({ ok: hata === 0, dry, aday: adaylar.length, yenilenen, hata, detay }, 'kredi-tahsis')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
