/**
 * KonsRücü — Aday olay ve üç eksen SABİTLERİ · lib/konsrucu/eksen/sabitler.ts (saf, client-safe)
 *
 * S15 (aday olaylar, üç eksen, tahsilat kuralı) ve S23 (tebliğ ve itiraz onay kartları) aynı sözlüğü kullanır.
 * Şema bu alanları `String` tutar (06 §3.1 ilke 2 — mevcut enum'lara dokunulmaz); geçerli değerler burada.
 *
 * İLKE (06 M2/M3): UYAP'tan gelen her gelişme önce ADAY'dır. Riski ARTIRAN aday (itiraz, durma) eksende
 * "teyitsiz" hemen görünür; riski AZALTAN geçiş (kesinleşme, tahsil, kapanış) avukat teyidi olmadan hiçbir
 * zaman eksene yazılmaz. Sistem "önerilen" üretir, avukat "onaylar"; madde atıfları "teyit gerekli".
 */

// ── TakipOlayi.altTip (06 §3.2) ─────────────────────────────────────────────
export const ALT_TIPLER = [
  'ODEME_EMRI_DUZENLENDI',
  'TEBLIGAT_TALEBI',
  'TEBLIGAT_GONDERIM',
  'TEBLIG_SONUCU',
  'TEBLIG_IADE',
  'ITIRAZ',
  'ITIRAZIN_ALACAKLIYA_TEBLIGI',
  'DURDURMA_ITIRAZ',
  'MUVEKKIL_ALACAGINA_HACIZ',
  'IHTIYATI_HACIZ',
  'ICRAI_HACIZ',
  'MASRAF_MAKBUZU',
  'REDDIYAT',
  'TAHSILAT_SINYALI',
  'TAHSILAT_BORCLUDAN',
  'KESINLESME_SERHI',
  'DAVA_ACILDI_SINYALI',
  'DIGER',
] as const
export type AltTip = (typeof ALT_TIPLER)[number]

export function altTipMi(s: unknown): s is AltTip {
  return typeof s === 'string' && (ALT_TIPLER as readonly string[]).includes(s)
}

/** Kullanıcıya gösterilen ad (olay listesi ve kartlar). */
export const ALT_TIP_ETIKET: Record<AltTip, string> = {
  ODEME_EMRI_DUZENLENDI: 'Ödeme emri düzenlendi',
  TEBLIGAT_TALEBI: 'Tebligat talebi',
  TEBLIGAT_GONDERIM: 'Tebligat gönderildi',
  TEBLIG_SONUCU: 'Tebliğ sonucu',
  TEBLIG_IADE: 'Tebliğ sonucu: İADE',
  ITIRAZ: 'İtiraz',
  ITIRAZIN_ALACAKLIYA_TEBLIGI: 'İtirazın size tebliği',
  DURDURMA_ITIRAZ: 'Takip durdu: itiraz (UYAP durum metni)',
  MUVEKKIL_ALACAGINA_HACIZ: 'Müvekkil alacağına haciz',
  IHTIYATI_HACIZ: 'İhtiyati haciz',
  ICRAI_HACIZ: 'Haciz (borçlu malı)',
  MASRAF_MAKBUZU: 'Masraf / harç makbuzu',
  REDDIYAT: 'Reddiyat',
  TAHSILAT_SINYALI: 'Tahsilat sinyali (tahsilat sayılmadı)',
  TAHSILAT_BORCLUDAN: 'Tahsilat (UYAP Yatan Para)',
  KESINLESME_SERHI: 'Kesinleşme sinyali',
  DAVA_ACILDI_SINYALI: 'Dava açıldı sinyali',
  DIGER: 'Diğer gelişme',
}

/** Süre başlatan adaylar: onay kartı öncelik 2 (06 §8.2, TB-01). */
export const SURE_BASLATAN_ALT_TIPLER: readonly AltTip[] = ['TEBLIG_SONUCU', 'ITIRAZ', 'DURDURMA_ITIRAZ', 'ITIRAZIN_ALACAKLIYA_TEBLIGI']

/** Onay kartı borçlu bazında BorcluTakip'e yazılan adaylar (S23). */
export const BORCLU_AYNALI_ALT_TIPLER: readonly AltTip[] = [
  'TEBLIG_SONUCU', 'TEBLIG_IADE', 'ITIRAZ', 'DURDURMA_ITIRAZ', 'ITIRAZIN_ALACAKLIYA_TEBLIGI',
]

/** Hiçbir para toplamına girmeyen tahsilat izi (06 §3.6). Yalnız TAHSILAT_BORCLUDAN tahsilat adayıdır. */
export const TOPLAMA_GIRMEZ: readonly AltTip[] = ['TAHSILAT_SINYALI', 'MASRAF_MAKBUZU', 'REDDIYAT']

// ── TakipOlayi.teyit / sonuc / tebligSekli / muhatap / kaynakTuru ────────────
export const TEYIT = ['ADAY', 'TEYITLI', 'REDDEDILDI'] as const
export type Teyit = (typeof TEYIT)[number]

export const TEBLIG_SONUC = ['TEBLIG', 'IADE', 'BELIRSIZ'] as const
export type TebligSonuc = (typeof TEBLIG_SONUC)[number]

export const TEBLIG_SEKLI = ['UETS', 'MUHATABA', 'TK21_1', 'TK21_2', 'TK35', 'BELIRSIZ'] as const
export type TebligSekli = (typeof TEBLIG_SEKLI)[number]
export const TEBLIG_SEKLI_ETIKET: Record<TebligSekli, string> = {
  UETS: 'UETS (e-tebliğ)',
  MUHATABA: 'Muhataba',
  TK21_1: 'TK 21/1',
  TK21_2: 'TK 21/2',
  TK35: 'TK 35',
  BELIRSIZ: 'Şekil belirsiz',
}

export const MUHATAP = ['BORCLU', 'ALACAKLI_VEKILI', 'BELIRSIZ'] as const
export type Muhatap = (typeof MUHATAP)[number]

export const KAYNAK_TURU = ['UYAP_YAPISAL', 'UYAP_EVRAK', 'ELLE'] as const
export type KaynakTuru = (typeof KAYNAK_TURU)[number]

export const ITIRAZ_TIPI = ['TAM', 'KISMI'] as const
export type ItirazTipi = (typeof ITIRAZ_TIPI)[number]

/** BorcluTakip.itirazKapsamJson anahtarları (06 §3.3). */
export const ITIRAZ_KAPSAM_ANAHTAR = ['yetki', 'borc', 'faiz', 'feriler', 'imza'] as const
export type ItirazKapsamAnahtar = (typeof ITIRAZ_KAPSAM_ANAHTAR)[number]
export type ItirazKapsam = Partial<Record<ItirazKapsamAnahtar, boolean>>
export const ITIRAZ_KAPSAM_ETIKET: Record<ItirazKapsamAnahtar, string> = {
  yetki: 'yetki', borc: 'borç', faiz: 'faiz', feriler: "fer'iler", imza: 'imza',
}

// ── Eksen değerleri (06 §3.2 RucuDosyasi) ───────────────────────────────────
export const ICRA_EKSEN = [
  'TAKIP_YOK', 'IDARI_YOL', 'TEVZI', 'TEBLIG_BEKLENIYOR', 'ITIRAZ_SURESI', 'DURDU_ITIRAZ',
  'KISMEN_DURDU', 'KESINLESTI', 'INFAZ', 'TAHSIL', 'KAPALI', 'BILINMIYOR',
] as const
export type IcraEksen = (typeof ICRA_EKSEN)[number]

export const ARAB_EKSEN = ['YOK', 'HAZIRLIK', 'DEVAM', 'SON_TUTANAK_ANLASMA', 'SON_TUTANAK_DIGER'] as const
export type ArabEksen = (typeof ARAB_EKSEN)[number]

export const DAVA_EKSEN = ['YOK', 'HAZIRLIK', 'DERDEST', 'ISLEMDEN_KALDIRILDI', 'KARAR', 'KANUN_YOLU', 'KESINLESTI'] as const
export type DavaEksen = (typeof DAVA_EKSEN)[number]

export const ICRA_ETIKET: Record<IcraEksen, string> = {
  TAKIP_YOK: 'Takip yok',
  IDARI_YOL: 'İdari yol',
  TEVZI: 'Tevzi edildi',
  TEBLIG_BEKLENIYOR: 'Tebliğ bekleniyor',
  ITIRAZ_SURESI: 'İtiraz süresi',
  DURDU_ITIRAZ: 'Durdu - itiraz',
  KISMEN_DURDU: 'Kısmen durdu',
  KESINLESTI: 'Kesinleşti',
  INFAZ: 'İnfaz',
  TAHSIL: 'Tahsil',
  KAPALI: 'Kapalı',
  BILINMIYOR: 'Bilinmiyor, teyit edin',
}
export const ARAB_ETIKET: Record<ArabEksen, string> = {
  YOK: 'Yok',
  HAZIRLIK: 'Hazırlık',
  DEVAM: 'Devam ediyor',
  SON_TUTANAK_ANLASMA: 'Son tutanak: anlaşma',
  SON_TUTANAK_DIGER: 'Son tutanak: anlaşamama',
}
export const DAVA_ETIKET: Record<DavaEksen, string> = {
  YOK: 'Yok',
  HAZIRLIK: 'Hazırlık',
  DERDEST: 'Derdest',
  ISLEMDEN_KALDIRILDI: 'İşlemden kaldırıldı',
  KARAR: 'Karar',
  KANUN_YOLU: 'Kanun yolu',
  KESINLESTI: 'Kesinleşti',
}

/** Eksen değerinin güveni (DurumGecisi.teyit ile aynı dil). */
export type EksenTeyit = 'TEYITLI' | 'TEYITSIZ'
/** Değerin nereden geldiği: AVUKAT onayı, UYAP adayı, KURAL (türetme), TAHMIN (veri yok), ESKI_KAYIT (eski Asama). */
export type EksenKaynak = 'AVUKAT' | 'UYAP' | 'KURAL' | 'TAHMIN' | 'ESKI_KAYIT'

export const EKSEN_KAYNAK_ETIKET: Record<EksenKaynak, string> = {
  AVUKAT: 'avukat onaylı',
  UYAP: 'UYAP, teyitsiz',
  KURAL: 'kural',
  TAHMIN: 'tahmin, teyit edin',
  ESKI_KAYIT: 'eski kayıt, teyit edin',
}

// ── Kural kodları (TakipOlayi.kural = "KOD@sürüm") ──────────────────────────
/** Eksen türetme kurallarının sürümü; kural değişince artar (yanlış kural sürümle düzeltilir — S15 risk satırı). */
export const EKSEN_KURAL_SURUM = 1

/**
 * Aday üreten kurallar. Önek: EK1 = eklenti 1.x'in gönderdiği olay (plan: "eski olaylar da aday, kural eklenti-1.x"),
 * UY = sunucunun UYAP yapısal verisinden (durum metni, hesap özeti), MZ = mazbata metni (S23), EL = elle.
 */
export const KURAL = {
  EK1_TEBLIG: 'EK1-TEBLIG@1',
  EK1_TEBLIG_IADE: 'EK1-TEBLIG-IADE@1',
  EK1_TEBLIGAT_TALEBI: 'EK1-TEBLIGAT-TALEBI@1',
  EK1_TEBLIGAT_GONDERIM: 'EK1-TEBLIGAT-GONDERIM@1',
  EK1_TEBLIG_DIGER: 'EK1-TEBLIG-DIGER@1',
  EK1_ITIRAZ: 'EK1-ITIRAZ@1',
  EK1_ITIRAZ_ASAMA: 'EK1-ITIRAZ-ASAMA@1',
  EK1_ITIRAZ_TEBLIGI: 'EK1-ITIRAZIN-TEBLIGI@1',
  EK1_ITIRAZ_DIGER: 'EK1-ITIRAZ-DIGER@1',
  EK1_HACIZ_DOSYA_ALACAGI: 'EK1-HACIZ-DOSYA-ALACAGI@1',
  EK1_HACIZ_IHTIYATI: 'EK1-HACIZ-IHTIYATI@1',
  EK1_HACIZ_BORCLU: 'EK1-HACIZ-BORCLU@1',
  EK1_HACIZ_DIGER: 'EK1-HACIZ-DIGER@1',
  EK1_KESINLESME: 'EK1-KESINLESME@1',
  EK1_KESINLESME_DIGER: 'EK1-KESINLESME-DIGER@1',
  EK1_TAHSILAT_SINYALI: 'EK1-TAHSILAT-SINYALI@1',
  EK1_ODEME_EMRI: 'EK1-ODEME-EMRI@1',
  EK1_MASRAF: 'EK1-MASRAF-MAKBUZU@1',
  EK1_REDDIYAT: 'EK1-REDDIYAT@1',
  EK1_DAVA_SINYALI: 'EK1-DAVA-SINYALI@1',
  EK1_KAPANIS_SINYALI: 'EK1-KAPANIS-SINYALI@1',
  EK1_DIGER: 'EK1-DIGER@1',
  UY_DURUM_ITIRAZ: 'UY-DURUM-METNI-ITIRAZ@1',
  UY_YATAN_PARA: 'UY-YATAN-PARA@1',
  MZ_UETS: 'MZ-UETS@1',
  MZ_TK21: 'MZ-TK21@1',
  MZ_TK35: 'MZ-TK35@1',
  MZ_MUHATABA: 'MZ-MUHATABA@1',
  MZ_IADE: 'MZ-IADE@1',
  MZ_BELIRSIZ: 'MZ-BELIRSIZ@1',
  EL_ALACAKLIYA_TEBLIG: 'EL-ALACAKLIYA-TEBLIG@1',
} as const

/** Kural kodundan sürümü ayırır: "EK1-ITIRAZ@1" → { kod: "EK1-ITIRAZ", surum: 1 }. */
export function kuralAyir(k: string | null | undefined): { kod: string; surum: number | null } {
  const s = String(k ?? '')
  const i = s.lastIndexOf('@')
  if (i < 0) return { kod: s, surum: null }
  const n = Number(s.slice(i + 1))
  return { kod: s.slice(0, i), surum: Number.isFinite(n) ? n : null }
}

/** Metinde kullanılan hukuki etiket (06 "Türkçe mikro metin": her yerde aynı yazılır). */
export const TEYIT_GEREKLI = 'teyit gerekli'

/**
 * Evrak adından gelen TAHSILAT olayının senkronda aldığı etiket (docs/04 K1; plan S05). Olay tip 'DURUM' olur,
 * hiçbir tahsilat toplamına girmez. Önek DEĞİŞTİRİLMEZ: aday sınıflandırıcı (aday-siniflandir.ts) bununla tanır.
 */
export const TAHSILAT_SINYALI_ETIKET = 'TAHSİLAT SİNYALİ (evrak adından; tahsilat sayılmadı)'
