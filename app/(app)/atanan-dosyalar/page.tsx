/**
 * KonsRücü — Atanan Dosyalar · app/(app)/atanan-dosyalar/page.tsx
 * Hugo'dan tevdiye edilmiş (hukukDosyaNo dolu) dosyalar: arama/aşama-filtre/çekildi-dropdown/sıralama.
 * Sütunlar: dosya no · sigortalı (+tel) · borçlu (+tel) · aşama · zaman aşımı · dava miktarı.
 * Aşama dosya.durum'dan türetilir (indeksli). Tenant-kapsamlı, auth zorunlu.
 */
import Link from 'next/link'
import { ChevronRight, Inbox, SearchX } from 'lucide-react'
import { Prisma, DosyaDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { money } from '@/lib/konsrucu/map'
import { durumAsama, ASAMA_META, ASAMA_DURUMLAR, ASAMA_SIRA, type AsamaKey } from '@/lib/konsrucu/asama'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { FiltreBar } from '@/components/atanan-dosyalar/filtre-bar'
import { CekildiButton } from '@/components/atanan-dosyalar/cekildi-button'
import { CekimKuyrugu, type KuyrukDosya } from '@/components/atanan-dosyalar/cekim-kuyrugu'
import { HugoImportButton } from '@/components/atanan-dosyalar/hugo-import-modal'
import { IcraEslestirButton } from '@/components/atanan-dosyalar/icra-eslestir'
import { tarihTR, kalanGun, bugunIstBasi } from '@/lib/konsrucu/format'

type SP = { q?: string; cekildi?: string; sort?: string; asama?: string; za?: string; uyap?: string }

/** Telefon hücresi — tıkla-ara (tel:) bağlantısı, boşsa tire. */
function Tel({ value }: { value: string | null | undefined }) {
  const v = (value ?? '').trim()
  if (!v) return <span className="text-muted-foreground">—</span>
  return (
    <a
      href={`tel:${v.replace(/[^\d+]/g, '')}`}
      title={v}
      className="font-mono block truncate rounded text-[12px] text-foreground transition hover:text-kr hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none"
    >
      {v}
    </a>
  )
}

/** Zaman aşımı tarihini kalan güne göre renk koduna çevir. */
function zamanasimiMeta(d: Date | null): { label: string; tone: Tone } {
  if (!d) return { label: '—', tone: 'steel' }
  const label = tarihTR(d)
  const gun = kalanGun(d)
  if (gun < 0) return { label: `${label} · geçti`, tone: 'danger' }
  if (gun <= 30) return { label: `${label} · ${gun}g`, tone: 'danger' }
  if (gun <= 90) return { label: `${label} · ${gun}g`, tone: 'warning' }
  return { label, tone: 'steel' }
}

const COLS = 'grid-cols-[150px_minmax(150px,1fr)_120px_minmax(140px,1fr)_120px_132px_140px_104px_72px]'
const MINW = 'min-w-[1180px]'

export default async function AtananDosyalarPage({ searchParams }: { searchParams: SP }) {
  const { aktifMusteriId } = await ctx()

  const q = (searchParams.q ?? '').trim()
  const cekildi = searchParams.cekildi === 'evet' ? 'evet' : searchParams.cekildi === 'hayir' ? 'hayir' : 'all'
  const asama: AsamaKey | 'all' = ASAMA_SIRA.includes(searchParams.asama as AsamaKey) ? (searchParams.asama as AsamaKey) : 'all'
  const sort = ['zamanasimi', 'tutar', 'atanma'].includes(searchParams.sort ?? '') ? (searchParams.sort as string) : 'yeni'
  const za = ['bos', 'yakin', 'gecti'].includes(searchParams.za ?? '') ? (searchParams.za as 'bos' | 'yakin' | 'gecti') : 'all'
  const uyapSorunlu = searchParams.uyap === 'sorunlu' // eklenti v1 "bulunamadı/belirsiz" raporu bırakanlar

  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1500px] px-7 py-6">
        <Baslik />
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">
            Üst menüden bir müşteri (tenant) seçin; atanan dosyalar tenant kapsamında listelenir.
          </p>
        </div>
      </div>
    )
  }

  const temelWhere: Prisma.RucuDosyasiWhereInput = {
    musteriId: aktifMusteriId,
    hukukDosyaNo: { not: null },
    ...(q
      ? {
          OR: [
            { hukukDosyaNo: { contains: q, mode: 'insensitive' } },
            { hasarDosyaNo: { contains: q, mode: 'insensitive' } },
            { sigortaliUnvan: { contains: q, mode: 'insensitive' } },
            { sigortaliTelefon: { contains: q, mode: 'insensitive' } },
            { gonderenBirim: { contains: q, mode: 'insensitive' } },
            { kadroluAvukat: { contains: q, mode: 'insensitive' } },
            { sozlesmeliAvukat: { contains: q, mode: 'insensitive' } },
            { borclular: { some: { adUnvan: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  }
  // Ek radar filtreleri AND birikiminde toplanır — aşama sekmesinin durum koşulunu EZMEZ, birbiriyle birleşebilir.
  // za: Bugün panosuyla AYNI küme — radar yalnız takibi açılmamış dosyaları izler (takip açılınca zamanaşımı kesilir).
  const TAKIP_ONCESI: DosyaDurum[] = [DosyaDurum.HAVUZDA, DosyaDurum.INCELENIYOR, DosyaDurum.TAKIBE_HAZIR]
  const bugun = bugunIstBasi() // İstanbul gün başlangıcı — sunucu UTC'yken pencere kaymasın
  const ekKosul: Prisma.RucuDosyasiWhereInput[] = []
  if (za === 'bos') ekKosul.push({ zamanasimi: null, durum: { in: TAKIP_ONCESI } })
  else if (za === 'yakin') ekKosul.push({ zamanasimi: { gte: bugun, lt: new Date(bugun.getTime() + 30 * 86_400_000) }, durum: { in: TAKIP_ONCESI } })
  else if (za === 'gecti') ekKosul.push({ zamanasimi: { lt: bugun }, durum: { in: TAKIP_ONCESI } })
  if (uyapSorunlu) ekKosul.push({ uyapEslesme: { not: null, notIn: ['OK'] }, durum: { notIn: ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] as DosyaDurum[] } })
  const listeWhere: Prisma.RucuDosyasiWhereInput = {
    ...temelWhere,
    ...(asama !== 'all' ? { durum: { in: ASAMA_DURUMLAR[asama] as DosyaDurum[] } } : {}),
    ...(cekildi === 'evet' ? { hugodanCekildi: true } : cekildi === 'hayir' ? { hugodanCekildi: false } : {}),
    ...(ekKosul.length ? { AND: ekKosul } : {}),
  }
  const orderBy: Prisma.RucuDosyasiOrderByWithRelationInput[] =
    sort === 'zamanasimi'
      ? [{ zamanasimi: { sort: 'asc', nulls: 'last' } }]
      : sort === 'tutar'
        ? [{ davaMiktari: { sort: 'desc', nulls: 'last' } }]
        : sort === 'atanma'
          ? [{ atanmaTarihi: { sort: 'desc', nulls: 'last' } }]
          : [{ createdAt: 'desc' }]

  const [durumGrup, cekildiGrup, rows, kuyrukHam] = await Promise.all([
    prisma.rucuDosyasi.groupBy({ by: ['durum'], where: temelWhere, _count: { _all: true } }),
    prisma.rucuDosyasi.groupBy({ by: ['hugodanCekildi'], where: temelWhere, _count: { _all: true } }),
    prisma.rucuDosyasi.findMany({
      where: listeWhere,
      orderBy,
      take: 300,
      select: {
        id: true, hukukDosyaNo: true, hasarDosyaNo: true, sigortaliUnvan: true, sigortaliTelefon: true,
        gonderenBirim: true, zamanasimi: true, davaMiktari: true, rucuTutari: true, durum: true, hugodanCekildi: true, icraDosyaNo: true,
        borclular: { select: { adUnvan: true, telefon: true }, orderBy: { id: 'asc' } },
        asamalar: { select: { tur: true, durum: true, kimlikNo: true, sira: true }, orderBy: { sira: 'asc' } },
      },
    }),
    // Çekim kuyruğu: çekilmeyi bekleyen (hugodanCekildi=false) dosyalar, ZA en yakından (aşama filtresinden bağımsız backlog aracı)
    prisma.rucuDosyasi.findMany({
      where: { musteriId: aktifMusteriId, hukukDosyaNo: { not: null }, hugodanCekildi: false },
      orderBy: [{ zamanasimi: { sort: 'asc', nulls: 'last' } }],
      take: 50,
      select: { id: true, hukukDosyaNo: true, sigortaliUnvan: true, zamanasimi: true },
    }),
  ])
  const cekilen = cekildiGrup.find((g) => g.hugodanCekildi)?._count._all ?? 0
  const bekleyen = cekildiGrup.find((g) => !g.hugodanCekildi)?._count._all ?? 0
  const toplam = cekilen + bekleyen
  const kuyruk: KuyrukDosya[] = kuyrukHam.map((d) => ({
    id: d.id,
    hukukDosyaNo: d.hukukDosyaNo ?? '—',
    sigortaliUnvan: d.sigortaliUnvan,
    zamanasimi: d.zamanasimi ? d.zamanasimi.toISOString() : null,
  }))

  // aşama sayımları (durum → aşama evresi)
  const asamaSayim: Record<string, number> = { all: toplam }
  for (const k of ASAMA_SIRA) asamaSayim[k] = 0
  for (const g of durumGrup) asamaSayim[durumAsama(g.durum)] += g._count._all

  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <Baslik toplam={toplam} cekilen={cekilen} bekleyen={bekleyen} />

      {/* hiç atanan dosya yoksa: eyleme davet */}
      {toplam === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-14 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-kr/[0.12] text-kr">
            <Inbox className="h-7 w-7" />
          </div>
          <div className="font-display text-lg font-bold">Henüz atanan dosya yok</div>
          <p className="mx-auto mt-1.5 max-w-[54ch] text-[13px] text-muted-foreground">
            Hugo'nun Excel tevdiye listesini içe aktarın; her satır <b>HAVUZDA</b> bir dosya olarak açılır ve
            burada <b>aşamasına</b> göre takibe girer.
          </p>
          <div className="mt-4">
            <HugoImportButton variant="primary" />
          </div>
        </div>
      ) : (
        <>
          <CekimKuyrugu dosyalar={kuyruk} toplamBekleyen={bekleyen} />

          <FiltreBar
            q={q}
            asama={asama}
            cekildi={cekildi}
            sort={sort}
            za={za}
            asamaSayim={asamaSayim}
            cekildiSayim={{ all: toplam, evet: cekilen, hayir: bekleyen }}
          />

          {rows.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-muted text-muted-foreground">
                <SearchX className="h-6 w-6" />
              </div>
              <div className="font-display text-base font-bold">Aramaya uyan dosya yok</div>
              <p className="mx-auto mt-1.5 max-w-[48ch] text-[13px] text-muted-foreground">
                Filtreleri gevşetin ya da arama terimini değiştirin.
              </p>
              <Link href="/atanan-dosyalar" className="mt-3 inline-block text-[13px] font-semibold text-kr-ink hover:underline">
                Filtreleri temizle
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              <div className="overflow-x-auto">
                {/* başlık */}
                <div className={`font-mono grid ${COLS} ${MINW} gap-2 border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
                  <span>Dosya No</span>
                  <span>Sigortalı / Gönderen Birim</span>
                  <span>Sig. Telefon</span>
                  <span>Borçlu</span>
                  <span>Borçlu Tel.</span>
                  <span>Aşama</span>
                  <span>Zaman Aşımı</span>
                  <span className="text-right">Dava Miktarı</span>
                  <span className="sr-only">İşlem</span>
                </div>

                {rows.map((r) => {
                  const za = zamanasimiMeta(r.zamanasimi)
                  const tutar = r.davaMiktari ?? r.rucuTutari
                  const borcluFazla = r.borclular.length - 1
                  const ilk = r.borclular[0]
                  const asamaKey = durumAsama(r.durum)
                  const am = ASAMA_META[asamaKey]
                  const takipAcik = asamaKey !== 'oncesi' || !!r.icraDosyaNo // takip açıldıysa zamanaşımı (takip açma için) kesilmiştir
                  // güncel aşamanın esas/dosya no'su (DEVAM eden aşama; yoksa son; icra fallback)
                  const guncelAsama = [...r.asamalar].reverse().find((a) => a.durum === 'DEVAM') ?? r.asamalar[r.asamalar.length - 1] ?? null
                  const esasNo = guncelAsama?.kimlikNo ?? r.icraDosyaNo ?? null
                  return (
                    <div
                      key={r.id}
                      className={`grid ${COLS} ${MINW} items-center gap-2 border-b border-border-subtle px-5 py-3 text-[13px] transition last:border-0 hover:bg-surface-muted/50`}
                    >
                      {/* dosya no'lar — monospace; hukuk no = detay linki */}
                      <div className="min-w-0">
                        <Link
                          href={`/akilli-giris/${r.id}`}
                          className="font-mono block truncate rounded text-[12.5px] font-bold text-foreground transition hover:text-kr hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 motion-reduce:transition-none"
                        >
                          {r.hukukDosyaNo}
                        </Link>
                        <div className="font-mono truncate text-[10.5px] text-muted-foreground">{r.hasarDosyaNo ?? '—'}</div>
                      </div>
                      {/* sigortalı / birim */}
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.sigortaliUnvan ?? '—'}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{r.gonderenBirim ?? '—'}</div>
                      </div>
                      {/* sigortalı telefon */}
                      <div className="min-w-0"><Tel value={r.sigortaliTelefon} /></div>
                      {/* borçlu(lar) */}
                      <div className="min-w-0">
                        {r.borclular.length ? (
                          <>
                            <div className="truncate font-semibold">{ilk.adUnvan}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{borcluFazla > 0 ? `+${borcluFazla} borçlu daha` : 'borçlu'}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      {/* borçlu telefon (ilk borçlu) */}
                      <div className="min-w-0"><Tel value={ilk?.telefon} /></div>
                      {/* aşama — durum'dan türetilmiş + güncel aşamanın esas no'su */}
                      <div className="min-w-0">
                        <Badge tone={am.tone} dot>{am.label}</Badge>
                        {esasNo && <div className="font-mono mt-1 truncate text-[10.5px] text-muted-foreground" title={esasNo}>{esasNo}</div>}
                      </div>
                      {/* zaman aşımı — takip açıldıysa kesildiği için nötr (—) gösterilir */}
                      <div>
                        {takipAcik ? (
                          <span className="font-mono text-[11px] text-muted-foreground/60" title="İcra takibi açıldı — zamanaşımı kesildi">—</span>
                        ) : (
                          <Badge tone={za.tone} dot={za.tone === 'danger' || za.tone === 'warning'}>
                            <span className="font-mono text-[10.5px]">{za.label}</span>
                          </Badge>
                        )}
                      </div>
                      {/* dava miktarı */}
                      <div className="font-mono text-right text-[12.5px] font-bold">{tutar ? money(Number(tutar)) : '—'}</div>
                      {/* aksiyon: çek toggle (kompakt) + detay */}
                      <div className="flex items-center justify-end gap-1">
                        <CekildiButton dosyaId={r.id} cekildi={r.hugodanCekildi} compact />
                        <Link
                          href={`/akilli-giris/${r.id}`}
                          aria-label={`${r.hukukDosyaNo} dosyasının detayını aç`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-surface-muted hover:text-kr focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {rows.length >= 300 && (
            <p className="mt-3 text-center text-[12px] text-muted-foreground">İlk 300 dosya gösteriliyor — daha fazlası için aramayı daraltın.</p>
          )}
        </>
      )}
    </div>
  )
}

function Baslik({ toplam, cekilen, bekleyen }: { toplam?: number; cekilen?: number; bekleyen?: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Akıllı Giriş · Hugo · Tevdiye</div>
        <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Atanan Dosyalar</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
          Hugo tevdiye dosyalarını içe aktarın; her dosyanın <b>aşamasını</b> takip edin ve detayına geçin.
          {typeof toplam === 'number' && (
            <span className="font-mono ml-1 text-muted-foreground">· {toplam} dosya · {cekilen} çekildi · {bekleyen} bekliyor</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <IcraEslestirButton />
        <HugoImportButton variant="soft" />
      </div>
    </div>
  )
}
