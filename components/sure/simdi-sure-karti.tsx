'use client'

/**
 * KonsRücü — Şimdi kartı için süre önerisi · components/sure/simdi-sure-karti.tsx
 * GN-04 (06 §8.3): onaysız süre ihtiyatlı son güne ≤ 14 gün ya da geçmiş → "Son günü onaylayın". Tek
 * birincil eylem: [Son günü onayla] (form kart içinde açılır). GN-05: onaylı süreye ≤ 7 gün → [İşleme git].
 * Öneri, sunucuda lib/konsrucu/sure/gorunum.ts sureSimdiOnerisi() ile hesaplanıp prop olarak gelir.
 */
import { useState } from 'react'
import Link from 'next/link'
import { AlarmClock, CalendarCheck2 } from 'lucide-react'
import type { SureSatiri, SureSimdiOnerisi } from '@/lib/konsrucu/sure/gorunum'
import { SureOnayFormu } from './sure-onay-formu'
import { BTN_BIRINCIL } from './stil'

export type SimdiSureKartiProps = {
  oneri: SureSimdiOnerisi | null
  /** Önerinin ait olduğu süre satırı (onay formu için). */
  sure: SureSatiri | null
  /** Onaylama yetkisi (ADMIN / AVUKAT). */
  onaylayabilir: boolean
}

export function SimdiSureKarti({ oneri, sure, onaylayabilir }: SimdiSureKartiProps) {
  const [form, setForm] = useState(false)
  if (!oneri) return null
  const gecti = oneri.kalanGun < 0
  return (
    <section aria-label="Şimdi yapılacak süre işi" className={`rounded-2xl border p-4 shadow-card ${oneri.kod === 'GN-04' ? 'border-danger/35 bg-danger-soft/30' : 'border-warning/35 bg-warning-soft/30'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlarmClock className={`mt-0.5 h-5 w-5 shrink-0 ${oneri.kod === 'GN-04' ? 'text-danger' : 'text-warning'}`} aria-hidden />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Şimdi · {oneri.kod}{oneri.rol === 'A+2' ? ' · ikinci teyit önerilir' : ''}</div>
            <div className="font-display mt-0.5 text-[16px] font-bold">{oneri.metin}</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              {gecti ? `Hatırlatma günü ${-oneri.kalanGun} gün önce geçti.` : oneri.kalanGun === 0 ? 'Bugün son gün.' : `${oneri.kalanGun} gün kaldı.`}
              {sure ? ` Dosya ${sure.dosyaNo}.` : ''}
            </div>
          </div>
        </div>
        {oneri.kod === 'GN-04' && onaylayabilir && sure && !form && (
          <button type="button" onClick={() => setForm(true)} className={BTN_BIRINCIL}>
            <CalendarCheck2 className="h-4 w-4" aria-hidden /> {oneri.eylem}
          </button>
        )}
        {oneri.kod === 'GN-05' && (
          <Link href={`/akilli-giris/${oneri.dosyaId}`} className={BTN_BIRINCIL}>{oneri.eylem}</Link>
        )}
      </div>
      {oneri.kod === 'GN-04' && !onaylayabilir && (
        <p className="mt-2 text-[12px] text-muted-foreground">Son günü avukat onaylar; avukata haber verin.</p>
      )}
      {form && sure && <div className="mt-3"><SureOnayFormu sure={sure} onKapat={() => setForm(false)} /></div>}
    </section>
  )
}
