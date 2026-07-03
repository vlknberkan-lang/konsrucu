'use client'

/** KonsRücü — Dosya Detay · "AI ile Çıkarım Yap" tetikleyici (bizim AI = analizEt).
 *  İki adımlı onay: yeniden çıkarım teyitsiz borçluları ve AI alanlarını yeniden yazar —
 *  kaza tıklamasına karşı önce ne olacağı söylenir. (Teyitli borçlular ve dekontlar korunur.) */
import { useState, useTransition } from 'react'
import { Sparkles, Loader2, RotateCcw, AlertTriangle } from 'lucide-react'
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
  const [onayBekliyor, setOnayBekliyor] = useState(false)
  const pad = size === 'lg' ? 'px-5 py-3 text-[14.5px]' : size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2.5 text-[13px]'
  const Icon = icon === 'reset' ? RotateCcw : Sparkles

  function calistir() {
    setOnayBekliyor(false)
    setErr(null)
    start(async () => {
      const r = await aiCikar(dosyaId)
      if (!r.ok) setErr(r.error ?? 'Çıkarım tamamlanamadı')
    })
  }

  if (onayBekliyor && !pending) {
    return (
      <div className={`${full ? 'w-full' : ''} rounded-[10px] border border-warning/40 bg-warning-soft/40 px-3 py-2.5`}>
        <p className="flex items-start gap-1.5 text-[12px] font-medium text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          AI, teyit edilmemiş borçluları ve dosya alanlarını yeniden yazacak. Teyitli borçlular ve mevcut dekontlar korunur.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={calistir}
            className="rounded-lg bg-kr px-3 py-1.5 text-[12px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
          >
            Evet, çıkarımı çalıştır
          </button>
          <button
            type="button"
            onClick={() => setOnayBekliyor(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
          >
            Vazgeç
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={full ? 'w-full' : ''}>
      <button
        type="button"
        disabled={pending}
        onClick={() => { setErr(null); setOnayBekliyor(true) }}
        className={`inline-flex ${full ? 'w-full' : ''} items-center justify-center gap-2 rounded-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60 motion-reduce:transition-none ${pad} ${STIL[variant]}`}
      >
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Çıkarılıyor…</> : <><Icon className="h-4 w-4" /> {label}</>}
      </button>
      {err && <p className="mt-1.5 text-[11.5px] font-medium text-danger">{err}</p>}
    </div>
  )
}
