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
import { HugoImportButton } from '@/components/atanan-dosyalar/hugo-import-modal'
import { IcraEslestirButton } from '@/components/atanan-dosyalar/icra-eslestir'

type SP = { q?: string; cekildi?: string; sort?: string; asama?: string }

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
  const label = d.toLocaleDateString('tr-TR')
  const gun = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
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
  const listeWhere: Prisma.RucuDosyasiWhereInput = {
    ...temelWhere,
    ...(asama !== 'all' ? { durum: { in: ASAMA_DURUMLAR[asama] as DosyaDurum[] } } : {}),
    ...(cekildi === 'evet' ? { hugodanCekildi: true } : cekildi === 'hayir' ? { hugodanCekildi: false } : {}),
  }
  const orderBy: Prisma.RucuDosyasiOrderByWithRelationInput[] =
    sort === 'zamanasimi'
      ? [{ zamanasimi: { sort: 'asc', nulls: 'last' } }]
      : sort === 'tutar'
        ? [{ davaMiktari: { sort: 'desc', nulls: 'last' } }]
        : sort === 'atanma'
          ? [{ atanmaTarihi: { sort: 'desc', nulls: 'last' } }]
          : [{ createdAt: 'desc' }]

  const [durumGrup, cekildiGrup, rows] = await Promise.all([
    prisma.rucuDosyasi.groupBy({ by: ['durum'], where: temelWhere, _count: { _all: true } }),
    prisma.rucuDosyasi.groupBy({ by: ['hugodanCekildi'], where: temelWhere, _count: { _all: true } }),
    prisma.rucuDosyasi.findMany({
      where: listeWhere,
      orderBy,
      take: 300,
      select: {
        id: true, hukukDosyaNo: true, hasarDosyaNo: true, sigortaliUnvan: true, sigortaliTelefon: true,
        gonderenBirim: true, zamanasimi: true, davaMiktari: true, rucuTutari: true, durum: true, hugodanCekildi: true,
        borclular: { select: { adUnvan: true, telefon: true }, orderBy: { id: 'asc' } },
      },
    }),
  ])
  const cekilen = cekildiGrup.find((g) => g.hugodanCekildi)?._count._all ?? 0
  const bekleyen = cekildiGrup.find((g) => !g.hugodanCekildi)?._count._all ?? 0
  const toplam = cekilen + bekleyen

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
          <FiltreBar
            q={q}
            asama={asama}
            cekildi={cekildi}
            sort={sort}
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
                  const am = ASAMA_META[durumAsama(r.durum)]
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
                      {/* aşama — durum'dan türetilmiş */}
                      <div><Badge tone={am.tone} dot>{am.label}</Badge></div>
                      {/* zaman aşımı — renk kodlu */}
                      <div>
                        <Badge tone={za.tone} dot={za.tone === 'danger' || za.tone === 'warning'}>
                          <span className="font-mono text-[10.5px]">{za.label}</span>
                        </Badge>
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
