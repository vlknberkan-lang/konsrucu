/**
 * KonsRücü — "Belgelerden yeniden bul"un yapay zekâ ayağı · lib/konsrucu/oneri/ai-oneri.ts  (sunucu)
 *
 * AI_YUZEY_CIKARIM açıkken dosyanın belge metni maskeli ve görselsiz olarak analizEt'e gider. Önce, görsel AI
 * açıksa (AI_GORSEL), metni olmayan taranmış belgeler bir kez görsel okumadan geçer (evrak-metin/ai-okuma): el
 * yazısı dahil metinleri belgeye yazılır ve analizEt'e öteki metinlerle birlikte, maskeli gider. Sonuç üç yola ayrılır:
 *   - Kart alanları (branş, plakalar, kaza yeri, tutarlar, oran, dekontlar) AlanDegeri ÖNERİSİ olur (aiOnerileri);
 *     kolona yazılmaz, kritikleri avukat onaylar.
 *   - Kartta olmayanlar (takip açıklaması, oluş şekli, kusur, sigortalı, il, triyaj yolu) eski çıkarım gibi yalnız
 *     BOŞ kolona yazılır; dolu alandaki farklı değer cikarimJson önerisi olur (cikarimBirlestir). Yetkili icra AI'dan
 *     alınmaz.
 *   - Mevcutla eşleşmeyen AI borçlusu TEYİT GEREK eklenir; hiçbir borçlu silinmez.
 * Model çağrısı uzun sürer: `aiOneriCalistir` veritabanı işleminin DIŞINDA, `aiSonucunuYaz` çağıranın işleminde çalışır.
 */
import { TeyitDurum, type Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { analizEt, type AnalizSonuc } from '@/lib/konsrucu/analiz'
import { KVKK_KAPALI_MESAJI, yuzeyAcik } from '@/lib/ai/bayrak'
import { gorselAdaylari, gorselAktiviteMetni } from '@/lib/ai/gorsel-aday'
import { mentorKurallariMetne, mentorKurallariOku } from '@/lib/konsrucu/mentor-kural'
import { cikarimBirlestir } from '@/lib/konsrucu/cikarim-birlestir'
import { ALAN_SELECT, alanVerisi, cikarimMetni, mevcutAlanlar, rolDb } from '@/lib/konsrucu/cikarim-yaz'
import { taranmisBelgeleriOku, type GorselOkumaOzeti } from '@/lib/konsrucu/evrak-metin/ai-okuma'
import { aiDigerAlanlari, aiOnerileri, rucuOraniTuret } from './kaynaklar'
import type { YeniOneri } from './tipler'

export type AiOneriSonucu =
  | { durum: 'KAPALI' }
  | { durum: 'METIN_YOK'; gorsel: GorselOkumaOzeti | null }
  | { durum: 'HATA'; hata: string; gorsel?: GorselOkumaOzeti | null }
  | { durum: 'TAMAM'; oneriler: YeniOneri[]; analiz: AnalizSonuc; uyari: string | null; gorselNotu: string; gorsel: GorselOkumaOzeti | null }

/** Görsel okumaya ayrılan süre: sayfanın maxDuration'ı (300 sn) içinde analizEt'e yer kalsın. */
const GORSEL_BUTCE_MS = 110_000

/** Yüzey kapalıysa hiçbir şey göndermez. Belge metni yoksa model çağrılmaz. Hata fırlatmaz; durumu döndürür. */
export async function aiOneriCalistir(dosyaId: string): Promise<AiOneriSonucu> {
  if (!yuzeyAcik('cikarim')) return { durum: 'KAPALI' }
  // taranmış belge (el yazılı tutanak …) önce metne çevrilir; görsel AI kapalıysa hiçbir şey gönderilmez
  const gorsel = await taranmisBelgeleriOku(dosyaId, { butceMs: GORSEL_BUTCE_MS })
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: {
      musteriId: true, sigortaliUnvan: true, sigortaliTelefon: true, sigortaliPlaka: true, karsiPlaka: true,
      belgeler: { where: { silindiAt: null }, select: { extractedText: true, kategori: true, dosyaAdi: true, storagePath: true } },
      borclular: { select: { adUnvan: true, tcVkn: true, telefon: true }, orderBy: { id: 'asc' } },
    },
  })
  if (!dosya) return { durum: 'HATA', hata: 'Dosya bulunamadı.', gorsel }
  const metin = cikarimMetni(dosya.belgeler)
  if (!metin) return { durum: 'METIN_YOK', gorsel }
  // Görseller gitmez (S02/S09): not yalnız Aktivite'deki "N görsel KVKK nedeniyle atlandı" satırı için.
  // görsel okuma kapalıysa "N görsel KVKK nedeniyle atlandı" notu; açıksa görseller okuma adımında işlendi
  const gorselNotu = gorsel.durum === 'KAPALI' ? gorselAktiviteMetni(gorselAdaylari(dosya.belgeler, { gorselAcik: false }), 0) : ''

  const [ayarlar, mentorKurallar] = await Promise.all([
    prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId }, select: { aciklamaFooter: true, alacakliUnvan: true } }),
    mentorKurallariOku(dosya.musteriId),
  ])
  let hata: string | null = null
  let uyari: string | null = null
  const analiz = await analizEt(metin, {
    footer: ayarlar?.aciklamaFooter ?? undefined, ogrenilenKurallar: mentorKurallariMetne(mentorKurallar),
    alacakliUnvan: ayarlar?.alacakliUnvan ?? null, onHata: (m) => { hata = m }, onUyari: (u) => { uyari = u },
    ai: { musteriId: dosya.musteriId, dosyaId },
    // bilinen kayıtlar DB sırasıyla → deterministik jetonlar; yanıt sunucuda geri açılır
    maske: {
      kisiler: [...dosya.borclular.map((b) => b.adUnvan), dosya.sigortaliUnvan],
      kimlikler: dosya.borclular.map((b) => b.tcVkn),
      telefonlar: [...dosya.borclular.map((b) => b.telefon), dosya.sigortaliTelefon],
      plakalar: [dosya.sigortaliPlaka, dosya.karsiPlaka],
    },
  })
  if (!analiz) {
    const neden = hata as string | null
    if (neden === KVKK_KAPALI_MESAJI) return { durum: 'HATA', hata: neden, gorsel }
    return { durum: 'HATA', hata: neden ? `Yapay zekâ çıkarımı başarısız: ${neden}` : 'Yapay zekâ çıkarımı sonuç vermedi (model yanıtı boş).', gorsel }
  }
  const oneriler = aiOnerileri({ ...analiz, rucuOrani: rucuOraniTuret(analiz.asilAlacak, analiz.rucuTutari, analiz.rucuOrani) })
  return { durum: 'TAMAM', oneriler, analiz, uyari: uyari as string | null, gorselNotu, gorsel }
}

export type AiYazimSonucu = { yazilanAlanlar: string[]; yeniBorclu: number; farkliDeger: number; onayDustu: boolean }

/** Kartta olmayan alanları yalnız BOŞSA yazar, cikarimJson'u birleştirir, eşleşmeyen borçluyu TEYİT GEREK ekler. */
export async function aiSonucunuYaz(tx: Prisma.TransactionClient, dosyaId: string, analiz: AnalizSonuc): Promise<AiYazimSonucu> {
  const dosya = await tx.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: { ...ALAN_SELECT, cikarimJson: true, borclular: { select: { adUnvan: true, tcVkn: true }, orderBy: { id: 'asc' } } },
  })
  if (!dosya) return { yazilanAlanlar: [], yeniBorclu: 0, farkliDeger: 0, onayDustu: false }
  const b = cikarimBirlestir({
    mevcut: { alanlar: mevcutAlanlar(dosya), cikarimJson: dosya.cikarimJson, borclular: dosya.borclular, odemeler: [] },
    ai: {
      alanlar: aiDigerAlanlari(analiz),
      yolGuven: analiz.yolGuven ?? null,
      yolNeden: analiz.yolNeden ?? null,
      analiz: {
        olayTuru: analiz.olayTuru ?? null,
        olayBaglami: analiz.olayBaglami ?? null,
        sonrakiAdimlar: analiz.sonrakiAdimlar ?? [],
        teyit: analiz.teyit ?? [],
        llm: {
          brans: analiz.brans ?? null, kazaYeri: analiz.kazaYeri ?? null, asilAlacak: analiz.asilAlacak ?? null,
          yetkiliIcra: analiz.yetkiliIcra ?? null, kusurDurumu: analiz.kusurDurumu ?? null, olusSekli: analiz.olusSekli ?? null,
        },
      },
      borclular: analiz.borclular ?? [],
      dekontlar: [], // dekontlar kartta ödeme önerisi olur (aiOnerileri)
    },
  })
  await tx.rucuDosyasi.update({
    where: { id: dosyaId },
    data: {
      ...alanVerisi(b.yazilacak),
      cikarimJson: b.cikarimJson as Prisma.InputJsonValue,
      borclular: b.yeniBorclular.length
        ? {
            // AI "TEYIT_EDILDI" dese de avukat teyidi yerine geçmez
            create: b.yeniBorclular.map((x) => ({
              adUnvan: x.adUnvan, tcVkn: x.tcVkn || null, telefon: x.telefon || null, adres: x.adres || null,
              rol: rolDb(x.rol), kaynak: x.kaynak || null,
              teyitDurumu: x.teyit === TeyitDurum.SUPHE ? TeyitDurum.SUPHE : TeyitDurum.TEYIT_GEREK,
            })),
          }
        : undefined,
    },
  })
  return {
    yazilanAlanlar: Object.keys(b.yazilacak).filter((k) => k !== 'yolGuven' && k !== 'yolNeden'),
    yeniBorclu: b.yeniBorclular.length,
    farkliDeger: b.oneriler.length,
    onayDustu: b.degisti,
  }
}
