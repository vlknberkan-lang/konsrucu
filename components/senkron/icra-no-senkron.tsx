'use client'

/**
 * KonsRücü — Takip durağı: "İcra esas no" + "Kaydet ve UYAP'tan çek" + canlı ilerleme (S22; 06 §2(d)).
 * Kullanıcı tek alan doldurur (daire tevziden hazır gelir). Kaydedince öncelikli iş açılır; UYAP açıksa eklenti
 * işi 10 sn içinde alır ve adımlar aşağıdaki panelde canlı akar. Esas no kayıtlıysa birincil eylem "UYAP'tan çek".
 *
 * Props:
 *   dosyaId       — RucuDosyasi.id
 *   icraDosyaNo   — kayıtlı esas no (varsa)
 *   icraDairesi   — kayıtlı daire (tevziden ya da elle)
 *   yazabilir     — görüntüleyen rolünde false (form kapalı, yalnız panel)
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DownloadCloud, Loader2 } from 'lucide-react'
import { icraNoKaydetVeCek, uyaptanCek } from '@/app/(app)/dosya-islem/senkron-actions'
import { CanliSenkron } from './canli-senkron'

const INP = 'w-full rounded-[9px] border border-input bg-background px-3 py-2 text-[14px] text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
const ESAS_RE = /^(19|20)\d{2}\s*\/\s*\d{1,7}$/

export function IcraNoSenkron({ dosyaId, icraDosyaNo, icraDairesi, yazabilir = true }: { dosyaId: string; icraDosyaNo: string | null; icraDairesi: string | null; yazabilir?: boolean }) {
  const [esas, setEsas] = useState(icraDosyaNo ?? '')
  const [daire, setDaire] = useState(icraDairesi ?? '')
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)
  const [tetik, setTetik] = useState(0)
  const router = useRouter()

  const degisti = esas.trim() !== (icraDosyaNo ?? '') || daire.trim() !== (icraDairesi ?? '')
  const esasGecerli = ESAS_RE.test(esas.trim())

  function kaydetVeCek(e: React.FormEvent) {
    e.preventDefault()
    setMesaj(null)
    if (!esasGecerli) { setMesaj({ tur: 'hata', metin: 'Esas no "2026/1234" biçiminde olmalı.' }); return }
    start(async () => {
      const r = degisti || !icraDosyaNo
        ? await icraNoKaydetVeCek({ dosyaId, esasNo: esas.trim(), daire: daire.trim() || undefined })
        : await uyaptanCek({ dosyaId })
      if (!r.ok) { setMesaj({ tur: 'hata', metin: r.error ?? 'Kaydedilemedi' }); return }
      setMesaj({ tur: 'ok', metin: r.bilgi ?? 'Kaydedildi.' })
      setTetik((t) => t + 1)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {yazabilir && (
        <form onSubmit={kaydetVeCek} className="rounded-2xl border border-border bg-card p-4" aria-label="İcra esas no ve UYAP'tan çekme">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <label className="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
              İcra dairesi
              <input value={daire} onChange={(e) => setDaire(e.target.value)} placeholder="Tevziden gelir; yoksa UYAP'taki adıyla yazın" className={INP} disabled={pending} maxLength={160} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
              İcra esas no
              <input value={esas} onChange={(e) => setEsas(e.target.value)} placeholder="2026/1234" inputMode="numeric" className={`${INP} font-mono`} disabled={pending} required aria-invalid={!!esas && !esasGecerli} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || !esasGecerli} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[14px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <DownloadCloud className="h-4 w-4" />}
              {degisti || !icraDosyaNo ? 'Kaydet ve UYAP\'tan çek' : 'UYAP\'tan çek'}
            </button>
            {mesaj && <span role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`text-[12.5px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</span>}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">UYAP açıksa çekme 10 saniye içinde başlar. Eklenti yalnız okur; UYAP&apos;a hiçbir şey yazmaz.</p>
        </form>
      )}
      <CanliSenkron dosyaId={dosyaId} tetik={tetik} yazabilir={yazabilir} />
    </div>
  )
}
