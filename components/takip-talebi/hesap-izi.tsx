'use client'

/**
 * KonsRücü — Rücu tutarı hesap izi kartı (S21; B10; 06 §2(c) "Hesabı gör").
 * Hesabı kod yapar: dekont toplamı × rücu oranı = asıl alacak; Hugo rücu tutarıyla fark gösterilir.
 * Sovtaj, muafiyet ve kusur oranı K1 (Yelda) teyidi gelene kadar formüle katılmaz; ayrıca listelenir.
 * Onay yalnız avukat/yönetici; onaydan sonra ödeme ya da oran değişirse kart "yeniden onaylayın" der.
 *
 * Props: dosyaId, hesapIzi (HesapIzi), onay (kim/ne zaman), gecerli (onay hâlâ güncel mi), avukat, onOnaylandi
 */
import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { hesapIziniOnayla } from '@/app/(app)/dosya-islem/takip-talebi-actions'
import type { HesapIzi } from '@/lib/konsrucu/senkron/takip-talebi'
import type { HesapIziOnayi } from '@/lib/konsrucu/senkron/takip-talebi-db'
import { tarihSaatTR } from '@/lib/konsrucu/format'

export function HesapIziKarti({ dosyaId, hesapIzi, onay, gecerli, avukat, onOnaylandi }: {
  dosyaId: string
  hesapIzi: HesapIzi
  onay: HesapIziOnayi | null
  gecerli: boolean
  avukat: boolean
  onOnaylandi?: () => void
}) {
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)

  function onayla() {
    setMesaj(null)
    start(async () => {
      const r = await hesapIziniOnayla({ dosyaId })
      if (!r.ok) setMesaj({ tur: 'hata', metin: r.error ?? 'Onaylanamadı' })
      else { setMesaj({ tur: 'ok', metin: r.bilgi ?? 'Onaylandı' }); onOnaylandi?.() }
    })
  }

  return (
    <section aria-label="Rücu tutarı hesap izi" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[15px] font-bold text-foreground">Rücu tutarı hesap izi</h3>
        {onay && gecerli && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-[3px] text-[11.5px] font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> ONAYLI · {onay.kullaniciAd ?? 'avukat'} · {tarihSaatTR(onay.at)}
          </span>
        )}
        {onay && !gecerli && <span className="rounded-full bg-warning-soft px-2.5 py-[3px] text-[11.5px] font-semibold text-warning">ONAYDAN SONRA DEĞİŞTİ · yeniden onaylayın</span>}
        {!onay && <span className="rounded-full bg-warning-soft px-2.5 py-[3px] text-[11.5px] font-semibold text-warning">ONAY BEKLİYOR</span>}
      </div>

      <table className="mt-3 w-full text-[13.5px]">
        <tbody>
          {hesapIzi.adimlar.map((a) => (
            <tr key={a.etiket} className="border-b border-border-subtle last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium text-muted-foreground">{a.etiket}</th>
              <td className="font-mono py-1.5 text-right text-foreground">{a.deger}</td>
              <td className="py-1.5 pl-3 text-[12px] text-muted-foreground">{a.not ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hesapIzi.durdu && <p role="alert" className="mt-2 text-[13px] text-danger">{hesapIzi.durdu}</p>}
      {hesapIzi.tutarli === false && <p className="mt-2 text-[13px] text-danger">Hugo rücu tutarı hesapla uyuşmuyor. Onaylamadan önce ödemeleri ve rücu oranını kontrol edin.</p>}
      {hesapIzi.dahilEdilmeyen.length > 0 && (
        <ul className="mt-2 text-[12.5px] text-muted-foreground">
          {hesapIzi.dahilEdilmeyen.map((d) => <li key={d.etiket}>{d.etiket}: <span className="font-mono">{d.deger}</span> — {d.not}</li>)}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] text-muted-foreground">Formül: {hesapIzi.formulSurumu}.</p>

      {avukat ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onayla} disabled={pending || !!hesapIzi.durdu || (!!onay && gecerli)} className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-background px-3.5 py-1.5 text-[13.5px] font-semibold text-foreground transition hover:border-kr/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />} {onay && !gecerli ? 'Hesabı yeniden onayla' : 'Hesabı onayla'}
          </button>
          {mesaj && <span role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`text-[12.5px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</span>}
        </div>
      ) : (
        !onay && <p className="mt-3 text-[12.5px] text-muted-foreground">Bu adım avukatın onayını bekliyor.</p>
      )}
    </section>
  )
}
