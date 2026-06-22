'use client'

/** KonsRücü — Dosya Detay · borçlular: ekle / düzelt / sil (insan kontrolü). */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, Trash2, Plus, Loader2 } from 'lucide-react'
import { borcluKaydet, borcluSil } from '@/app/(app)/akilli-giris/actions'

export type BorcluUI = { id: string; adUnvan: string; tcVkn: string; adres: string; rol: string; kaynak: string; teyit: string }

const ROL: string[][] = [['RUHSAT_SAHIBI', 'Ruhsat sahibi / İşleten'], ['SURUCU', 'Sürücü'], ['ISVEREN', 'İşveren'], ['KAT_MALIKI', 'Kat maliki'], ['YONETIM', 'Yönetim'], ['DIGER', 'Diğer']]
const TEYIT: string[][] = [['TEYIT_EDILDI', 'Teyitli'], ['TEYIT_GEREK', 'Teyit gerek'], ['SUPHE', 'Şüphe']]
const INP = 'w-full rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-kr focus:ring-2 focus:ring-kr/20'

function BorcluForm({ dosyaId, b, onDone }: { dosyaId: string; b?: BorcluUI; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErr(null)
    start(async () => { const r = await borcluKaydet(fd); if (r.ok) { onDone(); router.refresh() } else setErr(r.error ?? 'Kaydedilemedi') })
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-kr/30 bg-kr-soft/20 p-3">
      <input type="hidden" name="dosyaId" value={dosyaId} />
      {b && <input type="hidden" name="borcluId" value={b.id} />}
      <div className="grid grid-cols-2 gap-2">
        <input name="adUnvan" required defaultValue={b?.adUnvan} placeholder="Ad / Unvan" className={`${INP} col-span-2 font-semibold`} />
        <input name="tcVkn" defaultValue={b?.tcVkn} placeholder="TC / VKN" className={`${INP} font-mono`} />
        <input name="kaynak" defaultValue={b?.kaynak} placeholder="Kaynak (Lehe / tutanak…)" className={INP} />
        <select name="rol" defaultValue={b?.rol ?? 'DIGER'} className={INP}>{ROL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="teyit" defaultValue={b?.teyit ?? 'TEYIT_GEREK'} className={INP}>{TEYIT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input name="adres" defaultValue={b?.adres} placeholder="Adres" className={`${INP} col-span-2`} />
      </div>
      {err && <p className="mt-1.5 text-[11.5px] text-danger">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-[8px] bg-kr px-3 py-1.5 text-[12px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Kaydet</button>
        <button type="button" onClick={onDone} className="inline-flex items-center gap-1 rounded-[8px] border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition hover:text-foreground"><X className="h-3.5 w-3.5" /> Vazgeç</button>
      </div>
    </form>
  )
}

export function BorclularDuzenle({ dosyaId, borclular }: { dosyaId: string; borclular: BorcluUI[] }) {
  const [duzenle, setDuzenle] = useState<string | null>(null)
  const [yeni, setYeni] = useState(false)
  const [silen, setSilen] = useState<string | null>(null)
  const router = useRouter()
  const ROL_LBL: Record<string, string> = Object.fromEntries(ROL)
  const TEYIT_LBL: Record<string, [string, string]> = {
    TEYIT_EDILDI: ['Teyitli', 'bg-success-soft text-success'], TEYIT_GEREK: ['Teyit gerek', 'bg-warning-soft text-warning'], SUPHE: ['Şüphe', 'bg-danger-soft text-danger'],
  }

  async function sil(id: string) {
    if (!window.confirm('Borçlu silinsin mi?')) return
    setSilen(id)
    const r = await borcluSil(id)
    setSilen(null)
    if (r.ok) router.refresh()
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {borclular.length === 0 && !yeni && (
        <div className="rounded-[10px] border border-border-subtle bg-surface-muted px-3.5 py-3 text-[12.5px] text-muted-foreground">Borçlu yok — AI çıkarımıyla dolar ya da elle ekleyin.</div>
      )}
      {borclular.map((b) => duzenle === b.id ? (
        <BorcluForm key={b.id} dosyaId={dosyaId} b={b} onDone={() => setDuzenle(null)} />
      ) : (
        <div key={b.id} className="rounded-[13px] border border-border bg-surface p-[14px_15px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[15px] font-extrabold">{b.adUnvan}</span>
            <span className="font-mono rounded-full bg-surface-muted px-2 py-[2px] text-[10px] font-semibold uppercase text-muted-foreground">{ROL_LBL[b.rol] ?? b.rol}</span>
            <span className={`ml-auto rounded-full px-2 py-[2px] text-[10.5px] font-semibold ${(TEYIT_LBL[b.teyit] ?? ['', 'bg-muted text-muted-foreground'])[1]}`}>{(TEYIT_LBL[b.teyit] ?? [b.teyit])[0]}</span>
          </div>
          <div className="font-mono mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">{b.tcVkn && <span>TC/VKN: {b.tcVkn}</span>}{b.kaynak && <span>Kaynak: {b.kaynak}</span>}</div>
          {b.adres && <div className="mt-1 text-[11.5px] text-muted-foreground">{b.adres}</div>}
          <div className="mt-2 flex gap-2">
            <button onClick={() => setDuzenle(b.id)} className="inline-flex items-center gap-1 rounded-[8px] border border-border px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-foreground"><Pencil className="h-3 w-3" /> Düzelt</button>
            <button onClick={() => sil(b.id)} disabled={silen === b.id} className="inline-flex items-center gap-1 rounded-[8px] border border-danger/30 px-2.5 py-1 text-[11.5px] font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-60">{silen === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Sil</button>
          </div>
        </div>
      ))}
      {yeni
        ? <BorcluForm dosyaId={dosyaId} onDone={() => setYeni(false)} />
        : <button onClick={() => setYeni(true)} className="inline-flex w-fit items-center gap-1.5 rounded-[9px] border border-dashed border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"><Plus className="h-3.5 w-3.5" /> Borçlu ekle</button>}
    </div>
  )
}
