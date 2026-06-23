# KonsRücü — Ürün Yol Haritası

## Vizyon
Sadece "rücu icra takibi açma" aracı değil; bir **dosyanın tüm yaşam döngüsünü tek yerden koordine eden**
platform: icra → itiraz → **arabuluculuk** → **dava** → karar → tahsil. Toplantılar, duruşmalar, süreler,
yazışmalar (AI yardımlı) hep buradan yürüyecek.

> Bağlam: rücu süreci icra ile bitmiyor — itiraz/arabuluculuk → dava (Tüketici/Asliye). Kaynak: hasar portalı + UYAP.

---

## İki paralel hat

### A) UYAP hattı — ⏸ BEKLEMEDE (test için UYAP başında olmak gerek)
- e-Takip XML üretici ✅ · alacaklı/vekil adres ✅ · pilot kalibrasyon (4 enum + MERNİS) 🔄
- Eklenti yürütücü (oto yükle + "İcra Takibi Başlat") ⏳ · Toplu takip açma ⏳
- **Kullanıcı UYAP başına döndüğünde devam.**

### B) UYAP'sız hat — ✅ ŞİMDİ BURADAYIZ (tasarım + program; test serbest)
Aşağıdaki fazlar UYAP gerektirmez; tamamı local'de geliştirilip doğrulanır.

---

## Faz 1 — Aşama / Süreç omurgası
Dosyaya icra-ötesi **aşama** kavramı: `İCRA · İTİRAZ · ARABULUCULUK · DAVA · KARAR · İNFAZ · TAHSİL/KAPANDI`.
- Veri: `Asama` (tür, başlangıç, durum, özet) + dosya detayında **birleşik zaman çizelgesi** (mevcut `TakipOlayi`/`Not` ile).
- Dosya Detay'a "Süreç" şeridi: nerede, sıradaki adım ne, hangi süre işliyor.
- Neden önce bu: arabuluculuk ve davanın "yaşayacağı" yer burası.

## Faz 2 — Arabuluculuk modülü
- Veri: `Arabuluculuk` (başvuru no, arabulucu ad/iletişim, taraflar, konu, sonuç: anlaşma/anlaşmama/kısmi, anlaşılan tutar, son tutanak tarihi).
- `Toplanti` (tarih-saat, yer/online, katılımcılar, gündem, sonuç notu, ertelendi/yapıldı).
- Ekran: dosyadan "Arabuluculuk başlat" → toplantı planla → sonuç gir → (anlaşmama) "Dava'ya taşı".

## Faz 3 — Takvim / Ajanda (koordinasyon kalbi)
- Tüm `Toplanti` + duruşma + **süre/deadline** (itiraz süresi, zamanaşımı, arabuluculuk son tarih) tek takvimde.
- "Bugün / bu hafta" paneli + dosya bazlı hatırlatma. Renk: geçti/yakın/ileride.
- Neden kritik: "her şey buradan koordine olacak"ın görünür çıktısı.

## Faz 4 — Dava modülü (Tüketici/Asliye)
- Veri: `Dava` (mahkeme, esas no, tür, açılış tarihi, duruşmalar=Toplanti, bilirkişi, karar, kesinleşme).
- Dosya Detay'da dava sekmesi; duruşmalar takvime düşer; karar → infaz/tahsil aşamasına bağlanır.

## Faz 5 — AI yardımlı yazışma (mail/metin)
- "Mail Taslağı" üreticisi: dosya bağlamından + amaca göre (arabulucuya bilgi, muhataba ihtar, müvekkile/Ray'e durum, KGM başvuru) **AI taslak** → kullanıcı düzenler → kopyala/gönder.
- Şablon + AI doldur (mevcut footer/açıklama deseni gibi); ton/uzunluk seçimi; ek dosya listesi önerisi.
- Sonra: KEP/e-posta entegrasyonu (ops.).

## Faz 6 — Tasarım & UX cilası (sürekli)
- Sidebar/rail sadeleştirme ✅ · Dashboard (özet + bu hafta) · Dosya Detay süreç şeridi · bildirim/uyarı merkezi.

---

## Önerilen sıra
**1 → 2 → 3** (omurga + arabuluculuk + takvim) en yüksek değer; **5 (AI mail)** bunlara paralel her an eklenebilir
(mevcut dosya verisini kullanır). **4 (dava)** arabuluculuktan sonra doğal gelir.

## Açık kararlar
- [ ] İlk modül hangisi? (arabuluculuk+takvim mi, AI mail mi, dava mı)
- [ ] Aşama: ayrı `Asama` modeli mi, `DosyaDurum` enum'unu genişletmek mi?
- [ ] Takvim: kendi içinde mi, Google/Outlook senkron mu (sonra)?
