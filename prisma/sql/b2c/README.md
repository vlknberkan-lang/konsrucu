# Dalga B2 ve C şeması: SQL `010–015` (TASLAK)

**Durum:** Taslak. Canlıya **uygulanmadı**; `prisma/schema.prisma` **değişmedi**; commit yok.
**Model taslağı:** `prisma/taslak/b2c.prisma` (yeni modeller + mevcut ve B1 modellerine eklenecek satırlar; `b1.prisma` ile aynı düzen).
**Tasarım:** `rucu-hukuk-asistani/docs/06-ana-senaryo-tasarimi.md` §3.1–3.6, 2(f)–(j), §7 · **Plan:** `07-uygulama-plani.md` S26–S40, §6.1, §6.3, §6.6 · ayrıca `04` §4.1–4.2, `05`, `bilgi-bankasi/dilekce/veri-gereksinimi.md`.
**Önkoşul:** Dalga B1 (`prisma/sql/b1/001–009`, `prisma/taslak/b1.prisma`). Bağımlılıkların tamamı bölüm 3'te.

> Plan dosyaları `prisma/sql/NNN_*.sql` diye anıyor; bu taslakta aynı numaralar `prisma/sql/b2c/` altında (B1'in `b1/` klasörüyle aynı düzen).

---

## 1. Dosyalar ve dilimler

| Sıra | Dosya | Dalga · dilim | Yeni tablo | Mevcut tabloya ek | FK | CHECK |
|---|---|---|---|---|---|---|
| 1 | `010_arabuluculuk_onay.sql` | B2 · S26 arabuluculuk, yol seçimi, müvekkil onayı | `Arabuluculuk`, `OnayKaydi`, `YolSecimi`* | — (B1 `Sure.arabuluculukId`'ye FK) | 5 | 5 |
| 2 | `011_dava.sql` | B2 · S27 dava kaydı, Excel #19–#30, ihtiyati haciz, ön kontrol (S28–S31 de kullanır) | `Dava`, `DavaTaraf`, `DavaIslem`, `IhtiyatiHaciz` | `Masraf.davaId`; `Etkinlik.kaynak`, `kaynakBelgeId`, `teyit` (B1 `Sure.davaId`, `Belge.davaId`'ye FK) | 10 | 10 |
| 3 | `012_kapanis.sql` | B2 · S31 karar, kanun yolu, tahsilat onayı, kapalı radar | — | `RucuDosyasi.kapanisSebebi`, `kapanisAt`, `kapanisKaydedenId`* | — | — |
| 4 | `013_mevzuat.sql` | C · S33 mevzuat kütüphanesi, atıf kapısı (K1) | `MevzuatKaynak` | — | 1 | 2 |
| 5 | `014_dosya_karti.sql` | C · S35 dosya kartı | `DosyaKarti` | — | 1 | 1 |
| 6 | `015_dilekce.sql` | C · S36 iskelet, üslup, dilekçe v2 (S40 da kullanır) | `DilekceSurum`, `DilekceSablon`, `UslupKurali` | `UretilenCikti.tur`, `davaId`, `updatedAt`, `duzenleyenId`, `modelSurum`; `AiKullanim.onbellekOkunanToken`*, `onbellekYazilanToken`* | 4 | 3 |

\* = 06'da olmayan taslak eki (bölüm 2.4).

**Toplam:** 12 yeni tablo (hepsinde RLS açık), 5 mevcut tabloya 14 kolon (`UretilenCikti` 5, `Etkinlik` 3, `RucuDosyasi` 3, `AiKullanim` 2, `Masraf` 1), 22 indeks (7'si tekil; kısmi indeks **yok**), 21 FK (3'ü B1 tablolarına: `Sure` ×2, `Belge` ×1), 21 CHECK.
**Enum değişikliği yok** (06 §3.1 ilke 2) → ayrı `ADD VALUE` dosyası yok. `CiktiTip`, `EtkinlikTur`, `AsamaTur` aynen kalır: dilekçe alt türü `UretilenCikti.tur`'da, keşif tarihi `Dava.kesifTarihi`'nde, istinaf ayrı `Asama(DAVA)` + `Dava.derece = 2` ile.

**Şemasız dilimler (bu taslağın karşılığı):**
- **S29** (yargılama süreleri, ara karar, müzekkere): ayrı SQL yok. Ara karar/tensip → `DavaIslem(ARA_KARAR | TENSIP)` + `detayJson.kesinSureler[]`; müzekkere → `DavaIslem(MUZEKKERE | MUZEKKERE_CEVABI)` + `ilgiliIslemId` + `detayJson.istenenKalemler[]`; süreler → B1 `Sure` (tür listesi CHECK'siz, HMK türleri eklenebilir) ve artık `Sure.dava` ilişkisi; duruşma → `Etkinlik(DURUSMA, kaynak, teyit)`.
- **S40** (öğrenme döngüsü, UYAP kilidi): ayrı SQL yok; alanları `015`'te: `UslupKurali.kaynakSurumId`, `pasifSurum`; `DilekceSurum.durum = GONDERILDI_UYAP`, `kilitAt`, `uyapBelgeId`. Süre kapanışı B1 `Sure.kapanisKanitiBelgeId`.
- **S31**'in tahsilat onayı B1 `TakipOlayi(altTip = TAHSILAT_BORCLUDAN, teyit)` ile; karar kartı `Dava` karar kolonlarıyla (`011`).

Her dosya (B1 ile aynı kurallar):
- `BEGIN;` ile başlar, `COMMIT;` ile biter; `SET LOCAL lock_timeout = '5s'`.
- Yalnız ekler: `CREATE TABLE`, `ADD COLUMN` (boş bırakılabilir ya da varsayılanlı), `CREATE INDEX`, FK, CHECK, `ENABLE ROW LEVEL SECURITY`. Kolon/tablo kaldırma, yeniden adlandırma, tip değiştirme, NOT NULL'a çevirme, veri güncelleme, `CONCURRENTLY` yok.
- Tekrar çalıştırılabilir: `IF NOT EXISTS`; FK ve CHECK `pg_constraint` denetimli `DO $$ … $$` bloklarında.
- Tablo, kolon, indeks ve FK adları Prisma'nın üreteceği adlarla birebir (bölüm 5.1'de makineyle karşılaştırıldı).
- **Fark (B1'e göre):** `010` ve `011` B1 tablolarına FK verdiği için B1'e **dayanır**; dosyanın başındaki önkoşul bloğu B1 yoksa anlaşılır Türkçe hatayla durur ve işlem bütünüyle geri sarılır. `012–015` yalnız mevcut tablolara dayanır, tek başına uygulanabilir.

## 2. Tasarım kararları

### 2.1 Silme sınıfları (06 §3.1 ilke 5)
- **Hukuki kayıt** (`ON DELETE RESTRICT` + `silindiAt`): `Arabuluculuk`, `OnayKaydi`, `YolSecimi`, `Dava`, `DavaTaraf`, `DavaIslem`, `IhtiyatiHaciz`, `DosyaKarti`, `DilekceSurum`. Listeler `silindiAt: null` süzgeciyle okunur.
- **Kiracı kütüphanesi** (`Musteri` → `CASCADE`, `MentorKural` deseni): `MevzuatKaynak`, `DilekceSablon`, `UslupKurali`. Kayıt silinmez; `aktif = false` / `durum = PASIF` ile pasife alınır, yanlış yükleme `yuklemeId` ile toplu pasif (07 S33, S36).
- **Sonuçlar:** uzantısı (`Arabuluculuk`/`Dava`) olan bir `Asama`, sürümü (`DilekceSurum`) olan bir `UretilenCikti` ve bunları taşıyan dosya fiziksel silinemez (P2003). Bugünkü kodda `asama`, `uretilenCikti`, `belge`, `rucuDosyasi` için `delete` yolu **yok** (27.09 tarandı: yalnız `masraf`, `etkinlik`, `borclu`, `takipOlayi`, `emsalKarar`, `ciktiKaynak`, `mentorKural`, `odeme` silinir; hiçbiri yeni FK'lerin hedefi değil). İleride "aşama sil" ya da "dilekçe sil" yazılacaksa `silindiAt` ile yazılmalı.
- `Belge.davaId` → `Dava` **SET NULL** (evrak davadan bağımsız yaşar; `Belge` → dosya `CASCADE` aynen).

### 2.2 FK kuralı
FK yalnız (a) 06 §3.3'te `@relation` yazan bağlarda (`dosya`, `asama`, `dava` üst kayıtları, `cikti`) ve (b) B1 README'sinin "B2'ye bırakılan bağlar" maddesindeki üç bağda (`Sure.davaId`, `Sure.arabuluculukId`, `Belge.davaId`). Geri kalan kimlik kolonları **düz** (B1 deseni): kanıt işaretçileri (`…BelgeId`, `uyapBelgeId`), bağlam kolonları (`Dava.arabuluculukId`, `Dava.ustDavaId`, `Masraf.davaId`, `UretilenCikti.davaId`, `DosyaKarti.davaId`, `OnayKaydi.davaId`/`yolSecimiId`, `YolSecimi.davaId`, `DilekceSurum.kartId`/`sablonId`, `DavaTaraf.borcluId`, `DavaIslem.ilgiliIslemId`), kişi kolonları (`…onaylayanId`, `kaydedenId` …). Bunların tutarlılığını yazma yardımcısı denetler; bölüm 6'daki sorgular yetim satırı bulur.

### 2.3 CHECK kısıtları (06 §3.1 ilke 2) — 21 adet, yalnız kapalı listelerde
`Arabuluculuk.tur` (DAVA_SARTI, IHTIYARI, BELIRSIZ; NULL serbest — varsayılan yok, açık karar 3) · `Arabuluculuk.sonuc` · `OnayKaydi.sonuc` · `YolSecimi.asama`, `durum` · `Dava.rolumuz`, `usul`, `derece` (1–3), `hukum` · `DavaTaraf.teyit`, `DavaIslem.teyit`, `IhtiyatiHaciz.teyit` (ADAY, TEYITLI, REDDEDILDI) · `IhtiyatiHaciz.asama`, `sonuc` · `Etkinlik.teyit` (NULL serbest; eski satırlar NULL) · `MevzuatKaynak.durum`, `etiket` · `DosyaKarti.durum` · `DilekceSurum.kaynak`, `durum` · `UslupKurali.durum`.

**Bilerek CHECK'siz** (liste büyüyebilir; değerler `b2c.prisma` yorumlarında ve `lib/sabitler/*.ts`'de): `OnayKaydi.tur` (B16'da ıslah, feragat da var), `YolSecimi.secim`, `Dava.tur/mahkemeTuru/evre/durum/davaDegeriKaynak/…Yon`, `DavaTaraf.rol`, `DavaIslem.tur`, `Etkinlik.kaynak`, `RucuDosyasi.kapanisSebebi`, `MevzuatKaynak.tur`, `DosyaKarti.tur`, `UretilenCikti.tur`, `DilekceSablon.tur`, `UslupKurali.kaynak/kapsam`. Bir CHECK'i genişletmek kısıtı kaldırıp yeniden eklemeyi gerektirir; bu "yalnız ekleme" kuralına takılır (B1 README §2 ile aynı gerekçe). En olası genişleme adayları `Arabuluculuk.sonuc` ve `Dava.hukum` (`DIGER` bunu karşılamak için var).

### 2.4 06'da olmayan taslak ekleri
Hepsi boş bırakılabilir ya da varsayılanlı. Dilim ajanı ya da Berkan/Yelda istemezse birleştirmeden önce `b2c.prisma`'dan ve ilgili SQL'den birlikte çıkarılır.

| Ek | Dosya | Neden |
|---|---|---|
| **`YolSecimi` tablosu** | 010 | AR-01 "yol seçilmedi", AR-02 "yol seçildi, onay yok", SN-02 "karar sonrası yol seçilmedi" kurallarının ve 07 S26 kabul 1'in verisi 06 §3.3'te yok. Yol kartındaki "dava ekonomisi" elle satırları (`ekonomiJson`, B29 ertelendi) da burada. Karar değişirse eski satır `ESKIDI`. |
| `OnayKaydi.yolSecimiId`, `davaId` | 010 | Onayın hangi yol ya da hangi davanın kanun yolu için istendiği (AR-02, SN-02, `OnayKaydi(KANUN_YOLU)`). |
| `Arabuluculuk.konuMetni` | 010 | veri-gereksinimi C5 (ZMSS ailesinde "arabuluculuk kapsamı" savunmasına cevap). |
| `Arabuluculuk @@index([dosyaId])` | 010 | M7 kapsam sorgusu. |
| `Dava.kesifTarihi` | 011 | 05: UYAP ayrıntısındaki "Keşif Tarihi"; `EtkinlikTur`'da KESIF yok, enum'a değer eklenmez. |
| `Dava.onKontrolJson` | 011 | 07 S27 kabul 3–4: çapraz kontrol uyarısının "yazılı gerekçeyle geçilmesi kayda geçiyor". |
| `Dava.yargilamaGideriAleyhe`, `vekaletUcretiAleyhe` | 011 | 06 2(j) "iki yönlü vekâlet ücreti": kısmi kabulde lehe ve aleyhe tutar birlikte; tek kolon + yön taşıyamaz. `vekaletUcretiYon`'a `IKI_YONLU` değeri. |
| `Dava.kararKaynakBelgeId`, `kararOnaylayanId`, `kararOnayAt` | 011 | S31 "karar okuma yalnız öneri; onaylanmadan hiçbir eksen ve para toplamı değişmez" → onayın izi. |
| `DavaTaraf.adHam`, `kaynakTuru`, `teyitEdenId`, `teyitAt` | 011 | Excel #22 / UYAP taraf adı borçluyla eşleşmezse ham ad (M, maskeli); aday → teyit izi (`TakipOlayi` deseni). |
| `DavaIslem.kaynakTuru`, `ilgiliIslemId`, `detayJson` | 011 | Müzekkere ↔ cevap bağı (S29 kabul 4), müzekkere kalemi ↔ ek (veri-gereksinimi J6), ara karar kesin süreleri (S29). |
| `DavaIslem.tekilAnahtar` + `@@unique([dosyaId, tekilAnahtar])` | 011 | S28 dava senkronu ve Excel yeniden içe aktarımı aynı adayı iki kez açamaz (B1 `TakipOlayi.tekilAnahtar` deseni; NULL'lar çakışmaz). |
| `teyit` listesine `REDDEDILDI` (`DavaTaraf`, `DavaIslem`, `IhtiyatiHaciz`, `Etkinlik`) | 011 | Yanlış UYAP/Excel adayını silmeden reddetmek (06 yalnız ADAY/TEYITLI yazıyor; B1 `TakipOlayi.teyit` ile aynı dil). |
| `IhtiyatiHaciz.kararTebligTarihi`, `teminatOrani`, `kaynakTuru`, `teyitAt`, `@@index([davaId])` | 011 | veri-gereksinimi I2–I3 (İİK 261 tetik adayı, teyit gerekli; oran metni aynen). |
| `RucuDosyasi.kapanisKaydedenId` | 012 | "Kapanış sebebini yalnız avukat yazar" izinin kolonu (`yolOnaylayanId` deseni). |
| `MevzuatKaynak.icerikOzet`, `yuklemeId`, `aktif`, `kopyaKaynakId`, `updatedAt`, `@@unique([musteriId, kunye])` | 013 | 07 S33: idempotent anahtar `musteriId + kunye`, `--kuru` "değişecek/aynı kalacak" ayrımı, yükleme kimliğiyle toplu pasif, "Zurich'e kopyala" (açık karar 18). |
| `DosyaKarti.updatedAt` | 014 | TASLAK kart düzenlenirken beklenen-içerik (çakışma) koruması. |
| `DilekceSurum.olguBaglariJson`, `uretimJson` | 015 | `[O-n]` bağları (06 §7.3) ve üretim meta verisi (token, önbellek, okunamayan belge, kısaltılan bölüm; 06 2(h)). |
| `DilekceSablon.kod` + `@@unique([musteriId, kod, surum])`, `onayAt`, `bilgiBankasiYolu`, `icerikOzet`, `yuklemeId`, `kopyaKaynakId` | 015 | `sablon-yukle.ts --kuru` ve idempotent yükleme (S33 deseni); `kod` = `bilgi-bankasi/dilekce/sablonlar/<kod>.md`. |
| `UslupKurali.pasifSurum`, `kaynakSurumId`, `onayAt`, `yuklemeId` | 015 | S40: fark adayının kaynağı; üslup kartı sürüm N'nin yeniden kurulması (S38 regresyonu). |
| `AiKullanim.onbellekOkunanToken`, `onbellekYazilanToken` | 015 | B53 / 07 S36 "cache_read_input_tokens kaydı". |

### 2.5 veri-gereksinimi.md'nin "YENİ" alanları nasıl karşılandı

| Alan (veri-gereksinimi) | Karşılık |
|---|---|
| C5 arabuluculuk konu metni | `Arabuluculuk.konuMetni` (010) |
| I2 teminat oranı · I3 karar tebliği | `IhtiyatiHaciz.teminatOrani`, `kararTebligTarihi` (011) |
| J6 müzekkere kalemi ↔ ek | `DavaIslem.detayJson.istenenKalemler[].ekBelgeId` (011) |
| G11 aleyhe olgular · J3 savunma matrisi · I4 ihtiyati haciz olguları · K4 ek ↔ delil | `DosyaKarti.icerikJson` (014) |
| A12 adres kaynağı · A13 davalı UETS · F2 yol statüsü · F3 idare birimi · G1 çoklu rücu sebebi ve "takipte yazılı mı" · H9 ödeme alıcısı/kalem türü · B11 takip borç sebebi metni | Onaylı `AlanDegeri` (B1 005: alan + `kaynakBelgeId` + sayfa + alıntı; `degerJson` dizi/nesne olabilir). Kolon açılmadı; kart (S35) `AlanDegeri`'ni okur. **B1'e öneri:** B11 değişmez takip kaydının parçası olduğu için S21 isterse `TakipTalebi.borcSebebiMetni` (B1 007) eklenebilir — bu taslak B1 modeline kolon eklemedi. |
| G12–G14 ceza/soruşturma dosyası · H10 diğer davalar | **Ertelendi** (karar gerekli): genel bir "ilgili dosya" modeli. Şimdilik `Dava.ilgiliDosyaHam` + `AlanDegeri`. |
| H1–H2 zarar gören, hak sahipleri | **Ertelendi**: `AlanDegeri` (nesne dizisi). Özel nitelikli veri; açık karar 1a/1c'ye bağlı. |

## 3. B1 ile bağımlılıklar

**Veritabanı (sert):**
- `010` → B1 `009` (`Sure` tablosu; `Sure_arabuluculukId_fkey`).
- `011` → B1 `009` (`Sure_davaId_fkey`) ve `004` (`Belge.davaId`; `Belge_davaId_fkey`).
- Önkoşul bloğu ikisini de denetler. FK eklenirken mevcut satırlar denetlenir: o anda `Arabuluculuk`/`Dava` boş olduğu için dolu bir `Sure.arabuluculukId`, `Sure.davaId` ya da `Belge.davaId` yetim demektir → dosya "yetim değer" hatasıyla durur (bölüm 6'daki sorgular bulur). B1 kodu bu kolonlara yazmıyor; R0 aktarımı da (S43) yazmamalı.

**Prisma modeli:** `b2c.prisma`'nın `model Sure'ye eklenecek` ve `model Belge'ye eklenecek` bölgeleri B1'in `Sure` modeline ve `Belge.davaId` kolonuna **yalnız ilişki alanı** ekler (`Sure.arabuluculuk`, `Sure.dava`, `Belge.dava`; ters tarafta `Arabuluculuk.sureler`, `Dava.sureler`, `Dava.belgeler`). Hiçbir B1 modeli ya da kolonu yeniden tanımlanmadı; B1'in model/kolon adları aynen kullanıldı. B1 bu adları değiştirirse bu üç satır ve iki FK birlikte güncellenmeli.

**Uygulama (yumuşak; FK yok):** `TakipOlayi(altTip = TAHSILAT_BORCLUDAN | DAVA_ACILDI_SINYALI, teyit)` (003; S31 tahsilat onayı, S28 dava keşfi) · `BorcluTakip` (003; davalı = süresinde itiraz eden teyitli borçlu, B08) · `Belge.altTur/kaynak/uyapDosyaTuru` (004; dava evrakı, EK listesi) · `AlanDegeri(kaynakTuru = EXCEL)` (005; Excel #19–#30 önerileri ve #19/#24 karşılaştırma değeri) · `TakipTalebi` (007; dava değeri ve talep sonucu kapısı) · `SenkronIs.tur = HUKUK | DAVA_KESIF` (008; CHECK'siz, büyür) · `Sure.tur` HMK/İİK 261/264 türleri (009; CHECK'siz) · `DurumGecisi(eksen = ARAB | DAVA)` (001) · `VeriOnarim(R7, islem = EKLE, hedefTablo = "Arabuluculuk" | "Dava" …)` (001; S46 geri doldurma) · `RucuDosyasi.arabEksen/davaEksen` (003).

**Sıra:** B1 `001–009` (S42) → S43 → `010–012` (S45) → `013–015` (S48). B2C, B1'deki hiçbir dosyayı değiştirmez; B1 dosyaları değişirse bölüm 5.1'deki doğrulama yeniden çalıştırılmalı (bu taslak `b1.prisma`'nın 27.09 17:18 sürümüyle doğrulandı).

## 4. Uygulama (canlı; Berkan)

1. **Yedek** (07 §6.2): tam döküm + `npm run yedek`; geçiş öncesi deploy kimliği not edilir.
2. **Önkoşul sorguları** (bölüm 6): yetim sayıları 0.
3. **Uygula** (numara sırasıyla, her dosya kendi işlemi; `DIRECT_URL` 5432, mevcut tabloların sahibi rolle — Supabase'de `postgres`):
   ```bash
   npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/b2c/010_arabuluculuk_onay.sql
   # … 011, 012  (Dalga B2, S45)      … 013, 014, 015  (Dalga C, S48)
   # ya da: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/b2c/010_arabuluculuk_onay.sql
   # (psql'e --single-transaction VERME: dosya kendi BEGIN/COMMIT'ini taşıyor)
   ```
   Hata "lock timeout" ise birkaç saniye sonra aynı dosya yeniden çalıştırılır (tekrar çalıştırılabilir).
4. Her dosyadan sonra RLS denetimi (bölüm 6, ilk sorgu → 0 satır).
5. **Önce SQL, sonra kod.** `schema.prisma`'ya yalnız canlıya uygulanmış dosyaların satırları taşınır (her satırda `01N` etiketi var). Kolonu DB'de olmayan alan `schema.prisma`'ya girerse o modelin her sorgusu kırılır.

## 5. Doğrulama

### 5.1 Çevrimdışı — bu taslakta yapıldı (canlı ya da staging veritabanına bağlanılmadı)
1. **Birleştirme ve validate:** mevcut şema + `b1.prisma` + `b2c.prisma` geçici dosyada birleştirildi (bölge satırları ilgili modele — `Sure` gibi B1 modelleri dahil —, yeni modeller sona). `npx prisma validate` → geçerli. Ayrıca **her dosya için ayrı ara durum** (B1 + yalnız ≤ `010`, ≤ `011`, … ≤ `015` etiketli satırlar) → altısı da geçerli; dilimler sırayla tek tek birleştirilebilir. Geçici dosyalar silindi.
2. **Prisma DDL karşılaştırması:** her ara durum için `npx prisma migrate diff --from-schema-datamodel <önceki> --to-schema-datamodel <sonraki> --script` (iki dosya arası, bağlantısız) → Prisma'nın üreteceği SQL; `010–015` ile makineyle karşılaştırıldı: 311 öğe (kolon tanımı, tablo, PK, indeks adı ve kolonları, FK ve eylemleri) **birebir**, eksik 0, fazla 0. `010–015`'teki fazlalar yalnız 21 CHECK, 12 RLS satırı, önkoşul/yetim denetimleri.
3. **Yürütme provası (PGlite, süreç içi WASM Postgres; ağ ya da veritabanı bağlantısı yok):** Prisma'nın mevcut şema DDL'i → B1 `001–009` → `010–015`, sonra hepsi **ikinci kez**:
   - İkinci tur hatasız ve katalogda değişiklik yok (tekrar çalıştırılabilir).
   - Son katalog, birleşik şemanın Prisma DDL'iyle kurulan ayrı bir veritabanıyla karşılaştırıldı: 800 kolon (tip, boşluk, varsayılan), 155 indeks, 72 FK **birebir**. Yalnız SQL'de olanlar: B1'in 2 kısmi indeksi ve CHECK'ler (B2C'nin 21'i dahil). RLS kapalı yeni tablo yok.
   - B1'siz veritabanında `010` ve `011` önkoşul hatasıyla durdu, hiçbir tablo kalmadı; `012–015` B1'siz de uygulandı.
   - `Sure.davaId`'de yetim değer varken `011` durdu ve bütünüyle geri sarıldı (`Dava` tablosu ve `Masraf.davaId` yok).
   - Davranış (kurgusal satırlarla, 19/19 beklenen sonuç): geçersiz `usul`/`derece`/`teyit`/`durum`/`sonuc` reddedildi; aynı aşamaya ikinci `Dava` reddedildi; `DavaIslem` aynı `tekilAnahtar` reddedildi, NULL'lar kabul; `Dava` varken `Asama` ve dosya silme reddedildi; sürümü olan `UretilenCikti` silme reddedildi; eski kodun biçimiyle (`updatedAt` vermeden) `UretilenCikti` ve `Etkinlik` ekleme kabul; `Sure.davaId` olmayan davaya reddedildi; aynı müvekkilde aynı künye reddedildi; davaya bağlı `Belge` silinebildi.
   - Yan bulgu: B1 `001–009` de aynı provada iki kez hatasız çalıştı (B1 README 4.3'ün yapılmayan yerel provasının karşılığı).
4. Ek denetimler: her dosya `BEGIN;` ile başlıyor, `COMMIT;` ile bitiyor; yasak ifade yok; her yeni tabloda RLS; mevcut tablolara varsayılansız NOT NULL kolon yok (`UretilenCikti.updatedAt` `DEFAULT CURRENT_TIMESTAMP`'li).

Birleştirici `schema.prisma`'yı güncelledikten sonra aynı iki komutu (validate ve `migrate diff`, `--from-schema-datamodel` git'teki eski şema) yeniden çalıştırmalı; çıktı bu klasördeki dosyalarla aynı olmalı.

### 5.2 Canlıya uyguladıktan sonra (salt-okunur)
```bash
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code
DATABASE_URL="$DIRECT_URL" npx prisma db pull --print > canli-icgozlem.prisma   # --print şart; schema.prisma'yı EZME
```
Beklenen: boş; tek istisna B1'in iki kısmi indeksi için `DROP INDEX` satırları (B1 README §4.2) — **asla uygulanmaz**. B2C kısmi indeks getirmez, CHECK ve RLS Prisma modelinde olmadığı için diff'te görünmez. `prisma db push` bu veritabanlarında yasak kalır.

## 6. Doğrulama sorguları (salt-okunur)

```sql
-- Önkoşul (uygulamadan ÖNCE): yetim bağ kalmamalı — hepsi 0
SELECT (SELECT count(*) FROM "Sure"  WHERE "arabuluculukId" IS NOT NULL) AS sure_arab,
       (SELECT count(*) FROM "Sure"  WHERE "davaId" IS NOT NULL)         AS sure_dava,
       (SELECT count(*) FROM "Belge" WHERE "davaId" IS NOT NULL)         AS belge_dava;

-- RLS kapalı tablo kalmamalı (0 satır)
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;

-- 12 yeni tablo
SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN
  ('Arabuluculuk','OnayKaydi','YolSecimi','Dava','DavaTaraf','DavaIslem','IhtiyatiHaciz',
   'MevzuatKaynak','DosyaKarti','DilekceSurum','DilekceSablon','UslupKurali');            -- 12

-- 21 CHECK (B2C)
SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND conname IN
  ('Arabuluculuk_tur_chk','Arabuluculuk_sonuc_chk','OnayKaydi_sonuc_chk','YolSecimi_asama_chk','YolSecimi_durum_chk',
   'Dava_rolumuz_chk','Dava_usul_chk','Dava_derece_chk','Dava_hukum_chk','DavaTaraf_teyit_chk','DavaIslem_teyit_chk',
   'IhtiyatiHaciz_asama_chk','IhtiyatiHaciz_sonuc_chk','IhtiyatiHaciz_teyit_chk','Etkinlik_teyit_chk',
   'MevzuatKaynak_durum_chk','MevzuatKaynak_etiket_chk','DosyaKarti_durum_chk',
   'DilekceSurum_kaynak_chk','DilekceSurum_durum_chk','UslupKurali_durum_chk');           -- 21

-- M7: alt kaydın dosyaId'si üstününkiyle aynı (hepsi 0) — S46 geri doldurmasından sonra da çalıştırılır
SELECT (SELECT count(*) FROM "Arabuluculuk" x JOIN "Asama" a ON a.id = x."asamaId" WHERE a."dosyaId" <> x."dosyaId") AS arab,
       (SELECT count(*) FROM "Dava" x JOIN "Asama" a ON a.id = x."asamaId" WHERE a."dosyaId" <> x."dosyaId")         AS dava,
       (SELECT count(*) FROM "DavaTaraf" x JOIN "Dava" d ON d.id = x."davaId" WHERE d."dosyaId" <> x."dosyaId")      AS taraf,
       (SELECT count(*) FROM "DavaIslem" x JOIN "Dava" d ON d.id = x."davaId" WHERE d."dosyaId" <> x."dosyaId")      AS islem,
       (SELECT count(*) FROM "IhtiyatiHaciz" x JOIN "Dava" d ON d.id = x."davaId" WHERE d."dosyaId" <> x."dosyaId")  AS ih,
       (SELECT count(*) FROM "DilekceSurum" x JOIN "UretilenCikti" c ON c.id = x."ciktiId" WHERE c."dosyaId" <> x."dosyaId") AS surum,
       (SELECT count(*) FROM "Sure" x JOIN "Dava" d ON d.id = x."davaId" WHERE d."dosyaId" <> x."dosyaId")           AS sure_dava,
       (SELECT count(*) FROM "Belge" x JOIN "Dava" d ON d.id = x."davaId" WHERE d."dosyaId" <> x."dosyaId")          AS belge_dava;

-- FK'siz bağlam kolonlarında yetim (bilgi amaçlı; 0 beklenir)
SELECT (SELECT count(*) FROM "Dava" x WHERE x."arabuluculukId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Arabuluculuk" a WHERE a.id = x."arabuluculukId")) AS dava_arab,
       (SELECT count(*) FROM "Masraf" x WHERE x."davaId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Dava" d WHERE d.id = x."davaId")) AS masraf_dava,
       (SELECT count(*) FROM "UretilenCikti" x WHERE x."davaId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Dava" d WHERE d.id = x."davaId")) AS cikti_dava;
```

## 7. Geri dönüş

**Olağan yol (07 §6.6):** kod geri alınır (Instant Rollback, bayraklar kapatılır: `YOL_HARITASI`, `DILEKCE_V2`, `ozellikler.hukuk`); **tablolar kalır**. Şema yalnız eklediği için eski kod yeni kolon ve tablolarla sorunsuz çalışır (eski `UretilenCikti` ve `Etkinlik` ekleme biçimleri provada denendi). Veri kaybı yok.

**Fiziksel geri alma** yalnız şu koşulların hepsi varsa: yeni tablo mutlaka kaldırılmalı; yeni tablolar **boş** ve eklenen kolonlarda veri yok; tam yedek alınmış; Berkan ve Yelda onaylamış; ilgili satırlar önce `schema.prisma`'dan çıkarılıp o kod deploy edilmiş. Betik `sql-uygula.mjs` korumasına bilerek takılır; elle, tek işlemde. Ters sırayla, yalnız geri alınacak dosyanın bloğu. **B1'den önce** çalıştırılmalı (B1 `Sure`/`Belge` kolonlarını kaldırırsa B2C FK'leri de düşer, ama sırayı bozmamak için önce B2C):

```sql
-- Boşluk denetimi (hepsi 0 olmalı)
SELECT (SELECT count(*) FROM "Arabuluculuk") a, (SELECT count(*) FROM "OnayKaydi") o, (SELECT count(*) FROM "YolSecimi") y,
       (SELECT count(*) FROM "Dava") d, (SELECT count(*) FROM "DavaTaraf") dt, (SELECT count(*) FROM "DavaIslem") di,
       (SELECT count(*) FROM "IhtiyatiHaciz") ih, (SELECT count(*) FROM "MevzuatKaynak") mk, (SELECT count(*) FROM "DosyaKarti") dk,
       (SELECT count(*) FROM "DilekceSurum") ds, (SELECT count(*) FROM "DilekceSablon") sb, (SELECT count(*) FROM "UslupKurali") uk,
       (SELECT count(*) FROM "RucuDosyasi" WHERE "kapanisSebebi" IS NOT NULL OR "kapanisAt" IS NOT NULL) kapanis,
       (SELECT count(*) FROM "Etkinlik" WHERE "kaynak" IS NOT NULL OR "teyit" IS NOT NULL) etkinlik,
       (SELECT count(*) FROM "UretilenCikti" WHERE "tur" IS NOT NULL OR "davaId" IS NOT NULL) cikti;

BEGIN;
-- 015
DROP TABLE IF EXISTS "DilekceSurum";
DROP TABLE IF EXISTS "DilekceSablon";
DROP TABLE IF EXISTS "UslupKurali";
ALTER TABLE "AiKullanim" DROP COLUMN IF EXISTS "onbellekOkunanToken", DROP COLUMN IF EXISTS "onbellekYazilanToken";
ALTER TABLE "UretilenCikti" DROP COLUMN IF EXISTS "tur", DROP COLUMN IF EXISTS "davaId", DROP COLUMN IF EXISTS "updatedAt",
  DROP COLUMN IF EXISTS "duzenleyenId", DROP COLUMN IF EXISTS "modelSurum";
-- 014
DROP TABLE IF EXISTS "DosyaKarti";
-- 013
DROP TABLE IF EXISTS "MevzuatKaynak";
-- 012
ALTER TABLE "RucuDosyasi" DROP COLUMN IF EXISTS "kapanisSebebi", DROP COLUMN IF EXISTS "kapanisAt", DROP COLUMN IF EXISTS "kapanisKaydedenId";
-- 011  (önce B1 tablolarındaki FK'ler; kolonlar B1'indir, kalır)
ALTER TABLE "Belge" DROP CONSTRAINT IF EXISTS "Belge_davaId_fkey";
ALTER TABLE "Sure"  DROP CONSTRAINT IF EXISTS "Sure_davaId_fkey";
DROP TABLE IF EXISTS "IhtiyatiHaciz";
DROP TABLE IF EXISTS "DavaIslem";
DROP TABLE IF EXISTS "DavaTaraf";
DROP TABLE IF EXISTS "Dava";
ALTER TABLE "Etkinlik" DROP COLUMN IF EXISTS "kaynak", DROP COLUMN IF EXISTS "kaynakBelgeId", DROP COLUMN IF EXISTS "teyit";  -- CHECK de düşer
ALTER TABLE "Masraf" DROP COLUMN IF EXISTS "davaId";
-- 010
ALTER TABLE "Sure" DROP CONSTRAINT IF EXISTS "Sure_arabuluculukId_fkey";
DROP TABLE IF EXISTS "YolSecimi";
DROP TABLE IF EXISTS "OnayKaydi";
DROP TABLE IF EXISTS "Arabuluculuk";
COMMIT;
```

## 8. Riskler ve açık noktalar

1. **B2 artık veritabanında B1'e bağlı** (`010`, `011`). Plan sırası zaten B1 → B2 (S45 ← S43); önkoşul bloğu yanlış sırayı anlaşılır hatayla durdurur. `012–015` bağımsız.
2. **RESTRICT'in yan etkisi:** uzantılı `Asama`, sürümlü `UretilenCikti` ve bunların dosyası fiziksel silinemez. Bugün böyle bir silme yolu yok; ileride yazılacak her silme `silindiAt` olmalı. `Dava` satırı ön kontrolde (`durum = HAZIRLIK`) açıldığı için `Asama(DAVA)` da dava açılmadan açılır: eski ekranlar aşamayı "Dava" sekmesinde `DEVAM` görür — S27 bunu `Asama.baslangic` boş ve etiketle ayırmalı.
3. **CHECK genişletilemez** (yalnız ekleme kuralı): `Arabuluculuk.sonuc` ve `Dava.hukum` için yeni değer gerekirse onaylı istisna gerekir. Değer listeleri `lib/sabitler` ile birebir tutulmalı; liste dışı yazım `23514 check_violation` verir.
4. **`MevzuatKaynak (musteriId, kunye)` tekil:** aynı maddenin iki yürürlük dönemi ayrı künyeyle yazılmalı (ör. "KTK m.97 (7327 s. K. öncesi)"). Plan S33'ün anahtar kararıdır; bilgi bankası yazımı buna uymalı.
5. **`Belge_davaId_fkey` eklenirken** `Belge` kısa süre yazmaya kilitlenir ve taranır (tüm `davaId` NULL olduğundan hızlı); `lock_timeout 5s` kuyruğu önler.
6. **`UretilenCikti.updatedAt`** mevcut satırlarda uygulama anını alır (gerçek düzenleme zamanı değil); "son düzenleme" raporları geçiş gününden önceki değerleri dikkate almamalı.
7. **M7 veritabanında zorlanmıyor** (alt kaydın `dosyaId`'si = üst kaydınki): yazma yardımcısı + kapsam testi + bölüm 6'daki sorgu. İleride sertleştirme: `Dava @@unique([id, dosyaId])` + bileşik FK (Prisma destekler; bu taslakta yapılmadı).
8. **Taslak ekleri onay bekliyor**, en büyüğü `YolSecimi` tablosu (06'da yok; AR-01/AR-02/SN-02 için gerekli bulundu). Kabul edilmezse yol kararı `OnayKaydi` üzerinden türetilmek zorunda kalır ve AR-01 ile AR-02 ayrışmaz.
9. **SN-08 "müvekkile bildirilmedi"** için ayrı tablo açılmadı: bildirim izi `Aktivite` (eylem + `detayJson.kaynakId`) ile tutulacak varsayıldı. Bugün masası bunu 431 dosyada sık sorgularsa ayrı bir `MusteriBildirim` tablosu (Dalga C'ye ya da sonraya) gerekir.
10. **Ertelenen modeller:** "ilgili dosya" (ceza/soruşturma, diğer davalar) ve "zarar gören / hak sahipleri" (bölüm 2.5). ZMSS dava şablonu (D2 ailesi) bunları `AlanDegeri`'nden okur; yapısal alan istenirse yeni bir SQL numarası (016+) gerekir — 06 §3.4'te ayrılmış numara yok.
11. **FK'siz bağlam kolonları** (`Dava.ustDavaId`, `Dava.arabuluculukId`, `Masraf.davaId` …) yetim kalabilir; bölüm 6 sorgusu bulur. `ustDavaId`'nin yönü (ilk derece → üst mahkeme) açık karar 12 ile netleşmeli.
12. **B1 taslağı hâlâ değişebilir:** bu taslak `b1.prisma`'nın 17:18 sürümüyle doğrulandı. B1 `Sure.davaId`, `Sure.arabuluculukId`, `Belge.davaId` adlarını ya da tiplerini değiştirirse bölüm 5.1 yeniden çalıştırılmalı.

## 9. Dilim ajanlarına notlar
- `schema.prisma`'ya dilim birleşirken yalnız kendi `01N` etiketli satırlarını taşır (bölgelerde her satırın ya da grubun başında, yeni modellerde bloğun üstündeki `// ── 01N · SNN` başlığında yazar). `Sure`/`Belge` ilişki satırları, B1 bu modelleri `schema.prisma`'ya taşımadan taşınamaz.
- Her şema dilimi kendi `prisma/seed/NNN_*.mjs` modülünü ve iki müvekkilli kapsam testini yazar (07 §0.2); alt kayıtlarda (`DavaTaraf`, `DavaIslem`, `IhtiyatiHaciz`, `DilekceSurum`) `dosyaId` kapsamı ayrıca sınanır.
- Hukuki kayıt listelerinde her sorguda `silindiAt: null`; kütüphanelerde `aktif: true` / `durum` süzgeci.
- `Arabuluculuk.tur` ve `Dava.usul` için **varsayılan yok**; boşken ilgili adım açılmaz (açık karar 3; YR-02).
- `Arabuluculuk.sonTutanakTarihi`'ne "bugün" varsayılmaz, ileri tarih reddedilir (B02) — uygulama denetler, DB değil.
- Karar kolonlarına (`Dava.hukum`, `kabulAsil` …) yalnız avukat onayıyla yazılır; öneri `AlanDegeri`'ndedir.
- Süre, faiz, tebliğ ve mahkeme kuralları "teyit gerekli"dir; bu şema hiçbir hukuki kural kodlamaz, yalnız alan açar.
