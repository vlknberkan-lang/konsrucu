'use client'

/**
 * KonsRücü — "Telefon hazır" özeti · components/arabuluculuk/telefon-hazir.tsx
 * Arabulucu ya da karşı taraf aradığında TEK TIKLA açılan tek ekran: tutar, itiraz kapsamı, görüşmeler, onay sınırı.
 * Kişisel veri (TCKN, telefon, IBAN) içermez.
 */
import { useState } from 'react'
import { Phone, X } from 'lucide-react'
import type { TelefonHazirOzet } from '@/lib/konsrucu/arabuluculuk/telefon-hazir'
import { KopyaDugmesi } from './ortak'

export function TelefonHazir({ telefon }: { telefon: TelefonHazirOzet }) {
  const [acik, setAcik] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setAcik(true)} className="inline-flex items-center gap-2 rounded-[10px] border border-kr/40 bg-kr-soft px-3.5 py-2 text-[13px] font-semibold text-kr-ink transition hover:bg-kr-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
        <Phone className="h-4 w-4" /> Telefon hazır
      </button>
      {acik && (
        <div role="dialog" aria-modal="true" aria-label="Telefon hazır özeti" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setAcik(false)}>
          <div className="w-full max-w-[560px] rounded-2xl border border-border bg-surface p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-[17px] font-extrabold">Telefon hazır</h2>
              <div className="flex items-center gap-2">
                <KopyaDugmesi metin={telefon.metin} />
                <button type="button" onClick={() => setAcik(false)} aria-label="Kapat" className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              {telefon.satirlar.map((s) => (
                <div key={s.etiket} className="contents"><dt className="text-muted-foreground">{s.etiket}</dt><dd className="font-semibold">{s.deger}</dd></div>
              ))}
              <dt className="text-muted-foreground">Onay sınırı</dt><dd className="font-bold text-kr-ink">{telefon.onaySiniri}</dd>
            </dl>
            <div className="mt-3">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Görüşmeler</div>
              {telefon.gorusmeler.length ? <ul className="mt-1 list-disc pl-5 text-[12.5px]">{telefon.gorusmeler.map((g) => <li key={g}>{g}</li>)}</ul> : <p className="text-[12.5px] text-muted-foreground">Kayıt yok.</p>}
            </div>
            {telefon.uyarilar.map((u) => <p key={u} className="mt-2 text-[12.5px] font-semibold text-danger">(!) {u}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}
