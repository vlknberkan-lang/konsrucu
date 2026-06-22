'use client'

/** KonsRücü — Dosya Detay · zaman çizelgesine not ekleme. */
import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { notEkle } from '@/app/(app)/akilli-giris/actions'

export function NotForm({ dosyaId, init }: { dosyaId: string; init: string }) {
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await notEkle(fd)
        ref.current?.reset()
      }}
      className="mb-[18px] flex items-start gap-[9px]"
    >
      <input type="hidden" name="dosyaId" value={dosyaId} />
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-kr-soft font-display text-[12px] font-extrabold text-kr-ink">{init}</div>
      <input
        name="metin"
        required
        aria-label="Dosyaya not ekle"
        placeholder="Dosyaya not ekleyin…"
        className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15 motion-reduce:transition-none"
      />
      <button
        type="submit"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-kr px-3 py-2.5 text-[12.5px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none"
      >
        <Plus className="h-3.5 w-3.5" /> Ekle
      </button>
    </form>
  )
}
