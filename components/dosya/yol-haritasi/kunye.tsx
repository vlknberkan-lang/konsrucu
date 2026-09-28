/**
 * KonsRücü — Dosya Yol Haritası · künye · components/dosya/yol-haritasi/kunye.tsx
 *
 * Dosya no · müvekkil · borçlu sayısı · takip çıkışı; üç eksen rozeti ve her rozetin yanında KAYNAĞI
 * ("avukat onaylı", "UYAP, teyitsiz", "tahmin, teyit edin"); UYAP bağlantısı (eklentinin son nabzından, tahmin
 * değil); "Ayrıntılı görünüm (eski)" bağlantısı. Kişisel veri yok (borçlu adları gösterilmez).
 */
import { Plug, PlugZap, FlaskConical } from 'lucide-react'
import type { YolHaritasiGorunum } from '@/lib/konsrucu/yol-haritasi/gorunum'
import type { EksenKaynagi } from '@/lib/konsrucu/yol-haritasi/duraklar'
import { Badge, type Tone } from '@/components/konsrucu/ui'

const EKSEN_ADI = { ICRA: 'İcra', ARB: 'Arabuluculuk', DAVA: 'Dava' } as const
const KAYNAK_TONU: Record<EksenKaynagi, Tone> = { AVUKAT_ONAYLI: 'success', UYAP_TEYITSIZ: 'info', TAHMIN: 'steel' }

export function YolHaritasiKunye({ gorunum, eskiGorunumHref }: {
  gorunum: YolHaritasiGorunum
  /** Eski dosya ekranı ("Ayrıntılı görünüm (eski)"); verilmezse bağlantı gösterilmez. */
  eskiGorunumHref?: string
}) {
  const g = gorunum
  const UyapIkon = g.uyap.durum === 'ACIK' ? PlugZap : g.uyap.durum === 'PROVA' ? FlaskConical : Plug
  return (
    <section aria-label="Künye" className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-card">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dosya yol haritası</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] text-foreground">
        <span className="font-mono font-semibold">{g.hukukDosyaNo ?? 'Hukuk no yok'}</span>
        {g.muvekkil && <span className="text-muted-foreground">· {g.muvekkil}</span>}
        <span className="text-muted-foreground">· {g.borcluSayisi ? `${g.borcluSayisi} borçlu` : 'borçlu yok'}</span>
        {g.takipCikisi && <span className="text-muted-foreground">· Takip çıkışı <span className="font-mono tabular-nums text-foreground">{g.takipCikisi}</span></span>}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2" aria-label="Eksenler">
        {g.eksenler.map((e) => (
          <li key={e.eksen} className="flex items-center gap-2 text-[13px]">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{EKSEN_ADI[e.eksen]}</span>
            <span className="font-semibold text-foreground">{e.etiket}</span>
            <Badge tone={KAYNAK_TONU[e.kaynak]}>{e.kaynakMetni}</Badge>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <span className={`inline-flex items-center gap-1.5 ${g.uyap.durum === 'KAPALI' ? 'text-warning' : 'text-muted-foreground'}`}>
          <UyapIkon className="h-3.5 w-3.5" aria-hidden />{g.uyap.metin}
        </span>
        {eskiGorunumHref && (
          <a href={eskiGorunumHref} className="rounded-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Tüm ayrıntılar
          </a>
        )}
      </div>
    </section>
  )
}
