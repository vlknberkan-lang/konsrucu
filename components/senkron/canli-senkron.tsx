'use client'

/**
 * KonsRücü — Canlı senkron paneli (S22; 06 §2(d) "UYAP'TAN ÇEKİLİYOR").
 * Dosyanın son SenkronIs kaydını 2 sn'de bir okur (iş sürerken); iş yokken 20 sn'de bir (bağlantı göstergesi ve
 * başka sekmeden açılan iş için). Supabase Realtime kullanılmaz: kısa aralıklı sorgu yeterli ve RLS riski yok.
 * Her adım zaman damgalı; evrak indirmede "7/18: Ödeme İcra Emri" gibi sayaç. Uyarılar düz Türkçe cümledir.
 *
 * Props:
 *   dosyaId — RucuDosyasi.id
 *   tetik   — (isteğe bağlı) değiştiğinde hemen yeniden sorar; "Kaydet ve UYAP'tan çek"ten sonra artırılır.
 *   yazabilir — sıradaki işi iptal düğmesi (görüntüleyen rolünde gizli).
 */
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from 'lucide-react'
import { senkronIsDurumu, senkronIsIptalEt, type SenkronIsDurumuSonuc } from '@/app/(app)/dosya-islem/senkron-actions'
import type { AdimDurumu } from '@/lib/konsrucu/senkron/is-saf'
import { saatTR } from '@/lib/konsrucu/format'
import { UyapBaglanti } from './uyap-baglanti'

const YOKLAMA_SUREN_MS = 2_000
const YOKLAMA_BOSTA_MS = 20_000

function AdimIkonu({ durum }: { durum: AdimDurumu }) {
  switch (durum) {
    case 'TAMAM': return <CheckCircle2 className="h-4 w-4 text-success" aria-label="tamamlandı" />
    case 'CALISIYOR': return <Loader2 className="h-4 w-4 animate-spin text-info motion-reduce:animate-none" aria-label="sürüyor" />
    case 'HATA': return <XCircle className="h-4 w-4 text-danger" aria-label="hata" />
    case 'ATLANDI': return <MinusCircle className="h-4 w-4 text-muted-foreground" aria-label="atlandı" />
    default: return <Circle className="h-4 w-4 text-muted-foreground/60" aria-label="bekliyor" />
  }
}

export function CanliSenkron({ dosyaId, tetik = 0, yazabilir = true }: { dosyaId: string; tetik?: number; yazabilir?: boolean }) {
  const [veri, setVeri] = useState<SenkronIsDurumuSonuc | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null)
  const oncekiDurum = useRef<string | null>(null)
  const router = useRouter()

  const yokla = useCallback(async () => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current)
    const r = await senkronIsDurumu({ dosyaId }).catch(() => null)
    if (!r || !r.ok) setHata(r?.error ?? 'Durum okunamadı; bağlantınızı kontrol edin.')
    else {
      setHata(null)
      setVeri(r)
      const durum = r.is?.durum ?? null
      // iş bittiği anda sayfayı tazele: yeni evrak, gelişme adayları ve künye görünsün
      if (oncekiDurum.current && ['BEKLIYOR', 'ALINDI', 'CALISIYOR'].includes(oncekiDurum.current) && durum && !['BEKLIYOR', 'ALINDI', 'CALISIYOR'].includes(durum)) router.refresh()
      oncekiDurum.current = durum
    }
    const suruyor = !!r?.ok && !!r.is?.surerMi
    zamanlayici.current = setTimeout(yokla, suruyor ? YOKLAMA_SUREN_MS : YOKLAMA_BOSTA_MS)
  }, [dosyaId, router])

  useEffect(() => {
    yokla()
    return () => { if (zamanlayici.current) clearTimeout(zamanlayici.current) }
  }, [yokla, tetik])

  function iptal(isId: string) {
    start(async () => {
      const r = await senkronIsIptalEt({ isId, dosyaId })
      if (!r.ok) setHata(r.error ?? 'İptal edilemedi')
      await yokla()
    })
  }

  if (!veri) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4" aria-busy="true">
        <div className="dd-skel h-4 w-56 rounded" />
        <div className="dd-skel mt-3 h-3 w-72 rounded" />
        <div className="dd-skel mt-2 h-3 w-64 rounded" />
      </div>
    )
  }

  const is = veri.is
  return (
    <section aria-label="UYAP'tan çekme ilerlemesi" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[15px] font-bold text-foreground">
          {is ? is.baslik : 'UYAP\'tan anlık çekme'}
          {is && <span className="font-mono ml-2 text-[12px] font-normal text-muted-foreground">başladı {saatTR(is.baslangic)}{is.bitis ? ` · bitti ${saatTR(is.bitis)}` : ''}</span>}
        </h3>
        <UyapBaglanti baglanti={veri.baglanti ?? null} />
      </div>

      {!is && (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Bu dosya için henüz anlık çekme yapılmadı. İcra esas no&apos;yu girip &quot;Kaydet ve UYAP&apos;tan çek&quot;e basın.
          {veri.kuyrukAcik === false && ' (Anlık çekme şu an kapalı; dosya eklentinin toplu turunda çekilir.)'}
        </p>
      )}

      {is && (
        <ol className="mt-3 flex flex-col gap-1.5" aria-live="polite">
          {is.adimlar.map((a) => (
            <li key={a.adim} className="flex items-start gap-2 text-[13px]">
              <span className="mt-[1px] shrink-0"><AdimIkonu durum={a.durum} /></span>
              <span className={a.durum === 'BEKLIYOR' ? 'text-muted-foreground' : 'text-foreground'}>
                {a.etiket}
                {a.sayacMetni && <span className="font-mono ml-1.5 text-[12px] text-muted-foreground">{a.sayacMetni}</span>}
                {a.mesaj && <span className="ml-1.5 text-[12px] text-muted-foreground">· {a.mesaj}</span>}
              </span>
              {a.t && a.durum !== 'BEKLIYOR' && <span className="font-mono ml-auto shrink-0 text-[11px] text-muted-foreground">{saatTR(a.t)}</span>}
            </li>
          ))}
        </ol>
      )}

      {is?.ulasmaSaniye != null && is.tur !== 'KOPILOT' && (
        <p className="mt-2 text-[12px] text-muted-foreground">İstek eklentiye {is.ulasmaSaniye} saniyede ulaştı.</p>
      )}

      {is?.uyari && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-[10px] border border-danger/30 bg-danger-soft/40 px-3 py-2 text-[13px] text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{is.uyari.metin}</span>
        </div>
      )}

      {is?.ozetMetni && <p className="mt-3 rounded-[10px] bg-success-soft/40 px-3 py-2 text-[13px] text-success">{is.ozetMetni} Gelişmeler onay kartlarında görünür.</p>}

      {veri.mutabakat && (
        <p className={`mt-2 text-[12.5px] ${veri.mutabakat.durum === 'FARKLI' ? 'text-danger' : veri.mutabakat.durum === 'ESLESIYOR' ? 'text-success' : 'text-muted-foreground'}`}>{veri.mutabakat.metin}</p>
      )}

      {hata && <p className="mt-2 text-[12px] text-danger">{hata}</p>}

      {is && is.durum === 'BEKLIYOR' && yazabilir && (
        <div className="mt-3">
          <button type="button" disabled={pending} onClick={() => iptal(is.id)} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />} Çekmeyi iptal et
          </button>
        </div>
      )}
    </section>
  )
}
