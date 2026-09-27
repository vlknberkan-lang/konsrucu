'use client'

/** KonsRücü — Süre defteri eylem yardımcısı · components/sure/islem.tsx (action çağır, sonucu göster, yenile). */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SureSonuc } from '@/app/(app)/sureler/actions'

export type IslemMesajiT = { tur: 'hata' | 'uyari' | 'tamam'; metin: string } | null

export function useSureIslem() {
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<IslemMesajiT>(null)
  const router = useRouter()

  function calistir(fn: () => Promise<SureSonuc>, sonra?: (r: Extract<SureSonuc, { ok: true }>) => void) {
    setMesaj(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) {
        setMesaj({ tur: 'hata', metin: r.error })
        return
      }
      setMesaj(r.uyari ? { tur: 'uyari', metin: r.uyari } : { tur: 'tamam', metin: 'Kaydedildi.' })
      sonra?.(r)
      router.refresh()
    })
  }

  return { pending, mesaj, setMesaj, calistir }
}

const MESAJ_CLS: Record<'hata' | 'uyari' | 'tamam', string> = {
  hata: 'border-danger/30 bg-danger-soft/50 text-danger',
  uyari: 'border-warning/30 bg-warning-soft/60 text-warning',
  tamam: 'border-success/30 bg-success-soft/50 text-success',
}

export function IslemMesaji({ mesaj }: { mesaj: IslemMesajiT }) {
  if (!mesaj) return null
  return (
    <div role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`mt-2 rounded-[10px] border px-3 py-2 text-[12.5px] font-medium ${MESAJ_CLS[mesaj.tur]}`}>
      {mesaj.metin}
    </div>
  )
}
