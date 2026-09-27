BEGIN;
-- 006_yol_haritasi.sql · Dalga B1 · S20 (Dosya Yol Haritası v1, yönlendirme motoru, prova modu; B41)
-- İçerik: RucuDosyasi.yolHaritasiJson — siradakiAdim() önbelleği {simdi, sonra[], bekleme, kural, at}
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir. Yeni tablo yok (RLS adımı gerekmez).
-- Taslak model: prisma/taslak/b1.prisma · geri dönüş ve doğrulama: prisma/sql/b1/README.md

SET LOCAL lock_timeout = '5s';

ALTER TABLE "RucuDosyasi" ADD COLUMN IF NOT EXISTS "yolHaritasiJson" JSONB;

COMMIT;
