# Dalga B1 şeması: SQL `001–009` (TASLAK)

**Durum:** Taslak. Canlıya **uygulanmadı**; `prisma/schema.prisma` **değişmedi**.
**Model taslağı:** `prisma/taslak/b1.prisma` (yeni modeller + mevcut modellere eklenecek satırlar).
**Tasarım:** `rucu-hukuk-asistani/docs/06-ana-senaryo-tasarimi.md` §3.1–3.4 · **Plan:** `07-uygulama-plani.md` S13–S24, §6.3, §6.6.
**Ortam notu:** Staging yok (Berkan'ın kararı). Plandaki S41 "staging provası"nın yerini aşağıdaki çevrimdışı doğrulama (bölüm 4) ve isteğe bağlı yerel prova (4.3) alır; canlıya SQL'i Berkan uygular.

> Plan dosyaları `prisma/sql/NNN_*.sql` diye anıyor; bu taslakta aynı numaralar `prisma/sql/b1/` altında. S01'in `sql-uygula.mjs` aracı bu alt klasörü de kabul etmeli ya da dosyalar birleştirmede bir üst klasöre taşınmalı.

---

## 1. Dosyalar ve dilimler

| Sıra | Dosya | Dilim | Yeni tablo | Mevcut tabloya ek | CHECK |
|---|---|---|---|---|---|
| 1 | `001_veri_onarim.sql` | S13 Veri Onarımı | `VeriOnarim`, `DurumGecisi` (iz kayıtları) | `RucuDosyasi.onarimDurumu` | 7 |
| 2 | `002_eklenti_anahtar.sql` | S14 Kimlik ve yetki | `EklentiAnahtar` | — | — |
| 3 | `003_aday_olay_eksen.sql` | S15 Aday olaylar, üç eksen (S23 de kullanır) | `BorcluTakip` | `TakipOlayi` 13 kolon (`tekilAnahtar` dahil), `Borclu` 3 kolon, `RucuDosyasi` 7 kolon (eksenler, `yolOnaylayanId`, `yolOnayAt`) | 4 |
| 4 | `004_evrak_metin.sql` | S16 Evrak metin hattı (S17 de kullanır) | `BelgeSayfa` | `Belge` 18 kolon | 1 |
| 5 | `005_alan_degeri.sql` | S18 Öneri kartları, alan kilidi (S19 de kullanır) | `AlanDegeri` + kısmi tekil indeks | `RucuDosyasi` 4 kolon (poliçe, `rucuSebebiKod`) | 2 |
| 6 | `006_yol_haritasi.sql` | S20 Yol Haritası | — | `RucuDosyasi.yolHaritasiJson` | — |
| 7 | `007_takip_talebi.sql` | S21 Takip talebi | `TakipTalebi` + kısmi tekil indeks | — | 2 |
| 8 | `008_senkron_is.sql` | S22 Anlık senkron | `SenkronIs`, `EklentiNabiz` | — | 1 |
| 9 | `009_sure.sql` | S24 Süre defteri | `Sure` | — | 1 |

Toplam: 10 yeni tablo (hepsinde RLS açık), 4 mevcut tabloya 47 kolon (`RucuDosyasi` 13, `Belge` 18, `TakipOlayi` 13, `Borclu` 3), 28 indeks (2'si kısmi), 15 FK, 18 CHECK.
**Enum değişikliği yok** (06 §3.1 ilke 2: yeni tür/durum alanları `String`); bu yüzden ayrı `ADD VALUE` dosyası da yok.

Her dosya:
- `BEGIN;` ile başlar, `COMMIT;` ile biter; yarıda hata olursa hiçbir değişiklik kalmaz.
- Yalnız ekler: `CREATE TABLE`, `ADD COLUMN` (boş bırakılabilir ya da varsayılanlı), `CREATE INDEX`, FK, CHECK, `ENABLE ROW LEVEL SECURITY`. Kolon silme, yeniden adlandırma, tip değiştirme, NOT NULL'a çevirme, veri güncelleme, `CONCURRENTLY` yok. (`ON UPDATE CASCADE` / `ON DELETE …` FK eylemidir, veri güncellemesi değildir.)
- Tekrar çalıştırılabilir: `IF NOT EXISTS`; FK ve CHECK için `pg_constraint` denetimli `DO $$ … $$` bloğu (Postgres'te `ADD CONSTRAINT IF NOT EXISTS` yok).
- `SET LOCAL lock_timeout = '5s'`: kilit 5 saniyede alınamazsa işlem geri sarılır, canlı trafik kuyruğa girmez. Hata "lock timeout" ise birkaç saniye sonra aynı dosya yeniden çalıştırılır.
- Yalnız **mevcut** tablolara dayanır (yeni tablolar birbirine FK vermez). Önerilen sıra numara sırasıdır; bir dilim hazır olunca kendi dosyası tek başına da uygulanabilir.

Tablo ve kolon adları Prisma'nın üreteceği adlarla birebir (bölüm 4.1'de makineyle karşılaştırıldı): `String`→`TEXT`, `DateTime`→`TIMESTAMP(3)`, `Decimal(14,2)`→`DECIMAL(14,2)`, `Json`→`JSONB`, `Float`→`DOUBLE PRECISION`, `String[] @default([])`→`TEXT[] DEFAULT ARRAY[]::TEXT[]`, `@default(now())`→`DEFAULT CURRENT_TIMESTAMP`, `@updatedAt`→ DB varsayılanı yok. uuid'ler uygulamada üretilir.

## 2. Tasarım kararları (06'ya göre)

**Silme sınıfları (06 §3.1 ilke 5):**
- Hukuki kayıt (`ON DELETE RESTRICT` + `silindiAt`): `BorcluTakip`, `AlanDegeri`, `TakipTalebi`, `Sure`.
- İz kaydı (`RESTRICT`, yalnız eklenir): `VeriOnarim`, `DurumGecisi`.
- İşletim kaydı (`CASCADE`): `BelgeSayfa`, `SenkronIs`, `EklentiNabiz`. `EklentiAnahtar` da `CASCADE` (kiracı ya da kişi silinirse anahtar yaşamamalı).
- Sonuç: hukuki ya da iz kaydı olan bir dosya (ve takip kaydı olan bir borçlu) fiziksel silinemez. Kodda `rucuDosyasi.delete` yok; `borclu.delete` var (`app/(app)/akilli-giris/actions.ts` → `borcluSil`; HEAD'de ayrıca `aiCikar` içinde `borclu.deleteMany`, çalışma kopyasında S07 ile kalkıyor) → `BorcluTakip`'i olan borçlu silinmek istenirse P2003 (FK) hatası döner. S18 bu yolu "yalnız takip/dava kaydı olmayan teyitsiz borçlular" diye daraltır; o zamana kadar bu hata yakalanıp kullanıcıya anlatılmalı.

**CHECK kısıtları (06 §3.1 ilke 2):** Yalnız **kapalı** durum makinelerinde ve KVKK kapısında var (`VeriOnarim.islem/durum/guvenSinifi`, `DurumGecisi.eksen/teyit/kaynakTuru`, `RucuDosyasi.onarimDurumu`, `TakipOlayi.teyit`, `Borclu.tur`, `BorcluTakip.tebligSonucu/itirazTipi`, `Belge.aiIzni`, `AlanDegeri.durum/kaynakTuru`, `TakipTalebi.kaynak/faizBaslangicTuru`, `SenkronIs.durum`, `Sure.durum`). Büyüyebilecek listelerde (`TakipOlayi.altTip`, eksenler, `Belge.altTur/metinDurumu`, `Sure.tur`, `SenkronIs.tur`, `TakipTalebi.faizTuru`) CHECK **bilerek yok**, değerler yalnız `lib/sabitler/*.ts`'de: bir CHECK'i genişletmek kısıtı kaldırıp yeniden eklemeyi gerektirir, bu da "yalnız ekleme" kuralına ve `sql-uygula.mjs`'in korumasına takılır (ayrı onaylı istisna ister). Değer listeleri `b1.prisma`'daki yorumlarla aynıdır; dilim ajanları `lib/sabitler`'i bunlarla aynı tutmalı.

**Kısmi tekil indeksler:** Prisma 6.19 kısmi indeksi şemada ifade edemez, bu iki indeks yalnız SQL'de yaşar:
- `AlanDegeri_dosyaId_alan_onayli_key`: `("dosyaId","alan") WHERE durum = 'ONAYLI' AND "silindiAt" IS NULL` → dosya + alan başına tek onaylı değer (alan kilidi; iki sekme yarışında ikinci onay P2002 → "az önce onaylandı").
- `TakipTalebi_dosyaId_gecerli_key`: `("dosyaId") WHERE gecerli = true AND "silindiAt" IS NULL` → dosya başına tek geçerli takip talebi. Yeni sürümde önce eskisi `gecerli=false`, sonra yenisi eklenir (aynı işlemde).
- 06 yalnız `durum`/`gecerli` koşulunu yazıyor; `silindiAt IS NULL` eklendi (silinmiş satır kilidi tutmasın).
- **Uyarı:** `prisma db push` bu iki indeksi **siler** (şemada yoklar). Bu veritabanlarında `db push` yasak kalmalı.

**06'da olmayan taslak ekleri** (hepsi boş bırakılabilir ya da yalnız indeks; dilim ajanı istemezse birleştirmeden önce çıkarılır):

| Ek | Neden |
|---|---|
| `TakipOlayi.tekilAnahtar` + `@@unique([dosyaId, tekilAnahtar])` | S15'in tekilleştirme anahtarının DB savunma hattı (eşzamanlı iki senkron aynı adayı iki kez açamaz); `OnemliOlay.tekilAnahtar`, `Masraf.kaynakRef` ile aynı desen. Eski satırlarda NULL → çakışmaz. |
| `TakipTalebi @@unique([dosyaId, surum])` | Eşzamanlı "yeni sürüm" yarışında aynı sürüm numarası iki kez açılmaz. |
| `SenkronIs.updatedAt` + `@@index([durum, updatedAt])` | S22 sağlık cron'u "5 dk hareketsiz → ZAMAN_ASIMI" ölçüsünü toplam süreyle değil son adımla yapar. |
| `SenkronIs.anahtarId`, `EklentiNabiz.anahtarId` | İşi/nabzı hangi kişisel anahtarın gönderdiği (B51 izi). |
| `BelgeSayfa.dosya` FK, `VeriOnarim.musteri` FK, `EklentiAnahtar`/`SenkronIs`/`EklentiNabiz` → `Musteri` FK, `EklentiAnahtar` → `Kullanici` FK | Referans bütünlüğü; ayrıca 06 §3.1'in `dosya: { musteriId: … }` kapsam sorgusu için `dosya` ilişkisi şart. |
| `createdAt`: `BorcluTakip`, `BelgeSayfa`, `EklentiNabiz` | İz ve hata ayıklama. |
| İndeksler: `RucuDosyasi(musteriId, icraEksen)`, `Belge(dosyaId, uyapBirimEvrakNo)`, `Belge(metinDurumu)`, `VeriOnarim(dosyaId)`, `VeriOnarim(musteriId, kod, durum)`, `EklentiAnahtar(kullaniciId)` | Eksen listeleri (S43 sonrası), UYAP evrak dedup'u, evrak kuyruğu, FK aramaları, onarım ekranı. |

**B2'ye bırakılan bağlar:** `Belge.davaId`, `Sure.davaId`, `Sure.arabuluculukId` düz kolon; `Dava` ve `Arabuluculuk` tabloları `010–011` ile gelince FK önerisi o dosyalara aittir.

## 3. Uygulama (canlı; Berkan)

1. **Yedek** (07 §6.2): `pg_dump --format=custom` tam döküm + `npm run yedek` (Storage). Geçişten önceki canlı deploy kimliğini not et.
2. **Önizleme:** her dosyayı gözle oku; bölüm 4.1'in çevrimdışı karşılaştırması temiz olmalı.
3. **Uygula** (numara sırasıyla, her dosya kendi işlemi; oturum havuzu `DIRECT_URL` 5432 ile ve mevcut tabloları oluşturan rolle — Supabase'de `postgres`. Yeni tablolar mevcutlar gibi o role ait olmalı ki uygulama RLS'ye takılmasın):
   ```bash
   npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/b1/001_veri_onarim.sql
   # … 002 … 009
   # ya da: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/b1/001_veri_onarim.sql
   # (psql'e --single-transaction VERME: dosya kendi BEGIN/COMMIT'ini taşıyor)
   ```
   S01'in aracı hazırsa: `node prisma/araclar/sql-uygula.mjs --hedef canli --dosya b1/001_veri_onarim.sql`.
4. Her dosyadan sonra RLS denetimi (`npm run rls:kontrol` hazırsa o; değilse bölüm 5'teki ilk sorgu → 0 satır).
5. **Önce SQL, sonra kod** (07 §6.3 madde 5): şema yalnız eklediği için eski kod yeni kolonları görmez. `schema.prisma`'ya yalnız **canlıya uygulanmış** dosyaların satırları taşınır; kolonu DB'de olmayan bir alan `schema.prisma`'ya girerse Prisma o modelin her sorgusunda o kolonu ister ve sorgu kırılır.

## 4. Doğrulama

### 4.1 Çevrimdışı (veritabanı yok) — bu taslakta yapıldı

1. Mevcut şema + taslak geçici bir dosyada birleştirildi (`// model X'(y)e eklenecek` bölgelerindeki satırlar ilgili modelin gövdesine, bölge dışı modeller sona).
2. `npx prisma validate --schema <geçici birleşik>` → geçerli. Aynı doğrulama **her dosya için ayrı ayrı** yapıldı (yalnız `00N` etiketli satırlarla birleştirme) → dokuz ara durumun hepsi geçerli; dilimler tek tek birleştirilebilir.
3. `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel <geçici birleşik> --script` (iki dosya arası, bağlantısız) Prisma'nın üreteceği SQL'i verdi; bu SQL ile `001–009` makineyle karşılaştırıldı: 215 kolon tanımı, 10 tablo, 10 PK, 15 FK (eylemleriyle), 26 indeks adı ve kolonu birebir aynı. `001–009`'daki fazlalar yalnız 2 kısmi indeks, 18 CHECK ve 10 RLS satırı. Dosya bazında da (her `00N` kendi dilimiyle) aynı sonuç.
4. Ek denetimler: her dosya `BEGIN;` ile başlıyor, `COMMIT;` ile bitiyor; yasak ifade yok; her yeni tabloda RLS var; mevcut tablolara varsayılansız NOT NULL kolon yok; her `ADD COLUMN`/`CREATE` `IF NOT EXISTS`'li; her `ADD CONSTRAINT` `pg_constraint` denetimli.

Birleştirici `schema.prisma`'yı güncelledikten sonra aynı iki komutu (validate ve `migrate diff`, bu kez `--from-schema-datamodel` git'teki eski şema) yeniden çalıştırmalı; `migrate diff` çıktısı bu klasördeki dosyaların içeriğiyle aynı olmalı.

### 4.2 Canlıya uyguladıktan sonra (salt-okunur)

```bash
# a) Canlı şema ile birleşik şema arasındaki fark (yalnız okur, hiçbir şey uygulamaz)
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code
# b) İçgözlem çıktısını dosyaya yaz; schema.prisma'yı EZME (--print şart)
DATABASE_URL="$DIRECT_URL" npx prisma db pull --print > canli-icgozlem.prisma
```
- (a) Beklenen: boş. Görülebilecek **tek beklenen fark**: iki kısmi tekil indeks için `DROP INDEX` satırları (Prisma 6.19 kısmi indeksi şemada tutamaz). Bu satırlar **asla uygulanmaz**; başka bir satır varsa dur ve incele. CHECK kısıtları ve RLS Prisma'nın modelinde yoktur; diff'te beklenmez.
- (b) `db pull`, kısmi indeksleri koşulsuz `@@unique` diye gösterebilir, CHECK ve RLS için uyarı yorumu ekleyebilir; bunlar `schema.prisma`'ya **taşınmaz**. Karşılaştırma: `canli-icgozlem.prisma`'daki 10 yeni model ve eklenen alanlar `b1.prisma` ile aynı ad ve tipte olmalı. `db pull`'u `--print`'siz çalıştırma: `schema.prisma`'nın üzerine yazar.

### 4.3 İsteğe bağlı yerel prova (staging yerine)

Canlının yalnız yapısı (`pg_dump --schema-only`) tek kullanımlık yerel bir Postgres'e (ör. Docker) yüklenir; `001–009` **iki kez** çalıştırılır (ikinci çalıştırma hatasız ve değişikliksiz olmalı → tekrar çalıştırılabilirlik); sonra 4.2(a) o yerel URL ile boş çıkmalı. Bu taslakta yapılmadı (ortamda yerel Postgres yok).

## 5. Doğrulama sorguları (salt-okunur)

```sql
-- RLS kapalı tablo kalmamalı (0 satır)
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;

-- 10 yeni tablo var mı
SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN
  ('VeriOnarim','DurumGecisi','EklentiAnahtar','BorcluTakip','BelgeSayfa',
   'AlanDegeri','TakipTalebi','SenkronIs','EklentiNabiz','Sure');          -- 10

-- 18 CHECK kısıtı var mı
SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND conname LIKE '%\_chk';  -- 18

-- İki kısmi indeks
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname IN ('AlanDegeri_dosyaId_alan_onayli_key', 'TakipTalebi_dosyaId_gecerli_key');
```

## 6. Geri dönüş

**Olağan yol (07 §6.6):** kod geri alınır (Vercel Instant Rollback, bayraklar kapatılır); **tablolar kalır**. Şema yalnız eklediği için eski kod yeni kolon ve tablolarla sorunsuz çalışır. Veri kaybı yok.

**Fiziksel geri alma** yalnız şu koşulların hepsi varsa: yeni tablo mutlaka kaldırılmalı; yeni tablolar **boş** ve eklenen kolonlarda veri yok (aşağıdaki sayım 0); tam yedek alınmış; Berkan ve Yelda onaylamış; ilgili satırlar önce `schema.prisma`'dan çıkarılıp o kod deploy edilmiş. Bu betik `sql-uygula.mjs` korumasına bilerek takılır; elle, tek işlemde çalıştırılır. Ters sırayla, yalnız geri alınacak dosyanın bloğu:

```sql
-- Boşluk denetimi (hepsi 0 olmalı)
SELECT (SELECT count(*) FROM "Sure") AS sure, (SELECT count(*) FROM "SenkronIs") AS is_, (SELECT count(*) FROM "EklentiNabiz") AS nabiz,
       (SELECT count(*) FROM "TakipTalebi") AS talep, (SELECT count(*) FROM "AlanDegeri") AS alan, (SELECT count(*) FROM "BelgeSayfa") AS sayfa,
       (SELECT count(*) FROM "BorcluTakip") AS bt, (SELECT count(*) FROM "EklentiAnahtar") AS anahtar,
       (SELECT count(*) FROM "VeriOnarim") AS onarim, (SELECT count(*) FROM "DurumGecisi") AS gecis;

BEGIN;
-- 009
DROP TABLE IF EXISTS "Sure";
-- 008
DROP TABLE IF EXISTS "EklentiNabiz";
DROP TABLE IF EXISTS "SenkronIs";
-- 007
DROP TABLE IF EXISTS "TakipTalebi";
-- 006
ALTER TABLE "RucuDosyasi" DROP COLUMN IF EXISTS "yolHaritasiJson";
-- 005
DROP TABLE IF EXISTS "AlanDegeri";
ALTER TABLE "RucuDosyasi" DROP COLUMN IF EXISTS "policeNo", DROP COLUMN IF EXISTS "policeBaslangic",
  DROP COLUMN IF EXISTS "policeBitis", DROP COLUMN IF EXISTS "rucuSebebiKod";
-- 004  (kolon silinince o kolona bağlı indeks ve CHECK de düşer)
DROP TABLE IF EXISTS "BelgeSayfa";
ALTER TABLE "Belge" DROP COLUMN IF EXISTS "kaynak", DROP COLUMN IF EXISTS "altTur", DROP COLUMN IF EXISTS "uyapEvrakTuru",
  DROP COLUMN IF EXISTS "uyapBirimEvrakNo", DROP COLUMN IF EXISTS "uyapYon", DROP COLUMN IF EXISTS "uyapDosyaTuru",
  DROP COLUMN IF EXISTS "boyut", DROP COLUMN IF EXISTS "sayfaSayisi", DROP COLUMN IF EXISTS "icerikTarihi",
  DROP COLUMN IF EXISTS "metinDurumu", DROP COLUMN IF EXISTS "metinYontemi", DROP COLUMN IF EXISTS "metinGuven",
  DROP COLUMN IF EXISTS "okumaDeneme", DROP COLUMN IF EXISTS "okumaKilitAt", DROP COLUMN IF EXISTS "okumaHata",
  DROP COLUMN IF EXISTS "aiIzni", DROP COLUMN IF EXISTS "davaId", DROP COLUMN IF EXISTS "silindiAt";
-- 003
DROP TABLE IF EXISTS "BorcluTakip";
ALTER TABLE "TakipOlayi" DROP COLUMN IF EXISTS "altTip", DROP COLUMN IF EXISTS "borcluId", DROP COLUMN IF EXISTS "sonuc",
  DROP COLUMN IF EXISTS "tebligSekli", DROP COLUMN IF EXISTS "muhatap", DROP COLUMN IF EXISTS "hukukiTarih",
  DROP COLUMN IF EXISTS "teyit", DROP COLUMN IF EXISTS "kaynakTuru", DROP COLUMN IF EXISTS "kaynakBelgeId",
  DROP COLUMN IF EXISTS "kural", DROP COLUMN IF EXISTS "teyitEdenId", DROP COLUMN IF EXISTS "teyitAt",
  DROP COLUMN IF EXISTS "tekilAnahtar";
ALTER TABLE "Borclu" DROP COLUMN IF EXISTS "tur", DROP COLUMN IF EXISTS "rolKodlari", DROP COLUMN IF EXISTS "vekilJson";
ALTER TABLE "RucuDosyasi" DROP COLUMN IF EXISTS "icraEksen", DROP COLUMN IF EXISTS "arabEksen", DROP COLUMN IF EXISTS "davaEksen",
  DROP COLUMN IF EXISTS "eksenJson", DROP COLUMN IF EXISTS "eksenHesapAt", DROP COLUMN IF EXISTS "yolOnaylayanId",
  DROP COLUMN IF EXISTS "yolOnayAt";
-- 002
DROP TABLE IF EXISTS "EklentiAnahtar";
-- 001
DROP TABLE IF EXISTS "DurumGecisi";
DROP TABLE IF EXISTS "VeriOnarim";
ALTER TABLE "RucuDosyasi" DROP COLUMN IF EXISTS "onarimDurumu";
COMMIT;
```

Kolon silmek, o kolona o ana kadar yazılmış veriyi de siler (örn. `Borclu.tur`, `Belge.metinDurumu`): kolonlarda veri varsa fiziksel geri alma yapılmaz, olağan yol kullanılır.

## 7. Dilim ajanlarına notlar

- `schema.prisma`'ya dilim birleşirken yalnız kendi `00N` etiketli satırları taşınır (taslakta her satırın ya da bölümün başında yazar); SQL canlıya uygulanmadan taşınmaz.
- Her şema dilimi kendi `prisma/seed/NNN_*.mjs` modülünü ve iki müvekkilli kapsam testini yazar (07 §0.2 madde 2–3).
- M7: alt kaydın `dosyaId`'si üstününkiyle aynı olmalı (`BorcluTakip`↔`Borclu`, `BelgeSayfa`↔`Belge`); bunu yazma yardımcısı denetler, DB denetlemez.
- Hukuki kayıt listelerinde her sorguda `silindiAt: null` süzgeci.
- CHECK'li alanlara liste dışı değer yazmak veritabanı hatası verir (Postgres `23514 check_violation`); sabit listeler `lib/sabitler`'de bu dosyalarla aynı tutulur.
- Süre, faiz ve tebliğ kuralları "teyit gerekli"dir; bu şema hiçbir hukuki kural kodlamaz, yalnız alan açar.
