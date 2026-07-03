'use client'

/**
 * KonsRücü — ⌘K komut paleti · components/shell/komut-paleti.tsx
 * Header'daki arama kutusu (eskiden tıklanamayan süs) artık gerçek: ⌘K / Ctrl+K ya da tıkla → aç,
 * yazdıkça /api/arama'dan tenant-kapsamlı dosya sonuçları; ok tuşları + Enter ile dosyaya atla.
 * Kütüphanesiz küçük palet (cmdk yok); hızlı sayfalar listesiyle açılır.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, FileText, CornerDownLeft, Sunrise, CalendarDays, ListTodo, AlertTriangle } from 'lucide-react'

type Sonuc = { id: string; hukukNo: string | null; hasarNo: string | null; icraNo: string | null; borclu: string | null; durum: string }

const HIZLI = [
  { href: '/bugun', label: 'Bugün panosu', Icon: Sunrise },
  { href: '/takvim', label: 'Takvim', Icon: CalendarDays },
  { href: '/gorevler', label: 'Görevler', Icon: ListTodo },
  { href: '/onemli-olaylar', label: 'Önemli Olaylar', Icon: AlertTriangle },
]

export function KomutPaleti() {
  const [acik, setAcik] = useState(false)
  const [q, setQ] = useState('')
  const [sonuclar, setSonuclar] = useState<Sonuc[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [aktif, setAktif] = useState(0)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const istekNo = useRef(0)

  // ⌘K / Ctrl+K global kısayolu
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAcik((a) => !a)
      }
      if (e.key === 'Escape') setAcik(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (acik) setTimeout(() => inputRef.current?.focus(), 30)
    else { setQ(''); setSonuclar([]); setAktif(0) }
  }, [acik])

  const ara = useCallback((deger: string) => {
    setQ(deger)
    setAktif(0)
    if (timer.current) clearTimeout(timer.current)
    const s = deger.trim()
    if (s.length < 2) { setSonuclar([]); setYukleniyor(false); return }
    setYukleniyor(true)
    timer.current = setTimeout(async () => {
      const no = ++istekNo.current
      try {
        const r = await fetch(`/api/arama?q=${encodeURIComponent(s)}`)
        const j = (await r.json()) as { sonuclar?: Sonuc[] }
        if (no === istekNo.current) setSonuclar(j.sonuclar ?? [])
      } catch {
        if (no === istekNo.current) setSonuclar([])
      } finally {
        if (no === istekNo.current) setYukleniyor(false)
      }
    }, 250)
  }, [])

  const liste: { tip: 'dosya' | 'sayfa'; key: string; href: string; ust: string; alt: string | null; Icon: typeof FileText }[] =
    q.trim().length >= 2
      ? sonuclar.map((s) => ({
          tip: 'dosya' as const,
          key: s.id,
          href: `/akilli-giris/${s.id}`,
          ust: s.borclu ?? s.hukukNo ?? '—',
          alt: [s.hukukNo, s.icraNo].filter(Boolean).join(' · ') || s.hasarNo,
          Icon: FileText,
        }))
      : HIZLI.map((h) => ({ tip: 'sayfa' as const, key: h.href, href: h.href, ust: h.label, alt: null, Icon: h.Icon }))

  function git(href: string) {
    setAcik(false)
    router.push(href)
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAktif((a) => Math.min(a + 1, liste.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktif((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && liste[aktif]) { e.preventDefault(); git(liste[aktif].href) }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="ml-auto flex w-[min(420px,32vw)] items-center gap-2.5 truncate rounded-[11px] border border-border bg-surface-muted px-3.5 py-2.5 text-[13px] text-muted-foreground transition hover:border-kr/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Hukuk no, hasar no, borçlu, plaka ara…</span>
        <span className="font-mono ml-auto rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px]">⌘K</span>
      </button>

      {acik && (
        <div className="fixed inset-0 z-[60] bg-black/40 p-4 pt-[12vh]" onClick={(e) => { if (e.target === e.currentTarget) setAcik(false) }}>
          <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-float">
            <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
              {yukleniyor ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-kr" /> : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => ara(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Hukuk no, hasar no, icra no, borçlu, sigortalı, plaka…"
                aria-label="Dosya ara"
                className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              <span className="font-mono shrink-0 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-1.5">
              {q.trim().length >= 2 && !yukleniyor && liste.length === 0 && (
                <div className="px-3 py-6 text-center text-[13px] text-muted-foreground">"{q}" için dosya bulunamadı.</div>
              )}
              {q.trim().length < 2 && (
                <div className="font-mono px-3 pb-1 pt-2 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Hızlı git</div>
              )}
              {liste.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => git(s.href)}
                  onMouseEnter={() => setAktif(i)}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left transition ${i === aktif ? 'bg-kr-soft/60' : 'hover:bg-surface-muted'}`}
                >
                  <s.Icon className={`h-4 w-4 shrink-0 ${i === aktif ? 'text-kr-ink' : 'text-muted-foreground'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">{s.ust}</span>
                    {s.alt && <span className="font-mono block truncate text-[11px] text-muted-foreground">{s.alt}</span>}
                  </span>
                  {i === aktif && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
