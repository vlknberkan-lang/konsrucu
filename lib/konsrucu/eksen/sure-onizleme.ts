/**
 * KonsRücü — Borçlu bloğundaki süre ÖNİZLEMELERİ · lib/konsrucu/eksen/sure-onizleme.ts (saf, client-safe)
 *
 * 06 §2(e) borçlu bloğu İİK 62 / 67 / 78 satırlarını gösterir. Bu modül yalnız ÖNERİ METNİ üretir; `Sure`
 * kaydı açmaz ve "onaylanan son gün" yazmaz (süre defteri ve onay S24'ün işi: lib/konsrucu/sure). Her satır
 * "önerilen … (teyit gerekli)" etiketiyle gösterilir; kesin son gün sistem tarafından kesinleştirilmez.
 *
 * Kurallar (hepsi teyit gerekli):
 *   • İİK 62: tebliğden 7 gün. UETS'te hukuki tebliğ ulaşmayı izleyen 5. gündür (onay kartında girilir).
 *   • İİK 67: itirazın alacaklıya tebliği + 1 yıl. Tebliğ tarihi yoksa İHTİYATLI alt sınır: itiraz tarihi + 1 yıl
 *     (kalem kaşesi yoksa UYAP kayıt tarihi; o zaman gerçek son gün daha ERKEN olabilir → uyarı).
 *     Arabuluculuk durması S24/S26 süre defterinde hesaplanır; ihtiyatlı öneri hiçbir zaman ileri kaymaz.
 *   • İİK 78: itiraz ve dava süresince işlemez (78/2) → askıda; itiraz yoksa tebliğden 1 yıl.
 *   • Süre UZATILMAZ: son gün hafta sonuna denk gelirse yalnız uyarı yazılır (güvenli taraf: erken gün).
 */
import { gunEkle, gunNo, gunTR, yilEkle } from './norm'

export type SureRol = 'risk' | 'onay' | 'tamam' | 'bilgi' | 'gerekmedi'
export type SureSatiri = { etiket: 'İİK 62' | 'İİK 67' | 'İİK 78'; metin: string; rol: SureRol; sonGun: Date | null; uyarilar: string[] }

export type SureGirdisi = {
  tebligTarihi: Date | null
  tebligSonucu: string | null
  itirazVar: boolean | null
  itirazVerilisTarihi: Date | null
  itirazUyapTarihi: Date | null
  itirazAlacakliyaTebligTarihi: Date | null
  /** Onay bekleyen UYAP itiraz sinyali var mı (aday) */
  itirazAdayVar?: boolean
}

export const IIK62_GUN = 7

function haftaSonuMu(d: Date): boolean {
  const g = new Date(gunNo(d) * 86_400_000).getUTCDay() // İstanbul takvim günü
  return g === 0 || g === 6
}

function kalanRol(sonGun: Date, bugun: Date): SureRol {
  const kalan = gunNo(sonGun) - gunNo(bugun)
  return kalan <= 14 ? 'risk' : 'onay'
}

function haftaSonuUyarisi(d: Date): string[] {
  return haftaSonuMu(d) ? [`${gunTR(d)} hafta sonuna denk geliyor; süre uzayabilir, uzatılmış gün gösterilmedi (teyit gerekli).`] : []
}

export function iik62Onizle(g: SureGirdisi, bugun: Date): SureSatiri {
  if (g.tebligSonucu === 'IADE' && !g.tebligTarihi) return { etiket: 'İİK 62', metin: 'Süre başlamadı: tebliğ edilemedi (İADE).', rol: 'bilgi', sonGun: null, uyarilar: [] }
  if (!g.tebligTarihi || g.tebligSonucu !== 'TEBLIG') return { etiket: 'İİK 62', metin: 'Tebliğ onaylanınca önerilir.', rol: 'gerekmedi', sonGun: null, uyarilar: [] }
  const sonGun = gunEkle(g.tebligTarihi, IIK62_GUN)
  const itirazT = g.itirazVerilisTarihi ?? g.itirazUyapTarihi
  if (g.itirazVar === true && itirazT) {
    const gec = gunNo(itirazT) > gunNo(sonGun)
    return {
      etiket: 'İİK 62', sonGun,
      metin: gec
        ? `önerilen ${gunTR(sonGun)} · itiraz bu günden sonra görünüyor: gecikmiş itiraz olabilir (İİK 65, teyit gerekli)`
        : `önerilen ${gunTR(sonGun)} · itiraz süresinde görünüyor (teyit gerekli)`,
      rol: gec ? 'risk' : 'bilgi', uyarilar: haftaSonuUyarisi(sonGun),
    }
  }
  const gecti = gunNo(bugun) > gunNo(sonGun)
  if (g.itirazVar === true) {
    return { etiket: 'İİK 62', sonGun, metin: `önerilen ${gunTR(sonGun)} · itiraz onaylı, itiraz tarihi girilmedi (teyit gerekli)`, rol: 'onay', uyarilar: haftaSonuUyarisi(sonGun) }
  }
  if (g.itirazAdayVar) {
    return { etiket: 'İİK 62', sonGun, metin: `önerilen ${gunTR(sonGun)} · UYAP itiraz sinyali var: itirazı onaylayın (teyit gerekli)`, rol: 'onay', uyarilar: haftaSonuUyarisi(sonGun) }
  }
  return {
    etiket: 'İİK 62', sonGun,
    metin: gecti
      ? `önerilen ${gunTR(sonGun)} geçti · itiraz sinyali yok: UYAP'ta itiraz yok mu? Kontrol edin; kesinleşme otomatik yazılmaz (teyit gerekli)`
      : `önerilen ${gunTR(sonGun)} (teyit gerekli)`,
    rol: gecti ? 'onay' : kalanRol(sonGun, bugun), uyarilar: haftaSonuUyarisi(sonGun),
  }
}

export function iik67Onizle(g: SureGirdisi, bugun: Date): SureSatiri {
  if (g.itirazVar !== true) return { etiket: 'İİK 67', metin: 'İtiraz onaylanınca önerilir.', rol: 'gerekmedi', sonGun: null, uyarilar: [] }
  if (g.itirazAlacakliyaTebligTarihi) {
    const sonGun = yilEkle(g.itirazAlacakliyaTebligTarihi, 1)
    return { etiket: 'İİK 67', metin: `önerilen ${gunTR(sonGun)} · itirazın size tebliği ${gunTR(g.itirazAlacakliyaTebligTarihi)} + 1 yıl (teyit gerekli) · onaylanan: —`, rol: kalanRol(sonGun, bugun), sonGun, uyarilar: haftaSonuUyarisi(sonGun) }
  }
  const adaylar = [g.itirazVerilisTarihi, g.itirazUyapTarihi].filter((d): d is Date => !!d)
  if (!adaylar.length) {
    return { etiket: 'İİK 67', metin: 'İtiraz tarihi yok: itiraz ve tebliğ tarihlerini girin; süre hesaplanamadı (teyit gerekli).', rol: 'risk', sonGun: null, uyarilar: [] }
  }
  const taban = adaylar.reduce((a, b) => (gunNo(a) <= gunNo(b) ? a : b))
  const sonGun = yilEkle(taban, 1)
  const uyarilar = [...haftaSonuUyarisi(sonGun)]
  if (!g.itirazVerilisTarihi) uyarilar.push('Kalem kaşesi tarihi girilmedi: UYAP kayıt tarihinden hesaplandı, gerçek son gün daha erken olabilir.')
  return {
    etiket: 'İİK 67', sonGun,
    metin: `ihtiyatlı ${gunTR(sonGun)} · itiraz tarihi ${gunTR(taban)} + 1 yıl (itirazın size tebliği girilmedi; teyit gerekli) · onaylanan: —`,
    rol: kalanRol(sonGun, bugun), uyarilar,
  }
}

export function iik78Onizle(g: SureGirdisi, _bugun: Date): SureSatiri {
  if (g.itirazVar === true) return { etiket: 'İİK 78', metin: 'itiraz süresince askıda (İİK 78/2, teyit gerekli)', rol: 'bilgi', sonGun: null, uyarilar: [] }
  if (g.tebligSonucu === 'TEBLIG' && g.tebligTarihi) {
    const sonGun = yilEkle(g.tebligTarihi, 1)
    return { etiket: 'İİK 78', metin: `önerilen ${gunTR(sonGun)} · tebliğ + 1 yıl haciz isteme (teyit gerekli)`, rol: 'bilgi', sonGun, uyarilar: haftaSonuUyarisi(sonGun) }
  }
  return { etiket: 'İİK 78', metin: 'Tebliğ onaylanınca önerilir.', rol: 'gerekmedi', sonGun: null, uyarilar: [] }
}

export function sureOnizle(g: SureGirdisi, bugun: Date = new Date()): SureSatiri[] {
  return [iik62Onizle(g, bugun), iik67Onizle(g, bugun), iik78Onizle(g, bugun)]
}
