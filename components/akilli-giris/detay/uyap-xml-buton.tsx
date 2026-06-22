'use client'

/**
 * KonsRücü — Dosya Detay · "UYAP Takip XML indir"
 * Server action ile dosyadan exchange.dtd uyumlu e-Takip XML'i üretir ve indirir.
 * Kullanıcı UYAP Avukat Portal → İcra Takibi → "Takip Açılış-XML"'e yükler; e-imza+harç orada (manuel).
 */
import { useState, useTransition } from 'react'
import { Download, Loader2, AlertTriangle } from 'lucide-react'
import { takipXmlOlustur } from '@/app/(app)/akilli-giris/actions'

export function UyapXmlButon({ dosyaId }: { dosyaId: string }) {
  const [pending, start] = useTransition()
  const [uyarilar, setUyarilar] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)

  function indir() {
    setErr(null)
    setUyarilar([])
    start(async () => {
      const r = await takipXmlOlustur(dosyaId)
      if (!r.ok || !r.xml) {
        setErr(r.error ?? 'XML üretilemedi')
        return
      }
      setUyarilar(r.uyarilar ?? [])
      const blob = new Blob([r.xml], { type: 'application/xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.fileName ?? 'takip.xml'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={indir}
        disabled={pending}
        title="UYAP'a yüklenecek e-Takip XML'ini indir (e-imza + harç UYAP'ta sizde)"
        className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] border border-kr/40 bg-kr/5 px-5 py-2.5 text-[13.5px] font-semibold text-kr-ink transition hover:bg-kr/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/40 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} UYAP Takip XML indir
      </button>
      {err && <span className="text-[12px] text-danger">{err}</span>}
      {uyarilar.length > 0 && (
        <ul className="space-y-0.5 rounded-[9px] border border-warning/30 bg-warning-soft/30 p-2 text-[11.5px] text-[hsl(var(--warning-fg))]">
          {uyarilar.map((u, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {u}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
