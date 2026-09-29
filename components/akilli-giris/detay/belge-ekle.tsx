'use client'

/** KonsRücü — Dosya Detay · manuel belge ekleme (tarayıcıda çıkarım + Storage'a bayt yükleme).
 *  `otomatikBul`: yükleme bitince "Belgelerden yeniden bul" kendiliğinden çalışır (kural, Excel ve yüzey açıksa
 *  yapay zekâ). Yalnız metni okunan belge geldiyse çalışır; yalnız fotoğraf yüklemesi model çağırmaz. */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, Plus, AlertTriangle, Info } from 'lucide-react'
import { evrakCikar } from '@/lib/konsrucu/evrak-cikar'
import { belgeEkle } from '@/app/(app)/akilli-giris/actions'
import { kuralOnerileriniUretEylem } from '@/app/(app)/dosya-islem/oneri-actions'
import { bulMesaji } from '@/components/dosya/oneri/bulduklarimiz'
import { createClient } from '@/lib/supabase/client'

const ACCEPT = '.pdf,image/*,.html,.htm'

export function BelgeEkle({ dosyaId, compact = false, otomatikBul = false }: { dosyaId: string; compact?: boolean; otomatikBul?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [hot, setHot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [faz, setFaz] = useState('')
  const [aktif, setAktif] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  async function isle(list: FileList | null) {
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    setBusy(true); setErr(null); setBilgi(null); setPct(0); setFaz('Çıkarılıyor')
    try {
      const belgeler = await evrakCikar(files, (done, total, ad) => { setPct(Math.round((done / total) * 100)); setAktif(ad) })

      // dosya baytlarını 'evrak' bucket'ına yükle (tarayıcıdan, oturumla)
      setFaz('Yükleniyor'); setPct(0)
      const supa = createClient()
      let yuklenen = 0
      let yukHata = ''
      for (let i = 0; i < files.length; i++) {
        setAktif(files[i].name); setPct(Math.round((i / files.length) * 100))
        try {
          const safe = files[i].name.replace(/[^\w.\-]+/g, '_').slice(0, 80)
          const sp = `${dosyaId}/${crypto.randomUUID()}-${safe}`
          const { error } = await supa.storage.from('evrak').upload(sp, files[i], { contentType: files[i].type || 'application/octet-stream', upsert: false })
          if (error) { if (!yukHata) yukHata = error.message }
          else { belgeler[i].storagePath = sp; yuklenen++ }
        } catch (e) { if (!yukHata) yukHata = (e as Error).message }
      }
      setPct(100)

      const r = await belgeEkle(dosyaId, belgeler)
      if (!r || !r.ok) { setErr(r?.error ?? 'Belgeler eklenemedi (sunucu yanıtı boş)'); return }
      if (yuklenen < files.length) setErr(`${yuklenen}/${files.length} dosyanın baytı Storage'a yüklendi. Açılamayanlar için sebep: ${yukHata || 'bilinmiyor'}`)
      router.refresh()

      const notlar: string[] = []
      if (otomatikBul && belgeler.some((b) => b.extractedText)) {
        setFaz('Belgelerden bilgiler bulunuyor (bir dakika kadar sürebilir)'); setPct(-1); setAktif('')
        const b = await kuralOnerileriniUretEylem({ dosyaId }).catch((e) => ({ ok: false as const, error: (e as Error).message }))
        notlar.push(b.ok ? bulMesaji(b) : `Belgeler eklendi ama bilgiler bulunamadı (${b.error}). "Belgelerden yeniden bul" ile tekrar deneyin.`)
        router.refresh()
      }
      // taranmış görüntü (dikey A4 oranlı resim): metni yok, yapay zekâya da gitmez (görsel KVKK kapısı)
      const taranan = belgeler.filter((b) => b.ocrGerekli && !b.extractedText).length
      if (taranan) notlar.push(`${taranan} taranmış görüntü (ör. el yazılı kaza tespit tutanağı) metne çevrilemedi; yapay zekâ bunları okumaz. Evrak listesinde belgeyi açıp türünü seçin, borçlu bilgisini tutanaktan elle girin.`)
      setBilgi(notlar.join(' ') || null)
    } catch (e) {
      setErr('İşleme hatası: ' + (e as Error).message)
    } finally {
      setBusy(false); setAktif(''); setFaz('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (compact) {
    return (
      <div className="text-right">
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => isle(e.target.files)} />
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {faz || 'İşleniyor'}…{pct >= 0 && ` %${pct}`}</> : <><Upload className="h-4 w-4" /> Evrak Yükle</>}
        </button>
        {err && <p className="mt-1 text-[11px] text-danger">{err}</p>}
        {bilgi && <p role="status" className="mt-1 text-[11px] text-muted-foreground">{bilgi}</p>}
      </div>
    )
  }

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => isle(e.target.files)} />
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setHot(true) }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); if (!busy) isle(e.dataTransfer.files) }}
        className={`flex items-center gap-4 rounded-[13px] border-[1.5px] border-dashed p-[15px_18px] transition motion-reduce:transition-none ${busy ? 'cursor-wait border-kr bg-kr-soft/40' : 'cursor-pointer ' + (hot ? 'border-kr bg-kr-soft' : 'border-border bg-surface-muted hover:border-kr/50')}`}
      >
        <span className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-border bg-surface ${hot ? 'text-kr-ink' : 'text-muted-foreground'}`}>
          {busy ? <Loader2 className="h-[19px] w-[19px] animate-spin" /> : <Upload className="h-[19px] w-[19px]" />}
        </span>
        <div className="min-w-0 flex-1">
          {busy ? (
            <>
              <div className="text-[13.5px] font-bold text-foreground">{faz || 'İşleniyor'}…{pct >= 0 && ` %${pct}`}</div>
              <div className="truncate text-[12px] text-muted-foreground">{aktif}</div>
            </>
          ) : (
            <>
              <div className="text-[13.5px] font-bold text-foreground">Belgeleri ya da klasörü buraya sürükleyin</div>
              <div className="text-[12px] text-muted-foreground">PDF, JPG, PNG · metin tarayıcıda çıkarılır (₺0) · dosyalar saklanır, sonra açılabilir</div>
            </>
          )}
        </div>
        <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }} className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-foreground transition hover:border-kr/40 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
          <Plus className="h-3.5 w-3.5" /> Belge Ekle
        </button>
      </div>
      {err && <p className="mt-2 flex items-center gap-1.5 text-[12px] text-danger"><AlertTriangle className="h-3.5 w-3.5" /> {err}</p>}
      {bilgi && <p role="status" className="mt-2 flex items-start gap-1.5 text-[12px] text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {bilgi}</p>}
    </div>
  )
}
