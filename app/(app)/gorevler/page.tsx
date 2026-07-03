/**
 * KonsRücü — Takip Görevleri · app/(app)/gorevler/page.tsx
 * Etkinliklerden (ya da serbest) doğan, kişilere atanan işler. Açık + İşlemde varsayılan;
 * Tamamlanan ayrı filtre. Sorumlu/durum/arama süzgeci. Son tarihi yaklaşan/aşan üstte ve renkli.
 * Tenant-kapsamlı, auth zorunlu.
 */
import Link from 'next/link'
import { ChevronRight, ListTodo, SearchX, CalendarClock } from 'lucide-react'
import { Prisma, TakipGorevDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { GorevAksiyon } from '@/components/takip-gorevi/gorev-aksiyon'

type SP = { q?: string; durum?: string; sorumlu?: string }

const ETUR_LBL: Record<string, string> = {
  DURUSMA: 'Duruşma', ARABULUCULUK_TOPLANTISI: 'Arabuluculuk', GORUSME: 'Görüşme', SURE: 'Süre', HATIRLATMA: 'Hatırlatma',
}
const fmtDateSaat = (d: Date | null) =>
  d ? d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : '—'

/** Son tarihi kalan güne göre renk koduna çevir (boşsa nötr). */
function sonTarihMeta(d: Date | null): { label: string; tone: Tone; vurgu: boolean } {
  if (!d) return { label: 'belirtilmedi', tone: 'steel', vurgu: false }
  const label = d.toLocaleDateString('tr-TR')
  const gun = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (gun < 0) return { label: `${label} · ${-gun}g geçti`, tone: 'danger', vurgu: true }
  if (gun <= 2) return { label: `${label} · ${gun}g`, tone: 'danger', vurgu: true }
  if (gun <= 7) return { label: `${label} · ${gun}g`, tone: 'warning', vurgu: true }
  return { label, tone: 'steel', vurgu: false }
}

const DURUM_BADGE: Record<string, { label: string; tone: Tone }> = {
  ACIK: { label: 'Açık', tone: 'warning' },
  ISLEMDE: { label: 'İşlemde', tone: 'info' },
  TAMAMLANDI: { label: 'Tamamlandı', tone: 'success' },
  IPTAL: { label: 'İptal', tone: 'steel' },
}

const COLS = 'grid-cols-[150px_minmax(180px,1fr)_150px_140px_130px_112px_minmax(190px,210px)]'
const MINW = 'min-w-[1180px]'

function chipHref(sp: SP, patch: Partial<SP>): string {
  const p = new URLSearchParams()
  const merged = { ...sp, ...patch }
  if (merged.q) p.set('q', merged.q)
  if (merged.durum && merged.durum !== 'acik') p.set('durum', merged.durum)
  if (merged.sorumlu && merged.sorumlu !== 'all') p.set('sorumlu', merged.sorumlu)
  const s = p.toString()
  return s ? `/gorevler?${s}` : '/gorevler'
}

export default async function GorevlerPage({ searchParams }: { searchParams: SP }) {
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
  const durumF: 'acik' | 'ISLEMDE' | 'TAMAMLANDI' = searchParams.durum === 'ISLEMDE' ? 'ISLEMDE' : searchParams.durum === 'TAMAMLANDI' ? 'TAMAMLANDI' : 'acik'
  const sorumluF: 'all' | 'ben' = searchParams.sorumlu === 'ben' ? 'ben' : 'all'

  const durumWhere: Prisma.TakipGoreviWhereInput['durum'] =
    durumF === 'acik' ? { in: [TakipGorevDurum.ACIK, TakipGorevDurum.ISLEMDE] } : (durumF as TakipGorevDurum)

  const where: Prisma.TakipGoreviWhereInput = {
    dosya: { musteriId: aktifMusteriId },
    durum: durumWhere,
    ...(sorumluF === 'ben' ? { sorumluId: dbUser.id } : {}),
    ...(q
      ? {
          OR: [
            { dosya: { hukukDosyaNo: { contains: q, mode: 'insensitive' } } },
            { dosya: { hasarDosyaNo: { contains: q, mode: 'insensitive' } } },
            { dosya: { icraDosyaNo: { contains: q, mode: 'insensitive' } } },
            { baslik: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const base: Prisma.TakipGoreviWhereInput = { dosya: { musteriId: aktifMusteriId } }
  const [rows, acikSay, islemdeSay, tamamSay, banaSay] = await Promise.all([
    prisma.takipGorevi.findMany({
      where,
      orderBy: [{ durum: 'asc' }, { sonTarih: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 300,
      select: {
        id: true, durum: true, baslik: true, sonTarih: true, sorumluId: true, createdAt: true,
        dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } },
        etkinlik: { select: { tur: true, baslar: true, durum: true } },
        sorumlu: { select: { id: true, ad: true } },
      },
    }),
    prisma.takipGorevi.count({ where: { ...base, durum: TakipGorevDurum.ACIK } }),
    prisma.takipGorevi.count({ where: { ...base, durum: TakipGorevDurum.ISLEMDE } }),
    prisma.takipGorevi.count({ where: { ...base, durum: TakipGorevDurum.TAMAMLANDI } }),
    prisma.takipGorevi.count({ where: { ...base, durum: { in: [TakipGorevDurum.ACIK, TakipGorevDurum.ISLEMDE] }, sorumluId: dbUser.id } }),
  ])
  const acikToplam = acikSay + islemdeSay

  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <Baslik toplam={acikToplam} acik={acikSay} islemde={islemdeSay} />

      {acikToplam === 0 && durumF === 'acik' && !q ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-14 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-kr-soft text-kr-ink">
            <ListTodo className="h-7 w-7" />
          </div>
          <div className="font-display text-lg font-bold">Açık takip görevi yok</div>
          <p className="mx-auto mt-1.5 max-w-[54ch] text-[13px] text-muted-foreground">
            Bir <Link href="/takvim" className="font-semibold text-kr-ink hover:underline">etkinliği</Link> "yapılmadı/ertelendi" işaretleyip
            <b> Takip görevi</b> oluşturduğunuzda (ör. "arabulucuyla iletişime geç, yeni gün ata") burada belirir ve sorumlusuna mail gider.
          </p>
        </div>
      ) : (
        <>
          {/* filtreler */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <form method="get" className="flex items-center gap-2">
              {durumF !== 'acik' && <input type="hidden" name="durum" value={durumF} />}
              {sorumluF !== 'all' && <input type="hidden" name="sorumlu" value={sorumluF} />}
              <input
                name="q"
                defaultValue={q}
                placeholder="Görev / dosya / icra no ara…"
                className="w-[260px] rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] outline-none transition focus:border-kr focus:ring-4 focus:ring-kr/15"
              />
            </form>
            <span className="mx-1 h-5 w-px bg-border" />
            <Chip href={chipHref(searchParams, { sorumlu: 'all' })} on={sorumluF === 'all'}>Tümü</Chip>
            <Chip href={chipHref(searchParams, { sorumlu: 'ben' })} on={sorumluF === 'ben'}>Bana atananlar · {banaSay}</Chip>
            <span className="mx-1 h-5 w-px bg-border" />
            <Chip href={chipHref(searchParams, { durum: 'acik' })} on={durumF === 'acik'}>Açık · {acikToplam}</Chip>
            <Chip href={chipHref(searchParams, { durum: 'ISLEMDE' })} on={durumF === 'ISLEMDE'}>İşlemde · {islemdeSay}</Chip>
            <Chip href={chipHref(searchParams, { durum: 'TAMAMLANDI' })} on={durumF === 'TAMAMLANDI'}>Tamamlanan · {tamamSay}</Chip>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-muted text-muted-foreground">
                <SearchX className="h-6 w-6" />
              </div>
              <div className="font-display text-base font-bold">Filtreye uyan görev yok</div>
              <Link href="/gorevler" className="mt-3 inline-block text-[13px] font-semibold text-kr-ink hover:underline">Filtreleri temizle</Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              <div className="overflow-x-auto">
                <div className={`font-mono grid ${COLS} ${MINW} gap-2 border-b border-border-subtle bg-surface-muted px-5 py-2.5 text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
                  <span>Dosya / İcra</span>
                  <span>Görev</span>
                  <span>İlgili etkinlik</span>
                  <span>Son Tarih / Kalan</span>
                  <span>Sorumlu</span>
                  <span>Durum</span>
                  <span className="text-right">İşlem</span>
                </div>

                {rows.map((r) => {
                  const st = sonTarihMeta(r.sonTarih)
                  const db = DURUM_BADGE[r.durum] ?? { label: r.durum, tone: 'steel' as Tone }
                  return (
                    <div key={r.id} className={`grid ${COLS} ${MINW} items-center gap-2 border-b border-border-subtle px-5 py-3 text-[13px] transition last:border-0 hover:bg-surface-muted/50`}>
                      {/* dosya / icra */}
                      <div className="min-w-0">
                        <Link href={`/akilli-giris/${r.dosya.id}`} className="font-mono block truncate text-[12.5px] font-bold text-foreground transition hover:text-kr hover:underline">
                          {r.dosya.hukukDosyaNo ?? r.dosya.hasarDosyaNo ?? r.dosya.id.slice(0, 8)}
                        </Link>
                        <div className="font-mono truncate text-[10.5px] text-muted-foreground">{r.dosya.icraDosyaNo ?? '—'}</div>
                      </div>
                      {/* görev */}
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.baslik}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{r.dosya.borclular[0]?.adUnvan ?? '—'}</div>
                      </div>
                      {/* ilgili etkinlik */}
                      <div className="min-w-0 text-[11.5px] text-muted-foreground">
                        {r.etkinlik ? (
                          <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{ETUR_LBL[r.etkinlik.tur] ?? r.etkinlik.tur} · {r.etkinlik.baslar.toLocaleDateString('tr-TR')}</span></span>
                        ) : <span className="text-muted-foreground/60">—</span>}
                      </div>
                      {/* son tarih */}
                      <div className="min-w-0"><Badge tone={st.tone} dot={st.vurgu}><span className="font-mono text-[10.5px]">{st.label}</span></Badge></div>
                      {/* sorumlu */}
                      <div className="min-w-0 truncate text-[12px] font-semibold text-foreground">
                        {r.sorumlu ? (r.sorumlu.id === dbUser.id ? `${r.sorumlu.ad} · siz` : r.sorumlu.ad) : <span className="text-muted-foreground">atanmadı</span>}
                      </div>
                      {/* durum */}
                      <div className="min-w-0"><Badge tone={db.tone} dot>{db.label}</Badge></div>
                      {/* işlem */}
                      <GorevAksiyon gorevId={r.id} durum={r.durum} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {rows.length >= 300 && <p className="mt-3 text-center text-[12px] text-muted-foreground">İlk 300 görev gösteriliyor — aramayı daraltın.</p>}
        </>
      )}
    </div>
  )
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${on ? 'bg-kr text-kr-foreground' : 'border border-border bg-surface text-muted-foreground hover:border-kr/40 hover:text-foreground'}`}>
      {children}
    </Link>
  )
}

function Baslik({ toplam, acik, islemde }: { toplam?: number; acik?: number; islemde?: number }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">İş Kuyruğu · Takip Görevleri</div>
        <h1 className="font-display mt-1.5 flex items-center gap-2.5 text-[30px] font-extrabold tracking-[-0.035em]">
          <ListTodo className="h-7 w-7 text-kr-ink" /> Görevler
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
          Etkinliklerden doğan takip işleri (ör. yapılmamış toplantı → "yeni gün ata"). Sorumluya atanır ve mail gider.
          {typeof toplam === 'number' && <span className="font-mono ml-1 text-muted-foreground">· {toplam} açık · {acik} bekliyor · {islemde} işlemde</span>}
        </p>
      </div>
    </div>
  )
}
