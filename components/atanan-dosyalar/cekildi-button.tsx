'use client'

/**
 * KonsRücü — Atanan Dosyalar · çekildi/geri-al butonu · components/atanan-dosyalar/cekildi-button.tsx
 * Durum rozetini + tek-tık aksiyonu birlikte gösterir. useTransition ile pending; hata satır-içi.
 */
import { useState, useTransition } from 'react'
import { Loader2, Download, Undo2, AlertTriangle } from 'lucide-react'
import { cekildiDegistir } from '@/app/(app)/atanan-dosyalar/actions'

export function CekildiButton({ dosyaId, cekildi, compact }: { dosyaId: string; cekildi: boolean; compact?: boolean }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function tikla() {
    setErr(null)
    start(async () => {
      const r = await cekildiDegistir({ dosyaId, hedef: !cekildi })
      if (!r.ok) setErr(r.error ?? 'İşlem tamamlanamadı')
    })
  }

  // kompakt: yalnız ikon-tık (durum metni gizli); ikon zaten çekildi/bekliyor'u söyler.
  if (compact) {
    const baslik = err ?? (cekildi ? 'Çekildi — geri al' : 'Hugo’dan çekildi olarak işaretle')
    return (
      <button
        type="button"
        onClick={tikla}
        disabled={pending}
        aria-label={baslik}
        title={baslik}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60 motion-reduce:transition-none ${
          err
            ? 'border-danger/40 text-danger'
            : cekildi
              ? 'border-transparent text-success hover:bg-success-soft'
              : 'border-transparent bg-kr text-kr-foreground shadow-[0_1px_5px_hsl(var(--kr)/0.3)] hover:bg-kr/90'
        }`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : err ? <AlertTriangle className="h-4 w-4" /> : cekildi ? <Undo2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold ${cekildi ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cekildi ? 'bg-success' : 'bg-warning'}`} />
        {cekildi ? 'Çekildi' : 'Bekliyor'}
      </span>
      <button
        type="button"
        onClick={tikla}
        disabled={pending}
        aria-label={cekildi ? 'Çekildi işaretini geri al' : 'Hugo’dan çekildi olarak işaretle'}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border px-2.5 py-1 text-[11.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60 motion-reduce:transition-none ${
          cekildi
            ? 'border-border text-muted-foreground hover:border-kr/40 hover:text-foreground'
            : 'border-transparent bg-kr text-kr-foreground shadow-[0_1px_5px_hsl(var(--kr)/0.3)] hover:bg-kr/90'
        }`}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : cekildi ? <Undo2 className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {cekildi ? 'Geri al' : 'Çek'}
      </button>
      {err && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger" title={err}>
          <AlertTriangle className="h-3 w-3" /> Hata
        </span>
      )}
    </div>
  )
}
