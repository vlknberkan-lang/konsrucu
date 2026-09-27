'use client'

/**
 * KonsRücü — Dosya Yol Haritası · öneri geri bildirimi · components/dosya/yol-haritasi/geri-bildirim.tsx
 *
 * "Bu öneri yanlış" (gerekçe zorunlu) ve "Ertele" (gerekçe zorunlu, 1–30 gün). İkisi de yalnız `Aktivite`'ye
 * kural koduyla yazılır; "yanlış" kayıtları kural test setine vaka olur (06 2(b)). Öncelik 0–2 (veri engeli,
 * süre riski, süre başlatan aday) ertelenemez; provada ertele gösterilmez. Asıl kapı sunucudadır.
 */
import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ThumbsDown, Clock3 } from 'lucide-react'
import type { Adim } from '@/lib/konsrucu/yol-haritasi/tipler'
import { oneriErtele, oneriYanlisBildir } from '@/app/(app)/dosya-islem/yol-haritasi-actions'
import { eylemYetkisi } from './eylem'

type Kip = null | 'yanlis' | 'ertele'

export function OneriGeriBildirim({ dosyaId, adim, prova, kullaniciRol }: {
  dosyaId: string
  adim: Adim
  /** Prova tarihi (YYYY-MM-DD) — provadaysa ertele gizlenir, "yanlış" bildirimi prova tarihiyle kaydedilir. */
  prova: string | null
  kullaniciRol: string
}) {
  const [kip, setKip] = useState<Kip>(null)
  const [gerekce, setGerekce] = useState('')
  const [gun, setGun] = useState(7)
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const alanId = useId()

  if (kullaniciRol === 'GORUNTULEYEN') return null
  const ertelenebilir = !prova && adim.tur === 'EYLEM' && adim.oncelik > 2 && eylemYetkisi(adim.rol, kullaniciRol) === 'YAPABILIR'

  function gonder() {
    setMesaj(null)
    const g = gerekce.trim()
    if (g.length < 5) { setMesaj({ tur: 'hata', metin: 'Kısa bir gerekçe yazın (en az 5 karakter).' }); return }
    start(async () => {
      const r = kip === 'yanlis'
        ? await oneriYanlisBildir({ dosyaId, kural: adim.kural, surum: adim.surum, gerekce: g, prova })
        : await oneriErtele({ dosyaId, kural: adim.kural, gerekce: g, gun })
      if (!r.ok) { setMesaj({ tur: 'hata', metin: r.error ?? 'İşlem tamamlanamadı.' }); return }
      setMesaj({ tur: 'ok', metin: r.bilgi ?? 'Kaydedildi.' })
      setKip(null)
      setGerekce('')
      router.refresh()
    })
  }

  const ikincil = 'inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'

  return (
    <div className="mt-3">
      {kip === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ikincil} onClick={() => { setKip('yanlis'); setMesaj(null) }}>
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden /> Bu öneri yanlış
          </button>
          {ertelenebilir && (
            <button type="button" className={ikincil} onClick={() => { setKip('ertele'); setMesaj(null) }}>
              <Clock3 className="h-3.5 w-3.5" aria-hidden /> Ertele
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-muted/50 px-3 py-3">
          <label htmlFor={alanId} className="block text-[12.5px] font-semibold text-foreground">
            {kip === 'yanlis' ? 'Neden yanlış? Doğrusu ne olmalıydı?' : 'Neden erteliyorsunuz?'}
          </label>
          <textarea
            id={alanId}
            value={gerekce}
            onChange={(e) => setGerekce(e.target.value)}
            rows={2}
            maxLength={1000}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {kip === 'ertele' && (
            <label className="mt-2 flex items-center gap-2 text-[12.5px] text-foreground">
              Kaç gün?
              <select value={gun} onChange={(e) => setGun(Number(e.target.value))} className="rounded-md border border-input bg-background px-2 py-1 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} gün</option>)}
              </select>
            </label>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <button type="button" onClick={gonder} disabled={pending} className={`${ikincil} text-foreground`}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {kip === 'yanlis' ? 'Bildirimi gönder' : 'Ertele'}
            </button>
            <button type="button" onClick={() => { setKip(null); setMesaj(null) }} className="text-[12px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {mesaj && (
        <p role="status" className={`mt-1.5 text-[12px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</p>
      )}
    </div>
  )
}
