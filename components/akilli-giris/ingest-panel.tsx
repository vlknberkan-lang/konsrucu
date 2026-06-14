'use client'

/**
 * KonsRücü — Yeni dosya yükle (ingest) paneli · components/akilli-giris/ingest-panel.tsx
 *
 * GERÇEK yerel çıkarım (mock YOK). Sürüklenen dosyalar tarayıcıda işlenir — sunucuya gitmeden:
 *  [0] METİN  : pdf.js ile dijital PDF metin katmanı
 *  [1] REGEX  : plaka · T.C. · tarih · tutar · IBAN  (çıkarılan metin + dosya adı)
 *  [2] ROUTE  : görsel boyut + EXIF (tarih/kamera) → belge(A4) / hasar fotoğrafı ayrımı
 * Maliyet ₺0 (tamamı yerel). [3] LLM (kusur/oluş şekli) ve kayıt/Storage backend'i sonraki adım.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, FileText, Image as ImageIcon, File as FileIcon, Loader2, Check, X, RotateCcw, FolderCheck } from 'lucide-react'
import { dosyaOlustur } from '@/app/(app)/akilli-giris/actions'

type Kind = 'pdf' | 'belge' | 'foto' | 'diger'
type Row = {
  name: string
  size: number
  kind: Kind
  w?: number
  h?: number
  exifDate?: string
  kamera?: string
  textLen?: number
  err?: boolean
}
type Alanlar = { plaka: string[]; tc: string[]; tarih: string[]; tutar: string[]; iban: string[] }

const ACCEPT = '.pdf,image/*,.docx,.zip'
const KIND_META: Record<Kind, { label: string; icon: typeof FileText; cls: string }> = {
  pdf: { label: 'PDF', icon: FileText, cls: 'bg-danger-soft text-danger' },
  belge: { label: 'Belge (A4)', icon: FileText, cls: 'bg-info-soft text-info' },
  foto: { label: 'Fotoğraf', icon: ImageIcon, cls: 'bg-success-soft text-success' },
  diger: { label: 'Diğer', icon: FileIcon, cls: 'bg-muted text-muted-foreground' },
}

const RX = {
  plaka: /\b(0[1-9]|[1-7]\d|8[01])\s?[A-Z]{1,3}\s?\d{2,4}\b/g,
  tc: /\b[1-9]\d{10}\b/g,
  tarih: /\b\d{1,2}[.\/]\d{1,2}[.\/]\d{4}\b/g,
  tutar: /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g,
  iban: /\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi,
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function imgDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url) }
    img.src = url
  })
}

function collect(text: string, acc: Record<keyof Alanlar, Set<string>>) {
  for (const m of text.matchAll(RX.plaka)) acc.plaka.add(m[0].replace(/\s+/g, ' ').toUpperCase().trim())
  for (const m of text.matchAll(RX.tc)) acc.tc.add(m[0])
  for (const m of text.matchAll(RX.tarih)) acc.tarih.add(m[0])
  for (const m of text.matchAll(RX.tutar)) acc.tutar.add(m[0])
  for (const m of text.matchAll(RX.iban)) acc.iban.add(m[0].replace(/\s+/g, ''))
}

export function IngestPanel({ autoStart = false }: { autoStart?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hot, setHot] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'ready' | 'proc' | 'done'>('idle')
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [alanlar, setAlanlar] = useState<Alanlar | null>(null)
  const [pct, setPct] = useState(0)
  const [saving, setSaving] = useState(false)
  const [hasarNo, setHasarNo] = useState('')
  const router = useRouter()

  // "Yeni dosya yükle"den gelindiyse dosya seçiciyi aç (otomatik SAHTE işlem YOK).
  useEffect(() => { if (autoStart) inputRef.current?.click() }, [autoStart])

  function pick(list: FileList | null) {
    if (!list || list.length === 0) return
    setFiles(Array.from(list))
    setPhase('ready')
  }

  async function isle() {
    if (files.length === 0) return
    setPhase('proc'); setPct(0); setRows([])

    const pdfjs: any = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
    const exifr: any = (await import('exifr')).default

    const acc: Record<keyof Alanlar, Set<string>> = {
      plaka: new Set(), tc: new Set(), tarih: new Set(), tutar: new Set(), iban: new Set(),
    }
    const out: Row[] = []
    let allText = ''

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const row: Row = { name: f.name, size: f.size, kind: 'diger' }
      const lower = f.name.toLowerCase()
      try {
        if (f.type === 'application/pdf' || lower.endsWith('.pdf')) {
          row.kind = 'pdf'
          const buf = await f.arrayBuffer()
          const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise
          let txt = ''
          const n = Math.min(doc.numPages, 15)
          for (let p = 1; p <= n; p++) {
            const page = await doc.getPage(p)
            const c = await page.getTextContent()
            txt += c.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' ') + '\n'
          }
          row.textLen = txt.length
          allText += ' ' + txt
          collect(txt, acc)
          try { await doc.destroy() } catch { /* yoksay */ }
        } else if (f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp|gif)$/.test(lower)) {
          const { w, h } = await imgDims(f)
          row.w = w; row.h = h
          const ex = await exifr.parse(f, ['DateTimeOriginal', 'Make', 'Model']).catch(() => null)
          if (ex?.DateTimeOriginal) { try { row.exifDate = new Date(ex.DateTimeOriginal).toLocaleDateString('tr-TR') } catch { /* */ } }
          const kam = [ex?.Make, ex?.Model].filter(Boolean).join(' ').trim()
          if (kam) row.kamera = kam
          const aspect = w && h ? h / w : 0
          // dikey ~A4 + büyük = belge taraması; aksi halde hasar fotoğrafı
          row.kind = aspect > 1.2 && aspect < 1.75 && Math.max(w, h) > 1000 ? 'belge' : 'foto'
          collect(f.name, acc)
        } else {
          row.kind = 'diger'
        }
      } catch {
        row.err = true
      }
      out.push(row)
      setRows([...out])
      setPct(Math.round(((i + 1) / files.length) * 100))
    }

    const fnames = files.map((f) => f.name).join(' ')
    const labeled = allText.match(/hasar\s*(?:dosya)?\s*(?:no|nu)?\s*[:\-]?\s*(\d{8,13})/i)
    const fnum = fnames.match(/\b(\d{10,13})\b/)
    setHasarNo((labeled?.[1] || fnum?.[1] || '').trim())
    setAlanlar({
      plaka: [...acc.plaka], tc: [...acc.tc], tarih: [...acc.tarih], tutar: [...acc.tutar], iban: [...acc.iban],
    })
    setPhase('done')
  }

  function reset() {
    setFiles([]); setRows([]); setAlanlar(null); setPct(0); setPhase('idle'); setHasarNo('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function kaydet() {
    setSaving(true)
    try {
      const payload = {
        hasarNo: hasarNo || undefined,
        alanlar: alanlar ?? { plaka: [], tc: [], tarih: [], tutar: [], iban: [] },
        dosyalar: rows.map((r) => ({ name: r.name, kind: r.kind, w: r.w, h: r.h, exifDate: r.exifDate, kamera: r.kamera, textLen: r.textLen })),
      }
      const { id } = await dosyaOlustur(payload)
      router.push(`/akilli-giris/${id}`)
    } catch {
      setSaving(false)
    }
  }

  const count = (k: Kind) => rows.filter((r) => r.kind === k).length

  return (
    <div className="mb-[22px]">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />

      {/* ── boşta: dropzone ── */}
      {phase === 'idle' && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setHot(true) }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => { e.preventDefault(); setHot(false); pick(e.dataTransfer.files) }}
          className={`group relative cursor-pointer overflow-hidden rounded-[18px] border-2 border-dashed px-7 py-10 text-center transition ${
            hot ? 'border-kr bg-kr-soft/50 shadow-[inset_0_0_0_4px_hsl(var(--kr)/0.14)]' : 'border-border bg-surface-muted/50 hover:border-kr hover:bg-kr-soft/50'
          }`}
        >
          <div className={`pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--kr)/0.04)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--kr)/0.04)_1px,transparent_1px)] bg-[length:26px_26px] transition-opacity ${hot ? 'opacity-100' : 'opacity-0'}`} />
          <div className="relative">
            <div className={`mx-auto mb-3.5 grid h-16 w-16 place-items-center rounded-[18px] bg-kr/[0.12] text-kr transition ${hot ? '-translate-y-0.5 scale-105' : ''}`}>
              <UploadCloud className="h-7 w-7" />
            </div>
            <div className="font-display text-[19px] font-extrabold tracking-[-0.02em]">Hasar dosyasının ham evrak yığınını buraya bırakın</div>
            <div className="mt-1.5 text-[13px] text-muted-foreground">Poliçe · ekspertiz · tutanak · dekont + fotoğraflar — birden çok dosya seçin. Çıkarım tarayıcınızda yapılır (₺0).</div>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {['PDF', 'JPG / PNG', 'HEIC', 'DOCX'].map((t) => (
                <span key={t} className="font-mono rounded-md border border-border bg-surface px-2 py-1 text-[10px] tracking-[0.04em] text-muted-foreground">{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── seçildi: dosya listesi + İşle ── */}
      {phase === 'ready' && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
            <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">{files.length} dosya seçildi</h3>
            <span className="font-mono ml-auto text-[11px] text-muted-foreground">{fmtSize(files.reduce((s, f) => s + f.size, 0))}</span>
          </div>
          <div className="max-h-72 overflow-y-auto px-5 py-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b border-border-subtle py-2 text-[13px] last:border-0">
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{fmtSize(f.size)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 border-t border-border-subtle px-5 py-4">
            <button onClick={isle} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-sm font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90">
              <UploadCloud className="h-4 w-4" /> İşle — yerel · ₺0
            </button>
            <button onClick={reset} className="text-sm font-medium text-muted-foreground transition hover:text-foreground">Vazgeç</button>
          </div>
        </div>
      )}

      {/* ── işleniyor / bitti: gerçek sonuçlar ── */}
      {(phase === 'proc' || phase === 'done') && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center gap-2.5 border-b border-border-subtle px-5 py-4">
            {phase === 'proc' ? <Loader2 className="h-[17px] w-[17px] animate-spin text-kr" /> : <Check className="h-[17px] w-[17px] text-success" />}
            <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">
              {phase === 'proc' ? 'Yerel çıkarım sürüyor…' : 'Çıkarım tamam — tamamı tarayıcıda, ₺0'}
            </h3>
            <span className="font-mono ml-auto text-[11px] font-semibold text-muted-foreground">%{pct}</span>
            {phase === 'done' && (
              <button onClick={reset} className="ml-2 inline-flex items-center gap-1.5 rounded-[9px] border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5" /> Yeni yığın
              </button>
            )}
          </div>

          {/* özet sayımlar (gerçek) */}
          <div className="flex flex-wrap gap-2 px-5 pt-4">
            {(['pdf', 'belge', 'foto', 'diger'] as Kind[]).map((k) => {
              const c = count(k)
              if (c === 0) return null
              const M = KIND_META[k]
              return (
                <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${M.cls}`}>
                  <M.icon className="h-3.5 w-3.5" /> {c} {M.label}
                </span>
              )
            })}
          </div>

          {/* çıkarılan alanlar (gerçek regex) */}
          {alanlar && (
            <div className="grid grid-cols-1 gap-3 px-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {([
                ['Plaka', alanlar.plaka], ['T.C. No', alanlar.tc], ['Tarih', alanlar.tarih],
                ['Tutar', alanlar.tutar], ['IBAN', alanlar.iban],
              ] as [string, string[]][]).map(([lbl, vals]) => (
                <div key={lbl} className="rounded-xl border border-border-subtle bg-surface-muted/40 p-3">
                  <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{lbl} · {vals.length}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {vals.length === 0 && <span className="text-[12px] text-muted-foreground">—</span>}
                    {vals.slice(0, 6).map((v) => (
                      <span key={v} className="font-mono rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px]">{v}</span>
                    ))}
                    {vals.length > 6 && <span className="text-[11px] text-muted-foreground">+{vals.length - 6}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* dosya satırları (gerçek sınıflandırma) */}
          <div className="max-h-72 overflow-y-auto px-5 pb-3 pt-4">
            {rows.map((r, i) => {
              const M = KIND_META[r.kind]
              return (
                <div key={i} className="flex items-center gap-3 border-b border-border-subtle py-2.5 text-[13px] last:border-0">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ${M.cls}`}><M.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="font-mono hidden shrink-0 text-[10.5px] text-muted-foreground sm:block">
                    {r.kind === 'pdf' && r.textLen != null ? `${r.textLen.toLocaleString('tr-TR')} kar.` : ''}
                    {(r.kind === 'foto' || r.kind === 'belge') && r.w ? `${r.w}×${r.h}${r.exifDate ? ' · ' + r.exifDate : ''}${r.kamera ? ' · ' + r.kamera : ''}` : ''}
                  </span>
                  {r.err
                    ? <X className="h-4 w-4 shrink-0 text-danger" />
                    : <Check className="h-4 w-4 shrink-0 text-success" />}
                </div>
              )
            })}
          </div>

          {phase === 'done' && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle bg-surface-muted/40 px-5 py-4">
              <button onClick={kaydet} disabled={saving} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90 disabled:opacity-60">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Dosya oluşturuluyor…</> : <><FolderCheck className="h-4 w-4" /> Dosyayı oluştur &amp; aç</>}
              </button>
              <span className="text-[11.5px] text-muted-foreground">Kayıt + belgeler DB'ye yazılır → Dosya Detay açılır. (Kusur/oluş için LLM · Katman 3 sıradaki.)</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
