/**
 * KonsRücü — Dosya Yol Haritası · gerçekler · lib/konsrucu/yol-haritasi/gercekler.ts (saf; client-safe tipler)
 *
 * Dosyanın anlık görüntüsünü (`Gercekler`) YALNIZ şemadan kurar (06 §8.1): künye ve eksenler, borçlular ve
 * `BorcluTakip`, aday olaylar (`TakipOlayi`), `AlanDegeri`, belge okuma durumları (`Belge.metinDurumu`),
 * `TakipTalebi`, `Sure`, `SenkronIs` + `EklentiNabiz`, `Arabuluculuk`, `YolSecimi`, `OnayKaydi`, `Dava`,
 * `DavaIslem`, `Etkinlik`, dilekçe durumları (`UretilenCikti` + son `DilekceSurum`), bekleyen `VeriOnarim`.
 *
 * Bu modül veritabanına ERİŞMEZ: sorgu şekli `HAM_SELECT` burada tanımlıdır, sorguyu `yukle.ts` (server-only)
 * yapar; `hamdanGercekler` saf dönüştürücüdür (test edilebilir). Kişisel veri (borçlu adı, TCKN, telefon, IBAN)
 * seçilmez ve gerçeklere girmez.
 */
import type { Prisma } from '@prisma/client'
import type { GErteleme, Gercekler } from './tipler'

/** "Ertele" Aktivite kayıtlarının eylem öneki (yol-haritasi-actions.ts yazar, burada okunur). */
export const ERTELEME_EYLEM_ONEKI = 'Yol haritası · ertelendi'

/** Tek sorguda dosyanın yol haritası için gereken her şey (kişisel veri kolonları seçilmez). */
export const HAM_SELECT = {
  id: true, hukukDosyaNo: true, durum: true, yol: true, yolGuven: true, yolNeden: true, yolOnayAt: true, yolOnaylayanId: true,
  icraEksen: true, arabEksen: true, davaEksen: true, eksenJson: true, onarimDurumu: true, rucuSebebiKod: true, zamanasimi: true,
  yetkiliIcra: true, icraDairesi: true, icraDosyaNo: true, takipTarihi: true,
  uyapDurum: true, uyapSenkronAt: true, uyapEslesme: true, uyapEslesmeNot: true, uyapHesapJson: true,
  rucuTutari: true, asilAlacak: true, kapanisSebebi: true, kapanisAt: true, cikarimJson: true, createdAt: true,
  musteri: { select: { ad: true } },
  belgeler: {
    where: { silindiAt: null },
    select: { id: true, dosyaAdi: true, kategori: true, altTur: true, kaynak: true, metinDurumu: true, uyapEvrakTuru: true, uyapDosyaTuru: true, davaId: true, belgeTarihi: true, icerikTarihi: true, createdAt: true },
  },
  odemeler: { select: { tarih: true, tutar: true, haricMi: true } },
  borclular: {
    // sıra kararlı olsun (ekranda "1. borçlu"); ad seçilmez, yalnız sıralamada kullanılır
    orderBy: [{ adUnvan: 'asc' }, { id: 'asc' }],
    select: {
      id: true, tur: true, teyitDurumu: true,
      takip: {
        select: {
          tebligTarihi: true, tebligSonucu: true, tebligSekli: true, tebligKaynakBelgeId: true, itirazVar: true, itirazVerilisTarihi: true,
          itirazUyapTarihi: true, itirazTipi: true, itirazEdilenTutar: true, itirazKaynakBelgeId: true, itirazAlacakliyaTebligTarihi: true, silindiAt: true,
        },
      },
    },
  },
  olaylar: {
    select: { id: true, tip: true, altTip: true, teyit: true, borcluId: true, hukukiTarih: true, tarih: true, tutar: true, sonuc: true, kaynakBelgeId: true, kural: true, createdAt: true },
  },
  alanDegerleri: {
    where: { silindiAt: null, durum: { in: ['ONERI', 'ONAYLI'] } },
    select: { id: true, alan: true, durum: true, kaynakTuru: true, degerJson: true, kaynakBelgeId: true, sayfa: true, alinti: true, alintiDogru: true, onayAt: true, createdAt: true },
  },
  takipTalepleri: {
    where: { gecerli: true, silindiAt: null },
    orderBy: { surum: 'desc' },
    take: 1,
    select: {
      id: true, asilAlacak: true, toplam: true, faizTuru: true, faizOraniMetni: true, faizBaslangicTuru: true, faizBaslangic: true,
      hesapIziJson: true, onaylayanId: true, dondurulduAt: true, takipTarihi: true, createdAt: true,
    },
  },
  sureler: {
    where: { silindiAt: null },
    select: {
      id: true, tur: true, dayanak: true, borcluId: true, davaId: true, arabuluculukId: true, tetikTarihi: true, tetikTuru: true,
      onerilenIhtiyatli: true, onerilenSonGun: true, onaylananSonGun: true, onayAt: true, ikinciTeyitAt: true, durum: true,
      kapanisKanitiBelgeId: true, kapanisAt: true, kaynakBelgeId: true, kaynakAlinti: true, durmaJson: true, createdAt: true,
    },
  },
  senkronIsleri: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, tur: true, durum: true, hata: true, createdAt: true, bittiAt: true } },
  arabuluculuklar: {
    where: { silindiAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, asamaId: true, tur: true, basvuruTarihi: true, sonTutanakTarihi: true, sonuc: true, sonTutanakBelgeId: true, onayAt: true, createdAt: true },
  },
  etkinlikler: {
    where: { tur: { in: ['ARABULUCULUK_TOPLANTISI', 'DURUSMA'] } },
    select: { id: true, tur: true, asamaId: true, baslar: true, durum: true, teyit: true, kaynak: true, createdAt: true },
  },
  yolSecimleri: { where: { silindiAt: null }, select: { id: true, asama: true, secim: true, davaId: true, durum: true, secimAt: true } },
  onayKayitlari: { where: { silindiAt: null }, select: { id: true, tur: true, sonuc: true, istenmeAt: true, alinmaAt: true, yolSecimiId: true, davaId: true, createdAt: true } },
  davalar: {
    where: { silindiAt: null },
    select: {
      id: true, asamaId: true, rolumuz: true, tur: true, mahkemeTuru: true, usul: true, davaDegeri: true, acilisTarihi: true, esasYil: true, esasSira: true,
      uyapDosyaId: true, durum: true, onKontrolJson: true, onIncelemeTarihi: true, sonrakiDurusma: true, hukum: true, kararTarihi: true,
      kararOnayAt: true, gerekceliTebligTarihi: true, kesinlesmeTarihi: true, createdAt: true,
    },
  },
  davaIslemleri: {
    where: { silindiAt: null },
    select: { id: true, davaId: true, tur: true, tarih: true, tebligTarihi: true, teyit: true, kaynakBelgeId: true, detayJson: true, createdAt: true },
  },
  ciktilar: {
    where: { tip: 'DILEKCE' },
    select: { id: true, tur: true, davaId: true, durum: true, createdAt: true, surumler: { where: { silindiAt: null }, orderBy: { sira: 'desc' }, take: 1, select: { durum: true } } },
  },
  taksitPlanlari: { select: { durum: true, createdAt: true } },
  aktiviteler: {
    where: { eylem: { startsWith: ERTELEME_EYLEM_ONEKI } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { detayJson: true, createdAt: true },
  },
  _count: { select: { veriOnarimlari: { where: { durum: { in: ['KURU', 'ONAYLI'] } } } } },
} satisfies Prisma.RucuDosyasiSelect

export type HamDosya = Prisma.RucuDosyasiGetPayload<{ select: typeof HAM_SELECT }>

export interface HamEk {
  ayar: { alacakliUnvan: string | null; mersis: string | null; vekaletnamePath: string | null } | null
  /** Müvekkilin en son nabzı (EklentiNabiz, en yeni sonGorulme). */
  nabiz: { sonGorulme: Date; uyapOturum: boolean } | null
  /** S19 asgari set bağlanınca doldurulur; yoksa null (EV-04 susar). */
  zorunluEvrak?: { eksik: string[] } | null
}

// ─────────────────────────── dönüştürücüler ───────────────────────────

const sayi = (x: unknown): number | null => {
  if (x == null) return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

const nesne = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}

const metin = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

const tarih = (x: unknown): Date | null => {
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x
  if (typeof x !== 'string' || !x.trim()) return null
  const d = new Date(x)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Aktivite.detayJson → erteleme ({ tur: 'YOL_HARITASI_ERTELE', kural, bitis }). */
export function ertelemeOku(detay: unknown, at: Date): GErteleme | null {
  const d = nesne(detay)
  if (d.tur !== 'YOL_HARITASI_ERTELE') return null
  const kural = metin(d.kural)
  const bitis = tarih(d.bitis)
  return kural && bitis ? { kural, bitis, at } : null
}

/** Prisma satırı → Gercekler (saf). */
export function hamdanGercekler(h: HamDosya, ek: HamEk): Gercekler {
  const cj = nesne(h.cikarimJson)
  const onay = nesne(cj.onay)
  const tevzi = nesne(cj.tevzi)
  const eksen = nesne(h.eksenJson)
  const hesap = nesne(h.uyapHesapJson)
  const teyit = (x: unknown) => metin(nesne(x).teyit)

  return {
    dosya: {
      id: h.id,
      hukukDosyaNo: h.hukukDosyaNo,
      muvekkilAd: h.musteri?.ad ?? null,
      durum: h.durum,
      yol: h.yol,
      yolGuven: h.yolGuven,
      yolNeden: h.yolNeden,
      yolOnayAt: h.yolOnaylayanId ? (h.yolOnayAt ?? h.createdAt) : null,
      icraEksen: h.icraEksen,
      arabEksen: h.arabEksen,
      davaEksen: h.davaEksen,
      eksenTeyit: { icra: teyit(eksen.icra), arab: teyit(eksen.arab), dava: teyit(eksen.dava) },
      onarimDurumu: h.onarimDurumu,
      onarimBekleyen: h._count?.veriOnarimlari ?? 0,
      rucuSebebiKod: h.rucuSebebiKod,
      zamanasimi: h.zamanasimi,
      yetkiliIcra: h.yetkiliIcra,
      icraDairesi: h.icraDairesi,
      icraDosyaNo: h.icraDosyaNo,
      takipTarihi: h.takipTarihi,
      uyapDurum: h.uyapDurum,
      uyapSenkronAt: h.uyapSenkronAt,
      uyapEslesme: h.uyapEslesme,
      uyapEslesmeNot: h.uyapEslesmeNot,
      rucuTutari: sayi(h.rucuTutari),
      asilAlacak: sayi(h.asilAlacak),
      uyapTahsilat: sayi(hesap.tahsilat),
      kapanisSebebi: h.kapanisSebebi,
      kapanisAt: h.kapanisAt,
      eskiOnay: onay.ok === true ? { at: tarih(onay.tarih) } : null,
      tevzi: Object.keys(tevzi).length ? { at: tarih(tevzi.at), birim: metin(tevzi.birimAdi) } : null,
      createdAt: h.createdAt,
    },
    ayar: {
      alacakliUnvanVar: !!ek.ayar?.alacakliUnvan?.trim(),
      mersisVar: !!ek.ayar?.mersis?.trim(),
      vekaletnameVar: !!ek.ayar?.vekaletnamePath?.trim(),
    },
    belgeler: h.belgeler.map((b) => ({
      id: b.id, dosyaAdi: b.dosyaAdi, kategori: b.kategori, altTur: b.altTur, kaynak: b.kaynak, metinDurumu: b.metinDurumu,
      uyapEvrakTuru: b.uyapEvrakTuru, uyapDosyaTuru: b.uyapDosyaTuru, davaId: b.davaId, tarih: b.belgeTarihi ?? b.icerikTarihi, createdAt: b.createdAt,
    })),
    odemeler: h.odemeler.map((o) => ({ tarih: o.tarih, tutar: sayi(o.tutar), haricMi: o.haricMi })),
    borclular: h.borclular.map((b, i) => ({
      id: b.id,
      sira: i + 1,
      tur: b.tur,
      teyitli: b.teyitDurumu === 'TEYIT_EDILDI',
      takip: b.takip && !b.takip.silindiAt ? {
        tebligTarihi: b.takip.tebligTarihi, tebligSonucu: b.takip.tebligSonucu, tebligSekli: b.takip.tebligSekli,
        tebligKaynakBelgeId: b.takip.tebligKaynakBelgeId, itirazVar: b.takip.itirazVar, itirazVerilisTarihi: b.takip.itirazVerilisTarihi,
        itirazUyapTarihi: b.takip.itirazUyapTarihi, itirazTipi: b.takip.itirazTipi, itirazEdilenTutar: sayi(b.takip.itirazEdilenTutar),
        itirazKaynakBelgeId: b.takip.itirazKaynakBelgeId, itirazAlacakliyaTebligTarihi: b.takip.itirazAlacakliyaTebligTarihi,
      } : null,
    })),
    olaylar: h.olaylar.map((o) => ({
      id: o.id, tip: o.tip, altTip: o.altTip, teyit: o.teyit, borcluId: o.borcluId, hukukiTarih: o.hukukiTarih, tarih: o.tarih, tutar: sayi(o.tutar),
      sonuc: o.sonuc, kaynakBelgeId: o.kaynakBelgeId, kural: o.kural, createdAt: o.createdAt,
    })),
    alanlar: h.alanDegerleri.map((a) => ({
      id: a.id, alan: a.alan, durum: a.durum, kaynakTuru: a.kaynakTuru, deger: a.degerJson, kaynakBelgeId: a.kaynakBelgeId, sayfa: a.sayfa,
      alinti: a.alinti, alintiDogru: a.alintiDogru, onayAt: a.onayAt, createdAt: a.createdAt,
    })),
    takipTalebi: h.takipTalepleri[0] ? (() => {
      const t = h.takipTalepleri[0]
      return {
        id: t.id, asilAlacak: sayi(t.asilAlacak), toplam: sayi(t.toplam), faizTuru: t.faizTuru, faizOraniMetni: t.faizOraniMetni,
        faizBaslangicTuru: t.faizBaslangicTuru, faizBaslangic: t.faizBaslangic, hesapIziVar: t.hesapIziJson != null,
        onaylayanId: t.onaylayanId, dondurulduAt: t.dondurulduAt, takipTarihi: t.takipTarihi, createdAt: t.createdAt,
      }
    })() : null,
    sureler: h.sureler.map((s) => ({
      id: s.id, tur: s.tur, dayanak: s.dayanak, borcluId: s.borcluId, davaId: s.davaId, arabuluculukId: s.arabuluculukId,
      tetikTarihi: s.tetikTarihi, tetikTuru: s.tetikTuru, onerilenIhtiyatli: s.onerilenIhtiyatli, onerilenSonGun: s.onerilenSonGun,
      onaylananSonGun: s.onaylananSonGun, onayAt: s.onayAt, ikinciTeyitAt: s.ikinciTeyitAt, durum: s.durum,
      kapanisKanitiBelgeId: s.kapanisKanitiBelgeId, kapanisAt: s.kapanisAt, kaynakBelgeId: s.kaynakBelgeId, kaynakAlinti: s.kaynakAlinti,
      durmaVar: Array.isArray(s.durmaJson) && s.durmaJson.length > 0, createdAt: s.createdAt,
    })),
    senkronIsleri: h.senkronIsleri.map((s) => ({ id: s.id, tur: s.tur, durum: s.durum, hata: s.hata, createdAt: s.createdAt, bittiAt: s.bittiAt })),
    nabiz: ek.nabiz,
    arabuluculuk: h.arabuluculuklar[0] ? { ...h.arabuluculuklar[0] } : null,
    etkinlikler: h.etkinlikler.map((e) => ({ id: e.id, tur: e.tur, asamaId: e.asamaId, baslar: e.baslar, durum: e.durum, teyit: e.teyit, kaynak: e.kaynak, createdAt: e.createdAt })),
    yolSecimleri: h.yolSecimleri.map((y) => ({ ...y })),
    onayKayitlari: h.onayKayitlari.map((o) => ({ ...o })),
    davalar: h.davalar.map((d) => ({
      id: d.id, asamaId: d.asamaId, rolumuz: d.rolumuz, tur: d.tur, mahkemeTuru: d.mahkemeTuru, usul: d.usul, davaDegeri: sayi(d.davaDegeri),
      acilisTarihi: d.acilisTarihi, esasVar: !!(d.esasYil && d.esasSira) || !!d.uyapDosyaId, durum: d.durum,
      onKontrol: Array.isArray(d.onKontrolJson)
        ? d.onKontrolJson.map((m) => nesne(m)).filter((m) => metin(m.kod)).map((m) => ({ kod: metin(m.kod) as string, durum: metin(m.durum) }))
        : [],
      onIncelemeTarihi: d.onIncelemeTarihi, sonrakiDurusma: d.sonrakiDurusma, hukum: d.hukum, kararTarihi: d.kararTarihi, kararOnayAt: d.kararOnayAt,
      gerekceliTebligTarihi: d.gerekceliTebligTarihi, kesinlesmeTarihi: d.kesinlesmeTarihi, createdAt: d.createdAt,
    })),
    davaIslemleri: h.davaIslemleri.map((i) => {
      const ks = nesne(i.detayJson).kesinSureler
      return {
        id: i.id, davaId: i.davaId, tur: i.tur, tarih: i.tarih, tebligTarihi: i.tebligTarihi, teyit: i.teyit, kaynakBelgeId: i.kaynakBelgeId,
        kesinSureSayisi: Array.isArray(ks) ? ks.length : 0, createdAt: i.createdAt,
      }
    }),
    dilekceler: h.ciktilar.map((c) => ({ id: c.id, tur: c.tur, davaId: c.davaId, durum: c.durum, sonSurumDurum: c.surumler[0]?.durum ?? null, createdAt: c.createdAt })),
    taksitPlanlari: h.taksitPlanlari.map((t) => ({ durum: t.durum, createdAt: t.createdAt })),
    ertelemeler: h.aktiviteler.map((a) => ertelemeOku(a.detayJson, a.createdAt)).filter((x): x is GErteleme => !!x),
    zorunluEvrak: ek.zorunluEvrak ?? null,
    kesimTarihi: null,
  }
}
