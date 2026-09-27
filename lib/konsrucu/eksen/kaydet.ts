/**
 * KonsRücü — Eksen hesabını yükle, türet, GÖLGE olarak yaz · lib/konsrucu/eksen/kaydet.ts (server)
 *
 * Plan S15 `lib/eksen/kaydet.ts`: önbellek (RucuDosyasi.icraEksen / arabEksen / davaEksen / eksenJson /
 * eksenHesapAt) + DurumGecisi(golge = true). Gölge kipte:
 *   • eski `durum` alanına DOKUNULMAZ (06 M3; listeler, raporlar, Bugün masası eski durumu okur),
 *   • yalnız değer ya da güven değiştiğinde iz satırı yazılır (DurumGecisi yalnız eklenir, hiç silinmez),
 *   • hesap hatası çağıranın işini (senkron, onay) bozmaz — çağıran try/catch ile sarar.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { eksenAcik } from './bayrak'
import { eksenJsonKur, eksenTuret, type EksenGirdi, type EksenSonuc } from './turet'

type EksenKey = 'ICRA' | 'ARAB' | 'DAVA'

/** Dosyanın eksen girdisini DB'den kurar (tek sorgu). Dosya yoksa null. */
export async function eksenGirdisiYukle(dosyaId: string): Promise<(EksenGirdi & { onceki: OncekiEksen }) | null> {
  const d = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: {
      id: true, durum: true, icraDosyaNo: true, takipTarihi: true, yolOnaylayanId: true, kapanisSebebi: true, kapanisAt: true,
      icraEksen: true, arabEksen: true, davaEksen: true, eksenJson: true,
      borclular: {
        select: {
          id: true,
          takip: { select: { id: true, tebligTarihi: true, tebligSonucu: true, itirazVar: true, itirazTipi: true, itirazAlacakliyaTebligTarihi: true, silindiAt: true } },
        },
      },
      olaylar: {
        where: { teyit: { in: ['ADAY', 'TEYITLI'] } },
        select: { id: true, altTip: true, teyit: true, borcluId: true, hukukiTarih: true, sonuc: true, kural: true },
      },
      arabuluculuklar: {
        where: { silindiAt: null }, orderBy: { createdAt: 'desc' }, take: 1,
        select: { id: true, basvuruTarihi: true, sonTutanakTarihi: true, sonuc: true, onayAt: true },
      },
      yolSecimleri: {
        where: { silindiAt: null, durum: 'GECERLI', asama: 'ITIRAZ_SONRASI' }, orderBy: { secimAt: 'desc' }, take: 1,
        select: { id: true, secim: true },
      },
      davalar: {
        where: { silindiAt: null },
        select: { id: true, durum: true, rolumuz: true, derece: true, kesinlesmeTarihi: true, kesinlesmeBelgeId: true, kararOnayAt: true, createdAt: true },
      },
      asamalar: {
        where: { tur: { in: ['ARABULUCULUK', 'DAVA'] }, durum: { not: 'IPTAL' } },
        select: { id: true, tur: true, durum: true, sonuc: true },
      },
      takipTalepleri: { where: { silindiAt: null, gecerli: true, dondurulduAt: { not: null } }, take: 1, select: { id: true } },
    },
  })
  if (!d) return null
  return {
    durum: d.durum,
    icraDosyaNo: d.icraDosyaNo,
    takipTarihi: d.takipTarihi,
    tevziVar: d.takipTalepleri.length > 0 && !d.icraDosyaNo,
    yolOnayli: !!d.yolOnaylayanId,
    kapanisSebebi: d.kapanisSebebi,
    kapanisAt: d.kapanisAt,
    borclular: d.borclular.map((b) => ({ id: b.id, takip: b.takip && !b.takip.silindiAt ? b.takip : null })),
    olaylar: d.olaylar,
    arabuluculuk: d.arabuluculuklar[0] ?? null,
    yolSecimi: d.yolSecimleri[0] ?? null,
    davalar: d.davalar,
    eskiAsamalar: d.asamalar.map((a) => ({ id: a.id, tur: a.tur, durum: a.durum, sonuc: a.sonuc })),
    onceki: { icra: d.icraEksen, arab: d.arabEksen, dava: d.davaEksen, json: d.eksenJson },
  }
}

export type OncekiEksen = { icra: string | null; arab: string | null; dava: string | null; json: unknown }

export type EksenGecisi = { eksen: EksenKey; eski: string | null; yeni: string; teyit: 'TEYITLI' | 'TEYITSIZ'; sebep: string; kaynakIds: string[] }

function oncekiTeyit(json: unknown, anahtar: 'icra' | 'arab' | 'dava'): string | null {
  if (!json || typeof json !== 'object') return null
  const p = (json as Record<string, { teyit?: unknown } | undefined>)[anahtar]
  return typeof p?.teyit === 'string' ? p.teyit : null
}

/** Önceki önbellek ile yeni sonuç arasındaki geçişler (değer ya da güven değiştiyse). Saf. */
export function eksenGecisleri(onceki: OncekiEksen, s: EksenSonuc): EksenGecisi[] {
  const out: EksenGecisi[] = []
  const bak = (eksen: EksenKey, anahtar: 'icra' | 'arab' | 'dava', eski: string | null) => {
    const e = s[anahtar]
    const eskiTeyit = oncekiTeyit(onceki.json, anahtar)
    if (eski === e.deger && eskiTeyit === e.teyit) return
    out.push({ eksen, eski, yeni: e.deger, teyit: e.teyit, sebep: [e.kural, ...e.notlar.slice(0, 1)].join(' · ').slice(0, 500), kaynakIds: e.kanitIds })
  }
  bak('ICRA', 'icra', onceki.icra)
  bak('ARAB', 'arab', onceki.arab)
  bak('DAVA', 'dava', onceki.dava)
  return out
}

/**
 * Ekseni yeniden hesaplar ve gölge olarak yazar. EKSEN_KIPI kapalıyken hiçbir şey yazmaz (null döner).
 * opts.kaynakTuru: senkron ve kural tetiklerinde KURAL; avukatın onay/ret/geri alma eylemlerinde AVUKAT.
 * opts.eskiDurum: aynı turda eski `durum` değiştiyse iz satırı (eksen = ESKI_DURUM, golge = false).
 */
export async function eksenYenidenHesapla(
  dosyaId: string,
  opts: {
    sebep?: string
    kaynakTuru?: 'KURAL' | 'AVUKAT'
    kaynakId?: string | null
    kullaniciId?: string | null
    eskiDurum?: { eski: string; yeni: string; sebep: string } | null
    zorla?: boolean
  } = {},
): Promise<{ sonuc: EksenSonuc; gecisler: EksenGecisi[] } | null> {
  if (!opts.zorla && !eksenAcik()) return null
  const g = await eksenGirdisiYukle(dosyaId)
  if (!g) return null
  const sonuc = eksenTuret(g)
  const gecisler = eksenGecisleri(g.onceki, sonuc)
  const kaynakTuru = opts.kaynakTuru ?? 'KURAL'
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.rucuDosyasi.update({
      where: { id: dosyaId },
      data: {
        icraEksen: sonuc.icra.deger, arabEksen: sonuc.arab.deger, davaEksen: sonuc.dava.deger,
        eksenJson: eksenJsonKur(sonuc) as unknown as Prisma.InputJsonValue, eksenHesapAt: new Date(),
      },
    }),
    ...gecisler.map((x) => prisma.durumGecisi.create({
      data: {
        dosyaId, eksen: x.eksen, eski: x.eski, yeni: x.yeni, teyit: x.teyit,
        sebep: (opts.sebep ? `${opts.sebep} · ${x.sebep}` : x.sebep).slice(0, 1000),
        kaynakTuru, kaynakId: opts.kaynakId ?? x.kaynakIds[0] ?? null, kullaniciId: opts.kullaniciId ?? null, golge: true,
      },
    })),
  ]
  if (opts.eskiDurum && opts.eskiDurum.eski !== opts.eskiDurum.yeni) {
    ops.push(prisma.durumGecisi.create({
      data: {
        dosyaId, eksen: 'ESKI_DURUM', eski: opts.eskiDurum.eski, yeni: opts.eskiDurum.yeni, teyit: 'TEYITSIZ',
        sebep: opts.eskiDurum.sebep.slice(0, 1000), kaynakTuru: 'KURAL', kaynakId: opts.kaynakId ?? null, kullaniciId: opts.kullaniciId ?? null, golge: false,
      },
    }))
  }
  await prisma.$transaction(ops)
  return { sonuc, gecisler }
}
