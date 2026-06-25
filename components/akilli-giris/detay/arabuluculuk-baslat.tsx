'use client'

/**
 * KonsRücü — Dosya Detay · Arabuluculuk Başvuru Hazırlığı (Önemli Olay akışı).
 * Borca itiraz yakalanan dosyada arabuluculuk başvurusu için gereken TÜM bilgiyi tek yerde,
 * tek tıkla kopyalanır özetle sunar; personel resmî sisteme bunu girer. Resmî teyit alınınca
 * "Tamamla" ile olay kapanır (dosya ARABULUCULUK aşamasına geçer, Tamamlanan Olaylar'a düşer).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Scale, Copy, Check, Loader2, Flag, Hand, Lock } from 'lucide-react'
import { onemliOlayUstlen, onemliOlayTamamla } from '@/app/(app)/onemli-olaylar/actions'

type Borclu = { adUnvan: string; tcVkn?: string | null; adres?: string | null }

export type ArabuluculukBaslatProps = {
  olayId: string
  durum: 'ACIK' | 'ISLEMDE'
  mine: boolean
  sorumluAd: string | null
  alacakli: { unvan: string | null; mersisVkn: string | null; adres: string | null; vekil: string | null; vekilAdres: string | null }
  borclular: Borclu[]
  icra: { daire: string | null; dosyaNo: string | null; hukukNo: string | null }
  alacak: { tutar: string | null; konu: string | null }
  prefill: { basvuruNo: string | null; bugun: string }
}

const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'
const INP = 'w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15'

/** Yapılandırılmış bilgiden kopyalanabilir başvuru özeti metni kur (görünenle birebir). */
function ozetKur(p: ArabuluculukBaslatProps): string {
  const sat: string[] = []
  sat.push('ARABULUCULUK BAŞVURU ÖZETİ')
  sat.push('')
  sat.push('— TARAFLAR —')
  sat.push(`Alacaklı (başvurucu): ${p.alacakli.unvan ?? '—'}${p.alacakli.mersisVkn ? ` · MERSİS/VKN: ${p.alacakli.mersisVkn}` : ''}`)
  if (p.alacakli.adres) sat.push(`Alacaklı adresi: ${p.alacakli.adres}`)
  if (p.alacakli.vekil) sat.push(`Vekil: ${p.alacakli.vekil}${p.alacakli.vekilAdres ? ` · ${p.alacakli.vekilAdres}` : ''}`)
  sat.push('')
  sat.push('Karşı taraf (borçlu):')
  if (p.borclular.length === 0) sat.push('  —')
  p.borclular.forEach((b, i) => sat.push(`  ${i + 1}) ${b.adUnvan}${b.tcVkn ? ` · TC/VKN: ${b.tcVkn}` : ''}${b.adres ? ` · ${b.adres}` : ''}`))
  sat.push('')
  sat.push('— DOSYA —')
  if (p.icra.hukukNo) sat.push(`Hukuk dosya no: ${p.icra.hukukNo}`)
  if (p.icra.daire) sat.push(`İcra dairesi: ${p.icra.daire}`)
  if (p.icra.dosyaNo) sat.push(`İcra dosya/esas no: ${p.icra.dosyaNo}`)
  sat.push('')
  sat.push('— UYUŞMAZLIK —')
  sat.push(`Konu: ${p.alacak.konu ?? 'Sigorta rücu alacağının tahsili (ödeme emrine itiraz)'}`)
  if (p.alacak.tutar) sat.push(`Alacak tutarı (asıl + işlemiş faiz): ${p.alacak.tutar}`)
  return sat.join('\n')
}

function KopyaButon({ metin }: { metin: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(metin); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* */ } }}
      className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-kr/40 hover:text-foreground"
    >
      {ok ? <><Check className="h-3.5 w-3.5 text-success" /> Kopyalandı</> : <><Copy className="h-3.5 w-3.5" /> Özeti kopyala</>}
    </button>
  )
}

export function ArabuluculukBaslat(p: ArabuluculukBaslatProps) {
  const ozet = ozetKur(p)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ustErr, setUstErr] = useState<string | null>(null)
  const router = useRouter()

  function ustlen() {
    setUstErr(null)
    start(async () => { const r = await onemliOlayUstlen(p.olayId); if (r.ok) router.refresh(); else setUstErr(r.error ?? 'Üstlenilemedi') })
  }

  function tamamla(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErr(null)
    start(async () => {
      const r = await onemliOlayTamamla({
        olayId: p.olayId,
        basvuruNo: String(fd.get('basvuruNo') ?? '').trim() || undefined,
        basvuruTarihi: String(fd.get('basvuruTarihi') ?? '').trim() || undefined,
        arabulucu: String(fd.get('arabulucu') ?? '').trim() || undefined,
        not: String(fd.get('not') ?? '').trim() || undefined,
      })
      if (r.ok) router.refresh()
      else setErr(r.error ?? 'Tamamlanamadı')
    })
  }

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-warning/40 bg-warning-soft/30 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/30 bg-warning-soft/40 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-[hsl(var(--warning-fg))]" />
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[hsl(var(--warning-fg))]">Önemli Olay · Borca İtiraz</div>
            <h2 className="font-display text-[17px] font-extrabold">Arabuluculuk Başvuru Hazırlığı</h2>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${p.durum === 'ISLEMDE' ? 'bg-info-soft text-info' : 'bg-warning-soft text-warning'}`}>
          {p.durum === 'ISLEMDE' ? <><Check className="h-3 w-3" /> İşlemde{p.sorumluAd ? ` · ${p.sorumluAd}` : ''}</> : <>Açık · üstlenilmedi</>}
        </span>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {/* üstlen (kilitle) */}
        {p.durum === 'ACIK' && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border-subtle bg-surface px-3.5 py-2.5">
            <span className="text-[12.5px] text-muted-foreground">Başvuruyu siz yürütecekseniz olayı üstlenin — çift iş önlenir.</span>
            <button onClick={ustlen} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold transition hover:border-kr/50 hover:text-kr disabled:opacity-60">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />} Üstlen
            </button>
            {ustErr && <span className="inline-flex items-center gap-1 text-[11px] text-danger"><Lock className="h-3 w-3" /> {ustErr}</span>}
          </div>
        )}

        {/* başvuru özeti — tek tıkla kopyala */}
        <div className="rounded-xl border border-border-subtle bg-surface p-[14px_16px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Başvuru için hazır bilgi</span>
            <KopyaButon metin={ozet} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Blok baslik="Alacaklı (başvurucu)">
              <Sat k="Ünvan" v={p.alacakli.unvan} />
              <Sat k="MERSİS/VKN" v={p.alacakli.mersisVkn} mono />
              <Sat k="Adres" v={p.alacakli.adres} />
              <Sat k="Vekil" v={p.alacakli.vekil} />
            </Blok>
            <Blok baslik={`Borçlu (${p.borclular.length})`}>
              {p.borclular.length === 0 ? <div className="text-[12px] text-muted-foreground">Borçlu kaydı yok — Borçlular bölümünden ekleyin.</div> : null}
              {p.borclular.map((b, i) => (
                <div key={i} className="border-b border-border-subtle pb-1.5 last:border-0 last:pb-0">
                  <div className="text-[12.5px] font-semibold">{b.adUnvan}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{[b.tcVkn, b.adres].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              ))}
            </Blok>
            <Blok baslik="Dosya / İcra">
              <Sat k="Hukuk dosya no" v={p.icra.hukukNo} mono />
              <Sat k="İcra dairesi" v={p.icra.daire} />
              <Sat k="İcra dosya/esas no" v={p.icra.dosyaNo} mono />
            </Blok>
            <Blok baslik="Uyuşmazlık">
              <Sat k="Konu" v={p.alacak.konu ?? 'Sigorta rücu alacağı (ödeme emrine itiraz)'} />
              <Sat k="Alacak tutarı" v={p.alacak.tutar} mono strong />
            </Blok>
          </div>
        </div>

        {/* tamamla (resmî teyit) */}
        <form onSubmit={tamamla} className="rounded-xl border border-border-subtle bg-surface p-[14px_16px]">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Resmî sisteme girildi mi? · Tamamla</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className={LBL}>Arabuluculuk başvuru no</label><input name="basvuruNo" defaultValue={p.prefill.basvuruNo ?? ''} placeholder="2026/1234" className={`${INP} font-mono`} /></div>
            <div><label className={LBL}>Başvuru tarihi</label><input name="basvuruTarihi" type="date" defaultValue={p.prefill.bugun} className={INP} /></div>
            <div><label className={LBL}>Arabulucu</label><input name="arabulucu" placeholder="Ad Soyad (varsa)" className={INP} /></div>
          </div>
          <div className="mt-3"><label className={LBL}>Not (ops.)</label><textarea name="not" rows={2} placeholder="başvuruya dair kısa not…" className={`${INP} resize-y`} /></div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-success px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-success/90 disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />} Arabuluculuğu tamamla (program teyidi)
            </button>
            <span className="text-[11.5px] text-muted-foreground">Tamamlanınca olay kuyruktan kalkar, dosya Arabuluculuk aşamasına geçer.</span>
            {err && <span className="text-[11.5px] text-danger">{err}</span>}
          </div>
        </form>
      </div>
    </section>
  )
}

function Blok({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[11px] border border-border-subtle bg-surface-muted/40 p-3">
      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-kr-ink">{baslik}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function Sat({ k, v, mono, strong }: { k: string; v: string | null | undefined; mono?: boolean; strong?: boolean }) {
  if (!v) return null
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[120px] shrink-0 text-[11px] text-muted-foreground">{k}</span>
      <span className={`min-w-0 flex-1 text-[12.5px] ${strong ? 'font-bold' : 'font-semibold'} text-foreground ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  )
}
