'use client'

/**
 * KonsRücü — Öneri bileşenlerinin ortak parçaları · components/dosya/oneri/ortak.tsx
 * Düğme sınıfları (kart içinde birincil dolu düğme yok: ekranın tek birincil eylemi Şimdi kartındadır),
 * eylem çalıştırıcı (bekleme + hata + router.refresh) ve bölüm başlığı.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const TEMEL =
  'inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[11.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'

/** Onay yönlü eylem (Doğru, Kaydet): marka aksanlı, çerçeveli — dolu değil. */
export const DUGME_ONAY = `${TEMEL} border border-kr/[0.18] bg-kr-soft text-kr-ink hover:bg-kr-soft/70`
/** İkincil eylem (Düzelt, Vazgeç, Kaynağı göster). */
export const DUGME_IKINCIL = `${TEMEL} border border-border bg-surface text-muted-foreground hover:text-foreground`
/** Olumsuz eylem (Yanlış): yıkıcı değil, yalnız anlam. */
export const DUGME_RET = `${TEMEL} border border-border bg-surface text-muted-foreground hover:border-danger/40 hover:text-danger`

export const GIRDI =
  'h-8 rounded-[8px] border border-input bg-background px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export type EylemSonucu = { ok: boolean; error?: string }

/** Sunucu eylemini çalıştır: aynı anda tek iş, hata metni, bitince sayfayı tazele. */
export function useEylem() {
  const [bekliyor, basla] = useTransition()
  const [calisan, setCalisan] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const router = useRouter()
  function calistir(kimlik: string, is: () => Promise<EylemSonucu>, sonra?: () => void) {
    setHata(null)
    setCalisan(kimlik)
    basla(async () => {
      try {
        const r = await is()
        if (!r.ok) setHata(r.error ?? 'İşlem tamamlanamadı.')
        else sonra?.()
      } catch {
        setHata('Bağlantı kurulamadı; tekrar deneyin.')
      }
      router.refresh()
      setCalisan(null)
    })
  }
  return { bekliyor, calisan, hata, setHata, calistir, buMu: (k: string) => bekliyor && calisan === k }
}

export function BolumBasligi({ kicker, baslik, alt, sag, id }: { kicker: string; baslik: string; alt?: React.ReactNode; sag?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{kicker}</div>
        <h2 id={id} className="font-display mt-1 text-[18px] font-extrabold tracking-[-0.02em] text-foreground">{baslik}</h2>
        {alt && <div className="mt-1 max-w-[80ch] text-[12.5px] leading-[1.5] text-muted-foreground">{alt}</div>}
      </div>
      {sag && <div className="flex shrink-0 items-center gap-2">{sag}</div>}
    </div>
  )
}

export function HataSatiri({ hata }: { hata: string | null }) {
  if (!hata) return null
  return <p role="alert" className="border-t border-border-subtle px-5 py-2 text-[12px] font-medium text-danger">{hata}</p>
}
