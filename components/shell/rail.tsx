'use client'

/**
 * KonsRücü — sol modül rail'i · components/shell/rail.tsx
 * Midnight zemin · "K" markı (teal nokta) · 5 bölüm (İşlerim, Dosyalar, Takvim, Dilekçeler, Ayarlar);
 * bölümün sayfaları yan panelde (sidebar).
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BOLUMLER, aktifBolum, navGorunur, type NavCounts } from '@/lib/konsrucu/nav'
import { KonsRucuMark } from '@/components/brand/konsrucu-mark'

export function Rail({ userInit, counts, rol }: { userInit: string; counts?: NavCounts; rol?: string }) {
  const pathname = usePathname()
  const aktifId = aktifBolum(pathname)?.id
  return (
    <aside className="relative flex flex-col items-center gap-1.5 bg-[#0a1628] py-4 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-white/[.06]">
      <Link href="/bugun" className="mb-2.5 grid h-[42px] w-[42px] place-items-center" aria-label="KonsRücü">
        <KonsRucuMark size={26} />
      </Link>

      <div className="flex w-full flex-1 flex-col items-center gap-1 py-1">
        {BOLUMLER.filter((b) => b.sayfalar.some((n) => navGorunur(n, rol))).map((n) => {
          const active = n.id === aktifId
          const Icon = n.icon
          const rozet = n.id === 'islerim' ? (counts?.onemli ?? 0) + (counts?.gorevler ?? 0) : 0
          const rozetTitle = `${counts?.onemli ?? 0} açık önemli olay · ${counts?.gorevler ?? 0} açık görev`
          return (
            <Link
              key={n.id}
              href={n.href}
              aria-label={n.label}
              aria-current={active ? 'page' : undefined}
              className={`group relative grid h-11 w-11 place-items-center rounded-[13px] transition ${
                active
                  ? 'bg-kr text-white shadow-[0_4px_14px_hsl(var(--kr)/0.45)]'
                  : 'text-white/50 hover:bg-white/10 hover:text-white'
              }`}
            >
              {active && (
                <span className="absolute -left-4 top-1/2 h-[22px] w-1 -translate-y-1/2 rounded-r bg-white" />
              )}
              <Icon className="h-5 w-5" />
              {rozet > 0 && (
                <span className="font-mono absolute -right-0.5 -top-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ring-2 ring-[#0a1628]" title={rozetTitle}>
                  {rozet > 9 ? '9+' : rozet}
                </span>
              )}
              <span className="pointer-events-none absolute left-14 top-1/2 z-40 -translate-y-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0a1628] opacity-0 shadow-pop transition group-hover:opacity-100">
                {n.label}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="font-display grid h-10 w-10 place-items-center rounded-full border border-white/[.14] bg-white/[.12] text-[13px] font-bold text-white">
          {userInit}
        </div>
      </div>
    </aside>
  )
}
