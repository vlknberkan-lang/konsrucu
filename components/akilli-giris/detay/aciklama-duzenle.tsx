'use client'

/**
 * KonsRücü — Dosya Detay · UYAP takip AÇIKLAMASINI elle düzenle (insan kontrolü).
 * Avukat metni serbest düzeltir ya da güncel alanlardan "Şablondan üret" ile yeniden doldurur.
 * Kaydetme cikarimJson.aciklama'yı günceller (aciklamaGuncelle) ve avukat onayını sıfırlar.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2, Wand2 } from 'lucide-react'
import { aciklamaUret } from '@/lib/konsrucu/takip'
import { aciklamaGuncelle } from '@/app/(app)/akilli-giris/actions'

type Alan = { kazaTarihi: string; sigortaliPlaka: string; karsiPlaka: string; alacakliUnvan: string }

export function AciklamaDuzenle({ dosyaId, init, alan }: { dosyaId: string; init: string; alan: Alan }) {
  const [edit, setEdit] = useState(false)
  const [metin, setMetin] = useState(init)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function kaydet() {
    setErr(null)
    start(async () => {
      const r = await aciklamaGuncelle(dosyaId, metin.trim())
      if (r.ok) { setEdit(false); router.refresh() } else setErr(r.error ?? 'Kaydedilemedi')
    })
  }

  if (!edit) {
    return (
      <div className="mt-2">
        {init.trim()
          ? <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-foreground">{init}</pre>
          : <p className="text-[12.5px] italic text-muted-foreground">Açıklama henüz yok — “Düzenle” ile yazın ya da şablondan üretin.</p>}
        <button type="button" onClick={() => { setMetin(init); setEdit(true) }} className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
          <Pencil className="h-3.5 w-3.5" /> Açıklamayı düzenle
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-xl border border-kr/30 bg-kr-soft/20 p-3">
      <textarea
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        rows={5}
        className="w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 font-sans text-[12.5px] leading-relaxed outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15"
        placeholder="UYAP takip açıklaması (footer otomatik eklenir)…"
      />
      {err && <p className="mt-1.5 text-[12px] text-danger">{err}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={kaydet} disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Kaydet
        </button>
        <button type="button" onClick={() => setMetin(aciklamaUret(alan))} className="inline-flex items-center gap-1.5 rounded-[10px] border border-kr/30 bg-surface px-3 py-2 text-[12.5px] font-semibold text-kr-ink transition hover:bg-kr-soft/50" title="Güncel alanlardan (kaza tarihi, plakalar) standart kalıpla yeniden üret">
          <Wand2 className="h-4 w-4" /> Şablondan üret
        </button>
        <button type="button" onClick={() => { setEdit(false); setErr(null) }} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">
          <X className="h-4 w-4" /> Vazgeç
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">Footer otomatik · kaydedince onay sıfırlanır</span>
      </div>
    </div>
  )
}
