/**
 * KonsRücü — AÇIKLAMALAR paragraflarının yapay zekâ çıkarımı · lib/konsrucu/dilekce-v2/paragraf.ts (sunucu)
 *
 * S36 (06 §7.3 Aşama 2 "Yapay zekânın yazdığı"): kilitli kartın olgularını (yalnız `{id, metin}`; kaynak
 * belge/sayfa AI'ya gitmez, olgu kapısı zaten aşama 1'de geçti) ve iskeletin `{{AI: …}}` yuva talimatlarını
 * verir; model her yuva için `[O-n]` referanslı paragraf döndürür. Çağrı lib/ai/cagri.ts sarmalayıcısından
 * geçer (maskele → sızıntı taraması → çağrı → geri açma); yüzey 'dilekce'. Çıktının kart-dışı olgu içerip
 * içermediğini bu dosya DEĞİL, composer.ts (saf, karta karşı doğrulama) karar verir — burası yalnız modelin
 * biçimini (zod) doğrular; bozuk çıktı üretimi durdurmaz, aşama deterministik yer tutucuya düşer.
 */
import { z } from 'zod'
import type { AiIstek, AiOturumu } from '@/lib/ai/cagri'
import { toolCikti } from '@/lib/konsrucu/ai-util'
import { COMPOSER_MAX_TOKEN, COMPOSER_MODEL } from './model'
import { KART_TUR_ADI, type KartTuru } from './tipler'

export const PARAGRAF_SISTEM = `Sen bir hukuk bürosunda rücu dosyasının dava dilekçesindeki AÇIKLAMALAR (ya da benzer anlatı) bölümünü yazan yardımcısın. Dilekçenin geri kalanı (künye, taraflar, talep sonucu) koddan basılır; senin tek görevin sana verilen OLGU listesine dayanan, kısa ve numaralı paragraflar yazmaktır.

KURALLAR
1. Yalnız "olgular" listesindeki bilgileri kullan. Listede olmayan hiçbir tarih, tutar, isim, plaka, oran ya da olayı UYDURMA/YAZMA.
2. Yazdığın HER cümlenin sonuna, o cümledeki bilgiyi hangi olgu(lar) verdiyse onların kimliğini köşeli parantezle ekle: "… ödeme yapılmıştır [O-4]." Birden fazla olgu destekliyorsa "[O-2][O-5]" gibi ayrı ayrı ekle. Referanssız hiçbir olgu cümlesi yazma.
3. Hukuki nitelendirme (ör. "bu husus halefiyet hakkının doğduğunu göstermektedir") yapabilirsin; nitelendirme bir olguya dayanıyorsa yine [O-n] ekle, salt hukuki sonuçsa referans zorunlu değildir.
4. Kısa numaralı paragraflar yaz ("1. …", "2. …"); her paragraf tek bir konuyu anlatsın. Madde ya da içtihat atfı yazma (o bölüm koddan gelir); mevzuat tartışmasına girme.
5. Sana verilen HER yuva için ayrı bir metin üret; yalnız o yuvanın talimatını izle, diğer yuvaların konusunu karıştırma.`

/** Cevaba cevapta yalnız işaretli savunmalar karşılanır (S39 kabul 2); yuva talimatı zaten bunu ister, bu kural yalnız pekiştirir. */
const CEVABA_CEVAP_SAVUNMA_KURALI = `
6. Sana "cevaplanacakSavunmalar" listesi verildi: bunlar avukatın karşı tarafın cevap dilekçesinden "cevaplanacak" olarak işaretlediği savunmalardır. YALNIZ bu listedeki savunmalara kısaca değinip olgulara dayanarak karşılık ver. Listede olmayan, işaretlenmemiş ya da "önemsiz" sayılan hiçbir savunmaya değinme; savunma listesini kendi başına genişletme.`

const ARAC_SEMASI: NonNullable<AiIstek['arac']>['sema'] = {
  type: 'object',
  properties: {
    paragraflar: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          yuvaId: { type: 'string', description: 'Verilen yuvalar listesindeki yuvaId, aynen' },
          metin: { type: 'string', description: 'Numaralı, [O-n] referanslı paragraf(lar)' },
        },
        required: ['yuvaId', 'metin'],
      },
    },
  },
  required: ['paragraflar'],
}

const ciktiSemasi = z.object({
  paragraflar: z.array(z.object({ yuvaId: z.string().max(60), metin: z.string().max(8000) })).max(30),
})

export type ParagrafCiktisi = { paragraflar: { yuvaId: string; metin: string }[] }
export type ParagrafSonucu = { cikti: ParagrafCiktisi | null; kesildi: boolean; acilamayanJetonlar: string[] }

export async function aciklamaParagraflariniUret(p: {
  oturum: AiOturumu
  tur: KartTuru
  /** uslup.ts · uslupIstemi() — null ise varsayılan üslupla yazılır. */
  uslupEki: string | null
  /** İskeletteki `{{AI: …}}` yuvaları (sablon-dil.ts · IslenmisBlok.aiYuvalari, bloklar birleştirilmiş). */
  yuvalar: readonly { id: string; talimat: string }[]
  /** Kilitli kartın olguları — yalnız kimlik ve metin (kaynak belge/sayfa modele gitmez). */
  olgular: readonly { id: string; metin: string }[]
  /** Yalnız CEVABA_CEVAP: turler/cevaba-cevap.ts · cevaplanacakBaglam(kart.savunmalar) — "cevaplanacak"
   *  işaretli savunmalar. Boş/verilmemişse savunma talimatı hiç eklenmez (S39 kabul 2). */
  cevaplanacakSavunmalar?: readonly { id: string; baslik: string; konu: string; alinti: string }[]
}): Promise<ParagrafSonucu> {
  if (!p.yuvalar.length) return { cikti: { paragraflar: [] }, kesildi: false, acilamayanJetonlar: [] }
  const savunmalar = p.cevaplanacakSavunmalar ?? []
  const y = await p.oturum.iste({
    model: COMPOSER_MODEL,
    maxTokens: COMPOSER_MAX_TOKEN,
    sistem: savunmalar.length ? `${PARAGRAF_SISTEM}${CEVABA_CEVAP_SAVUNMA_KURALI}` : PARAGRAF_SISTEM,
    sistemEk: p.uslupEki ?? undefined,
    icerik: [
      {
        tur: 'json',
        veri: {
          dilekceTuru: KART_TUR_ADI[p.tur],
          olgular: p.olgular.map((o) => ({ kimlik: o.id, metin: o.metin })),
          yuvalar: p.yuvalar.map((v) => ({ yuvaId: v.id, talimat: v.talimat })),
          ...(savunmalar.length ? { cevaplanacakSavunmalar: savunmalar } : {}),
        },
      },
    ],
    arac: { ad: 'aciklama_paragraflari', aciklama: 'AÇIKLAMALAR bölümündeki her yuva için, yalnız verilen olgulara dayanan ve [O-n] referanslı paragraflar döndürür.', sema: ARAC_SEMASI },
  })
  const ham = toolCikti(y.aracGirdisi, ciktiSemasi, 'dilekce-v2/paragraf')
  return { cikti: ham, kesildi: y.kesildi, acilamayanJetonlar: y.acilamayanJetonlar }
}
