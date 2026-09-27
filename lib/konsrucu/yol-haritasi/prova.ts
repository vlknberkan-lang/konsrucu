/**
 * KonsRücü — Dosya Yol Haritası · PROVA MODU · lib/konsrucu/yol-haritasi/prova.ts (saf; client-safe)
 *
 * 06 §8.5: `?prova=2026-07-01` eklenince ekran yalnız o tarihe kadarki belge, olay ve sürelerle hesaplanır.
 * D1–D3'ün geçmişi canlıdaki gerçek verisiyle, ek kopya olmadan oynatılır. Prova YALNIZ OKUR; hiçbir kayıt
 * açmaz ya da değiştirmez (bu modül yalnız bellekteki `Gercekler` kopyasını süzer).
 *
 * Süzme ilkeleri:
 *   1. OLGULAR (tebliğ, itiraz, itirazın tebliği, dava açılışı, karar, son tutanak, belge…) HUKUKİ TARİHİNE göre
 *      süzülür, onay anına göre DEĞİL: onay sonradan verilmiş olsa bile olgu o tarihte vardır ve onaylı sayılır.
 *   2. KARARLAR (yol seçimi, müvekkil onayı, onaylanan son gün, kapanış, erteleme) kendi karar anına göre
 *      süzülür (secimAt, alinmaAt, onayAt, kapanisAt): o gün henüz verilmemiş bir karar provada yoktur.
 *      Not: D1–D3 geri doldurması (S46) bu anları tarihî değerleriyle yazmalıdır; yoksa karar "henüz yok" görünür
 *      (güvenli yön: program daha çok iş gösterir).
 *   3. Riski AZALTAN geçişler (süre kapanışı, kapanış sebebi, kesinleşme) kesimden sonra olduysa geri alınır.
 *   4. Bugünü yansıtan önbellekler ve canlı sinyaller (eksenler, UYAP durum metni, eşleşme, onarım, senkron işleri,
 *      nabız) provada yok sayılır: geçmişteki değerlerini bilmiyoruz; tahmin etmeyiz.
 *   5. Tarihi olmayan UYAP dışı evrak (Ray/Hugo evrakı) takip öncesine aittir ve korunur.
 */
import type { Gercekler } from './tipler'
import { gunSonu, istGun } from './yardimci'

/** `?prova=` değerini çözer: "YYYY-MM-DD" → o günün İstanbul gün sonu. Bozuk ya da gelecekteki tarih → null. */
export function provaTarihiCoz(deger: string | string[] | null | undefined, simdi: Date = new Date()): Date | null {
  const s = Array.isArray(deger) ? deger[0] : deger
  if (!s) return null
  const kesim = gunSonu(s)
  if (!kesim) return null
  if (istGun(kesim) > istGun(simdi)) return null
  return kesim
}

const sonra = (d: Date | null | undefined, kesim: Date) => !!d && d.getTime() > kesim.getTime()

/**
 * Gerçekleri kesim anına göre süzer (yeni nesne döner; girdiyi değiştirmez).
 * Döndürülen gerçeklerde `kesimTarihi` dolu olur; motor canlı kuralları atlar.
 */
export function kesimUygula(g: Gercekler, kesim: Date): Gercekler {
  const s = (d: Date | null | undefined) => sonra(d, kesim)

  // ── belgeler: kendi tarihi; yoksa UYAP evrakında iniş anı; Ray/Hugo evrakı (tarihsiz) korunur
  const belgeler = g.belgeler.filter((b) => {
    const t = b.tarih ?? ((b.kaynak ?? '').startsWith('UYAP') ? b.createdAt : null)
    return !s(t)
  })
  const belgeIdleri = new Set(belgeler.map((b) => b.id))
  const belgeKaldi = (id: string | null | undefined) => !id || belgeIdleri.has(id)

  // ── dosya: takip kesimden sonra açıldıysa takip bilgisi yok; canlı önbellekler yok sayılır
  const d = g.dosya
  const takipSonra = s(d.takipTarihi)
  const dosya = {
    ...d,
    takipTarihi: takipSonra ? null : d.takipTarihi,
    icraDosyaNo: takipSonra ? null : d.icraDosyaNo,
    icraDairesi: takipSonra ? null : d.icraDairesi,
    tevzi: d.tevzi && !s(d.tevzi.at) && !takipSonra ? d.tevzi : null,
    eskiOnay: d.eskiOnay && !s(d.eskiOnay.at) ? d.eskiOnay : null,
    yolOnayAt: s(d.yolOnayAt) ? null : d.yolOnayAt,
    kapanisSebebi: s(d.kapanisAt) ? null : d.kapanisSebebi,
    kapanisAt: s(d.kapanisAt) ? null : d.kapanisAt,
    uyapSenkronAt: s(d.uyapSenkronAt) ? null : d.uyapSenkronAt,
    // bugünü yansıtan önbellek ve canlı sinyaller
    icraEksen: null, arabEksen: null, davaEksen: null,
    eksenTeyit: { icra: null, arab: null, dava: null },
    uyapDurum: null, uyapEslesme: null, uyapEslesmeNot: null, uyapTahsilat: null,
    onarimDurumu: null, onarimBekleyen: 0,
  }

  // ── olaylar: hukuki tarih (yoksa olay tarihi, yoksa kayıt anı); onay durumu KORUNUR
  const olaylar = g.olaylar.filter((o) => !s(o.hukukiTarih ?? o.tarih ?? o.createdAt))

  // ── borçlu aynası: kesimden sonraki olgular boşaltılır
  const borclular = g.borclular.map((b) => {
    const t = b.takip
    if (!t) return b
    const tebligSonra = s(t.tebligTarihi)
    const itirazT = t.itirazVerilisTarihi ?? t.itirazUyapTarihi
    const itirazSonra = s(itirazT)
    return {
      ...b,
      takip: {
        ...t,
        tebligTarihi: tebligSonra ? null : t.tebligTarihi,
        tebligSonucu: tebligSonra ? null : t.tebligSonucu,
        tebligSekli: tebligSonra ? null : t.tebligSekli,
        tebligKaynakBelgeId: tebligSonra ? null : t.tebligKaynakBelgeId,
        itirazVar: itirazSonra ? null : t.itirazVar,
        itirazVerilisTarihi: itirazSonra ? null : t.itirazVerilisTarihi,
        itirazUyapTarihi: itirazSonra ? null : t.itirazUyapTarihi,
        itirazTipi: itirazSonra ? null : t.itirazTipi,
        itirazEdilenTutar: itirazSonra ? null : t.itirazEdilenTutar,
        itirazKaynakBelgeId: itirazSonra ? null : t.itirazKaynakBelgeId,
        itirazAlacakliyaTebligTarihi: itirazSonra || s(t.itirazAlacakliyaTebligTarihi) ? null : t.itirazAlacakliyaTebligTarihi,
      },
    }
  })

  // ── alan önerileri: onaylı olgu korunur (kaynağı kesimden sonraki belge değilse); bekleyen öneri o gün yoksa atılır
  const alanlar = g.alanlar.filter((a) => belgeKaldi(a.kaynakBelgeId) && (a.durum === 'ONAYLI' || !s(a.createdAt)))

  // ── takip talebi: takip/tevzi/kayıt kesimden sonraysa yok; dondurma sonraysa taslak sayılır
  const tt = g.takipTalebi
  const takipTalebi = tt && !s(tt.takipTarihi ?? tt.dondurulduAt ?? tt.createdAt)
    ? { ...tt, dondurulduAt: s(tt.dondurulduAt) ? null : tt.dondurulduAt }
    : null

  // ── arabuluculuk: başvuru (yoksa kayıt) kesimden sonraysa yok; son tutanak sonraysa sonuç yok
  let arabuluculuk = g.arabuluculuk
  if (arabuluculuk) {
    const a = arabuluculuk
    if (s(a.basvuruTarihi ?? a.createdAt) && s(a.createdAt)) arabuluculuk = null
    else {
      const basvuruSonra = s(a.basvuruTarihi)
      const tutanakSonra = basvuruSonra || s(a.sonTutanakTarihi)
      arabuluculuk = {
        ...a,
        basvuruTarihi: basvuruSonra ? null : a.basvuruTarihi,
        sonTutanakTarihi: tutanakSonra ? null : a.sonTutanakTarihi,
        sonuc: tutanakSonra ? null : a.sonuc,
        sonTutanakBelgeId: tutanakSonra ? null : a.sonTutanakBelgeId,
        onayAt: tutanakSonra ? null : a.onayAt,
      }
    }
  }

  // ── davalar: açılış (yoksa kayıt) kesimden sonraysa yok; karar ve tebliğler kendi tarihine göre
  const davalar = g.davalar
    .filter((x) => !s(x.acilisTarihi ?? x.createdAt))
    .map((x) => {
      const kararSonra = s(x.kararTarihi)
      return {
        ...x,
        hukum: kararSonra ? null : x.hukum,
        kararTarihi: kararSonra ? null : x.kararTarihi,
        kararOnayAt: kararSonra ? null : x.kararOnayAt,
        gerekceliTebligTarihi: kararSonra || s(x.gerekceliTebligTarihi) ? null : x.gerekceliTebligTarihi,
        kesinlesmeTarihi: kararSonra || s(x.kesinlesmeTarihi) ? null : x.kesinlesmeTarihi,
        durum: kararSonra && ['KARAR', 'KANUN_YOLU', 'KESINLESTI'].includes(x.durum) ? 'DERDEST' : x.durum,
      }
    })
  const davaIdleri = new Set(davalar.map((x) => x.id))
  const davaIslemleri = g.davaIslemleri
    .filter((i) => davaIdleri.has(i.davaId) && !s(i.tarih ?? i.tebligTarihi ?? i.createdAt))
    .map((i) => ({ ...i, tebligTarihi: s(i.tebligTarihi) ? null : i.tebligTarihi }))

  // ── etkinlikler: bağlı olduğu aşama (arabuluculuk/dava) provada yoksa düşer; kesimden sonraki olay "planlandı" görünür
  const asamalar = new Set<string>([...davalar.map((x) => x.asamaId), ...(arabuluculuk ? [arabuluculuk.asamaId] : [])])
  const etkinlikler = g.etkinlikler
    .filter((e) => !e.asamaId || asamalar.has(e.asamaId)
      // arabuluculuk/dava dışındaki aşamaya (ör. icra) bağlı etkinlik korunur
      || (!g.davalar.some((x) => x.asamaId === e.asamaId) && g.arabuluculuk?.asamaId !== e.asamaId))
    .map((e) => (s(e.baslar) && e.durum !== 'IPTAL' ? { ...e, durum: 'PLANLANDI' } : e))

  // ── süreler: tetik (yoksa kayıt) kesimden sonraysa yok; onay ve kapanış kendi anına göre
  const sureler = g.sureler
    .filter((x) => !s(x.tetikTarihi ?? x.createdAt))
    .filter((x) => (!x.davaId || davaIdleri.has(x.davaId)) && (!x.arabuluculukId || (arabuluculuk && arabuluculuk.id === x.arabuluculukId)))
    .map((x) => {
      const onaySonra = s(x.onayAt)
      const kapanisGeri = (x.durum === 'KAPANDI' && s(x.kapanisAt)) || (x.durum === 'KAPANMAYA_HAZIR' && !belgeKaldi(x.kapanisKanitiBelgeId))
      return {
        ...x,
        onaylananSonGun: onaySonra ? null : x.onaylananSonGun,
        onayAt: onaySonra ? null : x.onayAt,
        ikinciTeyitAt: s(x.ikinciTeyitAt) ? null : x.ikinciTeyitAt,
        durum: kapanisGeri ? 'ACIK' : x.durum,
        kapanisAt: kapanisGeri ? null : x.kapanisAt,
        kapanisKanitiBelgeId: kapanisGeri || !belgeKaldi(x.kapanisKanitiBelgeId) ? null : x.kapanisKanitiBelgeId,
      }
    })

  return {
    ...g,
    dosya,
    belgeler,
    odemeler: g.odemeler.filter((o) => !s(o.tarih)),
    borclular,
    olaylar,
    alanlar,
    takipTalebi,
    sureler,
    senkronIsleri: [],
    nabiz: null,
    arabuluculuk,
    etkinlikler,
    yolSecimleri: g.yolSecimleri.filter((y) => !s(y.secimAt)),
    onayKayitlari: g.onayKayitlari
      .filter((o) => !s(o.istenmeAt ?? o.alinmaAt ?? o.createdAt))
      .map((o) => (s(o.alinmaAt) ? { ...o, alinmaAt: null, sonuc: 'BEKLIYOR' } : o)),
    davalar,
    davaIslemleri,
    dilekceler: g.dilekceler.filter((x) => !s(x.createdAt)),
    taksitPlanlari: g.taksitPlanlari.filter((x) => !s(x.createdAt)),
    ertelemeler: [],
    kesimTarihi: kesim,
  }
}
