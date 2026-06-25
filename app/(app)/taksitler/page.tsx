/**
 * KonsRücü — Taksit Takvimi · app/(app)/taksitler/page.tsx
 * Çapraz-dosya tüm taksit ödemeleri (aya göre). Menüden gir → ayın gelen ödemelerini gör/işle → dosyaya entegre.
 * Tenant-kapsamlı, auth zorunlu.
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { TaksitTakvim, type TaksitUI } from '@/components/taksitler/taksit-takvim'
import { TaksitPlaniEkle, type DosyaSecenek } from '@/components/taksitler/taksit-plani-ekle'

export default async function TaksitlerPage() {
  const { aktifMusteriId } = await ctx()

  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1100px] px-7 py-6">
        <Baslik />
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Üst menüden bir müşteri seçin; taksitler tenant kapsamında listelenir.</p>
        </div>
      </div>
    )
  }

  const kayit = await prisma.taksit.findMany({
    where: { plan: { dosya: { musteriId: aktifMusteriId }, durum: { not: 'IPTAL' } } },
    orderBy: { vadeTarihi: 'asc' },
    include: {
      plan: { select: { taksitSayisi: true, dosya: { select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } } } } },
    },
  })

  const taksitler: TaksitUI[] = kayit.map((t) => ({
    id: t.id,
    dosyaId: t.plan.dosya.id,
    hukukNo: t.plan.dosya.hukukDosyaNo ?? t.plan.dosya.hasarDosyaNo,
    borclu: t.plan.dosya.borclular[0]?.adUnvan ?? null,
    sira: t.sira,
    taksitSayisi: t.plan.taksitSayisi,
    vade: t.vadeTarihi.toISOString(),
    tutar: Number(t.tutar),
    durum: t.durum,
    odendiTarih: t.odendiTarih ? t.odendiTarih.toISOString() : null,
  }))

  // Türkiye bugünü (UTC+3) — geciken/bu-ay hesabı için
  const bugun = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)

  // plan ekleme modalı için dosya listesi (aranabilir)
  const dosyaKayit = await prisma.rucuDosyasi.findMany({
    where: { musteriId: aktifMusteriId },
    select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 3000,
  })
  const dosyalar: DosyaSecenek[] = dosyaKayit.map((d) => ({ id: d.id, hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo, borclu: d.borclular[0]?.adUnvan ?? null }))

  return (
    <div className="mx-auto max-w-[1100px] px-7 py-6">
      <Baslik adet={taksitler.length} right={<TaksitPlaniEkle dosyalar={dosyalar} />} />
      <TaksitTakvim taksitler={taksitler} bugun={bugun} />
    </div>
  )
}

function Baslik({ adet, right }: { adet?: number; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">KonsRücü · Tahsilat</div>
        <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Taksit Takvimi</h1>
        <p className="mt-1.5 max-w-[68ch] text-sm text-muted-foreground">
          Tüm dosyalardaki taksit ödemeleri tek yerde — aya göre. Vadesi gelen taksiti <b>“Ödendi”</b> ile işleyin; tahsilat ilgili dosyaya işlenir, plan bitince dosya <b>Tahsil</b> olur.
          {typeof adet === 'number' && <span className="font-mono ml-1">· {adet} taksit</span>}
        </p>
      </div>
      {right}
    </div>
  )
}
