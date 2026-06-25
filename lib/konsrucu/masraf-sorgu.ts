/**
 * KonsRücü — Masraf sorgu/filtre/eşleme · lib/konsrucu/masraf-sorgu.ts (server-only)
 * Masraflar sayfası VE /api/masraf/export AYNI where/orderBy/mapper'ı buradan alır → tutarlılık.
 * Tenant kapsamı: Masraf'ta musteriId YOK → her zaman dosya.musteriId üzerinden süzülür.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { MasrafUi, MasrafDurumKod, MasrafTarafKod } from './masraf'

export type MasrafFiltre = {
  q: string
  durum: MasrafDurumKod | 'all' | null // null = varsayılan (ARŞİV hariç hepsi)
  taraf: MasrafTarafKod | 'all' | null
  cins: string | null // tam kalem adı, ya da 'YOK' = eşleşmeyen (cins null)
  gun: string | null // tek gün YYYY-MM-DD
  bas: string | null // tarih aralığı başlangıç YYYY-MM-DD
  bit: string | null // tarih aralığı bitiş YYYY-MM-DD
  dosyaId: string | null // tek dosya kapsamı (per-dosya görünüm)
}

const DURUMLAR: MasrafDurumKod[] = ['YENI', 'ONAYLI', 'FATURALANDI', 'TAHSIL', 'ARSIV']
const TARAFLAR: MasrafTarafKod[] = ['BIZ', 'KARSI', 'BELIRSIZ']
const gecerliGun = (s: string | null | undefined): string | null =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null

/** searchParams (Record veya URLSearchParams) → MasrafFiltre. get(key) string|null döndürür. */
export function parseFiltre(get: (k: string) => string | null | undefined): MasrafFiltre {
  const s = (k: string) => {
    const v = get(k)
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }
  const durumRaw = s('durum')
  const tarafRaw = s('taraf')
  return {
    q: s('q') ?? '',
    durum: durumRaw === 'all' ? 'all' : (DURUMLAR.includes(durumRaw as MasrafDurumKod) ? (durumRaw as MasrafDurumKod) : null),
    taraf: tarafRaw === 'all' ? 'all' : (TARAFLAR.includes(tarafRaw as MasrafTarafKod) ? (tarafRaw as MasrafTarafKod) : null),
    cins: s('cins'),
    gun: gecerliGun(s('gun')),
    bas: gecerliGun(s('bas')),
    bit: gecerliGun(s('bit')),
    dosyaId: s('dosya'),
  }
}

function tarihAraligi(f: MasrafFiltre): Prisma.DateTimeNullableFilter | undefined {
  if (f.gun) {
    const g = new Date(`${f.gun}T00:00:00.000Z`)
    const ertesi = new Date(g.getTime() + 86_400_000)
    return { gte: g, lt: ertesi }
  }
  const r: Prisma.DateTimeNullableFilter = {}
  if (f.bas) r.gte = new Date(`${f.bas}T00:00:00.000Z`)
  if (f.bit) r.lt = new Date(new Date(`${f.bit}T00:00:00.000Z`).getTime() + 86_400_000)
  return r.gte || r.lt ? r : undefined
}

/** Tenant + filtrelere göre Prisma where. */
export function masrafWhere(musteriId: string, f: MasrafFiltre): Prisma.MasrafWhereInput {
  const w: Prisma.MasrafWhereInput = { dosya: { is: { musteriId } } }
  if (f.dosyaId) w.dosyaId = f.dosyaId

  // durum: belirli kod → o; 'all' → filtre yok; null (varsayılan) → ARŞİV hariç
  if (f.durum && f.durum !== 'all') w.durum = f.durum
  else if (f.durum == null) w.durum = { not: 'ARSIV' }

  if (f.taraf && f.taraf !== 'all') w.taraf = f.taraf

  if (f.cins === 'YOK') w.cins = null
  else if (f.cins) w.cins = f.cins

  const tarih = tarihAraligi(f)
  if (tarih) w.tarih = tarih

  if (f.q) {
    const q = f.q
    w.OR = [
      { dekontNo: { contains: q, mode: 'insensitive' } },
      { cinsHam: { contains: q, mode: 'insensitive' } },
      { cins: { contains: q, mode: 'insensitive' } },
      { sorumlu: { contains: q, mode: 'insensitive' } },
      { dosya: { is: { hasarDosyaNo: { contains: q, mode: 'insensitive' } } } },
      { dosya: { is: { hukukDosyaNo: { contains: q, mode: 'insensitive' } } } },
      { dosya: { is: { icraDosyaNo: { contains: q, mode: 'insensitive' } } } },
      { dosya: { is: { sigortaliUnvan: { contains: q, mode: 'insensitive' } } } },
    ]
  }
  return w
}

// Excel C–F + tablo için dosya/aşama künyesi + makbuz adı (önizleme)
export const MASRAF_INCLUDE = {
  dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true, icraDairesi: true, icraDosyaNo: true, sigortaliUnvan: true } },
  asama: { select: { birim: true, kimlikNo: true } },
  belge: { select: { dosyaAdi: true } },
} satisfies Prisma.MasrafInclude

type MasrafRow = Prisma.MasrafGetPayload<{ include: typeof MASRAF_INCLUDE }>

/** Prisma satırı → MasrafUi (Decimal→number, Date→ISO, künye birleştirme). */
export function masrafToUi(m: MasrafRow): MasrafUi {
  return {
    id: m.id,
    dosyaId: m.dosyaId,
    hukukKodu: m.dosya?.hukukDosyaNo ?? null,
    hasarDosya: m.dosya?.hasarDosyaNo ?? null,
    mahkeme: m.asama?.birim ?? m.dosya?.icraDairesi ?? null,
    esas: m.asama?.kimlikNo ?? m.dosya?.icraDosyaNo ?? null,
    sigortali: m.dosya?.sigortaliUnvan ?? null,
    dekontNo: m.dekontNo,
    makbuzSayi: m.makbuzSayi,
    makbuzNo: m.makbuzNo,
    tutar: Number(m.tutar),
    tarih: m.tarih ? m.tarih.toISOString() : null,
    cinsHam: m.cinsHam,
    cins: m.cins,
    cinsGuven: m.cinsGuven,
    taraf: m.taraf as MasrafTarafKod,
    sorumlu: m.sorumlu,
    belgeId: m.belgeId,
    belgeAdi: m.belge?.dosyaAdi ?? null,
    belgeli: !!m.belgeId,
    durum: m.durum as MasrafDurumKod,
    faturaDonem: m.faturaDonem,
    faturaTarihi: m.faturaTarihi ? m.faturaTarihi.toISOString() : null,
    kaynak: m.kaynak,
    guven: m.guven,
    createdAt: m.createdAt.toISOString(),
  }
}

/** Liste: tarih (yoksa createdAt) DESC. take üst sınır güvenlik için. */
export async function masrafListele(musteriId: string, f: MasrafFiltre, take = 5000): Promise<MasrafUi[]> {
  const rows = await prisma.masraf.findMany({
    where: masrafWhere(musteriId, f),
    orderBy: [{ tarih: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take,
    include: MASRAF_INCLUDE,
  })
  return rows.map(masrafToUi)
}
