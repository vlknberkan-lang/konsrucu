-- AlterTable: Ayarlar — tüm dosyalarda ortak vekaletname (Storage yolu + ad)
ALTER TABLE "Ayarlar" ADD COLUMN     "vekaletnamePath" TEXT,
ADD COLUMN     "vekaletnameAd" TEXT;
