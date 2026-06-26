-- Mentor öğrenilen kural: avukat AI önerisini düzeltir → kural sistem promptuna enjekte edilir (manuel MVP)
-- CreateEnum
CREATE TYPE "MentorKaynak" AS ENUM ('ADIM', 'TEYIT');

-- CreateEnum
CREATE TYPE "MentorKuralTur" AS ENUM ('KALDIR', 'DUZELT');

-- CreateTable
CREATE TABLE "MentorKural" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "kaynak" "MentorKaynak" NOT NULL DEFAULT 'ADIM',
    "tur" "MentorKuralTur" NOT NULL DEFAULT 'KALDIR',
    "hedef" TEXT,
    "yorum" TEXT NOT NULL,
    "olayTuru" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "dosyaId" TEXT,
    "kullaniciId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentorKural_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MentorKural_musteriId_aktif_idx" ON "MentorKural"("musteriId", "aktif");

-- AddForeignKey
ALTER TABLE "MentorKural" ADD CONSTRAINT "MentorKural_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorKural" ADD CONSTRAINT "MentorKural_kullaniciId_fkey" FOREIGN KEY ("kullaniciId") REFERENCES "Kullanici"("id") ON DELETE SET NULL ON UPDATE CASCADE;
