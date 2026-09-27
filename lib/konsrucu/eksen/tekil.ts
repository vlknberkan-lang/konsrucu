/**
 * KonsRücü — Aday tekilleştirme anahtarı · lib/konsrucu/eksen/tekil.ts (saf, sunucu)
 *
 * Plan S15: "tekilleştirme anahtarı: dosya + alt tip + hukuki tarih + birim evrak no". Dosya kimliği
 * `TakipOlayi.@@unique([dosyaId, tekilAnahtar])` kısıtında zaten vardır; anahtar kalan üç parçayı taşır.
 * Eklenti 1.8/1.9 olaylarında birim evrak no yoktur → yerine normalize açıklamanın kısa özeti kullanılır
 * (aynı evrak her turda aynı açıklamayla gelir). Eşzamanlı iki senkron aynı adayı iki kez açamaz: DB kısıtı
 * P2002 döndürür ve çağıran sessizce geçer.
 */
import { createHash } from 'node:crypto'
import { isoGun, trNorm } from './norm'
import type { AltTip } from './sabitler'

/** Durum metni itiraz sinyali dosya başına TEK adaydır (tarih taşımaz, her turda aynı anahtar). */
export const DURUM_METNI_ITIRAZ_ANAHTARI = 'DURDURMA_ITIRAZ|-|UYAP-DURUM'

function ozet(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 12)
}

export function adayTekilAnahtar(p: {
  altTip: AltTip
  hukukiTarih: Date | null
  /** UYAP birim evrak no (eklenti ham verisi gelince) */
  birimEvrakNo?: string | null
  /** Program belgesi (mazbata metninden üretilen aday) */
  belgeId?: string | null
  /** Yedek: olay açıklaması (1.8/1.9) */
  metin?: string | null
  /** Olayın eklentideki tarihi (hukuki tarih boşsa ayırt edici) */
  olayTarihi?: Date | null
}): string {
  // Durum/aşama türevi itiraz: tarih her turda kayabilir → tek anahtar (dosya başına bir aday).
  if (p.altTip === 'DURDURMA_ITIRAZ') return DURUM_METNI_ITIRAZ_ANAHTARI
  const gun = isoGun(p.hukukiTarih) ?? (p.olayTarihi ? `o:${isoGun(p.olayTarihi)}` : '-')
  const kaynak = p.birimEvrakNo?.trim()
    ? `e:${p.birimEvrakNo.trim()}`
    : p.belgeId
      ? `b:${p.belgeId}`
      : `m:${ozet(trNorm(p.metin))}`
  return `${p.altTip}|${gun}|${kaynak}`.slice(0, 190)
}

/** Yatan Para farkı adayının anahtarı: aynı önceki→yeni toplam iki kez aday doğurmaz. */
export function tahsilatTekilAnahtar(onceki: number, yeni: number): string {
  return `TAHSILAT_BORCLUDAN|${onceki.toFixed(2)}>${yeni.toFixed(2)}`
}

/** Prisma benzersizlik ihlali mi (P2002)? — modül prisma istemcisine bağlı kalmasın diye kod üzerinden. */
export function tekilIhlaliMi(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002'
}
