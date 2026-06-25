/**
 * KonsRücü — Önemli Olay tespiti · lib/konsrucu/onemli-olay.ts (server-only)
 *
 * Çekilen dosyalarda YENİ bir "borca itiraz" yakalandığında dosyayı Önemli Olaylar kuyruğuna düşürür.
 * İki kaynaktan tetiklenir (kullanıcı kararı: "ikisi de"):
 *   1) Takip olayı  — tip='ITIRAZ' veya açıklaması tetik desenlerine uyuyor (takipOlayKaydet kancası)
 *   2) İnen evrak   — dosya adı tetik desenlerine uyuyor (/api/uyap/evrak kancası)
 *
 * Mükerrerlik önleme: tekilAnahtar = dosya + tip + tetik GÜNÜ. Aynı gün hem olaydan hem evraktan
 * gelen aynı itiraz TEK kayıtta birleşir; eski/işlenmiş itiraz tekrar düşmez (kabul kriteri).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Tetik desenleri (normalize/ascii). Ayarlar.onemliOlayAyarJson ile genişletilebilir. */
export const VARSAYILAN_TETIK_DESENLER = ['borca itiraz', 'odeme emrine itiraz', 'itiraz dilek'] as const

/** Türkçe-duyarlı normalize: küçük harf (tr) + aksan sadeleştir + birleşik nokta (İ) temizle. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
    .replace(/̇/g, '') // birleşik nokta (İ → i + ̇)
}

/** Ayarlar JSON'undan ek tetik desenlerini oku (yoksa yalnız varsayılan). */
export function tetikDesenleriOku(onemliOlayAyarJson: Prisma.JsonValue | null | undefined): string[] {
  const ek =
    onemliOlayAyarJson && typeof onemliOlayAyarJson === 'object' && !Array.isArray(onemliOlayAyarJson)
      ? (onemliOlayAyarJson as { tetikDesenler?: unknown }).tetikDesenler
      : null
  const ekDizi = Array.isArray(ek) ? ek.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(norm) : []
  return [...new Set([...VARSAYILAN_TETIK_DESENLER, ...ekDizi])]
}

/** Bir takip olayı borca itiraz mı? tip='ITIRAZ' (yapısal sinyal) ya da açıklama desene uyuyor. */
export function borcaItirazMi(tip: string | null | undefined, aciklama?: string | null, desenler: string[] = [...VARSAYILAN_TETIK_DESENLER]): boolean {
  if ((tip ?? '').trim().toUpperCase() === 'ITIRAZ') return true
  const a = norm(aciklama)
  return a.length > 0 && desenler.some((d) => a.includes(d))
}

/** İnen evrak adı borca itiraz dilekçesi mi? (anlamlı desenler — bare "itiraz" değil: "itirazın reddi" yanlış pozitifini eler.) */
export function belgeBorcaItirazMi(dosyaAdi: string | null | undefined, desenler: string[] = [...VARSAYILAN_TETIK_DESENLER]): boolean {
  const a = norm(dosyaAdi)
  return a.length > 0 && desenler.some((d) => a.includes(d))
}

/** tekilAnahtar = dosya + tip + tetik GÜNÜ (YYYY-MM-DD). */
function tekilAnahtarHesapla(dosyaId: string, tetik: Date): string {
  return `${dosyaId}:BORCA_ITIRAZ:${tetik.toISOString().slice(0, 10)}`
}

/**
 * Borca itiraz tespit edildiğinde Önemli Olay (ACIK) kaydı oluşturur (idempotent).
 * Yeni oluştuysa Aktivite loglar. Var olan kaydı bozmaz (mükerrer → no-op).
 * Dönüş: { olusturuldu, id } | null (hiç oluşmadıysa/çakışma çözülemediyse).
 */
export async function onemliOlayTespit(input: {
  dosyaId: string
  tetikTarihi?: Date | null
  kaynakOlayId?: string | null
  kaynakBelgeId?: string | null
  baslik?: string | null
  kullaniciId?: string | null
}): Promise<{ olusturuldu: boolean; id: string } | null> {
  const tetik = input.tetikTarihi && !Number.isNaN(input.tetikTarihi.getTime()) ? input.tetikTarihi : new Date()
  const tekilAnahtar = tekilAnahtarHesapla(input.dosyaId, tetik)

  const mevcut = await prisma.onemliOlay.findUnique({ where: { tekilAnahtar }, select: { id: true } })
  if (mevcut) return { olusturuldu: false, id: mevcut.id }

  try {
    const olay = await prisma.onemliOlay.create({
      data: {
        dosyaId: input.dosyaId,
        tip: 'BORCA_ITIRAZ',
        durum: 'ACIK',
        kaynakOlayId: input.kaynakOlayId ?? null,
        kaynakBelgeId: input.kaynakBelgeId ?? null,
        tetikTarihi: tetik,
        baslik: (input.baslik ?? 'Borca itiraz').trim().slice(0, 200) || 'Borca itiraz',
        tekilAnahtar,
      },
      select: { id: true },
    })
    await prisma.aktivite.create({
      data: {
        dosyaId: input.dosyaId,
        kullaniciId: input.kullaniciId ?? null,
        eylem: `Önemli olay: Borca itiraz yakalandı${input.baslik ? ' · ' + input.baslik.trim().slice(0, 120) : ''}`,
      },
    })
    return { olusturuldu: true, id: olay.id }
  } catch (e) {
    // Eşzamanlı tetik (olay + evrak aynı anda) → unique çakışmasını sessizce çöz.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const m = await prisma.onemliOlay.findUnique({ where: { tekilAnahtar }, select: { id: true } })
      return m ? { olusturuldu: false, id: m.id } : null
    }
    throw e
  }
}
