'use client'

/** KonsRücü — paylaşılan UI yardımcıları · components/konsrucu/ui.tsx */
import { Check } from 'lucide-react'
import { FLOW, confLevel } from '@/lib/konsrucu/map'

export type Tone = 'kr' | 'info' | 'success' | 'warning' | 'danger' | 'steel' | 'brand'

export function badgeCls(tone: Tone): string {
  switch (tone) {
    case 'kr': return 'bg-kr-soft text-kr-ink'
    case 'info': return 'bg-info-soft text-info'
    case 'success': return 'bg-success-soft text-success'
    case 'warning': return 'bg-warning-soft text-warning'
    case 'danger': return 'bg-danger-soft text-danger'
    case 'brand': return 'bg-primary/10 text-primary'
    default: return 'bg-muted text-muted-foreground'
  }
}
export function dotCls(tone: Tone): string {
  switch (tone) {
    case 'kr': return 'bg-kr'
    case 'info': return 'bg-info'
    case 'success': return 'bg-success'
    case 'warning': return 'bg-warning'
    case 'danger': return 'bg-danger'
    case 'brand': return 'bg-primary'
    default: return 'bg-muted-foreground'
  }
}

export function Badge({ tone = 'steel', dot, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-semibold leading-snug ${badgeCls(tone)}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotCls(tone)}`} />}{children}
    </span>
  )
}

export function PageHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{kicker}</div>
      <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">{title}</h1>
      {sub && <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">{sub}</p>}
    </div>
  )
}

const CONF_LABEL: Record<string, string> = { high: 'Yüksek', mid: 'Orta', low: 'Düşük' }
const CONF_CLS: Record<string, string> = { high: 'bg-success-soft text-success', mid: 'bg-warning-soft text-warning', low: 'bg-danger-soft text-danger' }
const CONF_DOT: Record<string, string> = { high: 'bg-success', mid: 'bg-warning', low: 'bg-danger' }

export function Conf({ c, pct = true }: { c: number; pct?: boolean }) {
  const lv = confLevel(c)
  return <span className={`font-mono inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[10.5px] font-bold ${CONF_CLS[lv]}`}><span className={`h-1.5 w-1.5 rounded-full ${CONF_DOT[lv]}`} />{CONF_LABEL[lv]}{pct && ' · %' + Math.round(c * 100)}</span>
}
export function ConfBar({ c }: { c: number }) {
  const lv = confLevel(c)
  const bar = lv === 'high' ? 'bg-success' : lv === 'mid' ? 'bg-warning' : 'bg-danger'
  return <div className="h-1 overflow-hidden rounded-full bg-surface-muted"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.round(c * 100)}%` }} /></div>
}

export function FlowStrip({ step, dark }: { step: number; dark?: boolean }) {
  return (
    <div className="flex items-center">
      {FLOW.map((label, i) => {
        const id = i + 1
        const done = id < step, now = id === step
        const txt = dark ? (done ? 'text-white/90' : now ? 'text-[#7fe6ee]' : 'text-white/50') : (done ? 'text-foreground' : now ? 'text-kr-ink' : 'text-muted-foreground')
        const dot = done ? 'bg-success border-success text-white' : now ? 'bg-kr border-kr text-white' : dark ? 'bg-white/10 border-white/20 text-white/70' : 'bg-surface-muted border-border'
        const sep = done ? (dark ? 'bg-success' : 'bg-success') : dark ? 'bg-white/20' : 'bg-border'
        return (
          <span key={id} className="flex items-center">
            {i > 0 && <span className={`h-0.5 w-5 ${sep}`} />}
            <span className={`flex items-center gap-2 rounded-[11px] px-3 py-2 text-[12.5px] font-semibold ${txt}`}>
              <span className={`font-mono grid h-[22px] w-[22px] place-items-center rounded-full border text-[11px] ${dot}`}>{done ? <Check className="h-3 w-3" /> : id}</span>{label}
            </span>
          </span>
        )
      })}
    </div>
  )
}
