/**
 * KonsRücü — Dosya Yol Haritası · app/(app)/dosya/[id]/page.tsx
 * Tasarım: rucu-hukuk-asistani/docs/06-ana-senaryo-tasarimi.md §2 (satır 105–175) — künye → Şimdi kartı → Sonra
 * → 8 durak → panel çubuğu. Yalnız seçili durağın verisi yüklenir (`?durak`); eski ekran (`/akilli-giris/[id]`)
 * "Ayrıntılı görünüm (eski)" bağlantısıyla açılır, silinmez.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { FileText, Plug, Timer, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { DosyaYolHaritasi } from '@/components/dosya/yol-haritasi/yol-haritasi'
import { EYLEM_CAPA } from '@/components/dosya/yol-haritasi/eylem'
import { yolHaritasiYukle } from '@/lib/konsrucu/yol-haritasi/yukle'
import type { DurakNo, EylemHedef } from '@/lib/konsrucu/yol-haritasi/tipler'
import type { YolHaritasiGorunum } from '@/lib/konsrucu/yol-haritasi/gorunum'
import { DurakPaneli } from '@/components/dosya/durak-paneli'
import { oneriPaneliYukle } from '@/lib/konsrucu/oneri/yukle'
import { olayPaneliYukle } from '@/lib/konsrucu/eksen/yukle'
import { arabuluculukPaneli } from '@/lib/konsrucu/arabuluculuk/veri'
import { davaPaneli } from '@/lib/konsrucu/dava/veri'
import { dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { dilekceV2Ozeti } from '@/lib/konsrucu/dilekce-v2/kart-veri'

/** Eylem çapası (EYLEM_CAPA değeri, "yh-" öneki hariç) → durağı ("Bağla" aşaması; 06 §2). */
const CAPA_DURAK: Record<string, DurakNo> = {
  'yh-bulduklarimiz': 1, 'yh-eksik-evrak': 1, 'yh-rucu-sebebi': 1, 'yh-evrak': 1,
  'yh-hazirlik': 2, 'yh-idari-yol': 2, 'yh-takip': 2,
  'yh-uyap': 3,
  'yh-teblig-itiraz': 4, 'yh-onaylar': 4,
  'yh-arabuluculuk': 5, 'yh-yol-secimi': 5, 'yh-muvekkil-onayi': 5,
  'yh-dava': 6, 'yh-dilekce': 6,
  'yh-yargilama': 7, 'yh-sureler': 7,
  'yh-sonuc': 8, 'yh-taksit': 8,
}

/** `?durak` yoksa: görünümdeki SIMDI durağı, yoksa DEVAM eden, yoksa 1. */
function seciliDuraktanCoz(gorunum: YolHaritasiGorunum, durakParam: string | undefined): DurakNo {
  const n = Number(durakParam)
  if (Number.isInteger(n) && n >= 1 && n <= 8) return n as DurakNo
  const simdi = gorunum.duraklar.find((d) => d.durum === 'SIMDI')
  if (simdi) return simdi.no
  const devam = gorunum.duraklar.find((d) => d.durum === 'DEVAM')
  if (devam) return devam.no
  return 1
}

export default async function DosyaYolHaritasiSayfasi({ params, searchParams }: {
  params: { id: string }
  searchParams: { durak?: string; prova?: string; panel?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { musteriId: { in: izinli }, OR: [{ id: params.id }, { hasarDosyaNo: params.id }, { hukukDosyaNo: params.id }, { id: { startsWith: params.id } }] },
    select: { id: true, musteriId: true, icraDosyaNo: true, icraDairesi: true },
  })
  if (!dosya) notFound()

  // yol haritası hesaplanamazsa dosya kaybolmasın: ayrıntılı (eski) görünüme düş
  const gorunum = await yolHaritasiYukle({ dosyaId: dosya.id, musteriId: dosya.musteriId, prova: searchParams.prova ?? null }).catch(() => null)
  if (!gorunum) redirect(`/akilli-giris/${dosya.id}`)

  const seciliDurak = seciliDuraktanCoz(gorunum, searchParams.durak)
  const avukatRol = dbUser.rol === 'ADMIN' || dbUser.rol === 'AVUKAT'
  const yazabilirRol = dbUser.rol !== 'GORUNTULEYEN'

  const needsOneri = seciliDurak === 1 || seciliDurak === 2
  const needsOlay = seciliDurak === 4
  const needsArab = seciliDurak === 5
  const needsDava = seciliDurak === 6 || seciliDurak === 7 || seciliDurak === 8
  const needsDilekce = (seciliDurak === 6 || seciliDurak === 7) && dilekceV2Acik(dbUser.rol)

  const [oneriPanel, olayPanel, arabPanel, davaPanel, dilekceKartlar] = await Promise.all([
    needsOneri ? oneriPaneliYukle(dosya.id).catch(() => null) : Promise.resolve(null),
    needsOlay ? olayPaneliYukle(dosya.id, dosya.musteriId).catch(() => null) : Promise.resolve(null),
    needsArab ? arabuluculukPaneli(dosya.id, dosya.musteriId, dbUser).catch(() => null) : Promise.resolve(null),
    needsDava ? davaPaneli(dosya.id, dosya.musteriId, dbUser).catch(() => null) : Promise.resolve(null),
    needsDilekce ? dilekceV2Ozeti(prisma, dosya.musteriId, dosya.id).catch(() => null) : Promise.resolve(null),
  ])

  const eskiGorunumHref = `/akilli-giris/${dosya.id}`
  const provaQS = searchParams.prova ? `&prova=${encodeURIComponent(searchParams.prova)}` : ''
  const durakHref = (no: number) => `/dosya/${dosya.id}?durak=${no}${provaQS}`
  const capaHedef = (capa: string) => (capa === 'yh-onarim' ? '/yonetim/veri-onarim' : `/dosya/${dosya.id}?durak=${CAPA_DURAK[capa] ?? seciliDurak}${provaQS}#${capa}`)
  const eylemHrefleri = Object.fromEntries(Object.entries(EYLEM_CAPA).map(([hedef, capa]) => [hedef, capaHedef(capa)])) as Partial<Record<EylemHedef, string>>

  return (
    <div className="mx-auto max-w-[1024px] px-6 pb-16 pt-5">
      <DosyaYolHaritasi
        gorunum={gorunum}
        kullaniciRol={dbUser.rol}
        eylemHrefleri={eylemHrefleri}
        eskiGorunumHref={eskiGorunumHref}
        durakHref={durakHref}
        seciliDurak={seciliDurak}
      />

      <DurakPaneli
        durak={seciliDurak}
        dosyaId={dosya.id}
        icraDosyaNo={dosya.icraDosyaNo}
        icraDairesi={dosya.icraDairesi}
        yazabilirRol={yazabilirRol}
        avukatRol={avukatRol}
        eskiGorunumHref={eskiGorunumHref}
        oneriPanel={oneriPanel}
        olayPanel={olayPanel}
        arabPanel={arabPanel}
        davaPanel={davaPanel}
        dilekceKartlar={dilekceKartlar}
      />

      <nav aria-label="Paneller" className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-surface px-5 py-3 text-[12.5px]">
        <Link href={`/akilli-giris/${dosya.id}?belge=hasar`} className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground transition hover:text-kr">
          <FileText className="h-3.5 w-3.5" aria-hidden />Evrak
        </Link>
        <Link href={`/akilli-giris/${dosya.id}?belge=uyap`} className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground transition hover:text-kr">
          <Plug className="h-3.5 w-3.5" aria-hidden />UYAP evrakı
        </Link>
        <Link href={`/dosya/${dosya.id}?durak=7#yh-sureler`} className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground transition hover:text-kr">
          <Timer className="h-3.5 w-3.5" aria-hidden />Süreler
        </Link>
        <Link href={`/akilli-giris/${dosya.id}`} className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground transition hover:text-kr">
          <History className="h-3.5 w-3.5" aria-hidden />Geçmiş
        </Link>
      </nav>
    </div>
  )
}
