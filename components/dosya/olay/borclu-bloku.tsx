'use client'

/**
 * KonsRücü — Borçlu bazında tebliğ ve itiraz bloğu · components/dosya/olay/borclu-bloku.tsx
 *
 * 06 §2(e) "4 TEBLİĞ VE İTİRAZ · borçlu bazında": ödeme emri tebliği, itiraz (kaşe ve UYAP kayıt tarihi ayrı),
 * itirazın size tebliği ve İİK 62 / 67 / 78 satırları. Süreler ÖNERİDİR ("teyit gerekli"); onaylanan son gün
 * süre defterinde girilir (S24). İtirazın size tebliği eksikse [Tarih gir] (TB-08) burada açılır.
 */
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Loader2 } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { alacakliyaTebligTarihiGirEylem } from '@/app/(app)/dosya-islem/olay-actions'
import { ROL_ETIKET, type BorcluBlokVM } from '@/lib/konsrucu/eksen/gorunum'
import { DUGME_IKINCIL, DUGME_ONAY, ETIKET, GIRDI, ROL_TON, ROL_YAZI } from './rol'

export function BorcluBloku({ dosyaId, blok, tarihGirebilir }: { dosyaId: string; blok: BorcluBlokVM; tarihGirebilir: boolean }) {
  const kimlik = useId()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [uyari, setUyari] = useState<string[]>([])

  function kaydet(e: React.FormEvent) {
    e.preventDefault()
    setHata(null)
    start(async () => {
      const r = await alacakliyaTebligTarihiGirEylem({ dosyaId, borcluId: blok.borcluId, tarih })
      if (!r.ok) { setHata(r.error); return }
      setUyari(r.uyarilar ?? [])
      setAcik(false)
      router.refresh()
    })
  }

  return (
    <div role="group" aria-labelledby={`${kimlik}-ad`} className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${kimlik}-ad`} className="text-[13.5px] font-bold text-foreground">{blok.ad}</span>
        {blok.turEtiket && <span className="text-[11.5px] text-muted-foreground">{blok.turEtiket}</span>}
        {blok.eksen && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            İCRA <Badge tone={ROL_TON[blok.eksen.rol]} dot>{blok.eksen.etiket}</Badge> ({blok.eksen.teyit})
          </span>
        )}
      </div>

      <dl className="mt-2.5 grid grid-cols-[minmax(120px,160px)_1fr_auto] items-start gap-x-3 gap-y-1.5 text-[12.5px] leading-[1.45]">
        {blok.satirlar.map((s) => (
          <div key={s.etiket} className="contents">
            <dt className="text-muted-foreground">{s.etiket}</dt>
            <dd className="text-foreground">{s.metin}</dd>
            <dd><Badge tone={ROL_TON[s.rol]}>{ROL_ETIKET[s.rol]}</Badge></dd>
          </div>
        ))}
        {blok.sureler.map((s) => (
          <div key={s.etiket} className="contents">
            <dt className="text-muted-foreground">{s.etiket}</dt>
            <dd className={s.rol === 'risk' ? ROL_YAZI.risk : 'text-foreground/85'}>
              {s.metin}
              {s.uyarilar.map((u) => <span key={u} className="mt-0.5 block text-[11px] text-warning">{u}</span>)}
            </dd>
            <dd />
          </div>
        ))}
      </dl>

      {blok.alacakliyaTebligEksik && tarihGirebilir && (
        <div className="mt-3">
          {!acik ? (
            <button type="button" onClick={() => setAcik(true)} className={DUGME_IKINCIL}><CalendarPlus className="h-3.5 w-3.5" /> Tarih gir</button>
          ) : (
            <form onSubmit={kaydet} className="flex flex-wrap items-end gap-2">
              <label htmlFor={`${kimlik}-t`} className="flex flex-col gap-1">
                <span className={ETIKET}>İtirazın size tebliğ tarihi (UETS)</span>
                <input id={`${kimlik}-t`} type="date" required className={GIRDI} value={tarih} onChange={(e) => setTarih(e.target.value)} />
              </label>
              <button type="submit" disabled={pending || !tarih} className={DUGME_ONAY}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />} Tarihi kaydet
              </button>
              <button type="button" onClick={() => setAcik(false)} className={DUGME_IKINCIL}>Vazgeç</button>
            </form>
          )}
        </div>
      )}
      {uyari.map((u) => <p key={u} className="mt-1.5 text-[11.5px] text-muted-foreground">{u}</p>)}
      {hata && <p role="alert" className="mt-1.5 text-[11.5px] font-medium text-danger">{hata}</p>}
    </div>
  )
}
