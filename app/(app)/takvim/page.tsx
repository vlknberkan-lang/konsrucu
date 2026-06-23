/**
 * KonsRücü — Takvim · app/(app)/takvim/page.tsx
 * Tüm dosyalardaki etkinlikler (toplantı/duruşma/süre) tek takvimde. Tenant-kapsamlı, auth zorunlu.
 */
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { ozetKur } from '@/components/konsrucu/dosya-ozet'
import { Takvim, type TakvimEtkinlik } from '@/components/takvim/takvim'
import { EtkinlikEkle, type DosyaSecenek } from '@/components/takvim/etkinlik-ekle'

export default async function TakvimPage() {
  const { aktifMusteriId } = await ctx()

  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1400px] px-7 py-6">
        <Baslik />
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
          <div className="font-display text-lg font-bold text-danger">Aktif müşteri seçili değil</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13px] text-muted-foreground">Üst menüden bir müşteri seçin; takvim tenant kapsamında gösterilir.</p>
        </div>
      </div>
    )
  }

  const kayitlar = await prisma.etkinlik.findMany({
    where: { dosya: { musteriId: aktifMusteriId } },
    orderBy: { baslar: 'asc' },
    include: {
      dosya: {
        select: {
          id: true, hukukDosyaNo: true, durum: true, icraDosyaNo: true,
          asilAlacak: true, faizTutari: true, rucuTutari: true, kusurDurumu: true, rucuOrani: true, zamanasimi: true,
          borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } },
        },
      },
    },
  })

  const etkinlikler: TakvimEtkinlik[] = kayitlar.map((e) => ({
    id: e.id,
    tur: e.tur,
    baslik: e.baslik,
    baslar: e.baslar.toISOString(),
    biter: e.biter ? e.biter.toISOString() : null,
    yer: e.yer,
    online: e.online,
    durum: e.durum,
    dosyaId: e.dosyaId,
    ozet: ozetKur(e.dosya),
  }))

  // "Etkinlik Ekle" için dosya listesi (aranabilir seçim)
  const dosyaKayit = await prisma.rucuDosyasi.findMany({
    where: { musteriId: aktifMusteriId },
    select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, borclular: { select: { adUnvan: true }, take: 1, orderBy: { id: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 3000,
  })
  const dosyalar: DosyaSecenek[] = dosyaKayit.map((d) => ({ id: d.id, hukukNo: d.hukukDosyaNo ?? d.hasarDosyaNo, borclu: d.borclular[0]?.adUnvan ?? null }))

  return (
    <div className="mx-auto max-w-[1400px] px-7 py-6">
      <Baslik adet={etkinlikler.length} right={<EtkinlikEkle dosyalar={dosyalar} />} />
      <Takvim etkinlikler={etkinlikler} />
    </div>
  )
}

function Baslik({ adet, right }: { adet?: number; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">KonsRücü · Ajanda</div>
        <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Takvim</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">
          Tüm dosyalardaki arabuluculuk toplantıları, duruşmalar ve süreler.
          {typeof adet === 'number' && <span className="font-mono ml-1">· {adet} etkinlik</span>}
        </p>
      </div>
      {right}
    </div>
  )
}
