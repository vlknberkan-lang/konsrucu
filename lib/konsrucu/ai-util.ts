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

/** Ortak Anthropic istemcisi. 4 retry (üstel backoff) + 4 dk timeout (gerçek gecikmenin çok üstünde). */
export function anthropic(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 4, timeout: 240_000 })
}

/** Forced-tool-use `block.input`'unu şemayla doğrula; tutmazsa null (+ kısa tanı logu). */
export function toolCikti<T>(input: unknown, schema: ZodType<T>, etiket: string): T | null {
  const r = schema.safeParse(input)
  if (r.success) return r.data
  console.error(`[${etiket}] AI çıktısı şema doğrulamasını geçemedi:`, JSON.stringify(r.error.issues.slice(0, 4)))
  return null
}
