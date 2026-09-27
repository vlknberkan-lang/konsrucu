'use client'

/**
 * KonsRücü — Dava Dilekçesi paneli (Dava sekmesi).
 * Eski "Dilekçe Üret" hattı kapatıldı (denetim B05–B09): yeni taslaklar Dilekçe Masası'nda üretilir.
 * Burada yalnız daha önce üretilmiş taslak görüntülenir / kopyalanır / Word'e aktarılır / kaydedilir.
 * Kaynak: UretilenCikti (DILEKCE).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Loader2, Copy, Check, Save, FileDown, ArrowRight } from 'lucide-react'
import { dilekceKaydet } from '@/app/(app)/akilli-giris/actions'

export type DilekceCikti = { id: string; icerik: string | null; durum: string | null }

const DURUM_ET: Record<string, string> = { TASLAK: 'Taslak', IMZAYA_GIDEN: 'İmzaya giden', GONDERILDI: 'Gönderildi' }

export function DilekcePanel({ dosyaId, cikti }: { dosyaId: string; cikti: DilekceCikti | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [metin, setMetin] = useState(cikti?.icerik ?? '')
  const [ciktiId, setCiktiId] = useState<string | null>(cikti?.id ?? null)
  const [durum, setDurum] = useState(cikti?.durum ?? 'TASLAK')
  const [err, setErr] = useState<string | null>(null)
  const [kopyalandi, setKopyalandi] = useState(false)
  const [kayitOk, setKayitOk] = useState(false)
  const [wordPending, setWordPending] = useState(false)

  async function kopyala() {
    try { await navigator.clipboard.writeText(metin); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000) } catch { setErr('Kopyalanamadı') }
  }
  async function wordIndir() {
    setWordPending(true); setErr(null)
    try {
      const r = await fetch('/api/dilekce/docx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metin, ad: 'dava-dilekcesi' }) })
      if (!r.ok) throw new Error('Word üretilemedi')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'dava-dilekcesi.docx'; document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { setErr((e as Error).message) }
    setWordPending(false)
  }
  function kaydet(yeniDurum?: string) {
    if (!ciktiId) return
    setErr(null)
    start(async () => {
      const r = await dilekceKaydet(ciktiId, metin, yeniDurum ?? durum)
      if (r.ok) { if (yeniDurum) setDurum(yeniDurum); setKayitOk(true); setTimeout(() => setKayitOk(false), 2000); router.refresh() }
      else setErr(r.error ?? 'Kaydedilemedi')
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-kr-soft text-kr-ink"><FileText className="h-4 w-4" /></span>
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Dava · UYAP</div>
            <h2 className="font-display text-[16px] font-extrabold">Dava Dilekçesi</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {metin && <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">{DURUM_ET[durum] ?? durum}</span>}
          <Link href={`/dilekceler?dosya=${dosyaId}`} className="inline-flex items-center gap-1.5 rounded-[10px] bg-kr px-3.5 py-2 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90">
            Dilekçe Masası&apos;nda hazırla <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="p-5">
        {!metin ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="max-w-[56ch] text-[12.5px] leading-[1.55] text-muted-foreground">
              Dava, cevap, beyan ve bilirkişi itirazı taslakları artık <b className="text-foreground">Dilekçe Masası</b>&apos;nda, dosyanın evrakı ve geçmişi yan yana görülerek hazırlanır. Taslak avukat kontrolü içindir; <span className="font-mono">⟨…⟩</span> alanlarını siz tamamlarsınız.
            </p>
          </div>
        ) : (
          <>
            <textarea value={metin} onChange={(e) => setMetin(e.target.value)} rows={22} spellCheck={false}
              className="w-full resize-y rounded-[12px] border border-border bg-surface-muted/40 p-4 font-mono text-[12.5px] leading-[1.6] text-foreground outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={kopyala} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr">{kopyalandi ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />} {kopyalandi ? 'Kopyalandı' : "UYAP'a kopyala"}</button>
              <button type="button" onClick={wordIndir} disabled={wordPending} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr disabled:opacity-60">{wordPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Word indir</button>
              <button type="button" onClick={() => kaydet()} disabled={pending || !ciktiId} className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr disabled:opacity-60">{kayitOk ? <Check className="h-4 w-4 text-success" /> : <Save className="h-4 w-4" />} {kayitOk ? 'Kaydedildi' : 'Kaydet'}</button>
              <span className="mx-1 h-5 w-px bg-border" />
              <label className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Durum</label>
              <select value={durum} onChange={(e) => kaydet(e.target.value)} disabled={pending || !ciktiId} className="rounded-[10px] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold outline-none transition focus:border-kr disabled:opacity-60">
                <option value="TASLAK">Taslak</option>
                <option value="IMZAYA_GIDEN">İmzaya giden</option>
                <option value="GONDERILDI">Gönderildi</option>
              </select>
              {err && <span className="text-[12px] text-danger">{err}</span>}
            </div>
            <p className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">Bu taslak kapatılan eski hatla üretildi. <b className="text-foreground">Mahkeme başlığı, yetki, taraflar, olgular ve atıflar hatalı olabilir</b>; kullanmadan önce satır satır kontrol edin ya da Dilekçe Masası&apos;nda yeniden hazırlayın.</p>
          </>
        )}
      </div>
    </section>
  )
}
