/**
 * KonsRücü — Dosya Yol Haritası · tipler · lib/konsrucu/yol-haritasi/tipler.ts  (saf; client-safe)
 *
 * Yönlendirme motorunun sözleşmesi (06 §8.1):
 *   - `Gercekler`: dosyanın anlık görüntüsü. YALNIZ şemadaki kolonlardan kurulur (gercekler.ts); kişisel veri
 *     taşımaz (borçlu adı, TCKN, telefon, IBAN yok — borçlular sıra numarasıyla anılır).
 *   - `Kural`: kural tablosunun bir satırı (06 §8.3): kod, sürüm, durak, koşul (saf), öneri, birincil eylem,
 *     rol, öncelik, engel mi, hukuki etiket, kanıt.
 *   - `SiradakiAdimSonuc`: `siradakiAdim(g, bugun)` çıktısı → { simdi, sonra[≤3], engeller[], bekleme?, bilgi[] }.
 *
 * Yapay zekâ hiçbir kuralı tetiklemez (M4): aday kanıt yalnız "onayla" türünde adım doğurur.
 */

/** Sekiz durak (06 §2 iskelet): 1 Evrak · 2 Hazırlık · 3 Takip · 4 Tebliğ-itiraz · 5 Arabuluculuk · 6 Dava açılışı · 7 Yargılama · 8 Sonuç ve tahsil. */
export type DurakNo = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/** Öncelik merdiveni (06 §8.2): 0 veri engeli · 1 süre riski · 2 süre başlatan aday · 3 diğer onaylar · 4 eksik zorunlu veri · 5 evre ilerletme · 6 bekleme/bilgi. */
export type Oncelik = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Rol sütunu (06 §8.3): H herkes · A avukat · A+2 avukat + kritik sürede ikinci teyit · SORUMLU sürenin sorumlusu · '-' eylemsiz. */
export type KuralRol = 'H' | 'A' | 'H/A' | 'A+2' | 'SORUMLU' | '-'

/** Kural grubu: tablo başlıkları (Genel, 1 Evrak, 2 Hazırlık, İdari yol, 3 Takip, 4 Tebliğ-itiraz, 5 Arabuluculuk, 6 Dava açılışı, 7 Yargılama, 8 Sonuç). */
export type KuralGrubu = 'GN' | 'EV' | 'HZ' | 'ID' | 'TK' | 'TB' | 'AR' | 'DA' | 'YR' | 'SN'

/** Ana senaryonun adımları (06 §2 a–j). */
export type SenaryoAdimi = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j'

/** Kural türü: EYLEM birincil düğme doğurur; BEKLEME "Bekliyoruz" kartı; BILGI eylemsiz not. */
export type KuralTuru = 'EYLEM' | 'BEKLEME' | 'BILGI'

/**
 * Birincil eylemin hedefi (sembolik). Ekranın hangi panele/alana götüreceğini "Bağla" aşaması belirler
 * (components/dosya/yol-haritasi/eylem.ts varsayılan eşlemeyi verir).
 */
export type EylemHedef =
  | 'durum-teyit' | 'tutar-dogrula' | 'eslesme-duzelt' | 'sure-onay' | 'sure-git' | 'uyap-ac' | 'uyap-cek'
  | 'evrak-ekle' | 'okunamayanlar' | 'ray-istek' | 'alan-onay' | 'celiski' | 'rucu-sebebi-sec'
  | 'hazirlik' | 'hazirlik-onay' | 'yol-sec-idari' | 'idari-yol-onay' | 'idari-basvuru'
  | 'kopilot-ac' | 'kopilot-gorev' | 'esas-no-gir'
  | 'olay-onay' | 'teblig-karar' | 'itiraz-kapsam' | 'itiraz-teblig-tarih' | 'kesinlesme-teyit' | 'itiraz-incele' | 'talep-taslak'
  | 'yol-sec' | 'onay-talebi' | 'onay-kaydet' | 'arabuluculuk-tur' | 'arabuluculuk-basvuru' | 'toplanti-sonuc' | 'son-tutanak'
  | 'taksit-plan' | 'tutanak-incele'
  | 'dava-on-kontrol' | 'dava-dilekce' | 'dava-esas-gir' | 'dava-bagla' | 'dava-incele'
  | 'usul-sec' | 'cevaba-cevap' | 'beyan' | 'rapor-analiz' | 'durusma-notu' | 'durusma-sonuc'
  | 'karar-karti' | 'karar-sonrasi-yol' | 'gerekceli-teblig-tarih' | 'kapanis-sec' | 'tahsilat-onay' | 'muvekkil-bildirim'

export interface BirincilEylem {
  /** Düğme metni, tablodaki köşeli parantezin içi aynen ("Onayla", "Tarih gir" …). */
  etiket: string
  hedef: EylemHedef
}

/** "Neden?" panelinin kanıt satırı. Kişisel veri taşımaz; alıntı kaynak belgedeki kısa metindir (≤ 300 karakter). */
export interface Kanit {
  tur: 'BELGE' | 'OLAY' | 'SURE' | 'ALAN' | 'DOSYA' | 'SENKRON' | 'ARABULUCULUK' | 'DAVA' | 'DAVA_ISLEM' | 'ETKINLIK' | 'YOL_SECIMI' | 'ONAY_KAYDI' | 'TAKIP_TALEBI' | 'BORCLU'
  id?: string | null
  etiket: string
  /** Olgunun hukuki tarihi (YYYY-MM-DD, İstanbul günü). */
  tarih?: string | null
  belgeId?: string | null
  sayfa?: number | null
  alinti?: string | null
}

/** Bir kuralın bu dosyadaki eşleşmesi (koşul doğruysa kuralın `degerlendir`i döndürür). */
export interface Eslesme {
  /** Şimdi kartı cümlesi (tek cümle). */
  metin: string
  /** Bir cümlelik gerekçe ("Neden: …"). */
  neden: string
  kanit: Kanit[]
  /** Varsa ilgili son gün (öneri ya da onaylanan) — eşitlikte en yakın son gün kazanır. */
  sonGun?: Date | null
  /** Kuralın durağından farklı bir durağa aitse (ör. dava tarafındaki süre başlatan aday). */
  durak?: DurakNo | null
  /** Aynı kuralın bu dosyadaki eşleşme sayısı (ör. 3 onaysız süre). */
  adet?: number
  /** Duruma göre farklı düğme metni gerekiyorsa (ör. "Onayı kaydet"). */
  eylem?: BirincilEylem | null
}

// ─────────────────────────── Gerçekler (dosyanın anlık görüntüsü) ───────────────────────────

export interface GDosya {
  id: string
  hukukDosyaNo: string | null
  /** Müvekkil (tenant) adı — kişisel veri değil. */
  muvekkilAd: string | null
  /** Eski tek eksenli durum (DosyaDurum). */
  durum: string
  /** AI'ın yol önerisi (KLASIK | IDARI | BELIRSIZ); karar değildir (B12). */
  yol: string | null
  yolGuven: number | null
  yolNeden: string | null
  /** Avukatın yol kararı anı (RucuDosyasi.yolOnayAt; yolOnaylayanId doluysa). */
  yolOnayAt: Date | null
  icraEksen: string | null
  arabEksen: string | null
  davaEksen: string | null
  /** eksenJson.{icra,arab,dava}.teyit (TEYITLI | TEYITSIZ …). */
  eksenTeyit: { icra: string | null; arab: string | null; dava: string | null }
  onarimDurumu: string | null
  /** Bekleyen (KURU/ONAYLI, uygulanmamış) VeriOnarim satırı sayısı. */
  onarimBekleyen: number
  rucuSebebiKod: string | null
  /** Prisma `Brans` (ZMMS | KASKO | OTO_DISI) — EV-07'nin "GŞ sürümü teyit gerekli" ifadesi yalnız ZMMS'de yazılır. */
  brans: string | null
  /** Ray'in zamanaşımı tarihi (K1'de bekleyen kural — "teyit gerekli"). */
  zamanasimi: Date | null
  yetkiliIcra: string | null
  icraDairesi: string | null
  icraDosyaNo: string | null
  takipTarihi: Date | null
  uyapDurum: string | null
  uyapSenkronAt: Date | null
  uyapEslesme: string | null
  uyapEslesmeNot: string | null
  rucuTutari: number | null
  asilAlacak: number | null
  /** UYAP hesap özetindeki "Yatan Para" (uyapHesapJson.tahsilat) — bilgi amaçlı. */
  uyapTahsilat: number | null
  kapanisSebebi: string | null
  kapanisAt: Date | null
  /** Faz 1 "Takibe hazır" avukat onayı (cikarimJson.onay.ok). */
  eskiOnay: { at: Date | null } | null
  /** Kopilot tevzi kaydı (cikarimJson.tevzi). */
  tevzi: { at: Date | null; birim: string | null } | null
  createdAt: Date
}

export interface GAyar {
  alacakliUnvanVar: boolean
  mersisVar: boolean
  vekaletnameVar: boolean
}

export interface GBelge {
  id: string
  dosyaAdi: string
  kategori: string
  altTur: string | null
  kaynak: string | null
  metinDurumu: string | null
  uyapEvrakTuru: string | null
  uyapDosyaTuru: string | null
  davaId: string | null
  /** Belgenin kendi tarihi: belgeTarihi ?? icerikTarihi (yoksa null). */
  tarih: Date | null
  createdAt: Date
}

export interface GOdeme {
  tarih: Date | null
  tutar: number | null
  haricMi: boolean
}

export interface GBorcluTakip {
  tebligTarihi: Date | null
  tebligSonucu: string | null
  tebligSekli: string | null
  tebligKaynakBelgeId: string | null
  itirazVar: boolean | null
  itirazVerilisTarihi: Date | null
  itirazUyapTarihi: Date | null
  itirazTipi: string | null
  itirazEdilenTutar: number | null
  itirazKaynakBelgeId: string | null
  itirazAlacakliyaTebligTarihi: Date | null
}

export interface GBorclu {
  id: string
  /** 1'den başlar — ekranda "1. borçlu" (ad gösterilmez). */
  sira: number
  /** GERCEK | OZEL_TUZEL | KAMU */
  tur: string | null
  teyitli: boolean
  takip: GBorcluTakip | null
}

export interface GOlay {
  id: string
  /** DURUM / TAHSILAT / TEBLIG / ITIRAZ / HACIZ / KESINLESTI / KAPANDI (TakipOlayi.tip). Opsiyonel: eski test
   *  kurguları hâlâ vermeyebilir; yalnız TB-02'nin "DURUM kanalından gelen, kendi onay yolu olmayan aday"
   *  süzgeci (durumBilgiAdayiMi) için okunur — eksen türetmeyi ETKİLEMEZ. */
  tip?: string | null
  altTip: string | null
  /** ADAY | TEYITLI | REDDEDILDI ; null = eski satır (yeni hesaplara girmez). */
  teyit: string | null
  borcluId: string | null
  hukukiTarih: Date | null
  tarih: Date | null
  tutar: number | null
  sonuc: string | null
  kaynakBelgeId: string | null
  kural: string | null
  createdAt: Date
}

export interface GAlan {
  id: string
  alan: string
  /** ONERI | ONAYLI (REDDEDILDI ve ESKIDI gerçeklere alınmaz). */
  durum: string
  kaynakTuru: string
  deger: unknown
  kaynakBelgeId: string | null
  sayfa: number | null
  alinti: string | null
  alintiDogru: boolean | null
  onayAt: Date | null
  createdAt: Date
}

export interface GTakipTalebi {
  id: string
  asilAlacak: number | null
  toplam: number | null
  faizTuru: string | null
  faizOraniMetni: string | null
  faizBaslangicTuru: string | null
  faizBaslangic: Date | null
  hesapIziVar: boolean
  onaylayanId: string | null
  dondurulduAt: Date | null
  takipTarihi: Date | null
  createdAt: Date
}

export interface GSure {
  id: string
  tur: string
  dayanak: string
  borcluId: string | null
  davaId: string | null
  arabuluculukId: string | null
  tetikTarihi: Date | null
  tetikTuru: string | null
  onerilenIhtiyatli: Date | null
  onerilenSonGun: Date | null
  onaylananSonGun: Date | null
  onayAt: Date | null
  ikinciTeyitAt: Date | null
  /** TETIK_BEKLIYOR | ACIK | KAPANMAYA_HAZIR | KAPANDI | IPTAL */
  durum: string
  kapanisKanitiBelgeId: string | null
  kapanisAt: Date | null
  kaynakBelgeId: string | null
  kaynakAlinti: string | null
  durmaVar: boolean
  createdAt: Date
}

export interface GSenkronIs {
  id: string
  tur: string
  durum: string
  hata: string | null
  createdAt: Date
  bittiAt: Date | null
}

export interface GNabiz {
  sonGorulme: Date
  uyapOturum: boolean
}

export interface GArabuluculuk {
  id: string
  asamaId: string
  /** DAVA_SARTI | IHTIYARI | BELIRSIZ — varsayılan yok. */
  tur: string | null
  basvuruTarihi: Date | null
  sonTutanakTarihi: Date | null
  /** ANLASMA | ANLASAMAMA | ULASILAMAMA | KATILMAMA | KISMEN */
  sonuc: string | null
  sonTutanakBelgeId: string | null
  /** Son tutanak onayı (avukat). */
  onayAt: Date | null
  createdAt: Date
}

export interface GEtkinlik {
  id: string
  /** ARABULUCULUK_TOPLANTISI | DURUSMA | … */
  tur: string
  asamaId: string | null
  baslar: Date
  /** PLANLANDI | YAPILDI | YAPILMADI | ERTELENDI | IPTAL */
  durum: string
  /** ADAY | TEYITLI | REDDEDILDI ; null = eski (elle) satır */
  teyit: string | null
  kaynak: string | null
  createdAt: Date
}

export interface GYolSecimi {
  id: string
  /** ITIRAZ_SONRASI | KARAR_SONRASI */
  asama: string
  secim: string
  davaId: string | null
  /** GECERLI | ESKIDI */
  durum: string
  secimAt: Date
}

export interface GOnayKaydi {
  id: string
  tur: string
  /** BEKLIYOR | ONAY | RET */
  sonuc: string
  istenmeAt: Date | null
  alinmaAt: Date | null
  yolSecimiId: string | null
  davaId: string | null
  createdAt: Date
}

export interface GOnKontrolMaddesi {
  kod: string
  durum: string | null
}

export interface GDava {
  id: string
  asamaId: string
  /** DAVACI | DAVALI */
  rolumuz: string
  tur: string | null
  mahkemeTuru: string | null
  usul: string | null
  davaDegeri: number | null
  acilisTarihi: Date | null
  esasVar: boolean
  /** HAZIRLIK | DERDEST | ISLEMDEN_KALDIRILDI | KARAR | KANUN_YOLU | KESINLESTI */
  durum: string
  onKontrol: GOnKontrolMaddesi[]
  onIncelemeTarihi: Date | null
  sonrakiDurusma: Date | null
  hukum: string | null
  kararTarihi: Date | null
  kararOnayAt: Date | null
  gerekceliTebligTarihi: Date | null
  kesinlesmeTarihi: Date | null
  createdAt: Date
}

export interface GDavaIslem {
  id: string
  davaId: string
  tur: string
  tarih: Date | null
  tebligTarihi: Date | null
  /** ADAY | TEYITLI | REDDEDILDI */
  teyit: string
  kaynakBelgeId: string | null
  /** detayJson.kesinSureler uzunluğu (tensip/ara karar). */
  kesinSureSayisi: number
  createdAt: Date
}

export interface GDilekce {
  id: string
  /** DAVA | DELIL | CEVABA_CEVAP | BEYAN | TALEP ; null = eski satır */
  tur: string | null
  davaId: string | null
  /** UretilenCikti.durum (TASLAK | IMZAYA_GIDEN | GONDERILDI) */
  durum: string | null
  /** Son DilekceSurum.durum (TASLAK | IMZAYA_HAZIR | GONDERILDI_UYAP) */
  sonSurumDurum: string | null
  createdAt: Date
}

export interface GTaksitPlani {
  durum: string
  createdAt: Date
}

/** "Ertele" kaydı (Aktivite'den okunur). Öncelik 0–2 kurallar (veri engeli, süre riski, süre başlatan aday) ertelenmez. */
export interface GErteleme {
  kural: string
  bitis: Date
  at: Date
}

export interface Gercekler {
  dosya: GDosya
  ayar: GAyar
  belgeler: GBelge[]
  odemeler: GOdeme[]
  borclular: GBorclu[]
  olaylar: GOlay[]
  alanlar: GAlan[]
  takipTalebi: GTakipTalebi | null
  sureler: GSure[]
  senkronIsleri: GSenkronIs[]
  nabiz: GNabiz | null
  arabuluculuk: GArabuluculuk | null
  etkinlikler: GEtkinlik[]
  yolSecimleri: GYolSecimi[]
  onayKayitlari: GOnayKaydi[]
  davalar: GDava[]
  davaIslemleri: GDavaIslem[]
  dilekceler: GDilekce[]
  taksitPlanlari: GTaksitPlani[]
  ertelemeler: GErteleme[]
  /**
   * Rücu sebebine göre asgari evrak setinin eksikleri (S19). Bu dilim seti KURMAZ (Yelda onaylı liste başka
   * modülde); "Bağla" aşaması doldurana kadar null → EV-04 tetiklenmez.
   */
  zorunluEvrak: { eksik: string[] } | null
  /** Prova modunda kesim anı (o günün İstanbul gün sonu); canlıda null. */
  kesimTarihi: Date | null
}

// ─────────────────────────── Kural ve çıktı ───────────────────────────

export interface Kural {
  kod: string
  surum: number
  grup: KuralGrubu
  /** Genel (GN) kurallarda null — her durakta geçerli. */
  durak: DurakNo | null
  /** Tablodaki "Durum / koşul" sütunu (belge amaçlı, aynen). */
  kosulMetni: string
  /** Tablodaki "Öneri (Şimdi kartı)" sütunu (belge amaçlı, aynen). */
  oneriMetni: string
  eylem: BirincilEylem | null
  rol: KuralRol
  oncelik: Oncelik
  /** Öncelik 0 (veri engeli) kuralları engeldir: "Şimdi"nin önüne geçer ve kırmızı gösterilir. */
  engel: boolean
  tur: KuralTuru
  /** "İİK 62 (teyit gerekli)" gibi — her madde atıfı "teyit gerekli" etiketi taşır. */
  hukukiEtiket: string | null
  /** VERI_BEKLIYOR: tanımlı ama verisi bu dilimde gelmiyor; veri gelince kendiliğinden eşleşir. */
  durumu: 'ETKIN' | 'VERI_BEKLIYOR'
  veriNotu?: string
  /** Canlı veriye (nabız, senkron anı) dayanır; prova modunda değerlendirilmez. */
  canli?: boolean
  senaryo: SenaryoAdimi[]
  /** Saf koşul: eşleşirse Eslesme, değilse null. Veritabanına erişmez. */
  degerlendir: (g: Gercekler, bugun: Date) => Eslesme | null
}

/** Motorun ürettiği tek adım (serileştirilebilir: tarih alanları YYYY-MM-DD metni). */
export interface Adim {
  kural: string
  surum: number
  grup: KuralGrubu
  durak: DurakNo | null
  oncelik: Oncelik
  rol: KuralRol
  engel: boolean
  tur: KuralTuru
  metin: string
  neden: string
  eylem: BirincilEylem | null
  /** YYYY-MM-DD (İstanbul günü) ya da null. */
  sonGun: string | null
  /** Son güne kalan gün (negatif = geçti). */
  kalanGun: number | null
  hukukiEtiket: string | null
  kanit: Kanit[]
  adet: number
  /** Ertelenmişse bitiş günü (YYYY-MM-DD). */
  ertelendi: string | null
}

export interface SiradakiAdimSonuc {
  /** Tek birincil iş (en düşük öncelik numarası; eşitlikte en yakın son gün). Yapılacak iş yoksa null. */
  simdi: Adim | null
  /** En çok 3 madde. */
  sonra: Adim[]
  /** Sonra listesine sığmayıp katlanan madde sayısı. */
  sonraKatlanan: number
  /** Öncelik 0 (veri engeli) adımları. */
  engeller: Adim[]
  /** Yapılacak iş yoksa "Bekliyoruz" kartı (EV-02, TB-03 … ya da GN-08). */
  bekleme: Adim | null
  /** Eylemsiz bilgi notları. */
  bilgi: Adim[]
  /** Ertelenen adımlar (bitişe kadar Şimdi/Sonra'ya girmez). */
  ertelenenler: Adim[]
  /** Eşleşen bütün eylem adımları, sıralı (Bugün masası ve test için). */
  tumu: Adim[]
  /** Hesap günü (YYYY-MM-DD). */
  bugun: string
  prova: boolean
}
