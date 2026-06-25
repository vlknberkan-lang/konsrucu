'use client'

/**
 * KonsRücü — Masraflar listesi · components/masraf/masraf-liste.tsx
 * Masraf tarihine göre aya gruplu tablo. Satır içi düzenleme: cins (63 kalem), taraf (BIZ/KARSI/BELIRSIZ),
 * durum (Yeni→Onaylı→Faturalandı→Tahsil/Arşiv). Toplu işlem barı + makbuz önizleme (BelgeOnizleme).
 * Liste/sıra server'dan tarihe göre gelir (B4); burada yalnız grupla + işle.
 */
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Trash2, Loader2, AlertTriangle, FileText, Tag } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { BelgeOnizleme, type OnizlemeBelge } from '@/components/akilli-giris/detay/belge-onizleme'
import { MASRAF_CINSLERI, MASRAF_DURUM, MASRAF_TARAF, type MasrafUi, type MasrafDurumKod, type MasrafTarafKod } from '@/lib/konsrucu/masraf'
import { masrafCinsAta, masrafTarafAta, masrafDurumAta, masrafToplu, masrafSil } from '@/app/(app)/masraf/actions'

export type MasrafKpi = { toplamN: number; toplamTL: number; faturaN: number; faturaTL: number; belirsizN: number; eslesmedinN: number }

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const money = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
const ayKey = (iso: string | null) => (iso ? iso.slice(0, 7) : 'tarihsiz')
const ayLabel = (k: string) => { if (k === 'tarihsiz') return 'Tarihsiz'; const [y, m] = k.split('-').map(Number); return `${AY[m - 1]} ${y}` }
const gunLabel = (iso: string | null) => { if (!iso) return '—'; const [, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} ${AY[m - 1].slice(0, 3)}` }

type Alan = 'cins' | 'taraf' | 'durum'

export function MasrafListe({ satirlar, kpi }: { satirlar: MasrafUi[]; kpi: MasrafKpi }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [secili, setSecili] = useState<Set<string>>(new Set())
  const [onizleme, setOnizleme] = useState<OnizlemeBelge | null>(null)
  const [duzenle, setDuzenle] = useState<{ id: string; alan: Alan } | null>(null)
  const [isleyen, setIsleyen] = useState<string | null>(null)

  const gruplar = useMemo(() => {
    const m = new Map<string, MasrafUi[]>()
    for (const s of satirlar) { const k = ayKey(s.tarih); if (!m.has(k)) m.set(k, []); m.get(k)!.push(s) }
    // tarihliler azalan; tarihsiz en sonda
    return [...m.entries()].sort((a, b) => (a[0] === 'tarihsiz' ? 1 : b[0] === 'tarihsiz' ? -1 : b[0].localeCompare(a[0])))
  }, [satirlar])

  function secToggle(id: string) {
    setSecili((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function grupToggle(list: MasrafUi[], hepsi: boolean) {
    setSecili((p) => { const n = new Set(p); for (const s of list) hepsi ? n.delete(s.id) : n.add(s.id); return n })
  }
  function calistir(fn: () => Promise<{ ok: boolean; error?: string }>, id?: string) {
    if (id) setIsleyen(id)
    start(async () => { const r = await fn(); setIsleyen(null); setDuzenle(null); if (r.ok) { router.refresh() } else if (r.error) { alert(r.error) } })
  }
  function toplu(islem: string) {
    const ids = [...secili]
    if (!ids.length) return
    if (islem === 'SIL' && !confirm(`${ids.length} masraf kaydı silinsin mi?`)) return
    start(async () => { const r = await masrafToplu(ids, islem); if (r.ok) { setSecili(new Set()); router.refresh() } else if (r.error) alert(r.error) })
  }

  const KPI: [string, number, string, string][] = [
    ['Toplam (aktif)', kpi.toplamN, money(kpi.toplamTL), 'text-foreground'],
    ['Faturalanmamış · bizim', kpi.faturaN, money(kpi.faturaTL), 'text-kr-ink'],
    ['Belirsiz taraf', kpi.belirsizN, 'karar bekliyor', 'text-warning'],
    ['Eşleştirilmedi', kpi.eslesmedinN, 'cins seçilmeli', 'text-danger'],
  ]

  return (
    <div>
      {/* KPI kartları */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI.map(([lbl, n, alt, cls]) => (
          <div key={lbl} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{lbl}</div>
            <div className="mt-1 flex items-baseline gap-2"><span className={`font-display text-[22px] font-extrabold ${cls}`}>{n}</span><span className="text-[12px] text-muted-foreground">kalem</span></div>
            <div className="font-mono mt-0.5 text-[12.5px] font-bold tabular-nums text-muted-foreground">{alt}</div>
          </div>
        ))}
      </div>

      {/* toplu işlem barı */}
      {secili.size > 0 && (
        <div role="region" aria-live="polite" aria-label="Toplu işlemler" className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-kr/40 bg-kr-soft/60 px-4 py-2.5 shadow-pop">
          <span className="text-[13px] font-semibold text-kr-ink">{secili.size} seçili</span>
          <span className="h-5 w-px bg-kr/20" />
          <button type="button" disabled={pending} onClick={() => toplu('ONAYLI')} className="rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-foreground transition hover:border-kr/40">Onayla</button>
          <button type="button" disabled={pending} onClick={() => toplu('FATURALANDI')} className="rounded-[9px] bg-success px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-success/90">Faturalandı</button>
          <button type="button" disabled={pending} onClick={() => toplu('ARSIV')} className="rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:text-foreground">Arşivle</button>
          <button type="button" disabled={pending} onClick={() => toplu('SIL')} className="rounded-[9px] border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-danger transition hover:border-danger/40">Sil</button>
          <button type="button" onClick={() => setSecili(new Set())} className="ml-auto text-[12px] font-semibold text-muted-foreground hover:text-foreground">Temizle</button>
        </div>
      )}

      {gruplar.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/30 px-7 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-kr/[0.12] text-kr"><FileText className="h-7 w-7" /></div>
          <p className="mt-3 text-[14px] font-semibold">Bu filtrede masraf yok</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] text-muted-foreground">Makbuz PDF'leri çekildikçe masraflar otomatik düşer; ya da “Masraf ekle” ile manuel girip makbuz okutabilirsiniz.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {gruplar.map(([k, list]) => {
            const toplam = list.reduce((s, t) => s + t.tutar, 0)
            const hepsiSecili = list.every((s) => secili.has(s.id))
            return (
              <div key={k}>
                <div className="mb-2 flex items-baseline gap-2">
                  <button type="button" onClick={() => grupToggle(list, hepsiSecili)} className="font-mono text-[10.5px] text-muted-foreground hover:text-kr">{hepsiSecili ? '☑' : '☐'}</button>
                  <h3 className="font-display text-[15px] font-extrabold">{ayLabel(k)}</h3>
                  <span className="font-mono text-[11.5px] text-muted-foreground">· {list.length} kalem · {money(toplam)}</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                  {list.map((m, i) => (
                    <Satir key={m.id} m={m} ilk={i === 0} secili={secili.has(m.id)} isleyen={isleyen === m.id} pending={pending}
                      duzenle={duzenle?.id === m.id ? duzenle.alan : null}
                      onSec={() => secToggle(m.id)}
                      onDuzenle={(alan) => setDuzenle({ id: m.id, alan })}
                      onKapatDuzenle={() => setDuzenle(null)}
                      onCins={(c) => calistir(() => masrafCinsAta(m.id, c), m.id)}
                      onTaraf={(t) => calistir(() => masrafTarafAta(m.id, t), m.id)}
                      onDurum={(d) => calistir(() => masrafDurumAta(m.id, d), m.id)}
                      onSil={() => { if (confirm('Bu masraf kaydı silinsin mi?')) calistir(() => masrafSil(m.id), m.id) }}
                      onOnizle={() => m.belgeId && setOnizleme({ id: m.belgeId, dosyaAdi: m.belgeAdi ?? 'Makbuz' })}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BelgeOnizleme belge={onizleme} onKapat={() => setOnizleme(null)} />
    </div>
  )
}

function Satir({ m, ilk, secili, isleyen, pending, duzenle, onSec, onDuzenle, onKapatDuzenle, onCins, onTaraf, onDurum, onSil, onOnizle }: {
  m: MasrafUi; ilk: boolean; secili: boolean; isleyen: boolean; pending: boolean; duzenle: Alan | null
  onSec: () => void; onDuzenle: (a: Alan) => void; onKapatDuzenle: () => void
  onCins: (c: string) => void; onTaraf: (t: string) => void; onDurum: (d: string) => void; onSil: () => void; onOnizle: () => void
}) {
  const dosyaEt = m.hasarDosya ?? m.hukukKodu ?? m.esas ?? m.dosyaId.slice(0, 8)
  const dt = MASRAF_DURUM[m.durum]
  const tr = MASRAF_TARAF[m.taraf]
  const dusukGuven = m.cins != null && m.cinsGuven != null && m.cinsGuven < 0.85

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px] ${ilk ? '' : 'border-t border-border-subtle'} ${secili ? 'bg-kr-soft/25' : ''}`}>
      <input type="checkbox" checked={secili} onChange={onSec} aria-label="Seç" className="h-4 w-4 shrink-0 accent-[hsl(var(--kr))]" />
      <div className="w-[56px] shrink-0 text-center"><div className="font-mono text-[12.5px] font-bold tabular-nums text-kr-ink">{gunLabel(m.tarih)}</div></div>

      <div className="min-w-[150px] flex-1">
        <Link href={`/akilli-giris/${m.dosyaId}`} className="font-mono truncate text-[12px] font-semibold hover:text-kr hover:underline">{dosyaEt}</Link>
        <div className="truncate text-[11px] text-muted-foreground">{m.sigortali ?? m.mahkeme ?? '—'}{m.dekontNo ? ` · dekont ${m.dekontNo}` : ''}</div>
      </div>

      {/* cins */}
      <div className="min-w-[170px] flex-1">
        {duzenle === 'cins' ? (
          <select autoFocus defaultValue={m.cins ?? ''} onBlur={onKapatDuzenle} onChange={(e) => e.target.value && onCins(e.target.value)} className="w-full rounded-[8px] border border-kr/50 bg-surface px-2 py-1 text-[12px] outline-none ring-2 ring-kr/20">
            <option value="">— seç —</option>
            {MASRAF_CINSLERI.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : m.cins ? (
          <button type="button" onClick={() => onDuzenle('cins')} title={dusukGuven ? `Düşük güven (%${Math.round((m.cinsGuven ?? 0) * 100)}) — kontrol et` : 'Cinsi değiştir'} className="inline-flex max-w-full items-center gap-1 truncate text-left text-[12.5px] hover:text-kr">
            {dusukGuven && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}<span className="truncate">{m.cins}</span>
          </button>
        ) : (
          <button type="button" onClick={() => onDuzenle('cins')} className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-[3px] text-[11px] font-semibold text-danger transition hover:brightness-95">
            <Tag className="h-3 w-3" /> Eşleştirilmedi
          </button>
        )}
        {m.cinsHam && m.cins !== m.cinsHam && <div className="truncate text-[10.5px] text-muted-foreground" title={m.cinsHam}>ham: {m.cinsHam}</div>}
      </div>

      <div className="font-mono w-[110px] shrink-0 text-right text-[13px] font-bold tabular-nums">{money(m.tutar)}</div>

      {/* taraf */}
      <div className="w-[108px] shrink-0">
        {duzenle === 'taraf' ? (
          <select autoFocus defaultValue={m.taraf} onBlur={onKapatDuzenle} onChange={(e) => onTaraf(e.target.value)} className="w-full rounded-[8px] border border-kr/50 bg-surface px-2 py-1 text-[12px] outline-none ring-2 ring-kr/20">
            {(Object.keys(MASRAF_TARAF) as MasrafTarafKod[]).map((k) => <option key={k} value={k}>{MASRAF_TARAF[k].label}</option>)}
          </select>
        ) : (
          <button type="button" onClick={() => onDuzenle('taraf')} title="Tarafı değiştir"><Badge tone={tr.tone} dot={m.taraf === 'BELIRSIZ'}>{m.taraf === 'BELIRSIZ' && <AlertTriangle className="mr-0.5 inline h-3 w-3" />}{tr.label}</Badge></button>
        )}
      </div>

      {/* durum */}
      <div className="w-[112px] shrink-0">
        {duzenle === 'durum' ? (
          <select autoFocus defaultValue={m.durum} onBlur={onKapatDuzenle} onChange={(e) => onDurum(e.target.value)} className="w-full rounded-[8px] border border-kr/50 bg-surface px-2 py-1 text-[12px] outline-none ring-2 ring-kr/20">
            {(Object.keys(MASRAF_DURUM) as MasrafDurumKod[]).map((k) => <option key={k} value={k}>{MASRAF_DURUM[k].label}</option>)}
          </select>
        ) : (
          <button type="button" onClick={() => onDuzenle('durum')} title="Durumu değiştir"><Badge tone={dt.tone}>{dt.label}</Badge></button>
        )}
      </div>

      {/* eylemler */}
      <div className="flex w-[72px] shrink-0 items-center justify-end gap-1">
        {isleyen ? <Loader2 className="h-4 w-4 animate-spin text-kr" /> : (
          <>
            {m.belgeli && <button type="button" onClick={onOnizle} title="Makbuzu aç" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-kr"><Eye className="h-4 w-4" /></button>}
            <button type="button" onClick={onSil} disabled={pending} title="Sil" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </>
        )}
      </div>
    </div>
  )
}
