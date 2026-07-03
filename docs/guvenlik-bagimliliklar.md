# Bağımlılık Güvenlik Durumu (2026-07-04)

`npm audit` bulguları değerlendirildi. Kalan açıkların tümü ya **major sürüm** gerektiriyor
(otomatik yükseltmek kırıcı) ya da **düzeltmesi yok**. Durum ve hafifletmeler:

| Paket | Açık | Durum / Hafifletme |
|---|---|---|
| `xlsx` 0.18.5 | Prototype Pollution + ReDoS (high) | **npm'de düzeltme YOK.** Maruziyet düşük: Excel'i yalnız EKİP yükler (Hugo/Zurich tevdiye listeleri), anonim yükleme yüzeyi yok. Kalıcı çözüm: parse tarafını `exceljs`e taşımak (yazma zaten exceljs) — ayrı iş. |
| `pdfjs-dist` 3.11 | eval tabanlı RCE (high) | **Hafifletilmiş:** tüm `getDocument` çağrılarında `isEvalSupported: false` (evrak-cikar, pdf-metin, ingest-panel). 4.x'e geçiş API değişikliği ister — ayrı iş. |
| `next` 14.2.x | DoS serisi (moderate) | Düzeltmeler yalnız 15/16'da. Uygulama auth arkasında + Vercel edge önünde; DoS riski sınırlı. Next 15 geçişi ayrıca planlanmalı (App Router uyumlu, ama searchParams/cookies async değişimi dokunuş ister). |
| `tar` (transitive, `@mapbox/node-pre-gyp` altında) | path traversal serisi | Build-time bağımlılığı; uygulama güvenilmeyen tar açmıyor. Runtime maruziyeti yok. |
| `uuid` (transitive, `exceljs` altında) | buffer bounds (moderate) | exceljs'in önerdiği "fix" 3.4.0'a DOWNGRADE — uygulanmadı. Maruziyet: yalnız kendi ürettiğimiz Excel'ler. |

## Yapılanlar
- `npm audit fix` (kırıcı olmayan) çalıştırıldı.
- pdfjs `isEvalSupported:false` üç kullanım noktasında da doğrulandı.

## Sonraki adımlar (ayrı işler — otomatik yapılmadı)
1. Excel PARSE'ını `xlsx` → `exceljs`e taşı (lib/import/hugo.ts) → xlsx tamamen kalkar.
2. Next 15 + pdfjs-dist 4.x geçişi (birlikte tek migrasyon penceresi).
