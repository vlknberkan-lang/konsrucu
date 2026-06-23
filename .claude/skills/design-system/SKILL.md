---
name: design-system
description: KonsRücü görsel tasarım sistemi — Cobalt Steel semantic token'ları, kr-teal aksanı, mevcut UI bileşenleri, fontlar, durum renk kodu ve design-sync uyumu. Herhangi bir UI (bileşen, ekran, layout, stil, Tailwind class) üretirken veya düzenlerken kullan; asla ham renk/keyfi stil uydurma, token kullan.
---

# KonsRücü Design System

Tüm UI işlerinde bunu uygula. Gereken bir token/desen yoksa keyfi stil yazma — on-system bir değer öner ve
`app/globals.css` + `tailwind.config.ts`'e eklenmesi gerektiğini söyle.

## 1. Önce mevcut bileşenleri kullan (`components/konsrucu/ui.tsx`)
Yeni bir şey yazmadan önce bunları yeniden kullan:
- **`Badge tone children`** — `tone: Tone = 'kr'|'info'|'success'|'warning'|'danger'|'steel'|'brand'`, ops. `dot`.
- **`PageHeader kicker title sub`** — sayfa başlığı (kicker `font-mono` etiket, title `font-display`).
- **`Conf c`** / **`ConfBar c`** — AI güven göstergesi (0-1); yüksek=success, orta=warning, düşük=danger.
- **`FlowStrip step`** — durum pipeline şeridi.
- Marka: `components/brand/` (KonsRucuMark, Wordmark). Kabuk: `components/shell/` (AppShell, GlobalHeader, Rail, Sidebar).

> Not: CLAUDE.md "components/ui/" der ama paylaşılan UI gerçekte `components/konsrucu/ui.tsx`'tedir.

## 2. Token'lar (kaynak: `app/globals.css` + `tailwind.config.ts`)
Renkler HSL kanalı → **semantic class kullan**, ham hex değil. Opaklık modifier'ı çalışır (`bg-kr/10`).
- **Yüzey/zemin:** `bg-background`, `text-foreground`, `bg-card`/`text-card-foreground`, `bg-surface`/`bg-surface-muted`, `bg-muted`/`text-muted-foreground`.
- **Aksan:** `primary`/`accent` = **cobalt** (ana eylem). `ring` = focus.
- **`kr` = teal aksanı → zeka/AI/çıkarım anlamı taşır:** `bg-kr`, `text-kr-ink`, `bg-kr-soft`. AI ile ilgili öğelerde kullan.
- **Durum:** `success`/`warning`/`danger`/`info` ve her birinin `-soft` zemini (ör. `bg-success-soft text-success`). `destructive` = yıkıcı eylem.
- **Kenarlık:** `border`, `border-subtle`, `input`.
- **Radius:** `rounded-sm/md/lg` (`--radius` 0.625rem), `rounded-xl` 12px, `rounded-2xl` 16px.
- **Gölge:** `shadow-card`, `shadow-pop`, `shadow-float`, `shadow-mock`.
- **Tipografi:** `font-display` (Hanken Grotesk · başlık), `font-wordmark` (Inter Tight), `font-body`/`font-sans` (Inter), `font-mono` (JetBrains Mono). Aralık: `tracking-brand` / `tracking-brand-tight` / `tracking-label`.

## 3. Desen kuralları
- **Dosya no, tarih, TC/VKN, tutar → `font-mono`.** Başlıklar `font-display font-extrabold`.
- **Durum her zaman renk kodlu** (uygun `Tone`/`-soft`). Tutarlı interaktif state: hover, **görünür focus ring**, disabled opaklığı.
- Türkçe kopya, cümle düzeni; butonlar yapılan işi söyler, akış boyunca aynı adı taşır.
- Light/dark her ikisi de desteklenir (`.dark`, next-themes `class`) — token'lar iki temayı da kapsar.

## 4. Layout yardımcıları (`app/globals.css`)
- **`.dd-grid` + `.dd-rail`** — dosya detay iki kolon (sağ rail yapışkan, 1080px altı tek kolona düşer).
- **`.dd-skel`** shimmer iskeleti, **`.dd-spin`** dönen yükleyici — her ikisi `prefers-reduced-motion`'da durur.
- Animasyonda `prefers-reduced-motion: reduce`'a saygı; geçişlerde `ease-out` token'ı.

## 5. Design-sync (Claude Design köprüsü)
11 bileşen `.design-sync/ds-entry.tsx` + `config.json > componentSrcMap` üzerinden Claude Design'a yansır
(projectId tasarım linkiyle aynı). Synced bir bileşenin API'sini değiştirir veya Design'a yansıyacak yeni bir
paylaşılan bileşen eklersen: `ds-entry.tsx` ve `componentSrcMap`'i güncelle, sonra `cfg.buildCmd` ile
`ds-styles.css`'i yeniden derle. **Backend'e bağlı** (Prisma/Supabase/server action) bileşenleri kapsama sokma —
şim'ler (`.design-sync/shims/`) yalnızca sınırlı API'leri taklit eder.
