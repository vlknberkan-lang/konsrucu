# Rücu Takip — UYAP Senkron (Chrome eklentisi kaynağı)

Bu klasör, UYAP senkron eklentisinin **sürüm-kontrollü kaynağıdır** (artık sadece dağıtım zip'i değil).
API'siyle (`app/api/uyap/*`) aynı repoda durur, birlikte evrilir.

## Dosyalar
- `manifest.json` — MV3, **store-temiz**: yalnız `*.uyap.gov.tr` + `konsrucu.vercel.app` (localhost YOK), ikonlar tanımlı.
- `background.js` — ikon toggle · program API köprüsü (Bearer, çoklu tenant anahtarı) · 30 dk alarm poll · tevzi paketi indirme.
- `siniflandir.js` — **olay sınıflandırıcı (saf fonksiyonlar)**: UYAP evrak/safahat/durum metni → takip olayı.
  DOM/ağ yok; `globalThis.KonsSiniflandir` olarak yayınlanır, manifest'te `content.js`'ten **önce** yüklenir.
  Test: `tests/eklenti-siniflandir.test.ts` (fs + vm ile yükler) → `npx vitest run tests/eklenti-siniflandir.test.ts`.
- `content.js` — sorgu motoru + (icra dairesi + esas no) eşleştirme + evrak yükleme + mini panel + Takip Aç Kopilotu.
- `interceptor.js` — MAIN world; UYAP SPA ağ yanıtlarını okumak için.
- `icons/` — 16/48/128 (store 128px zorunlu). *Placeholder — KonsRücü markasıyla değiştirilebilir.*

## Kurulum (geliştirici / load-unpacked)
`chrome://extensions` → Geliştirici modu → **Paketlenmemiş yükle** → bu `extension/` klasörünü seç.
Panel ⚙ → program adresi + senkron anahtarı (Ayarlar → UYAP Eklenti Senkron Anahtarı'ndan).

> **Yerel dev notu:** manifest'te `localhost` host izni YOK (store gereği). Eklentiyi yerel
> `localhost:3000` backend'e bağlamak istersen, `host_permissions`'a geçici olarak
> `"http://localhost:3000/*"` ekle (store'a giden pakete EKLEME).

## Chrome Web Store zip'i üretme
Manifest zip'in **kökünde** olmalı (alt klasör değil):
```
cd extension && zip -r ../uyap-eklenti-store-v1.7.0.zip . -x '*.bak' -x '*/.*'
```
Bu zip'i Web Store Developer Dashboard'a yükle. Yayın rehberi: `docs/eklenti-store-yayin.md`.

## Sürüm
- **1.9.0** — olay sınıflandırması düzeltildi (denetim B24 · docs/04 K1 · Faz 1 inceleme), `siniflandir.js`'e taşındı ve testlendi:
  - **Türkçe "İ" hatası:** eski kod `toLowerCase()` kullanıyordu; `"İ"` → `"i̇"` (i + birleşik nokta) olduğu için
    "Borca İtiraz Talebi", "Takibe İtiraz", "TAKİP KESİNLEŞTİ" hiçbir desene takılmıyordu. Artık tüm desenler
    `trNorm` (tr-TR küçük harf + birleşik işaret temizliği + ı→i) çıktısında aranır.
  - **ITIRAZ beyaz listesi:** "İ" düzeltmesi çıplak `/itiraz/`'ın kapsamını genişletti. ITIRAZ artık YALNIZ borca /
    ödeme emrine / takibe / imzaya / yetkiye / faize itiraz ve itiraz dilekçesi için gider. Sıra: itirazın yokluğu
    ("itirazsız kesinleşme", "itiraz edilmeksizin kesinleşti" → KESINLESTI ya da olay yok) → feragat / geri alma →
    itirazın alacaklıya tebliği / muhtıra → itiraz sonrası (kaldırılması/iptali/reddi) → borca itiraz → başka nitelikte
    itiraz (icra emri, kıymet takdiri, sıra cetveli, hacze, ihbarnameye, bilirkişi raporuna…) → türü belirsiz.
  - **KESINLESTI daraltıldı:** yalnız "kesinleşme bilgisi kaydedildi/güncellendi", kesinleşme şerhi, "takip kesinleşti /
    kesinleşmiştir", itirazsız kesinleşme. Kesinleştirme TALEBİ, kesinleşme SİLME/İPTAL ve türü belirsiz metin DURUM.
  - **İtiraz durum metninden:** UYAP durumu "Açık (durdurulmuş : Takibe İtiraz)" ITIRAZ sinyali verir (docs/05). Tarihli
    itiraz olayı yoksa tarih **ödeme emri tebliği, yoksa takip açılışıdır** — itirazdan önce olamaz (alt sınır, B01),
    her turda değişmez. Açıklama "itiraz tarihi bilinmiyor — UYAP'tan bakın" der; sunucu bu olayı dosya başına bir kez
    yazar (`takip-olay.ts ASAMA_ITIRAZ_ONEK`). Eskiden son safahat/evrak tarihi kullanılıyordu (kayan, gerçekten geç tarih).
  - **TAHSILAT değil:** "Ödeme İcra Emri" / ödeme emri düzenlenmesi, harç, masraf, tahsil harcı, vekâlet pulu, gider avansı
    makbuzları. TAHSILAT yalnız metin **açıkça borçlu ödemesini** gösteriyorsa. Yalın "Tahsilat/Reddiyat Makbuzu" ve
    "haricen tahsil" etiketli DURUM (kaynak belirsiz); "Borçlu Ödeme Taahhüdü" TAAHHÜT (İİK 111) etiketli DURUM.
  - **TEBLIG değil:** tebligat talebi, gönderimi, zarf, "Kapalı Tebligat" (giden evrak). TEBLIG = mazbata (e-tebliğ
    mazbatası dahil) ya da "tebliğ edildi". **Ödeme emri dışı evrakın tebliği** (icra emri, 103 davetiyesi, kıymet
    takdiri, satış/ihale, muhtıra, karar, 89/1-2-3) DURUM — İİK 78'i başlatmaz. TEBLIG olayının tarihi önce **tebliğ
    tarihi**, sonra evrak tarihi (K3). TK 21/35 ifadesi ("muhtara teslim", "kapıya yapıştırıldı") olumsuz ifadeden üstün.
  - **İADE:** "bila tebliğ", "tebliğ edilemedi", tebligat bağlamında "iade" (harç/masraf iadesi ve "iadeli taahhütlü" hariç).
    Dosyanın yapısal tebliğ tarihi (`Tebliğ (UYAP)` olayı) yalnız TEBLIG sınıflanan evrakın tarihinden seçilir.
  - **Haciz türü:** "dosya alacağına haciz" (yönü belirsiz — müvekkil aleyhine olabilir), ihtiyati haciz ve haciz
    kaldırma/fek ayrılır (DURUM); borçlu malı işaretli hacizler HACIZ + "borçlu malına haciz"; ayırt edilemeyen HACIZ +
    "haciz türü belirsiz". "Haczi/haczin" çekimleri de yakalanır.
  - Panel başlığındaki sürüm artık manifest'ten okunur; 🧪 Tanı sınıflandırıcının yüklendiğini gösterir. `siniflandir.js`
    yüklenmezse hiç olay gönderilmez (testte `content.js` çalıştırılarak kilitli).
- 1.8.0 — ad "KonsLaw — UYAP Senkron", varsayılan sunucu `konslaw.app`.
- **1.7.0** — store'a hazır: ikonlar eklendi, `localhost` izni kaldırıldı, gizlilik politikası (`/gizlilik`).
- 1.6.0 — tevzi sonrası dayanak klasörü otomatik iner (`downloads`).
- 1.5.0 — Takip Aç Kopilotu (Faz 2, canlı).

## Sunucu tarafı (eklenti 1.9.0 notu)
Sunucu (`app/api/uyap/senkron/route.ts` → `lib/konsrucu/takip-olay.ts` `OLAY_TIPLERI`) bugün yalnız
`TEBLIG · ITIRAZ · KESINLESTI · TAHSILAT · HACIZ · KAPANDI · DURUM` tanıyor. Bu yüzden eklenti yeni ayrımları
**DURUM** olarak gönderir (durum ilerletmez, süre görevi açıp kapatmaz; UYAP kaynaklı DURUM Önemli Olay açmaz —
`takip-olay.ts onemliOlayAdayiMi`) ve ayrımı açıklamanın başındaki etiketle yazar (tam metinler `siniflandir.js ETIKET`):

| İç tip (eklenti) | Sunucuya giden | Açıklama etiketi (başı) |
|---|---|---|
| `IADE` | `DURUM` | `İADE (tebligat iade / bila tebliğ — tebliğ sayılmadı)` |
| `TEBLIG_DIGER` | `DURUM` | `TEBLİĞ — ÖDEME EMRİ DIŞI EVRAK (İİK 78 süresini başlatmaz sayıldı …)` |
| `HACIZ_DOSYA_ALACAGI` | `DURUM` | `DOSYA ALACAĞINA HACİZ (yönü belirsiz, müvekkil aleyhine olabilir …)` |
| `HACIZ_IHTIYATI` | `DURUM` | `İHTİYATİ HACİZ (kesinleşme sayılmadı)` |
| `HACIZ_KALDIRMA` | `DURUM` | `HACİZ KALDIRMA / FEK (haciz sayılmadı)` |
| `ITIRAZ_SONRASI` | `DURUM` | `İTİRAZ SONRASI İŞLEM (ITIRAZ olayı sayılmadı)` |
| `ITIRAZ_TEBLIGI` | `DURUM` | `İTİRAZIN ALACAKLIYA TEBLİĞİ / MUHTIRA (İİK 67 süresi buradan işleyebilir …)` |
| `ITIRAZ_FERAGAT` | `DURUM` | `İTİRAZDAN FERAGAT / GERİ ALMA (itiraz sayılmadı …)` |
| `ITIRAZ_DIGER` | `DURUM` | `İTİRAZ — TÜRÜ BELİRSİZ (takibe/ödeme emrine yönelik sayılmadı …)` |
| `KESINLESME_TALEBI` | `DURUM` | `KESİNLEŞTİRME TALEBİ (kesinleşme sayılmadı)` |
| `KESINLESME_SILINDI` | `DURUM` | `KESİNLEŞME SİLİNDİ / İPTAL — avukat baksın` |
| `KESINLESME_BELIRSIZ` | `DURUM` | `KESİNLEŞME — TÜRÜ BELİRSİZ (kesinleşme sayılmadı …)` |
| `TAHSILAT_BELIRSIZ` | `DURUM` | `TAHSİLAT / REDDİYAT (kaynak belirsiz …)` |
| `TAAHHUT` | `DURUM` | `TAAHHÜT (İİK 111 — tahsilat sayılmadı …)` |

Sunucuda aynı turda yapılanlar (Faz 1): UYAP kaynaklı TEBLIG metin süzgeci (`gercekTebligMi` — eklentiyle aynı TK 21/35
ve "iadeli taahhütlü" kuralı, testte çapraz kilitli; elle girilen tebliğ her zaman gerçek), KESINLESTI "gerçek kayıt"
süzgeci (talep/silme sayılmaz), İİK 78 görevinin itirazda İPTAL EDİLMEMESİ (not düşülür) ve "en erken tebliğ" kuralı.

Faz 2'ye bırakılanlar:
1. `OLAY_TIPLERI`'ne `IADE` (ve gerekirse dosya alacağına haciz / ihtiyati haciz tipleri) eklenmeli; sonra eklentide
   `siniflandir.js` → `SUNUCU_TIPLERI` güncellenir. Geçmiş DURUM kayıtları açıklama etiketiyle bulunup taşınabilir.
2. **Eski yanlış kayıtlar kendiliğinden silinmez:** 1.9.0 öncesi senkronların yazdığı yanlış TEBLIG (talep/zarf/İADE),
   TAHSILAT (ödeme emri/harç/masraf) ve HACIZ (dosya alacağına haciz) olayları ile bunların ilerlettiği dosya durumları
   (ör. D1'in KESİNLEŞTİ'si) ve açtığı/kapattığı süre görevleri yerinde durur — temizlik sunucu tarafı işi
   (bkz. `rucu-hukuk-asistani/docs/08`).
3. **Tek seferlik mükerrer satır:** sunucu tekrarı `tip + tarih + açıklama` ile eler. Açıklaması ya da tarihi değişen
   olaylar (HACIZ'a eklenen tür notu, DURUM'a katlanan yeni olaylar, tarihi artık tebliğ tarihinden alınan TEBLIG'ler)
   1.9.0'ın ilk turunda **bir kez** yeni satır olarak yazılır. İİK 78 görevi "en erken tebliğ" kuralıyla korunur.
4. **Evrak listesi yalnız 1. sayfa** (`list_dosya_evraklar.ajx`, `pageNumber: 1`). Uzun dosyada eski itiraz/tebliğ evrakı
   listeye girmeyebilir; sayfalama keşif kaydıyla doğrulanıp ayrı iş olarak eklenmeli.
5. **E-tebligat:** tebliğ, adrese ulaşmayı izleyen 5. günün sonunda yapılmış sayılır (TK 7/a — teyit gerekli). UYAP'ın
   "ulaşma" ve "okunma" alanlarının adları keşifle öğrenilmeden `ulaşma + 5 gün` ile okunmanın erkeni kurulamıyor.
