/**
 * KonsRücü — Onarım satırının ekran metni · lib/konsrucu/onarim/gosterim.ts (saf)
 * "Alan · Şimdi · Önerilen" sütunları. EKLE (Sure) satırında öneri gün olarak gösterilir.
 */
import { gunTR, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'
import { sureTuru } from '@/lib/konsrucu/sure/turler'
import { degerMetni, degerOku, guncelleHedefi } from './hedefler'

export function satirGosterimi(s: { islem: string; hedefTablo: string; alan: string; eskiJson: unknown; yeniJson: unknown }): { alan: string; simdi: string; onerilen: string } {
  if (s.islem === 'EKLE' && s.hedefTablo === 'Sure') {
    const y = (s.yeniJson ?? {}) as Record<string, unknown>
    const gun = (v: unknown) => (typeof v === 'string' ? gunTR(isoGundenTarih(v)) : '—')
    const parca = [
      y.onerilenIhtiyatli ? `ihtiyatlı ${gun(y.onerilenIhtiyatli)}` : null,
      y.onerilenSonGun && y.onerilenSonGun !== y.onerilenIhtiyatli ? `önerilen ${gun(y.onerilenSonGun)}` : null,
      y.onaylananSonGun ? `onaylanan ${gun(y.onaylananSonGun)}` : null,
    ].filter(Boolean)
    return { alan: `Yeni süre · ${sureTuru(String(y.tur ?? 'DIGER')).etiket}`, simdi: '—', onerilen: parca.join(' · ') || '—' }
  }
  if (s.islem === 'EKLE') return { alan: `Yeni ${s.hedefTablo} satırı`, simdi: '—', onerilen: 'Yeni kayıt' }
  const h = guncelleHedefi(s.hedefTablo, s.alan)
  return { alan: h?.etiket ?? `${s.hedefTablo}.${s.alan}`, simdi: degerMetni(degerOku(s.eskiJson)), onerilen: degerMetni(degerOku(s.yeniJson)) }
}
