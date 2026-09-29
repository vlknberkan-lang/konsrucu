/**
 * KonsRücü — AI çağrı ortak katmanı · lib/konsrucu/ai-util.ts
 *
 * (1) anthropic(): retry + timeout'lu TEK istemci fabrikası. maxRetries ile SDK, geçici hatalarda
 *     (429 hız limiti, 408/409, 5xx, 529 aşırı yük, ağ kopması) ÜSTEL BACKOFF ile otomatik yeniden
 *     dener (saha bulgusu 2026-07-06). S09/B54: 1 yeniden deneme + 100 sn — fonksiyon süre sınırının altı.
 *     S02/S09 KVKK kapısı burada: maskeli işaret (lib/ai/isaret.ts) yalnız lib/ai/cagri.ts'ten gelir.
 * (2) toolCikti(): forced-tool-use çıktısını zod ile DOĞRULAR. Model bozuk/eksik şekil dönerse
 *     `as` cast'iyle sessizce kabul etmek yerine null döner → çağıran mevcut graceful yola (null/[])
 *     düşer. input_schema modele YOL GÖSTERİR ama yanıtı ZORLAMAZ; asıl kapı burada.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ZodType } from 'zod'
import { KREDI_BEDELI, aiDurduruldu, AiDurdurulduHata, krediDus, krediIade, kullanimLogla } from '@/lib/konsrucu/ai-kredi'
import { AiKvkkKapaliHata, maskesizAcik, yuzeyAcik } from '@/lib/ai/bayrak'
import { MASKELI_ISARET, type MaskeliIsaret } from '@/lib/ai/isaret'

export type AiBaglam = {
  /** İşlem türü — AI yüzeyi (lib/ai/bayrak · AI_YUZEYLERI) ve KREDI_BEDELI anahtarı. */
  yuzey: string
  /** Kredi düşülecek tenant. Verilmezse yalnız kill-switch çalışır, kredi/log atlanır (eski davranış). */
  musteriId?: string
  dosyaId?: string
  /** YALNIZ lib/ai/cagri.ts koyar: istek maskeli sarmalayıcıdan (maskele → sızıntı taraması) geçti. */
  maskeli?: MaskeliIsaret
}

/** B54: SDK zaman aşımı fonksiyon süre sınırının ALTINDA (≈100 sn, 1 yeniden deneme) — sunucu fonksiyonu
 *  kesilip kredi iadesiz kalmasın. Uzun dilekçe gibi çağrılar bu sınırda yarım kalırsa hata olarak döner. */
export const AI_ZAMAN_ASIMI_MS = 100_000
export const AI_YENIDEN_DENEME = 1

/** Eski dilekçe hattı kredi tablosunda 'dilekce' bedelini taşır. */
const krediAnahtari = (yuzey: string) => (yuzey === 'dilekce_eski' ? 'dilekce' : yuzey)

/**
 * KVKK kapısı (S02/S09): maskeli işaret taşımayan çağrı canlıda reddedilir (AI_MASKESIZ=acik ya da
 * AI_ORTAM=staging değilse); maskeli çağrı da yüzey bayrağı kapalıysa reddedilir. Ret ANINDA olur:
 * kredi düşmez, AiKullanim'a satır yazılmaz, istek Anthropic'e gitmez.
 */
export function aiKapisi(baglam: AiBaglam): void {
  if (baglam.maskeli === MASKELI_ISARET) {
    if (!yuzeyAcik(baglam.yuzey)) throw new AiKvkkKapaliHata(baglam.yuzey)
    return
  }
  if (!maskesizAcik()) throw new AiKvkkKapaliHata(baglam.yuzey)
}

/**
 * Ortak Anthropic istemcisi. 1 retry (üstel backoff) + 100 sn timeout (B54).
 * İstemci ÖLÇÜMLÜDÜR: (0) KVKK kapısı, (1) AI_DURDUR acil freni, (2) işlem başına TEK kez
 * atomik kredi rezervi (çok-çağrılı akışlarda — ör. emsal — sonraki create'ler bedelsiz),
 * (3) her çağrının token+USD logu, (4) çağrı hatasında kredi iadesi (müşteri lehine).
 * Kredi düşümü/iade ai-kredi.ts'te; PARA yolunu değiştirirken oradaki kuralları oku.
 * Uygulama kodu bu fabrikayı DOĞRUDAN çağırmaz: lib/ai/cagri.ts · aiOturumu() kullanır.
 */
export function anthropic(apiKey: string, baglam: AiBaglam): Anthropic {
  const client = new Anthropic({ apiKey, maxRetries: AI_YENIDEN_DENEME, timeout: AI_ZAMAN_ASIMI_MS })

  const ham = client.messages.create.bind(client.messages) as (
    params: Anthropic.MessageCreateParamsNonStreaming,
    options?: Anthropic.RequestOptions,
  ) => Promise<Anthropic.Message>
  let rezerve = 0 // bu istemci (≈bu işlem) için düşülen kredi; log'a bir kez yazılır
  let bedelYazildi = false

  const olcumlu = async (params: Anthropic.MessageCreateParamsNonStreaming, options?: Anthropic.RequestOptions): Promise<Anthropic.Message> => {
    aiKapisi(baglam) // her çağrıda: bayrak işlem ortasında kapanırsa sonraki adım da durur
    if (aiDurduruldu()) throw new AiDurdurulduHata()
    const bedel = KREDI_BEDELI[krediAnahtari(baglam.yuzey)] ?? 0
    if (baglam.musteriId && bedel > 0 && rezerve === 0) {
      await krediDus(baglam.musteriId, bedel) // yetersizse KrediYetersizHata — çağrı hiç yapılmaz
      rezerve = bedel
    }
    try {
      const res = await ham(params, options)
      const krediBedeli = bedelYazildi ? 0 : rezerve
      bedelYazildi = true
      await kullanimLogla({
        musteriId: baglam.musteriId,
        dosyaId: baglam.dosyaId,
        yuzey: baglam.yuzey,
        model: params.model,
        girisToken: res.usage?.input_tokens ?? 0,
        cikisToken: res.usage?.output_tokens ?? 0,
        krediBedeli,
      })
      return res
    } catch (e) {
      if (rezerve > 0 && baglam.musteriId) {
        await krediIade(baglam.musteriId, rezerve)
        rezerve = 0
        bedelYazildi = false
      }
      await kullanimLogla({
        musteriId: baglam.musteriId,
        dosyaId: baglam.dosyaId,
        yuzey: baglam.yuzey,
        model: params.model,
        girisToken: 0,
        cikisToken: 0,
        hata: true,
      })
      throw e
    }
  }
  // Projede tüm çağrılar non-streaming create; sarmalayıcı aynı imzayı korur.
  ;(client.messages as unknown as { create: typeof olcumlu }).create = olcumlu
  return client
}

/** Forced-tool-use `block.input`'unu şemayla doğrula; tutmazsa null (+ kısa tanı logu). */
export function toolCikti<T>(input: unknown, schema: ZodType<T>, etiket: string): T | null {
  const r = schema.safeParse(input)
  if (r.success) return r.data
  console.error(`[${etiket}] AI çıktısı şema doğrulamasını geçemedi:`, JSON.stringify(r.error.issues.slice(0, 4)))
  return null
}
