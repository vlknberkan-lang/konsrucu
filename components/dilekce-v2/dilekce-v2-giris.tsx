/**
 * KonsRücü — Dilekçe v2 girişi · components/dilekce-v2/dilekce-v2-giris.tsx (sunucu ya da istemci; durumsuz)
 *
 * Dilekçe masasında seçili dosyanın üstünde ve (bağlanınca) dosya detay sayfasında görünür. Tek birincil eylem:
 * "Dava dilekçesini hazırla" → dosya kartı ekranı (06 §2(h): "Şimdi kartındaki 'Dava dilekçesini hazırla'").
 * Diğer türler ve atıf kütüphanesi ikincil bağlantıdır. `DILEKCE_V2` kapalıyken çağıran bunu hiç göstermez.
 */
import Link from 'next/link'
import { ArrowUpRight, BookCheck, FileSearch } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { KART_TUR_ADI, KART_TURLERI, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { birincilDugme, kart, odak } from './stil'

export type DilekceV2GirisProps = {
  dosyaId: string
  /** Tür başına geçerli kartın özeti (lib/konsrucu/dilekce-v2/kart-veri.ts · dilekceV2Ozeti). */
  kartlar: { tur: KartTuru; surum: number; durum: string }[]
  /** Sıkı görünüm (dosya detay sayfası için). */
  sikisik?: boolean
}

const kartYolu = (dosyaId: string, tur: KartTuru) => `/dilekceler/kart?dosya=${encodeURIComponent(dosyaId)}&tur=${tur}`
const DURUM: Record<string, { ad: string; ton: 'success' | 'warning' | 'steel' }> = {
  ONAYLI: { ad: 'kilitli', ton: 'success' }, TASLAK: { ad: 'taslak', ton: 'warning' },
}

export function DilekceV2Giris({ dosyaId, kartlar, sikisik = false }: DilekceV2GirisProps) {
  const dava = kartlar.find((k) => k.tur === 'DAVA')
  const digerleri = KART_TURLERI.filter((t) => t !== 'DAVA')
  return (
    <section className={`${kart} ${sikisik ? 'p-3' : 'mb-5 p-4'}`} aria-label="Dilekçe">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-kr-ink"><FileSearch className="h-4 w-4" aria-hidden /> Dilekçe · önce dosya kartı</div>
          <p className="mt-0.5 text-xs text-muted-foreground">Önce kaynaklı olgular ve avukat onayı; kart kilitlenmeden taslak üretilmez.</p>
          {dava && <p className="mt-1 text-xs">Dava dilekçesi kartı: sürüm {dava.surum} <Badge tone={DURUM[dava.durum]?.ton ?? 'steel'}>{DURUM[dava.durum]?.ad ?? dava.durum}</Badge></p>}
        </div>
        <Link href={kartYolu(dosyaId, 'DAVA')} className={birincilDugme}>{dava ? 'Dava dilekçesi kartını aç' : 'Dava dilekçesini hazırla'}</Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {digerleri.map((t) => {
          const k = kartlar.find((x) => x.tur === t)
          return (
            <Link key={t} href={kartYolu(dosyaId, t)} className={`inline-flex items-center gap-1 rounded font-semibold text-primary hover:underline ${odak}`}>
              {KART_TUR_ADI[t]}{k ? ` (sürüm ${k.surum}, ${DURUM[k.durum]?.ad ?? k.durum})` : ''} <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          )
        })}
        <Link href="/dilekceler/kutuphane" className={`inline-flex items-center gap-1 rounded font-semibold text-muted-foreground hover:text-foreground ${odak}`}>
          <BookCheck className="h-3.5 w-3.5" aria-hidden /> Atıf kütüphanesi
        </Link>
      </div>
    </section>
  )
}
