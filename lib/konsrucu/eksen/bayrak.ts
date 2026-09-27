/**
 * KonsRücü — Olay ve eksen bayrakları · lib/konsrucu/eksen/bayrak.ts (saf, sunucu)
 *
 * UYAP_OLAY_DURUM (plan 07 §0.3, S05) — UYAP olaylarının ESKİ `durum` alanına etkisi:
 *   asimetrik (varsayılan) · UYAP olayı durumu yalnız riski ARTIRAN yönde değiştirir (gerçek tebliğ, itiraz);
 *                            UYAP'tan gelen kesinleşme ve kapanış kaydedilir ama durumu değiştirmez (06 M2/M3).
 *   kapali                 · UYAP olayları durumu hiç değiştirmez (tam dondurma; geri dönüş yolu).
 *   eski                   · Faz 1 davranışı (yalnız ileri kuralı).
 *   Elle girilen olaylar her kipte eskisi gibi çalışır (avukat kararı makineden üstündür).
 *
 * EKSEN_KIPI (S15/S23, plan 07 §0.2 madde 4: yeni davranış bayrak arkasında, varsayılan KAPALI):
 *   kapali (varsayılan) · senkron eski yoluyla çalışır; aday kolonları, tahsilat adayı ve eksen hesabı yazılmaz.
 *   golge               · UYAP gelişmeleri ADAY yazılır, eksenler hesaplanıp önbelleğe ve DurumGecisi(golge=true)
 *                         iz satırına yazılır. Listeler, raporlar ve Bugün masası eski `durum`u okumaya devam eder
 *                         (06 §3.6 "Gölge kip"; yeni eksene geçiş S43'teki 30 dosya kapısından sonra).
 *   Bilinmeyen değer güvenli tarafa (kapali) düşer.
 */

export type UyapOlayDurumKipi = 'asimetrik' | 'kapali' | 'eski'
export type EksenKipi = 'kapali' | 'golge'

export function uyapOlayDurumKipi(env: Record<string, string | undefined> = process.env): UyapOlayDurumKipi {
  const v = String(env.UYAP_OLAY_DURUM ?? '').trim().toLowerCase()
  if (v === 'kapali' || v === 'eski') return v
  return 'asimetrik'
}

export function eksenKipi(env: Record<string, string | undefined> = process.env): EksenKipi {
  const v = String(env.EKSEN_KIPI ?? '').trim().toLowerCase()
  return v === 'golge' ? 'golge' : 'kapali'
}

export function eksenAcik(env: Record<string, string | undefined> = process.env): boolean {
  return eksenKipi(env) !== 'kapali'
}
