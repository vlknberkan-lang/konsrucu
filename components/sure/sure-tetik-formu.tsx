'use client'

/**
 * KonsRücü — Tetik tarihi formu · components/sure/sure-tetik-formu.tsx
 * "Tetik bekliyor" satırına tebliğ (ya da tefhim, UETS ulaşma) tarihi girilir; öneri sunucuda yeniden
 * hesaplanır. Onaylanmış sürede tetik değişirse onaylanan gün yeniden onaya düşer (sunucu söyler).
 */
import { useId, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { sureTetikGuncelle } from '@/app/(app)/sureler/actions'
import type { SureSatiri } from '@/lib/konsrucu/sure/gorunum'
import { isoGun, tarihOku } from '@/lib/konsrucu/sure/takvim'
import { TETIK_TURLERI, TETIK_TURU_ETIKET, sureTuru, type TetikTuru } from '@/lib/konsrucu/sure/turler'
import { BTN_BIRINCIL, BTN_IKINCIL, ETIKET, GIRDI } from './stil'
import { IslemMesaji, useSureIslem } from './islem'

const gunDegeri = (v: string | null) => {
  const d = tarihOku(v)
  return d ? isoGun(d) : ''
}

export function SureTetikFormu({ sure, onKapat }: { sure: SureSatiri; onKapat?: () => void }) {
  const id = useId()
  const t = sureTuru(sure.tur)
  const [tetikTuru, setTetikTuru] = useState<TetikTuru>((sure.tetikTuru as TetikTuru) ?? 'TEBLIG')
  const [tetik, setTetik] = useState(gunDegeri(sure.tetikTarihi))
  const [uets, setUets] = useState(gunDegeri(sure.uetsUlasmaTarihi))
  const [hakim, setHakim] = useState(sure.hakimSuresiGun ? String(sure.hakimSuresiGun) : '')
  const [usul, setUsul] = useState<'' | 'YAZILI' | 'BASIT'>('')
  const { pending, mesaj, calistir } = useSureIslem()
  const uetsTetik = tetikTuru === 'UETS_ULASMA'

  return (
    <form
      className="rounded-xl border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        calistir(() => sureTetikGuncelle({
          sureId: sure.id,
          tetikTuru,
          tetikTarihi: tetik || null,
          uetsUlasmaTarihi: uetsTetik ? tetik || null : uets || null,
          hakimSuresiGun: t.kural.tip === 'HAKIM' && hakim ? Number(hakim) : undefined,
          usul: sure.tur === 'HMK136' && usul ? usul : undefined,
        }), (r) => { if (!r.uyari) onKapat?.() })
      }}
    >
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-tt`} className={ETIKET}>Tetik türü</label>
          <select id={`${id}-tt`} value={tetikTuru} onChange={(e) => setTetikTuru(e.target.value as TetikTuru)} className={GIRDI}>
            {TETIK_TURLERI.map((k) => <option key={k} value={k}>{TETIK_TURU_ETIKET[k]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-t`} className={ETIKET}>{uetsTetik ? 'UETS ulaşma tarihi' : t.tetik}</label>
          <input id={`${id}-t`} type="date" value={tetik} onChange={(e) => setTetik(e.target.value)} className={`${GIRDI} font-mono`} />
        </div>
        {!uetsTetik && tetikTuru === 'TEBLIG' && (
          <div>
            <label htmlFor={`${id}-u`} className={ETIKET}>UETS ulaşma tarihi (varsa)</label>
            <input id={`${id}-u`} type="date" value={uets} onChange={(e) => setUets(e.target.value)} className={`${GIRDI} font-mono`} />
          </div>
        )}
        {t.kural.tip === 'HAKIM' && (
          <div>
            <label htmlFor={`${id}-h`} className={ETIKET}>Mahkemenin verdiği süre (gün)</label>
            <input id={`${id}-h`} type="number" min={1} max={3650} value={hakim} onChange={(e) => setHakim(e.target.value)} className={`${GIRDI} font-mono`} />
          </div>
        )}
        {sure.tur === 'HMK136' && (
          <div>
            <label htmlFor={`${id}-us`} className={ETIKET}>Yargılama usulü</label>
            <select id={`${id}-us`} value={usul} onChange={(e) => setUsul(e.target.value as '' | 'YAZILI' | 'BASIT')} className={GIRDI}>
              <option value="">Değiştirme</option>
              <option value="YAZILI">Yazılı</option>
              <option value="BASIT">Basit</option>
            </select>
          </div>
        )}
      </div>
      {uetsTetik && <p className="mt-2 text-[11.5px] text-muted-foreground">UETS'te tebliğ, ulaşmayı izleyen 5. günün sonunda sayılır (teyit gerekli); ihtiyatlı hesap ulaşma gününden başlar.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={BTN_BIRINCIL}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Öneriyi yeniden hesapla
        </button>
        {onKapat && <button type="button" onClick={onKapat} className={BTN_IKINCIL}>Vazgeç</button>}
      </div>
      <IslemMesaji mesaj={mesaj} />
    </form>
  )
}
