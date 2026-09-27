/**
 * KonsRücü — Dilekçe v2 bayrağı · lib/konsrucu/dilekce-v2/bayrak.ts (saf; sunucu)
 *
 * 07 §1 (bayraklar) ve S35 "Risk ve geri dönüş": `DILEKCE_V2` kapalıyken eski masa aynen çalışır.
 *   DILEKCE_V2=kapali (varsayılan) · avukat (yalnız ADMIN ve AVUKAT görür) · herkes (bütün roller görür).
 * Yazma yetkileri bayraktan bağımsızdır (kart üret: GORUNTULEYEN hariç; onay/kilit: yalnız ADMIN ve AVUKAT).
 */

export type DilekceV2Kipi = 'kapali' | 'avukat' | 'herkes'

export function dilekceV2Kipi(): DilekceV2Kipi {
  const d = (process.env.DILEKCE_V2 ?? '').trim().toLowerCase()
  return d === 'avukat' || d === 'herkes' ? d : 'kapali'
}

/** Avukat rolü: olgu onayı, kart kilidi, atıf doğrulaması (06 §7.4 rol kapısı). */
export const avukatRoluMu = (rol: string | null | undefined): boolean => rol === 'ADMIN' || rol === 'AVUKAT'

/** Kullanıcı bu rolle v2 yüzeylerini (dosya kartı, atıf kütüphanesi) görebilir mi? */
export function dilekceV2Acik(rol: string | null | undefined): boolean {
  const k = dilekceV2Kipi()
  if (k === 'kapali') return false
  if (k === 'avukat') return avukatRoluMu(rol)
  return true
}
