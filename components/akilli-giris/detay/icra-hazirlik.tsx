'use client'

/**
 * KonsRücü — Dosya Detay · İcra Takibine Hazırlık (icra sekmesi, takip henüz açılmamışken).
 * 100+ belge arasından icra dayanağını (Poliçe · KTT/ifade · sigortalı beyanı · ekspertiz · dekont) +
 * AI'ın seçtiği 2 hasar fotoğrafını karşıya getirir, "hap bilgiler"i ve UYAP açıklamasını gösterir,
 * tek .zip paket indirtir. Aşağıdaki AsamaPanel formu takibi gerçekten açar (icra no/daire/tarih).
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Eye, Sparkles, Loader2, Download, AlertTriangle, ScrollText, Banknote, Gavel, Users, Building2, Clock, Image as ImageIcon, Check } from 'lucide-react'
import { hasarFotoSecAI } from '@/app/(app)/akilli-giris/actions'
import { BelgeOnizleme, type OnizlemeBelge } from '@/components/akilli-giris/detay/belge-onizleme'
import { Kopyala } from '@/components/akilli-giris/kopyala'

export type DayanakBelgeUI = { id: string; dosyaAdi: string; rolLabel: string; acilabilir: boolean; belgeTarihi: string | null; not?: string }
export type HasarFotoUI = { id: string; dosyaAdi: string; secili: boolean }
export type HapBilgi = {
  hukukNo: string | null; hasarNo: string | null
  alacakliUnvan: string | null; mersisVkn: string | null; vekil: string | null
  borclular: { adUnvan: string; tcVkn: string | null; adres: string | null; teyitli: boolean }[]
  anapara: string | null; rucuOrani: string | null; islemisFaiz: string | null; toplam: string | null; faizAralik: string | null
  kazaTarihi: string; kazaYeri: string; brans: string | null; rucuSebebi: string | null; yetkiliIcra: string | null; zamanasimi: string
  aciklama: string
}

const Sat = ({ etiket, deger, mono }: { etiket: string; deger: React.ReactNode; mono?: boolean }) => (
  <div className="min-w-0">
    <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{etiket}</div>
    <div className={`mt-0.5 text-[13px] font-semibold text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>{deger}</div>
  </div>
)

export function IcraHazirlik({ dosyaId, hap, dayanak, notlar, hasar, takipAcik = false }: { dosyaId: string; hap: HapBilgi; dayanak: DayanakBelgeUI[]; notlar: string[]; hasar: HasarFotoUI[]; takipAcik?: boolean }) {
  const [onizle, setOnizle] = useState<OnizlemeBelge | null>(null)
  const [pending, start] = useTransition()
  const [hata, setHata] = useState<string | null>(null)
  const router = useRouter()
  const aiSecili = hasar.some((h) => h.secili)
  const fotoGoster = aiSecili ? hasar.filter((h) => h.secili) : hasar.slice(0, 2)

  function aiSec() {
    setHata(null)
    start(async () => { const r = await hasarFotoSecAI(dosyaId); if (r.ok) router.refresh(); else setHata(r.error ?? 'Seçilemedi') })
  }

  const belgeSatir = (b: { id: string; dosyaAdi: string; acilabilir: boolean }, rolLabel: string, not?: string, ek?: React.ReactNode) => (
    <div key={b.id} className="flex items-start gap-2.5 rounded-[10px] border border-border-subtle bg-surface px-3 py-2">
      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kr" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-bold text-foreground">{rolLabel}</span>
          {ek}
        </div>
        <div className="truncate text-[11.5px] text-muted-foreground" title={b.dosyaAdi}>{b.dosyaAdi}</div>
        {not && <div className="mt-0.5 text-[11px] text-warning">{not}</div>}
      </div>
      {b.acilabilir
        ? <button onClick={() => setOnizle({ id: b.id, dosyaAdi: b.dosyaAdi })} className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-border px-2 py-1 text-[10.5px] font-semibold text-muted-foreground transition hover:border-kr/40 hover:text-kr-ink"><Eye className="h-3 w-3" /> Aç</button>
        : <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">—</span>}
    </div>
  )

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-kr/30 bg-surface shadow-card">
      <div className="flex items-start gap-3 border-b border-border-subtle bg-kr-soft/20 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-kr text-kr-foreground"><Gavel className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-kr-ink">İCRA TAKİBİNE HAZIRLIK{takipAcik ? ' · REFERANS' : ''}</div>
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.025em]">{takipAcik ? 'Dayanak & Hap Bilgiler' : 'Takip Aç — Dayanak & Hap Bilgiler'}</h2>
          <p className="mt-1 max-w-[70ch] text-[12px] leading-[1.45] text-muted-foreground">{takipAcik
            ? 'Takip açıldı. İcra dayanağı belgeler ve özet referans olarak burada kalır; paketi tekrar indirebilir, dayanakları kontrol edebilirsiniz.'
            : 'Takip henüz açılmadı. İcra açmak için gerekli dayanak belgeleri ve özet aşağıda hazır; paketi indirip aşağıdaki formdan takibi açabilirsiniz.'}</p>
        </div>
        <a href={`/api/icra-hazirlik/${dosyaId}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-kr px-3.5 py-2 text-[12.5px] font-semibold text-kr-foreground transition hover:bg-kr/90"><Download className="h-4 w-4" /> Paketi indir (.zip)</a>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {/* HAP BİLGİLER */}
        <div className="flex flex-col gap-3.5">
          <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-3.5">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><Building2 className="h-3.5 w-3.5 text-kr" /> Alacaklı</div>
            <div className="grid grid-cols-2 gap-2.5">
              <Sat etiket="Ünvan" deger={hap.alacakliUnvan ?? '—'} />
              <Sat etiket="MERSİS / VKN" deger={hap.mersisVkn ?? '—'} mono />
              <Sat etiket="Vekil" deger={hap.vekil ?? '—'} />
              <Sat etiket="Hukuk / Hasar No" deger={`${hap.hukukNo ?? '—'} · ${hap.hasarNo ?? '—'}`} mono />
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-3.5">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><Users className="h-3.5 w-3.5 text-kr" /> Borçlu(lar) · {hap.borclular.length}</div>
            {hap.borclular.length ? (
              <ul className="flex flex-col gap-1.5">
                {hap.borclular.map((b, i) => (
                  <li key={i} className="text-[12px]">
                    <span className="font-semibold text-foreground">{b.adUnvan}</span>
                    {b.tcVkn && <span className="font-mono ml-1.5 text-[11px] text-muted-foreground">{b.tcVkn}</span>}
                    {b.teyitli ? <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-success"><Check className="h-3 w-3" />teyitli</span> : <span className="ml-1.5 text-[10px] text-warning">teyit gerek</span>}
                    {b.adres && <div className="truncate text-[11px] text-muted-foreground" title={b.adres}>{b.adres}</div>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-[12px] text-warning">Henüz borçlu çıkarılmadı — İcra Öncesi'nde çıkarım yapın.</p>}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><Banknote className="h-3.5 w-3.5 text-kr" /> Alacak</div>
              <div className="flex flex-col gap-2">
                <Sat etiket="Asıl alacak" deger={hap.anapara ?? '—'} mono />
                <Sat etiket="Rücu oranı" deger={hap.rucuOrani ?? '—'} mono />
                <Sat etiket="İşlemiş faiz" deger={hap.islemisFaiz ?? '—'} mono />
                <Sat etiket="Takip çıkışı" deger={<span className="text-kr-ink">{hap.toplam ?? '—'}</span>} mono />
                {hap.faizAralik && <div className="text-[10px] text-muted-foreground">{hap.faizAralik}</div>}
              </div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><Gavel className="h-3.5 w-3.5 text-kr" /> Kaza & Yetki</div>
              <div className="flex flex-col gap-2">
                <Sat etiket="Kaza tarihi" deger={hap.kazaTarihi} />
                <Sat etiket="Kaza yeri" deger={hap.kazaYeri} />
                <Sat etiket="Branş / sebep" deger={`${hap.brans ?? '—'}${hap.rucuSebebi ? ` · ${hap.rucuSebebi}` : ''}`} />
                <Sat etiket="Yetkili icra" deger={hap.yetkiliIcra ?? '—'} />
                <Sat etiket="Zamanaşımı" deger={<span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{hap.zamanasimi}</span>} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-3.5">
            <div className="mb-1.5 flex items-center gap-2"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">UYAP Takip Açıklaması</div><span className="ml-auto"><Kopyala metin={hap.aciklama} /></span></div>
            {hap.aciklama
              ? <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-foreground">{hap.aciklama}</pre>
              : <p className="text-[12px] italic text-muted-foreground">Açıklama henüz oluşturulmadı — İcra Öncesi'nde AI çıkarımı yapın.</p>}
          </div>
        </div>

        {/* DAYANAK BELGELER */}
        <div className="flex flex-col gap-3.5">
          <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-3.5">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><ScrollText className="h-3.5 w-3.5 text-kr" /> Dayanak Belgeler · {dayanak.length + fotoGoster.length}</div>
            {dayanak.length ? (
              <div className="flex flex-col gap-1.5">{dayanak.map((d) => belgeSatir(d, d.rolLabel, d.not, d.belgeTarihi ? <span className="font-mono text-[9.5px] text-muted-foreground">{d.belgeTarihi}</span> : undefined))}</div>
            ) : <p className="text-[12px] text-warning">Dayanak belge seçilemedi — Evrak bölümünden poliçe/tutanak/dekont ekleyin.</p>}
          </div>

          {/* HASAR FOTOĞRAFLARI */}
          <div className="rounded-xl border border-border-subtle bg-surface-muted/30 p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5 text-kr" /> Hasar Fotoğrafı · maks 2
              {aiSecili && <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-1.5 py-[1px] text-[9px] font-semibold normal-case tracking-normal text-success"><Sparkles className="h-2.5 w-2.5" /> AI seçti</span>}
            </div>
            {hasar.length ? (
              <>
                <div className="flex flex-col gap-1.5">
                  {fotoGoster.map((b) => belgeSatir({ id: b.id, dosyaAdi: b.dosyaAdi, acilabilir: true }, 'Hasar Fotoğrafı', undefined, <span className="inline-flex items-center gap-0.5 rounded-full bg-kr-soft px-1.5 py-[1px] text-[9px] font-semibold text-kr-ink">pakete girecek</span>))}
                </div>
                <button onClick={aiSec} disabled={pending} className="mt-2 inline-flex items-center gap-1.5 rounded-[9px] border border-kr/40 bg-surface px-3 py-1.5 text-[11.5px] font-semibold text-kr-ink transition hover:bg-kr-soft/40 disabled:opacity-60">
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {aiSecili ? 'AI ile yeniden seç' : `AI ile en net 2 hasarı seç (${hasar.length} foto)`}
                </button>
                {!aiSecili && <p className="mt-1 text-[10.5px] text-muted-foreground">Henüz AI seçmedi; pakette ilk 2 hasar fotoğrafı kullanılır.</p>}
                {hata && <p className="mt-1 text-[11px] text-danger">{hata}</p>}
              </>
            ) : <p className="text-[12px] text-muted-foreground">Hasar fotoğrafı bulunamadı.</p>}
          </div>

          {notlar.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning-soft/40 p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--warning-fg))]"><AlertTriangle className="h-3.5 w-3.5" /> Dikkat</div>
              <ul className="flex flex-col gap-1 text-[12px] leading-[1.45] text-[hsl(var(--warning-fg))]">{notlar.map((n, i) => <li key={i}>• {n}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <BelgeOnizleme belge={onizle} onKapat={() => setOnizle(null)} />
    </section>
  )
}
