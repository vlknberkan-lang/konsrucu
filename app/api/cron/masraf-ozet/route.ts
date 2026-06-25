/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/masraf-ozet
 * Salı + Perşembe (Vercel Cron). "Bizim taraf" YENI/ONAYLI masrafları toplar; ekibe özet e-posta + Excel eki atar.
 * HAZIRLIK e-postasıdır: faturalama Çar/Cuma elle yapılır → masraf DURUMU DEĞİŞTİRİLMEZ.
 * Korumalı: CRON_SECRET. Alıcı = ekip (aktif Kullanici.eposta) + Ayarlar.masrafJson.eposta + RAPOR_ALICI fallback.
 *
 * Manuel test:  GET /api/cron/masraf-ozet?key=<CRON_SECRET>&dry=1   (dry=1 → göndermeden sayar)
 */
import { Rol } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { MASRAF_INCLUDE, masrafToUi } from '@/lib/konsrucu/masraf-sorgu'
import { isoHaftaDonem } from '@/lib/konsrucu/masraf'
import { masrafExcelBuffer } from '@/lib/konsrucu/masraf-excel'
import { masrafOzetMail } from '@/lib/konsrucu/masraf-mail'
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

  // ── tenant = ana avukat (ADMIN) üzerinden ──
  const admin = await prisma.kullanici.findFirst({ where: { rol: Rol.ADMIN, aktif: true }, orderBy: { createdAt: 'asc' }, include: { musteriler: true } })
  const musteriId = admin?.musteriler[0]?.musteriId || (await prisma.musteri.findFirst({ where: { aktif: true }, orderBy: { createdAt: 'asc' } }))?.id
  if (!musteriId) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  // ── alıcılar: ekip + Ayarlar.masrafJson.eposta + override/fallback, tekilleştir ──
  const ekip = await prisma.kullanici.findMany({ where: { aktif: true, musteriler: { some: { musteriId } } }, orderBy: { createdAt: 'asc' }, select: { eposta: true } })
  const ekipMail = ekip.map((k) => k.eposta).filter(Boolean)

  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId }, select: { masrafJson: true } })
  const mj = (ayarlar?.masrafJson ?? null) as { eposta?: unknown } | null
  const ayarMail = Array.isArray(mj?.eposta) ? (mj!.eposta as unknown[]).filter((e): e is string => typeof e === 'string' && !!e.trim()) : []

  const dry = url.searchParams.get('dry') === '1'
  const override = url.searchParams.get('to')
  const izinliSet = new Set([...ekipMail, ...ayarMail].map((e) => e.trim()).filter(Boolean))
  // Güvenlik: ?to= yalnız izin listesindeki (ekip / Ayarlar.masrafJson) bir adres olabilir — masraf Excel'i PII taşır.
  if (override && !izinliSet.has(override.trim()) && !dry) {
    return Response.json({ ok: false, error: 'to= alıcısı izin listesinde değil (ekip / Ayarlar.masrafJson)' }, { status: 403 })
  }
  const taban = override ? [override] : [...ekipMail, ...ayarMail]
  const havuz = taban.length ? taban : process.env.RAPOR_ALICI ? [process.env.RAPOR_ALICI] : admin?.eposta ? [admin.eposta] : []
  const alicilar = Array.from(new Set(havuz.map((e) => e.trim()).filter(Boolean)))
  const aliciAd = alicilar.length > 1 ? 'Ekip' : admin?.ad?.split(/\s+/)[0] || 'Avukat'
  if (!alicilar.length) return Response.json({ ok: false, error: 'Alıcı bulunamadı (aktif kullanıcı / Ayarlar.masrafJson / RAPOR_ALICI yok)' }, { status: 500 })

  // ── aday masraflar: bizim taraf, faturalanmamış (YENI/ONAYLI) ──
  const rows = await prisma.masraf.findMany({
    where: { dosya: { is: { musteriId } }, taraf: 'BIZ', durum: { in: ['YENI', 'ONAYLI'] } },
    include: MASRAF_INCLUDE,
    orderBy: [{ tarih: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 5000,
  })
  const satirlar = rows.map(masrafToUi)
  // Karar bekleyen (BELIRSIZ) kalemler faturalanmaz ama gözden kaçmasın → e-postada hatırlat.
  const belirsizAdet = await prisma.masraf.count({ where: { dosya: { is: { musteriId } }, taraf: 'BELIRSIZ', durum: { in: ['YENI', 'ONAYLI'] } } })

  if (!satirlar.length && !belirsizAdet) return Response.json({ ok: true, bos: true })

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
  const toplamTutar = Math.round(satirlar.reduce((t, s) => t + s.tutar, 0) * 100) / 100

  const donem = isoHaftaDonem()

  if (dry) {
    return Response.json({ ok: true, dry: true, alicilar, aday: satirlar.length, belirsizAdet, dosyaSayisi: dosyaOzet.length, toplamTutar })
  }

  // ── Excel eki + özet mail ──
  const buf = await masrafExcelBuffer(satirlar)
  const { konu, html, text } = masrafOzetMail({ aliciAd, donem, toplamTutar, adet: satirlar.length, dosyaOzet, url: `${BASE}/masraf`, belirsizAdet })

  const r = await mailGonder({
    to: alicilar,
    konu,
    html,
    text,
    attachments: [{
      filename: `Ray-Masraf-${donem}.xlsx`,
      content: buf,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  })

  return Response.json({ ok: r.ok, alicilar, aday: satirlar.length, dosyaSayisi: dosyaOzet.length, toplamTutar, gonderildi: r.ok, error: r.error })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
