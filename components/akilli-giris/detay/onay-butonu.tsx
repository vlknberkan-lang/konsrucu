'use client'

/** KonsRücü — Dosya Detay · avukat onayı (takip açmadan önceki son insan kontrolü kapısı). */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2, Undo2 } from 'lucide-react'
import { dosyaOnayla } from '@/app/(app)/akilli-giris/actions'

export function OnayButonu({ dosyaId, onayli, onayKim, onayTarih }: { dosyaId: string; onayli: boolean; onayKim?: string; onayTarih?: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function tikla(v: boolean) {
    setErr(null)
    start(async () => { const r = await dosyaOnayla(dosyaId, v); if (!r.ok) setErr(r.error ?? 'İşlem başarısız'); else router.refresh() })
  }

  if (onayli) {
    return (
      <div className="flex items-center gap-2 rounded-[11px] border border-success/30 bg-success-soft/50 px-3.5 py-2.5 text-[12.5px]">
        <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
        <div className="min-w-0"><b className="text-success">Avukat onayı verildi.</b> <span className="text-muted-foreground">{onayKim ?? '—'}{onayTarih ? ` · ${new Date(onayTarih).toLocaleDateString('tr-TR')}` : ''}</span></div>
        <button onClick={() => tikla(false)} disabled={pending} className="ml-auto inline-flex items-center gap-1 rounded-[8px] border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-60">{pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Geri al</button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={() => tikla(true)} disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-kr/40 bg-kr-soft px-4 py-2.5 text-[13px] font-semibold text-kr-ink transition hover:bg-kr-soft/70 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Gözden geçirdim · Avukat onayı ver
      </button>
      {err && <p className="mt-1 text-[11px] text-danger">{err}</p>}
    </div>
  )
}
