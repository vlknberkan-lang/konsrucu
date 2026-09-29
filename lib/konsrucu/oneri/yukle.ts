/**
 * KonsRücü — Öneri paneli yükleyicisi · lib/konsrucu/oneri/yukle.ts  (SUNUCU; Server Component'ten çağrılır)
 *
 * Dosya sayfası (Bağla aşaması) tek çağrıyla beş bileşenin verisini alır:
 *   const panel = await oneriPaneliYukle(dosyaId)
 *   <AiCikarim veri={panel.aiCikarim} />
 *   <Bulduklarimiz veri={panel.bulduklarimiz} /> · <RucuSebebiSec veri={panel.rucuSebebi} />
 *   <EksikEvrak veri={panel.eksikEvrak} /> · <YetkiliIcraSec veri={panel.yetkiliIcra} />
 * Kapsam: oturum + aktif müvekkil (musteriId). Başka müvekkilin dosyası → null. Kişisel veri gorunum.ts'te maskelenir.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { gorselAiAcik, yuzeyAcik } from '@/lib/ai/bayrak'
import { rucuSebebiKoduMu, type RucuSebebiKodu } from '@/lib/konsrucu/rucu-sebebi'
import { kullaniciYetkisi } from './karar'
import { listeKaynagi } from './kaynaklar'
import { aiCikarimKur, hapKur, bulduklarimizKur, eksikEvrakKur, rucuSebebiKur, yetkiliIcraKur, type PanelSatiri } from './gorunum'
import type { OneriPaneli } from './tipler'

/** Dosyadaki son başarılı yapay zekâ çıkarımı: eski ekranın aiCikar'ı ya da "AI ile Çıkarım Yap" (KURAL_ONERI + ai TAMAM). */
export function sonAiCikarimi(dosyaId: string) {
  return prisma.aktivite.findFirst({
    where: {
      dosyaId,
      OR: [
        { detayJson: { path: ['tur'], equals: 'AI_CIKARIM_BIRLESTIR' } },
        { AND: [{ detayJson: { path: ['tur'], equals: 'KURAL_ONERI' } }, { detayJson: { path: ['ai'], equals: 'TAMAM' } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, kullanici: { select: { ad: true } } },
  })
}

/** Onaylı yetkili icra değerinden daire adı. */
function yetkiliIcraGorunum(v: unknown): string | null {
  return v && typeof v === 'object' && typeof (v as { icraDairesi?: unknown }).icraDairesi === 'string' ? (v as { icraDairesi: string }).icraDairesi : null
}

export async function oneriPaneliYukle(dosyaId: string): Promise<OneriPaneli | null> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!aktifMusteriId || !dosyaId) return null
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId: aktifMusteriId },
    select: {
      id: true, musteriId: true, hukukDosyaNo: true, hasarDosyaNo: true, brans: true, rucuSebebi: true, rucuTutari: true,
      kazaYeri: true, il: true, yetkiliIcra: true, policeBaslangic: true, kaynakJson: true,
      cikarimJson: true, yol: true, yolGuven: true, yolNeden: true,
      borclular: { select: { id: true, adUnvan: true, adres: true, tcVkn: true, rol: true, kaynak: true, teyitDurumu: true }, orderBy: { id: 'asc' } },
      belgeler: { where: { silindiAt: null }, select: { id: true, dosyaAdi: true, storagePath: true, kategori: true, altTur: true, silindiAt: true } },
      odemeler: { select: { tutar: true, haricMi: true } },
    },
  })
  if (!dosya) return null

  const bizimBelge = { dosyaId, silindiAt: null, kaynakRef: null }
  const gorselAcik = gorselAiAcik()
  // İncelenmeyi bekleyen: metni yok ve görsel okumadan geçmemiş (AI_OKUMA/GEREKSIZ/KVKK_ATLANDI/OKUNAMADI değil).
  // Görsel AI açıksa her görüntü ve PDF (yerelde "Hasar fotoğrafı" sayılan yatay tutanak dahil) okumaya aday;
  // kapalıyken yalnız fotoğraf dışı olanlar sayılır (kartta "okunmuyor" uyarısı).
  const bekleyenOkuma = {
    ...bizimBelge, extractedText: null, NOT: { storagePath: '' },
    AND: [
      { OR: [{ metinDurumu: null }, { metinDurumu: 'BEKLIYOR' }] },
      { OR: [{ aiIzni: null }, { aiIzni: { not: 'YASAK' } }] },
      gorselAcik
        ? { OR: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'].map((u) => ({ dosyaAdi: { endsWith: u, mode: 'insensitive' as const } })) }
        : { kategori: { not: 'HASAR_FOTO' as const } },
    ],
  }
  const [satirlarHam, ayarlar, metinliBelge, metinsizBelge, sonAi] = await Promise.all([
    prisma.alanDegeri.findMany({
      where: { dosyaId, silindiAt: null, durum: { in: ['ONERI', 'ONAYLI'] } },
      select: {
        id: true, alan: true, degerJson: true, kaynakTuru: true, kaynakBelgeId: true, sayfa: true, alinti: true, alintiDogru: true,
        guven: true, uretici: true, durum: true, onaylayanId: true, onayAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
    prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId }, select: { vekilAd: true } }),
    prisma.belge.count({ where: { ...bizimBelge, extractedText: { not: null } } }),
    prisma.belge.count({ where: bekleyenOkuma }),
    sonAiCikarimi(dosyaId),
  ])
  const satirlar = satirlarHam as PanelSatiri[]
  const onaylayanIdler = [...new Set(satirlar.map((s) => s.onaylayanId).filter((x): x is string => !!x))]
  const kullanicilar: Record<string, string> = {}
  if (onaylayanIdler.length) {
    for (const k of await prisma.kullanici.findMany({ where: { id: { in: onaylayanIdler } }, select: { id: true, ad: true } })) kullanicilar[k.id] = k.ad
  }

  const yetki = kullaniciYetkisi(dbUser)
  const onayliDeger = (alan: string) => satirlar.find((s) => s.alan === alan && s.durum === 'ONAYLI')?.degerJson ?? null
  const onayliKodHam = onayliDeger('rucuSebebiKod')
  const onayliKod: RucuSebebiKodu | null = rucuSebebiKoduMu(onayliKodHam) ? onayliKodHam : null
  const oneriKodSatiri = satirlar
    .filter((s) => s.alan === 'rucuSebebiKod' && s.durum === 'ONERI' && rucuSebebiKoduMu(s.degerJson))
    .sort((a, b) => (b.guven ?? 0) - (a.guven ?? 0))[0]
  const oneriKod = oneriKodSatiri ? (oneriKodSatiri.degerJson as RucuSebebiKodu) : null
  const tanzim = onayliDeger('policeTanzimTarihi')
  const odemeToplami = dosya.odemeler.filter((o) => !o.haricMi && o.tutar != null).reduce((t, o) => t + Number(o.tutar), 0)

  return {
    aiCikarim: aiCikarimKur({
      dosyaId, yetki, aiAcik: yuzeyAcik('cikarim'), gorselAcik, cikarimJson: dosya.cikarimJson,
      yol: dosya.yol, yolGuven: dosya.yolGuven, yolNeden: dosya.yolNeden, metinliBelge, metinsizBelge,
      sonCalisma: sonAi ? { at: sonAi.createdAt, kim: sonAi.kullanici?.ad ?? null } : null,
    }),
    hap: hapKur({
      dosyaId, yetki, satirlar, cikarimJson: dosya.cikarimJson,
      borclular: dosya.borclular.map((b) => ({ id: b.id, adUnvan: b.adUnvan, tcVkn: b.tcVkn, rol: b.rol, kaynak: b.kaynak, teyitDurumu: b.teyitDurumu })),
      yetkiliIcra: yetkiliIcraGorunum(onayliDeger('yetkiliIcra')),
    }),
    bulduklarimiz: bulduklarimizKur({
      dosyaId, yetki, aiAcik: yuzeyAcik('cikarim'), satirlar, belgeler: dosya.belgeler, kullanicilar,
      hugoRucuTutari: listeKaynagi(dosya.kaynakJson) && dosya.rucuTutari != null ? Number(dosya.rucuTutari) : null,
      odemeToplami: odemeToplami > 0 ? odemeToplami : null,
    }),
    rucuSebebi: rucuSebebiKur({
      dosyaId, yetki, hugoHam: dosya.rucuSebebi, brans: dosya.brans, satirlar,
      policeTanzim: typeof tanzim === 'string' ? tanzim : null, policeBaslangic: dosya.policeBaslangic, kullanicilar,
      kaynakJson: dosya.kaynakJson,
    }),
    eksikEvrak: eksikEvrakKur({
      dosyaId, yetki, onayliKod, oneriKod, belgeler: dosya.belgeler,
      hukukDosyaNo: dosya.hukukDosyaNo, hasarDosyaNo: dosya.hasarDosyaNo, buroAdi: ayarlar?.vekilAd ?? null,
    }),
    yetkiliIcra: yetkiliIcraKur({
      dosyaId, yetki, kazaYeri: dosya.kazaYeri, il: dosya.il, borclular: dosya.borclular, satirlar,
      eskiDeger: dosya.yetkiliIcra, kullanicilar,
    }),
  }
}
