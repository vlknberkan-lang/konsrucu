'use client'

/**
 * KonsRücü — Takvim (custom, design-system) · Ay / Hafta / Ajanda + tür filtresi.
 * Etkinlikler (toplantı/duruşma/süre) bellekte; tıklayınca DosyaÖzet popover'ı. Kütüphane yok.
 */
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, X, Handshake, Scale, AlarmClock, Bell, CalendarDays, MapPin, Video, ArrowRight, Trash2, Pencil, Save, Loader2 } from 'lucide-react'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { DosyaOzet, type DosyaOzetData } from '@/components/konsrucu/dosya-ozet'
import { etkinlikSil, etkinlikGuncelle } from '@/app/(app)/akilli-giris/actions'

export type TakvimEtkinlik = {
  id: string; tur: string; baslik: string; baslar: string; biter: string | null
  yer: string | null; online: boolean; durum: string; dosyaId: string; ozet: DosyaOzetData
}

const TUR: Record<string, { label: string; tone: Tone; Icon: typeof Handshake }> = {
  ARABULUCULUK_TOPLANTISI: { label: 'Arabuluculuk', tone: 'kr', Icon: Handshake },
  DURUSMA: { label: 'Duruşma', tone: 'brand', Icon: Scale },
  SURE: { label: 'Süre', tone: 'warning', Icon: AlarmClock },
  HATIRLATMA: { label: 'Hatırlatma', tone: 'info', Icon: Bell },
  GORUSME: { label: 'Görüşme', tone: 'steel', Icon: CalendarDays },
}
const turMeta = (t: string) => TUR[t] ?? TUR.GORUSME
const dotBg: Record<Tone, string> = { kr: 'bg-kr', brand: 'bg-primary', warning: 'bg-warning', info: 'bg-info', success: 'bg-success', danger: 'bg-danger', steel: 'bg-muted-foreground' }

const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const gunKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const ayBasi = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const haftaBasi = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const gunEkle = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const saat = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
const gunBaslik = (d: Date) => `${d.getDate()} ${AYLAR[d.getMonth()]} ${GUNLER[(d.getDay() + 6) % 7]}`

// Etkinlik düzenleme (modal) — input stilleri + tür seçenekleri + ISO→datetime-local
const INP = 'w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'
const TUR_SECENEK: { val: string; label: string }[] = [
  { val: 'DURUSMA', label: 'Duruşma' },
  { val: 'ARABULUCULUK_TOPLANTISI', label: 'Arabuluculuk toplantısı' },
  { val: 'GORUSME', label: 'Görüşme' },
  { val: 'SURE', label: 'Süre / son tarih' },
  { val: 'HATIRLATMA', label: 'Hatırlatma' },
]
// UTC instant → Türkiye (UTC+3) duvar saati "YYYY-MM-DDTHH:mm" (tarayıcı TZ'inden bağımsız; trDateTime ile birebir round-trip)
const toLocalInput = (iso: string) => { const d = new Date(new Date(iso).getTime() + 3 * 3600000); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` }

type Gorunum = 'ay' | 'hafta' | 'ajanda'

export function Takvim({ etkinlikler }: { etkinlikler: TakvimEtkinlik[] }) {
  const bugun = new Date()
  const [gorunum, setGorunum] = useState<Gorunum>('ay')
  const [ankur, setAnkur] = useState<Date>(new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate()))
  const [turlar, setTurlar] = useState<Set<string>>(new Set())
  const [secili, setSecili] = useState<TakvimEtkinlik | null>(null)

  const suzulu = useMemo(() => (turlar.size ? etkinlikler.filter((e) => turlar.has(e.tur)) : etkinlikler), [etkinlikler, turlar])
  const gunlukMap = useMemo(() => {
    const m = new Map<string, TakvimEtkinlik[]>()
    for (const e of suzulu) { const k = gunKey(new Date(e.baslar)); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e) }
    for (const arr of m.values()) arr.sort((a, b) => a.baslar.localeCompare(b.baslar))
    return m
  }, [suzulu])

  const ileri = (yon: number) => setAnkur((d) => (gorunum === 'ay' ? new Date(d.getFullYear(), d.getMonth() + yon, 1) : gunEkle(d, yon * (gorunum === 'hafta' ? 7 : 14))))
  const baslikMetni = gorunum === 'ay' ? `${AYLAR[ankur.getMonth()]} ${ankur.getFullYear()}` : gorunum === 'hafta' ? (() => { const b = haftaBasi(ankur), s = gunEkle(b, 6); return `${b.getDate()} ${AYLAR[b.getMonth()]} – ${s.getDate()} ${AYLAR[s.getMonth()]}` })() : 'Yaklaşan'

  const turSekmeleri = Object.keys(TUR).filter((t) => etkinlikler.some((e) => e.tur === t))

  return (
    <div>
      {/* üst bar */}
      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-card backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
          {(['ay', 'hafta', 'ajanda'] as const).map((g) => (
            <button key={g} type="button" onClick={() => setGorunum(g)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize transition ${gorunum === g ? 'bg-surface text-kr shadow-card' : 'text-muted-foreground hover:text-foreground'}`}>{g}</button>
          ))}
        </div>
        {gorunum !== 'ajanda' && (
          <div className="inline-flex items-center gap-1">
            <button type="button" aria-label="Önceki" onClick={() => ileri(-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:text-kr"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setAnkur(new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate()))} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition hover:text-kr">Bugün</button>
            <button type="button" aria-label="Sonraki" onClick={() => ileri(1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:text-kr"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
        <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em]">{baslikMetni}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {turSekmeleri.map((t) => {
            const m = turMeta(t); const on = turlar.has(t)
            return (
              <button key={t} type="button" onClick={() => setTurlar((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition ${on || turlar.size === 0 ? 'border-border bg-surface text-foreground' : 'border-transparent bg-surface-muted text-muted-foreground'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${dotBg[m.tone]}`} /> {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {gorunum === 'ay' && <AyGorunum ankur={ankur} bugun={bugun} gunlukMap={gunlukMap} onSec={setSecili} />}
      {gorunum === 'hafta' && <HaftaGorunum ankur={ankur} bugun={bugun} gunlukMap={gunlukMap} onSec={setSecili} />}
      {gorunum === 'ajanda' && <AjandaGorunum bugun={bugun} etkinlikler={suzulu} onSec={setSecili} />}

      {secili && <EtkinlikModal e={secili} bugun={gunKey(bugun)} onKapat={() => setSecili(null)} />}
    </div>
  )
}

function Cip({ e, onSec }: { e: TakvimEtkinlik; onSec: (e: TakvimEtkinlik) => void }) {
  const m = turMeta(e.tur)
  return (
    <button type="button" onClick={() => onSec(e)} title={`${saat(e.baslar)} · ${e.baslik}`} className="flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] transition hover:bg-surface-muted">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotBg[m.tone]}`} />
      <span className="font-mono shrink-0 text-muted-foreground">{saat(e.baslar)}</span>
      <span className="truncate font-medium">{e.ozet.borclu ?? e.baslik}</span>
    </button>
  )
}

function AyGorunum({ ankur, bugun, gunlukMap, onSec }: { ankur: Date; bugun: Date; gunlukMap: Map<string, TakvimEtkinlik[]>; onSec: (e: TakvimEtkinlik) => void }) {
  const ilk = haftaBasi(ayBasi(ankur))
  const gunler = Array.from({ length: 42 }, (_, i) => gunEkle(ilk, i))
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-muted">
        {GUNLER.map((g) => <div key={g} className="font-mono px-2 py-2 text-center text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{g}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {gunler.map((d, i) => {
          const evs = gunlukMap.get(gunKey(d)) ?? []
          const ayDisi = d.getMonth() !== ankur.getMonth()
          const bugunMu = gunKey(d) === gunKey(bugun)
          return (
            <div key={i} className={`min-h-[104px] border-b border-r border-border-subtle p-1.5 ${ayDisi ? 'bg-surface-muted/30' : ''} ${i % 7 === 6 ? 'border-r-0' : ''}`}>
              <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${bugunMu ? 'bg-kr text-kr-foreground' : ayDisi ? 'text-muted-foreground/60' : 'text-foreground'}`}>{d.getDate()}</div>
              <div className="flex flex-col gap-0.5">
                {evs.slice(0, 3).map((e) => <Cip key={e.id} e={e} onSec={onSec} />)}
                {evs.length > 3 && <span className="px-1.5 text-[10.5px] font-semibold text-muted-foreground">+{evs.length - 3} daha</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HaftaGorunum({ ankur, bugun, gunlukMap, onSec }: { ankur: Date; bugun: Date; gunlukMap: Map<string, TakvimEtkinlik[]>; onSec: (e: TakvimEtkinlik) => void }) {
  const b = haftaBasi(ankur)
  const gunler = Array.from({ length: 7 }, (_, i) => gunEkle(b, i))
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {gunler.map((d, i) => {
        const evs = gunlukMap.get(gunKey(d)) ?? []
        const bugunMu = gunKey(d) === gunKey(bugun)
        return (
          <div key={i} className={`overflow-hidden rounded-xl border bg-surface shadow-card ${bugunMu ? 'border-kr/50' : 'border-border'}`}>
            <div className={`border-b border-border-subtle px-2.5 py-2 ${bugunMu ? 'bg-kr-soft' : 'bg-surface-muted'}`}>
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{GUNLER[i]}</div>
              <div className={`text-[15px] font-extrabold ${bugunMu ? 'text-kr-ink' : ''}`}>{d.getDate()}</div>
            </div>
            <div className="flex min-h-[80px] flex-col gap-1 p-1.5">
              {evs.length === 0 && <span className="px-1 py-2 text-[11px] text-muted-foreground/70">—</span>}
              {evs.map((e) => {
                const m = turMeta(e.tur)
                return (
                  <button key={e.id} type="button" onClick={() => onSec(e)} className="rounded-lg border border-border-subtle bg-surface-muted/40 p-1.5 text-left transition hover:border-kr/40">
                    <div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${dotBg[m.tone]}`} /><span className="font-mono text-[11px] font-bold text-kr-ink">{saat(e.baslar)}</span></div>
                    <div className="mt-0.5 truncate text-[11.5px] font-semibold">{e.ozet.borclu ?? e.baslik}</div>
                    <div className="font-mono truncate text-[10px] text-muted-foreground">{e.ozet.hukukNo}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AjandaGorunum({ bugun, etkinlikler, onSec }: { bugun: Date; etkinlikler: TakvimEtkinlik[]; onSec: (e: TakvimEtkinlik) => void }) {
  const esik = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate()).getTime()
  const ileri = etkinlikler.filter((e) => new Date(e.baslar).getTime() >= esik).sort((a, b) => a.baslar.localeCompare(b.baslar))
  const grup = new Map<string, TakvimEtkinlik[]>()
  for (const e of ileri) { const d = new Date(e.baslar); const k = gunKey(d); if (!grup.has(k)) grup.set(k, []); grup.get(k)!.push(e) }
  if (ileri.length === 0) return <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/30 px-7 py-14 text-center text-[13px] text-muted-foreground">Yaklaşan etkinlik yok.</div>
  return (
    <div className="flex flex-col gap-5">
      {[...grup.entries()].map(([k, evs]) => {
        const d = new Date(evs[0].baslar); const bugunMu = k === gunKey(bugun)
        return (
          <div key={k}>
            <div className="mb-2 flex items-baseline gap-2"><h3 className="font-display text-[15px] font-extrabold">{gunBaslik(d)}</h3>{bugunMu && <Badge tone="kr">bugün</Badge>}</div>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              {evs.map((e, i) => {
                const m = turMeta(e.tur)
                return (
                  <button key={e.id} type="button" onClick={() => onSec(e)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-muted/50 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                    <span className="font-mono w-[52px] shrink-0 text-center text-[14px] font-bold tabular-nums text-kr-ink">{saat(e.baslar)}</span>
                    <span className="h-9 w-px bg-border" />
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${m.tone === 'kr' ? 'bg-kr-soft text-kr-ink' : 'bg-surface-muted text-foreground'}`}><m.Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold">{e.ozet.borclu ?? e.baslik}</span><Badge tone={m.tone}>{m.label}</Badge></div>
                      <div className="font-mono flex items-center gap-1.5 truncate text-[11px] text-muted-foreground"><span className="font-bold text-foreground">{e.ozet.hukukNo}</span>{e.yer ? <> · {e.online ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />} {e.yer}</> : null}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EtkinlikModal({ e, bugun, onKapat }: { e: TakvimEtkinlik; bugun: string; onKapat: () => void }) {
  const m = turMeta(e.tur)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [duzenle, setDuzenle] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function sil() {
    if (typeof window !== 'undefined' && !window.confirm('Bu etkinliği silmek istiyor musunuz? Bu işlem geri alınamaz.')) return
    const fd = new FormData(); fd.set('id', e.id)
    start(async () => { await etkinlikSil(fd); onKapat(); router.refresh() })
  }
  function kaydet(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget); fd.set('id', e.id)
    if (!String(fd.get('baslik') ?? '').trim()) { setErr('Başlık gerekli.'); return }
    if (!String(fd.get('baslar') ?? '').trim()) { setErr('Başlangıç tarih & saatini seçin.'); return }
    setErr(null)
    start(async () => { await etkinlikGuncelle(fd); onKapat(); router.refresh() })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onKapat}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface shadow-float" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className={`grid h-9 w-9 place-items-center rounded-[11px] ${m.tone === 'kr' ? 'bg-kr-soft text-kr-ink' : 'bg-surface-muted text-foreground'}`}><m.Icon className="h-[18px] w-[18px]" /></span>
            <div>
              <div className="flex items-center gap-2"><h3 className="font-display text-[15.5px] font-extrabold">{duzenle ? 'Etkinliği düzenle' : e.baslik}</h3><Badge tone={m.tone}>{m.label}</Badge></div>
              <div className="font-mono text-[11.5px] text-muted-foreground">{new Date(e.baslar).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })}{e.yer ? ` · ${e.yer}` : ''}</div>
            </div>
          </div>
          <button type="button" aria-label="Kapat" onClick={onKapat} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"><X className="h-4 w-4" /></button>
        </div>

        {duzenle ? (
          <form onSubmit={kaydet} className="flex flex-col gap-3.5 px-5 py-4">
            <div><label className={LBL}>Başlık</label><input name="baslik" defaultValue={e.baslik} className={INP} /></div>
            <div><label className={LBL}>Tür</label>
              <select name="tur" defaultValue={e.tur} className={INP}>
                {TUR_SECENEK.map((t) => <option key={t.val} value={t.val}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className={LBL}>Başlangıç (tarih & saat)</label><input type="datetime-local" name="baslar" step={60} defaultValue={toLocalInput(e.baslar)} className={INP} /></div>
              <div><label className={LBL}>Bitiş (ops.)</label><input type="datetime-local" name="biter" step={60} defaultValue={e.biter ? toLocalInput(e.biter) : ''} className={INP} /></div>
            </div>
            <div><label className={LBL}>Yer</label><input name="yer" defaultValue={e.yer ?? ''} placeholder="adliye / büro / online" className={INP} /></div>
            <label className="flex items-center gap-2 text-[12.5px] text-foreground"><input type="checkbox" name="online" defaultChecked={e.online} className="h-4 w-4 rounded border-border text-kr focus:ring-kr/40" /> Online görüşme/duruşma</label>
            {err && <p className="text-[12px] text-danger">{err}</p>}
            <div className="mt-1 flex items-center justify-end gap-2 border-t border-border-subtle pt-3.5">
              <button type="button" onClick={() => { setDuzenle(false); setErr(null) }} className="rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">Vazgeç</button>
              <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Kaydet</button>
            </div>
          </form>
        ) : (
          <div className="px-5 py-4">
            <div className="font-mono mb-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Dosya künyesi</div>
            <DosyaOzet data={e.ozet} bugun={bugun} />
            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => { setDuzenle(true); setErr(null) }} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr"><Pencil className="h-3.5 w-3.5" /> Düzenle</button>
                <button type="button" onClick={sil} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[10px] border border-danger/30 bg-danger-soft/40 px-3 py-2 text-[12.5px] font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Sil</button>
              </div>
              <Link href={`/akilli-giris/${e.dosyaId}`} className="inline-flex items-center gap-1.5 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90">Dosyaya git <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
