'use client'

/**
 * KonsRücü — Takip görevi satır aksiyonları (üstlen / tamamla / sil).
 * OnemliOlay üstlenme deseniyle aynı: optimistic değil, action + router.refresh.
 */
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Hand, Check, Trash2, Loader2 } from 'lucide-react'
import { takipGoreviUstlen, takipGoreviTamamla, takipGoreviSil, type GorevSonuc } from '@/app/(app)/gorevler/actions'

export function GorevAksiyon({ gorevId, durum }: { gorevId: string; durum: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function calistir(fn: () => Promise<GorevSonuc>, onay?: string) {
    if (onay && typeof window !== 'undefined' && !window.confirm(onay)) return
    start(async () => {
      const r = await fn()
      if (!r.ok && r.error && typeof window !== 'undefined') window.alert(r.error)
      router.refresh()
    })
  }

  const acik = durum === 'ACIK'
  const islemde = durum === 'ISLEMDE'

  return (
    <div className="flex items-center justify-end gap-1.5">
      {acik && (
        <button type="button" disabled={pending} onClick={() => calistir(() => takipGoreviUstlen(gorevId))}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-kr/30 bg-kr-soft/40 px-2.5 py-1.5 text-[11.5px] font-semibold text-kr-ink transition hover:bg-kr-soft disabled:opacity-60">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />} Üstlen
        </button>
      )}
      {(acik || islemde) && (
        <button type="button" disabled={pending} onClick={() => calistir(() => takipGoreviTamamla(gorevId))}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-kr px-2.5 py-1.5 text-[11.5px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Tamamla
        </button>
      )}
      <button type="button" aria-label="Sil" disabled={pending} onClick={() => calistir(() => takipGoreviSil(gorevId), 'Bu görevi silmek istiyor musunuz?')}
        className="grid h-[30px] w-[30px] place-items-center rounded-[9px] border border-danger/30 bg-danger-soft/40 text-danger transition hover:bg-danger-soft disabled:opacity-60">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
