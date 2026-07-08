# Chrome Web Store Yayını — Rücu Takip UYAP Senkron (UNLISTED)

**Amaç:** eklentiyi Web Store'a **listelenmemiş (unlisted)** yayımlamak → otomatik güncelleme +
kolay kurulum (link ile), aramada görünmez, rakiplere kapalı. Kaynak: `extension/` (v1.7.0).

> Kod hazırlığı (bu repo) TAMAM. Aşağıdaki adımlar **senin Google hesabınla** yapılır (ben yapamam):
> hesap açma + $5 + ekran görüntüsü + son "Gönder".

---

## 0. Zip'i üret
```
cd extension && zip -r ../uyap-eklenti-store-v1.7.0.zip . -x '*.bak' -x '*/.*'
```
(Manifest zip'in KÖKÜNDE olmalı — bu komut öyle üretir.)

## 1. Geliştirici hesabı (tek seferlik)
- https://chrome.google.com/webstore/devconsole → Google hesabıyla gir.
- **$5 tek seferlik** kayıt ücretini öde.
- Tercihen kişisel değil, **büroya ait bir Google hesabı** kullan (devir kolaylığı).

## 2. Yeni öğe + zip yükle
- "New Item" → `uyap-eklenti-store-v1.7.0.zip` yükle.

## 3. Store listing (hazır metinler)
- **İsim:** `Rücu Takip — UYAP Senkron`
- **Özet (summary, ≤132):**
  `UYAP Avukat Portalındaki rücu icra dosyalarını okur ve Rücu Takip programına otomatik senkronlar.`
- **Açıklama (description):**
  ```
  Bu eklenti, bir hukuk bürosunun UYAP Avukat Portalında AÇIK oturumda görüntülediği sigorta rücu / icra
  takip dosyalarını okur ve büronun kendi Rücu Takip programına (konsrucu.vercel.app) senkronlar:
  • Dosya durumu ve safahatı, işlemler
  • Finansal döküm (asıl alacak, işlemiş faiz, tahsilat, bakiye)
  • Ödeme İşlemlerim'den harç/masraf kalemleri (mükerrer atlanır)
  • Dosyaya ekli evrakın programa aktarımı
  Ayrıca "Takip Aç Kopilotu" ile takibe hazır dosyanın tevzi formunu doldurur ve harç provası yapar;
  nihai gönderim YALNIZCA avukatın açık onayıyla gerçekleşir (tek yazma işlemi budur). Diğer her şey
  salt-okumadır. İç kullanıma yönelik, büroya özel senkron anahtarıyla çalışan bir araçtır.
  ```
- **Kategori:** Workflow & Planning (veya Productivity)
- **Dil:** Türkçe
- **Gizlilik politikası URL'si:** `https://konsrucu.vercel.app/gizlilik`  ← (bu repoda eklendi, deploy sonrası canlı)
- **Ekran görüntüleri (zorunlu, en az 1 · 1280×800 veya 640×400):**
  1. Panel açıkken UYAP dosya listesi + senkron sonucu
  2. Program (konsrucu) dosya kartında senkronlanan finansal/evrak
  3. (ops.) Takip Aç Kopilotu harç provası ekranı
  *Not: ekran görüntülerinde gerçek TCKN/isim BULANIKLAŞTIR.*

## 4. Privacy / Permissions beyanı (dashboard "Privacy practices")
- **Single purpose:**
  `UYAP Avukat Portalındaki rücu/icra dosyalarını okuyup büronun Rücu Takip programına senkronlamak.`
- **İzin gerekçeleri:**
  - `storage` — program adresi + senkron anahtarını saklamak.
  - `alarms` — açık UYAP sekmesi varken 30 dk'da bir senkronu tetiklemek.
  - `downloads` — tevzi sonrası dayanak paketini (.zip) programdan indirmek.
  - `host: *.uyap.gov.tr` — dosya verisini okumak (tek veri kaynağı).
  - `host: konsrucu.vercel.app` — okunan veriyi programa iletmek.
- **Uzaktan kod (remote code):** HAYIR (tüm JS pakette gömülü).
- **Veri kullanımı:** Kişisel/hukuki veri işlenir; **satılmaz/paylaşılmaz**, yalnız büronun kendi
  sunucusuna iletilir. "Data is not sold to third parties" + "not used for purposes unrelated to
  the item's core functionality" kutularını işaretle.

## 5. Görünürlük → UNLISTED
- Visibility: **Unlisted** seç. (Public YAPMA — devlet portalı otomasyonu + PII; ayrıca rakiplere açılır.)
- "Gönder for review" → inceleme genelde **birkaç iş günü**.

## 6. Yayından sonra
- Onaylanınca **kurulum linki** oluşur → ekip + adanmış makineye tek tıkla kurulur, **otomatik güncellenir**.
- Yeni sürüm: `manifest.json` içinde `version` bump → yeni zip → dashboard'dan yükle → tekrar review.
- Eski **load-unpacked** akışı (Program → Chrome Eklentisi sayfası) yedek olarak durabilir.

---

## İnceleme riskini azaltmak (opsiyonel, sonra)
- `interceptor.js` + "Keşif Kaydı" (tüm ağ trafiğini kaydeden) özelliği keşif amaçlıydı ve iş bitti.
  Yayın build'inden çıkarmak review'da "veri toplama" şüphesini + yüzeyi azaltır. **Şimdilik korundu**
  (query motoruyla bağı riskli; ayrı bir sadeleştirme turu ister). Reddedilirse ilk bakılacak yer burası.
- **Workspace alternatifi:** Büronun Google Workspace'i varsa Admin Console → "force-install" ile
  daha hafif inceleme + merkezî zorunlu kurulum (unlisted'a göre daha kontrollü).
