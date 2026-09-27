'use client'

/**
 * KonsRücü — DURMA ve İİK 67 yeniden onayı (AR-07) · components/arabuluculuk/durma-karti.tsx
 * İhtiyatlı öneri DEĞİŞMEZ; durmalı öneri gösterilir; onaylanan gün "yeniden onay bekliyor" ise avukat yeni günü
 * girer. Hatırlatmalar yeniden onaya kadar ihtiyatlı güne göre gider. Hepsi "teyit gerekli".
 */
import { useState } from 'react'
import { Timer } from 'lucide-react'
import { iik67SonGunYenidenOnayla } from '@/app/(app)/dosya-islem/arabuluculuk-actions'
import type { SureUI } from '@/lib/konsrucu/arabuluculuk/veri'
import { BirincilDugme, gunGoster, INP, Kart, LBL, Mesaj, TeyitEtiketi, useAksiyon } from './ortak'

export type DurmaKartiProps = { sureler: SureUI[]; yetki: { yazabilir: boolean; avukat: boolean } }

function SureSatiri({ s, avukat }: { s: SureUI; avukat: boolean }) {
  const [gun, setGun] = useState('') // varsayılan yok: avukat günü kendisi girer
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  return (
    <div className="rounded-xl border border-border-subtle p-3 text-[12.5px]">
      <div className="mb-1.5 font-semibold">İİK 67{ s.borcluSira ? ` · borçlu-${s.borcluSira}` : ''} <TeyitEtiketi /></div>
      {s.durmalar.map((d, i) => (
        <div key={i} className="text-muted-foreground">Durma: başvuru {gunGoster(d.bas)} → son tutanak {gunGoster(d.bit)} = <b className="text-foreground">{d.gun} gün</b>{d.sayildi ? '' : ' (sayılmadı)'} · {d.dayanak}</div>
      ))}
      <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3">
        <div>İhtiyatlı: <b className="font-mono">{gunGoster(s.onerilenIhtiyatli)}</b> <span className="text-muted-foreground">(değişmez)</span></div>
        <div>Durmalı öneri: <b className="font-mono">{gunGoster(s.onerilenSonGun)}</b></div>
        <div>Onaylanan: <b className="font-mono">{gunGoster(s.onaylananSonGun)}</b>{s.oncekiOnaylanan && !s.onaylananSonGun ? <span className="text-muted-foreground"> (önceki {gunGoster(s.oncekiOnaylanan)})</span> : null}</div>
      </div>
      {s.yenidenOnayBekliyor && (
        <div className="mt-2 flex flex-col gap-2">
          <Mesaj tur="uyari">Onaylanan son gün yeniden onay bekliyor (durma eklendi). Hatırlatmalar şimdilik ihtiyatlı güne göre gidiyor.</Mesaj>
          {avukat && (
            <div className="flex flex-wrap items-end gap-2">
              <div><label className={LBL} htmlFor={`d-${s.id}`}>Yeni son gün</label><input id={`d-${s.id}`} type="date" value={gun} onChange={(e) => setGun(e.target.value)} max={s.onerilenSonGun ?? s.onerilenIhtiyatli ?? undefined} className={INP} /></div>
              <BirincilDugme bekliyor={bekliyor} disabled={!gun} onClick={() => calistir(() => iik67SonGunYenidenOnayla({ sureId: s.id, sonGun: gun }), () => 'Son gün yeniden onaylandı.')}>Onayla</BirincilDugme>
            </div>
          )}
          {hata && <Mesaj tur="hata">{hata}</Mesaj>}
          {bilgi && <Mesaj tur="ok">{bilgi}</Mesaj>}
        </div>
      )}
    </div>
  )
}

export function DurmaKarti({ sureler, yetki }: DurmaKartiProps) {
  if (!sureler.length) return null
  const bekleyen = sureler.filter((s) => s.yenidenOnayBekliyor).length
  return (
    <Kart id="durma" kicker="Durma · İİK 67" baslik={bekleyen ? `${bekleyen} son gün yeniden onay bekliyor` : 'İİK 67 son günleri'} vurgu={bekleyen ? 'uyari' : undefined} sag={<Timer className="h-4 w-4 text-muted-foreground" />}
      alt="Başvurudan son tutanağa kadar süre işlemez (dava şartında HUAK 18/A-15; ihtiyaride dayanak farklı). Hepsi teyit gerekli.">
      <div className="flex flex-col gap-2">
        {sureler.map((s) => <SureSatiri key={s.id} s={s} avukat={yetki.avukat} />)}
      </div>
    </Kart>
  )
}
