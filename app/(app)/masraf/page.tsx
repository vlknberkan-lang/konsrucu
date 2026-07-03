/**
 * KonsRücü — Masraflar · app/(app)/masraf/page.tsx
 * Çapraz-dosya tüm icra masrafları (makbuz PDF'inden çıkan + manuel). Masraf tarihine göre gruplu.
 * Yalnız "bizim taraf" faturalanır; belirsiz/eşleşmeyen işaretli. Excel = RAY MASRAF FORMU. Tenant-kapsamlı.
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { parseFiltre, masrafListele } from '@/lib/konsrucu/masraf-sorgu'
import { MasrafFiltre, type FiltreDeger } from '@/components/masraf/masraf-filtre'
import { MasrafListe, type MasrafKpi } from '@/components/masraf/masraf-liste'
import { MasrafEkle, type DosyaSecenek } from '@/components/masraf/masraf-ekle'

export default async function MasrafPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { aktifMusteriId } = await ctx()

  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1180px] px-7 py-6">
        <Baslik />
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Üst menüden bir müşteri seçin; masraflar tenant kapsamında listelenir.</p>
        </div>
      </div>
    )
  }

  const get = (k: string) => { const v = searchParams[k]; return Array.isArray(v) ? v[0] : v }
  const f = parseFiltre(get)
  const tenant = { dosya: { is: { musteriId: aktifMusteriId } } } as const

  const [satirlar, toplamAgg, faturaAgg, belirsizN, eslesmedinN, dosyaKayit] = await Promise.all([
    masrafListele(aktifMusteriId, f),
    prisma.masraf.aggregate({ where: { ...tenant, durum: { not: 'ARSIV' } }, _count: true, _sum: { tutar: true } }),
    prisma.masraf.aggregate({ where: { ...tenant, taraf: 'BIZ', durum: { in: ['YENI', 'ONAYLI'] } }, _count: true, _sum: { tutar: true } }),
    prisma.masraf.count({ where: { ...tenant, taraf: 'BELIRSIZ', durum: { not: 'ARSIV' } } }),
    prisma.masraf.count({ where: { ...tenant, cins: null, durum: { not: 'ARSIV' } } }),
    prisma.rucuDosyasi.findMany({
      where: { musteriId: aktifMusteriId },
      select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 3000,
    }),
  ])

  const kpi: MasrafKpi = {
    toplamN: toplamAgg._count, toplamTL: Number(toplamAgg._sum.tutar ?? 0),
    faturaN: faturaAgg._count, faturaTL: Number(faturaAgg._sum.tutar ?? 0),
    belirsizN, eslesmedinN,
  }
  const dosyalar: DosyaSecenek[] = dosyaKayit.map((d) => ({
    id: d.id,
    etiket: [d.hukukDosyaNo ?? d.hasarDosyaNo, d.borclular[0]?.adUnvan].filter(Boolean).join(' · ') || d.id.slice(0, 8),
  }))
  const deger: FiltreDeger = {
    q: f.q,
    durum: f.durum ?? '',
    taraf: f.taraf && f.taraf !== 'all' ? f.taraf : '',
    cins: f.cins ?? '',
    gun: f.gun ?? '',
    bas: f.bas ?? '',
    bit: f.bit ?? '',
  }

  return (
    <div className="mx-auto max-w-[1180px] px-7 py-6">
      <Baslik adet={kpi.toplamN} right={<MasrafEkle dosyalar={dosyalar} />} />
      <MasrafFiltre deger={deger} />
      <MasrafListe satirlar={satirlar} kpi={kpi} />
    </div>
  )
}

function Baslik({ adet, right }: { adet?: number; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">KonsRücü · Faturalama</div>
        <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Masraflar</h1>
        <p className="mt-1.5 max-w-[72ch] text-sm text-muted-foreground">
          Müvekkile faturalanacak icra harç/masrafları — makbuz PDF'inden otomatik okunur, masraf tarihine göre listelenir. Yalnız <b>bizim taraf</b> ödemeleri faturalanır; <b>belirsiz</b> ve <b>eşleştirilmemiş</b> kayıtlar işaretlidir. Sağ üstten o anki filtreyi <b>Excel</b> (masraf formu) olarak indirin.
          {typeof adet === 'number' && <span className="font-mono ml-1">· {adet} kalem</span>}
        </p>
      </div>
      {right}
    </div>
  )
}
