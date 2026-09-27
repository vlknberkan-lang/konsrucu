BEGIN;
-- 014_dosya_karti.sql · Dalga C · S35 (dosya kartı, dilekçenin 1. aşaması; B38, B40)
-- İçerik: DosyaKarti (sürümlü; kilitlenen kart değişmez, düzeltme = yeni sürüm)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir. Önkoşul yok (yalnız "RucuDosyasi"ye dayanır).
-- Taslak model: prisma/taslak/b2c.prisma · geri dönüş ve doğrulama: prisma/sql/b2c/README.md
-- Hukuki kayıt: RESTRICT + silindiAt. davaId FK'siz bağlam kolonu (06 §3.3).
-- Kart TakipTalebi (B1 007), Dava/DavaTaraf (011), onaylı AlanDegeri (B1 005) ve MevzuatKaynak'tan (013) beslenir —
-- bu bağımlılık uygulamadadır, veritabanında FK yoktur.

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "DosyaKarti" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "davaId" TEXT,
    "tur" TEXT NOT NULL,
    "surum" INTEGER NOT NULL,
    "icerikJson" JSONB NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'TASLAK',
    "onaylayanId" TEXT,
    "onayAt" TIMESTAMP(3),
    "uretici" TEXT,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DosyaKarti_pkey" PRIMARY KEY ("id")
);

-- ── İndeks (dosya + tür + sürüm tekil: eşzamanlı "yeni sürüm" yarışında aynı numara iki kez açılmaz) ──
CREATE UNIQUE INDEX IF NOT EXISTS "DosyaKarti_dosyaId_tur_surum_key" ON "DosyaKarti"("dosyaId", "tur", "surum");

-- ── Yabancı anahtar ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DosyaKarti_dosyaId_fkey' AND conrelid = '"DosyaKarti"'::regclass) THEN
    ALTER TABLE "DosyaKarti" ADD CONSTRAINT "DosyaKarti_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK: kart durum makinesi (tur büyüyebilir → yalnız lib/sabitler) ─────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DosyaKarti_durum_chk' AND conrelid = '"DosyaKarti"'::regclass) THEN
    ALTER TABLE "DosyaKarti" ADD CONSTRAINT "DosyaKarti_durum_chk"
      CHECK ("durum" IN ('TASLAK', 'ONAYLI', 'ESKIDI'));
  END IF;
END $$;

ALTER TABLE "DosyaKarti" ENABLE ROW LEVEL SECURITY;

COMMIT;
