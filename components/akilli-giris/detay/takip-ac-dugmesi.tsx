'use client'

/**
 * KonsRücü — Dosya ekranı sağ panel · "Takip Aç · UYAP'a Gönder" (gerçek akış).
 * Basınca SenkronIs(KOPILOT) açılır; UYAP sekmesindeki KonsLaw paneli bu dosyayla açılır, avukat özeti kontrol edip
 * "Gönder"e basar (tevzi eklentide). Maddeler tamamlanmadan ya da avukat değilse kilitli.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { uyaptaTakibiAc } from '@/app/(app)/dosya-islem/takip-talebi-actions'
import { CanliSenkron } from '@/components/senkron/canli-senkron'

export function TakipAcDugmesi({ dosyaId, hazir, avukat }: { dosyaId: string; hazir: boolean; avukat: boolean }) {
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)
  const [tetik, setTetik] = useState(0)
  const router = useRouter()

  function ac() {
    setMesaj(null)
    start(async () => {
      const r = await uyaptaTakibiAc({ dosyaId })
      setMesaj(r.ok ? { tur: 'ok', metin: r.bilgi ?? "UYAP sekmesinde KonsLaw paneli bu dosyayla açıldı." } : { tur: 'hata', metin: r.error ?? 'Açılamadı' })
      if (r.ok) setTetik((t) => t + 1)
      router.refresh()
    })
  }

  const kilitli = !hazir || !avukat || pending
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={ac}
        disabled={kilitli}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-[11px] px-5 py-3 text-[14.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${hazir ? 'bg-success text-white shadow-[0_2px_8px_hsl(160_60%_18%/0.35)] hover:bg-success/90 focus-visible:ring-success/50' : 'bg-kr text-kr-foreground focus-visible:ring-kr/50'}`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />} Takip Aç · UYAP&apos;a Gönder
      </button>
      {!hazir && <p className="text-center font-mono text-[11px] text-muted-foreground">eksik maddeler tamamlanınca açılır</p>}
      {hazir && !avukat && <p className="text-center text-[11.5px] text-muted-foreground">Takibi avukat açar.</p>}
      {hazir && avukat && !mesaj && <p className="text-center text-[11.5px] text-muted-foreground">UYAP sekmesindeki KonsLaw panelinde özeti kontrol edip &quot;Gönder&quot;e siz basarsınız; harcı UYAP&apos;ta ödersiniz.</p>}
      {mesaj && <p role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`text-center text-[12px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</p>}
      {tetik > 0 && <CanliSenkron dosyaId={dosyaId} tetik={tetik} yazabilir={avukat} />}
    </div>
  )
}
