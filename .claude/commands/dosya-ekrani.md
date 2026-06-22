---
description: Bir ekranı uçtan uca üretir (veri + server action + design-system UI + tüm state'ler).
argument-hint: "[ekran-adı] [kısa açıklama]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Ekran üret: $ARGUMENTS

Konsrucu için tek bir ekranı baştan sona, üretime hazır şekilde kur. Bağlam `CLAUDE.md`'dedir;
gerçek şema `@prisma/schema.prisma`'dadır — önce oku.

## Adımlar
1. **Keşfet:** `@prisma/schema.prisma`'dan ilgili modelleri, `components/ui/` + tailwind config'ten
   mevcut **design system**'i, ve benzer bir mevcut ekranı (varsa) oku. Yeni stil uydurma; var olanı kullan.
2. **Planla:** Ekranın tek işini, gereken veriyi (sorgular), aksiyonları (mutasyonlar) ve UI state'lerini
   (dolu / boş / yükleniyor / hata) bir cümleyle yaz. Onay beklemeden devam et ama plana sadık kal.
3. **Veri katmanı:** Server Component içinde Prisma ile veriyi çek; **`musteriId` ile tenant kapsamı** ve
   auth zorunlu. Liste ekranlarında arama/filtre/sıralama parametrelerini destekle.
4. **Aksiyonlar:** Mutasyonları `app/.../actions.ts` (veya `lib/actions/`) altında **server action** olarak
   yaz, **zod** ile doğrula, sonunda `revalidatePath`. Para Decimal, tarih DateTime.
5. **UI:** Design-system bileşenleriyle ekranı kur. Tablolarda dosya no/tarih monospace; durum renk kodu.
   Türkçe kopya, eylem-adlı butonlar. Boş durum = eyleme davet, hata = ne oldu + ne yapılmalı (özür yok).
6. **Kalite tabanı:** responsive, görünür focus, klavye erişimi, `prefers-reduced-motion`.
7. **Doğrula:** `npm run typecheck && npm run lint && npm run build` (yoksa uygun komutları bul). Hataları düzelt.
8. **Özet:** Oluşturulan/değişen dosyaları, rotayı ve nasıl test edileceğini kısaca yaz.

## Kurallar
- Şemada eksik alan gerekiyorsa **durma**; `/prisma-alan` ile eklenmesi gerektiğini belirt ve hangi alanların
  şart olduğunu listele (additive).
- TC/telefon gibi veriler client'a yalnızca gerektiğinde ve auth arkasında gider. Service-role anahtarı asla client'ta olmaz.
