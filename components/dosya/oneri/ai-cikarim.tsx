'use client'

/**
 * KonsRücü — "Yapay zekâ çıkarımı" kartı · components/dosya/oneri/ai-cikarim.tsx
 *
 * Hazırlık ekranının (Bağla aşaması, 1. durak) başında durur: "AI ile Çıkarım Yap" düğmesi + son çıkarımın özeti
 * (olay bağlamı, özet, riskler ve öneriler, önerilen adımlar). Eski ayrıntılı ekrandaki "AI ile Çıkarım Yap" ve
 * "Kaynak & Gerekçe" bölümünün yeni ekrandaki karşılığıdır. Düğme kuralOnerileriniUretEylem'i çalıştırır: kural ve
 * Excel önerileri + yüzey açıksa yapay zekâ; bulunan değerler Bulduklarımız'da onay bekler, borçlular teyit ister.
 * Fotoğraf ve taranmış görüntüler (ör. el yazılı kaza tespit tutanağı) okunmaz; kart bunu sayısıyla söyler.
 *
 * Veri: lib/konsrucu/oneri/yukle.ts · oneriPaneliYukle(dosyaId).aiCikarim (metinler sunucuda maskelenmiş).
 */
import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, ChevronRight, ImageOff, ListChecks, Loader2, Scale, Search, Sparkles } from 'lucide-react'
import { kuralOnerileriniUretEylem } from '@/app/(app)/dosya-islem/oneri-actions'
import { Badge } from '@/components/konsrucu/ui'
import { MentorGeriBildirim } from '@/components/akilli-giris/detay/mentor-geri-bildirim'
import type { AiCikarimVerisi } from '@/lib/konsrucu/oneri/tipler'
import { tarihTR, saatTR } from '@/lib/konsrucu/format'
import { bulMesaji } from './bulduklarimiz'
import { BolumBasligi, HataSatiri, useEylem } from './ortak'

const YOL_ETIKET: Record<string, string> = { KLASIK: 'Klasik icra', IDARI: 'İdari yol', BELIRSIZ: 'Yol belirsiz' }

/** Kartın tek eylemi; öteki kart düğmelerinden biraz büyük (ekranda aranan düğme bu). */
const DUGME =
  'inline-flex items-center gap-1.5 rounded-[10px] border border-kr/[0.25] bg-kr-soft px-3.5 py-2 text-[13px] font-semibold text-kr-ink transition hover:bg-kr-soft/70 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'

export function AiCikarim({ veri, capa = 'yh-ai-cikarim' }: { veri: AiCikarimVerisi; capa?: string }) {
  const { calistir, buMu, bekliyor, hata } = useEylem()
  const [bilgi, setBilgi] = useState<string | null>(null)
  const [baglamAcik, setBaglamAcik] = useState(false)
  const etiket = veri.aiAcik ? 'AI ile Çıkarım Yap' : 'Belgelerden bul'
  const ozetVar = !!(veri.olayBaglami || veri.ozet || veri.teyitler.length || veri.sonrakiAdimlar.length)

  const baslik = veri.sonCalisma
    ? `Son çıkarım ${tarihTR(veri.sonCalisma.at)} ${saatTR(veri.sonCalisma.at)}${veri.sonCalisma.kim ? ` · ${veri.sonCalisma.kim}` : ''}`
    : veri.metinliBelge ? 'Belgeler henüz yapay zekâyla okunmadı' : 'Önce evrak yükleyin'

  const dugme = veri.yetki.duzenleyebilir ? (
    <button
      type="button" disabled={bekliyor} className={DUGME}
      onClick={() => calistir('ai', async () => {
        setBilgi(veri.aiAcik ? 'Belgeler yapay zekâyla okunuyor; bu bir dakika kadar sürebilir.' : null)
        const r = await kuralOnerileriniUretEylem({ dosyaId: veri.dosyaId })
        setBilgi(r.ok ? bulMesaji(r) : null)
        return r
      })}
    >
      {buMu('ai') ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} {etiket}
    </button>
  ) : null

  return (
    <section id={capa} aria-labelledby="ai-cikarim-baslik" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <BolumBasligi
        id="ai-cikarim-baslik" kicker="Yapay zekâ çıkarımı" baslik={baslik}
        alt={veri.aiAcik
          ? <>Yapay zekâ {veri.metinliBelge} belgenin metnini okur: taraflar, borçlular, kaza, kusur, tutar ve ödemeler. Bulduğu her bilgi aşağıda Bulduklarımız&apos;da onay bekler; eklediği borçlular teyit ister.</>
          : <>Yapay zekâ kapalı: düğme belge kurallarından ve içe aktarılan Excel satırından öneri üretir.</>}
        sag={dugme}
      />

      {bilgi && <p role="status" className="border-b border-border-subtle px-5 py-2.5 text-[12.5px] text-foreground">{bilgi}</p>}

      {veri.metinsizBelge > 0 && (
        <div className="flex items-start gap-2.5 border-b border-border-subtle bg-warning-soft px-5 py-2.5 text-[12.5px] text-[hsl(var(--warning-fg))]">
          <ImageOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {veri.metinsizBelge} belgenin metni yok (taranmış görüntü, ör. el yazılı kaza tespit tutanağı); yapay zekâ bunları okumaz.
            {' '}Tutanaksa belgeyi açıp türünü seçin, borçlu bilgisini elle girin.{' '}
            <Link href={`/dosya/${veri.dosyaId}?sekme=evrak&evrak=bizim`} className="font-semibold underline underline-offset-2 hover:no-underline">Evrağa git</Link>
          </span>
        </div>
      )}

      {ozetVar && (
        <div className="flex flex-col gap-4 px-5 py-4">
          {(veri.olayTuru || veri.yol || veri.yolGuven != null) && (
            <div className="flex flex-wrap items-center gap-2">
              {veri.olayTuru && <Badge tone="info">{veri.olayTuru}</Badge>}
              {veri.yol && <Badge tone="kr">{YOL_ETIKET[veri.yol] ?? veri.yol}</Badge>}
              {veri.yolGuven != null && <Badge tone="success" dot>Güven %{Math.round(veri.yolGuven * 100)}</Badge>}
            </div>
          )}

          {veri.olayBaglami && (
            <div className="rounded-xl border border-kr/25 bg-kr-soft/40 px-4 py-3">
              <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-kr-ink"><Search className="h-3.5 w-3.5" aria-hidden /> Olay bağlamı</div>
              <p className={`mt-1.5 whitespace-pre-line text-[13px] leading-[1.6] text-foreground ${baglamAcik ? '' : 'line-clamp-4'}`}>{veri.olayBaglami}</p>
              <button type="button" onClick={() => setBaglamAcik((a) => !a)} aria-expanded={baglamAcik} className="mt-1 text-[12px] font-semibold text-kr hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {baglamAcik ? 'Kısalt' : 'Tamamını göster'}
              </button>
            </div>
          )}

          {veri.ozet && (
            <div className="rounded-xl border border-border-subtle bg-surface-muted px-4 py-3">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Özet</div>
              <p className="mt-1 text-[13px] leading-[1.55] text-foreground">{veri.ozet}</p>
            </div>
          )}

          {veri.teyitler.length > 0 && (
            <div>
              <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Riskler ve öneriler</div>
              <ul className="flex flex-col gap-2">
                {veri.teyitler.map((t, i) => {
                  const m = t.tip === 'uyari'
                    ? { I: AlertTriangle, cls: 'border-warning/40 bg-warning-soft text-[hsl(var(--warning-fg))]' }
                    : t.tip === 'ok' ? { I: Check, cls: 'border-success/30 bg-success-soft text-success' } : { I: Scale, cls: 'border-kr/30 bg-kr-soft text-kr-ink' }
                  return (
                    <li key={i} className={`flex items-start gap-2.5 rounded-[11px] border px-3 py-2.5 ${m.cls}`}>
                      <m.I className="mt-px h-4 w-4 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <span className="text-[12.5px] leading-[1.45]">{t.not}</span>
                        <div><MentorGeriBildirim dosyaId={veri.dosyaId} kaynak="TEYIT" hedef={t.not} olayTuru={veri.olayTuru} /></div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {veri.sonrakiAdimlar.length > 0 && (
            <details className="group rounded-xl border border-border-subtle">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
                <ListChecks className="h-3.5 w-3.5 text-kr" aria-hidden /> Önerilen adımlar ({veri.sonrakiAdimlar.length})
              </summary>
              <ol className="flex flex-col gap-1.5 px-3.5 pb-3">
                {veri.sonrakiAdimlar.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-[11px] border border-border-subtle bg-surface-muted/40 px-3 py-2 text-[12.5px] leading-[1.45] text-foreground">
                    <span className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-kr-soft font-mono text-[10px] font-bold text-kr-ink">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <span>{s}</span>
                      <div><MentorGeriBildirim dosyaId={veri.dosyaId} kaynak="ADIM" hedef={s} olayTuru={veri.olayTuru} /></div>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      <HataSatiri hata={hata} />
    </section>
  )
}
