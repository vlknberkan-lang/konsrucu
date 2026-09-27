'use client'

/**
 * KonsRücü — "Kaynağı göster" · components/dosya/oneri/kaynak-goster.tsx  (S18 kabul 2)
 * Önerinin dayandığı belgeyi DOĞRU SAYFADA açar: PDF iframe'e `#page=N` ile, görsel <img> ile. Üstte (maskeli)
 * alıntı ve alıntının belgede bulunup bulunmadığı yazar. Belge baytı saklanmamışsa (eski kayıt) açıklama gösterir.
 * İmzalı bağlantıyı mevcut `belgeAc` eylemi verir (tenant denetimi orada).
 */
import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ExternalLink, AlertTriangle, FileText } from 'lucide-react'
import { belgeAc } from '@/app/(app)/akilli-giris/actions'
import { DUGME_IKINCIL } from './ortak'

export type KaynakHedefi = {
  belgeId: string
  belgeAdi: string | null
  sayfa: number | null
  alinti: string | null
  alintiDurumu: 'DOGRU' | 'KAYNAKSIZ' | 'YOK'
  acilabilir: boolean
}

const tip = (ad: string | null): 'img' | 'pdf' | 'other' =>
  /\.(jpe?g|png|webp|gif|bmp)$/i.test(ad ?? '') ? 'img' : /\.pdf$/i.test(ad ?? '') ? 'pdf' : 'other'

export function KaynakGoster({ hedef, onKapat }: { hedef: KaynakHedefi | null; onKapat: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const kapatRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!hedef) { setUrl(null); setHata(null); return }
    kapatRef.current?.focus()
    if (!hedef.acilabilir) { setUrl(null); setHata('Bu belgenin dosyası saklanmamış (eski kayıt); yalnız alıntı gösterilebiliyor.'); return }
    let iptal = false
    setYukleniyor(true); setHata(null); setUrl(null)
    belgeAc(hedef.belgeId)
      .then((r) => { if (iptal) return; if (r?.ok && r.url) setUrl(r.url); else setHata(r?.error ?? 'Belge açılamadı.'); setYukleniyor(false) })
      .catch(() => { if (!iptal) { setHata('Belge açılamadı; bağlantıyı kontrol edin.'); setYukleniyor(false) } })
    return () => { iptal = true }
  }, [hedef])

  useEffect(() => {
    if (!hedef) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onKapat() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [hedef, onKapat])

  if (!hedef) return null
  const t = tip(hedef.belgeAdi)
  const src = url && t === 'pdf' && hedef.sayfa ? `${url}#page=${hedef.sayfa}` : url

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onKapat}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="kaynak-goster-baslik"
        className="flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Kaynak</div>
            <h3 id="kaynak-goster-baslik" className="mt-0.5 flex items-center gap-1.5 truncate text-[14px] font-bold text-foreground">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              {hedef.belgeAdi ?? 'Belge'}{hedef.sayfa ? <span className="font-mono text-[12px] font-semibold text-muted-foreground"> · sayfa {hedef.sayfa}</span> : null}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {url && <a href={src ?? url} target="_blank" rel="noopener noreferrer" className={DUGME_IKINCIL}><ExternalLink className="h-3 w-3" aria-hidden /> Yeni sekmede aç</a>}
            <button ref={kapatRef} type="button" onClick={onKapat} className={DUGME_IKINCIL} aria-label="Kapat"><X className="h-3.5 w-3.5" aria-hidden /> Kapat</button>
          </div>
        </div>
        {hedef.alinti && (
          <div className="border-b border-border-subtle bg-surface-muted px-5 py-3 text-[12.5px] leading-[1.5]">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Alıntı · </span>
            <q className="text-foreground">{hedef.alinti}</q>
            {hedef.alintiDurumu === 'KAYNAKSIZ' && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-[1px] text-[10.5px] font-semibold text-danger">
                <AlertTriangle className="h-3 w-3" aria-hidden /> KAYNAKSIZ · alıntı belgede bulunamadı
              </span>
            )}
          </div>
        )}
        <div className="min-h-[320px] flex-1 overflow-auto bg-surface-muted">
          {yukleniyor && <div className="flex h-[320px] items-center justify-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> Belge açılıyor…</div>}
          {hata && <div className="flex h-[200px] items-center justify-center px-6 text-center text-[12.5px] text-muted-foreground">{hata}</div>}
          {src && t === 'pdf' && <iframe title={hedef.belgeAdi ?? 'Belge'} src={src} className="h-[72vh] w-full border-0" />}
          {src && t === 'img' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={hedef.belgeAdi ?? 'Belge görüntüsü'} className="mx-auto max-h-[72vh] object-contain" />
          )}
          {src && t === 'other' && (
            <div className="flex h-[200px] items-center justify-center px-6 text-center text-[12.5px] text-muted-foreground">
              Bu biçim tarayıcıda önizlenemiyor; &quot;Yeni sekmede aç&quot; ile indirin{hedef.sayfa ? ` ve ${hedef.sayfa}. sayfaya bakın` : ''}.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
