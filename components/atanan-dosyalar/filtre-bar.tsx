'use client'

/**
 * KonsRücü — Atanan Dosyalar · filtre çubuğu · components/atanan-dosyalar/filtre-bar.tsx
 * Çekildi sekmeleri + arama + sıralama → tümü URL parametrelerine yazılır (server yeniden sorgular).
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

const CEKILDI = [
  ['all', 'Tümü'],
  ['hayir', 'Bekleyen'],
  ['evet', 'Çekilen'],
] as const

const SIRA = [
  ['yeni', 'En yeni'],
  ['zamanasimi', 'Zaman aşımı yakın'],
  ['tutar', 'Dava miktarı'],
  ['atanma', 'Atanma tarihi'],
] as const

export function FiltreBar({
  q,
  cekildi,
  sort,
  sayim,
}: {
  q: string
  cekildi: string
  sort: string
  sayim: { all: number; evet: number; hayir: number }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function guncelle(yeni: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(yeni)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    const qs = p.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // arama: yazdıkça filtrele (debounce). Enter da anında uygular.
  const [val, setVal] = useState(q)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function araDegis(v: string) {
    setVal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => guncelle({ q: v.trim() || null }), 350)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* çekildi sekmeleri */}
      <div className="inline-flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
        {CEKILDI.map(([id, label]) => {
          const n = id === 'all' ? sayim.all : id === 'evet' ? sayim.evet : sayim.hayir
          const aktif = cekildi === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => guncelle({ cekildi: id === 'all' ? null : id })}
              aria-pressed={aktif}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none ${
                aktif ? 'bg-surface text-kr shadow-card' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label} <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
            </button>
          )
        })}
      </div>

      {/* arama (yazdıkça filtreler; Enter anında uygular) */}
      <form
        className="relative min-w-[230px] flex-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (timer.current) clearTimeout(timer.current)
          guncelle({ q: val.trim() || null })
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          value={val}
          onChange={(e) => araDegis(e.target.value)}
          aria-label="Dosyalarda ara"
          placeholder="Hukuk no · hasar no · sigortalı · birim · avukat…"
          className="w-full rounded-[10px] border border-border bg-surface py-2.5 pl-9 pr-9 text-[13px] outline-none transition focus-visible:border-kr/50 focus-visible:ring-2 focus-visible:ring-kr/30 motion-reduce:transition-none"
        />
        {val && (
          <button
            type="button"
            aria-label="Aramayı temizle"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current)
              setVal('')
              guncelle({ q: null })
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* sıralama */}
      <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        Sırala
        <select
          value={sort}
          onChange={(e) => guncelle({ sort: e.target.value === 'yeni' ? null : e.target.value })}
          className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground outline-none transition focus-visible:border-kr/50 focus-visible:ring-2 focus-visible:ring-kr/30 motion-reduce:transition-none"
        >
          {SIRA.map(([id, l]) => (
            <option key={id} value={id}>{l}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
