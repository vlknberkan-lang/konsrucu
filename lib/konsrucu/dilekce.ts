/**
 * KonsRücü — Dava Dilekçesi üreticisi (saf; DB yok) · lib/konsrucu/dilekce.ts
 * Ray Sigorta rücu itirazın iptali dava dilekçesi. İskelet + dosya alanları + olay-türü blokları
 * (KONU / argüman / Yargıtay — tür odaklı) + terk-bazlı sabit deliller. Olay anlatımı AI'dan gelir.
 * Kaynak: büronun 3 örnek dilekçesi (alkol / olay yeri terk / kasko çarpıp-kaçma).
 */

export type DilekceDavali = { ad: string; tc: string | null; adres: string | null }

export type DilekceGirdi = {
  // davacı + vekil (Ayarlar)
  davaciUnvan: string
  davaciVkn: string | null
  davaciAdres: string | null
  vekilAd: string | null
  vekilUets: string | null
  vekilAdres: string | null
  icraInkarOrani: string // "20"
  // taraflar
  davalilar: DilekceDavali[]
  // dosya künyesi
  brans: string | null // KASKO / ZMMS / ...
  olayTuru: string | null // "alkol" / "olay yeri terk" / "çarpıp kaçma" ...
  mahkemeYeri: string | null // ilçe (kaza yeri) — "KÜÇÜKÇEKMECE"
  mahkemeTuruZorla?: 'TUKETICI' | 'ASLIYE' | null // override
  icraDairesi: string | null
  icraEsasNo: string | null
  asilAlacak: number | null
  islemisFaiz: number | null
  takipCikis: number | null
  policeNo: string | null
  kazaTarihi: string | null // YYYY-MM-DD
  kazaYeri: string | null
  sigortaliPlaka: string | null
  karsiPlaka: string | null
  // arabuluculuk (ARABULUCULUK aşamasından)
  arabulucuBuro: string | null
  arabulucuDosyaNo: string | null
  arabulucuTarih: string | null
  // AI olay anlatımı (AÇIKLAMALAR'ın olgusal kısmı)
  olayAnlatimi: string
  // tür-özel ek deliller (ör. alkol raporu) — assembler terk listesine ekler
}

const Y = (s: string) => `⟨${s}⟩` // doldurulamayan alan → avukat tamamlar
const para = (n: number | null | undefined) =>
  n != null && Number.isFinite(Number(n)) ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) + ' TL' : null
const tarihTR = (s: string | null) => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const buyuk = (s: string | null | undefined) => (s ? s.toLocaleUpperCase('tr') : '')

type TurKey = 'alkol' | 'terk' | 'carpip_kacma' | 'genel'
export function turBelirle(olayTuru: string | null, brans: string | null): TurKey {
  const t = (olayTuru ?? '').toLocaleLowerCase('tr')
  if (/alkol|promil/.test(t)) return 'alkol'
  if (/terk|firar|kaç(ma|tı)|olay yeri/.test(t)) return 'terk'
  if (/çarp|park|vur.?kaç|kasko/.test(t) || (brans ?? '').toUpperCase() === 'KASKO') return 'carpip_kacma'
  return 'genel'
}

// Görevli mahkeme: kendi sigortalısına rücu (ZMMS poliçe ihlali) = tüketici işlemi → Tüketici Mahkemesi.
// Karşı kusurlu 3. kişiye rücu (Kasko) = tüketici değil → Asliye Hukuk Mahkemesi.
function mahkemeTuru(g: DilekceGirdi, tur: TurKey): 'TUKETICI' | 'ASLIYE' {
  if (g.mahkemeTuruZorla) return g.mahkemeTuruZorla
  if (tur === 'carpip_kacma' || (g.brans ?? '').toUpperCase() === 'KASKO') return 'ASLIYE'
  return 'TUKETICI'
}

// Tür-odaklı Yargıtay kararları (örneklerden, birebir) — KONU/argüman türe göre değişir, deliller sabit.
const YARGITAY: Record<TurKey, string[]> = {
  alkol: [
    `T.C. Yargıtay 17. Hukuk Dairesi'nin 15.04.2019 tarihli, E. 2016/11414 K. 2019/4762 kararı uyarınca trafik poliçesinden kaynaklı rücu davalarında görevli mahkeme tüketici mahkemesidir.`,
    `T.C. Yargıtay 20. Hukuk Dairesi'nin 22.12.2016 tarihli, E. 2016/14023 K. 2016/12515 kararı ile sigorta sözleşmesinden kaynaklanan rücu uyuşmazlığının tüketici mahkemesinde görüleceği içtihat edilmiştir (ayrıca 17. HD 17.10.2019, 2017/1431 E., 2019/9581 K.).`,
    `İcra inkâr tazminatı oranı bakımından Yargıtay Hukuk Genel Kurulu'nun 27.01.2022 tarihli, 2021/4-859 E. ve 2022/62 K. sayılı kararı uyarınca, İİK 67/2 ile 67/5 maddelerindeki %20 alt sınırın üzerinde, üst sınır hâkimin takdirinde tazminata hükmedilebilir; paranın değer kaybı ve yargılama süresi gözetilmelidir.`,
    `İhtiyati haciz bakımından Yargıtay 17. HD 12.02.2013, E. 2013/1118 K. 2013/1400 kararı uyarınca, İİK 257-258 gereği alacağın varlığına kanaat yeterli olup, sürücünün kusuru halinde rücu şartlarının gerçekleşmesi kuvvetle muhtemel ise ihtiyati haciz talebinin kabulü gerekir.`,
  ],
  terk: [
    `T.C. Yargıtay 4. Hukuk Dairesi'nin 13.02.2025 tarih 2024/11202 E. - 2025/2473 K. sayılı kararında belirtildiği üzere; olay yerini terk eden sürücünün kaza tutanağı, alkol raporu vb. kazanın oluş koşullarına ilişkin gereken belgelerin düzenlenmesi yükümlülüğünü yerine getiremeyeceği açıktır.`,
    `T.C. Yargıtay 17. Hukuk Dairesi'nin 15.04.2019 tarihli, E. 2016/11414 K. 2019/4762 kararı uyarınca trafik poliçesinden kaynaklı rücu davalarında görevli mahkeme tüketici mahkemesidir.`,
  ],
  carpip_kacma: [
    `Karayolları Trafik Kanunu ve yerleşik Yargıtay içtihatları uyarınca, nizami olarak park halindeki araca çarpan sürücü asli ve tam (%100) kusurlu olup, durağan araç sürücüsüne kusur atfedilemez.`,
    `Türk Ticaret Kanunu'nun 1472. maddesinde düzenlenen halefiyet ilkesi gereğince, sigortalısına ödeme yapan müvekkil sigorta şirketi sigortalısının haklarına halef olmuş ve kusurlu davalı tarafa rücu hakkı kazanmıştır.`,
  ],
  genel: [
    `T.C. Yargıtay 17. Hukuk Dairesi'nin 15.04.2019 tarihli, E. 2016/11414 K. 2019/4762 kararı uyarınca trafik poliçesinden kaynaklı rücu davalarında görevli mahkeme tüketici mahkemesidir.`,
  ],
}

// Tür-özel KONU ihlal ibaresi + argüman başlığı
const TUR_META: Record<TurKey, { ihlal: string; argBaslik: string; argGovde: (g: DilekceGirdi) => string; ekDelil: (g: DilekceGirdi) => string[] }> = {
  alkol: {
    ihlal: 'sigortalı sürücünün yasal sınırın üzerinde ALKOLLÜ olarak araç kullanması',
    argBaslik: 'SİGORTALI SÜRÜCÜNÜN YASAL SINIRIN ÜZERİNDE ALKOLLÜ ARAÇ KULLANMASI, ZMMS GENEL ŞARTLARI KAPSAMINDA AÇIK BİR RÜCU SEBEBİDİR.',
    argGovde: () =>
      `Kaza Tespit Tutanağı ve Alkol Ölçüm Raporu birlikte değerlendirildiğinde, sigortalı araç sürücüsünün kaza anında yasal sınır olan 0,50 promilin üzerinde alkollü olduğu ve kazanın oluşumunda %100 kusurlu bulunduğu sabittir. Alkolün etkisiyle güvenli sürüş yeteneğini kaybeden sürücünün direksiyon başına geçmesi, Karayolları Motorlu Araçlar Zorunlu Mali Sorumluluk Sigortası Genel Şartları uyarınca müvekkil sigorta şirketine ödediği tazminatı rücu hakkı vermektedir.`,
    ekDelil: () => ['Emniyet Genel Müdürlüğü tarafından düzenlenen, davalı/sürücünün kaza anında alkollü olduğunu gösteren Alkol Ölçüm Raporu.'],
  },
  terk: {
    ihlal: 'sigortalı sürücünün yasal yükümlülüklerine aykırı olarak OLAY YERİNİ TERK ETMESİ',
    argBaslik: 'DAVALININ OLAY YERİNİ TERK ETMESİ, ZORUNLU MALİ SORUMLULUK SİGORTASI GENEL ŞARTLARI KAPSAMINDA MÜVEKKİL SİGORTA ŞİRKETİNE RÜCU HAKKI VEREN AÇIK BİR İHLALDİR.',
    argGovde: () =>
      `Sigortalı sürücünün kaza sonrası olay yerini terk etmesi; alkol ve ehliyet kontrolü yapılmasını, delillerin sıcağı sıcağına toplanmasını ve kusur/ zararın net tespitini engellemiş, sözleşmeden doğan sadakat ve iş birliği yükümlülüğü ihlal edilmiştir. Bu durum, ZMMS Genel Şartları uyarınca müvekkil sigorta şirketine doğrudan rücu hakkı veren hallerdendir.`,
    ekDelil: () => [],
  },
  carpip_kacma: {
    ihlal: 'davalının park halindeki sigortalı araca çarparak (vur-kaç suretiyle) zarar vermesi',
    argBaslik: 'MEYDANA GELEN KAZA, DAVALI TARAFIN ASLİ VE TAM KUSURU SEBEBİYLE MEYDANA GELMİŞTİR.',
    argGovde: () =>
      `Kamera kayıtları ve kaza tespit beyanı birlikte incelendiğinde, sigortalı aracın nizami şekilde park halinde olduğu, davalının kusurlu sürüşü ile çarptığı ve akabinde durmadan olay yerinden kaçtığı (vur-kaç) sabittir. Nizami park halindeki araca çarpan sürücü asli ve tam (%100) kusurlu olup, müvekkil şirketin TTK 1472 gereği halefiyetle rücu hakkı doğmuştur.`,
    ekDelil: () => [],
  },
  genel: { ihlal: 'davalının kusurlu eylemi', argBaslik: 'DAVALININ KUSURLU EYLEMİ NEDENİYLE RÜCU HAKKIMIZ DOĞMUŞTUR.', argGovde: () => '', ekDelil: () => [] },
}

// Terk dilekçesindeki DELİLLER listesi = tüm davalarda sabit baz (slotlar doldurulur).
function delilListesi(g: DilekceGirdi, tur: TurKey): string[] {
  const d: string[] = []
  d.push(`${g.icraDairesi || Y('icra dairesi')}'nin ${g.icraEsasNo || Y('esas no')} Esas sayılı icra takip dosyası,`)
  d.push(`${g.arabulucuBuro || Y('arabuluculuk bürosu')} nezdinde yürütülen, ${g.arabulucuDosyaNo || Y('arabuluculuk no')} sayılı, anlaşamama ile sonuçlanan Arabuluculuk Son Tutanağı,`)
  d.push(`Müvekkil şirkete ait ${g.policeNo || Y('poliçe no')} numaralı ${g.brans === 'KASKO' ? 'Kasko' : 'Zorunlu Mali Sorumluluk (Trafik)'} Sigorta Poliçesi,`)
  d.push(`Müvekkil Ray Sigorta A.Ş. nezdinde açılan hasar dosyası muhteviyatı (Celbi talep olunur),`)
  d.push(`Müvekkil sigorta şirketi tarafından yapılan ${para(g.asilAlacak) || Y('ödeme tutarı')} tutarındaki rücuen ödemeye ilişkin banka dekontu / ödeme kayıtları,`)
  d.push(`İlgili kolluk birimince tanzim edilen resmi Maddi Hasarlı Trafik Kazası Tespit Tutanağı,`)
  for (const x of TUR_META[tur].ekDelil(g)) d.push(x)
  d.push(`Kaza yerini, çarpma noktalarını ve araçlardaki hasarı gösteren olay yeri ve hasar fotoğrafları,`)
  d.push(`Faturalar ile eksper hasar raporu ve tüm onarım evrakları,`)
  d.push(`Kazaya karışan araçların seyir, hız ve konum bilgilerinin tespiti amacıyla gerektiğinde celp edilecek GPS / Araç Takip Sistemi Kayıtları,`)
  d.push(`Gerektiğinde celp edilecek kolluk evrakları ile KGYS/MOBESE ve sair kamera kayıtları,`)
  d.push(`Kaza tarihi ve sonrasına ilişkin gerektiğinde BTK üzerinden HTS (Arayan/Aranan/Sinyal Takibi) kayıtları,`)
  d.push(`(Gerektiğinde sunulacak) Uzman Mütalaası (Uzman Görüşü),`)
  d.push(`Taraf araçlara ait ruhsat, tescil ve trafik sicil kayıtları (Celbi talep olunur),`)
  d.push(`Sigorta Bilgi ve Gözetim Merkezi (SBM / TRAMER) kayıtları,`)
  d.push(`Kusur durumunun, hasar miktarının ve rücu koşullarının tespiti yönünden Keşif, Bilirkişi İncelemesi, (gerektiğinde) Tanık beyanları, yemin, isticvap ve ikamesi mümkün sair her türlü yasal delil. (Karşı tarafın sunacağı delillere karşı delil sunma ve cevap verme haklarımızı saklı tutarız.)`)
  return d
}

export function dilekceMetni(g: DilekceGirdi): string {
  const tur = turBelirle(g.olayTuru, g.brans)
  const mTur = mahkemeTuru(g, tur)
  const mahkemeAd = mTur === 'ASLIYE' ? 'ASLİYE HUKUK MAHKEMESİNE' : 'TÜKETİCİ MAHKEMESİNE'
  const yer = buyuk(g.mahkemeYeri) || Y('MAHKEME YERİ')
  const oran = (g.icraInkarOrani || '20').replace(/%/g, '')
  const L: string[] = []
  const ekle = (s = '') => L.push(s)

  ekle(`T.C.`)
  ekle(`${yer}  ( … ) ${mahkemeAd}`)
  ekle()
  ekle(`İHTİYATİ HACİZ TALEPLİDİR`)
  ekle()
  ekle(`DAVACI            : ${g.davaciUnvan || 'RAY SİGORTA ANONİM ŞİRKETİ'}${g.davaciVkn ? ` (VKN: ${g.davaciVkn})` : ''}`)
  if (g.davaciAdres) ekle(`                    ${g.davaciAdres}`)
  ekle()
  ekle(`VEKİLİ            : ${g.vekilAd || Y('vekil')}${g.vekilUets ? `  UETS (${g.vekilUets})` : ''}`)
  if (g.vekilAdres) ekle(`                    ${g.vekilAdres}`)
  ekle()
  if (g.davalilar.length) {
    g.davalilar.forEach((d, i) => {
      ekle(`DAVALI${g.davalilar.length > 1 ? ` ${i + 1}` : '  '}          : ${buyuk(d.ad) || Y('davalı')}${d.tc ? `, ${d.tc} TC No'lu` : ''}`)
      if (d.adres) ekle(`                    ${d.adres}`)
    })
  } else {
    ekle(`DAVALI            : ${Y('davalı ad-soyad, TC, adres')}`)
  }
  ekle()
  // KONU
  const bransAd = g.brans === 'KASKO' ? 'Kasko' : 'Zorunlu Mali Sorumluluk (ZMMS)'
  ekle(
    `KONU              : Müvekkil Ray Sigorta A.Ş. nezdinde ${bransAd} poliçesi ile sigortalı bulunan ${g.sigortaliPlaka || Y('sig. plaka')} plakalı araca ilişkin, ${TUR_META[tur].ihlal} neticesinde mağdur tarafa rücuen ödenen ${para(g.asilAlacak) || Y('tutar')} bedelin tahsili amacıyla ${g.icraDairesi || Y('icra dairesi')}'nin ${g.icraEsasNo || Y('esas no')} Esas sayılı dosyası ile başlatılan icra takibine yapılan haksız itirazın iptali ile takibin devamına, alacağın %${oran}'sinden az olmamak üzere icra inkâr tazminatına ve ihtiyati hacze hükmedilmesi talebimizden ibarettir.`
  )
  ekle()
  ekle(`DAVA ESAS DEĞERİ  : ${para(g.takipCikis) || Y('takip çıkış değeri')} (${g.icraDairesi || Y('icra dairesi')}'nin ${g.icraEsasNo || Y('esas no')} Esas sayılı dosyasındaki asıl alacak ile işlemiş faiz ve fer'ileri toplamından oluşan takip çıkış değeridir.)`)
  ekle()
  ekle(`AÇIKLAMALAR`)
  ekle()
  // 1) olgusal olay anlatımı (AI)
  ekle(g.olayAnlatimi.trim())
  ekle()
  // 2) tür argümanı
  ekle(TUR_META[tur].argBaslik)
  ekle()
  ekle(TUR_META[tur].argGovde(g))
  ekle()
  // 3) ödeme/halefiyet
  ekle(
    `Müvekkil sigorta şirketi, yapmış olduğu ${para(g.asilAlacak) || Y('tutar')} tutarındaki ödeme ile Türk Ticaret Kanunu'nun 1472. maddesinde düzenlenen halefiyet ilkesi gereğince sigortalısının haklarına halef olmuş ve kusurlu tarafa karşı rücu hakkı kazanmıştır. Bu doğrultuda ${g.icraDairesi || Y('icra dairesi')}'nin ${g.icraEsasNo || Y('esas no')} Esas sayılı dosyası ile icra takibi başlatılmış; davalı borçlu haksız, mesnetsiz ve kötü niyetli şekilde borca, faize ve fer'ilerine itiraz ederek takibi durdurmuştur.`
  )
  ekle()
  // 4) arabuluculuk dava şartı
  ekle(
    `Yargı yoluna başvurulmadan önce dava şartı olan arabuluculuk süreci işletilmiş; ${g.arabulucuBuro || Y('arabuluculuk bürosu')} nezdinde ${g.arabulucuDosyaNo || Y('arabuluculuk no')} sayılı dosya üzerinden yürütülen görüşmelerde anlaşma sağlanamamış${g.arabulucuTarih ? ` ve ${tarihTR(g.arabulucuTarih)} tarihinde` : ''} son tutanak tanzim edilmiştir. Böylece dava şartı yerine getirilmiş olup, haksız itirazın iptali amacıyla işbu davanın açılması zorunlu hale gelmiştir.`
  )
  ekle()
  // 5) icra inkar
  ekle(`DAVALININ BORCA HAKSIZ VE KÖTÜ NİYETLİ İTİRAZI NEDENİYLE İCRA İNKAR TAZMİNATINA HÜKMEDİLMESİ GEREKMEKTEDİR.`)
  ekle()
  ekle(
    `Takip dayanağı alacak; somut ödeme belgeleri, ekspertiz kayıtları, hasar dosyası ve resmi evraklarla sabit, likit ve belirlenebilir niteliktedir. Davalının itirazı yalnızca alacağın tahsilini geciktirmeye yönelik kötü niyetli bir girişimdir. Bu nedenle İİK ilgili hükümleri uyarınca itirazın iptali ile takibin devamına ve alacağın %${oran}'sinden az olmamak üzere icra inkar tazminatına hükmedilmesi gerekmektedir.`
  )
  ekle()
  // 6) ihtiyati haciz
  ekle(`MÜVEKKİLİN HAK VE ALACAKLARININ GÜVENCE ALTINA ALINMASI İÇİN İHTİYATİ HACİZ VERİLMESİ GEREKMEKTEDİR.`)
  ekle()
  ekle(
    `Davalının borcunu inkar etmesi ve ödeme iradesi göstermemesi birlikte değerlendirildiğinde, alacağın tahsilini güçleştirmeye yönelik davranış içinde olduğu açıktır. Borçlunun mal kaçırma ve adres değiştirme ihtimali bulunduğundan, Sayın Mahkemenizce uygun görülecek teminat karşılığı, borçlunun borca yeter miktarda menkul, gayrimenkul ve üçüncü kişilerdeki hak ve alacaklarının İHTİYATEN HACZİNE karar verilmesini talep ederiz (İİK m. 257 vd.).`
  )
  ekle()
  // 7) görev/yetki + tür-odaklı Yargıtay
  ekle(`SAYIN MAHKEMENİZ NEZDİNDE AÇILAN İŞBU DAVA GÖREVLİ VE YETKİLİ YERDE AÇILMIŞTIR.`)
  ekle()
  for (const yk of YARGITAY[tur]) { ekle(yk); ekle() }
  ekle(
    `Motorlu araç kazalarından doğan hukuki sorumluluk için kesin yetki kuralı bulunmamaktadır. KTK m. 110/2 uyarınca bu davalar, sigortacının merkez/şube veya acentenin bulunduğu yer ile kazanın vuku bulduğu yer mahkemelerinden birinde açılabilir.`
  )
  ekle()
  ekle(`HUKUKİ NEDENLER    : Karayolları Trafik Kanunu, Türk Borçlar Kanunu, Türk Ticaret Kanunu, Zorunlu Mali Sorumluluk Sigortası Genel Şartları, İcra ve İflas Kanunu, Hukuk Muhakemeleri Kanunu ve ilgili sair mevzuat.`)
  ekle()
  ekle(`HUKUKİ DELİLLER    :`)
  delilListesi(g, tur).forEach((d) => ekle(`- ${d}`))
  ekle()
  ekle(`SONUÇ ve İSTEM     : Yukarıda arz ve izah olunan nedenlerle ve Sayın Mahkemenizce re'sen gözetilecek hususlar kapsamında, fazlaya ilişkin haklarımız saklı kalmak kaydıyla;`)
  ekle()
  ekle(`1- Davalının ${g.icraDairesi || Y('icra dairesi')} ${g.icraEsasNo || Y('esas no')} Esas sayılı dosyaya yaptığı haksız ve kötü niyetli İTİRAZININ İPTALİ ile takibin DEVAMINA,`)
  ekle(`2- Takip konusu alacağın %${oran}'sinden az olmamak üzere davalı aleyhine İCRA İNKAR TAZMİNATINA HÜKMEDİLMESİNE,`)
  ekle(`3- Davalının borca yeter menkul, gayrimenkul ve üçüncü kişilerdeki hak ve alacaklarının İHTİYATEN HACZİNE,`)
  ekle(`4- Yargılama giderleri ile vekâlet ücretinin davalı üzerinde bırakılmasına,`)
  ekle()
  ekle(`karar verilmesini vekâleten arz ve talep ederiz.`)
  ekle()
  ekle(`                                                      DAVACI RAY SİGORTA A.Ş. VEKİLİ`)
  ekle(`                                                      ${g.vekilAd || Y('vekil')}`)

  return L.join('\n')
}
