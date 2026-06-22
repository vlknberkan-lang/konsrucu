-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'AVUKAT', 'AVUKAT_YRD', 'GORUNTULEYEN');

-- CreateEnum
CREATE TYPE "Yol" AS ENUM ('KLASIK', 'IDARI', 'BELIRSIZ');

-- CreateEnum
CREATE TYPE "DosyaDurum" AS ENUM ('HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR', 'TAKIP_ACILDI', 'TEBLIG_EDILDI', 'ITIRAZ', 'KESINLESTI', 'TAHSIL', 'KAPANDI', 'IDARI_YOL');

-- CreateEnum
CREATE TYPE "Brans" AS ENUM ('KASKO', 'ZMMS', 'OTO_DISI');

-- CreateEnum
CREATE TYPE "BorcluRol" AS ENUM ('RUHSAT_SAHIBI', 'SURUCU', 'ISVEREN', 'KAT_MALIKI', 'YONETIM', 'DIGER');

-- CreateEnum
CREATE TYPE "TeyitDurum" AS ENUM ('TEYIT_EDILDI', 'TEYIT_GEREK', 'SUPHE');

-- CreateEnum
CREATE TYPE "BelgeKategori" AS ENUM ('POLICE', 'DEKONT', 'LEHE', 'EKSPERTIZ', 'TUTANAK', 'SBM', 'EHLIYET', 'RUHSAT', 'ALKOL', 'HASAR_FOTO', 'DIGER');

-- CreateEnum
CREATE TYPE "CiktiTip" AS ENUM ('TAKIP_BLOGU', 'DILEKCE', 'BILGILER_JSON');

-- CreateTable
CREATE TABLE "Musteri" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Musteri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kullanici" (
    "id" TEXT NOT NULL,
    "ad" TEXT NOT NULL,
    "eposta" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'AVUKAT_YRD',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kullanici_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusteriKullanici" (
    "musteriId" TEXT NOT NULL,
    "kullaniciId" TEXT NOT NULL,

    CONSTRAINT "MusteriKullanici_pkey" PRIMARY KEY ("musteriId","kullaniciId")
);

-- CreateTable
CREATE TABLE "Ayarlar" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "alacakliUnvan" TEXT,
    "mersis" TEXT,
    "vekilAd" TEXT,
    "vekilAdres" TEXT,
    "iban" TEXT,
    "kep" TEXT,
    "eposta" TEXT,
    "aciklamaFooter" TEXT,
    "faizJson" JSONB,
    "vekilBaro" TEXT,
    "faizTuru" TEXT DEFAULT 'Yasal faiz',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ayarlar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RucuDosyasi" (
    "id" TEXT NOT NULL,
    "musteriId" TEXT NOT NULL,
    "hukukDosyaNo" TEXT,
    "hasarDosyaNo" TEXT,
    "hasarTarihi" TIMESTAMP(3),
    "sigortaliUnvan" TEXT,
    "il" TEXT,
    "muhatapOzet" TEXT,
    "brans" "Brans",
    "rucuSebebi" TEXT,
    "rucuOrani" TEXT,
    "rucuTutari" DECIMAL(14,2),
    "asilAlacak" DECIMAL(14,2),
    "sigortaliPlaka" TEXT,
    "karsiPlaka" TEXT,
    "kazaYeri" TEXT,
    "kazaTarihi" TIMESTAMP(3),
    "istikamet" TEXT,
    "olusSekli" TEXT,
    "kusurDurumu" TEXT,
    "yol" "Yol",
    "yolGuven" DOUBLE PRECISION,
    "yolNeden" TEXT,
    "durum" "DosyaDurum" NOT NULL DEFAULT 'HAVUZDA',
    "yetkiliIcra" TEXT,
    "icraDairesi" TEXT,
    "icraDosyaNo" TEXT,
    "takipTarihi" TIMESTAMP(3),
    "zamanasimi" TIMESTAMP(3),
    "cikarimJson" JSONB,
    "kaynakKlasor" TEXT,
    "atananKullaniciId" TEXT,
    "kadroluAvukat" TEXT,
    "sozlesmeliAvukat" TEXT,
    "islemYapanYrd" TEXT,
    "gonderenBirim" TEXT,
    "atanmaTarihi" TIMESTAMP(3),
    "bitisTarihi" TIMESTAMP(3),
    "hugoDurum" TEXT,
    "davaMiktari" DECIMAL(14,2),
    "hugodanCekildi" BOOLEAN NOT NULL DEFAULT false,
    "kaynakJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RucuDosyasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Borclu" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "adUnvan" TEXT NOT NULL,
    "tcVkn" TEXT,
    "adres" TEXT,
    "rol" "BorcluRol" NOT NULL DEFAULT 'DIGER',
    "kaynak" TEXT,
    "teyitDurumu" "TeyitDurum" NOT NULL DEFAULT 'TEYIT_GEREK',
    "not" TEXT,

    CONSTRAINT "Borclu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Odeme" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tarih" TIMESTAMP(3),
    "tutar" DECIMAL(14,2),
    "aciklama" TEXT,
    "anaOdemeMi" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Odeme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Belge" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "kategori" "BelgeKategori" NOT NULL DEFAULT 'DIGER',
    "dosyaAdi" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "exifTarih" TIMESTAMP(3),
    "kamera" TEXT,
    "genislik" INTEGER,
    "yukseklik" INTEGER,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Belge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UretilenCikti" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tip" "CiktiTip" NOT NULL,
    "storagePath" TEXT,
    "icerik" TEXT,
    "durum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UretilenCikti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CiktiKaynak" (
    "ciktiId" TEXT NOT NULL,
    "belgeId" TEXT NOT NULL,

    CONSTRAINT "CiktiKaynak_pkey" PRIMARY KEY ("ciktiId","belgeId")
);

-- CreateTable
CREATE TABLE "TakipOlayi" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "aciklama" TEXT,
    "tutar" DECIMAL(14,2),
    "tarih" TIMESTAMP(3),
    "hamJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakipOlayi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Not" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT NOT NULL,
    "kullaniciId" TEXT,
    "metin" TEXT NOT NULL,
    "tip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Not_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aktivite" (
    "id" TEXT NOT NULL,
    "dosyaId" TEXT,
    "kullaniciId" TEXT,
    "eylem" TEXT NOT NULL,
    "detayJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aktivite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Musteri_ad_key" ON "Musteri"("ad");

-- CreateIndex
CREATE UNIQUE INDEX "Kullanici_eposta_key" ON "Kullanici"("eposta");

-- CreateIndex
CREATE UNIQUE INDEX "Ayarlar_musteriId_key" ON "Ayarlar"("musteriId");

-- CreateIndex
CREATE INDEX "RucuDosyasi_musteriId_idx" ON "RucuDosyasi"("musteriId");

-- CreateIndex
CREATE INDEX "RucuDosyasi_durum_idx" ON "RucuDosyasi"("durum");

-- CreateIndex
CREATE INDEX "RucuDosyasi_yol_idx" ON "RucuDosyasi"("yol");

-- CreateIndex
CREATE INDEX "Borclu_dosyaId_idx" ON "Borclu"("dosyaId");

-- CreateIndex
CREATE INDEX "Odeme_dosyaId_idx" ON "Odeme"("dosyaId");

-- CreateIndex
CREATE INDEX "Belge_dosyaId_idx" ON "Belge"("dosyaId");

-- CreateIndex
CREATE INDEX "Belge_kategori_idx" ON "Belge"("kategori");

-- CreateIndex
CREATE INDEX "UretilenCikti_dosyaId_idx" ON "UretilenCikti"("dosyaId");

-- CreateIndex
CREATE INDEX "TakipOlayi_dosyaId_idx" ON "TakipOlayi"("dosyaId");

-- CreateIndex
CREATE INDEX "Not_dosyaId_idx" ON "Not"("dosyaId");

-- CreateIndex
CREATE INDEX "Aktivite_dosyaId_idx" ON "Aktivite"("dosyaId");

-- AddForeignKey
ALTER TABLE "MusteriKullanici" ADD CONSTRAINT "MusteriKullanici_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusteriKullanici" ADD CONSTRAINT "MusteriKullanici_kullaniciId_fkey" FOREIGN KEY ("kullaniciId") REFERENCES "Kullanici"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ayarlar" ADD CONSTRAINT "Ayarlar_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RucuDosyasi" ADD CONSTRAINT "RucuDosyasi_musteriId_fkey" FOREIGN KEY ("musteriId") REFERENCES "Musteri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RucuDosyasi" ADD CONSTRAINT "RucuDosyasi_atananKullaniciId_fkey" FOREIGN KEY ("atananKullaniciId") REFERENCES "Kullanici"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Borclu" ADD CONSTRAINT "Borclu_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odeme" ADD CONSTRAINT "Odeme_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Belge" ADD CONSTRAINT "Belge_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UretilenCikti" ADD CONSTRAINT "UretilenCikti_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CiktiKaynak" ADD CONSTRAINT "CiktiKaynak_ciktiId_fkey" FOREIGN KEY ("ciktiId") REFERENCES "UretilenCikti"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CiktiKaynak" ADD CONSTRAINT "CiktiKaynak_belgeId_fkey" FOREIGN KEY ("belgeId") REFERENCES "Belge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakipOlayi" ADD CONSTRAINT "TakipOlayi_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Not" ADD CONSTRAINT "Not_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Not" ADD CONSTRAINT "Not_kullaniciId_fkey" FOREIGN KEY ("kullaniciId") REFERENCES "Kullanici"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aktivite" ADD CONSTRAINT "Aktivite_dosyaId_fkey" FOREIGN KEY ("dosyaId") REFERENCES "RucuDosyasi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aktivite" ADD CONSTRAINT "Aktivite_kullaniciId_fkey" FOREIGN KEY ("kullaniciId") REFERENCES "Kullanici"("id") ON DELETE SET NULL ON UPDATE CASCADE;

