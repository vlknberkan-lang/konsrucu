---
description: Mevcut değişiklikleri Konsrucu konvansiyonlarına göre denetler (tenant, güvenlik, design-system, a11y). Kod değiştirmez.
argument-hint: "(ops.) odaklanılacak yol"
allowed-tools: Read, Bash, Grep, Glob
---

# Kod denetimi: $ARGUMENTS

Repodaki değişiklikleri gözden geçir. Bir yol verildiyse oraya odaklan. Bağlam `CLAUDE.md`,
şema `@prisma/schema.prisma`. **Bu komut yalnızca denetler — kodu değiştirme.**

Önce bağlamı topla: `git diff HEAD` ve `git status` çalıştır. Commit edilmemiş değişiklik yoksa son commit'i
veya verilen yolu incele.

## Öncelik sırasıyla denetle
1. **Doğruluk & tipler** — mantık hataları, eksik state'ler, `any`/güvensiz tip, ele alınmamış hata.
2. **Tenant & auth** — her sorgu `musteriId` kapsamında mı? Auth kontrolü var mı? Tenant'lar arası sızıntı?
3. **Güvenlik (Supabase)** — `lib/supabase/admin.ts` / service-role anahtarı client'a sızmış mı? RLS'e aykırı
   bir şey? Client girdisine körü körüne güvenen sorgu? TC/telefon gibi PII gereksiz client'a gidiyor mu?
4. **Veri konvansiyonu** — para `Decimal @db.Decimal(14,2)` mı, tarih `DateTime` mı, gösterim `tr-TR`/`TRY` mi?
   Mutasyon server action + `zod` + `revalidatePath` desenine uyuyor mu? Enum'lar mevcut Türkçe enum'lar mı?
5. **Design-system** — ham renk/px yerine token/semantic class mı? Mevcut bileşenler (Badge/PageHeader...)
   kullanılmış mı? Dosya no/tarih `font-mono` mu, durum renk kodu doğru mu?
6. **Erişilebilirlik & performans** — görünür focus, klavye, `prefers-reduced-motion`; gereksiz re-render, ölü kod.
7. **Prisma güvenliği** — migration yıkıcı işlem (kolon silme/tip daraltma) içeriyor mu? İçeriyorsa kırmızı bayrak.

## Çıktı
Bulguları şu etiketlerle, önceliklendirilmiş liste hâlinde ver:
- 🔴 **Engelleyici** — merge'den önce mutlaka düzeltilmeli
- 🟡 **Düzeltilmeli** — önemli ama engelleyici değil
- ⚪ **Ufak** — opsiyonel rötuş

Her bulgu için: dosya/satır, sorun ve somut düzeltme. **Kod yazma**; sadece açıkça istenirse düzelt.
