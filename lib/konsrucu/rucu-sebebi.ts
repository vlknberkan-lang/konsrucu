/**
 * KonsRücü — Rücu sebebi kodları · lib/konsrucu/rucu-sebebi.ts  (saf; DB/Prisma yok, client-safe)
 *
 * S19 (06 §2(a), §2(c); B05, B07'nin icra tarafı, B18'in hazırlığı).
 *
 * Sorun (B05): dilekçe türü müvekkilin "Rücu Nedeni" kaydından değil, AI'ın serbest "olay türü" metninden regex ile
 * seçiliyordu; ZMSS GŞ B.4'ün a, b, ç, d, e bentleri için hiç karşılık yoktu; B.4/f'nin iki rejimi bilinmiyordu.
 *
 * Bu modül:
 *   - Kodlu rücu sebebi listesi: ZMSS GŞ B.4 bentleri (c: alkol ve uyuşturucu ayrı), GŞ-DİĞER (avukat gerekçesi
 *     zorunlu), kasko halefiyeti (karşı araç), kasko + kamu idaresinin hizmet kusuru, kasko + YİD işletmecisi.
 *   - Her kodun dayanak etiketleri: HEPSİ "teyit gerekli". Kaynak: rucu-hukuk-asistani/bilgi-bankasi/dilekce/atiflar.md
 *     (M01, M09, M11, M19–M22, M26, İ03) ve docs/01-denetim-raporu.md B05. Kural UYDURULMAZ; bilinmeyen dayanak
 *     "teyit gerekli (K1)" diye yazılır.
 *   - K1 kapısı: kod listesi ve asgari evrak setleri Yelda doğrulayana kadar `k1 = 'BEKLIYOR'`. Doğrulanmamış kod
 *     yalnız öneri olarak görünür; dilekçeye hiç girmez (S36: `dilekceyeGirebilir`).
 *   - GŞ sürümü (iki rejim): ZMSS GŞ C.11/2 (Ek: RG 04.12.2021) — değişiklikler, yürürlüğe girdiği tarihten SONRA
 *     AKDEDİLEN sözleşmelere uygulanır → sürüm poliçenin akdedildiği (tanzim) tarihe göre seçilir. B.4/f'nin 2015
 *     metni (RG 14.05.2015) ile 2026 metni (RG 12.06.2026, yürürlük 01.07.2026) ayrışır. Sınır günü ve tanzim tarihi
 *     yerine başlangıç tarihinin kullanılması ayrıca "teyit gerekli" uyarısı üretir.
 *   - Hugo "Rücu Nedeni" (müvekkilin serbest metni) → kod ÖNERİSİ (normalize anahtar kelimelerle). Kodu avukat seçer.
 *   - Koda bağlı asgari evrak seti (K1 bekliyor) ve TTK m.1472'nin yalnız halefiyet kodlarında geçmesi (B18).
 *
 * Hukuki karar vermez: kod seçimi avukattadır; bu modül yalnız öneri, etiket ve uyarı üretir.
 */

// ───────────────────────── kodlar ─────────────────────────

export const RUCU_SEBEBI_KODLARI = [
  'B4_A', 'B4_B', 'B4_C_ALKOL', 'B4_C_UYUSTURUCU', 'B4_CC', 'B4_D', 'B4_E', 'B4_F', 'GS_DIGER',
  'KASKO_HALEFIYET', 'KASKO_HIZMET_KUSURU', 'KASKO_YID',
  'OD_AYIPLI_HIZMET', 'OD_AYIPLI_URUN', 'OD_KOMSU_SU', 'OD_YONETIM_ORTAK_ALAN', 'OD_INSAAT_UCUNCU_KISI', 'OD_ALTYAPI_ISLETMECI', 'OD_KIRACI', 'OD_DIGER',
] as const
export type RucuSebebiKodu = (typeof RUCU_SEBEBI_KODLARI)[number]

/** Asgari evrak setinin öğeleri. `otomatik = false` olanlar belge türünden anlaşılamaz; avukat kontrol eder. */
export const EVRAK_TURLERI = [
  'POLICE', 'KTT', 'DEKONT', 'EKSPERTIZ', 'ALKOL_RAPORU', 'EHLIYET', 'TERK_KANITI', 'OLAY_YERI_FOTO', 'YOL_ISLETENI', 'KOLLUK_KAYDI',
  'SERVIS_KAYDI', 'TESPIT_TUTANAGI', 'TEKNIK_RAPOR',
] as const
export type EvrakTuru = (typeof EVRAK_TURLERI)[number]

export type EvrakTuruTanimi = {
  ad: string
  /** Belge.kategori (BelgeKategori enum) karşılıkları. */
  kategoriler: readonly string[]
  /** Belge.altTur içinde aranan parça (yalnız "HASAR_" önekli alt türlerde; ör. HASAR_DEKONT). */
  altTurParcalari: readonly string[]
  /** Belge türünden otomatik anlaşılabilir mi? Değilse durum "KONTROL" (avukat bakar). */
  otomatik: boolean
  /** Eksikse Ray'den istenir mi (istek taslağına girer)? */
  rayIstenir: boolean
  aciklama?: string
}

export const EVRAK_TURU_TANIM: Record<EvrakTuru, EvrakTuruTanimi> = {
  POLICE: { ad: 'Poliçe', kategoriler: ['POLICE'], altTurParcalari: ['POLICE'], otomatik: true, rayIstenir: true },
  KTT: { ad: 'Kaza tespit tutanağı', kategoriler: ['TUTANAK'], altTurParcalari: ['TUTANAK', 'KTT'], otomatik: true, rayIstenir: true },
  DEKONT: { ad: 'Ödeme dekontu', kategoriler: ['DEKONT'], altTurParcalari: ['DEKONT'], otomatik: true, rayIstenir: true, aciklama: 'Faiz başlangıcı da bu tarihe bağlıdır.' },
  EKSPERTIZ: { ad: 'Ekspertiz raporu', kategoriler: ['EKSPERTIZ'], altTurParcalari: ['EKSPERTIZ'], otomatik: true, rayIstenir: true },
  ALKOL_RAPORU: { ad: 'Alkol ya da uyuşturucu raporu', kategoriler: ['ALKOL'], altTurParcalari: ['ALKOL'], otomatik: true, rayIstenir: true },
  EHLIYET: { ad: 'Sürücü belgesi durumu', kategoriler: ['EHLIYET'], altTurParcalari: ['EHLIYET'], otomatik: true, rayIstenir: true },
  TERK_KANITI: {
    ad: 'Olay yerini terki gösteren kayıt', kategoriler: [], altTurParcalari: [], otomatik: false, rayIstenir: true,
    aciklama: 'Tutanak, kolluk kaydı, ifade ya da kamera kaydı. Bedeni hasar ve sağlık raporu zorunlu değildir (B05 düzeltmesi).',
  },
  OLAY_YERI_FOTO: { ad: 'Olay yeri ve hasar fotoğrafları', kategoriler: ['HASAR_FOTO'], altTurParcalari: ['FOTO'], otomatik: true, rayIstenir: true },
  YOL_ISLETENI: {
    ad: 'Yolun işleteni bilgisi', kategoriler: [], altTurParcalari: [], otomatik: false, rayIstenir: false,
    aciklama: 'KGM, belediye ya da YİD işletmecisi; büro araştırır.',
  },
  KOLLUK_KAYDI: { ad: 'Kolluk ya da şikâyet kaydı', kategoriler: [], altTurParcalari: [], otomatik: false, rayIstenir: true, aciklama: 'Çalınma ya da gasp olayını gösteren kayıt.' },
  SERVIS_KAYDI: {
    ad: 'Servis, bakım ya da montaj kaydı / fatura', kategoriler: [], altTurParcalari: [], otomatik: false, rayIstenir: true,
    aciklama: 'Oto dışı halefiyet · ayıplı hizmet ya da ürün kodlarında; BelgeKategori\'de karşılığı yok, avukat kontrol eder.',
  },
  TESPIT_TUTANAGI: {
    ad: 'Olay tespit tutanağı (yönetim, itfaiye, kolluk ya da ekspertiz ekinde)', kategoriler: [], altTurParcalari: [], otomatik: false, rayIstenir: true,
    aciklama: 'Trafik KTT\'siyle karıştırılmaz (oto dışı olayda KTT yok); avukat kontrol eder.',
  },
  TEKNIK_RAPOR: {
    ad: 'Hasarın nedenine ilişkin teknik rapor', kategoriler: [], altTurParcalari: [], otomatik: false, rayIstenir: true,
    aciklama: 'BelgeKategori\'de karşılığı yok, avukat kontrol eder.',
  },
}

export type Dayanak = { etiket: string; not?: string }

export type RucuSebebiTanimi = {
  kod: RucuSebebiKodu
  ad: string
  /** Kodun ait olduğu branş (Prisma `Brans`: ZMMS = ZMSS; OTO_DISI = konut/işyeri/yangın vb.). */
  brans: 'ZMMS' | 'KASKO' | 'OTO_DISI'
  /** ZMSS GŞ B.4 bent harfi (yalnız ZMSS kodlarında). */
  bent?: 'a' | 'b' | 'c' | 'ç' | 'd' | 'e' | 'f'
  /** Kısa tanım (bilgi bankası özetinden; birebir GŞ metni DEĞİL). */
  tanim: string
  /** Dayanak etiketleri — hepsi "teyit gerekli". */
  dayanaklar: readonly Dayanak[]
  /** TTK m.1472 (halefiyet) bu kodda uygulanır mı? B18: yalnız kasko halefiyeti kodlarında true. */
  halefiyet: boolean
  /** GŞ sürümüne göre bent metni değişiyor mu (B.4/f iki rejim). */
  rejimDuyarli: boolean
  /** Avukat gerekçesi zorunlu mu (GŞ-DİĞER). */
  gerekceZorunlu: boolean
  asgariSet: readonly EvrakTuru[]
  /** K1: Yelda'nın doğrulaması. Doğrulanana kadar 'BEKLIYOR' — ekranda "teyit gerekli". */
  k1: 'BEKLIYOR' | 'DOGRULANDI'
  notlar: readonly string[]
}

const ZMSS_TEMEL: readonly EvrakTuru[] = ['POLICE', 'KTT', 'DEKONT']
const KASKO_TEMEL: readonly EvrakTuru[] = ['POLICE', 'KTT', 'DEKONT', 'EKSPERTIZ']
/** Oto dışı (konut/işyeri/yangın vb.) asgari set: KTT yok (trafik kazası değildir). */
const OTO_DISI_TEMEL: readonly EvrakTuru[] = ['POLICE', 'DEKONT', 'EKSPERTIZ', 'OLAY_YERI_FOTO']
const ZMSS_DAYANAK: Dayanak = { etiket: 'KTK m.95/2 (sigortacının sigorta ettirene başvurusu)', not: 'teyit gerekli' }
/** TTK m.1472/1 halefiyeti — kasko VE oto dışı halefiyet kodlarının ortak dayanağı. */
const TTK_1472_DAYANAK: Dayanak = { etiket: 'TTK m.1472/1 (halefiyet)', not: 'teyit gerekli' }
const KASKO_DAYANAK: readonly Dayanak[] = [
  TTK_1472_DAYANAK,
  { etiket: 'Kara Araçları Kasko Sigortası GŞ B.4.3 (halefiyet)', not: 'teyit gerekli; eski ad "Kara Taşıtları" kullanılmaz' },
]
const bentDayanak = (bent: string, konu: string): Dayanak => ({ etiket: `ZMSS GŞ B.4/${bent} (${konu})`, not: 'GŞ sürümü ve bent metni teyit gerekli' })

export const RUCU_SEBEBI_TANIM: Record<RucuSebebiKodu, RucuSebebiTanimi> = {
  B4_A: {
    kod: 'B4_A', ad: 'ZMSS B.4/a · kast ya da ağır kusur', brans: 'ZMMS', bent: 'a',
    tanim: 'Zararın kast ya da ağır kusurla meydana gelmesi.',
    dayanaklar: [bentDayanak('a', 'kast ya da ağır kusur'), ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: ZMSS_TEMEL, k1: 'BEKLIYOR', notlar: [],
  },
  B4_B: {
    kod: 'B4_B', ad: 'ZMSS B.4/b · ehliyetsizlik ya da kuralların ağır kusurla ihlali', brans: 'ZMMS', bent: 'b',
    tanim: 'Sürücü belgesi olmaksızın ya da trafik kurallarının ağır kusurla ihlal edilerek aracın kullanılması.',
    dayanaklar: [bentDayanak('b', 'ehliyet ya da trafik kurallarının ağır kusurla ihlali'), ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...ZMSS_TEMEL, 'EHLIYET'], k1: 'BEKLIYOR',
    notlar: ['2015 GŞ\'de ehliyetsizlik B.4/b\'dedir; 2003 GŞ\'deki eski "B.4/c" bent harfi bununla karıştırılmamalı (bilgi bankası İ03).'],
  },
  B4_C_ALKOL: {
    kod: 'B4_C_ALKOL', ad: 'ZMSS B.4/c · alkol', brans: 'ZMMS', bent: 'c',
    tanim: 'Aracın mevzuattaki seviyenin üzerinde alkollü kişilerce kullanılması sırasında meydana gelen zarar.',
    dayanaklar: [bentDayanak('c', 'alkol'), ZMSS_DAYANAK, { etiket: 'KTK m.48 ve KTY m.97 (promil sınırı)', not: 'araç cinsine göre sınır farklı; teyit gerekli' }],
    halefiyet: false, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...ZMSS_TEMEL, 'ALKOL_RAPORU'], k1: 'BEKLIYOR',
    notlar: [
      'Yargıtay 11. HD 23.06.2025, E.2025/2402, K.2025/4431: kazanın münhasıran alkolün etkisiyle gerçekleşmesi aranır; 1 promil üzerinde illiyet yokluğunu ispat yükü sigortalıdadır (bağlayıcılık kapsamı teyit gerekli).',
      '"Alkollü olmak tek başına yeterlidir" kalıbı kullanılmaz (bilgi bankası M21).',
    ],
  },
  B4_C_UYUSTURUCU: {
    kod: 'B4_C_UYUSTURUCU', ad: 'ZMSS B.4/c · uyuşturucu', brans: 'ZMMS', bent: 'c',
    tanim: 'Aracın uyuşturucu madde almış kişilerce kullanılması sırasında meydana gelen zarar.',
    dayanaklar: [bentDayanak('c', 'uyuşturucu'), ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...ZMSS_TEMEL, 'ALKOL_RAPORU'], k1: 'BEKLIYOR', notlar: [],
  },
  B4_CC: {
    kod: 'B4_CC', ad: 'ZMSS B.4/ç · yolcu, yük ya da tehlikeli madde', brans: 'ZMMS', bent: 'ç',
    tanim: 'Yolcu, yük ya da tehlikeli madde taşımaya ilişkin kurallara aykırılık.',
    dayanaklar: [bentDayanak('ç', 'yolcu, yük, tehlikeli madde'), ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: ZMSS_TEMEL, k1: 'BEKLIYOR', notlar: [],
  },
  B4_D: {
    kod: 'B4_D', ad: 'ZMSS B.4/d · B.1 yükümlülüklerinin ihlali', brans: 'ZMMS', bent: 'd',
    tanim: 'B.1 yükümlülüklerinin ihlali nedeniyle artan zarar.',
    dayanaklar: [bentDayanak('d', 'B.1 yükümlülüklerinin ihlaliyle artan zarar'), ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: ZMSS_TEMEL, k1: 'BEKLIYOR',
    notlar: ['Yalnız artan zararı, ihlaldeki kusur oranında verir (denetim raporu B06; teyit gerekli).'],
  },
  B4_E: {
    kod: 'B4_E', ad: 'ZMSS B.4/e · çalınma ya da gasp', brans: 'ZMMS', bent: 'e',
    tanim: 'Aracın çalınması ya da gasp edilmesi.',
    dayanaklar: [bentDayanak('e', 'çalınma, gasp'), ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...ZMSS_TEMEL, 'KOLLUK_KAYDI'], k1: 'BEKLIYOR', notlar: [],
  },
  B4_F: {
    kod: 'B4_F', ad: 'ZMSS B.4/f · olay yerini terk', brans: 'ZMMS', bent: 'f',
    tanim: 'Zorunlu haller dışında olay yerini terk ya da kazanın oluşuna ilişkin belgelerin düzenlenmesi yükümlülüğüne aykırılık.',
    dayanaklar: [bentDayanak('f', 'olay yerini terk'), ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: true, gerekceZorunlu: false,
    asgariSet: [...ZMSS_TEMEL, 'TERK_KANITI'], k1: 'BEKLIYOR',
    notlar: [
      'İki rejim: 2015 metni (RG 14.05.2015) "bedeni hasara neden olan trafik kazalarında" diye başlar; 2026 metninde (RG 12.06.2026, yürürlük 01.07.2026) bedeni hasar yalnız sağlık kuruluşuna gitme istisnasında geçer.',
      'Bedeni hasar zorunlu kapı değildir; sağlık raporu zorunlu delil değildir (B05 düzeltmesi).',
    ],
  },
  GS_DIGER: {
    kod: 'GS_DIGER', ad: 'ZMSS GŞ · diğer (avukat gerekçesiyle)', brans: 'ZMMS',
    tanim: 'Listede olmayan bir GŞ rücu hâli; avukat gerekçesi zorunlu.',
    dayanaklar: [{ etiket: 'ZMSS GŞ B.4 (bent avukat tarafından yazılır)', not: 'teyit gerekli' }, ZMSS_DAYANAK], halefiyet: false, rejimDuyarli: false, gerekceZorunlu: true,
    asgariSet: ZMSS_TEMEL, k1: 'BEKLIYOR', notlar: [],
  },
  KASKO_HALEFIYET: {
    kod: 'KASKO_HALEFIYET', ad: 'Kasko halefiyeti · karşı araç', brans: 'KASKO',
    tanim: 'Kasko sigortacısının, sigortalısına ödediği tazminat kadar kusurlu karşı taraf sürücü ve işletene başvurusu.',
    dayanaklar: [...KASKO_DAYANAK, { etiket: 'KTK m.85/1 (işleten sorumluluğu)', not: 'teyit gerekli' }], halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: KASKO_TEMEL, k1: 'BEKLIYOR',
    notlar: ['"Araç maliki" ile "işleten" aynı kavram değildir; işleten yazılır (bilgi bankası M26).'],
  },
  KASKO_HIZMET_KUSURU: {
    kod: 'KASKO_HIZMET_KUSURU', ad: 'Kasko halefiyeti · kamu idaresinin hizmet kusuru', brans: 'KASKO',
    tanim: 'Yol bakımı ya da güvenliğine ilişkin hizmet kusuru olan kamu idaresine (KGM, belediye) halefiyetle başvuru.',
    dayanaklar: [
      ...KASKO_DAYANAK,
      { etiket: 'KTK m.13/1 (yol güvenliği yükümlülüğü)', not: 'teyit gerekli' },
      { etiket: 'KTK m.110/1 ve Uyuşmazlık Mahkemesi içtihadı (yargı yolu)', not: 'yerleşik ama oy çokluğuyla; teyit gerekli. KTK m.110/2 (iptal edilen "merkez" ibaresi) kullanılmaz.' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...KASKO_TEMEL, 'OLAY_YERI_FOTO', 'YOL_ISLETENI'], k1: 'BEKLIYOR',
    notlar: ['Borçlu kamu idaresiyse yol (icra takibi ya da idareye başvuru) avukat kararıdır (HZ-05; İYUK 13 teyit gerekli).'],
  },
  KASKO_YID: {
    kod: 'KASKO_YID', ad: 'Kasko halefiyeti · YİD işletmecisi', brans: 'KASKO',
    tanim: 'Yap-işlet-devret yolu ya da köprü işletmecisine halefiyetle başvuru.',
    dayanaklar: [...KASKO_DAYANAK, { etiket: 'İşletmecinin sorumluluk dayanağı', not: 'teyit gerekli (K1)' }],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...KASKO_TEMEL, 'OLAY_YERI_FOTO', 'YOL_ISLETENI'], k1: 'BEKLIYOR',
    notlar: ['YİD işletmecisi özel hukuk kişisidir; idari yol sorusu sorulmaz (06 §2(c) adım 5).'],
  },
  OD_AYIPLI_HIZMET: {
    kod: 'OD_AYIPLI_HIZMET', ad: 'Oto dışı halefiyet · ayıplı hizmet (servis, bakım, montaj, onarım)', brans: 'OTO_DISI',
    tanim: 'Sigortalıya verilen bir hizmetin (servis, bakım, montaj, onarım) ayıplı ifasından doğan zarara halefiyetle başvuru.',
    dayanaklar: [
      TTK_1472_DAYANAK,
      { etiket: 'TBK m.112 (borca aykırılık)', not: 'teyit gerekli' },
      { etiket: '6502 s. Kanun m.13 (ayıplı hizmet)', not: 'teyit gerekli' },
      { etiket: 'TBK m.49 (haksız fiil)', not: 'teyit gerekli' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...OTO_DISI_TEMEL, 'SERVIS_KAYDI'], k1: 'BEKLIYOR',
    notlar: [
      'Sigortalı tüketiciyse görevli mahkeme tüketici mahkemesi olabilir (6502 m.73, teyit gerekli); yerde yoksa Asliye Hukuk "Tüketici Mahkemesi sıfatıyla".',
      'Örnek: su arıtma cihazı servisi, elektrik tesisatı servisi.',
    ],
  },
  OD_AYIPLI_URUN: {
    kod: 'OD_AYIPLI_URUN', ad: 'Oto dışı halefiyet · ayıplı ürün (üretici, satıcı)', brans: 'OTO_DISI',
    tanim: 'Ayıplı (kusurlu) bir ürünün üreticisine ya da satıcısına halefiyetle başvuru.',
    dayanaklar: [
      TTK_1472_DAYANAK,
      { etiket: '6502 s. Kanun m.8 (ayıplı mal)', not: 'teyit gerekli' },
      { etiket: '7223 s. Ürün Güvenliği ve Teknik Düzenlemeler Kanunu (üreticinin sorumluluğu)', not: 'madde teyit gerekli' },
      { etiket: 'TBK m.49', not: 'teyit gerekli' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...OTO_DISI_TEMEL, 'SERVIS_KAYDI', 'TEKNIK_RAPOR'], k1: 'BEKLIYOR', notlar: [],
  },
  OD_KOMSU_SU: {
    kod: 'OD_KOMSU_SU', ad: 'Oto dışı halefiyet · komşu ya da üst kattan su sızıntısı', brans: 'OTO_DISI',
    tanim: 'Komşu bağımsız bölümden ya da üst kattan kaynaklanan su sızıntısı/sirayeti zararına halefiyetle başvuru.',
    dayanaklar: [
      TTK_1472_DAYANAK,
      { etiket: 'TMK m.730 (malikin sorumluluğu)', not: 'teyit gerekli' },
      { etiket: 'TMK m.737 (komşuluk hukuku)', not: 'teyit gerekli' },
      { etiket: '634 s. Kat Mülkiyeti Kanunu m.18', not: 'teyit gerekli' },
      { etiket: 'TBK m.49', not: 'teyit gerekli' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...OTO_DISI_TEMEL, 'TESPIT_TUTANAGI'], k1: 'BEKLIYOR', notlar: [],
  },
  OD_YONETIM_ORTAK_ALAN: {
    kod: 'OD_YONETIM_ORTAK_ALAN', ad: 'Oto dışı halefiyet · apartman yönetimi / ortak alan (tesisat, çatı, gider)', brans: 'OTO_DISI',
    tanim: 'Ortak alana (çatı, ana tesisat) ilişkin bakım/onarım yükümlülüğünün ihlalinden doğan zarara apartman yönetimine halefiyetle başvuru.',
    dayanaklar: [
      TTK_1472_DAYANAK,
      { etiket: '634 s. Kat Mülkiyeti Kanunu (yönetici ve kat malikleri kurulunun sorumluluğu)', not: 'madde teyit gerekli' },
      { etiket: 'TBK m.49', not: 'teyit gerekli' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...OTO_DISI_TEMEL, 'TESPIT_TUTANAGI'], k1: 'BEKLIYOR', notlar: [],
  },
  OD_INSAAT_UCUNCU_KISI: {
    kod: 'OD_INSAAT_UCUNCU_KISI', ad: 'Oto dışı halefiyet · inşaat, yapı işi ya da üçüncü kişinin eylemi', brans: 'OTO_DISI',
    tanim: 'Yakın bir inşaat/yapı işinden ya da üçüncü bir kişinin eyleminden doğan zarara halefiyetle başvuru.',
    dayanaklar: [
      TTK_1472_DAYANAK,
      { etiket: 'TBK m.49', not: 'teyit gerekli' },
      { etiket: 'TBK m.66 (adam çalıştıranın sorumluluğu)', not: 'teyit gerekli' },
      { etiket: 'TBK m.71 (tehlike sorumluluğu)', not: 'teyit gerekli' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...OTO_DISI_TEMEL, 'TESPIT_TUTANAGI'], k1: 'BEKLIYOR', notlar: [],
  },
  OD_ALTYAPI_ISLETMECI: {
    kod: 'OD_ALTYAPI_ISLETMECI', ad: 'Oto dışı halefiyet · altyapı işletmecisi (su, kanalizasyon, elektrik, doğalgaz şebekesi)', brans: 'OTO_DISI',
    tanim: 'Su, kanalizasyon, elektrik ya da doğalgaz şebekesi işletmecisinin kusurundan doğan zarara halefiyetle başvuru.',
    dayanaklar: [
      TTK_1472_DAYANAK,
      { etiket: 'TBK m.49 / m.71', not: 'teyit gerekli' },
      { etiket: 'İYUK m.13 (işletmeci kamu idaresiyse önce idareye başvuru)', not: 'teyit gerekli' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: [...OTO_DISI_TEMEL, 'TESPIT_TUTANAGI', 'TEKNIK_RAPOR'], k1: 'BEKLIYOR',
    notlar: ['Kamu idaresiyse yol (icra takibi ya da idari yol) avukat kararıdır; dağıtım şirketi özel hukuk kişisiyse adli yol.'],
  },
  OD_KIRACI: {
    kod: 'OD_KIRACI', ad: 'Oto dışı halefiyet · kiracı ya da kullanıcının kusuru', brans: 'OTO_DISI',
    tanim: 'Kiracının ya da kullanıcının özenle kullanma borcunu ihlalinden doğan zarara halefiyetle başvuru.',
    dayanaklar: [
      TTK_1472_DAYANAK,
      { etiket: 'TBK m.316 (kiracının özenle kullanma borcu)', not: 'teyit gerekli' },
      { etiket: 'TBK m.49', not: 'teyit gerekli' },
    ],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: false,
    asgariSet: OTO_DISI_TEMEL, k1: 'BEKLIYOR', notlar: [],
  },
  OD_DIGER: {
    kod: 'OD_DIGER', ad: 'Oto dışı halefiyet · diğer (avukat gerekçesiyle)', brans: 'OTO_DISI',
    tanim: 'Listede olmayan bir oto dışı halefiyet hâli; avukat gerekçesi zorunlu.',
    dayanaklar: [TTK_1472_DAYANAK, { etiket: 'Oto dışı halefiyet dayanağı (avukat tarafından yazılır)', not: 'teyit gerekli' }],
    halefiyet: true, rejimDuyarli: false, gerekceZorunlu: true,
    asgariSet: OTO_DISI_TEMEL, k1: 'BEKLIYOR', notlar: [],
  },
}

export const rucuSebebiKoduMu = (v: unknown): v is RucuSebebiKodu =>
  typeof v === 'string' && (RUCU_SEBEBI_KODLARI as readonly string[]).includes(v)

export function rucuSebebiTanimi(kod: string | null | undefined): RucuSebebiTanimi | null {
  return rucuSebebiKoduMu(kod) ? RUCU_SEBEBI_TANIM[kod] : null
}

/** Branşa uygun kodlar (branş bilinmiyorsa hepsi). Prisma `Brans`: ZMMS | KASKO | OTO_DISI. */
export function bransKodlari(brans: string | null | undefined): RucuSebebiKodu[] {
  if (brans === 'ZMMS' || brans === 'KASKO' || brans === 'OTO_DISI') return RUCU_SEBEBI_KODLARI.filter((k) => RUCU_SEBEBI_TANIM[k].brans === brans)
  return [...RUCU_SEBEBI_KODLARI]
}

/** Kod dosyanın branşıyla çelişiyor mu? (branş yoksa çelişki yok sayılır, ama uyarı ekrandadır) */
export function kodBransaUygunMu(kod: RucuSebebiKodu, brans: string | null | undefined): boolean {
  if (brans !== 'ZMMS' && brans !== 'KASKO' && brans !== 'OTO_DISI') return true
  return RUCU_SEBEBI_TANIM[kod].brans === brans
}

/** K1 etiketi: ekranda her kodun yanında görünür. */
export function k1Etiketi(kod: RucuSebebiKodu): 'K1: doğrulandı' | 'K1: bekliyor · teyit gerekli' {
  return RUCU_SEBEBI_TANIM[kod].k1 === 'DOGRULANDI' ? 'K1: doğrulandı' : 'K1: bekliyor · teyit gerekli'
}

/** S36 kapısı: doğrulanmamış kod dilekçeye HİÇ girmez; yalnız öneri olarak görünür. */
export function dilekceyeGirebilir(kod: string | null | undefined): boolean {
  const t = rucuSebebiTanimi(kod)
  return !!t && t.k1 === 'DOGRULANDI'
}

/** B18: TTK m.1472 yalnız halefiyet kodlarında basılır. Kod yok ya da tanımsızsa false (basılmaz). */
export function ttk1472Uygulanir(kod: string | null | undefined): boolean {
  return !!rucuSebebiTanimi(kod)?.halefiyet
}

// ───────────────────────── GŞ sürümü (iki rejim) ─────────────────────────

/** Sınır tarihleri — bilgi bankası M19/M21'den; hepsi teyit gerekli. */
export const GS_SINIR = {
  /** 2015 GŞ yürürlüğü (Yargıtay 11. HD 2025/2402'nin "01.06.2015 tarihli değişiklik" ifadesi). */
  GS_2015: '2015-06-01',
  /** RG 12.06.2026 (sayı 33278) değişikliğinin yürürlüğü. */
  GS_2026: '2026-07-01',
} as const

export type GsRejimi = 'GS_2003' | 'GS_2015' | 'GS_2026' | 'BILINMIYOR' | 'UYGULANMAZ'

export type GsRejimSonucu = {
  rejim: GsRejimi
  /** Rejimi belirleyen tarih (YYYY-MM-DD) ve türü. */
  esasTarih: string | null
  esasTur: 'TANZIM' | 'BASLANGIC' | null
  etiket: string
  uyarilar: string[]
}

const gunIso = (v: Date | string | null | undefined): string | null => {
  if (v == null || v === '') return null
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

export const GS_REJIM_ETIKET: Record<GsRejimi, string> = {
  GS_2003: '2015 öncesi GŞ (bent harfleri farklı)',
  GS_2015: 'GŞ 2015 metni (RG 14.05.2015)',
  GS_2026: 'GŞ 2026 değişikliği sonrası (RG 12.06.2026)',
  BILINMIYOR: 'GŞ sürümü belirlenemedi',
  UYGULANMAZ: 'ZMSS GŞ uygulanmaz (kasko / oto dışı)',
}

/**
 * ZMSS GŞ sürümü: poliçenin AKDEDİLDİĞİ (tanzim) tarihe göre (GŞ C.11/2; teyit gerekli). Tanzim tarihi yoksa poliçe
 * başlangıcı kullanılır ve bu ayrıca uyarılır. Kasko ve oto dışı kodlarında ZMSS GŞ uygulanmaz.
 */
export function gsRejimi(g: {
  kod?: string | null
  policeTanzim?: Date | string | null
  policeBaslangic?: Date | string | null
}): GsRejimSonucu {
  const t = rucuSebebiTanimi(g.kod)
  if (t && t.brans !== 'ZMMS') {
    return { rejim: 'UYGULANMAZ', esasTarih: null, esasTur: null, etiket: GS_REJIM_ETIKET.UYGULANMAZ, uyarilar: [] }
  }
  const tanzim = gunIso(g.policeTanzim)
  const baslangic = gunIso(g.policeBaslangic)
  const esasTarih = tanzim ?? baslangic
  const esasTur: GsRejimSonucu['esasTur'] = tanzim ? 'TANZIM' : baslangic ? 'BASLANGIC' : null
  const uyarilar: string[] = []
  if (!esasTarih) {
    uyarilar.push('Poliçe tarihi yok: GŞ sürümü seçilemez. Poliçe tanzim tarihini girin (teyit gerekli).')
    return { rejim: 'BILINMIYOR', esasTarih: null, esasTur: null, etiket: GS_REJIM_ETIKET.BILINMIYOR, uyarilar }
  }
  if (esasTur === 'BASLANGIC') uyarilar.push('Tanzim tarihi yok; poliçe başlangıç tarihi kullanıldı. GŞ C.11/2 akdedilme tarihini esas alır (teyit gerekli).')
  let rejim: GsRejimi
  if (esasTarih < GS_SINIR.GS_2015) {
    rejim = 'GS_2003'
    uyarilar.push('2015 öncesi poliçe: eski GŞ\'de bent harfleri farklıdır (ör. eski B.4/c ehliyetsizlik). Bent ve metin teyit gerekli.')
  } else if (esasTarih < GS_SINIR.GS_2026) {
    rejim = 'GS_2015'
  } else {
    rejim = 'GS_2026'
  }
  if (esasTarih === GS_SINIR.GS_2026 || esasTarih === GS_SINIR.GS_2015) {
    uyarilar.push('Poliçe tarihi yürürlük gününe denk geliyor: "yürürlükten sonra akdedilen" ifadesinin bu günü kapsayıp kapsamadığı teyit gerekli.')
  }
  if (t?.rejimDuyarli) {
    uyarilar.push(rejim === 'GS_2026'
      ? 'B.4/f 2026 metni: bedeni hasar yalnız sağlık kuruluşuna gitme istisnasında geçer (teyit gerekli).'
      : 'B.4/f 2015 metni "bedeni hasara neden olan trafik kazalarında" diye başlar; salt maddi hasarlı terk tartışmalıdır (teyit gerekli). Bedeni hasar yine de zorunlu kapı değildir.')
  }
  return { rejim, esasTarih, esasTur, etiket: GS_REJIM_ETIKET[rejim], uyarilar }
}

// ───────────────────────── Hugo "Rücu Nedeni" → kod önerisi ─────────────────────────

const TR_ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** Hugo hücresi için normalize anahtar: Türkçe küçük harf → ASCII, harf/rakam dışı tek boşluk. */
export function rucuNedeniNormal(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_ASCII[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type HugoKural = {
  /** Normalize metinde aranan ifadeler (biri yeterli). Kelime başında aranır. */
  ifadeler: readonly string[]
  zmms?: RucuSebebiKodu
  kasko?: RucuSebebiKodu
  guven: number
}

/**
 * Anahtar kelime tablosu (normalize edilmiş). Sıra önemlidir: özel ifadeler genelden önce gelir.
 * Kasko'da "alkol", "terk", "çarpıp kaçma" KARŞI ARACIN durumudur → halefiyet (B05: "çarpıp kaçma" kaskoda terk
 * bloğuna düşüyordu). ZMSS'de aynı ifadeler sigortalının GŞ B.4 hâlidir.
 */
export const HUGO_RUCU_NEDENI_KURALLARI: readonly HugoKural[] = [
  { ifadeler: ['hizmet kusuru', 'yol kusuru', 'yol bakim', 'karayollari', 'kgm', 'belediye'], kasko: 'KASKO_HIZMET_KUSURU', guven: 0.8 },
  { ifadeler: ['yid', 'yap islet devret', 'otoyol isletme', 'kopru isletme', 'isletmeci'], kasko: 'KASKO_YID', guven: 0.75 },
  { ifadeler: ['uyusturucu'], zmms: 'B4_C_UYUSTURUCU', kasko: 'KASKO_HALEFIYET', guven: 0.8 },
  { ifadeler: ['alkol', 'promil'], zmms: 'B4_C_ALKOL', kasko: 'KASKO_HALEFIYET', guven: 0.8 },
  { ifadeler: ['olay yerini terk', 'kaza yerini terk', 'terk', 'carpip kac', 'vur kac', 'kacma'], zmms: 'B4_F', kasko: 'KASKO_HALEFIYET', guven: 0.75 },
  { ifadeler: ['ehliyetsiz', 'ehliyet', 'surucu belgesi', 'belgesiz'], zmms: 'B4_B', kasko: 'KASKO_HALEFIYET', guven: 0.75 },
  { ifadeler: ['kasten', 'kast', 'agir kusur'], zmms: 'B4_A', guven: 0.6 },
  { ifadeler: ['b 1 yukumluluk', 'yukumluluk', 'yukumlulug'], zmms: 'B4_D', guven: 0.55 },
  { ifadeler: ['tehlikeli madde', 'asiri yuk', 'yolcu', 'yuk'], zmms: 'B4_CC', guven: 0.6 },
  { ifadeler: ['calin', 'gasp', 'hirsiz'], zmms: 'B4_E', kasko: 'KASKO_HALEFIYET', guven: 0.6 },
  { ifadeler: ['halefiyet', 'karsi arac', 'kusurlu arac', 'ucuncu sahis', '3 sahis', 'trafik kazasi', 'carpisma'], kasko: 'KASKO_HALEFIYET', guven: 0.6 },
]

/**
 * İfade kelime başında aranır. 5 harften kısa ifadeler ("kast", "terk", "yuk", "kgm") yalnız TAM kelime olarak
 * eşleşir ("yuk" → "yükümlülük"e düşmesin); uzunlar kök gibi davranır ("alkol" → "alkollü").
 */
function ifadeVarMi(bosluklu: string, ifade: string): boolean {
  return ifade.length < 5 ? bosluklu.includes(` ${ifade} `) : bosluklu.includes(` ${ifade}`)
}

type OtoDisiHugoKural = { ifadeler: readonly string[]; kod: RucuSebebiKodu; guven: number }

/**
 * Oto dışı (Brans.OTO_DISI: konut, işyeri, yangın, dahili su…) anahtar kelime tablosu — Zurich "Rücu Nedeni" +
 * "Rücu Nedeni Detay" metninden (ikisi birleştirilip çağıran taraf geçirir, bkz. oneri/kaynaklar.ts). Sıra
 * önemlidir: "servis" içeren metin önce ayıplı hizmete düşer, "ayıplı ürün" kuralı yalnız servis YOKKEN yakalar.
 */
export const HUGO_OTO_DISI_KURALLARI: readonly OtoDisiHugoKural[] = [
  { ifadeler: ['servis', 'bakim', 'montaj', 'su aritma', 'tesisat servis'], kod: 'OD_AYIPLI_HIZMET', guven: 0.7 },
  { ifadeler: ['ayipli', 'uretici', 'imalat hatasi', 'patlayan cihaz'], kod: 'OD_AYIPLI_URUN', guven: 0.65 },
  { ifadeler: ['dahili su', 'su sirayeti', 'su sizintisi', 'ust kat', 'komsu'], kod: 'OD_KOMSU_SU', guven: 0.7 },
  { ifadeler: ['apartman yonetim', 'site yonetim', 'ortak alan', 'cati'], kod: 'OD_YONETIM_ORTAK_ALAN', guven: 0.7 },
  { ifadeler: ['insaat', 'beton', 'mikser', 'yapi', 'kazi'], kod: 'OD_INSAAT_UCUNCU_KISI', guven: 0.65 },
  { ifadeler: ['iski', 'belediye', 'kanalizasyon', 'altyapi', 'sebeke', 'bedas', 'ayedas', 'igdas', 'dagitim sirketi'], kod: 'OD_ALTYAPI_ISLETMECI', guven: 0.7 },
  { ifadeler: ['kiraci'], kod: 'OD_KIRACI', guven: 0.6 },
]

/** Oto dışı eşleme: tek koda gider (ZMSS/kasko ikili haritası yok); bent atfı da aranmaz. */
function otoDisiEsle(metin: string): HugoRucuNedeniSonucu {
  const n = ` ${rucuNedeniNormal(metin)} `
  for (const k of HUGO_OTO_DISI_KURALLARI) {
    const ifade = k.ifadeler.find((i) => ifadeVarMi(n, i))
    if (!ifade) continue
    return { kod: k.kod, adaylar: [k.kod], guven: k.guven, eslesen: ifade, gerekce: `Hugo "Rücu Nedeni" metninde "${ifade}" geçiyor (oto dışı).` }
  }
  return { kod: null, adaylar: [], guven: 0, eslesen: null, gerekce: 'Hugo "Rücu Nedeni" metni kod listesiyle eşleşmedi; avukat seçer.' }
}

const BENT_KOD: Record<string, RucuSebebiKodu | null> ={ a: 'B4_A', b: 'B4_B', c: null, ç: 'B4_CC', d: 'B4_D', e: 'B4_E', f: 'B4_F' }

export type HugoRucuNedeniSonucu = {
  /** Tek kod önerisi (branş belliyse ve eşleşme varsa). */
  kod: RucuSebebiKodu | null
  /** Aday kodlar (branş bilinmiyorsa birden çok olabilir). */
  adaylar: RucuSebebiKodu[]
  guven: number
  /** Eşleşen ifade (normalize) ya da bent atfı. */
  eslesen: string | null
  gerekce: string
}

/** Açık bent atfı: "B.4-c", "B4/f", "B 4 ç" … (ASCII'ye katlamadan, ç'yi c'den ayırmak için). */
function bentAtfi(ham: string): string | null {
  const m = /\bB\s*[.\-/]?\s*4\s*[./\-]?\s*([a-fçA-FÇ])(?![a-zçğıöşü])/i.exec(ham)
  if (!m) return null
  return m[1].toLocaleLowerCase('tr-TR')
}

/**
 * Hugo/Zurich "Rücu Nedeni" hücresi (müvekkilin serbest metni) → rücu sebebi kodu ÖNERİSİ.
 * Resmî belge değildir; kodu avukat seçer. Branş bilinmiyorsa tek kod önerilmez, adaylar döner.
 */
export function hugoRucuNedeniEsle(ham: string | null | undefined, brans?: string | null): HugoRucuNedeniSonucu {
  const bos: HugoRucuNedeniSonucu = { kod: null, adaylar: [], guven: 0, eslesen: null, gerekce: 'Hugo "Rücu Nedeni" boş.' }
  const metin = String(ham ?? '').trim()
  if (!metin) return bos
  // Oto dışı: ayrı tablo, ZMSS/kasko mantığına hiç girmez (ZMSS/kasko davranışı bu satırdan etkilenmez).
  if (brans === 'OTO_DISI') return otoDisiEsle(metin)
  const bransBilinir = brans === 'ZMMS' || brans === 'KASKO'

  // 1) Açık bent atfı (yalnız ZMSS kodu; kasko dosyasında çelişki olarak bildirilir)
  const bent = bentAtfi(metin)
  if (bent) {
    const n = rucuNedeniNormal(metin)
    let kod = BENT_KOD[bent] ?? null
    if (bent === 'c') kod = /uyusturucu/.test(n) ? 'B4_C_UYUSTURUCU' : 'B4_C_ALKOL'
    if (kod) {
      if (brans === 'KASKO') {
        return { kod: null, adaylar: [kod], guven: 0.4, eslesen: `B.4/${bent}`, gerekce: `Hugo metni ZMSS bendine (B.4/${bent}) atıf yapıyor ama dosyanın branşı kasko: avukat seçer.` }
      }
      return { kod, adaylar: [kod], guven: 0.9, eslesen: `B.4/${bent}`, gerekce: `Hugo "Rücu Nedeni" metni B.4/${bent} bendine atıf yapıyor.` }
    }
  }

  // 2) Anahtar kelime tablosu
  const n = ` ${rucuNedeniNormal(metin)} `
  for (const k of HUGO_RUCU_NEDENI_KURALLARI) {
    const ifade = k.ifadeler.find((i) => ifadeVarMi(n, i))
    if (!ifade) continue
    const adaylar = [k.zmms, k.kasko].filter((x): x is RucuSebebiKodu => !!x)
    if (brans === 'ZMMS' && k.zmms) return { kod: k.zmms, adaylar: [k.zmms], guven: k.guven, eslesen: ifade, gerekce: `Hugo "Rücu Nedeni" metninde "${ifade}" geçiyor (ZMSS).` }
    if (brans === 'KASKO' && k.kasko) return { kod: k.kasko, adaylar: [k.kasko], guven: k.guven, eslesen: ifade, gerekce: `Hugo "Rücu Nedeni" metninde "${ifade}" geçiyor (kasko).` }
    if (!bransBilinir) {
      if (adaylar.length === 1) {
        return { kod: null, adaylar, guven: k.guven * 0.5, eslesen: ifade, gerekce: `"${ifade}" geçiyor ama dosyanın branşı bilinmiyor: önce branşı onaylayın.` }
      }
      return { kod: null, adaylar, guven: k.guven * 0.5, eslesen: ifade, gerekce: `"${ifade}" branşa göre farklı koda gider; dosyanın branşı bilinmiyor.` }
    }
    // branş belli ama bu ifadenin o branşta karşılığı yok → sonraki kurala bak
  }
  return { kod: null, adaylar: [], guven: 0, eslesen: null, gerekce: 'Hugo "Rücu Nedeni" metni kod listesiyle eşleşmedi; avukat seçer.' }
}

// ───────────────────────── asgari evrak seti ─────────────────────────

export type AsgariBelge = { kategori?: string | null; altTur?: string | null; silindiAt?: Date | string | null }

export type AsgariSetOgesi = {
  tur: EvrakTuru
  ad: string
  durum: 'VAR' | 'EKSIK' | 'KONTROL'
  belgeSayisi: number
  rayIstenir: boolean
  aciklama?: string
}

export type AsgariSetDurumu = {
  kod: RucuSebebiKodu
  kodAd: string
  k1: RucuSebebiTanimi['k1']
  ogeler: AsgariSetOgesi[]
  eksikler: AsgariSetOgesi[]
  kontrolEdilecekler: AsgariSetOgesi[]
  tamam: boolean
}

/** Belge bu evrak türünü karşılıyor mu? (kategori ya da "HASAR_" önekli alt tür) */
export function belgeEvrakTuruMu(b: AsgariBelge, tur: EvrakTuru): boolean {
  const t = EVRAK_TURU_TANIM[tur]
  if (!t.otomatik) return false
  if (b.kategori && t.kategoriler.includes(b.kategori)) return true
  const alt = (b.altTur ?? '').toUpperCase()
  return alt.startsWith('HASAR_') && t.altTurParcalari.some((p) => alt.includes(p))
}

/** Koda bağlı asgari set ↔ dosyadaki belgeler (silinmiş belgeler sayılmaz). */
export function asgariSetDurumu(kod: RucuSebebiKodu, belgeler: readonly AsgariBelge[]): AsgariSetDurumu {
  const t = RUCU_SEBEBI_TANIM[kod]
  const canli = belgeler.filter((b) => !b.silindiAt)
  const ogeler: AsgariSetOgesi[] = t.asgariSet.map((tur) => {
    const tt = EVRAK_TURU_TANIM[tur]
    const sayi = tt.otomatik ? canli.filter((b) => belgeEvrakTuruMu(b, tur)).length : 0
    const durum: AsgariSetOgesi['durum'] = !tt.otomatik ? 'KONTROL' : sayi > 0 ? 'VAR' : 'EKSIK'
    return { tur, ad: tt.ad, durum, belgeSayisi: sayi, rayIstenir: tt.rayIstenir, ...(tt.aciklama ? { aciklama: tt.aciklama } : {}) }
  })
  const eksikler = ogeler.filter((o) => o.durum === 'EKSIK')
  const kontrolEdilecekler = ogeler.filter((o) => o.durum === 'KONTROL')
  return { kod, kodAd: t.ad, k1: t.k1, ogeler, eksikler, kontrolEdilecekler, tamam: eksikler.length === 0 }
}

/**
 * Yol Haritası köprüsü (EV-04): `Gercekler.zorunluEvrak` biçiminde eksikler. Onaylı kod yoksa null (kural susar;
 * öneriye göre hesaplanan liste ekranda gösterilir ama EV-04'ü tetiklemez).
 */
export function zorunluEvrakEksikleri(onayliKod: string | null | undefined, belgeler: readonly AsgariBelge[]): { eksik: string[] } | null {
  if (!rucuSebebiKoduMu(onayliKod)) return null
  return { eksik: asgariSetDurumu(onayliKod, belgeler).eksikler.map((e) => e.ad) }
}

// ───────────────────────── EV-07 kartı (S20 kural motoru için) ─────────────────────────

export type Ev07Durumu = {
  /** Onaylı kod yoksa kart görünür. */
  gerekli: boolean
  onayliKod: RucuSebebiKodu | null
  oneriKod: RucuSebebiKodu | null
  /** "teyit gerekli" etiketi: onaylı kod K1'den geçmemişse ya da kod yoksa. */
  teyitGerekli: boolean
  metin: string
}

/**
 * EV-07: "Rücu sebebini seçin (öneri: …; GŞ sürümü teyit gerekli)". Onaysız kodla "teyit gerekli" etiketi.
 * "GŞ sürümü" ifadesi yalnız ZMSS'de yazılır (dosyanın branşı ya da öneri/onaylı kodun branşı); kasko ve oto dışı
 * dosyalarda ZMSS GŞ uygulanmadığından yerine genel "teyit gerekli" yazılır.
 */
export function ev07Durumu(g: { onayliKod?: string | null; oneriKod?: string | null; brans?: string | null }): Ev07Durumu {
  const onayli = rucuSebebiKoduMu(g.onayliKod) ? g.onayliKod : null
  const oneri = rucuSebebiKoduMu(g.oneriKod) ? g.oneriKod : null
  if (onayli) {
    const teyit = RUCU_SEBEBI_TANIM[onayli].k1 !== 'DOGRULANDI'
    return { gerekli: false, onayliKod: onayli, oneriKod: oneri, teyitGerekli: teyit, metin: `Rücu sebebi: ${RUCU_SEBEBI_TANIM[onayli].ad}${teyit ? ' (teyit gerekli)' : ''}` }
  }
  const oneriMetni = oneri ? `öneri: ${RUCU_SEBEBI_TANIM[oneri].ad}; ` : ''
  const zmssMi = g.brans ? g.brans === 'ZMMS' : oneri ? RUCU_SEBEBI_TANIM[oneri].brans === 'ZMMS' : true
  const teyitMetni = zmssMi ? 'GŞ sürümü teyit gerekli' : 'teyit gerekli'
  return { gerekli: true, onayliKod: null, oneriKod: oneri, teyitGerekli: true, metin: `Rücu sebebini seçin (${oneriMetni}${teyitMetni})` }
}
