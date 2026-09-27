/**
 * KonsRücü — evrak metin hattı · SUNUCU bağlantısı · lib/konsrucu/evrak-metin/sunucu.ts (server-only)
 * Ortak çıkarıcıya sunucu PDF okuyucusunu (pdf-metin.ts → pdfjs legacy) bağlar ve metni mevcut
 * Belge.extractedText alanına yazar (YENİ KOLON YOK — metinDurumu/BelgeSayfa/kuyruk B1b şemasıyla gelir).
 *
 * Güvence: metin çıkarma ya da yazma hatası evrak yüklemesini ASLA bozmaz — belgeMetniniYaz fırlatmaz,
 * belge satırı zaten oluşmuş olur; en kötü durumda extractedText boş kalır (bugünkü davranış).
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { pdfBelgeOkuSunucu } from '@/lib/konsrucu/pdf-metin'
import { evrakMetniCikar, hataMesaji, ocrNotu, type CikarSecenek, type MetinDurum, type MetinSonucu } from './index'

/**
 * İstek içinde metin çıkarmaya ayrılan süre (ms). Vercel fonksiyon süresine karşı tavan; aşılırsa kalan sayfalar
 * "okunmadı (süre sınırı)" diye metne yazılır. Kuyruk + yeniden deneme (06 · 5.2) B1b'de.
 */
export const METIN_BUTCE_MS = 8000

/** Sunucuda evrak metni (PDF dahil). ASLA fırlatmaz. */
export function evrakMetniCikarSunucu(bytes: Uint8Array, dosyaAdi: string, secenek: Omit<CikarSecenek, 'pdfOku'> = {}): Promise<MetinSonucu> {
  return evrakMetniCikar(bytes, dosyaAdi, { butceMs: METIN_BUTCE_MS, ...secenek, pdfOku: pdfBelgeOkuSunucu })
}

/** API yanıtı / Aktivite için kısa özet (metnin kendisi ve kişisel veri yok). */
export type MetinOzeti = {
  durum: MetinDurum
  yontem: string
  sayfa: number | null
  karakter: number
  ocrGerekli: boolean
  /** Kısa insan-okur OCR notu ("taranmış evrak — metin yok, OCR gerekli"); gerekmiyorsa null */
  not: string | null
  eksik: boolean
  yazildi: boolean
}

export function metinOzeti(s: MetinSonucu, yazildi: boolean): MetinOzeti {
  return {
    durum: s.durum,
    yontem: s.yontem,
    sayfa: s.sayfaSayisi ?? null,
    karakter: s.metin?.length ?? 0,
    ocrGerekli: s.ocrGerekli || s.durum === 'OCR_GEREKLI',
    not: ocrNotu(s),
    eksik: s.eksik,
    yazildi,
  }
}

/** Günlük için hata özeti: yalnız ad ve (varsa) kod — mesaj gövdesi kişisel veri taşıyabilir. */
export function hataKodu(e: unknown): string {
  const ad = (e as { name?: unknown })?.name
  const kod = (e as { code?: unknown })?.code
  return [typeof ad === 'string' && ad ? ad : 'Hata', typeof kod === 'string' && kod ? kod : ''].filter(Boolean).join(' ')
}

/**
 * Belgenin metnini çıkar ve Belge.extractedText'e yaz (yalnız anlamlı metin varsa). ASLA fırlatmaz.
 * @returns özet; beklenmeyen bir hata olursa null (yükleme yine başarılı sayılır)
 */
export async function belgeMetniniYaz(belgeId: string, bytes: Uint8Array, dosyaAdi: string, secenek: Omit<CikarSecenek, 'pdfOku'> = {}): Promise<MetinOzeti | null> {
  let s: MetinSonucu
  try {
    s = await evrakMetniCikarSunucu(bytes, dosyaAdi, secenek)
  } catch (e) {
    console.error('evrak metni çıkarılamadı:', hataMesaji(e))
    return null
  }
  if (!s.metin) return metinOzeti(s, false)
  try {
    await prisma.belge.update({ where: { id: belgeId }, data: { extractedText: s.metin } })
    return metinOzeti(s, true)
  } catch (e) {
    // KVKK: Prisma hata metni sorgu argümanlarını (burada evrak metnini) içerebilir → yalnız ad ve kod loglanır.
    console.error('evrak metni yazılamadı:', hataKodu(e))
    return metinOzeti(s, false)
  }
}
