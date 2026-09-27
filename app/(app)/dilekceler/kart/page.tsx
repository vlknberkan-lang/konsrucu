import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { KVKK_KAPALI_MESAJI, yuzeyAcik } from '@/lib/ai/bayrak'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { gecerliKart, kartGecmisi, kartGorunumu } from '@/lib/konsrucu/dilekce-v2/kart-veri'
import { kartTuruMu, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { DosyaKartiEkrani } from '@/components/dilekce-v2/dosya-karti'

export const metadata = { title: 'Dosya kartı · KonsLaw' }
export const dynamic = 'force-dynamic'
// Kart hazırlama (yapay zekâ çıkarımı) bu sayfadan çağrılır; AI zaman aşımı 100 sn (B54).
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function DosyaKartiSayfasi({ searchParams }: { searchParams: { dosya?: string; tur?: string } }) {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || !aktifMusteriId) redirect('/dashboard')
  const dosyaId = typeof searchParams.dosya === 'string' && UUID.test(searchParams.dosya) ? searchParams.dosya : null
  // Bayrak kapalıyken eski masa aynen çalışır (S35 geri dönüş)
  if (!dilekceV2Acik(dbUser.rol)) redirect(dosyaId ? `/dilekceler?dosya=${encodeURIComponent(dosyaId)}` : '/dilekceler')
  if (!dosyaId) redirect('/dilekceler')
  const tur: KartTuru = kartTuruMu(searchParams.tur) ? searchParams.tur : 'DAVA'

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId: aktifMusteriId },
    select: {
      id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDosyaNo: true, muhatapOzet: true,
      borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' }, take: 3 },
      belgeler: { where: { silindiAt: null }, select: { id: true, dosyaAdi: true }, orderBy: { createdAt: 'desc' }, take: 200 },
    },
  })
  if (!dosya) notFound()

  const [kart, gecmis] = await Promise.all([
    gecerliKart(prisma, aktifMusteriId, dosya.id, tur),
    kartGecmisi(prisma, aktifMusteriId, dosya.id, tur),
  ])
  const aiAcik = yuzeyAcik('dilekce') && !!process.env.ANTHROPIC_API_KEY
  const no = dosya.hukukDosyaNo || dosya.icraDosyaNo || dosya.hasarDosyaNo || dosya.id.slice(0, 8)

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pt-5 lg:px-7">
        <Link href={`/dilekceler?dosya=${encodeURIComponent(dosya.id)}`} className="text-xs font-semibold text-primary hover:underline">← Dilekçe masasına dön</Link>
      </div>
      <DosyaKartiEkrani
        dosya={{ id: dosya.id, no, taraf: dosya.borclular.map((b) => b.adUnvan).join(', ') || dosya.muhatapOzet || 'Taraf bilgisi eklenmemiş' }}
        tur={tur}
        kart={kart ? kartGorunumu(kart, tur) : null}
        gecmis={gecmis.map((g) => ({ id: g.id, surum: g.surum, durum: g.durum, onayAt: g.onayAt?.toISOString() ?? null, createdAt: g.createdAt.toISOString() }))}
        belgeler={dosya.belgeler.map((b) => ({ id: b.id, ad: b.dosyaAdi }))}
        yetki={{ yazabilir: dbUser.rol !== 'GORUNTULEYEN', avukat: avukatRoluMu(dbUser.rol) }}
        ai={{ acik: aiAcik, mesaj: aiAcik ? null : `${KVKK_KAPALI_MESAJI} Kart kayıtlı ve onaylı alanlardan kurulur; belgelerden olgu çıkarılmaz.` }}
      />
    </>
  )
}
