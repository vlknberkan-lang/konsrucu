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

/**
 * Devreye-alma (go-live) tarihi: YALNIZ bu tarih VE sonrasındaki itirazlar kuyruğa düşer.
 * Geçmiş itirazlar için ekip büyük olasılıkla arabuluculuğu zaten başlatmıştır → otomatik düşmesin.
 * İtirazın (olayın) tarihine göre süzülür. Env ile değiştirilebilir: ONEMLI_OLAY_BASLANGIC=YYYY-MM-DD.
 */
export const ONEMLI_OLAY_BASLANGIC: Date = (() => {
  const raw = (process.env.ONEMLI_OLAY_BASLANGIC ?? '2026-06-25').trim()
  const gecerli = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '2026-06-25'
  const d = new Date(`${gecerli}T00:00:00Z`) // UTC — tarih-yalnız kanonik (gün kayması olmasın)
  return Number.isNaN(d.getTime()) ? new Date('2026-06-25T00:00:00Z') : d
})()

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

/**
 * Evrak adından itiraz TARİHİNİ çıkar. UYAP belgesi ad sonunda tarih taşır
 * (ör. "Borca İtiraz Talebi 2026-06-12.pdf"). ISO (YYYY-MM-DD) ve TR (DD.MM.YYYY / DD-MM-YYYY) kabul.
 * Belge tarihsiz olduğundan go-live süzgeci bu tarihe göre çalışır. Bulunamazsa null.
 */
export function belgeItirazTarihiCikar(dosyaAdi: string | null | undefined): Date | null {
  const s = dosyaAdi ?? ''
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])) // UTC — tarih-yalnız kanonik
    if (!Number.isNaN(d.getTime())) return d
  }
  const tr = s.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/)
  if (tr) {
    const d = new Date(Date.UTC(+tr[3], +tr[2] - 1, +tr[1]))
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

/** tekilAnahtar = dosya + tip + tetik GÜNÜ (YYYY-MM-DD). */
function tekilAnahtarHesapla(dosyaId: string, tetik: Date): string {
  return `${dosyaId}:BORCA_ITIRAZ:${tetik.toISOString().slice(0, 10)}`
}

/**
 * Dosya üzerinden arabuluculuk başlatıldığında (örn. AsamaPanel → asamaKaydet) o dosyadaki AÇIK/İŞLEMDE
 * önemli olayları TAMAMLANDI'ya çevirir → kuyruktan kalkar, Tamamlanan Olaylar'a geçer. Açık olay yoksa no-op.
 * Dönüş: tamamlanan olay sayısı.
 */
export async function onemliOlayDosyadanTamamla(input: {
  dosyaId: string
  basvuruNo?: string | null
  basvuruTarihi?: Date | null
  kullaniciId?: string | null
}): Promise<number> {
  const acik = await prisma.onemliOlay.findMany({ where: { dosyaId: input.dosyaId, durum: { in: ['ACIK', 'ISLEMDE'] } }, select: { id: true } })
  if (acik.length === 0) return 0
  await prisma.onemliOlay.updateMany({
    where: { id: { in: acik.map((o) => o.id) } },
    data: {
      durum: 'TAMAMLANDI',
      basvuruNo: input.basvuruNo || undefined,
      basvuruTarihi: input.basvuruTarihi ?? undefined,
      tamamlayanId: input.kullaniciId ?? undefined,
      tamamlanmaAt: new Date(),
    },
  })
  await prisma.aktivite.create({
    data: { dosyaId: input.dosyaId, kullaniciId: input.kullaniciId ?? null, eylem: `Arabuluculuk dosyadan başlatıldı → önemli olay tamamlandı${input.basvuruNo ? ' · başvuru ' + input.basvuruNo : ''}` },
  })
  return acik.length
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

  // Go-live süzgeci: itiraz tarihi devreye-alma tarihinden önceyse kuyruğa düşürme (geçmiş itirazlar gelmesin).
  if (tetik.getTime() < ONEMLI_OLAY_BASLANGIC.getTime()) return null

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
