'use client'

/**
 * KonsRücü — Yargıtay Emsal Kararları paneli (Dava sekmesi, dilekçe üstünde).
 * "Emsal Karar Bul" → dosya bağlamından canlı Yargıtay araması (karararama) → AI süzer → kart listesi.
 * Seçili (✓) emsaller, "Dilekçe Üret"te şablonun Yargıtay bloğuna dayanak olarak otomatik eklenir.
 * Kaynak: EmsalKarar (cache). Eylemler: emsalBul / emsalSecimDegistir / emsalSil.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Scale, Loader2, Search, Trash2, ChevronDown, ExternalLink } from 'lucide-react'
import { emsalBul, emsalSecimDegistir, emsalSil } from '@/app/(app)/akilli-giris/actions'

export type EmsalUI = {
  id: string
  yargitayId: string
  daire: string
  esasNo: string
  kararNo: string
  kararTarihi: string
  alaka: string
  secili: boolean
  aramaKelime: string | null
}

const KARARARAMA = 'https://karararama.yargitay.gov.tr/'

export function EmsalPanel({ dosyaId, emsaller }: { dosyaId: string; emsaller: EmsalUI[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const [acik, setAcik] = useState<Record<string, boolean>>({})

  function bul() {
    setErr(null); setBilgi(null)
    start(async () => {
      const r = await emsalBul(dosyaId)
      if (r.ok) { setBilgi(r.eklenen ? `"${r.kelime}" ile ${r.eklenen} emsal bulundu.` : `"${r.kelime}" için yeni emsal bulunamadı.`); router.refresh() }
      else setErr(r.error ?? 'Aranamadı')
    })
  }
  function secim(id: string, secili: boolean) {
    start(async () => { const r = await emsalSecimDegistir(id, secili); if (!r.ok) setErr(r.error ?? 'Güncellenemedi'); else router.refresh() })
  }
  function sil(id: string) {
    start(async () => { const r = await emsalSil(id); if (!r.ok) setErr(r.error ?? 'Silinemedi'); else router.refresh() })
  }

  const seciliSayi = emsaller.filter((e) => e.secili).length

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-kr-soft text-kr-ink"><Scale className="h-4 w-4" /></span>
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Yargıtay · Emsal</div>
            <h2 className="font-display text-[16px] font-extrabold">Emsal Kararlar</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {emsaller.length > 0 && <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">{seciliSayi}/{emsaller.length} seçili</span>}
          <button type="button" onClick={bul} disabled={pending} className="inline-flex items-center gap-1.5 rounded-[10px] bg-kr px-3.5 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90 disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {emsaller.length ? 'Tekrar ara' : 'Emsal Karar Bul'}
          </button>
        </div>
      </div>

      <div className="p-5">
        {emsaller.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Scale className="h-8 w-8 text-muted-foreground/50" />
            <p className="max-w-[60ch] text-[12.5px] leading-[1.55] text-muted-foreground">
              Dosyanın <b className="text-foreground">olay türü, branşı ve kusur durumundan</b> yola çıkarak <b className="text-foreground">Yargıtay Karar Arama</b> üzerinde canlı emsal aranır; AI alâkalı olanları seçip <b className="text-foreground">neden emsal olduğunu</b> özetler. Seçtikleriniz <b className="text-foreground">dilekçenin Yargıtay bölümüne</b> dayanak olarak eklenir.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {emsaller.map((e) => {
              const dokumanUrl = `${KARARARAMA}#/${e.yargitayId}`
              return (
                <li key={e.id} className={`rounded-[12px] border bg-surface-muted/30 p-3.5 transition ${e.secili ? 'border-kr/40' : 'border-border'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={e.secili} onChange={(ev) => secim(e.id, ev.target.checked)} disabled={pending}
                      className="mt-1 h-4 w-4 shrink-0 accent-kr" aria-label="Dilekçeye dayanak olarak ekle" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-display text-[13px] font-bold text-foreground">{e.daire}</span>
                        <span className="font-mono text-[11.5px] text-muted-foreground">E. {e.esasNo} · K. {e.kararNo}</span>
                        <span className="font-mono text-[11px] text-muted-foreground/80">{e.kararTarihi}</span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-[1.55] text-foreground/90">{e.alaka}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <button type="button" onClick={() => setAcik((s) => ({ ...s, [e.id]: !s[e.id] }))} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground transition hover:text-kr">
                          <ChevronDown className={`h-3.5 w-3.5 transition ${acik[e.id] ? 'rotate-180' : ''}`} /> {acik[e.id] ? 'Künyeyi gizle' : 'Künye'}
                        </button>
                        <a href={dokumanUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground transition hover:text-kr">
                          <ExternalLink className="h-3.5 w-3.5" /> Yargıtay'da aç
                        </a>
                        <button type="button" onClick={() => sil(e.id)} disabled={pending} className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground transition hover:text-danger disabled:opacity-60">
                          <Trash2 className="h-3.5 w-3.5" /> Kaldır
                        </button>
                      </div>
                      {acik[e.id] && (
                        <div className="mt-2 rounded-[10px] border border-border-subtle bg-surface p-2.5 font-mono text-[11px] text-muted-foreground">
                          {e.aramaKelime ? <>Arama: <span className="text-foreground/80">{e.aramaKelime}</span> · </> : null}
                          Karar no: <span className="text-foreground/80">{e.yargitayId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {bilgi && <p className="mt-3 text-[12px] text-muted-foreground">{bilgi}</p>}
        {err && <p className="mt-3 text-[12px] text-danger">{err}</p>}
        {emsaller.length > 0 && (
          <p className="mt-3 text-[11px] leading-[1.5] text-muted-foreground">Seçili (<b className="text-foreground">✓</b>) emsaller, <b className="text-foreground">Dilekçe Üret</b>'te şablonun Yargıtay bölümüne dayanak olarak eklenir. Atıfları dilekçede kontrol edin.</p>
        )}
      </div>
    </section>
  )
}
