'use client'

/**
 * KonsRücü — bağlam paneli (sidebar) · components/shell/sidebar.tsx
 * Etkin bölümün sayfaları (rail bölümü seçer, burası o bölümün içini gösterir) + altta şirket kartı;
 * tek aktif şirket varsa kart seçici değil, yalnız etikettir.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsUpDown, ShieldCheck, Zap } from 'lucide-react'
import { BOLUMLER, aktifNav, aktifBolum, navGorunur, type ShellTenant, type NavCounts } from '@/lib/konsrucu/nav'
import { KonsRucuWordmark } from '@/components/brand/konsrucu-mark'

function GLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono px-2.5 pb-1.5 pt-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
}

export function Sidebar({ tenant, counts, superadmin, rol }: { tenant: ShellTenant | null; counts?: NavCounts; superadmin?: boolean; rol?: string }) {
  const pathname = usePathname()
  const aktifId = aktifNav(pathname)?.id
  const bolum = aktifBolum(pathname)
  const yonetimAktif = pathname.startsWith('/yonetim') && !aktifId // Veri Onarımı kendi öğesinde yanar
  const item = 'flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[13.5px] font-medium transition'
  const off = 'text-foreground hover:bg-surface-muted'
  const on = 'bg-kr/10 font-semibold text-kr'

  return (
    <nav className="hidden min-w-0 flex-col border-r border-border bg-surface md:flex">
      <div className="border-b border-border-subtle px-[18px] py-[18px]">
        <KonsRucuWordmark size={24} />
        <div className="font-mono mt-1.5 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">Avukatın UYAP Asistanı</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <GLabel>{bolum?.label ?? 'Menü'}</GLabel>
        {(bolum ? bolum.sayfalar : BOLUMLER.map((b) => ({ ...b, ready: true }))).filter((n) => navGorunur(n, rol)).map((n) => {
          const Icon = n.icon
          const aktif = n.id === aktifId
          const rozet = n.id === 'onemli' ? counts?.onemli ?? 0 : n.id === 'gorevler' ? counts?.gorevler ?? 0 : 0
          return (
            <Link key={n.id} href={n.href} aria-current={aktif ? 'page' : undefined} className={`${item} ${aktif ? on : off} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50`}>
              <Icon className={`h-[17px] w-[17px] ${aktif ? 'text-kr' : 'text-muted-foreground'}`} />
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              {rozet > 0 && (
                <span className="font-mono ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[10.5px] font-bold text-white" title={n.id === 'gorevler' ? `${rozet} açık görev` : `${rozet} açık önemli olay`}>
                  {rozet > 99 ? '99+' : rozet}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div className="border-t border-border-subtle p-3">
        {superadmin && (
          <Link href="/yonetim" className={`${item} mb-1.5 ${yonetimAktif ? on : off}`}>
            <ShieldCheck className={`h-[17px] w-[17px] ${yonetimAktif ? 'text-kr' : 'text-muted-foreground'}`} />
            <span className="min-w-0 flex-1 truncate">Yönetim</span>
          </Link>
        )}
        {tenant?.kredi && (
          <Link
            href="/abonelik"
            className="mb-2 flex items-center gap-2 rounded-xl border border-kr/25 bg-kr/[0.07] px-2.5 py-2 transition hover:border-kr/50 hover:bg-kr/10"
            title={`${tenant.kredi.plan} planı — kalan AI kredisi · plan ve yükseltme için tıkla`}
          >
            <Zap className="h-[15px] w-[15px] shrink-0 text-kr" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">AI kredisi</span>
            <span className={`font-mono text-[13px] font-bold ${tenant.kredi.aiKredi <= 5 ? 'text-danger' : 'text-kr'}`}>
              {tenant.kredi.aiKredi}
            </span>
          </Link>
        )}
        {tenant?.tekSirket ? (
          <div className="flex w-full items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-muted p-2.5">
            <div className="font-display grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-kr to-[#0a1628] text-xs font-bold text-white">{tenant.init}</div>
            <div className="min-w-0 flex-1">
              <div className="font-display truncate text-[13.5px] font-bold tracking-[-0.01em]">{tenant.musteri}</div>
              <div className="font-mono truncate text-[9.5px] text-muted-foreground">{tenant.ofis}</div>
            </div>
          </div>
        ) : (
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
              <div className="min-w-0 flex-1 text-[13px] font-medium text-muted-foreground">Müvekkil seç</div>
            </>
          )}
        </Link>
        )}
      </div>
    </nav>
  )
}
