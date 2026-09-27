/**
 * KonsRücü — Cevaba cevap dilekçesi: savunma bağlamı ve usul süzgeci · lib/konsrucu/dilekce-v2/turler/cevaba-cevap.ts (saf)
 *
 * S39 (06 §7.3: "Cevaba cevap | Karşı tarafın cevabı tam metin + savunma matrisi | Yalnız yazılı usulde; her
 * savunma alıntılanır ve karşılanır"). Kabul 2: "Cevaba cevap taslağı YALNIZ işaretli savunmaları karşılar."
 * `cevaplanacakBaglam` bu kuralı uygular: paragraf.ts'e (AÇIKLAMALAR üretimi) yalnız avukatın "cevaplanacak"
 * işaretlediği savunmalar gider; "önemsiz" ya da işaretlenmemiş savunmalar yapay zekâya hiç gönderilmez —
 * model bunları göremediği için karşılık da yazamaz (kart-veri değil, girdi düzeyinde süzgeç).
 *
 * Usul süzgeci: kart.ts · kartIcerigiKur/kilitKontrolu zaten basit usulde CEVABA_CEVAP kartını kilitli tutar
 * (kritik eksik, HMK 317); `cevabaCevapUygunMu` aynı kuralın bağımsız bir doğrulamasıdır — paragraf üretimi
 * gibi kart katmanından habersiz kod yollarının da aynı sonuca ulaşmasını sağlar.
 */
import { cevaplanacaklar } from '../savunma-matrisi'
import type { SavunmaSatiri } from '../tipler'

export type ParagrafSavunma = { id: string; baslik: string; konu: string; alinti: string }

/**
 * paragraf.ts · aciklamaParagraflariniUret'e giden savunma bağlamı: yalnız "cevaplanacak" işaretli satırlar,
 * yapay zekânın ihtiyaç duymadığı alanlar (belgeId, sayfa, işaretleyen) olmadan. Boş dizi dönerse (hiç
 * işaretli savunma yoksa) paragraf.ts savunma talimatını hiç eklemez.
 */
export function cevaplanacakBaglam(savunmalar: readonly SavunmaSatiri[]): ParagrafSavunma[] {
  return cevaplanacaklar(savunmalar).map((s) => ({ id: s.id, baslik: s.baslik, konu: s.konu, alinti: s.alinti }))
}

export const CEVABA_CEVAP_BASIT_USUL_NEDENI =
  'Basit yargılamada cevaba cevap verilmez (HMK 317); bu dosya için cevaba cevap dilekçesi önerilmez/üretilmez. Beyan dilekçesi düşünün.'

/** Usul süzgeci (06 §7.3, §7.4-4): yalnız yazılı usulde cevaba cevap üretilir/önerilir. Usul kayıtlı değilse (null) engellenmez. */
export function cevabaCevapUygunMu(usul: 'YAZILI' | 'BASIT' | null): { uygun: boolean; neden: string | null } {
  if (usul === 'BASIT') return { uygun: false, neden: CEVABA_CEVAP_BASIT_USUL_NEDENI }
  return { uygun: true, neden: null }
}
