/**
 * KonsRücü — Veri Onarımı · app/(app)/yonetim/veri-onarim/page.tsx
 *
 * 06 §6.3 ekranı: parti seçilir, satırlar tek tek onaylanır ya da reddedilir, onaylananlar TEK İŞLEMDE
 * uygulanır; satır ya da parti geri alınabilir. R1'de toplu onay yalnız 5 örnek elle teyit edildikten sonra
 * ve yalnız A sınıfında açılır; durum ve süre partilerinde toplu onay yoktur.
 * Erişim: yalnız ADMIN ve AVUKAT (avukat yardımcısı "erişim yok" görür). Kapsam: aktif müvekkil.
 * Birincil eylem: [Onaylananları uygula].
 */
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { ctx } from '@/lib/konsrucu/db'
import { Badge, PageHeader } from '@/components/konsrucu/ui'
import { ornekTeyitSayisi, partiOzetleri, partiSatirlari } from '@/lib/konsrucu/onarim/servis'
import { DURUM_ETIKET, kodMeta, topluOnayDurumu, topluOnaylanabilirMi, type SatirDurumu } from '@/lib/konsrucu/onarim/kurallar'
import { satirGosterimi } from '@/lib/konsrucu/onarim/gosterim'
import { KuruListeOlustur, OnarimPartiEylemleri, OnarimSatirKarari } from './onarim-eylemleri'

export const dynamic = 'force-dynamic'

const TH = 'px-3 py-2 text-left font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground'
const TD = 'px-3 py-2.5 align-top text-[12.5px]'

export default async function VeriOnarimPage({ searchParams }: { searchParams: { parti?: string } }) {
  const { dbUser, aktifMusteriId } = await ctx()
  const yetkili = dbUser.aktif && (dbUser.rol === 'ADMIN' || dbUser.rol === 'AVUKAT')

  if (!yetkili || !aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-10">
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-danger" aria-hidden />
          <div className="font-display text-lg font-bold text-danger">Erişim yok</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">
            {aktifMusteriId ? 'Veri onarımı ekranı yalnız avukat ve yönetici içindir.' : 'Aktif müşteri seçili değil.'}
          </p>
        </div>
      </div>
    )
  }

  const partiler = await partiOzetleri(aktifMusteriId)
  const bekleyenIlk = partiler.find((p) => (p.sayilar.KURU ?? 0) + (p.sayilar.ONAYLI ?? 0) > 0)
  const secili = partiler.find((p) => p.parti === searchParams.parti) ?? bekleyenIlk ?? partiler[0] ?? null
  const satirlar = secili ? await partiSatirlari(aktifMusteriId, secili.parti) : []
  const meta = secili ? kodMeta(secili.kod) : null
  const ornekSayisi = secili && meta?.topluOnay ? await ornekTeyitSayisi(aktifMusteriId, secili.kod) : 0
  const toplu = secili ? topluOnayDurumu(secili.kod, ornekSayisi) : { acik: false, sebep: '' }
  const sayi = (d: SatirDurumu) => secili?.sayilar[d] ?? 0

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-7 py-6">
      <PageHeader
        kicker="Yönetim · Veri onarımı"
        title="Veri onarımı"
        sub="Kuru listeler satır satır avukat onayıyla uygulanır. Uygulama tek işlemdir; eski değer değiştiyse satır atlanır. Her satır ve parti geri alınabilir; kayıtlar silinmez."
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Partiler" className="space-y-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Partiler</div>
          {partiler.length === 0 && <p className="text-[12.5px] text-muted-foreground">Henüz parti yok. Aşağıdan kuru liste oluşturun.</p>}
          {partiler.map((p) => {
            const bekleyen = (p.sayilar.KURU ?? 0) + (p.sayilar.ONAYLI ?? 0)
            const aktif = secili?.parti === p.parti
            return (
              <Link key={p.parti} href={`/yonetim/veri-onarim?parti=${encodeURIComponent(p.parti)}`} aria-current={aktif ? 'page' : undefined}
                className={`block rounded-xl border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 ${aktif ? 'border-kr/40 bg-kr-soft/50' : 'border-border bg-surface hover:border-kr/30'}`}>
                <div className="font-mono text-[12px] font-bold">{p.parti}</div>
                <div className="text-[11px] text-muted-foreground">{kodMeta(p.kod).etiket} · {p.toplam} satır{bekleyen ? ` · ${bekleyen} bekliyor` : ''}</div>
              </Link>
            )
          })}
        </nav>

        <div className="min-w-0 space-y-3">
          {secili && meta ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[18px] font-extrabold">Parti {secili.parti}</h2>
                <Badge tone="info">{meta.etiket}</Badge>
                <Badge tone="steel">{secili.toplam} satır</Badge>
                <span className="text-[12px] text-muted-foreground">Kuru {sayi('KURU')} · Onaylı {sayi('ONAYLI')} · Uygulanan {sayi('UYGULANDI')} · Atlanan {sayi('ATLANDI')} · Reddedilen {sayi('REDDEDILDI')} · Geri alınan {sayi('GERI_ALINDI')}</span>
              </div>
              <p className="text-[12.5px] text-muted-foreground">{meta.aciklama}</p>

              <OnarimPartiEylemleri
                parti={secili.parti}
                onayliSayisi={sayi('ONAYLI')}
                uygulananSayisi={sayi('UYGULANDI')}
                topluOnay={{ var: meta.topluOnay, acik: toplu.acik, sebep: toplu.sebep, ornekSayisi, uygunSayi: satirlar.filter(topluOnaylanabilirMi).length }}
              />

              <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
                <table className="w-full min-w-[1080px] border-collapse">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th scope="col" className={TH}>Dosya</th>
                      <th scope="col" className={TH}>Alan</th>
                      <th scope="col" className={TH}>Şimdi</th>
                      <th scope="col" className={TH}>Önerilen</th>
                      <th scope="col" className={TH}>Kanıt</th>
                      <th scope="col" className={TH}>Sınıf</th>
                      <th scope="col" className={TH}>Durum</th>
                      <th scope="col" className={TH}>Karar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satirlar.map((s) => {
                      const g = satirGosterimi(s)
                      const d = DURUM_ETIKET[s.durum as SatirDurumu] ?? { label: s.durum, tone: 'steel' as const }
                      return (
                        <tr key={s.id} className="border-t border-border-subtle">
                          <td className={TD}>
                            <Link href={`/dosya/${s.dosyaId}`} className="font-mono font-bold hover:text-kr hover:underline">{s.dosyaNo}</Link>
                          </td>
                          <td className={TD}>{g.alan}</td>
                          <td className={`${TD} font-mono`}>{g.simdi}</td>
                          <td className={`${TD} font-mono`}>{g.onerilen}</td>
                          <td className={`${TD} max-w-[360px] text-muted-foreground`}>
                            {s.kanit}
                            {s.not && <div className="mt-1 text-[11.5px] italic">Not: {s.not}</div>}
                            {s.onaylayanAd && <div className="mt-1 text-[11px]">Karar: {s.onaylayanAd}</div>}
                          </td>
                          <td className={TD}><Badge tone={s.guvenSinifi === 'A' ? 'success' : s.guvenSinifi === 'B' ? 'warning' : 'danger'}>{s.guvenSinifi}</Badge></td>
                          <td className={TD}><Badge tone={d.tone} dot>{d.label}</Badge></td>
                          <td className={`${TD} w-[260px]`}>
                            <OnarimSatirKarari id={s.id} durum={s.durum} ornekSecilebilir={meta.topluOnay} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-6 py-10 text-center text-[13px] text-muted-foreground">
              Onarım partisi yok.
            </div>
          )}
          <KuruListeOlustur />
        </div>
      </div>
    </div>
  )
}
