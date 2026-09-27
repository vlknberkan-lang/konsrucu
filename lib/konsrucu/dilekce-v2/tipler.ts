/**
 * KonsRücü — Dilekçe v2 ortak türleri · lib/konsrucu/dilekce-v2/tipler.ts (saf; client-safe)
 *
 * S35 (06 §7.3 Aşama 1; B38, B40): `DosyaKarti.icerikJson` biçimi. Kart sürümlüdür; kilitlenen (ONAYLI) kart
 * değişmez, düzeltme yeni sürüm açar. Bu dosya DB ve sunucu anahtarı import etmez.
 */

export const KART_TURLERI = ['DAVA', 'DELIL', 'CEVABA_CEVAP', 'BEYAN'] as const
export type KartTuru = (typeof KART_TURLERI)[number]
export const kartTuruMu = (v: unknown): v is KartTuru => typeof v === 'string' && (KART_TURLERI as readonly string[]).includes(v)

export const KART_TUR_ADI: Record<KartTuru, string> = {
  DAVA: 'Dava dilekçesi',
  DELIL: 'Delil dilekçesi',
  CEVABA_CEVAP: 'Cevaba cevap dilekçesi',
  BEYAN: 'Beyan dilekçesi',
}

export const KART_DURUMLARI = ['TASLAK', 'ONAYLI', 'ESKIDI'] as const
export type KartDurumu = (typeof KART_DURUMLARI)[number]

/** Aşama 2'yi kilitleyen olgu kümeleri (06 §7.3: taraflar, tutar, itiraz kapsamı, rücu sebebi kodu, son tutanak). */
export const KRITIK_ALANLAR = ['TARAFLAR', 'TUTAR', 'ITIRAZ_KAPSAMI', 'RUCU_SEBEBI', 'SON_TUTANAK', 'MAHKEME_ESAS'] as const
export type KritikAlan = (typeof KRITIK_ALANLAR)[number]

export const KRITIK_ALAN_ADI: Record<KritikAlan, string> = {
  TARAFLAR: 'Taraflar',
  TUTAR: 'Tutar ve dava değeri',
  ITIRAZ_KAPSAMI: 'İtiraz kapsamı',
  RUCU_SEBEBI: 'Rücu sebebi kodu',
  SON_TUTANAK: 'Arabuluculuk son tutanağı',
  MAHKEME_ESAS: 'Mahkeme ve esas no',
}

/** "Delil ve beyan dilekçesinde yalnız o türün kritik alt kümesi aranır" (06 §7.3). */
export const KRITIK_ALT_KUME: Record<KartTuru, readonly KritikAlan[]> = {
  DAVA: ['TARAFLAR', 'TUTAR', 'ITIRAZ_KAPSAMI', 'RUCU_SEBEBI', 'SON_TUTANAK'],
  DELIL: ['TARAFLAR', 'MAHKEME_ESAS'],
  CEVABA_CEVAP: ['TARAFLAR', 'MAHKEME_ESAS', 'TUTAR', 'ITIRAZ_KAPSAMI'],
  BEYAN: ['TARAFLAR', 'MAHKEME_ESAS'],
}

/** Yapay zekânın olguya verebileceği alan etiketleri (kapalı liste). */
export const OLGU_ALANLARI = [
  'KAZA', 'KUSUR', 'ODEME', 'POLICE', 'HASAR', 'ITIRAZ_KAPSAMI', 'SON_TUTANAK', 'TEBLIG', 'ALKOL', 'SAVUNMA', 'ALEYHE', 'LIKIDITE', 'DIGER',
] as const
export type OlguAlani = (typeof OLGU_ALANLARI)[number]

/** Yapay zekâ olgusu hangi kritik kümeyi karşılayabilir? Taraflar, tutar ve rücu sebebi yalnız kayıttan gelir. */
export const AI_KRITIK_ESLEME: Partial<Record<string, KritikAlan>> = {
  ITIRAZ_KAPSAMI: 'ITIRAZ_KAPSAMI',
  SON_TUTANAK: 'SON_TUTANAK',
}

/**
 * KAYIT: programın onaylı kaydı (TakipTalebi, Dava, BorcluTakip, Arabuluculuk, müvekkil ayarı).
 * ALAN: onaylı AlanDegeri (alıntısı doğrulanmış). AI: yapay zekâ olgusu, alıntısı sunucuda bulundu.
 */
export type OlguKaynakTuru = 'KAYIT' | 'ALAN' | 'AI'

export type KartOlgu = {
  id: string // "O-1"
  metin: string
  alanlar: string[]
  kritik: boolean
  kritikAlan: KritikAlan | null
  kaynakTuru: OlguKaynakTuru
  /** Ekranda kaynak: "Takip talebi (sürüm 2)", "İtiraz dilekçesi". */
  kaynakEtiketi: string
  kayitRef: { tablo: string; id: string } | null
  belgeId: string | null
  belgeAdi: string | null
  sayfa: number | null
  alinti: string | null
  /** null: kayıt kaynaklı (alıntı aranmaz) · true: alıntı belgede bulundu. false olan olgu karta giremez. */
  alintiDogru: boolean | null
  onayli: boolean
  onaylayanId: string | null
  onayAt: string | null
  duzeltildi: boolean
  /** Davalı adayı / davacı olgusu ise taraf bağı (jetonlar aşama 2'de bu bağdan açılır). */
  tarafRef?: { rol: 'DAVACI' | 'DAVALI'; borcluId: string | null; davaTarafId: string | null }
}

export type KaynaksizOlgu = {
  metin: string
  belgeId: string | null
  belgeAdi: string | null
  sayfa: number | null
  alinti: string | null
  neden: string
}

export const TALEP_KODLARI = ['ITIRAZIN_IPTALI', 'TAKIBIN_DEVAMI', 'INKAR_TAZMINATI', 'YARGILAMA_GIDERI', 'IHTIYATI_HACIZ'] as const
export type TalepKodu = (typeof TALEP_KODLARI)[number]
export const TALEP_ADI: Record<TalepKodu, string> = {
  ITIRAZIN_IPTALI: 'İtirazın iptali',
  TAKIBIN_DEVAMI: 'Takibin devamı',
  INKAR_TAZMINATI: 'İcra inkâr tazminatı',
  YARGILAMA_GIDERI: 'Yargılama gideri ve vekâlet ücreti',
  IHTIYATI_HACIZ: 'İhtiyati haciz',
}

/** Avukatın seçimleri. Sistem yalnız öneri üretir (`KartIcerik.oneriler`); burası avukat kaydedince dolar. */
export type KartSecimler = {
  mahkeme: string | null
  usul: 'YAZILI' | 'BASIT' | null
  esas: string | null
  davalilar: string[] // borcluId
  talepler: TalepKodu[]
  arabuluculukGerekmez: boolean
  arabuluculukGerekce: string | null
  not: string | null
  kaydedenId: string | null
  kayitAt: string | null
}

export type DavaliAdayi = {
  borcluId: string
  ad: string
  itirazVar: boolean | null
  itirazTipi: string | null
  itirazTarihi: string | null
  davaTarafId: string | null
  davaTarafTeyit: string | null
}

export type KartEk = { belgeId: string; ad: string; altTur: string | null; sira: number }

export type SavunmaKonusu = 'ZAMANASIMI' | 'KUSUR' | 'HUSUMET' | 'LIKIDITE' | 'FAIZ' | 'USUL' | 'GOREV_YETKI' | 'DIGER'

export type SavunmaSatiri = {
  id: string // "S-1"
  baslik: string
  konu: SavunmaKonusu
  belgeId: string | null
  belgeAdi: string | null
  sayfa: number | null
  alinti: string
  isaret: 'CEVAPLANACAK' | 'ONEMSIZ' | null
  isaretleyenId: string | null
  isaretAt: string | null
}

export type KartEksik = { metin: string; kritik: boolean; alan: KritikAlan | null }

export type KartIcerik = {
  tur: KartTuru
  olgular: KartOlgu[]
  kaynaksizlar: KaynaksizOlgu[]
  secimler: KartSecimler
  oneriler: { mahkeme: string | null; usul: 'YAZILI' | 'BASIT' | null; esas: string | null; davalilar: string[]; talepler: TalepKodu[] }
  davaliAdaylari: DavaliAdayi[]
  ekler: KartEk[]
  eksikler: KartEksik[]
  celiskiler: { aciklama: string; olguIdleri: string[] }[]
  savunmalar: SavunmaSatiri[]
  /** Aşama 2'nin hukuki sebepler bloğu için DOĞRULANDI kütüphane kayıtları (rücu sebebi koduna bağlı). */
  dayanaklar: { kaynakId: string; kunye: string }[]
  /** Dava türü (Dava.tur) — B08 kapısı itirazın iptalinde uygulanır. */
  davaTuru: string | null
  ai: { durum: 'KULLANILDI' | 'KAPALI' | 'HATA' | 'YOK'; model: string | null; uyari: string | null }
  okunamayanBelgeler: string[]
  kisaltilanBelgeler: string[]
  aiyaGitmeyenBelgeler: string[]
}

/** Ekran için kart görünümü (sunucu → istemci). */
export type KartGorunum = {
  id: string
  surum: number
  durum: KartDurumu
  updatedAt: string
  onayAt: string | null
  onaylayanId: string | null
  icerik: KartIcerik
  kilit: { kilitlenebilir: boolean; nedenler: string[] }
  asama2: { acik: boolean; nedenler: string[] }
}
