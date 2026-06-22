/**
 * KonsRücü — belge sınıflandırma · lib/konsrucu/belge-siniflandir.ts (saf, paylaşımlı)
 * İçerik (öncelikli) + dosya adı sinyalleriyle kategori + güven skoru üretir.
 * Türkçe aksan/küçük-harf toleranslı; tarayıcıda (evrak-cikar) ve sunucuda (backfill) aynı mantık.
 */
// Not: VEKALETNAME per-dosya kategori DEĞİL — tüm dosyalarda ortak tek belge,
// Şirket Bilgileri (Ayarlar) sayfasından yönetilir. Burada sınıflandırılmaz.
export type BelgeKat =
  | 'POLICE' | 'DEKONT' | 'LEHE' | 'EKSPERTIZ' | 'TUTANAK'
  | 'SBM' | 'EHLIYET' | 'RUHSAT' | 'ALKOL' | 'HASAR_FOTO' | 'DIGER'

/** Aksan + küçük harf sadeleştir (OCR/casing toleransı). */
export function trSade(s: string | null | undefined): string {
  return (s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[âäàá]/g, 'a').replace(/[îïíì]/g, 'i').replace(/[ûüùú]/g, 'u').replace(/[ôöòó]/g, 'o')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Kategori başına [güçlü, zayıf] anahtar listeleri (sadeleştirilmiş, aksan-sız).
const KURALLAR: { kat: BelgeKat; guclu: string[]; zayif: string[] }[] = [
  {
    kat: 'LEHE',
    guclu: ['lehe hukuk devir', 'lehe ve hukuk', 'hukuk devir form', 'rucu muhatab', 'rucu gerekce', 'devir ve temlik', 'temlikname'],
    zayif: ['lehe', 'devir form'],
  },
  {
    kat: 'TUTANAK',
    guclu: ['kaza tespit tutanag', 'trafik kazasi tespit', 'maddi hasarli trafik kazasi', 'kaza tutanag', 'tek tarafli kaza', 'trafik kazasi tutanag'],
    zayif: ['tutanak', 'kaza yeri', 'kaza tarihi ve saati', 'carpisma'],
  },
  {
    kat: 'EKSPERTIZ',
    guclu: ['ekspertiz rapor', 'eksper rapor', 'hasar tespit rapor', 'eksper sicil', 'hasar ekspertiz', 'on ekspertiz', 'kesin ekspertiz'],
    zayif: ['ekspertiz', 'eksper', 'pert', 'sovtaj', 'hasar bedeli tespit'],
  },
  {
    kat: 'POLICE',
    guclu: ['sigorta policesi', 'police no', 'policy no', 'tanzim tarihi', 'brut prim', 'net prim', 'zorunlu mali sorumluluk', 'kasko sigorta police', 'police numarasi'],
    zayif: ['police', 'policy', 'kasko', 'zmms', 'zmss', 'teminat', 'prim', 'acente', 'sigorta ettiren', 'sigortali', 'tramer no'],
  },
  {
    kat: 'DEKONT',
    guclu: ['odeme dekontu', 'para transfer dekontu', 'masraf dekontu', 'dekont', 'havale dekontu', 'hesap dekontu', 'banka dekontu'],
    zayif: ['havale', 'eft', 'makbuz', 'tahsilat', 'virman', 'islem tutari', 'odenecek tutar', 'hesaba gecen', 'gonderen', 'alici iban', 'odeme tarihi'],
  },
  {
    kat: 'ALKOL',
    guclu: ['alkol olcum', 'promil', 'alkolmetre', 'alkol muayene'],
    zayif: ['alkol'],
  },
  {
    kat: 'EHLIYET',
    guclu: ['surucu belgesi', 'suru belgesi', 'driving licence', 'driver license'],
    zayif: ['ehliyet', 'sinif b'],
  },
  {
    kat: 'RUHSAT',
    guclu: ['arac tescil belgesi', 'motorlu arac tescil', 'tescil belgesi'],
    zayif: ['ruhsat', 'tescil', 'sasi no', 'motor no'],
  },
  {
    kat: 'SBM',
    guclu: ['sigorta bilgi ve gozetim', 'hasar dosya sorgulama', 'sbm sorgu'],
    zayif: ['sbm', 'tramer'],
  },
]

/** İçerikten kategori + güçlü-sinyal var mı. En yüksek skoru seçer; hiç yoksa null. */
function icerikSkor(metin: string | null | undefined): { kat: BelgeKat; guclu: boolean } | null {
  const s = trSade(metin).slice(0, 8000)
  if (!s) return null
  let en: { kat: BelgeKat; skor: number; guclu: boolean } | null = null
  for (const k of KURALLAR) {
    let skor = 0
    let guclu = false
    for (const g of k.guclu) if (s.includes(g)) { skor += 3; guclu = true }
    for (const z of k.zayif) if (s.includes(z)) skor += 1
    if (skor > 0 && (!en || skor > en.skor)) en = { kat: k.kat, skor, guclu }
  }
  return en ? { kat: en.kat, guclu: en.guclu } : null
}

/** Dosya adından kategori (içerik boş/çıkmazsa yedek). */
export function adKategori(ad: string): BelgeKat | null {
  const s = trSade(ad)
  if (/lehe|devir|temlik/.test(s)) return 'LEHE'
  if (/tutanak|kaza tespit|tramer/.test(s)) return 'TUTANAK'
  if (/ekspertiz|eksper|hasar rapor/.test(s)) return 'EKSPERTIZ'
  if (/police|policy|kasko|zmms|zmss|trafik sigorta/.test(s)) return 'POLICE'
  if (/dekont|odeme|makbuz|tahsilat|havale|eft|fatura/.test(s)) return 'DEKONT'
  if (/alkol|promil/.test(s)) return 'ALKOL'
  if (/ehliyet|surucu belge/.test(s)) return 'EHLIYET'
  if (/ruhsat|tescil/.test(s)) return 'RUHSAT'
  if (/sbm|sorgu/.test(s)) return 'SBM'
  return null
}

/**
 * Belgeyi sınıflandır: foto → HASAR_FOTO; içerik güçlü → 0.92; içerik zayıf → 0.72;
 * yalnız dosya adı → 0.6 (gözden geçir); hiçbiri → DIGER 0.4.
 */
export function siniflandir(p: { dosyaAdi: string; metin?: string | null; foto?: boolean }): { kategori: BelgeKat; guven: number } {
  if (p.foto) return { kategori: 'HASAR_FOTO', guven: 0.95 }
  const ic = icerikSkor(p.metin)
  if (ic) return { kategori: ic.kat, guven: ic.guclu ? 0.92 : 0.72 }
  const ad = adKategori(p.dosyaAdi)
  if (ad) return { kategori: ad, guven: 0.6 }
  return { kategori: 'DIGER', guven: 0.4 }
}
