/**
 * KonsRücü — Dosya Yol Haritası · saf dışa aktarım · lib/konsrucu/yol-haritasi/index.ts (client-safe)
 *
 * Veritabanı okuyucusu (`yukle.ts`) burada YOKTUR — server-only olduğu için ayrı içe aktarılır:
 *   import { yolHaritasiYukle } from '@/lib/konsrucu/yol-haritasi/yukle'
 */
export * from './tipler'
export { KURALLAR, KURAL_KODLARI, kuralBul, senaryoKurallari, hazirlikEksikleri, davaOnKontrolEksikleri, tutarSuphesi } from './kurallar'
export { siradakiAdim, tekCumle, ERTELENEMEZ_ONCELIK, SONRA_EN_COK } from './siradaki-adim'
export { provaTarihiCoz, kesimUygula } from './prova'
export { durakDurumlari, eksenOzeti, DURAK_ADI, type DurakGorunum, type DurakDurumu, type EksenGorunum, type EksenKaynagi } from './duraklar'
export { yolHaritasiHesapla, onbellekJson, onbellekDegisti, MOTOR_SURUMU, type YolHaritasiGorunum, type UyapBaglanti } from './gorunum'
export { mevcutDurak } from './olgular'
export { bosGercekler } from './bos'
