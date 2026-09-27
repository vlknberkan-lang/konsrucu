BEGIN;
-- 012_kapanis.sql · Dalga B2 · S31 (karar, kanun yolu, tahsilat onayı, kapalı dosya radarı; B22, B25, B30)
-- İçerik: RucuDosyasi.kapanisSebebi, kapanisAt, kapanisKaydedenId (TASLAK EKİ)
-- Yalnız ekleme · tek işlem · tekrar çalıştırılabilir. Önkoşul yok (yalnız mevcut tabloya kolon ekler).
-- Taslak model: prisma/taslak/b2c.prisma · geri dönüş ve doğrulama: prisma/sql/b2c/README.md
-- S31'in öteki verisi başka yerde: karar kartı → "Dava" karar kolonları (011); kanun yolu → Dava.derece/ustDavaId (011),
-- Sure HMK345/HMK361 (B1 009), OnayKaydi(KANUN_YOLU) ve YolSecimi(KARAR_SONRASI) (010); tahsilat onayı →
-- TakipOlayi(altTip = TAHSILAT_BORCLUDAN, teyit) (B1 003).
-- kapanisSebebi'ne CHECK bilerek yok: liste büyüyebilir (takibi bırakma, yetkisizlik …); değerler lib/sabitler'de.
-- BILINMIYOR ya da boş sebep = UYAP'ta "kapalı" görünen dosya radarda kalır (SN-06). Veri güncellemesi yok.

SET LOCAL lock_timeout = '5s';

ALTER TABLE "RucuDosyasi"
  ADD COLUMN IF NOT EXISTS "kapanisSebebi" TEXT,
  ADD COLUMN IF NOT EXISTS "kapanisAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kapanisKaydedenId" TEXT;

COMMIT;
