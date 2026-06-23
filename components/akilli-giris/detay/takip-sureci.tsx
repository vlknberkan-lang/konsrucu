'use client'

/**
 * KonsRücü — Dosya Detay · UYAP takip izleme + zaman çizelgesi.
 * UYAP senkronundan gelen durum (açık/kapalı) + finansal snapshot + son senkron;
 * takip olayları (tebliğ/itiraz/tahsilat…) ve UYAP'tan inen evraklar tek kronolojik akışta;
 * manuel olay/not eklenebilir. Veri: TakipOlayi + RucuDosyasi.uyap* + Belge(kaynakRef).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, Loader2, AlertTriangle, Banknote, Gavel, Scale, FileCheck, FileText, ExternalLink, RefreshCw, CircleDot } from 'lucide-react'
import { olayEkle, olaySil, belgeAc } from '@/app/(app)/akilli-giris/actions'

const TIPLER: [string, string][] = [['TEBLIG', 'Tebliğ edildi'], ['ITIRAZ', 'İtiraz'], ['KESINLESTI', 'Kesinleşti'], ['TAHSILAT', 'Tahsilat'], ['HACIZ', 'Haciz'], ['KAPANDI', 'Kapandı'], ['DURUM', 'Durum / not']]
const ETIKET: Record<string, string> = Object.fromEntries(TIPLER)
const SURE_PIPE: [string, string][] = [['TAKIP_ACILDI', 'Takip Açıldı'], ['TEBLIG_EDILDI', 'Tebliğ'], ['KESINLESTI', 'Kesinleşti'], ['TAHSIL', 'Tahsilat'], ['KAPANDI', 'Kapandı']]
const STEP: Record<string, number> = { TAKIP_ACILDI: 0, TEBLIG_EDILDI: 1, ITIRAZ: 1, KESINLESTI: 2, TAHSIL: 3, KAPANDI: 4 }

export type OlayUI = { id: string; tip: string; tarih: string | null; tutar: number | null; aciklama: string | null }
export type EvrakUI = { id: string; dosyaAdi: string; kategori: string; t: string; acilabilir: boolean }
export type UyapHesap = { asilAlacak?: number | null; islemisFaiz?: number | null; tahsilat?: number | null; bakiye?: number | null }
export type UyapBilgi = { durum: string | null; sonSenkron: string | null; hesap: UyapHesap | null }

const money = (n: number) => '₺ ' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('tr-TR') : '')
const fmtDateTime = (s: string) => new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** UYAP durum metnini açık/kapalı koduna çevir (serbest metin: "AÇIK", "kapandı"…). */
function acikKapali(d: string | null): { label: string; tone: 'success' | 'danger' | 'steel' } | null {
  if (!d) return null
  const s = d.toLocaleLowerCase('tr')
  if (/kapal|kapan|düş|infaz tamam/.test(s)) return { label: d, tone: 'danger' }
  if (/açık|acik|derdest|devam/.test(s)) return { label: d, tone: 'success' }
  return { label: d, tone: 'steel' }
}

type Feed =
  | { kind: 'olay'; id: string; t: number; tarih: string | null; tip: string; tutar: number | null; aciklama: string | null }
  | { kind: 'evrak'; id: string; t: number; tarih: string; dosyaAdi: string; kategori: string; acilabilir: boolean }

export function TakipSureci({
  dosyaId,
  durum,
  olaylar,
  bakiye,
  uyap,
  evraklar = [],
  kicker = '4 · TAKİP SÜRECİ',
}: {
  dosyaId: string
  durum: string
  olaylar: OlayUI[]
  bakiye: { toplam: number; tahsil: number; kalan: number }
  uyap?: UyapBilgi
  evraklar?: EvrakUI[]
  kicker?: string
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [silen, setSilen] = useState<string | null>(null)
  const [acan, setAcan] = useState<string | null>(null)
  const [tip, setTip] = useState('TEBLIG')
  const router = useRouter()
  const step = STEP[durum] ?? 0
  const itiraz = durum === 'ITIRAZ'

  function ekle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setErr(null)
    start(async () => { const r = await olayEkle(fd); if (r.ok) { form.reset(); setTip('TEBLIG'); router.refresh() } else setErr(r.error ?? 'Eklenemedi') })
  }
  async function sil(id: string) {
    if (!window.confirm('Olay silinsin mi?')) return
    setSilen(id); const r = await olaySil(id); setSilen(null); if (r.ok) router.refresh()
  }
  async function ac(belgeId: string) {
    setAcan(belgeId)
    const r = await belgeAc(belgeId)
    setAcan(null)
    if (r.ok && r.url) window.open(r.url, '_blank', 'noopener')
    else setErr(r.error ?? 'Belge açılamadı')
  }

  // takip olayları + UYAP evrakları → tek kronolojik akış (yeni → eski)
  const feed: Feed[] = [
    ...olaylar.map((o): Feed => ({ kind: 'olay', id: o.id, t: o.tarih ? new Date(o.tarih).getTime() : 0, tarih: o.tarih, tip: o.tip, tutar: o.tutar, aciklama: o.aciklama })),
    ...evraklar.map((e): Feed => ({ kind: 'evrak', id: e.id, t: new Date(e.t).getTime(), tarih: e.t, dosyaAdi: e.dosyaAdi, kategori: e.kategori, acilabilir: e.acilabilir })),
  ].sort((a, b) => b.t - a.t)

  const durumEt = acikKapali(uyap?.durum ?? null)
  const h = uyap?.hesap ?? null
  const hesapVar = !!h && (h.asilAlacak != null || h.islemisFaiz != null || h.tahsilat != null || h.bakiye != null)
  const uyapVar = !!uyap && (!!uyap.durum || !!uyap.sonSenkron || hesapVar)
  const INP = 'rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15'

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-start gap-[14px] border-b border-border-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{kicker}</div>
          <h2 className="font-display mt-1 text-[17px] font-extrabold tracking-[-0.025em]">İcra Takibi İzleme</h2>
        </div>
        {itiraz && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-[3px] text-[11px] font-semibold text-warning"><AlertTriangle className="h-3 w-3" />İtiraz var</span>}
      </div>

      {/* UYAP senkron özeti — durum (açık/kapalı) + son senkron + finansal snapshot */}
      {uyapVar && (
        <div className="border-b border-border-subtle bg-surface-muted/30 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">UYAP</span>
            {durumEt ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold ${durumEt.tone === 'success' ? 'bg-success-soft text-success' : durumEt.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-muted text-muted-foreground'}`}>
                <CircleDot className="h-3.5 w-3.5" /> {durumEt.label}
              </span>
            ) : (
              <span className="text-[12px] text-muted-foreground">Henüz durum okunmadı</span>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <RefreshCw className="h-3 w-3" /> {uyap?.sonSenkron ? `son senkron · ${fmtDateTime(uyap.sonSenkron)}` : 'senkron bekleniyor'}
            </span>
          </div>
          {hesapVar && (
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['Asıl alacak', h!.asilAlacak], ['İşlemiş faiz', h!.islemisFaiz], ['Tahsilat', h!.tahsilat], ['Bakiye', h!.bakiye]] as [string, number | null | undefined][]).map(([lbl, v]) => (
                <div key={lbl} className="rounded-[10px] border border-border-subtle bg-surface p-2.5">
                  <div className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">{lbl}</div>
                  <div className={`font-mono mt-0.5 text-[13px] font-bold tabular-nums ${lbl === 'Bakiye' ? 'text-kr-ink' : lbl === 'Tahsilat' ? 'text-success' : 'text-foreground'}`}>{v != null ? money(Number(v)) : '—'}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[10.5px] text-muted-foreground">UYAP rakamları eklenti senkronundan okunur (bilgi amaçlı); aşağıdaki bakiye bizim faiz hesabımızdır.</div>
        </div>
      )}

      <div className="px-5 py-[18px]">
        {/* süreç pipeline */}
        <div className="mb-4 flex items-center overflow-x-auto">
          {SURE_PIPE.map(([k, l], i) => {
            const done = i < step, now = i === step
            return (
              <span key={k} className="flex items-center">
                {i > 0 && <span className={`h-[2px] w-6 ${i <= step ? 'bg-success' : 'bg-border'}`} />}
                <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-[5px] ${now ? 'bg-kr-soft' : ''}`}>
                  <span className={`font-mono grid h-[20px] w-[20px] place-items-center rounded-full border text-[10px] font-semibold ${done ? 'border-success bg-success text-white' : now ? 'border-kr bg-kr text-white' : 'border-border bg-surface-muted text-muted-foreground'}`}>{done ? <Check className="h-3 w-3" /> : i + 1}</span>
                  <span className={`text-[12px] font-semibold ${done ? 'text-foreground' : now ? 'text-kr-ink' : 'text-muted-foreground'}`}>{l}</span>
                </span>
              </span>
            )
          })}
        </div>

        {/* bakiye (bizim hesap) */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {([['Toplam talep', bakiye.toplam, 'text-foreground'], ['Tahsil edilen', bakiye.tahsil, 'text-success'], ['Kalan bakiye', bakiye.kalan, bakiye.kalan > 0 ? 'text-kr-ink' : 'text-success']] as [string, number, string][]).map(([lbl, v, cls]) => (
            <div key={lbl} className="rounded-xl border border-border-subtle bg-surface-muted/40 p-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{lbl}</div>
              <div className={`font-mono mt-1 text-[15px] font-bold ${cls}`}>{money(v)}</div>
            </div>
          ))}
        </div>

        {/* olay ekle */}
        <form onSubmit={ekle} className="mb-4 rounded-xl border border-border-subtle bg-surface-muted/30 p-3">
          <input type="hidden" name="dosyaId" value={dosyaId} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select name="tip" value={tip} onChange={(e) => setTip(e.target.value)} className={INP}>{TIPLER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input name="tarih" type="date" className={INP} />
            <input name="tutar" type="number" step="0.01" placeholder="Tutar ₺ (tahsilat)" disabled={tip !== 'TAHSILAT'} className={`${INP} font-mono disabled:opacity-50`} />
            <input name="aciklama" placeholder="Açıklama (ops.)" className={INP} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-[9px] bg-kr px-3 py-1.5 text-[12.5px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Olay ekle</button>
            {err && <span className="text-[11.5px] text-danger">{err}</span>}
          </div>
        </form>

        {/* zaman çizelgesi — takip olayları + gelen UYAP evrakları */}
        {feed.length === 0 ? (
          <div className="text-[13px] text-muted-foreground">Henüz takip olayı/evrak yok. Tebliğ / itiraz / tahsilat ve UYAP'tan inen evraklar burada kronolojik görünür (manuel ya da eklenti senkronu).</div>
        ) : (
          <ol className="space-y-2.5">
            {feed.map((o) => o.kind === 'evrak' ? (
              <li key={`e-${o.id}`} className="flex items-start gap-3 rounded-[11px] border border-border-subtle bg-surface p-[10px_12px]">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-info-soft text-info"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-bold">Evrak geldi</span>
                    <span className="font-mono rounded-full bg-surface-muted px-1.5 py-[1px] text-[9.5px] uppercase text-muted-foreground">{o.kategori}</span>
                    <span className="font-mono ml-auto text-[10.5px] text-muted-foreground">{fmtDate(o.tarih)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{o.dosyaAdi}</div>
                </div>
                {o.acilabilir && (
                  <button onClick={() => ac(o.id)} disabled={acan === o.id} aria-label="Evrağı aç" className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr-ink disabled:opacity-60">{acan === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />} Aç</button>
                )}
              </li>
            ) : (
              <li key={o.id} className="flex items-start gap-3 rounded-[11px] border border-border-subtle bg-surface p-[10px_12px]">
                <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ${o.tip === 'TAHSILAT' ? 'bg-success-soft text-success' : o.tip === 'ITIRAZ' ? 'bg-warning-soft text-warning' : o.tip === 'KAPANDI' ? 'bg-muted text-muted-foreground' : 'bg-kr-soft text-kr-ink'}`}>
                  {o.tip === 'TAHSILAT' ? <Banknote className="h-4 w-4" /> : o.tip === 'ITIRAZ' ? <AlertTriangle className="h-4 w-4" /> : o.tip === 'KESINLESTI' ? <Scale className="h-4 w-4" /> : o.tip === 'HACIZ' ? <Gavel className="h-4 w-4" /> : <FileCheck className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-bold">{ETIKET[o.tip] ?? o.tip}</span>
                    {o.tutar != null && <span className="font-mono text-[12px] font-semibold text-success">{money(o.tutar)}</span>}
                    <span className="font-mono ml-auto text-[10.5px] text-muted-foreground">{fmtDate(o.tarih)}</span>
                  </div>
                  {o.aciklama && <div className="mt-0.5 text-[12px] text-muted-foreground">{o.aciklama}</div>}
                </div>
                <button onClick={() => sil(o.id)} disabled={silen === o.id} aria-label="Sil" className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition hover:text-danger disabled:opacity-60">{silen === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
