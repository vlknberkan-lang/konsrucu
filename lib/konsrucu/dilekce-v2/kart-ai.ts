/**
 * KonsRücü — Dosya kartı olgu çıkarımı (yapay zekâ) · lib/konsrucu/dilekce-v2/kart-ai.ts (sunucu)
 *
 * 06 §7.3 Aşama 1 "Yapay zekâ doldurur": olgular {olgu, belge, sayfa, alıntı}; cevaba cevapta karşı tarafın
 * savunmaları; çelişkiler; inkâr tazminatı için likidite olguları. Çağrı lib/ai/cagri.ts sarmalayıcısından geçer
 * (maskele → sızıntı taraması → çağrı → geri açma); yüzey 'dilekce'. Çıktı zod ile doğrulanır; bozuk çıktı
 * kartı durdurmaz, kart kayıt olgularıyla kurulur (06 §7.3 "AI kullanılamıyorsa").
 */
import { z } from 'zod'
import type { AiIstek, AiOturumu } from '@/lib/ai/cagri'
import { toolCikti } from '@/lib/konsrucu/ai-util'
import type { AiCiktisi } from './kart'
import { KART_MAX_TOKEN, KART_MODEL } from './model'
import { SAVUNMA_KONULARI } from './savunma-matrisi'
import { KART_TUR_ADI, OLGU_ALANLARI, type KartTuru } from './tipler'
import type { SecilenBelge } from './belge-baglami'

export const KART_SISTEM = `Sen bir hukuk bürosunda rücu dosyalarının DOSYA KARTINI hazırlayan yardımcısın. Görevin dilekçe yazmak değildir; dosyadaki belgelerden, her biri bir belgenin bir sayfasındaki birebir alıntıya dayanan OLGULARI çıkarmaktır. Kartı avukat tek tek kontrol eder.

KURALLAR
1. Her olgu tek bir somut bilgidir: tarih, saat, tutar, yer, belge künyesi, olayın oluşu, kusur tespiti, itiraz kapsamı, tutanak sonucu gibi. Hukuki değerlendirme, nitelendirme, tahmin ya da sonuç olgu değildir.
2. Her olgu için belge kısaltmasını (B-1, B-2 …), sayfa numarasını ([Sayfa n] işaretinden) ve o sayfadan KELİMESİ KELİMESİNE kopyalanmış 20–200 karakterlik bir alıntı ver. Alıntıyı değiştirme, düzeltme, kısaltma işareti (…) koyma. Birebir alıntı veremiyorsan o olguyu yazma.
3. Asıl kaynağı kullan: kaza tarihi, saati, yeri ve kusur → kaza tespit tutanağı; ödeme tutarı ve tarihi → dekont; poliçe bilgileri → poliçe; asıl alacak ve faiz → takip talebi; itiraz tarihi ve kapsamı → itiraz dilekçesi; arabuluculuk sonucu → son tutanak; karşı tarafın savunması → cevap dilekçesi.
4. Aynı bilgi iki belgede farklı yazılmışsa ikisini ayrı olgu olarak yaz ve "celiskiler" listesine olgu sıralarıyla (1'den başlayarak) ekle.
5. Müvekkilin kendi belgelerindeki aleyhe olguları atlama; "ALEYHE" alanıyla işaretle.
6. Alacağın miktarının belgelerle belirli olduğunu gösteren olguları (dekont tutarı, ekspertiz tutarı, takip talebindeki kalemler) "LIKIDITE" alanıyla da işaretle.
7. Görevli mahkeme, talep sonucu, süre ya da son gün önerme; bunlar avukatın kararıdır.
8. "alanlar" yalnız şu listeden olur: ${OLGU_ALANLARI.join(', ')}.
9. "kayitliOlgular" programın onaylı kayıtlarıdır; onları yeniden yazma. Bir belge bu kayıtlarla çelişiyorsa belgedeki bilgiyi olgu olarak yaz ve çelişkiyi açıkla.
10. En fazla 35 olgu; kritik ve önemli olanlar önce. Olgu metni kısa olsun (en fazla 25 kelime).`

const SAVUNMA_KURALI = `
11. Karşı tarafın cevap dilekçesindeki HER savunmayı "savunmalar" listesine yaz: kısa başlık, konu (${SAVUNMA_KONULARI.join(', ')}), belge kısaltması, sayfa ve cevap dilekçesinden birebir alıntı.`

const ARAC_SEMASI: NonNullable<AiIstek['arac']>['sema'] = {
  type: 'object',
  properties: {
    olgular: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metin: { type: 'string', description: 'Olgunun kısa, tarafsız cümlesi' },
          belge: { type: 'string', description: 'Belge kısaltması, ör. B-1' },
          sayfa: { type: ['integer', 'null'] },
          alinti: { type: 'string', description: 'Sayfadan birebir alıntı (20–200 karakter)' },
          alanlar: { type: 'array', items: { type: 'string', enum: [...OLGU_ALANLARI] } },
        },
        required: ['metin', 'belge', 'alinti', 'alanlar'],
      },
    },
    celiskiler: {
      type: 'array',
      items: {
        type: 'object',
        properties: { aciklama: { type: 'string' }, olguSiralari: { type: 'array', items: { type: 'integer' } } },
        required: ['aciklama', 'olguSiralari'],
      },
    },
    savunmalar: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          baslik: { type: 'string' }, konu: { type: 'string', enum: [...SAVUNMA_KONULARI] },
          belge: { type: 'string' }, sayfa: { type: ['integer', 'null'] }, alinti: { type: 'string' },
        },
        required: ['baslik', 'konu', 'belge', 'alinti'],
      },
    },
  },
  required: ['olgular', 'celiskiler'],
}

const ciktiSemasi = z.object({
  olgular: z.array(z.object({
    metin: z.string().max(2000),
    belge: z.string().max(20),
    sayfa: z.number().int().nullable().optional(),
    alinti: z.string().max(2000),
    alanlar: z.array(z.string()).max(10),
  })).max(120),
  celiskiler: z.array(z.object({ aciklama: z.string().max(2000), olguSiralari: z.array(z.number().int()).max(20) })).max(40),
  savunmalar: z.array(z.object({
    baslik: z.string().max(500), konu: z.string().max(40), belge: z.string().max(20),
    sayfa: z.number().int().nullable().optional(), alinti: z.string().max(2000),
  })).max(60).optional(),
})

export type KartAiSonucu = { cikti: AiCiktisi | null; kesildi: boolean; acilamayanJetonlar: string[] }

/** Kayıt olgularının maskelenecek özeti (yapay zekânın tekrar yazmaması ve çelişkiyi görmesi için). */
export type KayitliOlguOzeti = { metin: string }

export async function kartOlgulariniCikar(p: {
  oturum: AiOturumu
  tur: KartTuru
  belgeler: readonly SecilenBelge[]
  kayitliOlgular: readonly KayitliOlguOzeti[]
}): Promise<KartAiSonucu> {
  if (!p.belgeler.length) return { cikti: null, kesildi: false, acilamayanJetonlar: [] }
  const y = await p.oturum.iste({
    model: KART_MODEL,
    maxTokens: KART_MAX_TOKEN,
    sistem: p.tur === 'CEVABA_CEVAP' ? `${KART_SISTEM}${SAVUNMA_KURALI}` : KART_SISTEM,
    icerik: [
      { tur: 'json', veri: { dilekceTuru: KART_TUR_ADI[p.tur], kayitliOlgular: p.kayitliOlgular.map((o) => o.metin) } },
      ...p.belgeler.map((b) => ({ tur: 'belge' as const, ad: `${b.ref} · ${b.ad}`, metin: b.metin })),
    ],
    arac: { ad: 'dosya_karti_olgulari', aciklama: 'Belgelerden kaynaklı olguları, çelişkileri ve (cevaba cevapta) savunmaları döndürür.', sema: ARAC_SEMASI },
  })
  const ham = toolCikti(y.aracGirdisi, ciktiSemasi, 'dilekce-v2/kart')
  if (!ham) return { cikti: null, kesildi: y.kesildi, acilamayanJetonlar: y.acilamayanJetonlar }
  const refMap = new Map(p.belgeler.map((b) => [b.ref, b.belgeId]))
  const belgeId = (ref: string) => refMap.get(ref.trim().toUpperCase().replace(/\s+/g, '')) ?? null
  return {
    cikti: {
      olgular: ham.olgular.map((o) => ({ metin: o.metin, belgeId: belgeId(o.belge), sayfa: o.sayfa ?? null, alinti: o.alinti, alanlar: o.alanlar })),
      celiskiler: ham.celiskiler,
      savunmalar: p.tur === 'CEVABA_CEVAP'
        ? (ham.savunmalar ?? []).map((s) => ({ baslik: s.baslik, konu: s.konu, belgeId: belgeId(s.belge), sayfa: s.sayfa ?? null, alinti: s.alinti }))
        : [],
    },
    kesildi: y.kesildi,
    acilamayanJetonlar: y.acilamayanJetonlar,
  }
}
