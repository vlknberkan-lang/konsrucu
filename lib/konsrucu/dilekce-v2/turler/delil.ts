/**
 * KonsRücü — Delil dilekçesi: EK listesinden tanık listesinin ayrılması · lib/konsrucu/dilekce-v2/turler/delil.ts (saf)
 *
 * S39 (06 §7.3 bağlam planı): "Delil | Kart + EK listesi + tensipteki istemler ve kesin süre | Büyük ölçüde
 * kodla; AI yalnız vakıa–delil eşlemesinin açıklamasını yazar; tanık listesi ayrı." Tanık listesi belgesi
 * (varsa) numaralı "HUKUKİ DELİLLER" EK listesine karışmaz; ekranda ve dilekçede ayrı gösterilir.
 */
import type { KartEk } from '../tipler'

const TANIK_RE = /TANIK/i

/** kart.ts · ekListesi() çıktısını tanık listesi belgeleri ve diğer ekler olarak ikiye ayırır. */
export function ekleriAyir(ekler: readonly KartEk[]): { tanikEkleri: KartEk[]; digerEkler: KartEk[] } {
  const tanikEkleri = ekler.filter((e) => TANIK_RE.test(e.altTur ?? ''))
  const digerEkler = ekler.filter((e) => !TANIK_RE.test(e.altTur ?? ''))
  return { tanikEkleri, digerEkler }
}
