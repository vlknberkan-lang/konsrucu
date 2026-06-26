'use client'

/**
 * KonsRücü — Masraflar · filtre çubuğu · components/masraf/masraf-filtre.tsx
 * Arama + durum/taraf/cins + tarih (tek gün / aralık) → tümü URL parametresine yazılır (server yeniden sorgular).
 * "Excel indir" o anki filtre kümesini /api/masraf/export'a taşır. atanan-dosyalar/filtre-bar kalıbı.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'
import { Search, X, FileDown, RotateCcw } from 'lucide-react'
import { MASRAF_CINSLERI, MASRAF_DURUM, MASRAF_TARAF, type MasrafDurumKod, type MasrafTarafKod } from '@/lib/konsrucu/masraf'

export type FiltreDeger = { q: string; durum: string; taraf: string; cins: string; gun: string; bas: string; bit: string }

const SEC = 'rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[12.5px] text-foreground outline-none transition focus-visible:border-kr/50 focus-visible:ring-2 focus-visible:ring-kr/30 motion-reduce:transition-none'

export function MasrafFiltre({ deger }: { deger: FiltreDeger }) {
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

  const [val, setVal] = useState(deger.q)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function araDegis(v: string) {
    setVal(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => guncelle({ q: v.trim() || null }), 350)
  }

  const filtreVar = !!(deger.q || deger.durum || deger.taraf || deger.cins || deger.gun || deger.bas || deger.bit)

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* arama */}
        <form className="relative min-w-[230px] flex-1" onSubmit={(e) => { e.preventDefault(); if (timer.current) clearTimeout(timer.current); guncelle({ q: val.trim() || null }) }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={val} onChange={(e) => araDegis(e.target.value)} aria-label="Masraflarda ara" placeholder="Dekont no · cins · sorumlu · hasar/hukuk no · sigortalı…"
            className="w-full rounded-[10px] border border-border bg-surface py-2.5 pl-9 pr-9 text-[13px] outline-none transition focus-visible:border-kr/50 focus-visible:ring-2 focus-visible:ring-kr/30 motion-reduce:transition-none" />
          {val && <button type="button" aria-label="Aramayı temizle" onClick={() => { if (timer.current) clearTimeout(timer.current); setVal(''); guncelle({ q: null }) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </form>

        {/* Excel indir */}
        <a href={`/api/masraf/export${sp.toString() ? `?${sp.toString()}` : ''}`} title="Görünen listeyi RAY MASRAF FORMU olarak indir"
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-foreground shadow-card transition hover:border-kr/40 hover:text-kr-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none">
          <FileDown className="h-4 w-4 text-kr" /> Excel indir
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <select aria-label="Durum" value={deger.durum} onChange={(e) => guncelle({ durum: e.target.value || null })} className={SEC}>
          <option value="">Aktif (arşiv hariç)</option>
          {(Object.keys(MASRAF_DURUM) as MasrafDurumKod[]).map((k) => <option key={k} value={k}>{MASRAF_DURUM[k].label}</option>)}
          <option value="all">Hepsi (arşiv dahil)</option>
        </select>

        <select aria-label="Taraf" value={deger.taraf} onChange={(e) => guncelle({ taraf: e.target.value || null })} className={SEC}>
          <option value="">Tüm taraflar</option>
          {(Object.keys(MASRAF_TARAF) as MasrafTarafKod[]).map((k) => <option key={k} value={k}>{MASRAF_TARAF[k].label}</option>)}
        </select>

        <select aria-label="Masraf cinsi" value={deger.cins} onChange={(e) => guncelle({ cins: e.target.value || null })} className={`${SEC} max-w-[200px]`}>
          <option value="">Tüm cinsler</option>
          <option value="YOK">Eşleştirilmedi</option>
          {MASRAF_CINSLERI.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">Gün
          <input type="date" aria-label="Tek gün" value={deger.gun} onChange={(e) => guncelle({ gun: e.target.value || null, bas: null, bit: null })} className={SEC} />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">Aralık
          <input type="date" aria-label="Başlangıç" value={deger.bas} onChange={(e) => guncelle({ bas: e.target.value || null, gun: null })} className={SEC} />
          <span className="text-muted-foreground">–</span>
          <input type="date" aria-label="Bitiş" value={deger.bit} onChange={(e) => guncelle({ bit: e.target.value || null, gun: null })} className={SEC} />
        </label>

        {filtreVar && (
          <button type="button" onClick={() => { setVal(''); router.replace(pathname, { scroll: false }) }} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr-ink">
            <RotateCcw className="h-3.5 w-3.5" /> Temizle
          </button>
        )}
      </div>
    </div>
  )
}
