/**
 * KonsRücü — GENEL DURUM kutusu (S31) · components/dava/genel-durum.tsx
 * Künyede her zaman: üç eksen (icra / arabuluculuk / dava), para (talep / tahsil / kalan) ve açık süreler. Eksenlerden
 * TÜRETİLİR, elle yazılmaz. Eksenler henüz hesaplanmadıysa (gölge kip) bunu açıkça söyler.
 */
import type { genelDurum } from '@/lib/konsrucu/dava/pano'

const para = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺')

export function GenelDurumKutusu({ genelDurum: g }: { genelDurum: ReturnType<typeof genelDurum> }) {
  return (
    <section aria-label="Genel durum" className="rounded-2xl border border-border bg-surface px-5 py-3 shadow-card">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Genel durum</div>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
        <span><span className="text-muted-foreground">İCRA:</span> <b>{g.icra}</b></span>
        <span><span className="text-muted-foreground">ARABULUCULUK:</span> <b>{g.arab}</b></span>
        <span><span className="text-muted-foreground">DAVA:</span> <b>{g.dava}</b></span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
        <span>Talep <b className="font-mono">{para(g.para.talep)}</b></span>
        <span>Tahsil <b className="font-mono text-success">{para(g.para.tahsil)}</b></span>
        <span>Kalan <b className="font-mono">{para(g.para.kalan)}</b></span>
        <span>Açık süre <b>{g.acikSure}</b>{g.onaysizSure ? <span className="text-[hsl(var(--warning-fg))]"> ({g.onaysizSure} onaysız)</span> : null}</span>
      </div>
      {g.eksenYok && <p className="mt-1 text-[11px] text-muted-foreground">Eksenler henüz hesaplanmadı (gölge kip): eski durum alanı geçerli.</p>}
    </section>
  )
}
