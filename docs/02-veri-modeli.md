# 02 — Veri Modeli

> Kanonik kaynak: [`../prisma/schema.prisma`](../prisma/schema.prisma). Bu döküman *neden*'i anlatır.
> Zemin: [`00-mimari-ve-yol-haritasi.md`](00-mimari-ve-yol-haritasi.md).

---

## 1. Ana Kararlar

- **Çok kiracılı (tenant = `Musteri` = sigortacı).** Ray Sigorta bugün; Zurich vb. yarın. Her `RucuDosyasi` bir Müşteri'ye bağlı.
- **`Ayarlar` (Şirket Bilgileri) her Müşteri'ye ayrı** — MERSİS, alacaklı ünvan, vekil/IBAN/KEP, açıklama footer, faiz oranları. Kodda/repoda **sabit yok**.
- **`Kullanici` ↔ `Musteri` = M:N** (`MusteriKullanici`) — konstraERP'deki proje-kullanıcı gibi: hangi personel hangi sigortacıya bakıyor.
- **Login = Supabase Auth.** `Kullanici.id` = `auth.users.id` (uuid). Şifreleri Supabase yönetir; Prisma sadece profil/rol tutar.
- **`RucuDosyasi` = kalıcı tam kayıt (hub).** Her şey ona asılı; Dosya Detay (modül 03) bunu gösterir.

## 2. Entity Haritası

```
Musteri 1─1 Ayarlar
Musteri 1─N RucuDosyasi
Musteri N─N Kullanici            (MusteriKullanici)

RucuDosyasi 1─N Borclu           (çoklu/müteselsil; rol + kaynak + teyitDurumu)
RucuDosyasi 1─N Odeme            (anaOdemeMi = faiz başlangıcı)
RucuDosyasi 1─N Belge            (kategori + storagePath + extractedText + exif/confidence)
RucuDosyasi 1─N UretilenCikti    (TAKIP_BLOGU | DILEKCE | BILGILER_JSON)
RucuDosyasi 1─N TakipOlayi       (UYAP: durum/tahsilat/tebliğ/itiraz — izleme)
RucuDosyasi 1─N Not / Aktivite   (notlar + "kim ne zaman ne yaptı" audit)

UretilenCikti N─N Belge          (CiktiKaynak — ham evrak ↔ dilekçe ÇİFT YÖNLÜ BAĞ)
```

## 3. Tasarım Notları

- **Triyaj:** `RucuDosyasi.yol` (KLASIK | IDARI) + `durum` (state machine, §00). Akıllı Giriş bunu yazar; idariyse dilekçe modülüne yönlendirir.
- **Çıkarım izi:** sık sorgulanan alanlar gerçek kolon; tam köken (value + confidence + sourceRef) `cikarimJson` (Json) içinde → hem hızlı filtre hem tam izlenebilirlik.
- **Çift yönlü bağ:** `CiktiKaynak` join'i üretilen dilekçeyi kaynak ham evraklara bağlar (dilekçe→evrak ve evrak→dilekçe gezilebilir).
- **Audit:** `Aktivite` = Yelda 3-4 hafta sonra açınca "kim ne zaman ne yaptı"yı görür.
- **Para:** `Decimal(14,2)`. **Tarih:** `DateTime`. **Storage:** Supabase Storage yolu (`Belge.storagePath`).

## 4. Açık Kararlar

- [ ] Roller yeterli mi: `ADMIN / AVUKAT / AVUKAT_YRD / GORUNTULEYEN`?
- [ ] `Kullanici↔Musteri` M:N kalsın mı, yoksa şimdilik herkes tüm müşterileri görsün mü (4 kişi)?
- [ ] Faiz oranları: `Ayarlar.faizJson` mı, ayrı `FaizOrani` tablosu mu (dönemsel)?
- [ ] RLS politikaları: müşteri bazlı izolasyon ne zaman (07-izleme/08-güvenlik fazı)?
