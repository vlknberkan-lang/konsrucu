# Bu klasör neden arşivde?

Şema yönetimi **`prisma db push`** ile yapılıyor (Vercel'de `migrate deploy` çalışmıyor; bkz.
hafıza/deploy notları). Buradaki migration'lar şemanın **5+ tablo gerisinde** kalmıştı
(Asama, Etkinlik, OnemliOlay, TakipGorevi, EmsalKarar, SistemOlay… hepsi db push ile gitti).

Bu drift bir tuzaktı: biri yanlışlıkla `prisma migrate dev` / `migrate deploy` çalıştırsaydı,
mevcut tablolarla çakışıp veri kaybı riski doğururdu. Klasör bu yüzden 2026-07-04'te arşive alındı.

## Doğru akış (bugün)
1. `prisma/schema.prisma`'yı düzenle
2. `npm run db:push` (gerekirse `-- --accept-data-loss` — SADECE uyarıyı okuyup güvenli olduğundan eminsen)
3. `vercel --prod` ile deploy

`prisma migrate ...` KOMUTLARINI BU REPODA KULLANMA. Şema tarihçesi git'te
(`git log -- prisma/schema.prisma`) zaten mevcut.
