'use client'

/** KonsRücü — gruplanmış rücu kayıtları · components/akilli-giris/case-list.tsx
 *  Görünüm: kart · tablo · timeline. Yol + durum + triyaj. Gerçek DB verisi prop ile gelir. */
import { useState } from 'react'
import Link from 'next/link'
import { Grid2x2, Table2, GitCommitVertical, FileText, Image as ImageIcon, Aperture, AlertTriangle, Check } from 'lucide-react'
import { DURUM, YOLLAR, money, type CaseT } from '@/lib/konsrucu/map'
import { Badge, type Tone } from '@/components/konsrucu/ui'

function YolBadge({ yol }: { yol: CaseT['yol'] }) {
  if (!yol) return <Badge tone="steel">Triyaj bekliyor</Badge>
  const y = YOLLAR[yol]
  return <Badge tone={y.tone as Tone} dot>{y.label}</Badge>
}
function FlowMini({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-success' : i === step ? 'bg-kr' : 'bg-surface-muted'}`} />
      ))}
      <span className="font-mono ml-1 text-[9px] text-muted-foreground">{step}/5</span>
    </div>
  )
}

function CardView({ list }: { list: CaseT[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {list.map((c) => (
        <Link key={c.id} href={`/akilli-giris/${c.id}`} className="flex flex-col rounded-2xl border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:border-kr/45 hover:shadow-pop">
          <div className="flex items-start gap-3 p-[18px_18px_12px]">
            <div className="font-mono grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0a1628] to-kr/70 text-[11px] font-bold text-white">{c.foto}<span className="text-[7px] opacity-80">foto</span></div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[14.5px] font-bold">{c.hasarNo}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{c.sigortali === '—' ? 'Yeni yığın · gruplanıyor' : c.sigortali}</div>
            </div>
            <Badge tone={DURUM[c.durum].tone as Tone} dot>{DURUM[c.durum].label}</Badge>
          </div>
          <div className="flex items-center gap-2.5 px-[18px] pb-2.5"><YolBadge yol={c.yol} /><div className="flex-1"><FlowMini step={c.step} /></div></div>
          <div className="flex flex-wrap gap-1.5 px-[18px] pb-2.5">
            {c.pdf > 0 && <span className="font-mono inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"><FileText className="h-3 w-3" />{c.pdf} belge</span>}
            {c.foto > 0 && <span className="font-mono inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"><ImageIcon className="h-3 w-3" />{c.foto} foto</span>}
            {c.kamera > 0 && <span className="font-mono inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground"><Aperture className="h-3 w-3" />{c.kamera} kamera</span>}
            {c.dusuk > 0 && <span className="font-mono inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-1 text-[10px] font-semibold text-warning"><AlertTriangle className="h-3 w-3" />{c.dusuk} teyit</span>}
          </div>
          <div className="flex items-center gap-2.5 border-t border-border-subtle px-[18px] py-3">
            <span className="font-mono min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{c.il !== '—' ? `${c.il} · ${c.muhatap}` : c.islendi}</span>
            {c.tutar > 0 && <span className="font-mono text-[12.5px] font-bold">{money(c.tutar)}</span>}
          </div>
        </Link>
      ))}
    </div>
  )
}

function TableView({ list }: { list: CaseT[] }) {
  const cols = 'grid-cols-[135px_1fr_138px_110px_128px_64px_104px]'
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className={`font-mono grid ${cols} border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
        <span>Hasar No</span><span>Sigortalı / Muhatap</span><span>Yol</span><span>Süreç</span><span>Durum</span><span className="text-right">Teyit</span><span className="text-right">Tutar</span>
      </div>
      {list.map((c) => (
        <Link key={c.id} href={`/akilli-giris/${c.id}`} className={`grid ${cols} items-center border-b border-border-subtle px-5 py-3.5 text-[13px] transition last:border-0 hover:bg-surface-muted/60`}>
          <span className="font-mono text-[12.5px] font-bold">{c.hasarNo}</span>
          <div className="min-w-0"><div className="truncate font-semibold">{c.sigortali}</div><div className="font-mono truncate text-[10px] text-muted-foreground">{c.muhatap}</div></div>
          <span><YolBadge yol={c.yol} /></span>
          <div className="pr-3"><FlowMini step={c.step} /></div>
          <span><Badge tone={DURUM[c.durum].tone as Tone} dot>{DURUM[c.durum].label}</Badge></span>
          <span className="text-right">{c.dusuk > 0 ? <span className="font-mono text-warning">{c.dusuk}</span> : <Check className="ml-auto h-4 w-4 text-success" />}</span>
          <span className="font-mono text-right text-[12.5px] font-bold">{c.tutar > 0 ? money(c.tutar) : '—'}</span>
        </Link>
      ))}
    </div>
  )
}

function TimelineView({ list }: { list: CaseT[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {list.map((c, i) => (
        <div key={c.id} className="flex gap-3.5">
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${['takibeHazir', 'gonderildi'].includes(c.durum) ? 'border-success bg-success' : c.durum === 'isleniyor' ? 'border-kr bg-kr' : 'border-border bg-surface'}`} />
            {i < list.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
          </div>
          <Link href={`/akilli-giris/${c.id}`} className="flex-1 pb-5">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[13px] font-bold">{c.hasarNo}</span>
              <YolBadge yol={c.yol} /><Badge tone={DURUM[c.durum].tone as Tone} dot>{DURUM[c.durum].label}</Badge>
              <span className="font-mono ml-auto text-[10px] text-muted-foreground">{c.islendi}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">{c.sigortali} · {c.il} · {c.muhatap}</div>
            <div className="mt-2 max-w-[320px]"><FlowMini step={c.step} /></div>
          </Link>
        </div>
      ))}
    </div>
  )
}

export function CaseList({ list: allList }: { list: CaseT[] }) {
  const [view, setView] = useState<'card' | 'table' | 'timeline'>('card')
  const [tab, setTab] = useState('all')
  const isAks = (c: CaseT) => ['gozden', 'idariBekl'].includes(c.durum)
  const isTam = (c: CaseT) => ['takibeHazir', 'gonderildi'].includes(c.durum)

  if (allList.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-12 text-center">
        <div className="font-display text-lg font-bold">Henüz dosya yok</div>
        <p className="mx-auto mt-1.5 max-w-[54ch] text-[13px] text-muted-foreground">
          Yukarıdan ham evrak yığınını (poliçe · ekspertiz · tutanak · dekont + fotoğraflar) bırakın — sistem gruplar, alanları çıkarır ve dosyanın yolunu belirler.
        </p>
      </div>
    )
  }

  const tabs: [string, string, number][] = [
    ['all', 'Tümü', allList.length],
    ['aksiyon', 'Aksiyon bekliyor', allList.filter(isAks).length],
    ['isleniyor', 'İşleniyor', allList.filter((c) => c.durum === 'isleniyor').length],
    ['tamam', 'Tamamlanan', allList.filter(isTam).length],
  ]
  const list = allList.filter((c) => (tab === 'all' ? true : tab === 'aksiyon' ? isAks(c) : tab === 'tamam' ? isTam(c) : c.durum === tab))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border-b border-border">
          {tabs.map(([id, l, n]) => (
            <button key={id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-1 py-2.5 pr-4 text-[13.5px] font-semibold transition ${tab === id ? 'border-kr text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {l} <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
          {([['card', Grid2x2], ['table', Table2], ['timeline', GitCommitVertical]] as const).map(([id, I]) => (
            <button key={id} onClick={() => setView(id)} className={`grid h-8 w-8 place-items-center rounded-lg ${view === id ? 'bg-surface text-kr shadow-card' : 'text-muted-foreground'}`}><I className="h-[15px] w-[15px]" /></button>
          ))}
        </div>
      </div>
      {view === 'card' ? <CardView list={list} /> : view === 'table' ? <TableView list={list} /> : <TimelineView list={list} />}
    </div>
  )
}
