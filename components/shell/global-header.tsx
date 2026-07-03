'use client'

/**
 * KonsRücü — global header · components/shell/global-header.tsx
 * Breadcrumb · GERÇEK arama (⌘K komut paleti) · tema (next-themes) · bildirim (açık iş rozeti,
 * Bugün panosuna gider — eski sabit-kırmızı süs nokta kaldırıldı) · çıkış · kullanıcı.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Sun, Moon, Bell, LogOut, ChevronDown } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'
import type { ShellUser, NavCounts } from '@/lib/konsrucu/nav'
import { KomutPaleti } from './komut-paleti'

export function GlobalHeader({ crumb = 'Gelen Kutusu', user, counts }: { crumb?: string; user: ShellUser; counts?: NavCounts }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const acikIs = (counts?.onemli ?? 0) + (counts?.gorevler ?? 0)

  return (
    <header className="flex flex-shrink-0 items-center gap-4 border-b border-border bg-surface/80 px-7 py-3.5 backdrop-blur-md">
      <div className="font-mono flex items-center gap-2 text-[11px] tracking-[0.04em] text-muted-foreground">
        <span>KONSRÜCÜ</span><span>›</span><b className="font-semibold text-foreground">{crumb}</b>
      </div>

      <KomutPaleti />

      {/* tema */}
      <div className="inline-flex rounded-full border border-border bg-surface-muted p-[3px]">
        {(['light', 'dark'] as const).map((t) => {
          const active = mounted && theme === t
          return (
            <button key={t} type="button" onClick={() => setTheme(t)} aria-label={t === 'light' ? 'Açık tema' : 'Koyu tema'}
              className={`grid h-[30px] w-[30px] place-items-center rounded-full ${active ? 'bg-surface text-kr shadow-card' : 'text-muted-foreground'}`}>
              {t === 'light' ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
            </button>
          )
        })}
      </div>

      {/* bildirim: açık önemli olay + görev toplamı → Bugün panosu (nokta yalnız açık iş VARSA yanar) */}
      <Link
        href="/bugun"
        aria-label={acikIs > 0 ? `${acikIs} açık iş — Bugün panosunu aç` : 'Bugün panosunu aç'}
        title={acikIs > 0 ? `${acikIs} açık iş (önemli olay + görev)` : 'Bugün panosu'}
        className="relative grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-border bg-surface text-muted-foreground transition hover:border-kr/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
      >
        <Bell className="h-[18px] w-[18px]" />
        {acikIs > 0 && (
          <span className="font-mono absolute -right-1.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full border-2 border-surface bg-danger px-0.5 text-[9px] font-bold leading-none text-white">
            {acikIs > 99 ? '99+' : acikIs}
          </span>
        )}
      </Link>

      {/* çıkış — server action (cookie sunucuda kesin silinir) */}
      <form action={signOutAction}>
        <button type="submit" title="Çıkış yap" className="grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-border bg-surface text-muted-foreground transition hover:border-kr/40 hover:text-foreground">
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </form>

      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface py-[5px] pl-[5px] pr-2.5">
        <div className="font-display grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-gradient-to-br from-kr to-[#0a1628] text-xs font-bold text-white">{user.init}</div>
        <div className="text-left">
          <div className="text-[12.5px] font-semibold leading-tight">{user.ad}</div>
          <div className="font-mono text-[9px] text-muted-foreground">{user.rol}</div>
        </div>
        <ChevronDown className="h-[15px] w-[15px] text-muted-foreground" />
      </div>
    </header>
  )
}
