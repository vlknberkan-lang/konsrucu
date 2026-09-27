/**
 * KonsRücü — Dosya Yol Haritası · SONRA listesi · components/dosya/yol-haritasi/sonra-listesi.tsx
 *
 * Şimdi kartının altında en çok 3 madde; kalanı katlanır (06 §2: uyarı yorgunluğuna karşı). Ertelenen adımlar
 * ayrı ve soluk bir satırda görünür. Düğme yoktur (tek birincil düğme Şimdi kartındadır); her satır yalnız metin,
 * son gün ve kural kodu taşır.
 */
import { AlertTriangle, CalendarClock, Clock3 } from 'lucide-react'
import type { Adim } from '@/lib/konsrucu/yol-haritasi/tipler'
import { Badge } from '@/components/konsrucu/ui'
import { adimTonu, gunGoster, kalanMetni } from './eylem'

export function SonraListesi({ sonra, sonraKatlanan, ertelenenler, bilgi }: {
  sonra: Adim[]
  sonraKatlanan: number
  ertelenenler?: Adim[]
  bilgi?: Adim[]
}) {
  if (!sonra.length && !ertelenenler?.length && !bilgi?.length) return null
  return (
    <section aria-label="Sonra" className="rounded-2xl border border-border bg-surface px-5 py-3 shadow-card">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sonra</div>
      {sonra.length > 0 ? (
        <ul className="mt-1.5 divide-y divide-border-subtle">
          {sonra.map((a) => {
            const ton = adimTonu(a)
            return (
              <li key={a.kural} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13.5px]">
                {a.engel && <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-hidden />}
                <span className="min-w-0 flex-1 text-foreground">{a.metin}</span>
                {a.sonGun && (
                  <span className="inline-flex items-center gap-1 font-mono text-[12px] tabular-nums text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />{gunGoster(a.sonGun)}{a.kalanGun != null && ` · ${kalanMetni(a.kalanGun)}`}
                  </span>
                )}
                <Badge tone={ton.tone}>{ton.etiket}</Badge>
                <span className="font-mono text-[11px] text-muted-foreground">{a.kural}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-muted-foreground">Sırada başka iş yok.</p>
      )}
      {sonraKatlanan > 0 && <p className="mt-1 text-[12px] text-muted-foreground">+{sonraKatlanan} iş daha (öncelik sırasıyla sonra gelecek)</p>}
      {bilgi && bilgi.length > 0 && (
        <ul className="mt-2 space-y-1">
          {bilgi.map((a) => <li key={a.kural} className="text-[12.5px] text-info">Bilgi: {a.metin} <span className="font-mono text-[11px] text-muted-foreground">{a.kural}</span></li>)}
        </ul>
      )}
      {ertelenenler && ertelenenler.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border-subtle pt-2">
          {ertelenenler.map((a) => (
            <li key={a.kural} className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" aria-hidden /> Ertelendi ({gunGoster(a.ertelendi)} tarihine kadar): {a.metin}
              <span className="font-mono text-[11px]">{a.kural}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
