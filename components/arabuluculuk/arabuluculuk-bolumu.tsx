'use client'

/**
 * KonsRücü — arabuluculuk bölümü (S26) · components/arabuluculuk/arabuluculuk-bolumu.tsx
 * Dosya ekranına TEK bileşenle bağlanır: `<ArabuluculukBolumu {...await arabuluculukPaneli(id, musteriId, dbUser)} />`.
 * Sıra: Şimdi (AR kuralları) → yol seçimi → müvekkil onayı → arabuluculuk → durma → telefon hazır.
 */
import type { ArabuluculukPaneliVeri } from '@/lib/konsrucu/arabuluculuk/veri'
import { ArabuluculukKarti } from './arabuluculuk-karti'
import { DurmaKarti } from './durma-karti'
import { OnayKaydiKarti } from './onay-kaydi'
import { TelefonHazir } from './telefon-hazir'
import { YolSecimiKarti } from './yol-secimi'

export function ArabuluculukBolumu(v: ArabuluculukPaneliVeri) {
  const simdi = v.kurallar[0] ?? null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-3 shadow-card">
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Şimdi · arabuluculuk</div>
          <div className="text-[13.5px] font-semibold">{simdi ? `${simdi.oneri}${simdi.etiket ? ` (${simdi.etiket})` : ''}` : 'Bu durakta bekleyen iş yok.'}</div>
          {v.kurallar.length > 1 && <div className="mt-0.5 text-[11.5px] text-muted-foreground">Sonra: {v.kurallar.slice(1, 4).map((k) => k.oneri).join(' · ')}</div>}
        </div>
        <TelefonHazir telefon={v.telefon} />
      </div>
      <YolSecimiKarti dosyaId={v.dosyaId} itirazOnayli={v.itirazOnayli} yolSecimi={v.yolSecimi} ihtiyatliSonGun={v.ihtiyatliSonGun} yetki={v.yetki} />
      <OnayKaydiKarti dosyaId={v.dosyaId} onaylar={v.onaylar} onayKapisi={v.onayKapisi} gerekenOnayTuru={v.gerekenOnayTuru} onayTaslagi={v.onayTaslagi} yetki={v.yetki} />
      <ArabuluculukKarti dosyaId={v.dosyaId} arabuluculuk={v.arabuluculuk} toplantilar={v.toplantilar} belgeler={v.belgeler} itirazEdenAdlari={v.itirazEdenAdlari} yetki={v.yetki} />
      <DurmaKarti sureler={v.sureler} yetki={v.yetki} />
    </div>
  )
}
