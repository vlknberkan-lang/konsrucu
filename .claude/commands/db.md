---
description: Prisma şemasını güvenle genişletir — yeni model / ilişki / enum / index — ve migration üretir. Sadece sen tetiklersin.
argument-hint: "[ne ekleniyor: model|ilişki|enum|index + açıklama]"
allowed-tools: Read, Edit, Bash
disable-model-invocation: true
---

# Şema değişikliği (Prisma): $ARGUMENTS

`@prisma/schema.prisma`'yı **additive** olarak genişlet ve migrate et. Tek alan eklemek için `/prisma-alan`
yeterli; bu komut **yeni model / ilişki / enum / index** gibi daha geniş ama yine güvenli değişiklikler içindir.

## Adımlar
1. `@prisma/schema.prisma`'yı oku; id, zaman damgası ve enum konvansiyonlarını **repodaki mevcut modellerle
   aynı tarzda** uygula (varsayma, oku).
2. **Yeni model:** tenant'a ait satırlar için `musteri Musteri @relation(...)` + `musteriId` ekle.
   Para `Decimal @db.Decimal(14,2)`, tarih `DateTime`, esnek meta `Json?`. İlişkilerin iki ucunu da tanımla.
3. **Yeni enum:** mevcutlarla aynı tarzda **Türkçe UPPER_SNAKE** değerler (ör. `DosyaDurum`, `Brans`).
   Var olan bir kavramı yeniden icat etme.
4. **Index:** foreign key'ler ve filtre/sıralama yapılan alanlar için `@@index([...])` ekle.
5. `npx prisma format`, sonra `npx prisma migrate dev --name <kısa-açıklayıcı-ad>`, sonra `npx prisma generate`.
6. Migration SQL'ini göster; yalnızca `CREATE TABLE` / `ADD COLUMN` / `CREATE INDEX` gibi **yıkıcı olmayan**
   işlemler içerdiğini doğrula. Uygulama komutunu (`npm run db:push` veya `prisma migrate deploy`) hatırlat.

## Güvenlik (zorunlu)
- **Asla** kolon/model silme, yeniden adlandırma veya tip daraltma yapma. Gerekiyorsa **dur ve açıkça sor**.
- `migrate dev` üretim verisini düşürecek bir adım önerirse iptal et ve uyar.
- Bu komut DB'yi değiştirir → yalnızca kullanıcı tetikler, otomatik çalışmaz.
- Uygulanmış (geçmiş) migration dosyalarını düzenleme; her zaman yeni migration ekle.
