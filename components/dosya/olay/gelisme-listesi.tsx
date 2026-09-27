'use client'

/**
 * KonsRücü — UYAP gelişmeleri listesi · components/dosya/olay/gelisme-listesi.tsx
 *
 * Onay bekleyen adaylar (süre başlatanlar önce; 3 günü aşan kırmızı) ve son işlenenler (katlanır). Boş hâl bir
 * cümle ve bir eylem gösterir (06 "Boş ve bekleme hâlleri"). "Evraktan yeniden oku" okunmuş mazbataları tarar.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, FileSearch, Inbox, Loader2 } from 'lucide-react'
import { mazbatalariOkuEylem } from '@/app/(app)/dosya-islem/olay-actions'
import type { GelismeKartiVM } from '@/lib/konsrucu/eksen/gorunum'
import { GelismeKarti, type KartBorclu } from './gelisme-karti'
import { DUGME_IKINCIL } from './rol'

export function GelismeListesi({
  dosyaId, bekleyen, islenen, borclular, yetkili, okuyabilir,
}: {
  dosyaId: string
  bekleyen: GelismeKartiVM[]
  islenen: GelismeKartiVM[]
  borclular: KartBorclu[]
  /** Onay / ret / geri alma (AVUKAT, ADMIN) — sunucuda olayYetkisi(dbUser, 'ONAY') ile hesaplanır */
  yetkili: boolean
  /** "Evraktan yeniden oku" (AVUKAT_YRD dahil) — olayYetkisi(dbUser, 'OKU') */
  okuyabilir: boolean
}) {
  const [acik, setAcik] = useState(false)
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<string | null>(null)
  const router = useRouter()

  function oku() {
    setMesaj(null)
    start(async () => {
      const r = await mazbatalariOkuEylem({ dosyaId })
      setMesaj(r.ok ? r.bilgi ?? 'Tamam.' : r.error)
      if (r.ok) router.refresh()
    })
  }

  return (
    <section aria-label="UYAP'tan gelen gelişmeler" className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[13.5px] font-bold text-foreground">UYAP&apos;tan gelen gelişmeler</h3>
        <span className="font-mono text-[11px] text-muted-foreground">{bekleyen.length} onay bekliyor</span>
        {okuyabilir && (
          <button type="button" onClick={oku} disabled={pending} className={`${DUGME_IKINCIL} ml-auto`}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />} Evraktan yeniden oku
          </button>
        )}
      </div>
      {mesaj && <p role="status" className="mt-1.5 text-[11.5px] text-muted-foreground">{mesaj}</p>}

      {bekleyen.length === 0 ? (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-dashed border-border px-4 py-3 text-[12.5px] text-muted-foreground">
          <Inbox className="h-4 w-4 shrink-0" aria-hidden /> Onay bekleyen gelişme yok. UYAP&apos;tan yeni evrak gelince burada görünür.
        </div>
      ) : (
        <div className="mt-2.5 space-y-2.5">
          {bekleyen.map((k) => <GelismeKarti key={k.id} dosyaId={dosyaId} kart={k} borclular={borclular} yetkili={yetkili} />)}
        </div>
      )}

      {islenen.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setAcik((x) => !x)} aria-expanded={acik} className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
            {acik ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Son işlenenler ({islenen.length})
          </button>
          {acik && (
            <div className="mt-2 space-y-2">
              {islenen.map((k) => <GelismeKarti key={k.id} dosyaId={dosyaId} kart={k} borclular={borclular} yetkili={yetkili} />)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
