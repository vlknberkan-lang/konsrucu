import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { KonsRucuWordmark } from '@/components/brand/konsrucu-mark'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { secMusteri } from './actions'

const ROL_ETIKET: Record<string, string> = {
  ADMIN: 'Yönetici',
  AVUKAT: 'Avukat',
  AVUKAT_YRD: 'Avukat Yrd.',
  GORUNTULEYEN: 'Görüntüleyen',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Auth kullanıcısı → DB profili (Kullanici.id = auth uid) + atanmış müşteriler (izolasyon).
  const dbUser = await prisma.kullanici.findUnique({
    where: { id: user.id },
    include: { musteriler: { include: { musteri: true } } },
  })

  const musteriler = dbUser?.musteriler.map((m) => m.musteri).filter((m) => m.aktif) ?? []

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-8 py-4">
        <KonsRucuWordmark size={22} />
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">{dbUser?.ad ?? user.email}</div>
            <div className="font-mono text-[10px] uppercase tracking-label text-muted-foreground">
              {ROL_ETIKET[dbUser?.rol ?? ''] ?? '—'}
            </div>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-12">
        <div className="font-mono text-[11px] uppercase tracking-label text-kr-ink">Müşteri Seçimi</div>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-brand-tight text-foreground">
          Hangi müşteriyle çalışacaksınız?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Yalnızca size atanmış sigortacıların dosyalarını görürsünüz.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {musteriler.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Henüz size atanmış müşteri yok.
            </div>
          )}
          {musteriler.map((m) => (
            <form key={m.id} action={secMusteri}>
              <input type="hidden" name="musteriId" value={m.id} />
              <button
                type="submit"
                className="group flex w-full flex-col items-start rounded-xl border border-border bg-card p-6 text-left shadow-card transition hover:border-kr/40 hover:shadow-pop"
              >
                <div className="grid h-11 w-11 place-items-center rounded-[10px] bg-kr/10 font-display text-lg font-extrabold text-kr">
                  {m.ad.slice(0, 1)}
                </div>
                <div className="mt-4 font-display text-lg font-extrabold tracking-brand-tight text-foreground">
                  {m.ad}
                </div>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-label text-muted-foreground">
                  Rücu havuzu →
                </div>
              </button>
            </form>
          ))}
        </div>
      </main>
    </div>
  )
}
