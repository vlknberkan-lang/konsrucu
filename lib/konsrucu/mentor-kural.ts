/**
 * KonsRücü — Mentor öğrenilen kurallar  (server-only)
 * Avukat, AI'ın "Önerilen Adımlar · mentor" (sonrakiAdimlar) ve "Riskler ve Öneriler" (teyit)
 * çıktısını düzeltir → kural DB'ye yazılır → burada okunup analizEt sistem promptuna ENJEKTE edilir.
 * Manuel MVP: kural metni OLDUĞU GİBİ geçer (AI damıtma yok), şeffaf ve deterministik.
 * Tenant kapsamlı (musteriId). olayTuru etiketli kuralı model YALNIZ o tür için uygular.
 */
import { prisma } from '@/lib/prisma'

const MAX_KURAL = 60 // prompt bütçesi koruması — en eski 60 aktif kural

export type KuralSatir = {
  tur: 'KALDIR' | 'DUZELT'
  kaynak: 'ADIM' | 'TEYIT'
  hedef: string | null
  yorum: string
  olayTuru: string | null
}

/** Bir tenant'ın aktif mentor kurallarını okur (en eski → yeni; promptta sıra sabit kalsın). */
export async function mentorKurallariOku(musteriId: string): Promise<KuralSatir[]> {
  const rows = await prisma.mentorKural.findMany({
    where: { musteriId, aktif: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_KURAL,
    select: { tur: true, kaynak: true, hedef: true, yorum: true, olayTuru: true },
  })
  return rows
}

const kes = (s: string | null, n = 180) => (s && s.trim() ? s.trim().slice(0, n) : '')

/** Aktif kuralları analizEt sistem promptuna eklenecek metin bloğuna çevirir. Boşsa '' döner. */
export function mentorKurallariMetne(kurallar: KuralSatir[]): string {
  if (!kurallar.length) return ''
  const satir = (k: KuralSatir) => {
    const kapsam = k.olayTuru && k.olayTuru.trim() ? `[Yalnız olay türü: ${k.olayTuru.trim()}]` : '[Tüm dosyalar]'
    const alan = k.kaynak === 'TEYIT' ? 'risk/uyarı notu' : 'önerilen adım'
    const ornek = kes(k.hedef)
    if (k.tur === 'KALDIR') {
      return `- ${kapsam} Şu tarz "${alan}" çıktısını ARTIK ÜRETME${ornek ? ` (ekip kaldırdı; kaldırılan örnek: "${ornek}")` : ''}.${kes(k.yorum, 400) ? ` Yönerge: ${kes(k.yorum, 400)}` : ''}`
    }
    return `- ${kapsam} "${alan}" için ekip yönergesi: ${kes(k.yorum, 400)}${ornek ? ` (düzeltilen örnek: "${ornek}")` : ''}`
  }
  const govde = kurallar.map(satir).join('\n')
  return `\n\n★★ EKİBİN SANA ÖĞRETTİĞİ KURALLAR — MUTLAKA UY: Aşağıdakiler avukatların geçmiş düzeltmeleridir. Ürettiğin "sonrakiAdimlar" ve "teyit" notları bunlarla ÇELİŞMESİN; kaldırılan tarz önerileri TEKRAR ETME. "[Yalnız olay türü: …]" etiketli kuralı SADECE bu dosyanın olayTuru'su o türle örtüşüyorsa uygula; "[Tüm dosyalar]" her dosyada geçerlidir.\n${govde}`
}
