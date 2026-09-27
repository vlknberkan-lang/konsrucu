'use client'

/**
 * KonsRücü — Atıf denetimi (deneme metni) · components/dilekce-v2/atif-denetimi.tsx
 * S33 kabul 4: metne "17. HD 2017/1431" yazılınca KULLANMA; kütüphanede olmayan atıf DOĞRULANMADI.
 * Kapı saf fonksiyondur (lib/konsrucu/mevzuat/atif.ts); yalnız aktif müvekkilin kütüphanesiyle çalışır.
 */
import { useDeferredValue, useId, useMemo, useState } from 'react'
import { Badge } from '@/components/konsrucu/ui'
import { atifKapisi, type KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'
import { DURUM_ADI, durumTonu } from '@/lib/konsrucu/mevzuat/sabitler'
import { alan, kart } from './stil'

export type AtifDenetimiProps = { kayitlar: KutuphaneKaydi[]; baslangicMetni?: string }

export function AtifDenetimi({ kayitlar, baslangicMetni = '' }: AtifDenetimiProps) {
  const id = useId()
  const [metin, setMetin] = useState(baslangicMetni)
  const ertelenen = useDeferredValue(metin)
  const sonuc = useMemo(() => (ertelenen.trim() ? atifKapisi(ertelenen, kayitlar) : null), [ertelenen, kayitlar])

  return (
    <section className={kart} aria-labelledby={`${id}-baslik`}>
      <div className="border-b border-border px-4 py-3">
        <h2 id={`${id}-baslik`} className="font-display text-base font-extrabold">Atıf denetimi</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Bir paragraf yapıştırın; her atıf bu müşterinin kütüphanesiyle karşılaştırılır. Yalnız doğrulanmış atıf imzaya gider.</p>
      </div>
      <div className="space-y-3 p-4">
        <label htmlFor={`${id}-metin`} className="sr-only">Denetlenecek metin</label>
        <textarea id={`${id}-metin`} value={metin} onChange={(e) => setMetin(e.target.value)} rows={5} maxLength={20000} placeholder="Örn. İİK m.67/1 uyarınca … 17. HD 2017/1431 …" className={alan} />
        {sonuc && (
          <div aria-live="polite" className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={sonuc.gecti ? 'success' : 'danger'} dot>{sonuc.gecti ? 'Kapı geçti' : `${sonuc.kirmiziSayisi} kırmızı bulgu`}</Badge>
              <Badge tone="steel">{sonuc.atiflar.length} atıf</Badge>
            </div>
            <ul className="space-y-2">
              {sonuc.atiflar.map((a) => (
                <li key={`${a.bas}-${a.bit}`} className="rounded-lg border border-border p-2.5 text-xs leading-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={durumTonu(a.durum)}>{DURUM_ADI[a.durum]}</Badge>
                    <span className="font-mono font-semibold">{a.anahtar}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">Metinde: “{a.metin}”{a.eslesenKunye ? ` · Kütüphane: ${a.eslesenKunye}` : ''}</p>
                  {a.notlar.map((n) => <p key={n} className="text-muted-foreground">{n}</p>)}
                </li>
              ))}
              {sonuc.yasaklar.map((y) => (
                <li key={`${y.kod}-${y.bas}`} className="rounded-lg border border-danger/30 bg-danger-soft/40 p-2.5 text-xs leading-5">
                  <Badge tone="danger">Yasak kalıp</Badge>
                  <p className="mt-1 text-danger">{y.aciklama}</p>
                  <p className="mt-0.5 text-muted-foreground">“{y.metin}”</p>
                </li>
              ))}
            </ul>
            {sonuc.dosyaIci.length > 0 && <p className="text-[11px] text-muted-foreground">Dosya içi künyeler (icra ve mahkeme esas numaraları) atıf sayılmaz; olgu kapısında kontrol edilir: {sonuc.dosyaIci.map((d) => d.metin).join(', ')}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
