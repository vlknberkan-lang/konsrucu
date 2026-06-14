# 01 — Modül: Akıllı Giriş

> Bir rücu hasar dosyasının **ham evrak yığınını** alır; okur, çıkarır, özetler, çapraz
> doğrular ve **dosyanın hangi yola gideceğine karar verir** (normal icra mı, idari mi).
> Karara göre seni **uyarır ve doğru ekrana yönlendirir.** Ürünün ilk ve öncelikli modülü.
> Zemin: [`00-mimari-ve-yol-haritasi.md`](00-mimari-ve-yol-haritasi.md).

---

## 1. Amaç

Akıllı Giriş **dilekçe yazan modül değildir.** Görevi:

1. Ham evraktan **Dosya kaydını** oluşturmak ve doldurmak (özet + alanlar + güven).
2. Dosyanın **yolunu belirlemek (triyaj):** klasik icra takibi mi, yoksa idareyle ilgili mi?
3. Karara göre **uyarmak ve yönlendirmek** — idariyse "dilekçe lazım" deyip dilekçe modülüne atlatmak; klasikse takip-aç bloğunu hazırlamak.

> Dilekçe üretimi **ayrı modüldür** ([`06-dilekce-uretimi.md`](00-mimari-ve-yol-haritasi.md)).
> Akıllı Giriş onu *çağırır*, içermez. Üretilen dilekçe **kaynak dosyaya geri bağlanır.**

---

## 2. Merkez Fikir — Dosya = Kalıcı Tam Kayıt

Her şey bir **Dosya**'ya yazılır ve orada kalır. Akıllı Giriş bu kaydı *doğurur*;
sonraki tüm modüller (dilekçe, izleme) aynı kaydı okur/yazar.

```
        ┌──────────────────────── DOSYA (kalıcı kayıt) ────────────────────────┐
        │  ham evrak  ·  özet+alanlar+güven  ·  YOL KARARI  ·  üretilen çıktı    │
        │  (poliçe,    (borçlu/plaka/kaza    (icra | idari)   (takip bloğu |     │
        │   foto…)      yeri/kusur/faiz)                       dilekçe — bağlı)  │
        │                          ·  güncel durum  ·  notlar/geçmiş            │
        └───────────────────────────────────────────────────────────────────────┘
```

**Senaryo (asıl değer):** Yelda 3-4 hafta sonra o dosyayla ilgili telefon alır →
dosyayı açar → **her şeyi tek ekranda görür:** ham evrak önizleme, özet, hangi yola
gittiği, yazılan dilekçe (tıkla-aç), güncel durum, kim ne zaman ne yaptı. Bu ekran =
**Dosya Detay** ([`03-dosya-detay.md`](00-mimari-ve-yol-haritasi.md)) — Akıllı Giriş onu besler.

**Çift yönlü bağ:** ham evrak ↔ üretilen dilekçe/blok birbirine linklidir. Dilekçeden
"bu hangi evraktan üretildi"ye, evraktan "bundan ne üretildi"ye gidilir.

---

## 3. Uçtan Uca Akış

```
INGEST → GRUPLA → ÇIKAR(0-2) → ASİSTAN(3) → TRİYAJ ─┬─ KLASİK İCRA → takip-aç bloğu hazırla
 yığını   dosya↔   yerel/bedava   özet +      yol      │                 (UYAP'a kopya)
 at       kayıt;   PDF/EXIF/regex  bağımsız    kararı   │
 (klasör/ foto                     teyit               └─ İDARİ (KGM/işletmeci)
  zip)    kümele                                          → ⚠ UYAR: "idareyle ilgili,
                                                            dilekçe lazım"
                                                          → DİLEKÇE EKRANINA ATLA
                                                          → dilekçeyi OTOMATİK yaz (bağlı)

         ↓↓↓ her aşamanın çıktısı anında DOSYA kaydına yazılır (kalıcı) ↓↓↓
```

| Aşama | Ne yapar | Kaynak |
|---|---|---|
| **Ingest** | Klasör/zip sürükle-bırak; çoklu dosya; kuyruk + ilerleme | kullanıcı |
| **Grupla** | Paylaşılan kimliğe (hasar no/poliçe/plaka) göre dosyaya bağla; foto EXIF+kamera+boyut kümele; A4 belge ↔ hasar foto ayrımı | Layer 2 (bedava) |
| **Çıkar 0-2** | PDF metin (PyMuPDF), regex (plaka/poliçe/hasar no/tarih/tutar/IBAN/TC), boyut/EXIF route | yerel worker (bedava) |
| **Asistan 3** | Özet ajanı tüm görselleri okur → alan+not+faiz; bağımsız teyit ajanı çapraz doğrular | Claude (sadece boşluk) |
| **TRİYAJ** | **Yol kararı:** klasik icra mı / idari mi? (§4) | kural + asistan |
| **Yönlendir** | Karara göre: takip-aç bloğu **ya da** ⚠ uyar + dilekçe modülüne atla (oto-yaz) | sistem |

> Gözden geçir (kullanıcı onayı/düzelt) her zaman araya girebilir; düşük güvenli + teyit-gerek
> alanlar işaretli gelir. Akış **durmaz**, eksik alan boş+🟨 kalır.

---

## 4. Triyaj — Yol Kararı (modülün kalbi)

Program ham evraktan dosyanın **ne tür** olduğunu belirler ve doğru yola sokar:

| Yol | Tetikleyen sinyal | Sonuç |
|---|---|---|
| **KLASİK İCRA** | Kusurlu karşı taraf/sürücü/sahip belli; ZMMS/Kasko kişi-kişi rücu | Takip-aç bloğu hazırla (alacaklı+borçlu+yetkili icra+açıklama+faiz) → durum **TAKİBE HAZIR** |
| **İDARİ** | KASKO **hizmet kusuru** (KGM/yol sorumlusu), yola düşen cisim, tek-taraflı; muhatap **kurum/işletmeci** | ⚠ **Uyar** → **dilekçe ekranına atla** → KGM Genel/Bölge (veya işletmeci) dilekçesini **oto-yaz** → durum **İDARİ YOL** |

**Uyarı + atlama (UX):** İdari tespit edilince Dosya'da kalıcı bir uyarı belirir ve
kullanıcı tek tıkla (veya otomatik) dilekçe ekranına geçer:

```
┌─ 159017 ───────────────────────────────────────────────────────────────┐
│ ⚠ Bu dosya İDAREYLE İLGİLİ (KASKO hizmet kusuru → KGM 5. Bölge).        │
│   Klasik icra değil; idareye başvuru/dilekçe gerekiyor.                  │
│                                   [ Dilekçe Ekranına Git → oto-yaz ]     │
└─────────────────────────────────────────────────────────────────────────┘
```

Dilekçe ekranı bu dosyanın alanlarıyla **önceden dolu** açılır; üretilen dilekçe
Dosya'ya **bağlı** kaydedilir (çift yönlü link, §2).

---

## 5. Ekranlar (wireframe — senin tasarım turun)

### 5.1 Giriş Kutusu (Inbox)
```
┌──────────────────────────────────────────────────────────────┐
│   ⬇  Hasar dosya klasörünü / .zip buraya sürükle             │
│      (alt klasörler tanınır: Police, Dekont, Lehe,            │
│       Ekspertiz, SBM, Fotoğraflar)         [Klasör Seç]       │
├──────────────────────────────────────────────────────────────┤
│  Kuyruk:  10202407464 ⏳ okunuyor (32/121 foto)              │
│           159013 ✅ KLASİK · takibe hazır                    │
│           159017 ⚠ İDARİ · dilekçe bekliyor → [git]          │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Özet / Kanıt (gözden geçir)
```
┌─ 10202407464 · ÖZET ───────────── Yol: KLASİK İCRA · Karar: TAKİP AÇILACAK ─┐
│  Alan              Değer                 Güven   │  📄 Kanıt önizleme        │
│  Branş        🟨   KASKO                  yüksek  │  ┌──────────────────────┐ │
│  Sig. plaka   🩶   34 FJU 443             yüksek  │  │ Lehe_Form.pdf        │ │
│  Karşı plaka  🟨   27 U 5506 (el yazısı)  ORTA ⚠  │  │ [PDF/foto görüntü]   │ │
│  Kaza yeri    🟨   Balıkesir / Bandırma   yüksek  │  └──────────────────────┘ │
│  Borçlu(lar)  🟨   Songül A.(sahip)+Altan B.(sürücü)  sekme: Poliçe·Lehe·…   │
│  Kusur/oluş   🟨   beyan: çarpıp kaçma    ORTA ⚠  │  ⚑ Teyit: firma↔plaka    │
│  Yetkili icra 🟩   Bandırma İcra (kaza y.)        │     bağı belgesiz →       │
│  Asıl alacak  🩶   30.000,00 + faiz                │     tescil sorgusu öner   │
│                                  [⚖ TAKİP-AÇ BLOĞU ÜRET]   [Dosya Detay'a →] │
└──────────────────────────────────────────────────────────────────────────────┘
```
🩶 belgeden kesin · 🟨 onayla/düzelt · 🟩 otomatik hesap · ⚠ düşük güven.
> Dosya Detay (tüm sekmeler: Borçlular/Ödemeler/Belgeler/Faiz/Çıktılar/Geçmiş) ayrı modül (03).

---

## 6. Katmanlı Çıkarım (maliyet ilkesi) — serverless: 0-2 tarayıcıda, 3 API'de

```
[0] METİN   pdf.js — dijital PDF metin katmanı (TARAYICIDA, Python yok)     BEDAVA
[1] REGEX   plaka 34 ABC 123 · TC 11h · poliçe/hasar/dosya no · tarih  BEDAVA
            · tutar · IBAN
[2] ROUTE   EXIF tarih+kamera · boyut (600x450=hasar, ~A4=belge)       BEDAVA
[3] LLM     SADECE: kusur/oluş şekli, yol kararı sinyali, el yazısı    KURUŞ
            beyan, dönük/kontrastlı foto
```
**Kural:** 100 fotoğrafı "anlamaya" çalışmayız; ~2 belgeyi (ehliyet/ruhsat, alkol) okur,
gerisini doğru klasöre route ederiz. Foto DÖNÜK/EL YAZISI olabilir → render (dpi≈220) + kontrast.

---

## 7. Asistan: İki-Ajan Deseni

**Özet ajanı (üretici):** dosyanın tüm görsel+PDF metnini okur → yapılandırılmış alanlar +
zengin NOT + faiz + **yol sinyali** (idari/klasik) + kararlı çıktı. Uydurmaz; emin değilse
`confidence: "EMİN DEĞİLİM"`. İdari/tek-taraflı dosyayı "⚖️ idari yol" işaretler → triyaj (§4) bunu kullanır.

**Bağımsız teyit ajanı (doğrulayıcı):** aynı kanıtı ayrı açıp çapraz doğrular; **bloke etmez**
→ eksikleri ÖNERİ/dipnot yapar (borçlu↔plaka bağı belgesiz → tescil sorgusu; hasar–ödeme farkı;
sürücü≠sahip≠sigortalı karışıklığı). Çıktı: `{ alan, özet_değeri, teyit_durumu, not }`.

> memory `rucu-ozet-tum-fotograf-teyit`: özet kullanılabilir bir takip dosyasıdır, risk memosu değil —
> teyit ajanını "açılabilir mi" diye savunmaya geçirmeyiz.

---

## 8. Çıktılar

| Yol | Çıktı | Nerede |
|---|---|---|
| KLASİK | **UYAP takip-aç bloğu** (alacaklı+MERSİS · borçlu(lar) · yetkili icra · anapara+faiz · açıklama kalıbı+footer) — tek tık kopya | bu modül |
| İDARİ | **KGM/işletmeci dilekçesi** — dilekçe modülü oto-yazar, Dosya'ya **bağlı** kaydeder | modül 06 (yönlendirilir) |
| Her ikisi | **`_bilgiler.json`** (tüm alan + güven + kaynak izi + teyit notları) + Dosya kaydının kendisi | Dosya |

Açıklama kalıbı (klasik yol):
```
[KAZA TARİHİ] tarihinde Ray Sigorta A.Ş nezdinde sigortalı bulunan [SİG.PLAKA] plakalı
araç ile [KARŞI PLAKA] plakalı [araç/motosiklet] arasında meydana gelen trafik kazası
neticesinde sigortalıya ödenen tazminatın kusurlu taraftan rücu bedeline ilişkindir.
K/Partners: 0544 764 2624 / 0544 764 2590 / 0534 566 72 37
```
ZMMS/karşı plaka yok → minimal uyarla; borçlu tartışmalıysa nötr bitir + footer **her zaman**.

---

## 9. Bu Modülün Dokunduğu Veri (detayı `02-veri-modeli`)

- `RucuDosyasi` — ana alanlar + `yol: KLASIK|IDARI` + `durum: HAVUZDA|INCELENIYOR|TAKIBE_HAZIR|IDARI_YOL`.
- `Borclu[]` — `{ adUnvan, tcVkn, adres, rol, kaynak, teyitDurumu }`.
- `Odeme[]` — `{ tarih, tutar, anaOdemeMi }` (ana = faiz başlangıcı).
- `Belge[]` — `{ kategori, storagePath, extractedText, exifTarih, kamera, boyut, confidence }`.
- `UretilenCikti[]` — `{ tip: TAKIP_BLOGU|DILEKCE|BILGILER_JSON, storagePath, kaynakBelgeIds[] }` ← çift yönlü bağ.

---

## 10. Kabul Kriterleri ("bitti" sayılır)

1. Gerçek `Hasar_Dosya_No_10202407464` atılır → otomatik gruplanır, alanlar dolar, foto route edilir.
2. Özet + teyit ajanı çalışır; düşük güven/teyit-gerek alanlar işaretli; **yol kararı** doğru verilir.
3. **Klasik dosya:** takip-aç bloğu panoya kopyalanır (açıklama+faiz doğru).
4. **İdari dosya:** ⚠ uyarı çıkar → dilekçe ekranına atlar → dilekçe oto-yazılır → Dosya'ya **bağlı** kaydedilir.
5. Dosya kapanır gibi davranılır: ekrandan çıkıp tekrar açınca **her şey kalıcı** durur (Yelda senaryosu).
6. Toplam API maliyeti dosya başına ≈ 0–birkaç kuruş.

---

## 11. Açık Kararlar (senin tasarım turun)

- [ ] Triyaj **idari** dediğinde: otomatik mi dilekçe ekranına atlasın, yoksa "git" butonuyla mı (kullanıcı onayı)?
- [ ] Triyaj kararını **kim** verir: deterministik kural mı (KASKO+hizmet kusuru anahtar kelimeleri), asistan mı, ikisi (kural + asistan teyidi) mi?
- [ ] Belirsiz dosya (klasik mi idari mi net değil) → hangi yola düşsün, nasıl işaretlensin?
- [ ] Gözden geçir: özet/kanıt tek ekranı mı, doğrudan Dosya Detay (03) içinde bir sekme mi?
- [ ] Foto galerisi bu modülde mi, Dosya Detay'da mı (etiketleme/taşıma)?
