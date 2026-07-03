-- AlterTable
ALTER TABLE "RucuDosyasi" ADD COLUMN     "projeId" TEXT;

-- CreateTable
CREATE TABLE "Proje" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "alacakliUnvan" TEXT,
    "mersis" TEXT,
    "vergiNo" TEXT,
    "iban" TEXT,
    "kep" TEXT,
    "faizTuru" TEXT DEFAULT 'Yasal faiz',
    "faizJson" JSONB,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proje_musteriId_idx" ON "Proje"("musteriId");

-- CreateIndex
CREATE INDEX "RucuDosyasi_projeId_idx" ON "RucuDosyasi"("projeId");

-- AddForeignKey
ALTER TABLE "Proje" ADD CONSTRAINT "Proje_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RucuDosyasi" ADD CONSTRAINT "RucuDosyasi_projeId_fkey" FOREIGN KEY ("projeId") REFERENCES "Proje"("id") ON DELETE SET NULL ON UPDATE CASCADE;
