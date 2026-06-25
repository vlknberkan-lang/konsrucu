'use client'

/**
 * KonsRücü — Taksit Takvimi (menü) · çapraz-dosya tüm taksitler, aya göre gruplu.
 * Filtre (Geciken/Bu ay/Bekleyen/Ödenen/Hepsi) + "Ödendi işle" (taksitOdendi → dosyaya entegre) + dosyaya git.
 */
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreditCard, Check, Loader2, Undo2, ArrowRight, AlertTriangle } from 'lucide-react'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { taksitOdendi, taksitOdemeGeriAl } from '@/app/(app)/akilli-giris/actions'

export type TaksitUI = {
  id: string; dosyaId: string; hukukNo: string | null; borclu: string | null
  sira: number; taksitSayisi: number; vade: string; tutar: number; durum: string; odendiTarih: string | null
}

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const isoParts = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return { y, m: m - 1, d } }
const gunLabel = (iso: string) => { const p = isoParts(iso); return `${p.d} ${AY[p.m]}` }
const ayLabel = (iso: string) => { const p = isoParts(iso); return `${AY[p.m]} ${p.y}` }
const ayKey = (iso: string) => iso.slice(0, 7)
const money = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'

type Filtre = 'geciken' | 'buay' | 'bekleyen' | 'odenen' | 'hepsi'

export function TaksitTakvim({ taksitler, bugun }: { taksitler: TaksitUI[]; bugun: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [filtre, setFiltre] = useState<Filtre>('bekleyen')
  const [isleyen, setIsleyen] = useState<string | null>(null)

  const gecikenMi = (t: TaksitUI) => t.durum !== 'ODENDI' && t.vade.slice(0, 10) < bugun
  const buAy = bugun.slice(0, 7)

  const sayim = useMemo(() => {
    const bek = taksitler.filter((t) => t.durum !== 'ODENDI')
    const gec = bek.filter(gecikenMi)
    const ay = taksitler.filter((t) => ayKey(t.vade) === buAy && t.durum !== 'ODENDI')
    const topla = (a: TaksitUI[]) => a.reduce((s, t) => s + t.tutar, 0)
    return { gecikenN: gec.length, gecikenTL: topla(gec), ayN: ay.length, ayTL: topla(ay), bekN: bek.length, bekTL: topla(bek) }
  }, [taksitler, bugun]) // eslint-disable-line react-hooks/exhaustive-deps

  const suzulu = useMemo(() => {
    let l = taksitler
    if (filtre === 'geciken') l = l.filter(gecikenMi)
    else if (filtre === 'buay') l = l.filter((t) => ayKey(t.vade) === buAy)
    else if (filtre === 'bekleyen') l = l.filter((t) => t.durum !== 'ODENDI')
    else if (filtre === 'odenen') l = l.filter((t) => t.durum === 'ODENDI')
    return [...l].sort((a, b) => a.vade.localeCompare(b.vade))
  }, [taksitler, filtre, buAy]) // eslint-disable-line react-hooks/exhaustive-deps

  const gruplar = useMemo(() => {
    const m = new Map<string, TaksitUI[]>()
    for (const t of suzulu) { const k = ayKey(t.vade); if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    return [...m.entries()]
  }, [suzulu])

  function ode(id: string) {
    setIsleyen(id)
    start(async () => { const r = await taksitOdendi(id); setIsleyen(null); if (r.ok) router.refresh() })
  }
  function geriAl(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Taksit ödemesi geri alınsın mı? Bağlı tahsilat kaydı silinir.')) return
    setIsleyen(id)
    start(async () => { const r = await taksitOdemeGeriAl(id); setIsleyen(null); if (r.ok) router.refresh() })
  }

  const CIP: { k: Filtre; lbl: string; n?: number }[] = [
    { k: 'geciken', lbl: 'Geciken', n: sayim.gecikenN },
    { k: 'buay', lbl: 'Bu ay', n: sayim.ayN },
    { k: 'bekleyen', lbl: 'Bekleyen', n: sayim.bekN },
    { k: 'odenen', lbl: 'Ödenen' },
    { k: 'hepsi', lbl: 'Hepsi' },
  ]

  return (
    <div>
      {/* özet kartları */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          ['Geciken', sayim.gecikenN, sayim.gecikenTL, 'danger'],
          ['Bu ay', sayim.ayN, sayim.ayTL, 'kr'],
          ['Toplam bekleyen', sayim.bekN, sayim.bekTL, 'steel'],
        ] as [string, number, number, Tone][]).map(([lbl, n, tl, tone]) => (
          <div key={lbl} className={`rounded-2xl border bg-surface p-4 shadow-card ${tone === 'danger' && n > 0 ? 'border-danger/30' : 'border-border'}`}>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{lbl}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`font-display text-[22px] font-extrabold ${tone === 'danger' && n > 0 ? 'text-danger' : 'text-foreground'}`}>{n}</span>
              <span className="text-[12px] text-muted-foreground">taksit</span>
            </div>
            <div className="font-mono mt-0.5 text-[13px] font-bold tabular-nums text-kr-ink">{money(tl)}</div>
          </div>
        ))}
      </div>

      {/* filtre çipleri */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {CIP.map((c) => (
          <button key={c.k} type="button" onClick={() => setFiltre(c.k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${filtre === c.k ? 'border-transparent bg-kr text-kr-foreground' : 'border-border bg-surface text-muted-foreground hover:text-foreground'}`}>
            {c.lbl}{typeof c.n === 'number' && <span className={`rounded-full px-1.5 text-[10.5px] ${filtre === c.k ? 'bg-white/20' : 'bg-surface-muted'}`}>{c.n}</span>}
          </button>
        ))}
      </div>

      {gruplar.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/30 px-7 py-14 text-center text-[13px] text-muted-foreground">Bu filtrede taksit yok.</div>
      ) : (
        <div className="flex flex-col gap-5">
          {gruplar.map(([k, list]) => {
            const toplam = list.reduce((s, t) => s + t.tutar, 0)
            return (
              <div key={k}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="font-display text-[15px] font-extrabold">{ayLabel(list[0].vade)}</h3>
                  <span className="font-mono text-[11.5px] text-muted-foreground">· {list.length} taksit · {money(toplam)}</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                  {list.map((t, i) => {
                    const odendi = t.durum === 'ODENDI'
                    const geciken = !odendi && t.vade.slice(0, 10) < bugun
                    const tone: Tone = odendi ? 'success' : geciken ? 'danger' : 'steel'
                    const durumEt = odendi ? 'Ödendi' : geciken ? 'Geciken' : 'Bekliyor'
                    return (
                      <div key={t.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border-subtle' : ''} ${geciken ? 'bg-danger-soft/20' : ''}`}>
                        <div className="w-[60px] shrink-0 text-center">
                          <div className="font-mono text-[14px] font-bold tabular-nums text-kr-ink">{gunLabel(t.vade)}</div>
                        </div>
                        <span className="h-9 w-px bg-border" />
                        <div className="min-w-[160px] flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold">{t.borclu ?? '—'}</span>
                            <span className="font-mono shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground">{t.sira}/{t.taksitSayisi}. taksit</span>
                          </div>
                          <div className="font-mono truncate text-[11px] text-muted-foreground">{t.hukukNo ?? t.dosyaId.slice(0, 8)}{odendi && t.odendiTarih ? ` · ödendi ${gunLabel(t.odendiTarih)}` : ''}</div>
                        </div>
                        <div className="font-mono w-[120px] shrink-0 text-right text-[13.5px] font-bold tabular-nums">{money(t.tutar)}</div>
                        <Badge tone={tone} dot={geciken}>{geciken && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}{durumEt}</Badge>
                        <div className="flex shrink-0 items-center gap-1">
                          {odendi ? (
                            <button type="button" onClick={() => geriAl(t.id)} disabled={pending} title="Ödemeyi geri al" className="inline-flex items-center gap-1 rounded-[9px] border border-border px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:border-danger/40 hover:text-danger disabled:opacity-60">{isleyen === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Geri al</button>
                          ) : (
                            <button type="button" onClick={() => ode(t.id)} disabled={pending} className="inline-flex items-center gap-1 rounded-[9px] bg-success px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-success/90 disabled:opacity-60">{isleyen === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Ödendi</button>
                          )}
                          <Link href={`/akilli-giris/${t.dosyaId}`} aria-label="Dosyaya git" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-kr"><ArrowRight className="h-4 w-4" /></Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
