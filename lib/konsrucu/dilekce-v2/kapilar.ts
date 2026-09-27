/**
 * KonsRücü — Dilekçe kalite kapıları · lib/konsrucu/dilekce-v2/kapilar.ts (saf; client-safe)
 *
 * S37 (06 §7.4; 07 S37). Kırmızı kapılar "imzaya hazır"ı KİLİTLER; hâkim gözü (hakim-gozu.ts) yalnız sarı
 * uyarı verir, hiçbir zaman kilitlemez. Bu dosya veri tabanına ERİŞMEZ: sunucu tarafı toplayıcı
 * (kalite-veri.ts) `KaliteGirdi`yi kurar, burada yalnız saf kurallar çalışır — aynı girdi → aynı çıktı.
 *
 * Kırmızı kural kodları (06 §7.4):
 *   K1_ATIF        doğrulanmamış/yasaklı atıf — tek tek avukat onayıyla açılır (atıf onayı Aktivite'ye yazılır;
 *                   bkz. app/(app)/dilekceler/uret/actions.ts · dilekceV2AtifOnayla). Yasak cümle onaylanamaz.
 *   K2_OLGU        kart dışı / kaynaksız AÇIKLAMA paragrafı (metinde "⟨KAYNAKSIZ:" işareti kaldıysa)
 *   K3_TUTARLILIK  metindeki dava değeri/tutar ↔ karttaki (kod hesaplı) değer; kart-seviyesi bilinen çelişkiler
 *   K4_TALEP_TAKIP talep sonucu ↔ geçerli TakipTalebi: takipte olmayan faiz türü ya da takibi aşan tutar
 *   K5_DAVALI      seçilen davalı ↔ itiraz eden teyitli borçlu (itiraz etmeyen borçlu davalıysa kırmızı)
 *   K6_YER_TUTUCU  kalmış yer tutucu (⟨…⟩, doldurulmamış {{…}}, "[...]" biçimli boş köşeli ayraç)
 *   K7_KVKK        başka müvekkilin adı ya da açılmamış/yabancı maskeleme jetonu metinde kaldıysa
 *   K8_TENSIP      tensip provası: dava şartı arabuluculukta son tutanak eki yok
 *
 * Rol kapısı burada YOKTUR: "İmzaya hazır"ı yalnız ADMIN/AVUKAT yapabilir kuralı sunucu eyleminde
 * (dilekceV2TaslakKaydet, `avukatRoluMu`) uygulanır — bu dosya rolden habersizdir.
 */
import { kacis } from '@/lib/ai/maske'
import { jetonKaldiMi } from '@/lib/ai/geri-ac'
import { atifKapisi, type KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'
import { YER_TUTUCU_RE } from './sablon-dil'
import { tensipProvasi, type TensipGirdi } from './tensip-provasi'
import { hakimGozu } from './hakim-gozu'
import type { DavaliAdayi } from './tipler'

// ───────────────────────── türler ─────────────────────────

export const KIRMIZI_KODLARI = [
  'K1_ATIF', 'K2_OLGU', 'K3_TUTARLILIK', 'K4_TALEP_TAKIP', 'K5_DAVALI', 'K6_YER_TUTUCU', 'K7_KVKK', 'K8_TENSIP',
] as const
export type KirmiziKod = (typeof KIRMIZI_KODLARI)[number]

export const KIRMIZI_KAPI_ETIKETI: Record<KirmiziKod, string> = {
  K1_ATIF: 'Atıf kapısı', K2_OLGU: 'Olgu kapısı', K3_TUTARLILIK: 'Tutarlılık',
  K4_TALEP_TAKIP: 'Talep sonucu ↔ takip talebi', K5_DAVALI: 'Davalılar ↔ itiraz',
  K6_YER_TUTUCU: 'Yer tutucu', K7_KVKK: 'KVKK ve jeton', K8_TENSIP: 'Tensip provası',
}

export type KirmiziBulgu = {
  kod: KirmiziKod
  mesaj: string
  /** Yalnız K1_ATIF'te ve yalnız kütüphaneyle eşleşme sorunlarında dolu: tek tek avukat onayıyla açılabilir.
   *  Yasak cümleler (kalıp ihlali) onaylanamaz; metin düzeltilmelidir. */
  atif?: { anahtar: string; metin: string }
}

export type SariBulgu = { kod: string; mesaj: string }

/** Avukatın tek tek geçirdiği (onayladığı) atıf kaydı (DilekceSurum.atifJson). Kimlik `anahtar`dır (06 §7.4-1). */
export type AtifOnayKaydi = { anahtar: string; metin: string; onaylayanId: string; at: string; resmiUrl: string | null; gerekce?: string | null }

export type KaliteGirdi = {
  /** Dilekçenin nihai (avukatın o an düzenlediği) metni. */
  metin: string
  kutuphane: readonly KutuphaneKaydi[]
  atifOnaylari: readonly AtifOnayKaydi[]
  davaliAdaylari: readonly DavaliAdayi[]
  /** Kilitli karttaki seçili davalılar (KartSecimler.davalilar; borcluId listesi). */
  secilenDavalilar: readonly string[]
  /** Kart seviyesinde zaten tespit edilmiş çelişkiler (kart.ts · kodCeliskileri). */
  celiskiler: readonly { aciklama: string }[]
  /** kart.ts · davaDegeriOnerisi ile hesaplanan, composer'ın metne bastığı değer (kuruş). */
  davaDegeriKurus: number | null
  takip: { gecerli: boolean; faizTuru: string | null; toplamKurus: number | null } | null
  /** Bu kullanıcının eriştiği DİĞER (aktif) müvekkillerin unvanları — aktif müşteri hariç. */
  digerMusteriAdlari: readonly string[]
  tensip: Omit<TensipGirdi, 'metin'>
}

export type KaliteRaporu = {
  kirmizi: KirmiziBulgu[]
  sari: SariBulgu[]
  imzayaHazirOlabilir: boolean
}

// ───────────────────────── K1 atıf ─────────────────────────

function k1Atif(g: KaliteGirdi): KirmiziBulgu[] {
  const sonuc = atifKapisi(g.metin, g.kutuphane)
  const onayli = new Set(g.atifOnaylari.map((a) => a.anahtar))
  const bulgular: KirmiziBulgu[] = []
  for (const a of sonuc.atiflar) {
    if (!a.kirmizi || onayli.has(a.anahtar)) continue
    bulgular.push({ kod: 'K1_ATIF', mesaj: `Doğrulanmamış atıf: "${a.metin}" (${a.anahtar}). ${a.notlar.join(' ')}`.trim(), atif: { anahtar: a.anahtar, metin: a.metin } })
  }
  for (const y of sonuc.yasaklar) {
    bulgular.push({ kod: 'K1_ATIF', mesaj: `Yasaklı ifade: ${y.aciklama} — metinde: "${y.metin}"` })
  }
  return bulgular
}

// ───────────────────────── K2 olgu (kaynaksız) ─────────────────────────

const KAYNAKSIZ_RE = /⟨KAYNAKSIZ:[^⟩]*⟩/gu

function k2Olgu(g: KaliteGirdi): KirmiziBulgu[] {
  const adet = [...g.metin.matchAll(KAYNAKSIZ_RE)].length
  if (!adet) return []
  return [{ kod: 'K2_OLGU', mesaj: `${adet} AÇIKLAMA paragrafı kart olgularıyla bağlanamadı (⟨KAYNAKSIZ⟩ işaretli); avukat kontrol etmeden imzalamayın.` }]
}

// ───────────────────────── K3 tutarlılık ─────────────────────────

const DAVA_DEGERI_ETIKET_RE = /DAVA\s+DEĞERİ\s*:?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL/giu

function tlKurusaCevir(s: string): number {
  const [tl, kr] = s.replace(/\./g, '').split(',')
  return Number(tl) * 100 + Number((kr ?? '00').padEnd(2, '0'))
}

function k3Tutarlilik(g: KaliteGirdi): KirmiziBulgu[] {
  const bulgular: KirmiziBulgu[] = g.celiskiler.map((c) => ({ kod: 'K3_TUTARLILIK' as const, mesaj: c.aciklama }))
  if (g.davaDegeriKurus != null) {
    for (const m of g.metin.matchAll(DAVA_DEGERI_ETIKET_RE)) {
      const metinKurus = tlKurusaCevir(m[1])
      if (metinKurus !== g.davaDegeriKurus) {
        bulgular.push({
          kod: 'K3_TUTARLILIK',
          mesaj: `Metindeki dava değeri (${m[1]} TL) karttaki hesaplanan değerle (${(g.davaDegeriKurus / 100).toFixed(2).replace('.', ',')} TL) uyuşmuyor.`,
        })
      }
    }
  }
  return bulgular
}

// ───────────────────────── K4 talep sonucu ↔ takip talebi ─────────────────────────

// Not: 'g' bayrağı YOK — bu nesneler modül seviyesinde paylaşılır ve `.test()` ile kullanılır; 'g' ile
// `lastIndex` çağrılar arasında kalıp yanlış (sessiz) negatif üretirdi. Çoklu eşleşme aranmıyor, yalnız var/yok.
const FAIZ_ANAHTARLARI: { tur: string; ad: string; re: RegExp }[] = [
  { tur: 'YASAL', ad: 'yasal faiz', re: /yasal\s+faiz/iu },
  { tur: 'AVANS', ad: 'avans faizi', re: /avans\s+faizi/iu },
  { tur: 'DIGER', ad: 'akdi/sözleşme/reeskont/ticari faiz', re: /(?:akdi|sözleşme|reeskont|ticari)\s+faiz/iu },
]

function k4TalepTakip(g: KaliteGirdi): KirmiziBulgu[] {
  const bulgular: KirmiziBulgu[] = []
  for (const f of FAIZ_ANAHTARLARI) {
    if (!f.re.test(g.metin)) continue
    if (!g.takip?.gecerli) {
      bulgular.push({ kod: 'K4_TALEP_TAKIP', mesaj: `Metinde "${f.ad}" geçiyor ancak bu dosyada geçerli bir takip talebi kaydı yok.` })
    } else if (g.takip.faizTuru !== f.tur) {
      bulgular.push({ kod: 'K4_TALEP_TAKIP', mesaj: `Metinde "${f.ad}" geçiyor; geçerli takip talebindeki faiz türü bu değil (kayıtlı: ${g.takip.faizTuru ?? 'seçilmedi'}).` })
    }
  }
  if (g.davaDegeriKurus != null && g.takip?.gecerli && g.takip.toplamKurus != null && g.davaDegeriKurus > g.takip.toplamKurus) {
    bulgular.push({
      kod: 'K4_TALEP_TAKIP',
      mesaj: `Dava değeri (${(g.davaDegeriKurus / 100).toFixed(2).replace('.', ',')} TL) geçerli takip talebindeki toplamı (${(g.takip.toplamKurus / 100).toFixed(2).replace('.', ',')} TL) aşıyor.`,
    })
  }
  return bulgular
}

// ───────────────────────── K5 davalılar ↔ itiraz ─────────────────────────

function k5Davali(g: KaliteGirdi): KirmiziBulgu[] {
  const bulgular: KirmiziBulgu[] = []
  for (const id of g.secilenDavalilar) {
    const aday = g.davaliAdaylari.find((a) => a.borcluId === id)
    if (!aday) { bulgular.push({ kod: 'K5_DAVALI', mesaj: `Seçilen davalı aday listesinde bulunamadı (borcluId: ${id}).` }); continue }
    if (aday.itirazVar !== true) bulgular.push({ kod: 'K5_DAVALI', mesaj: `Seçilen davalının süresinde/teyitli itirazı yok: ${aday.ad}.` })
  }
  return bulgular
}

// ───────────────────────── K6 yer tutucu ─────────────────────────

const MUSTACHE_KALAN_RE = /\{\{[^{}]{1,300}\}\}/gu
const BRACKET_YER_TUTUCU_RE = /\[\s*(?:\.\.\.|…)\s*\]/gu
const KORUNMUS_ISARET_ONEKLERI = ['KAYNAKSIZ:', 'DOĞRULANMADI', 'UYARI:']

function k6YerTutucu(g: KaliteGirdi): KirmiziBulgu[] {
  const genelYerTutucu = [...g.metin.matchAll(YER_TUTUCU_RE)].filter((m) => !KORUNMUS_ISARET_ONEKLERI.some((on) => m[0].includes(on)))
  const mustache = [...g.metin.matchAll(MUSTACHE_KALAN_RE)]
  const bracket = [...g.metin.matchAll(BRACKET_YER_TUTUCU_RE)]
  const toplam = genelYerTutucu.length + mustache.length + bracket.length
  if (!toplam) return []
  const ornekler = [...genelYerTutucu, ...mustache, ...bracket].slice(0, 3).map((m) => m[0])
  return [{ kod: 'K6_YER_TUTUCU', mesaj: `${toplam} yer tutucu doldurulmadan kalmış: ${ornekler.join(', ')}${toplam > ornekler.length ? ' …' : ''}` }]
}

// ───────────────────────── K7 KVKK ve jeton ─────────────────────────

const SOL = '(?<![\\p{L}\\p{N}])'
const SAG = '(?![\\p{L}\\p{N}])'
const SIRKET_EKI = new Set([
  'as', 'anonim', 'sirket', 'sirketi', 'ltd', 'sti', 'limited', 'sigorta', 'reasurans', 'holding',
  'grup', 'group', 'turkiye', 'emeklilik', 'ticaret', 'sanayi', 've',
])
const GENEL_KELIMELER = new Set([
  'genel', 'turk', 'yeni', 'buyuk', 'ortak', 'birlesik', 'milli', 'ulusal', 'ozel', 'merkez', 'halk',
  'guven', 'guvence', 'ilk', 'ana', 'tam', 'gorup',
])
const cozAd = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')

/** Bir unvandaki ayırt edici (kısaltmaya uygun) sözcükleri bulur — şirket eki ve genel kelimeler elenir. */
function ayirtEdiciSozcukler(unvan: string): string[] {
  const kelimeler = unvan.split(/\s+/).map((k) => k.replace(/[().,]/g, '')).filter(Boolean)
  const out: string[] = []
  for (const k of kelimeler) {
    if (k.length < 3) continue
    const cozulen = cozAd(k)
    if (SIRKET_EKI.has(cozulen) || GENEL_KELIMELER.has(cozulen)) continue
    out.push(k)
    if (out.length >= 3) break
  }
  return out
}

function k7Kvkk(g: KaliteGirdi): KirmiziBulgu[] {
  const bulgular: KirmiziBulgu[] = []
  if (jetonKaldiMi(g.metin)) {
    bulgular.push({ kod: 'K7_KVKK', mesaj: 'Maskeleme jetonu (ör. [KİŞİ-2]) metinde açılmamış ya da yabancı kaldı; imzadan önce geri açılmalı ya da elle düzeltilmelidir.' })
  }
  for (const ad of g.digerMusteriAdlari) {
    for (const token of ayirtEdiciSozcukler(ad)) {
      const re = new RegExp(`${SOL}${kacis(token)}${SAG}`, 'iu')
      if (re.test(g.metin)) {
        bulgular.push({ kod: 'K7_KVKK', mesaj: `Metinde başka bir müvekkilin adına ait bir ifade geçiyor gibi görünüyor: "${token}" (${ad}). Üretim/imza durur; KVKK karışması olabilir.` })
        break
      }
    }
  }
  return bulgular
}

// ───────────────────────── K8 tensip provası ─────────────────────────

function k8Tensip(g: KaliteGirdi): { kirmizi: KirmiziBulgu[]; sari: SariBulgu[] } {
  const r = tensipProvasi({ ...g.tensip, metin: g.metin })
  const kirmizi: KirmiziBulgu[] = r.kirmiziMesaj ? [{ kod: 'K8_TENSIP', mesaj: r.kirmiziMesaj }] : []
  const sari: SariBulgu[] = r.maddeler.filter((m) => m.durum === 'EKSIK').map((m) => ({ kod: `TENSIP_${m.kod}`, mesaj: `Tensip provası — ${m.baslik}: ${m.aciklama}` }))
  return { kirmizi, sari }
}

// ───────────────────────── kapı ─────────────────────────

/** Bütün kırmızı ve sarı kuralları çalıştırır; hâkim gözü (hakim-gozu.ts) sarıya eklenir. Saf fonksiyondur. */
export function kaliteRaporu(g: KaliteGirdi): KaliteRaporu {
  const tensip = k8Tensip(g)
  const kirmizi: KirmiziBulgu[] = [
    ...k1Atif(g), ...k2Olgu(g), ...k3Tutarlilik(g), ...k4TalepTakip(g), ...k5Davali(g), ...k6YerTutucu(g), ...k7Kvkk(g), ...tensip.kirmizi,
  ]
  const sari: SariBulgu[] = [
    ...tensip.sari,
    ...hakimGozu(g.metin).map((h) => ({ kod: `HAKIM_${h.kod}`, mesaj: `${h.sorun} — "${h.konum}" (${h.gerekce})` })),
  ]
  return { kirmizi, sari, imzayaHazirOlabilir: kirmizi.length === 0 }
}
