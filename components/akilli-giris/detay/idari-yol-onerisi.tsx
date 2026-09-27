'use client'

/**
 * KonsRücü — Dosya Detay · AI idari yol önerisi bandı (S06; F18, B12).
 * AI triyajı "idari" dediğinde dosya artık kendiliğinden İDARİ_YOL'a geçmez; bu bant öneriyi (güven + gerekçe)
 * gösterir ve kararı avukata bırakır. [İdari yola al] yalnız AVUKAT/ADMIN'e görünür — asıl kapı sunucuda
 * (idariYolaAl rolü yeniden denetler). İki adımlı onay: yanlış tık dosyayı UYAP sorgusundan düşürmesin.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Loader2, AlertTriangle } from 'lucide-react'
import { idariYolaAl } from '@/app/(app)/akilli-giris/actions'
import { idariYolOnerisiBekliyor, guvenYuzde } from '@/lib/konsrucu/idari-yol'

export function IdariYolOnerisi({
  dosyaId, yol, yolGuven, yolNeden, durum, yetkili,
}: {
  dosyaId: string
  yol: string | null
  yolGuven: number | null
  yolNeden: string | null
  durum: string
  /** Sunucuda idariYolOnaylayabilir(dbUser) ile hesaplanır (AVUKAT/ADMIN). */
  yetkili: boolean
}) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [onayBekliyor, setOnayBekliyor] = useState(false)
  const router = useRouter()

  if (!idariYolOnerisiBekliyor({ yol, durum })) return null
  const g = guvenYuzde(yolGuven)

  function onayla() {
    setErr(null)
    start(async () => {
      const r = await idariYolaAl(dosyaId)
      if (!r.ok) { setErr(r.error ?? 'İşlem tamamlanamadı'); setOnayBekliyor(false) }
      else router.refresh()
    })
  }

  return (
    <div role="region" aria-label="AI idari yol önerisi" className="mt-[14px] rounded-2xl border border-info/30 bg-info-soft/40 px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-info-soft text-info"><Landmark className="h-[18px] w-[18px]" /></span>
        <div className="min-w-[240px] flex-1">
          <div className="text-[14px] font-bold text-foreground">
            AI idari yol öneriyor{g != null ? <span className="font-mono text-[12.5px] font-semibold text-muted-foreground"> · güven %{g}</span> : null}
          </div>
          {yolNeden?.trim() && <p className="mt-1 max-w-[80ch] text-[12.5px] leading-[1.5] text-foreground/85">{yolNeden.trim()}</p>}
          <p className="mt-1.5 max-w-[80ch] text-[11.5px] leading-[1.45] text-muted-foreground">
            Öneri dosyanın durumunu değiştirmez; karar avukatındır. İdari yola alınan dosyada UYAP sorgusu yapılmaz;
            görev hatırlatması ve zamanaşımı radarı sürer. İdari başvuru süreleri (İYUK) teyit gerekli.
          </p>
          {err && <p className="mt-1.5 text-[11.5px] font-medium text-danger">{err}</p>}
        </div>
        <div className="shrink-0">
          {!yetkili ? (
            <span className="inline-block max-w-[26ch] text-right text-[11.5px] text-muted-foreground">Yalnız avukat ya da yönetici idari yola alabilir.</span>
          ) : onayBekliyor && !pending ? (
            <div className="rounded-[10px] border border-warning/40 bg-warning-soft/40 px-3 py-2.5">
              <p className="flex max-w-[34ch] items-start gap-1.5 text-[12px] font-medium text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                Dosya İdari yol durumuna geçecek ve UYAP sorgusundan çıkacak. Karar kayda sizin adınızla geçer.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={onayla} className="rounded-lg bg-kr px-3 py-1.5 text-[12px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
                  Evet, idari yola al
                </button>
                <button type="button" onClick={() => setOnayBekliyor(false)} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => { setErr(null); setOnayBekliyor(true) }}
              className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} İdari yola al
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
