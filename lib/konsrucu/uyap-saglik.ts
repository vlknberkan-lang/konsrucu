/**
 * KonsRücü — UYAP eklenti senkron SAĞLIK ÖZETİ · lib/konsrucu/uyap-saglik.ts (server-only)
 *
 * Eklenti tarayıcıda canlı UYAP oturumuyla poll eder; Chrome kapanır / oturum düşer / anahtar silinirse
 * akış GÜNLERCE sessizce kesilir (tebliğ/itiraz/haciz olayları programa düşmez). Bu özet, aktif icra
 * dosyaları üzerinden akışın tazeliğini + kör noktalarını tek yerden çıkarır; Ayarlar sağlık kartı ve
 * (ileride) sağlık bekçisi cron'u aynı kaynaktan beslenir.
 *
 * NOT: "son senkron" = son DOSYA DEĞİŞİMİ (POST /senkron damgası). Eklenti aktif poll edip yeni olay
 * bulamazsa da bu değer eskir → tek başına "eklenti öldü" DEMEK DEĞİLDİR. Ayrı bir poll-heartbeat
 * (Ayarlar.senkronYoklamaAt) ileride eklenince "oturum canlı mı" kesinleşir (şema değişikliği ister).
 */
import 'server-only'
import type { DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { KAPALI_DURUMLAR } from './aktiflik'

const SAAT_MS = 3_600_000

export type UyapSaglikOzeti = {
  aktifToplam: number // takibi açık (icraDosyaNo dolu) + kapanmamış dosya sayısı
  bekleyen: number // hiç çekilmemiş VEYA tazeSaat'ten eski çekilmiş (bu tur senkron gereken)
  hicSenkronsuz: number // uyapSenkronAt = null (eklenti bu dosyaya hiç ulaşmamış)
  sonSenkron: string | null // en SON değişen dosyanın damgası (ISO) — akış tazeliği
  enEskiSenkron: string | null // en AZ güncel çekilmiş dosyanın damgası (ISO) — "en eski bekleyen"
  senkronDisi: number // uyapEslesme OK değil (ve null değil): eklenti çalışıp UYAP'ta EŞLEŞTİREMEDİ
}

/** Bir/birden çok tenant için senkron sağlık özeti. tazeSaat: "bekleyen" eşiği (varsayılan 24s). */
export async function uyapSaglikOzeti(musteriIds: string[], tazeSaat = 24): Promise<UyapSaglikOzeti> {
  const aktifWhere = {
    musteriId: { in: musteriIds },
    icraDosyaNo: { not: null },
    durum: { notIn: KAPALI_DURUMLAR as unknown as DosyaDurum[] },
  }
  const cutoff = new Date(Date.now() - tazeSaat * SAAT_MS)
  const [aktifToplam, son, enEski, bekleyen, hicSenkronsuz, senkronDisi] = await Promise.all([
    prisma.rucuDosyasi.count({ where: aktifWhere }),
    prisma.rucuDosyasi.findFirst({ where: { ...aktifWhere, uyapSenkronAt: { not: null } }, orderBy: { uyapSenkronAt: 'desc' }, select: { uyapSenkronAt: true } }),
    prisma.rucuDosyasi.findFirst({ where: { ...aktifWhere, uyapSenkronAt: { not: null } }, orderBy: { uyapSenkronAt: 'asc' }, select: { uyapSenkronAt: true } }),
    prisma.rucuDosyasi.count({ where: { ...aktifWhere, OR: [{ uyapSenkronAt: null }, { uyapSenkronAt: { lt: cutoff } }] } }),
    prisma.rucuDosyasi.count({ where: { ...aktifWhere, uyapSenkronAt: null } }),
    // notIn ['OK'] → SQL NOT IN, NULL satırları hariç tutar (yalnız açıkça sorunlu eşleşmeler sayılır)
    prisma.rucuDosyasi.count({ where: { ...aktifWhere, uyapEslesme: { notIn: ['OK'] } } }),
  ])
  return {
    aktifToplam,
    bekleyen,
    hicSenkronsuz,
    sonSenkron: son?.uyapSenkronAt?.toISOString() ?? null,
    enEskiSenkron: enEski?.uyapSenkronAt?.toISOString() ?? null,
    senkronDisi,
  }
}
