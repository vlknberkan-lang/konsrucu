/**
 * KonsRücü — Alıntı doğrulama · lib/konsrucu/oneri/alinti.ts  (saf; DB yok, client-safe)
 *
 * S18 (06 §2(a) adım 5; B37 "kaynak izi gerçek değil"). Her önerinin alıntısı, dosyanın `BelgeSayfa` metninde
 * NORMALİZE edilerek aranır. Bulunamazsa alan "kaynaksız" olur (`alintiDogru = false`): ekranda kırmızı etiket taşır,
 * toplu onaya girmez, dilekçeye akmaz. Normalizasyon: NFC, görünmez karakterler, satır sonu tirelemesi, tırnak ve
 * tire birliği, Türkçe küçük harf, ç/ğ/ı/ö/ş/ü → c/g/i/o/s/u (OCR farkı), tek boşluk.
 *
 * Kısa alıntı (8 karakterden az, ör. "14.30") yalnız önerinin gösterdiği sayfada aranır; başka sayfadaki rastlantısal
 * eşleşme kaynak sayılmaz. Uzun alıntı başka sayfada bulunursa yer düzeltilir (AI sayfayı yanlış göstermiş olabilir).
 */

export type SayfaMetni = { belgeId: string; sayfaNo: number; metin: string }
export const ALINTI_AZAMI = 300
const KISA_ALINTI = 8

const TR_ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** Karşılaştırma için katlanmış metin. Uzunluk korunmaz (yalnız arama içindir). */
export function alintiKatla(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[­​‌‍⁠﻿]/g, '')
    .replace(/-\s*\r?\n\s*/g, '') // satır sonu tirelemesi: "tuta-\nnağı" → "tutanağı"
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Saklanacak alıntı: kırpılmış, en çok 300 karakter; boşsa null. */
export function alintiKisalt(s: string | null | undefined): string | null {
  const x = String(s ?? '').replace(/\s+/g, ' ').trim()
  return x ? x.slice(0, ALINTI_AZAMI) : null
}

export type SayfaIndeksi = { belgeId: string; sayfaNo: number; katli: string }[]

/** Sayfaları bir kez katla (aynı dosyada çok öneri doğrulanırken tekrar tekrar katlanmasın). */
export function sayfaIndeksi(sayfalar: readonly SayfaMetni[]): SayfaIndeksi {
  return sayfalar.map((s) => ({ belgeId: s.belgeId, sayfaNo: s.sayfaNo, katli: alintiKatla(s.metin) }))
}

export type AlintiSonucu = {
  /** YOK: alıntı verilmemiş (alintiDogru = null) · DOGRU: bulundu · BULUNAMADI: kaynaksız (alintiDogru = false) */
  durum: 'YOK' | 'DOGRU' | 'BULUNAMADI'
  belgeId: string | null
  sayfa: number | null
  /** Alıntı önerinin gösterdiği yerden başka bir sayfada bulundu. */
  yerDuzeltildi: boolean
}

/** Alıntıyı dosyanın sayfalarında ara. `hedef` önerinin gösterdiği belge ve sayfadır. */
export function alintiDogrula(
  alinti: string | null | undefined,
  sayfalar: readonly SayfaMetni[] | SayfaIndeksi,
  hedef?: { belgeId?: string | null; sayfa?: number | null },
): AlintiSonucu {
  const hb = hedef?.belgeId ?? null
  const hs = hedef?.sayfa ?? null
  const a = alintiKatla(alintiKisalt(alinti))
  if (!a) return { durum: 'YOK', belgeId: hb, sayfa: hs, yerDuzeltildi: false }
  const idx: SayfaIndeksi = sayfalar.length && 'katli' in sayfalar[0] ? (sayfalar as SayfaIndeksi) : sayfaIndeksi(sayfalar as readonly SayfaMetni[])
  const bul = (f: (s: SayfaIndeksi[number]) => boolean) => idx.filter((s) => f(s) && s.katli.includes(a))

  // 1) önerinin gösterdiği sayfa
  if (hb && hs != null) {
    if (bul((s) => s.belgeId === hb && s.sayfaNo === hs).length) return { durum: 'DOGRU', belgeId: hb, sayfa: hs, yerDuzeltildi: false }
  }
  const kisa = a.length < KISA_ALINTI
  if (kisa) {
    // kısa alıntı: sayfa verilmemişse yalnız TEK eşleşme kaynak sayılır; sayfa verilmişse başka yer aranmaz
    if (hb && hs != null) return { durum: 'BULUNAMADI', belgeId: hb, sayfa: hs, yerDuzeltildi: false }
    const aday = hb ? bul((s) => s.belgeId === hb) : bul(() => true)
    if (aday.length === 1) return { durum: 'DOGRU', belgeId: aday[0].belgeId, sayfa: aday[0].sayfaNo, yerDuzeltildi: false }
    return { durum: 'BULUNAMADI', belgeId: hb, sayfa: hs, yerDuzeltildi: false }
  }
  // 2) aynı belgenin başka sayfası
  if (hb) {
    const ayni = bul((s) => s.belgeId === hb)
    if (ayni.length) return { durum: 'DOGRU', belgeId: hb, sayfa: ayni[0].sayfaNo, yerDuzeltildi: hs != null && ayni[0].sayfaNo !== hs }
  }
  // 3) dosyanın herhangi bir sayfası
  const her = bul(() => true)
  if (her.length) return { durum: 'DOGRU', belgeId: her[0].belgeId, sayfa: her[0].sayfaNo, yerDuzeltildi: hb != null }
  return { durum: 'BULUNAMADI', belgeId: hb, sayfa: hs, yerDuzeltildi: false }
}

/** AlintiSonucu → AlanDegeri.alintiDogru (null: alıntı yok · true · false: kaynaksız). */
export const alintiDogruDegeri = (s: AlintiSonucu): boolean | null => (s.durum === 'YOK' ? null : s.durum === 'DOGRU')
