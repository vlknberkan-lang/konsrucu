BEGIN;
-- 015_dilekce.sql · Dalga C · S36 (iskelet, üslup kartı, dava dilekçesi v2; B06, B11, B19, B27, B53) — S40 da kullanır.
-- İçerik: DilekceSurum (AI ham ve avukat sürümü ayrı; [O-n] bağları, üretim meta verisi), DilekceSablon (iskelet),
--         UslupKurali (üslup kartı; S40 öğrenme döngüsü alanlarıyla), UretilenCikti ekleri, AiKullanim önbellek kolonları (B53)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir. Önkoşul yok (yalnız mevcut tablolara dayanır).
-- Taslak model: prisma/taslak/b2c.prisma · geri dönüş ve doğrulama: prisma/sql/b2c/README.md
-- DilekceSurum hukuki kayıttır: RESTRICT + silindiAt → sürümü olan UretilenCikti fiziksel silinemez (B27: "yeniden üret"
-- eski sürümü ezemez). DilekceSablon ve UslupKurali kiracı kütüphanesidir: Musteri → CASCADE; kayıt pasife alınır.
-- UretilenCikti."updatedAt": sabit varsayılanlı NOT NULL ekleme; Postgres 11+ tabloyu yeniden yazmaz, mevcut satırlar
-- uygulama anını alır. Veri güncellemesi yok.

SET LOCAL lock_timeout = '5s';

-- ── Mevcut tablolara ekler ──────────────────────────────────────────────────
ALTER TABLE "UretilenCikti"
  ADD COLUMN IF NOT EXISTS "tur" TEXT,
  ADD COLUMN IF NOT EXISTS "davaId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "duzenleyenId" TEXT,
  ADD COLUMN IF NOT EXISTS "modelSurum" TEXT;

ALTER TABLE "AiKullanim"
  ADD COLUMN IF NOT EXISTS "onbellekOkunanToken" INTEGER,
  ADD COLUMN IF NOT EXISTS "onbellekYazilanToken" INTEGER;

-- ── DilekceSurum (hukuki kayıt; dosyaId = UretilenCikti.dosyaId, M7) ───────
CREATE TABLE IF NOT EXISTS "DilekceSurum" (
    "id" TEXT NOT NULL,
    "ciktiId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "sira" INTEGER NOT NULL,
    "kaynak" TEXT NOT NULL,
    "icerik" TEXT NOT NULL,
    "talimat" TEXT,
    "kartId" TEXT,
    "sablonId" TEXT,
    "uslupSurum" INTEGER,
    "model" TEXT,
    "promptSurum" TEXT,
    "kaynakBelgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "olguBaglariJson" JSONB,
    "uretimJson" JSONB,
    "kaliteJson" JSONB,
    "atifJson" JSONB,
    "durum" TEXT NOT NULL DEFAULT 'TASLAK',
    "kilitAt" TIMESTAMP(3),
    "uyapBelgeId" TEXT,
    "yazanId" TEXT,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DilekceSurum_pkey" PRIMARY KEY ("id")
);

-- ── DilekceSablon (iskelet; müvekkil bazında) ───────────────────────────────
CREATE TABLE IF NOT EXISTS "DilekceSablon" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "tur" TEXT NOT NULL,
    "varyantJson" JSONB NOT NULL,
    "bloklarJson" JSONB NOT NULL,
    "kaynakOrnek" TEXT,
    "surum" INTEGER NOT NULL,
    "onaylayanId" TEXT,
    "onayAt" TIMESTAMP(3),
    "aktif" BOOLEAN NOT NULL DEFAULT false,
    "bilgiBankasiYolu" TEXT,
    "icerikOzet" TEXT,
    "yuklemeId" TEXT,
    "kopyaKaynakId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DilekceSablon_pkey" PRIMARY KEY ("id")
);

-- ── UslupKurali (üslup kartı; müvekkil bazında) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "UslupKurali" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "kapsam" TEXT NOT NULL,
    "metin" TEXT NOT NULL,
    "ornek" TEXT,
    "kaynak" TEXT NOT NULL,
    "durum" TEXT NOT NULL DEFAULT 'ONERI',
    "surum" INTEGER NOT NULL DEFAULT 1,
    "pasifSurum" INTEGER,
    "kaynakSurumId" TEXT,
    "onaylayanId" TEXT,
    "onayAt" TIMESTAMP(3),
    "yuklemeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UslupKurali_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "DilekceSurum_dosyaId_idx" ON "DilekceSurum"("dosyaId");
-- Çıktı başına sürüm sırası tekil: eşzamanlı iki "kaydet"te aynı sıra iki kez açılmaz.
CREATE UNIQUE INDEX IF NOT EXISTS "DilekceSurum_ciktiId_sira_key" ON "DilekceSurum"("ciktiId", "sira");
CREATE INDEX IF NOT EXISTS "DilekceSablon_musteriId_tur_aktif_idx" ON "DilekceSablon"("musteriId", "tur", "aktif");
-- araclar/sablon-yukle.ts'nin idempotent anahtarı (S33 deseni).
CREATE UNIQUE INDEX IF NOT EXISTS "DilekceSablon_musteriId_kod_surum_key" ON "DilekceSablon"("musteriId", "kod", "surum");
CREATE INDEX IF NOT EXISTS "UslupKurali_musteriId_durum_idx" ON "UslupKurali"("musteriId", "durum");

-- ── Yabancı anahtarlar ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DilekceSurum_ciktiId_fkey' AND conrelid = '"DilekceSurum"'::regclass) THEN
    ALTER TABLE "DilekceSurum" ADD CONSTRAINT "DilekceSurum_ciktiId_fkey" FOREIGN KEY ("ciktiId") REFERENCES "UretilenCikti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DilekceSurum_dosyaId_fkey' AND conrelid = '"DilekceSurum"'::regclass) THEN
    ALTER TABLE "DilekceSurum" ADD CONSTRAINT "DilekceSurum_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DilekceSablon_musteriId_fkey' AND conrelid = '"DilekceSablon"'::regclass) THEN
    ALTER TABLE "DilekceSablon" ADD CONSTRAINT "DilekceSablon_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UslupKurali_musteriId_fkey' AND conrelid = '"UslupKurali"'::regclass) THEN
    ALTER TABLE "UslupKurali" ADD CONSTRAINT "UslupKurali_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları (kapalı listeler; UretilenCikti.tur, DilekceSablon.tur, UslupKurali.kaynak/kapsam büyüyebilir) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DilekceSurum_kaynak_chk' AND conrelid = '"DilekceSurum"'::regclass) THEN
    ALTER TABLE "DilekceSurum" ADD CONSTRAINT "DilekceSurum_kaynak_chk"
      CHECK ("kaynak" IN ('AI_HAM', 'AVUKAT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DilekceSurum_durum_chk' AND conrelid = '"DilekceSurum"'::regclass) THEN
    ALTER TABLE "DilekceSurum" ADD CONSTRAINT "DilekceSurum_durum_chk"
      CHECK ("durum" IN ('TASLAK', 'IMZAYA_HAZIR', 'GONDERILDI_UYAP'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UslupKurali_durum_chk' AND conrelid = '"UslupKurali"'::regclass) THEN
    ALTER TABLE "UslupKurali" ADD CONSTRAINT "UslupKurali_durum_chk"
      CHECK ("durum" IN ('ONERI', 'ONAYLI', 'PASIF'));
  END IF;
END $$;

ALTER TABLE "DilekceSurum" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DilekceSablon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UslupKurali" ENABLE ROW LEVEL SECURITY;

COMMIT;
