/**
 * KonsRücü — Dosya Yol Haritası · eylem yardımcıları · components/dosya/yol-haritasi/eylem.ts (saf; client-safe)
 *
 *   - `eylemHref`: birincil eylemin götüreceği yer. Varsayılan, aynı sayfadaki panel çapasıdır (`#yh-…`);
 *     "Bağla" aşaması panelleri bu kimliklerle işaretler ya da `eylemHrefleri` ile hedef başına adres verir.
 *   - `eylemYetkisi`: rol farkı (06 §2): yardımcı "hazırla" işlerini, avukat "onayla / karar ver" işlerini görür;
 *     yardımcının ekranında "Bu adım avukat onayını bekliyor" yazar. Görüntüleyen hiçbir eylem yapmaz.
 *     (Asıl kapı sunucudadır; bu yalnız düğmeyi doğru gösterir.)
 *   - `adimTonu`: renk yalnız anlam taşır (06 "Görsel dil"): risk / onay / bilgi / nötr; her ton yazıyla da söylenir.
 */
import type { Adim, EylemHedef, KuralRol } from '@/lib/konsrucu/yol-haritasi/tipler'
import type { Tone } from '@/components/konsrucu/ui'

/** Hedef → sayfa içi çapa kimliği (panel id'si). */
export const EYLEM_CAPA: Record<EylemHedef, string> = {
  'durum-teyit': 'yh-onarim', 'tutar-dogrula': 'yh-bulduklarimiz', 'eslesme-duzelt': 'yh-uyap', 'sure-onay': 'yh-sureler', 'sure-git': 'yh-sureler',
  'uyap-ac': 'yh-uyap', 'uyap-cek': 'yh-uyap', 'evrak-ekle': 'yh-evrak', okunamayanlar: 'yh-evrak', 'ray-istek': 'yh-eksik-evrak',
  'alan-onay': 'yh-bulduklarimiz', celiski: 'yh-bulduklarimiz', 'rucu-sebebi-sec': 'yh-rucu-sebebi',
  hazirlik: 'yh-hazirlik', 'hazirlik-onay': 'yh-hazirlik', 'yol-sec-idari': 'yh-idari-yol', 'idari-yol-onay': 'yh-idari-yol', 'idari-basvuru': 'yh-idari-yol',
  'kopilot-ac': 'yh-takip', 'kopilot-gorev': 'yh-takip', 'esas-no-gir': 'yh-takip',
  'olay-onay': 'yh-onaylar', 'teblig-karar': 'yh-teblig-itiraz', 'itiraz-kapsam': 'yh-teblig-itiraz', 'itiraz-teblig-tarih': 'yh-teblig-itiraz',
  'kesinlesme-teyit': 'yh-teblig-itiraz', 'itiraz-incele': 'yh-teblig-itiraz', 'talep-taslak': 'yh-dilekce',
  'yol-sec': 'yh-yol-secimi', 'onay-talebi': 'yh-muvekkil-onayi', 'onay-kaydet': 'yh-muvekkil-onayi', 'arabuluculuk-tur': 'yh-arabuluculuk',
  'arabuluculuk-basvuru': 'yh-arabuluculuk', 'toplanti-sonuc': 'yh-arabuluculuk', 'son-tutanak': 'yh-arabuluculuk', 'taksit-plan': 'yh-taksit',
  'tutanak-incele': 'yh-arabuluculuk',
  'dava-on-kontrol': 'yh-dava', 'dava-dilekce': 'yh-dilekce', 'dava-esas-gir': 'yh-dava', 'dava-bagla': 'yh-dava', 'dava-incele': 'yh-dava',
  'usul-sec': 'yh-yargilama', 'cevaba-cevap': 'yh-dilekce', beyan: 'yh-dilekce', 'rapor-analiz': 'yh-yargilama', 'durusma-notu': 'yh-yargilama',
  'durusma-sonuc': 'yh-yargilama', 'karar-karti': 'yh-sonuc', 'karar-sonrasi-yol': 'yh-sonuc', 'gerekceli-teblig-tarih': 'yh-sonuc',
  'kapanis-sec': 'yh-sonuc', 'tahsilat-onay': 'yh-onaylar', 'muvekkil-bildirim': 'yh-sonuc',
}

/** Birincil eylemin adresi: verilen eşleme > varsayılan çapa. */
export function eylemHref(hedef: EylemHedef, hrefler?: Partial<Record<EylemHedef, string>>): string {
  return hrefler?.[hedef] ?? `#${EYLEM_CAPA[hedef]}`
}

export type EylemYetkisi = 'YAPABILIR' | 'AVUKAT_ONAYI_BEKLIYOR' | 'SALT_OKUR'

const AVUKAT = new Set(['AVUKAT', 'ADMIN'])

/** Kullanıcı bu adımın birincil eylemini yapabilir mi? */
export function eylemYetkisi(kuralRol: KuralRol, kullaniciRol: string | null | undefined): EylemYetkisi {
  if (!kullaniciRol || kullaniciRol === 'GORUNTULEYEN') return 'SALT_OKUR'
  if ((kuralRol === 'A' || kuralRol === 'A+2') && !AVUKAT.has(kullaniciRol)) return 'AVUKAT_ONAYI_BEKLIYOR'
  return 'YAPABILIR'
}

export const ROL_METNI: Record<KuralRol, string> = {
  H: 'Herkes', A: 'Avukat', 'H/A': 'Herkes (kritikler avukatta)', 'A+2': 'Avukat · kritik süre: ikinci teyit önerilir', SORUMLU: 'Sürenin sorumlusu', '-': '—',
}

/** Adımın anlam rengi ve yazılı karşılığı. */
export function adimTonu(a: Pick<Adim, 'engel' | 'oncelik' | 'tur'>): { tone: Tone; etiket: string } {
  if (a.tur === 'BEKLEME') return { tone: 'info', etiket: 'BEKLİYORUZ' }
  if (a.tur === 'BILGI') return { tone: 'info', etiket: 'BİLGİ' }
  if (a.engel || a.oncelik === 0) return { tone: 'danger', etiket: 'ENGEL' }
  if (a.oncelik === 1) return { tone: 'danger', etiket: 'SÜRE RİSKİ' }
  if (a.oncelik === 2 || a.oncelik === 3) return { tone: 'warning', etiket: 'ONAY BEKLİYOR' }
  if (a.oncelik === 4) return { tone: 'steel', etiket: 'EKSİK' }
  return { tone: 'steel', etiket: 'SIRADAKİ İŞ' }
}

/** "YYYY-MM-DD" → "gg.aa.yyyy" (saat dilimi kaydırması olmadan). */
export function gunGoster(s: string | null | undefined): string {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s
}

/** Kalan gün metni: "11 gün kaldı" / "bugün" / "3 gün geçti". */
export function kalanMetni(n: number | null | undefined): string | null {
  if (n == null) return null
  if (n === 0) return 'bugün'
  return n > 0 ? `${n} gün kaldı` : `${-n} gün geçti`
}

/** "{belgeId}" yer tutuculu şablondan belge adresi (Neden? kanıt bağlantısı); şablon yoksa null. */
export function belgeAdresi(sablon: string | undefined, belgeId: string): string | null {
  return sablon ? sablon.replace('{belgeId}', encodeURIComponent(belgeId)) : null
}
