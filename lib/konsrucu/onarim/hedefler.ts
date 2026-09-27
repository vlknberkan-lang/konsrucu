/**
 * KonsRücü — Onarımın yazabileceği hedefler · lib/konsrucu/onarim/hedefler.ts (saf)
 *
 * Beyaz liste: onarım aracı YALNIZ burada tanımlı alanlara yazar. Her hedef yeni değeri doğrular ve
 * normalize eder; durum/eksen alanları DurumGecisi'nde hangi eksene düşeceğini söyler.
 * EKLE hedefi `Sure`: yeniJson süre alanlarını taşır; onaylanan son gün yalnız avukatın onayladığı bir
 * kaynaktan (ör. Yelda'nın teyit ettiği defter) geldiyse doludur, aksi hâlde yalnız öneri yazılır.
 */
import { DosyaDurum } from '@prisma/client'
import { z } from 'zod'
import { SURE_TUR_KODLARI, TETIK_TURLERI } from '@/lib/konsrucu/sure/turler'
import { isoGundenTarih } from '@/lib/konsrucu/sure/takvim'

export type DurumEkseni = 'ICRA' | 'ARAB' | 'DAVA' | 'ESKI_DURUM'

export type GuncelleHedefi = {
  tablo: 'RucuDosyasi'
  alan: string
  etiket: string
  eksen?: DurumEkseni
  /** Geçerliyse normalize değer (string | null), değilse undefined. */
  dogrula: (v: unknown) => string | null | undefined
}

/** 06 §3.2 `icraEksen` değerleri (lib/sabitler karşılığı; CHECK yok, liste burada tutulur). */
export const ICRA_EKSEN_DEGERLERI = [
  'TAKIP_YOK', 'IDARI_YOL', 'TEVZI', 'TEBLIG_BEKLENIYOR', 'ITIRAZ_SURESI', 'DURDU_ITIRAZ',
  'KISMEN_DURDU', 'KESINLESTI', 'INFAZ', 'TAHSIL', 'KAPALI', 'BILINMIYOR',
] as const

const tutar = (v: unknown): string | null | undefined => {
  if (v === null) return null
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(s)) return undefined
  return Number(s).toFixed(2)
}
const listeden = (liste: readonly string[]) => (v: unknown): string | null | undefined => {
  if (v === null) return null
  return typeof v === 'string' && liste.includes(v) ? v : undefined
}

export const GUNCELLE_HEDEFLERI: Record<string, GuncelleHedefi> = {
  'RucuDosyasi.rucuTutari': { tablo: 'RucuDosyasi', alan: 'rucuTutari', etiket: 'Rücu tutarı', dogrula: tutar },
  'RucuDosyasi.davaMiktari': { tablo: 'RucuDosyasi', alan: 'davaMiktari', etiket: 'Dava miktarı', dogrula: tutar },
  'RucuDosyasi.icraEksen': { tablo: 'RucuDosyasi', alan: 'icraEksen', etiket: 'İcra ekseni', eksen: 'ICRA', dogrula: listeden(ICRA_EKSEN_DEGERLERI) },
  'RucuDosyasi.durum': { tablo: 'RucuDosyasi', alan: 'durum', etiket: 'Durum (eski)', eksen: 'ESKI_DURUM', dogrula: (v) => (typeof v === 'string' && (Object.values(DosyaDurum) as string[]).includes(v) ? v : undefined) },
}

export function guncelleHedefi(tablo: string, alan: string): GuncelleHedefi | null {
  return GUNCELLE_HEDEFLERI[`${tablo}.${alan}`] ?? null
}

/** eskiJson / yeniJson biçimi: GUNCELLE'de {deger}, EKLE'de alanların kendisi. */
export function degerOku(j: unknown): unknown {
  if (j && typeof j === 'object' && !Array.isArray(j) && 'deger' in (j as Record<string, unknown>)) return (j as { deger: unknown }).deger
  return undefined
}

export function degerMetni(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

export const EKLE_HEDEFLERI = ['Sure'] as const

const gunAlani = z.string().refine((s) => isoGundenTarih(s) != null, 'YYYY-AA-GG olmalı')

/** R0 / R7 EKLE satırının Sure içeriği (yeniJson). */
export const SureEkleSema = z.object({
  tur: z.enum(SURE_TUR_KODLARI),
  dayanak: z.string().trim().min(1).max(200),
  borcluId: z.string().uuid().nullish(),
  davaId: z.string().uuid().nullish(),
  tetikTarihi: gunAlani.nullish(),
  tetikTuru: z.enum(TETIK_TURLERI).nullish(),
  itirazTarihi: gunAlani.nullish(),
  onerilenIhtiyatli: gunAlani.nullish(),
  onerilenSonGun: gunAlani.nullish(),
  /** Yalnız avukatın daha önce teyit ettiği kaynaktan (kodsuz defter) geldiyse. */
  onaylananSonGun: gunAlani.nullish(),
  bakilanEvrak: z.string().trim().max(500).nullish(),
  kaynakBelgeId: z.string().uuid().nullish(),
  kaynakAlinti: z.string().trim().max(2000).nullish(),
  hesapIziJson: z.unknown().optional(),
}).refine((v) => v.onerilenIhtiyatli || v.onerilenSonGun || v.onaylananSonGun, 'Süre satırında en az bir son gün olmalı')

export type SureEkleVerisi = z.infer<typeof SureEkleSema>

/** yeniJson → Sure create verisi (Prisma'dan bağımsız düz nesne). Onaylanan gün varsa onaylayan = satırı onaylayan avukat. */
export function sureEkleVerisi(yeniJson: unknown, dosyaId: string, onaylayanId: string | null, simdi: Date) {
  const v = SureEkleSema.parse(yeniJson)
  const gun = (s: string | null | undefined) => (s ? isoGundenTarih(s) : null)
  const onaylanan = gun(v.onaylananSonGun)
  return {
    dosyaId,
    borcluId: v.borcluId ?? null,
    davaId: v.davaId ?? null,
    tur: v.tur,
    dayanak: v.dayanak,
    tetikTarihi: gun(v.tetikTarihi),
    tetikTuru: v.tetikTuru ?? null,
    onerilenIhtiyatli: gun(v.onerilenIhtiyatli),
    onerilenSonGun: gun(v.onerilenSonGun),
    onaylananSonGun: onaylanan,
    onaylayanId: onaylanan ? onaylayanId : null,
    onayAt: onaylanan ? simdi : null,
    bakilanEvrak: v.bakilanEvrak ?? null,
    kaynakBelgeId: v.kaynakBelgeId ?? null,
    kaynakAlinti: v.kaynakAlinti ?? null,
    hesapIziJson: v.hesapIziJson ?? null,
    durum: 'ACIK' as const,
  }
}
