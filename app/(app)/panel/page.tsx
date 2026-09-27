/**
 * KonsRücü — PANO · app/(app)/panel/page.tsx
 *
 * S30 · Dava Panosu özeti: açık davalar ve dava açılmamış İİK 67 satırları; özet kartları Davalar tablosunun süzgeçlerine
 *   gider (teyitsiz · 30 gün içinde süre · 60 gündür sessiz · karşı taraf davası). Satır ve "durum güveni" Davalar
 *   tablosuyla TEK kaynaktan: lib/konsrucu/dava/pano.ts; girdi ve özet: lib/konsrucu/rapor-mail.ts.
 * S30 · Ray raporu (30 sütun): Ray takip Excel'inin düzeniyle indirilir (/atanan-dosyalar/export?rapor=ray). Program
 *   göndermez; avukat kontrol edip kendi e-postasından elle gönderir (B17). E-posta metni yalnız taslaktır.
 * Kapasite ve darboğaz (yönetim eğilimi): portföy nerede yığılıyor, haftalık giriş/kapanış, en uzun süredir açık dosyalar.
 *   "Kapanış" yaklaşık: kapalı (TAHSIL/KAPANDI) dosyanın updatedAt'i haftaya konur. Giriş (createdAt) kesindir.
 *
 * S25: tek dolu düğme ("Ray raporunu indir"); her boş hâl bir cümle ve bir eylem; renk yalnız anlam taşır ve yazıyla
 * da söylenir. Tenant-kapsamlı, auth zorunlu.
 */
import Link from 'next/link'
import { TrendingUp, ArrowRight, Layers, Clock, Inbox, Scale, FileSpreadsheet, Download } from 'lucide-react'
import type { DosyaDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { Badge, PageHeader, type Tone } from '@/components/konsrucu/ui'
import { tarihTR } from '@/lib/konsrucu/format'
import { ASAMA_META, asamaBilgi, durumAsama, type AsamaKey } from '@/lib/konsrucu/asama'
import { HATIRLATMA_DISI } from '@/lib/konsrucu/aktiflik'
import { dosyaHref } from '@/lib/konsrucu/nav'
import { panoSatiri, type PanoSatiri } from '@/lib/konsrucu/dava/pano'
import {
  davaPanoGirdileri, davaPanoOzeti, davaPanoEnAcil, rayRaporMailTaslagi, DAVA_GUVEN_ETIKET, DAVA_PANO_KARTLARI,
} from '@/lib/konsrucu/rapor-mail'

export const dynamic = 'force-dynamic'

const HAFTA_MS = 7 * 86_400_000
const GUN_MS = 86_400_000
const HAFTA_SAYISI = 12
const KAPALI: DosyaDurum[] = ['TAHSIL', 'KAPANDI']
// "açık iş" dışı: yalnız TAHSIL/KAPANDI. İDARİ_YOL açık iştir — süreleri avukat izler (S06, B12; eskiden
// idari yol da dışarıda sayılıyordu). Tek kaynak: lib/konsrucu/aktiflik (hatırlatma kapsamıyla aynı küme).
const ACIK_DISI: DosyaDurum[] = [...HATIRLATMA_DISI]
const OPEN_EVRE: AsamaKey[] = ['oncesi', 'icra', 'arabuluculuk', 'dava', 'infaz']
const PANO_ACIK_SURE = ['ACIK', 'KAPANMAYA_HAZIR', 'TETIK_BEKLIYOR']

const BTN_BIRINCIL =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kr/30'
const BTN_IKINCIL =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-foreground transition hover:border-kr/40 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kr/30'
const BOLUM = 'overflow-hidden rounded-2xl border border-border bg-surface shadow-card'
const BOLUM_BASLIK = 'flex flex-wrap items-center gap-2 border-b border-border-subtle px-5 py-4'

export default async function PanelPage() {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1100px] px-7 py-6">
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müvekkil seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Sol alttaki müvekkil kutusundan bir müvekkil seçin.</p>
          <Link href="/dashboard" className={`${BTN_IKINCIL} mt-4`}>Müvekkil seç</Link>
        </div>
      </div>
    )
  }

  const now = Date.now()
  const simdi = new Date(now)
  const pencereBas = new Date(now - HAFTA_SAYISI * HAFTA_MS)
  const [durumGrup, girisHam, cikisHam, bekleyenCekim, yaslananlar, davaKayitlari, davasizSureler, musteri, rayDosyaSayisi] = await Promise.all([
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
    // Dava Panosu: bütün davalar (silinenler hariç) — satır mantığı lib/konsrucu/dava/pano.ts
    prisma.dava.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, silindiAt: null },
      select: {
        id: true, dosyaId: true, mahkemeTuru: true, mahkemeYer: true, mahkemeNo: true, esasYil: true, esasSira: true,
        evre: true, durum: true, rolumuz: true, sonrakiDurusma: true, onIncelemeTarihi: true, uyapDosyaId: true, updatedAt: true,
        dosya: { select: { hukukDosyaNo: true } },
        asama: { select: { detayJson: true } },
        islemler: { where: { silindiAt: null, teyit: { not: 'REDDEDILDI' } }, select: { tur: true, tarih: true, createdAt: true, teyit: true } },
        sureler: { where: { silindiAt: null }, select: { tur: true, onaylananSonGun: true, onerilenIhtiyatli: true, durum: true } },
      },
    }),
    // dava açılmamış dosyaların açık İİK 67 süreleri → "(dava açılmadı)" satırı
    prisma.sure.findMany({
      where: { dosya: { musteriId: aktifMusteriId }, silindiAt: null, davaId: null, tur: 'IIK67', durum: { in: PANO_ACIK_SURE } },
      select: { dosyaId: true, tur: true, onaylananSonGun: true, onerilenIhtiyatli: true, durum: true, dosya: { select: { hukukDosyaNo: true, updatedAt: true } } },
    }),
    prisma.musteri.findUnique({ where: { id: aktifMusteriId }, select: { ad: true } }),
    prisma.rucuDosyasi.count({ where: { musteriId: aktifMusteriId, hukukDosyaNo: { not: null } } }),
  ])

  // ── Dava Panosu özeti ──
  const davaSatirlari: PanoSatiri[] = davaPanoGirdileri(
    davaKayitlari.map((d) => ({
      id: d.id, dosyaId: d.dosyaId, hukukDosyaNo: d.dosya.hukukDosyaNo,
      mahkemeTuru: d.mahkemeTuru, mahkemeYer: d.mahkemeYer, mahkemeNo: d.mahkemeNo, esasYil: d.esasYil, esasSira: d.esasSira,
      evre: d.evre, durum: d.durum, rolumuz: d.rolumuz, sonrakiDurusma: d.sonrakiDurusma, onIncelemeTarihi: d.onIncelemeTarihi,
      uyapDosyaId: d.uyapDosyaId, asamaDetayJson: d.asama?.detayJson ?? null, updatedAt: d.updatedAt,
      islemler: d.islemler, sureler: d.sureler,
    })),
    davasizSureler.map((s) => ({
      dosyaId: s.dosyaId, hukukDosyaNo: s.dosya.hukukDosyaNo, dosyaUpdatedAt: s.dosya.updatedAt,
      tur: s.tur, onaylananSonGun: s.onaylananSonGun, onerilenIhtiyatli: s.onerilenIhtiyatli, durum: s.durum,
    })),
  ).map((g) => panoSatiri(g, simdi))
  const davaOzet = davaPanoOzeti(davaSatirlari, simdi)
  const enAcil = davaPanoEnAcil(davaSatirlari, 5)
  const davaliDosya = new Set(davaSatirlari.filter((s) => !s.davaAcilmadi).map((s) => s.dosyaId)).size
  const kartSayi: Record<string, number> = { teyitsiz: davaOzet.teyitsiz, sure30: davaOzet.sure30, sessiz60: davaOzet.sessiz60, karsi: davaOzet.karsi }

  // ── Ray raporu taslağı (program göndermez) ──
  const avukat = dbUser.rol === 'AVUKAT' || dbUser.rol === 'ADMIN'
  const taslak = rayRaporMailTaslagi({ musteriAd: musteri?.ad ?? null, hazirlayanAd: dbUser.ad, bugun: simdi, dosyaSayisi: rayDosyaSayisi, davaSayisi: davaliDosya })

  // ── kapasite: durum → sayı; aşama evresine topla ──
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

  const tiles: { etiket: string; deger: string; alt?: string }[] = [
    { etiket: 'Aktif dosya', deger: String(aktifToplam), alt: `${toplam} toplam · ${evreSay.kapali} kapalı` },
    { etiket: 'İcra öncesi (iş bekleyen)', deger: String(evreSay.oncesi), alt: 'havuz + inceleme + hazır' },
    { etiket: 'Çekim bekleyen', deger: String(bekleyenCekim), alt: "Hugo'dan çekilmemiş" },
    { etiket: 'Bu hafta', deger: `+${giris[0]} / −${cikis[0]}`, alt: 'giren / kapanan' },
  ]

  return (
    <div className="mx-auto max-w-[1100px] px-7 py-6">
      <PageHeader
        kicker={`Pano · ${musteri?.ad ?? 'Müvekkil'}`}
        title="Pano"
        sub="Davaların durumu, Ray raporu ve portföyün kapasitesi tek ekranda. Günlük işler Bugün masasında."
      />

      {/* ── DAVA PANOSU ÖZETİ ── */}
      <section aria-labelledby="dava-baslik" className={`${BOLUM} mb-6`}>
        <div className={BOLUM_BASLIK}>
          <Scale className="h-4 w-4 text-kr" aria-hidden />
          <h2 id="dava-baslik" className="font-display text-[18px] font-bold">Dava Panosu</h2>
          <span className="text-[12.5px] text-muted-foreground">
            {davaOzet.dava} dava{davaOzet.davaAcilmadi > 0 ? ` · ${davaOzet.davaAcilmadi} dosyada dava açılmadı (İİK 67 süresi açık)` : ''}
          </span>
          <Link href="/davalar" className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-kr-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
            Bütün davalar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {davaOzet.toplam === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-[14px] text-foreground">Henüz dava kaydı yok. Dava açılınca ya da Ray Excel'i içe aktarılınca burada görünür.</p>
            <Link href="/atanan-dosyalar?asama=dava" className={BTN_IKINCIL}>Dava aşamasındaki dosyalara bak</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3 xl:grid-cols-5">
              {DAVA_PANO_KARTLARI.map((k) => (
                <OzetKart key={k.id} href={`/davalar?suzgec=${k.id}`} etiket={k.etiket} sayi={kartSayi[k.id] ?? 0} ton={k.ton} eylem="Davaları süz" />
              ))}
              <OzetKart href="/takvim" etiket="7 gün içinde duruşma" sayi={davaOzet.durusma7} ton={null} eylem="Takvimi aç" />
            </div>

            <div className="border-t border-border-subtle px-5 pb-2 pt-4">
              <h3 className="font-display text-[14px] font-bold">En acil davalar</h3>
              <p className="text-[12px] text-muted-foreground">En yakın süreye, sonra en yakın duruşmaya göre. Süre günleri önerilendir; son günü avukat onaylar.</p>
            </div>
            <div className="px-2 pb-3">
              <table className="w-full table-fixed text-left text-[12.5px]">
                <caption className="sr-only">En acil beş dava</caption>
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th scope="col" className="w-[120px] px-3 py-2 font-semibold">Dosya</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Mahkeme ve esas</th>
                    <th scope="col" className="w-[120px] px-3 py-2 font-semibold">Evre</th>
                    <th scope="col" className="w-[96px] px-3 py-2 font-semibold">Sonraki</th>
                    <th scope="col" className="w-[92px] px-3 py-2 text-right font-semibold">Süre</th>
                    <th scope="col" className="w-[112px] px-3 py-2 font-semibold">Güven</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {enAcil.map((s) => (
                    <tr key={s.anahtar} className={s.guven === 'ESKIMIS' ? 'opacity-75' : ''}>
                      <td className="truncate px-3 py-2">
                        <Link href={dosyaHref(s.dosyaId)} className="font-mono font-bold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">{s.dosya}</Link>
                        {s.karsiTaraf && <span className="block text-[11px] text-warning">karşı taraf davası</span>}
                      </td>
                      <td className="truncate px-3 py-2 text-muted-foreground" title={s.mahkemeEsas}>{s.mahkemeEsas}</td>
                      <td className="truncate px-3 py-2">{s.evre}{s.evreTuretildi ? <span className="text-muted-foreground"> (tahmin)</span> : null}</td>
                      <td className="px-3 py-2 font-mono">{s.sonraki ? tarihTR(s.sonraki) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <SureRozeti kalan={s.sureKalanGun} onaysiz={s.sureOnaysiz} />
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={DAVA_GUVEN_ETIKET[s.guven].ton} dot>{DAVA_GUVEN_ETIKET[s.guven].etiket}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── RAY RAPORU ── */}
      <section aria-labelledby="ray-baslik" className={`${BOLUM} mb-6`}>
        <div className={BOLUM_BASLIK}>
          <FileSpreadsheet className="h-4 w-4 text-kr" aria-hidden />
          <h2 id="ray-baslik" className="font-display text-[18px] font-bold">Ray raporu (30 sütun)</h2>
          <span className="text-[12.5px] text-muted-foreground">{rayDosyaSayisi} dosya · {davaliDosya} dosya dava aşamasında</span>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0 space-y-2 text-[13.5px]">
            <p>Ray takip Excel'inin 30 sütunuyla, programın kendi verisinden. Dava aşamasındaki dosyalar mahkeme, esas ve duruşma bilgisiyle gelir; teyit edilmemiş hücreler sarı ve notludur.</p>
            <p className="text-muted-foreground">
              Program raporu göndermez. {avukat ? 'Kontrol edin ve kendi e-postanızdan elle gönderin.' : 'Raporu avukat kontrol eder ve elle gönderir.'}
            </p>
            <details className="rounded-xl border border-border-subtle bg-surface-muted/40 px-4 py-3">
              <summary className="cursor-pointer text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">E-posta taslağını göster</summary>
              <div className="mt-3 space-y-2 text-[13px]">
                <div><span className="text-muted-foreground">Konu: </span><span className="font-semibold">{taslak.konu}</span></div>
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 font-sans text-[13px] leading-relaxed">{taslak.govde}</pre>
                <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-muted-foreground">
                  {taslak.uyarilar.map((u) => <li key={u}>{u}</li>)}
                  <li>Teyitsiz satır sayısı raporun "Rapor bilgisi" sayfasında yazar.</li>
                </ul>
              </div>
            </details>
          </div>
          <a href="/atanan-dosyalar/export?rapor=ray" className={BTN_BIRINCIL}>
            <Download className="h-4 w-4" aria-hidden /> Ray raporunu indir
          </a>
        </div>
      </section>

      {/* ── KAPASİTE ── */}
      <h2 className="font-display mb-3 text-[18px] font-bold">Kapasite ve darboğaz</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.etiket} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t.etiket}</div>
            <div className="font-display mt-1 text-[26px] font-extrabold tracking-[-0.02em]">{t.deger}</div>
            {t.alt && <div className="mt-0.5 text-[12px] text-muted-foreground">{t.alt}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* DARBOĞAZ HARİTASI */}
        <section className={BOLUM}>
          <div className={BOLUM_BASLIK}>
            <Layers className="h-4 w-4 text-kr" aria-hidden /><h3 className="font-display text-[15px] font-bold">Darboğaz haritası</h3>
            <span className="ml-auto text-[12px] text-muted-foreground">aşamaya göre açık dosya</span>
          </div>
          <div className="space-y-3 p-5">
            {aktifToplam === 0 ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <p className="text-[13px] text-muted-foreground">Açık dosya yok.</p>
                <Link href="/akilli-giris/iceri-aktar" className="text-[12.5px] font-semibold text-kr-ink hover:underline">Hugo listesini içe aktar →</Link>
              </div>
            ) : OPEN_EVRE.map((e) => {
              const n = evreSay[e]
              const meta = ASAMA_META[e]
              const darb = e === darbogaz && n > 0
              return (
                <div key={e}>
                  <div className="mb-1 flex items-center gap-2 text-[12.5px]">
                    <span className="font-semibold">{meta.label}</span>
                    {darb && <Badge tone="danger">DARBOĞAZ</Badge>}
                    <span className="ml-auto font-mono font-bold">{n}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${meta.label}: ${n} dosya`}>
                    <div className={`h-full rounded-full ${darb ? 'bg-danger' : 'bg-kr'}`} style={{ width: `${Math.round((n / maxOpen) * 100)}%` }} />
                  </div>
                  {e === 'oncesi' && n > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {oncesiAlt.filter(([, v]) => v > 0).map(([lbl, v]) => (
                        <span key={lbl} className="font-mono rounded-md bg-surface-muted px-1.5 py-[2px] text-[11px] text-muted-foreground">{lbl} {v}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="mt-1 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[12px] text-muted-foreground">
              <span>Kapalı (tahsil / kapandı)</span>
              <span className="font-mono font-semibold">{evreSay.kapali}</span>
            </div>
          </div>
        </section>

        {/* HAFTALIK AKIŞ */}
        <section className={BOLUM}>
          <div className={BOLUM_BASLIK}>
            <TrendingUp className="h-4 w-4 text-kr" aria-hidden /><h3 className="font-display text-[15px] font-bold">Haftalık akış</h3>
            <span className="ml-auto text-[12px] text-muted-foreground">son {HAFTA_SAYISI} hafta</span>
          </div>
          <div className="p-5">
            <div className="mb-3 flex items-center gap-4 text-[12px]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-kr" /> Giriş <b className="font-mono">{son12Giris}</b></span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success" /> Kapanış <b className="font-mono">{son12Cikis}</b></span>
              <span className={`ml-auto font-mono font-semibold ${net > 0 ? 'text-danger' : 'text-success'}`}>
                {net > 0 ? `+${net} büyüyor` : net < 0 ? `${net} eriyor` : 'dengede'}
              </span>
            </div>
            {/* CSS bar grafiği — her hafta: giriş (kr) + kapanış (success) */}
            <div className="flex h-[104px] items-end gap-1.5" role="img" aria-label={`Son ${HAFTA_SAYISI} hafta: ${son12Giris} giriş, ${son12Cikis} kapanış`}>
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
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{HAFTA_SAYISI - 1} hafta önce</span>
              <span>bu hafta</span>
            </div>
            {net > 0 && (
              <p className="mt-3 rounded-lg bg-warning-soft/40 px-3 py-2 text-[12px] text-warning">
                Giriş kapanışı aşıyor; portföy büyüyor. İlk işlem hızını (çekim kuyruğu ve hazırlık) yüksek tutun.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* EN UZUN AÇIK DOSYALAR */}
      <section className={`${BOLUM} mt-6`}>
        <div className={BOLUM_BASLIK}>
          <Clock className="h-4 w-4 text-kr" aria-hidden /><h3 className="font-display text-[15px] font-bold">En uzun süredir açık dosyalar</h3>
          <span className="ml-auto text-[12px] text-muted-foreground">dosya açılışından bu yana</span>
        </div>
        {yaslananlar.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-[13px] text-muted-foreground">Açık dosya yok.</p>
            <Link href="/atanan-dosyalar" className="text-[12.5px] font-semibold text-kr-ink hover:underline">Atanan dosyalara git →</Link>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {yaslananlar.map((d) => {
              const yas = Math.floor((now - d.createdAt.getTime()) / GUN_MS)
              const a = asamaBilgi(d.durum)
              return (
                <Link key={d.id} href={dosyaHref(d.id)} className="flex items-center gap-3 px-5 py-2.5 text-[12.5px] transition hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kr/50">
                  <span className="font-mono w-[130px] shrink-0 truncate font-bold text-foreground">{d.hukukDosyaNo ?? d.id.slice(0, 8)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.sigortaliUnvan ?? '—'}</span>
                  <Badge tone={a.tone} dot>{a.label}</Badge>
                  <span className="font-mono w-[92px] shrink-0 text-right text-[12px] text-muted-foreground" title={tarihTR(d.createdAt)}>{yas} gün</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

/** Özet kartı → Davalar tablosunun süzgeci. Sayı 0 ise soluk; renk yalnız anlam taşır, etiket yazıyla söyler. */
function OzetKart({ href, etiket, sayi, ton, eylem }: { href: string; etiket: string; sayi: number; ton: Tone | null; eylem: string }) {
  const bos = sayi === 0
  return (
    <Link
      href={href}
      className={`group rounded-xl border border-border bg-surface p-4 transition hover:border-kr/40 hover:bg-surface-muted/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kr/30 ${bos ? 'opacity-70' : ''}`}
    >
      <div className="font-display text-[26px] font-extrabold leading-none tracking-[-0.02em]">{sayi}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
        {!bos && ton && <span className={`h-2 w-2 shrink-0 rounded-full ${TON_NOKTA[ton] ?? 'bg-muted-foreground'}`} aria-hidden />}
        {etiket}
      </div>
      <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground group-hover:text-foreground">
        {eylem} <ArrowRight className="h-3 w-3" aria-hidden />
      </div>
    </Link>
  )
}

const TON_NOKTA: Partial<Record<Tone, string>> = { danger: 'bg-danger', warning: 'bg-warning', info: 'bg-info', success: 'bg-success', steel: 'bg-muted-foreground' }

/** Süre: ≤ 7 gün ya da geçmiş = risk (kırmızı); onaysız = onay (amber); yazıyla da söyler. */
function SureRozeti({ kalan, onaysiz }: { kalan: number | null; onaysiz: boolean }) {
  if (kalan == null) return <span className="font-mono text-muted-foreground">—</span>
  const metin = kalan < 0 ? `${-kalan} gün geçti` : `${kalan} gün`
  if (kalan <= 7) return <Badge tone="danger" dot><span className="font-mono">{metin}</span>{onaysiz ? ' · onaysız' : ''}</Badge>
  if (onaysiz) return <Badge tone="warning"><span className="font-mono">{metin}</span> · onaysız</Badge>
  return <span className="font-mono">{metin}</span>
}
