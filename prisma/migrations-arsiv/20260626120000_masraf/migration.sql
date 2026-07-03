-- Masraf modülü: müvekkile faturalanacak icra harç/masraf takibi (makbuz PDF'inden + manuel)
-- CreateEnum
CREATE TYPE "MasrafDurum" AS ENUM ('YENI', 'ONAYLI', 'FATURALANDI', 'TAHSIL', 'ARSIV');

-- CreateEnum
CREATE TYPE "MasrafTaraf" AS ENUM ('BIZ', 'KARSI', 'BELIRSIZ');

-- AlterTable
ALTER TABLE "Ayarlar" ADD COLUMN "masrafEslestirJson" JSONB,
ADD COLUMN "masrafJson" JSONB;

-- CreateTable
CREATE TABLE "Masraf" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "asamaId" TEXT,
    "dekontNo" TEXT,
    "makbuzSayi" TEXT,
    "makbuzNo" TEXT,
    "tutar" DECIMAL(14,2) NOT NULL,
    "tarih" TIMESTAMP(3),
    "cinsHam" TEXT,
    "cins" TEXT,
    "cinsGuven" DOUBLE PRECISION,
    "taraf" "MasrafTaraf" NOT NULL DEFAULT 'BELIRSIZ',
    "sorumlu" TEXT,
    "belgeId" TEXT,
    "durum" "MasrafDurum" NOT NULL DEFAULT 'YENI',
    "faturaDonem" TEXT,
    "faturaTarihi" TIMESTAMP(3),
    "kaynak" TEXT NOT NULL DEFAULT 'MANUEL',
    "kaynakRef" TEXT,
    "guven" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Masraf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Masraf_dosyaId_idx" ON "Masraf"("dosyaId");

-- CreateIndex
CREATE INDEX "Masraf_durum_idx" ON "Masraf"("durum");

-- CreateIndex
CREATE INDEX "Masraf_tarih_idx" ON "Masraf"("tarih");

-- CreateIndex
CREATE INDEX "Masraf_taraf_idx" ON "Masraf"("taraf");

-- CreateIndex
CREATE UNIQUE INDEX "Masraf_dosyaId_kaynakRef_key" ON "Masraf"("dosyaId", "kaynakRef");

-- AddForeignKey
ALTER TABLE "Masraf" ADD CONSTRAINT "Masraf_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Masraf" ADD CONSTRAINT "Masraf_asamaId_fkey" FOREIGN KEY ("asamaId") REFERENCES "Asama"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Masraf" ADD CONSTRAINT "Masraf_belgeId_fkey" FOREIGN KEY ("belgeId") REFERENCES "Belge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
