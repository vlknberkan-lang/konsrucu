/**
 * KonsRücü — Olay paneli rol → rozet tonu · components/dosya/olay/rol.ts (saf)
 * 06 "Görsel dil": beş durum rolü — risk (kırmızı), onay (amber), tamam (yeşil), bilgi (mavi), gerekmedi (gri).
 * Renk yalnız anlam taşır ve rol her zaman yazıyla da söylenir (ROL_ETIKET).
 */
import type { Tone } from '@/components/konsrucu/ui'
import type { Rol } from '@/lib/konsrucu/eksen/gorunum'

export const ROL_TON: Record<Rol, Tone> = { risk: 'danger', onay: 'warning', tamam: 'success', bilgi: 'info', gerekmedi: 'steel' }

export const ROL_YAZI: Record<Rol, string> = {
  risk: 'text-danger', onay: 'text-warning', tamam: 'text-success', bilgi: 'text-info', gerekmedi: 'text-muted-foreground',
}

/** Çerçeveli düğme (tek dolu düğme Şimdi kartınındır — 06 "Tek birincil düğme"). */
export const DUGME = 'inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50'
export const DUGME_ONAY = `${DUGME} border border-kr/[0.18] bg-kr-soft text-kr-ink hover:bg-kr-soft/70`
export const DUGME_IKINCIL = `${DUGME} border border-border text-muted-foreground hover:text-foreground`
export const GIRDI = 'rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50'
export const ETIKET = 'font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground'
