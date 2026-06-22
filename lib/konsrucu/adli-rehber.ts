/**
 * KonsRücü — Adlî Rehber · lib/konsrucu/adli-rehber.ts
 * T.C. Adalet Bakanlığı "Adlî Rehber" tablosundan üretilmiş ilçe → bağlı adliye eşlemesi.
 * AMAÇ: rücu yetkisi KAZA YERİdir (HMK m.16). Kaza yeri ilçesinin kendi adliyesi yoksa
 * takip, ilçenin BAĞLI OLDUĞU adliyedeki icra dairesinde açılır. Burada onu çözüyoruz.
 * Veri: adli-rehber.json (1001 ilçe; zincirleme bağlılıklar Faal adliyeye çözülmüş).
 */
import rehber from './adli-rehber.json'

export type AdliKayit = {
  ilce: string // mahal/ilçe adı (PDF'teki yazımıyla)
  adliye: string // takibin açılacağı (Faal) adliye — zincir çözülmüş
  dogrudan: string // doğrudan bağlı olduğu adliye (zincir çözülmeden)
  il: string // il
  durum: string // 'Faal' | 'Birleştirildi' | 'Teşkilat Kurulmadı' | 'Faal Değil'
}

const REHBER = rehber as AdliKayit[]

/** Türkçe-duyarlı normalize: küçült, aksan/parantez sadeleştir, boşlukları topla. */
export function trNorm(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/\(.*?\)/g, ' ') // "Gölbaşı (Ankara)" → "Gölbaşı"
    .toLocaleLowerCase('tr-TR')
    .replace(/[âā]/g, 'a').replace(/[îī]/g, 'i').replace(/[ûū]/g, 'u')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// İlçe adı (normalize) → kayıt(lar). Aynı ad birden çok ilde olabilir (Gölbaşı, Bayat…).
const indeks = new Map<string, AdliKayit[]>()
for (const r of REHBER) {
  const k = trNorm(r.ilce)
  if (!k) continue
  const arr = indeks.get(k)
  if (arr) arr.push(r)
  else indeks.set(k, [r])
}

export type AdliyeSonuc = AdliKayit & { kendiAdliyesiVar: boolean; icraDairesi: string }

function sonuc(r: AdliKayit): AdliyeSonuc {
  return { ...r, kendiAdliyesiVar: r.durum === 'Faal', icraDairesi: `${r.adliye} İcra Dairesi` }
}

/**
 * İlçe adından bağlı adliyeyi bul. İl verilirse aynı adlı ilçeler arasında ona göre seçer.
 * Döndürür: { adliye, il, icraDairesi, kendiAdliyesiVar, … } ya da bulunamazsa null.
 */
export function adliyeBul(ilce: string, il?: string | null): AdliyeSonuc | null {
  const key = trNorm(ilce)
  if (!key) return null
  let hits = indeks.get(key) ?? []
  if (!hits.length) return null
  if (hits.length > 1 && il) {
    const ilN = trNorm(il)
    const f = hits.filter((h) => trNorm(h.il) === ilN)
    if (f.length) hits = f
  }
  return hits.length ? sonuc(hits[0]) : null
}

/**
 * Serbest "kaza yeri" metninden (ör. "Seyhan/Adana", "Adana - Karaisalı", "Kâhta")
 * yetkili icra dairesini öner. Parçaları ilçe olarak dener; il'i ipucu alır.
 */
export function yetkiliIcraOner(kazaYeri: string | null | undefined, il?: string | null): AdliyeSonuc | null {
  if (!kazaYeri && !il) return null
  const parcalar = String(kazaYeri ?? '')
    .split(/[\/,;·\-–—|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  // önce tüm metni, sonra her parçayı dene
  const adaylar = [kazaYeri ?? '', ...parcalar].map((s) => s.trim()).filter(Boolean)
  for (const aday of adaylar) {
    const r = adliyeBul(aday, il)
    if (r) return r
  }
  // son çare: il merkezini dene (il adı = merkez ilçe adliyesi)
  if (il) {
    const r = adliyeBul(il, il)
    if (r) return r
  }
  return null
}
