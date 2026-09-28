'use client'

/**
 * KonsRücü — Atıf kütüphanesi ekranı (K1) · components/dilekce-v2/mevzuat-kutuphanesi.tsx
 *
 * S33 kabul 3–5: liste, durum, doğrulama kaydı; avukat resmî bağlantıyı açarak DOĞRULANDI / TEYİT GEREKLİ /
 * KULLANMA işaretler ("Doğrulandı" resmî metin bu oturumda açılmadan etkin olmaz); "Zurich'e kopyala" (kopya teyit
 * gerekli başlar); yönetici için bilgi bankasından kuru önizleme → onaylı yükleme ve yükleme kimliğiyle toplu pasif.
 */
import { useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, Loader2, Upload } from 'lucide-react'
import { Badge, PageHeader } from '@/components/konsrucu/ui'
import {
  mevzuatDurumKaydet, mevzuatKopyala, mevzuatKuruOnizle, mevzuatYukleUygula, mevzuatYuklemePasif,
} from '@/app/(app)/dilekceler/kutuphane/actions'
import type { KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'
import { DURUM_ADI, ETIKET_ADI, TUR_ADI, durumTonu, type MevzuatDurum, type MevzuatEtiket, type MevzuatTuru } from '@/lib/konsrucu/mevzuat/sabitler'
import type { YuklemePlani } from '@/lib/konsrucu/mevzuat/yukle'
import { tarihSaatTR, tarihTR } from '@/lib/konsrucu/format'
import { AtifDenetimi } from './atif-denetimi'
import { alan, birincilDugme, ikincilDugme, kart, kucukDugme, odak } from './stil'

export type KutuphaneSatiri = {
  id: string
  kunye: string
  tur: string
  alinti: string
  resmiUrl: string | null
  erisimTarihi: string | null
  yururlukBas: string | null
  yururlukBit: string | null
  etiket: string
  durum: string
  kapsamNotu: string | null
  rucuSebebiKodlari: string[]
  aktif: boolean
  dogrulayanAdi: string | null
  dogrulamaAt: string | null
  yuklemeId: string | null
  kopyaKaynakId: string | null
  updatedAt: string
}

export type MevzuatKutuphanesiProps = {
  musteriAdi: string
  kayitlar: KutuphaneSatiri[]
  /** Kullanıcının erişebildiği diğer aktif müşteriler ("Zurich'e kopyala"). */
  hedefMusteriler: { id: string; ad: string }[]
  yetki: { avukat: boolean; yonetici: boolean }
}

type Filtre = 'HEPSI' | MevzuatDurum | 'PASIF'

function Satir({ k, yetki, hedefler, bekliyor, calistir }: {
  k: KutuphaneSatiri
  yetki: MevzuatKutuphanesiProps['yetki']
  hedefler: MevzuatKutuphanesiProps['hedefMusteriler']
  bekliyor: boolean
  calistir: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, basari?: string) => void
}) {
  const id = useId()
  const [resmiAcildi, setResmiAcildi] = useState(false)
  const [gerekce, setGerekce] = useState('')
  const [kullanmaAcik, setKullanmaAcik] = useState(false)
  const [hedef, setHedef] = useState(hedefler[0]?.id ?? '')
  const durum = k.durum as MevzuatDurum
  const isaretle = (d: MevzuatDurum) => calistir(() => mevzuatDurumKaydet({ kaynakId: k.id, durum: d, gerekce: d === 'KULLANMA' ? gerekce : undefined, beklenenGuncelleme: k.updatedAt }))

  return (
    <li className={`rounded-xl border p-4 ${k.aktif ? 'border-border' : 'border-dashed border-border opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={k.aktif ? durumTonu(durum) : 'steel'} dot>{k.aktif ? DURUM_ADI[durum] ?? k.durum : 'Pasif'}</Badge>
        <Badge tone="steel">{TUR_ADI[k.tur as MevzuatTuru] ?? k.tur}</Badge>
        <Badge tone={k.etiket === 'TARTISMALI' ? 'warning' : 'steel'}>{ETIKET_ADI[k.etiket as MevzuatEtiket] ?? k.etiket}</Badge>
        {k.kopyaKaynakId && <Badge tone="info">Kopya</Badge>}
      </div>
      <h3 className="mt-2 font-mono text-sm font-semibold">{k.kunye}</h3>
      <details className="mt-1.5">
        <summary className={`cursor-pointer rounded text-xs font-semibold text-primary ${odak}`}>Birebir alıntı</summary>
        <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-kr/50 pl-3 text-xs leading-5 text-muted-foreground">{k.alinti}</blockquote>
      </details>
      {k.kapsamNotu && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{k.kapsamNotu}</p>}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {k.erisimTarihi && <span>Erişim: <span className="font-mono">{tarihTR(k.erisimTarihi)}</span></span>}
        {(k.yururlukBas || k.yururlukBit) && <span>Yürürlük: <span className="font-mono">{k.yururlukBas ? tarihTR(k.yururlukBas) : '…'} – {k.yururlukBit ? tarihTR(k.yururlukBit) : '…'}</span></span>}
        {k.rucuSebebiKodlari.length > 0 && <span>Rücu sebebi: <span className="font-mono">{k.rucuSebebiKodlari.join(', ')}</span></span>}
        <span>Doğrulama kaydı: {k.dogrulamaAt ? `${k.dogrulayanAdi ?? 'Kullanıcı'}, ${tarihSaatTR(k.dogrulamaAt, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : 'yok'}</span>
        {k.yuklemeId && <span>Yükleme: <span className="font-mono">{k.yuklemeId}</span></span>}
      </div>

      {yetki.avukat && k.aktif && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {k.resmiUrl ? (
            <a href={k.resmiUrl} target="_blank" rel="noopener noreferrer" onClick={() => setResmiAcildi(true)} className={`${kucukDugme} border border-border hover:bg-muted`}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Resmî metni aç
            </a>
          ) : <span className="text-[11px] text-danger">Resmî bağlantı yok; doğrulanamaz.</span>}
          <button type="button" disabled={bekliyor || !resmiAcildi || !k.resmiUrl || durum === 'DOGRULANDI'} onClick={() => isaretle('DOGRULANDI')} title={resmiAcildi ? undefined : 'Önce resmî metni açın'} className={`${kucukDugme} border border-success/40 text-success hover:bg-success-soft`}>Doğrulandı</button>
          <button type="button" disabled={bekliyor || durum === 'TEYIT_GEREKLI'} onClick={() => isaretle('TEYIT_GEREKLI')} className={`${kucukDugme} border border-border hover:bg-muted`}>Teyit gerekli</button>
          <button type="button" disabled={bekliyor || durum === 'KULLANMA'} onClick={() => setKullanmaAcik((x) => !x)} className={`${kucukDugme} border border-danger/40 text-danger hover:bg-danger-soft`}>Kullanma</button>
          {!resmiAcildi && k.resmiUrl && durum !== 'DOGRULANDI' && <span className="text-[11px] text-muted-foreground">“Doğrulandı” resmî metni açınca etkinleşir.</span>}
        </div>
      )}
      {kullanmaAcik && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label htmlFor={`${id}-gerekce`} className="text-[11px] text-muted-foreground">Neden kullanılmamalı?</label>
            <input id={`${id}-gerekce`} value={gerekce} onChange={(e) => setGerekce(e.target.value)} maxLength={1000} className={alan} />
          </div>
          <button type="button" disabled={bekliyor || !gerekce.trim()} onClick={() => isaretle('KULLANMA')} className={ikincilDugme}>“Kullanma” olarak kaydet</button>
        </div>
      )}
      {yetki.avukat && k.aktif && hedefler.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-hedef`} className="sr-only">Kopyalanacak müşteri</label>
          <select id={`${id}-hedef`} value={hedef} onChange={(e) => setHedef(e.target.value)} className={`${alan} !w-auto !py-1 text-xs`}>
            {hedefler.map((h) => <option key={h.id} value={h.id}>{h.ad}</option>)}
          </select>
          <button type="button" disabled={bekliyor || !hedef} onClick={() => calistir(async () => {
            const r = await mevzuatKopyala({ kaynakId: k.id, hedefMusteriId: hedef })
            return r.ok ? { ok: true } : r
          }, `${hedefler.find((h) => h.id === hedef)?.ad ?? 'Hedef'} kütüphanesine kopyalandı; orada “teyit gerekli” olarak başlar.`)} className={`${kucukDugme} text-primary hover:bg-primary/10`}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> {hedefler.find((h) => h.id === hedef)?.ad ?? 'Müşteriye'} kopyala
          </button>
        </div>
      )}
    </li>
  )
}

function YuklemePaneli({ bos, bekliyor, setBekliyor, setHata, setBilgi }: {
  bos: boolean; bekliyor: boolean; setBekliyor: (b: boolean) => void; setHata: (h: string | null) => void; setBilgi: (b: string | null) => void
}) {
  const router = useRouter()
  const id = useId()
  const [plan, setPlan] = useState<YuklemePlani | null>(null)
  const [pasifId, setPasifId] = useState('')
  const [pasifListe, setPasifListe] = useState<string[] | null>(null)

  async function kuru() {
    setBekliyor(true); setHata(null); setBilgi(null)
    const r = await mevzuatKuruOnizle().catch(() => ({ ok: false as const, error: 'Önizleme alınamadı.' }))
    setBekliyor(false)
    if (!r.ok) setHata(r.error); else setPlan(r.plan)
  }
  async function uygula() {
    if (!plan) return
    setBekliyor(true); setHata(null)
    const r = await mevzuatYukleUygula({ planOzeti: plan.ozet }).catch(() => ({ ok: false as const, error: 'Yükleme yapılamadı.' }))
    setBekliyor(false)
    if (!r.ok) { setHata(r.error); return }
    setPlan(null); setBilgi(`${r.yazilan} kayıt yüklendi. Yükleme kimliği: ${r.yuklemeId}. Kayıtlar “teyit gerekli” olarak başlar.`); router.refresh()
  }
  async function pasif(kuruMu: boolean) {
    setBekliyor(true); setHata(null)
    const r = await mevzuatYuklemePasif({ yuklemeId: pasifId.trim(), kuru: kuruMu }).catch(() => ({ ok: false as const, error: 'İşlem yapılamadı.' }))
    setBekliyor(false)
    if (!r.ok) { setHata(r.error); return }
    if (kuruMu) setPasifListe(r.etkilenecek)
    else { setPasifListe(null); setBilgi(`${r.yazilan} kayıt pasife alındı.`); router.refresh() }
  }
  const liste = (ad: string, x: string[]) => x.length ? <div><p className="font-semibold">{ad} ({x.length})</p><p className="font-mono text-[11px] text-muted-foreground">{x.join(' · ')}</p></div> : <p><span className="font-semibold">{ad}:</span> 0</p>

  return (
    <section className={kart} aria-labelledby={`${id}-baslik`}>
      <div className="border-b border-border px-4 py-3">
        <h2 id={`${id}-baslik`} className="font-display text-base font-extrabold">Bilgi bankasından yükleme</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Önce kuru çalıştırma: hiçbir şey yazılmaz. Liste onaylanınca aynı planla yüklenir. Yüklenen kayıtlar “teyit gerekli” başlar.</p>
      </div>
      <div className="space-y-3 p-4 text-xs leading-5">
        <button type="button" onClick={kuru} disabled={bekliyor} className={bos ? birincilDugme : ikincilDugme}>
          {bekliyor ? <Loader2 className="dd-spin h-4 w-4" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />} Kuru önizleme
        </button>
        {plan && (
          <div className="space-y-2 rounded-lg bg-surface-muted p-3">
            {liste('Eklenecek', plan.eklenecek)}
            {liste('Değişecek (doğrulaması sıfırlanır)', plan.degisecek)}
            {liste('Aynı kalacak', plan.ayniKalacak)}
            {plan.pasifKalacak.length > 0 && liste('Pasif kalacak', plan.pasifKalacak)}
            {plan.katalogDisi.length > 0 && liste('Katalog dışı (dokunulmaz)', plan.katalogDisi)}
            <p className="font-mono text-[11px] text-muted-foreground">Plan: {plan.ozet}</p>
            {plan.eklenecek.length + plan.degisecek.length > 0
              ? <button type="button" onClick={uygula} disabled={bekliyor} className={ikincilDugme}>Listeyi onayla ve yükle</button>
              : <p className="text-success">Yazılacak kayıt yok.</p>}
          </div>
        )}
        <details>
          <summary className={`cursor-pointer rounded font-semibold ${odak}`}>Yanlış yüklemeyi pasife al</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label htmlFor={`${id}-yk`} className="text-[11px] text-muted-foreground">Yükleme kimliği</label>
              <input id={`${id}-yk`} value={pasifId} onChange={(e) => { setPasifId(e.target.value); setPasifListe(null) }} className={`${alan} font-mono`} />
            </div>
            <button type="button" onClick={() => pasif(true)} disabled={bekliyor || pasifId.trim().length < 3} className={ikincilDugme}>Etkilenecekleri listele</button>
          </div>
          {pasifListe && (
            <div className="mt-2 space-y-2 rounded-lg bg-surface-muted p-3">
              {liste('Pasife alınacak', pasifListe)}
              {pasifListe.length > 0 && <button type="button" onClick={() => pasif(false)} disabled={bekliyor} className={ikincilDugme}>Pasife al</button>}
            </div>
          )}
        </details>
      </div>
    </section>
  )
}

export function MevzuatKutuphanesi({ musteriAdi, kayitlar, hedefMusteriler, yetki }: MevzuatKutuphanesiProps) {
  const router = useRouter()
  const [filtre, setFiltre] = useState<Filtre>('HEPSI')
  const [bekliyor, setBekliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)

  const sayilar = useMemo(() => ({
    DOGRULANDI: kayitlar.filter((k) => k.aktif && k.durum === 'DOGRULANDI').length,
    TEYIT_GEREKLI: kayitlar.filter((k) => k.aktif && k.durum === 'TEYIT_GEREKLI').length,
    KULLANMA: kayitlar.filter((k) => k.aktif && k.durum === 'KULLANMA').length,
    PASIF: kayitlar.filter((k) => !k.aktif).length,
  }), [kayitlar])
  const gorunen = kayitlar.filter((k) => (filtre === 'HEPSI' ? true : filtre === 'PASIF' ? !k.aktif : k.aktif && k.durum === filtre))
  const denetimKayitlari: KutuphaneKaydi[] = useMemo(() => kayitlar.map((k) => ({
    id: k.id, kunye: k.kunye, tur: k.tur, alinti: k.alinti, durum: k.durum, etiket: k.etiket, aktif: k.aktif, resmiUrl: k.resmiUrl, kapsamNotu: k.kapsamNotu, rucuSebebiKodlari: k.rucuSebebiKodlari,
  })), [kayitlar])

  async function calistir(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, basari?: string) {
    if (bekliyor) return
    setBekliyor(true); setHata(null); setBilgi(null)
    try {
      const r = await fn()
      if (!r.ok) setHata(r.error)
      else { if (basari) setBilgi(basari); router.refresh() }
    } catch {
      setHata('İşlem tamamlanamadı. Tekrar deneyin.')
    } finally {
      setBekliyor(false)
    }
  }

  const FILTRELER: [Filtre, string, number | null][] = [
    ['HEPSI', 'Tümü', kayitlar.length], ['TEYIT_GEREKLI', 'Teyit gerekli', sayilar.TEYIT_GEREKLI], ['DOGRULANDI', 'Doğrulandı', sayilar.DOGRULANDI],
    ['KULLANMA', 'Kullanma', sayilar.KULLANMA], ['PASIF', 'Pasif', sayilar.PASIF],
  ]

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-7">
      <PageHeader kicker={`Dilekçe · ${musteriAdi}`} title="Atıf kütüphanesi" sub="Dilekçeye yalnız doğrulanmış atıf girer. Resmî metni açın, kaydı işaretleyin; kim ve ne zaman doğruladığı kayda geçer." />
      {hata && <div role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{hata}</div>}
      {bilgi && <div role="status" className="mb-4 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">{bilgi}</div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className={kart} aria-label="Kütüphane kayıtları">
          <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2" role="tablist" aria-label="Duruma göre süz">
            {FILTRELER.map(([f, ad, n]) => (
              <button key={f} type="button" role="tab" aria-selected={filtre === f} onClick={() => setFiltre(f)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${odak} ${filtre === f ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                {ad}{n != null ? ` · ${n}` : ''}
              </button>
            ))}
          </div>
          <ul className="space-y-3 p-4">
            {gorunen.map((k) => <Satir key={k.id} k={k} yetki={yetki} hedefler={hedefMusteriler} bekliyor={bekliyor} calistir={calistir} />)}
            {!gorunen.length && <li className="py-8 text-center text-sm text-muted-foreground">{kayitlar.length ? 'Bu süzgeçte kayıt yok.' : 'Kütüphane boş. Yönetici bilgi bankasından yükleyebilir.'}</li>}
          </ul>
        </section>
        <div className="space-y-5">
          <AtifDenetimi kayitlar={denetimKayitlari} />
          {yetki.yonetici && <YuklemePaneli bos={!kayitlar.length} bekliyor={bekliyor} setBekliyor={setBekliyor} setHata={setHata} setBilgi={setBilgi} />}
        </div>
      </div>
    </div>
  )
}
