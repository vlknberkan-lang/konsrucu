'use client'

/**
 * KonsRücü — Bulduklarımız · alan satırı · components/dosya/oneri/oneri-satiri.tsx  (S18)
 *
 * Bir alanın onaylı (kilitli) değeri ve bekleyen önerileri. Her öneride kaynak türü (Kural / Hugo / AI …), belge,
 * sayfa ve alıntı; [Doğru] [Düzelt] [Yanlış]. Onaylı değer varken gelen farklı öneri kilidi ezmez, "yeni değer"
 * olarak yanında bekler. Kritik alanı yalnız avukat onaylar; yardımcı "avukat onayı bekliyor" görür.
 * Maskeli değer (plaka) yalnız [Göster] ile açılır ve açılış Aktivite'ye yazılır.
 */
import { useState } from 'react'
import { Check, Pencil, X, Eye, Loader2, Lock, FileSearch, AlertTriangle } from 'lucide-react'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { oneriOnaylaEylem, oneriDuzeltEylem, oneriReddetEylem, oneriDegeriniGosterEylem } from '@/app/(app)/dosya-islem/oneri-actions'
import type { AlanSatiri, KullaniciYetkisi, OneriGorunum } from '@/lib/konsrucu/oneri/tipler'
import type { KaynakHedefi } from './kaynak-goster'
import { DUGME_IKINCIL, DUGME_ONAY, DUGME_RET, GIRDI, useEylem } from './ortak'

const KAYNAK_TON: Record<string, Tone> = { KURAL: 'info', HUGO: 'info', EXCEL: 'info', UYAP: 'info', AI: 'kr', ELLE: 'steel' }
const MONO_TIPLER = new Set(['PARA', 'TARIH', 'ODEME', 'PLAKA', 'PLAKA_LISTE', 'ORAN'])
const BRANS_SECENEK = [{ d: 'KASKO', e: 'Kasko' }, { d: 'ZMMS', e: 'ZMSS (trafik)' }, { d: 'OTO_DISI', e: 'Oto dışı' }]

function KaynakBilgisi({ o, onKaynakGoster }: { o: OneriGorunum; onKaynakGoster: (h: KaynakHedefi) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
      <Badge tone={KAYNAK_TON[o.kaynakTuru] ?? 'steel'}>{o.kaynakEtiketi}</Badge>
      {o.belgeId ? (
        <button
          type="button"
          onClick={() => onKaynakGoster({ belgeId: o.belgeId!, belgeAdi: o.belgeAdi, sayfa: o.sayfa, alinti: o.alinti, alintiDurumu: o.alintiDurumu, acilabilir: o.belgeAcilabilir })}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-[1px] text-[10.5px] font-medium transition hover:border-kr/40 hover:text-kr-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Kaynağı göster"
        >
          <FileSearch className="h-3 w-3" aria-hidden /> <span className="max-w-[180px] truncate">{o.belgeAdi ?? 'Belge'}</span>{o.sayfa ? <span className="font-mono">s.{o.sayfa}</span> : null}
        </button>
      ) : o.kaynakTuru === 'HUGO' || o.kaynakTuru === 'EXCEL' ? (
        <span>Hugo satırı</span>
      ) : null}
      {o.alintiDurumu === 'KAYNAKSIZ' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-[1px] text-[10.5px] font-semibold text-danger">
          <AlertTriangle className="h-3 w-3" aria-hidden /> KAYNAKSIZ · alıntı belgede bulunamadı
        </span>
      )}
      {o.guven != null && <span className="font-mono text-[10.5px]">güven %{Math.round(o.guven * 100)}</span>}
      {o.alinti && <q className="line-clamp-2 basis-full text-[11.5px] italic text-muted-foreground">{o.alinti}</q>}
    </div>
  )
}

function DuzeltFormu({ satir, o, onVazgec, onKaydet, bekliyor }: {
  satir: AlanSatiri; o: OneriGorunum; bekliyor: boolean
  onVazgec: () => void; onKaydet: (deger: string, tarih?: string) => void
}) {
  const [deger, setDeger] = useState(o.duzelt.deger)
  const [tarih, setTarih] = useState(o.duzelt.tarih)
  const etiket = `${satir.etiket} için doğru değer`
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); onKaydet(deger, satir.tip === 'ODEME' ? tarih : undefined) }}
    >
      {satir.tip === 'TARIH' ? (
        <input type="date" required aria-label={etiket} className={GIRDI} value={deger} onChange={(e) => setDeger(e.target.value)} />
      ) : satir.tip === 'BRANS' ? (
        <select required aria-label={etiket} className={GIRDI} value={deger} onChange={(e) => setDeger(e.target.value)}>
          <option value="">Branş seçin</option>
          {BRANS_SECENEK.map((b) => <option key={b.d} value={b.d}>{b.e}</option>)}
        </select>
      ) : satir.tip === 'ODEME' ? (
        <>
          <input type="date" aria-label="Ödeme tarihi" className={GIRDI} value={tarih} onChange={(e) => setTarih(e.target.value)} />
          <input inputMode="decimal" required aria-label="Ödeme tutarı" placeholder="1.234,56" className={`${GIRDI} w-[140px] font-mono`} value={deger} onChange={(e) => setDeger(e.target.value)} />
        </>
      ) : (
        <input
          required aria-label={etiket} className={`${GIRDI} min-w-[200px] ${MONO_TIPLER.has(satir.tip) ? 'font-mono' : ''}`}
          inputMode={satir.tip === 'PARA' ? 'decimal' : undefined}
          placeholder={satir.tip === 'PARA' ? '1.234,56' : satir.tip === 'ORAN' ? '% 100' : satir.tip === 'PLAKA' ? '34 ABC 123' : satir.tip === 'PLAKA_LISTE' ? '34 ABC 123, 06 KR 4567' : ''}
          value={deger} onChange={(e) => setDeger(e.target.value)}
        />
      )}
      <button type="submit" disabled={bekliyor} className={DUGME_ONAY}>
        {bekliyor ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />} Düzeltip onayla
      </button>
      <button type="button" onClick={onVazgec} className={DUGME_IKINCIL}>Vazgeç</button>
    </form>
  )
}

export function OneriSatiri({ dosyaId, satir, yetki, onKaynakGoster }: {
  dosyaId: string
  satir: AlanSatiri
  yetki: KullaniciYetkisi
  onKaynakGoster: (h: KaynakHedefi) => void
}) {
  const { calistir, buMu, bekliyor, hata } = useEylem()
  const [duzeltilen, setDuzeltilen] = useState<string | null>(null)
  const [acik, setAcik] = useState<Record<string, { deger: string; alinti: string | null }>>({})
  const [tumu, setTumu] = useState(false)
  const kilit = satir.onayli?.id ?? null
  const gorunen = tumu ? satir.oneriler : satir.oneriler.slice(0, 3)
  const mono = MONO_TIPLER.has(satir.tip) ? 'font-mono' : ''

  function goster(o: OneriGorunum) {
    calistir(`goster:${o.id}`, async () => {
      const r = await oneriDegeriniGosterEylem({ dosyaId, oneriId: o.id })
      if (r.ok) setAcik((a) => ({ ...a, [o.id]: { deger: r.deger, alinti: r.alinti } }))
      return r
    })
  }

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="w-[168px] shrink-0 pt-0.5">
          <div className="text-[12.5px] font-semibold text-foreground">{satir.etiket}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {satir.kritik && <Badge tone="warning">kritik</Badge>}
            {satir.celiski && <Badge tone="danger" dot>ÇELİŞKİ</Badge>}
          </div>
        </div>

        <div className="min-w-[240px] flex-1 space-y-3">
          {satir.onayli && (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-success" aria-hidden />
                <span className={`text-[13px] font-semibold text-foreground ${mono}`}>{acik[satir.onayli.id]?.deger ?? satir.onayli.deger}</span>
                <Badge tone="success">ONAYLI · kilitli</Badge>
                {satir.onayli.maskeli && !acik[satir.onayli.id] && (
                  <button type="button" disabled={bekliyor} onClick={() => goster(satir.onayli!)} className={DUGME_IKINCIL}><Eye className="h-3 w-3" aria-hidden /> Göster</button>
                )}
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                {satir.onayli.onaylayanAd ? `${satir.onayli.onaylayanAd} onayladı` : 'Onaylandı'} · kaynak: {satir.onayli.kaynakEtiketi}. Yeniden çıkarım bu değeri değiştirmez.
              </div>
            </div>
          )}

          {gorunen.map((o) => (
            <div key={o.id} className={satir.onayli ? 'rounded-xl border border-border-subtle bg-surface-muted/60 p-2.5' : ''}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-warning">{satir.onayli ? 'Yeni değer · onay bekliyor' : 'Öneri · onay bekliyor'}</span>
                <span className={`text-[13px] font-semibold text-foreground ${mono}`}>{acik[o.id]?.deger ?? o.deger}</span>
                {o.onayliylaAyni && <Badge tone="steel">onaylıyla aynı</Badge>}
                {o.maskeli && !acik[o.id] && (
                  <button type="button" disabled={bekliyor} onClick={() => goster(o)} className={DUGME_IKINCIL}>
                    {buMu(`goster:${o.id}`) ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />} Göster
                  </button>
                )}
              </div>
              <KaynakBilgisi o={acik[o.id]?.alinti ? { ...o, alinti: acik[o.id].alinti } : o} onKaynakGoster={onKaynakGoster} />

              {satir.karar ? (
                <div className="mt-2"><a href="#yh-rucu-sebebi" className={DUGME_IKINCIL}>Seç</a></div>
              ) : duzeltilen === o.id ? (
                <DuzeltFormu
                  satir={satir} o={o} bekliyor={buMu(`duzelt:${o.id}`)}
                  onVazgec={() => setDuzeltilen(null)}
                  onKaydet={(deger, tarih) => calistir(`duzelt:${o.id}`, () => oneriDuzeltEylem({ dosyaId, oneriId: o.id, beklenenOnayliId: kilit, deger, tarih }), () => setDuzeltilen(null))}
                />
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {o.onaylayabilir ? (
                    <>
                      <button type="button" disabled={bekliyor} onClick={() => calistir(`onay:${o.id}`, () => oneriOnaylaEylem({ dosyaId, oneriId: o.id, beklenenOnayliId: kilit }))} className={DUGME_ONAY}>
                        {buMu(`onay:${o.id}`) ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />} {satir.onayli ? 'Bununla değiştir' : 'Doğru'}
                      </button>
                      <button type="button" disabled={bekliyor} onClick={() => setDuzeltilen(o.id)} className={DUGME_IKINCIL}><Pencil className="h-3 w-3" aria-hidden /> Düzelt</button>
                    </>
                  ) : (
                    <span className="text-[11.5px] text-muted-foreground">Avukat onayı bekliyor.</span>
                  )}
                  {yetki.duzenleyebilir && (
                    <button type="button" disabled={bekliyor} onClick={() => calistir(`ret:${o.id}`, () => oneriReddetEylem({ dosyaId, oneriId: o.id }))} className={DUGME_RET}>
                      {buMu(`ret:${o.id}`) ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <X className="h-3 w-3" aria-hidden />} Yanlış
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {satir.oneriler.length > 3 && (
            <button type="button" onClick={() => setTumu((t) => !t)} className="text-[11.5px] font-semibold text-kr-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {tumu ? 'Daha az göster' : `${satir.oneriler.length - 3} öneri daha`}
            </button>
          )}
        </div>
      </div>
      {hata && <p role="alert" className="mt-2 text-[12px] font-medium text-danger">{hata}</p>}
    </li>
  )
}
