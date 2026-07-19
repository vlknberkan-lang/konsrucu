/**
 * KonsLaw — AI kredi & maliyet katmanı · lib/konsrucu/ai-kredi.ts (server)
 *
 * PARA YAKAN yol burası — kurallar:
 *  1) Kredi düşümü ATOMİK: updateMany + koşullu where (aiKredi >= bedel). Yarış koşulunda
 *     iki paralel istek aynı krediyi iki kez harcayamaz; yetersizse count=0 → KrediYetersizHata.
 *  2) Rezerv ÖNCE, çağrı SONRA: API çağrısı patlarsa kredi İADE edilir (best-effort).
 *  3) Her çağrı AiKullanim'a loglanır (token + USD) — bakiyeden bağımsız, KURUMSAL dahil.
 *  4) Acil fren: AI_DURDUR=1 env'i tüm AI çağrılarını kapatır (fatura kaçağı/olay anında).
 *  5) KURUMSAL plan kredi kontrolünden muaf ama LOG'dan muaf değil.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** İşlem (yüzey) → kredi bedeli. 0 = ücretsiz (yalnız loglanır). Pazarlamayla birebir aynı tablo. */
export const KREDI_BEDELI: Record<string, number> = {
  cikarim: 3, // dosya AI çıkarımı
  dilekce: 3,
  emsal: 2, // arama+eleme+gerekçe zinciri tek işlem sayılır
  soru: 1, // Dosyaya Sor
  yol: 1, // Yol Göster
  makbuz: 0, // masraf makbuz okuma — bilinçli ücretsiz (çoğu yerel, maliyet önemsiz)
  foto: 0, // hasar foto seçimi — çıkarımın parçası
}

/** Model → [giriş, çıkış] USD / 1M token. Yeni model eklenirse buraya da eklenmeli. */
const MODEL_FIYAT: Record<string, [number, number]> = {
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5-20251001': [1, 5],
  'claude-haiku-4-5': [1, 5],
}

/** Token kullanımını USD maliyete çevir (bilinmeyen model → muhafazakâr Sonnet fiyatı + uyarı logu). */
export function maliyetUsd(model: string, girisToken: number, cikisToken: number): number {
  const f = MODEL_FIYAT[model]
  if (!f) console.warn(`[ai-kredi] bilinmeyen model fiyatı: ${model} — Sonnet varsayıldı`)
  const [g, c] = f ?? [3, 15]
  return (girisToken * g + cikisToken * c) / 1_000_000
}

export class KrediYetersizHata extends Error {
  constructor() {
    super('AI krediniz bitti. Devam etmek için planınızı yükseltin ya da kredi paketi alın.')
    this.name = 'KrediYetersizHata'
  }
}

export class AiDurdurulduHata extends Error {
  constructor() {
    super('AI özellikleri geçici olarak bakımda. Lütfen daha sonra tekrar deneyin.')
    this.name = 'AiDurdurulduHata'
  }
}

/** Acil fren: AI_DURDUR=1 iken hiçbir AI çağrısı yapılmaz. */
export function aiDurduruldu(): boolean {
  return process.env.AI_DURDUR === '1'
}

/**
 * Krediyi atomik düş. KURUMSAL muaf; FREE/BASLANGIC/BURO'da koşullu updateMany —
 * yetersiz bakiyede hiçbir şey değişmez ve KrediYetersizHata fırlar.
 */
export async function krediDus(musteriId: string, bedel: number): Promise<void> {
  if (bedel <= 0) return
  const m = await prisma.musteri.findUnique({ where: { id: musteriId }, select: { plan: true } })
  if (!m) throw new Error('Müşteri bulunamadı')
  if (m.plan === 'KURUMSAL') return
  const r = await prisma.musteri.updateMany({
    where: { id: musteriId, aiKredi: { gte: bedel } },
    data: { aiKredi: { decrement: bedel } },
  })
  if (r.count === 0) throw new KrediYetersizHata()
}

/** API çağrısı başarısız olduysa rezervi geri koy (best-effort; hata yutulur, SistemOlay'a düşer). */
export async function krediIade(musteriId: string, bedel: number): Promise<void> {
  if (bedel <= 0) return
  try {
    await prisma.musteri.updateMany({
      where: { id: musteriId, plan: { not: 'KURUMSAL' } },
      data: { aiKredi: { increment: bedel } },
    })
  } catch (e) {
    console.error('[ai-kredi] iade başarısız:', e)
    try {
      await prisma.sistemOlay.create({
        data: { tip: 'HATA', kaynak: 'ai-kredi', mesaj: `Kredi iadesi başarısız: ${musteriId} +${bedel}` },
      })
    } catch { /* logsuz kalsın ama akışı bozmasın */ }
  }
}

/** Her AI çağrısının defter kaydı — best-effort (log hatası ürün akışını asla bozmaz). */
export async function kullanimLogla(k: {
  musteriId?: string
  dosyaId?: string
  yuzey: string
  model: string
  girisToken: number
  cikisToken: number
  krediBedeli?: number
  hata?: boolean
}): Promise<void> {
  try {
    await prisma.aiKullanim.create({
      data: {
        musteriId: k.musteriId ?? null,
        dosyaId: k.dosyaId ?? null,
        yuzey: k.yuzey,
        model: k.model,
        girisToken: k.girisToken,
        cikisToken: k.cikisToken,
        maliyetUsd: new Prisma.Decimal(maliyetUsd(k.model, k.girisToken, k.cikisToken).toFixed(6)),
        krediBedeli: k.krediBedeli ?? 0,
        hata: k.hata ?? false,
      },
    })
  } catch (e) {
    console.error('[ai-kredi] kullanım logu yazılamadı:', e)
  }
}

/** Kalan kredi + plan (UI rozetleri için). */
export async function krediDurumu(musteriId: string): Promise<{ plan: string; aiKredi: number } | null> {
  return prisma.musteri.findUnique({ where: { id: musteriId }, select: { plan: true, aiKredi: true } })
}

/** FREE plan aktif dosya limiti. */
export const FREE_DOSYA_LIMITI = 20

/**
 * Dosya limiti kapısı: FREE planda aktif (kapalı olmayan) dosya sayısı limiti aşacaksa hata.
 * Import (n satır) ve tekil oluşturma (n=1) öncesi çağrılır.
 */
export async function dosyaLimitKontrol(musteriId: string, eklenecek = 1): Promise<void> {
  const m = await prisma.musteri.findUnique({ where: { id: musteriId }, select: { plan: true } })
  if (!m || m.plan !== 'FREE') return
  const aktif = await prisma.rucuDosyasi.count({
    where: { musteriId, durum: { notIn: ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] } },
  })
  if (aktif + eklenecek > FREE_DOSYA_LIMITI) {
    throw new Error(
      `Ücretsiz planda en fazla ${FREE_DOSYA_LIMITI} aktif dosya tutabilirsiniz (şu an ${aktif}). ` +
        'Daha fazlası için planınızı yükseltin.',
    )
  }
}
