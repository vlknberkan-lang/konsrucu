/**
 * KonsRücü — UYAP senkron · GET /api/uyap/evrak-manifest?icraDosyaNo=X
 * Eklentiye "bu dosyada ZATEN sende olan evraklar" listesini verir: evrak kimliği = kaynakRef ilk 20
 * karakteri (UYAP evrakId'sinin stabil öneki; bkz. /api/uyap/evrak). Eklenti bu öneği görürse evrağı
 * UYAP'tan İNDİRMEZ → local storage silinse / eklenti yeniden kurulsa bile mükerrer indirme olmaz.
 * Tenant-kapsamlı (Bearer program oturumu).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'

export const dynamic = 'force-dynamic'

const EVRAK_ONEK = 20 // /api/uyap/evrak ile AYNI değer olmalı (evrak kimliğinin stabil önek uzunluğu)

export function OPTIONS() {
  return preflight()
}

export async function GET(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401)

  const icraDosyaNo = String(new URL(req.url).searchParams.get('icraDosyaNo') ?? '').trim()
  if (!icraDosyaNo) return corsJson({ ok: false, error: 'icraDosyaNo gerekli' }, 400)

  const dosya = await prisma.rucuDosyasi.findFirst({ where: { icraDosyaNo, musteriId: { in: k.izinli } }, select: { id: true } })
  if (!dosya) return corsJson({ ok: false, error: 'dosya bulunamadı (icraDosyaNo)' }, 404)

  // o dosyadaki tüm evrak önekleri (ilk 20) — eklenti bunlarla indirmeden eler
  const rows = await prisma.$queryRaw<{ k: string }[]>(
    Prisma.sql`SELECT DISTINCT LEFT("kaynakRef", ${Prisma.raw(String(EVRAK_ONEK))}) AS k
               FROM "Belge" WHERE "dosyaId" = ${dosya.id} AND "kaynakRef" IS NOT NULL`,
  )
  return corsJson({ ok: true, onekler: rows.map((r) => r.k).filter(Boolean) })
}
