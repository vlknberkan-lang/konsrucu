/**
 * KonsRücü — Dosya Yol Haritası · durak listesi · components/dosya/yol-haritasi/durak-listesi.tsx
 *
 * Sekiz durak yukarıdan aşağı (06 §2 iskelet): bitmiş duraklar tek satır, "şimdi" olan durak vurgulu, gerekmeyen
 * duraklar gri ve "Gerekmedi" yazılı. Durum yazıyla da söylenir (renk körlüğünde anlam kaybolmaz).
 */
import { Check, ArrowRight, Minus, Circle, Loader, AlertTriangle } from 'lucide-react'
import type { DurakGorunum, DurakDurumu } from '@/lib/konsrucu/yol-haritasi/duraklar'

const DURUM: Record<DurakDurumu, { yazi: string; ikon: typeof Check; cls: string }> = {
  TAMAM: { yazi: 'Tamam', ikon: Check, cls: 'bg-success-soft text-success' },
  SIMDI: { yazi: 'Şimdi', ikon: ArrowRight, cls: 'bg-kr text-kr-foreground' },
  DEVAM: { yazi: 'Sürüyor', ikon: Loader, cls: 'bg-info-soft text-info' },
  SIRADA: { yazi: 'Sırada', ikon: Circle, cls: 'bg-surface-muted text-muted-foreground' },
  GEREKMEDI: { yazi: 'Gerekmedi', ikon: Minus, cls: 'bg-muted text-muted-foreground' },
}

export function DurakListesi({ duraklar }: { duraklar: DurakGorunum[] }) {
  return (
    <section aria-label="Yol haritası" className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-card">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Yol haritası</div>
      <ol className="mt-2 space-y-1">
        {duraklar.map((d) => {
          const u = DURUM[d.durum]
          const Ikon = u.ikon
          const vurgu = d.durum === 'SIMDI'
          return (
            <li
              key={d.no}
              aria-current={vurgu ? 'step' : undefined}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2.5 py-2 ${vurgu ? 'bg-kr-soft/60' : ''} ${d.durum === 'GEREKMEDI' ? 'opacity-70' : ''}`}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${u.cls}`} aria-hidden><Ikon className="h-3.5 w-3.5" /></span>
              <span className={`w-[150px] shrink-0 text-[13.5px] ${vurgu ? 'font-bold text-foreground' : 'font-semibold text-foreground'}`}>
                <span className="font-mono text-[12px] text-muted-foreground">{d.no} </span>{d.ad}
              </span>
              <span className="sr-only">{u.yazi}: </span>
              <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{d.ozet}</span>
              {d.uyari && (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />{d.uyari}
                </span>
              )}
              <span className="text-[11.5px] text-muted-foreground" aria-hidden>{u.yazi}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
