-- CreateEnum: taksit planı + tek taksit durumları
CREATE TYPE "TaksitPlanDurum" AS ENUM ('AKTIF', 'TAMAMLANDI', 'TEMERRUT', 'IPTAL');

-- CreateEnum
CREATE TYPE "TaksitDurum" AS ENUM ('BEKLIYOR', 'ODENDI', 'KISMI', 'GECIKTI');

-- CreateTable: TaksitPlani — sulh/anlaşma sonrası ödeme planı
CREATE TABLE "TaksitPlani" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "asamaId" TEXT,
    "toplamTutar" DECIMAL(14,2) NOT NULL,
    "indirimTutari" DECIMAL(14,2),
    "taksitSayisi" INTEGER NOT NULL,
    "hatirlatmaGun" INTEGER NOT NULL DEFAULT 3,
    "temerrutSarti" BOOLEAN NOT NULL DEFAULT true,
    "durum" "TaksitPlanDurum" NOT NULL DEFAULT 'AKTIF',
    "not" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaksitPlani_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Taksit — tek taksit (vade + tutar + ödeme/hatırlatma izi)
CREATE TABLE "Taksit" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sira" INTEGER NOT NULL,
    "vadeTarihi" TIMESTAMP(3) NOT NULL,
    "tutar" DECIMAL(14,2) NOT NULL,
    "durum" "TaksitDurum" NOT NULL DEFAULT 'BEKLIYOR',
    "odenenTutar" DECIMAL(14,2),
    "odemeId" TEXT,
    "odendiTarih" TIMESTAMP(3),
    "hatirlatmaGonderildiAt" TIMESTAMP(3),
    "gecikmeBildirildiAt" TIMESTAMP(3),

    CONSTRAINT "Taksit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaksitPlani_dosyaId_idx" ON "TaksitPlani"("dosyaId");
CREATE INDEX "TaksitPlani_durum_idx" ON "TaksitPlani"("durum");
CREATE INDEX "Taksit_planId_idx" ON "Taksit"("planId");
CREATE INDEX "Taksit_vadeTarihi_idx" ON "Taksit"("vadeTarihi");
CREATE INDEX "Taksit_durum_idx" ON "Taksit"("durum");

-- AddForeignKey
ALTER TABLE "TaksitPlani" ADD CONSTRAINT "TaksitPlani_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaksitPlani" ADD CONSTRAINT "TaksitPlani_asamaId_fkey" FOREIGN KEY ("asamaId") REFERENCES "Asama"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Taksit" ADD CONSTRAINT "Taksit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TaksitPlani"("id") ON DELETE CASCADE ON UPDATE CASCADE;
