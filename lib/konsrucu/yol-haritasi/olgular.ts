/**
 * KonsRücü — Dosya Yol Haritası · türetilmiş olgular · lib/konsrucu/yol-haritasi/olgular.ts (saf; client-safe)
 *
 * Kuralların ortak sorduğu soruların TEK yanıt yeri: "takip var mı", "itiraz onaylı mı", "hangi yol seçildi",
 * "dosya hangi durakta". Hepsi `Gercekler` üzerinde saf fonksiyondur; veritabanına erişmez.
 *
 * Güven asimetrisi (M2): riski ARTIRAN sinyal teyitsiz de sayılır (ör. itiraz sinyali); riski AZALTAN geçiş
 * (kesinleşme, kapanış, tahsil) yalnız teyitli kayıtla sayılır.
 */
import type { DurakNo, GBorclu, GDava, GSure, GYolSecimi, Gercekler } from './tipler'
import { enGec, trNorm } from './yardimci'

// ─────────────────────────── takip / hazırlık ───────────────────────────

/** Kopilot tevzisi yapıldı mı (cikarimJson.tevzi ya da dondurulmuş takip talebi). */
export function tevziVar(g: Gercekler): boolean {
  return !!g.dosya.tevzi || !!g.takipTalebi?.dondurulduAt
}

export function esasNoVar(g: Gercekler): boolean {
  return !!g.dosya.icraDosyaNo?.trim()
}

/** İcra takibi başladı mı (tevzi, esas no ya da takip tarihi). */
export function takipVar(g: Gercekler): boolean {
  return tevziVar(g) || esasNoVar(g) || !!g.dosya.takipTarihi
}

/** Avukat "Takibe hazır" onayı verdi mi (TakipTalebi onayı ya da Faz 1 onayı). */
export function hazirlikOnayli(g: Gercekler): boolean {
  return !!g.takipTalebi?.onaylayanId || !!g.dosya.eskiOnay
}

/** Dosya avukat kararıyla idari yolda mı (AI önerisi sayılmaz; B12). */
export function idariYolda(g: Gercekler): boolean {
  return g.dosya.durum === 'IDARI_YOL' || (g.dosya.yol === 'IDARI' && !!g.dosya.yolOnayAt)
}

/** Kapanış avukat kaydıyla yapıldı mı (BILINMIYOR kapanış sayılmaz). */
export function kapandi(g: Gercekler): boolean {
  return !!g.dosya.kapanisSebebi && g.dosya.kapanisSebebi !== 'BILINMIYOR'
}

// ─────────────────────────── alanlar ───────────────────────────

/**
 * Kritik alanlar (06 2(c) hazırlık listesi: "tutar, ödeme tarihi, borçlular, rücu sebebi" + kaza tarihi).
 * Alan adları AlanDegeri.alan sözleşmesinden: "asilAlacak", "odeme[0].tarih", "rucuSebebiKod", "kusur.oran" …
 */
const KRITIK_ALAN = /^(asilAlacak|rucuTutari|rucuOrani|rucuSebebiKod|kazaTarihi|odeme(\[\d+\])?(\.|$)|borclu(\[\d+\])?(\.|$))/

export function kritikAlanMi(alan: string): boolean {
  return KRITIK_ALAN.test(alan)
}

export function bekleyenAlanlar(g: Gercekler) {
  return g.alanlar.filter((a) => a.durum === 'ONERI')
}

/** Aynı alanda farklı kaynaklardan farklı değer öneren alanlar (06 EV-06: tarih, tutar, plaka çelişkisi). */
export function celisenAlanlar(g: Gercekler): string[] {
  const grup = new Map<string, { degerler: Set<string>; kaynaklar: Set<string> }>()
  for (const a of g.alanlar) {
    if (a.durum !== 'ONERI' && a.durum !== 'ONAYLI') continue
    const k = grup.get(a.alan) ?? { degerler: new Set<string>(), kaynaklar: new Set<string>() }
    k.degerler.add(JSON.stringify(a.deger))
    k.kaynaklar.add(a.kaynakTuru)
    grup.set(a.alan, k)
  }
  const sonuc: string[] = []
  for (const [alan, k] of grup) {
    // onaylı değer varsa çelişki avukatça çözülmüştür — yalnız hepsi öneriyken sayılır
    const onayliVar = g.alanlar.some((a) => a.alan === alan && a.durum === 'ONAYLI')
    if (!onayliVar && k.degerler.size > 1 && k.kaynaklar.size > 1) sonuc.push(alan)
  }
  return sonuc.sort()
}

/** Dekont (ödeme) toplamı: ekspertiz hariç Odeme satırları. */
export function dekontToplami(g: Gercekler): number | null {
  const t = g.odemeler.filter((o) => !o.haricMi && o.tutar != null).reduce((s, o) => s + (o.tutar as number), 0)
  return t > 0 ? t : null
}

// ─────────────────────────── borçlu / tebliğ / itiraz ───────────────────────────

/** Borçlunun itirazı onaylı mı: BorcluTakip aynası ya da TEYITLI itiraz olayı. */
export function itirazOnayli(g: Gercekler, b: GBorclu): boolean {
  if (b.takip?.itirazVar === true) return true
  return g.olaylar.some((o) => o.borcluId === b.id && o.teyit === 'TEYITLI' && (o.altTip === 'ITIRAZ' || o.altTip === 'DURDURMA_ITIRAZ'))
}

/** Borçlunun itiraz tarihi (veriliş → UYAP kaydı → onaylı olayın hukuki tarihi). */
export function itirazTarihi(g: Gercekler, b: GBorclu): Date | null {
  if (b.takip?.itirazVerilisTarihi) return b.takip.itirazVerilisTarihi
  if (b.takip?.itirazUyapTarihi) return b.takip.itirazUyapTarihi
  const o = g.olaylar.find((x) => x.borcluId === b.id && x.teyit === 'TEYITLI' && (x.altTip === 'ITIRAZ' || x.altTip === 'DURDURMA_ITIRAZ'))
  return o?.hukukiTarih ?? null
}

/** Dosyada herhangi bir itiraz sinyali var mı (riski artıran: teyitsiz de sayılır). */
export function itirazSinyali(g: Gercekler): boolean {
  if (g.borclular.some((b) => itirazOnayli(g, b))) return true
  if (g.olaylar.some((o) => o.teyit !== 'REDDEDILDI' && o.teyit != null && (o.altTip === 'ITIRAZ' || o.altTip === 'DURDURMA_ITIRAZ'))) return true
  return uyapDurumItiraz(g)
}

/** UYAP durum metni itiraz diyor mu ("Açık (durdurulmuş : Takibe İtiraz)"). */
export function uyapDurumItiraz(g: Gercekler): boolean {
  return trNorm(g.dosya.uyapDurum).includes('itiraz')
}

/** UYAP durum metni "kapalı" mı. */
export function uyapKapali(g: Gercekler): boolean {
  return trNorm(g.dosya.uyapDurum).startsWith('kapali')
}

/** Borçlunun onaylı tebliğ tarihi (TEBLIG sonucu). */
export function tebligTarihi(b: GBorclu): Date | null {
  return b.takip && b.takip.tebligSonucu !== 'IADE' ? b.takip.tebligTarihi : null
}

/** Herhangi bir tebliğ bilgisi (onaylı ya da aday) var mı. */
export function tebligBilgisiVar(g: Gercekler): boolean {
  if (g.borclular.some((b) => !!b.takip?.tebligTarihi || !!b.takip?.tebligSonucu)) return true
  return g.olaylar.some((o) => o.teyit !== 'REDDEDILDI' && o.teyit != null && (o.altTip === 'TEBLIG_SONUCU' || o.altTip === 'TEBLIG_IADE'))
}

/** Kesinleşme avukatça teyit edildi mi (şerh olayı TEYITLI ya da eksen avukat onaylı). Asla tahmin edilmez. */
export function kesinlesmeTeyitli(g: Gercekler): boolean {
  if (g.olaylar.some((o) => o.altTip === 'KESINLESME_SERHI' && o.teyit === 'TEYITLI')) return true
  return g.dosya.icraEksen === 'KESINLESTI' && g.dosya.eksenTeyit.icra === 'TEYITLI'
}

// ─────────────────────────── süreler ───────────────────────────

export function acikSure(s: GSure): boolean {
  return s.durum === 'ACIK' || s.durum === 'KAPANMAYA_HAZIR'
}

/** Belirli türde açık süre (ilk eşleşen; borçlu/dava ile daraltılabilir). */
export function sureBul(g: Gercekler, tur: string, f: { borcluId?: string | null; davaId?: string | null } = {}): GSure | null {
  const adaylar = g.sureler.filter((s) => s.tur === tur && s.durum !== 'IPTAL'
    && (f.borcluId === undefined || s.borcluId === f.borcluId || s.borcluId == null)
    && (f.davaId === undefined || s.davaId === f.davaId || s.davaId == null))
  // açık olan önce; sonra en yakın son gün
  adaylar.sort((a, b) => Number(acikSure(b)) - Number(acikSure(a)) || (etkinSonGun(a)?.getTime() ?? Infinity) - (etkinSonGun(b)?.getTime() ?? Infinity))
  return adaylar[0] ?? null
}

/** Hatırlatmaların baktığı gün: onaylanan, yoksa ihtiyatlı öneri (06 2(i)). */
export function etkinSonGun(s: GSure): Date | null {
  return s.onaylananSonGun ?? s.onerilenIhtiyatli ?? s.onerilenSonGun ?? null
}

// ─────────────────────────── yol seçimi / onay / arabuluculuk / dava ───────────────────────────

export function gecerliYolSecimi(g: Gercekler, asama: 'ITIRAZ_SONRASI' | 'KARAR_SONRASI', davaId?: string | null): GYolSecimi | null {
  const l = g.yolSecimleri
    .filter((y) => y.asama === asama && y.durum === 'GECERLI' && (davaId === undefined || y.davaId == null || y.davaId === davaId))
    .sort((a, b) => b.secimAt.getTime() - a.secimAt.getTime())
  return l[0] ?? null
}

/** Yol seçimine karşılık gelen müvekkil onay türleri. */
export function yolOnayTurleri(secim: string): string[] {
  switch (secim) {
    case 'ARABULUCULUK_IIK67': return ['DAVA_ACMA', 'ARABULUCULUK']
    case 'IIK68_KALDIRMA': return ['DAVA_ACMA']
    case 'GENEL_ALACAK': return ['DAVA_ACMA']
    case 'TAKIBI_BIRAK': return ['TAKIBI_BIRAKMA', 'KAPATMA']
    default: return ['DAVA_ACMA']
  }
}

/** Yol seçiminin müvekkil onay kaydı (önce yolSecimiId bağlı olan; yoksa türü uyan en yenisi). */
export function yolOnayKaydi(g: Gercekler, y: GYolSecimi) {
  const bagli = g.onayKayitlari.filter((o) => o.yolSecimiId === y.id)
  const l = bagli.length ? bagli : g.onayKayitlari.filter((o) => yolOnayTurleri(y.secim).includes(o.tur))
  return [...l].sort((a, b) => (b.alinmaAt ?? b.istenmeAt ?? b.createdAt).getTime() - (a.alinmaAt ?? a.istenmeAt ?? a.createdAt).getTime())[0] ?? null
}

/** Bizim açtığımız (DAVACI) davaların en yenisi. */
export function anaDava(g: Gercekler): GDava | null {
  const l = g.davalar.filter((d) => d.rolumuz !== 'DAVALI')
    .sort((a, b) => (b.acilisTarihi ?? b.createdAt).getTime() - (a.acilisTarihi ?? a.createdAt).getTime())
  return l[0] ?? null
}

/** Açılmış (açılış tarihi ya da esas no'su olan) dava mı. */
export function davaAcildi(d: GDava | null): boolean {
  return !!d && (!!d.acilisTarihi || d.esasVar) && d.durum !== 'HAZIRLIK'
}

/** Son tutanak ANLAŞMA dışında mı (dava yolu açık). */
export function arabBittiAnlasmaDisi(g: Gercekler): boolean {
  const a = g.arabuluculuk
  return !!a?.sonuc && a.sonuc !== 'ANLASMA'
}

// ─────────────────────────── evre (mevcut durak) ───────────────────────────

/**
 * Dosyanın bulunduğu durak (onaylı ya da riski artıran olgulardan). Şimdi kartını seçmez; durak listesinin
 * hangi satırının "sürüyor" olduğunu ve GN-08 bekleme cümlesini belirler.
 */
export function mevcutDurak(g: Gercekler): DurakNo {
  const d = anaDava(g)
  if (d && (d.kararTarihi || d.hukum || d.durum === 'KARAR' || d.durum === 'KANUN_YOLU' || d.durum === 'KESINLESTI')) return 8
  if (davaAcildi(d) || g.davalar.some((x) => x.rolumuz === 'DAVALI' && davaAcildi(x))) return 7
  if (d || arabBittiAnlasmaDisi(g)) return 6
  if (g.arabuluculuk?.sonuc === 'ANLASMA') return 8
  if (g.arabuluculuk || gecerliYolSecimi(g, 'ITIRAZ_SONRASI')) return 5
  if (kesinlesmeTeyitli(g) && !itirazSinyali(g)) return 8
  if (esasNoVar(g) && (g.dosya.uyapSenkronAt || tebligBilgisiVar(g) || itirazSinyali(g))) return 4
  if (takipVar(g) || hazirlikOnayli(g)) return 3
  if (g.takipTalebi || (g.belgeler.length > 0 && bekleyenAlanlar(g).length === 0 && g.alanlar.length > 0)) return 2
  return 1
}

/**
 * Dosyadaki son gelişme anı — GN-07 "sessiz dosya". UYAP'tan gelen olay ve evrak, dava açılışı ve işlemleri,
 * arabuluculuk başvurusu ve son tutanağı, geçmiş duruşma/toplantı. Geleceğe ait tarihler sayılmaz.
 */
export function sonGelisme(g: Gercekler, bugun?: Date): Date | null {
  const l = enGec([
    ...g.olaylar.map((o) => o.hukukiTarih ?? o.tarih ?? o.createdAt),
    ...g.belgeler.filter((b) => (b.kaynak ?? '').startsWith('UYAP')).map((b) => b.tarih ?? b.createdAt),
    ...g.davaIslemleri.map((i) => i.tarih ?? i.tebligTarihi ?? i.createdAt),
    ...g.davalar.flatMap((d) => [d.acilisTarihi, d.kararTarihi]),
    g.arabuluculuk?.basvuruTarihi, g.arabuluculuk?.sonTutanakTarihi,
    ...g.etkinlikler.filter((e) => !bugun || e.baslar.getTime() <= bugun.getTime()).map((e) => e.baslar),
    g.dosya.takipTarihi,
  ].filter((d) => !bugun || !d || d.getTime() <= bugun.getTime()))
  return l
}
