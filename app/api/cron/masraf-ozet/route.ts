/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/masraf-ozet
 * Salı + Perşembe (Vercel Cron). TÜM AKTİF TENANT'LAR için ayrı ayrı: "bizim taraf" YENI/ONAYLI
 * masrafları toplar; tenant ekibine özet e-posta + Excel eki atar.
 * HAZIRLIK e-postasıdır: faturalama Çar/Cuma elle yapılır → masraf DURUMU DEĞİŞTİRİLMEZ.
 * Korumalı: CRON_SECRET. Alıcı = tenant ekibi + o tenant'ın Ayarlar.masrafJson.eposta listesi.
 * Hata varsa HTTP 500 (Vercel panelinde görünür).
 *
 * Manuel test:  GET /api/cron/masraf-ozet?key=<CRON_SECRET>&dry=1   (dry=1 → göndermeden sayar)
 */
import { prisma } from '@/lib/prisma'
import { MASRAF_INCLUDE, masrafToUi } from '@/lib/konsrucu/masraf-sorgu'
import { isoHaftaDonem } from '@/lib/konsrucu/masraf'
import { masrafExcelBuffer } from '@/lib/konsrucu/masraf-excel'
import { masrafOzetMail } from '@/lib/konsrucu/masraf-mail'
import { mailGonder } from '@/lib/konsrucu/mail'
import { cronYetkisiz, cronTenantlar, konuTenantli, cronYanit } from '@/lib/konsrucu/cron-ortak'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'

async function handle(req: Request) {
  const yetkisiz = cronYetkisiz(req)
  if (yetkisiz) return yetkisiz
  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const override = url.searchParams.get('to')

  // Alıcı override'ı PII taşıyan Excel yüzünden tenant beyaz listesine karşı doğrulanır;
  // bu yüzden cronTenantlar'a override GEÇMİYORUZ — tenant başına aşağıda ele alınır.
  const tenantlar = await cronTenantlar(null)
  if (!tenantlar.length) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  let hata = 0
  const detay: Record<string, unknown>[] = []

  for (const t of tenantlar) {
    const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: t.musteriId }, select: { masrafJson: true } })
    const mj = (ayarlar?.masrafJson ?? null) as { eposta?: unknown } | null
    const ayarMail = Array.isArray(mj?.eposta) ? (mj!.eposta as unknown[]).filter((e): e is string => typeof e === 'string' && !!e.trim()) : []

    const izinliSet = new Set([...t.alicilar, ...ayarMail].map((e) => e.trim()).filter(Boolean))
    // Güvenlik: ?to= yalnız izin listesindeki (ekip / Ayarlar.masrafJson) bir adres olabilir — masraf Excel'i PII taşır.
    if (override && !izinliSet.has(override.trim()) && !dry) {
      detay.push({ tenant: t.musteriAd, atlandi: true, neden: 'to= alıcısı bu tenant izin listesinde değil' })
      continue
    }
    const taban = override ? [override] : [...t.alicilar, ...ayarMail]
    const havuz = taban.length ? taban : process.env.RAPOR_ALICI ? [process.env.RAPOR_ALICI] : []
    const alicilar = Array.from(new Set(havuz.map((e) => e.trim()).filter(Boolean)))
    if (!alicilar.length) { hata++; detay.push({ tenant: t.musteriAd, ok: false, err: 'Alıcı bulunamadı (aktif kullanıcı / Ayarlar.masrafJson / RAPOR_ALICI yok)' }); continue }
    const aliciAd = alicilar.length > 1 ? 'Ekip' : t.aliciAd

    // ── aday masraflar: bizim taraf, faturalanmamış (YENI/ONAYLI) ──
    const rows = await prisma.masraf.findMany({
      where: { dosya: { is: { musteriId: t.musteriId } }, taraf: 'BIZ', durum: { in: ['YENI', 'ONAYLI'] } },
      include: MASRAF_INCLUDE,
      orderBy: [{ tarih: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 5000,
    })
    const satirlar = rows.map(masrafToUi)
    // Karar bekleyen (BELIRSIZ) kalemler faturalanmaz ama gözden kaçmasın → e-postada hatırlat.
    const belirsizAdet = await prisma.masraf.count({ where: { dosya: { is: { musteriId: t.musteriId } }, taraf: 'BELIRSIZ', durum: { in: ['YENI', 'ONAYLI'] } } })

    if (!satirlar.length && !belirsizAdet) { detay.push({ tenant: t.musteriAd, bos: true }); continue }

    // ── dosya/müvekkil bazında özet ──
    const grup = new Map<string, { etiket: string; adet: number; tutar: number }>()
    for (const s of satirlar) {
      const etiket = s.hasarDosya ?? s.hukukKodu ?? s.esas ?? s.dosyaId.slice(0, 8)
      const mevcut = grup.get(s.dosyaId)
      if (mevcut) {
        mevcut.adet += 1
        mevcut.tutar += s.tutar
      } else {
        grup.set(s.dosyaId, { etiket, adet: 1, tutar: s.tutar })
      }
    }
    const dosyaOzet = Array.from(grup.values()).map((g) => ({ ...g, tutar: Math.round(g.tutar * 100) / 100 }))
    const toplamTutar = Math.round(satirlar.reduce((tp, s) => tp + s.tutar, 0) * 100) / 100

    const donem = isoHaftaDonem()

    if (dry) {
      detay.push({ tenant: t.musteriAd, dry: true, alicilar, aday: satirlar.length, belirsizAdet, dosyaSayisi: dosyaOzet.length, toplamTutar })
      continue
    }

    // ── Excel eki + özet mail ──
    const buf = await masrafExcelBuffer(satirlar)
    const { konu, html, text } = masrafOzetMail({ aliciAd, donem, toplamTutar, adet: satirlar.length, dosyaOzet, url: `${BASE}/masraf`, belirsizAdet })
    const konuT = tenantlar.length > 1 ? konuTenantli(konu, t.musteriAd) : konu

    const r = await mailGonder({
      to: alicilar,
      konu: konuT,
      html,
      text,
      attachments: [{
        filename: `Masraf-${donem}.xlsx`,
        content: buf,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    })
    if (!r.ok) hata++
    detay.push({ tenant: t.musteriAd, ok: r.ok, alicilar, aday: satirlar.length, dosyaSayisi: dosyaOzet.length, toplamTutar, err: r.error })
  }

  return cronYanit({ ok: hata === 0, dry, tenant: tenantlar.length, hata, detay }, 'masraf-ozet')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
