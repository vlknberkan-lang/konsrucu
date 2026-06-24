'use client'

/**
 * KonsRücü — Dosya Detay · SÜREÇ şeridi = sekmenin kendisi
 * İcra Öncesi · İcra · Arabuluculuk · Dava · İnfaz — her düğüm tıklanır (?asama=). Seçili düğüm halkalı.
 * Altta numara, güncel rozeti, tamamlananda sonuç (itiraz/anlaşılmadı). Gelinmeyen aşamalar gri.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Landmark, Handshake, Scale, Gavel } from 'lucide-react'

type AsamaRec = { tur: string; durum: string; sonuc: string | null; kimlikNo: string | null }

const NODES = [
  { key: 'oncesi', tur: null as string | null, label: 'İcra Öncesi', Icon: FileText },
  { key: 'icra', tur: 'ICRA_TAKIBI', label: 'İcra Takibi', Icon: Landmark },
  { key: 'arabuluculuk', tur: 'ARABULUCULUK', label: 'Arabuluculuk', Icon: Handshake },
  { key: 'dava', tur: 'DAVA', label: 'Dava', Icon: Scale },
  { key: 'infaz', tur: 'INFAZ', label: 'İnfaz', Icon: Gavel },
] as const

export function SurecSerit({ asamalar, aktif, guncelSekme, icraNo }: { asamalar: AsamaRec[]; aktif: string; guncelSekme: string; icraNo: string | null }) {
  const pathname = usePathname()
  const byTur = new Map(asamalar.map((a) => [a.tur, a]))
  const guncelIdx = NODES.findIndex((n) => n.key === guncelSekme)
  const bitti = (i: number) => {
    const t = NODES[i].tur
    const rec = t ? byTur.get(t) : null
    return (!!rec && rec.durum === 'SONUCLANDI') || (guncelIdx >= 0 && i < guncelIdx)
  }

  return (
    <section className="mt-[14px] overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="border-b border-border-subtle px-5 py-2.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Süreç · aşamaya tıkla</span>
      </div>
      <div className="flex items-start gap-0.5 overflow-x-auto px-4 py-5">
        {NODES.map((n, i) => {
          const rec = n.tur ? byTur.get(n.tur) : null
          const done = bitti(i)
          const current = guncelIdx === i
          const on = aktif === n.key
          const kimlik = rec?.kimlikNo ?? (n.key === 'icra' ? icraNo : null)
          const dotCls = done ? 'border-success bg-success text-white' : current ? 'border-kr bg-kr text-white' : 'border-border bg-surface-muted text-muted-foreground'
          const labelCls = on || done ? 'text-foreground' : current ? 'text-kr-ink' : 'text-muted-foreground'
          const href = `${pathname}?asama=${n.key}` // İcra Öncesi dahil hepsi açık parametreyle (parametresiz URL güncel aşamaya düşer)
          return (
            <div key={n.key} className="flex items-start">
              {i > 0 && <span className={`mt-7 h-0.5 w-6 shrink-0 rounded-full ${bitti(i - 1) ? 'bg-success' : 'bg-border'}`} />}
              <Link
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex w-[106px] shrink-0 flex-col items-center gap-1 rounded-2xl px-1.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/40 ${on ? 'bg-kr/[0.06]' : 'hover:bg-surface-muted/60'}`}
              >
                <span className={`grid h-11 w-11 place-items-center rounded-[14px] border transition ${dotCls} ${on ? 'ring-2 ring-kr ring-offset-2 ring-offset-surface' : ''}`}>
                  <n.Icon className="h-[19px] w-[19px]" />
                </span>
                <span className={`text-[12.5px] font-semibold leading-tight ${labelCls} ${on ? 'font-bold' : ''}`}>{n.label}</span>
                {kimlik ? <span className="font-mono text-[10.5px] text-muted-foreground">{kimlik}</span> : <span className="select-none font-mono text-[10.5px] text-transparent">—</span>}
                {current ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-kr-soft px-2 py-0.5 text-[10px] font-bold text-kr-ink"><span className="h-1 w-1 rounded-full bg-kr" /> güncel</span>
                ) : done && rec?.sonuc ? (
                  <span className="font-mono text-[9.5px] text-muted-foreground">{rec.sonuc}</span>
                ) : (
                  <span className="select-none text-[10px] text-transparent">—</span>
                )}
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
