/**
 * KonsRücü — BUGÜN panosu · app/(app)/bugun/page.tsx
 * Sabah kokpiti: güne başlarken 5 ekran gezmek yerine tek bakış —
 * bugün/yarın etkinlikler · süresi geçen-bugün dolan görevler · açık önemli olaylar ·
 * geciken taksitler · zamanaşımı radarı (≤30g / GEÇMİŞ / boş) · sonuçlandırılmamış toplantılar.
 * Yeni model yok; mevcut sayfaların sorgularının birleşimi. Tenant-kapsamlı, auth zorunlu.
 */
import Link from 'next/link'
import { CalendarDays, ListTodo, AlertTriangle, CreditCard, Hourglass, ArrowRight, CheckCircle2, Sunrise } from 'lucide-react'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/konsrucu/ui'
import { tarihTR, saatTR, kalanGun, bugunIstBasi, paraTR } from '@/lib/konsrucu/format'
import { dosyaAktif } from '@/lib/konsrucu/aktiflik'

export const dynamic = 'force-dynamic'

const GUN_MS = 86_400_000
const TAKIP_ONCESI = ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'] as const

export default async function BugunPage() {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1200px] px-7 py-6">
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Üst menüden bir müşteri (tenant) seçin.</p>
        </div>
      </div>
    )
  }

  const simdi = new Date()
  const bas = bugunIstBasi(simdi)
  const yarinSon = new Date(bas.getTime() + 2 * GUN_MS)
  const zaSon = new Date(bas.getTime() + 30 * GUN_MS)
  const zaSelect = { id: true, hukukDosyaNo: true, hasarDosyaNo: true, zamanasimi: true, durum: true, uyapDurum: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' as const } } }
  // uyapKapaliMi'nin (regex /kapa(l|n)/i) SQL karşılığı — SAYILAR count'tan gelsin diye (take tavanlı
  // liste + JS süzgeci sayıyı yanlış gösterirdi); listeler yine dosyaAktif ile süzülür.
  const uyapAcikWhere = {
    NOT: [
      { uyapDurum: { contains: 'kapal', mode: 'insensitive' as const } },
      { uyapDurum: { contains: 'kapan', mode: 'insensitive' as const } },
    ],
  }
  const ZA_LISTE = 30 // kartta gösterilecek azami satır; kalanı SAYIYLA belirtilir

  const [etkinlikler, gorevler, acikGorevToplam, onemliler, taksitler, zaYakinHam, zaGectiHam, zaYakinSayi, zaGectiSayi, zaBos, sonuclanmamis, uyapSorunlu] = await Promise.all([
    // bugün + yarın etkinlikler (iptaller hariç)
    prisma.etkinlik.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, baslar: { gte: bas, lt: yarinSon }, durum: { not: 'IPTAL' } },
      orderBy: { baslar: 'asc' },
      take: 30,
      include: { dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } },
    }),
    // süresi geçen ya da bugün/yarın dolan açık görevler
    prisma.takipGorevi.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, durum: { in: ['ACIK', 'ISLEMDE'] }, sonTarih: { not: null, lt: new Date(bas.getTime() + 2 * GUN_MS) } },
      orderBy: { sonTarih: 'asc' },
      take: 20,
      include: { sorumlu: { select: { ad: true } }, dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true } } },
    }),
    prisma.takipGorevi.count({ where: { dosya: { musteriId: aktifMusteriId }, durum: { in: ['ACIK', 'ISLEMDE'] } } }),
    // açık önemli olaylar (borca itiraz kuyruğu) — son tarihi yakın/boş olanlar öne
    prisma.onemliOlay.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, durum: { in: ['ACIK', 'ISLEMDE'] } },
      orderBy: [{ sonTarih: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      take: 12,
      include: { dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } },
    }),
    // geciken taksitler (aktif planlar)
    prisma.taksit.findMany({
      where: { durum: { in: ['BEKLIYOR', 'KISMI', 'GECIKTI'] }, vadeTarihi: { lt: bas }, plan: { durum: 'AKTIF', dosya: { musteriId: aktifMusteriId } } },
      orderBy: { vadeTarihi: 'asc' },
      take: 12,
      include: { plan: { select: { dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } } } },
    }),
    // zamanaşımı radarı — yalnız takibi açılmamış açık dosyalar (takip açılınca kesilir)
    prisma.rucuDosyasi.findMany({ where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { gte: bas, lt: zaSon }, ...uyapAcikWhere }, orderBy: { zamanasimi: 'asc' }, take: ZA_LISTE, select: zaSelect }),
    prisma.rucuDosyasi.findMany({ where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { lt: bas }, ...uyapAcikWhere }, orderBy: { zamanasimi: 'asc' }, take: ZA_LISTE, select: zaSelect }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { gte: bas, lt: zaSon }, ...uyapAcikWhere } }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: { lt: bas }, ...uyapAcikWhere } }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { in: [...TAKIP_ONCESI] }, zamanasimi: null } }),
    // geçmişte kalmış ama sonuçlandırılmamış toplantılar (takvim kapanış disiplini)
    prisma.etkinlik.count({ where: { dosya: { musteriId: aktifMusteriId }, baslar: { lt: bas }, durum: 'PLANLANDI' } }),
    // UYAP eşleşme sorunu: eklenti v1 "bulamadım/belirsiz" raporu bırakan açık dosyalar (kör nokta radarı)
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { notIn: ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] }, uyapEslesme: { not: null, notIn: ['OK'] } } }),
  ])

  const zaYakin = zaYakinHam.filter(dosyaAktif)
  const zaGecti = zaGectiHam.filter(dosyaAktif)
  const ad = dbUser.ad.split(/\s+/)[0]

  const bugunkuler = etkinlikler.filter((e) => e.baslar.getTime() < bas.getTime() + GUN_MS)
  const yarinkiler = etkinlikler.filter((e) => e.baslar.getTime() >= bas.getTime() + GUN_MS)

  return (
    <div className="mx-auto max-w-[1200px] px-7 py-6">
      <div className="mb-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Bugün · Sabah Kokpiti</div>
        <h1 className="font-display mt-1.5 flex items-center gap-2.5 text-[30px] font-extrabold tracking-[-0.035em]">
          <Sunrise className="h-7 w-7 text-kr" /> Günaydın {ad}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {tarihTR(simdi, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })} · gözden kaçmaması gereken her şey tek ekranda.
        </p>
      </div>

      {/* ⛔ kırmızı şerit: kaçmış/kaçmak üzere olan süreler + UYAP kör noktası (sayılar count'tan) */}
      {(zaGectiSayi > 0 || zaBos > 0 || uyapSorunlu > 0) && (
        <div className="mb-4 rounded-2xl border border-danger/40 bg-danger-soft/40 px-5 py-4">
          <div className="flex items-center gap-2 text-[14px] font-bold text-danger">
            <AlertTriangle className="h-[18px] w-[18px]" /> Radar alarmı
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-foreground">
            {zaGectiSayi > 0 && (
              <Link href="/atanan-dosyalar?za=gecti" className="font-semibold text-danger hover:underline">
                {zaGectiSayi} dosyada zamanaşımı GEÇMİŞ (takip açılmamış) →
              </Link>
            )}
            {zaBos > 0 && (
              <Link href="/atanan-dosyalar?za=bos" className="text-muted-foreground hover:text-foreground hover:underline">
                {zaBos} açık dosyada zamanaşımı tarihi boş (radar dışı) →
              </Link>
            )}
            {uyapSorunlu > 0 && (
              <Link href="/atanan-dosyalar?uyap=sorunlu" className="font-semibold text-danger hover:underline">
                {uyapSorunlu} dosya UYAP'ta bulunamadı/belirsiz (eklenti raporu) →
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bugün & yarın etkinlikler */}
        <Kart baslik={`Bugün ${bugunkuler.length} · yarın ${yarinkiler.length} etkinlik`} Icon={CalendarDays} href="/takvim" linkEtiket="Takvim">
          {etkinlikler.length === 0 ? (
            <Bos metin="Bugün ve yarın için etkinlik yok." />
          ) : (
            etkinlikler.map((e) => (
              <Satir key={e.id} href={`/akilli-giris/${e.dosya.id}`}>
                <span className="font-mono w-[86px] shrink-0 text-[12px] font-bold text-kr-ink">
                  {e.baslar.getTime() >= bas.getTime() + GUN_MS ? 'yarın ' : ''}{saatTR(e.baslar)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{e.dosya.borclular[0]?.adUnvan ?? e.baslik}</span>
                <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{e.dosya.hukukDosyaNo ?? e.dosya.hasarDosyaNo ?? ''}</span>
              </Satir>
            ))
          )}
          {sonuclanmamis > 0 && (
            <Link href="/takvim" className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-warning transition hover:bg-warning-soft/40">
              <CheckCircle2 className="h-3.5 w-3.5" /> {sonuclanmamis} geçmiş toplantı sonuçlandırılmadı — ne olduğunu işleyin →
            </Link>
          )}
        </Kart>

        {/* Görevler */}
        <Kart baslik={`Süresi gelen görevler · ${gorevler.length}`} Icon={ListTodo} href="/gorevler" linkEtiket={`Tüm açık görevler (${acikGorevToplam})`}>
          {gorevler.length === 0 ? (
            <Bos metin="Süresi geçen ya da bugün dolan görev yok." />
          ) : (
            gorevler.map((g) => {
              const kg = g.sonTarih ? kalanGun(g.sonTarih, simdi) : null
              return (
                <Satir key={g.id} href={`/akilli-giris/${g.dosya.id}`}>
                  <Badge tone={kg != null && kg < 0 ? 'danger' : 'warning'} dot>
                    <span className="font-mono text-[10.5px]">{kg != null ? (kg < 0 ? `${-kg}g gecikti` : kg === 0 ? 'bugün' : 'yarın') : '—'}</span>
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{g.baslik}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{g.sorumlu?.ad?.split(/\s+/)[0] ?? '—'}</span>
                </Satir>
              )
            })
          )}
        </Kart>

        {/* Önemli olaylar */}
        <Kart baslik={`Açık önemli olaylar · ${onemliler.length}`} Icon={AlertTriangle} href="/onemli-olaylar" linkEtiket="Önemli Olaylar">
          {onemliler.length === 0 ? (
            <Bos metin="Açık önemli olay yok — kuyruk temiz." />
          ) : (
            onemliler.map((o) => {
              const kg = o.sonTarih ? kalanGun(o.sonTarih, simdi) : null
              return (
                <Satir key={o.id} href={`/akilli-giris/${o.dosya.id}`}>
                  <Badge tone={kg == null ? 'warning' : kg < 0 ? 'danger' : kg <= 7 ? 'danger' : 'warning'} dot>
                    <span className="font-mono text-[10.5px]">{kg == null ? 'süre boş!' : kg < 0 ? `${-kg}g geçti` : `${kg}g`}</span>
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{o.dosya.borclular[0]?.adUnvan ?? o.baslik}</span>
                  <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{o.dosya.hukukDosyaNo ?? o.dosya.hasarDosyaNo ?? ''}</span>
                </Satir>
              )
            })
          )}
        </Kart>

        {/* Geciken taksitler */}
        <Kart baslik={`Geciken taksitler · ${taksitler.length}`} Icon={CreditCard} href="/taksitler" linkEtiket="Taksitler">
          {taksitler.length === 0 ? (
            <Bos metin="Geciken taksit yok." />
          ) : (
            taksitler.map((t) => {
              const d = t.plan.dosya
              return (
                <Satir key={t.id} href={`/akilli-giris/${d.id}`}>
                  <Badge tone="danger" dot><span className="font-mono text-[10.5px]">{kalanGun(t.vadeTarihi, simdi) * -1}g</span></Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{d.borclular[0]?.adUnvan ?? d.hukukDosyaNo ?? '—'}</span>
                  <span className="font-mono shrink-0 text-[12px] font-bold">{paraTR(Number(t.tutar))}</span>
                </Satir>
              )
            })
          )}
        </Kart>

        {/* Zamanaşımı ≤30 gün */}
        <Kart baslik={`Zamanaşımı ≤ 30 gün · ${zaYakinSayi}`} Icon={Hourglass} href="/atanan-dosyalar?za=yakin&sort=zamanasimi" linkEtiket="Radar listesi" genis>
          {zaYakin.length === 0 ? (
            <Bos metin="Önümüzdeki 30 günde dolan zamanaşımı yok (takibi açılmamış dosyalarda)." />
          ) : (
            <>
              {zaYakin.map((d) => (
                <Satir key={d.id} href={`/akilli-giris/${d.id}`}>
                  <Badge tone="danger" dot><span className="font-mono text-[10.5px]">{kalanGun(d.zamanasimi!, simdi)}g</span></Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{d.borclular[0]?.adUnvan ?? d.hukukDosyaNo ?? '—'}</span>
                  <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{d.hukukDosyaNo ?? d.hasarDosyaNo ?? ''} · {tarihTR(d.zamanasimi)}</span>
                </Satir>
              ))}
              {zaYakinSayi > zaYakin.length && (
                <Link href="/atanan-dosyalar?za=yakin&sort=zamanasimi" className="px-2 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline">
                  … ve {zaYakinSayi - zaYakin.length} dosya daha — tam liste →
                </Link>
              )}
            </>
          )}
        </Kart>
      </div>
    </div>
  )
}

function Kart({ baslik, Icon, href, linkEtiket, genis, children }: { baslik: string; Icon: React.ComponentType<{ className?: string }>; href: string; linkEtiket: string; genis?: boolean; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-card ${genis ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Icon className="h-4 w-4 text-kr" />
        <h2 className="font-display text-[14px] font-bold">{baslik}</h2>
        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-kr-ink transition hover:underline">
          {linkEtiket} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="flex flex-col p-2">{children}</div>
    </section>
  )
}

function Satir({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
      {children}
    </Link>
  )
}

function Bos({ metin }: { metin: string }) {
  return <div className="px-2 py-4 text-center text-[12.5px] text-muted-foreground">{metin}</div>
}
