'use client'

/**
 * KonsRücü — Önemli Olaylar · "Üstlen" (kilitle) butonu.
 * Manuel üstlenme: tıklayınca olay sorumluya bağlanır (ISLEMDE). Başkası kilitlediyse server hata döner.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Hand, Loader2, Lock } from 'lucide-react'
import { onemliOlayUstlen } from '@/app/(app)/onemli-olaylar/actions'

export function UstlenButton({ olayId, compact }: { olayId: string; compact?: boolean }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function ustlen() {
    setErr(null)
    start(async () => {
      const r = await onemliOlayUstlen(olayId)
      if (r.ok) router.refresh()
      else setErr(r.error ?? 'Üstlenilemedi')
    })
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        onClick={ustlen}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-surface font-semibold text-foreground transition hover:border-kr/50 hover:text-kr disabled:opacity-60 ${compact ? 'px-2.5 py-1.5 text-[11.5px]' : 'px-3 py-2 text-[12.5px]'}`}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />} Üstlen
      </button>
      {err && (
        <span className="inline-flex items-center gap-1 text-[10.5px] text-danger" title={err}>
          <Lock className="h-3 w-3" /> {err}
        </span>
      )}
    </span>
  )
}
