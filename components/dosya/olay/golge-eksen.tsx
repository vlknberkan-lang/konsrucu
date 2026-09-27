/**
 * KonsRücü — Gölge eksen satırı ("Yeni hesap: …") · components/dosya/olay/golge-eksen.tsx
 *
 * S15 gölge kip (06 §3.6): üç eksen onaylı olgulardan türetilir ve eski durumun YANINDA gösterilir; listeler ve
 * raporlar eski durumu okumaya devam eder. Her rozetin yanında kaynağı yazar ("UYAP, teyitsiz", "avukat onaylı",
 * "tahmin, teyit edin"). Eski durumla çelişki varsa uyarı satırı çıkar (GN-01 ipucu). Hook yok: sunucu bileşeni
 * içinde de kullanılabilir.
 */
import { AlertTriangle, GitBranch } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import type { GolgeEksenVM } from '@/lib/konsrucu/eksen/gorunum'
import { ROL_TON } from './rol'

export function GolgeEksen({ eksen, baslik = 'Yeni hesap' }: { eksen: GolgeEksenVM | null; baslik?: string }) {
  if (!eksen) return null
  return (
    <div role="group" aria-label="Yeni eksen hesabı (gölge)" className="mt-2 rounded-xl border border-dashed border-border bg-surface-muted/40 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          <GitBranch className="h-3 w-3" aria-hidden /> {baslik}
        </span>
        {eksen.rozetler.map((r) => (
          <span key={r.eksen} className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="font-mono text-[10px] font-semibold text-muted-foreground">{r.eksen}</span>
            <Badge tone={ROL_TON[r.rol]} dot>{r.etiket}</Badge>
            <span className="text-[11px] text-muted-foreground">({r.kaynak})</span>
          </span>
        ))}
      </div>
      {eksen.rozetler[0]?.notlar.length ? (
        <p className="mt-1.5 text-[11.5px] leading-[1.45] text-muted-foreground">{eksen.rozetler[0].notlar.slice(0, 2).join(' ')}</p>
      ) : null}
      {eksen.celiski && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] font-medium text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {eksen.celiski}
        </p>
      )}
    </div>
  )
}
