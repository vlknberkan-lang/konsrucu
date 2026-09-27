/**
 * KonsRücü — Tahsilat kuralı · lib/konsrucu/eksen/tahsilat.ts (saf, client-safe)
 *
 * 06 §2(j) ve §3.6; docs/04 K1: gerçek tahsilatın güvenilir TEK kaynağı UYAP hesabındaki "Yatan Para"
 * toplamıdır (eklentide `hesap.tahsilat`). Her senkronda yeni toplam bir öncekiyle karşılaştırılır; artış varsa
 * FARK KADAR bir TAHSILAT_BORCLUDAN adayı doğar (SN-07 kartına düşer, onay S31). Tarihi "senkronda görüldü"
 * anıdır, hukuki tahsil tarihi değildir. Evrak adından (makbuz, reddiyat) hiçbir zaman tahsilat türetilmez.
 *
 * Azalma (UYAP düzeltmesi, reddiyat sonrası görünüm) aday doğurmaz; yalnız "kontrol edin" notu döner.
 */
import { sayiTR } from '@/lib/konsrucu/sayi'

const KURUS = 0.005

/** hesap JSON'undaki tahsilat alanını sayıya çevirir (sayı ya da "1.000,00" metni); okunamazsa null. */
export function yatanParaOku(hesap: unknown): number | null {
  if (!hesap || typeof hesap !== 'object' || Array.isArray(hesap)) return null
  const v = (hesap as { tahsilat?: unknown }).tahsilat
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : sayiTR(v)
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return null
  return Math.round(n * 100) / 100
}

export type TahsilatFarki =
  | { tur: 'ARTIS'; onceki: number; yeni: number; fark: number; ilkGorunum: boolean }
  | { tur: 'AZALIS'; onceki: number; yeni: number; fark: number }

/**
 * Önceki ve yeni hesap görüntüsü → fark. Önceki görüntü yoksa (dosyanın ilk senkronu) önceki 0 sayılır:
 * UYAP'taki para ancak böyle görünür olur; aday "ilk görünüm" notuyla gelir, avukat onaylar.
 * Yeni görüntüde tahsilat alanı yoksa karşılaştırma yapılmaz (null).
 */
export function yatanParaFarki(oncekiHesap: unknown, yeniHesap: unknown): TahsilatFarki | null {
  const yeni = yatanParaOku(yeniHesap)
  if (yeni == null) return null
  const oncekiOkunan = yatanParaOku(oncekiHesap)
  const onceki = oncekiOkunan ?? 0
  const fark = Math.round((yeni - onceki) * 100) / 100
  if (Math.abs(fark) < KURUS) return null
  if (fark > 0) return { tur: 'ARTIS', onceki, yeni, fark, ilkGorunum: oncekiOkunan == null }
  return { tur: 'AZALIS', onceki, yeni, fark }
}

/** Aday olay açıklaması (tutar TR biçiminde). */
export function tahsilatAdayMetni(f: Extract<TahsilatFarki, { tur: 'ARTIS' }>): string {
  const tl = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  return `Tahsilat (UYAP Yatan Para) ${tl(f.fark)} TL — ${tl(f.onceki)} → ${tl(f.yeni)}; senkronda görüldü, hukuki tahsil tarihi değildir` +
    (f.ilkGorunum ? ' (ilk hesap görüntüsü: önceki toplam bilinmiyor)' : '')
}
