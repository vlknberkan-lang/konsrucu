# Konsrucu — Proje Bağlamı (CLAUDE.md)

Bu repo, **Küçükislamoğlu Hukuk** ekibinin **Ray Sigorta** rücu (sigorta geri rücu / icra takip)
dosyalarını uçtan uca yönettiği iç sistemdir. Asıl amaç: ekibin **icra takiplerini tek tek
otomatikleştirmesi** ve **hiçbir süreyi/dosyayı gözden kaçırmaması**.

## Stack
- **Next.js (App Router) + TypeScript**, **Prisma**, **Supabase** (Postgres, `eu-central-1`), **Vercel**.
- **Tailwind + repodaki mevcut design system** (yeni stil uydurma; `components/ui/` ve tailwind
  config'ten keşfet ve onları kullan).
- Auth: **Supabase Auth**. Gerçek şema her zaman `@prisma/schema.prisma` dosyasındadır — varsayma, oku.

## Alan modeli (özet — kaynak: prisma/schema.prisma)
- **RucuDosyasi** — ana dosya (hukuk/hasar no, hasar tarihi, **zamanasimi**, rücu sebebi/oranı/tutarı,
  branş, **durum**, icra bilgileri, atama meta verisi, `cikarimJson`).
- **Borclu** (TC/VKN, rol, teyit), **Odeme**, **Belge** (OCR'lı), **UretilenCikti** (takip bloğu/dilekçe),
  **TakipOlayi**, **Not** (zaman çizelgesi), **Aktivite**, **Musteri** (tenant=Ray Sigorta),
  **Kullanici** (Yelda=ADMIN, Sude=AVUKAT_YRD), **Ayarlar** (vekil/IBAN/faiz).

## Dosya yaşam döngüsü (durum pipeline)
`HAVUZDA → INCELENIYOR → TAKIBE_HAZIR → TAKIP_ACILDI → TEBLIG_EDILDI → ITIRAZ → KESINLESTI → TAHSIL / KAPANDI / IDARI_YOL`

## Giriş iş akışı (Hugo)
1. Hugo, ekibe Excel ile dosya tevdiye eder (hukuk no + künye; **borçlu yok**).
2. Import → satırlar **HAVUZDA**, `hugodanCekildi=false`.
3. "Hugo'dan çek" → dosya Hugo'dan indirilir, durum **INCELENIYOR**, `hugodanCekildi=true`,
   ardından **AI çıkarımı** (inen evraktan durum/borçlu/öneri → `cikarimJson` + `Not`).

## Konvansiyonlar
- **Server Components + Server Actions.** Mutasyonlar server action'da; sonrasında `revalidatePath`.
- Girdileri **zod** ile doğrula. Para **Decimal**, tarih **DateTime**; gösterimde `tr-TR`, para birimi **TRY**.
- **Tenant kapsamı:** her sorgu `musteriId` ile sınırlı. Auth zorunlu.
- **Güvenlik:** service-role anahtarı asla client'a sızmaz; RLS'e saygı; TC/telefon gibi veriler korunur.
- **Türkçe arayüz**, cümle düzeni; butonlar yapılan işi söyler ve akış boyunca aynı adı taşır.
- Erişilebilirlik (görünür focus, klavye), responsive, `prefers-reduced-motion`.
- İş bitince **typecheck + lint + build** çalıştır, özet ver.

## Önemli geçmiş kararlar
- Toplu UYAP XML şu an kullanılmıyor (adliye manuel seçiliyor, dosyalar çok-adliyeli) → **tek tek** otomasyon.
- Excel ayrıştırma kuralları: çok-değerli hücreler ("A + B") toplanır; geçersiz tarihler (ör. 36/03) boş bırakılır.
