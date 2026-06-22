/**
 * KonsRücü — UYAP senkron · POST /api/uyap/senkron
 * Eklenti her takip için durum + finansal + yeni olayları gönderir; icraDosyaNo ile dosyaya bağlanır.
 * Idempotent: aynı olay (tip+tarih+açıklama) tekrar yazılmaz. Tenant-kapsamlı (Bearer program oturumu).
 *
 * Gövde: { icraDosyaNo, durum?, hesap?:{asilAlacak,islemisFaiz,tahsilat,bakiye,...},
 *          olaylar?:[{tip, tarih?, tutar?, aciklama?}] }
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { takipOlayKaydet } from '@/lib/konsrucu/takip-olay'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return preflight()
}

const dec = (v: unknown): Prisma.Decimal | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? new Prisma.Decimal(Math.round(n * 100) / 100) : null
}
const tarihParse = (v: unknown): Date | null => {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401)

  let body: { icraDosyaNo?: string; durum?: string; hesap?: Record<string, unknown>; olaylar?: { tip?: string; tarih?: string; tutar?: number; aciklama?: string }[] }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400) }

  const icraDosyaNo = String(body?.icraDosyaNo ?? '').trim()
  if (!icraDosyaNo) return corsJson({ ok: false, error: 'icraDosyaNo gerekli' }, 400)

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { icraDosyaNo, musteriId: { in: k.izinli } },
    select: { id: true },
  })
  if (!dosya) return corsJson({ ok: false, error: 'dosya bulunamadı (icraDosyaNo)' }, 404)

  // durum + finansal snapshot
  await prisma.rucuDosyasi.update({
    where: { id: dosya.id },
    data: {
      uyapDurum: body?.durum ? String(body.durum).slice(0, 80) : undefined,
      uyapSenkronAt: new Date(),
      uyapHesapJson: body?.hesap && typeof body.hesap === 'object' ? (body.hesap as Prisma.InputJsonValue) : undefined,
    },
  })

  // yeni olaylar (tip+tarih+açıklama tekrarını atla)
  let eklenen = 0
  const olaylar = Array.isArray(body?.olaylar) ? body!.olaylar! : []
  for (const o of olaylar) {
    const tip = String(o?.tip ?? '').trim()
    if (!tip) continue
    const tarih = tarihParse(o?.tarih)
    const aciklama = o?.aciklama ? String(o.aciklama).slice(0, 2000) : null
    const mevcut = await prisma.takipOlayi.findFirst({ where: { dosyaId: dosya.id, tip, tarih, aciklama }, select: { id: true } })
    if (mevcut) continue
    await takipOlayKaydet(dosya.id, null, { tip, tarih: tarih ?? new Date(), tutar: dec(o?.tutar), aciklama, hamJson: { kaynak: 'uyap' } as Prisma.InputJsonValue })
    eklenen++
  }

  return corsJson({ ok: true, dosyaId: dosya.id, yeniOlay: eklenen })
}
