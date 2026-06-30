/**
 * KonsRücü — UYAP senkron · GET /api/uyap/hedefler
 * Eklentiye "şunları takip et" listesini verir: takibi açılmış (icraDosyaNo dolu) dosyalar.
 * Tenant-kapsamlı (Bearer program oturumu). Eklenti bu listeyi çekip her icrayı UYAP'ta sorgular.
 */
import type { DosyaDurum } from '@prisma/client'
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

  // AKTİFLİK KAPISI (Faz 0 — boşa-loop/maliyet): kapanmış dosyaları poll listesinden düşür.
  //  • durum: TAHSIL/KAPANDI/IDARI_YOL → DB'de notIn (ucuz, enum-indeksli).
  //  • uyapDurum "Kapalı"/"Kapandı" → JS'te uyapKapaliMi (tek kaynak; Türkçe İ/ı ILIKE tuzağından kaçınır).
  const ham = await prisma.rucuDosyasi.findMany({
    where: {
      musteriId: { in: k.izinli },
      icraDosyaNo: { not: null },
      durum: { notIn: KAPALI_DURUMLAR as unknown as DosyaDurum[] },
    },
    select: {
      id: true, icraDosyaNo: true, icraDairesi: true, yetkiliIcra: true,
      hukukDosyaNo: true, hasarDosyaNo: true, durum: true, uyapDurum: true, uyapSenkronAt: true,
    },
    orderBy: { takipTarihi: 'desc' },
    take: 2000,
  })
  const dosyalar = ham.filter((d) => !uyapKapaliMi(d.uyapDurum))

  return corsJson({
    ok: true,
    sayi: dosyalar.length,
    haricTutulan: ham.length - dosyalar.length, // UYAP-kapalı olup süzülenler (şeffaflık; durum-kapalılar DB'de düştü)
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
