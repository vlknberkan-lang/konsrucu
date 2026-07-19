import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/shell/app-shell'
import { signOutAction } from '@/app/actions/auth'
import { superadminMi } from '@/lib/konsrucu/yonetici'

const ROL_ETIKET: Record<string, string> = {
  ADMIN: 'Yönetici',
  AVUKAT: 'Avukat',
  AVUKAT_YRD: 'Avukat Yrd.',
  GORUNTULEYEN: 'Görüntüleyen',
}

const initials = (ad: string) =>
  ad.split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase()

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  // 1) Oturum guard (middleware'e ek savunma derinliği)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2) Profil
  const dbUser = await prisma.kullanici.findUnique({
    where: { id: user.id },
    include: { musteriler: { include: { musteri: true } } },
  })

  // Auth var ama Kullanici kaydı yok → döngüye sokmadan net mesaj
  if (!dbUser) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background p-8 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl font-extrabold tracking-brand-tight text-foreground">
            Hesabınız henüz yetkilendirilmedi
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bu hesap bir kullanıcı kaydına bağlı değil. Lütfen ofis yöneticinizle iletişime geçin.
          </p>
          <form action={signOutAction} className="mt-6">
            <button className="rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm font-medium transition hover:border-kr/40">
              Çıkış yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // 3) Aktif müşteri (cookie ile seçili; yoksa ilk atanmış)
  const musteriler = dbUser.musteriler.map((m) => m.musteri).filter((m) => m.aktif)
  const aktifId = cookies().get('aktif_musteri')?.value
  const aktif = musteriler.find((m) => m.id === aktifId) ?? musteriler[0] ?? null

  const init = initials(dbUser.ad)

  // Sol menü rozetleri: aktif tenant'taki açık önemli olay (borca itiraz) + açık takip görevi sayısı.
  const [onemliSayi, gorevSayi] = aktif
    ? await Promise.all([
        prisma.onemliOlay.count({ where: { dosya: { musteriId: aktif.id }, durum: { in: ['ACIK', 'ISLEMDE'] } } }),
        prisma.takipGorevi.count({ where: { dosya: { musteriId: aktif.id }, durum: { in: ['ACIK', 'ISLEMDE'] } } }),
      ])
    : [0, 0]

  return (
    <AppShell
      user={{ ad: dbUser.ad, rol: ROL_ETIKET[dbUser.rol] ?? dbUser.rol, init }}
      tenant={aktif ? {
        musteri: aktif.ad,
        ofis: dbUser.ad,
        init: initials(aktif.ad),
        kredi: aktif.plan === 'KURUMSAL' ? null : { plan: aktif.plan, aiKredi: aktif.aiKredi },
      } : null}
      superadmin={superadminMi(dbUser.eposta)}
      navCounts={{ onemli: onemliSayi, gorevler: gorevSayi }}
    >
      {children}
    </AppShell>
  )
}
