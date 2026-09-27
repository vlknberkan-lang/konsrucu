'use client'

/**
 * KonsRücü — Onaylanan son gün formu · components/sure/sure-onay-formu.tsx
 * Önerilen gün yalnız gösterilir; ONAYLANAN günü avukat kendisi yazar (öneri alana önceden doldurulmaz,
 * "tek tıkla öneriyi onayla" kasıtlı olarak yok). Bakılan evrak zorunlu.
 */
import { useId, useState } from 'react'
import { CalendarCheck2, Loader2 } from 'lucide-react'
import { sureOnayla } from '@/app/(app)/sureler/actions'
import type { SureSatiri } from '@/lib/konsrucu/sure/gorunum'
import { gunTR, tarihOku } from '@/lib/konsrucu/sure/takvim'
import { BTN_BIRINCIL, BTN_IKINCIL, ETIKET, GIRDI } from './stil'
import { IslemMesaji, useSureIslem } from './islem'

export function SureOnayFormu({ sure, onKapat }: { sure: SureSatiri; onKapat?: () => void }) {
  const id = useId()
  const [gun, setGun] = useState('')
  const [evrak, setEvrak] = useState(sure.bakilanEvrak ?? '')
  const { pending, mesaj, calistir } = useSureIslem()

  return (
    <form
      className="rounded-xl border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        calistir(() => sureOnayla({ sureId: sure.id, onaylananSonGun: gun, bakilanEvrak: evrak }), (r) => { if (!r.uyari) onKapat?.() })
      }}
    >
      <div className="mb-2 text-[12.5px] text-muted-foreground">
        Öneri: ihtiyatlı <b className="font-mono text-foreground">{gunTR(tarihOku(sure.onerilenIhtiyatli))}</b>
        {sure.onerilenSonGun && <> · durmalı <b className="font-mono text-foreground">{gunTR(tarihOku(sure.onerilenSonGun))}</b></>}
        <span className="ml-1">(teyit gerekli)</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-[180px_1fr]">
        <div>
          <label htmlFor={`${id}-gun`} className={ETIKET}>Onaylanan son gün</label>
          <input id={`${id}-gun`} type="date" required value={gun} onChange={(e) => setGun(e.target.value)} className={`${GIRDI} font-mono`} />
        </div>
        <div>
          <label htmlFor={`${id}-evrak`} className={ETIKET}>Bakılan evrak</label>
          <input id={`${id}-evrak`} required minLength={3} maxLength={500} value={evrak} onChange={(e) => setEvrak(e.target.value)}
            placeholder="Ör. İtirazın tebliğ mazbatası (UETS), 12.03 tarihli" className={GIRDI} />
        </div>
      </div>
      {sure.kritik && <p className="mt-2 text-[11.5px] text-muted-foreground">Kritik süre: onaydan sonra ekipten ikinci bir kişinin teyidi önerilir.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending || !gun || evrak.trim().length < 3} className={BTN_BIRINCIL}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarCheck2 className="h-4 w-4" aria-hidden />} Son günü onayla
        </button>
        {onKapat && <button type="button" onClick={onKapat} className={BTN_IKINCIL}>Vazgeç</button>}
      </div>
      <IslemMesaji mesaj={mesaj} />
    </form>
  )
}
