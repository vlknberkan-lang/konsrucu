/**
 * KonsRücü — şablon seçimi için dosyanın varyant isteği · lib/konsrucu/dilekce-v2/varyant.ts (saf)
 * iskeletSec yalnız varyantı TUTAN şablonu seçer (şablonda dolu alan, istekte de aynı olmalı). Taslak üretimi mahkeme
 * türünü ve davalı türünü boş gönderdiği için mahkemeye/davalıya özgü hiçbir büro şablonu seçilemiyordu (28.09.2026).
 */
import { mahkemeCoz } from '@/lib/konsrucu/dava/kayit'
import type { VaryantAnahtari } from './iskelet'

export type DavaliTuru = 'KAMU' | 'OZEL_TUZEL' | 'GERCEK'

// Türkçe büyük/küçük harf (İ/ı) JS düzenli ifadesinde doğru eşleşmez → önce tr-TR ile küçült, sınırları elle yaz.
const KAMU = /(belediye|başkanlığı|bakanlığı|genel müdürlüğü|karayolları|valiliği|kaymakamlığı|idaresi|müdürlüğü)/u
const TUZEL = /(^|[\s(,])(a\.?\s?ş\.?|anonim|limited|ltd\.?|şti\.?|kooperatif|holding|vakfı|derneği)($|[\s),.])/u

/** Unvandan davalı türü: kamu kurumu, özel tüzel kişi ya da gerçek kişi (tahmin; avukat düzeltebilir). */
export function davaliTuruTahmin(ad: string | null | undefined): DavaliTuru | null {
  const s = String(ad ?? '').trim().toLocaleLowerCase('tr-TR')
  if (!s) return null
  if (KAMU.test(s)) return 'KAMU'
  if (TUZEL.test(s)) return 'OZEL_TUZEL'
  return 'GERCEK'
}

/** Dosyadan şablon varyant isteği: rücu sebebi kodu, mahkeme türü (dava kaydı ya da seçilen mahkeme adı), usul, ilk davalının türü. */
export function varyantIstegi(p: {
  rucuSebebiKod: string | null
  davaMahkemeTuru: string | null
  mahkemeAdi: string | null
  usul: string | null
  davaliAdlari: readonly string[]
}): VaryantAnahtari {
  const mahkemeTuru = p.davaMahkemeTuru ?? mahkemeCoz(p.mahkemeAdi)?.tur ?? null
  return { rucuSebebiKod: p.rucuSebebiKod, mahkemeTuru, usul: p.usul, davaliTur: davaliTuruTahmin(p.davaliAdlari[0]) }
}
