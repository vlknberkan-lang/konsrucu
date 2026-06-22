---
description: Excel/.xls içe aktarma servisi kurar/günceller (kolon eşleme + hukukDosyaNo upsert + özet).
argument-hint: "[kaynak: hugo|ray] [dosya-yolu?]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# İçe aktarma servisi: $ARGUMENTS

Konsrucu'ya bir Excel/`.xls` içe aktarma akışı kur. Bağlam `CLAUDE.md`, şema `@prisma/schema.prisma`.

## Beklenen kaynak: Hugo tevdiye Excel'i
Kolonlar: `Gönderen Birim, Hukuk Dosya No, Hasar Dosya No, Hasar Tarihi, Zaman Aşımı, Rücu Sebebi,
Rücu Oranı, Rücu Tutarı, Dava Miktarı, Kadrolu Avukat, Sözleşmeli Avukat, İncelemeye Gönderen,
İnceleyen, Av. Yard. Gönderen, İşlem Yapan Av. Yard., Açıklama, Başlangıç Tarihi, Bitiş Tarihi, Durumu`.
**Borçlu/muhatap kolonu yoktur** (sonradan AI çıkarımıyla dolar).

## Adımlar
1. **Parse:** `.xls` + `.xlsx` destekle (ör. `xlsx`/SheetJS veya `node-xlsx`). Başlık satırını esnek bul,
   kolonları başlık adına göre eşle (sıra değişebilir).
2. **Normalize (TR):**
   - Para: `1.234.567,89` → number; **çok-değerli hücreyi topla** ("A + B" → A+B); aşırı/bozuk değer → null.
   - Tarih: `gg/aa/yyyy` → Date; **geçersiz tarih (ör. 36/03/2025) → null** (atma, patlatma).
   - Oran: `% 100` → text korunur.
3. **Eşle → şema:** kolonları `RucuDosyasi` alanlarına yaz (kadroluAvukat, sozlesmeliAvukat, islemYapanYrd,
   gonderenBirim, atanmaTarihi=Başlangıç, hugoDurum=Durumu, davaMiktari, vb.). Diğer kişi alanlarını `kaynakJson`'a koy.
4. **Upsert kuralı (kritik):** `hukukDosyaNo` ile eşleştir.
   - **Yeni** → oluştur: `durum=HAVUZDA`, `hugodanCekildi=false`, `musteriId`=aktif tenant.
   - **Mevcut** → mükerrer yaratma (varsayılan: atla; gerekiyorsa güvenli alanları güncelle).
5. **Sarmalar:** servisi `lib/import/` altında saf fonksiyon olarak yaz; bir **server action** + yükleme
   tetikleyicisi ekle. İşlem tek transaction veya batch'lerde, atomik olsun.
6. **Özet döndür:** `{ eklenen, atlanan, hatalı }` + hatalı satırların sebebi. UI'da "X yeni / Y mevcut" göster.
7. **Doğrula:** verdiğim örnek dosyayla (varsa `$2`) deneme çalıştır; typecheck + lint + build.

## Kurallar
- Import asla mevcut dosyayı sessizce ezmesin. Hatalı satır tüm partiyi düşürmesin; raporla, devam et.
