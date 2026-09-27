/**
 * KonsRücü — Bilgi bankası mevzuat kataloğu · lib/konsrucu/mevzuat/katalog.ts (saf; client-safe)
 *
 * S33 (06 §7.1, §7.2-5): `MevzuatKaynak`'a yüklenecek ilk kayıtlar. Kaynak:
 * `rucu-hukuk-asistani/bilgi-bankasi/dilekce/atiflar.md` (hakim-istinaf-yargitay ön elemesi, 27.09.2026).
 *
 * Kural (atiflar.md §3.1): kataloğa yalnız ön elemede DOĞRULANDI olan kayıtlar, resmî metinle birebir ve resmî
 * bağlantısıyla girer. Bilinen hatalı atıflar (17. HD 2017/1431, KTK 110/2 "merkez" ibaresi, B.4/f'nin sürümsüz
 * anılması) KULLANMA olarak işlenir (06 §7.1). KISMEN, YANLIŞ AKTARILMIŞ ve DOĞRULANAMADI kayıtlar kataloğa girmez.
 *
 * Ön eleme doğrulama DEĞİLDİR: doğrulayan Yelda'dır (06 §7.2-5). Bu yüzden kayıtlar veritabanına TEYIT_GEREKLI
 * olarak yüklenir; kütüphane ekranında resmî bağlantı açılarak DOĞRULANDI yapılır. Doğrulanmamış kayıt dilekçenin
 * sabit bloğuna hiç girmez (atif.ts · sabitBlokKaynaklari).
 *
 * `rucuSebebiKodlari`: S19 kod listesi (lib/konsrucu/rucu-sebebi.ts) ile aynı dizgiler; B18 (TTK 1472 yalnız
 * halefiyet kodlarında). Kod listesi değişirse burası da güncellenmeli.
 */
import type { MevzuatDurum, MevzuatEtiket, MevzuatTuru } from './sabitler'

export type KatalogKaydi = {
  kunye: string
  tur: MevzuatTuru
  /** Birebir alıntı (resmî metin). KULLANMA kayıtlarında alıntı yapılmayacağını söyleyen not. */
  alinti: string
  resmiUrl: string | null
  /** YYYY-AA-GG */
  erisimTarihi: string
  yururlukBas?: string
  yururlukBit?: string
  etiket: MevzuatEtiket
  /** Yükleme durumu: ön elemede doğrulananlar TEYIT_GEREKLI (Yelda doğrular), bilinen hatalar KULLANMA. */
  durum: Extract<MevzuatDurum, 'TEYIT_GEREKLI' | 'KULLANMA'>
  kapsamNotu: string
  rucuSebebiKodlari: string[]
  bilgiBankasiYolu: string
}

const ERISIM = '2026-09-27'
const BB = 'bilgi-bankasi/dilekce/atiflar.md'
const URL = {
  TTK: 'https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6102.pdf',
  IIK: 'https://www.mevzuat.gov.tr/mevzuatmetin/1.3.2004.pdf',
  KTK: 'https://www.mevzuat.gov.tr/mevzuatmetin/1.5.2918.pdf',
  K6001: 'https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6001.pdf',
  K6502: 'https://www.mevzuat.gov.tr/mevzuatmetin/1.5.6502.pdf',
  ZMSS_GS: 'https://www.mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=20752&mevzuatTur=Teblig&mevzuatTertip=5',
  RG_2015: 'https://www.resmigazete.gov.tr/eskiler/2015/05/20150514-5.htm',
  RG_2026: 'https://www.resmigazete.gov.tr/eskiler/2026/06/20260612-3.htm',
}
const ONELEME = 'Ön eleme: DOĞRULANDI (hakim-istinaf-yargitay, 27.09.2026); avukat doğrulaması bekliyor.'
const HALEFIYET = ['KASKO_HALEFIYET', 'KASKO_HIZMET_KUSURU', 'KASKO_YID']
const ZMSS = ['B4_A', 'B4_B', 'B4_C_ALKOL', 'B4_C_UYUSTURUCU', 'B4_CC', 'B4_D', 'B4_E', 'B4_F', 'GS_DIGER']

export const MEVZUAT_KATALOGU: readonly KatalogKaydi[] = [
  {
    kunye: 'TTK m.1472/1', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Sigortacı, sigorta tazminatını ödediğinde, hukuken sigortalının yerine geçer. Sigortalının, gerçekleşen zarardan dolayı sorumlulara karşı dava hakkı varsa bu hak, tazmin ettiği bedel kadar, sigortacıya intikal eder. …',
    resmiUrl: URL.TTK, erisimTarihi: ERISIM,
    kapsamNotu: `Halefiyet. Yalnız halefiyete dayanan rücularda (kasko) basılır; ZMSS içe rücuda dayanak KTK m.95/2'dir (B18). Talep ödenen tutarla sınırlıdır. ${ONELEME}`,
    rucuSebebiKodlari: HALEFIYET, bilgiBankasiYolu: `${BB}#M01`,
  },
  {
    kunye: 'İİK m.67/1', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Takip talebine itiraz edilen alacaklı, itirazın tebliği tarihinden itibaren bir sene içinde mahkemeye başvurarak, genel hükümler dairesinde alacağının varlığını ispat suretiyle itirazın iptalini dava edebilir.',
    resmiUrl: URL.IIK, erisimTarihi: ERISIM,
    kapsamNotu: `İtirazın iptali davası. ${ONELEME}`,
    rucuSebebiKodlari: [...HALEFIYET, ...ZMSS], bilgiBankasiYolu: `${BB}#M02`,
  },
  {
    kunye: 'İİK m.67/2', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Bu davada borçlunun itirazının haksızlığına karar verilirse borçlu; takibinde haksız ve kötü niyetli görülürse alacaklı; diğer tarafın talebi üzerine iki tarafın durumuna, davanın ve hükmolunan şeyin tahammülüne göre, red veya hükmolunan meblağın yüzde yirmisinden aşağı olmamak üzere, uygun bir tazminatla mahkum edilir.',
    resmiUrl: URL.IIK, erisimTarihi: ERISIM,
    kapsamNotu: `İcra inkâr tazminatı, alt sınır yüzde yirmi (6352 s.K., 2012). Borçlu aleyhine tazminat itirazın haksızlığına bağlıdır; "kötü niyet" borçlu için şart değildir (M04). Alacağın likit olması içtihadi şarttır (teyit gerekli). UM 2021/583 kararındaki eski "%40" metni kopyalanmaz. ${ONELEME}`,
    rucuSebebiKodlari: [...HALEFIYET, ...ZMSS], bilgiBankasiYolu: `${BB}#M02`,
  },
  {
    kunye: 'İİK m.257/1', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Rehinle temin edilmemiş ve vadesi gelmiş bir para borcunun alacaklısı, borçlunun yedinde veya üçüncü şahısta olan taşınır ve taşınmaz mallarını ve alacaklarıyla diğer haklarını ihtiyaten haczettirebilir.',
    resmiUrl: URL.IIK, erisimTarihi: ERISIM,
    kapsamNotu: `İhtiyati haciz şartı. Vadesi gelmiş rücu alacağında "mal kaçırma" gerekçesi zorunlu değildir; 257/2 hâlleri vadesi gelmemiş borç içindir (M07). KGM'nin mal ve paraları haczedilemez (6001 s.K. m.12/1). ${ONELEME}`,
    rucuSebebiKodlari: [...HALEFIYET, ...ZMSS], bilgiBankasiYolu: `${BB}#M07`,
  },
  {
    kunye: 'İİK m.258/1', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: '… Alacaklı alacağı ve icabında haciz sebepleri hakkında mahkemeye kanaat getirecek deliller göstermeğe mecburdur.',
    resmiUrl: URL.IIK, erisimTarihi: ERISIM,
    kapsamNotu: `Yaklaşık ispat. 258/3 (7251 s.K., 2020): ret kararına ve yüze karşı verilen karara karşı istinaf. ${ONELEME}`,
    rucuSebebiKodlari: [...HALEFIYET, ...ZMSS], bilgiBankasiYolu: `${BB}#M08`,
  },
  {
    kunye: 'KTK m.52/b', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Hızlarını, kullandıkları aracın yük ve teknik özelliğine, görüş, yol, hava ve trafik durumunun gerektirdiği şartlara uydurmak,',
    resmiUrl: URL.KTK, erisimTarihi: ERISIM,
    kapsamNotu: `Hız uydurma. m.52'de fıkra numarası yoktur; "52/1-b" yerleşik yazımdır. Tutanakta hangi madde yazıyorsa o aktarılır. ${ONELEME}`,
    rucuSebebiKodlari: [], bilgiBankasiYolu: `${BB}#M13`,
  },
  {
    kunye: 'KTK m.97', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Zarar görenin, zorunlu mali sorumluluk sigortasında öngörülen sınırlar içinde dava yoluna gitmeden önce ilgili sigorta kuruluşuna yazılı başvuruda bulunması gerekir. Sigorta kuruluşunun başvuru tarihinden itibaren en geç 15 gün içinde … cevaplamaması veya … uyuşmazlık olması hâlinde, zarar gören dava açabilir veya 5684 sayılı Kanun çerçevesinde tahkime başvurabilir.',
    resmiUrl: URL.KTK, erisimTarihi: ERISIM,
    kapsamNotu: `Sigortacıya zorunlu başvuru. Değişik 14.04.2016, 6704 s.K. m.5. ${ONELEME}`,
    rucuSebebiKodlari: ZMSS, bilgiBankasiYolu: `${BB}#M14`,
  },
  {
    kunye: 'KTK m.13/1', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Karayolunun yapımı, bakımı, işletilmesi ile görevli ve sorumlu bütün kuruluşlar, karayolu yapısını, trafik güvenliğini sağlayacak durumda bulundurmakla yükümlüdür.',
    resmiUrl: URL.KTK, erisimTarihi: ERISIM,
    kapsamNotu: `Yol güvenliği yükümlülüğü; hizmet kusuru dosyalarında KTK m.3 tanımından daha güçlü dayanak (M09). ${ONELEME}`,
    rucuSebebiKodlari: ['KASKO_HIZMET_KUSURU', 'KASKO_YID'], bilgiBankasiYolu: `${BB}#M09`,
  },
  {
    kunye: 'KTK m.95/2', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Ödemede bulunan sigortacı, … tazminatın kaldırılmasını veya azaltılmasını sağlayabileceği oranda sigorta ettirene başvurabilir.',
    resmiUrl: URL.KTK, erisimTarihi: ERISIM,
    kapsamNotu: `ZMSS'de sigorta ettirene rücu dayanağı. "Sorumlu kişiler" değil "sigortalı / sigorta ettiren" yazılır; sigortalı olmayan sürücüye rücu ayrı ve tartışmalıdır (M20). ${ONELEME}`,
    rucuSebebiKodlari: ZMSS, bilgiBankasiYolu: `${BB}#M20`,
  },
  {
    kunye: '6001 s.K. m.2/1-e', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Erişme kontrolü: … yaya, hayvan ve motorsuz taşıt ve araçların girmesinin engellenerek …',
    resmiUrl: URL.K6001, erisimTarihi: ERISIM,
    kapsamNotu: `Erişme kontrolü tanımı (M09). Kanunun güncel adı "Karayolları Genel Müdürlüğünün Hizmetleri Hakkında Kanun". ${ONELEME}`,
    rucuSebebiKodlari: ['KASKO_HIZMET_KUSURU'], bilgiBankasiYolu: `${BB}#M09`,
  },
  {
    kunye: '6001 s.K. (Kanun adı)', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Karayolları Genel Müdürlüğünün Hizmetleri Hakkında Kanun',
    resmiUrl: URL.K6001, erisimTarihi: ERISIM,
    kapsamNotu: `Kanun No. 6001, RG 13.07.2010, sayı 27640. Eski ad "Teşkilat ve Görevleri Hakkında Kanun" kullanılmaz (703 s. KHK m.76; M17). ${ONELEME}`,
    rucuSebebiKodlari: ['KASKO_HIZMET_KUSURU'], bilgiBankasiYolu: `${BB}#M18`,
  },
  {
    kunye: 'ZMSS GŞ B.4/c', tur: 'GENEL_SART', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Aracın, uyuşturucu madde veya ilgili mevzuatta belirlenen seviyenin üzerinde alkollü içki almış kişilerce veya aynı mevzuatta alkollü içki alamayacağı belirtilen kişilerce alkollü içki alınmak suretiyle kullanılması sırasında meydana gelen zararlar,',
    resmiUrl: URL.ZMSS_GS, erisimTarihi: ERISIM,
    kapsamNotu: `Alkol ve uyuşturucu bendi. Uygulamada Yargıtay 11. HD 2025/2402: kazanın münhasıran alkolün etkisiyle gerçekleşmesi gerekir; 1 promil üzerinde illiyet yokluğunu ispat yükü sigortalıdadır (teyit gerekli). "Alkollü olmak tek başına yeterlidir" yazılmaz (M21). ${ONELEME}`,
    rucuSebebiKodlari: ['B4_C_ALKOL', 'B4_C_UYUSTURUCU'], bilgiBankasiYolu: `${BB}#M19`,
  },
  {
    kunye: 'ZMSS GŞ B.4/f (2015 metni)', tur: 'GENEL_SART', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Bedeni hasara neden olan trafik kazalarında sigortalının veya eylemlerinden sorumlu olduğu kişilerin, tedavi veya yardım amaçlı sağlık kuruluşuna gitme, can güvenliği nedeniyle uzaklaşma gibi zorunlu haller hariç olmak üzere, olay yerini terk etmesi veya kaza tutanağı, alkol raporu vb. kazanın oluş koşullarına ilişkin gereken belgelerin düzenlenmesi yükümlülüğüne aykırı davranması halinde,',
    resmiUrl: URL.RG_2015, erisimTarihi: ERISIM, yururlukBit: '2026-06-30',
    kapsamNotu: `RG 14.05.2015. 01.07.2026'dan önce akdedilen poliçelere uygulanır; sürüm poliçe akdi tarihine göre seçilir (GŞ C.11/2). Poliçe tarihi yoksa atıf doğrulanmış sayılmaz. ${ONELEME}`,
    rucuSebebiKodlari: ['B4_F'], bilgiBankasiYolu: `${BB}#M19`,
  },
  {
    kunye: 'ZMSS GŞ B.4/f (2026 metni)', tur: 'GENEL_SART', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Trafik kazalarında sigortalının veya eylemlerinden sorumlu olduğu kişilerin, can güvenliği nedeniyle uzaklaşma hali ile bedeni hasara neden olan trafik kazalarında tedavi veya yardım amaçlı sağlık kuruluşuna gitme gibi zorunlu haller hariç olmak üzere, olay yerini terk etmesi veya …',
    resmiUrl: URL.RG_2026, erisimTarihi: ERISIM, yururlukBas: '2026-07-01',
    kapsamNotu: `RG 12.06.2026, sayı 33278; yürürlük 01.07.2026. Bu tarihten sonra akdedilen poliçelere uygulanır (GŞ C.11/2). ${ONELEME}`,
    rucuSebebiKodlari: ['B4_F'], bilgiBankasiYolu: `${BB}#M19`,
  },
  {
    kunye: '6502 s.K. m.73/A/1', tur: 'MEVZUAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: 'Tüketici mahkemelerinde görülen uyuşmazlıklarda dava açılmadan önce arabulucuya başvurulmuş olması dava şartıdır.',
    resmiUrl: URL.K6502, erisimTarihi: ERISIM,
    kapsamNotu: `Tüketici mahkemesindeki davalarda dava şartı arabuluculuk. Asliye Hukuk/Ticaret'te dayanak TTK m.5/A'dır ve KGM aleyhine halefiyet davasının ticari sayılıp sayılmadığı tartışmalıdır; hangi dayanağın yazılacağı avukat kararıdır (M25). ${ONELEME}`,
    rucuSebebiKodlari: ZMSS, bilgiBankasiYolu: `${BB}#M25`,
  },
  {
    kunye: 'UM 27.12.2021, E.2021/583, K.2021/660', tur: 'ICTIHAT', etiket: 'YERLESIK', durum: 'TEYIT_GEREKLI',
    alinti: '[¶15] Yukarıda hükmü yazılı 67. maddede sözü edilen mahkeme ile icra dairesinin bulunduğu yargı çevresi bakımından bağlı olduğu asliye mahkemesinin anlaşılması ve takip hukukuna özgü bulunan itirazın iptali davasının adli yargı yerinde görülmesi gerektiği açıktır.\n[¶16] Bu duruma göre, İcra ve İflas Kanunu\'nun değişik 67. maddesine göre açılan itirazın iptali davasının görüm ve çözümünde adli yargı yerinin görevli olduğu sonucuna varılmıştır. Kaldı ki davanın idarenin hizmet kusuru sonucu oluşan trafik kazasından kaynaklanan rücuan tazminat davası olarak kabulü halinde de, Uyuşmazlık Mahkemesinin yerleşik içtihatları gereği 2918 sayılı Kanun uyarınca açılan her türlü sorumluluk davalarında adli yargı görevlidir.',
    resmiUrl: 'https://kararlar.uyusmazlik.gov.tr/Uploads/2021-583.pdf', erisimTarihi: ERISIM,
    kapsamNotu: `Oy birliği, kesin. Olay: yol üzerinde bulunan cisme çarpma (hayvan ya da otoyol değil); olay benzerliği iddia edilmez (İ01b, İ01c). Yargı yolunu belirler, adli yargı içinde görev belirlemez. Aynı yönde UM 2021/257 ve 2025/318 oy çokluğuyla. ${ONELEME}`,
    rucuSebebiKodlari: ['KASKO_HIZMET_KUSURU'], bilgiBankasiYolu: `${BB}#İ01`,
  },
  {
    kunye: 'Yargıtay 11. HD 23.06.2025, E.2025/2402, K.2025/4431', tur: 'ICTIHAT', etiket: 'TARTISMALI', durum: 'TEYIT_GEREKLI',
    alinti: '01.06.2015 tarihli değişiklikten sonra ZMMS Genel Şartlarının B.4.c bendine dayalı olarak sigorta şirketleri tarafından sigortalı akidi aleyhine açılan rücuan tazminat davalarında, kazanın münhasıran alkolün etkisi altında gerçekleşmesi gerektiğine',
    resmiUrl: 'https://karararama.yargitay.gov.tr/getDokuman?id=1169112400', erisimTarihi: ERISIM,
    kapsamNotu: `Bölge adliye mahkemeleri arasındaki uyuşmazlığı giderme kararı (5235 s.K. m.35/4; kesin; oy çokluğu). Gerekçe ¶9: alkol 1 promilin üzerindeyse illiyet yokluğunu ispat yükü sigortalıdadır. Diğer daireler bakımından bağlayıcılık kapsamı teyit gerekli. ${ONELEME}`,
    rucuSebebiKodlari: ['B4_C_ALKOL'], bilgiBankasiYolu: `${BB}#İ-ek1`,
  },
  {
    kunye: 'Yargıtay 17. HD 17.10.2019, E.2017/1431, K.2019/9581', tur: 'ICTIHAT', etiket: 'TEYIT_GEREKLI', durum: 'KULLANMA',
    alinti: 'alacak miktarının tespiti yargılama yapılmasını gerektirdiğinden',
    resmiUrl: 'https://karararama.yargitay.gov.tr/getDokuman?id=549883600', erisimTarihi: ERISIM,
    kapsamNotu: 'KULLANMA: görev ya da yargı yolu cümlesine dayanak gösterilemez (B09). Karar, trafik rücusunda alacağın likit sayılmayıp inkâr tazminatının kaldırılmasına ilişkindir (M03); o bağlamda kullanılacaksa avukat ayrı kayıtla doğrular. 17. HD kapatılmıştır.',
    rucuSebebiKodlari: [], bilgiBankasiYolu: `${BB}#İ-ek3`,
  },
  {
    kunye: 'KTK m.110/2', tur: 'MEVZUAT', etiket: 'TEYIT_GEREKLI', durum: 'KULLANMA',
    alinti: '(Alıntı yapılmaz: "merkez" ve "veya" ibareleri AYM 14.03.2024, E.2023/79, K.2024/80 ile iptal edildi.)',
    resmiUrl: URL.KTK, erisimTarihi: ERISIM,
    kapsamNotu: 'KULLANMA: yetki paragrafında 110/2\'nin iptal edilmiş "merkez" ibaresi hiçbir biçimde üretilmez (B07). Büro dilekçeleri yargı yolu için yalnız 110/1\'e dayanır (M11).',
    rucuSebebiKodlari: [], bilgiBankasiYolu: `${BB}#M11`,
  },
  {
    kunye: 'ZMSS GŞ B.4/f', tur: 'GENEL_SART', etiket: 'TEYIT_GEREKLI', durum: 'KULLANMA',
    alinti: '(Alıntı yapılmaz: bent iki farklı metinle yürürlükte kaldı; sürüm belirtilmeden atıf yapılmaz.)',
    resmiUrl: URL.RG_2026, erisimTarihi: ERISIM,
    kapsamNotu: 'KULLANMA: B.4/f sürümüyle yazılır — "(2015 metni)" ya da "(2026 metni)". Sürüm poliçenin akdedildiği tarihe göre seçilir (GŞ C.11/2).',
    rucuSebebiKodlari: [], bilgiBankasiYolu: `${BB}#M19`,
  },
]
