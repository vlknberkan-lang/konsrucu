'use client'

/**
 * KonsRücü — Yeni dosya yükle (ingest) paneli · components/akilli-giris/ingest-panel.tsx
 * Sürükle-bırak dropzone → katmanlı işleme animasyonu (0-3, ucuz katman önce) → "kayıt oluştu".
 * autoStart: "Yeni dosya yükle" (sidebar, ?yukle=1) ile gelindiğinde otomatik başlar.
 *
 * Gerçek entegrasyon (TODO):
 *  - onDrop'taki dosyaları Supabase Storage'a yükleyin (ham evrak).
 *  - Çıkarım worker'ını (PyMuPDF/EXIF/regex + gerekirse LLM) tetikleyin; ilerlemeyi
 *    websocket/poll ile bağlayın (buradaki sahte interval yerine).
 *  - Bittiğinde oluşan RucuDosyasi id'sine yönlendirin.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UploadCloud, Loader2, Check, FolderCheck, X, ArrowRight,
} from 'lucide-react'

type Layer = { tag: string; free: boolean; label: string; sub: string }
const LAYERS: Layer[] = [
  { tag: '0', free: true, label: 'Metin çıkar', sub: 'PyMuPDF · dijital PDF metin katmanı / yerel OCR' },
  { tag: '1', free: true, label: 'Kural + Regex', sub: 'plaka · poliçe/hasar no · tarih · tutar · IBAN · T.C.' },
  { tag: '2', free: true, label: 'Grupla & route', sub: 'EXIF tarih · kamera · boyut → belge/foto + klasör' },
  { tag: '3', free: false, label: 'Boş alan → LLM', sub: 'yalnız kusur/oluş şekli net değilse · Haiku (birkaç kuruş)' },
]
const ACCEPT = ['PDF', 'JPG / HEIC', 'PNG', 'DOCX', 'ZIP klasör']

export function IngestPanel({ autoStart = false }: { autoStart?: boolean }) {
  const router = useRouter()
  const [phase, setPhase] = useState<'idle' | 'proc' | 'done'>('idle')
  const [hot, setHot] = useState(false)
  const [active, setActive] = useState(-1)
  const [pct, setPct] = useState(0)
  const timers = useRef<ReturnType<typeof setInterval>[]>([])

  const clearTimers = () => { timers.current.forEach(clearInterval); timers.current = [] }
  useEffect(() => () => clearTimers(), [])

  function run() {
    if (phase === 'proc') return
    setPhase('proc'); setActive(0); setPct(0)
    let step = 0
    const stepIv = setInterval(() => {
      step++
      if (step < LAYERS.length) setActive(step)
      else clearInterval(stepIv)
    }, 720)
    const pctIv = setInterval(() => {
      setPct((p) => {
        if (p >= 100) { clearInterval(pctIv); setActive(LAYERS.length); setTimeout(() => setPhase('done'), 350); return 100 }
        return p + 4
      })
    }, 110)
    timers.current.push(stepIv, pctIv)
  }

  useEffect(() => { if (autoStart) run() /* eslint-disable-next-line */ }, [autoStart])

  // ── bitti ──
  if (phase === 'done') {
    return (
      <div className="mb-[22px] flex items-center gap-3.5 rounded-2xl border border-success/40 bg-gradient-to-br from-success-soft/50 to-surface p-5">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-success-soft text-success"><FolderCheck className="h-[22px] w-[22px]" /></div>
        <div className="flex-1">
          <div className="font-display text-base font-extrabold">Yığın gruplandı — 1 yeni rücu kaydı oluştu</div>
          <div className="font-mono mt-0.5 text-[11px] text-muted-foreground">3 PDF · 39 foto · 8 alan çıkarıldı · ₺ 0 API maliyeti · 5 alan teyit bekliyor</div>
        </div>
        {/* TODO: oluşan dosyanın gerçek id'sine yönlendirin */}
        <button onClick={() => router.push('/akilli-giris/10202409588')} className="inline-flex items-center gap-1.5 rounded-[9px] bg-kr px-3 py-1.5 text-xs font-semibold text-white shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:brightness-95">
          <ArrowRight className="h-3.5 w-3.5" /> Kaydı aç
        </button>
        <button onClick={() => setPhase('idle')} aria-label="Kapat" className="grid h-[34px] w-[34px] place-items-center rounded-[9px] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    )
  }

  // ── işleniyor ──
  if (phase === 'proc') {
    return (
      <div className="mb-[22px] overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
          <Loader2 className="h-[17px] w-[17px] animate-spin text-kr" />
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">Yığın işleniyor — ucuz katman önce</h3>
          <span className="font-mono ml-auto text-[11px] font-semibold text-muted-foreground">%{pct}</span>
        </div>
        <div className="px-5 pb-5 pt-1">
          {LAYERS.map((L, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-3 transition-opacity last:border-0" style={{ opacity: i > active ? 0.4 : 1 }}>
              <span className={`font-mono grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-[10px] font-bold ${L.free ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{L.tag}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  {L.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${L.free ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{L.free ? '0 ₺ · yerel' : 'kuruş · LLM'}</span>
                </div>
                <div className="font-mono mt-0.5 text-[10.5px] text-muted-foreground">{L.sub}</div>
              </div>
              {i < active ? <Check className="h-4 w-4 text-success" />
                : i === active ? <Loader2 className="h-[15px] w-[15px] animate-spin text-kr" />
                : <span className="font-mono text-[10px] text-muted-foreground">bekliyor</span>}
            </div>
          ))}
          <div className="mt-3.5 h-[5px] overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-kr transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    )
  }

  // ── boşta: dropzone ──
  return (
    <div
      onClick={run}
      onDragOver={(e) => { e.preventDefault(); setHot(true) }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => { e.preventDefault(); setHot(false); run() /* TODO: e.dataTransfer.files'i yükle */ }}
      className={`group relative mb-[22px] cursor-pointer overflow-hidden rounded-[18px] border-2 border-dashed px-7 py-10 text-center transition ${
        hot ? 'border-kr bg-kr-soft/50 shadow-[inset_0_0_0_4px_hsl(var(--kr)/0.14)]' : 'border-border bg-surface-muted/50 hover:border-kr hover:bg-kr-soft/50'
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--kr)/0.04)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--kr)/0.04)_1px,transparent_1px)] bg-[length:26px_26px] transition-opacity ${hot ? 'opacity-100' : 'opacity-0'}`} />
      <div className="relative">
        <div className={`mx-auto mb-3.5 grid h-16 w-16 place-items-center rounded-[18px] bg-kr/[0.12] text-kr transition ${hot ? '-translate-y-0.5 scale-105' : ''}`}>
          <UploadCloud className="h-7 w-7" />
        </div>
        <div className="font-display text-[19px] font-extrabold tracking-[-0.02em]">Hasar dosyasının ham evrak yığınını buraya bırakın</div>
        <div className="mt-1.5 text-[13px] text-muted-foreground">Poliçe · ekspertiz · tutanak · dekont + 100+ fotoğraf — hepsi tek seferde. Sistem otomatik gruplar.</div>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {ACCEPT.map((t) => (
            <span key={t} className="font-mono rounded-md border border-border bg-surface px-2 py-1 text-[10px] tracking-[0.04em] text-muted-foreground">{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
