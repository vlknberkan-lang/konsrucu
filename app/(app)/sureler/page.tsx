/**
 * KonsRücü — Süre defteri · app/(app)/sureler/page.tsx
 *
 * Aktif müvekkilin bütün dosyalarındaki süreler tek listede (06 §2(i)). Önce geçmiş ve onaysız olanlar,
 * sonra kalan güne göre. Tek birincil eylem: en acil onaysız sürenin "Son günü onayla"sı (GN-04 kartı).
 * Süzgeç: açık · onaysız · 14 gün içinde · kapanan. Tenant kapsamlı, oturum zorunlu.
 */
import Link from 'next/link'
import { ctx } from '@/lib/konsrucu/db'
import { PageHeader } from '@/components/konsrucu/ui'
import { sureleriOku } from '@/lib/konsrucu/sure/sorgu'
import { GN04_GUN, kalan, sureSimdiOnerisi } from '@/lib/konsrucu/sure/gorunum'
import { epostaKipi } from '@/lib/konsrucu/sure/hatirlatma'
import { SureDefteri } from '@/components/sure/sure-defteri'
import { SimdiSureKarti } from '@/components/sure/simdi-sure-karti'
import { EpostaKipiUyarisi } from '@/components/sure/eposta-kipi-uyarisi'
import { SureSabitUyarilar } from '@/components/sure/sure-sabit-uyarilar'

export const dynamic = 'force-dynamic'

type Suzgec = 'acik' | 'onaysiz' | 'yakin' | 'kapali'
const SUZGECLER: { k: Suzgec; label: string }[] = [
  { k: 'acik', label: 'Açık' },
  { k: 'onaysiz', label: 'Onaysız' },
  { k: 'yakin', label: `${GN04_GUN} gün içinde` },
  { k: 'kapali', label: 'Kapanan' },
]

export default async function SurelerPage({ searchParams }: { searchParams: { f?: string } }) {
  const { dbUser, aktifMusteriId } = await ctx()
  const f: Suzgec = (['onaysiz', 'yakin', 'kapali'] as const).find((x) => x === searchParams.f) ?? 'acik'

  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1300px] px-7 py-6">
        <PageHeader kicker="Süre defteri" title="Süreler" />
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center text-[13px]">Aktif müşteri seçili değil. Üst menüden bir müşteri seçin.</div>
      </div>
    )
  }

  const simdi = new Date()
  const [aciklar, kapananlar] = await Promise.all([
    sureleriOku({ musteriId: aktifMusteriId, kapsam: 'acik', simdi }),
    f === 'kapali' ? sureleriOku({ musteriId: aktifMusteriId, kapsam: 'kapali', simdi, take: 200 }) : Promise.resolve([]),
  ])
  const onaysiz = aciklar.filter((s) => !s.onaylananSonGun)
  const yakin = aciklar.filter((s) => { const k = kalan(s, simdi); return k != null && k <= GN04_GUN })
  const liste = f === 'onaysiz' ? onaysiz : f === 'yakin' ? yakin : f === 'kapali' ? kapananlar : aciklar
  const sayilar: Record<Suzgec, number | null> = { acik: aciklar.length, onaysiz: onaysiz.length, yakin: yakin.length, kapali: null }
  const oneri = sureSimdiOnerisi(aciklar, simdi)
  const avukat = dbUser.aktif && (dbUser.rol === 'ADMIN' || dbUser.rol === 'AVUKAT')

  return (
    <div className="mx-auto max-w-[1300px] space-y-4 px-7 py-6">
      <PageHeader
        kicker="Süre defteri"
        title="Süreler"
        sub="Sistem son günü önerir; onaylanan son günü avukat girer. Hatırlatmalar onaylanan güne, yoksa ihtiyatlı öneriye göre 7, 3 ve 1 gün kala gider."
      />
      <EpostaKipiUyarisi kip={epostaKipi().kip} />
      <SimdiSureKarti oneri={oneri} sure={oneri ? aciklar.find((s) => s.id === oneri.sureId) ?? null : null} onaylayabilir={avukat} />

      <nav aria-label="Süzgeç" className="flex flex-wrap items-center gap-2">
        {SUZGECLER.map((s) => (
          <Link
            key={s.k}
            href={s.k === 'acik' ? '/sureler' : `/sureler?f=${s.k}`}
            aria-current={f === s.k ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 ${f === s.k ? 'border-kr/40 bg-kr-soft text-kr-ink' : 'border-border bg-surface text-muted-foreground hover:border-kr/30 hover:text-foreground'}`}
          >
            {s.label}{sayilar[s.k] != null ? ` · ${sayilar[s.k]}` : ''}
          </Link>
        ))}
      </nav>

      <SureDefteri
        sureler={liste}
        rol={dbUser.aktif ? dbUser.rol : 'GORUNTULEYEN'}
        kullaniciId={dbUser.id}
        simdiIso={simdi.toISOString()}
        dosyaSutunu
        bosMetin={f === 'acik' ? 'Açık süre yok. Süreler dosya sayfasından eklenir.' : 'Bu süzgece uyan süre yok.'}
      />
      <SureSabitUyarilar />
    </div>
  )
}
