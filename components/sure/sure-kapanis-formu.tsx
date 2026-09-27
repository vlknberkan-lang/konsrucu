'use client'

/**
 * KonsRücü — Süre kapatma / iptal formu · components/sure/sure-kapanis-formu.tsx
 * Kapatma kanıt ister (UYAP'ta görünen evrak ya da kanıt açıklaması); "dilekçe hazırlandı" süreyi kapatmaz.
 * İptal, yanlış açılmış süre içindir; kayıt silinmez, gerekçesiyle "İptal" durumunda kalır.
 */
import { useId, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { sureIptalEt, sureKapat } from '@/app/(app)/sureler/actions'
import type { SureSatiri } from '@/lib/konsrucu/sure/gorunum'
import { BTN_BIRINCIL, BTN_IKINCIL, BTN_TEHLIKE, ETIKET, GIRDI } from './stil'
import { IslemMesaji, useSureIslem } from './islem'

export type BelgeSecenegi = { id: string; etiket: string }

export function SureKapanisFormu({ sure, belgeler = [], onKapat }: { sure: SureSatiri; belgeler?: BelgeSecenegi[]; onKapat?: () => void }) {
  const id = useId()
  const [kip, setKip] = useState<'KAPAT' | 'IPTAL'>('KAPAT')
  const [belgeId, setBelgeId] = useState('')
  const [not, setNot] = useState('')
  const { pending, mesaj, calistir } = useSureIslem()

  return (
    <form
      className="rounded-xl border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (kip === 'KAPAT') calistir(() => sureKapat({ sureId: sure.id, kapanisKanitiBelgeId: belgeId || null, kapanisNot: not || null }), () => onKapat?.())
        else calistir(() => sureIptalEt({ sureId: sure.id, gerekce: not }), () => onKapat?.())
      }}
    >
      <fieldset className="mb-2 flex flex-wrap gap-3 text-[12.5px]">
        <legend className="sr-only">İşlem</legend>
        <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${id}-kip`} checked={kip === 'KAPAT'} onChange={() => setKip('KAPAT')} /> Kanıtla kapat</label>
        <label className="inline-flex items-center gap-1.5"><input type="radio" name={`${id}-kip`} checked={kip === 'IPTAL'} onChange={() => setKip('IPTAL')} /> Yanlış açıldı, iptal et</label>
      </fieldset>
      {kip === 'KAPAT' && (
        <div className="mb-2.5">
          <label htmlFor={`${id}-b`} className={ETIKET}>UYAP'ta görünen evrak</label>
          <select id={`${id}-b`} value={belgeId} onChange={(e) => setBelgeId(e.target.value)} className={GIRDI}>
            <option value="">Evrak seçilmedi</option>
            {belgeler.map((b) => <option key={b.id} value={b.id}>{b.etiket}</option>)}
          </select>
        </div>
      )}
      <label htmlFor={`${id}-n`} className={ETIKET}>{kip === 'KAPAT' ? 'Kanıt açıklaması (evrak seçmediyseniz zorunlu)' : 'İptal gerekçesi'}</label>
      <textarea id={`${id}-n`} rows={2} maxLength={1000} value={not} onChange={(e) => setNot(e.target.value)} className={GIRDI}
        placeholder={kip === 'KAPAT' ? 'Ör. Cevaba cevap dilekçesi UYAP\'a gönderildi, evrak listesinde görünüyor' : 'Ör. Yanlış borçluya açılmış'} />
      {kip === 'KAPAT' && <p className="mt-1.5 text-[11.5px] text-muted-foreground">Dilekçenin hazırlanması süreyi kapatmaz; evrak UYAP&apos;ta göründüğünde kapatın.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {kip === 'KAPAT' ? (
          <button type="submit" disabled={pending} className={BTN_BIRINCIL}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />} Süreyi kapat
          </button>
        ) : (
          <button type="submit" disabled={pending || not.trim().length < 5} className={BTN_TEHLIKE}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />} Süreyi iptal et
          </button>
        )}
        {onKapat && <button type="button" onClick={onKapat} className={BTN_IKINCIL}>Vazgeç</button>}
      </div>
      <IslemMesaji mesaj={mesaj} />
    </form>
  )
}
