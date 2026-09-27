BEGIN;
-- 011_dava.sql · Dalga B2 · S27 (dava kaydı, Ray Excel #19–#30, ihtiyati haciz, dava ön kontrolü;
--                               B03, B07, B08, B22, B28, B31) — S28, S29, S30, S31 de bu şemayı kullanır.
-- İçerik: Dava (Asama(DAVA) 1:1 uzantısı; ustDosyaNoHam, karar alanları), DavaTaraf, DavaIslem (Excel türleri,
--         referansNo, excelHam), IhtiyatiHaciz, Masraf.davaId, Etkinlik ekleri (kaynak, kaynakBelgeId, teyit),
--         Sure.davaId → Dava ve Belge.davaId → Dava FK (B1'in B2'ye bıraktığı bağlar)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir.
-- Taslak model: prisma/taslak/b2c.prisma · geri dönüş ve doğrulama: prisma/sql/b2c/README.md
-- ÖNKOŞUL: B1 004 (Belge.davaId) ve 009 (Sure) uygulanmış olmalı; yoksa dosya hata verir ve bütünüyle geri sarılır.
-- Hukuki kayıtlar (Dava, DavaTaraf, DavaIslem, IhtiyatiHaciz): RESTRICT + silindiAt. Veri güncellemesi yok.
-- S29 (yargılama süreleri, ara karar, müzekkere) ayrı SQL getirmez: DavaIslem.detayJson + Sure (B1) + Etkinlik ekleri.

SET LOCAL lock_timeout = '5s';

-- ── Önkoşul ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public."Sure"') IS NULL THEN
    RAISE EXCEPTION '011: "Sure" tablosu yok. Önce B1 (prisma/sql/b1/001–009) uygulanmalı.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'Belge' AND column_name = 'davaId') THEN
    RAISE EXCEPTION '011: "Belge"."davaId" kolonu yok. Önce B1 004_evrak_metin.sql uygulanmalı.';
  END IF;
END $$;

-- ── Mevcut tablolara ekler ──────────────────────────────────────────────────
ALTER TABLE "Masraf" ADD COLUMN IF NOT EXISTS "davaId" TEXT;

ALTER TABLE "Etkinlik"
  ADD COLUMN IF NOT EXISTS "kaynak" TEXT,
  ADD COLUMN IF NOT EXISTS "kaynakBelgeId" TEXT,
  ADD COLUMN IF NOT EXISTS "teyit" TEXT;

-- ── Dava (hukuki kayıt) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Dava" (
    "id" TEXT NOT NULL,
    "asamaId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tur" TEXT,
    "rolumuz" TEXT NOT NULL DEFAULT 'DAVACI',
    "mahkemeTuru" TEXT,
    "mahkemeYer" TEXT,
    "mahkemeNo" TEXT,
    "esasYil" INTEGER,
    "esasSira" INTEGER,
    "usul" TEXT,
    "davaDegeri" DECIMAL(14,2),
    "davaDegeriKaynak" TEXT,
    "acilisTarihi" TIMESTAMP(3),
    "arabuluculukId" TEXT,
    "uyapDosyaId" TEXT,
    "uyapDavaTuruMetni" TEXT,
    "uyapDurumMetni" TEXT,
    "ilgiliDosyaHam" TEXT,
    "birlesenHam" TEXT,
    "ustDosyaNoHam" TEXT,
    "onIncelemeTarihi" TIMESTAMP(3),
    "sonrakiDurusma" TIMESTAMP(3),
    "kesifTarihi" TIMESTAMP(3),
    "evre" TEXT,
    "derece" INTEGER NOT NULL DEFAULT 1,
    "ustDavaId" TEXT,
    "durum" TEXT NOT NULL DEFAULT 'DERDEST',
    "onKontrolJson" JSONB,
    "kararTarihi" TIMESTAMP(3),
    "kararNo" TEXT,
    "hukum" TEXT,
    "kabulAsil" DECIMAL(14,2),
    "kabulFaizBaslangic" TIMESTAMP(3),
    "inkarTazminati" DECIMAL(14,2),
    "inkarTazminatiYon" TEXT,
    "yargilamaGideri" DECIMAL(14,2),
    "yargilamaGideriAleyhe" DECIMAL(14,2),
    "vekaletUcreti" DECIMAL(14,2),
    "vekaletUcretiAleyhe" DECIMAL(14,2),
    "vekaletUcretiYon" TEXT,
    "kararKaynakBelgeId" TEXT,
    "kararOnaylayanId" TEXT,
    "kararOnayAt" TIMESTAMP(3),
    "gerekceliTebligTarihi" TIMESTAMP(3),
    "kesinlesmeTarihi" TIMESTAMP(3),
    "kesinlesmeBelgeId" TEXT,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dava_pkey" PRIMARY KEY ("id")
);

-- ── DavaTaraf (hukuki kayıt; dosyaId = Dava.dosyaId, M7) ────────────────────
CREATE TABLE IF NOT EXISTS "DavaTaraf" (
    "id" TEXT NOT NULL,
    "davaId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "borcluId" TEXT,
    "rol" TEXT NOT NULL,
    "itirazEttiMi" BOOLEAN,
    "adHam" TEXT,
    "kaynakTuru" TEXT,
    "teyit" TEXT NOT NULL DEFAULT 'ADAY',
    "teyitEdenId" TEXT,
    "teyitAt" TIMESTAMP(3),
    "not" TEXT,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DavaTaraf_pkey" PRIMARY KEY ("id")
);

-- ── DavaIslem (hukuki kayıt; dosyaId = Dava.dosyaId, M7) ────────────────────
CREATE TABLE IF NOT EXISTS "DavaIslem" (
    "id" TEXT NOT NULL,
    "davaId" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tur" TEXT NOT NULL,
    "tarih" TIMESTAMP(3),
    "tebligTarihi" TIMESTAMP(3),
    "kaynakBelgeId" TEXT,
    "kaynakTuru" TEXT,
    "uyapEvrakTuru" TEXT,
    "referansNo" TEXT,
    "excelHam" TEXT,
    "ilgiliIslemId" TEXT,
    "detayJson" JSONB,
    "ozet" TEXT,
    "teyit" TEXT NOT NULL DEFAULT 'ADAY',
    "teyitEdenId" TEXT,
    "teyitAt" TIMESTAMP(3),
    "tekilAnahtar" TEXT,
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DavaIslem_pkey" PRIMARY KEY ("id")
);

-- ── IhtiyatiHaciz (hukuki kayıt; Ray Excel #27) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "IhtiyatiHaciz" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "davaId" TEXT,
    "asama" TEXT NOT NULL,
    "talepTarihi" TIMESTAMP(3),
    "sonuc" TEXT NOT NULL DEFAULT 'BEKLIYOR',
    "kararTarihi" TIMESTAMP(3),
    "kararTebligTarihi" TIMESTAMP(3),
    "kararBelgeId" TEXT,
    "teminatOrani" TEXT,
    "teminatTutari" DECIMAL(14,2),
    "teminatYatirildiAt" TIMESTAMP(3),
    "infazTalepTarihi" TIMESTAMP(3),
    "excelHam" TEXT,
    "kaynakTuru" TEXT,
    "teyit" TEXT NOT NULL DEFAULT 'ADAY',
    "teyitEdenId" TEXT,
    "teyitAt" TIMESTAMP(3),
    "silindiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IhtiyatiHaciz_pkey" PRIMARY KEY ("id")
);

-- ── İndeksler ───────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "Dava_asamaId_key" ON "Dava"("asamaId");
CREATE INDEX IF NOT EXISTS "Dava_dosyaId_idx" ON "Dava"("dosyaId");
CREATE INDEX IF NOT EXISTS "Dava_uyapDosyaId_idx" ON "Dava"("uyapDosyaId");
CREATE INDEX IF NOT EXISTS "DavaTaraf_davaId_idx" ON "DavaTaraf"("davaId");
CREATE INDEX IF NOT EXISTS "DavaTaraf_dosyaId_idx" ON "DavaTaraf"("dosyaId");
CREATE INDEX IF NOT EXISTS "DavaIslem_davaId_tur_idx" ON "DavaIslem"("davaId", "tur");
CREATE INDEX IF NOT EXISTS "DavaIslem_dosyaId_idx" ON "DavaIslem"("dosyaId");
-- Aday tekilleştirme savunma hattı (UYAP senkronu + Excel yeniden içe aktarımı): NULL'lar çakışmaz.
CREATE UNIQUE INDEX IF NOT EXISTS "DavaIslem_dosyaId_tekilAnahtar_key" ON "DavaIslem"("dosyaId", "tekilAnahtar");
CREATE INDEX IF NOT EXISTS "IhtiyatiHaciz_dosyaId_idx" ON "IhtiyatiHaciz"("dosyaId");
CREATE INDEX IF NOT EXISTS "IhtiyatiHaciz_davaId_idx" ON "IhtiyatiHaciz"("davaId");

-- ── Yabancı anahtarlar ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dava_asamaId_fkey' AND conrelid = '"Dava"'::regclass) THEN
    ALTER TABLE "Dava" ADD CONSTRAINT "Dava_asamaId_fkey" FOREIGN KEY ("asamaId") REFERENCES "Asama"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dava_dosyaId_fkey' AND conrelid = '"Dava"'::regclass) THEN
    ALTER TABLE "Dava" ADD CONSTRAINT "Dava_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DavaTaraf_davaId_fkey' AND conrelid = '"DavaTaraf"'::regclass) THEN
    ALTER TABLE "DavaTaraf" ADD CONSTRAINT "DavaTaraf_davaId_fkey" FOREIGN KEY ("davaId") REFERENCES "Dava"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DavaTaraf_dosyaId_fkey' AND conrelid = '"DavaTaraf"'::regclass) THEN
    ALTER TABLE "DavaTaraf" ADD CONSTRAINT "DavaTaraf_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DavaIslem_davaId_fkey' AND conrelid = '"DavaIslem"'::regclass) THEN
    ALTER TABLE "DavaIslem" ADD CONSTRAINT "DavaIslem_davaId_fkey" FOREIGN KEY ("davaId") REFERENCES "Dava"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DavaIslem_dosyaId_fkey' AND conrelid = '"DavaIslem"'::regclass) THEN
    ALTER TABLE "DavaIslem" ADD CONSTRAINT "DavaIslem_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IhtiyatiHaciz_dosyaId_fkey' AND conrelid = '"IhtiyatiHaciz"'::regclass) THEN
    ALTER TABLE "IhtiyatiHaciz" ADD CONSTRAINT "IhtiyatiHaciz_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IhtiyatiHaciz_davaId_fkey' AND conrelid = '"IhtiyatiHaciz"'::regclass) THEN
    ALTER TABLE "IhtiyatiHaciz" ADD CONSTRAINT "IhtiyatiHaciz_davaId_fkey" FOREIGN KEY ("davaId") REFERENCES "Dava"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- B1'den devralınan bağlar (004 Belge.davaId, 009 Sure.davaId FK'siz düz kolon). Kısıt eklenirken mevcut satırlar
  -- denetlenir; bu noktada Dava boş olduğundan dolu bir davaId yetim demektir → anlaşılır hatayla dur.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sure_davaId_fkey' AND conrelid = '"Sure"'::regclass) THEN
    IF EXISTS (SELECT 1 FROM "Sure" s WHERE s."davaId" IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM "Dava" d WHERE d."id" = s."davaId")) THEN
      RAISE EXCEPTION '011: "Sure"."davaId" yetim değer taşıyor; README §5 sorgusuyla bulun, düzeltmeden uygulamayın.';
    END IF;
    ALTER TABLE "Sure" ADD CONSTRAINT "Sure_davaId_fkey" FOREIGN KEY ("davaId") REFERENCES "Dava"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Belge_davaId_fkey' AND conrelid = '"Belge"'::regclass) THEN
    IF EXISTS (SELECT 1 FROM "Belge" b WHERE b."davaId" IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM "Dava" d WHERE d."id" = b."davaId")) THEN
      RAISE EXCEPTION '011: "Belge"."davaId" yetim değer taşıyor; README §5 sorgusuyla bulun, düzeltmeden uygulamayın.';
    END IF;
    ALTER TABLE "Belge" ADD CONSTRAINT "Belge_davaId_fkey" FOREIGN KEY ("davaId") REFERENCES "Dava"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── CHECK kısıtları (yalnız kapalı listeler; Dava.tur/durum/evre/mahkemeTuru, DavaTaraf.rol, DavaIslem.tur büyüyebilir) ──
-- Yeni kolonlar boş (NULL) başladığı için mevcut Etkinlik satırları kısıtı hemen sağlar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dava_rolumuz_chk' AND conrelid = '"Dava"'::regclass) THEN
    ALTER TABLE "Dava" ADD CONSTRAINT "Dava_rolumuz_chk"
      CHECK ("rolumuz" IN ('DAVACI', 'DAVALI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dava_usul_chk' AND conrelid = '"Dava"'::regclass) THEN
    ALTER TABLE "Dava" ADD CONSTRAINT "Dava_usul_chk"
      CHECK ("usul" IS NULL OR "usul" IN ('BASIT', 'YAZILI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dava_derece_chk' AND conrelid = '"Dava"'::regclass) THEN
    ALTER TABLE "Dava" ADD CONSTRAINT "Dava_derece_chk"
      CHECK ("derece" IN (1, 2, 3));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dava_hukum_chk' AND conrelid = '"Dava"'::regclass) THEN
    ALTER TABLE "Dava" ADD CONSTRAINT "Dava_hukum_chk"
      CHECK ("hukum" IS NULL OR "hukum" IN ('KABUL', 'KISMEN_KABUL', 'RET', 'DIGER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DavaTaraf_teyit_chk' AND conrelid = '"DavaTaraf"'::regclass) THEN
    ALTER TABLE "DavaTaraf" ADD CONSTRAINT "DavaTaraf_teyit_chk"
      CHECK ("teyit" IN ('ADAY', 'TEYITLI', 'REDDEDILDI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DavaIslem_teyit_chk' AND conrelid = '"DavaIslem"'::regclass) THEN
    ALTER TABLE "DavaIslem" ADD CONSTRAINT "DavaIslem_teyit_chk"
      CHECK ("teyit" IN ('ADAY', 'TEYITLI', 'REDDEDILDI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IhtiyatiHaciz_asama_chk' AND conrelid = '"IhtiyatiHaciz"'::regclass) THEN
    ALTER TABLE "IhtiyatiHaciz" ADD CONSTRAINT "IhtiyatiHaciz_asama_chk"
      CHECK ("asama" IN ('TAKIP_ONCESI', 'DAVADA', 'ILAMLI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IhtiyatiHaciz_sonuc_chk' AND conrelid = '"IhtiyatiHaciz"'::regclass) THEN
    ALTER TABLE "IhtiyatiHaciz" ADD CONSTRAINT "IhtiyatiHaciz_sonuc_chk"
      CHECK ("sonuc" IN ('BEKLIYOR', 'KABUL', 'RED', 'KISMEN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IhtiyatiHaciz_teyit_chk' AND conrelid = '"IhtiyatiHaciz"'::regclass) THEN
    ALTER TABLE "IhtiyatiHaciz" ADD CONSTRAINT "IhtiyatiHaciz_teyit_chk"
      CHECK ("teyit" IN ('ADAY', 'TEYITLI', 'REDDEDILDI'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Etkinlik_teyit_chk' AND conrelid = '"Etkinlik"'::regclass) THEN
    ALTER TABLE "Etkinlik" ADD CONSTRAINT "Etkinlik_teyit_chk"
      CHECK ("teyit" IS NULL OR "teyit" IN ('ADAY', 'TEYITLI', 'REDDEDILDI'));
  END IF;
END $$;

ALTER TABLE "Dava" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DavaTaraf" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DavaIslem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IhtiyatiHaciz" ENABLE ROW LEVEL SECURITY;

COMMIT;
