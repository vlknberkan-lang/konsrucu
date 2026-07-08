'use client'

/**
 * KonsRücü — Atanan Dosyalar · ÇEKİM KUYRUĞU · components/atanan-dosyalar/cekim-kuyrugu.tsx
 * Hugo'dan çekilmeyi bekleyen (hugodanCekildi=false) dosyaları ZAMANAŞIMI EN YAKINDAN listeler; çoklu
 * seçip TEK tıkla "çekildi" işaretler (→ İnceleniyor). Kapasite matematiği: birikimi ZA öncelikli erit.
 * Katlanır (varsayılan kapalı) — sayfadaki tabloyu bastırmaz; açınca backlog aracı olur.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Loader2, ChevronDown, AlertTriangle } from 'lucide-react'
import { cekildiTopluIsaretle } from '@/app/(app)/atanan-dosyalar/actions'
import { tarihTR, kalanGun } from '@/lib/konsrucu/format'
import { Badge, type Tone } from '@/components/konsrucu/ui'

export type KuyrukDosya = { id: string; hukukDosyaNo: string; sigortaliUnvan: string | null; zamanasimi: string | null }

function zaMeta(iso: string | null): { label: string; tone: Tone } {
  if (!iso) return { label: 'ZA yok', tone: 'steel' }
  const d = new Date(iso)
  const g = kalanGun(d)
  if (g < 0) return { label: `${tarihTR(d)} · geçti`, tone: 'danger' }
  if (g <= 30) return { label: `${tarihTR(d)} · ${g}g`, tone: 'danger' }
  if (g <= 90) return { label: `${tarihTR(d)} · ${g}g`, tone: 'warning' }
  return { label: tarihTR(d), tone: 'steel' }
}

const MINI = 'rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-50'

export function CekimKuyrugu({ dosyalar, toplamBekleyen }: { dosyalar: KuyrukDosya[]; toplamBekleyen: number }) {
  const [acik, setAcik] = useState(false)
  const [secili, setSecili] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  if (toplamBekleyen === 0) return null

  const tumuSecili = dosyalar.length > 0 && secili.size === dosyalar.length
  function toggle(id: string) {
    setSecili((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function enYakinN(n: number) { setSecili(new Set(dosyalar.slice(0, n).map((d) => d.id))) }
  function tumunuSec() { setSecili(tumuSecili ? new Set() : new Set(dosyalar.map((d) => d.id))) }

  function isaretle() {
    if (!secili.size) return
    setErr(null)
    start(async () => {
      const r = await cekildiTopluIsaretle({ dosyaIds: [...secili] })
      if (r.ok) { setSecili(new Set()); router.refresh() } else setErr(r.error ?? 'İşlem tamamlanamadı')
    })
  }

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-warning/30 bg-warning-soft/20">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        className="flex w-full items-center gap-2.5 px-5 py-3 text-left transition hover:bg-warning-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/40"
      >
        <Download className="h-4 w-4 shrink-0 text-kr" />
        <span className="font-display text-[14px] font-bold">Çekim Kuyruğu</span>
        <span className="font-mono text-[12px] text-muted-foreground"><b className="text-warning">{toplamBekleyen}</b> dosya bekliyor · zamanaşımı en yakından</span>
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${acik ? 'rotate-180' : ''} motion-reduce:transition-none`} />
      </button>

      {acik && (
        <div className="border-t border-warning/20 px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => enYakinN(10)} className={MINI}>En yakın 10&apos;u seç</button>
            <button type="button" onClick={() => enYakinN(5)} className={MINI}>5</button>
            <button type="button" onClick={tumunuSec} className={MINI}>{tumuSecili ? 'Seçimi kaldır' : `Görünen ${dosyalar.length} dosyayı seç`}</button>
            <span className="ml-auto text-[12px] text-muted-foreground"><b className="text-foreground">{secili.size}</b> seçili</span>
          </div>

          <div className="max-h-[360px] space-y-1 overflow-y-auto pr-0.5">
            {dosyalar.map((d) => {
              const za = zaMeta(d.zamanasimi)
              const s = secili.has(d.id)
              return (
                <label
                  key={d.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-[12.5px] transition ${s ? 'border-kr/40 bg-kr/[0.06]' : 'border-border-subtle bg-surface hover:border-border'}`}
                >
                  <input type="checkbox" checked={s} onChange={() => toggle(d.id)} className="h-4 w-4 shrink-0 accent-kr" aria-label={`${d.hukukDosyaNo} seç`} />
                  <Link
                    href={`/akilli-giris/${d.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono shrink-0 font-bold text-foreground transition hover:text-kr hover:underline"
                  >
                    {d.hukukDosyaNo}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.sigortaliUnvan ?? '—'}</span>
                  <Badge tone={za.tone} dot={za.tone === 'danger' || za.tone === 'warning'}>
                    <span className="font-mono text-[10.5px]">{za.label}</span>
                  </Badge>
                </label>
              )
            })}
          </div>

          {toplamBekleyen > dosyalar.length && (
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              İlk {dosyalar.length} gösteriliyor (ZA en yakın). İşaretledikçe kalan {toplamBekleyen - dosyalar.length} dosya yenilenir.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={isaretle}
              disabled={pending || secili.size === 0}
              className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground shadow-[0_1px_5px_hsl(var(--kr)/0.3)] transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Seçilenleri çekildi işaretle{secili.size ? ` (${secili.size})` : ''}
            </button>
            <span className="text-[11.5px] text-muted-foreground">Çekilen dosyalar <b className="text-foreground">İnceleniyor</b>&apos;a geçer.</span>
            {err && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-danger"><AlertTriangle className="h-3.5 w-3.5" /> {err}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
