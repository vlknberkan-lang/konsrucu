'use client'

/**
 * KonsRücü — dava bölümü (S27 + S31) · components/dava/dava-bolumu.tsx
 * Dosya ekranına TEK bileşenle bağlanır: `<DavaBolumu {...await davaPaneli(id, musteriId, dbUser)} />`.
 * Sıra: genel durum → Şimdi (DA/SN kuralları) → Excel önerisi → ön kontrol → dava kartları (+ karar) → ihtiyati haciz →
 * tahsilat → müvekkil bildirimleri → kapanış radarı → elle dava kaydı formu.
 */
import { useState } from 'react'
import type { DavaPaneliVeri } from '@/lib/konsrucu/dava/veri'
import { IkincilDugme, Kart } from '../arabuluculuk/ortak'
import { MusteriBildirimleri } from './bildirimler'
import { DavaKarti } from './dava-karti'
import { DavaKayitFormu } from './dava-kayit-formu'
import { ExcelDavaOnerisiKarti } from './excel-dava-oneri'
import { UyapDavaAdayiKarti, UyapDavaAraKarti } from './uyap-dava-adayi'
import { GenelDurumKutusu } from './genel-durum'
import { IhtiyatiHacizKarti } from './ihtiyati-haciz'
import { KapanisSebebiKarti } from './kapanis-sebebi'
import { KararKarti } from './karar-karti'
import { OnKontrolKarti } from './on-kontrol'
import { TahsilatKarti } from './tahsilat-karti'

export function DavaBolumu(v: DavaPaneliVeri) {
  const [yeniForm, setYeniForm] = useState(false)
  const simdi = v.kurallar[0] ?? null
  const ilkDava = v.davalar[0] ?? null
  const ihtiyatiHacizler = v.davalar.flatMap((d) => d.ihtiyatiHacizler)
  return (
    <div className="flex flex-col gap-4">
      <GenelDurumKutusu genelDurum={v.genelDurum} />
      <div className="rounded-2xl border border-border bg-surface px-5 py-3 shadow-card">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Şimdi · dava ve sonuç</div>
        <div className="text-[13.5px] font-semibold">{simdi ? `${simdi.oneri}${simdi.etiket ? ` (${simdi.etiket})` : ''}` : 'Bu durakta bekleyen iş yok.'}</div>
        {v.kurallar.length > 1 && <div className="mt-0.5 text-[11.5px] text-muted-foreground">Sonra: {v.kurallar.slice(1, 4).map((k) => k.oneri).join(' · ')}</div>}
      </div>
      {v.uyapAdaylari.map((a) => <UyapDavaAdayiKarti key={a.id} aday={a} yetki={v.yetki} />)}
      {v.davalar.length === 0 && v.uyapAdaylari.length === 0 && v.yetki.yazabilir && <UyapDavaAraKarti dosyaId={v.dosyaId} />}
      {v.excelOnerisi && <ExcelDavaOnerisiKarti dosyaId={v.dosyaId} oneri={v.excelOnerisi} yetki={v.yetki} />}
      {v.davalar.length === 0 && <OnKontrolKarti dosyaId={v.dosyaId} onKontrol={v.onKontrol} hazirlik={v.hazirlik} yetki={v.yetki} />}
      {v.davalar.map((d) => (
        <div key={d.id} className="flex flex-col gap-4">
          <DavaKarti dosyaId={v.dosyaId} dava={d} borclular={v.borclular} arabuluculuklar={v.arabuluculuklar} yetki={v.yetki} />
          <KararKarti dosyaId={v.dosyaId} dava={d} takipToplam={v.tahsilat.talep} yetki={v.yetki} />
        </div>
      ))}
      {(ihtiyatiHacizler.length > 0 || ilkDava) && <IhtiyatiHacizKarti dosyaId={v.dosyaId} davaId={ilkDava?.id ?? null} kayitlar={ihtiyatiHacizler} yetki={v.yetki} />}
      <TahsilatKarti tahsilat={v.tahsilat} yetki={v.yetki} />
      <MusteriBildirimleri dosyaId={v.dosyaId} bildirimler={v.bildirimler} yetki={v.yetki} />
      <KapanisSebebiKarti dosyaId={v.dosyaId} kapanis={v.kapanis} yetki={v.yetki} />
      {v.yetki.yazabilir && (
        <Kart id="dava-kayit" kicker="Elle dava kaydı" baslik={v.davalar.length ? 'Başka bir dava ekle' : 'Eklenti bulamazsa: elle dava kaydı'} alt="Eklenti davayı bulamazsa mahkeme, esas no, açılış tarihi ve tarafları elle girin. Esas no tek başına İİK 67 süresini kapatmaz.">
          {yeniForm
            ? <DavaKayitFormu dosyaId={v.dosyaId} dava={v.hazirlik} borclular={v.borclular} arabuluculuklar={v.arabuluculuklar} onBitti={() => setYeniForm(false)} />
            : <IkincilDugme onClick={() => setYeniForm(true)}>Dava kaydı formunu aç</IkincilDugme>}
        </Kart>
      )}
    </div>
  )
}
