'use client'

/**
 * KonsRücü — Takvim · "Etkinlik Ekle" ekranı.
 * Dosya seç (aranabilir) + tür (arabuluculuk toplantısı / duruşma / süre / görüşme / hatırlatma)
 * + başlangıç-bitiş (tarih & saat) + yer/online + hatırlatma → etkinlikKaydet (dosya-seviyesi).
 */
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, X, Loader2, Search, Handshake, Scale, AlarmClock, CalendarDays, Bell, Check } from 'lucide-react'
import { etkinlikKaydet } from '@/app/(app)/akilli-giris/actions'

export type DosyaSecenek = { id: string; hukukNo: string | null; borclu: string | null }

const TURLER: { val: string; label: string; Icon: typeof Handshake }[] = [
  { val: 'DURUSMA', label: 'Duruşma', Icon: Scale },
  { val: 'ARABULUCULUK_TOPLANTISI', label: 'Arabuluculuk toplantısı', Icon: Handshake },
  { val: 'GORUSME', label: 'Görüşme', Icon: CalendarDays },
  { val: 'SURE', label: 'Süre / son tarih', Icon: AlarmClock },
  { val: 'HATIRLATMA', label: 'Hatırlatma', Icon: Bell },
]
const TUR_LBL: Record<string, string> = Object.fromEntries(TURLER.map((t) => [t.val, t.label]))

const INP = 'w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'

export function EtkinlikEkle({ dosyalar }: { dosyalar: DosyaSecenek[] }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  const [secili, setSecili] = useState<DosyaSecenek | null>(null)
  const [ara, setAra] = useState('')
  const [acikListe, setAcikListe] = useState(false)
  const [tur, setTur] = useState('DURUSMA')
  const baslikRef = useRef<HTMLInputElement>(null)
  const overlayDown = useRef(false) // kapatma yalnız basış arka planda başladıysa (metin sürükle-seçimi kapatmasın)

  const sonuc = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr')
    const list = q ? dosyalar.filter((d) => (d.hukukNo ?? '').toLocaleLowerCase('tr').includes(q) || (d.borclu ?? '').toLocaleLowerCase('tr').includes(q)) : dosyalar
    return list.slice(0, 30)
  }, [ara, dosyalar])

  function kapat() { setOpen(false); setErr(null) }
  function sifirla() { setSecili(null); setAra(''); setTur('DURUSMA'); setErr(null) }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!secili) { setErr('Önce bir dosya seçin.'); return }
    const fd = new FormData(e.currentTarget)
    fd.set('dosyaId', secili.id)
    fd.set('tur', tur)
    if (!String(fd.get('baslik') ?? '').trim()) fd.set('baslik', TUR_LBL[tur] ?? 'Etkinlik')
    if (!String(fd.get('baslar') ?? '').trim()) { setErr('Başlangıç tarih & saatini seçin.'); return }
    setErr(null)
    start(async () => {
      await etkinlikKaydet(fd)
      kapat(); sifirla(); router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-[11px] bg-kr px-4 py-2.5 text-[14px] font-semibold text-kr-foreground shadow-[0_2px_10px_hsl(var(--kr)/0.35)] transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
      >
        <CalendarPlus className="h-[18px] w-[18px]" /> Etkinlik Ekle
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onMouseDown={(e) => { overlayDown.current = e.target === e.currentTarget }}
          onClick={(e) => { if (overlayDown.current && e.target === e.currentTarget) kapat(); overlayDown.current = false }}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-float">
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-kr-soft text-kr-ink"><CalendarPlus className="h-[18px] w-[18px]" /></span>
                <h3 className="font-display text-[16px] font-extrabold">Etkinlik Ekle</h3>
              </div>
              <button type="button" aria-label="Kapat" onClick={kapat} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3.5 px-5 py-4">
              {/* dosya seç (aranabilir) */}
              <div>
                <label className={LBL}>Dosya</label>
                {secili ? (
                  <div className="flex items-center gap-2 rounded-[10px] border border-kr/30 bg-kr-soft/30 px-3 py-2.5">
                    <Check className="h-4 w-4 shrink-0 text-kr-ink" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{secili.borclu ?? '—'} <span className="font-mono text-[11px] text-muted-foreground">· {secili.hukukNo ?? secili.id.slice(0, 8)}</span></span>
                    <button type="button" onClick={() => { setSecili(null); setAcikListe(true) }} className="shrink-0 text-[12px] font-semibold text-kr-ink hover:underline">değiştir</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={ara}
                      onChange={(e) => { setAra(e.target.value); setAcikListe(true) }}
                      onFocus={() => setAcikListe(true)}
                      placeholder="Hukuk no veya borçlu ara…"
                      className={`${INP} pl-9`}
                    />
                    {acikListe && (
                      <div className="absolute z-10 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[10px] border border-border bg-surface shadow-float">
                        {sonuc.length === 0 ? (
                          <div className="px-3 py-3 text-[12.5px] text-muted-foreground">Eşleşen dosya yok.</div>
                        ) : sonuc.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => { setSecili(d); setAcikListe(false); setErr(null) }}
                            className="flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2 text-left text-[12.5px] last:border-0 transition hover:bg-surface-muted"
                          >
                            <span className="min-w-0 flex-1 truncate font-semibold">{d.borclu ?? '—'}</span>
                            <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{d.hukukNo ?? d.id.slice(0, 8)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* tür */}
              <div>
                <label className={LBL}>Etkinlik türü</label>
                <div className="flex flex-wrap gap-1.5">
                  {TURLER.map(({ val, label, Icon }) => {
                    const on = tur === val
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTur(val)}
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/40 ${on ? 'border-transparent bg-kr text-kr-foreground' : 'border-border bg-surface text-muted-foreground hover:text-foreground'}`}
                      >
                        <Icon className="h-4 w-4" /> {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* başlık */}
              <div>
                <label className={LBL}>Başlık</label>
                <input ref={baslikRef} name="baslik" placeholder={`Boş bırakılırsa “${TUR_LBL[tur]}”`} className={INP} />
              </div>

              {/* tarih & saat */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className={LBL}>Başlangıç (tarih & saat)</label><input type="datetime-local" name="baslar" step={60} className={INP} /></div>
                <div><label className={LBL}>Bitiş (ops.)</label><input type="datetime-local" name="biter" step={60} className={INP} /></div>
              </div>

              {/* yer + online + hatırlatma */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className={LBL}>Yer</label><input name="yer" placeholder="adliye / büro / online" className={INP} /></div>
                <div><label className={LBL}>Hatırlatma</label>
                  <select name="hatirlatmaDk" defaultValue="" className={INP}>
                    <option value="">—</option>
                    <option value="60">1 saat önce</option>
                    <option value="1440">1 gün önce</option>
                    <option value="2880">2 gün önce</option>
                    <option value="10080">1 hafta önce</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-foreground">
                <input type="checkbox" name="online" className="h-4 w-4 rounded border-border text-kr focus:ring-kr/40" /> Online görüşme/duruşma
              </label>

              {err && <p className="text-[12px] text-danger">{err}</p>}

              <div className="mt-1 flex items-center justify-end gap-2 border-t border-border-subtle pt-3.5">
                <button type="button" onClick={kapat} className="rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">Vazgeç</button>
                <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Ekle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
