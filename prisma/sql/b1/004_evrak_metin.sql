BEGIN;
-- 004_evrak_metin.sql · Dalga B1 · S16 (evrak metin hattı v1: PDF, UDF, EYP; B13, B39, B40) — S17 (OCR) şemasız, bunu kullanır.
-- İçerik: Belge ekleri (UYAP kimliği, alt tür, metin durumu, okuma kuyruğu, AI izni, silindiAt), BelgeSayfa
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- Belge.davaId: Dava tablosu B2'de (011) gelir; burada FK'siz düz kolon, B1'de boş kalır.
-- okumaDeneme NOT NULL DEFAULT 0: sabit varsayılanlı ekleme Postgres 11+'da tabloyu yeniden yazmaz.

SET LOCAL lock_timeout = '5s';

-- ── Belge ekleri ────────────────────────────────────────────────────────────
ALTER TABLE "Belge"
  ADD COLUMN IF NOT EXISTS "kaynak" TEXT,
  ADD COLUMN IF NOT EXISTS "altTur" TEXT,
  ADD COLUMN IF NOT EXISTS "uyapEvrakTuru" TEXT,
  ADD COLUMN IF NOT EXISTS "uyapBirimEvrakNo" TEXT,
  ADD COLUMN IF NOT EXISTS "uyapYon" TEXT,
  ADD COLUMN IF NOT EXISTS "uyapDosyaTuru" TEXT,
  ADD COLUMN IF NOT EXISTS "boyut" INTEGER,
  ADD COLUMN IF NOT EXISTS "sayfaSayisi" INTEGER,
  ADD COLUMN IF NOT EXISTS "icerikTarihi" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metinDurumu" TEXT,
  ADD COLUMN IF NOT EXISTS "metinYontemi" TEXT,
  ADD COLUMN IF NOT EXISTS "metinGuven" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "okumaDeneme" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "okumaKilitAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "okumaHata" TEXT,
  ADD COLUMN IF NOT EXISTS "aiIzni" TEXT,
  ADD COLUMN IF NOT EXISTS "davaId" TEXT,
  ADD COLUMN IF NOT EXISTS "silindiAt" TIMESTAMP(3);

-- ── BelgeSayfa (işletim kaydı: CASCADE) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BelgeSayfa" (
    "id" TEXT NOT NULL,
    "belgeId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "sayfaNo" INTEGER NOT NULL,
    "metin" TEXT NOT NULL,
    "yontem" TEXT NOT NULL,
    "guven" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BelgeSayfa_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "BelgeSayfa_belgeId_sayfaNo_key" ON "BelgeSayfa"("belgeId", "sayfaNo");
CREATE INDEX IF NOT EXISTS "BelgeSayfa_dosyaId_idx" ON "BelgeSayfa"("dosyaId");
CREATE INDEX IF NOT EXISTS "Belge_dosyaId_uyapBirimEvrakNo_idx" ON "Belge"("dosyaId", "uyapBirimEvrakNo");
CREATE INDEX IF NOT EXISTS "Belge_metinDurumu_idx" ON "Belge"("metinDurumu");

-- ── Yabancı anahtarlar ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BelgeSayfa_belgeId_fkey' AND conrelid = '"BelgeSayfa"'::regclass) THEN
    ALTER TABLE "BelgeSayfa" ADD CONSTRAINT "BelgeSayfa_belgeId_fkey" FOREIGN KEY ("belgeId") REFERENCES "Belge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BelgeSayfa_dosyaId_fkey' AND conrelid = '"BelgeSayfa"'::regclass) THEN
    ALTER TABLE "BelgeSayfa" ADD CONSTRAINT "BelgeSayfa_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK: AI izni KVKK kapısıdır (06 §5.5) — kapalı liste. metinDurumu/altTur büyüyebilir → yalnız lib/sabitler.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Belge_aiIzni_chk' AND conrelid = '"Belge"'::regclass) THEN
    ALTER TABLE "Belge" ADD CONSTRAINT "Belge_aiIzni_chk"
      CHECK ("aiIzni" IS NULL OR "aiIzni" IN ('IZINLI', 'YASAK', 'SORULACAK'));
  END IF;
END $$;

ALTER TABLE "BelgeSayfa" ENABLE ROW LEVEL SECURITY;

COMMIT;
