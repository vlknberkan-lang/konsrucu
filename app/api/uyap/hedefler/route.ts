/**
 * KonsRücü — UYAP senkron · GET /api/uyap/hedefler
 * Eklentiye "şunları takip et" listesini verir: takibi açılmış (icraDosyaNo dolu) AKTİF dosyalar.
 * Tenant-kapsamlı (Bearer program oturumu). Eklenti bu listeyi çekip her icrayı UYAP'ta sorgular.
 *
 * ARTIMLI (incremental — eklenti her dosyayı tekrar tekrar çekmesin): yalnız SENKRON GEREKENLER döner.
 *  • hiç çekilmemiş (uyapSenkronAt = null) → daima dahil, en yüksek öncelik.
 *  • bayat (son `tazeSaat` saatte çekilmemiş) → dahil. Taze olanlar listeden DÜŞER → her tur küçük kalır.
 *  • sıralama: en eski/hiç-çekilmemiş ÖNCE → eklenti backlog'u eritir, her şey ~tazeSaat içinde tazelenir.
 *  ?tazeSaat=12 (varsayılan) · ?tazeSaat=0 → pencereyi kapat (tüm aktifleri döndür, ilk tam tarama için).
 */
import type { DosyaDurum, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'
import { KAPALI_DURUMLAR, uyapKapaliMi } from '@/lib/konsrucu/aktiflik'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return preflight()
}

export async function GET(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401)

  const url = new URL(req.url)
  const tazeSaat = Math.max(0, Number(url.searchParams.get('tazeSaat') ?? 12) || 0)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 1000) || 1000, 1), 2000)
  const cutoff = tazeSaat > 0 ? new Date(Date.now() - tazeSaat * 3_600_000) : null

  // AKTİFLİK KAPISI (Faz 0): kapanmış dosyaları düşür — durum notIn (DB, indeksli) + uyapDurum "Kapalı" (JS).
  // ARTIMLI: cutoff varsa yalnız hiç-çekilmemiş VEYA bayat dosyalar (taze olanlar dışarıda kalır).
  const where: Prisma.RucuDosyasiWhereInput = {
    musteriId: { in: k.izinli },
    icraDosyaNo: { not: null },
    durum: { notIn: KAPALI_DURUMLAR as unknown as DosyaDurum[] },
    ...(cutoff ? { OR: [{ uyapSenkronAt: null }, { uyapSenkronAt: { lt: cutoff } }] } : {}),
  }
  const ham = await prisma.rucuDosyasi.findMany({
    where,
    select: {
      id: true, icraDosyaNo: true, icraDairesi: true, yetkiliIcra: true,
      hukukDosyaNo: true, hasarDosyaNo: true, durum: true, uyapDurum: true, uyapSenkronAt: true,
    },
    orderBy: [{ uyapSenkronAt: { sort: 'asc', nulls: 'first' } }, { takipTarihi: 'desc' }], // en eski/hiç-çekilmemiş önce
    take: limit,
  })
  const dosyalar = ham.filter((d) => !uyapKapaliMi(d.uyapDurum))

  // Toplam aktif (pencere uygulanmadan) — "kaç dosya senkron bekliyor / kaçı taze" şeffaflığı.
  const aktifToplam = await prisma.rucuDosyasi.count({
    where: { musteriId: { in: k.izinli }, icraDosyaNo: { not: null }, durum: { notIn: KAPALI_DURUMLAR as unknown as DosyaDurum[] } },
  })

  return corsJson({
    ok: true,
    sayi: dosyalar.length,
    tazeSaat,
    aktifToplam, // tüm aktif dosya (uyapDurum-kapalı dahil olabilir; kaba)
    bekleyen: dosyalar.length, // bu turda çekilecek (senkron gereken)
    haricTutulan: ham.length - dosyalar.length, // UYAP-kapalı olup süzülenler
    hedefler: dosyalar.map((d) => ({
      id: d.id,
      icraDosyaNo: d.icraDosyaNo, // esas no (ör. 2026/798)
      daire: d.icraDairesi || d.yetkiliIcra || null,
      hukukDosyaNo: d.hukukDosyaNo,
      hasarDosyaNo: d.hasarDosyaNo,
      durum: d.durum,
      uyapDurum: d.uyapDurum,
      sonSenkron: d.uyapSenkronAt ? d.uyapSenkronAt.toISOString() : null,
    })),
  })
}
