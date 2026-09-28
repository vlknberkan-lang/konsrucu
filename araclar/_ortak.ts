/**
 * KonsRücü — araclar/ CLI script'leri için ortak yardımcılar · araclar/_ortak.ts
 *
 * `araclar/*.ts` script'leri Next.js dışında, doğrudan çalışır (`@/...` takma adı için jiti +
 * JITI_TSCONFIG_PATHS=true gerekir — bkz. her script'in başlığındaki "Çalıştırma" notu). Bu dosya DB
 * yazmaz; yalnız argv ayrıştırma ve müvekkil çözümleme gibi CLI'lar arası tekrarı kaldırır.
 */
import type { PrismaClient } from '@prisma/client'

/** "--ad=deger" biçimindeki argümanı okur. */
export function argDegeri(ad: string): string | undefined {
  const onek = `--${ad}=`
  const bulunan = process.argv.find((a) => a.startsWith(onek))
  return bulunan ? bulunan.slice(onek.length) : undefined
}

/** "--ad" bayrağı verilmiş mi (değersiz). */
export function bayrakVar(ad: string): boolean {
  return process.argv.includes(`--${ad}`)
}

/** Müvekkili ada (unvan) göre öneke bakarak bulur; 0 ya da >1 eşleşmede açık hatayla durur. */
export async function musteriBul(db: PrismaClient, onEk: string): Promise<{ id: string; ad: string }> {
  const adaylar = await db.musteri.findMany({ where: { ad: { contains: onEk, mode: 'insensitive' } }, select: { id: true, ad: true }, orderBy: { ad: 'asc' } })
  if (adaylar.length === 0) throw new Error(`"${onEk}" ile eşleşen müvekkil (Musteri.ad) yok.`)
  if (adaylar.length > 1) throw new Error(`"${onEk}" birden çok müvekkille eşleşti: ${adaylar.map((a) => a.ad).join(', ')}. Daha belirgin bir önek verin.`)
  return adaylar[0]
}

/** "20260928-143012-ab12" biçiminde kısa, sıralanabilir yükleme kimliği üretir. */
export function yuklemeIdUret(onek: string): string {
  const zaman = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const rastgele = Math.random().toString(36).slice(2, 6)
  return `${onek}-${zaman}-${rastgele}`
}
