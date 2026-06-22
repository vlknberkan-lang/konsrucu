/**
 * KonsRücü — kanuni/yasal faiz hesabı · lib/konsrucu/faiz.ts (saf)
 * Dönemsel oranlarla işlemiş faiz: her dönem için anapara × yıllık oran × (gün/365).
 * Oranlar Ayarlar'dan (faizJson) gelir — mevzuat değiştikçe oradan güncellenir.
 */
export type FaizOrani = { baslangic: string; oran: number } // baslangic: 'YYYY-MM-DD', oran: yıllık %

export type FaizDetay = { donem: string; gun: number; oran: number; tutar: number }
export type FaizSonuc = { faiz: number; gun: number; toplam: number; detay: FaizDetay[] }

const gunFark = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000)
const yuvarla = (n: number) => Math.round(n * 100) / 100

// ─── dekont yardımcıları (ekspertiz = haric → anaparaya/faize dahil değil) ───
export type DekontGirdi = { tarih: string | null; tutar: number; haricMi: boolean }

/** Ekspertiz hariç ödenen toplam (asıl alacak). */
export function odenenToplam(dekontlar: DekontGirdi[]): number {
  return yuvarla(dekontlar.filter((d) => !d.haricMi && Number.isFinite(d.tutar)).reduce((s, d) => s + d.tutar, 0))
}

/** Ekspertiz hariç EN GEÇ (son) dekont tarihi = faiz başlangıcı (YYYY-MM-DD) ya da null. */
export function sonDekontTarihi(dekontlar: DekontGirdi[]): string | null {
  const t = dekontlar
    .filter((d) => !d.haricMi && d.tarih && /^\d{4}-\d{2}-\d{2}/.test(d.tarih))
    .map((d) => (d.tarih as string).slice(0, 10))
    .sort()
  return t.length ? t[t.length - 1] : null
}

/** faizJson içinden oran listesini güvenle çıkar. */
export function oranlariOku(faizJson: unknown): FaizOrani[] {
  const arr = (faizJson as { oranlar?: unknown })?.oranlar
  if (!Array.isArray(arr)) return []
  return arr
    .map((o) => ({ baslangic: String((o as FaizOrani)?.baslangic ?? ''), oran: Number((o as FaizOrani)?.oran) }))
    .filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.baslangic) && Number.isFinite(o.oran))
}

/**
 * İşlemiş faiz. anapara>0, geçerli oran listesi ve bitis>baslangic ister; aksi halde null.
 */
export function faizHesapla(anapara: number, baslangic: Date, bitis: Date, oranlar: FaizOrani[]): FaizSonuc | null {
  if (!(anapara > 0) || bitis <= baslangic) return null
  const sirali = oranlar
    .map((o) => ({ t: new Date(o.baslangic + 'T00:00:00'), oran: o.oran }))
    .filter((o) => !Number.isNaN(o.t.getTime()))
    .sort((a, b) => a.t.getTime() - b.t.getTime())
  if (!sirali.length) return null

  // dönem sınırları: başlangıç + (başlangıçtan sonraki oran değişimleri) + bitiş
  const sinir: Date[] = [baslangic]
  for (const o of sirali) if (o.t > baslangic && o.t < bitis) sinir.push(o.t)
  sinir.push(bitis)

  let faiz = 0
  let toplamGun = 0
  const detay: FaizDetay[] = []
  for (let i = 0; i < sinir.length - 1; i++) {
    const d1 = sinir[i], d2 = sinir[i + 1]
    const gun = gunFark(d1, d2)
    if (gun <= 0) continue
    let oran = sirali[0].oran
    for (const o of sirali) if (o.t <= d1) oran = o.oran // d1'de geçerli son oran
    const tutar = anapara * (oran / 100) * (gun / 365)
    faiz += tutar
    toplamGun += gun
    detay.push({ donem: `${d1.toISOString().slice(0, 10)} → ${d2.toISOString().slice(0, 10)}`, gun, oran, tutar: yuvarla(tutar) })
  }
  return { faiz: yuvarla(faiz), gun: toplamGun, toplam: yuvarla(anapara + faiz), detay }
}
