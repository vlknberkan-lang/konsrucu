'use client'

/**
 * KonsRücü — Şirket Bilgileri · UYAP eklenti SENKRON ANAHTARI.
 * Üret/yenile → bir kez gösterilir (kopyala) → Chrome eklentisinin ayarına yapıştırılır.
 * Eklenti bu anahtarla programa bağlanır (hedefleri çeker, durum/evrak yazar).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import { senkronTokenUret, senkronTokenSil } from '@/app/(app)/ayarlar/actions'
import { Kopyala } from '@/components/akilli-giris/kopyala'

export type SenkronSaglik = { aktifToplam: number; bekleyen: number; sonSenkron: string | null }

export function SenkronAnahtar({ musteriId, init, programUrl, saglik }: { musteriId: string; init: { yuklu: boolean }; programUrl: string; saglik?: SenkronSaglik }) {
  const [token, setToken] = useState<string | null>(null) // sadece yeni üretilince gösterilir
  const [yuklu, setYuklu] = useState(init.yuklu)
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  function uret() {
    setErr(null)
    start(async () => {
      const r = await senkronTokenUret(musteriId)
      if (r.ok && r.token) { setToken(r.token); setYuklu(true); router.refresh() } else setErr(r.error ?? 'Üretilemedi')
    })
  }
  function sil() {
    setErr(null)
    start(async () => {
      const r = await senkronTokenSil(musteriId)
      if (r.ok) { setToken(null); setYuklu(false); router.refresh() } else setErr(r.error ?? 'Kaldırılamadı')
    })
  }

  const INP = 'w-full rounded-[9px] border border-border bg-surface-muted px-3 py-2 font-mono text-[12.5px] text-foreground outline-none'

  // son senkron tazeliği: >28 saat = uyarı rengi (eklenti susmuş olabilir)
  const sonSenkronDt = saglik?.sonSenkron ? new Date(saglik.sonSenkron) : null
  const saatOnce = sonSenkronDt ? Math.round((Date.now() - sonSenkronDt.getTime()) / 3_600_000) : null
  const bayat = saglik ? saglik.aktifToplam > 0 && (!sonSenkronDt || (saatOnce ?? 0) >= 28) : false

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
        Eklentiyi programa bağlamak için bir <b>senkron anahtarı</b> üretin ve Chrome eklentisinin ayarına yapıştırın.
        Eklenti bununla takip edilecek icraları çeker, durum/evrakı buraya yazar.
      </p>

      {saglik && saglik.aktifToplam > 0 && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-3 py-2 text-[12px] ${bayat ? 'border-danger/30 bg-danger-soft/40 text-danger' : 'border-border-subtle bg-surface-muted/40 text-muted-foreground'}`}>
          {bayat && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
          <span>
            Son senkron:{' '}
            <b className="font-mono">
              {sonSenkronDt
                ? `${sonSenkronDt.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })} (~${saatOnce} sa önce)`
                : 'hiç gelmedi'}
            </b>
          </span>
          <span>· {saglik.aktifToplam} aktif dosya · <b>{saglik.bekleyen}</b> senkron bekliyor</span>
          {bayat && <span className="basis-full text-[11.5px]">Eklenti susmuş görünüyor — Chrome + UYAP oturumu + eklentiyi kontrol edin.</span>}
        </div>
      )}

      <div>
        <label className="font-mono mb-1 block text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Program adresi (eklentiye)</label>
        <div className="flex items-center gap-2">
          <input readOnly value={programUrl} className={INP} onFocus={(e) => e.currentTarget.select()} />
          <Kopyala metin={programUrl} etiket="Kopyala" />
        </div>
      </div>

      {token ? (
        <div className="rounded-xl border border-success/30 bg-success-soft/40 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-success"><AlertTriangle className="h-3.5 w-3.5" /> Anahtar bir kez gösterilir — şimdi kopyalayıp eklentiye yapıştırın.</div>
          <div className="flex items-center gap-2">
            <input readOnly value={token} className={INP} onFocus={(e) => e.currentTarget.select()} />
            <Kopyala metin={token} etiket="Kopyala" />
          </div>
        </div>
      ) : (
        <div className="text-[12.5px] text-muted-foreground">{yuklu ? 'Anahtar tanımlı (gizli). Kaybettiyseniz yenileyin — eskisi geçersiz olur.' : 'Henüz anahtar yok.'}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={uret} disabled={pending} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : yuklu ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />} {yuklu ? 'Anahtarı yenile' : 'Anahtar üret'}
        </button>
        {yuklu && (
          <button type="button" onClick={sil} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:border-danger/40 hover:text-danger disabled:opacity-60">
            <Trash2 className="h-4 w-4" /> Kaldır
          </button>
        )}
        {err && <span className="text-[12px] text-danger">{err}</span>}
      </div>
    </div>
  )
}
