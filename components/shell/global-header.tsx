'use client'

/**
 * KonsRücü — global header · components/shell/global-header.tsx
 * Breadcrumb · arama · tema (next-themes) · bildirim · çıkış (server action) · kullanıcı.
 */
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Search, Sun, Moon, Bell, LogOut, ChevronDown } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'
import type { ShellUser } from '@/lib/konsrucu/nav'

export function GlobalHeader({ crumb = 'Gelen Kutusu', user }: { crumb?: string; user: ShellUser }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header className="flex flex-shrink-0 items-center gap-4 border-b border-border bg-surface/80 px-7 py-3.5 backdrop-blur-md">
      <div className="font-mono flex items-center gap-2 text-[11px] tracking-[0.04em] text-muted-foreground">
        <span>KONSRÜCÜ</span><span>›</span><b className="font-semibold text-foreground">{crumb}</b>
      </div>

      <div className="ml-auto flex w-[min(420px,32vw)] items-center gap-2.5 truncate rounded-[11px] border border-border bg-surface-muted px-3.5 py-2.5 text-[13px] text-muted-foreground transition hover:border-kr/40">
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Hasar no, plaka, çıkarılan metin ara…</span>
        <span className="font-mono ml-auto rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px]">⌘K</span>
      </div>

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

      <button className="relative grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-border bg-surface text-muted-foreground transition hover:border-kr/40 hover:text-foreground">
        <Bell className="h-[18px] w-[18px]" />
        <span className="absolute right-2.5 top-2 h-[7px] w-[7px] rounded-full border-2 border-surface bg-danger" />
      </button>

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
