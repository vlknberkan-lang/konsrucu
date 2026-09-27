/**
 * KonsRücü — kapalı dosya radarı (S31, SN-06; B25) · lib/konsrucu/dava/kapali-radar.ts (saf)
 *
 * UYAP'ta "kapalı" görünen dosya kalıcı olarak düşmez: kapanış sebebi bilinmiyorsa (boş ya da BILINMIYOR) dosya
 * radarda kalır ve haftada bir yeniden sorgulanır (hedefler route'u; "Bağla" aşaması). Kapanış sebebini yalnız
 * avukat yazar. Sebep müvekkil kararına dayanıyorsa (sulh, feragat, takibi bırakma) onay kaydı gerekir.
 */
import { trNormal } from '../arabuluculuk/son-tutanak'
import { gunFarki } from '../arabuluculuk/tarih'
import { KAPANIS_ONAY_TURU, KAPANIS_SEBEPLERI, type KapanisSebebi } from './sabitler'

/** uyapDurum metni kapalıyı mı gösteriyor? ("Kapalı", "KAPALI (Haricen Tahsil)", "Dosya kapatıldı" …) */
export function uyapKapaliMi(uyapDurum: string | null | undefined): boolean {
  if (!uyapDurum) return false
  const n = trNormal(uyapDurum)
  if (/acik/.test(n) && !/kapal/.test(n)) return false
  return /kapal|kapatil/.test(n)
}

/** Dosya radarda mı? (UYAP kapalı + sebep yok/BILINMIYOR) */
export function kapaliRadarda(d: { uyapDurum: string | null; kapanisSebebi: string | null }): boolean {
  return uyapKapaliMi(d.uyapDurum) && (!d.kapanisSebebi || d.kapanisSebebi === 'BILINMIYOR')
}

/** Haftalık yeniden sorgu zamanı geldi mi? (son senkron 7 gün ya da daha eski) */
export function yenidenSorguGerekli(d: { uyapDurum: string | null; kapanisSebebi: string | null; uyapSenkronAt: Date | null }, simdi: Date = new Date()): boolean {
  if (!kapaliRadarda(d)) return false
  return !d.uyapSenkronAt || gunFarki(d.uyapSenkronAt, simdi) >= 7
}

export function kapanisSebebiGecerliMi(s: unknown): s is KapanisSebebi {
  return typeof s === 'string' && (KAPANIS_SEBEPLERI as readonly string[]).includes(s)
}

/** Sebep hangi müvekkil onayını ister? (yoksa null) */
export function kapanisOnayTuru(s: KapanisSebebi): 'SULH_ISKONTO' | 'TAKIBI_BIRAKMA' | null {
  return KAPANIS_ONAY_TURU[s] ?? null
}
