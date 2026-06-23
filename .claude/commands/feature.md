---
description: Bir özelliği uçtan uca planlar ve kurar (şema + veri + aksiyon + ekran(lar) + doğrulama). Üst seviye orkestratör.
argument-hint: "[özellik-adı] [kısa açıklama]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Özellik kur: $ARGUMENTS

Konsrucu için bütün bir özelliği (dikey dilim) baştan sona, üretime hazır kur. `/dosya-ekrani` tek ekranı
kurar; bu komut **birden çok parçayı koordine eder**. Bağlam `CLAUDE.md`, şema `@prisma/schema.prisma` — önce oku.

## Adımlar
1. **Kapsamı çıkar:** Özelliği tek cümleyle yaz. Gereken parçaları listele: şema değişikliği var mı,
   hangi veriler (sorgular), hangi mutasyonlar (server action), kaç ekran, AI/çıkarım gerekiyor mu, rapor mu.
   Durum pipeline'ına dokunup dokunmadığını belirt.
2. **Plan + onay noktası:** Oluşturulacak/değişecek dosyaların listesini ve 4-8 adımlık planı yaz.
   Yıkıcı ya da belirsiz bir şey varsa **dur ve sor**; değilse plana sadık kalarak devam et.
3. **Şema (gerekirse):** Tek alan lazımsa `/prisma-alan`, yeni model/ilişki lazımsa `/db` yaklaşımıyla
   **additive** ekle. Yıkıcı işlem yapma.
4. **Veri + aksiyon:** Okumayı Server Component'te Prisma ile, **`musteriId` tenant kapsamı** ve auth zorunlu
   yap. Mutasyonları server action olarak yaz, **zod** ile doğrula, sonunda `revalidatePath`.
   Para `Decimal`, tarih `DateTime`; gösterim `tr-TR` / `TRY`.
5. **Ekran(lar):** Her ekran için `/dosya-ekrani` standardını izle — mevcut design-system bileşenlerini
   (`components/konsrucu/ui.tsx`, brand, shell) kullan, yeni stil uydurma. Tüm state'ler: dolu/boş/yükleniyor/hata.
6. **AI / rapor (varsa):** Çıkarım gerekiyorsa `/ai-cikarim` kalıbı; raporlama gerekiyorsa `/rapor` kalıbı.
   Çıkarım sonucu durumu otomatik değiştirmez — öneri olarak işaretle.
7. **Doğrula:** `npm run lint && npx tsc --noEmit && npm run build`. Hataları düzelt.
8. **Özet:** Oluşturulan/değişen dosyalar, rota(lar) ve adım adım test talimatı.

## Kurallar
- Özellik dışındaki kodu refactor etme (istenmedikçe). Değişiklik kapsamı dar kalsın.
- Service-role anahtarı asla client'a sızmaz; TC/telefon gibi PII auth arkasında ve gerektiği kadar.
- Eksik bir şema alanı şartsa durma; neyin gerektiğini söyle ve additive ekle.
