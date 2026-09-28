'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, FileDown, FileText, Loader2, Save, Sparkles } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import { davaTaslagiKaydet, davaTaslagiUret } from '@/app/(app)/dilekceler/actions'
import { DILEKCE_TURLERI, type CalismaDilekceTuru } from '@/lib/konsrucu/dilekce-calisma'
import { calismayiOku, calismayiSakla, calismayiSil, kurtarmaIleBaslat, type TaslakKaydi } from './dilekce-kurtarma'

type Taslak = TaslakKaydi
/** Yeni taslak artık dosya kartı akışından (dilekçe v2: olgu→kaynak bağı, kalite kapıları, büro şablonu) üretilir. */
const KART_TURU: Record<CalismaDilekceTuru, 'DAVA' | 'CEVABA_CEVAP' | 'BEYAN'> = { DAVA: 'DAVA', CEVAP: 'CEVABA_CEVAP', BEYAN: 'BEYAN', BILIRKISI_ITIRAZ: 'BEYAN' }
type Props = {
  dosyaId: string
  ciktilar: Taslak[]
  belgeler: { id: string; ad: string; metinVar: boolean }[]
  yazabilir: boolean
  demo?: boolean
}

const TUR_ADI: Record<CalismaDilekceTuru, string> = {
  DAVA: 'Dava dilekçesi',
  CEVAP: 'Cevap dilekçesi',
  BEYAN: 'Beyan dilekçesi',
  BILIRKISI_ITIRAZ: 'Bilirkişi raporuna itiraz',
}
const DURUM_ADI: Record<string, string> = {
  TASLAK: 'Taslak',
  IMZAYA_GIDEN: 'İncelemeye hazır',
  GONDERILDI: 'Önceden gönderildi olarak işaretlenmiş',
}
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
const button = `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${focus}`
const secondaryButton = `${button} border border-border bg-surface text-foreground hover:bg-surface-muted`
const field = `w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60 ${focus}`
const KAYNAK_SINIRI = 150

function tarih(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Tarih belirtilmemiş' : date.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  })
}

export function DilekceEditor({ dosyaId, ciktilar, belgeler, yazabilir, demo = false }: Props) {
  const id = useId()
  const kurtarmaAnahtari = `${demo ? 'ornek' : 'dosya'}:${dosyaId}`
  const [baslangic] = useState(() => kurtarmaIleBaslat(ciktilar, calismayiOku(kurtarmaAnahtari)))
  const [taslaklar, setTaslaklar] = useState<Taslak[]>(baslangic.taslaklar)
  const [seciliId, setSeciliId] = useState<string | null>(baslangic.seciliId)
  const [metin, setMetin] = useState(baslangic.metin)
  const [ayarlarAcik, setAyarlarAcik] = useState(baslangic.taslaklar.length === 0)
  const [tur, setTur] = useState<CalismaDilekceTuru>('DAVA')
  const [talimat, setTalimat] = useState('')
  const [kaynaklar, setKaynaklar] = useState<string[]>(belgeler.filter((b) => b.metinVar).slice(0, KAYNAK_SINIRI).map((b) => b.id))
  const [uyarilar, setUyarilar] = useState<Record<string, string[]>>({})
  const [islem, setIslem] = useState<'uretim' | 'kayit' | 'indirme' | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(baslangic.kurtarildi ? 'Bu dosyadaki kaydedilmemiş metniniz geri getirildi. Kalıcı olması için taslağı kaydedin; sayfa yenilenirse bu geçici kopya silinir.' : null)
  const busyRef = useRef(false)
  const metinRef = useRef<HTMLTextAreaElement>(null)
  const secili = taslaklar.find((t) => t.id === seciliId)
  const gonderildi = secili?.durum === 'GONDERILDI'
  const degisti = Boolean(secili && metin !== (secili.icerik ?? ''))
  const pending = islem !== null
  const kilitli = pending || !yazabilir
  const metinVar = Boolean(metin.trim())

  // A refreshed server response may contain new drafts. Keep local work and prior drafts available.
  useEffect(() => {
    setTaslaklar((onceki) => [...ciktilar.filter((gelen) => !onceki.some((t) => t.id === gelen.id)), ...onceki])
  }, [ciktilar])

  useEffect(() => {
    if (!degisti && !pending) return
    function cikisUyarisi(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    function baglantiUyarisi(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.protocol !== 'http:' && destination.protocol !== 'https:') return
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return
      if (!window.confirm(pending ? 'İşlem sürüyor. Bu sayfadan ayrılmak istiyor musunuz?' : 'Kaydedilmemiş değişiklikleriniz var. Kaydetmeden ayrılmak istiyor musunuz?')) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        calismayiSil(kurtarmaAnahtari)
      }
    }
    function aramaUyarisi(event: SubmitEvent) {
      const form = event.target
      if (event.defaultPrevented || !(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'get' || (form.target && form.target !== '_self')) return
      const destination = new URL(form.action || window.location.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.pathname.replace(/\/$/, '') !== '/dilekceler') return
      if (!window.confirm(pending ? 'İşlem sürüyor. Arama yapmak için bu sayfadan ayrılmak istiyor musunuz?' : 'Kaydedilmemiş değişiklikleriniz var. Kaydetmeden arama yapmak istiyor musunuz?')) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        calismayiSil(kurtarmaAnahtari)
      }
    }
    window.addEventListener('beforeunload', cikisUyarisi)
    document.addEventListener('click', baglantiUyarisi, true)
    document.addEventListener('submit', aramaUyarisi, true)
    return () => {
      window.removeEventListener('beforeunload', cikisUyarisi)
      document.removeEventListener('click', baglantiUyarisi, true)
      document.removeEventListener('submit', aramaUyarisi, true)
    }
  }, [degisti, pending, kurtarmaAnahtari])

  function degisikliktenVazgec() {
    return !degisti || window.confirm('Kaydedilmemiş değişiklikleriniz var. Bu değişikliklerden vazgeçmek istiyor musunuz?')
  }

  function taslakSec(yeniId: string) {
    if (busyRef.current || yeniId === seciliId || !degisikliktenVazgec()) return
    const taslak = taslaklar.find((t) => t.id === yeniId)
    if (!taslak) return
    calismayiSil(kurtarmaAnahtari)
    setSeciliId(taslak.id)
    setMetin(taslak.icerik ?? '')
    setHata(null)
    setBilgi(null)
  }

  function baslat(tip: 'uretim' | 'kayit' | 'indirme') {
    busyRef.current = true
    setIslem(tip)
    setHata(null)
    setBilgi(null)
  }

  function bitir() {
    busyRef.current = false
    setIslem(null)
  }

  async function uret() {
    if (!yazabilir || busyRef.current || !degisikliktenVazgec()) return
    const oncekiCalisma = secili ? { ciktiId: secili.id, metin } : null
    baslat('uretim')
    try {
      const sonuc = demo
        ? {
            ok: true as const,
            ciktiId: `ornek-${Date.now()}`,
            metin: ciktilar[0]?.icerik || 'ÖRNEK DİLEKÇE\n\nBu alanda dosya geçmişinden hazırlanan taslağı düzenleyebilirsiniz.',
            uyarilar: ['Örnek veriler; kaydetme yalnız bu önizlemede geçerli.', 'Bu örnek, seçtiğiniz tür ve yönergeye göre yeniden yazılmaz.'],
          }
        : await davaTaslagiUret({ dosyaId, tur, talimat, kaynakBelgeIds: kaynaklar })
      if (!sonuc.ok) {
        setHata(sonuc.error)
        return
      }
      const yeni: Taslak = { id: sonuc.ciktiId, icerik: sonuc.metin, durum: 'TASLAK', createdAt: new Date().toISOString() }
      if (oncekiCalisma) calismayiSil(kurtarmaAnahtari, oncekiCalisma)
      setTaslaklar((onceki) => [yeni, ...onceki.filter((t) => t.id !== yeni.id)])
      setSeciliId(yeni.id)
      setMetin(yeni.icerik ?? '')
      setUyarilar((onceki) => ({ ...onceki, [yeni.id]: sonuc.uyarilar }))
      setAyarlarAcik(false)
      setBilgi(demo ? 'Örnek taslak oluşturuldu. Metni düzenleyebilirsiniz.' : 'Yeni taslak ayrı kaydedildi. Önceki taslaklarınız kayıt listesinde duruyor.')
    } catch {
      setHata('Taslak hazırlanamadı. Mevcut metniniz korunuyor; yeniden deneyebilirsiniz.')
    } finally {
      bitir()
    }
  }

  async function kaydet(durum: 'TASLAK' | 'IMZAYA_GIDEN') {
    if (!yazabilir || busyRef.current || !secili || gonderildi || !metinVar) return
    const snapshot = { ciktiId: secili.id, icerik: metin, beklenenIcerik: secili.icerik, durum }
    baslat('kayit')
    try {
      const sonuc = demo ? { ok: true as const } : await davaTaslagiKaydet(snapshot)
      if (!sonuc.ok) {
        setHata(sonuc.error)
        return
      }
      calismayiSil(kurtarmaAnahtari, { ciktiId: snapshot.ciktiId, metin: snapshot.icerik })
      setTaslaklar((onceki) => onceki.map((t) => t.id === snapshot.ciktiId ? { ...t, icerik: snapshot.icerik, durum: snapshot.durum } : t))
      setBilgi(demo ? 'Değişiklikler bu önizlemede saklandı.' : durum === 'IMZAYA_GIDEN' ? 'Dilekçe kaydedildi ve incelemeye hazır olarak işaretlendi.' : 'Değişiklikler kaydedildi.')
    } catch {
      setHata('Değişiklikler kaydedilemedi. Metniniz bu ekranda duruyor; yeniden deneyebilir veya kopyalayabilirsiniz.')
    } finally {
      bitir()
    }
  }

  async function kopyala() {
    if (!metinVar || busyRef.current) return
    setHata(null)
    try {
      await navigator.clipboard.writeText(metin)
      setBilgi('Dilekçe metni kopyalandı.')
    } catch {
      setHata('Otomatik kopyalama kullanılamıyor. Metin seçildi; klavyeden kopyalayabilirsiniz.')
      metinRef.current?.focus()
      metinRef.current?.select()
    }
  }

  async function indir() {
    if (!metinVar || busyRef.current) return
    const snapshot = metin
    baslat('indirme')
    try {
      let blob: Blob
      if (demo) {
        blob = new Blob(['\uFEFF', snapshot], { type: 'text/plain;charset=utf-8' })
      } else {
        const response = await fetch('/api/dilekce/docx', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ metin: snapshot, ad: 'dilekce' }),
        })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
          throw new Error('download-failed')
        }
        blob = await response.blob()
      }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = demo ? 'ornek-dilekce.txt' : 'dilekce.docx'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setBilgi(demo ? 'Örnek metin indirmeye hazırlandı.' : 'Ekrandaki metin Word belgesi olarak indirmeye hazırlandı.')
    } catch {
      setHata('Belge indirilemedi. Metninizi kopyalayabilir veya yeniden deneyebilirsiniz.')
    } finally {
      bitir()
    }
  }

  const seciliUyarilar = seciliId ? uyarilar[seciliId] ?? [] : []

  return (
    <section aria-labelledby={`${id}-baslik`} aria-busy={pending} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-kr-soft text-kr-ink"><FileText aria-hidden="true" className="h-5 w-5" /></span>
          <div>
            <h2 id={`${id}-baslik`} className="font-display text-lg font-extrabold">Dilekçe çalışma alanı</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Dosyayı okuyun, taslağı hazırlayın, birlikte gözden geçirin.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {secili && <Badge tone={secili.durum === 'IMZAYA_GIDEN' ? 'success' : 'steel'}>{DURUM_ADI[secili.durum ?? 'TASLAK'] ?? 'Kayıtlı dilekçe'}</Badge>}
          {degisti && <Badge tone="warning" dot>Kaydedilmemiş değişiklik</Badge>}
          {!yazabilir && <Badge tone="info">Görüntüleme yetkisi</Badge>}
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {demo && <p className="rounded-lg border border-info/20 bg-info-soft px-3 py-2.5 text-xs leading-relaxed text-info">Örnek veriler; kaydetme yalnız bu önizlemede geçerli. Bu ekrandan gerçek dosyalara işlem yapılmaz. Önizlemede metin dosyası, giriş yapılan çalışma alanında Word belgesi indirilir.</p>}
        {!yazabilir && <p className="text-sm text-muted-foreground">Dilekçeleri okuyabilir, kopyalayabilir ve indirebilirsiniz. Düzenleme için yazma yetkisi gerekir.</p>}

        <details open={ayarlarAcik} onToggle={(event) => setAyarlarAcik(event.currentTarget.open)} className="group rounded-xl border border-border-subtle bg-surface-muted/40">
          <summary className={`cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold ${focus}`}>Yeni taslak hazırlama</summary>
          <div className="space-y-4 border-t border-border-subtle p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-tur`} className="mb-1.5 block text-xs font-semibold">Dilekçe türü</label>
                <select id={`${id}-tur`} value={tur} onChange={(e) => setTur(e.target.value as CalismaDilekceTuru)} disabled={kilitli} className={field}>
                  {DILEKCE_TURLERI.map((t) => <option key={t} value={t}>{TUR_ADI[t]}</option>)}
                </select>
              </div>
              <div className="self-end text-xs leading-relaxed text-muted-foreground">Dosyanın geçmişi ve seçtiğiniz okunabilir evraklar kullanılır. Her üretim ayrı bir taslak olarak kaydedilir.</div>
            </div>
            <div>
              <label htmlFor={`${id}-talimat`} className="mb-1.5 block text-xs font-semibold">Özellikle vurgulamak istediğiniz noktalar</label>
              <textarea id={`${id}-talimat`} value={talimat} onChange={(e) => setTalimat(e.target.value)} disabled={kilitli} maxLength={8000} rows={3} placeholder="Örn. Son bilirkişi raporundaki kusur oranına yönelik itirazlarımızı öne çıkar." className={`${field} resize-y`} />
            </div>
            <fieldset disabled={kilitli}>
              <legend className="text-xs font-semibold">Taslakta kullanılacak evraklar <span className="font-normal text-muted-foreground">({kaynaklar.length} / {KAYNAK_SINIRI} seçili)</span></legend>
              <p className="mt-1 text-xs text-muted-foreground">Bir taslak için en fazla {KAYNAK_SINIRI} evrak seçebilirsiniz. Sınıra ulaştığınızda başka bir evrak seçmek için mevcut seçimlerden birini kaldırın.</p>
              {belgeler.length > 0 ? (
                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border-subtle bg-background p-2">
                  {belgeler.map((belge) => (
                    <label key={belge.id} className={`flex items-start gap-2.5 rounded-md px-2 py-2 text-xs ${belge.metinVar ? 'text-foreground' : 'text-muted-foreground'}`}>
                      <input type="checkbox" checked={kaynaklar.includes(belge.id)} disabled={!belge.metinVar || kilitli || (!kaynaklar.includes(belge.id) && kaynaklar.length >= KAYNAK_SINIRI)} onChange={(e) => setKaynaklar((onceki) => e.target.checked ? [...onceki, belge.id].slice(0, KAYNAK_SINIRI) : onceki.filter((b) => b !== belge.id))} className={`mt-0.5 h-4 w-4 shrink-0 accent-primary ${focus}`} />
                      <span className="min-w-0 break-words leading-relaxed">{belge.ad}{!belge.metinVar && <span className="ml-1">· Okunabilir metin bulunamadı</span>}</span>
                    </label>
                  ))}
                </div>
              ) : <p className="mt-2 text-xs text-muted-foreground">Bu dosyada evrak yok. Taslak dosyanın mevcut bilgileriyle hazırlanır; eksik dayanakları tamamlayın.</p>}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              {demo ? (
                <button type="button" onClick={uret} disabled={kilitli} className={`${button} bg-kr text-kr-foreground hover:bg-kr/90`}>
                  {islem === 'uretim' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
                  {islem === 'uretim' ? 'Taslak hazırlanıyor…' : 'Örnek taslağı oluştur'}
                </button>
              ) : (
                <Link href={`/dilekceler/kart?dosya=${encodeURIComponent(dosyaId)}&tur=${KART_TURU[tur]}`} className={`${button} bg-kr text-kr-foreground hover:bg-kr/90`}>
                  <Sparkles aria-hidden="true" className="h-4 w-4" />
                  Yeni taslak oluştur
                </Link>
              )}
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{demo ? 'Hazırlanan metindeki olayları, talepleri ve hukuki dayanakları kullanmadan önce kontrol edin.' : 'Taslak dosya kartından hazırlanır: her olgu kaynak belgeye bağlanır, büro şablonu ve kalite kontrolleri uygulanır.'}</p>
            </div>
          </div>
        </details>

        {hata && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger">{hata}</p>}
        <div role="status" aria-live="polite" aria-atomic="true">{bilgi && <p className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{bilgi}</p>}</div>

        {taslaklar.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${id}-kayit`} className="mb-1.5 block text-xs font-semibold">Kayıtlı taslaklar</label>
                <select id={`${id}-kayit`} value={seciliId ?? ''} onChange={(e) => taslakSec(e.target.value)} disabled={pending} className={`${field} font-mono text-xs`}>
                  {taslaklar.map((t, index) => <option key={t.id} value={t.id}>{taslaklar.length - index}. taslak · {tarih(t.createdAt)} · {DURUM_ADI[t.durum ?? 'TASLAK'] ?? 'Kayıtlı dilekçe'}</option>)}
                </select>
              </div>
              <span className="pb-2 text-xs text-muted-foreground">{metin.length.toLocaleString('tr-TR')} karakter</span>
            </div>

            {seciliUyarilar.length > 0 && <div className="rounded-lg border border-warning/20 bg-warning-soft px-4 py-3 text-xs leading-relaxed text-warning"><p className="font-semibold">Kontrol edilecek noktalar</p><ul className="mt-1.5 list-disc space-y-1 pl-4">{seciliUyarilar.map((uyari, index) => <li key={index}>{uyari}</li>)}</ul></div>}

            <label htmlFor={`${id}-metin`} className="block text-xs font-semibold">Dilekçe metni</label>
            {gonderildi && <p className="rounded-lg bg-info-soft px-3 py-2.5 text-xs leading-relaxed text-info">Bu dilekçe daha önce gönderildi olarak işaretlendiği için düzenlemeye kapalıdır. Yeni bir çalışma için yukarıdan ayrı taslak oluşturabilirsiniz; bu kayıt korunur.</p>}
            <textarea ref={metinRef} id={`${id}-metin`} aria-describedby={`${id}-metin-aciklama`} value={metin} onChange={(e) => { setMetin(e.target.value); setBilgi(null); if (secili) calismayiSakla(kurtarmaAnahtari, secili, e.target.value) }} readOnly={!yazabilir || gonderildi} disabled={pending} maxLength={100000} rows={25} spellCheck={false} className={`${field} min-h-96 resize-y px-4 py-5 leading-7 sm:px-6`} />
            <p id={`${id}-metin-aciklama`} className="text-xs leading-relaxed text-muted-foreground">{gonderildi || !yazabilir ? 'Bu metni okuyabilir, kopyalayabilir ve indirebilirsiniz.' : 'Metni doğrudan düzenleyebilirsiniz. Eksik alanları tamamlayıp kaynak evraklarla karşılaştırın.'} “İncelemeye hazır” yalnız çalışma durumudur; UYAP’a gönderim yapmaz.</p>

            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
              <button type="button" onClick={() => kaydet('TASLAK')} disabled={kilitli || gonderildi || !secili || !metinVar} className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}>
                {islem === 'kayit' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" className="h-4 w-4" />} {islem === 'kayit' ? 'Kaydediliyor…' : 'Taslağı kaydet'}
              </button>
              <button type="button" onClick={() => kaydet('IMZAYA_GIDEN')} disabled={kilitli || gonderildi || !secili || !metinVar} className={secondaryButton}><Check aria-hidden="true" className="h-4 w-4" />İncelemeye hazır</button>
              <button type="button" onClick={kopyala} disabled={pending || !metinVar} className={secondaryButton}><Copy aria-hidden="true" className="h-4 w-4" />Metni kopyala</button>
              <button type="button" onClick={indir} disabled={pending || !metinVar} className={secondaryButton}>
                {islem === 'indirme' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <FileDown aria-hidden="true" className="h-4 w-4" />}{demo ? 'Örnek metni indir' : 'Word indir'}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <FileText aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-base font-extrabold">İlk taslağınız burada açılacak</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Dilekçe türünü ve kaynak evrakları seçin. Hazırlanan metni bu alanda düzenleyip kaydedebilirsiniz.</p>
          </div>
        )}
      </div>
    </section>
  )
}
