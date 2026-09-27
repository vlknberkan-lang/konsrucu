BEGIN;
-- 002_eklenti_anahtar.sql · Dalga B1 · S14 (kimlik ve yetki: eklenti anahtarı; B51, B32)
-- İçerik: EklentiAnahtar (düz anahtar değil sha256 özeti; kişiye bağlı, süreli, iptal edilebilir)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md
-- FK'ler CASCADE: kiracı ya da kişi fiziksel silinirse anahtarı yaşamamalı (güvenlik).
-- Eski Ayarlar.senkronToken'a dokunulmaz; geçiş süresince eski uçlarda çalışır (kesme S42 + 2 hafta).

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "EklentiAnahtar" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "kullaniciId" TEXT NOT NULL,
    "ozet" TEXT NOT NULL,
    "onek" TEXT NOT NULL,
    "ad" TEXT,
    "sonKullanma" TIMESTAMP(3) NOT NULL,
    "iptalAt" TIMESTAMP(3),
    "sonGorulme" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EklentiAnahtar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EklentiAnahtar_ozet_key" ON "EklentiAnahtar"("ozet");
CREATE INDEX IF NOT EXISTS "EklentiAnahtar_musteriId_idx" ON "EklentiAnahtar"("musteriId");
CREATE INDEX IF NOT EXISTS "EklentiAnahtar_kullaniciId_idx" ON "EklentiAnahtar"("kullaniciId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EklentiAnahtar_musteriId_fkey' AND conrelid = '"EklentiAnahtar"'::regclass) THEN
    ALTER TABLE "EklentiAnahtar" ADD CONSTRAINT "EklentiAnahtar_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EklentiAnahtar_kullaniciId_fkey' AND conrelid = '"EklentiAnahtar"'::regclass) THEN
    ALTER TABLE "EklentiAnahtar" ADD CONSTRAINT "EklentiAnahtar_kullaniciId_fkey" FOREIGN KEY ("kullaniciId") REFERENCES "Kullanici"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: anahtar özetleri PostgREST'ten asla okunmamalı (politika yok = erişim yok).
ALTER TABLE "EklentiAnahtar" ENABLE ROW LEVEL SECURITY;

COMMIT;
