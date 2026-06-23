---
name: veri-guvenlik
description: KonsRücü veri ve güvenlik kuralları — tenant kapsamı, Supabase/Prisma kalıpları, server action deseni, RLS, service-role güvenliği, para/tarih konvansiyonu, PII. Veri, sorgu, mutasyon, Prisma, Supabase, auth ya da server action ile ilgili her işte uygula.
---

# KonsRücü — Veri & Güvenlik

Veriye dokunan her işte bunu uygula. Gerçek şema her zaman `@prisma/schema.prisma`'dadır — varsayma, oku.

## Mimari
- **Next.js App Router.** Okuma **Server Component**'te Prisma ile (`lib/prisma.ts` tekil örnek; DATABASE_URL = Supabase pooler 6543).
- **Mutasyon = Server Action** (`'use server'`): girdiyi **`zod`** ile doğrula → işle → sonunda `revalidatePath`.
  Para `Decimal`, tarih `DateTime`. Mutasyonu `app/.../actions.ts` veya `lib/` altında tut.

## Tenant & auth (kritik)
- **Her sorgu `musteriId` ile kapsanır** (aktif tenant = Ray Sigorta). Tenant'lar arası satır asla dönmez.
- **Auth zorunlu** (Supabase Auth). Roller: `ADMIN` (Yelda), `AVUKAT_YRD` (Sude), `AVUKAT`, `GORUNTULEYEN`.

## Supabase istemcileri (`lib/supabase/`)
- `server.ts` — RSC/server action, cookie tabanlı. `client.ts` — tarayıcı, **yalnızca anon key**.
- `admin.ts` — **service-role; YALNIZCA server.** Asla client component'e import etme, bundle'a sızdırma.
- `middleware.ts` — oturum yenileme. `SUPABASE_SERVICE_ROLE_KEY` ve `ANTHROPIC_API_KEY` server-only kalır.

## Veri konvansiyonu
- Para: `Decimal @db.Decimal(14,2)`; sınırda number/string'e dikkatle çevir. Gösterim `tr-TR`, birim **TRY**.
- Tarih: `DateTime`; gösterim `tr-TR`. Esnek meta: `Json?` (ör. `cikarimJson`, `kaynakJson`).
- **Enum'lar Türkçe UPPER_SNAKE** — mevcutları kullan, paralel string state icat etme:
  `DosyaDurum`, `Brans` (KASKO/ZMMS/OTO_DISI), `BorcluRol`, `TeyitDurum`, `BelgeKategori`, `CiktiTip`, `Rol`, `Yol`.

## PII & gizlilik
- TC/VKN, telefon, adres, evrak metni **server'da kalır**; client'a yalnızca gereken minimum, auth arkasında gider.
- AI çıkarımı (`@anthropic-ai/sdk`, server-side) tek doğru kaynak değildir → teyit gerektiren alanları işaretle (`TEYIT_GEREK`).

## Durum pipeline'ı
`HAVUZDA → INCELENIYOR → TAKIBE_HAZIR → TAKIP_ACILDI → TEBLIG_EDILDI → ITIRAZ → KESINLESTI → TAHSIL / KAPANDI / IDARI_YOL`
- Çıkarım/öneri **durumu otomatik değiştirmez**; kullanıcı onayına bırak.
- Zamanaşımı: takip açılmış dosyada kesilmiş sayılır; asıl risk HAVUZDA/INCELENIYOR/TAKIBE_HAZIR olup süresi yaklaşanlar.

## Prisma değişiklikleri
- Yalnızca **additive** (`/db` veya `/prisma-alan`). Yıkıcı işlem (silme/yeniden adlandırma/tip daraltma) açık onay olmadan **yok**.
