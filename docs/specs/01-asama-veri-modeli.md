# Spec 01 — Aşama Omurgası: Veri Modeli & Sözleşme

> Amaç: Tek `RucuDosyasi` (kalıcı hub) üstünde **biriken aşamalar** (İcra → Arabuluculuk → Dava → …)
> + **takvim olayları** (toplantı / duruşma / süre). Yeni dosya AÇILMAZ; aynı dosya ilerledikçe numara kazanır.

## 1. Temel ilke
- Kaynak-doğru hub: `RucuDosyasi`. Kimlik hep aynı (hukukDosyaNo / hasarDosyaNo).
- Dosya ilerledikçe **Aşama** eklenir; her aşama kendi numarasını taşır:
  - İcra Takibi → `icra takip no` (mevcut `icraDosyaNo`)
  - Arabuluculuk → `arabuluculuk başvuru no`
  - Dava → `dava esas no`
- "Güncel durum" = en son **DEVAM** eden aşama. Liste/filtre için `RucuDosyasi.durum` özet olarak senkron tutulur.

## 2. Yeni modeller (Prisma)

### `Asama` — dosyanın yaşam döngüsü adımı
```
model Asama {
  id        String   @id @default(uuid())
  dosyaId   String
  dosya     RucuDosyasi @relation(fields: [dosyaId], references: [id], onDelete: Cascade)
  tur       AsamaTur                 // ICRA_TAKIBI | ITIRAZ | ARABULUCULUK | DAVA | KARAR | INFAZ | TAHSIL
  durum     AsamaDurum @default(DEVAM)   // DEVAM | SONUCLANDI | IPTAL
  sonuc     String?                  // serbest + öngörülen: anlasildi|anlasilmadi|kismen|itiraz|kabul|ret|kesinlesti
  kimlikNo  String?                  // icra takip no / arabuluculuk no / dava esas no
  birim     String?                  // icra dairesi / arabuluculuk bürosu / mahkeme
  baslangic DateTime?
  bitis     DateTime?
  tutar     Decimal? @db.Decimal(14,2)   // arabuluculukta anlaşılan / davada talep
  ozet      String?  @db.Text
  detayJson Json?                    // türe özel alanlar (arabulucu adı/iletişim, bilirkişi, hakim…)
  sira      Int      @default(0)     // zaman çizelgesi sırası
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  etkinlikler Etkinlik[]
  @@index([dosyaId]) @@index([tur]) @@index([durum])
}
```

### `Etkinlik` — takvim (toplantı / duruşma / süre / hatırlatma)
```
model Etkinlik {
  id         String   @id @default(uuid())
  dosyaId    String
  dosya      RucuDosyasi @relation(fields: [dosyaId], references: [id], onDelete: Cascade)
  asamaId    String?                 // hangi aşamaya ait (ops.)
  asama      Asama?   @relation(fields: [asamaId], references: [id], onDelete: SetNull)
  tur        EtkinlikTur             // ARABULUCULUK_TOPLANTISI | DURUSMA | SURE | HATIRLATMA | GORUSME
  baslik     String
  baslar     DateTime
  biter      DateTime?
  tumGun     Boolean  @default(false)
  yer        String?                 // adliye/büro adresi
  online     Boolean  @default(false)
  durum      EtkinlikDurum @default(PLANLANDI)  // PLANLANDI | YAPILDI | ERTELENDI | IPTAL
  sonucNot   String?  @db.Text
  sorumluId  String?                 // atanan avukat (Kullanici)
  hatirlatmaDk Int?                  // baştan kaç dk önce hatırlat
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([dosyaId]) @@index([tur]) @@index([baslar]) @@index([durum])
}
```

### Enum'lar
```
enum AsamaTur     { ICRA_TAKIBI ITIRAZ ARABULUCULUK DAVA KARAR INFAZ TAHSIL }
enum AsamaDurum   { DEVAM SONUCLANDI IPTAL }
enum EtkinlikTur  { ARABULUCULUK_TOPLANTISI DURUSMA SURE HATIRLATMA GORUSME }
enum EtkinlikDurum{ PLANLANDI YAPILDI ERTELENDI IPTAL }
```

### `Tebligat` — PTT tebliğ + 7 gün itiraz takibi
```
model Tebligat {
  id           String   @id @default(uuid())
  dosyaId      String
  dosya        RucuDosyasi @relation(fields: [dosyaId], references: [id], onDelete: Cascade)
  asamaId      String?                 // genelde İcra aşaması
  tur          String                  // ODEME_EMRI | TEBLIGAT | DIGER
  pttBarkod    String?                 // PTT sorgu anahtarı
  muhatap      String?                 // tebliğ edilen taraf
  gonderim     DateTime?
  durum        TebligatDurum @default(YOLDA)  // YOLDA | TESLIM | IADE | BEKLEMEDE
  teslimTarihi DateTime?
  itirazSonTarihi DateTime?            // = teslimTarihi + 7 gün (hesaplanır)
  sonSorgu     DateTime?               // PTT API en son ne zaman soruldu
  hamJson      Json?                   // PTT yanıtı
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([dosyaId]) @@index([durum]) @@index([itirazSonTarihi])
}
```

### `Bildirim` — asistan bildirim & karar akışı
```
model Bildirim {
  id         String   @id @default(uuid())
  musteriId  String                    // tenant kapsamı
  dosyaId    String?
  dosya      RucuDosyasi? @relation(fields: [dosyaId], references: [id], onDelete: SetNull)
  tur        BildirimTur               // ITIRAZ_GELDI | TEBLIG_ULASTI | ITIRAZ_SURESI_YAKLASIYOR | KESINLESTI
                                       // | TOPLANTI_YAKLASIYOR | DURUSMA_YAKLASIYOR | YENI_DOSYA | ONEMLI_GELISME | TAHSILAT
  oncelik    BildirimOncelik @default(BILGI)  // KRITIK | UYARI | BILGI
  baslik     String
  mesaj      String?  @db.Text
  aksiyon    String?                   // aksiyonlu bildirim: "arabuluculuk_baslat" | "toplanti_planla" | "sure_onayla" | null
  link       String?                   // /akilli-giris/<id> vb.
  okundu     Boolean  @default(false)
  cozuldu    Boolean  @default(false)  // karar bekleyen → çözüldü
  createdAt  DateTime @default(now())
  @@index([musteriId, okundu]) @@index([dosyaId]) @@index([tur])
}
```

### Enum'lar (ek)
```
enum TebligatDurum   { YOLDA TESLIM IADE BEKLEMEDE }
enum BildirimTur     { ITIRAZ_GELDI TEBLIG_ULASTI ITIRAZ_SURESI_YAKLASIYOR KESINLESTI TOPLANTI_YAKLASIYOR DURUSMA_YAKLASIYOR YENI_DOSYA ONEMLI_GELISME TAHSILAT }
enum BildirimOncelik { KRITIK UYARI BILGI }
```

### `RucuDosyasi`'ye eklenecek
- `asamalar Asama[]` · `etkinlikler Etkinlik[]` · `tebligatlar Tebligat[]` · `bildirimler Bildirim[]`
- `DosyaDurum` enum'a **ARABULUCULUK** ve **DAVA** değerleri (liste filtresi için; aşama başlayınca senkron yazılır).

### Sıradaki Adım motoru (saf fonksiyon — DB değil)
`siradakiAdim(dosya): { aksiyon, oncelik, metin }` — kurallarla: tebliğ teslim→7 gün say · itiraz→arabuluculuk öner ·
arabuluculuk anlaşılmadı→dava öner · duruşma yaklaştı→hazırlık · zamanaşımı yakın→acele. Komuta Merkezi + liste kullanır.

## 3. Mevcut yapılarla ilişki
- `TakipOlayi` (UYAP senkron: DURUM/TAHSİLAT/TEBLİĞ/İTİRAZ) → İcra aşamasının olayları olarak **birleşik zaman çizelgesine** akar.
- `Not` → aynı çizelgede manuel notlar.
- Birleşik çizelge = `Asama` (başla/sonuçlan) + `Etkinlik` + `TakipOlayi` + `Not`, tarihe göre harmanlanır.

## 4. Aşama geçişleri (akış)
1. **İcra Takibi açıldı** (mevcut `takipAcildi`) → `Asama(ICRA_TAKIBI, kimlikNo=icraDosyaNo, DEVAM)`; `durum=TAKIP_ACILDI`.
2. **İtiraz geldi** → İcra aşaması `sonuc=itiraz`; dava şartı → `Asama(ARABULUCULUK, DEVAM)` başlat; `durum=ARABULUCULUK`.
3. **Arabuluculuk** → bir/çok `Etkinlik(ARABULUCULUK_TOPLANTISI)`; bitişte `asamaSonuclandir`:
   - `anlasildi` → `durum=TAHSIL/KAPANDI` (anlaşılan tutar);
   - `anlasilmadi` → "Dava'ya taşı" → `Asama(DAVA, DEVAM)`; `durum=DAVA`.
4. **Dava** → `kimlikNo=esas no`, `Etkinlik(DURUSMA)` duruşmalar; `KARAR` → `kesinlesti` → `INFAZ`/`TAHSIL`.

## 5. Server action sözleşmesi (lib/konsrucu + app actions)
Tümü: **auth zorunlu**, **tenant-kapsamlı** (`musteriId`), zod doğrulama, sonra `revalidatePath`. İmza taslakları:
- `asamaBaslat(dosyaId, tur, alanlar)` → yeni Asama (sira = mevcut max+1); gerekiyorsa `RucuDosyasi.durum` senkron.
- `asamaGuncelle(asamaId, alanlar)` · `asamaSonuclandir(asamaId, { sonuc, bitis, sonrakiAsama? })` (sonrakiAsama verilirse zincir kur).
- `etkinlikKaydet(dosyaId, alanlar)` · `etkinlikGuncelle(id, alanlar)` · `etkinlikDurumDegistir(id, durum, sonucNot?)` · `etkinlikSil(id)`.
- Sorgu yardımcıları (takvim için): `etkinlikleriGetir({ tur?, baslangic, bitis, sorumluId? })` — tenant-kapsamlı.

## 6. Açık kararlar
- [ ] `DosyaDurum` enum'u genişletmek mi (ARABULUCULUK/DAVA) yoksa durumu hep Asama'dan türetmek mi? (öneri: genişlet + senkron)
- [ ] Süre/deadline (itiraz süresi, zamanaşımı) `Etkinlik(SURE)` olarak mı, yoksa hesaplanan sanal mı? (öneri: önemli olanları Etkinlik'e yaz, zamanaşımı zaten dosyada)
- [ ] Arabuluculuk/Dava türe-özel alanları `detayJson`'da mı, ayrı kolonlarda mı? (öneri: önce detayJson, sık kullanılan netleşince kolon)
