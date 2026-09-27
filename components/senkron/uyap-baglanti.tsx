'use client'

/**
 * KonsRücü — UYAP bağlantısı göstergesi (S22; 06 §2(d)).
 * "UYAP bağlantısı: açık · son sinyal 1 dk önce" — eklentinin son nabzından ÖLÇÜLÜR, tahmin değildir.
 * `baglanti` verilirse onu gösterir (canlı panel zaten yokluyor); verilmezse kendisi 30 sn'de bir sorar.
 * Renk yalnız anlam taşır: açık = tamam (yeşil), oturum kapalı / sinyal yok = risk (kırmızı), hiç yok = gri.
 */
import { useEffect, useState } from 'react'
import { PlugZap, Unplug } from 'lucide-react'
import { uyapBaglantiGetir } from '@/app/(app)/dosya-islem/senkron-actions'
import type { Baglanti } from '@/lib/konsrucu/senkron/is-saf'

const TON: Record<Baglanti['durum'], string> = {
  ACIK: 'border-success/30 bg-success-soft/50 text-success',
  OTURUM_KAPALI: 'border-danger/30 bg-danger-soft/50 text-danger',
  SINYAL_YOK: 'border-danger/30 bg-danger-soft/50 text-danger',
  HIC_YOK: 'border-border bg-surface-muted text-muted-foreground',
}
const ETIKET: Record<Baglanti['durum'], string> = {
  ACIK: 'açık',
  OTURUM_KAPALI: 'UYAP oturumu kapalı',
  SINYAL_YOK: 'sinyal yok',
  HIC_YOK: 'eklenti bağlı değil',
}

function sonSinyal(b: Baglanti): string {
  if (b.dakikaOnce == null) return ''
  return b.dakikaOnce < 1 ? ' · son sinyal az önce' : ` · son sinyal ${b.dakikaOnce} dk önce`
}

export function UyapBaglanti({ baglanti, ayrintili = false }: { baglanti?: Baglanti | null; ayrintili?: boolean }) {
  const [b, setB] = useState<Baglanti | null>(baglanti ?? null)

  useEffect(() => {
    if (baglanti !== undefined) { setB(baglanti); return }
    let iptal = false
    const yukle = async () => {
      const r = await uyapBaglantiGetir().catch(() => null)
      if (!iptal && r?.ok && r.baglanti) setB(r.baglanti)
    }
    yukle()
    const t = setInterval(yukle, 30_000)
    return () => { iptal = true; clearInterval(t) }
  }, [baglanti])

  if (!b) return <span className="inline-block h-6 w-40 animate-pulse rounded-full bg-surface-muted motion-reduce:animate-none" aria-hidden />
  const Ikon = b.durum === 'ACIK' ? PlugZap : Unplug
  return (
    <span className="inline-flex flex-col gap-1">
      <span role="status" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[12px] font-semibold ${TON[b.durum]}`}>
        <Ikon className="h-3.5 w-3.5" aria-hidden />
        UYAP bağlantısı: {ETIKET[b.durum]}
        <span className="font-normal">{sonSinyal(b)}</span>
      </span>
      {ayrintili && b.durum !== 'ACIK' && <span className="max-w-[60ch] text-[12px] text-muted-foreground">{b.metin}</span>}
    </span>
  )
}
