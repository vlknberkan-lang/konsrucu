'use client'

/**
 * KonsRücü — sol modül rail'i · components/shell/rail.tsx
 * Midnight zemin · "K" markı (teal nokta) · 4 destinasyon (şimdilik yalnız Akıllı Giriş aktif).
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { RAIL_NAV } from '@/lib/konsrucu/nav'
import { KonsRucuMark } from '@/components/brand/konsrucu-mark'

export function Rail({ userInit }: { userInit: string }) {
  const pathname = usePathname()
  return (
    <aside className="relative flex flex-col items-center gap-1.5 bg-[#0a1628] py-4 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-white/[.06]">
      <Link href="/akilli-giris" className="mb-2.5 grid h-[42px] w-[42px] place-items-center" aria-label="KonsRücü">
        <KonsRucuMark size={26} />
      </Link>

      <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
        {RAIL_NAV.map((n) => {
          const active = pathname.startsWith(n.href)
          const Icon = n.icon
          return (
            <Link
              key={n.id}
              href={n.ready ? n.href : '#'}
              aria-disabled={!n.ready}
              className={`group relative grid h-11 w-11 place-items-center rounded-[13px] transition ${
                active
                  ? 'bg-kr text-white shadow-[0_4px_14px_hsl(var(--kr)/0.45)]'
                  : 'text-white/50 hover:bg-white/10 hover:text-white'
              } ${!n.ready ? 'opacity-50' : ''}`}
            >
              {active && (
                <span className="absolute -left-4 top-1/2 h-[22px] w-1 -translate-y-1/2 rounded-r bg-white" />
              )}
              <Icon className="h-5 w-5" />
              <span className="pointer-events-none absolute left-14 top-1/2 z-40 -translate-y-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0a1628] opacity-0 shadow-pop transition group-hover:opacity-100">
                {n.label}{!n.ready && ' · yakında'}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button className="group relative grid h-11 w-11 place-items-center rounded-[13px] text-white/50 transition hover:bg-white/10 hover:text-white">
          <LifeBuoy className="h-5 w-5" />
          <span className="pointer-events-none absolute left-14 top-1/2 z-40 -translate-y-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0a1628] opacity-0 shadow-pop transition group-hover:opacity-100">Yardım</span>
        </button>
        <div className="font-display grid h-10 w-10 place-items-center rounded-full border border-white/[.14] bg-white/[.12] text-[13px] font-bold text-white">
          {userInit}
        </div>
      </div>
    </aside>
  )
}
