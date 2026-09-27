'use client'

/**
 * KonsRücü — KAPANIŞ SEBEBİ kartı (SN-06; B25) · components/dava/kapanis-sebebi.tsx
 * UYAP'ta "kapalı" görünen ve sebebi bilinmeyen dosya radarda kalır (haftada bir yeniden sorgulanır). Sebebi yalnız
 * avukat seçer; sulh/feragat/takibi bırakma müvekkil onayı ister. "Bilinmiyor" dosyayı radarda tutar.
 */
import { useState } from 'react'
import { Radar } from 'lucide-react'
import { kapanisSebebiKaydet } from '@/app/(app)/dosya-islem/dava-actions'
import { KAPANIS_ETIKET, KAPANIS_SEBEPLERI, type KapanisSebebi } from '@/lib/konsrucu/dava/sabitler'
import { BirincilDugme, gunGoster, INP, Kart, LBL, Mesaj, useAksiyon } from '../arabuluculuk/ortak'

export type KapanisSebebiKartiProps = {
  dosyaId: string
  kapanis: { uyapDurum: string | null; kapanisSebebi: string | null; kapanisAt: string | null; radarda: boolean }
  yetki: { yazabilir: boolean; avukat: boolean }
}

export function KapanisSebebiKarti({ dosyaId, kapanis: k, yetki }: KapanisSebebiKartiProps) {
  const [sebep, setSebep] = useState<string>('')
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  if (!k.radarda && !k.kapanisSebebi) return null
  return (
    <Kart id="kapanis" kicker="Kapalı dosya radarı" baslik={k.radarda ? 'UYAP kapalı gösteriyor, sebep bilinmiyor' : `Kapanış: ${KAPANIS_ETIKET[k.kapanisSebebi as KapanisSebebi] ?? k.kapanisSebebi}`} vurgu={k.radarda ? 'uyari' : undefined} sag={<Radar className="h-4 w-4 text-muted-foreground" />}
      alt={k.radarda ? 'Sebep seçilene kadar dosya radarda kalır ve haftada bir yeniden sorgulanır.' : `Kaydedildi ${gunGoster(k.kapanisAt)}.`}>
      {k.uyapDurum && <p className="mb-2 text-[12.5px] text-muted-foreground">UYAP durumu: {k.uyapDurum}</p>}
      {yetki.avukat ? (
        <div className="flex flex-wrap items-end gap-2">
          <div><label className={LBL} htmlFor="kp-sebep">Kapanış sebebi</label>
            <select id="kp-sebep" value={sebep} onChange={(e) => setSebep(e.target.value)} className={INP}>
              <option value="">Seçin</option>
              {KAPANIS_SEBEPLERI.map((s) => <option key={s} value={s}>{KAPANIS_ETIKET[s]}</option>)}
            </select>
          </div>
          <BirincilDugme bekliyor={bekliyor} disabled={!sebep} onClick={() => calistir(() => kapanisSebebiKaydet({ dosyaId, sebep }), () => 'Kapanış sebebi kaydedildi.')}>Sebebi kaydet</BirincilDugme>
        </div>
      ) : <p className="text-[12.5px] text-muted-foreground">Kapanış sebebini yalnız avukat seçer.</p>}
      {hata && <div className="mt-2"><Mesaj tur="hata">{hata}</Mesaj></div>}
      {bilgi && <div className="mt-2"><Mesaj tur="ok">{bilgi}</Mesaj></div>}
    </Kart>
  )
}
