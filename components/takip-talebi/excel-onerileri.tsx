'use client'

/**
 * KonsRücü — Dosyadaki Ray Excel önerileri (icra sütunları; S21, 06 §3.5).
 * Her öneri kaynaklı gelir ("Excel #16 · satır 12"); avukat "Onayla" deyince hedef alana yazılır.
 * Onaylı esas no dosyayı UYAP senkron hedefine sokar. Reddedilen öneri silinmez.
 * Birincil eylem yok (Şimdi kartı birincildir); düğmeler çerçevelidir.
 *
 * Props: dosyaId
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { excelOnerileriGetir, excelOnerisiOnayla, excelOnerisiReddet, type ExcelOnerileriSonuc } from '@/app/(app)/dosya-islem/takip-talebi-actions'

function degerMetni(v: string | number): string {
  if (typeof v === 'number') return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' TL'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v)
}

const DUGME = 'rounded-[9px] border border-border px-2.5 py-1 text-[12.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'

export function ExcelOnerileri({ dosyaId }: { dosyaId: string }) {
  const [veri, setVeri] = useState<ExcelOnerileriSonuc | null>(null)
  const [pending, start] = useTransition()
  const [islenen, setIslenen] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)

  const yukle = useCallback(async () => {
    const r = await excelOnerileriGetir({ dosyaId }).catch(() => null)
    setVeri(r ?? { ok: false, error: 'Öneriler okunamadı.' })
  }, [dosyaId])
  useEffect(() => { yukle() }, [yukle])

  function islem(id: string, tur: 'onay' | 'ret') {
    setMesaj(null); setIslenen(id)
    start(async () => {
      const r = tur === 'onay' ? await excelOnerisiOnayla({ alanDegeriId: id }) : await excelOnerisiReddet({ alanDegeriId: id })
      setMesaj(r.ok ? { tur: 'ok', metin: r.bilgi ?? 'Tamam' } : { tur: 'hata', metin: r.error ?? 'İşlem yapılamadı' })
      setIslenen(null)
      await yukle()
    })
  }

  if (!veri) return <div className="dd-skel h-16 w-full rounded-2xl" aria-busy="true" />
  if (!veri.ok) return <p role="alert" className="text-[12.5px] text-danger">{veri.error}</p>
  const oneriler = veri.oneriler ?? []
  if (!oneriler.length) return null

  return (
    <section aria-label="Ray Excel önerileri" className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display text-[15px] font-bold text-foreground">Ray Excel&apos;inden gelen icra bilgileri</h3>
      <ul className="mt-2 flex flex-col">
        {oneriler.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-2 border-b border-border-subtle py-1.5 last:border-0">
            <span className="min-w-[180px] text-[13px] text-muted-foreground">{o.etiket}</span>
            <span className="font-mono text-[13.5px] text-foreground">{degerMetni(o.deger)}</span>
            <span className="text-[11.5px] text-muted-foreground">kaynak: {o.kaynak ?? 'Excel'}</span>
            {o.durum === 'ONAYLI' ? (
              <span className="ml-auto rounded-full bg-success-soft px-2 py-[2px] text-[11px] font-semibold text-success">ONAYLI</span>
            ) : veri.avukat ? (
              <span className="ml-auto flex gap-1.5">
                <button type="button" disabled={pending} onClick={() => islem(o.id, 'onay')} className={`${DUGME} text-foreground hover:border-kr/50`}>
                  {pending && islenen === o.id ? <Loader2 className="inline h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : 'Onayla'}
                </button>
                <button type="button" disabled={pending} onClick={() => islem(o.id, 'ret')} className={`${DUGME} text-muted-foreground hover:text-danger`}>Reddet</button>
              </span>
            ) : (
              <span className="ml-auto rounded-full bg-warning-soft px-2 py-[2px] text-[11px] font-semibold text-warning">ONAY BEKLİYOR</span>
            )}
          </li>
        ))}
      </ul>
      {mesaj && <p role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`mt-2 text-[12.5px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</p>}
    </section>
  )
}
