BEGIN;
-- 003_aday_olay_eksen.sql · Dalga B1 · S15 (aday olaylar, borçlu takibi, üç eksen/gölge kip, tahsilat kuralı;
--                                          B08, B23, B24, B30) — S23'ün onay kartları da bu şemayı kullanır.
-- İçerik: TakipOlayi aday kolonları (+ tekilAnahtar), BorcluTakip, Borclu ekleri (tur, rolKodlari, vekilJson),
--         RucuDosyasi eksen kolonları, yolOnaylayanId / yolOnayAt.
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- Eski TakipOlayi satırları teyit = NULL kalır → yeni hesaplara girmez (06 §3.6). Veri güncellemesi yok.

SET LOCAL lock_timeout = '5s';

-- ── RucuDosyasi: üç eksen (türetilmiş önbellek) + yol onayı ─────────────────
ALTER TABLE "RucuDosyasi"
  ADD COLUMN IF NOT EXISTS "icraEksen" TEXT,
  ADD COLUMN IF NOT EXISTS "arabEksen" TEXT,
  ADD COLUMN IF NOT EXISTS "davaEksen" TEXT,
  ADD COLUMN IF NOT EXISTS "eksenJson" JSONB,
  ADD COLUMN IF NOT EXISTS "eksenHesapAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "yolOnaylayanId" TEXT,
  ADD COLUMN IF NOT EXISTS "yolOnayAt" TIMESTAMP(3);

-- ── Borclu: tür, çoklu rol, vekil ───────────────────────────────────────────
-- rolKodlari: Prisma String[] @default([]) eşlemesi (NULL'a izinli dizi, varsayılan boş dizi).
ALTER TABLE "Borclu"
  ADD COLUMN IF NOT EXISTS "tur" TEXT,
  ADD COLUMN IF NOT EXISTS "rolKodlari" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "vekilJson" JSONB;

-- ── TakipOlayi: aday olay kolonları ─────────────────────────────────────────
ALTER TABLE "TakipOlayi"
  ADD COLUMN IF NOT EXISTS "altTip" TEXT,
  ADD COLUMN IF NOT EXISTS "borcluId" TEXT,
  ADD COLUMN IF NOT EXISTS "sonuc" TEXT,
  ADD COLUMN IF NOT EXISTS "tebligSekli" TEXT,
  ADD COLUMN IF NOT EXISTS "muhatap" TEXT,
  ADD COLUMN IF NOT EXISTS "hukukiTarih" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "teyit" TEXT,
  ADD COLUMN IF NOT EXISTS "kaynakTuru" TEXT,
  ADD COLUMN IF NOT EXISTS "kaynakBelgeId" TEXT,
  ADD COLUMN IF NOT EXISTS "kural" TEXT,
  ADD COLUMN IF NOT EXISTS "teyitEdenId" TEXT,
  ADD COLUMN IF NOT EXISTS "teyitAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tekilAnahtar" TEXT;

-- ── BorcluTakip (hukuki kayıt: RESTRICT + silindiAt) ────────────────────────
CREATE TABLE IF NOT EXISTS "BorcluTakip" (
    "id" TEXT NOT NULL,
    "borcluId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tebligTarihi" TIMESTAMP(3),
    "tebligSekli" TEXT,
    "tebligSonucu" TEXT,
    "uetsUlasmaTarihi" TIMESTAMP(3),
    "tebligKaynakBelgeId" TEXT,
    "itirazVar" BOOLEAN,
    "itirazVerilisTarihi" TIMESTAMP(3),
    "itirazUyapTarihi" TIMESTAMP(3),
    "itirazTipi" TEXT,
    "itirazKapsamJson" JSONB,
    "itirazEdilenTutar" DECIMAL(14,2),
    "itirazKaynakBelgeId" TEXT,
    "itirazAlacakliyaTebligTarihi" TIMESTAMP(3),
    "itirazAlacakliyaTebligKaynak" TEXT,
    "guncelleyenId" TEXT,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorcluTakip_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "BorcluTakip_borcluId_key" ON "BorcluTakip"("borcluId");
CREATE INDEX IF NOT EXISTS "BorcluTakip_dosyaId_idx" ON "BorcluTakip"("dosyaId");
CREATE INDEX IF NOT EXISTS "RucuDosyasi_musteriId_icraEksen_idx" ON "RucuDosyasi"("musteriId", "icraEksen");
CREATE INDEX IF NOT EXISTS "TakipOlayi_dosyaId_teyit_idx" ON "TakipOlayi"("dosyaId", "teyit");
-- Aday tekilleştirme savunma hattı: eski satırlarda tekilAnahtar NULL → Postgres'te NULL'lar çakışmaz.
CREATE UNIQUE INDEX IF NOT EXISTS "TakipOlayi_dosyaId_tekilAnahtar_key" ON "TakipOlayi"("dosyaId", "tekilAnahtar");

-- ── Yabancı anahtarlar ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BorcluTakip_borcluId_fkey' AND conrelid = '"BorcluTakip"'::regclass) THEN
    ALTER TABLE "BorcluTakip" ADD CONSTRAINT "BorcluTakip_borcluId_fkey" FOREIGN KEY ("borcluId") REFERENCES "Borclu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BorcluTakip_dosyaId_fkey' AND conrelid = '"BorcluTakip"'::regclass) THEN
    ALTER TABLE "BorcluTakip" ADD CONSTRAINT "BorcluTakip_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları (yalnız kapalı listeler; altTip ve eksenler büyüyebilir → yalnız lib/sabitler) ──
-- Yeni kolonlar boş (NULL) başladığı için mevcut satırlar kısıtı hemen sağlar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TakipOlayi_teyit_chk' AND conrelid = '"TakipOlayi"'::regclass) THEN
    ALTER TABLE "TakipOlayi" ADD CONSTRAINT "TakipOlayi_teyit_chk"
      CHECK ("teyit" IS NULL OR "teyit" IN ('ADAY', 'TEYITLI', 'REDDEDILDI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Borclu_tur_chk' AND conrelid = '"Borclu"'::regclass) THEN
    ALTER TABLE "Borclu" ADD CONSTRAINT "Borclu_tur_chk"
      CHECK ("tur" IS NULL OR "tur" IN ('GERCEK', 'OZEL_TUZEL', 'KAMU'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BorcluTakip_tebligSonucu_chk' AND conrelid = '"BorcluTakip"'::regclass) THEN
    ALTER TABLE "BorcluTakip" ADD CONSTRAINT "BorcluTakip_tebligSonucu_chk"
      CHECK ("tebligSonucu" IS NULL OR "tebligSonucu" IN ('TEBLIG', 'IADE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BorcluTakip_itirazTipi_chk' AND conrelid = '"BorcluTakip"'::regclass) THEN
    ALTER TABLE "BorcluTakip" ADD CONSTRAINT "BorcluTakip_itirazTipi_chk"
      CHECK ("itirazTipi" IS NULL OR "itirazTipi" IN ('TAM', 'KISMI'));
  END IF;
END $$;

ALTER TABLE "BorcluTakip" ENABLE ROW LEVEL SECURITY;

COMMIT;
