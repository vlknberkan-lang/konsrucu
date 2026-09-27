/**
 * KonsRücü — "maskeli çağrı" işareti · lib/ai/isaret.ts
 *
 * lib/konsrucu/ai-util.ts · anthropic() bu işareti taşımayan çağrıyı canlıda reddeder (AiKvkkKapaliHata).
 * İşareti YALNIZ lib/ai/cagri.ts koyar: maskele → sızıntı taraması → çağrı → kayıt → jeton kontrolü.
 * Başka dosyanın bu modülü içe aktarması yasaktır; tests/ai-yuzey-kapisi.test.ts kaynak taramasıyla denetler.
 */
export const MASKELI_ISARET: unique symbol = Symbol('konsrucu.ai.maskeli')
export type MaskeliIsaret = typeof MASKELI_ISARET
