/**
 * KonsRücü — Dilekçe v2 model seçimi · lib/konsrucu/dilekce-v2/model.ts (saf)
 *
 * Model kimliği uydurulmaz: `claude-opus-4-8`, projedeki @anthropic-ai/sdk 0.104.1'in `Model` birliğinde
 * tanımlı en güncel Opus kimliğidir (node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts).
 * Bugünkü masa `claude-sonnet-4-6` kullanır (baseline, 06 §7.6).
 *
 * Neden `claude-opus-5` değil (06 §7.3'teki aday): kart çıkarımı lib/ai/cagri.ts sarmalayıcısından ZORUNLU araç
 * çağrısıyla (tool_choice: tool) ve `thinking` parametresi göndermeden yapılır. Opus 5'te thinking parametre
 * verilmezse varsayılan olarak açıktır ve zorunlu araç çağrısıyla birlikte kullanılamaz; SDK sürümü de bu kimliği
 * tanımıyor. Opus 4.8'de thinking parametresiz çağrıda kapalıdır; zorunlu araç çağrısı desteklenir.
 * Model değişikliği yalnız ölçüm setiyle (S38) yapılır; bu sabit tek değiştirme noktasıdır.
 *
 * Maliyet notu: lib/konsrucu/ai-kredi.ts · MODEL_FIYAT tablosunda bu model yoksa maliyet Sonnet fiyatıyla
 * (düşük) loglanır; birleştirmede `'claude-opus-4-8': [5, 25]` satırı eklenmeli.
 */
export const KART_MODEL = 'claude-opus-4-8'
export const KART_PROMPT_SURUM = 'kart-v1'
/** Sarmalayıcı akışsız çağırır ve 100 sn zaman aşımı uygular (B54): çıktı bütçesi bu süreye sığacak kadar tutulur. */
export const KART_MAX_TOKEN = 5000
/** Kaydedilen üretici bilgisi (DosyaKarti.uretici). */
export const kartUretici = (aiKullanildi: boolean) => (aiKullanildi ? `${KART_MODEL}+${KART_PROMPT_SURUM}` : `kod+${KART_PROMPT_SURUM}`)

/**
 * S36 (06 §7.3 Aşama 2 "Model"): aday `claude-opus-5` — SDK'da tanımlı değil (bkz. KART_MODEL notu, aynı sorun).
 * Bugünkü masa (baseline, 06 §7.6) `claude-sonnet-4-6`; dilekçe v1 (app/(app)/dilekceler/actions.ts) da aynı
 * modeli kullanıyor. AÇIKLAMALAR paragrafları zorunlu araç çağrısıyla (forced tool-use) istenir; Sonnet'te
 * `thinking` parametresiz çağrıda sorun yok. Model değişikliği yalnız ölçüm setiyle (S38) yapılır.
 * 2026-09-27 (Berkan: "dilekçe üretmeyi iyice öğretmemiz lazım"): varsayılan en güçlü güncel model `claude-opus-5-5`;
 * S38 ölçümü başka model gösterirse kod değişmeden `DILEKCE_COMPOSER_MODEL` ortam değişkeniyle geri alınır.
 */
export const COMPOSER_MODEL = (process.env.DILEKCE_COMPOSER_MODEL ?? '').trim() || 'claude-opus-5-5'
export const COMPOSER_PROMPT_SURUM = 'composer-v1'
/** Aşama 1'den daha uzun çıktı bütçesi (birkaç yuva, numaralı paragraflar) ama yine B54 sınırı içinde. */
export const COMPOSER_MAX_TOKEN = 7000
/** Kaydedilen üretici bilgisi (DilekceSurum.model / promptSurum alanlarına yazılır). */
export const composerUretici = (aiKullanildi: boolean) => (aiKullanildi ? `${COMPOSER_MODEL}+${COMPOSER_PROMPT_SURUM}` : `kod+${COMPOSER_PROMPT_SURUM}`)
