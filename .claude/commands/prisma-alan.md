---
description: Prisma modeline güvenli (additive) alan ekler ve migration üretir. Sadece sen tetiklersin.
argument-hint: "[model] [alanlar...]"
allowed-tools: Read, Edit, Bash
disable-model-invocation: true
---

# Prisma alan ekle: $ARGUMENTS

`@prisma/schema.prisma`'ya **yalnızca yeni alan ekleyerek** şemayı güvenle genişlet ve migrate et.

## Adımlar
1. `@prisma/schema.prisma`'yı oku; hedef modeli ($ARGUMENTS'ın ilk kelimesi) bul.
2. İstenen alanları **opsiyonel/`@default`'lu** ekle (mevcut satırları bozmasın). Para `Decimal @db.Decimal(14,2)`,
   tarih `DateTime?`, boolean `@default(false)`, esnek meta `Json?`.
3. `npx prisma format` çalıştır.
4. `npx prisma migrate dev --name <kısa-açıklayıcı-ad>` ile migration üret ve uygula; sonra `npx prisma generate`.
5. Migration SQL'ini göster ve sadece `ALTER TABLE ... ADD COLUMN` içerdiğini (yıkıcı işlem olmadığını) doğrula.

## Güvenlik (zorunlu)
- **Asla** kolon silme/yeniden adlandırma/tip daraltma yapma. Böyle bir şey gerekiyorsa **dur** ve açıkça sor.
- `migrate dev` üretim verisini düşürecek bir işlem önerirse iptal et ve uyar.
- Bu komut DB'yi değiştirir; bu yüzden yalnızca kullanıcı tarafından tetiklenir (otomatik çalışmaz).
