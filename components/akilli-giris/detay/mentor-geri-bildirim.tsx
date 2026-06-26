'use client'

/**
 * KonsRücü — Dosya Detay · Mentor geri bildirimi (öğrenme döngüsü).
 * AI'ın "Önerilen Adımlar" / "Riskler ve Öneriler" çıktısını avukat düzeltir → kural tenant'a yazılır
 * (mentorKuralEkle) → sonraki çıkarımlarda sistem promptuna enjekte edilir. Manuel MVP (AI damıtma yok).
 * KALDIR = bu tarz öneriyi bir daha verme · DUZELT = öneri şöyle olmalı.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, X, Loader2, Ban, Pencil } from 'lucide-react'
import { mentorKuralEkle } from '@/app/(app)/akilli-giris/actions'

export function MentorGeriBildirim({
  dosyaId,
  kaynak,
  hedef,
  olayTuru,
}: {
  dosyaId: string
  kaynak: 'ADIM' | 'TEYIT'
  hedef: string
  olayTuru: string | null
}) {
  const [acik, setAcik] = useState(false)
  const [tur, setTur] = useState<'KALDIR' | 'DUZELT'>('KALDIR')
  const [yorum, setYorum] = useState('')
  // olayTuru varsa güvenli varsayılan: yalnız bu türde (over-generalize etme). Yoksa zaten tüm dosyalar.
  const [yalniz, setYalniz] = useState<boolean>(!!olayTuru)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ogrenildi, setOgrenildi] = useState(false)
  const router = useRouter()

  function kaydet() {
    setErr(null)
    start(async () => {
      const r = await mentorKuralEkle({ dosyaId, kaynak, tur, hedef, yorum: yorum.trim(), geneleUygula: !(yalniz && olayTuru) })
      if (r.ok) { setOgrenildi(true); setAcik(false); router.refresh() } else setErr(r.error ?? 'Kaydedilemedi')
    })
  }

  if (ogrenildi) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-success">
        <GraduationCap className="h-3.5 w-3.5" /> Mentor öğrendi
      </span>
    )
  }

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        title="Bu öneriyi düzelt — mentor bir daha aynı hatayı yapmasın"
        className="mt-1 inline-flex items-center gap-1 rounded-[7px] border border-transparent px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground transition hover:border-border hover:text-kr-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/40"
      >
        <GraduationCap className="h-3.5 w-3.5" /> Mentor'a öğret
      </button>
    )
  }

  const seg = (v: 'KALDIR' | 'DUZELT', Icon: typeof Ban, lbl: string) => (
    <button
      type="button"
      onClick={() => setTur(v)}
      className={`inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[11.5px] font-semibold transition ${tur === v ? 'border-kr bg-kr-soft text-kr-ink' : 'border-border bg-surface text-muted-foreground hover:text-foreground'}`}
    >
      <Icon className="h-3.5 w-3.5" /> {lbl}
    </button>
  )

  return (
    <div className="mt-2 rounded-[11px] border border-kr/30 bg-kr-soft/15 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {seg('KALDIR', Ban, 'Bunu bir daha önerme')}
        {seg('DUZELT', Pencil, 'Şöyle olmalı')}
      </div>
      <textarea
        value={yorum}
        onChange={(e) => setYorum(e.target.value)}
        rows={2}
        autoFocus
        placeholder={tur === 'KALDIR' ? 'Neden? (ops.) Örn. “Bizde böyle bir adım yok.”' : 'Bunun yerine ne öne? Örn. “Sigortalıyı arayıp dosyayı şöyle takip et.”'}
        className="mt-2 w-full resize-y rounded-[9px] border border-border bg-surface px-3 py-2 text-[12px] leading-[1.5] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15"
      />
      {olayTuru && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11.5px] text-muted-foreground">
          <input type="checkbox" checked={yalniz} onChange={(e) => setYalniz(e.target.checked)} className="h-3.5 w-3.5 accent-[hsl(var(--kr))]" />
          <span>Yalnız bu olay türünde geçerli — <b className="text-foreground">{olayTuru}</b> <span className="text-muted-foreground">(işaretsiz = tüm dosyalar)</span></span>
        </label>
      )}
      {err && <p className="mt-1.5 text-[11.5px] text-danger">{err}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={kaydet} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[9px] bg-kr px-3 py-1.5 text-[12px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />} Öğret
        </button>
        <button type="button" onClick={() => { setAcik(false); setErr(null) }} className="inline-flex items-center gap-1.5 rounded-[9px] border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground">
          <X className="h-3.5 w-3.5" /> Vazgeç
        </button>
        <span className="ml-auto text-[10.5px] text-muted-foreground">Şirket Bilgileri → Mentor kuralları'nda yönetilir</span>
      </div>
    </div>
  )
}
