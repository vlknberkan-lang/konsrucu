# Dilekçe çalışma alanı — sürelerin kapsamı

İnceleme tarihi: 21 Eylül 2026.

## Prototipin yaptığı iş

`lib/konsrucu/dilekce-sureler.ts`, seçili dosyanın mevcut görev, önemli olay ve takvim tarihlerini tek sırada gösterilecek biçime getirir. Hukuki süre hesaplamaz, yeni tarih üretmez, veritabanına yazmaz. Çağıran Server Component, oturum ve aktif `musteriId` kapsamında sorgu yapmalıdır.

| Kayıt | Kullanılan alan | Gösterim |
| --- | --- | --- |
| `Etkinlik` | `baslar`, `tur`, `durum` | `PLANLANDI` kayıtları; hatırlatma türünde “Hatırlatma tarihi”, diğerlerinde “Kayıtlı tarih” |
| `TakipGorevi` | `sonTarih`, `baslik`, `aciklama`, `durum` | Açık/işlemde işler; haciz isteme görevinde “Hatırlatma tarihi” |
| `OnemliOlay` | `sonTarih`, `baslik`, `durum`, `kaynakOlayId`, `kaynakBelgeId` | Açık/işlemde olaylar; bağlı kaynak yoksa kontrol işareti |
| `RucuDosyasi` | `uyapSenkronAt`, `uyapEslesme` | Aktarım yok/eski/yakın zamanda veya eşleşme sorunu |

Tarih durumları İstanbul takvim günüyle hesaplanır: gecikmiş, bugün, tarih eksik, gelecek 7 gün, daha sonrası. Bu sırayla listelenir. Geçmiş kayıt tarihi, bir hukuki sürenin kaçırıldığının ispatı değildir. 24 saatlik UYAP güncellik eşiği operasyonel tercihtir; kanuni süre veya eksiksiz aktarım garantisi değildir. Arka planda UYAP bağlantısı kurmaz.

**Mevcut haciz görevine dikkat:** `teblig-gorev.ts` içinde görev `sonTarih` alanı, başlıkta yazan tarihten 30 gün önceki hatırlatma tarihidir. Bu alan “kesin son gün” diye gösterilmez. Eski hesabın veya başlıktaki hukuki sonucun doğruluğu bu modülle teyit edilmiş olmaz.

`Etkinlik` ve `TakipGorevi` şemasında resmî evrakla yapılandırılmış kaynak ilişkisi yoktur; bu nedenle `kaynakEksik=true` döner. Bu, dosyada hiç belge olmadığı anlamına gelmez. Önemli olayda kaynak bağlantısının bulunması da belgenin hukuki incelemesinin yapıldığı anlamına gelmez. Tamamlanmış/iptal işler ve planlandı dışındaki etkinlikler aktif kuyrukta gösterilmez; bunların geçmişi dosya ve takvim ekranlarında kalır.

## Resmî kaynaklarla kontrol edilen temel

- HMK 90–93: Süreyi kanun veya hâkim belirler; başlangıç tebliğ veya kanunun öngördüğü tefhimdir. Gün hesabında başlangıç günü dışarıda kalır; hafta/ay/yıl hesabında karşılık gelen gün esastır. Resmî tatiller aradaki süreye dahildir; son günün tatile rastlaması ayrıca değerlendirilir. [Adalet Bakanlığı HMK metni](https://magdur.adalet.gov.tr/Resimler/Dokuman/231020201335231.5.6100.pdf).
- HMK 127: Yazılı yargılama için cevap süresinin genel kuralı iki haftadır. İstisnai ek süre, süresinde başvuru ve mahkeme kararına bağlıdır; talep edilmesi otomatik uzatma sayılmaz. 2020 değişikliği ek sürenin başlangıcını açıklar. [7251 sayılı Kanun, m.12 — Resmî Gazete](https://resmigazete.gov.tr/eskiler/2020/07/20200728-14.htm).
- 7201 m.7/a: UETS'ye ulaşma tarihi ile hukuken tebliğ edilmiş sayılma tarihi farklıdır; tebliğ, ulaşmayı izleyen beşinci günün sonunda gerçekleşmiş sayılır. Okunma/indirilmeyle veya eklentinin senkron tarihiyle özdeşleştirilmez. [TBMM, 7101 sayılı Kanun m.48 ile düzenlenen m.7/a](https://cdn.tbmm.gov.tr/KKBSPublicFile/D26/Y3/T1/KanunMetni/aeb398cd-526f-4aa4-a6e7-cf836c9016ef.html).
- Adli tatilin etkisi için dava/işin kapsamı ayrıca belirlenmelidir (HMK 102–104). Her dosyaya tek tarih uzatma kuralı uygulanamaz. [Adalet Bakanlığı HMK metni](https://magdur.adalet.gov.tr/Resimler/Dokuman/231020201335231.5.6100.pdf).

Ana Mevzuat Bilgi Sistemi PDF bağlantıları araştırma sırasında 502 döndürdüğü için erişilebilir resmî Bakanlık metni ve Resmî Gazete/TBMM değişiklik kanunları kullanıldı. Bunlar sınırlı bir mevzuat temelidir; tüm güncel değişikliklerin eksiksiz denetimi değildir.

## Sonraki aşamada gerekenler

Gerçek hesaplayıcıdan önce ayrı kayıt gerekir: yargı kolu/usul, işlem türü, uygulanan madde ve sürüm, ilgili taraf, kaynak evrak, UETS ulaşma tarihi, tebliğ/tefhim tarihi, hâkimin verdiği süre, ek süre kararı, adli tatil kapsamı, doğrulanmış resmî tatil takvimi ve avukat teyidi. Yapay zekânın tahmini doğrudan kesin son tarih alanına yazılmamalıdır.

İlk hesaplayıcı yalnız açıkça seçilen HMK kapsamındaki bir işlemle sınırlandırılabilir. Kaynak ve başlangıç teyidi, tatil/ek süre testleri tamamlanmadan “Türkiye hukuk sisteminin tüm sürelerini otomatik takip eder” ifadesi kullanılmamalıdır. Mevcut prototipte bu hesaplayıcı yoktur.
