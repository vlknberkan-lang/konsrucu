-- AlterTable: Odeme — ekspertiz vb. anaparaya dahil olmayan ödemeler için
ALTER TABLE "Odeme" ADD COLUMN     "haricMi" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: RucuDosyasi — faiz hesap snapshot'ı (tarihler null = otomatik)
ALTER TABLE "RucuDosyasi" ADD COLUMN     "faizBaslangic" TIMESTAMP(3),
ADD COLUMN     "faizBitis" TIMESTAMP(3),
ADD COLUMN     "faizTutari" DECIMAL(14,2),
ADD COLUMN     "faizHesapJson" JSONB;
