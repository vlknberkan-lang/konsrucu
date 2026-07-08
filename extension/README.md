# Rücu Takip — UYAP Senkron (Chrome eklentisi kaynağı)

Bu klasör, UYAP senkron eklentisinin **sürüm-kontrollü kaynağıdır** (artık sadece dağıtım zip'i değil).
API'siyle (`app/api/uyap/*`) aynı repoda durur, birlikte evrilir.

## Dosyalar
- `manifest.json` — MV3, **store-temiz**: yalnız `*.uyap.gov.tr` + `konsrucu.vercel.app` (localhost YOK), ikonlar tanımlı.
- `background.js` — ikon toggle · program API köprüsü (Bearer, çoklu tenant anahtarı) · 30 dk alarm poll · tevzi paketi indirme.
- `content.js` — sorgu motoru + (icra dairesi + esas no) eşleştirme + evrak yükleme + mini panel + Takip Aç Kopilotu.
- `interceptor.js` — MAIN world; UYAP SPA ağ yanıtlarını okumak için.
- `icons/` — 16/48/128 (store 128px zorunlu). *Placeholder — KonsRücü markasıyla değiştirilebilir.*

## Kurulum (geliştirici / load-unpacked)
`chrome://extensions` → Geliştirici modu → **Paketlenmemiş yükle** → bu `extension/` klasörünü seç.
Panel ⚙ → program adresi + senkron anahtarı (Ayarlar → UYAP Eklenti Senkron Anahtarı'ndan).

> **Yerel dev notu:** manifest'te `localhost` host izni YOK (store gereği). Eklentiyi yerel
> `localhost:3000` backend'e bağlamak istersen, `host_permissions`'a geçici olarak
> `"http://localhost:3000/*"` ekle (store'a giden pakete EKLEME).

## Chrome Web Store zip'i üretme
Manifest zip'in **kökünde** olmalı (alt klasör değil):
```
cd extension && zip -r ../uyap-eklenti-store-v1.7.0.zip . -x '*.bak' -x '*/.*'
```
Bu zip'i Web Store Developer Dashboard'a yükle. Yayın rehberi: `docs/eklenti-store-yayin.md`.

## Sürüm
- **1.7.0** — store'a hazır: ikonlar eklendi, `localhost` izni kaldırıldı, gizlilik politikası (`/gizlilik`).
- 1.6.0 — tevzi sonrası dayanak klasörü otomatik iner (`downloads`).
- 1.5.0 — Takip Aç Kopilotu (Faz 2, canlı).
