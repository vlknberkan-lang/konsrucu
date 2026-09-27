import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { MevzuatKutuphanesi } from '@/components/dilekce-v2/mevzuat-kutuphanesi'

export const metadata = { title: 'Atıf kütüphanesi · KonsLaw' }
export const dynamic = 'force-dynamic'

const TUR_SIRASI: Record<string, number> = { MEVZUAT: 0, GENEL_SART: 1, ICTIHAT: 2 }

export default async function AtifKutuphanesiSayfasi() {
  const { dbUser, aktifMusteriId, izinli } = await ctx()
  if (!dbUser.aktif || !aktifMusteriId) redirect('/dashboard')
  if (!dilekceV2Acik(dbUser.rol)) redirect('/dilekceler')
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true, ad: true } })
  if (!musteri) redirect('/dashboard')

  const [kayitlar, digerMusteriler] = await Promise.all([
    prisma.mevzuatKaynak.findMany({ where: { musteriId: musteri.id } }),
    prisma.musteri.findMany({ where: { id: { in: izinli.filter((x) => x !== musteri.id) }, aktif: true }, select: { id: true, ad: true }, orderBy: { ad: 'asc' } }),
  ])
  const dogrulayanIds = [...new Set(kayitlar.map((k) => k.dogrulayanId).filter((x): x is string => !!x))]
  const kullanicilar = dogrulayanIds.length ? await prisma.kullanici.findMany({ where: { id: { in: dogrulayanIds } }, select: { id: true, ad: true } }) : []
  const ad = new Map(kullanicilar.map((k) => [k.id, k.ad]))
  const iso = (d: Date | null) => d?.toISOString() ?? null

  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-5 lg:px-7">
        <Link href="/dilekceler" className="text-xs font-semibold text-primary hover:underline">← Dilekçe masasına dön</Link>
      </div>
      <MevzuatKutuphanesi
        musteriAdi={musteri.ad}
        kayitlar={kayitlar
          .sort((a, b) => Number(b.aktif) - Number(a.aktif) || (TUR_SIRASI[a.tur] ?? 9) - (TUR_SIRASI[b.tur] ?? 9) || a.kunye.localeCompare(b.kunye, 'tr'))
          .map((k) => ({
            id: k.id, kunye: k.kunye, tur: k.tur, alinti: k.alinti, resmiUrl: k.resmiUrl, erisimTarihi: iso(k.erisimTarihi),
            yururlukBas: iso(k.yururlukBas), yururlukBit: iso(k.yururlukBit), etiket: k.etiket, durum: k.durum, kapsamNotu: k.kapsamNotu,
            rucuSebebiKodlari: k.rucuSebebiKodlari, aktif: k.aktif, dogrulayanAdi: k.dogrulayanId ? ad.get(k.dogrulayanId) ?? null : null,
            dogrulamaAt: iso(k.dogrulamaAt), yuklemeId: k.yuklemeId, kopyaKaynakId: k.kopyaKaynakId, updatedAt: k.updatedAt.toISOString(),
          }))}
        hedefMusteriler={digerMusteriler}
        yetki={{ avukat: avukatRoluMu(dbUser.rol), yonetici: dbUser.rol === 'ADMIN' }}
      />
    </>
  )
}
