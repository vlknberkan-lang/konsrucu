/**
 * KonsRücü — Şirket Bilgileri (Ayarlar) · app/(app)/ayarlar/page.tsx
 * Alacaklı / MERSİS / IBAN / vekil / faiz — takip açıklaması ve dilekçeler bunları kullanır.
 */
import { Check, Building2, Percent, FileSignature, Puzzle } from 'lucide-react'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { oranlariOku } from '@/lib/konsrucu/faiz'
import { FaizOranlari } from '@/components/ayarlar/faiz-oranlari'
import { Vekaletname } from '@/components/ayarlar/vekaletname'
import { SenkronAnahtar } from '@/components/ayarlar/senkron-anahtar'
import { ayarlarKaydet } from './actions'

const PROGRAM_URL = 'https://konsrucu.vercel.app'

const ALAN = 'w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-foreground outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15'
const LABEL = 'font-mono mb-1 block text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground'

export default async function AyarlarPage({ searchParams }: { searchParams: { ok?: string } }) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return <div className="mx-auto max-w-[820px] px-7 py-6"><p className="text-sm text-muted-foreground">Aktif müşteri seçili değil — üst menüden müşteri seçin.</p></div>
  }
  const [musteri, ayarlar] = await Promise.all([
    prisma.musteri.findUnique({ where: { id: aktifMusteriId }, select: { ad: true } }),
    prisma.ayarlar.findUnique({ where: { musteriId: aktifMusteriId } }),
  ])

  const alanlar: [string, string, string | null, boolean?][] = [
    ['alacakliUnvan', 'Alacaklı ünvanı', ayarlar?.alacakliUnvan ?? musteri?.ad ?? null],
    ['mersis', 'MERSİS no', ayarlar?.mersis ?? null, true],
    ['iban', 'IBAN', ayarlar?.iban ?? null, true],
    ['kep', 'KEP adresi', ayarlar?.kep ?? null],
    ['eposta', 'E-posta', ayarlar?.eposta ?? null],
    ['vekilAd', 'Vekil (avukat) adı', ayarlar?.vekilAd ?? null],
    ['vekilBaro', 'Baro / sicil', ayarlar?.vekilBaro ?? null],
    ['faizTuru', 'Faiz türü', ayarlar?.faizTuru ?? 'Yasal faiz'],
  ]

  return (
    <div className="mx-auto max-w-[820px] px-7 py-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ayarlar · Şirket Bilgileri</div>
      <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Şirket Bilgileri</h1>
      <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
        <b>{musteri?.ad}</b> için alacaklı/vekil/faiz bilgileri. UYAP takip açıklaması ve dilekçelerdeki alacaklı, MERSİS ve footer buradan gelir.
      </p>

      {searchParams?.ok === '1' && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-[13px] text-success">
          <Check className="h-4 w-4" /> Kaydedildi.
        </div>
      )}

      <form action={ayarlarKaydet} className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <input type="hidden" name="musteriId" value={aktifMusteriId} />
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <Building2 className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Alacaklı & Vekil</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          {alanlar.map(([k, lbl, v, mono]) => (
            <div key={k}>
              <label htmlFor={k} className={LABEL}>{lbl}</label>
              <input id={k} name={k} defaultValue={v ?? ''} className={`${ALAN} ${mono ? 'font-mono' : ''}`} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label htmlFor="vekilAdres" className={LABEL}>Vekil adresi</label>
            <input id="vekilAdres" name="vekilAdres" defaultValue={ayarlar?.vekilAdres ?? ''} className={ALAN} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="aciklamaFooter" className={LABEL}>Takip açıklaması footer'ı (UYAP metninin sonuna eklenir)</label>
            <textarea id="aciklamaFooter" name="aciklamaFooter" rows={3} defaultValue={ayarlar?.aciklamaFooter ?? ''} placeholder="Örn. K/Partners: iletişim / vekâlet bilgisi…" className={`${ALAN} resize-y`} />
          </div>

          <div className="sm:col-span-2 border-t border-border-subtle pt-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Dava dilekçesi sabitleri</div>
          </div>
          <div>
            <label htmlFor="davaciVkn" className={LABEL}>Davacı (Ray) VKN</label>
            <input id="davaciVkn" name="davaciVkn" defaultValue={ayarlar?.davaciVkn ?? ''} placeholder="7340039798" className={`${ALAN} font-mono`} />
          </div>
          <div>
            <label htmlFor="vekilUets" className={LABEL}>Vekil UETS No</label>
            <input id="vekilUets" name="vekilUets" defaultValue={ayarlar?.vekilUets ?? ''} placeholder="16812-18779-94498" className={`${ALAN} font-mono`} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="davaciAdres" className={LABEL}>Davacı (Ray) açık adres</label>
            <input id="davaciAdres" name="davaciAdres" defaultValue={ayarlar?.davaciAdres ?? ''} placeholder="Cumhuriyet Mah. Haydar Aliyev Cad. No:28 Sarıyer/İstanbul" className={ALAN} />
          </div>
          <div>
            <label htmlFor="icraInkarOrani" className={LABEL}>İcra inkâr tazminatı oranı (%)</label>
            <input id="icraInkarOrani" name="icraInkarOrani" defaultValue={ayarlar?.icraInkarOrani ?? '20'} placeholder="20" className={`${ALAN} font-mono`} />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border-subtle bg-surface-muted/40 px-5 py-4">
          <button type="submit" className="inline-flex items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
            <Check className="h-4 w-4" /> Kaydet
          </button>
          <span className="text-[11.5px] text-muted-foreground">Dönemsel faiz oranları (faizJson) sonraki adımda buraya gelecek.</span>
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <FileSignature className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Vekaletname</h2>
          <span className="ml-auto text-[11.5px] text-muted-foreground">Tüm dosyalarda ortak · bir kez yüklenir</span>
        </div>
        <div className="p-5"><Vekaletname musteriId={aktifMusteriId} init={{ ad: ayarlar?.vekaletnameAd ?? null, yuklu: !!ayarlar?.vekaletnamePath }} /></div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <Puzzle className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">UYAP Eklenti Senkron Anahtarı</h2>
        </div>
        <div className="p-5"><SenkronAnahtar musteriId={aktifMusteriId} init={{ yuklu: !!ayarlar?.senkronToken }} programUrl={PROGRAM_URL} /></div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <Percent className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Faiz Oranları (dönemsel)</h2>
        </div>
        <div className="p-5"><FaizOranlari musteriId={aktifMusteriId} init={oranlariOku(ayarlar?.faizJson)} /></div>
      </div>
    </div>
  )
}
