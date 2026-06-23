/**
 * KonsRücü — DosyaDurum (yaşam döngüsü "aşama") → Türkçe etiket + ton + Excel renkleri.
 * Tek kaynak: pipeline sırası, etiket ve renk kodu. Client-safe (DB yok).
 * Renkler design-system token'larından (app/globals.css light mode HSL) türetilir → ARGB.
 */
import type { Tone } from '@/components/konsrucu/ui'

export type DurumKodu =
  | 'HAVUZDA' | 'INCELENIYOR' | 'TAKIBE_HAZIR' | 'TAKIP_ACILDI' | 'TEBLIG_EDILDI'
  | 'ITIRAZ' | 'ARABULUCULUK' | 'DAVA' | 'KESINLESTI' | 'INFAZ' | 'TAHSIL'
  | 'KAPANDI' | 'IDARI_YOL'

/** Pipeline aşaması → görünür etiket + ton + sıra (CLAUDE.md yaşam döngüsü). */
export const ASAMA: Record<DurumKodu, { label: string; tone: Tone; sira: number }> = {
  HAVUZDA:       { label: 'Havuzda',       tone: 'steel',   sira: 1 },
  INCELENIYOR:   { label: 'İnceleniyor',   tone: 'kr',      sira: 2 },
  TAKIBE_HAZIR:  { label: 'Takibe hazır',  tone: 'info',    sira: 3 },
  TAKIP_ACILDI:  { label: 'Takip açıldı',  tone: 'info',    sira: 4 },
  TEBLIG_EDILDI: { label: 'Tebliğ edildi', tone: 'info',    sira: 5 },
  ITIRAZ:        { label: 'İtiraz',        tone: 'danger',  sira: 6 },
  ARABULUCULUK:  { label: 'Arabuluculuk', tone: 'warning', sira: 7 },
  DAVA:          { label: 'Dava',          tone: 'warning', sira: 8 },
  KESINLESTI:    { label: 'Kesinleşti',    tone: 'success', sira: 9 },
  INFAZ:         { label: 'İnfaz',         tone: 'kr',      sira: 10 },
  TAHSIL:        { label: 'Tahsil',        tone: 'success', sira: 11 },
  KAPANDI:       { label: 'Kapandı',       tone: 'steel',   sira: 12 },
  IDARI_YOL:     { label: 'İdari yol',     tone: 'kr',      sira: 13 },
}

/** Bilinmeyen kodu da güvenle çevirir. */
export function asamaBilgi(d: string | null | undefined): { label: string; tone: Tone; sira: number } {
  if (!d) return { label: '—', tone: 'steel', sira: 99 }
  return ASAMA[d as DurumKodu] ?? { label: d, tone: 'steel', sira: 99 }
}

// ── 5 EVRE (filtre/sekme + liste sütunu) — ince durum'u kabaca grupla ────────────
// İcra Öncesi · İcra Takibi · Arabuluculuk · Dava · İnfaz · Kapalı. Detaydaki ASAMA_SEKMELER
// ile aynı dili konuşur (components/akilli-giris/detay/asama-sekmeler.tsx). Kaynak = dosya.durum (indeksli).
export type AsamaKey = 'oncesi' | 'icra' | 'arabuluculuk' | 'dava' | 'infaz' | 'kapali'

/** Filtre/sekme sırası (soldan sağa, dosya yaşam döngüsü). */
export const ASAMA_SIRA: AsamaKey[] = ['oncesi', 'icra', 'arabuluculuk', 'dava', 'infaz', 'kapali']

/** Her evrenin kapsadığı DosyaDurum kodları (Prisma where `durum: { in }` + sayım için). */
export const ASAMA_DURUMLAR: Record<AsamaKey, DurumKodu[]> = {
  oncesi: ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR', 'IDARI_YOL'],
  icra: ['TAKIP_ACILDI', 'TEBLIG_EDILDI', 'ITIRAZ', 'KESINLESTI'],
  arabuluculuk: ['ARABULUCULUK'],
  dava: ['DAVA'],
  infaz: ['INFAZ'],
  kapali: ['TAHSIL', 'KAPANDI'],
}

export const ASAMA_META: Record<AsamaKey, { label: string; tone: Tone }> = {
  oncesi: { label: 'İcra Öncesi', tone: 'steel' },
  icra: { label: 'İcra Takibi', tone: 'kr' },
  arabuluculuk: { label: 'Arabuluculuk', tone: 'info' },
  dava: { label: 'Dava', tone: 'warning' },
  infaz: { label: 'İnfaz', tone: 'brand' },
  kapali: { label: 'Kapalı', tone: 'success' },
}

/** DosyaDurum kodu → 5 evre (bilinmeyen → İcra Öncesi). */
export function durumAsama(d: string): AsamaKey {
  for (const key of ASAMA_SIRA) {
    if ((ASAMA_DURUMLAR[key] as string[]).includes(d)) return key
  }
  return 'oncesi'
}

// ── Excel renk paleti — token'lardan (light mode HSL → ARGB 'FFRRGGBB') ──────
function hslToArgb(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const hex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0').toUpperCase()
  return `FF${hex(r)}${hex(g)}${hex(b)}`
}

/** Ton → Excel renkleri: fill = yumuşak satır zemini, ink = koyu metin, strong = dolu vurgu. */
export const TON_RENK: Record<Tone, { fill: string; ink: string; strong: string }> = {
  kr:      { fill: hslToArgb(184, 60, 95), ink: hslToArgb(184, 70, 26), strong: hslToArgb(184, 74, 36) },
  info:    { fill: hslToArgb(199, 96, 94), ink: hslToArgb(199, 89, 33), strong: hslToArgb(199, 89, 48) },
  success: { fill: hslToArgb(160, 76, 95), ink: hslToArgb(160, 84, 25), strong: hslToArgb(160, 84, 35) },
  warning: { fill: hslToArgb(48, 96, 93),  ink: hslToArgb(38, 92, 32),  strong: hslToArgb(38, 92, 48) },
  danger:  { fill: hslToArgb(0, 86, 96),   ink: hslToArgb(0, 72, 42),   strong: hslToArgb(0, 72, 50) },
  steel:   { fill: 'FFF1F5F9',             ink: 'FF475569',             strong: 'FF64748B' },
  brand:   { fill: 'FFEEF2FF',             ink: 'FF3730A3',             strong: 'FF4F46E5' },
}

/** DosyaDurum kodu → Excel renkleri (satır zemini için). */
export function asamaRenk(d: string | null | undefined): { fill: string; ink: string; strong: string } {
  return TON_RENK[asamaBilgi(d).tone]
}
