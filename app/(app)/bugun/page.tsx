/**
 * KonsRücü — BUGÜN MASASI · app/(app)/bugun/page.tsx
 *
 * S30: bütün dosyaların Şimdi kartları tek listede, 06 §8.2 öncelik merdiveniyle (en üstte veri engeli ve süre riski).
 * Kart RucuDosyasi.yolHaritasiJson önbelleğinden okunur; süre riski (GN-04 onaysız süre, GN-05 onaylı süre) önbellek eski
 * olsa bile Sure tablosundan gelir. Süzgeçler adresten (?suzgec=): Benim işlerim · Herkes · Onaysız süre · UYAP bağlı değil.
 * Altında sabah radarı korunur: bugün/yarın etkinlikler, görevler, önemli olaylar, geciken taksitler, zamanaşımı.
 *
 * S25: tek dolu düğme (listenin ilk satırındaki Şimdi eylemi), diğerleri çerçeveli ya da bağlantı; her boş liste
 * bir cümle ve bir eylem; renk yalnız anlam taşır ve yazıyla da söylenir. Tenant-kapsamlı, auth zorunlu.
 * Mantık saf fonksiyonlarda: lib/konsrucu/rapor-mail.ts (masaTablosu, masaSuz, masaSayac).
 */
import Link from 'next/link'
import { CalendarDays, ListTodo, AlertTriangle, CreditCard, Hourglass, ArrowRight, CheckCircle2, Scale } from 'lucide-react'
import type { DosyaDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { Badge, PageHeader, type Tone } from '@/components/konsrucu/ui'
import { tarihTR, saatTR, kalanGun, bugunIstBasi, paraTR } from '@/lib/konsrucu/format'
import { zamanasimiRadarinda, ZAMANASIMI_RADARI, OTOMASYON_DISI, HATIRLATMA_DISI } from '@/lib/konsrucu/aktiflik'
import { dosyaHref } from '@/lib/konsrucu/nav'
import {
  masaTablosu, masaSuz, masaSayac, masaSuzgecOku, MASA_SUZGECLERI, MASA_ROL_ETIKET,
  type MasaSatir, type MasaSuzgec,
} from '@/lib/konsrucu/rapor-mail'

export const dynamic = 'force-dynamic'

const GUN_MS = 86_400_000
const MASA_GOSTER = 60 // listede gösterilecek azami satır; kalanı SAYIYLA söylenir (sessiz kırpma yok)
const KAPALI: DosyaDurum[] = [...HATIRLATMA_DISI]
// Zamanaşımı radarının durum kümesi tek kaynaktan (takip öncesi + İDARİ_YOL; S06, B12): lib/konsrucu/aktiflik

const BTN_BIRINCIL =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-kr px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kr/30'
const BTN_IKINCIL =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition hover:border-kr/40 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kr/30'

export default async function BugunPage({ searchParams }: { searchParams?: { [k: string]: string | string[] | undefined } }) {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1200px] px-7 py-6">
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müvekkil seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Sol alttaki müvekkil kutusundan bir müvekkil seçin.</p>
          <Link href="/dashboard" className={`${BTN_IKINCIL} mt-4`}>Müvekkil seç</Link>
        </div>
      </div>
    )
  }

  const suzgec = masaSuzgecOku(searchParams?.suzgec)
  const simdi = new Date()
  const bas = bugunIstBasi(simdi)
  const yarinSon = new Date(bas.getTime() + 2 * GUN_MS)
  const zaSon = new Date(bas.getTime() + 30 * GUN_MS)
  const zaSelect = { id: true, hukukDosyaNo: true, hasarDosyaNo: true, zamanasimi: true, durum: true, uyapDurum: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' as const } } }
  // uyapKapaliMi'nin (regex /kapa(l|n)/i) SQL karşılığı — SAYILAR count'tan gelsin diye (take tavanlı
  // liste + JS süzgeci sayıyı yanlış gösterirdi); listeler yine zamanasimiRadarinda ile süzülür.
  const uyapAcikWhere = {
    NOT: [
      { uyapDurum: { contains: 'kapal', mode: 'insensitive' as const } },
      { uyapDurum: { contains: 'kapan', mode: 'insensitive' as const } },
    ],
  }
  const ZA_LISTE = 30 // kartta gösterilecek azami satır; kalanı SAYIYLA belirtilir

  const [
    masaDosyalari, masaSureleri, masaDavalari, adayOlaySayi, adayDavaIslemSayi, durumTeyitSayi,
    etkinlikler, gorevler, acikGorevToplam, onemliler, taksitler, zaYakinHam, zaGectiHam, zaYakinSayi, zaGectiSayi, zaBos, sonuclanmamis, uyapSorunlu,
  ] = await Promise.all([
    // ── Bugün masası: açık dosyalar + Şimdi önbelleği ──
    prisma.rucuDosyasi.findMany({
      where: { musteriId: aktifMusteriId, durum: { notIn: KAPALI } },
      take: 5000,
      select: {
        id: true, hukukDosyaNo: true, hasarDosyaNo: true, durum: true, uyapDurum: true, icraDosyaNo: true,
        uyapEslesme: true, uyapSenkronAt: true, onarimDurumu: true, atananKullaniciId: true, yolHaritasiJson: true,
      },
    }),
    // açık süreler (süre riski önbellekten bağımsız okunur)
    prisma.sure.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, silindiAt: null, durum: 'ACIK' },
      select: { dosyaId: true, dayanak: true, onerilenIhtiyatli: true, onerilenSonGun: true, onaylananSonGun: true, sorumluId: true, durum: true },
    }),
    // dava aşamasındaki dosyalar mahkeme / esas / duruşmayla görünsün
    prisma.dava.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, silindiAt: null },
      select: {
        dosyaId: true, rolumuz: true, derece: true, createdAt: true, mahkemeTuru: true, mahkemeYer: true, mahkemeNo: true,
        esasYil: true, esasSira: true, sonrakiDurusma: true, onIncelemeTarihi: true,
      },
    }),
    prisma.takipOlayi.count({ where: { dosya: { musteriId: aktifMusteriId }, teyit: 'ADAY' } }),
    prisma.davaIslem.count({ where: { dosya: { musteriId: aktifMusteriId }, teyit: 'ADAY', silindiAt: null, kaynakTuru: { in: ['UYAP_EVRAK', 'UYAP_YAPISAL'] } } }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, onarimDurumu: 'BEKLIYOR' } }),

    // ── sabah radarı ──
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
    // zamanaşımı radarı — takibi açılmamış açık dosyalar + İDARİ_YOL (takip açılınca kesilir; idari yolda takip yok)
    prisma.rucuDosyasi.findMany({ where: { musteriId: aktifMusteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: { gte: bas, lt: zaSon }, ...uyapAcikWhere }, orderBy: { zamanasimi: 'asc' }, take: ZA_LISTE, select: zaSelect }),
    prisma.rucuDosyasi.findMany({ where: { musteriId: aktifMusteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: { lt: bas }, ...uyapAcikWhere }, orderBy: { zamanasimi: 'asc' }, take: ZA_LISTE, select: zaSelect }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: { gte: bas, lt: zaSon }, ...uyapAcikWhere } }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: { lt: bas }, ...uyapAcikWhere } }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { in: [...ZAMANASIMI_RADARI] }, zamanasimi: null } }),
    // geçmişte kalmış ama sonuçlandırılmamış toplantılar (takvim kapanış disiplini)
    prisma.etkinlik.count({ where: { dosya: { musteriId: aktifMusteriId }, baslar: { lt: bas }, durum: 'PLANLANDI' } }),
    // UYAP eşleşme sorunu: eklenti v1 "bulamadım/belirsiz" raporu bırakan açık dosyalar (kör nokta radarı)
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, durum: { notIn: [...OTOMASYON_DISI] }, uyapEslesme: { not: null, notIn: ['OK'] } } }),
  ])

  // ── Bugün masası ──
  const masa = masaTablosu(masaDosyalari, masaSureleri, masaDavalari, { kullaniciId: dbUser.id, rol: dbUser.rol }, simdi)
  const sayac = masaSayac(masa)
  const liste = masaSuz(masa, suzgec)
  const gorunen = liste.slice(0, MASA_GOSTER)
  const suzgecSayi: Record<MasaSuzgec, number> = { benim: sayac.benim, herkes: sayac.herkes, onaysiz: sayac.onaysiz, uyap: sayac.uyap }
  const suzgecEtiket = MASA_SUZGECLERI.find((s) => s.id === suzgec)!.etiket
  const birim = suzgec === 'onaysiz' || suzgec === 'uyap' ? 'dosya' : 'iş'
  const onayBekleyenGelisme = adayOlaySayi + adayDavaIslemSayi

  // ── radar ──
  const zaYakin = zaYakinHam.filter(zamanasimiRadarinda)
  const zaGecti = zaGectiHam.filter(zamanasimiRadarinda)
  const ad = dbUser.ad.split(/\s+/)[0]
  const bugunkuler = etkinlikler.filter((e) => e.baslar.getTime() < bas.getTime() + GUN_MS)
  const yarinkiler = etkinlikler.filter((e) => e.baslar.getTime() >= bas.getTime() + GUN_MS)

  return (
    <div className="mx-auto max-w-[1200px] px-7 py-6">
      <PageHeader
        kicker={`Bugün · ${tarihTR(simdi, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}`}
        title="Bugün masası"
        sub={`Günaydın ${ad}. Bütün dosyaların sıradaki işi aciliyet sırasıyla; en üstte süre riski.`}
      />

      {/* kırmızı şerit: kaçmış/kaçmak üzere olan süreler + UYAP kör noktası (sayılar count'tan) */}
      {(zaGectiSayi > 0 || zaBos > 0 || uyapSorunlu > 0) && (
        <div role="alert" className="mb-4 rounded-2xl border border-danger/40 bg-danger-soft/40 px-5 py-4">
          <div className="flex items-center gap-2 text-[14px] font-bold text-danger">
            <AlertTriangle className="h-[18px] w-[18px]" aria-hidden /> Radar alarmı
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
                {uyapSorunlu} dosya UYAP'ta bulunamadı ya da belirsiz (eklenti raporu) →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── BUGÜN MASASI ── */}
      <section aria-labelledby="masa-baslik" className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="masa-baslik" className="font-display text-[18px] font-bold">{suzgecEtiket} · {liste.length} {birim}</h2>
            <span className="text-[12.5px] text-muted-foreground">
              Onaysız süre: <b className="font-mono text-foreground">{sayac.onaysizSure}</b>
              {' · '}Onay bekleyen UYAP gelişmesi: <b className="font-mono text-foreground">{onayBekleyenGelisme}</b>
              {' · '}Durum teyit: <b className="font-mono text-foreground">{durumTeyitSayi}</b>
            </span>
          </div>
          <nav aria-label="Bugün masası süzgeçleri" className="mt-3 flex flex-wrap gap-2">
            {MASA_SUZGECLERI.map((s) => {
              const aktif = s.id === suzgec
              return (
                <Link
                  key={s.id}
                  href={s.id === 'benim' ? '/bugun' : `/bugun?suzgec=${s.id}`}
                  aria-current={aktif ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kr/30 ${
                    aktif ? 'border-kr bg-kr/10 text-kr-ink' : 'border-border bg-surface text-muted-foreground hover:border-kr/40 hover:text-foreground'
                  }`}
                >
                  {s.etiket} <span className="font-mono text-[11px]">{suzgecSayi[s.id]}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {gorunen.length === 0 ? (
          <MasaBos suzgec={suzgec} herkes={sayac.herkes} bekleyen={sayac.bekleyen} />
        ) : (
          <ol className="divide-y divide-border-subtle">
            {gorunen.map((s, i) => (
              <MasaSatiri key={s.dosyaId} s={s} sira={i + 1} birincil={i === 0 && !!s.simdi} suzgec={suzgec} simdi={simdi} rol={dbUser.rol} />
            ))}
          </ol>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle px-5 py-3 text-[12px] text-muted-foreground">
          {liste.length > gorunen.length && <span>… ve {liste.length - gorunen.length} {birim} daha; süzgeçle daraltın.</span>}
          {sayac.bekleyen > 0 && <span>{sayac.bekleyen} dosyada gelişme bekleniyor; yapmanız gereken bir şey yok.</span>}
          {sayac.hesaplanmadi > 0 && <span>{sayac.hesaplanmadi} dosyanın yol haritası henüz hesaplanmadı; dosya açılınca hesaplanır.</span>}
        </div>
      </section>

      {/* ── SABAH RADARI ── */}
      <h2 className="font-display mb-3 text-[18px] font-bold">Takvim ve radar</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bugün & yarın etkinlikler */}
        <Kart baslik={`Bugün ${bugunkuler.length} · yarın ${yarinkiler.length} etkinlik`} Icon={CalendarDays} href="/takvim" linkEtiket="Takvimi aç">
          {etkinlikler.length === 0 ? (
            <Bos metin="Bugün ve yarın için etkinlik yok." eylem={{ href: '/takvim', etiket: 'Takvime git' }} />
          ) : (
            etkinlikler.map((e) => (
              <Satir key={e.id} href={dosyaHref(e.dosya.id)}>
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
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {sonuclanmamis} geçmiş toplantı sonuçlandırılmadı; sonucunu girin →
            </Link>
          )}
        </Kart>

        {/* Görevler */}
        <Kart baslik={`Süresi gelen görevler · ${gorevler.length}`} Icon={ListTodo} href="/gorevler" linkEtiket={`Bütün açık görevler (${acikGorevToplam})`}>
          {gorevler.length === 0 ? (
            <Bos metin="Süresi geçen ya da bugün dolan görev yok." eylem={{ href: '/gorevler', etiket: 'Görevlere git' }} />
          ) : (
            gorevler.map((g) => {
              const kg = g.sonTarih ? kalanGun(g.sonTarih, simdi) : null
              return (
                <Satir key={g.id} href={dosyaHref(g.dosya.id)}>
                  <Badge tone={kg != null && kg < 0 ? 'danger' : 'warning'} dot>
                    <span className="font-mono text-[10.5px]">{kg != null ? (kg < 0 ? `${-kg} gün gecikti` : kg === 0 ? 'bugün' : 'yarın') : '—'}</span>
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{g.baslik}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{g.sorumlu?.ad?.split(/\s+/)[0] ?? '—'}</span>
                </Satir>
              )
            })
          )}
        </Kart>

        {/* Önemli olaylar */}
        <Kart baslik={`Açık önemli olaylar · ${onemliler.length}`} Icon={AlertTriangle} href="/onemli-olaylar" linkEtiket="Önemli olaylar">
          {onemliler.length === 0 ? (
            <Bos metin="Açık önemli olay yok; kuyruk temiz." eylem={{ href: '/tamamlanan-olaylar', etiket: 'Tamamlananlara bak' }} />
          ) : (
            onemliler.map((o) => {
              const kg = o.sonTarih ? kalanGun(o.sonTarih, simdi) : null
              return (
                <Satir key={o.id} href={dosyaHref(o.dosya.id)}>
                  <Badge tone={kg == null ? 'warning' : kg <= 7 ? 'danger' : 'warning'} dot>
                    <span className="font-mono text-[10.5px]">{kg == null ? 'son gün boş' : kg < 0 ? `${-kg} gün geçti` : `${kg} gün`}</span>
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
            <Bos metin="Geciken taksit yok." eylem={{ href: '/taksitler', etiket: 'Taksit planlarına git' }} />
          ) : (
            taksitler.map((t) => {
              const d = t.plan.dosya
              return (
                <Satir key={t.id} href={dosyaHref(d.id)}>
                  <Badge tone="danger" dot><span className="font-mono text-[10.5px]">{kalanGun(t.vadeTarihi, simdi) * -1} gün</span></Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{d.borclular[0]?.adUnvan ?? d.hukukDosyaNo ?? '—'}</span>
                  <span className="font-mono shrink-0 text-[12px] font-bold">{paraTR(Number(t.tutar))}</span>
                </Satir>
              )
            })
          )}
        </Kart>

        {/* Zamanaşımı ≤30 gün */}
        <Kart baslik={`Zamanaşımı 30 gün içinde · ${zaYakinSayi}`} Icon={Hourglass} href="/atanan-dosyalar?za=yakin&sort=zamanasimi" linkEtiket="Radar listesi" genis>
          {zaYakin.length === 0 ? (
            <Bos metin="Önümüzdeki 30 günde dolan zamanaşımı yok (takibi açılmamış dosyalarda)." eylem={{ href: '/atanan-dosyalar?za=bos', etiket: 'Tarihi boş dosyalara bak' }} />
          ) : (
            <>
              {zaYakin.map((d) => (
                <Satir key={d.id} href={dosyaHref(d.id)}>
                  <Badge tone="danger" dot><span className="font-mono text-[10.5px]">{kalanGun(d.zamanasimi!, simdi)} gün</span></Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{d.borclular[0]?.adUnvan ?? d.hukukDosyaNo ?? '—'}</span>
                  <span className="font-mono shrink-0 text-[11px] text-muted-foreground">{d.hukukDosyaNo ?? d.hasarDosyaNo ?? ''} · {tarihTR(d.zamanasimi)}</span>
                </Satir>
              ))}
              {zaYakinSayi > zaYakin.length && (
                <Link href="/atanan-dosyalar?za=yakin&sort=zamanasimi" className="px-2 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:underline">
                  … ve {zaYakinSayi - zaYakin.length} dosya daha; tam liste →
                </Link>
              )}
              {zaGecti.length > 0 && (
                <p className="px-2 py-1.5 text-[12px] font-medium text-danger">{zaGectiSayi} dosyada tarih geçmiş görünüyor; yukarıdaki alarmdan açın.</p>
              )}
            </>
          )}
        </Kart>
      </div>
    </div>
  )
}

// ─────────────────────────── masa bileşenleri (sayfaya özel) ───────────────────────────

/** Son gün rozeti: risk (kırmızı) ≤ 7 gün ya da geçmiş, onay (amber) ≤ 14 gün; yazıyla da söyler. */
function SonGun({ kalan }: { kalan: number | null }) {
  if (kalan == null) return <span className="font-mono text-[12px] text-muted-foreground">—</span>
  const metin = kalan < 0 ? `${-kalan} gün geçti` : kalan === 0 ? 'bugün' : `${kalan} gün`
  const ton: Tone | null = kalan <= 7 ? 'danger' : kalan <= 14 ? 'warning' : null
  if (!ton) return <span className="font-mono text-[12px] text-foreground">{metin}</span>
  return <Badge tone={ton} dot><span className="font-mono">{metin}</span><span className="sr-only">{ton === 'danger' ? ' (süre riski)' : ' (yaklaşıyor)'}</span></Badge>
}

function MasaSatiri({ s, sira, birincil, suzgec, simdi, rol }: { s: MasaSatir; sira: number; birincil: boolean; suzgec: MasaSuzgec; simdi: Date; rol: string }) {
  const is = s.simdi
  const href = is?.hedef ?? dosyaHref(s.dosyaId)
  const risk = !!is && is.oncelik <= 1
  // Rol farkı (06 §2): onay/karar işleri avukatındır; yardımcı ve görüntüleyen dosyayı açar, eylemi avukat yapar.
  const avukatIsi = !!is && (is.rol === 'A' || is.rol === 'A+2')
  const yapabilir = !!is && rol !== 'GORUNTULEYEN' && (!avukatIsi || rol === 'AVUKAT' || rol === 'ADMIN')
  const eylem = is && yapabilir ? is.eylem : 'Dosyayı aç'
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-3">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span className="font-mono text-[12px] font-bold text-muted-foreground">{sira}</span>
        {risk && (
          <span title={is!.oncelik === 0 ? 'Veri engeli' : 'Süre riski'}>
            <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
            <span className="sr-only">{is!.oncelik === 0 ? 'Veri engeli' : 'Süre riski'}</span>
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link href={dosyaHref(s.dosyaId)} className="font-mono text-[12.5px] font-bold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
            {s.dosyaNo}
          </Link>
          {s.dava && (s.dava.mahkeme || s.dava.esas) && (
            <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
              <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {[s.dava.mahkeme, s.dava.esas ? `${s.dava.esas} E.` : null].filter(Boolean).join(' · ')}
                {s.dava.durusma ? ` · duruşma ${tarihTR(s.dava.durusma)}` : ''}
              </span>
            </span>
          )}
        </div>

        {is ? (
          <p className="mt-0.5 text-[14px] font-semibold leading-snug text-foreground">{is.metin}</p>
        ) : (
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            {s.bekleme ? `Bekliyoruz: ${s.bekleme}` : s.hesaplanmadi ? 'Yol haritası henüz hesaplanmadı; dosyayı açın.' : 'Şu an yapılacak iş yok.'}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          {is && <span>Kim: {MASA_ROL_ETIKET[is.rol]}</span>}
          {is && avukatIsi && !yapabilir && <span className="font-semibold text-warning">Bu adım avukatın onayını bekliyor</span>}
          {is?.kural && <span className="font-mono">Kural {is.kural}</span>}
          {is?.teyitGerekli && <Badge tone="warning">teyit gerekli</Badge>}
          {s.sonraSayisi > 0 && <span>Sonra: {s.sonraSayisi} iş</span>}
          {s.onaysizSure.sayi > 0 && (suzgec === 'onaysiz' || is?.kural !== 'GN-04') && (
            <span>
              <Badge tone="warning">ONAYSIZ</Badge>{' '}
              {s.onaysizSure.sayi} süre{s.onaysizSure.enYakin ? `; en yakın önerilen son gün ${tarihTR(s.onaysizSure.enYakin)} (${s.onaysizSure.dayanak ?? 'süre'}, teyit gerekli)` : ''}
            </span>
          )}
          {s.uyap && (
            <span>
              <Badge tone="info">UYAP BAĞLI DEĞİL</Badge> {s.uyap}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {suzgec === 'onaysiz' && !is ? (
          <SonGun kalan={s.onaysizSure.enYakin ? kalanGun(s.onaysizSure.enYakin, simdi) : null} />
        ) : (
          <SonGun kalan={is?.kalanGun ?? null} />
        )}
        {birincil && is ? (
          <Link href={href} className={BTN_BIRINCIL} aria-label={`${s.dosyaNo}: ${eylem}`}>{eylem} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
        ) : (
          <Link href={href} className={BTN_IKINCIL} aria-label={`${s.dosyaNo}: ${eylem}`}>{eylem}</Link>
        )}
      </div>
    </li>
  )
}

function MasaBos({ suzgec, herkes, bekleyen }: { suzgec: MasaSuzgec; herkes: number; bekleyen: number }) {
  const icerik: Record<MasaSuzgec, { metin: string; href: string; etiket: string }> = {
    benim: herkes > 0
      ? { metin: 'Size düşen iş yok.', href: '/bugun?suzgec=herkes', etiket: 'Herkesin işlerine bak' }
      : { metin: `Şu an yapılacak iş yok${bekleyen > 0 ? `; ${bekleyen} dosyada gelişme bekleniyor` : ''}.`, href: '/atanan-dosyalar', etiket: 'Atanan dosyalara git' },
    herkes: { metin: `Şu an yapılacak iş yok${bekleyen > 0 ? `; ${bekleyen} dosyada gelişme bekleniyor` : ''}.`, href: '/atanan-dosyalar', etiket: 'Atanan dosyalara git' },
    onaysiz: { metin: 'Onay bekleyen süre yok.', href: '/sureler', etiket: 'Süre defterine git' },
    uyap: { metin: "Takibi açılmış bütün dosyalar UYAP'la eşleşiyor.", href: '/eklenti', etiket: 'Eklenti durumuna bak' },
  }
  const b = icerik[suzgec]
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
      <p className="text-[14px] text-foreground">{b.metin}</p>
      <Link href={b.href} className={BTN_IKINCIL}>{b.etiket}</Link>
    </div>
  )
}

// ─────────────────────────── radar kartı bileşenleri ───────────────────────────

function Kart({ baslik, Icon, href, linkEtiket, genis, children }: { baslik: string; Icon: React.ComponentType<{ className?: string }>; href: string; linkEtiket: string; genis?: boolean; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-card ${genis ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Icon className="h-4 w-4 text-kr" />
        <h3 className="font-display text-[14px] font-bold">{baslik}</h3>
        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-kr-ink transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
          {linkEtiket} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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

/** Boş hâl: bir cümle ve bir eylem (06, Görsel dil). */
function Bos({ metin, eylem }: { metin: string; eylem: { href: string; etiket: string } }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-4 text-center">
      <span className="text-[12.5px] text-muted-foreground">{metin}</span>
      <Link href={eylem.href} className="text-[12px] font-semibold text-kr-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">{eylem.etiket} →</Link>
    </div>
  )
}
