BEGIN;
-- 010_arabuluculuk_onay.sql · Dalga B2 · S26 (arabuluculuk, yol seçimi, müvekkil onayı; B02, B16)
-- İçerik: Arabuluculuk (Asama(ARABULUCULUK) 1:1 uzantısı), OnayKaydi, YolSecimi (TASLAK EKİ),
--         Sure.arabuluculukId → Arabuluculuk FK (B1'in B2'ye bıraktığı bağ)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b2c.prisma · geri dönüş ve doğrulama: prisma/sql/b2c/README.md
-- ÖNKOŞUL: B1 (001–009) uygulanmış olmalı — "Sure" tablosu yoksa dosya hata verir ve bütünüyle geri sarılır.
-- Hukuki kayıtlar (Arabuluculuk, OnayKaydi, YolSecimi): RESTRICT + silindiAt. Veri güncellemesi yok.

SET LOCAL lock_timeout = '5s';

-- ── Önkoşul ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public."Sure"') IS NULL THEN
    RAISE EXCEPTION '010: "Sure" tablosu yok. Önce B1 (prisma/sql/b1/001–009) uygulanmalı.';
  END IF;
END $$;

-- ── Arabuluculuk (hukuki kayıt) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Arabuluculuk" (
    "id" TEXT NOT NULL,
    "asamaId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tur" TEXT,
    "turGerekce" TEXT,
    "basvuruTarihi" TIMESTAMP(3),
    "basvuruNo" TEXT,
    "buroNo" TEXT,
    "uyapDosyaNo" TEXT,
    "arabulucu" TEXT,
    "surecBaslangic" TIMESTAMP(3),
    "sonTutanakTarihi" TIMESTAMP(3),
    "sonuc" TEXT,
    "katilmayanTaraf" TEXT,
    "kismenJson" JSONB,
    "konuMetni" TEXT,
    "sonTutanakBelgeId" TEXT,
    "onaylayanId" TEXT,
    "onayAt" TIMESTAMP(3),
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Arabuluculuk_pkey" PRIMARY KEY ("id")
);

-- ── OnayKaydi (müvekkil onayı; hukuki kayıt) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "OnayKaydi" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tur" TEXT NOT NULL,
    "istenmeAt" TIMESTAMP(3),
    "alinmaAt" TIMESTAMP(3),
    "sonuc" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "onaylayanUnvan" TEXT,
    "belgeId" TEXT,
    "tutar" DECIMAL(14,2),
    "istisnaGerekce" TEXT,
    "yolSecimiId" TEXT,
    "davaId" TEXT,
    "kaydedenId" TEXT,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnayKaydi_pkey" PRIMARY KEY ("id")
);

-- ── YolSecimi (TASLAK EKİ: avukatın yol kararı — AR-01, AR-02, SN-02; hukuki kayıt) ──
CREATE TABLE IF NOT EXISTS "YolSecimi" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "asama" TEXT NOT NULL,
    "secim" TEXT NOT NULL,
    "davaId" TEXT,
    "gerekce" TEXT,
    "ekonomiJson" JSONB,
    "durum" TEXT NOT NULL DEFAULT 'GECERLI',
    "secenId" TEXT,
    "secimAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YolSecimi_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "Arabuluculuk_asamaId_key" ON "Arabuluculuk"("asamaId");
CREATE INDEX IF NOT EXISTS "Arabuluculuk_dosyaId_idx" ON "Arabuluculuk"("dosyaId");
CREATE INDEX IF NOT EXISTS "OnayKaydi_dosyaId_tur_idx" ON "OnayKaydi"("dosyaId", "tur");
CREATE INDEX IF NOT EXISTS "YolSecimi_dosyaId_asama_durum_idx" ON "YolSecimi"("dosyaId", "asama", "durum");

-- ── Yabancı anahtarlar ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Arabuluculuk_asamaId_fkey' AND conrelid = '"Arabuluculuk"'::regclass) THEN
    ALTER TABLE "Arabuluculuk" ADD CONSTRAINT "Arabuluculuk_asamaId_fkey" FOREIGN KEY ("asamaId") REFERENCES "Asama"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Arabuluculuk_dosyaId_fkey' AND conrelid = '"Arabuluculuk"'::regclass) THEN
    ALTER TABLE "Arabuluculuk" ADD CONSTRAINT "Arabuluculuk_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnayKaydi_dosyaId_fkey' AND conrelid = '"OnayKaydi"'::regclass) THEN
    ALTER TABLE "OnayKaydi" ADD CONSTRAINT "OnayKaydi_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'YolSecimi_dosyaId_fkey' AND conrelid = '"YolSecimi"'::regclass) THEN
    ALTER TABLE "YolSecimi" ADD CONSTRAINT "YolSecimi_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- B1'den devralınan bağ: Sure.arabuluculukId (009'da FK'siz düz kolon). Kısıt eklenirken mevcut satırlar denetlenir;
  -- bu noktada Arabuluculuk boş olduğundan dolu bir arabuluculukId yetim demektir → anlaşılır hatayla dur.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sure_arabuluculukId_fkey' AND conrelid = '"Sure"'::regclass) THEN
    IF EXISTS (SELECT 1 FROM "Sure" s WHERE s."arabuluculukId" IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM "Arabuluculuk" a WHERE a."id" = s."arabuluculukId")) THEN
      RAISE EXCEPTION '010: "Sure"."arabuluculukId" yetim değer taşıyor; README §5 sorgusuyla bulun, düzeltmeden uygulamayın.';
    END IF;
    ALTER TABLE "Sure" ADD CONSTRAINT "Sure_arabuluculukId_fkey" FOREIGN KEY ("arabuluculukId") REFERENCES "Arabuluculuk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları (yalnız kapalı listeler; OnayKaydi.tur ve YolSecimi.secim büyüyebilir → yalnız lib/sabitler) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Arabuluculuk_tur_chk' AND conrelid = '"Arabuluculuk"'::regclass) THEN
    ALTER TABLE "Arabuluculuk" ADD CONSTRAINT "Arabuluculuk_tur_chk"
      CHECK ("tur" IS NULL OR "tur" IN ('DAVA_SARTI', 'IHTIYARI', 'BELIRSIZ'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Arabuluculuk_sonuc_chk' AND conrelid = '"Arabuluculuk"'::regclass) THEN
    ALTER TABLE "Arabuluculuk" ADD CONSTRAINT "Arabuluculuk_sonuc_chk"
      CHECK ("sonuc" IS NULL OR "sonuc" IN ('ANLASMA', 'ANLASAMAMA', 'ULASILAMAMA', 'KATILMAMA', 'KISMEN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OnayKaydi_sonuc_chk' AND conrelid = '"OnayKaydi"'::regclass) THEN
    ALTER TABLE "OnayKaydi" ADD CONSTRAINT "OnayKaydi_sonuc_chk"
      CHECK ("sonuc" IN ('BEKLIYOR', 'ONAY', 'RET'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'YolSecimi_asama_chk' AND conrelid = '"YolSecimi"'::regclass) THEN
    ALTER TABLE "YolSecimi" ADD CONSTRAINT "YolSecimi_asama_chk"
      CHECK ("asama" IN ('ITIRAZ_SONRASI', 'KARAR_SONRASI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'YolSecimi_durum_chk' AND conrelid = '"YolSecimi"'::regclass) THEN
    ALTER TABLE "YolSecimi" ADD CONSTRAINT "YolSecimi_durum_chk"
      CHECK ("durum" IN ('GECERLI', 'ESKIDI'));
  END IF;
END $$;

ALTER TABLE "Arabuluculuk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnayKaydi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "YolSecimi" ENABLE ROW LEVEL SECURITY;

COMMIT;
