'use client'

/**
 * KonsRücü — "Takip görevi ekle" (tetikleyici buton + modal).
 * Etkinlik modalından (etkinlikId + varsayılan başlık dolu), dosya detayından ve /gorevler'den kullanılır.
 * Sorumlu seçilirse kaydedince ona ANLIK mail gider (takipGoreviKaydet → mailGonder).
 */
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ListPlus, X, Loader2, Check } from 'lucide-react'
import { takipGoreviKaydet } from '@/app/(app)/gorevler/actions'

export type GorevKullanici = { id: string; ad: string; rol: string }

const INP = 'w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'

export function GorevEkle({
  dosyaId,
  kullanicilar,
  etkinlikId,
  varsayilanBaslik = '',
  varsayilanAciklama = '',
  varsayilanSonTarih = '',
  label = 'Görev Ekle',
  variant = 'primary',
  onEklendi,
}: {
  dosyaId: string
  kullanicilar: GorevKullanici[]
  etkinlikId?: string
  varsayilanBaslik?: string
  varsayilanAciklama?: string
  varsayilanSonTarih?: string
  label?: string
  variant?: 'primary' | 'ghost'
  onEklendi?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()
  const overlayDown = useRef(false)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('dosyaId', dosyaId)
    if (etkinlikId) fd.set('etkinlikId', etkinlikId)
    if (!String(fd.get('baslik') ?? '').trim()) { setErr('Görev başlığı gerekli.'); return }
    setErr(null)
    start(async () => {
      const r = await takipGoreviKaydet(fd)
      if (!r.ok) { setErr(r.error ?? 'Kaydedilemedi.'); return }
      setOpen(false)
      onEklendi?.()
      router.refresh()
    })
  }

  const triggerCls =
    variant === 'primary'
      ? 'inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-kr px-3.5 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90'
      : 'inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr'

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setErr(null) }} className={triggerCls}>
        <ListPlus className="h-4 w-4" /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
          onMouseDown={(e) => { overlayDown.current = e.target === e.currentTarget }}
          onClick={(e) => { if (overlayDown.current && e.target === e.currentTarget) setOpen(false); overlayDown.current = false }}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface shadow-float">
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-kr-soft text-kr-ink"><ListPlus className="h-[18px] w-[18px]" /></span>
                <h3 className="font-display text-[16px] font-extrabold">Takip görevi ekle</h3>
              </div>
              <button type="button" aria-label="Kapat" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3.5 px-5 py-4">
              <div><label className={LBL}>Görev</label><input name="baslik" defaultValue={varsayilanBaslik} placeholder="ör. Arabulucuyla iletişime geç, yeni gün ata" className={INP} autoFocus /></div>
              <div><label className={LBL}>Açıklama (ops.)</label><textarea name="aciklama" defaultValue={varsayilanAciklama} rows={3} placeholder="Ne yapılmalı, hangi adımlar…" className={`${INP} resize-y`} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className={LBL}>Son tarih (ops.)</label><input type="datetime-local" name="sonTarih" step={60} defaultValue={varsayilanSonTarih} className={INP} /></div>
                <div>
                  <label className={LBL}>Sorumlu</label>
                  <select name="sorumluId" defaultValue="" className={INP}>
                    <option value="">— (atama yok)</option>
                    {kullanicilar.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
                  </select>
                </div>
              </div>
              <p className="-mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Check className="h-3.5 w-3.5 text-kr-ink" /> Sorumlu seçilirse görev atandığında ona anında e-posta gönderilir.</p>

              {err && <p className="text-[12px] text-danger">{err}</p>}

              <div className="mt-1 flex items-center justify-end gap-2 border-t border-border-subtle pt-3.5">
                <button type="button" onClick={() => setOpen(false)} className="rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">Vazgeç</button>
                <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />} Görevi ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
