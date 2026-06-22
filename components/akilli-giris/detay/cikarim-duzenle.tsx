'use client'

/** KonsRücü — Dosya Detay · AI çıkardığı dosya alanlarını ELLE düzenle (insan kontrolü). */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { dosyaGuncelle } from '@/app/(app)/akilli-giris/actions'

export type DosyaAlanlar = {
  yol: string; brans: string; hukukDosyaNo: string; hasarDosyaNo: string
  sigortaliUnvan: string; sigortaliPlaka: string; karsiPlaka: string
  rucuSebebi: string; rucuOrani: string; asilAlacak: string; rucuTutari: string
  kazaYeri: string; il: string; kazaTarihi: string; hasarTarihi: string; zamanasimi: string; yetkiliIcra: string
  kusurDurumu: string; olusSekli: string; muhatapOzet: string
}

const YOL = [['', '—'], ['KLASIK', 'Klasik İcra'], ['IDARI', 'İdari Yol'], ['BELIRSIZ', 'Belirsiz']]
const BRANS = [['', '—'], ['KASKO', 'KASKO'], ['ZMMS', 'ZMMS'], ['OTO_DISI', 'Oto Dışı']]
const INP = 'w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'

export function CikarimDuzenle({ dosyaId, v }: { dosyaId: string; v: DosyaAlanlar }) {
  const [edit, setEdit] = useState(false)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErr(null)
    start(async () => {
      const r = await dosyaGuncelle(dosyaId, fd)
      if (r.ok) { setEdit(false); router.refresh() } else setErr(r.error ?? 'Kaydedilemedi')
    })
  }

  const T = (name: keyof DosyaAlanlar, label: string, o?: { type?: string; mono?: boolean; full?: boolean; area?: boolean }) => (
    <div className={o?.full ? 'sm:col-span-2' : ''}>
      <label className={LBL}>{label}</label>
      {o?.area
        ? <textarea name={name} defaultValue={v[name]} rows={2} className={`${INP} resize-y`} />
        : <input name={name} type={o?.type ?? 'text'} defaultValue={v[name]} className={`${INP} ${o?.mono ? 'font-mono' : ''}`} />}
    </div>
  )
  const S = (name: 'yol' | 'brans', label: string, opts: string[][]) => (
    <div>
      <label className={LBL}>{label}</label>
      <select name={name} defaultValue={v[name]} className={INP}>{opts.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}</select>
    </div>
  )

  if (!edit) {
    return (
      <button type="button" onClick={() => setEdit(true)} className="inline-flex items-center gap-1.5 rounded-[9px] border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
        <Pencil className="h-3.5 w-3.5" /> Alanları düzenle
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-kr/30 bg-kr-soft/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Pencil className="h-4 w-4 text-kr" /><h3 className="font-display text-[14px] font-bold">Alanları düzenle</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">Kaydedince avukat onayı sıfırlanır</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {S('yol', 'Triyaj (yol)', YOL)}
        {S('brans', 'Branş', BRANS)}
        {T('hukukDosyaNo', 'Hukuk dosya no', { mono: true })}
        {T('hasarDosyaNo', 'Hasar dosya no', { mono: true })}
        {T('sigortaliUnvan', 'Sigortalı')}
        {T('rucuSebebi', 'Rücu sebebi')}
        {T('sigortaliPlaka', 'Sigortalı plaka', { mono: true })}
        {T('karsiPlaka', 'Karşı plaka', { mono: true })}
        {T('asilAlacak', 'Asıl alacak — ödenen (₺)', { mono: true })}
        {T('rucuTutari', 'Rücu tutarı — talep (₺)', { mono: true })}
        {T('rucuOrani', 'Rücu / kusur oranı', { mono: true })}
        {T('yetkiliIcra', 'Yetkili icra')}
        {T('kazaYeri', 'Kaza yeri')}
        {T('il', 'İl')}
        {T('kazaTarihi', 'Kaza tarihi', { type: 'date' })}
        {T('hasarTarihi', 'Hasar tarihi', { type: 'date' })}
        {T('zamanasimi', 'Zamanaşımı', { type: 'date' })}
        {T('kusurDurumu', 'Kusur durumu', { full: true })}
        {T('olusSekli', 'Oluş şekli', { full: true, area: true })}
        {T('muhatapOzet', 'Muhatap özeti', { full: true })}
      </div>
      {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Kaydet
        </button>
        <button type="button" onClick={() => { setEdit(false); setErr(null) }} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:text-foreground">
          <X className="h-4 w-4" /> Vazgeç
        </button>
      </div>
    </form>
  )
}
