BEGIN;
-- 013_mevzuat.sql · Dalga C · S33 (mevzuat kütüphanesi ve atıf kapısı K1; B09, B18)
-- İçerik: MevzuatKaynak (müvekkil bazında; idempotent anahtar musteriId + kunye, yükleme kimliği, toplu pasif)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir. Önkoşul yok (yalnız "Musteri"ye dayanır).
-- Taslak model: prisma/taslak/b2c.prisma · geri dönüş ve doğrulama: prisma/sql/b2c/README.md
-- Kiracı kütüphanesi: Musteri silinirse CASCADE (MentorKural deseni); kayıtlar silinmez, aktif = false ile pasife alınır.
-- Dilekçeye yalnız durum = 'DOGRULANDI' ve aktif = true girer (uygulama kapısı, S37).

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "MevzuatKaynak" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "tur" TEXT NOT NULL,
    "kunye" TEXT NOT NULL,
    "alinti" TEXT NOT NULL,
    "resmiUrl" TEXT,
    "erisimTarihi" TIMESTAMP(3),
    "yururlukBas" TIMESTAMP(3),
    "yururlukBit" TIMESTAMP(3),
    "etiket" TEXT NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'TEYIT_GEREKLI',
    "kapsamNotu" TEXT,
    "rucuSebebiKodlari" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dogrulayanId" TEXT,
    "dogrulamaAt" TIMESTAMP(3),
    "bilgiBankasiYolu" TEXT,
    "icerikOzet" TEXT,
    "yuklemeId" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "kopyaKaynakId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MevzuatKaynak_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "MevzuatKaynak_musteriId_durum_idx" ON "MevzuatKaynak"("musteriId", "durum");
-- araclar/mevzuat-yukle.ts'nin idempotent anahtarı (07 S33): aynı müvekkilde aynı künye iki kez açılmaz.
CREATE UNIQUE INDEX IF NOT EXISTS "MevzuatKaynak_musteriId_kunye_key" ON "MevzuatKaynak"("musteriId", "kunye");

-- ── Yabancı anahtar ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MevzuatKaynak_musteriId_fkey' AND conrelid = '"MevzuatKaynak"'::regclass) THEN
    ALTER TABLE "MevzuatKaynak" ADD CONSTRAINT "MevzuatKaynak_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları (K1 kapısının durumu ve etiketi kapalı listelerdir; tur büyüyebilir → yalnız lib/sabitler) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MevzuatKaynak_durum_chk' AND conrelid = '"MevzuatKaynak"'::regclass) THEN
    ALTER TABLE "MevzuatKaynak" ADD CONSTRAINT "MevzuatKaynak_durum_chk"
      CHECK ("durum" IN ('DOGRULANDI', 'TEYIT_GEREKLI', 'KULLANMA'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MevzuatKaynak_etiket_chk' AND conrelid = '"MevzuatKaynak"'::regclass) THEN
    ALTER TABLE "MevzuatKaynak" ADD CONSTRAINT "MevzuatKaynak_etiket_chk"
      CHECK ("etiket" IN ('YERLESIK', 'TARTISMALI', 'TEYIT_GEREKLI'));
  END IF;
END $$;

ALTER TABLE "MevzuatKaynak" ENABLE ROW LEVEL SECURITY;

COMMIT;
