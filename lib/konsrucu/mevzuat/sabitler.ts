/**
 * KonsRücü — Mevzuat kütüphanesi sabitleri · lib/konsrucu/mevzuat/sabitler.ts (saf; client-safe)
 *
 * S33 (06 §7.1, §7.4; B09, B18). `MevzuatKaynak.durum` ve `etiket` kapalı listelerdir (SQL 013 CHECK);
 * `tur` büyüyebilir, liste burada tutulur.
 */

export const MEVZUAT_DURUMLARI = ['DOGRULANDI', 'TEYIT_GEREKLI', 'KULLANMA'] as const
export type MevzuatDurum = (typeof MEVZUAT_DURUMLARI)[number]

export const MEVZUAT_ETIKETLERI = ['YERLESIK', 'TARTISMALI', 'TEYIT_GEREKLI'] as const
export type MevzuatEtiket = (typeof MEVZUAT_ETIKETLERI)[number]

export const MEVZUAT_TURLERI = ['MEVZUAT', 'GENEL_SART', 'ICTIHAT'] as const
export type MevzuatTuru = (typeof MEVZUAT_TURLERI)[number]

/** Atıf kapısının sonucu: kütüphane durumları + kütüphanede eşi olmayan atıf. */
export type AtifDurum = MevzuatDurum | 'DOGRULANMADI'

export const DURUM_ADI: Record<AtifDurum, string> = {
  DOGRULANDI: 'Doğrulandı',
  TEYIT_GEREKLI: 'Teyit gerekli',
  KULLANMA: 'Kullanma',
  DOGRULANMADI: 'Doğrulanmadı',
}

export const ETIKET_ADI: Record<MevzuatEtiket, string> = {
  YERLESIK: 'Yerleşik',
  TARTISMALI: 'Tartışmalı',
  TEYIT_GEREKLI: 'Teyit gerekli',
}

export const TUR_ADI: Record<MevzuatTuru, string> = {
  MEVZUAT: 'Mevzuat',
  GENEL_SART: 'Genel şart',
  ICTIHAT: 'İçtihat',
}

/** Metinde doğrulanmamış atıfın yanına basılan işaret (atiflar.md §3.2). */
export const DOGRULANMADI_ISARETI = '⟨DOĞRULANMADI⟩'

export const mevzuatDurumuMu = (v: unknown): v is MevzuatDurum =>
  typeof v === 'string' && (MEVZUAT_DURUMLARI as readonly string[]).includes(v)

/** Ekran tonu (components/konsrucu/ui.tsx · Tone). */
export function durumTonu(d: AtifDurum): 'success' | 'warning' | 'danger' | 'steel' {
  if (d === 'DOGRULANDI') return 'success'
  if (d === 'TEYIT_GEREKLI') return 'warning'
  if (d === 'KULLANMA') return 'danger'
  return 'danger'
}
