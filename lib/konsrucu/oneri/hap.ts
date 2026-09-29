/**
 * KonsRücü — Hap bilgiler · tek son kontrol · lib/konsrucu/oneri/hap.ts  (saf; DB yok)
 *
 * 2026-09-29 (Berkan: "her şeye onay almak zaman kaybettirir; bilgiler hap bilgilere girsin, yanlışsa orada
 * düzeltsin"): kural, Excel ve yapay zekâ bulguları tek tek onaylanmaz. Hap bilgiler kartında görünür, yanlışsa
 * yerinde düzeltilir; avukat sonda TEK tıklamayla ("Hap bilgileri kontrol ettim") çelişkisiz bütün önerileri onaylar
 * ve işaretli borçluları teyit eder. Otomatik çözülmeyenler:
 *   - kritik çelişki: kritik alanda farklı değerler (ör. Excel rücu tutarı ↔ faturalardan toplanan tutar) → seçim
 *     yapılmadan tek kontrol çalışmaz; kritik olmayan çelişki (iki poliçeli dosyada poliçe no) onaylanmadan bekler;
 *   - seçim alanları: rücu sebebi ve yetkili icra (kendi seçicileri var, varsayılan yok);
 *   - işaretsiz bırakılan ödeme önerisi reddedilir, işaretsiz borçlu teyitsiz kalır (takibe girmez).
 * Onay yine AlanDegeri ONAYLI satırıdır: takip talebi, dilekçe ve yol haritası kuralları değişmeden çalışır.
 */
import { alanTanimi, degerEsit, degerNormal, type OdemeDegeri } from './alanlar'
import { deterministikMi, type AlanKaydi } from './karar'

/** Varsayılanı olmayan, kendi seçicisiyle seçilen alanlar: onaylı değilse tek kontrol çalışmaz. */
export const SECIM_ALANLARI = ['rucuSebebiKod', 'yetkiliIcra'] as const

export type HapSatiri = AlanKaydi & { guven: number | null; createdAt: Date | string }

export type HapPlani = {
  /** Onaylanacak öneri id'leri (alan başına bir tane; ödemede işaretli olanlar). */
  onaylanacak: string[]
  /** Reddedilecek öneri id'leri (işaretsiz bırakılan ödemeler). */
  reddedilecek: string[]
  /** Farklı değerli önerisi olan, onaylı değeri olmayan KRİTİK alanların etiketleri (tek kontrolü durdurur). */
  celiskiler: string[]
  /** Farklı değerli önerisi olan kritik olmayan alanlar: onaylanmadan bekler, sonra seçilir. */
  beklemede: string[]
  /** Seçilmemiş seçim alanlarının etiketleri. */
  eksikSecim: string[]
  /** Teyit edilecek borçlu id'leri. */
  teyitEdilecek: string[]
}

const odemeMi = (alan: string) => alanTanimi(alan)?.tip === 'ODEME'

/** Aynı alandaki bekleyen önerileri değer gruplarına ayırır (degerEsit). */
export function degerGruplari<T extends Pick<AlanKaydi, 'alan' | 'degerJson'>>(oneriler: readonly T[]): T[][] {
  const tanim = oneriler[0] ? alanTanimi(oneriler[0].alan) : null
  if (!tanim) return oneriler.map((o) => [o])
  const gruplar: T[][] = []
  for (const o of oneriler) {
    const g = gruplar.find((x) => degerEsit(tanim.tip, x[0].degerJson, o.degerJson))
    if (g) g.push(o)
    else gruplar.push([o])
  }
  return gruplar
}

/** Temsilci öneri: önce deterministik (kural, alıntısı doğru), sonra güven, sonra en eski. */
function temsilci(g: readonly HapSatiri[]): HapSatiri {
  return [...g].sort((a, b) =>
    Number(deterministikMi(b)) - Number(deterministikMi(a))
    || (b.guven ?? 0) - (a.guven ?? 0)
    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )[0]
}

/** Tek son kontrolün yapacağı işler. `odemeHaric`: işaretsiz ödeme önerileri; `borcluHaric`: işaretsiz borçlular. */
export function hapPlani(g: {
  satirlar: readonly HapSatiri[]
  borclular: readonly { id: string; teyitDurumu: string }[]
  odemeHaric: ReadonlySet<string>
  borcluHaric: ReadonlySet<string>
}): HapPlani {
  const plan: HapPlani = { onaylanacak: [], reddedilecek: [], celiskiler: [], beklemede: [], eksikSecim: [], teyitEdilecek: [] }
  const onayliAlanlar = new Set(g.satirlar.filter((s) => s.durum === 'ONAYLI').map((s) => s.alan))
  const bekleyen = new Map<string, HapSatiri[]>()
  for (const s of g.satirlar) {
    if (s.durum !== 'ONERI' || onayliAlanlar.has(s.alan)) continue
    bekleyen.set(s.alan, [...(bekleyen.get(s.alan) ?? []), s])
  }
  for (const a of SECIM_ALANLARI) {
    if (!onayliAlanlar.has(a)) plan.eksikSecim.push(alanTanimi(a)?.etiket ?? a)
  }
  for (const [alan, oneriler] of bekleyen) {
    const tanim = alanTanimi(alan)
    if (!tanim || tanim.karar || (SECIM_ALANLARI as readonly string[]).includes(alan)) continue
    if (odemeMi(alan)) {
      // aynı ödeme (alan anahtarı) birden çok kaynaktan gelebilir: işaretsizse hepsi reddedilir, değilse biri onaylanır
      if (oneriler.some((o) => g.odemeHaric.has(o.id))) plan.reddedilecek.push(...oneriler.map((o) => o.id))
      else plan.onaylanacak.push(temsilci(oneriler).id)
      continue
    }
    const gruplar = degerGruplari(oneriler)
    if (gruplar.length > 1) (tanim.kritik ? plan.celiskiler : plan.beklemede).push(tanim.etiket)
    else plan.onaylanacak.push(temsilci(gruplar[0]).id)
  }
  plan.teyitEdilecek = g.borclular.filter((b) => b.teyitDurumu !== 'TEYIT_EDILDI' && !g.borcluHaric.has(b.id)).map((b) => b.id)
  return plan
}

// ───────────────────────── ödeme şüphesi ─────────────────────────

const KDV_ORANLARI = [0.2, 0.18, 0.1, 0.08, 0.01]
const yakin = (a: number, b: number) => Math.abs(a - b) <= 0.05

/**
 * Bekleyen ödeme önerilerinden kontrol isteyenler ve gerekçesi (kartta işaretsiz gelir). Kural katmanı aynı faturayı
 * KDV dahil, KDV hariç ve KDV tutarı olarak üç kez bulabiliyor; tarihsiz kopyalar da tarihli önerinin eşi olabiliyor.
 * `hepsi`: bekleyen + onaylı bütün ödemeler (karşılaştırma için).
 */
export function odemeSupheleri(
  bekleyen: readonly { id: string; degerJson: unknown }[],
  hepsi: readonly { id: string; degerJson: unknown }[],
): Record<string, string> {
  const coz = (v: unknown) => degerNormal('ODEME', v) as OdemeDegeri | null
  const tum = hepsi.map((x) => ({ id: x.id, o: coz(x.degerJson) })).filter((x): x is { id: string; o: OdemeDegeri } => !!x.o)
  const out: Record<string, string> = {}
  for (const b of bekleyen) {
    const o = coz(b.degerJson)
    if (!o) continue
    const oteki = tum.filter((x) => x.id !== b.id)
    const t = o.tutar
    if (t < 50) out[b.id] = 'tutar çok küçük'
    else if (!o.tarih && oteki.some((x) => x.o.tarih && yakin(x.o.tutar, t))) out[b.id] = 'aynı tutarın tarihli kaydı var'
    else if (oteki.some((x) => KDV_ORANLARI.some((k) => yakin(x.o.tutar, t * (1 + k))))) out[b.id] = 'KDV hariç tutar olabilir'
    else if (oteki.some((x) => KDV_ORANLARI.some((k) => yakin(t, (x.o.tutar * k) / (1 + k))))) out[b.id] = 'KDV tutarı olabilir'
    else if (!o.tarih) out[b.id] = 'tarihsiz'
  }
  return out
}
