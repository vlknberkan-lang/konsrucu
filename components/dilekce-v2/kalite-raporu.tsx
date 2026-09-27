'use client'

/**
 * KonsRücü — Kalite raporu (S37, 06 §7.4) · components/dilekce-v2/kalite-raporu.tsx
 *
 * DilekceUretici'nin yanında gösterilir: kırmızı kapılar "imzaya hazır"ı kilitler, sarı uyarılar (tensip
 * provası bilgi maddeleri + hâkim gözü) yalnız bilgilendirir. Doğrulanmamış atıf, avukat rolündeyken tek tek,
 * kayıtlı gerekçeyle (kim, ne zaman, resmî bağlantı) onaylanabilir; onay Aktivite'ye yazılır.
 */
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { dilekceV2AtifOnayla, dilekceV2KaliteKontrolEt } from '@/app/(app)/dilekceler/uret/actions'
import { KIRMIZI_KAPI_ETIKETI, type KaliteRaporu as KaliteRaporuTipi } from '@/lib/konsrucu/dilekce-v2/kapilar'
import { alan, ikincilDugme, kart as kartCls, kucukDugme, odak, sessizDugme } from './stil'

export type KaliteRaporuProps = {
  /** Kontrol edilecek DilekceSurum.id (AVUKAT satırı). */
  surumId: string
  /** O an ekranda düzenlenmekte olan metin (kaydedilmemiş değişiklikler dâhil). */
  metin: string
  avukat: boolean
}

export function KaliteRaporu({ surumId, metin, avukat }: KaliteRaporuProps) {
  const [rapor, setRapor] = useState<KaliteRaporuTipi | null>(null)
  const [bekliyor, setBekliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [acikOnay, setAcikOnay] = useState<string | null>(null)
  const [resmiUrl, setResmiUrl] = useState('')
  const [gerekce, setGerekce] = useState('')
  const [onayBekliyor, setOnayBekliyor] = useState(false)

  async function kontrolEt() {
    if (!metin.trim() || bekliyor) return
    setBekliyor(true); setHata(null)
    try {
      const r = await dilekceV2KaliteKontrolEt({ surumId, metin })
      if (!r.ok) { setHata(r.error); return }
      setRapor(r.rapor)
    } catch {
      setHata('Kalite raporu alınamadı. Bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setBekliyor(false)
    }
  }

  async function atifOnayla(anahtar: string) {
    if (onayBekliyor) return
    setOnayBekliyor(true); setHata(null)
    try {
      const r = await dilekceV2AtifOnayla({ surumId, anahtar, resmiUrl: resmiUrl.trim() || undefined, gerekce: gerekce.trim() || undefined })
      if (!r.ok) { setHata(r.error); return }
      setAcikOnay(null); setResmiUrl(''); setGerekce('')
      await kontrolEt()
    } catch {
      setHata('Atıf onayı kaydedilemedi. Tekrar deneyin.')
    } finally {
      setOnayBekliyor(false)
    }
  }

  return (
    <section className={kartCls} aria-labelledby="kalite-raporu-baslik">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="kalite-raporu-baslik" className="font-display text-base font-extrabold">Kalite raporu</h2>
        <button type="button" onClick={kontrolEt} disabled={bekliyor || !metin.trim()} className={`${kucukDugme} border border-border hover:bg-surface-muted`}>
          {bekliyor ? <Loader2 className="dd-spin h-3.5 w-3.5" aria-hidden /> : null} Kaliteyi kontrol et
        </button>
      </div>
      <div className="space-y-3 p-4 text-xs leading-5">
        {hata && <p role="alert" className="text-danger">{hata}</p>}
        {!rapor && !hata && <p className="text-muted-foreground">Kaydetmeden önce "Kaliteyi kontrol et" ile kırmızı ve sarı bulguları görün. Kırmızı kalan bulgu varken "İmzaya hazır" kabul edilmez.</p>}
        {rapor && (
          <>
            <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
              <Badge tone={rapor.imzayaHazirOlabilir ? 'success' : 'danger'} dot>
                {rapor.imzayaHazirOlabilir ? 'Kırmızı bulgu yok' : `${rapor.kirmizi.length} kırmızı bulgu`}
              </Badge>
              {rapor.sari.length > 0 && <Badge tone="warning">{rapor.sari.length} sarı uyarı</Badge>}
            </div>

            {rapor.kirmizi.length > 0 && (
              <ul className="space-y-2">
                {rapor.kirmizi.map((b, i) => (
                  <li key={`${b.kod}-${i}`} className="rounded-lg border border-danger/30 bg-danger-soft/40 p-2.5">
                    <Badge tone="danger">{KIRMIZI_KAPI_ETIKETI[b.kod]}</Badge>
                    <p className="mt-1 text-danger">{b.mesaj}</p>
                    {avukat && b.atif && (
                      acikOnay === b.atif.anahtar ? (
                        <div className="mt-2 space-y-1.5 rounded-lg border border-border bg-surface p-2">
                          <label className="block">
                            <span className="sr-only">Resmî bağlantı</span>
                            <input value={resmiUrl} onChange={(e) => setResmiUrl(e.target.value)} placeholder="Resmî bağlantı (Yargıtay/mevzuat sitesi)" className={alan} />
                          </label>
                          <label className="block">
                            <span className="sr-only">Gerekçe</span>
                            <input value={gerekce} onChange={(e) => setGerekce(e.target.value)} placeholder="Gerekçe (isteğe bağlı)" className={alan} />
                          </label>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => atifOnayla(b.atif!.anahtar)} disabled={onayBekliyor} className={ikincilDugme}>
                              {onayBekliyor ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : null} Onayla
                            </button>
                            <button type="button" onClick={() => setAcikOnay(null)} className={sessizDugme}>Vazgeç</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setAcikOnay(b.atif!.anahtar)} className={`mt-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10 ${odak}`}>
                          Tek tek onayla
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}

            {rapor.sari.length > 0 && (
              <ul className="space-y-1.5">
                {rapor.sari.map((s, i) => (
                  <li key={`${s.kod}-${i}`} className="rounded-lg border border-warning/30 bg-warning-soft/40 p-2 text-warning">{s.mesaj}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
