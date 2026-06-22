'use client'

/**
 * KonsRücü — Dosya Detay · FAİZ & DAVA TUTARI (düzenlenebilir)
 * Dekontlar (ekspertiz işaretlenir → anaparaya dahil edilmez), dava tutarı (rücu/kusur payı),
 * faiz başlangıç (oto = son dekont) ve bitiş (oto = bugün) elle düzenlenebilir; faiz canlı hesaplanır.
 * Hesap saf lib/konsrucu/faiz ile yapılır (oranlar Şirket Bilgileri'nden).
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, Check, Loader2, Calculator, RotateCcw } from 'lucide-react'
import { faizHesapla, sonDekontTarihi, odenenToplam, type FaizOrani, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { faizKaydet } from '@/app/(app)/akilli-giris/actions'

type DekontRow = { tarih: string; tutar: string; haricMi: boolean; aciklama: string }
export type FaizInit = {
  davaTutari: string
  asilAlacak: string
  faizBaslangic: string // '' = otomatik
  faizBitis: string // '' = otomatik (bugün)
  faizTutari: string // '' = otomatik
  dekontlar: DekontRow[]
}

const fmtTRY = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'
const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
// Hem TR (1.234,56) hem makine biçimini (1234.56) çözer — sunucudaki guvenliDecimal ile aynı mantık.
// Virgül son noktadan sonra geliyorsa TR (nokta=binlik), değilse makine/US (nokta=ondalık).
const numTR = (s: string) => {
  const c = String(s).replace(/[^\d.,-]/g, '')
  if (!c) return 0
  const norm = c.includes(',') && c.lastIndexOf(',') > c.lastIndexOf('.') ? c.replace(/\./g, '').replace(',', '.') : c.replace(/,/g, '')
  const n = Number(norm)
  return Number.isFinite(n) ? n : 0
}

const INP = 'w-full rounded-[9px] border border-border bg-surface px-2.5 py-1.5 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'

export function FaizPanel({ dosyaId, init, oranlar, bugun }: { dosyaId: string; init: FaizInit; oranlar: FaizOrani[]; bugun: string }) {
  const [rows, setRows] = useState<DekontRow[]>(init.dekontlar.length ? init.dekontlar : [])
  const [dava, setDava] = useState(init.davaTutari)
  const [bas, setBas] = useState(init.faizBaslangic)
  const [bit, setBit] = useState(init.faizBitis)
  const [elleFaiz, setElleFaiz] = useState(init.faizTutari !== '')
  const [faizManuel, setFaizManuel] = useState(init.faizTutari)
  const [pending, start] = useTransition()
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  const setRow = (i: number, p: Partial<DekontRow>) => { setOk(false); setRows((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x))) }

  // canlı hesap
  const h = useMemo(() => {
    const girdi: DekontGirdi[] = rows.map((r) => ({ tarih: r.tarih || null, tutar: numTR(r.tutar), haricMi: r.haricMi }))
    const odenen = odenenToplam(girdi)
    const otoBas = sonDekontTarihi(girdi)
    const basEt = bas || otoBas || ''
    const bitEt = bit || bugun
    const anapara = numTR(dava)
    const hesap = anapara > 0 && basEt ? faizHesapla(anapara, new Date(basEt), new Date(bitEt), oranlar) : null
    const faizDeger = elleFaiz && faizManuel !== '' ? numTR(faizManuel) : hesap?.faiz ?? null
    const toplam = faizDeger != null ? anapara + faizDeger : null
    return { odenen, otoBas, basEt, bitEt, anapara, hesap, faizDeger, toplam }
  }, [rows, dava, bas, bit, bugun, oranlar, elleFaiz, faizManuel])

  function kaydet() {
    setErr(null); setOk(false)
    start(async () => {
      const r = await faizKaydet(dosyaId, {
        davaTutari: dava.trim() || null,
        faizBaslangic: bas || null,
        faizBitis: bit || null,
        faizTutari: elleFaiz && faizManuel.trim() !== '' ? faizManuel.trim() : null,
        dekontlar: rows.filter((r) => r.tutar.trim() !== '').map((r) => ({ tarih: r.tarih || null, tutar: r.tutar, haricMi: r.haricMi, aciklama: r.aciklama.trim() || null })),
      })
      if (r.ok) { setOk(true); router.refresh() } else setErr(r.error ?? 'Kaydedilemedi')
    })
  }

  const oranYok = oranlar.length === 0

  return (
    <div className="flex flex-col gap-4">
      {/* DEKONTLAR */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Ödeme Dekontları</span>
          <span className="text-[11px] text-muted-foreground">Ekspertiz ücretini <b className="text-foreground">“Ekspertiz”</b> işaretleyin — anaparaya katılmaz.</span>
        </div>
        {rows.length === 0 && <p className="rounded-lg border border-dashed border-border bg-surface-muted/40 px-3 py-2 text-[12px] text-muted-foreground">Dekont yok. AI çıkarımı dekontları otomatik doldurur; ya da elle ekleyin.</p>}
        <div className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <div key={i} className={`grid grid-cols-[120px_1fr_auto_auto] items-center gap-2 rounded-[10px] border p-1.5 ${r.haricMi ? 'border-warning/30 bg-warning-soft/30' : 'border-border-subtle bg-surface'}`}>
              <input type="date" value={r.tarih} onChange={(e) => setRow(i, { tarih: e.target.value })} className={INP} aria-label="Dekont tarihi" />
              <div className="relative">
                <input inputMode="decimal" value={r.tutar} onChange={(e) => setRow(i, { tutar: e.target.value })} placeholder="tutar" className={`${INP} pr-6 text-right font-mono tabular-nums`} aria-label="Tutar" />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">₺</span>
              </div>
              <label className="flex cursor-pointer items-center gap-1 rounded-[8px] px-1.5 py-1 text-[11px] font-semibold text-muted-foreground" title="Ekspertiz ücreti — anaparaya katma">
                <input type="checkbox" checked={r.haricMi} onChange={(e) => setRow(i, { haricMi: e.target.checked })} className="accent-[hsl(var(--warning-fg))]" /> Eksp.
              </label>
              <button type="button" aria-label="Dekontu sil" onClick={() => { setOk(false); setRows((s) => s.filter((_, j) => j !== i)) }} className="grid h-7 w-7 place-items-center rounded-[8px] border border-border text-muted-foreground transition hover:border-danger/40 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => { setOk(false); setRows((s) => [...s, { tarih: '', tutar: '', haricMi: false, aciklama: '' }]) }} className="mt-2 inline-flex items-center gap-1.5 rounded-[9px] border border-dashed border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-foreground"><Plus className="h-3.5 w-3.5" /> Dekont ekle</button>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
          <span className="text-muted-foreground">Ödenen toplam (ekspertiz hariç): <b className="font-mono text-foreground">{fmtTRY(h.odenen)}</b></span>
          {h.otoBas && <span className="text-muted-foreground">Son dekont: <b className="font-mono text-foreground">{fmtDate(h.otoBas)}</b></span>}
        </div>
      </div>

      {/* DAVA TUTARI + TARİHLER */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={LBL}>Dava tutarı — rücu/kusur payı (₺)</label>
          <input inputMode="decimal" value={dava} onChange={(e) => { setOk(false); setDava(e.target.value) }} className={`${INP} text-right font-mono tabular-nums`} />
          {init.asilAlacak && <p className="mt-1 text-[10.5px] text-muted-foreground">Ödenen tam tazminat: <span className="font-mono">{fmtTRY(numTR(init.asilAlacak))}</span></p>}
        </div>
        <div>
          <label className={LBL}>Faiz başlangıcı</label>
          <input type="date" value={bas} onChange={(e) => { setOk(false); setBas(e.target.value) }} className={INP} />
          <p className="mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground">
            {bas ? <button type="button" onClick={() => { setOk(false); setBas('') }} className="inline-flex items-center gap-1 font-semibold text-kr-ink hover:underline"><RotateCcw className="h-3 w-3" /> otomatiğe dön</button> : <>otomatik: {h.otoBas ? fmtDate(h.otoBas) : 'son dekont yok'}</>}
          </p>
        </div>
        <div>
          <label className={LBL}>Faiz bitişi</label>
          <input type="date" value={bit} onChange={(e) => { setOk(false); setBit(e.target.value) }} className={INP} />
          <p className="mt-1 flex items-center gap-1 text-[10.5px] text-muted-foreground">
            {bit ? <button type="button" onClick={() => { setOk(false); setBit('') }} className="inline-flex items-center gap-1 font-semibold text-kr-ink hover:underline"><RotateCcw className="h-3 w-3" /> bugüne dön</button> : <>otomatik: bugün ({fmtDate(bugun)})</>}
          </p>
        </div>
      </div>

      {/* HESAP */}
      <div className="rounded-xl border border-border bg-surface-muted/40 p-[14px_16px]">
        <div className="mb-2 flex items-center gap-2"><Calculator className="h-4 w-4 text-kr" /><span className="font-display text-[13.5px] font-bold">İşlemiş Faiz</span></div>
        {oranYok ? (
          <p className="text-[12px] text-muted-foreground">Faiz oranı tanımlı değil — <Link href="/ayarlar" className="font-semibold text-kr-ink hover:underline">Şirket Bilgileri → Faiz Oranları</Link>'ndan ekleyin.</p>
        ) : h.anapara <= 0 ? (
          <p className="text-[12px] text-muted-foreground">Dava tutarı (anapara) girin.</p>
        ) : !h.basEt ? (
          <p className="text-[12px] text-muted-foreground">Faiz başlangıcı yok — bir dekont tarihi girin ya da başlangıcı elle seçin.</p>
        ) : (
          <div className="space-y-1.5 text-[12.5px]">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Anapara (dava tutarı)</span><span className="font-mono font-semibold">{fmtTRY(h.anapara)}</span></div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">İşlemiş faiz {h.hesap ? `· ${h.hesap.gun} gün` : ''}{elleFaiz ? ' · elle' : ''}</span>
              <span className="font-mono font-semibold">{h.faizDeger != null ? fmtTRY(h.faizDeger) : '—'}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border-subtle pt-1.5"><span className="font-bold">Toplam</span><span className="font-mono text-[15px] font-extrabold text-kr-ink">{h.toplam != null ? fmtTRY(h.toplam) : '—'}</span></div>
            <div className="font-mono text-[10px] text-muted-foreground">{fmtDate(h.basEt)} → {fmtDate(h.bitEt)} · {oranlar.length} dönem</div>
            {h.hesap && h.hesap.detay.length > 1 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground">Dönemsel kırılım ({h.hesap.detay.length})</summary>
                <div className="mt-1.5 overflow-hidden rounded-lg border border-border-subtle">
                  {h.hesap.detay.map((d, i) => (
                    <div key={i} className={`flex items-center justify-between gap-2 px-2.5 py-1 text-[11px] ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                      <span className="font-mono text-muted-foreground">{d.donem} · %{d.oran} · {d.gun}g</span>
                      <span className="font-mono tabular-nums">{fmtTRY(d.tutar)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        <label className="mt-2.5 flex cursor-pointer items-center gap-2 border-t border-border-subtle pt-2 text-[11.5px] text-muted-foreground">
          <input type="checkbox" checked={elleFaiz} onChange={(e) => { setOk(false); setElleFaiz(e.target.checked) }} className="accent-kr" /> Faiz tutarını elle gir (hesabı geçersiz kıl)
        </label>
        {elleFaiz && (
          <div className="relative mt-1.5">
            <input inputMode="decimal" value={faizManuel} onChange={(e) => { setOk(false); setFaizManuel(e.target.value) }} placeholder="elle faiz tutarı" className={`${INP} pr-6 text-right font-mono tabular-nums`} />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">₺</span>
          </div>
        )}
      </div>

      {/* KAYDET */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={kaydet} disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Faizi kaydet</button>
        {ok && <span className="text-[12px] font-medium text-success">Kaydedildi.</span>}
        {err && <span className="text-[12px] text-danger">{err}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground">Kaydedince avukat onayı sıfırlanır</span>
      </div>
    </div>
  )
}
