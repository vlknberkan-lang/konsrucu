'use client'

/** KonsRücü — Dosya Detay · "AI ile Çıkarım Yap" tetikleyici (bizim AI = analizEt). */
import { useState, useTransition } from 'react'
import { Sparkles, Loader2, RotateCcw } from 'lucide-react'
import { aiCikar } from '@/app/(app)/akilli-giris/actions'

type V = 'primary' | 'soft' | 'ghost'
const STIL: Record<V, string> = {
  primary: 'bg-kr text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] hover:bg-kr/90',
  soft: 'bg-kr-soft text-kr-ink border border-kr/[0.18] hover:bg-kr-soft/70',
  ghost: 'bg-surface text-foreground border border-border hover:border-kr/40',
}

export function AiCikarButton({
  dosyaId,
  label = 'AI ile Çıkarım Yap',
  variant = 'primary',
  icon = 'spark',
  size = 'md',
  full = false,
}: {
  dosyaId: string
  label?: string
  variant?: V
  icon?: 'spark' | 'reset'
  size?: 'md' | 'lg' | 'sm'
  full?: boolean
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const pad = size === 'lg' ? 'px-5 py-3 text-[14.5px]' : size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2.5 text-[13px]'
  const Icon = icon === 'reset' ? RotateCcw : Sparkles

  return (
    <div className={full ? 'w-full' : ''}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErr(null)
          start(async () => {
            const r = await aiCikar(dosyaId)
            if (!r.ok) setErr(r.error ?? 'Çıkarım tamamlanamadı')
          })
        }}
        className={`inline-flex ${full ? 'w-full' : ''} items-center justify-center gap-2 rounded-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60 motion-reduce:transition-none ${pad} ${STIL[variant]}`}
      >
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Çıkarılıyor…</> : <><Icon className="h-4 w-4" /> {label}</>}
      </button>
      {err && <p className="mt-1.5 text-[11.5px] font-medium text-danger">{err}</p>}
    </div>
  )
}
