BEGIN;
-- 005_alan_degeri.sql · Dalga B1 · S18 (öneri kartları, alan kilidi, kural çıkarıcıları; B36, B37, B38) — S19 da kullanır.
-- İçerik: AlanDegeri (+ kısmi tekil indeks: dosya+alan başına tek ONAYLI), RucuDosyasi poliçe ve rücu sebebi kolonları
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- AlanDegeri hukuki kayıttır: RESTRICT + silindiAt.

SET LOCAL lock_timeout = '5s';

-- ── RucuDosyasi: yalnız ONAYLI AlanDegeri'nden aynalanan kolonlar ───────────
ALTER TABLE "RucuDosyasi"
  ADD COLUMN IF NOT EXISTS "policeNo" TEXT,
  ADD COLUMN IF NOT EXISTS "policeBaslangic" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "policeBitis" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rucuSebebiKod" TEXT;

-- ── AlanDegeri ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AlanDegeri" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "alan" TEXT NOT NULL,
    "degerJson" JSONB NOT NULL,
    "kaynakTuru" TEXT NOT NULL,
    "kaynakBelgeId" TEXT,
    "sayfa" INTEGER,
    "alinti" TEXT,
    "alintiDogru" BOOLEAN,
    "guven" DOUBLE PRECISION,
    "uretici" TEXT,
    "durum" TEXT NOT NULL DEFAULT 'ONERI',
    "onaylayanId" TEXT,
    "onayAt" TIMESTAMP(3),
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlanDegeri_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "AlanDegeri_dosyaId_alan_durum_idx" ON "AlanDegeri"("dosyaId", "alan", "durum");
-- Alan kilidi: dosya + alan başına tek ONAYLI (silinmemiş) değer. İki sekmede aynı öneriyi onaylama yarışında
-- ikinci onay burada düşer ("az önce onaylandı"). Prisma 6.19 kısmi indeksi şemada ifade edemez → yalnız burada.
CREATE UNIQUE INDEX IF NOT EXISTS "AlanDegeri_dosyaId_alan_onayli_key" ON "AlanDegeri"("dosyaId", "alan")
  WHERE "durum" = 'ONAYLI' AND "silindiAt" IS NULL;

-- ── Yabancı anahtar ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AlanDegeri_dosyaId_fkey' AND conrelid = '"AlanDegeri"'::regclass) THEN
    ALTER TABLE "AlanDegeri" ADD CONSTRAINT "AlanDegeri_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AlanDegeri_durum_chk' AND conrelid = '"AlanDegeri"'::regclass) THEN
    ALTER TABLE "AlanDegeri" ADD CONSTRAINT "AlanDegeri_durum_chk"
      CHECK ("durum" IN ('ONERI', 'ONAYLI', 'REDDEDILDI', 'ESKIDI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AlanDegeri_kaynakTuru_chk' AND conrelid = '"AlanDegeri"'::regclass) THEN
    ALTER TABLE "AlanDegeri" ADD CONSTRAINT "AlanDegeri_kaynakTuru_chk"
      CHECK ("kaynakTuru" IN ('AI', 'HUGO', 'EXCEL', 'UYAP', 'ELLE', 'KURAL'));
  END IF;
END $$;

ALTER TABLE "AlanDegeri" ENABLE ROW LEVEL SECURITY;

COMMIT;
