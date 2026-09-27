BEGIN;
-- 009_sure.sql · Dalga B1 · S24 (süre defteri v1 ve hatırlatma; B01, B12, B21, B52)
-- İçerik: Sure — önerilen (ihtiyatlı ve durmalı) ve onaylanan son gün ayrı
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- Hukuki kayıt: RESTRICT + silindiAt (R0 aktarımının geri alınması = silindiAt, 06 §6.4).
-- borcluId / davaId / arabuluculukId FK'siz düz kolon: Dava ve Arabuluculuk tabloları B2'de (010–011).
-- tur listesi B2'de (HMK süreleri) büyüyeceği için CHECK yalnız durumda. Hesap kuralları "teyit gerekli".

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "Sure" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "borcluId" TEXT,
    "davaId" TEXT,
    "arabuluculukId" TEXT,
    "tur" TEXT NOT NULL,
    "dayanak" TEXT NOT NULL,
    "kaynakBelgeId" TEXT,
    "kaynakAlinti" TEXT,
    "tetikTarihi" TIMESTAMP(3),
    "tetikTuru" TEXT,
    "uetsUlasmaTarihi" TIMESTAMP(3),
    "hakimSuresiGun" INTEGER,
    "kesinSureIhtari" BOOLEAN,
    "durmaJson" JSONB,
    "onerilenIhtiyatli" TIMESTAMP(3),
    "onerilenSonGun" TIMESTAMP(3),
    "hesapIziJson" JSONB,
    "onaylananSonGun" TIMESTAMP(3),
    "onaylayanId" TEXT,
    "onayAt" TIMESTAMP(3),
    "bakilanEvrak" TEXT,
    "ikinciTeyitId" TEXT,
    "ikinciTeyitAt" TIMESTAMP(3),
    "sorumluId" TEXT,
    "durum" TEXT NOT NULL DEFAULT 'ACIK',
    "kapanisKanitiBelgeId" TEXT,
    "kapanisNot" TEXT,
    "kapatanId" TEXT,
    "kapanisAt" TIMESTAMP(3),
    "hatirlatmaJson" JSONB,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sure_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler (hatırlatma cron'u onaylanan, yoksa ihtiyatlı güne göre tarar) ──
CREATE INDEX IF NOT EXISTS "Sure_dosyaId_durum_idx" ON "Sure"("dosyaId", "durum");
CREATE INDEX IF NOT EXISTS "Sure_onaylananSonGun_idx" ON "Sure"("onaylananSonGun");
CREATE INDEX IF NOT EXISTS "Sure_onerilenIhtiyatli_idx" ON "Sure"("onerilenIhtiyatli");

-- ── Yabancı anahtar ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sure_dosyaId_fkey' AND conrelid = '"Sure"'::regclass) THEN
    ALTER TABLE "Sure" ADD CONSTRAINT "Sure_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK: süre durum makinesi ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sure_durum_chk' AND conrelid = '"Sure"'::regclass) THEN
    ALTER TABLE "Sure" ADD CONSTRAINT "Sure_durum_chk"
      CHECK ("durum" IN ('TETIK_BEKLIYOR', 'ACIK', 'KAPANMAYA_HAZIR', 'KAPANDI', 'IPTAL'));
  END IF;
END $$;

ALTER TABLE "Sure" ENABLE ROW LEVEL SECURITY;

COMMIT;
