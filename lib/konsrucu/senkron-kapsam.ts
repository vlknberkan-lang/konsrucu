/**
 * KonsLaw — UYAP senkron kapsamı · lib/konsrucu/senkron-kapsam.ts
 * Eklentinin tarayacağı dosyaları "canlı küme" ile sınırlar; geri kalan portföy arşivde bekler
 * (silinmez, yalnız otomatik taramaya girmez). İki ortam değişkeni, ikisi de isteğe bağlı:
 *  • UYAP_SENKRON_KAPSAMI                → virgüllü hukuk dosya no listesi (ör. "160638,159038")
 *  • UYAP_SENKRON_YENI_DOSYA_BASLANGIC   → ISO tarih; bu tarihten sonra oluşturulan dosyalar kapsamda
 * İkisi de yoksa kapsam yoktur (eski davranış: tüm aktif dosyalar).
 */
import type { Prisma } from '@prisma/client'

export type SenkronKapsami = { hukukNolar: string[]; yeniDosyaBaslangic: Date | null }

export function senkronKapsamiOku(env: Record<string, string | undefined> = process.env): SenkronKapsami | null {
  const hukukNolar = (env.UYAP_SENKRON_KAPSAMI ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const ham = env.UYAP_SENKRON_YENI_DOSYA_BASLANGIC?.trim()
  const tarih = ham ? new Date(ham) : null
  const yeniDosyaBaslangic = tarih && !Number.isNaN(tarih.getTime()) ? tarih : null
  if (!hukukNolar.length && !yeniDosyaBaslangic) return null
  return { hukukNolar, yeniDosyaBaslangic }
}

/** Mevcut where'e eklenecek kapsam koşulu (AND ile). Kapsam yoksa boş nesne. */
export function senkronKapsamKosulu(kapsam: SenkronKapsami | null): Prisma.RucuDosyasiWhereInput {
  if (!kapsam) return {}
  const veya: Prisma.RucuDosyasiWhereInput[] = []
  if (kapsam.hukukNolar.length) veya.push({ hukukDosyaNo: { in: kapsam.hukukNolar } })
  if (kapsam.yeniDosyaBaslangic) veya.push({ createdAt: { gte: kapsam.yeniDosyaBaslangic } })
  return { AND: [{ OR: veya }] }
}
