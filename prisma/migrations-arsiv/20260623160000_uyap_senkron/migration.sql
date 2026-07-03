-- AlterTable: RucuDosyasi — UYAP senkron snapshot (eklenti yazar)
ALTER TABLE "RucuDosyasi" ADD COLUMN     "uyapDurum" TEXT,
ADD COLUMN     "uyapSenkronAt" TIMESTAMP(3),
ADD COLUMN     "uyapHesapJson" JSONB;

-- AlterTable: Belge — dış kaynak referansı (UYAP evrakId) ile otomatik içe aktarım dedup
ALTER TABLE "Belge" ADD COLUMN     "kaynakRef" TEXT;

-- CreateIndex
CREATE INDEX "Belge_dosyaId_kaynakRef_idx" ON "Belge"("dosyaId", "kaynakRef");
