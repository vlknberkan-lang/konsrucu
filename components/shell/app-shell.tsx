/**
 * KonsRücü — uygulama kabuğu · components/shell/app-shell.tsx
 * rail (72px) + bağlam paneli (272px, md+) + main (header + kayan içerik).
 * Veri (user/tenant/recentCases) server layout'tan prop gelir.
 */
import { Rail } from './rail'
import { Sidebar } from './sidebar'
import { GlobalHeader } from './global-header'
import type { ShellUser, ShellTenant, NavCounts } from '@/lib/konsrucu/nav'

export function AppShell({
  children,
  crumb,
  user,
  tenant,
  navCounts,
}: {
  children: React.ReactNode
  crumb?: string
  user: ShellUser
  tenant: ShellTenant | null
  navCounts?: NavCounts
}) {
  return (
    <div className="grid h-screen grid-cols-[72px_1fr] overflow-hidden md:grid-cols-[72px_272px_1fr]">
      <Rail userInit={user.init} counts={navCounts} />
      <Sidebar tenant={tenant} counts={navCounts} />
      <main className="flex min-h-0 min-w-0 flex-col bg-background">
        <GlobalHeader crumb={crumb} user={user} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
