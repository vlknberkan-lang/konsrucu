'use client'

/**
 * KonsRücü — Dosya Detay · BELGE & VERİ şeridi (5-aşama Süreç şeridinin altında, her ekranda görünür)
 * Üç kova: Hasar Evrakları · UYAP Evrakları · Taksit. Kova seçilince ana içerik o kovaya odaklanır (?belge=).
 * Aktif kovaya tekrar tıklamak Süreç'e döndürür; sağda da "Süreç'e dön" kısayolu.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Scale, CreditCard, ArrowLeft } from 'lucide-react'

export type BelgeKey = 'hasar' | 'uyap' | 'taksit'

const NODES: { key: BelgeKey; label: string; Icon: typeof FileText }[] = [
  { key: 'hasar', label: 'Hasar Evrakları', Icon: FileText },
  { key: 'uyap', label: 'UYAP Evrakları', Icon: Scale },
  { key: 'taksit', label: 'Taksit', Icon: CreditCard },
]

export function BelgeSerit({
  aktif,
  asama,
  sayilar,
}: {
  aktif: BelgeKey | null
  asama: string
  sayilar: { hasar: number; uyap: number; taksit: number | null }
}) {
  const pathname = usePathname()
  const surecHref = `${pathname}?asama=${asama}`

  return (
    <section className="mt-[14px] overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="border-b border-border-subtle px-5 py-2.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Belge &amp; Veri · kova seç</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {NODES.map((n) => {
          const on = aktif === n.key
          const href = on ? surecHref : `${pathname}?asama=${asama}&belge=${n.key}`
          const sayi = n.key === 'hasar' ? sayilar.hasar : n.key === 'uyap' ? sayilar.uyap : sayilar.taksit
          return (
            <Link
              key={n.key}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/40 ${
                on ? 'border-kr/40 bg-kr-soft text-kr-ink ring-2 ring-kr/20' : 'border-border bg-surface-muted/40 text-muted-foreground hover:border-kr/30 hover:text-foreground'
              }`}
            >
              <n.Icon className="h-[15px] w-[15px]" />
              <span>{n.label}</span>
              {sayi != null && sayi > 0 && (
                <span className={`font-mono rounded-full px-1.5 py-[1px] text-[10px] tabular-nums ${on ? 'bg-surface text-kr-ink' : 'border border-border bg-surface text-muted-foreground'}`}>{sayi}</span>
              )}
            </Link>
          )
        })}
        {aktif && (
          <Link href={surecHref} className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Süreç&apos;e dön
          </Link>
        )}
      </div>
    </section>
  )
}
