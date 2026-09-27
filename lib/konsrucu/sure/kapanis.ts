/**
 * KonsRücü — Süre kapanış kuralı · lib/konsrucu/sure/kapanis.ts (saf)
 *
 * 06 §2(i): "Kapanış kanıtı: gönderilen evrak UYAP'ta göründüğünde süre kapatılır; 'dilekçe hazırlandı'
 * süreyi kapatmaz." Kapatmayı yalnız avukat yapar; kanıt (UYAP'ta görünen evrak ya da kanıtı anlatan
 * açıklama) zorunludur.
 */

export type KapanisGirdisi = { kanitBelgeId?: string | null; not?: string | null }

const HAZIRLIK_KALIBI = /dilek[cç]e\s+(haz[ıi]rland|yaz[ıi]ld|taslak)|taslak\s+haz[ıi]r/i

export function kapanisDogrula(g: KapanisGirdisi): { ok: true } | { ok: false; hata: string } {
  const not = (g.not ?? '').trim()
  if (!g.kanitBelgeId && not.length < 10) {
    return { ok: false, hata: 'Kapanış kanıtı gerekli: UYAP\'ta görünen evrakı seçin ya da kanıtı en az bir cümleyle yazın.' }
  }
  if (!g.kanitBelgeId && HAZIRLIK_KALIBI.test(not) && !/uyap/i.test(not)) {
    return { ok: false, hata: 'Dilekçenin hazırlanması süreyi kapatmaz. Evrak UYAP\'a gönderilip göründüğünde kapatın.' }
  }
  return { ok: true }
}
