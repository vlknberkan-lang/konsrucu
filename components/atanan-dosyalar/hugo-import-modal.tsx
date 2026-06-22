'use client'

/**
 * KonsRücü — Atanan Dosyalar · Hugo içe aktarma (modal) · components/atanan-dosyalar/hugo-import-modal.tsx
 * "Hugo'dan içe aktar" butonu + popup pencere; Excel seçimi/parse aynı HugoImportPanel ile yapılır
 * (ayrı sayfaya gitmeden). Erişilebilir: Esc ile kapanır, dışına tıklayınca kapanır, focus diyaloga gider.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { FileSpreadsheet, X } from 'lucide-react'
import { HugoImportPanel } from '@/components/akilli-giris/hugo-import-panel'

export function HugoImportButton({ variant = 'soft', className = '' }: { variant?: 'soft' | 'primary'; className?: string }) {
  const [open, setOpen] = useState(false)
  const stil =
    variant === 'primary'
      ? 'bg-kr text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] hover:bg-kr/90'
      : 'border border-border bg-surface text-foreground shadow-card hover:border-kr/40 hover:text-kr-ink'
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center gap-2 rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none ${stil} ${className}`}
      >
        <FileSpreadsheet className={`h-4 w-4 ${variant === 'primary' ? '' : 'text-kr'}`} /> Hugo'dan içe aktar
      </button>
      {open && <HugoImportDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function HugoImportDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-[#0a1628]/55 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-auto w-full max-w-[760px] rounded-2xl border border-border bg-surface shadow-pop outline-none"
      >
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-kr/[0.12] text-kr">
            <FileSpreadsheet className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-[16px] font-bold tracking-[-0.02em]">Hugo tevdiye listesini içe aktar</h2>
            <p className="text-[11.5px] text-muted-foreground">.xlsx / .xls bırakın — yeni dosyalar HAVUZDA açılır, mevcutlar atlanır.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-1 pt-4">
          <HugoImportPanel onClose={onClose} />
        </div>
      </div>
    </div>
  )
}
