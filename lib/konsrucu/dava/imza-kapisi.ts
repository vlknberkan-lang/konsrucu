/**
 * KonsRücü — "imzaya hazır" müvekkil onayı kapısı · lib/konsrucu/dava/imza-kapisi.ts (saf, client-safe)
 *
 * Dava açma, sulh/iskonto ve kanun yolu kararı MÜVEKKİLİNDİR (06 2(f), 2(j); B16). Bu kararlara dayanan dilekçe,
 * `OnayKaydi` (ONAY) olmadan "imzaya hazır" OLAMAZ. Tek istisna dava dilekçesinde süre koruma istisnasıdır
 * (İİK 67 ihtiyatlı son güne ≤ 14 gün + yazılı gerekçe; açık karar 4) — kural `arabuluculuk/onay.ts`'tedir, burada
 * yalnız dilekçe türü → onay türü eşlenir. Dava içi usul dilekçeleri (delil, cevaba cevap, beyan) ayrı müvekkil kararı
 * gerektirmez: davayı açma onayı onları da kapsar.
 *
 * Dilekçe modülü (lib/konsrucu/dilekce-v2, "Bağla" aşaması) "imzaya hazır" düğmesini bu kapıyla kilitler; sunucu tarafı
 * yükleyicisi `imza-kapisi-veri.ts`'tedir.
 */
import { musteriOnayiKapisi, type OnayKaydiOzet } from '../arabuluculuk/onay'
import { ONAY_TUR_ETIKET, type OnayTuru } from '../arabuluculuk/sabitler'

/** Dilekçe türü → gereken müvekkil onayı. Listede olmayan tür ayrı müvekkil kararı gerektirmez. */
export const DILEKCE_ONAY_TURU: Record<string, OnayTuru> = {
  DAVA: 'DAVA_ACMA', // dava dilekçesi (lib/konsrucu/dilekce-v2 KART_TURLERI)
  ISTINAF: 'KANUN_YOLU',
  TEMYIZ: 'KANUN_YOLU',
  KANUN_YOLU: 'KANUN_YOLU',
  SULH: 'SULH_ISKONTO',
  SULH_ISKONTO: 'SULH_ISKONTO',
}

export function dilekceOnayTuru(dilekceTuru: string | null | undefined): OnayTuru | null {
  if (!dilekceTuru) return null
  return DILEKCE_ONAY_TURU[String(dilekceTuru).toUpperCase()] ?? null
}

export type ImzaKapisi = {
  acik: boolean
  gerekenOnay: OnayTuru | null
  neden: 'GEREKMIYOR' | 'ONAY' | 'ISTISNA' | 'YOK' | 'BEKLIYOR' | 'RET'
  mesaj: string | null
  istisnaMumkun: boolean
  kalanGun: number | null
}

/**
 * Dilekçe "imzaya hazır" olabilir mi (yalnız müvekkil onayı yönünden; kalite kapıları ayrıdır).
 * Kanun yolu onayı davaya bağlıysa `davaId` verilir (davasız onay her davayı kapsar).
 */
export function imzaKapisi(p: {
  dilekceTuru: string | null | undefined
  onaylar: OnayKaydiOzet[]
  ihtiyatliSonGun?: Date | null
  davaId?: string | null
  simdi?: Date
}): ImzaKapisi {
  const tur = dilekceOnayTuru(p.dilekceTuru)
  if (!tur) return { acik: true, gerekenOnay: null, neden: 'GEREKMIYOR', mesaj: null, istisnaMumkun: false, kalanGun: null }
  const kapi = musteriOnayiKapisi(tur, p.onaylar, {
    ihtiyatliSonGun: tur === 'DAVA_ACMA' ? p.ihtiyatliSonGun ?? null : null,
    simdi: p.simdi,
    ...(tur === 'KANUN_YOLU' && p.davaId ? { davaId: p.davaId } : {}),
  })
  if (kapi.acik) return { acik: true, gerekenOnay: tur, neden: kapi.neden, mesaj: null, istisnaMumkun: false, kalanGun: null }
  return {
    acik: false,
    gerekenOnay: tur,
    neden: kapi.neden,
    mesaj: `İmzaya hazır kilitli: ${ONAY_TUR_ETIKET[tur].toLocaleLowerCase('tr')} kararı müvekkilindir. ${kapi.mesaj}`,
    istisnaMumkun: kapi.istisnaMumkun,
    kalanGun: kapi.kalanGun,
  }
}
