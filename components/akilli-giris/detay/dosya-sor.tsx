'use client'

/**
 * KonsRücü — Dosya Detay · "Dosyaya Sor" (AI)
 * Belge + çıkarım + aşama bağlamıyla dosyaya soru sorulur. POST /api/dosya-sor.
 */
import { useState } from 'react'
import { Sparkles, Send, Loader2 } from 'lucide-react'

const ONERILER = [
  'Bu dosyada sıradaki adım ne olmalı?',
  'Borçlular ve kusur durumu nedir?',
  'Zamanaşımı / süre riski var mı?',
  'Tahsil ihtimali — güçlü ve zayıf yönler?',
]
type Msg = { rol: 'soru' | 'cevap'; metin: string }

export function DosyaSor({ dosyaId }: { dosyaId: string }) {
  const [acik, setAcik] = useState(false)
  const [soru, setSoru] = useState('')
  const [mesajlar, setMesajlar] = useState<Msg[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function sor(q: string) {
    const text = q.trim()
    if (!text || yukleniyor) return
    setHata(null)
    setMesajlar((m) => [...m, { rol: 'soru', metin: text }])
    setSoru('')
    setYukleniyor(true)
    try {
      const res = await fetch('/api/dosya-sor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dosyaId, soru: text }) })
      const j = await res.json()
      if (j.ok) setMesajlar((m) => [...m, { rol: 'cevap', metin: j.cevap }])
      else setHata(j.error ?? 'Yanıt alınamadı')
    } catch (e) {
      setHata((e as Error).message)
    }
    setYukleniyor(false)
  }

  return (
    <section className="mt-[14px] overflow-hidden rounded-2xl border border-kr/25 bg-kr/[0.03] shadow-card">
      <button type="button" onClick={() => setAcik((v) => !v)} className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left transition hover:bg-kr/[0.04]">
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-kr-soft text-kr-ink"><Sparkles className="h-4 w-4" /></span>
          <span className="font-display text-[14.5px] font-bold">Dosyaya Sor</span>
          <span className="hidden text-[11.5px] text-muted-foreground sm:inline">AI · belge + çıkarım bağlamıyla</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{acik ? 'gizle' : 'aç'}</span>
      </button>

      {acik && (
        <div className="border-t border-kr/15 px-5 py-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ONERILER.map((o) => (
              <button key={o} type="button" onClick={() => sor(o)} disabled={yukleniyor} className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-muted-foreground transition hover:border-kr/40 hover:text-kr disabled:opacity-50">{o}</button>
            ))}
          </div>

          {mesajlar.length > 0 && (
            <div className="mb-3 flex max-h-[440px] flex-col gap-2.5 overflow-y-auto">
              {mesajlar.map((m, i) => (
                <div key={i} className={m.rol === 'soru' ? 'max-w-[85%] self-end rounded-[12px] rounded-br-sm bg-kr px-3 py-2 text-[12.5px] text-kr-foreground' : 'max-w-[92%] self-start whitespace-pre-wrap rounded-[12px] rounded-bl-sm border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed'}>{m.metin}</div>
              ))}
              {yukleniyor && <div className="inline-flex items-center gap-2 self-start rounded-[12px] border border-border bg-surface px-3 py-2 text-[12.5px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> düşünüyor…</div>}
            </div>
          )}
          {hata && <div className="mb-2 text-[12px] text-danger">{hata}</div>}

          <form onSubmit={(e) => { e.preventDefault(); sor(soru) }} className="flex items-end gap-2">
            <textarea
              value={soru}
              onChange={(e) => setSoru(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sor(soru) } }}
              rows={1}
              placeholder="Bu dosyaya bir şey sor… (Enter = gönder)"
              className="min-h-[40px] flex-1 resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15"
            />
            <button type="submit" disabled={yukleniyor || !soru.trim()} className="inline-flex h-[40px] items-center gap-1.5 rounded-[10px] bg-kr px-3.5 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-50">
              {yukleniyor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <p className="mt-2 text-[10.5px] text-muted-foreground">Yanıtlar dosyadaki belge ve verilere dayanır; kesin işlem öncesi kontrol edin.</p>
        </div>
      )}
    </section>
  )
}
