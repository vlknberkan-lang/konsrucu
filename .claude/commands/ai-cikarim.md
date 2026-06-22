---
description: "Hugo'dan çekilen dosyanın evrakından AI ile durum/borçlu/öneri çıkarır (cikarimJson + Not)."
argument-hint: "[hukuk-no | dosya-id]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# AI durum çıkarımı: $ARGUMENTS

Bir dosya Hugo'dan çekildikten sonra, inen evraktan yapay zekayla yapılandırılmış bilgi çıkar.
Bağlam `CLAUDE.md`, şema `@prisma/schema.prisma`.

## Akış
1. **Dosyayı bul:** `$ARGUMENTS` hukuk no veya dosya id olabilir; `RucuDosyasi`'nı ve bağlı
   **`Belge`** kayıtlarını (özellikle `extractedText`/OCR) çek. Belge yoksa kullanıcıyı uyar (önce Hugo'dan çekilmeli).
2. **Girdi derle:** Belge metinlerini + dosya künyesini (sebep, taraf ipuçları, plakalar) tek bağlama topla.
   Çok uzunsa en bilgi yoğun belgeleri (tutanak, ekspertiz, poliçe) önceliklendir.
3. **LLM çağrısı (server-side):** **@anthropic-ai/sdk** ile, env `ANTHROPIC_API_KEY`, model
   `claude-sonnet-4-6` (gerekiyorsa değiştir). **Yapılandırılmış JSON** iste; serbest metin değil.
   Çıkarılacaklar: `borclular[] (adUnvan, tcVkn?, rol, adres?)`, `onerilenDurum`, `ozet`,
   `riskler[]`, `guven (0-1)`. Bilinmeyeni uydurma; boş bırak ve düşük güven ver.
4. **Doğrula:** dönen JSON'u **zod** ile parse et. Geçersizse bir kez düzeltici tur, yine olmazsa hata kaydı.
5. **Yaz (idempotent):**
   - `RucuDosyasi.cikarimJson` = tüm çıktı + zaman damgası + model.
   - Güven yeterliyse `Borclu` kayıtları oluştur/güncelle (teyitDurumu=TEYIT_GEREK).
   - Bir **`Not`** ekle (özet) ve bir **`Aktivite`** logla.
   - `onerilenDurum` varsa durumu **otomatik değiştirme**; öneri olarak işaretle (kullanıcı onaylasın).
6. **Özet:** ne çıkarıldığını, güveni ve hangi alanların elle teyit gerektirdiğini yaz.

## Kurallar
- Evrak metni ve TC/telefon **server'da kalır**; client'a yapılandırılmış, gerekli minimum veri gider.
- Çıkarım hiçbir zaman tek doğru kaynak değildir: her zaman teyit gerektiren alanları işaretle.
