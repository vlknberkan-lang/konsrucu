'use client'

/**
 * KonsRücü — Atanan Dosyalar · "İcra Eşleştir (Excel)"
 * Excel'de hukuk no + icra no + icra dairesi → hukuk no ile eşleşen dosyalara icra bilgisi yazar.
 */
import { useRef, useState } from 'react'
import { FileSpreadsheet, Loader2, Check, X, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { icraEslestir } from '@/app/(app)/akilli-giris/actions'

export function IcraEslestirButton() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [sonuc, setSonuc] = useState<{ eslesen: number; bulunamayan: string[]; toplam: number } | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function gonder() {
    const f = fileRef.current?.files?.[0]
    if (!f) { setHata('Önce bir Excel seçin.'); return }
    setPending(true); setHata(null); setSonuc(null)
    const fd = new FormData(); fd.append('file', f)
    try {
      const r = await icraEslestir(fd)
      if (r.ok) { setSonuc({ eslesen: r.eslesen, bulunamayan: r.bulunamayan, toplam: r.toplam }); router.refresh() }
      else setHata(r.hata ?? 'Eşleştirme başarısız')
    } catch (e) { setHata((e as Error).message) }
    setPending(false)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-foreground transition hover:border-kr/40 hover:text-kr">
        <FileSpreadsheet className="h-4 w-4" /> İcra Eşleştir (Excel)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-float" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
              <h3 className="font-display text-[16px] font-extrabold">İcra Eşleştir · Excel</h3>
              <button type="button" aria-label="Kapat" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4">
              <p className="mb-3 text-[12.5px] text-muted-foreground">Excel'de <b className="text-foreground">hukuk no</b>, <b className="text-foreground">icra no</b> ve <b className="text-foreground">icra dairesi</b> kolonları olsun. Hukuk no ile eşleşen dosyalara icra bilgisi yazılır, İcra aşaması başlatılır.</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="w-full rounded-[10px] border border-dashed border-border bg-surface-muted/40 px-3 py-3 text-[12.5px] file:mr-3 file:rounded-md file:border-0 file:bg-kr file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-kr-foreground" />

              {hata && <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-danger"><AlertTriangle className="h-3.5 w-3.5" /> {hata}</div>}
              {sonuc && (
                <div className="mt-3 rounded-[11px] border border-success/30 bg-success-soft/40 px-3 py-2.5 text-[12.5px]">
                  <div className="flex items-center gap-1.5 font-semibold text-success"><Check className="h-4 w-4" /> {sonuc.eslesen}/{sonuc.toplam} satır eşleşti</div>
                  {sonuc.bulunamayan.length > 0 && <div className="mt-1 text-muted-foreground">Bulunamayan ({sonuc.bulunamayan.length}): {sonuc.bulunamayan.slice(0, 6).join(', ')}{sonuc.bulunamayan.length > 6 ? '…' : ''}</div>}
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">Kapat</button>
                <button type="button" onClick={gonder} disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Eşleştir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
