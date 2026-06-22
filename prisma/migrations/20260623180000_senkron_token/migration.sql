-- AlterTable: Ayarlar — UYAP eklenti senkron anahtarı (tenant'a bağlar)
ALTER TABLE "Ayarlar" ADD COLUMN     "senkronToken" TEXT;

-- CreateIndex (benzersiz)
CREATE UNIQUE INDEX "Ayarlar_senkronToken_key" ON "Ayarlar"("senkronToken");
