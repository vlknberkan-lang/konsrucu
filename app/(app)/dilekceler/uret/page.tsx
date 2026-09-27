import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { icerikOku } from '@/lib/konsrucu/dilekce-v2/kart-veri'
import { kartTuruMu, type KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { DilekceUretici, type DilekceSurumGorunumu } from '@/components/dilekce-v2/dilekce-uretici'

export const metadata = { title: 'Dilekçe taslağı · KonsLaw' }
export const dynamic = 'force-dynamic'
// Taslak üretimi bu sayfadan çağrılır; AÇIKLAMALAR yapay zekâsı için 100 sn zaman aşımı (B54).
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function DilekceUretimSayfasi({ searchParams }: { searchParams: { dosya?: string; tur?: string } }) {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || !aktifMusteriId) redirect('/dashboard')
  const dosyaId = typeof searchParams.dosya === 'string' && UUID.test(searchParams.dosya) ? searchParams.dosya : null
  if (!dilekceV2Acik(dbUser.rol)) redirect(dosyaId ? `/dilekceler?dosya=${encodeURIComponent(dosyaId)}` : '/dilekceler')
  if (!dosyaId) redirect('/dilekceler')
  const tur: KartTuru = kartTuruMu(searchParams.tur) ? searchParams.tur : 'DAVA'

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId: aktifMusteriId },
    select: { id: true, hukukDosyaNo: true, icraDosyaNo: true, hasarDosyaNo: true, muhatapOzet: true, borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' }, take: 3 } },
  })
  if (!dosya) notFound()

  const kart = await prisma.dosyaKarti.findFirst({
    where: { dosyaId, tur, durum: 'ONAYLI', silindiAt: null, dosya: { musteriId: aktifMusteriId } },
    orderBy: { surum: 'desc' },
    select: { icerikJson: true },
  })
  const kartIcerik = kart ? icerikOku(kart.icerikJson, tur) : null

  const cikti = await prisma.uretilenCikti.findFirst({ where: { dosyaId, tip: 'DILEKCE', tur }, orderBy: { createdAt: 'desc' }, select: { id: true } })
  const surumSatirlari = cikti
    ? await prisma.dilekceSurum.findMany({
        where: { ciktiId: cikti.id, silindiAt: null },
        orderBy: { sira: 'desc' }, take: 40,
        select: { id: true, sira: true, kaynak: true, icerik: true, durum: true, olguBaglariJson: true, uretimJson: true, createdAt: true },
      })
    : []
  // sira N (AI_HAM) + N+1 (AVUKAT) çiftlerini eşleştir; her üretim yeni bir çift açar (eskisi ezilmez).
  const ciftler: DilekceSurumGorunumu[] = []
  for (const s of surumSatirlari.filter((x) => x.kaynak === 'AVUKAT')) {
    const ham = surumSatirlari.find((x) => x.kaynak === 'AI_HAM' && x.sira === s.sira - 1)
    if (!ham) continue
    const uretim = s.uretimJson && typeof s.uretimJson === 'object' && !Array.isArray(s.uretimJson) ? (s.uretimJson as Record<string, unknown>) : {}
    ciftler.push({
      avukatId: s.id, avukatIcerik: s.icerik, avukatDurum: s.durum, hamId: ham.id, hamIcerik: ham.icerik,
      sira: s.sira, createdAt: s.createdAt.toISOString(),
      olguBaglari: Array.isArray(s.olguBaglariJson) ? (s.olguBaglariJson as { paragraf: string; olguIdleri: string[] }[]) : [],
      uyarilar: Array.isArray(uretim.uyarilar) ? (uretim.uyarilar as string[]) : [],
    })
  }

  const no = dosya.hukukDosyaNo || dosya.icraDosyaNo || dosya.hasarDosyaNo || dosya.id.slice(0, 8)
  return (
    <>
      <div className="mx-auto max-w-[1400px] px-4 pt-5 lg:px-7">
        <Link href={`/dilekceler/kart?dosya=${encodeURIComponent(dosya.id)}&tur=${tur}`} className="text-xs font-semibold text-primary hover:underline">← Dosya kartına dön</Link>
      </div>
      <DilekceUretici
        dosya={{ id: dosya.id, no, taraf: dosya.borclular.map((b) => b.adUnvan).join(', ') || dosya.muhatapOzet || 'Taraf bilgisi eklenmemiş' }}
        tur={tur}
        kartKilitli={!!kartIcerik}
        olgular={(kartIcerik?.olgular ?? []).map((o) => ({ id: o.id, metin: o.metin, kaynakEtiketi: o.kaynakEtiketi }))}
        surumler={ciftler}
        yazabilir={dbUser.rol !== 'GORUNTULEYEN'}
        avukat={avukatRoluMu(dbUser.rol)}
      />
    </>
  )
}
