/**
 * KonsRücü — AI çağrı ortak katmanı · lib/konsrucu/ai-util.ts
 *
 * (1) anthropic(): retry + timeout'lu TEK istemci fabrikası. maxRetries ile SDK, geçici hatalarda
 *     (429 hız limiti, 408/409, 5xx, 529 aşırı yük, ağ kopması) ÜSTEL BACKOFF ile otomatik yeniden
 *     dener — tek atışta "sonuç vermedi" hatası büyük ölçüde biter (saha bulgusu 2026-07-06).
 * (2) toolCikti(): forced-tool-use çıktısını zod ile DOĞRULAR. Model bozuk/eksik şekil dönerse
 *     `as` cast'iyle sessizce kabul etmek yerine null döner → çağıran mevcut graceful yola (null/[])
 *     düşer. input_schema modele YOL GÖSTERİR ama yanıtı ZORLAMAZ; asıl kapı burada.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { ZodType } from 'zod'
import { KREDI_BEDELI, aiDurduruldu, AiDurdurulduHata, krediDus, krediIade, kullanimLogla } from '@/lib/konsrucu/ai-kredi'

export type AiBaglam = {
  /** İşlem türü — KREDI_BEDELI tablosundaki anahtar (cikarim/dilekce/emsal/soru/yol/makbuz/foto). */
  yuzey: string
  /** Kredi düşülecek tenant. Verilmezse yalnız kill-switch çalışır, kredi/log atlanır (eski davranış). */
  musteriId?: string
  dosyaId?: string
}

/**
 * Ortak Anthropic istemcisi. 4 retry (üstel backoff) + 4 dk timeout.
 * `baglam` verilirse istemci ÖLÇÜMLÜ olur: (1) AI_DURDUR acil freni, (2) işlem başına TEK kez
 * atomik kredi rezervi (çok-çağrılı akışlarda — ör. emsal — sonraki create'ler bedelsiz),
 * (3) her çağrının token+USD logu, (4) çağrı hatasında kredi iadesi (müşteri lehine).
 * Kredi düşümü/iade ai-kredi.ts'te; PARA yolunu değiştirirken oradaki kuralları oku.
 */
export function anthropic(apiKey: string, baglam?: AiBaglam): Anthropic {
  const client = new Anthropic({ apiKey, maxRetries: 4, timeout: 240_000 })
  if (!baglam) return client

  const ham = client.messages.create.bind(client.messages) as (
    params: Anthropic.MessageCreateParamsNonStreaming,
  ) => Promise<Anthropic.Message>
  let rezerve = 0 // bu istemci (≈bu işlem) için düşülen kredi; log'a bir kez yazılır
  let bedelYazildi = false

  const olcumlu = async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
    if (aiDurduruldu()) throw new AiDurdurulduHata()
    const bedel = KREDI_BEDELI[baglam.yuzey] ?? 0
    if (baglam.musteriId && bedel > 0 && rezerve === 0) {
      await krediDus(baglam.musteriId, bedel) // yetersizse KrediYetersizHata — çağrı hiç yapılmaz
      rezerve = bedel
    }
    try {
      const res = await ham(params)
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
