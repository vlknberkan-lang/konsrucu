'use client'

/**
 * KonsRücü — bağlam paneli (sidebar) · components/shell/sidebar.tsx
 * Akıllı Giriş yığını + Çalışma Alanı + Son Dosyalar + altta tenant switcher (→ /dashboard).
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UploadCloud, Files, ChevronsUpDown } from 'lucide-react'
import { RAIL_NAV, DURUM, type ShellTenant, type RecentCase } from '@/lib/konsrucu/nav'
import { KonsRucuWordmark } from '@/components/brand/konsrucu-mark'

function GLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono px-2.5 pb-1.5 pt-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
}

export function Sidebar({ tenant, recentCases }: { tenant: ShellTenant | null; recentCases: RecentCase[] }) {
  const pathname = usePathname()
  const onInbox = pathname.startsWith('/akilli-giris')
  const item = 'flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[13.5px] font-medium transition'
  const off = 'text-foreground hover:bg-surface-muted'
  const on = 'bg-kr/10 font-semibold text-kr'

  return (
    <nav className="hidden min-w-0 flex-col border-r border-border bg-surface md:flex">
      <div className="border-b border-border-subtle px-[18px] py-[18px]">
        <KonsRucuWordmark size={24} />
        <div className="font-mono mt-1.5 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Sigorta Rücu Otomasyonu</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <GLabel>Akıllı Giriş</GLabel>
        <Link href="/akilli-giris?yukle=1" className={`${item} ${off}`}>
          <UploadCloud className="h-[17px] w-[17px] text-muted-foreground" /> Yeni dosya yükle
        </Link>
        <Link href="/akilli-giris" className={`${item} ${onInbox ? on : off}`}>
          <Files className={`h-[17px] w-[17px] ${onInbox ? 'text-kr' : 'text-muted-foreground'}`} /> Dosyaları görüntüle
          {recentCases.length > 0 && (
            <span className="font-mono ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-kr px-1.5 text-[10px] font-semibold text-white">{recentCases.length}</span>
          )}
        </Link>

        <GLabel>Çalışma Alanı</GLabel>
        {RAIL_NAV.filter((n) => n.id !== 'inbox').map((n) => {
          const Icon = n.icon
          return (
            <Link key={n.id} href={n.ready ? n.href : '#'} className={`${item} ${off} ${!n.ready ? 'opacity-60' : ''}`}>
              <Icon className="h-[17px] w-[17px] text-muted-foreground" /> {n.label}
            </Link>
          )
        })}

        <GLabel>Son Dosyalar</GLabel>
        {recentCases.length === 0 && (
          <div className="px-2.5 py-2 text-[12px] text-muted-foreground">Henüz dosya yok.</div>
        )}
        {recentCases.map((c) => {
          const d = DURUM[c.durum]
          return (
            <Link key={c.hasarNo} href={`/akilli-giris/${c.hasarNo}`} className={`${item} ${off} gap-2.5`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${d.dot}`} />
              <span className="font-mono min-w-0 flex-1 truncate text-xs">{c.hasarNo}</span>
              {c.dusuk > 0 && <span className="font-mono text-[10px] text-warning">{c.dusuk}</span>}
            </Link>
          )
        })}
      </div>

      <div className="border-t border-border-subtle p-3">
        <Link href="/dashboard" className="flex w-full items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-muted p-2.5 text-left transition hover:border-kr/50">
          {tenant ? (
            <>
              <div className="font-display grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-kr to-[#0a1628] text-xs font-bold text-white">{tenant.init}</div>
              <div className="min-w-0 flex-1">
                <div className="font-display truncate text-[13.5px] font-bold tracking-[-0.01em]">{tenant.musteri}</div>
                <div className="font-mono truncate text-[9.5px] text-muted-foreground">{tenant.ofis}</div>
              </div>
              <ChevronsUpDown className="h-[15px] w-[15px] text-muted-foreground" />
            </>
          ) : (
            <>
              <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-surface text-muted-foreground"><ChevronsUpDown className="h-[15px] w-[15px]" /></div>
              <div className="min-w-0 flex-1 text-[13px] font-medium text-muted-foreground">Müşteri seç</div>
            </>
          )}
        </Link>
      </div>
    </nav>
  )
}
