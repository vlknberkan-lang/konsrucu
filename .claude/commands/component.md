---
description: Design-system'e uygun yeni, yeniden kullanılabilir bir UI bileşeni üretir (token'lar + erişilebilirlik + opsiyonel design-sync).
argument-hint: "[BilesenAdi] [ne işe yarar]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Bileşen üret: $ARGUMENTS

Konsrucu için yeni bir **paylaşılan UI bileşeni** kur. Önce `design-system` skill'ini ve mevcut
primitifleri oku; yeni stil uydurma, var olan token ve desenleri kullan.

## Adımlar
1. **Keşfet:** `components/konsrucu/ui.tsx`'teki mevcut primitifleri (Badge, PageHeader, Conf, ConfBar,
   FlowStrip), `tailwind.config.ts` + `app/globals.css` token'larını oku. Benzer bir bileşen zaten varsa
   onu genişlet, yenisini yaratma.
2. **Yer:** Genel UI ise `components/konsrucu/ui.tsx` içine ekle; marka ise `components/brand/`, kabuk/şablon
   ise `components/shell/`. Saf sunum bileşeni; veri çekme yok (props ile veri al). İnteraktifse `'use client'`.
3. **Token'lar:** Renk/boşluk/tipografi/radius **yalnızca** semantic class'larla (`bg-card`, `text-foreground`,
   `bg-kr-soft text-kr-ink`, `text-muted-foreground`, `rounded-lg`...). Asla ham hex veya keyfi px yok.
   Dosya no/tarih → `font-mono`; başlık → `font-display`; durum → `Tone` renk kodu.
4. **API:** Tipli `Props`; mantıklı varsayılanlar. Mevcut konvansiyona uy (ör. `tone?: Tone`, `children`).
   Varyant/boyut ve etkileşim state'leri (hover, **görünür focus ring**, disabled) gerekiyorsa ekle.
5. **Erişilebilirlik:** Doğru semantic element, gereken `aria-*`, klavye erişimi, kontrast.
   `prefers-reduced-motion`'a saygılı animasyon.
6. **Design-sync (opsiyonel):** Bu bileşen Claude Design'a da yansısın isteniyorsa `.design-sync/ds-entry.tsx`
   re-export'una ve `config.json > componentSrcMap`'e ekle, sonra `ds-styles.css`'i yeniden derle.
   Backend'e bağlı (Prisma/Supabase/server action) bileşenleri bu kapsama **sokma**. Emin değilsen sor.
7. **Kullanım örneği:** Sonunda bileşenin kısa bir kullanım örneğini göster.

## Kurallar
- Design-system'de olmayan bir token/varyant gerekiyorsa **uydurma**; öner ve önce `app/globals.css` +
  `tailwind.config.ts`'e eklenmesi gerektiğini söyle (sonra `design-system` skill'ini güncelle).
- Türkçe kopya; bileşen metinleri cümle düzeninde.
