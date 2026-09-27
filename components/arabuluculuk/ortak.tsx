'use client'

/**
 * KonsRücü — arabuluculuk ve dava kartlarının ortak parçaları · components/arabuluculuk/ortak.tsx
 * Tasarım sistemi: components/konsrucu/ui.tsx token'ları (bg-surface, border-border, text-kr-ink …). Her kartta TEK
 * birincil eylem (`BirincilDugme`); diğerleri ikincil. Kişisel veri varsayılan maskeli (`MaskeliMetin`).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Eye, EyeOff, Loader2, AlertTriangle, Info } from 'lucide-react'
import { adMaskele } from '@/lib/konsrucu/dava/maske'

export const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'
export const INP = 'w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15 disabled:opacity-60'

export function Kart({ kicker, baslik, alt, sag, vurgu, children, id }: { kicker: string; baslik: string; alt?: string; sag?: React.ReactNode; vurgu?: 'uyari' | 'tehlike'; children: React.ReactNode; id?: string }) {
  const cer = vurgu === 'tehlike' ? 'border-danger/40' : vurgu === 'uyari' ? 'border-warning/40' : 'border-border'
  return (
    <section id={id} className={`overflow-hidden rounded-2xl border ${cer} bg-surface shadow-card`}>
      <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{kicker}</div>
          <h2 className="font-display mt-0.5 text-[17px] font-extrabold tracking-[-0.02em]">{baslik}</h2>
          {alt && <p className="mt-1 max-w-[64ch] text-[12.5px] leading-[1.45] text-muted-foreground">{alt}</p>}
        </div>
        {sag && <div className="shrink-0">{sag}</div>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function BirincilDugme({ children, bekliyor, disabled, onClick, type = 'button' }: { children: React.ReactNode; bekliyor?: boolean; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || bekliyor} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none">
      {bekliyor && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function IkincilDugme({ children, bekliyor, disabled, onClick, type = 'button', tehlike }: { children: React.ReactNode; bekliyor?: boolean; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit'; tehlike?: boolean }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || bekliyor} className={`inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none ${tehlike ? 'hover:border-danger/50 hover:text-danger' : 'hover:border-kr/50 hover:text-kr-ink'}`}>
      {bekliyor && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function Mesaj({ tur, children }: { tur: 'hata' | 'uyari' | 'bilgi' | 'ok'; children: React.ReactNode }) {
  const cls = tur === 'hata' ? 'border-danger/30 bg-danger-soft/50 text-danger' : tur === 'uyari' ? 'border-warning/30 bg-warning-soft/50 text-[hsl(var(--warning-fg))]' : tur === 'ok' ? 'border-success/30 bg-success-soft/50 text-success' : 'border-border-subtle bg-surface-muted text-muted-foreground'
  const Ikon = tur === 'ok' ? Check : tur === 'bilgi' ? Info : AlertTriangle
  return (
    <div role={tur === 'hata' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-[10px] border px-3 py-2 text-[12.5px] leading-[1.45] ${cls}`}>
      <Ikon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** "teyit gerekli" hukuki etiketi. */
export function TeyitEtiketi({ metin = 'teyit gerekli' }: { metin?: string }) {
  return <span className="rounded-full bg-warning-soft px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(var(--warning-fg))]">{metin}</span>
}

/** Kayıt kaynağı/teyit rozeti (ADAY kayıt açıkça ayrışır). */
export function KaynakRozeti({ teyit, kaynakTuru }: { teyit: string; kaynakTuru?: string | null }) {
  const k = kaynakTuru === 'GERI_DOLDURMA' ? 'geri doldurma' : kaynakTuru === 'EXCEL' ? 'Excel' : kaynakTuru?.startsWith('UYAP') ? 'UYAP' : kaynakTuru === 'ELLE' ? 'elle' : kaynakTuru ?? ''
  const cls = teyit === 'ADAY' ? 'bg-warning-soft text-[hsl(var(--warning-fg))]' : teyit === 'REDDEDILDI' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${cls}`}>{teyit === 'ADAY' ? 'aday' : teyit === 'REDDEDILDI' ? 'reddedildi' : 'teyitli'}{k ? ` · ${k}` : ''}</span>
}

/** Kişisel veri: varsayılan maskeli; göz düğmesiyle açılır (yalnız bu ekranda, kayıt yok). */
export function MaskeliMetin({ deger, className = '' }: { deger: string | null | undefined; className?: string }) {
  const [acik, setAcik] = useState(false)
  if (!deger) return <span className={className}>—</span>
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{acik ? deger : adMaskele(deger)}</span>
      <button type="button" onClick={() => setAcik((x) => !x)} aria-label={acik ? 'Maskele' : 'Göster'} className="rounded p-0.5 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
        {acik ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </span>
  )
}

export function KopyaDugmesi({ metin, etiket = 'Kopyala' }: { metin: string; etiket?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(metin); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* pano yok */ } }}
      className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground"
    >
      {ok ? <><Check className="h-3.5 w-3.5 text-success" /> Kopyalandı</> : <><Copy className="h-3.5 w-3.5" /> {etiket}</>}
    </button>
  )
}

type AksiyonSonucu = { ok: boolean; error?: string } & Record<string, unknown>

/** Server action çağrısı: bekleme, hata, başarı ve sayfa tazeleme. */
export function useAksiyon() {
  const [bekliyor, basla] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const router = useRouter()
  function calistir<T extends AksiyonSonucu>(fn: () => Promise<T>, basari?: (r: T) => string | null | void) {
    setHata(null)
    setBilgi(null)
    basla(async () => {
      try {
        const r = await fn()
        if (!r.ok) { setHata(r.error ?? 'İşlem yapılamadı'); return }
        const m = basari?.(r)
        if (m) setBilgi(m)
        router.refresh()
      } catch (e) {
        setHata((e as Error).message || 'İşlem yapılamadı')
      }
    })
  }
  return { bekliyor, hata, bilgi, calistir, setHata }
}

/** ISO → "gg.aa.yyyy" (İstanbul). */
export function gunGoster(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('tr-TR', { timeZone: iso.length === 10 ? 'UTC' : 'Europe/Istanbul' })
}

/** ISO → "gg.aa.yyyy SS:DD" (İstanbul). */
export function anGoster(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const paraGoster = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'

/** Bugünün İstanbul günü (yyyy-aa-gg) — input max değeri için (varsayılan değer olarak KULLANILMAZ). */
export function bugunIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
