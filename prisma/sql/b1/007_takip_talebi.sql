BEGIN;
-- 007_takip_talebi.sql · Dalga B1 · S21 (takip talebi, faiz seçimi, kopilot, Excel icra sütunları; B04, B10, B26)
-- İçerik: TakipTalebi (+ kısmi tekil indeks: dosya başına tek geçerli, silinmemiş kayıt)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- Hukuki kayıt: RESTRICT + silindiAt. Düzeltme = yeni sürüm; sürüm değişirken ÖNCE eskisi gecerli=false,
-- SONRA yenisi eklenir (aynı işlemde) — tekil indeks her ifadede anında denetlenir.
-- faizTuru'na varsayılan ve CHECK konmadı: değer avukat seçimidir, UYAP faiz kodları S12 keşfine bağlı (teyit gerekli).

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "TakipTalebi" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "surum" INTEGER NOT NULL DEFAULT 1,
    "gecerli" BOOLEAN NOT NULL DEFAULT true,
    "asilAlacak" DECIMAL(14,2) NOT NULL,
    "islemisFaiz" DECIMAL(14,2),
    "toplam" DECIMAL(14,2),
    "faizTuru" TEXT,
    "faizOraniMetni" TEXT,
    "faizBaslangicTuru" TEXT,
    "faizBaslangic" TIMESTAMP(3),
    "takipYolu" TEXT,
    "ornekNo" TEXT,
    "takipTarihi" TIMESTAMP(3),
    "kaynak" TEXT NOT NULL,
    "kaynakBelgeId" TEXT,
    "hesapIziJson" JSONB,
    "onaylayanId" TEXT,
    "dondurulduAt" TIMESTAMP(3),
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakipTalebi_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "TakipTalebi_dosyaId_gecerli_idx" ON "TakipTalebi"("dosyaId", "gecerli");
CREATE UNIQUE INDEX IF NOT EXISTS "TakipTalebi_dosyaId_surum_key" ON "TakipTalebi"("dosyaId", "surum");
-- Dosya başına tek geçerli takip talebi. Prisma 6.19 kısmi indeksi şemada ifade edemez → yalnız burada.
CREATE UNIQUE INDEX IF NOT EXISTS "TakipTalebi_dosyaId_gecerli_key" ON "TakipTalebi"("dosyaId")
  WHERE "gecerli" = true AND "silindiAt" IS NULL;

-- ── Yabancı anahtar ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TakipTalebi_dosyaId_fkey' AND conrelid = '"TakipTalebi"'::regclass) THEN
    ALTER TABLE "TakipTalebi" ADD CONSTRAINT "TakipTalebi_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TakipTalebi_kaynak_chk' AND conrelid = '"TakipTalebi"'::regclass) THEN
    ALTER TABLE "TakipTalebi" ADD CONSTRAINT "TakipTalebi_kaynak_chk"
      CHECK ("kaynak" IN ('KOPILOT', 'UYAP_BELGE', 'ELLE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TakipTalebi_faizBaslangicTuru_chk' AND conrelid = '"TakipTalebi"'::regclass) THEN
    ALTER TABLE "TakipTalebi" ADD CONSTRAINT "TakipTalebi_faizBaslangicTuru_chk"
      CHECK ("faizBaslangicTuru" IS NULL OR "faizBaslangicTuru" IN ('HER_ODEMEDEN', 'TEK_TARIH'));
  END IF;
END $$;

ALTER TABLE "TakipTalebi" ENABLE ROW LEVEL SECURITY;

COMMIT;
