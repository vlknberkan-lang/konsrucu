/**
 * KonsRücü — KAPASİTE / DARBOĞAZ panosu · app/(app)/panel/page.tsx
 * Yönetim/trend görünümü (/bugun günlük operasyonu tamamlar): portföy NEREDE yığılıyor (aşama darboğazı),
 * haftalık GİRİŞ vs KAPANIŞ (portföy büyüyor mu?), en uzun süredir AÇIK dosyalar. Yeni model yok — mevcut
 * durum/createdAt/updatedAt kolonlarından türetilir. Tenant-kapsamlı, auth zorunlu.
 *
 * NOT: "kapanış" yaklaşık — kapalı (TAHSIL/KAPANDI) dosyanın updatedAt'i (son mutasyon ≈ kapanış anı)
 * ile haftaya konur; ayrı "kapanışAt" alanı yok. Giriş (createdAt) kesindir.
 */
import Link from 'next/link'
import { Gauge, TrendingUp, ArrowRight, Layers, Clock, Inbox } from 'lucide-react'
import type { DosyaDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/konsrucu/ui'
import { tarihTR } from '@/lib/konsrucu/format'
import { ASAMA_DURUMLAR, ASAMA_META, asamaBilgi, durumAsama, type AsamaKey } from '@/lib/konsrucu/asama'

export const dynamic = 'force-dynamic'

const HAFTA_MS = 7 * 86_400_000
const GUN_MS = 86_400_000
const HAFTA_SAYISI = 12
const KAPALI: DosyaDurum[] = ['TAHSIL', 'KAPANDI']
const ACIK_DISI: DosyaDurum[] = ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] // "açık iş" dışı (idari yan yol dahil)
const OPEN_EVRE: AsamaKey[] = ['oncesi', 'icra', 'arabuluculuk', 'dava', 'infaz']

export default async function PanelPage() {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1100px] px-7 py-6">
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Üst menüden bir müşteri (tenant) seçin.</p>
        </div>
      </div>
    )
  }

  const now = Date.now()
  const pencereBas = new Date(now - HAFTA_SAYISI * HAFTA_MS)
  const [durumGrup, girisHam, cikisHam, bekleyenCekim, yaslananlar] = await Promise.all([
    prisma.rucuDosyasi.groupBy({ by: ['durum'], where: { musteriId: aktifMusteriId }, _count: { _all: true } }),
    prisma.rucuDosyasi.findMany({ where: { musteriId: aktifMusteriId, createdAt: { gte: pencereBas } }, select: { createdAt: true } }),
    prisma.rucuDosyasi.findMany({ where: { musteriId: aktifMusteriId, durum: { in: KAPALI }, updatedAt: { gte: pencereBas } }, select: { updatedAt: true } }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, hukukDosyaNo: { not: null }, hugodanCekildi: false } }),
    prisma.rucuDosyasi.findMany({
      where: { musteriId: aktifMusteriId, durum: { notIn: ACIK_DISI } },
      orderBy: { createdAt: 'asc' },
      take: 8,
      select: { id: true, hukukDosyaNo: true, sigortaliUnvan: true, durum: true, createdAt: true },
    }),
  ])

  // durum → sayı; aşama evresine topla
  const say: Record<string, number> = {}
  let toplam = 0
  for (const g of durumGrup) { say[g.durum] = g._count._all; toplam += g._count._all }
  const evreSay: Record<AsamaKey, number> = { oncesi: 0, icra: 0, arabuluculuk: 0, dava: 0, infaz: 0, kapali: 0 }
  for (const [durum, n] of Object.entries(say)) evreSay[durumAsama(durum)] += n
  const aktifToplam = OPEN_EVRE.reduce((s, e) => s + evreSay[e], 0)
  const maxOpen = Math.max(1, ...OPEN_EVRE.map((e) => evreSay[e]))
  const darbogaz = OPEN_EVRE.reduce((a, b) => (evreSay[b] > evreSay[a] ? b : a), 'oncesi' as AsamaKey)

  // haftalık kovalar (0 = bu hafta … HAFTA_SAYISI-1 = en eski)
  const giris = new Array(HAFTA_SAYISI).fill(0)
  const cikis = new Array(HAFTA_SAYISI).fill(0)
  const kova = (t: Date) => Math.floor((now - t.getTime()) / HAFTA_MS)
  for (const r of girisHam) { const b = kova(r.createdAt); if (b >= 0 && b < HAFTA_SAYISI) giris[b]++ }
  for (const r of cikisHam) { const b = kova(r.updatedAt); if (b >= 0 && b < HAFTA_SAYISI) cikis[b]++ }
  const maxHafta = Math.max(1, ...giris, ...cikis)
  const son12Giris = giris.reduce((a, b) => a + b, 0)
  const son12Cikis = cikis.reduce((a, b) => a + b, 0)
  const net = son12Giris - son12Cikis
  const haftaIdx = Array.from({ length: HAFTA_SAYISI }, (_, i) => HAFTA_SAYISI - 1 - i) // eski → yeni

  // "İcra Öncesi" alt kırılımı (çekim/inceleme darboğazı)
  const oncesiAlt: [string, number][] = [
    ['Havuzda', say['HAVUZDA'] ?? 0],
    ['İnceleniyor', say['INCELENIYOR'] ?? 0],
    ['Takibe hazır', say['TAKIBE_HAZIR'] ?? 0],
    ['İdari yol', say['IDARI_YOL'] ?? 0],
  ]

  const tiles: { etiket: string; deger: string; alt?: string; tone?: string }[] = [
    { etiket: 'Aktif dosya', deger: String(aktifToplam), alt: `${toplam} toplam · ${evreSay.kapali} kapalı` },
    { etiket: 'İcra öncesi (iş bekleyen)', deger: String(evreSay.oncesi), alt: 'havuz + inceleme + hazır' },
    { etiket: 'Çekim bekleyen', deger: String(bekleyenCekim), alt: "Hugo'dan çekilmemiş" },
    { etiket: 'Bu hafta', deger: `+${giris[0]} / −${cikis[0]}`, alt: 'giren / kapanan' },
  ]

  return (
    <div className="mx-auto max-w-[1100px] px-7 py-6">
      <div className="mb-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Yönetim · Kapasite & Darboğaz</div>
        <h1 className="font-display mt-1.5 flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.035em]">
          <Gauge className="h-7 w-7 text-kr" /> Kapasite Panosu
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-sm text-muted-foreground">
          Portföy nerede yığılıyor, haftalık giriş/çıkış dengesi ne, en uzun süredir açık dosyalar hangileri —
          tek bakışta darboğaz. <span className="text-muted-foreground/70">/bugun günlük işleri gösterir; burası eğilimi.</span>
        </p>
      </div>

      {/* özet kutucuklar */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.etiket} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{t.etiket}</div>
            <div className="font-display mt-1 text-[26px] font-extrabold tracking-[-0.02em]">{t.deger}</div>
            {t.alt && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{t.alt}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* DARBOĞAZ HARİTASI */}
        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
            <Layers className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Darboğaz Haritası</h2>
            <span className="ml-auto text-[11.5px] text-muted-foreground">aşamaya göre açık dosya</span>
          </div>
          <div className="space-y-3 p-5">
            {OPEN_EVRE.map((e) => {
              const n = evreSay[e]
              const meta = ASAMA_META[e]
              const darb = e === darbogaz && n > 0
              return (
                <div key={e}>
                  <div className="mb-1 flex items-center gap-2 text-[12.5px]">
                    <span className="font-semibold">{meta.label}</span>
                    {darb && <span className="font-mono rounded-full bg-danger-soft px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wide text-danger">darboğaz</span>}
                    <span className="ml-auto font-mono font-bold">{n}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className={`h-full rounded-full ${darb ? 'bg-danger' : 'bg-kr'}`} style={{ width: `${Math.round((n / maxOpen) * 100)}%` }} />
                  </div>
                  {e === 'oncesi' && n > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {oncesiAlt.filter(([, v]) => v > 0).map(([lbl, v]) => (
                        <span key={lbl} className="font-mono rounded-md bg-surface-muted px-1.5 py-[2px] text-[10.5px] text-muted-foreground">{lbl} {v}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="mt-1 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11.5px] text-muted-foreground">
              <span>Kapalı (Tahsil / Kapandı)</span>
              <span className="font-mono font-semibold">{evreSay.kapali}</span>
            </div>
          </div>
        </section>

        {/* HAFTALIK AKIŞ */}
        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
            <TrendingUp className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Haftalık Akış</h2>
            <span className="ml-auto text-[11.5px] text-muted-foreground">son {HAFTA_SAYISI} hafta</span>
          </div>
          <div className="p-5">
            <div className="mb-3 flex items-center gap-4 text-[11.5px]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-kr" /> Giriş <b className="font-mono">{son12Giris}</b></span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" /> Kapanış <b className="font-mono">{son12Cikis}</b></span>
              <span className={`ml-auto font-mono font-semibold ${net > 0 ? 'text-danger' : 'text-success'}`}>
                {net > 0 ? `+${net} büyüyor` : net < 0 ? `${net} eriyor` : 'dengede'}
              </span>
            </div>
            {/* CSS bar grafiği — her hafta: giriş (kr) + kapanış (success) */}
            <div className="flex h-[104px] items-end gap-1.5" role="img" aria-label={`Son ${HAFTA_SAYISI} hafta giriş/kapanış`}>
              {haftaIdx.map((idx) => (
                <div
                  key={idx}
                  className="flex flex-1 items-end justify-center gap-[3px]"
                  title={`${idx === 0 ? 'bu hafta' : `${idx} hafta önce`}: ${giris[idx]} giriş · ${cikis[idx]} kapanış`}
                >
                  <div className="w-[6px] rounded-t-sm bg-kr" style={{ height: `${Math.max(2, Math.round((giris[idx] / maxHafta) * 96))}px` }} />
                  <div className="w-[6px] rounded-t-sm bg-success" style={{ height: `${Math.max(2, Math.round((cikis[idx] / maxHafta) * 96))}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{HAFTA_SAYISI - 1} hafta önce</span>
              <span>bu hafta</span>
            </div>
            {net > 0 && (
              <p className="mt-3 rounded-lg bg-warning-soft/40 px-3 py-2 text-[11.5px] text-warning">
                Giriş kapanışı aşıyor — portföy büyüyor. Kapasite: ilk-işlem hızını (çekim kuyruğu + AI hazırlık) yüksek tut.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* EN UZUN AÇIK DOSYALAR */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <Clock className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">En uzun süredir açık dosyalar</h2>
          <span className="ml-auto text-[11.5px] text-muted-foreground">yaşa göre (dosya açılışından)</span>
        </div>
        {yaslananlar.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground">Açık dosya yok.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {yaslananlar.map((d) => {
              const yas = Math.floor((now - d.createdAt.getTime()) / GUN_MS)
              const a = asamaBilgi(d.durum)
              return (
                <Link key={d.id} href={`/akilli-giris/${d.id}`} className="flex items-center gap-3 px-5 py-2.5 text-[12.5px] transition hover:bg-surface-muted/50">
                  <span className="font-mono w-[130px] shrink-0 truncate font-bold text-foreground">{d.hukukDosyaNo ?? d.id.slice(0, 8)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.sigortaliUnvan ?? '—'}</span>
                  <Badge tone={a.tone} dot>{a.label}</Badge>
                  <span className="font-mono w-[92px] shrink-0 text-right text-[11.5px] text-muted-foreground" title={tarihTR(d.createdAt)}>{yas} gün</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
