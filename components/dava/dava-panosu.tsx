/**
 * KonsRücü — DAVA PANOSU tablosu (server component) · components/dava/dava-panosu.tsx
 * Bütün davalar tek tabloda: dosya, mahkeme/esas, evre, sonraki duruşma, en yakın açık süre, son gelişme, DURUM GÜVENİ
 * (teyitli / teyitsiz / eskimiş). Davası açılmamış açık İİK 67 kayıtları "(dava açılmadı)" satırıyla görünür.
 */
import Link from 'next/link'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import type { PanoSatiriUI } from '@/lib/konsrucu/dava/veri'

const GUVEN: Record<string, { label: string; tone: Tone }> = {
  TEYITLI: { label: 'Teyitli', tone: 'success' },
  TEYITSIZ: { label: 'Teyitsiz', tone: 'warning' },
  ESKIMIS: { label: 'Eskimiş', tone: 'danger' },
}
const COLS = 'grid-cols-[110px_minmax(220px,1.4fr)_140px_130px_110px_110px_100px]'

export function DavaPanosuTablo({ satirlar }: { satirlar: PanoSatiriUI[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="overflow-x-auto">
        <div className={`font-mono grid ${COLS} min-w-[960px] gap-2 border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
          <span>Dosya</span><span>Mahkeme / esas</span><span>Evre</span><span>Sonraki</span><span>Süre</span><span>Son gelişme</span><span>Güven</span>
        </div>
        {satirlar.map((s) => {
          const g = GUVEN[s.guven]
          const sureTon: Tone = s.sureKalanGun == null ? 'steel' : s.sureKalanGun <= 7 || s.sureOnaysiz ? 'danger' : s.sureKalanGun <= 30 ? 'warning' : 'steel'
          return (
            <div key={s.anahtar} className={`grid ${COLS} min-w-[960px] items-center gap-2 border-b border-border-subtle px-5 py-2.5 text-[13px] last:border-0 hover:bg-surface-muted/50`}>
              <Link href={`/dosya/${s.dosyaId}`} className="font-mono truncate text-[12.5px] font-bold hover:text-kr hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">{s.dosya}</Link>
              <span className="truncate">{s.mahkemeEsas}{s.karsiTaraf && <span className="ml-1.5"><Badge tone="danger">karşı taraf</Badge></span>}</span>
              <span className="truncate">{s.evre}{s.evreTuretildi && <span className="text-[10.5px] text-muted-foreground"> (türetilmiş)</span>}</span>
              <span className="font-mono text-[12px]">{s.sonrakiEtiket}</span>
              <span>{s.sureKalanGun != null ? <Badge tone={sureTon} dot={sureTon === 'danger'}><span className="font-mono">{s.sureEtiket}</span></Badge> : '—'}</span>
              <span className="font-mono text-[12px] text-muted-foreground">{s.sonGelismeEtiket}</span>
              <span><Badge tone={g.tone}>{g.label}</Badge></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
