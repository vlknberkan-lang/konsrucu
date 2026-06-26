'use client'

/**
 * KonsRücü — Masraf ekle modalı · iki yol: "Manuel" tek kalem | "Makbuz oku" (PDF/foto → Claude çıkarımı).
 * Dosya seçimi aranabilir. taksit-plani-ekle.tsx kalıbını izler (overlay + useTransition).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Check, Search, FileUp, AlertTriangle } from 'lucide-react'
import { MASRAF_CINSLERI, MASRAF_TARAF, type MasrafTarafKod } from '@/lib/konsrucu/masraf'
import { masrafEkle, makbuzYukleOku } from '@/app/(app)/masraf/actions'

export type DosyaSecenek = { id: string; etiket: string }

const ALAN = 'w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-foreground outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground'

export function MasrafEkle({ dosyalar }: { dosyalar: DosyaSecenek[] }) {
  const [acik, setAcik] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none"
      >
        <Plus className="h-4 w-4" /> Masraf ekle
      </button>
      {acik && <Modal dosyalar={dosyalar} onKapat={() => setAcik(false)} />}
    </>
  )
}

function Modal({ dosyalar, onKapat }: { dosyalar: DosyaSecenek[]; onKapat: () => void }) {
  const router = useRouter()
  const [mod, setMod] = useState<'manuel' | 'makbuz'>('manuel')
  const [pending, start] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const makbuzFormRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onKapat() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onKapat])

  // aranabilir dosya seçimi
  const [ara, setAra] = useState('')
  const [dosyaId, setDosyaId] = useState<string>('')
  const secili = dosyalar.find((d) => d.id === dosyaId) ?? null
  const eslesen = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr-TR')
    if (!q) return dosyalar.slice(0, 8)
    return dosyalar.filter((d) => d.etiket.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 8)
  }, [ara, dosyalar])

  function manuelGonder(fd: FormData) {
    setHata(null); setBilgi(null)
    if (!dosyaId) { setHata('Önce dosya seçin'); return }
    fd.set('dosyaId', dosyaId)
    start(async () => {
      const r = await masrafEkle(fd)
      if (r.ok) { router.refresh(); onKapat() } else setHata(r.error ?? 'Eklenemedi')
    })
  }
  function makbuzGonder(fd: FormData) {
    setHata(null); setBilgi(null)
    if (!dosyaId) { setHata('Önce dosya seçin'); return }
    const f = fd.get('file')
    if (!(f instanceof File) || !f.size) { setHata('Makbuz dosyası seçin'); return }
    fd.set('dosyaId', dosyaId)
    start(async () => {
      const r = await makbuzYukleOku(fd)
      if (r.ok) { setBilgi(`${r.eklendi ?? 0} masraf eklendi${r.atlandi ? `, ${r.atlandi} mükerrer atlandı` : ''}.`); makbuzFormRef.current?.reset(); router.refresh() }
      else setHata(r.error ?? 'Okunamadı')
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onKapat}>
      <div role="dialog" aria-modal="true" aria-labelledby="masraf-ekle-baslik" className="w-full max-w-[560px] rounded-2xl border border-border bg-surface shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <h2 id="masraf-ekle-baslik" className="font-display text-[16px] font-extrabold">Masraf ekle</h2>
          <button type="button" onClick={onKapat} aria-label="Kapat" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4">
          {/* mod sekmeleri */}
          <div className="mb-4 inline-flex gap-1 rounded-xl border border-border bg-surface-muted p-1">
            {([['manuel', 'Manuel'], ['makbuz', 'Makbuz oku (PDF)']] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={mod === k} onClick={() => { setMod(k); setHata(null); setBilgi(null) }}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${mod === k ? 'bg-surface text-kr shadow-card' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
            ))}
          </div>

          {/* dosya seçimi (ortak) */}
          <div className="mb-3">
            <span className={LBL}>Dosya</span>
            {secili ? (
              <div className="flex items-center justify-between gap-2 rounded-[10px] border border-kr/40 bg-kr-soft/40 px-3 py-2">
                <span className="truncate text-[13px] font-semibold">{secili.etiket}</span>
                <button type="button" onClick={() => { setDosyaId(''); setAra('') }} className="text-[12px] font-semibold text-kr hover:underline">değiştir</button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Hukuk/hasar no ya da borçlu ara…" className={`${ALAN} pl-9`} />
                </div>
                {ara.trim() && (
                  <div className="mt-1 max-h-[180px] overflow-auto rounded-[10px] border border-border bg-surface">
                    {eslesen.length === 0 ? (
                      <div className="px-3 py-2 text-[12.5px] text-muted-foreground">Eşleşen dosya yok</div>
                    ) : eslesen.map((d) => (
                      <button key={d.id} type="button" onClick={() => { setDosyaId(d.id); setAra('') }} className="block w-full truncate px-3 py-2 text-left text-[12.5px] hover:bg-surface-muted">{d.etiket}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {mod === 'manuel' ? (
            <form action={manuelGonder} className="grid grid-cols-2 gap-3">
              <label className="col-span-1"><span className={LBL}>Tutar (₺)</span><input name="tutar" inputMode="decimal" placeholder="1.234,56" className={ALAN} required /></label>
              <label className="col-span-1"><span className={LBL}>Masraf tarihi</span><input name="tarih" type="date" className={ALAN} /></label>
              <label className="col-span-2"><span className={LBL}>Masraf cinsi (63 kalem)</span>
                <select name="cins" className={ALAN} defaultValue="">
                  <option value="">— Eşleştirilmedi —</option>
                  {MASRAF_CINSLERI.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="col-span-1"><span className={LBL}>Taraf</span>
                <select name="taraf" className={ALAN} defaultValue="BIZ">
                  {(Object.keys(MASRAF_TARAF) as MasrafTarafKod[]).map((k) => <option key={k} value={k}>{MASRAF_TARAF[k].label}</option>)}
                </select>
              </label>
              <label className="col-span-1"><span className={LBL}>Sorumlu</span><input name="sorumlu" className={ALAN} placeholder="opsiyonel" /></label>
              <label className="col-span-2"><span className={LBL}>Dekont / makbuz no</span><input name="dekontNo" className={ALAN} placeholder="opsiyonel" /></label>
              {hata && <p className="col-span-2 flex items-center gap-1.5 text-[12.5px] text-danger"><AlertTriangle className="h-3.5 w-3.5" />{hata}</p>}
              <div className="col-span-2 mt-1 flex justify-end gap-2">
                <button type="button" onClick={onKapat} className="rounded-[10px] border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground">Vazgeç</button>
                <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Ekle</button>
              </div>
            </form>
          ) : (
            <form action={makbuzGonder}>
              <p className="mb-2 text-[12.5px] text-muted-foreground">Makbuz/dekont PDF veya fotoğrafını yükleyin; sistem kalemleri (tutar, tarih, cins, dekont no) okuyup ekler. Mükerrerler atlanır.</p>
              <label className="block">
                <span className={LBL}>Makbuz dosyası (PDF / JPG / PNG)</span>
                <input name="file" type="file" accept="application/pdf,image/*" className="block w-full text-[12.5px] file:mr-3 file:rounded-[8px] file:border-0 file:bg-kr-soft file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-kr-ink" />
              </label>
              {hata && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-danger"><AlertTriangle className="h-3.5 w-3.5" />{hata}</p>}
              {bilgi && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-success"><Check className="h-3.5 w-3.5" />{bilgi}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={onKapat} className="rounded-[10px] border border-border bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground">Kapat</button>
                <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Yükle &amp; oku</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
