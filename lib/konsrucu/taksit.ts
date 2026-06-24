/**
 * KonsRücü — Taksit planı saf hesap · lib/konsrucu/taksit.ts
 * Program üretimi (eşit bölme + son taksit kuruş artığı) ve plan özeti (ödenen/kalan/geciken).
 * Client-safe (DB yok); hem server action hem panel aynı kaynağı kullanır.
 */

export type TaksitDurum = 'BEKLIYOR' | 'ODENDI' | 'KISMI' | 'GECIKTI'
export type TaksitPlanDurum = 'AKTIF' | 'TAMAMLANDI' | 'TEMERRUT' | 'IPTAL'

export type TaksitSatir = { sira: number; vadeTarihi: Date; tutar: number }

/** Bir tarihe n ay ekle; ayın gün sayısı küçükse ay sonuna sabitle (31 Oca + 1 ay → 28/29 Şub). */
export function ayEkle(d: Date, n: number): Date {
  const g = d.getDate()
  const t = new Date(d.getTime())
  t.setDate(1)
  t.setMonth(t.getMonth() + n)
  const sonGun = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  t.setDate(Math.min(g, sonGun))
  return t
}

/** Kuruş artığı son taksitte toplanacak şekilde eşit böl (toplam tam tutar). */
export function taksitTutarlari(toplam: number, adet: number): number[] {
  if (!(adet > 0)) return []
  const toplamKurus = Math.round(toplam * 100)
  const taban = Math.floor(toplamKurus / adet)
  const out: number[] = []
  let kalan = toplamKurus
  for (let i = 0; i < adet; i++) {
    const k = i === adet - 1 ? kalan : taban
    out.push(k / 100)
    kalan -= k
  }
  return out
}

/** Ödeme programı üret: ilk vadeden başlayıp periyot kadar ay ekleyerek N taksit. */
export function taksitProgrami(p: { toplam: number; taksitSayisi: number; ilkVade: Date; periyotAy?: number }): TaksitSatir[] {
  const periyot = p.periyotAy && p.periyotAy > 0 ? p.periyotAy : 1
  const tutarlar = taksitTutarlari(p.toplam, p.taksitSayisi)
  return tutarlar.map((tutar, i) => ({ sira: i + 1, vadeTarihi: ayEkle(p.ilkVade, i * periyot), tutar }))
}

// ── özet ──────────────────────────────────────────────────────────────────
export type TaksitGirdi = {
  id: string
  sira: number
  vadeTarihi: Date
  tutar: number
  durum: TaksitDurum
  odenenTutar: number | null
  odendiTarih: Date | null
}

/** Tek günü (saat sıfırlanmış) karşılaştırma — vade "bugün" ise gecikme sayılmaz. */
function gunBasi(d: Date): number {
  const t = new Date(d.getTime())
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

/** Taksitin efektif durumu: ödenmemiş + vadesi geçmişse GECIKTI (kayıtlı durumdan bağımsız). */
export function efektifDurum(t: Pick<TaksitGirdi, 'durum' | 'vadeTarihi'>, bugun: Date): TaksitDurum {
  if (t.durum === 'ODENDI') return 'ODENDI'
  if (gunBasi(t.vadeTarihi) < gunBasi(bugun)) return 'GECIKTI'
  return t.durum === 'KISMI' ? 'KISMI' : 'BEKLIYOR'
}

export type TaksitOzet = {
  toplam: number
  odenen: number
  kalan: number
  toplamSayi: number
  odenenSayi: number
  gecikenSayi: number
  gecikenTutar: number
  yuzde: number
  siradaki: TaksitGirdi | null // ödenmemiş ilk taksit (vade sırasına göre)
}

/** Plan özeti: ödenen/kalan tutar, ilerleme yüzdesi, geciken sayısı, sıradaki taksit. */
export function taksitOzet(taksitler: TaksitGirdi[], bugun: Date): TaksitOzet {
  const sirali = [...taksitler].sort((a, b) => a.sira - b.sira)
  const toplam = sirali.reduce((s, t) => s + t.tutar, 0)
  const odenen = sirali.reduce((s, t) => s + (t.durum === 'ODENDI' ? t.tutar : t.odenenTutar ?? 0), 0)
  const odenenSayi = sirali.filter((t) => t.durum === 'ODENDI').length
  const geciken = sirali.filter((t) => efektifDurum(t, bugun) === 'GECIKTI')
  const siradaki = sirali.find((t) => t.durum !== 'ODENDI') ?? null
  const kalan = Math.max(0, Math.round((toplam - odenen) * 100) / 100)
  return {
    toplam,
    odenen,
    kalan,
    toplamSayi: sirali.length,
    odenenSayi,
    gecikenSayi: geciken.length,
    gecikenTutar: geciken.reduce((s, t) => s + (t.tutar - (t.odenenTutar ?? 0)), 0),
    yuzde: toplam > 0 ? Math.round((odenen / toplam) * 100) : 0,
    siradaki,
  }
}
