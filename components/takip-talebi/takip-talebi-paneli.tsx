'use client'

/**
 * KonsRücü — Takip talebi paneli (S21; 06 §2(c)): faiz seçimi + hesap izi + önizleme + "UYAP'ta takibi aç".
 * Tek birincil eylem: "UYAP'ta takibi aç" — faiz seçilmeden, hesap izi onaylanmadan ya da avukat onayı yokken KİLİTLİ;
 * kilidin sebepleri düğmenin üstünde yazar. Basınca SenkronIs(KOPILOT) açılır; eklenti UYAP sekmesinde Takip Aç
 * panelini bu dosyayla açar. Gönderim (tevzi) eklentide avukatın "Gönder" + onay kutusuyla kalır — değişmedi.
 *
 * Props: dosyaId
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { Lock, Loader2, Scale } from 'lucide-react'
import { takipTalebiGetir, uyaptaTakibiAc, type TakipTalebiGetirSonuc } from '@/app/(app)/dosya-islem/takip-talebi-actions'
import { CanliSenkron } from '@/components/senkron/canli-senkron'
import { FaizSecimi } from './faiz-secimi'
import { HesapIziKarti } from './hesap-izi'
import { TakipOnizleme } from './takip-onizleme'
import { AciklamaDuzenle } from '@/components/akilli-giris/detay/aciklama-duzenle'

export function TakipTalebiPaneli({ dosyaId }: { dosyaId: string }) {
  const [veri, setVeri] = useState<TakipTalebiGetirSonuc | null>(null)
  const [pending, start] = useTransition()
  const [mesaj, setMesaj] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null)
  const [tetik, setTetik] = useState(0)

  const yukle = useCallback(async () => {
    const r = await takipTalebiGetir({ dosyaId }).catch(() => null)
    setVeri(r ?? { ok: false, error: 'Takip talebi okunamadı; bağlantınızı kontrol edin.' })
  }, [dosyaId])

  useEffect(() => { yukle() }, [yukle])

  function ac() {
    setMesaj(null)
    start(async () => {
      const r = await uyaptaTakibiAc({ dosyaId })
      setMesaj(r.ok ? { tur: 'ok', metin: r.bilgi ?? 'İstek gönderildi.' } : { tur: 'hata', metin: r.error ?? 'Açılamadı' })
      if (r.ok) setTetik((t) => t + 1)
      await yukle()
    })
  }

  if (!veri) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4" aria-busy="true">
        <div className="dd-skel h-4 w-48 rounded" />
        <div className="dd-skel mt-3 h-24 w-full rounded" />
      </div>
    )
  }
  if (!veri.ok || !veri.gorunum) return <p role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft/40 p-4 text-[13px] text-danger">{veri.error ?? 'Takip talebi okunamadı.'}</p>

  const g = veri.gorunum
  const avukat = !!veri.avukat
  const kilitli = g.kilitSebepleri.length > 0 || !g.kopilotDestekli || g.tevziEdildi
  const kopilotIsSuruyor = !!veri.kopilotIsi?.surerMi

  return (
    <div className="flex flex-col gap-3">
      <FaizSecimi
        key={`${g.takipTalebi?.id ?? 'yok'}-${g.takipTalebi?.surum ?? 0}-${g.faiz.faizTuru ?? ''}-${g.faiz.faizOraniMetni ?? ''}-${g.faiz.faizBaslangicTuru ?? ''}`}
        dosyaId={dosyaId}
        deger={g.faiz}
        avukat={avukat}
        dondurulmus={!!g.takipTalebi?.dondurulduAt}
        onKaydedildi={yukle}
      />
      <HesapIziKarti dosyaId={dosyaId} hesapIzi={g.hesapIzi} onay={g.hesapIziOnayi} gecerli={g.hesapIziGecerli} avukat={avukat} onOnaylandi={yukle} />
      <TakipOnizleme gorunum={g} />
      {!g.tevziEdildi && (
        <section aria-label="UYAP takip açıklaması" className="rounded-2xl border border-border bg-card p-4">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">UYAP takip açıklaması</div>
          <AciklamaDuzenle
            dosyaId={dosyaId}
            init={g.aciklamaDuzen.ham}
            alan={{ kazaTarihi: g.aciklamaDuzen.kazaTarihi, sigortaliPlaka: g.aciklamaDuzen.sigortaliPlaka, karsiPlaka: g.aciklamaDuzen.karsiPlaka, alacakliUnvan: g.aciklamaDuzen.alacakliUnvan }}
            onKaydedildi={yukle}
          />
        </section>
      )}

      <section aria-label="UYAP'ta takibi aç" className="rounded-2xl border border-border bg-card p-4">
        {g.tevziEdildi ? (
          <p className="text-[13.5px] text-foreground">UYAP tevzisi yapıldı. Harcı UYAP&apos;ta ödeyin; esas no oluşunca hemen aşağıya girin.</p>
        ) : (
          <>
            {kilitli && (
              <div className="mb-3 rounded-[10px] border border-warning/30 bg-warning-soft/40 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning"><Lock className="h-3.5 w-3.5" aria-hidden /> Takip açma kilitli</div>
                <ul className="mt-1 list-disc pl-5 text-[12.5px] text-foreground">
                  {g.kilitSebepleri.map((s) => <li key={s}>{s}</li>)}
                  {!g.kopilotDestekli && g.talepMetni && <li>Bu faiz seçimi kopilotla aktarılamıyor; takibi UYAP&apos;ta elle açın.</li>}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={ac} disabled={!avukat || kilitli || pending || kopilotIsSuruyor} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[14px] font-semibold text-kr-foreground transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 disabled:opacity-60">
                {pending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Scale className="h-4 w-4" />} UYAP&apos;ta takibi aç
              </button>
              {!avukat && <span className="text-[12.5px] text-muted-foreground">Bu adım avukatın onayını bekliyor.</span>}
              {mesaj && <span role={mesaj.tur === 'hata' ? 'alert' : 'status'} className={`text-[12.5px] ${mesaj.tur === 'hata' ? 'text-danger' : 'text-success'}`}>{mesaj.metin}</span>}
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">UYAP sekmesinde KonsLaw paneli bu dosyayla açılır. Özeti kontrol edip &quot;Gönder&quot;e siz basarsınız; harcı UYAP&apos;ta siz ödersiniz.</p>
          </>
        )}
      </section>

      {(tetik > 0 || veri.kopilotIsi) && <CanliSenkron dosyaId={dosyaId} tetik={tetik} yazabilir={avukat} />}
    </div>
  )
}
