BEGIN;
-- 008_senkron_is.sql · Dalga B1 · S22 (anlık senkron: iş kuyruğu, nabız, canlı ilerleme; eklenti 1.10)
-- İçerik: SenkronIs, EklentiNabiz
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- İşletim kayıtları: CASCADE. Eklenti sorguladığı için musteriId + dosyaId birlikte (06 §3.1 ilke 3).
-- SenkronIs.updatedAt: Prisma @updatedAt (DB varsayılanı yok; uygulama yazar) — sağlık cron'unun hareketsizlik ölçüsü.

SET LOCAL lock_timeout = '5s';

-- ── SenkronIs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SenkronIs" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tur" TEXT NOT NULL,
    "hedefJson" JSONB NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "adimlarJson" JSONB,
    "ozetJson" JSONB,
    "hata" TEXT,
    "isteyenId" TEXT,
    "anahtarId" TEXT,
    "cihaz" TEXT,
    "eklentiSurum" TEXT,
    "alindiAt" TIMESTAMP(3),
    "bittiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SenkronIs_pkey" PRIMARY KEY ("id")
);

-- ── EklentiNabiz (cihaz başına tek satır, upsert) ───────────────────────────
CREATE TABLE IF NOT EXISTS "EklentiNabiz" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "kullaniciId" TEXT,
    "anahtarId" TEXT,
    "cihaz" TEXT NOT NULL,
    "surum" TEXT NOT NULL,
    "uyapOturum" BOOLEAN NOT NULL,
    "sonGorulme" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EklentiNabiz_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "SenkronIs_musteriId_durum_createdAt_idx" ON "SenkronIs"("musteriId", "durum", "createdAt");
CREATE INDEX IF NOT EXISTS "SenkronIs_dosyaId_createdAt_idx" ON "SenkronIs"("dosyaId", "createdAt");
CREATE INDEX IF NOT EXISTS "SenkronIs_durum_updatedAt_idx" ON "SenkronIs"("durum", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "EklentiNabiz_musteriId_cihaz_key" ON "EklentiNabiz"("musteriId", "cihaz");

-- ── Yabancı anahtarlar ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SenkronIs_musteriId_fkey' AND conrelid = '"SenkronIs"'::regclass) THEN
    ALTER TABLE "SenkronIs" ADD CONSTRAINT "SenkronIs_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SenkronIs_dosyaId_fkey' AND conrelid = '"SenkronIs"'::regclass) THEN
    ALTER TABLE "SenkronIs" ADD CONSTRAINT "SenkronIs_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EklentiNabiz_musteriId_fkey' AND conrelid = '"EklentiNabiz"'::regclass) THEN
    ALTER TABLE "EklentiNabiz" ADD CONSTRAINT "EklentiNabiz_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK: iş durum makinesi (tur B2'de büyüyebilir → yalnız lib/sabitler) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SenkronIs_durum_chk' AND conrelid = '"SenkronIs"'::regclass) THEN
    ALTER TABLE "SenkronIs" ADD CONSTRAINT "SenkronIs_durum_chk"
      CHECK ("durum" IN ('BEKLIYOR', 'ALINDI', 'CALISIYOR', 'TAMAM', 'KISMI', 'HATA', 'ZAMAN_ASIMI', 'IPTAL'));
  END IF;
END $$;

ALTER TABLE "SenkronIs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EklentiNabiz" ENABLE ROW LEVEL SECURITY;

COMMIT;
