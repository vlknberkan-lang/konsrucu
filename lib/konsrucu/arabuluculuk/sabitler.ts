/**
 * KonsRücü — arabuluculuk, müvekkil onayı ve yol seçimi sabitleri · lib/konsrucu/arabuluculuk/sabitler.ts
 *
 * 06 §3.1 ilke 2: yeni tür/durum alanları String'dir; geçerli değerler burada ve (kapalı listelerde)
 * SQL CHECK'te yazılır (prisma/sql/b2c/010_arabuluculuk_onay.sql). Buradaki listeler CHECK ile BİREBİR aynıdır;
 * CHECK'i olmayan listeler (OnayKaydi.tur, YolSecimi.secim) büyüyebilir.
 */

/** Arabuluculuk.tur — CHECK: DAVA_SARTI | IHTIYARI | BELIRSIZ. Varsayılan YOK: avukat seçer (açık karar 3). */
export const ARABULUCULUK_TURLERI = ['DAVA_SARTI', 'IHTIYARI', 'BELIRSIZ'] as const
export type ArabuluculukTuru = (typeof ARABULUCULUK_TURLERI)[number]

export const ARABULUCULUK_TUR_ETIKET: Record<ArabuluculukTuru, string> = {
  DAVA_SARTI: 'Dava şartı',
  IHTIYARI: 'İhtiyari',
  BELIRSIZ: 'Belirsiz',
}

/** Arabuluculuk.sonuc — CHECK: ANLASMA | ANLASAMAMA | ULASILAMAMA | KATILMAMA | KISMEN. */
export const ARABULUCULUK_SONUCLARI = ['ANLASMA', 'ANLASAMAMA', 'ULASILAMAMA', 'KATILMAMA', 'KISMEN'] as const
export type ArabuluculukSonucu = (typeof ARABULUCULUK_SONUCLARI)[number]

export const ARABULUCULUK_SONUC_ETIKET: Record<ArabuluculukSonucu, string> = {
  ANLASMA: 'Anlaşma',
  ANLASAMAMA: 'Anlaşamama',
  ULASILAMAMA: 'Ulaşılamama',
  KATILMAMA: 'Katılmama',
  KISMEN: 'Kısmen anlaşma',
}

/** Asama.sonuc serbest metnine aynalanan değer (mevcut dil: "anlasildi | anlasilmadi …"). */
export const ASAMA_SONUC_AYNA: Record<ArabuluculukSonucu, string> = {
  ANLASMA: 'anlasildi',
  ANLASAMAMA: 'anlasilmadi',
  ULASILAMAMA: 'ulasilamadi',
  KATILMAMA: 'katilmadi',
  KISMEN: 'kismen',
}

/** OnayKaydi.tur — CHECK yok (B16'da ıslah, feragat gelir). */
export const ONAY_TURLERI = ['DAVA_ACMA', 'ARABULUCULUK', 'AVANS', 'SULH_ISKONTO', 'KANUN_YOLU', 'TAKIBI_BIRAKMA', 'KAPATMA'] as const
export type OnayTuru = (typeof ONAY_TURLERI)[number]

export const ONAY_TUR_ETIKET: Record<OnayTuru, string> = {
  DAVA_ACMA: 'Dava açma',
  ARABULUCULUK: 'Arabuluculuğa başvuru',
  AVANS: 'Gider ve harç avansı',
  SULH_ISKONTO: 'Sulh ve iskonto',
  KANUN_YOLU: 'Kanun yoluna başvuru',
  TAKIBI_BIRAKMA: 'Takibi bırakma',
  KAPATMA: 'Dosyayı kapatma',
}

/** OnayKaydi.sonuc — CHECK: BEKLIYOR | ONAY | RET. */
export const ONAY_SONUCLARI = ['BEKLIYOR', 'ONAY', 'RET'] as const
export type OnaySonucu = (typeof ONAY_SONUCLARI)[number]

export const ONAY_SONUC_ETIKET: Record<OnaySonucu, string> = { BEKLIYOR: 'Bekliyor', ONAY: 'Onay verildi', RET: 'Reddedildi' }

/** YolSecimi.asama — CHECK: ITIRAZ_SONRASI | KARAR_SONRASI. */
export const YOL_ASAMALARI = ['ITIRAZ_SONRASI', 'KARAR_SONRASI'] as const
export type YolAsamasi = (typeof YOL_ASAMALARI)[number]

/** YolSecimi.secim (ITIRAZ_SONRASI) — CHECK yok. */
export const ITIRAZ_SONRASI_YOLLAR = ['ARABULUCULUK_IIK67', 'IIK68_KALDIRMA', 'GENEL_ALACAK', 'TAKIBI_BIRAK'] as const
export type ItirazSonrasiYol = (typeof ITIRAZ_SONRASI_YOLLAR)[number]

export const ITIRAZ_SONRASI_ETIKET: Record<ItirazSonrasiYol, string> = {
  ARABULUCULUK_IIK67: 'Arabuluculuk + itirazın iptali davası (İİK 67)',
  IIK68_KALDIRMA: 'İtirazın kaldırılması (İİK 68) · belge şartı teyit gerekli',
  GENEL_ALACAK: 'Genel alacak davası',
  TAKIBI_BIRAK: 'Takibi bırak / dosyayı kapat',
}

/** YolSecimi.secim (KARAR_SONRASI) — CHECK yok. */
export const KARAR_SONRASI_YOLLAR = ['TAKIBE_DEVAM', 'ISTINAF', 'TEMYIZ', 'KANUN_YOLU_YOK', 'TAKIBI_DARALT'] as const
export type KararSonrasiYol = (typeof KARAR_SONRASI_YOLLAR)[number]

export const KARAR_SONRASI_ETIKET: Record<KararSonrasiYol, string> = {
  TAKIBE_DEVAM: 'Takibe devam',
  ISTINAF: 'İstinaf',
  TEMYIZ: 'Temyiz',
  KANUN_YOLU_YOK: 'Kanun yoluna gidilmeyecek',
  TAKIBI_DARALT: 'Takibi kabul edilen kısımla daralt',
}

/**
 * Hangi yol hangi müvekkil onayını ister. Dava açma, takibi bırakma, sulh/iskonto ve kanun yolu kararı
 * müvekkilindir (06 2(f), 2(j)); avukat önerir, sigortacı onaylar.
 */
export const YOL_ONAY_TURU: Record<ItirazSonrasiYol | KararSonrasiYol, OnayTuru | null> = {
  ARABULUCULUK_IIK67: 'DAVA_ACMA',
  IIK68_KALDIRMA: 'DAVA_ACMA',
  GENEL_ALACAK: 'DAVA_ACMA',
  TAKIBI_BIRAK: 'TAKIBI_BIRAKMA',
  TAKIBE_DEVAM: null,
  ISTINAF: 'KANUN_YOLU',
  TEMYIZ: 'KANUN_YOLU',
  KANUN_YOLU_YOK: 'KANUN_YOLU',
  TAKIBI_DARALT: null,
}

/** Veri kaynağı türü (DavaTaraf/DavaIslem/IhtiyatiHaciz.kaynakTuru ve Asama.detayJson işareti). */
export const KAYNAK_TURLERI = ['UYAP_EVRAK', 'UYAP_YAPISAL', 'EXCEL', 'AI', 'ELLE', 'KURAL', 'GERI_DOLDURMA'] as const
export type KaynakTuru = (typeof KAYNAK_TURLERI)[number]

/** Aday kayıt teyidi — CHECK: ADAY | TEYITLI | REDDEDILDI. */
export const TEYIT_DURUMLARI = ['ADAY', 'TEYITLI', 'REDDEDILDI'] as const
export type TeyitDurumu = (typeof TEYIT_DURUMLARI)[number]

/** Müvekkil onayı zorunluluğuna süre koruma istisnası: ihtiyatlı İİK 67 son gününe kalan gün eşiği (açık karar 4). */
export const ONAY_ISTISNA_ESIK_GUN = 14

/** Yazılı gerekçe asgari uzunluğu (kapı geçişleri ve istisnalar). */
export const GEREKCE_ASGARI = 10

/** Sure.durum değerlerinden açık sayılanlar. */
export const ACIK_SURE_DURUMLARI = ['TETIK_BEKLIYOR', 'ACIK', 'KAPANMAYA_HAZIR'] as const
