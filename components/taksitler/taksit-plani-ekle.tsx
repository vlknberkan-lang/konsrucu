'use client'

/**
 * KonsRücü — Taksit Takvimi · "Taksit Planı Ekle" (menüden, Etkinlik Ekle mantığı).
 * Aranabilir dosya seç + toplam/sayı/ilk vade/periyot/hatırlatma → taksitPlaniKur (eşit bölünmüş program).
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, X, Loader2, Search, Check } from 'lucide-react'
import { taksitPlaniKur } from '@/app/(app)/akilli-giris/actions'

export type DosyaSecenek = { id: string; hukukNo: string | null; borclu: string | null }

const INP = 'w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'

// "1.234,56" → 1234.56 (önizleme için; sunucu guvenliDecimal ile kesin parse eder)
const numTR = (s: string): number => {
  const t = (s ?? '').trim().replace(/[^\d.,]/g, '')
  if (!t) return NaN
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  return Number(t)
}
const para = (n: number) => (Number.isFinite(n) ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺' : '—')

export function TaksitPlaniEkle({ dosyalar }: { dosyalar: DosyaSecenek[] }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  const [secili, setSecili] = useState<DosyaSecenek | null>(null)
  const [ara, setAra] = useState('')
  const [acikListe, setAcikListe] = useState(false)
  const [toplam, setToplam] = useState('')
  const [sayi, setSayi] = useState('')

  const sonuc = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr')
    const list = q ? dosyalar.filter((d) => (d.hukukNo ?? '').toLocaleLowerCase('tr').includes(q) || (d.borclu ?? '').toLocaleLowerCase('tr').includes(q)) : dosyalar
    return list.slice(0, 30)
  }, [ara, dosyalar])

  const taksitTutar = useMemo(() => {
    const t = numTR(toplam), n = Math.round(Number(sayi))
    return Number.isFinite(t) && t > 0 && n >= 1 ? t / n : NaN
  }, [toplam, sayi])

  function kapat() { setOpen(false); setErr(null) }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!secili) { setErr('Önce bir dosya seçin.'); return }
    const fd = new FormData(e.currentTarget)
    const toplamTutar = String(fd.get('toplamTutar') ?? '').trim()
    const taksitSayisi = Math.round(Number(fd.get('taksitSayisi')))
    const ilkVade = String(fd.get('ilkVade') ?? '')
    if (!toplamTutar) { setErr('Toplam (anlaşılan) tutarı girin.'); return }
    if (!taksitSayisi || taksitSayisi < 1) { setErr('Taksit sayısını girin.'); return }
    if (!ilkVade) { setErr('İlk taksit vadesini seçin.'); return }
    const payload = {
      toplamTutar,
      taksitSayisi,
      ilkVade,
      periyotAy: Math.max(1, Math.round(Number(fd.get('periyotAy')) || 1)),
      hatirlatmaGun: String(fd.get('hatirlatmaGun') ?? '') !== '' ? Math.round(Number(fd.get('hatirlatmaGun'))) : 3,
      temerrutSarti: fd.get('temerrutSarti') === 'on',
      indirimTutari: String(fd.get('indirimTutari') ?? '').trim() || null,
      not: String(fd.get('not') ?? '').trim() || null,
    }
    setErr(null)
    start(async () => {
      const r = await taksitPlaniKur(secili.id, payload)
      if (r.ok) { kapat(); setSecili(null); setAra(''); setToplam(''); setSayi(''); router.refresh() }
      else setErr(r.error ?? 'Plan kurulamadı')
    })
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 rounded-[11px] bg-kr px-4 py-2.5 text-[14px] font-semibold text-kr-foreground shadow-[0_2px_10px_hsl(var(--kr)/0.35)] transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
        <CreditCard className="h-[18px] w-[18px]" /> Taksit Planı Ekle
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={kapat}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-float" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-kr-soft text-kr-ink"><CreditCard className="h-[18px] w-[18px]" /></span>
                <h3 className="font-display text-[16px] font-extrabold">Taksit Planı Ekle</h3>
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
                    <input value={ara} onChange={(e) => { setAra(e.target.value); setAcikListe(true) }} onFocus={() => setAcikListe(true)} placeholder="Hukuk no veya borçlu ara…" className={`${INP} pl-9`} />
                    {acikListe && (
                      <div className="absolute z-10 mt-1 max-h-[220px] w-full overflow-y-auto rounded-[10px] border border-border bg-surface shadow-float">
                        {sonuc.length === 0 ? (
                          <div className="px-3 py-3 text-[12.5px] text-muted-foreground">Eşleşen dosya yok.</div>
                        ) : sonuc.map((d) => (
                          <button key={d.id} type="button" onClick={() => { setSecili(d); setAcikListe(false); setErr(null) }} className="flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2 text-left text-[12.5px] last:border-0 transition hover:bg-surface-muted">
                            <span className="min-w-0 flex-1 truncate font-semibold">{d.borclu ?? '—'}</span>
                            <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{d.hukukNo ?? d.id.slice(0, 8)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className={LBL}>Toplam (anlaşılan) tutar ₺</label><input name="toplamTutar" value={toplam} onChange={(e) => setToplam(e.target.value)} inputMode="decimal" placeholder="120.000,00" className={`${INP} font-mono`} /></div>
                <div><label className={LBL}>Taksit sayısı</label><input name="taksitSayisi" value={sayi} onChange={(e) => setSayi(e.target.value)} inputMode="numeric" placeholder="6" className={`${INP} font-mono`} /></div>
                <div><label className={LBL}>İlk taksit vadesi</label><input type="date" name="ilkVade" className={INP} /></div>
                <div><label className={LBL}>Periyot (kaç ayda bir)</label><input type="number" name="periyotAy" min={1} max={12} defaultValue={1} className={`${INP} font-mono`} /></div>
                <div><label className={LBL}>Vade öncesi hatırlatma (gün)</label><input type="number" name="hatirlatmaGun" min={0} max={60} defaultValue={3} className={`${INP} font-mono`} /></div>
                <div><label className={LBL}>İndirim tutarı ₺ (ops.)</label><input name="indirimTutari" inputMode="decimal" placeholder="—" className={`${INP} font-mono`} /></div>
              </div>

              {Number.isFinite(taksitTutar) && (
                <div className="rounded-[10px] border border-border-subtle bg-surface-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
                  Program: <b className="font-mono text-foreground">{Math.round(Number(sayi))}</b> taksit × ≈ <b className="font-mono text-kr-ink">{para(taksitTutar)}</b> (son taksit kuruş artığını alır).
                </div>
              )}

              <div><label className={LBL}>Not (ops.)</label><textarea name="not" rows={2} placeholder="sulh/anlaşma detayı…" className={`${INP} resize-y`} /></div>
              <label className="flex items-center gap-2 text-[12.5px] text-foreground">
                <input type="checkbox" name="temerrutSarti" defaultChecked className="h-4 w-4 rounded border-border text-kr focus:ring-kr/40" /> Temerrüt şartı (bir taksit kaçarsa kalan muaccel olur)
              </label>

              {err && <p className="text-[12px] text-danger">{err}</p>}

              <div className="mt-1 flex items-center justify-end gap-2 border-t border-border-subtle pt-3.5">
                <button type="button" onClick={kapat} className="rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">Vazgeç</button>
                <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Planı kur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
