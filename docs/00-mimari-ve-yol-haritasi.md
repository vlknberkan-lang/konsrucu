# 00 — Mimari ve Tasarım Yol Haritası

> KonsRücü'nün **temel kararları**, çalışma şeklimiz ve üretilecek tasarım dökümanlarının
> sıralı listesi. Diğer tüm `docs/NN-*.md` dosyaları bu dökümanın kurduğu zemine oturur.
> Tarih: 2026-06-14 · Durum: **canlı (decisions locked)**

Ürün vizyonu için: [`../README.md`](../README.md). Bu döküman onu **nasıl inşa edeceğimizi** sabitler.

---

## 1. Sabitlenen Kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| **Başlangıç** | **Temiz sayfa.** Eski `ray-sigorta-rucu-takip` ve `Rucu_Takip` kodundan **hiçbir şey** taşınmaz. | Birikmiş borç (çift backend, açık RLS, Gemini+ham parse) miras alınmaz. Kanıtlanmış *fikirler* referanstır, *kod* değil. |
| **Çalışma şekli** | **Step-by-step tasarım.** Ben tasarım MD üretirim → sen tasarımı yapar/onaylarsın → ben canlıya alırım. | Her modül önce kâğıtta netleşir, sonra kodlanır. |
| **İlk öncelik** | **Modül 1 — Akıllı Giriş.** | "Asistan" değeri en yüksek burada; özet+teyit ajanını üretime alır. |
| **Yığın** | **Next.js 15 (App Router) + TypeScript + Supabase + Prisma/Postgres.** | konstraERP ile aynı; kütüphane paylaşımı. |
| **Asistan** | **Claude (Anthropic SDK), yapılandırılmış çıktı** (tool-use / JSON şema). | Şema-doğrulamalı; ham `JSON.parse` yok. En güncel model varsayılan. |
| **Dağıtım** | **Serverless** (Vercel-tarzı). LAN/self-host **YOK**, O: ağ sürücüsü **YOK**. | Berkan kararı (2026-06-14). Ops basit; ağır iş client'a + Storage'a kayar. |
| **Çıkarım ilkesi** | **Ucuz katman önce — ama TARAYICIDA (client-side).** Dijital PDF metin (pdf.js) + EXIF/boyut (exifr) + regex bedava, kullanıcının makinesinde. LLM sadece boşluk için → serverless API → Claude. | Serverless'ta yerel Python worker olamaz; bedava katmanı client'a taşıdık → maliyet hâlâ ≈ 0–kuruş, ops daha basit. |
| **Dosya saklama** | **Supabase Storage** (yerel disk yok). `Hasar_<no>/01_Police/…` = mantıksal yapı + istenince ZIP. | Serverless'ta kalıcı disk yok. |
| **Belge üretimi** | **docxtemplater** (Word COM yok, sunucuda Word'süz). | Türkçe yol / `~$` kilidi / seri-Word acıları biter. |
| **Güvenlik** | API auth + rol bazlı RLS + audit log **baştan**. | "Profesyonel" sürümün şartı; sonradan eklenmez. |

---

## 2. Klasör Yapısı (öneri — sen onaylayınca sabitlenir)

ASCII yol kuralı: marka **KonsRücü**, klasör/dosya adları **ASCII** (Türkçe karakterli yol
Windows tooling'i takıyor — bkz memory `word-com-uretim-pipeline`).

```
konsrucu/
  README.md                  ← ürün vizyonu (var)
  docs/                       ← tasarım dökümanları (bu klasör)
    00-mimari-ve-yol-haritasi.md
    01-akilli-giris.md
    ...
  app/                        ← Next.js App Router (sonra)
  prisma/                     ← schema.prisma + migration (sonra)
  lib/                        ← iş kuralları (açıklama, faiz, yetki, branş) (sonra)
  lib/extract/                ← CLIENT-SIDE çıkarım: pdf.js metin · exifr EXIF · regex · boyut-route (sonra)
  app/api/                    ← serverless route'lar: Claude gap · docxtemplater · Storage (sonra)
  components/                 ← UI (sonra)
```

---

## 3. Veri Modeli — Üst Bakış (detayı modül dökümanlarında)

**Merkez fikir: `RucuDosyasi` = kalıcı tam kayıt (tek doğruluk kaynağı).** Tüm modüller
(giriş, dilekçe, izleme) aynı Dosya'yı okur/yazar. Yelda 3-4 hafta sonra dosyayı açınca
**her şeyi** burada görür: ham evrak + özet + yol kararı + üretilen çıktı + güncel durum + geçmiş.
Bu kaydı gösteren ekran = **Dosya Detay** (modül 03).

İlişkisel; Excel'in tek hücreye sıkıştırdığı şeyler artık **LİSTE**.

```
RucuDosyasi 1─N Borclu        (çoklu/müteselsil; rol + kaynak + teyit bayrağı)
RucuDosyasi 1─N Odeme         (ana ödeme = faiz başlangıcı)
RucuDosyasi 1─N Belge         (kategori + storagePath + extractedText + exif/confidence)
RucuDosyasi 1─N UretilenCikti (takip-aç bloğu | dilekçe | _bilgiler.json; kaynakBelge'ye BAĞLI)
RucuDosyasi 1─N TakipOlayi    (durum/tahsilat/tebliğ/itiraz — İzleme fazında)
   · yol: KLASIK | IDARI        (triyaj kararı — §4'teki yönlendirmeyi belirler)

Ayarlar (singleton)           (Şirket Bilgileri: MERSİS · K/Partners telefon · vekil ad/IBAN/KEP · açıklama footer · faiz oranları) — KODDA DEĞİL, DB'de
```

**Altın kural:** her çıkarılan alan `{ value, confidence, sourceRef }` taşır — nereden,
ne kadar güvenle geldiği izlenir. Düşük güven → gözden geçirmede işaretli.
**Çift yönlü bağ:** üretilen dilekçe/blok ↔ kaynak ham evrak birbirine linklidir.

**Aktif Müşteri (tenant) bağlamı.** konstraERP'deki proje seçimi gibi: **Müşteri Seçim** ekranı; seçilen müşteri oturum bağlamına girer. Tüm sorgular `musteriId` ile filtrelenir → **tam izolasyon** (Ray dosyaları Zurich'e karışmaz). Seçilen müşterinin `Ayarlar`'ı (MERSİS, alacaklı ünvan, footer, IBAN) takip-aç bloğu/dilekçeyi **otomatik** doldurur. Kullanıcı yalnız **atandığı** müşterileri (`MusteriKullanici`) görür; picker ona göre kısıtlı. (DB-seviyesi RLS izolasyonu: 08-güvenlik fazı.)

---

## 4. Asistan Katmanı — Desen

İki-ajan deseni (memory `rucu-ozet-tum-fotograf-teyit`) koda gömülür:

1. **Özet ajanı** — tüm görselleri/PDF'leri okur, yapılandırılmış alan + zengin not +
   açıklama + faiz üretir. **"TAKİP AÇILACAK" kararlı çıktı** verir (bloke etmez).
2. **Bağımsız teyit ajanı** — aynı kanıtı ayrı açıp çapraz doğrular; kör güvenmez ama
   açmayı engellemez → eksikleri **ÖNERİ/dipnot** olarak işaretler (tescil sorgusu vb.).

Her ikisi de **şema-zorunlu** çıktı verir (Anthropic tool-use). Layer 0-2 bedava
yerelde döner; ajan sadece kusur/oluş şekli/karar boşluğu için çağrılır.

**Triyaj (yol kararı):** özet ajanı ayrıca dosyanın **yolunu** işaretler — klasik icra
(kişi-kişi rücu) mı, **idari** (KASKO hizmet kusuru → KGM/yol işletmecisi → idareye başvuru) mi.
İdariyse sistem kullanıcıyı **uyarır ve dilekçe modülüne yönlendirir** (modül 06); klasikse
takip-aç bloğunu hazırlar. Bu yönlendirme Akıllı Giriş'in (01) çekirdeğidir.

---

## 5. Hukuk Kuralları (koda gömülecek — tek kaynak `lib/`)

memory'den gelen, üründe sabitlenecek kurallar:

- **Açıklama kalıbı** sabit + sonda her zaman `K/Partners` footer (`rucu-takip-aciklama-formati`).
- **Alacaklı her zaman** `RAY SİGORTA A.Ş. · MERSİS ⟨Şirket Bilgileri'nden⟩` (`ray-sigorta-alacakli-mersis`).
- **Yetkili icra = KAZA YERİ** (HMK m.16), borçlu ikameti değil (`rucu-yetki-kaza-yeri`).
- **Borçlu = çoklu/müteselsil**; branşa göre rücu yönü: KASKO→karşı taraf, ZMMS→kendi sigortalı taraf, oto-dışı→kusurlu (`rucu-coklu-borclu-brans`).
- **Faiz:** kanuni faiz, başlangıç = ana ödeme tarihi → takip günü; işlemiş faiz + anapara.
- **Borçlu↔plaka bağı belgesizse** → tescil/işleten sorgusu ÖNERİSİ (bloke değil).

> **Sabit iş bilgileri KODDA DEĞİL, DB'de (`Ayarlar`).** MERSİS, K/Partners telefonları, vekil ad/adres/IBAN/KEP, açıklama footer'ı → **Şirket Bilgileri** ekranından düzenlenir. Böylece repo'da hassas sabit kalmaz, değişince kod elden geçmez. (Berkan önerisi, 2026-06-14.)

---

## 6. Çalışma Şeklimiz (her modül için döngü)

```
[1] Ben:  docs/NN-<modul>.md tasarımını üretirim
[2] Sen:  okur, tasarımı yapar/düzeltir/onaylarsın (kararlar netleşir)
[3] Ben:  modülü canlıya alırım (kod + migration + test)
[4] Birlikte: gerçek dosyayla doğrularız → sonraki modüle geçeriz
```

---

## 7. Tasarım Dökümanı Yol Haritası

Sıralı; **üstten alta** ilerleriz. Akıllı Giriş çekirdek olduğu için önce o.

| # | Döküman | Kapsam | Durum |
|---|---|---|---|
| 00 | mimari-ve-yol-haritasi | bu döküman | ✅ taslak |
| 01 | **akilli-giris** | havuz → oku/çıkar → özet+teyit → **triyaj (yol kararı)** → uyar+yönlendir; klasikse takip-aç bloğu | ✅ taslak (güncellendi) |
| 02 | veri-modeli | Prisma şema detayı (tüm entity + alan + ilişki + index) | ✍️ **sıradaki** |
| 03 | dosya-detay | **Kalıcı tam kayıt ekranı** — Yelda'nın açıp her şeyi gördüğü hub (ham evrak+özet+yol+çıktı+durum+geçmiş) | ⏳ |
| 04 | cikarim | **client-side** çıkarım (pdf.js/exifr/regex/boyut-route) + serverless gap-API (Claude vision); **Python YOK** | ⏳ |
| 05 | asistan-semalari | özet & teyit ajanı prompt + tool-use JSON şemaları + triyaj sinyali + güven kuralları | ⏳ |
| 06 | dilekce-uretimi | **Ayrı modül; 01 buraya yönlendirir.** docxtemplater (KGM Genel/Bölge/İşletmeci) + tek-sayfa margin + bölge eşleştirme + kaynak dosya bağı | ⏳ |
| 07 | izleme-uyap | **Ekran 1: takip-açıldı eşleştirme (icra no) · Ekran 2: eklenti köprüsü (senkron)** + durum/tahsilat/tebliğ/itiraz + uyarılar | ✅ taslak (2 ekran) |
| 08 | guvenlik-ve-roller | auth, **müşteri seçim + tenant izolasyonu (RLS)**, audit log, rol modeli | ⏳ |

> Akıllı Giriş'in (01) çalışması için zincir: 02 veri-modeli + 04 cikarim-worker + 05 asistan + 03 dosya-detay.
> Dilekçe (06) idari yolun hedefi; İzleme (07) ve güvenlik (08) sonra. Veri modeli (02) baştan hepsini düşünerek tasarlanır.

---

## 8. Açık Kararlar (senin tasarım turunda netleşecek)

- [x] **Dağıtım: serverless · O: yok · LAN yok · Supabase** (Berkan, 2026-06-14).
- [x] **Çıkarım: client-side (tarayıcı) bedava katman + serverless Claude gap.** Python worker / Ollama YOK.
- [x] **Dosya deposu: Supabase Storage** (O: ve yerel disk yok).
- [ ] Klasör yapısı (§2) onay — `app/ app/api/ prisma/ lib/ lib/extract/` bu isimlerle mi?
- [ ] Tek kullanıcı mı baştan çok kullanıcı/rol mü (Yelda/Mazlum/avukat ayrımı)?
