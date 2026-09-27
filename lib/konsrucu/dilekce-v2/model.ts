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
