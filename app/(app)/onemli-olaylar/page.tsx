/**
 * KonsRücü — Önemli Olaylar · app/(app)/onemli-olaylar/page.tsx
 * Yüksek öncelikli iş kuyruğu: çekilen dosyalarda yakalanan borca itirazlar (arabuluculuk bekleyen).
 * Açık + İşlemde olaylar; süresi yaklaşan/aşan üstte ve renkli. "Arabuluculuk işlemlerini başlat" →
 * dosya detayının arabuluculuk sekmesine götürür. Manuel üstlenme (kilitle) ile çift iş engellenir.
 * Tenant-kapsamlı, auth zorunlu.
 */
import Link from 'next/link'
import { ChevronRight, ShieldAlert, SearchX, AlertTriangle } from 'lucide-react'
import { Prisma, OnemliOlayDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { UstlenButton } from '@/components/onemli-olaylar/ustlen-button'

type SP = { q?: string; durum?: string; sorumlu?: string }

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('tr-TR') : '—')

/** Son tarihi kalan güne göre renk koduna çevir (sonTarih elle girilir; boşsa nötr). */
function sonTarihMeta(d: Date | null): { label: string; tone: Tone; vurgu: boolean } {
  if (!d) return { label: 'belirtilmedi', tone: 'steel', vurgu: false }
  const label = d.toLocaleDateString('tr-TR')
  const gun = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (gun < 0) return { label: `${label} · ${-gun}g geçti`, tone: 'danger', vurgu: true }
  if (gun <= 30) return { label: `${label} · ${gun}g`, tone: 'danger', vurgu: true }
  if (gun <= 90) return { label: `${label} · ${gun}g`, tone: 'warning', vurgu: true }
  return { label, tone: 'steel', vurgu: false }
}

const DURUM_BADGE: Record<'ACIK' | 'ISLEMDE', { label: string; tone: Tone }> = {
  ACIK: { label: 'Açık', tone: 'warning' },
  ISLEMDE: { label: 'İşlemde', tone: 'info' },
}

const COLS = 'grid-cols-[150px_minmax(150px,1fr)_118px_128px_150px_124px_106px_minmax(212px,232px)]'
const MINW = 'min-w-[1204px]'

/** Mevcut searchParams'ı koruyarak chip linki üret. */
function chipHref(sp: SP, patch: Partial<SP>): string {
  const p = new URLSearchParams()
  const merged = { ...sp, ...patch }
  if (merged.q) p.set('q', merged.q)
  if (merged.durum && merged.durum !== 'all') p.set('durum', merged.durum)
  if (merged.sorumlu && merged.sorumlu !== 'all') p.set('sorumlu', merged.sorumlu)
  const s = p.toString()
  return s ? `/onemli-olaylar?${s}` : '/onemli-olaylar'
}

export default async function OnemliOlaylarPage({ searchParams }: { searchParams: SP }) {
  const { dbUser, aktifMusteriId } = await ctx()

  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1500px] px-7 py-6">
        <Baslik />
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Üst menüden bir müşteri (tenant) seçin.</p>
        </div>
      </div>
    )
  }

  const q = (searchParams.q ?? '').trim()
  const durumF: 'all' | 'ACIK' | 'ISLEMDE' = searchParams.durum === 'ACIK' ? 'ACIK' : searchParams.durum === 'ISLEMDE' ? 'ISLEMDE' : 'all'
  const sorumluF: 'all' | 'ben' = searchParams.sorumlu === 'ben' ? 'ben' : 'all'

  const where: Prisma.OnemliOlayWhereInput = {
    dosya: { musteriId: aktifMusteriId },
    durum: durumF === 'all' ? { in: [OnemliOlayDurum.ACIK, OnemliOlayDurum.ISLEMDE] } : (durumF as OnemliOlayDurum),
    ...(sorumluF === 'ben' ? { sorumluId: dbUser.id } : {}),
    ...(q
      ? {
          OR: [
            { dosya: { hukukDosyaNo: { contains: q, mode: 'insensitive' } } },
            { dosya: { hasarDosyaNo: { contains: q, mode: 'insensitive' } } },
            { dosya: { sigortaliUnvan: { contains: q, mode: 'insensitive' } } },
            { dosya: { icraDosyaNo: { contains: q, mode: 'insensitive' } } },
            { baslik: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const acikBase: Prisma.OnemliOlayWhereInput = { dosya: { musteriId: aktifMusteriId } }
  const [rows, acikSay, islemdeSay, banaSay] = await Promise.all([
    prisma.onemliOlay.findMany({
      where,
      orderBy: [{ sonTarih: { sort: 'asc', nulls: 'last' } }, { tetikTarihi: 'asc' }],
      take: 300,
      select: {
        id: true, durum: true, tip: true, baslik: true, tetikTarihi: true, sonTarih: true, sorumluId: true,
        dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, sigortaliUnvan: true, icraDosyaNo: true } },
        sorumlu: { select: { id: true, ad: true } },
      },
    }),
    prisma.onemliOlay.count({ where: { ...acikBase, durum: OnemliOlayDurum.ACIK } }),
    prisma.onemliOlay.count({ where: { ...acikBase, durum: OnemliOlayDurum.ISLEMDE } }),
    prisma.onemliOlay.count({ where: { ...acikBase, durum: { in: [OnemliOlayDurum.ACIK, OnemliOlayDurum.ISLEMDE] }, sorumluId: dbUser.id } }),
  ])
  const toplam = acikSay + islemdeSay

  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <Baslik toplam={toplam} acik={acikSay} islemde={islemdeSay} />

      {toplam === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-14 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-success/[0.12] text-success">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="font-display text-lg font-bold">Açık önemli olay yok</div>
          <p className="mx-auto mt-1.5 max-w-[54ch] text-[13px] text-muted-foreground">
            Çekilen dosyalarda <b>yeni bir borca itiraz</b> yakalandığında (UYAP olayı ya da inen itiraz dilekçesi) burada
            otomatik belirir ve sorumluya atanmayı bekler. Tamamlananlar <Link href="/tamamlanan-olaylar" className="font-semibold text-kr-ink hover:underline">Tamamlanan Olaylar</Link>'a geçer.
          </p>
        </div>
      ) : (
        <>
          {/* filtreler */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <form method="get" className="flex items-center gap-2">
              {durumF !== 'all' && <input type="hidden" name="durum" value={durumF} />}
              {sorumluF !== 'all' && <input type="hidden" name="sorumlu" value={sorumluF} />}
              <input
                name="q"
                defaultValue={q}
                placeholder="Dosya / sigortalı / icra no ara…"
                className="w-[260px] rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15"
              />
            </form>
            <span className="mx-1 h-5 w-px bg-border" />
            <Chip href={chipHref(searchParams, { sorumlu: 'all' })} on={sorumluF === 'all'}>Tümü</Chip>
            <Chip href={chipHref(searchParams, { sorumlu: 'ben' })} on={sorumluF === 'ben'}>Bana atananlar · {banaSay}</Chip>
            <span className="mx-1 h-5 w-px bg-border" />
            <Chip href={chipHref(searchParams, { durum: 'all' })} on={durumF === 'all'}>Hepsi · {toplam}</Chip>
            <Chip href={chipHref(searchParams, { durum: 'ACIK' })} on={durumF === 'ACIK'}>Açık · {acikSay}</Chip>
            <Chip href={chipHref(searchParams, { durum: 'ISLEMDE' })} on={durumF === 'ISLEMDE'}>İşlemde · {islemdeSay}</Chip>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-muted text-muted-foreground">
                <SearchX className="h-6 w-6" />
              </div>
              <div className="font-display text-base font-bold">Filtreye uyan olay yok</div>
              <Link href="/onemli-olaylar" className="mt-3 inline-block text-[13px] font-semibold text-kr-ink hover:underline">Filtreleri temizle</Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              <div className="overflow-x-auto">
                <div className={`font-mono grid ${COLS} ${MINW} gap-2 border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
                  <span>Dosya / Esas</span>
                  <span>Sigortalı / Müvekkil</span>
                  <span>Olay Türü</span>
                  <span>İtiraz Talebi Tarihi</span>
                  <span>Son Tarih / Kalan</span>
                  <span>Sorumlu</span>
                  <span>Durum</span>
                  <span className="text-right">İşlem</span>
                </div>

                {rows.map((r) => {
                  const st = sonTarihMeta(r.sonTarih)
                  const db = DURUM_BADGE[r.durum as 'ACIK' | 'ISLEMDE'] ?? { label: r.durum, tone: 'steel' as Tone }
                  const baslatHref = `/akilli-giris/${r.dosya.id}?asama=arabuluculuk&olay=${r.id}`
                  return (
                    <div key={r.id} className={`grid ${COLS} ${MINW} items-center gap-2 border-b border-border-subtle px-5 py-3 text-[13px] transition last:border-0 hover:bg-surface-muted/50`}>
                      {/* dosya / esas */}
                      <div className="min-w-0">
                        <Link href={`/akilli-giris/${r.dosya.id}`} className="font-mono block truncate rounded text-[12.5px] font-bold text-foreground transition hover:text-kr hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
                          {r.dosya.hukukDosyaNo ?? r.dosya.hasarDosyaNo ?? r.dosya.id.slice(0, 8)}
                        </Link>
                        <div className="font-mono truncate text-[10.5px] text-muted-foreground">{r.dosya.icraDosyaNo ?? '—'}</div>
                      </div>
                      {/* sigortalı */}
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.dosya.sigortaliUnvan ?? '—'}</div>
                        <div className="truncate text-[11px] text-muted-foreground">Ray Sigorta · alacaklı</div>
                      </div>
                      {/* olay türü */}
                      <div className="min-w-0"><Badge tone="danger" dot>Borca İtiraz</Badge></div>
                      {/* itiraz talebi tarihi (belge adındaki gerçek tarih) */}
                      <div className="font-mono text-[11.5px] text-muted-foreground">{fmtDate(r.tetikTarihi)}</div>
                      {/* son tarih / kalan */}
                      <div className="min-w-0">
                        <Badge tone={st.tone} dot={st.vurgu}><span className="font-mono text-[10.5px]">{st.label}</span></Badge>
                      </div>
                      {/* sorumlu */}
                      <div className="min-w-0 truncate text-[12px] font-semibold text-foreground">
                        {r.sorumlu ? (r.sorumlu.id === dbUser.id ? `${r.sorumlu.ad} · siz` : r.sorumlu.ad) : <span className="text-muted-foreground">atanmadı</span>}
                      </div>
                      {/* durum */}
                      <div className="min-w-0"><Badge tone={db.tone} dot>{db.label}</Badge></div>
                      {/* işlem */}
                      <div className="flex items-center justify-end gap-1.5">
                        {r.durum === 'ACIK' && <UstlenButton olayId={r.id} compact />}
                        <Link
                          href={baslatHref}
                          className="inline-flex items-center gap-1.5 rounded-[9px] bg-kr px-2.5 py-1.5 text-[11.5px] font-semibold text-kr-foreground transition hover:bg-kr/90"
                        >
                          Arabuluculuk başlat <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {rows.length >= 300 && <p className="mt-3 text-center text-[12px] text-muted-foreground">İlk 300 olay gösteriliyor — aramayı daraltın.</p>}
        </>
      )}
    </div>
  )
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${on ? 'bg-kr text-kr-foreground' : 'border border-border bg-surface text-muted-foreground hover:border-kr/40 hover:text-foreground'}`}
    >
      {children}
    </Link>
  )
}

function Baslik({ toplam, acik, islemde }: { toplam?: number; acik?: number; islemde?: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Öncelikli Kuyruk · Borca İtiraz</div>
        <h1 className="font-display mt-1.5 flex items-center gap-2.5 text-[30px] font-extrabold tracking-[-0.035em]">
          <AlertTriangle className="h-7 w-7 text-danger" /> Önemli Olaylar
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
          Çekilen dosyalarda yakalanan <b>borca itirazlar</b> — arabuluculuk başvurusu bekleyen en yüksek öncelikli işler.
          {typeof toplam === 'number' && <span className="font-mono ml-1 text-muted-foreground">· {toplam} açık · {acik} atanmadı · {islemde} işlemde</span>}
        </p>
      </div>
    </div>
  )
}
