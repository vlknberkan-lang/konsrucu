'use client'

/**
 * KonsRücü — TAHSİLAT ONAY kartı (SN-07; B30) · components/dava/tahsilat-karti.tsx
 * Tahsilat YALNIZ UYAP hesabındaki "Yatan Para" farkından doğar; tarih "senkronda görüldü" tarihidir. Makbuz/reddiyat
 * evrakı tahsilat üretmez. Para paneli yalnız onaylı toplamı gösterir.
 */
import { Banknote } from 'lucide-react'
import { tahsilatKarar } from '@/app/(app)/dosya-islem/dava-actions'
import { anGoster, BirincilDugme, IkincilDugme, Kart, Mesaj, paraGoster, useAksiyon } from '../arabuluculuk/ortak'

export type TahsilatKartiProps = {
  tahsilat: { adaylar: { id: string; tutar: number | null; gorulme: string | null }[]; talep: number | null; tahsil: number; kalan: number | null }
  yetki: { yazabilir: boolean; avukat: boolean }
}

export function TahsilatKarti({ tahsilat: t, yetki }: TahsilatKartiProps) {
  const a = useAksiyon()
  return (
    <Kart id="tahsilat" kicker="Para · tahsilat" baslik={t.adaylar.length ? `${t.adaylar.length} tahsilat onay bekliyor` : 'Tahsilat'} vurgu={t.adaylar.length ? 'uyari' : undefined} sag={<Banknote className="h-4 w-4 text-muted-foreground" />}
      alt='Yalnız UYAP hesap özetindeki "Yatan Para" artışı tahsilat sayılır; tarih senkronda görüldüğü gündür (hukuki tahsil tarihi değildir).'>
      <div className="mb-3 grid grid-cols-3 gap-3 text-[12.5px]">
        <div><div className="text-muted-foreground">Talep</div><div className="font-mono font-bold">{paraGoster(t.talep)}</div></div>
        <div><div className="text-muted-foreground">Tahsil (onaylı)</div><div className="font-mono font-bold text-success">{paraGoster(t.tahsil)}</div></div>
        <div><div className="text-muted-foreground">Kalan</div><div className="font-mono font-bold">{paraGoster(t.kalan)}</div></div>
      </div>
      {t.adaylar.map((x, i) => (
        <div key={x.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/30 px-3 py-2 text-[12.5px]">
          <span>UYAP hesap özetinde <b className="font-mono">{paraGoster(x.tutar)}</b> artış · görüldü {anGoster(x.gorulme)}</span>
          {yetki.yazabilir && (i === 0
            ? <BirincilDugme bekliyor={a.bekliyor} onClick={() => a.calistir(() => tahsilatKarar({ olayId: x.id, karar: 'TEYITLI' }), () => 'Tahsilat onaylandı.')}>Tahsilatı onayla</BirincilDugme>
            : <IkincilDugme bekliyor={a.bekliyor} onClick={() => a.calistir(() => tahsilatKarar({ olayId: x.id, karar: 'TEYITLI' }), () => 'Tahsilat onaylandı.')}>Onayla</IkincilDugme>)}
          {yetki.yazabilir && <IkincilDugme tehlike bekliyor={a.bekliyor} onClick={() => a.calistir(() => tahsilatKarar({ olayId: x.id, karar: 'REDDEDILDI' }), () => 'Tahsilat adayı reddedildi.')}>Tahsilat değil</IkincilDugme>}
        </div>
      ))}
      {a.hata && <Mesaj tur="hata">{a.hata}</Mesaj>}
      {a.bilgi && <Mesaj tur="ok">{a.bilgi}</Mesaj>}
    </Kart>
  )
}
