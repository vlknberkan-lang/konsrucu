'use client'

/**
 * KonsRücü — Atanan Dosyalar · filtre çubuğu · components/atanan-dosyalar/filtre-bar.tsx
 * Aşama sekmeleri (ana) + çekildi dropdown (ikincil) + arama + sıralama + Excel export → tümü URL
 * parametrelerine yazılır (server yeniden sorgular). Aşama, dosya.durum'dan türetilir (lib/konsrucu/map).
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'
import { Search, X, FileDown } from 'lucide-react'
import { ASAMA_SIRA, ASAMA_META } from '@/lib/konsrucu/asama'

const SIRA = [
  ['yeni', 'En yeni'],
  ['zamanasimi', 'Zaman aşımı yakın'],
  ['tutar', 'Dava miktarı'],
  ['atanma', 'Atanma tarihi'],
] as const

export function FiltreBar({
  q,
  asama,
  cekildi,
  sort,
  za = 'all',
  asamaSayim,
  cekildiSayim,
}: {
  q: string
  asama: string
  cekildi: string
  sort: string
  za?: string
  asamaSayim: Record<string, number>
  cekildiSayim: { all: number; evet: number; hayir: number }
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

  // aşama sekmeleri: Tümü + 5 evre + Kapalı
  const asamaSekmeler: [string, string][] = [['all', 'Tümü'], ...ASAMA_SIRA.map((k) => [k, ASAMA_META[k].label] as [string, string])]

  return (
    <div className="mb-4 flex flex-col gap-3">
      {/* aşama sekmeleri (ana filtre) */}
      <div className="-mx-1 flex overflow-x-auto px-1 pb-0.5">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
          {asamaSekmeler.map(([id, label]) => {
            const n = asamaSayim[id] ?? 0
            const aktif = asama === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => guncelle({ asama: id === 'all' ? null : id })}
                aria-pressed={aktif}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none ${
                  aktif ? 'bg-surface text-kr shadow-card' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label} <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
            placeholder="Hukuk no · hasar no · sigortalı · telefon · birim · avukat…"
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

        {/* çekildi (ikincil filtre — dropdown) */}
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          Çekildi
          <select
            value={cekildi}
            onChange={(e) => guncelle({ cekildi: e.target.value === 'all' ? null : e.target.value })}
            className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground outline-none transition focus-visible:border-kr/50 focus-visible:ring-2 focus-visible:ring-kr/30 motion-reduce:transition-none"
          >
            <option value="all">Tümü · {cekildiSayim.all}</option>
            <option value="hayir">Bekleyen · {cekildiSayim.hayir}</option>
            <option value="evet">Çekilen · {cekildiSayim.evet}</option>
          </select>
        </label>

        {/* zamanaşımı radarı — boş tarihli dosyalar radar DIŞINDA kalır, buradan yakalanır */}
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          Zamanaşımı
          <select
            value={za}
            onChange={(e) => guncelle({ za: e.target.value === 'all' ? null : e.target.value })}
            className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-foreground outline-none transition focus-visible:border-kr/50 focus-visible:ring-2 focus-visible:ring-kr/30 motion-reduce:transition-none"
          >
            <option value="all">Tümü</option>
            <option value="bos">Boş (girilmemiş)</option>
            <option value="yakin">≤ 30 gün</option>
            <option value="gecti">Geçti</option>
          </select>
        </label>

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

        {/* Excel'e aktar — o anki filtre/aramayı export route'una taşır */}
        <a
          href={`${pathname}/export${sp.toString() ? `?${sp.toString()}` : ''}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-foreground shadow-card transition hover:border-kr/40 hover:text-kr-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none"
          title="Görünen listeyi Excel olarak indir (aşamaya göre renkli)"
        >
          <FileDown className="h-4 w-4 text-kr" /> Excel'e aktar
        </a>
      </div>
    </div>
  )
}
