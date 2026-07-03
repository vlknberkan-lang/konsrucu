'use client'

/**
 * KonsRücü — Dosya Detay · TAKSİT PLANI & ÖDEME HATIRLATMA
 * Sulh/anlaşma sonrası ödeme planı: program kur (eşit bölme), her taksit için vade/tutar/durum,
 * "Ödendi" işaretle (→ TAHSILAT olayı), gecikme vurgusu. Hatırlatma cron'u (taksit-hatirlatma) ekibe
 * vade öncesi + gecikince e-posta atar. Tutarlar lib/konsrucu/taksit ile hesaplanır.
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check, Loader2, AlertTriangle, Bell, RotateCcw, CreditCard, Ban } from 'lucide-react'
import { taksitProgrami, taksitOzet, efektifDurum, type TaksitDurum, type TaksitPlanDurum, type TaksitGirdi } from '@/lib/konsrucu/taksit'
import { taksitPlaniKur, taksitOdendi, taksitOdemeGeriAl, taksitPlaniIptal, taksitTahsilatGir, taksitTahsilatGeriAl } from '@/app/(app)/akilli-giris/actions'
import { sayiTRveya0 } from '@/lib/konsrucu/sayi'

export type TaksitUI = { id: string; sira: number; vadeTarihi: string; tutar: number; durum: TaksitDurum; odenenTutar: number | null; odendiTarih: string | null }
export type PlanUI = {
  id: string
  durum: TaksitPlanDurum
  toplamTutar: number
  indirimTutari: number | null
  taksitSayisi: number
  hatirlatmaGun: number
  temerrutSarti: boolean
  not: string | null
  taksitler: TaksitUI[]
  tahsilatlar: { id: string; tutar: number; tarih: string; aciklama: string | null }[]
}

const fmtTRY = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'
const fmtDate = (d: Date | string) => { const x = new Date(d); return Number.isNaN(x.getTime()) ? '—' : x.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
const numTR = sayiTRveya0 // tek kaynak: lib/konsrucu/sayi (iki formatı da çözer)

const INP = 'w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'

const DURUM_BADGE: Record<TaksitDurum, { cls: string; label: string }> = {
  ODENDI: { cls: 'bg-success-soft text-success', label: 'ödendi' },
  GECIKTI: { cls: 'bg-danger-soft text-danger', label: 'gecikti' },
  KISMI: { cls: 'bg-warning-soft text-warning', label: 'kısmi' },
  BEKLIYOR: { cls: 'bg-surface-muted text-muted-foreground', label: 'bekliyor' },
}
const PLAN_BADGE: Record<TaksitPlanDurum, { cls: string; label: string }> = {
  AKTIF: { cls: 'bg-kr-soft text-kr-ink', label: 'aktif' },
  TAMAMLANDI: { cls: 'bg-success-soft text-success', label: 'tamamlandı' },
  TEMERRUT: { cls: 'bg-danger-soft text-danger', label: 'temerrüt' },
  IPTAL: { cls: 'bg-surface-muted text-muted-foreground', label: 'iptal' },
}

export function TaksitPanel({ dosyaId, asamaId, plan, bugun }: { dosyaId: string; asamaId?: string | null; plan: PlanUI | null; bugun: string }) {
  if (plan && plan.durum !== 'IPTAL') return <PlanGorunum dosyaId={dosyaId} plan={plan} bugun={bugun} />
  return <KurForm dosyaId={dosyaId} asamaId={asamaId ?? null} />
}

// ── mevcut plan: ilerleme + taksit listesi + ödeme aksiyonları ──────────────
function PlanGorunum({ dosyaId, plan, bugun }: { dosyaId: string; plan: PlanUI; bugun: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [tahTutar, setTahTutar] = useState('')
  const [tahTarih, setTahTarih] = useState(bugun)
  const bugunD = new Date(bugun)

  const girdiler: TaksitGirdi[] = plan.taksitler.map((t) => ({ id: t.id, sira: t.sira, vadeTarihi: new Date(t.vadeTarihi), tutar: t.tutar, durum: t.durum, odenenTutar: t.odenenTutar, odendiTarih: t.odendiTarih ? new Date(t.odendiTarih) : null }))
  const ozet = useMemo(() => taksitOzet(girdiler, bugunD), [plan, bugun]) // eslint-disable-line react-hooks/exhaustive-deps

  const calistir = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setHata(null)
    start(async () => { const r = await fn(); if (r.ok) router.refresh(); else setHata(r.error ?? 'İşlem başarısız') })
  }
  function tahsilatEkle() {
    if (numTR(tahTutar) <= 0) { setHata('Geçerli bir tahsilat tutarı girin.'); return }
    setHata(null)
    start(async () => { const r = await taksitTahsilatGir(plan.id, tahTutar.trim(), tahTarih); if (r.ok) { setTahTutar(''); router.refresh() } else setHata(r.error ?? 'Tahsilat girilemedi') })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* özet başlık */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted/40 p-[14px_16px]">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-kr-soft text-kr-ink"><CreditCard className="h-[18px] w-[18px]" /></span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-[15px] font-extrabold">{plan.taksitSayisi} taksit · {fmtTRY(plan.toplamTutar)}</span>
              <span className={`rounded-full px-2 py-[2px] text-[10.5px] font-semibold ${PLAN_BADGE[plan.durum].cls}`}>{PLAN_BADGE[plan.durum].label}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Bell className="h-3 w-3" /> vadeden {plan.hatirlatmaGun} gün önce hatırlat</span>
              {plan.temerrutSarti && <span className="text-[hsl(var(--warning-fg))]">temerrüt şartlı</span>}
              {plan.indirimTutari != null && plan.indirimTutari > 0 && <span>indirim: {fmtTRY(plan.indirimTutari)}</span>}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[15px] font-extrabold tabular-nums text-foreground">{fmtTRY(ozet.odenen)}<span className="text-[11px] font-normal text-muted-foreground"> / {fmtTRY(ozet.toplam)}</span></div>
          <div className="text-[11px] text-muted-foreground">kalan: <b className="text-foreground">{fmtTRY(ozet.kalan)}</b> · {ozet.odenenSayi}/{ozet.toplamSayi} ödendi</div>
        </div>
      </div>

      {/* ilerleme çubuğu */}
      <div>
        <div className="h-[7px] overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${ozet.yuzde}%` }} /></div>
        {ozet.gecikenSayi > 0 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-[10px] border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] font-semibold text-danger">
            <AlertTriangle className="h-3.5 w-3.5" /> {ozet.gecikenSayi} taksit gecikti ({fmtTRY(ozet.gecikenTutar)}){plan.temerrutSarti ? ' · temerrüt şartı: kalan muaccel olabilir' : ''}
          </div>
        )}
      </div>

      {/* taksit listesi */}
      <div className="overflow-hidden rounded-xl border border-border">
        {girdiler.sort((a, b) => a.sira - b.sira).map((t, i) => {
          const ef = efektifDurum(t, bugunD)
          const b = DURUM_BADGE[ef]
          const odendi = t.durum === 'ODENDI'
          return (
            <div key={t.id} className={`flex items-center gap-3 p-[10px_14px] ${i > 0 ? 'border-t border-border-subtle' : ''} ${ef === 'GECIKTI' ? 'bg-danger-soft/30' : odendi ? 'bg-success-soft/20' : ''}`}>
              <span className="font-mono w-9 shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">{t.sira}/{plan.taksitSayisi}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold tabular-nums text-foreground">{fmtTRY(t.tutar)}</div>
                <div className="text-[11px] text-muted-foreground">vade {fmtDate(t.vadeTarihi)}{odendi && t.odendiTarih ? ` · ödendi ${fmtDate(t.odendiTarih)}` : ''}</div>
              </div>
              <span className={`rounded-full px-2 py-[2px] text-[10.5px] font-semibold ${b.cls}`}>{b.label}</span>
              {odendi ? (
                <button type="button" onClick={() => calistir(() => taksitOdemeGeriAl(t.id))} disabled={pending} className="inline-flex items-center gap-1 rounded-[8px] border border-border px-2.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground transition hover:border-danger/40 hover:text-danger disabled:opacity-60" title="ödemeyi geri al"><RotateCcw className="h-3.5 w-3.5" /> Geri al</button>
              ) : (
                <button type="button" onClick={() => calistir(() => taksitOdendi(t.id))} disabled={pending} className="inline-flex items-center gap-1 rounded-[8px] bg-success px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-success/90 disabled:opacity-60"><Check className="h-3.5 w-3.5" /> Ödendi</button>
              )}
            </div>
          )
        })}
      </div>

      {/* serbest tahsilat (dağınık ödeme) — plana eski taksitten başlayarak FIFO mahsup */}
      <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-[12px_14px]">
        <div className="font-mono mb-2 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Tahsilat gir · serbest tutar (plana otomatik mahsup edilir)</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[130px] flex-1">
            <label className={LBL}>Tutar</label>
            <input inputMode="decimal" value={tahTutar} onChange={(e) => setTahTutar(e.target.value)} placeholder="0,00" className={`${INP} pr-6 text-right font-mono tabular-nums`} />
            <span className="pointer-events-none absolute right-2.5 top-[34px] text-[11px] text-muted-foreground">₺</span>
          </div>
          <div><label className={LBL}>Tarih</label><input type="date" value={tahTarih} onChange={(e) => setTahTarih(e.target.value)} className={INP} /></div>
          <button type="button" onClick={tahsilatEkle} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[9px] bg-kr px-3.5 py-2.5 text-[12.5px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60"><Plus className="h-3.5 w-3.5" /> Tahsilat ekle</button>
        </div>
        {plan.tahsilatlar.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1 border-t border-border-subtle pt-2">
            {plan.tahsilatlar.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-[12px]">
                <span className="font-mono font-semibold tabular-nums text-foreground">{fmtTRY(o.tutar)}</span>
                <span className="text-muted-foreground">· {fmtDate(o.tarih)}</span>
                {o.aciklama && <span className="truncate text-muted-foreground">· {o.aciklama}</span>}
                <button type="button" onClick={() => calistir(() => taksitTahsilatGeriAl(o.id))} disabled={pending} className="ml-auto grid h-6 w-6 place-items-center rounded text-muted-foreground transition hover:text-danger disabled:opacity-60" title="tahsilatı geri al"><RotateCcw className="h-3 w-3" /></button>
              </div>
            ))}
            <div className="mt-1 flex justify-between text-[11.5px]"><span className="text-muted-foreground">Toplam tahsil</span><span className="font-mono font-bold tabular-nums text-foreground">{fmtTRY(plan.tahsilatlar.reduce((s, o) => s + o.tutar, 0))}</span></div>
          </div>
        )}
      </div>

      {plan.not && <p className="rounded-[10px] border border-border-subtle bg-surface-muted/40 px-3 py-2 text-[12px] text-muted-foreground"><b className="text-foreground">Not:</b> {plan.not}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {hata && <span className="text-[12px] text-danger">{hata}</span>}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <button type="button" onClick={() => { if (confirm('Taksit planı iptal edilsin mi? Ödenen tahsilatlar dosyada kalır.')) calistir(() => taksitPlaniIptal(plan.id)) }} disabled={pending} className="ml-auto inline-flex items-center gap-1.5 rounded-[9px] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:border-danger/40 hover:text-danger disabled:opacity-60"><Ban className="h-3.5 w-3.5" /> Planı iptal et</button>
      </div>
    </div>
  )
}

// ── plan yok: kur formu + canlı program önizleme ────────────────────────────
function KurForm({ dosyaId, asamaId }: { dosyaId: string; asamaId: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const [toplam, setToplam] = useState('')
  const [adet, setAdet] = useState('6')
  const [ilkVade, setIlkVade] = useState('')
  const [periyot, setPeriyot] = useState('1')
  const [hatirlatma, setHatirlatma] = useState('3')
  const [temerrut, setTemerrut] = useState(true)
  const [indirim, setIndirim] = useState('')
  const [not, setNot] = useState('')

  const onizleme = useMemo(() => {
    const t = numTR(toplam), n = Math.round(Number(adet))
    if (!(t > 0) || !(n >= 1) || !ilkVade) return []
    const d = new Date(ilkVade)
    if (Number.isNaN(d.getTime())) return []
    return taksitProgrami({ toplam: t, taksitSayisi: Math.min(n, 120), ilkVade: d, periyotAy: Math.max(1, Math.round(Number(periyot) || 1)) })
  }, [toplam, adet, ilkVade, periyot])

  function kur() {
    setHata(null)
    start(async () => {
      const r = await taksitPlaniKur(dosyaId, {
        toplamTutar: toplam.trim(),
        taksitSayisi: Math.round(Number(adet)),
        ilkVade,
        periyotAy: Math.round(Number(periyot) || 1),
        hatirlatmaGun: Math.round(Number(hatirlatma)),
        temerrutSarti: temerrut,
        indirimTutari: indirim.trim() || null,
        not: not.trim() || null,
        asamaId,
      })
      if (r.ok) router.refresh()
      else setHata(r.error ?? 'Plan kurulamadı')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[10px] border border-border-subtle bg-surface-muted/40 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
        Borçluyla <b className="text-foreground">taksitli ödeme</b> üzerinde anlaşıldıysa planı buradan kurun. Tutar taksitlere eşit bölünür (kuruş artığı son takside). Sistem her vade öncesi ekibe hatırlatma, vade geçerse gecikme uyarısı gönderir.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative">
          <label className={LBL}>Toplam tutar (indirim sonrası net)</label>
          <input inputMode="decimal" value={toplam} onChange={(e) => setToplam(e.target.value)} placeholder="0,00" className={`${INP} pr-6 text-right font-mono tabular-nums`} />
          <span className="pointer-events-none absolute right-2.5 top-[34px] text-[11px] text-muted-foreground">₺</span>
        </div>
        <div>
          <label className={LBL}>Taksit sayısı</label>
          <input inputMode="numeric" value={adet} onChange={(e) => setAdet(e.target.value)} className={`${INP} font-mono tabular-nums`} />
        </div>
        <div>
          <label className={LBL}>İlk taksit vadesi</label>
          <input type="date" value={ilkVade} onChange={(e) => setIlkVade(e.target.value)} className={INP} />
        </div>
        <div>
          <label className={LBL}>Periyot (ay)</label>
          <select value={periyot} onChange={(e) => setPeriyot(e.target.value)} className={INP}>
            <option value="1">Aylık</option>
            <option value="2">2 ayda bir</option>
            <option value="3">3 ayda bir</option>
          </select>
        </div>
        <div>
          <label className={LBL}>Hatırlatma (vadeden önce)</label>
          <select value={hatirlatma} onChange={(e) => setHatirlatma(e.target.value)} className={INP}>
            <option value="1">1 gün önce</option>
            <option value="3">3 gün önce</option>
            <option value="7">1 hafta önce</option>
            <option value="0">Hatırlatma yok</option>
          </select>
        </div>
        <div className="relative">
          <label className={LBL}>Uygulanan indirim (ops.)</label>
          <input inputMode="decimal" value={indirim} onChange={(e) => setIndirim(e.target.value)} placeholder="0,00" className={`${INP} pr-6 text-right font-mono tabular-nums`} />
          <span className="pointer-events-none absolute right-2.5 top-[34px] text-[11px] text-muted-foreground">₺</span>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground">
        <input type="checkbox" checked={temerrut} onChange={(e) => setTemerrut(e.target.checked)} className="accent-kr" />
        Temerrüt şartı var (bir taksit kaçarsa kalan muaccel olur) — gecikme uyarısı buna göre yazılır
      </label>

      <div>
        <label className={LBL}>Not (ops.)</label>
        <textarea value={not} onChange={(e) => setNot(e.target.value)} rows={2} placeholder="anlaşma detayı, dekont hesabı, vb." className={`${INP} resize-y`} />
      </div>

      {/* canlı önizleme */}
      {onizleme.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <div className="bg-surface-muted/50 px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Önizleme · {onizleme.length} taksit</div>
          <div className="max-h-52 overflow-y-auto">
            {onizleme.map((t) => (
              <div key={t.sira} className="flex items-center justify-between gap-2 border-t border-border-subtle px-3.5 py-1.5 text-[12px]">
                <span className="font-mono text-muted-foreground">{t.sira}/{onizleme.length}</span>
                <span className="text-foreground">{fmtDate(t.vadeTarihi)}</span>
                <span className="font-mono font-semibold tabular-nums">{fmtTRY(t.tutar)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={kur} disabled={pending || onizleme.length === 0} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Taksit planını kur</button>
        {hata && <span className="text-[12px] text-danger">{hata}</span>}
      </div>
    </div>
  )
}
