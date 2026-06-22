---
description: Rapor üretir (durum/branş/tahsil/zamanaşımı) — sorgu + grafik + tablo + CSV dışa aktarma.
argument-hint: "[tür: durum|brans|tahsil|zamanasimi]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Rapor: $ARGUMENTS

Konsrucu için bir raporlama ekranı/uç noktası kur. Bağlam `CLAUDE.md`, şema `@prisma/schema.prisma`.

## Hazır rapor türleri
- **durum** — `durum` bazında dosya sayısı + toplam tutar.
- **brans** — KASKO / ZMMS / OTO_DISI dağılımı.
- **tahsil** — toplam rücu tutarı vs. toplam `Odeme`; tahsil oranı; aya göre tahsilat trendi.
- **zamanasimi** — yaklaşan zamanaşımı (0-30 / 0-90 gün) + geçmiş; **takip açılmış dosyalarda zamanaşımı
  kesilmiş sayılır**, asıl risk **HAVUZDA/INCELENIYOR/TAKIBE_HAZIR** olup süresi yaklaşanlar — bunu ayır.

## Adımlar
1. Veriyi **Prisma `groupBy`** veya gerekiyorsa bir SQL view ile, **`musteriId` kapsamında** topla.
2. Sayıları `tr-TR`, para `TRY` biçiminde sun. Tablolarda toplamlar ve yüzdeler olsun.
3. UI'da repodaki **chart kütüphanesi**yle grafik + altında tablo + tarih/durum/avukat filtreleri.
4. **CSV dışa aktarma** ekle (Excel'de açılabilir; UTF-8 BOM ile Türkçe karakter bozulmasın).
5. Boş/yükleniyor/hata state'leri; responsive; erişilebilir.
6. Doğrula: typecheck + lint + build; özet ver.

## Kural
- Rapor sayıları yanıltıcı olmasın: filtre/zaman aralığı her zaman görünür ve etikette yazılı olsun.
