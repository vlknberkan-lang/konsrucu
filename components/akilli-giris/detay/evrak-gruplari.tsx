'use client'

/** KonsRücü — Dosya Detay · "1 · EVRAK" katlanabilir kategori grupları (gerçek Belge[]) + belge açma. */
import { useState } from 'react'
import { FileText, Image as ImageIcon, ChevronRight, Check, AlertTriangle, Sparkles, Eye } from 'lucide-react'
import { BelgeOnizleme, type OnizlemeBelge } from '@/components/akilli-giris/detay/belge-onizleme'

export type DetayBelge = { id: string; kategori: string; dosyaAdi: string; confidence: number | null; foto: boolean; acilabilir: boolean }

const KAT_SIRA = ['POLICE', 'DEKONT', 'LEHE', 'TUTANAK', 'EKSPERTIZ', 'EHLIYET', 'RUHSAT', 'ALKOL', 'SBM', 'HASAR_FOTO', 'DIGER']
const KAT_LABEL: Record<string, string> = { POLICE: 'Poliçe', DEKONT: 'Dekont', LEHE: 'Lehe', TUTANAK: 'Tutanak', EKSPERTIZ: 'Ekspertiz', EHLIYET: 'Ehliyet', RUHSAT: 'Ruhsat', ALKOL: 'Alkol', SBM: 'SBM', HASAR_FOTO: 'Hasar Foto', DIGER: 'Diğer' }
const KAT_ACCENT: Record<string, string> = { POLICE: 'text-kr', DEKONT: 'text-success', LEHE: 'text-info', TUTANAK: 'text-[hsl(var(--warning-fg))]', EKSPERTIZ: 'text-kr', EHLIYET: 'text-info', RUHSAT: 'text-info', ALKOL: 'text-danger', SBM: 'text-muted-foreground', HASAR_FOTO: 'text-muted-foreground', DIGER: 'text-muted-foreground' }
const REVIEW = 0.65

function Conf({ c }: { c: number }) {
  const lv = c >= 0.85 ? 'high' : c >= 0.7 ? 'mid' : 'low'
  const cls = lv === 'high' ? 'bg-success-soft text-success' : lv === 'mid' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
  const dot = lv === 'high' ? 'bg-success' : lv === 'mid' ? 'bg-warning' : 'bg-danger'
  return <span className={`font-mono inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[2px] text-[9.5px] font-bold ${cls}`}><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />%{Math.round(c * 100)}</span>
}

export function EvrakGruplari({ belgeler }: { belgeler: DetayBelge[] }) {
  const gruplar = KAT_SIRA.map((k) => ({ k, items: belgeler.filter((b) => b.kategori === k) })).filter((g) => g.items.length > 0)
  const review = belgeler.filter((b) => b.confidence != null && b.confidence < REVIEW).length
  const [acik, setAcik] = useState<Record<string, boolean>>(() => Object.fromEntries(gruplar.map((g) => [g.k, g.k !== 'HASAR_FOTO'])))
  const [onizle, setOnizle] = useState<OnizlemeBelge | null>(null)

  return (
    <div>
      {/* AI gruplama özeti bandı */}
      <div className={`mb-[14px] flex items-center gap-[13px] rounded-xl border p-[12px_15px] ${review > 0 ? 'border-warning/30 bg-warning-soft' : 'border-kr/20 bg-kr-soft'}`}>
        <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-surface ${review > 0 ? 'text-[hsl(var(--warning-fg))]' : 'text-kr-ink'}`}><Sparkles className="h-[17px] w-[17px]" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-foreground">AI {belgeler.length} belgeyi {gruplar.length} gruba ayırdı</div>
          <div className={`text-[11.5px] ${review > 0 ? 'text-[hsl(var(--warning-fg))]' : 'text-kr-ink'}`}>{review > 0 ? `${review} belge düşük güven · gözden geçir` : 'Tüm belgeler sınıflandı ve metni çıkarıldı'}</div>
        </div>
      </div>

      <div className="flex flex-col gap-[9px]">
        {gruplar.map(({ k, items }) => {
          const rev = items.filter((b) => b.confidence != null && b.confidence < REVIEW).length
          const open = acik[k]
          const foto = k === 'HASAR_FOTO'
          return (
            <div key={k} className={`overflow-hidden rounded-xl border bg-surface ${rev > 0 ? 'border-warning/35' : 'border-border'}`}>
              <button type="button" onClick={() => setAcik((s) => ({ ...s, [k]: !s[k] }))} aria-expanded={open} className={`flex w-full items-center gap-3 p-[11px_14px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 ${rev > 0 ? 'bg-warning-soft' : 'bg-surface-muted'}`}>
                <span className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] border border-border bg-surface ${KAT_ACCENT[k] ?? 'text-muted-foreground'}`}>{foto ? <ImageIcon className="h-[15px] w-[15px]" /> : <FileText className="h-[15px] w-[15px]" />}</span>
                <span className="text-[13.5px] font-bold">{KAT_LABEL[k] ?? k}</span>
                <span className="font-mono rounded-full border border-border bg-surface px-2 py-[2px] text-[10.5px] font-semibold text-muted-foreground">{items.length}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {rev > 0
                    ? <span className="flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[hsl(var(--warning-fg))]"><AlertTriangle className="h-3 w-3" />{rev} gözden geçir</span>
                    : <span className="flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground"><Check className="h-3 w-3" />işlendi</span>}
                  <ChevronRight className={`h-[15px] w-[15px] text-muted-foreground transition ${open ? 'rotate-90' : ''} motion-reduce:transition-none`} />
                </span>
              </button>
              {open && (
                <div className="border-t border-border-subtle p-2">
                  {foto ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(62px,1fr))] gap-[7px] p-1">
                      {items.slice(0, 24).map((b) => (
                        <button key={b.id} type="button" onClick={() => b.acilabilir && setOnizle({ id: b.id, dosyaAdi: b.dosyaAdi })} disabled={!b.acilabilir} title={b.acilabilir ? `Aç: ${b.dosyaAdi}` : b.dosyaAdi} className={`group relative grid aspect-square place-items-center rounded-[8px] bg-surface-muted text-muted-foreground transition ${b.acilabilir ? 'cursor-pointer hover:text-kr hover:ring-2 hover:ring-kr/40' : 'cursor-default'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50`}>
                          <ImageIcon className="h-4 w-4" />
                        </button>
                      ))}
                      {items.length > 24 && <span className="grid aspect-square place-items-center rounded-[8px] bg-surface-muted font-mono text-[12px] font-bold text-foreground">+{items.length - 24}</span>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-[6px]">
                      {items.map((b) => {
                        const dusuk = b.confidence != null && b.confidence < REVIEW
                        return (
                          <div key={b.id} className={`flex items-center gap-3 rounded-[10px] p-[8px_10px] ${dusuk ? 'border border-warning/30 bg-warning-soft' : 'border border-border-subtle bg-surface'}`}>
                            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[8px] bg-surface-muted text-muted-foreground">{b.foto ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold">{b.dosyaAdi}</span>
                            {b.confidence != null && <Conf c={b.confidence} />}
                            {dusuk && <span className="hidden shrink-0 items-center gap-1 font-mono text-[9.5px] text-[hsl(var(--warning-fg))] sm:flex"><AlertTriangle className="h-3 w-3" />teyit</span>}
                            {b.acilabilir
                              ? <button type="button" onClick={() => setOnizle({ id: b.id, dosyaAdi: b.dosyaAdi })} title="Belgeyi aç" className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"><Eye className="h-3.5 w-3.5" /> Aç</button>
                              : <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground" title="Bu kayıt Storage'sız (eski) — dosya saklanmamış">—</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <BelgeOnizleme belge={onizle} onKapat={() => setOnizle(null)} />
    </div>
  )
}
