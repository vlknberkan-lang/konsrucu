/**
 * KonsRücü — İİK 67 kaydının KANITLA kapanışı (DA-06a/b) · lib/konsrucu/dava/iik67-kapanis.ts (saf)
 *
 * 06 2(g): dava açılış tarihi ONAYLANAN son günle karşılaştırılır.
 *  - açılış ≤ onaylanan → "kapanmaya hazır"; kapanışı AVUKAT onaylar (DA-06a).
 *  - açılış > onaylanan → kırmızı "Açılış tarihi son günden sonra görünüyor: kontrol edin" (DA-06b). Program
 *    "süre kaçtı" HÜKMÜ VERMEZ; genel alacak davası notunu gösterir (teyit gerekli).
 *  - Esas no girmek tek başına süreyi kapatmaz: açılış tarihi yoksa kapanış yok.
 */
import { gunNo, trGun } from '../arabuluculuk/tarih'

export type Iik67KapanisDurumu =
  | { durum: 'ACILIS_YOK'; mesaj: string }
  | { durum: 'ONAYLANAN_YOK'; mesaj: string; ihtiyatliKarsilastirma: 'ONCE' | 'SONRA' | null }
  | { durum: 'KAPANMAYA_HAZIR'; mesaj: string; kod: 'DA-06a' }
  | { durum: 'SONRA'; mesaj: string; kod: 'DA-06b'; not: string }
  | { durum: 'KAPALI'; mesaj: string }

export function iik67KapanisKontrol(p: {
  acilisTarihi: Date | null
  onaylananSonGun: Date | null
  onerilenIhtiyatli: Date | null
  sureDurumu: string
}): Iik67KapanisDurumu {
  if (p.sureDurumu === 'KAPANDI' || p.sureDurumu === 'IPTAL') return { durum: 'KAPALI', mesaj: 'İİK 67 kaydı kapalı.' }
  if (!p.acilisTarihi) return { durum: 'ACILIS_YOK', mesaj: 'Dava açılış tarihi yok: esas no tek başına İİK 67 kaydını kapatmaz.' }
  if (!p.onaylananSonGun) {
    const ih = p.onerilenIhtiyatli ? (gunNo(p.acilisTarihi) <= gunNo(p.onerilenIhtiyatli) ? 'ONCE' : 'SONRA') : null
    return {
      durum: 'ONAYLANAN_YOK',
      mesaj: `Önce İİK 67 son gününü onaylayın${p.onerilenIhtiyatli ? ` (ihtiyatlı öneri ${trGun(p.onerilenIhtiyatli)}; açılış ${ih === 'ONCE' ? 'bu günden önce' : 'bu günden sonra'})` : ''}.`,
      ihtiyatliKarsilastirma: ih,
    }
  }
  if (gunNo(p.acilisTarihi) <= gunNo(p.onaylananSonGun)) {
    return { durum: 'KAPANMAYA_HAZIR', kod: 'DA-06a', mesaj: `Açılış ${trGun(p.acilisTarihi)} ≤ onaylanan son gün ${trGun(p.onaylananSonGun)}: İİK 67 kaydını kapatın (kanıt: açılış tarihi).` }
  }
  return {
    durum: 'SONRA',
    kod: 'DA-06b',
    mesaj: `Açılış tarihi (${trGun(p.acilisTarihi)}) son günden (${trGun(p.onaylananSonGun)}) sonra görünüyor: kontrol edin.`,
    not: 'Tarihleri ve durmayı kontrol edin. Süre gerçekten geçmişse genel alacak davası yolu değerlendirilebilir (teyit gerekli).',
  }
}

/** Kapanış kanıt notu (Sure.kapanisNot). */
export function kapanisNotu(acilisTarihi: Date, esas: string | null): string {
  return `Kanıt: dava açılış tarihi ${trGun(acilisTarihi)}${esas ? ` (esas ${esas})` : ''} ≤ onaylanan son gün.`
}
