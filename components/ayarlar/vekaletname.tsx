'use client'

/**
 * KonsRücü — Şirket Bilgileri · Vekaletname (TÜM dosyalarda ortak tek belge).
 * Tarayıcıdan 'evrak' bucket'ına yükler, yolu Ayarlar'a kaydeder. Aç / değiştir / kaldır.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, Loader2, ExternalLink, Trash2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { vekaletnameKaydet, vekaletnameAc, vekaletnameSil } from '@/app/(app)/ayarlar/actions'

export function Vekaletname({ musteriId, init }: { musteriId: string; init: { ad: string | null; yuklu: boolean } }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [acan, setAcan] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function yukle(list: FileList | null) {
    const f = list?.[0]
    if (!f) return
    setBusy(true); setErr(null); setOk(false)
    try {
      const supa = createClient()
      const safe = f.name.replace(/[^\w.\-]+/g, '_').slice(0, 80)
      const sp = `vekaletname/${musteriId}/${crypto.randomUUID()}-${safe}`
      const { error } = await supa.storage.from('evrak').upload(sp, f, { contentType: f.type || 'application/octet-stream', upsert: false })
      if (error) { setErr('Yükleme hatası: ' + error.message); return }
      const r = await vekaletnameKaydet(musteriId, sp, f.name)
      if (r.ok) { setOk(true); router.refresh() } else setErr(r.error ?? 'Kaydedilemedi')
    } catch (e) {
      setErr('Hata: ' + (e as Error).message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function ac() {
    if (acan) return
    const w = window.open('', '_blank')
    setAcan(true); setErr(null)
    try {
      const r = await vekaletnameAc(musteriId)
      if (r.ok && r.url) { if (w) w.location.href = r.url } else { if (w) w.close(); setErr(r.error ?? 'Açılamadı') }
    } finally { setAcan(false) }
  }

  async function kaldir() {
    setBusy(true); setErr(null)
    try { const r = await vekaletnameSil(musteriId); if (r.ok) router.refresh(); else setErr(r.error ?? 'Kaldırılamadı') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => yukle(e.target.files)} />
      {init.yuklu ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/50 p-[11px_14px]">
          <span className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-kr"><FileText className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold">{init.ad ?? 'Vekaletname'}</div>
            <div className="text-[11.5px] text-success">Yüklü · tüm dosyalarda ortak kullanılır</div>
          </div>
          <button type="button" onClick={ac} disabled={acan} className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr disabled:opacity-60">{acan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />} Aç</button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:border-kr/40 disabled:opacity-60">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Değiştir</button>
          <button type="button" onClick={kaldir} disabled={busy} aria-label="Vekaletnameyi kaldır" className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-border text-muted-foreground transition hover:border-danger/40 hover:text-danger disabled:opacity-60"><Trash2 className="h-4 w-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex w-full items-center gap-3 rounded-xl border-[1.5px] border-dashed border-border bg-surface-muted/40 p-[14px_16px] text-left transition hover:border-kr/50 disabled:opacity-60">
          <span className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground">{busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Upload className="h-[18px] w-[18px]" />}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-foreground">{busy ? 'Yükleniyor…' : 'Vekaletname yükle'}</div>
            <div className="text-[11.5px] text-muted-foreground">PDF/görsel · bir kez yüklenir, tüm dosyalarda kullanılır</div>
          </div>
        </button>
      )}
      {ok && <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-success"><Check className="h-3.5 w-3.5" /> Kaydedildi.</p>}
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
    </div>
  )
}
