'use client'

/**
 * KonsRücü — Dosya Yol Haritası · ŞİMDİ kartı · components/dosya/yol-haritasi/simdi-karti.tsx
 *
 * Ekranın en üstünde tek iş (06 §2(b)): tek cümle, tek birincil (dolu, marka renkli) düğme, bir cümlelik gerekçe,
 * "Neden?" (kural kodu + kanıt + alıntı), varsa son gün (önerilen / onaylanan), kim ve kural kodu. İş yoksa
 * "BEKLİYORUZ" kartı: beklenen gelişme ve yapmanız gereken bir şey olmadığı açıkça yazar.
 *
 * Rol farkı: avukat adımını yardımcı görür ama düğme yerine "Bu adım avukat onayını bekliyor" yazar; görüntüleyen
 * eylem görmez. Renk yalnız anlam taşır ve yazıyla da söylenir (ENGEL, SÜRE RİSKİ, ONAY BEKLİYOR …).
 */
import { useId, useState } from 'react'
import { ArrowRight, ChevronDown, Hourglass, AlertTriangle, CalendarClock } from 'lucide-react'
import type { Adim, EylemHedef } from '@/lib/konsrucu/yol-haritasi/tipler'
import { Badge } from '@/components/konsrucu/ui'
import { NedenPaneli } from './neden-paneli'
import { OneriGeriBildirim } from './geri-bildirim'
import { adimTonu, eylemHref, eylemYetkisi, gunGoster, kalanMetni, ROL_METNI } from './eylem'

export interface SimdiKartiProps {
  dosyaId: string
  /** Şimdi adımı; yoksa `bekleme` gösterilir. */
  simdi: Adim | null
  bekleme: Adim | null
  kullaniciRol: string
  /** Prova tarihi (YYYY-MM-DD) ya da null. */
  prova: string | null
  /** Hedef başına adres (Bağla aşaması); verilmeyen hedef sayfa içi çapaya gider. */
  eylemHrefleri?: Partial<Record<EylemHedef, string>>
  /** "{belgeId}" yer tutuculu belge adresi (Neden? panelindeki kanıt bağlantıları için). */
  belgeHrefSablonu?: string
}

export function SimdiKarti({ dosyaId, simdi, bekleme, kullaniciRol, prova, eylemHrefleri, belgeHrefSablonu }: SimdiKartiProps) {
  const [nedenAcik, setNedenAcik] = useState(false)
  const nedenId = useId()
  const adim = simdi ?? bekleme

  if (!adim) {
    return (
      <section aria-label="Şimdi" className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-card">
        <p className="text-[14px] text-foreground">Şu an yapmanız gereken bir iş yok.</p>
      </section>
    )
  }

  const bekliyoruz = !simdi
  const ton = adimTonu(adim)
  const yetki = eylemYetkisi(adim.rol, kullaniciRol)
  const cerceve = bekliyoruz
    ? 'border-info/30 bg-info-soft/30'
    : ton.tone === 'danger' ? 'border-danger/40 bg-danger-soft/30' : ton.tone === 'warning' ? 'border-warning/40 bg-warning-soft/25' : 'border-border bg-surface'

  return (
    <section aria-label={bekliyoruz ? 'Bekliyoruz' : 'Şimdi'} className={`rounded-2xl border px-5 py-4 shadow-card ${cerceve}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{bekliyoruz ? 'Bekliyoruz' : 'Şimdi'}</span>
            <Badge tone={ton.tone} dot>{ton.etiket}</Badge>
          </div>
          <h2 className="font-display mt-1.5 flex items-start gap-2 text-[18px] font-extrabold leading-snug tracking-[-0.02em] text-foreground">
            {bekliyoruz && <Hourglass className="mt-1 h-4 w-4 shrink-0 text-info" aria-hidden />}
            {adim.engel && <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-danger" aria-hidden />}
            <span>{adim.metin}</span>
          </h2>
          <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-[1.5] text-foreground/85">
            <span className="text-muted-foreground">Neden: </span>{adim.neden}
          </p>
          {adim.sonGun && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-foreground">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Son gün: <span className="font-mono tabular-nums">{gunGoster(adim.sonGun)}</span>
              {adim.kalanGun != null && <span className={adim.kalanGun < 0 ? 'font-semibold text-danger' : 'text-muted-foreground'}>({kalanMetni(adim.kalanGun)})</span>}
              {adim.hukukiEtiket && <span className="text-muted-foreground">· teyit gerekli</span>}
            </p>
          )}
          {!bekliyoruz && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Kim: {ROL_METNI[adim.rol]}
              {adim.adet > 1 && <> · bu türden {adim.adet} iş</>}
            </p>
          )}
        </div>

        {!bekliyoruz && adim.eylem && (
          <div className="shrink-0">
            {yetki === 'YAPABILIR' ? (
              <a
                href={eylemHref(adim.eylem.hedef, eylemHrefleri)}
                className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
              >
                {adim.eylem.etiket} <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            ) : yetki === 'AVUKAT_ONAYI_BEKLIYOR' ? (
              <span className="inline-block max-w-[28ch] rounded-lg border border-border px-3 py-2 text-[12.5px] text-muted-foreground">Bu adım avukat onayını bekliyor.</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={nedenAcik}
          aria-controls={nedenAcik ? nedenId : undefined}
          onClick={() => setNedenAcik((x) => !x)}
          className="inline-flex items-center gap-1 rounded-sm text-[12.5px] font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Neden? <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${nedenAcik ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {nedenAcik && <NedenPaneli id={nedenId} adim={adim} belgeHrefSablonu={belgeHrefSablonu} />}

      <OneriGeriBildirim dosyaId={dosyaId} adim={adim} prova={prova} kullaniciRol={kullaniciRol} />
    </section>
  )
}
