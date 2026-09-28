'use client'

/**
 * KonsRücü — Dilekçe üretici (dilekçe v2, aşama 2) · components/dilekce-v2/dilekce-uretici.tsx
 *
 * S36 (06 §7.3 Aşama 2, §7.5): kilitli dosya kartından taslak üretir. Her üretim yeni bir sürüm ÇİFTİ açar
 * (AI ham + avukatın düzenlediği son hâl); eskisi ezilmez, ikisi yan yana gösterilir. AI ham tarafındaki
 * `[O-n]` işaretleri tıklanabilir: kaynak olgunun metnini ve kaynak etiketini altta açar.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileDown, Fingerprint, History, Loader2, Save, Sparkles } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { dilekceV2TaslakKaydet, dilekceV2TaslakUret } from '@/app/(app)/dilekceler/uret/actions'
import { KART_TUR_ADI, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { tarihSaatTR } from '@/lib/konsrucu/format'
import { KaliteRaporu } from './kalite-raporu'
import { birincilDugme, ikincilDugme, kart as kartCls, kucukDugme, odak, sessizDugme } from './stil'

export type DilekceSurumGorunumu = {
  hamId: string
  hamIcerik: string
  avukatId: string
  avukatIcerik: string
  avukatDurum: string
  sira: number
  createdAt: string
  olguBaglari: { paragraf: string; olguIdleri: string[] }[]
  uyarilar: string[]
}

export type DilekceUreticiProps = {
  dosya: { id: string; no: string; taraf: string }
  tur: KartTuru
  /** Bu tür için kilitli (ONAYLI) bir dosya kartı var mı — yoksa üretim engellenir (asama2Kapisi). */
  kartKilitli: boolean
  /** Kilitli kartın olguları — [O-n] tıklanınca gösterilecek kaynak metni. */
  olgular: { id: string; metin: string; kaynakEtiketi: string }[]
  /** En yeni önce; her biri bir üretim çağrısının AI_HAM + AVUKAT çifti. */
  surumler: DilekceSurumGorunumu[]
  yazabilir: boolean
  avukat: boolean
}

const O_ID_RE = /(\[O-\d+\])/g
const DURUM_ADI: Record<string, string> = { TASLAK: 'taslak', IMZAYA_HAZIR: 'imzaya hazır', GONDERILDI_UYAP: "UYAP'a gönderildi" }

/** `[O-n]` işaretlerini tıklanabilir düğmeye çevirir; geri kalanı düz metin olarak kalır. */
function OnizlemeMetni({ metin, onOlguSec }: { metin: string; onOlguSec: (id: string) => void }) {
  const parcalar = metin.split(O_ID_RE)
  return (
    <>
      {parcalar.map((p, i) => {
        const m = /^\[(O-\d+)\]$/.exec(p)
        if (!m) return <span key={i}>{p}</span>
        return (
          <button key={i} type="button" onClick={() => onOlguSec(m[1])} className={`rounded bg-primary/10 px-0.5 font-mono text-[11px] font-bold text-primary hover:bg-primary/20 ${odak}`}>
            {p}
          </button>
        )
      })}
    </>
  )
}

export function DilekceUretici({ dosya, tur, kartKilitli, olgular, surumler, yazabilir, avukat }: DilekceUreticiProps) {
  const router = useRouter()
  const [secim, setSecim] = useState(0) // surumler[0] en yeni
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null) // null: seçili sürümün kayıtlı içeriği kullanılır
  const [secidiOlgu, setSecidiOlgu] = useState<string | null>(null)
  const [bekliyor, setBekliyor] = useState<'uret' | 'kaydet' | 'indir' | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const cari = surumler[secim] ?? null
  const metin = duzenlenen ?? cari?.avukatIcerik ?? ''
  const degisti = !!cari && metin !== cari.avukatIcerik
  const kilitliGonderildi = cari?.avukatDurum === 'GONDERILDI_UYAP'
  const olguHaritasi = useMemo(() => new Map(olgular.map((o) => [o.id, o])), [olgular])
  const secidiOlguDetay = secidiOlgu ? olguHaritasi.get(secidiOlgu) : null

  async function uret() {
    if (bekliyor) return
    setBekliyor('uret'); setHata(null); setBilgi(null)
    try {
      const r = await dilekceV2TaslakUret({ dosyaId: dosya.id, tur })
      if (!r.ok) { setHata(r.error); return }
      setSecim(0); setDuzenlenen(null); setSecidiOlgu(null)
      setBilgi(r.uyarilar.length ? r.uyarilar.join(' ') : 'Yeni taslak üretildi.')
      router.refresh()
    } catch {
      setHata('Taslak üretilemedi. Bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setBekliyor(null)
    }
  }

  async function kaydet(imzayaHazir: boolean) {
    if (!cari || bekliyor) return
    setBekliyor('kaydet'); setHata(null); setBilgi(null)
    try {
      const r = await dilekceV2TaslakKaydet({ surumId: cari.avukatId, icerik: metin, beklenenIcerik: cari.avukatIcerik, imzayaHazir })
      if (!r.ok) { setHata(r.error); return }
      setDuzenlenen(null)
      setBilgi(imzayaHazir ? 'Dilekçe imzaya hazır olarak kaydedildi.' : 'Değişiklikler kaydedildi.')
      router.refresh()
    } catch {
      setHata('Kaydedilemedi. Metninizi kopyalayıp tekrar deneyin.')
    } finally {
      setBekliyor(null)
    }
  }

  async function indir() {
    if (!metin.trim() || bekliyor) return
    setBekliyor('indir'); setHata(null)
    try {
      const response = await fetch('/api/dilekce/docx', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metin, ad: `${tur.toLowerCase()}-dilekcesi` }),
      })
      if (!response.ok) throw new Error('download-failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${tur.toLowerCase()}-dilekcesi.docx`
      document.body.appendChild(a); a.click(); a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setHata('Word belgesi indirilemedi. Metni kopyalayıp deneyebilirsiniz.')
    } finally {
      setBekliyor(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-7">
      <div className="mb-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Dilekçe · adım 2: taslak</div>
        <h1 className="font-display mt-1.5 text-[26px] font-extrabold tracking-[-0.03em]">Dilekçe taslağı · {KART_TUR_ADI[tur]}</h1>
        <p className="mt-1 text-sm text-muted-foreground"><span className="font-mono">{dosya.no}</span> · {dosya.taraf}</p>
        <p className="mt-1.5 max-w-[70ch] text-xs text-muted-foreground">Bu taslak TASLAKTIR. Künye, değer, EKLER ve talep sonucu koddan basılır; AÇIKLAMALAR yapay zekâdandır ve yalnız dosya kartındaki olgulara dayanır. İmzalamadan önce mutlaka gözden geçirin.</p>
      </div>

      {!kartKilitli && (
        <div className={`${kartCls} px-6 py-10 text-center`}>
          <Fingerprint className="mx-auto h-8 w-8 text-warning" aria-hidden />
          <h2 className="font-display mt-3 text-lg font-extrabold">Bu tür için kilitli bir dosya kartı yok</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Dilekçe taslağı yalnız avukat tarafından kilitlenmiş (ONAYLI) bir dosya kartından üretilir.</p>
        </div>
      )}

      {kartKilitli && (
        <>
          {hata && <div role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{hata}</div>}
          {bilgi && <div role="status" className="mb-4 rounded-xl bg-info-soft px-4 py-3 text-xs leading-5 text-info">{bilgi}</div>}
          {cari?.uyarilar.length ? (
            <div role="status" className="mb-4 space-y-1 rounded-xl bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">{cari.uyarilar.map((u) => <p key={u}>{u}</p>)}</div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {yazabilir && (
                <button type="button" onClick={uret} disabled={!!bekliyor} className={birincilDugme}>
                  {bekliyor === 'uret' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
                  {surumler.length ? 'Yeniden üret' : 'Taslak üret'}
                </button>
              )}
              {surumler.length > 0 && (
                <span className="text-xs text-muted-foreground">Sürüm {cari?.sira} · {cari ? tarihSaatTR(cari.createdAt, { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''} · <Badge tone={cari?.avukatDurum === 'IMZAYA_HAZIR' ? 'success' : cari?.avukatDurum === 'GONDERILDI_UYAP' ? 'steel' : 'warning'}>{DURUM_ADI[cari?.avukatDurum ?? ''] ?? cari?.avukatDurum}</Badge></span>
              )}
            </div>
            {surumler.length > 1 && (
              <details className="text-xs">
                <summary className={`flex cursor-pointer items-center gap-1.5 rounded font-semibold text-muted-foreground ${odak}`}><History className="h-3.5 w-3.5" aria-hidden /> Sürüm geçmişi ({surumler.length})</summary>
                <ul className="mt-1.5 space-y-1">
                  {surumler.map((s, i) => (
                    <li key={s.avukatId}>
                      <button type="button" onClick={() => { setSecim(i); setDuzenlenen(null); setSecidiOlgu(null) }} className={`rounded px-1.5 py-0.5 font-mono ${i === secim ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                        Sürüm {s.sira} · {DURUM_ADI[s.avukatDurum] ?? s.avukatDurum}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {!surumler.length ? (
            <p className="text-sm text-muted-foreground">Henüz taslak üretilmedi.</p>
          ) : cari && (
            <>
              <div className="grid items-start gap-5 xl:grid-cols-2">
                <section className={kartCls} aria-labelledby="ham-baslik">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <h2 id="ham-baslik" className="font-display text-base font-extrabold">Yapay zekâ ham çıktısı</h2>
                    <Badge tone="steel">değişmez</Badge>
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6">
                    <OnizlemeMetni metin={cari.hamIcerik} onOlguSec={setSecidiOlgu} />
                  </div>
                </section>

                <section className={kartCls} aria-labelledby="son-hal-baslik">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <h2 id="son-hal-baslik" className="font-display text-base font-extrabold">Son hâl (düzenlenebilir)</h2>
                    {degisti && <Badge tone="warning">kaydedilmemiş değişiklik</Badge>}
                  </div>
                  <label htmlFor="son-hal-metin" className="sr-only">Dilekçe metni</label>
                  <textarea
                    id="son-hal-metin" value={metin} disabled={!yazabilir || kilitliGonderildi}
                    onChange={(e) => setDuzenlenen(e.target.value)}
                    rows={26}
                    className="max-h-[70vh] w-full resize-y border-0 bg-transparent p-4 font-mono text-xs leading-6 text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
                    {yazabilir && !kilitliGonderildi && (
                      <button type="button" onClick={() => kaydet(false)} disabled={!degisti || !!bekliyor} className={ikincilDugme}>
                        {bekliyor === 'kaydet' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Kaydet
                      </button>
                    )}
                    {avukat && !kilitliGonderildi && cari.avukatDurum !== 'IMZAYA_HAZIR' && (
                      <button type="button" onClick={() => kaydet(true)} disabled={!!bekliyor} className={sessizDugme}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> İmzaya hazır olarak kaydet
                      </button>
                    )}
                    <button type="button" onClick={indir} disabled={!!bekliyor} className={`${kucukDugme} border border-border hover:bg-surface-muted`}>
                      {bekliyor === 'indir' ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />} Word indir
                    </button>
                  </div>
                </section>
              </div>

              {secidiOlguDetay && (
                <div role="status" className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs leading-5">
                  <span className="font-mono font-bold text-primary">{secidiOlguDetay.id}</span> · <span className="text-muted-foreground">{secidiOlguDetay.kaynakEtiketi}</span>
                  <p className="mt-1">{secidiOlguDetay.metin}</p>
                </div>
              )}

              {!kilitliGonderildi && (
                <div className="mt-4">
                  <KaliteRaporu surumId={cari.avukatId} metin={metin} avukat={avukat} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
