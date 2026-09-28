'use client'

/**
 * KonsRücü — liste sırasıyla dosyadan dosyaya geçiş · components/dosya/sira-gecis.tsx
 * Liste sayfası (Bugün, Tüm Dosyalar) gördüğü sırayı sekme belleğine yazar (`SiraKaydet`); dosya ekranı
 * (`SiraGecis`) o sıradaysa "Önceki / Sıradaki dosya" ve "Listeye dön" gösterir. Sıra yalnız bu sekmede yaşar;
 * bellek kapalıysa (gizli pencere vb.) şerit hiç çizilmez, ekran bozulmaz.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ListOrdered } from 'lucide-react'
import { dosyaHref } from '@/lib/konsrucu/nav'

const ANAHTAR = 'kr-dosya-sira'
type Sira = { ids: string[]; kaynak: string; href: string }

export function SiraKaydet({ ids, kaynak, href }: Sira) {
  const imza = ids.join(',')
  useEffect(() => {
    try {
      sessionStorage.setItem(ANAHTAR, JSON.stringify({ ids: imza ? imza.split(',') : [], kaynak, href }))
    } catch {
      /* bellek yoksa geçiş şeridi çıkmaz */
    }
  }, [imza, kaynak, href])
  return null
}

export function SiraGecis({ dosyaId }: { dosyaId: string }) {
  const [sira, setSira] = useState<Sira | null>(null)
  useEffect(() => {
    try {
      const ham = sessionStorage.getItem(ANAHTAR)
      if (ham) setSira(JSON.parse(ham) as Sira)
    } catch {
      setSira(null)
    }
  }, [])

  const i = sira ? sira.ids.indexOf(dosyaId) : -1
  if (!sira || i < 0) return null
  const onceki = i > 0 ? sira.ids[i - 1] : null
  const sonraki = i < sira.ids.length - 1 ? sira.ids[i + 1] : null
  const dugme = 'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50'

  return (
    <nav aria-label="Liste sırası" className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5">
      <Link href={sira.href} className={`${dugme} text-muted-foreground hover:bg-surface-muted hover:text-foreground`}>
        <ListOrdered className="h-4 w-4" aria-hidden />
        {sira.kaynak} listesine dön
      </Link>
      <span className="font-mono text-[12px] text-muted-foreground" aria-live="polite">
        {i + 1} / {sira.ids.length}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {onceki && (
          <Link href={dosyaHref(onceki)} className={`${dugme} border border-border text-foreground hover:border-kr/50`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Önceki dosya
          </Link>
        )}
        {sonraki ? (
          <Link href={dosyaHref(sonraki)} className={`${dugme} bg-kr text-white hover:bg-kr/90`}>
            Sıradaki dosya
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span className="text-[12.5px] font-semibold text-muted-foreground">Listenin sonu</span>
        )}
      </div>
    </nav>
  )
}
