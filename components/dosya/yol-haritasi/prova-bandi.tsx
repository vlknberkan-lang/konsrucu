'use client'

/**
 * KonsRücü — Dosya Yol Haritası · PROVA bandı · components/dosya/yol-haritasi/prova-bandi.tsx
 *
 * 06 §8.5: adrese `?prova=YYYY-MM-DD` eklenince ekran yalnız o tarihe kadarki olgularla hesaplanır. Bu bant tarihi
 * seçtirir, provada olduğunu açıkça söyler ("yalnız okur") ve avukata o duraktaki öneriyi "doğru / yanlış / eksik"
 * diye puanlatır (puan Aktivite'ye ve kural test setine gider). Prova hiçbir hukuki kaydı açmaz ya da değiştirmez.
 */
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, Loader2 } from 'lucide-react'
import { provaPuanla } from '@/app/(app)/dosya-islem/yol-haritasi-actions'
import { gunGoster } from './eylem'

type Puan = 'DOGRU' | 'YANLIS' | 'EKSIK'

export function ProvaBandi({ dosyaId, prova, bugun, simdiKural, kullaniciRol }: {
  dosyaId: string
  /** Etkin prova tarihi (YYYY-MM-DD) ya da null (canlı). */
  prova: string | null
  /** Bugünün tarihi (YYYY-MM-DD) — ileri tarih seçilemez. */
  bugun: string
  /** Provada gösterilen Şimdi (ya da bekleme) kuralı — puan bu kurala yazılır. */
  simdiKural: string | null
  kullaniciRol: string
}) {
  const [tarih, setTarih] = useState(prova ?? '')
  const [puan, setPuan] = useState<Puan | null>(null)
  const [not, setNot] = useState('')
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const tarihId = useId()
  const avukat = kullaniciRol === 'AVUKAT' || kullaniciRol === 'ADMIN'

  function git(t: string | null) {
    const u = new URL(window.location.href)
    if (t) u.searchParams.set('prova', t)
    else u.searchParams.delete('prova')
    router.push(`${u.pathname}${u.search}${u.hash}`)
  }

  function puanla(p: Puan) {
    setMesaj(null)
    if (!prova || !simdiKural) return
    if (p !== 'DOGRU' && not.trim().length < 3) { setPuan(p); setMesaj({ tur: 'hata', metin: 'Yanlış ya da eksik puanında kısa bir not yazın.' }); return }
    start(async () => {
      const r = await provaPuanla({ dosyaId, prova, kural: simdiKural, puan: p, not: not.trim() || undefined })
      if (!r.ok) { setMesaj({ tur: 'hata', metin: r.error ?? 'Puan kaydedilemedi.' }); return }
      setMesaj({ tur: 'ok', metin: r.bilgi ?? 'Puan kaydedildi.' })
      setPuan(null)
      setNot('')
    })
  }

  const kucuk = 'rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'

  return (
    <section aria-label="Prova modu" className={`rounded-2xl border px-5 py-3 ${prova ? 'border-info/40 bg-info-soft/40' : 'border-border-subtle bg-surface'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <FlaskConical className="h-4 w-4 text-info" aria-hidden />
          {prova ? `Prova: ${gunGoster(prova)} tarihindeki olgularla hesaplanıyor` : 'Prova modu'}
        </span>
        {prova && <span className="text-[12px] text-muted-foreground">Yalnız okur; hiçbir kayıt değişmez.</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label htmlFor={tarihId} className="sr-only">Prova tarihi</label>
          <input
            id={tarihId}
            type="date"
            value={tarih}
            max={bugun}
            onChange={(e) => setTarih(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 font-mono text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="button" className={kucuk} disabled={!tarih || tarih > bugun} onClick={() => git(tarih)}>
            {prova ? 'Tarihi değiştir' : 'Provayı aç'}
          </button>
          {prova && <button type="button" className={kucuk} onClick={() => git(null)}>Canlıya dön</button>}
        </div>
      </div>

      {prova && avukat && simdiKural && (
        <div className="mt-2.5 border-t border-info/20 pt-2.5">
          <p className="text-[12.5px] text-foreground">Bu durakta programın önerisi (<span className="font-mono">{simdiKural}</span>) doğru mu?</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button type="button" className={kucuk} disabled={pending} onClick={() => puanla('DOGRU')}>Doğru</button>
            <button type="button" className={kucuk} disabled={pending} onClick={() => setPuan('YANLIS')} aria-pressed={puan === 'YANLIS'}>Yanlış</button>
            <button type="button" className={kucuk} disabled={pending} onClick={() => setPuan('EKSIK')} aria-pressed={puan === 'EKSIK'}>Eksik</button>
            {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          {puan && puan !== 'DOGRU' && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex min-w-[240px] flex-1 flex-col text-[12px] text-foreground">
                Ne olmalıydı?
                <textarea value={not} onChange={(e) => setNot(e.target.value)} rows={2} maxLength={1000} className="mt-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <button type="button" className={kucuk} disabled={pending} onClick={() => puanla(puan)}>Puanı kaydet</button>
            </div>
          )}
        </div>
      )}
      {mesaj && <p role="status" className={`mt-1.5 text-[12px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</p>}
    </section>
  )
}
