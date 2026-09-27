/**
 * KonsRücü — dava sabitleri · lib/konsrucu/dava/sabitler.ts
 * CHECK'li listeler prisma/sql/b2c/011_dava.sql ile BİREBİR aynıdır; CHECK'siz listeler büyüyebilir (06 §3.1).
 */

/** Dava.tur — CHECK yok. */
export const DAVA_TURLERI = ['ITIRAZIN_IPTALI', 'ALACAK', 'MENFI_TESPIT', 'IDARI', 'DIGER'] as const
export type DavaTuru = (typeof DAVA_TURLERI)[number]
export const DAVA_TUR_ETIKET: Record<DavaTuru, string> = {
  ITIRAZIN_IPTALI: 'İtirazın iptali',
  ALACAK: 'Alacak',
  MENFI_TESPIT: 'Menfi tespit',
  IDARI: 'İdari (tam yargı)',
  DIGER: 'Diğer',
}

/** Dava.mahkemeTuru — CHECK yok. Görevli mahkemeyi AVUKAT seçer; program mahkeme adı önermez. */
export const MAHKEME_TURLERI = ['ASLIYE_HUKUK', 'ASLIYE_TICARET', 'TUKETICI', 'SULH_HUKUK', 'ICRA_HUKUK', 'BAM', 'YARGITAY'] as const
export type MahkemeTuru = (typeof MAHKEME_TURLERI)[number]
export const MAHKEME_TUR_ETIKET: Record<MahkemeTuru, string> = {
  ASLIYE_HUKUK: 'Asliye Hukuk',
  ASLIYE_TICARET: 'Asliye Ticaret',
  TUKETICI: 'Tüketici',
  SULH_HUKUK: 'Sulh Hukuk',
  ICRA_HUKUK: 'İcra Hukuk',
  BAM: 'Bölge Adliye Mahkemesi',
  YARGITAY: 'Yargıtay',
}

/** Dava.rolumuz — CHECK: DAVACI | DAVALI. */
export const DAVA_ROLLERI = ['DAVACI', 'DAVALI'] as const

/** Dava.usul — CHECK: BASIT | YAZILI. Varsayılan YOK. */
export const USULLER = ['BASIT', 'YAZILI'] as const
export const USUL_ETIKET: Record<(typeof USULLER)[number], string> = { BASIT: 'Basit usul', YAZILI: 'Yazılı usul' }

/** Dava.evre — CHECK yok. */
export const DAVA_EVRELERI = ['TENSIP_BEKLENIYOR', 'DILEKCELER', 'ON_INCELEME', 'TAHKIKAT', 'KARAR_BEKLENIYOR'] as const
export type DavaEvresi = (typeof DAVA_EVRELERI)[number]
export const EVRE_ETIKET: Record<DavaEvresi, string> = {
  TENSIP_BEKLENIYOR: 'Tensip bekleniyor',
  DILEKCELER: 'Dilekçeler',
  ON_INCELEME: 'Ön inceleme',
  TAHKIKAT: 'Tahkikat',
  KARAR_BEKLENIYOR: 'Karar bekleniyor',
}

/** Dava.durum — CHECK yok (davaEksen dili). */
export const DAVA_DURUMLARI = ['HAZIRLIK', 'DERDEST', 'ISLEMDEN_KALDIRILDI', 'KARAR', 'KANUN_YOLU', 'KESINLESTI'] as const
export type DavaDurumu = (typeof DAVA_DURUMLARI)[number]
export const DAVA_DURUM_ETIKET: Record<DavaDurumu, string> = {
  HAZIRLIK: 'Hazırlık',
  DERDEST: 'Derdest',
  ISLEMDEN_KALDIRILDI: 'İşlemden kaldırıldı',
  KARAR: 'Karar',
  KANUN_YOLU: 'Kanun yolunda',
  KESINLESTI: 'Kesinleşti',
}

/** DavaTaraf.rol — CHECK yok. */
export const TARAF_ROLLERI = ['DAVACI', 'DAVALI', 'FERI_MUDAHIL'] as const

/** DavaIslem.tur — CHECK yok. Excel türleri: DELIL_DILEKCESI (#29), DEKONT_SUNUMU (#28), MUZEKKERE(_CEVABI) (#30). */
export const DAVA_ISLEM_TURLERI = [
  'TENSIP', 'CEVAP', 'CEVABA_CEVAP', 'IKINCI_CEVAP', 'ON_INCELEME', 'ARA_KARAR', 'BILIRKISI_ATAMA',
  'BILIRKISI_RAPORU', 'DURUSMA', 'ISLEMDEN_KALDIRMA', 'GOREVSIZLIK', 'KARAR', 'GEREKCELI_KARAR',
  'ISTINAF', 'KESINLESME', 'DELIL_DILEKCESI', 'DEKONT_SUNUMU', 'MUZEKKERE', 'MUZEKKERE_CEVABI', 'DIGER',
] as const
export type DavaIslemTuru = (typeof DAVA_ISLEM_TURLERI)[number]
export const ISLEM_ETIKET: Record<DavaIslemTuru, string> = {
  TENSIP: 'Tensip zaptı',
  CEVAP: 'Cevap dilekçesi',
  CEVABA_CEVAP: 'Cevaba cevap dilekçesi',
  IKINCI_CEVAP: 'İkinci cevap dilekçesi',
  ON_INCELEME: 'Ön inceleme',
  ARA_KARAR: 'Ara karar',
  BILIRKISI_ATAMA: 'Bilirkişi ataması',
  BILIRKISI_RAPORU: 'Bilirkişi raporu',
  DURUSMA: 'Duruşma',
  ISLEMDEN_KALDIRMA: 'İşlemden kaldırma',
  GOREVSIZLIK: 'Görevsizlik/yetkisizlik',
  KARAR: 'Karar',
  GEREKCELI_KARAR: 'Gerekçeli karar',
  ISTINAF: 'İstinaf',
  KESINLESME: 'Kesinleşme',
  DELIL_DILEKCESI: 'Delil dilekçesi',
  DEKONT_SUNUMU: 'Dekont sunumu',
  MUZEKKERE: 'Müzekkere',
  MUZEKKERE_CEVABI: 'Müzekkere cevabı',
  DIGER: 'Diğer işlem',
}

/** Dava.hukum — CHECK: KABUL | KISMEN_KABUL | RET | DIGER. */
export const HUKUMLER = ['KABUL', 'KISMEN_KABUL', 'RET', 'DIGER'] as const
export type Hukum = (typeof HUKUMLER)[number]
export const HUKUM_ETIKET: Record<Hukum, string> = { KABUL: 'Kabul', KISMEN_KABUL: 'Kısmen kabul', RET: 'Ret', DIGER: 'Diğer' }

export const YON_DEGERLERI = ['LEHE', 'ALEYHE'] as const
export const VEKALET_YON_DEGERLERI = ['LEHE', 'ALEYHE', 'IKI_YONLU'] as const

/** IhtiyatiHaciz.asama — CHECK: TAKIP_ONCESI | DAVADA | ILAMLI. */
export const IH_ASAMALARI = ['TAKIP_ONCESI', 'DAVADA', 'ILAMLI'] as const
/** IhtiyatiHaciz.sonuc — CHECK: BEKLIYOR | KABUL | RED | KISMEN. */
export const IH_SONUCLARI = ['BEKLIYOR', 'KABUL', 'RED', 'KISMEN'] as const
export type IhSonucu = (typeof IH_SONUCLARI)[number]
export const IH_SONUC_ETIKET: Record<IhSonucu, string> = { BEKLIYOR: 'Bekliyor', KABUL: 'Kabul', RED: 'Red', KISMEN: 'Kısmen kabul' }

/** RucuDosyasi.kapanisSebebi — CHECK yok (012). BILINMIYOR ya da boş = radarda kalır (SN-06). */
export const KAPANIS_SEBEPLERI = ['TAHSIL', 'HARICEN_TAHSIL', 'SULH', 'FERAGAT', 'ISLEMDEN_KALDIRMA', 'ACIZ', 'TAKIBI_BIRAKMA', 'BILINMIYOR'] as const
export type KapanisSebebi = (typeof KAPANIS_SEBEPLERI)[number]
export const KAPANIS_ETIKET: Record<KapanisSebebi, string> = {
  TAHSIL: 'Tahsil edildi',
  HARICEN_TAHSIL: 'Haricen tahsil',
  SULH: 'Sulh',
  FERAGAT: 'Feragat',
  ISLEMDEN_KALDIRMA: 'İşlemden kaldırma',
  ACIZ: 'Aciz',
  TAKIBI_BIRAKMA: 'Takip bırakıldı',
  BILINMIYOR: 'Bilinmiyor (radarda kalır)',
}
/** Kapanış sebebi müvekkil kararına dayanıyorsa gereken onay türü. */
export const KAPANIS_ONAY_TURU: Partial<Record<KapanisSebebi, 'SULH_ISKONTO' | 'TAKIBI_BIRAKMA'>> = {
  SULH: 'SULH_ISKONTO',
  FERAGAT: 'TAKIBI_BIRAKMA',
  TAKIBI_BIRAKMA: 'TAKIBI_BIRAKMA',
}

/** Dava Panosu: "sessiz" eşiği (gün) ve süre penceresi (gün). */
export const SESSIZ_ESIK_GUN = 60
export const SURE_PENCERE_GUN = 30
