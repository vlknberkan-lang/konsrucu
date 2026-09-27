'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, FileText, Clock3, History, FolderOpen, ArrowUpRight, CalendarDays, AlertCircle, CheckCircle2, Eye } from 'lucide-react'
import { Badge, PageHeader } from '@/components/konsrucu/ui'
import { BelgeOnizleme, type OnizlemeBelge } from '@/components/akilli-giris/detay/belge-onizleme'
import { EtkinlikEkle } from '@/components/takvim/etkinlik-ekle'
import { DilekceEditor } from './dilekce-editor'
import { tarihTR, tarihSaatTR } from '@/lib/konsrucu/format'
import type { DilekceMasasiProps, MasaDetay } from '@/lib/konsrucu/dilekce-masa-types'

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
const card = 'rounded-2xl border border-border bg-card shadow-card'
const tarihVeSaat = (deger: string) => tarihSaatTR(deger, { day: '2-digit', month: '2-digit', year: 'numeric' })

function DosyaBaglami({ dosya, demo }: { dosya: MasaDetay; demo: boolean }) {
  const [sekme, setSekme] = useState<'ozet' | 'gecmis' | 'evraklar'>('gecmis')
  const [onizleme, setOnizleme] = useState<OnizlemeBelge | null>(null)
  const [ornekBelge, setOrnekBelge] = useState<string | null>(null)
  return (
    <section className={card} aria-label="Dosya kaynakları">
      <div className="border-b border-border px-4 py-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-kr-ink"><History className="h-4 w-4" /> Dosyanın hafızası</div>
        <h2 className="font-display text-lg font-extrabold">Geçmiş elinizin altında</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Dilekçeyi yazarken olayları ve dayanak evrakları birlikte inceleyin.</p>
      </div>
      <div className="flex gap-1 border-b border-border px-3 py-2" role="tablist" aria-label="Dosya bağlamı">
        {([['gecmis', 'Geçmiş'], ['evraklar', 'Evraklar'], ['ozet', 'Özet']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`baglam-tab-${id}`} aria-controls={`baglam-${id}`} aria-selected={sekme === id} tabIndex={sekme === id ? 0 : -1} onClick={() => setSekme(id)} onKeyDown={(event) => {
            const sekmeler = ['gecmis', 'evraklar', 'ozet'] as const
            const i = sekmeler.indexOf(id)
            const hedef = event.key === 'ArrowRight' ? (i + 1) % 3 : event.key === 'ArrowLeft' ? (i + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null
            if (hedef !== null) { event.preventDefault(); setSekme(sekmeler[hedef]); document.getElementById(`baglam-tab-${sekmeler[hedef]}`)?.focus() }
          }} className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold ${focus} ${sekme === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
        ))}
      </div>
      <div id={`baglam-${sekme}`} role="tabpanel" aria-labelledby={`baglam-tab-${sekme}`} className="max-h-[460px] overflow-y-auto p-4">
        {sekme === 'ozet' && <>
          <Badge tone="kr">Kayıtlı dosya özeti</Badge>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{dosya.ozet || 'Bu dosyada henüz özet bulunmuyor. Geçmiş kayıtlarını ve evrakları inceleyerek taslak oluşturabilirsiniz.'}</p>
          <p className="mt-3 text-xs text-muted-foreground">Özet, yeni gelen evraklarla birlikte kontrol edilmelidir.</p>
        </>}
        {sekme === 'gecmis' && <>
          {dosya.gecmis.length === 0 && <p className="text-sm text-muted-foreground">Henüz olay veya not kaydı yok. Evraklardan başlayabilirsiniz.</p>}
          <ol className="space-y-5">
            {dosya.gecmis.map((olay) => <li key={olay.id} className="relative border-l-2 border-border pl-4">
              <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
              <div className="font-mono text-[10px] text-muted-foreground">{tarihTR(olay.tarih)} · {olay.tarihEtiketi}</div>
              <h3 className="mt-1 text-sm font-semibold">{olay.baslik}</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{olay.metin}</p>
            </li>)}
          </ol>
          {dosya.gecmis.length > 0 && <p className="mt-4 text-[11px] text-muted-foreground">Son {dosya.gecmis.length} geçmiş kaydı gösteriliyor.</p>}
        </>}
        {sekme === 'evraklar' && <>
          <p className="mb-3 text-xs text-muted-foreground">{dosya.belgeler.length} evrak · Taslakta kullanılacak evrakları editörden seçebilirsiniz.</p>
          <ul className="space-y-2">
            {dosya.belgeler.map((b) => <li key={b.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="break-words text-xs font-semibold">{b.ad}</span></div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span className="font-mono">{tarihTR(b.tarih)}</span><span>{b.uyap ? 'UYAP evrakı' : 'Dosya evrakı'}</span></div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-[11px] ${b.metinVar ? 'text-success' : 'text-warning'}`}>{b.metinVar ? 'Metni okunabilir' : 'Metin çıkarımı gerekli'}</span>
                {b.acilabilir && <button type="button" onClick={() => demo ? setOrnekBelge(b.ad) : setOnizleme({ id: b.id, dosyaAdi: b.ad })} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 ${focus}`}><Eye className="h-3.5 w-3.5" /> İncele</button>}
              </div>
            </li>)}
          </ul>
          {dosya.belgeler.length === 0 && <p className="text-sm text-muted-foreground">UYAP eklentisiyle aktarılan evraklar burada görünecek.</p>}
          {ornekBelge && <div role="status" className="mt-3 rounded-xl bg-info-soft p-3 text-xs leading-5 text-info">{ornekBelge} bir örnek kayıttır. Gerçek dosyada bu düğme evrak önizlemesini açar.</div>}
        </>}
      </div>
      {!demo && <BelgeOnizleme belge={onizleme} onKapat={() => setOnizleme(null)} />}
    </section>
  )
}

function Sureler({ dosya, demo }: { dosya: MasaDetay; demo: boolean }) {
  const { kayitlar, uyap } = dosya.sureler
  return <section className={card} aria-label="Süreler ve işler">
    <div className="flex items-center justify-between border-b border-border px-4 py-4">
      <h2 className="flex items-center gap-2 font-display text-base font-extrabold"><Clock3 className="h-4 w-4 text-primary" /> Süreler ve işler</h2>
      {!demo && <Link href="/takvim" className={`rounded text-xs font-semibold text-primary ${focus}`}>Tüm takvim <span aria-hidden>↗</span></Link>}
    </div>
    <div className="space-y-3 p-4">
      <div className={`rounded-xl p-3 text-xs leading-5 ${uyap.durum === 'GUNCEL' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
        <div className="mb-1 flex items-center gap-1.5 font-semibold">{uyap.durum === 'GUNCEL' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} UYAP veri durumu</div>
        {uyap.aciklama}
        {uyap.sonSenkron && <div className="mt-1 font-mono text-[10px]">Son aktarım: {tarihVeSaat(uyap.sonSenkron)}</div>}
      </div>
      {kayitlar.length === 0 && <p className="text-xs leading-5 text-muted-foreground">Kayıtlı açık iş bulunamadı. Bu, dosyada hukuki süre olmadığı anlamına gelmez; son tebligat ve duruşma tutanağını kontrol edin.</p>}
      <ul className="space-y-2">
        {kayitlar.map((k) => <li key={`${k.kaynak}-${k.id}`} className="rounded-xl border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={k.durum === 'GECIKMIS' || k.durum === 'BUGUN' ? 'danger' : k.durum === 'YAKLASAN' || k.durum === 'TARIH_EKSIK' ? 'warning' : 'steel'}>
              {k.durum === 'GECIKMIS' ? `${Math.abs(k.kalanGun ?? 0)} gün geçti` : k.durum === 'BUGUN' ? 'Bugün' : k.durum === 'TARIH_EKSIK' ? 'Tarih kontrolü gerekli' : `${k.kalanGun} gün kaldı`}
            </Badge>
          </div>
          <h3 className="text-xs font-semibold leading-5">{k.baslik}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{k.tarihEtiketi}: <span className="font-mono">{k.tarih ? tarihVeSaat(k.tarih) : 'Belirtilmedi'}</span></p>
          <p className="mt-1 text-[11px] text-muted-foreground">{k.kaynak === 'GOREV' ? 'Görev kaydı' : k.kaynak === 'ETKINLIK' ? 'Takvim kaydı' : 'Önemli olay kaydı'}{k.kaynakEksik ? ' · Dayanak kontrolü gerekli' : ''}</p>
          {k.aciklama && <details className="mt-2 text-[11px] leading-5 text-muted-foreground"><summary className={`cursor-pointer rounded ${focus}`}>Kayıt açıklaması</summary><p className="whitespace-pre-wrap">{k.aciklama}</p></details>}
          {!demo && <Link href={k.kaynak === 'GOREV' ? '/gorevler' : k.kaynak === 'ONEMLI_OLAY' ? '/onemli-olaylar' : '/takvim'} className={`mt-2 inline-block rounded text-[11px] font-semibold text-primary ${focus}`}>Kaydı aç ↗</Link>}
        </li>)}
      </ul>
      <p className="border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">Burada kaydedilmiş tarihler gösterilir. Tebliğ tarihi, uygulanacak usul, tatil ve varsa uzatma kararı doğrulanmadan hukuki son gün hesaplanmaz.</p>
      {!demo && dosya.yazabilir && <EtkinlikEkle dosyalar={[{ id: dosya.id, hukukNo: dosya.no, icraNo: null, borclu: dosya.taraf }]} />}
    </div>
  </section>
}

export function DilekceMasasi({ dosyalar, secili, toplam, arama, demo = false }: DilekceMasasiProps) {
  return <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-7">
    {demo && <div role="status" className="mb-5 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-info"><b>Etkileşimli prototip</b> · Tamamı örnek veridir. Bu sayfadaki düzenlemeler gerçek dosyalara kaydedilmez.</div>}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <PageHeader kicker="Dosyadan dilekçeye" title="Dilekçe masası" sub="Geçmişi inceleyin, taslağı hazırlayın, sıradaki işi takip edin." />
      {!demo && <Link href="/bugun" className={`mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted ${focus}`}><CalendarDays className="h-4 w-4" /> Günün tüm işleri</Link>}
    </div>
    <details className={`${card} mb-5`} open={!secili || undefined}>
      <summary className={`flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-4 ${focus}`}>
        <span className="flex items-center gap-3"><FolderOpen className="h-5 w-5 text-primary" /><span><span className="block text-sm font-semibold">{secili ? 'Dosyayı değiştir' : 'Çalışacağınız dosyayı seçin'}</span><span className="text-xs text-muted-foreground">{toplam} dosya{arama ? ` · “${arama}” araması` : ' · İcra takibi açma şartı yok'}</span></span></span>
        <Search className="h-4 w-4 text-muted-foreground" />
      </summary>
      <div className="border-t border-border p-4">
        {!demo && <form action="/dilekceler" className="mb-4 flex gap-2">
          <label htmlFor="dilekce-dosya-ara" className="sr-only">Dosya numarası veya taraf adı</label>
          <input id="dilekce-dosya-ara" name="q" defaultValue={arama} maxLength={160} placeholder="Dosya no, dava esas no veya taraf adı…" className={`min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm ${focus}`} />
          <button type="submit" className={`rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ${focus}`}>Ara</button>
        </form>}
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 2xl:grid-cols-3">
          {dosyalar.map((d) => <Link key={d.id} href={demo ? '#calisma-alani' : `/dilekceler?dosya=${encodeURIComponent(d.id)}${arama ? `&q=${encodeURIComponent(arama)}` : ''}`} aria-current={secili?.id === d.id ? 'page' : undefined} className={`rounded-xl border p-3 text-sm ${focus} ${secili?.id === d.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-semibold">{d.no}</span><ArrowUpRight className="h-3.5 w-3.5 text-primary" /></div>
            <div className="mt-1 truncate font-semibold">{d.taraf}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{d.mahkeme || 'Mahkeme bilgisi eklenmemiş'}</div>
            <div className="mt-2 text-[11px] text-muted-foreground">{d.taslakSayisi} dilekçe kaydı</div>
          </Link>)}
        </div>
        {dosyalar.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Bu aramayla dosya bulunamadı.</p>}
        {toplam > dosyalar.length && <p className="mt-3 text-xs text-muted-foreground">Son güncellenen {dosyalar.length} dosya gösteriliyor. Diğer dosyaları arayarak bulabilirsiniz.</p>}
      </div>
    </details>
    {secili ? <div id="calisma-alani">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 px-4 py-4">
        <div><div className="mb-1 font-mono text-xs text-primary">{secili.no}</div><h2 className="font-display text-xl font-extrabold">{secili.taraf}</h2><p className="mt-1 text-xs text-muted-foreground">{secili.mahkeme || 'Mahkeme bilgisi henüz kaydedilmedi'}</p></div>
        {!demo && <Link href={`/akilli-giris/${secili.id}?asama=dava`} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 ${focus}`}>Dosya ayrıntıları <ArrowUpRight className="h-4 w-4" /></Link>}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        <div className="order-2 space-y-5 xl:order-1"><DosyaBaglami key={secili.id} dosya={secili} demo={demo} /><Sureler dosya={secili} demo={demo} /></div>
        <div className="order-1 min-w-0 xl:order-2"><DilekceEditor key={secili.id} dosyaId={secili.id} ciktilar={secili.ciktilar} belgeler={secili.belgeler} yazabilir={secili.yazabilir} demo={demo} /></div>
      </div>
    </div> : <div className={`${card} px-6 py-12 text-center`}><FileText className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-4 font-display text-xl font-extrabold">İlk dilekçenize dosyadan başlayın</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Dosyayı seçtiğinizde geçmişi, evrakları ve açık işleri burada bir araya gelir.</p>{!demo && <Link href="/atanan-dosyalar" className={`mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ${focus}`}>Dosyalara git</Link>}</div>}
  </div>
}
