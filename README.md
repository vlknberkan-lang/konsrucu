# KonsRücü

> Sigorta rücu dosyalarını **at → grupla → oku → dilekçe üret** zincirine bağlayan,
> maliyeti sıfıra yakın tutmak için **önce yerel/bedava katmanlarla** çalışan web uygulaması.

KonsRücü, Ray Sigorta vekili olarak yürütülen rücu sürecinin bugün elle + lokal
Word makrolarıyla yapılan kısmını web'e taşır: kullanıcı bir hasar dosyasının ham
evrak yığınını (poliçe, ekspertiz, tutanak, dekont + 100+ fotoğraf) sisteme atar;
sistem dosyaları **otomatik gruplar, sınıflandırır, içlerindeki bilgiyi çıkarır** ve
KGM / yol işletmecisi başvuru dilekçelerini imzaya hazır halde üretir.

---

## 1. Neden? — Bugünkü süreç

Şu an bir rücu dosyası şöyle işleniyor (lokalde, kullanıcının makinesinde):

1. Evrak klasörü elle okunuyor (poliçe / Lehe form / kaza tespit tutanağı / ekspertiz / dekont).
2. 100+ kaza & belge fotoğrafı elle ayıklanıp ilgili klasörlere taşınıyor.
3. Alanlar (plaka, sürücü, araç, kaza yeri/tarihi, kusur, tutar, muhatap) elle çıkarılıyor.
4. `KGM BAŞVURU - ŞABLON.docx` üzerinde **PowerShell + Word COM** ile bul-değiştir yapılıyor.
5. İki versiyon üretiliyor: **KGM Genel Müdürlüğü** + ilgili **KGM Bölge Müdürlüğü**
   (muhatap özel işletmeci ise — ICA/İçtaş/Otoyol A.Ş. — ayrı varyant).
6. Mail klasörü toplanıyor (2 dilekçe + rücu özeti + tutanak + poliçe) → **Yelda ofisine imzaya** gönderiliyor.

### Bu sürecin acıları
- **Kırılgan üretim:** Word COM, Türkçe karakterli yolda donuyor; `~$` kilit dosyası takılıyor; tek Word kaynağı seri çalışmaya zorluyor.
- **Elle okuma yükü:** Her dosyada onlarca sayfa + 100+ fotoğraf insan gözüyle taranıyor.
- **Ölçeklenmiyor:** Yüzlerce dosyalık birikmiş havuz var; manuel akış bunu kaldırmıyor.
- **Tek makineye bağımlı:** Lokal makro; ekip paylaşımı, takip, arşiv yok.

---

## 2. Temel İçgörü — "anlamak" değil çoğu zaman "ayıklamak"

Maliyeti patlatan yaklaşım, **her belgeyi/fotoğrafı görüntü olarak premium bir LLM'e
yollamaktır**. Oysa işin %80-90'ı **hiç API harcamadan**, deterministik ve yerel
araçlarla yapılır. KonsRücü'nün tasarım ilkesi: **ucuz katman önce, pahalıya ancak mecbur kalınca çık.**

```
DOSYALARI AT
     │
[0] METİN ÇIKAR        ← BEDAVA  (dijital PDF'de metin katmanı; yoksa yerel OCR)
     │
[1] KURAL + REGEX      ← BEDAVA  (plaka, poliçe/hasar/dosya no, tarih, tutar, IBAN, TC)
     │
[2] GRUPLA & ROUTE     ← BEDAVA  (EXIF tarih, kamera, boyut → belge/foto ayrımı + klasörleme)
     │
[3] SADECE BOŞ ALAN    ← KURUŞ   (kusur/oluş şekli net değilse: tek-iki sayfanın METNİNİ
        için LLM                  ucuz modele; düşük güvende premium fallback)
```

> **Kritik kural:** 100 fotoğrafı "anlamaya" çalışmıyoruz. ~2 belgeyi (ehliyet/ruhsat,
> alkol raporu) okuyup, geri kalan ~110 hasar fotoğrafını sadece **doğru klasöre taşıyoruz.**

---

## 3. Ölçülmüş Kanıt (gerçek dosya: `Hasar_Dosya_No_10202407464`)

Tasarım varsayım değil — gerçek bir dosya üzerinde ölçüldü:

| Bulgu | Sonuç |
|---|---|
| **5 PDF** (poliçe, Lehe form, ekspertiz, 2 dekont) | Hepsinde **tam metin katmanı** (poliçe ~32K, ekspertiz ~7K karakter) → **0 ₺** |
| **121 fotoğraf** | EXIF çekim tarihi **%90'ında var** (12-17 Ekim, 4 küme); GPS yok |
| **Kamera markaları** | 3 ayrı telefon (OPPO / Samsung / Apple) → **kaynak/taraf ayrımı bedava** |
| **Boyut dağılımı** | `600x450` ≈ hasar fotoğrafı; `~1250x1750` (A4) = belge taraması → **belge/foto ayrımı bedava** |
| **8 A4 belge** | İçinden: **alkol raporu** (0.00 promil), **ruhsat + ehliyet** (sürücü/sahip/TC/plaka) çıktı |
| **Toplam API maliyeti** | **≈ 0 ₺** (tamamı yerel); kusur teyidi için opsiyonel LLM → **birkaç kuruş** |

Eski "her sayfayı premium vision'a yolla" yaklaşımı bu dosya için ~$90 mertebesindeydi;
ölçülen gerçek maliyet **sıfıra yakın.**

> Not: `pdftotext` Türkçe karakterleri düşürüyor (SİGORTA→SGORTA). Üretimde **PyMuPDF (fitz)**
> kullanılacak — Unicode'u doğru çıkarıyor. Tüm yerel araçlar (PyMuPDF, pdfplumber,
> Tesseract OCR, Pillow) makinede zaten kurulu.

---

## 4. Sistem Akışı

```
┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌────────────────┐   ┌──────────────┐
│  INGEST     │ → │  GRUPLA      │ → │  ÇIKAR        │ → │  GÖZDEN GEÇİR  │ → │  ÜRET         │
│ yığını at   │   │ dosya↔kayıt  │   │ alanlar+JSON  │   │ kullanıcı teyit│   │ dilekçe+klasör│
└─────────────┘   └──────────────┘   └───────────────┘   └────────────────┘   └──────────────┘
```

1. **Ingest** — Karışık dosya yığını sürükle-bırak. Çoklu dosya tek seferde.
2. **Grupla** — Paylaşılan kimliklere (hasar no / poliçe no / plaka) göre dosyaları bir rücu kaydına bağla; fotoğrafları EXIF tarih + boyut + kameraya göre kümele.
3. **Çıkar** — Katman 0-1-2 ile alanları doldur; eksik kalanı (kusur/oluş şekli) Katman 3 ile tamamla. Çıktı: `_bilgiler.json` + her alana **güven skoru**.
4. **Gözden geçir** — Kullanıcı ekranda alanları onaylar/düzeltir. **Düşük güvenli alanlar işaretli** gelir (özellikle tutanak kusur kısmı — en kritik alan).
5. **Üret** — `docxtemplater` ile KGM Genel + Bölge (veya işletmeci) dilekçeleri; tek-sayfa margin kuralı kodda; mail klasörü zip'lenir; istenirse Yelda ofisine e-posta.

### Otomatik klasör çıktısı
```
Hasar_<no>/
  01_Poliçe/
  02_Kaza Tespit Tutanağı/
  03_Ekspertiz/
  04_Lehe-Dekont/
  05_Ehliyet-Ruhsat-Alkol/
  06_Hasar Fotoğrafları/      ← 100+ foto, EXIF tarihine göre sıralı
  07_Üretilen Dilekçeler/      ← KGM Genel + Bölge .docx/.pdf
  _bilgiler.json               ← tüm alanlar + güven skoru + kaynak izi
```

---

## 5. Mimari

konstraERP ile **aynı yığın** — kütüphaneler, desenler ve `export-word` örneği yeniden kullanılır.

| Katman | Teknoloji |
|---|---|
| Web / UI | **Next.js 14 (App Router)** + React 18 + Tailwind + Radix UI (konstraERP ile birebir) |
| Belge üretimi | **docxtemplater** + `docx` + `pizzip` (Word COM yok; sunucuda, Word'süz, paralel) |
| Auth | **Supabase** (SSR) |
| Veri | **Prisma** + Postgres (Supabase) |
| Dosya saklama | **Supabase Storage** (ham evrak + üretilen çıktı) |
| Mail | **nodemailer** (konstraERP'de mevcut) |
| **Çıkarım servisi** | **Yerel Python worker** — PyMuPDF (PDF metin), Tesseract (OCR), Pillow (EXIF), CLIP (zero-shot foto sınıflandırma) |
| LLM (yalnız Katman 3) | Anthropic SDK — varsayılan **Haiku** (ucuz, metin); düşük güvende premium fallback |

**Çıkarım neden ayrı Python worker?** PDF/EXIF/OCR/CLIP ekosistemi Python'da olgun ve
**yerel = bedava**. Next.js API → Python worker'a iş atar (HTTP/queue), sonucu DB'ye yazar.
İleride tamamen yerel LLM (Ollama) ile **API faturası sıfır** seçeneği de açık.

---

## 6. Modüller

- **Dosya Gelen Kutusu (Inbox):** Yığını at, otomatik gruplanmış rücu kayıtları olarak listele.
- **Rücu Dosyası Detayı:** Çıkarılan alanlar + güven skorları + kaynak belge önizleme + düzelt.
- **Fotoğraf Galerisi:** EXIF/kamera/boyuta göre kümelenmiş; belge ↔ hasar ayrımı; etiketle/taşı.
- **Dilekçe Üretimi:** Şablon seç (KGM Genel / Bölge / İşletmeci), önizle, üret, indir/mail.
- **Bölge Eşleştirme:** Kaza yeri → KGM Bölge Müdürlüğü tablosu (5. Bölge = Osmaniye/Adana/Mersin/Hatay/K.Maraş; 1. Bölge = İstanbul/Kocaeli; 14. Bölge = Bursa …).
- **Şirket Bilgileri / Şablon Yönetimi:** Vekil sabitleri (ad / IBAN / KEP), MERSİS, K/Partners footer, faiz cümlesi → DB `Ayarlar`'da, ekrandan düzenlenir; işletmeci varyantı.
- **Arşiv & Arama:** Çıkarılan metin üzerinde tam-metin arama (bedava); "alkollü dosyalar", "5. bölge" vb.

---

## 7. Veri Modeli (taslak)

```
RucuDosyasi
  id, hasarDosyaNo, policeNo, hukukDosyaNo, hasarTarihi, durum
  plaka, aracMarkaModel, sigortali, surucu, surucuTc, ehliyetNo
  kazaYeri, kazaTarihiSaat, istikamet, olusSekli, kusurDurumu
  asilAlacak, muhatapTipi(KGM_GENEL|KGM_BOLGE|ISLETMECI), bolge
  alkolPromil, ...  (her alan: value + confidence + sourceRef)

Belge        (RucuDosyasi 1—N)
  id, dosyaId, tip(POLICE|TUTANAK|EKSPERTIZ|DEKONT|LEHE|EHLIYET|RUHSAT|ALKOL|HASAR_FOTO|DIGER)
  storagePath, extractedText, exifDate, kamera, genislik, yukseklik, confidence

UretilenDilekce  (RucuDosyasi 1—N)
  id, dosyaId, muhatap, sablonId, storagePath, durum(TASLAK|IMZAYA_GIDEN|GONDERILDI)
```

---

## 8. Maliyet Modeli

| Kalem | Tür | Tahmin |
|---|---|---|
| Geliştirme | Tek seferlik | Yığın hazır (konstraERP desenleri) — esas iş çıkarımı güvenilir kılmak |
| Metin/alan çıkarma + foto gruplama | Tekrarlayan | **0 ₺** (yerel PyMuPDF/Tesseract/EXIF/CLIP) |
| Kusur/oluş şekli teyidi | Tekrarlayan, dosya başına | Çoğu dosya bedava; gerekirse Haiku-metin → **birkaç kuruş** |
| Depolama / Hosting / DB | Sabit | Supabase; konstraERP altyapısıyla paylaşılabilir |
| **Dosya başına toplam** | | **≈ 0 – birkaç kuruş** |
| KEP/e-tebligat (elektronik gönderim) | Opsiyonel, ileri faz | KEP hesabı + e-imza maliyeti; MVP'de yok (indir + Yelda imza) |

**Sıfır tekrarlayan maliyet seçeneği:** Haiku yerine yerel model (Ollama) → API faturası tam sıfır, karşılığı kurulum/bakım.

---

## 9. Yol Haritası

**Faz 0 — Prototip (yerel, $0):** Tek dosya klasörü üzerinde Python script: PDF metin + 8 A4 OCR + 121 foto route + `_bilgiler.json`. Kanıtı gözle gör. *(çıkışta: çalışan çıkarım hattı)*

**Faz 1 — MVP Web:** Next.js iskelet + Supabase auth/storage + ingest ekranı + çıkarım worker entegrasyonu + alan gözden geçirme + tek şablonla (KGM Genel) dilekçe üretimi + indir.

**Faz 2 — Tam üretim:** Bölge varyantı + işletmeci varyantı + mail klasörü zip + Yelda'ya e-posta + arşiv/arama.

**Faz 3 — Ölçek & otomasyon:** Toplu içe aktarma (birikmiş havuz), batch çıkarım, raporlama. (Opsiyonel) KEP/e-tebligat.

---

## 10. Açık Kararlar

- [ ] Konum: **bağımsız uygulama** mı, konstraERP içinde **modül** mü? (öneri: bağımsız, ortak kütüphaneler)
- [ ] Çıkarım worker'ı: yerel Python servis mi, konteyner mı, ileride Ollama mı?
- [ ] MVP kapsamı: "üret + indir" mi, "Yelda'ya mail" e kadar mı?
- [ ] Marka adı `KonsRücü` kalsın mı; klasör ASCII `konsrucu` onaylandı mı?

---

## 11. Sözlük

- **Rücu:** Sigortacının ödediği tazminatı kusurlu tarafa/sorumluya rücuen tahsil etmesi (halefiyet).
- **Muhatap:** Başvurunun yapıldığı kurum — KGM Genel/Bölge Müdürlüğü veya özel yol işletmecisi.
- **Lehe Form:** Hasar dosya no / tarih / tutar / zamanaşımı içeren sigortacı formu.
- **Ekspertiz raporu:** Hasarın oluş şekli ve tutarını tespit eden rapor (kusur metni çoğu kez burada).
- **KGM:** Karayolları Genel Müdürlüğü. **Bölge:** kaza yerinin bağlı olduğu KGM bölge müdürlüğü.
```
