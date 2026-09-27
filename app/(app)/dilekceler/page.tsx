import { notFound, redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { dilekceSureleriniHazirla } from '@/lib/konsrucu/dilekce-sureler'
import type { MasaDetay, MasaDosya } from '@/lib/konsrucu/dilekce-masa-types'
import { DilekceMasasi } from '@/components/dilekceler/dilekce-masasi'

export const metadata = { title: 'Dilekçe masası · KonsLaw' }
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export default async function DilekcelerPage({ searchParams }: { searchParams: { dosya?: string; q?: string } }) {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || !aktifMusteriId) redirect('/dashboard')
  const aktif = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
  if (!aktif) redirect('/dashboard')
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 160) : ''
  const where: Prisma.RucuDosyasiWhereInput = {
    musteriId: aktif.id,
    ...(q ? { OR: [
      { hukukDosyaNo: { contains: q, mode: 'insensitive' } },
      { hasarDosyaNo: { contains: q, mode: 'insensitive' } },
      { icraDosyaNo: { contains: q, mode: 'insensitive' } },
      { muhatapOzet: { contains: q, mode: 'insensitive' } },
      { borclular: { some: { adUnvan: { contains: q, mode: 'insensitive' } } } },
      { asamalar: { some: { kimlikNo: { contains: q, mode: 'insensitive' } } } },
    ] } : {}),
  }
  const [rows, toplam] = await Promise.all([
    prisma.rucuDosyasi.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 60, select: {
      id: true, hukukDosyaNo: true, hasarDosyaNo: true, muhatapOzet: true,
      borclular: { select: { adUnvan: true }, take: 2, orderBy: { id: 'asc' } },
      asamalar: { where: { tur: 'DAVA' }, select: { birim: true, kimlikNo: true }, take: 1, orderBy: { createdAt: 'desc' } },
      _count: { select: { ciktilar: { where: { tip: 'DILEKCE' } } } },
    } }),
    prisma.rucuDosyasi.count({ where }),
  ])
  const dosyalar: MasaDosya[] = rows.map((d) => ({
    id: d.id, no: d.asamalar[0]?.kimlikNo || d.hukukDosyaNo || d.hasarDosyaNo || d.id.slice(0, 8),
    taraf: d.borclular.map((b) => b.adUnvan).join(', ') || d.muhatapOzet || 'Taraf bilgisi eklenmemiş',
    mahkeme: d.asamalar[0]?.birim ?? null, taslakSayisi: d._count.ciktilar,
  }))
  const id = typeof searchParams.dosya === 'string' ? searchParams.dosya : dosyalar[0]?.id
  let secili: MasaDetay | null = null
  if (id) {
    const d = await prisma.rucuDosyasi.findFirst({ where: { id, musteriId: aktif.id }, select: {
      id: true, hukukDosyaNo: true, hasarDosyaNo: true, muhatapOzet: true, cikarimJson: true,
      uyapSenkronAt: true, uyapEslesme: true,
      borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } },
      asamalar: { select: { id: true, tur: true, birim: true, kimlikNo: true, baslangic: true, createdAt: true, ozet: true }, orderBy: { createdAt: 'desc' } },
      belgeler: { select: { id: true, dosyaAdi: true, belgeTarihi: true, createdAt: true, extractedText: true, storagePath: true, kaynakRef: true }, orderBy: { createdAt: 'desc' }, take: 150 },
      ciktilar: { where: { tip: 'DILEKCE' }, select: { id: true, icerik: true, durum: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 },
      notlar: { select: { id: true, metin: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 },
      olaylar: { select: { id: true, tip: true, aciklama: true, tarih: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 },
      etkinlikler: { where: { durum: 'PLANLANDI' }, select: { id: true, tur: true, baslik: true, baslar: true, biter: true, durum: true } },
      takipGorevleri: { where: { durum: { in: ['ACIK', 'ISLEMDE'] } }, select: { id: true, baslik: true, sonTarih: true, durum: true, aciklama: true } },
      onemliOlaylar: { where: { durum: { in: ['ACIK', 'ISLEMDE'] } }, select: { id: true, baslik: true, sonTarih: true, durum: true, kaynakOlayId: true, kaynakBelgeId: true } },
    } })
    if (!d) notFound()
    const dava = d.asamalar.find((a) => a.tur === 'DAVA')
    const cj = d.cikarimJson && typeof d.cikarimJson === 'object' && !Array.isArray(d.cikarimJson) ? d.cikarimJson : {}
    const ozet = typeof cj.olayBaglami === 'string' ? cj.olayBaglami : typeof cj.aciklama === 'string' ? cj.aciklama : null
    secili = {
      id: d.id, no: dava?.kimlikNo || d.hukukDosyaNo || d.hasarDosyaNo || d.id.slice(0, 8),
      taraf: d.borclular.map((b) => b.adUnvan).join(', ') || d.muhatapOzet || 'Taraf bilgisi eklenmemiş',
      mahkeme: dava?.birim ?? null, ozet, taslakSayisi: d.ciktilar.length,
      yazabilir: dbUser.rol !== 'GORUNTULEYEN', kullanicilar: [],
      belgeler: d.belgeler.map((b) => ({ id: b.id, ad: b.dosyaAdi, tarih: (b.belgeTarihi ?? b.createdAt).toISOString(), metinVar: !!b.extractedText?.trim(), acilabilir: !!b.storagePath, uyap: !!b.kaynakRef })),
      ciktilar: d.ciktilar.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      gecmis: [
        ...d.notlar.map((n) => ({ id: `not-${n.id}`, tarih: n.createdAt.toISOString(), baslik: 'Dosya notu', metin: n.metin, tarihEtiketi: 'Not tarihi' })),
        ...d.olaylar.map((o) => ({ id: `olay-${o.id}`, tarih: (o.tarih ?? o.createdAt).toISOString(), baslik: `UYAP / dosya olayı · ${o.tip}`, metin: o.aciklama ?? 'Açıklama kaydedilmemiş.', tarihEtiketi: o.tarih ? 'Olay tarihi' : 'Kayıt tarihi' })),
        ...d.asamalar.map((a) => ({ id: `asama-${a.id}`, tarih: (a.baslangic ?? a.createdAt).toISOString(), baslik: a.birim || ({ DAVA: 'Dava', ICRA_TAKIBI: 'İcra takibi', ARABULUCULUK: 'Arabuluculuk', INFAZ: 'İnfaz' }[a.tur]), metin: [a.kimlikNo, a.ozet].filter(Boolean).join(' · ') || 'Aşama açıldı.', tarihEtiketi: a.baslangic ? 'Başlangıç tarihi' : 'Kayıt tarihi' })),
      ].sort((a, b) => b.tarih.localeCompare(a.tarih)).slice(0, 40),
      sureler: dilekceSureleriniHazirla({ etkinlikler: d.etkinlikler, gorevler: d.takipGorevleri, onemliOlaylar: d.onemliOlaylar, uyapSenkronAt: d.uyapSenkronAt, uyapEslesme: d.uyapEslesme }),
    }
  }
  return <DilekceMasasi dosyalar={dosyalar} secili={secili} toplam={toplam} arama={q} />
}
