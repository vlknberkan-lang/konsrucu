/**
 * KonsRücü — Dosya Detay · aşama paneli (İcra/Arabuluculuk/Dava/İnfaz)
 * Aşama no/birim/tarih kaydı + sonuçlandır + etkinlik (toplantı/duruşma) ekleme & listesi.
 */
import { Check, CalendarPlus, MapPin, Flag, Bell } from 'lucide-react'
import { asamaKaydet, asamaSonuclandir, etkinlikKaydet } from '@/app/(app)/akilli-giris/actions'
import { TakipSureci, type OlayUI, type EvrakUI, type UyapBilgi } from './takip-sureci'

type Sekme = 'icra' | 'arabuluculuk' | 'dava' | 'infaz'
type Asama = { id: string; kimlikNo: string | null; birim: string | null; baslangic: Date | null; ozet: string | null; durum: string; sonuc: string | null }
type Etkinlik = { id: string; tur: string; baslik: string; baslar: Date; biter: Date | null; yer: string | null; durum: string; hatirlatmaDk: number | null }

const META: Record<Sekme, { tur: string; baslik: string; noLabel: string; noPh: string; birimLabel: string; birimPh: string; sonuc: string[]; etkTur: string; etkLabel: string; not: string }> = {
  icra: { tur: 'ICRA_TAKIBI', baslik: 'İcra Takibi', noLabel: 'İcra Dosya No', noPh: '2026/32147', birimLabel: 'İcra Dairesi', birimPh: 'Gaziosmanpaşa İcra Dairesi', sonuc: ['itiraz', 'kesinleşti', 'tahsil', 'kapandı'], etkTur: 'GORUSME', etkLabel: 'Görüşme / süre', not: 'Ana sayfadan Excel ile hukuk-no eşleşerek toplu da girilebilir.' },
  arabuluculuk: { tur: 'ARABULUCULUK', baslik: 'Arabuluculuk', noLabel: 'Arabuluculuk Dosya No', noPh: '2026/1234', birimLabel: 'Arabuluculuk Bürosu', birimPh: 'İstanbul Arabuluculuk Bürosu', sonuc: ['anlaşıldı', 'anlaşılmadı', 'kısmen anlaşıldı'], etkTur: 'ARABULUCULUK_TOPLANTISI', etkLabel: 'Toplantı', not: 'Anlaşılmadıysa Dava aşamasına geçilir.' },
  dava: { tur: 'DAVA', baslik: 'Dava', noLabel: 'Esas No', noPh: '2026/415', birimLabel: 'Mahkeme', birimPh: 'İstanbul Anadolu 7. Tüketici Mahkemesi', sonuc: ['kabul', 'ret', 'kısmen kabul'], etkTur: 'DURUSMA', etkLabel: 'Duruşma', not: 'Karar sonrası aynı esastan ilamlı icraya (İnfaz) geçilir.' },
  infaz: { tur: 'INFAZ', baslik: 'İnfaz · İlamlı İcra', noLabel: 'İcra No (aynı esas)', noPh: 'aynı esastan devam', birimLabel: 'İcra Dairesi', birimPh: '', sonuc: ['tahsil', 'düştü'], etkTur: 'GORUSME', etkLabel: 'İşlem', not: 'Karar kesinleşince aynı esastan ilamlı icra olarak devam eder.' },
}

const INP = 'w-full rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15'
const LBL = 'font-mono mb-1 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground'
const fmtDT = (d: Date) => new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtSaat = (d: Date) => new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const HATIRLATMA: Record<number, string> = { 60: '1 saat önce', 1440: '1 gün önce', 2880: '2 gün önce', 10080: '1 hafta önce' }
const hatirlatmaEt = (dk: number) => HATIRLATMA[dk] ?? `${dk} dk önce`

export function AsamaPanel({
  sekme,
  dosyaId,
  asama,
  etkinlikler = [],
  prefill,
  takip,
}: {
  sekme: Sekme
  dosyaId: string
  asama: Asama | null
  etkinlikler?: Etkinlik[]
  prefill?: { no?: string | null; birim?: string | null }
  takip: { durum: string; olaylar: OlayUI[]; bakiye: { toplam: number; tahsil: number; kalan: number }; uyap: UyapBilgi; evraklar: EvrakUI[] }
}) {
  const m = META[sekme]
  const bitti = asama?.durum === 'SONUCLANDI'

  return (
    <section className="mt-5 flex flex-col gap-4">
      {/* aşama no / birim / tarih */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Aşama</div>
            <h2 className="font-display text-[17px] font-extrabold">{m.baslik}</h2>
          </div>
          {bitti ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success"><Flag className="h-3 w-3" /> sonuçlandı{asama?.sonuc ? ` · ${asama.sonuc}` : ''}</span>
          ) : asama ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-kr-soft px-2.5 py-1 text-[11px] font-semibold text-kr-ink"><Check className="h-3 w-3" /> devam</span>
          ) : (
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">başlamadı</span>
          )}
        </div>

        <form action={asamaKaydet} className="p-5">
          <input type="hidden" name="dosyaId" value={dosyaId} />
          <input type="hidden" name="tur" value={m.tur} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={LBL}>{m.noLabel}</label><input name="kimlikNo" defaultValue={asama?.kimlikNo ?? prefill?.no ?? ''} placeholder={m.noPh} className={`${INP} font-mono`} /></div>
            <div><label className={LBL}>{m.birimLabel}</label><input name="birim" defaultValue={asama?.birim ?? prefill?.birim ?? ''} placeholder={m.birimPh} className={INP} /></div>
            <div><label className={LBL}>Tarih</label><input type="date" name="tarih" defaultValue={iso(asama?.baslangic ?? null)} className={INP} /></div>
            <div className="sm:col-span-2"><label className={LBL}>Not / özet</label><textarea name="ozet" defaultValue={asama?.ozet ?? ''} rows={2} placeholder="bu aşamaya dair kısa not…" className={`${INP} resize-y`} /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90"><Check className="h-4 w-4" /> {asama ? 'Aşamayı güncelle' : 'Aşamayı başlat'}</button>
            <span className="text-[11.5px] text-muted-foreground">{m.not}</span>
          </div>
        </form>

        {/* sonuçlandır */}
        {asama && !bitti && (
          <form action={asamaSonuclandir} className="flex flex-wrap items-end gap-2 border-t border-border-subtle bg-surface-muted/30 px-5 py-3.5">
            <input type="hidden" name="asamaId" value={asama.id} />
            <div>
              <label className={LBL}>Sonuçlandır</label>
              <select name="sonuc" className={`${INP} bg-surface`} defaultValue={m.sonuc[0]}>
                {m.sonuc.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold transition hover:border-success/50 hover:text-success"><Flag className="h-4 w-4" /> Aşamayı sonuçlandır</button>
          </form>
        )}
      </div>

      {/* etkinlik takvimi — ajanda: aşama başlamadan da eklenebilir (dosya-seviyesi) */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{m.etkLabel} takvimi</span>
          {!asama && <span className="text-[10.5px] text-muted-foreground">aşama başlamadan da etkinlik ekleyebilirsiniz</span>}
        </div>
        <div className="flex flex-col gap-1.5 px-5 py-4">
          {etkinlikler.length === 0 && <p className="text-[12.5px] text-muted-foreground">Henüz {m.etkLabel.toLocaleLowerCase('tr')} eklenmedi.</p>}
          {etkinlikler.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-[11px] border border-border-subtle bg-surface-muted/40 px-3 py-2.5">
              <span className="font-mono text-[12.5px] font-bold tabular-nums text-kr-ink">{fmtDT(e.baslar)}{e.biter ? ` – ${fmtSaat(e.biter)}` : ''}</span>
              <span className="h-7 w-px bg-border" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold">{e.baslik}</div>
                {e.yer && <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" /> {e.yer}</div>}
              </div>
              {e.hatirlatmaDk ? <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10.5px] text-muted-foreground" title="hatırlatma"><Bell className="h-3 w-3" />{hatirlatmaEt(e.hatirlatmaDk)}</span> : null}
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{e.durum.toLocaleLowerCase('tr')}</span>
            </div>
          ))}
        </div>
        <form action={etkinlikKaydet} className="flex flex-wrap items-end gap-2 border-t border-border-subtle bg-surface-muted/30 px-5 py-3.5">
          <input type="hidden" name="dosyaId" value={dosyaId} />
          {asama && <input type="hidden" name="asamaId" value={asama.id} />}
          <input type="hidden" name="tur" value={m.etkTur} />
          <div className="min-w-[160px] flex-1"><label className={LBL}>Başlık</label><input name="baslik" placeholder={`${m.etkLabel} başlığı`} className={`${INP} bg-surface`} /></div>
          <div><label className={LBL}>Başlangıç (tarih & saat)</label><input type="datetime-local" name="baslar" step={60} className={`${INP} bg-surface`} /></div>
          <div><label className={LBL}>Bitiş (ops.)</label><input type="datetime-local" name="biter" step={60} className={`${INP} bg-surface`} /></div>
          <div className="min-w-[140px] flex-1"><label className={LBL}>Yer</label><input name="yer" placeholder="adliye / büro / online" className={`${INP} bg-surface`} /></div>
          <div><label className={LBL}>Hatırlatma</label>
            <select name="hatirlatmaDk" defaultValue="" className={`${INP} bg-surface`}>
              <option value="">—</option>
              <option value="60">1 saat önce</option>
              <option value="1440">1 gün önce</option>
              <option value="2880">2 gün önce</option>
              <option value="10080">1 hafta önce</option>
            </select>
          </div>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-[10px] bg-kr px-3.5 py-2.5 text-[13px] font-semibold text-kr-foreground transition hover:bg-kr/90"><CalendarPlus className="h-4 w-4" /> Ekle</button>
        </form>
      </div>

      {/* UYAP izleme + zaman çizelgesi (durum/finansal/evrak/olay) — tüm aşamalarda */}
      <TakipSureci
        dosyaId={dosyaId}
        durum={takip.durum}
        olaylar={takip.olaylar}
        bakiye={takip.bakiye}
        uyap={takip.uyap}
        evraklar={takip.evraklar}
        kicker="UYAP İZLEME · ZAMAN ÇİZELGESİ"
      />
    </section>
  )
}
