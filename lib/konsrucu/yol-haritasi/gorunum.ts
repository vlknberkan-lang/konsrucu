/**
 * KonsRücü — Dosya Yol Haritası · görünüm modeli · lib/konsrucu/yol-haritasi/gorunum.ts (saf; client-safe)
 *
 * Motor çıktısını ekrana hazır, SERİLEŞTİRİLEBİLİR bir nesneye çevirir (Date yok; tarihler "YYYY-MM-DD" ya da
 * ISO metni). Server component bu nesneyi client bileşenlere prop olarak geçirir.
 *
 * `yolHaritasiHesapla(g, { simdi, kesim })`: prova kesimini uygular → siradakiAdim → duraklar → künye.
 * `onbellekJson(sonuc)`: RucuDosyasi.yolHaritasiJson önbelleğinin şekli ({simdi, sonra[], bekleme, kural, at}).
 */
import type { Gercekler, SiradakiAdimSonuc } from './tipler'
import { siradakiAdim, tekCumle } from './siradaki-adim'
import { kesimUygula } from './prova'
import { durakDurumlari, eksenOzeti, type DurakGorunum, type EksenGorunum } from './duraklar'
import { gunMetni, tarihKisa, tutarMetni } from './yardimci'
import { saatTR } from '@/lib/konsrucu/format'

/** Motor sürümü: kural tablosu değişince artar; önbellek ve "yanlış" bildirimleri bu sürümle kaydedilir. */
export const MOTOR_SURUMU = 'yh-1'

export interface UyapBaglanti {
  durum: 'ACIK' | 'KAPALI' | 'BILINMIYOR' | 'PROVA'
  metin: string
}

export interface YolHaritasiGorunum {
  dosyaId: string
  hukukDosyaNo: string | null
  muvekkil: string | null
  borcluSayisi: number
  /** Takip çıkışı (TakipTalebi.toplam ?? asilAlacak), "1.234,56 ₺". */
  takipCikisi: string | null
  eksenler: EksenGorunum[]
  uyap: UyapBaglanti
  sonuc: SiradakiAdimSonuc
  duraklar: DurakGorunum[]
  /** "Şimdi ne yapmalıyım?" — tek cümle. */
  tekCumle: string
  prova: { tarih: string } | null
  /** Canlı bugün (YYYY-MM-DD, İstanbul) — prova tarih seçicisinin üst sınırı. */
  bugun: string
  motorSurumu: string
  hesapAt: string
}

function uyapBaglanti(g: Gercekler, simdi: Date): UyapBaglanti {
  if (g.kesimTarihi) return { durum: 'PROVA', metin: 'Prova: canlı UYAP bağlantısı gösterilmez' }
  const n = g.nabiz
  const son = g.dosya.uyapSenkronAt ? ` · son çekme ${tarihKisa(g.dosya.uyapSenkronAt)} ${saatTR(g.dosya.uyapSenkronAt)}` : ''
  if (!n) return { durum: 'BILINMIYOR', metin: `UYAP bağlantısı: eklentiden sinyal yok${son}` }
  const dk = Math.floor((simdi.getTime() - n.sonGorulme.getTime()) / 60_000)
  if (dk < 2 && n.uyapOturum) return { durum: 'ACIK', metin: `UYAP bağlantısı: açık${son}` }
  return { durum: 'KAPALI', metin: `UYAP bağlantısı: kapalı (son sinyal ${tarihKisa(n.sonGorulme)} ${saatTR(n.sonGorulme)})${son}` }
}

export interface HesapSecenek {
  /** Canlıda şu an; verilmezse new Date(). */
  simdi?: Date
  /** Prova kesimi (provaTarihiCoz çıktısı); null/undefined = canlı. */
  kesim?: Date | null
}

/** Gerçeklerden ekran modelini üretir (saf). Provada `bugun` = kesim anıdır. */
export function yolHaritasiHesapla(ham: Gercekler, secenek: HesapSecenek = {}): YolHaritasiGorunum {
  const simdi = secenek.simdi ?? new Date()
  const kesim = secenek.kesim ?? null
  const g = kesim ? kesimUygula(ham, kesim) : ham
  const bugun = kesim ?? simdi
  const sonuc = siradakiAdim(g, bugun)
  const takip = g.takipTalebi?.toplam ?? g.takipTalebi?.asilAlacak ?? null
  return {
    dosyaId: g.dosya.id,
    hukukDosyaNo: g.dosya.hukukDosyaNo,
    muvekkil: g.dosya.muvekkilAd,
    borcluSayisi: g.borclular.length,
    takipCikisi: takip != null ? tutarMetni(takip) : null,
    eksenler: eksenOzeti(g),
    uyap: uyapBaglanti(g, simdi),
    sonuc,
    duraklar: durakDurumlari(g, sonuc),
    tekCumle: tekCumle(sonuc),
    prova: kesim ? { tarih: gunMetni(kesim) as string } : null,
    bugun: gunMetni(simdi) as string,
    motorSurumu: MOTOR_SURUMU,
    hesapAt: simdi.toISOString(),
  }
}

/** RucuDosyasi.yolHaritasiJson önbelleği (listeler ve Bugün masası için). Provadan asla yazılmaz. */
export function onbellekJson(sonuc: SiradakiAdimSonuc, at: Date = new Date()) {
  const kisa = (a: SiradakiAdimSonuc['simdi']) => a && {
    kural: a.kural, surum: a.surum, metin: a.metin, oncelik: a.oncelik, rol: a.rol, sonGun: a.sonGun, eylem: a.eylem?.etiket ?? null,
  }
  return {
    simdi: kisa(sonuc.simdi),
    sonra: sonuc.sonra.map((a) => kisa(a)),
    bekleme: sonuc.bekleme ? { kural: sonuc.bekleme.kural, metin: sonuc.bekleme.metin } : null,
    kural: sonuc.simdi?.kural ?? sonuc.bekleme?.kural ?? null,
    engelSayisi: sonuc.engeller.length,
    motorSurumu: MOTOR_SURUMU,
    at: at.toISOString(),
  }
}

/** Önbellek değişti mi (gereksiz yazmayı ve `updatedAt` oynamasını önler): yalnız kural kodları ve metinler karşılaştırılır. */
export function onbellekDegisti(eski: unknown, yeni: ReturnType<typeof onbellekJson>): boolean {
  const imza = (x: unknown) => {
    const o = (x && typeof x === 'object' ? x : {}) as { simdi?: { kural?: string; metin?: string } | null; sonra?: ({ kural?: string } | null)[]; bekleme?: { kural?: string; metin?: string } | null; motorSurumu?: string }
    return JSON.stringify([o.simdi?.kural, o.simdi?.metin, (o.sonra ?? []).map((s) => s?.kural), o.bekleme?.kural, o.bekleme?.metin, o.motorSurumu])
  }
  return imza(eski) !== imza(yeni)
}
