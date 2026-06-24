'use client'

/**
 * KonsRücü — Dosya Detay · Belge önizleme modalı (program içi).
 * belgeAc ile imzalı URL alır; PDF → iframe, foto → img olarak büyük modalda gösterir.
 * Hem ana Evrak bölümü hem UYAP Takip Süreci evrak akışı bunu kullanır (yeni sekme yerine inline).
 */
import { useEffect, useState } from 'react'
import { X, Loader2, ExternalLink, AlertTriangle, FileText, Image as ImageIcon } from 'lucide-react'
import { belgeAc } from '@/app/(app)/akilli-giris/actions'

export type OnizlemeBelge = { id: string; dosyaAdi: string }

const isImg = (ad: string) => /\.(jpe?g|png|webp|gif|tiff?|bmp|heic)$/i.test(ad)

export function BelgeOnizleme({ belge, onKapat }: { belge: OnizlemeBelge | null; onKapat: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)

  // belge değişince imzalı URL'i çek
  useEffect(() => {
    if (!belge) { setUrl(null); setHata(null); return }
    let iptal = false
    setYukleniyor(true); setHata(null); setUrl(null)
    belgeAc(belge.id)
      .then((r) => { if (iptal) return; if (r?.ok && r.url) setUrl(r.url); else setHata(r?.error ?? 'Belge açılamadı'); setYukleniyor(false) })
      .catch((e) => { if (!iptal) { setHata((e as Error).message); setYukleniyor(false) } })
    return () => { iptal = true }
  }, [belge])

  // ESC ile kapat
  useEffect(() => {
    if (!belge) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onKapat() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [belge, onKapat])

  if (!belge) return null
  const img = isImg(belge.dosyaAdi)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/70 p-3 sm:p-6" onClick={onKapat}>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-kr-soft text-kr-ink">{img ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
            <span className="truncate font-mono text-[12.5px] font-semibold" title={belge.dosyaAdi}>{belge.dosyaAdi}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-[8px] border border-border px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr"><ExternalLink className="h-3.5 w-3.5" /> Yeni sekme</a>}
            <button type="button" onClick={onKapat} aria-label="Kapat" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="relative flex-1 bg-surface-muted/40">
          {yukleniyor && <div className="absolute inset-0 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-kr" /></div>}
          {hata && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div><AlertTriangle className="mx-auto h-6 w-6 text-danger" /><p className="mt-2 text-[13px] text-danger">{hata}</p></div>
            </div>
          )}
          {url && !hata && (
            img
              ? <div className="flex h-full items-center justify-center overflow-auto p-2"><img src={url} alt={belge.dosyaAdi} className="max-h-full max-w-full object-contain" /></div>
              : <iframe src={url} title={belge.dosyaAdi} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </div>
  )
}
