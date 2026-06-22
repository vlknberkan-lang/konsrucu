'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function Kopyala({ metin, etiket = 'Kopyala' }: { metin: string; etiket?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(metin); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* */ }
      }}
      className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground"
    >
      {ok ? <><Check className="h-3.5 w-3.5 text-success" /> Kopyalandı</> : <><Copy className="h-3.5 w-3.5" /> {etiket}</>}
    </button>
  )
}
