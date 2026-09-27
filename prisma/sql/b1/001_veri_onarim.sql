BEGIN;
-- 001_veri_onarim.sql · Dalga B1 · S13 (Veri Onarımı aracı; B34)
-- İçerik: VeriOnarim (islem, hedefTablo, hedefId ile), DurumGecisi, RucuDosyasi.onarimDurumu
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir (IF NOT EXISTS / pg_constraint denetimi).
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- İz kayıtları (VeriOnarim, DurumGecisi) yalnız eklenir; FK'ler RESTRICT.

-- Kilit beklerken canlı trafiği kuyruğa sokmasın: 5 sn'de alınamazsa işlem geri sarılır, sonra yeniden denenir.
SET LOCAL lock_timeout = '5s';

-- ── RucuDosyasi eki ─────────────────────────────────────────────────────────
ALTER TABLE "RucuDosyasi" ADD COLUMN IF NOT EXISTS "onarimDurumu" TEXT;

-- ── VeriOnarim (iz kaydı) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VeriOnarim" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "parti" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "islem" TEXT NOT NULL DEFAULT 'GUNCELLE',
    "hedefTablo" TEXT NOT NULL,
    "hedefId" TEXT,
    "alan" TEXT NOT NULL,
    "eskiJson" JSONB NOT NULL,
    "yeniJson" JSONB NOT NULL,
    "kanit" TEXT NOT NULL,
    "guvenSinifi" TEXT NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'KURU',
    "onaylayanId" TEXT,
    "onayAt" TIMESTAMP(3),
    "uygulandiAt" TIMESTAMP(3),
    "geriAlindiAt" TIMESTAMP(3),
    "not" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VeriOnarim_pkey" PRIMARY KEY ("id")
);

-- ── DurumGecisi (iz kaydı; gölge kip dahil) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "DurumGecisi" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "eksen" TEXT NOT NULL,
    "eski" TEXT,
    "yeni" TEXT NOT NULL,
    "teyit" TEXT NOT NULL,
    "sebep" TEXT NOT NULL,
    "kaynakTuru" TEXT NOT NULL,
    "kaynakId" TEXT,
    "kullaniciId" TEXT,
    "golge" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DurumGecisi_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler (adlar Prisma'nın üreteceği adlarla birebir) ─────────────────
CREATE INDEX IF NOT EXISTS "VeriOnarim_parti_durum_idx" ON "VeriOnarim"("parti", "durum");
CREATE INDEX IF NOT EXISTS "VeriOnarim_dosyaId_idx" ON "VeriOnarim"("dosyaId");
CREATE INDEX IF NOT EXISTS "VeriOnarim_musteriId_kod_durum_idx" ON "VeriOnarim"("musteriId", "kod", "durum");
CREATE INDEX IF NOT EXISTS "DurumGecisi_dosyaId_createdAt_idx" ON "DurumGecisi"("dosyaId", "createdAt");

-- ── Yabancı anahtarlar (Postgres'te ADD CONSTRAINT IF NOT EXISTS yok → pg_constraint denetimi) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VeriOnarim_musteriId_fkey' AND conrelid = '"VeriOnarim"'::regclass) THEN
    ALTER TABLE "VeriOnarim" ADD CONSTRAINT "VeriOnarim_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VeriOnarim_dosyaId_fkey' AND conrelid = '"VeriOnarim"'::regclass) THEN
    ALTER TABLE "VeriOnarim" ADD CONSTRAINT "VeriOnarim_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DurumGecisi_dosyaId_fkey' AND conrelid = '"DurumGecisi"'::regclass) THEN
    ALTER TABLE "DurumGecisi" ADD CONSTRAINT "DurumGecisi_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları (06 §3.1 ilke 2; değer listesi lib/sabitler ile aynı tutulur) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RucuDosyasi_onarimDurumu_chk' AND conrelid = '"RucuDosyasi"'::regclass) THEN
    ALTER TABLE "RucuDosyasi" ADD CONSTRAINT "RucuDosyasi_onarimDurumu_chk"
      CHECK ("onarimDurumu" IS NULL OR "onarimDurumu" IN ('BEKLIYOR', 'ONARILDI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VeriOnarim_islem_chk' AND conrelid = '"VeriOnarim"'::regclass) THEN
    ALTER TABLE "VeriOnarim" ADD CONSTRAINT "VeriOnarim_islem_chk"
      CHECK ("islem" IN ('GUNCELLE', 'EKLE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VeriOnarim_durum_chk' AND conrelid = '"VeriOnarim"'::regclass) THEN
    ALTER TABLE "VeriOnarim" ADD CONSTRAINT "VeriOnarim_durum_chk"
      CHECK ("durum" IN ('KURU', 'ONAYLI', 'REDDEDILDI', 'UYGULANDI', 'ATLANDI', 'GERI_ALINDI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VeriOnarim_guvenSinifi_chk' AND conrelid = '"VeriOnarim"'::regclass) THEN
    ALTER TABLE "VeriOnarim" ADD CONSTRAINT "VeriOnarim_guvenSinifi_chk"
      CHECK ("guvenSinifi" IN ('A', 'B', 'C'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DurumGecisi_eksen_chk' AND conrelid = '"DurumGecisi"'::regclass) THEN
    ALTER TABLE "DurumGecisi" ADD CONSTRAINT "DurumGecisi_eksen_chk"
      CHECK ("eksen" IN ('ICRA', 'ARAB', 'DAVA', 'ESKI_DURUM'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DurumGecisi_teyit_chk' AND conrelid = '"DurumGecisi"'::regclass) THEN
    ALTER TABLE "DurumGecisi" ADD CONSTRAINT "DurumGecisi_teyit_chk"
      CHECK ("teyit" IN ('TEYITSIZ', 'TEYITLI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DurumGecisi_kaynakTuru_chk' AND conrelid = '"DurumGecisi"'::regclass) THEN
    ALTER TABLE "DurumGecisi" ADD CONSTRAINT "DurumGecisi_kaynakTuru_chk"
      CHECK ("kaynakTuru" IN ('KURAL', 'AVUKAT', 'ONARIM'));
  END IF;
END $$;

-- ── RLS (derin savunma, mevcut tablolarla aynı: uygulama RLS'ye takılmayan rolle bağlanır;
--    anon/authenticated için politika yok = PostgREST'ten erişim yok) ──
ALTER TABLE "VeriOnarim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DurumGecisi" ENABLE ROW LEVEL SECURITY;

COMMIT;
