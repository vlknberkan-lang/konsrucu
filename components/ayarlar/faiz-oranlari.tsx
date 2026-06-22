'use client'

/** KonsRücü — Şirket Bilgileri · dönemsel faiz oranları editörü (faizJson). */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, Loader2 } from 'lucide-react'
import { faizOranlariKaydet } from '@/app/(app)/ayarlar/actions'

type Row = { baslangic: string; oran: string }

export function FaizOranlari({ musteriId, init }: { musteriId: string; init: { baslangic: string; oran: number }[] }) {
  const [rows, setRows] = useState<Row[]>(init.length ? init.map((o) => ({ baslangic: o.baslangic, oran: String(o.oran) })) : [{ baslangic: '', oran: '' }])
  const [pending, start] = useTransition()
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()
  const set = (i: number, p: Partial<Row>) => setRows((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))

  function kaydet() {
    setErr(null); setOk(false)
    const temiz = rows.filter((r) => r.baslangic && r.oran !== '').map((r) => ({ baslangic: r.baslangic, oran: Number(r.oran) }))
    start(async () => { const r = await faizOranlariKaydet(musteriId, temiz); if (r.ok) { setOk(true); router.refresh() } else setErr(r.error ?? 'Kaydedilemedi') })
  }

  const INP = 'rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15'
  return (
    <div>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="date" value={r.baslangic} onChange={(e) => set(i, { baslangic: e.target.value })} className={INP} />
            <div className="relative">
              <input type="number" step="0.01" value={r.oran} onChange={(e) => set(i, { oran: e.target.value })} placeholder="oran" className={`${INP} w-28 pr-7 font-mono`} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
            </div>
            <button type="button" aria-label="Sil" onClick={() => setRows((s) => s.filter((_, j) => j !== i))} className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-border text-muted-foreground transition hover:border-danger/40 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRows((s) => [...s, { baslangic: '', oran: '' }])} className="inline-flex items-center gap-1.5 rounded-[9px] border border-dashed border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-foreground"><Plus className="h-3.5 w-3.5" /> Dönem ekle</button>
        <button type="button" onClick={kaydet} disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Oranları kaydet</button>
        {ok && <span className="text-[12px] font-medium text-success">Kaydedildi.</span>}
        {err && <span className="text-[12px] text-danger">{err}</span>}
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">Her satır, <b>başlangıç tarihinden</b> itibaren geçerli <b>yıllık</b> orandır (bir sonraki döneme kadar). Oran ve tarihleri kendi mevzuatınıza göre doğrulayın.</p>
    </div>
  )
}
