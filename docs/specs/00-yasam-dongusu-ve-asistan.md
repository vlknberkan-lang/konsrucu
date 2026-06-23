# Spec 00 — Yaşam Döngüsü & Asistan (Yelda'nın Masası)

> KonsRücü = Yelda'nın aynı anda yüzlerce dosyada **icra → tebliğ → itiraz → arabuluculuk → dava** sürecini
> yürüten **asistanı**: takip eder, hatırlatır, "sıradaki adımı" önerir, telefon çaldığında her şeyi önüne koyar.
> Hiçbir süre kaçmaz. Tek `RucuDosyasi`, üstünde biriken **Aşamalar** ([01](01-asama-veri-modeli.md)) + **Takvim** + **Bildirim**.

## Beş aşamalı akış (kullanıcı senaryosu → sistem davranışı)

### 1) İçe aktarım → AI çıkarım → İcra takibi aç
- Hugo Excel → dosyalar HAVUZDA → "Hugo'dan çek" → evrak iner → **AI çıkarım** (borçlu/tutar/kusur/yetkili icra → `cikarimJson`).
- **AI gelişimi (backlog):** çok-belge füzyonu, güven skoru, eksik-alan tespiti + "neyi teyit et" önerisi, çelişki yakalama (ör. tekrar eden TCKN).
- Hazır olunca → **UYAP e-Takip XML** üret → takip açılır → `Asama(ICRA_TAKIBI, kimlikNo=icra no)`. *(UYAP yürütme: yakın gelecek.)*

### 2) İcra izleme (her 30–60 dk poll) + PTT tebliğ + 7 gün itiraz
- **Senkron motoru:** açık icra dosyaları periyodik sorgulanır (eklenti/cron). Yeni gelişme → `TakipOlayi` + **Bildirim**.
- **Yeni dosya akışı:** UYAP'ta beliren yeni dosya programa düşer, AI süzgecinden geçer.
- **PTT tebliğ takibi (kritik):** ödeme emri PTT barkodu → **PTT sorgu API**'sine periyodik "teslim edildi mi" sorgusu.
  - Durum: `YOLDA → TESLIM | IADE`. Teslim olunca **itiraz son tarihi = teslim + 7 gün** otomatik hesaplanır.
  - `Etkinlik(SURE, "İtiraz süresi son günü")` + bildirim: T-3, T-1, "süre doldu → kesinleşme" .
- **Önem filtresi:** her gelişme bildirim olmaz; AI/kural "önemli mi" (tebliğ, itiraz, haciz, tahsilat, kesinleşme) süzer.

### 3) İtiraz geldi → Arabuluculuk yönlendirmesi
- Senkronda **itiraz** yakalanınca: İcra aşaması `sonuc=itiraz`; **Bildirim/Karar:** *"2026/32147'ye itiraz geldi — arabuluculuk başlatmak ister misin?"* (tek tık → `Asama(ARABULUCULUK)`).
- **Listede takip:** Dosyalar listesinde **Aşama=İtiraz** çipi + "Karar bekliyor" rozeti; Komuta Merkezi'nde "Karar bekleyenler" bloğu. Hiçbir itiraz gözden kaçmaz.

### 4) Arabuluculuk: toplantı + not + "telefon hazır"
- Arabulucu avukatımızı arar, gün verir → programda **toplantıyı vakitle** (`Etkinlik(ARABULUCULUK_TOPLANTISI)`), katılımcı/yer/online.
- **Toplantı notları** anlık alınır (toplantı kaydına bağlı). 
- **"Telefon hazır" özeti:** arabulucu/karşı taraf arayınca dosyanın TEK ekranda özeti — taraflar, tutar (asıl+faiz), kusur, son durum, aşama geçmişi, sıradaki adım. (Detayda "Arama Kartı".)
- Sonuç gir: **anlaşıldı** → tutar + `TAHSIL/KAPANDI`; **anlaşılmadı** → "Dava'ya taşı".

### 5) Anlaşılamadı → Dava + otomatik duruşma takvimi
- `Asama(DAVA)`; mahkeme + **esas no**. **Duruşma tarihleri UYAP'tan otomatik çekilir** (Hukuk/Tüketici senkron) → `Etkinlik(DURUSMA)` + bildirim.
- Karar → kesinleşme → infaz/tahsil; süreç dosyada kapanır.

## Çapraz-kesen yetenekler (her aşamada)
- **Bildirim & Karar akışı:** önemli her şey bildirim; bazıları **aksiyonlu** (arabuluculuk başlat, toplantı planla, süreyi onayla). Öncelik: kritik/uyarı/bilgi.
- **Sıradaki Adım motoru:** kurallarla dosya başına "en iyi sonraki aksiyon" (tebliğ→7 gün say; itiraz→arabuluculuk öner; anlaşılmadı→dava öner; duruşma yaklaştı→hazırlık).
- **Süre güvenliği:** zamanaşımı · itiraz (7g) · arabuluculuk son tarih · duruşma — hepsi takvim + T-3/T-1 bildirim.
- **Takvimler:** Arabuluculuk takvimi (`tür=ARABULUCULUK_TOPLANTISI`) ve Duruşma takvimi (`tür=DURUSMA`) — listeden tek tık planlama.

## Komuta Merkezi (P0 — "Yelda'nın Masası")
Tek ekranda: **Karar bekleyenler** (itiraz→arabuluculuk vb.) · **Bugün & bu hafta** (toplantı/duruşma) · **Yaklaşan süreler** (renk kodlu) · **Yeni önemli gelişmeler** (senkron) · **Aşama dağılımı** (kaç icra/arabuluculuk/dava → tıkla-filtrele). Asistanın yüzü burası.

## Entegrasyon notları (dış servisler — UYAP'sız geliştirilir, mock'la prototip)
- **PTT sorgu API:** tebliğ teslim durumu. Mock fixture ile prototip; gerçek entegrasyon ayrı.
- **UYAP senkron/eklenti:** icra + dava duruşma çekme. Beklemede; bu hatta arayüz fixture'la çalışır.
