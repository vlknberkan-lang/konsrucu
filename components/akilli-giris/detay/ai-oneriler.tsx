'use client'

/**
 * KonsRücü — Dosya Detay · "AI farklı değer önerdi" listesi (S07; F13, B36, B37).
 * Yeniden çıkarım dolu alanı ezmez; AI'ın farklı bulduğu değer burada bekler. Alan başına [Uygula] (alanı yazar,
 * Aktivite'ye kaydeder, avukat onayını sıfırlar), dekont başına [Ödemeye ekle] (Odeme kaydı açar; faiz başlangıcı
 * alanına dokunmaz). [Yoksay] öneriyi listeden düşürür, veriyi değiştirmez. Kalıcı öneri kartları S18'de gelir.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Check, Plus, X, Receipt } from 'lucide-react'
import { aiOneriUygula, aiDekontOdemeyeEkle, aiOneriYoksay } from '@/app/(app)/akilli-giris/actions'
import { ALAN_ETIKET, PARA_ALANLARI, type AlanOnerisi, type CikarimOnerileri } from '@/lib/konsrucu/cikarim-birlestir'

const YOL_ETIKET: Record<string, string> = { KLASIK: 'Klasik İcra', IDARI: 'İdari Yol', BELIRSIZ: 'Belirsiz' }
const tl = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
const gun = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : 'tarihsiz')

function degerMetni(o: AlanOnerisi, v: string | number): string {
  if (PARA_ALANLARI.includes(o.alan)) return tl(Number(v))
  if (o.alan === 'yol') return YOL_ETIKET[String(v)] ?? String(v)
  return String(v)
}

export function AiOneriler({ dosyaId, oneriler }: { dosyaId: string; oneriler: CikarimOnerileri }) {
  const [pending, start] = useTransition()
  const [calisan, setCalisan] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  if (!oneriler.alanlar.length && !oneriler.dekontlar.length) return null

  function calistir(kimlik: string, is: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null)
    setCalisan(kimlik)
    start(async () => {
      const r = await is()
      if (!r.ok) setErr(r.error ?? 'İşlem tamamlanamadı')
      router.refresh()
      setCalisan(null)
    })
  }

  const btn = 'inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[11.5px] font-semibold transition disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50'
  const birincil = `${btn} bg-kr-soft text-kr-ink border border-kr/[0.18] hover:bg-kr-soft/70`
  const ikincil = `${btn} border border-border text-muted-foreground hover:text-foreground`

  return (
    <section aria-label="AI önerileri" className="mt-[14px] overflow-hidden rounded-2xl border border-warning/35 bg-surface shadow-card">
      <div className="flex items-start gap-3 border-b border-border-subtle bg-warning-soft/30 px-5 py-3.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-foreground">AI farklı değer önerdi</div>
          <p className="mt-0.5 max-w-[80ch] text-[12px] leading-[1.45] text-muted-foreground">
            Yeniden çıkarım dolu alanları değiştirmez. Uygulamak alanı yazar ve avukat onayını sıfırlar; dekontlar ödemeye ancak siz eklerseniz girer.
          </p>
        </div>
      </div>

      {oneriler.alanlar.length > 0 && (
        <ul className="divide-y divide-border-subtle">
          {oneriler.alanlar.map((o) => {
            const k = `alan:${o.alan}`
            const bu = pending && calisan === k
            return (
              <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <span className="w-[168px] shrink-0 text-[12px] text-muted-foreground">{ALAN_ETIKET[o.alan]}</span>
                <div className="min-w-[220px] flex-1 text-[12.5px]">
                  <div className="text-muted-foreground"><span className="font-mono text-[9.5px] uppercase tracking-[0.1em]">Mevcut</span> <span className={o.alan === 'aciklama' ? 'line-clamp-2' : ''}>{degerMetni(o, o.mevcut)}</span></div>
                  <div className="mt-0.5 font-semibold text-foreground"><span className="font-mono text-[9.5px] font-normal uppercase tracking-[0.1em] text-warning">AI önerisi</span> <span className={o.alan === 'aciklama' ? 'line-clamp-3' : ''}>{degerMetni(o, o.onerilen)}</span></div>
                  {o.alan === 'yol' && o.ek?.yolNeden && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{o.ek.yolNeden}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" disabled={pending} onClick={() => calistir(k, () => aiOneriUygula(dosyaId, o.alan))} className={birincil}>
                    {bu ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Uygula
                  </button>
                  <button type="button" disabled={pending} onClick={() => calistir(k, () => aiOneriYoksay(dosyaId, 'alan', o.alan))} className={ikincil}>
                    <X className="h-3 w-3" /> Yoksay
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {oneriler.dekontlar.length > 0 && (
        <div className={oneriler.alanlar.length ? 'border-t border-border' : ''}>
          <div className="px-5 pt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">AI'ın bulduğu dekontlar · ödeme listesine girmedi</div>
          <ul className="divide-y divide-border-subtle">
            {oneriler.dekontlar.map((d) => {
              const k = `dekont:${d.anahtar}`
              const bu = pending && calisan === k
              return (
                <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-[220px] flex-1 text-[12.5px]">
                    <span className="font-mono font-semibold text-foreground">{gun(d.tarih)} · {tl(d.tutar)}</span>
                    {d.haricMi && <span className="ml-2 rounded-full bg-muted px-2 py-[1px] text-[10.5px] font-semibold text-muted-foreground">ekspertiz · faize dahil değil</span>}
                    {d.aciklama && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{d.aciklama}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" disabled={pending} onClick={() => calistir(k, () => aiDekontOdemeyeEkle(dosyaId, d.anahtar))} className={birincil}>
                      {bu ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Ödemeye ekle
                    </button>
                    <button type="button" disabled={pending} onClick={() => calistir(k, () => aiOneriYoksay(dosyaId, 'dekont', d.anahtar))} className={ikincil}>
                      <X className="h-3 w-3" /> Yoksay
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {err && <p className="border-t border-border-subtle px-5 py-2 text-[11.5px] font-medium text-danger">{err}</p>}
    </section>
  )
}
