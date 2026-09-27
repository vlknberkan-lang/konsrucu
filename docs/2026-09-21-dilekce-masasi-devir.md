# Dilekçe masası — geliştirme devri

## Kullanıcının asıl hedefi

Berkan'ın eşi dosyanın eski evraklarına dönerek dilekçe hazırlarken çok zaman kaybediyor. İcra takibi açma merkezli giriş zor geliyor. İstenen yön: dosyayı bul → geçmişini ve UYAP evrakını incele → uygun dilekçe taslağını oluştur → arayüzde düzenle → açık işleri ve süreleri takip et. Mevcut Chrome eklentisi ve veriler korunacak. Bu çalışma, kalan Codex kullanımını gözeterek sonraki modele devredilebilen ilk çalışan prototiptir.

## Hazır olanlar

- `/dilekceler`: kimliği doğrulanmış kullanıcının aktif müvekkili kapsamındaki dosya araması ve çalışma alanı. İcra takibi veya dava aşaması açılmış olması şart değil.
- Müvekkil seçimi sonrası yeni başlangıç `/dilekceler`. Menü ve komut paleti de bu alana giriş sağlar.
- Geçmiş: aşamalar, UYAP/dosya olayları ve büro notları; evrak önizlemesi ve kayıtlı özet.
- Dava, cevap, beyan ve bilirkişi raporuna itiraz taslakları. Dilekçe üretimine seçili evrakların okunabilir metinleri, kayıtlı taraflar ve dosya geçmişi sunucudan gider.
- Her üretim yeni `UretilenCikti(DILEKCE, TASLAK)` kaydı açar. Eski taslağın üzerine yazmaz. Gerçekten kullanılan belgeler `CiktiKaynak` ile bağlanır.
- Düzenleme, taslak kaydetme, incelemeye hazır işareti, kopyalama ve mevcut Word çıktı servisi.
- Eşzamanlı düzenlemede beklenen eski içerikle atomik karşılaştırma; çakışırsa diğer avukatın metni ezilmez. Gönderildi olarak kayıtlı dilekçeler değiştirilemez.
- Kaydedilmemiş metin için bağlantı/arama/sekme kapama uyarıları; Geri/İleri geçişi için yalnız RAM'de dosya bazlı kurtarma. Sayfa yenilenip çıkış uyarısı kabul edilirse bu geçici kopya kaybolur. Kalıcı tarayıcı depolamasına hukuki metin yazılmaz.
- Mevcut açık görev, takvim ve önemli olay tarihleri birlikte görünür. Tarihsiz kayıtlar gizlenmez. UYAP aktarımın olmadığı/eski kaldığı/eşleşmediği durumlar işaretlenir.
- `/tanitim/dilekce-masasi`: kimlik gerektirmeyen, yalnız kurgusal sabit verilerle çalışan etkileşimli önizleme. AI çağırmaz, DB'ye yazmaz. Örnek üretim mevcut metni kopyalar; gerçek AI üretimi gibi sunulmamalıdır.

## Dosya haritası

| Dosya | Sorumluluk |
| --- | --- |
| `app/(app)/dilekceler/page.tsx` | Aktif kullanıcı/müvekkil kontrolü, kapsamlı veri okuma ve masa verisine dönüştürme |
| `app/(app)/dilekceler/actions.ts` | Üretim, yeni kayıt ve çakışma korumalı düzenleme |
| `components/dilekceler/dilekce-masasi.tsx` | Dosya seçimi, geçmiş, evrak, süreler ve editör düzeni |
| `components/dilekceler/dilekce-editor.tsx` | Taslak oluşturma/düzenleme/kaydetme/indirme |
| `lib/konsrucu/dilekce-calisma.ts` | Türler, Zod şemaları, sınırlı kaynak bağlamı, üretim talimatı |
| `lib/konsrucu/dilekce-masa-types.ts` | Görünüm için gereken sınırlı veri tipleri |
| `lib/konsrucu/dilekce-sureler.ts` | Kayıtlı iş tarihlerini sıralama ve UYAP aktarım durumu |
| `docs/dilekce-sureleri-kapsam.md` | Süre gösteriminin sınırları ve incelenmiş resmî kaynaklar |
| `app/tanitim/dilekce-masasi/page.tsx` | Kamuya açık, kişisel veri içermeyen örnek senaryo |

## Bilinmesi gereken sınırlar

**Hukuki süre hesap motoru henüz yok.** Gösterilen tarihler mevcut kayıtlardır. `TakipGorevi.sonTarih` bazen gerçek son gün değil, erken hatırlatma tarihidir. Özellikle haciz isteme görevinde bunun etiketi ayrıdır. Bu prototip “tüm Türk hukuk sürelerini otomatik hesaplar” diye anlatılmamalı.

**UYAP eklentisi bu çalışmada değiştirilmedi.** Mevcut belgelerde eşleştirme `icraDairesi + icraDosyaNo` üzerine kurulu. Dava ekranlarından doğrudan hukuk mahkemesi/esas numarasıyla evrak aktarımının çalıştığı doğrulanmadı. Yeni masanın icradan bağımsız açılması, eklentinin tüm dava türlerini desteklediği anlamına gelmez. Bu önemli ikinci adımdır.

**AI gerçek dosyada çalıştırılmadı.** Model mevcut `ai-util` / kredi sayacı üzerinden sunucu tarafında çağrılır. Ürün içindeki Anthropic API maliyeti, geliştirmede kullanılan Codex/5.3 kotasından ayrıdır. Bağlantı veya kredi yoksa açık hata dönmeli; düzenleme ve kayıt buna bağlı değildir.

Bağlam sınırlıdır: en fazla 150 evrak, belge başına 6.000 karakter, toplam belge metni 55.000 karakter, geçmiş için 18.000 karakter. Geçmiş ve önceki dilekçe sayıları da sınırlıdır. Kısaltma/okunamayan evrak uyarıları üretim sonucunda gösterilir. Tüm evrakların tamamının okunduğu iddia edilmemeli. Kaynak sayfası son 150 evrağı, son 40 geçmiş kaydını, son 30 dilekçeyi gösterir; dosya araması son 60 eşleşmeyle sınırlıdır.

Mevzuat ve emsal referansları asıl kaynak belgesi bulunmadığında yer tutucu kalır. AI olgusal doğruluğu garanti etmez. Önceki taslaklar doğrulanmış gerçek kabul edilmez. Tür, temsil edilen taraf ve hukuki talepler avukat tarafından kontrol edilir. Üretim otomatik gönderim veya e-imza yapmaz.

## Sıradaki işler — küçük adımlarla

1. **Gerçek kullanım kabulü:** Eşinin seçtiği tek dosyada (onun incelemesiyle) kaynakların yeterliliğini ve dilekçenin taleplerini kontrol et. Uzun geçmişte hangi evrakların önce gerektiğini belirle. Üretim kalitesini bu örnekle ölç; arayüzü yeniden yazma.
2. **Dava dosyasını doğrudan alma:** Eklentinin mevcut sorgu ve eşleştirmesini incele. Hukuk mahkemesi + esas no + taraf doğrulamasıyla, icra takibi gerektirmeyen ayrı veri alma yolunu ekle. Başka müvekkilin dosyasını yanlış bağlamama ve tekrarlı evrak oluşturmama testleri zorunlu. UYAP oturumunu veya CAPTCHA'yı otomatik aşmaya çalışma.
3. **Kaynaklı süre kaydı:** İş türü/usul/yargı kolu, ilgili taraf, kaynak tebligat, UETS ulaşma tarihi, tebliğ/tefhim tarihi, hâkimin süresi, ek süre kararı, mevzuat sürümü ve avukat teyidini yapılandırılmış additive alanlarla kaydet. Mevcut otomasyonun tarihlerine körü körüne güvenme.
4. **Dar hukuk hesaplayıcısı:** Önce avukatla tek işlem türü seç. Güncel resmî mevzuat ile tatil/uzatma/adli tatil ve usul ayrımlarını doğrula. İlk sonuç “hesap önerisi” olsun; dayanak ve başlangıç tarihi onaylanmadan kesinleşmesin. UETS ulaşma, okunma, indirme ve hukuken tebliğ sayılma tarihlerini karıştırma.
5. **Süre takibi ve bildirim:** Onaylanan süreyi mevcut iş/takvim hatırlatma altyapısına bağla; mükerrer kayıt/bildirim üretme. Bildirim teslim ve başarısızlıklarını görünür tut. Bu adımın gerçekten çalıştığı uçtan uca kanıtlanmadan süre garantisi verme.
6. **Üretim iyileştirmeleri:** Tür/talimat/kullanılan kaynak sürümü ve kalıcı kontrol uyarıları için çıktı meta verisi ekle; kanıtlanabilir bölüm atıfları ve uzun evraklar için amaçlı kaynak seçimi geliştir. Kaynak bağlarını eskiden üretilmiş dilekçelerle karşılaştırma ekranına bağla.

## Çalıştırma ve doğrulama

Yerel önizleme: `npm run dev -- --port 3002`, ardından `http://localhost:3002/tanitim/dilekce-masasi`.
Gerçek çalışma alanı: oturum açıp müvekkil seçildikten sonra `/dilekceler`.

Zorunlu kontroller: `npm run typecheck`, `npm run lint`, `npm run build`.
Hedefli testler: `npm test -- tests/dilekce-actions.test.ts tests/dilekce-calisma.test.ts tests/dilekce-sureler.test.ts tests/dilekce-kurtarma.test.ts`.
Geliştirme sunucusu ile build aynı `.next` dizinini kullanır; aynı anda çalıştırma.

21 Eylül son kontrol: 4 dosyada 25 hedefli test geçti; typecheck ve production build başarılı. Lint başarılı; değişiklik öncesi `belge-onizleme.tsx` dosyasındaki `<img>` performans uyarısı devam ediyor. Tarayıcıdaki kurgusal senaryoda metin düzenleme/kaydetme, yeni örnek taslak oluşturma ve eski düzenlenmiş taslağa dönüş doğrulandı. Dar ve geniş ekran yerleşimi gözle kontrol edildi. Gerçek oturumla AI üretimi ve gerçek veritabanı mutasyonu uçtan uca sınanmadı.

Bu çalışmada schema/migration veya canlı veri değişikliği, deploy, mail ya da UYAP gönderimi yapılmadı. Repoda önceden bulunan `.agents/`, `.claude/settings.local.json` ve `AGENTS.md` dosyaları bu işin değişikliği sayılmamalı.

## Sonraki modele verilecek kısa görev

Bu devir dosyasını ve AGENTS.md'yi oku. Dilekçe merkezli akış ve mevcut tasarım sistemi korunacak. Önce kullanıcının seçtiği tek sonraki işi uygula; tüm listeyi birden başlatma. Gerçek müşteri verisini silme, yeniden üretimde taslakları ezme, mevcut icra/Hugo/Chrome eklentisi işlevlerini bozma. Tenant ve aktif kullanıcı denetimini server tarafında koru. Canlı hukuk süre hesaplamasını hazır kabul etme. Değişikliğe uygun testlerle birlikte typecheck, lint ve build çalıştır; yapılanla henüz doğrulanmayanı ayrı raporla.
