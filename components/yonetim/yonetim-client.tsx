'use client'
/** KonsLaw — Yönetim paneli client parçaları (plan/kredi/demo aksiyonları). */
import { useState, useTransition } from 'react'
import { planDegistir, krediEkle, demoDurumGuncelle } from '@/app/(app)/yonetim/actions'

const PLANLAR = ['FREE', 'BASLANGIC', 'BURO', 'KURUMSAL'] as const
const DEMO_DURUMLAR = ['YENI', 'ARANDI', 'DEMO_YAPILDI', 'KAZANILDI', 'KAYBEDILDI'] as const

const secimCss = 'rounded-lg border border-input bg-background px-2 py-1.5 text-[12.5px] outline-none focus:border-kr'

export function PlanSecici({ musteriId, plan, ad }: { musteriId: string; plan: string; ad: string }) {
  const [beklemede, basla] = useTransition()
  return (
    <select
      className={secimCss}
      value={plan}
      disabled={beklemede}
      onChange={(e) => {
        const yeni = e.target.value
        if (!confirm(`${ad} → ${yeni} planına geçirilsin mi? (Dönem kredisi yüklenecek)`)) { e.target.value = plan; return }
        basla(async () => {
          const r = await planDegistir({ musteriId, plan: yeni })
          if (!r.ok) alert(r.hata)
        })
      }}
    >
      {PLANLAR.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  )
}

export function KrediEkleForm({ musteriId, ad }: { musteriId: string; ad: string }) {
  const [adet, setAdet] = useState(100)
  const [beklemede, basla] = useTransition()
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number" value={adet} min={-1000} max={10000} step={50}
        onChange={(e) => setAdet(Number(e.target.value))}
        className={`${secimCss} w-[76px] font-mono`}
        aria-label="Eklenecek kredi"
      />
      <button
        disabled={beklemede}
        onClick={() => {
          if (!confirm(`${ad} hesabına ${adet > 0 ? '+' : ''}${adet} kredi?`)) return
          basla(async () => {
            const r = await krediEkle({ musteriId, adet })
            if (!r.ok) alert(r.hata)
          })
        }}
        className="rounded-lg bg-kr px-2.5 py-1.5 text-[12px] font-bold text-kr-foreground transition hover:brightness-105 disabled:opacity-50"
      >
        {beklemede ? '…' : 'Ekle'}
      </button>
    </div>
  )
}

export function DemoDurum({ id, durum }: { id: string; durum: string }) {
  const [beklemede, basla] = useTransition()
  return (
    <select
      className={secimCss}
      value={durum}
      disabled={beklemede}
      onChange={(e) => {
        const yeni = e.target.value
        basla(async () => {
          const r = await demoDurumGuncelle({ id, durum: yeni })
          if (!r.ok) alert(r.hata)
        })
      }}
    >
      {DEMO_DURUMLAR.map((d) => <option key={d} value={d}>{d}</option>)}
    </select>
  )
}
