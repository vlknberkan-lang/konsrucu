/**
 * KonsRücü — Zamanlı görev · GET/POST /api/cron/uyap-senkron-sagligi
 * Hafta içi 09:00 TRT (Vercel Cron). UYAP olay/evrak akışı, Chrome eklentisinin açık bir UYAP
 * oturumuyla poll etmesine bağlı — Chrome kapalı / oturum düşmüş / anahtar silinmişse akış GÜNLERCE
 * sessizce kesilir ve tebliğ/itiraz olayları gelmez. Bu bekçi, tenant başına son senkron tazeliğini
 * kontrol eder; eşik aşıldıysa ekibe uyarı maili atar.
 *
 * Eşik: hafta içi 28 saat (dün çalışmadıysa alarm); pazartesi 76 saat (hafta sonu Chrome kapalı olması
 * normaldir, cuma gününe bakılır). Hedefi olmayan tenant (hiç aktif icra dosyası yok) atlanır.
 *
 * Manuel test:  GET /api/cron/uyap-senkron-sagligi?key=<CRON_SECRET>&dry=1
 */
import type { DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { mailGonder } from '@/lib/konsrucu/mail'
import { cronYetkisiz, cronTenantlar, cronYanit } from '@/lib/konsrucu/cron-ortak'
import { KAPALI_DURUMLAR } from '@/lib/konsrucu/aktiflik'
import { tarihSaatTR } from '@/lib/konsrucu/format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'
const SAAT_MS = 3_600_000

function uyariMail(p: { aliciAd: string; musteriAd: string; sonSenkron: Date | null; saatOnce: number | null; aktifToplam: number; bekleyen: number }) {
  const konu = `⚠️ UYAP senkronu durdu — ${p.musteriAd} · ${p.bekleyen} dosya bekliyor`
  const durumSatiri = p.sonSenkron
    ? `Son senkron: <b>${tarihSaatTR(p.sonSenkron)}</b> (~${p.saatOnce} saat önce).`
    : `Eklenti bu şirket için <b>hiç senkron göndermedi</b>.`
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:100%;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;">
    <tr><td style="background:#b91c1c;padding:18px 22px;border-radius:14px 14px 0 0;">
      <div style="color:#fecaca;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-family:monospace;">KonsRücu · UYAP Senkron Bekçisi</div>
      <div style="color:#fff;font-size:20px;font-weight:800;margin-top:4px;">Eklenti susmuş görünüyor</div>
    </td></tr>
    <tr><td style="padding:18px 22px;">
      <p style="margin:0 0 10px;font-size:14px;color:#1e293b;">Merhaba <b>${p.aliciAd}</b>,</p>
      <p style="margin:0 0 10px;font-size:13.5px;color:#334155;"><b>${p.musteriAd}</b> için UYAP eklentisinden veri gelmiyor. ${durumSatiri}</p>
      <p style="margin:0 0 10px;font-size:13.5px;color:#334155;">Takipte <b>${p.aktifToplam}</b> aktif dosya var; <b>${p.bekleyen}</b> dosya senkron bekliyor. Bu sürede gelen <b>tebliğ / itiraz / haciz</b> olayları programa DÜŞMEZ.</p>
      <p style="margin:0 0 4px;font-size:13.5px;color:#334155;">Kontrol listesi:</p>
      <ol style="margin:0 0 12px;padding-left:18px;font-size:13px;color:#334155;">
        <li>Chrome açık mı, UYAP Avukat Portal oturumu aktif mi?</li>
        <li>Eklenti yüklü ve etkin mi (uzantılar sayfası)?</li>
        <li>Senkron anahtarı doğru mu? (Ayarlar → Senkron Anahtarı)</li>
      </ol>
      <a href="${BASE}/ayarlar" style="display:inline-block;background:#1897a0;color:#fff;text-decoration:none;font-size:13.5px;font-weight:600;padding:9px 16px;border-radius:10px;">Ayarları aç →</a>
    </td></tr>
  </table></body></html>`
  const text = `UYAP senkronu durdu — ${p.musteriAd}\n${p.sonSenkron ? `Son senkron: ${tarihSaatTR(p.sonSenkron)} (~${p.saatOnce} saat önce)` : 'Eklenti hiç senkron göndermedi'}\nAktif dosya: ${p.aktifToplam} · bekleyen: ${p.bekleyen}\nChrome + UYAP oturumu + eklenti + senkron anahtarını kontrol edin. ${BASE}/ayarlar`
  return { konu, html, text }
}

async function handle(req: Request) {
  const yetkisiz = cronYetkisiz(req)
  if (yetkisiz) return yetkisiz
  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const override = url.searchParams.get('to')

  const tenantlar = await cronTenantlar(override)
  if (!tenantlar.length) return Response.json({ ok: false, error: 'Aktif müşteri (tenant) bulunamadı' }, { status: 500 })

  const simdi = new Date()
  // Pazartesi hafta sonuna bakılır (Chrome kapalı olması normal) → geniş eşik. İstanbul günü esas alınır.
  const istGun = new Date(simdi.getTime() + 3 * SAAT_MS).getUTCDay() // 1 = pazartesi
  const esikSaat = istGun === 1 ? 76 : 28

  let hata = 0
  const detay: Record<string, unknown>[] = []

  for (const t of tenantlar) {
    const aktifWhere = { musteriId: t.musteriId, icraDosyaNo: { not: null }, durum: { notIn: KAPALI_DURUMLAR as unknown as DosyaDurum[] } }
    const [aktifToplam, sonKayit] = await Promise.all([
      prisma.rucuDosyasi.count({ where: aktifWhere }),
      prisma.rucuDosyasi.findFirst({ where: { ...aktifWhere, uyapSenkronAt: { not: null } }, orderBy: { uyapSenkronAt: 'desc' }, select: { uyapSenkronAt: true } }),
    ])
    if (aktifToplam === 0) { detay.push({ tenant: t.musteriAd, atlandi: true, neden: 'aktif icra dosyası yok' }); continue }

    const sonSenkron = sonKayit?.uyapSenkronAt ?? null
    const saatOnce = sonSenkron ? Math.round((simdi.getTime() - sonSenkron.getTime()) / SAAT_MS) : null
    const bayat = !sonSenkron || (saatOnce !== null && saatOnce >= esikSaat)
    // bekleyen: eşikten beri hiç senkronlanmamış aktif dosyalar
    const bekleyen = await prisma.rucuDosyasi.count({
      where: { ...aktifWhere, OR: [{ uyapSenkronAt: null }, { uyapSenkronAt: { lt: new Date(simdi.getTime() - esikSaat * SAAT_MS) } }] },
    })

    if (!bayat) { detay.push({ tenant: t.musteriAd, saglikli: true, sonSenkron: sonSenkron?.toISOString(), saatOnce, aktifToplam }); continue }
    if (!t.alicilar.length) { hata++; detay.push({ tenant: t.musteriAd, ok: false, err: 'Alıcı bulunamadı' }); continue }

    const { konu, html, text } = uyariMail({ aliciAd: t.aliciAd, musteriAd: t.musteriAd, sonSenkron, saatOnce, aktifToplam, bekleyen })
    if (dry) { detay.push({ tenant: t.musteriAd, dry: true, uyari: true, sonSenkron: sonSenkron?.toISOString() ?? null, saatOnce, esikSaat, aktifToplam, bekleyen, konu }); continue }
    const r = await mailGonder({ to: t.alicilar, konu, html, text })
    if (!r.ok) hata++
    detay.push({ tenant: t.musteriAd, uyari: true, ok: r.ok, sonSenkron: sonSenkron?.toISOString() ?? null, saatOnce, aktifToplam, bekleyen, err: r.error })
  }

  return cronYanit({ ok: hata === 0, dry, esikSaat, hata, detay }, 'uyap-senkron-sagligi')
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
