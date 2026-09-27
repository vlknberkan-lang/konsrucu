/**
 * KonsRücü — Süre defteri okuma katmanı · lib/konsrucu/sure/sorgu.ts (server-only)
 *
 * Kapsam (M7): Sure'de musteriId yok; her sorgu `dosya: { musteriId }` üzerinden tek adımda kapsanır.
 * Hukuki kayıt: silinmiş (silindiAt dolu) satırlar listelere girmez.
 */
import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sureSatirinaCevir, sureleriSirala, type SureSatiri } from './gorunum'
import { isoGun } from './takvim'

export const SURE_SELECT = {
  id: true, dosyaId: true, borcluId: true, davaId: true, tur: true, dayanak: true,
  kaynakBelgeId: true, kaynakAlinti: true, tetikTarihi: true, tetikTuru: true, uetsUlasmaTarihi: true,
  hakimSuresiGun: true, kesinSureIhtari: true, onerilenIhtiyatli: true, onerilenSonGun: true, hesapIziJson: true,
  onaylananSonGun: true, onaylayanId: true, onayAt: true, bakilanEvrak: true, ikinciTeyitId: true, ikinciTeyitAt: true,
  sorumluId: true, durum: true, kapanisKanitiBelgeId: true, kapanisNot: true, kapanisAt: true, hatirlatmaJson: true,
  dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true, icraDosyaNo: true } },
} satisfies Prisma.SureSelect

export type DefterKapsami = 'acik' | 'kapali' | 'tum'

const KAPSAM_DURUM: Record<DefterKapsami, string[] | null> = {
  acik: ['TETIK_BEKLIYOR', 'ACIK', 'KAPANMAYA_HAZIR'],
  kapali: ['KAPANDI', 'IPTAL'],
  tum: null,
}

export async function sureleriOku(opts: { musteriId: string; dosyaId?: string; kapsam?: DefterKapsami; take?: number; simdi?: Date }): Promise<SureSatiri[]> {
  const durumlar = KAPSAM_DURUM[opts.kapsam ?? 'acik']
  const rows = await prisma.sure.findMany({
    where: {
      silindiAt: null,
      dosya: { musteriId: opts.musteriId },
      ...(opts.dosyaId ? { dosyaId: opts.dosyaId } : {}),
      ...(durumlar ? { durum: { in: durumlar } } : {}),
    },
    select: SURE_SELECT,
    orderBy: [{ onaylananSonGun: { sort: 'asc', nulls: 'last' } }, { onerilenIhtiyatli: { sort: 'asc', nulls: 'last' } }],
    take: opts.take ?? 500,
  })
  if (!rows.length) return []

  const kullaniciIds = [...new Set(rows.flatMap((r) => [r.onaylayanId, r.ikinciTeyitId, r.sorumluId]).filter((x): x is string => !!x))]
  const dosyaIds = [...new Set(rows.filter((r) => r.borcluId).map((r) => r.dosyaId))]
  const [kullanicilar, borclular] = await Promise.all([
    kullaniciIds.length
      ? prisma.kullanici.findMany({ where: { id: { in: kullaniciIds }, musteriler: { some: { musteriId: opts.musteriId } } }, select: { id: true, ad: true } })
      : Promise.resolve([] as { id: string; ad: string }[]),
    dosyaIds.length
      ? prisma.borclu.findMany({ where: { dosyaId: { in: dosyaIds }, dosya: { musteriId: opts.musteriId } }, select: { id: true, dosyaId: true }, orderBy: { id: 'asc' } })
      : Promise.resolve([] as { id: string; dosyaId: string }[]),
  ])
  const kullaniciAdlari = new Map(kullanicilar.map((k) => [k.id, k.ad]))
  const borcluSirasi = new Map<string, number>()
  const sayac = new Map<string, number>()
  for (const b of borclular) {
    const n = (sayac.get(b.dosyaId) ?? 0) + 1
    sayac.set(b.dosyaId, n)
    borcluSirasi.set(b.id, n)
  }
  return sureleriSirala(rows.map((r) => sureSatirinaCevir(r, { kullaniciAdlari, borcluSirasi })), opts.simdi)
}

/** Dosya panelindeki "Süre ekle" formu için seçenekler (borçlu sıra etiketi, dava, son evraklar). */
export async function sureFormSecenekleri(musteriId: string, dosyaId: string) {
  const [borclular, davalar, belgeler] = await Promise.all([
    prisma.borclu.findMany({ where: { dosyaId, dosya: { musteriId } }, select: { id: true, adUnvan: true }, orderBy: { id: 'asc' } }),
    prisma.dava.findMany({ where: { dosyaId, silindiAt: null, dosya: { musteriId } }, select: { id: true, mahkemeNo: true, esasYil: true, usul: true }, orderBy: { createdAt: 'asc' } }),
    prisma.belge.findMany({
      where: { dosyaId, silindiAt: null, dosya: { musteriId } },
      select: { id: true, uyapEvrakTuru: true, kategori: true, belgeTarihi: true, createdAt: true },
      orderBy: [{ belgeTarihi: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 60,
    }),
  ])
  return {
    borclular: borclular.map((b, i) => ({ id: b.id, etiket: `Borçlu ${i + 1} · ${b.adUnvan}` })),
    davalar: davalar.map((d, i) => ({ id: d.id, etiket: `Dava ${i + 1}${d.esasYil ? ` · ${d.esasYil} esas` : ''}${d.mahkemeNo ? ` · ${d.mahkemeNo}` : ''}`, usul: d.usul })),
    belgeler: belgeler.map((b) => ({ id: b.id, etiket: `${b.uyapEvrakTuru ?? b.kategori} · ${isoGun(b.belgeTarihi ?? b.createdAt)}` })),
  }
}

export type SureFormSecenekleri = Awaited<ReturnType<typeof sureFormSecenekleri>>
