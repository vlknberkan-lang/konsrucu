/**
 * KonsRücü — Eklenti sunucu bayrakları ve sürüm kapısı · lib/konsrucu/senkron/ozellikler.ts (saf)
 *
 * 06 §4: `/api/uyap/hedefler` ve `/api/uyap/is/sira` yanıtları `ozellikler` taşır; eklenti bunlara uyar.
 * Böylece bir eklenti davranışı Store'a yeni sürüm göndermeden sunucudan kapatılabilir.
 *
 * Ortam değişkenleri (yalnız açıkça yazılmış değer açar/kapatır; bilinmeyen değer varsayılanı korur):
 *   IS_KUYRUGU=acik          → anlık senkron iş kuyruğu (S22). Varsayılan KAPALI (Dalga B1'de açılır).
 *   UYAP_EVRAK_INDIR=kapali  → eklenti evrak indirmesin. Varsayılan AÇIK (bugünkü davranış).
 *   UYAP_HAM_GONDER=acik     → ham liste gönderimi (S11). Varsayılan KAPALI.
 *   UYAP_HUKUK=acik          → hukuk (dava) dosyası uçları (S28). Varsayılan KAPALI.
 */

export type SunucuOzellikleri = { hamGonder: boolean; isKuyrugu: boolean; evrakIndir: boolean; hukuk: boolean }

type Ortam = Record<string, string | undefined>

const acik = (v: string | undefined) => String(v ?? '').trim().toLowerCase() === 'acik'
const kapali = (v: string | undefined) => String(v ?? '').trim().toLowerCase() === 'kapali'

export function sunucuOzellikleri(env: Ortam = process.env): SunucuOzellikleri {
  return {
    hamGonder: acik(env.UYAP_HAM_GONDER),
    isKuyrugu: acik(env.IS_KUYRUGU),
    evrakIndir: !kapali(env.UYAP_EVRAK_INDIR),
    hukuk: acik(env.UYAP_HUKUK),
  }
}

/** "2.0.0" gibi sürümleri karşılaştırır: a<b → -1, eşit → 0, a>b → 1. Bozuk parça 0 sayılır. */
export function surumKarsilastir(a: string, b: string): number {
  const p = (s: string) => String(s).trim().split('.').map((x) => { const n = parseInt(x, 10); return Number.isFinite(n) ? n : 0 })
  const x = p(a), y = p(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/** Eklenti sürümü en az `enAz` mı? Sürüm bilinmiyorsa (eski eklenti başlık göndermez) → false. */
export function surumEnAz(surum: string | null | undefined, enAz: string): boolean {
  if (!surum || !/^\d+(\.\d+){0,3}$/.test(surum.trim())) return false
  return surumKarsilastir(surum, enAz) >= 0
}

/** Faiz seçimini UYAP tevzi gövdesine aktaran ilk eklenti sürümü (S21). Eskisi "Adi Kanuni Faiz" + "%......" yazar. */
export const KOPILOT_FAIZ_SURUMU = '2.0.0'

/** İsteğin eklenti sürümü (eklenti 2.0 her istekte `X-Eklenti-Surum` gönderir; 1.9 göndermez). */
export function istekSurumu(req: Request): string | null {
  const s = (req.headers.get('x-eklenti-surum') ?? '').trim()
  return /^\d+(\.\d+){0,3}$/.test(s) ? s : null
}
