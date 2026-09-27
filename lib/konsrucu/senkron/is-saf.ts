/**
 * KonsRücü — Anlık senkron iş kuyruğu: saf kurallar · lib/konsrucu/senkron/is-saf.ts (DB yok, istemciye güvenli)
 *
 * S22 (06 §2(d)): "Kaydet ve UYAP'tan çek" → SenkronIs(BEKLIYOR) → eklenti 10 sn'lik yoklamada görür →
 * atomik üstlenir (ALINDI) → her adımı yazar (CALISIYOR) → bitirir (TAMAM | KISMI | HATA).
 * 5 dakika hareketsiz iş cron ile ZAMAN_ASIMI olur. Program sayfası işi 2 sn'de bir okur.
 *
 * Burada yalnız: sabitler, adım birleştirme (tek yazıcı: eklenti), ekrandaki görünüm ve "UYAP bağlı mı?"
 * cevabı (son nabızdan ölçülür; tahmin değil). Hepsi test edilir (tests/senkron-*.test.ts).
 */

export const IS_TURLERI = ['ICRA', 'HUKUK', 'ARABULUCULUK', 'DAVA_KESIF', 'KOPILOT'] as const
export type IsTuru = (typeof IS_TURLERI)[number]

export const IS_DURUMLARI = ['BEKLIYOR', 'ALINDI', 'CALISIYOR', 'TAMAM', 'KISMI', 'HATA', 'ZAMAN_ASIMI', 'IPTAL'] as const
export type IsDurumu = (typeof IS_DURUMLARI)[number]

/** Hâlâ sürmekte olan (eklentinin elinde ya da sırada) durumlar. */
export const ACIK_DURUMLAR: readonly IsDurumu[] = ['BEKLIYOR', 'ALINDI', 'CALISIYOR']
/** Eklentinin elindeki durumlar (adım yazılabilir). */
export const CALISAN_DURUMLAR: readonly IsDurumu[] = ['ALINDI', 'CALISIYOR']
/** Eklentinin bitirirken yazabileceği sonlar. */
export const BITIS_DURUMLARI = ['TAMAM', 'KISMI', 'HATA'] as const
export type BitisDurumu = (typeof BITIS_DURUMLARI)[number]

export const ADIM_DURUMLARI = ['BEKLIYOR', 'CALISIYOR', 'TAMAM', 'HATA', 'ATLANDI'] as const
export type AdimDurumu = (typeof ADIM_DURUMLARI)[number]

/** Eklentiden 2 dakikadır nabız yoksa "UYAP açık değil". */
export const NABIZ_ESIGI_MS = 2 * 60_000
/** İş 90 saniyede üstlenilmediyse "eklenti yanıt vermiyor" rehberi. */
export const USTLENME_ESIGI_MS = 90_000
/** 5 dakika hareketsiz (son adımdan beri) iş ZAMAN_ASIMI olur (cron). */
export const ZAMAN_ASIMI_MS = 5 * 60_000
/** Program sayfasının yoklama aralığı. */
export const YOKLAMA_MS = 2_000
/** Eklentinin iş sırası yoklama aralığı (eklenti tarafında da aynı sabit). */
export const EKLENTI_YOKLAMA_MS = 10_000

type AdimTanimi = { adim: string; etiket: string }

/** Tek dosyalık icra boru hattının adımları (06 §2(d) ekran taslağıyla aynı sıra). */
export const ICRA_ADIMLARI: readonly AdimTanimi[] = [
  { adim: 'ULASTI', etiket: 'İstek eklentiye ulaştı' },
  { adim: 'ESLESTIRME', etiket: 'Dosya bulundu (daire, esas no ve alacaklı doğrulaması)' },
  { adim: 'AYRINTI', etiket: 'Durum metni' },
  { adim: 'HESAP', etiket: 'Hesap: asıl alacak, faiz, tahsilat (bilgi amaçlı)' },
  { adim: 'EVRAK_LISTESI', etiket: 'Evrak listesi' },
  { adim: 'SAFAHAT', etiket: 'Safahat' },
  { adim: 'PROGRAMA_YAZIM', etiket: 'Programa yazıldı' },
  { adim: 'EVRAK_INDIRME', etiket: 'Evrak indiriliyor' },
]

/** Kopilot işi: eklenti paneli o dosyayla açar (UYAP'a hiçbir şey yazmaz). */
export const KOPILOT_ADIMLARI: readonly AdimTanimi[] = [
  { adim: 'ULASTI', etiket: 'İstek eklentiye ulaştı' },
  { adim: 'PANEL_ACILDI', etiket: 'Takip Aç paneli bu dosyayla açıldı' },
]

export function adimTanimlari(tur: string): readonly AdimTanimi[] {
  return tur === 'KOPILOT' ? KOPILOT_ADIMLARI : ICRA_ADIMLARI
}

export type Adim = {
  sira: number
  adim: string
  durum: AdimDurumu
  sayac?: { n: number; toplam: number | null } | null
  mesaj?: string | null
  t: string // ISO — son güncelleme
}

export type AdimGirdisi = { adim: string; durum: string; sayac?: { n?: unknown; toplam?: unknown } | null; mesaj?: unknown }

const MESAJ_SINIRI = 300

/** Eklentiden gelen adımı doğrular: bilinmeyen adım ya da durum → null (400). */
export function adimDogrula(tur: string, g: AdimGirdisi | null | undefined): { adim: string; durum: AdimDurumu; sayac: Adim['sayac']; mesaj: string | null } | null {
  if (!g || typeof g !== 'object') return null
  const adim = String(g.adim ?? '').trim().toUpperCase()
  if (!adimTanimlari(tur).some((a) => a.adim === adim)) return null
  const durum = String(g.durum ?? '').trim().toUpperCase()
  if (!(ADIM_DURUMLARI as readonly string[]).includes(durum)) return null
  let sayac: Adim['sayac'] = null
  if (g.sayac && typeof g.sayac === 'object') {
    const n = Number(g.sayac.n)
    const toplam = g.sayac.toplam == null ? null : Number(g.sayac.toplam)
    if (Number.isFinite(n) && n >= 0 && (toplam == null || (Number.isFinite(toplam) && toplam >= 0))) sayac = { n: Math.floor(n), toplam: toplam == null ? null : Math.floor(toplam) }
  }
  const mesaj = g.mesaj == null ? null : String(g.mesaj).replace(/\s+/g, ' ').trim().slice(0, MESAJ_SINIRI) || null
  return { adim, durum: durum as AdimDurumu, sayac, mesaj }
}

/** Mevcut adım listesine yeni adımı işler: aynı adım güncellenir (sırası korunur), yenisi sona eklenir. */
export function adimBirlestir(mevcut: unknown, yeni: { adim: string; durum: AdimDurumu; sayac?: Adim['sayac']; mesaj?: string | null }, t: Date): Adim[] {
  const liste: Adim[] = Array.isArray(mevcut) ? (mevcut as Adim[]).filter((a) => a && typeof a === 'object' && typeof a.adim === 'string') : []
  const i = liste.findIndex((a) => a.adim === yeni.adim)
  const kayit: Adim = { sira: i >= 0 ? liste[i].sira : liste.length, adim: yeni.adim, durum: yeni.durum, sayac: yeni.sayac ?? null, mesaj: yeni.mesaj ?? null, t: t.toISOString() }
  if (i >= 0) return liste.map((a, j) => (j === i ? kayit : a))
  return [...liste, kayit].slice(0, 40)
}

// ── Eşleşme sorunlarının düz Türkçe karşılığı (06 §2(d) "sorun örnekleri") ─────────
const ESLESME_METNI: Record<string, string> = {
  TARAF_UYUSMAZ: 'Bu dosyada alacaklı müvekkil değil (aleyhe dosya olabilir). Dosya bağlanmadı, hiçbir şey yazılmadı.',
  BASKA_DAIRE: 'Bu esas no girilen dairede yok; başka bir dairede görünüyor. Doğru daireyi kontrol edip yeniden çekin.',
  BULUNAMADI: 'Bu esas no UYAP\'ta bulunamadı (bu avukat hesabıyla görünmüyor olabilir). Numarayı kontrol edin.',
  DAIRE_COZULEMEDI: 'İcra dairesinin adı UYAP\'taki daire listesinde eşleşmedi. Daire adını UYAP\'taki gibi yazın.',
  DAIRE_EKSIK: 'İcra dairesi girilmemiş ve genel aramada dosya bulunamadı. Daireyi girip yeniden çekin.',
  COKLU_BELIRSIZ: 'Bu esas no ile birden çok dosya çıktı ve alacaklıya göre ayırt edilemedi. Daireyi kontrol edin.',
  OTURUM: 'UYAP oturumu kapandı. Yeniden giriş yapın; iş kaldığı yerden sürer.',
  HATA: 'Eklenti bu dosyayı çekerken hata aldı.',
}

export function eslesmeMetni(eslesme: string | null | undefined): string | null {
  if (!eslesme || eslesme === 'OK') return null
  return ESLESME_METNI[eslesme] ?? `UYAP eşleşmesi: ${eslesme}`
}

// ── "UYAP bağlı mı?" — son nabızdan ölçülür ──────────────────────────────────
export type NabizSatiri = { cihaz: string; surum: string; uyapOturum: boolean; sonGorulme: Date | string }
export type BaglantiDurumu = 'ACIK' | 'OTURUM_KAPALI' | 'SINYAL_YOK' | 'HIC_YOK'
export type Baglanti = { durum: BaglantiDurumu; metin: string; sonGorulme: string | null; surum: string | null; dakikaOnce: number | null }

export function baglantiDurumu(nabizlar: NabizSatiri[], simdi: Date = new Date()): Baglanti {
  const sirali = [...nabizlar]
    .map((n) => ({ ...n, ms: new Date(n.sonGorulme).getTime() }))
    .filter((n) => Number.isFinite(n.ms))
    .sort((a, b) => b.ms - a.ms)
  if (!sirali.length) {
    return { durum: 'HIC_YOK', metin: 'Eklentiden henüz sinyal gelmedi. Eklentiye kişisel anahtarınızı girin ve UYAP\'ı açın.', sonGorulme: null, surum: null, dakikaOnce: null }
  }
  const son = sirali[0]
  const dk = Math.max(0, Math.floor((simdi.getTime() - son.ms) / 60_000))
  const iso = new Date(son.ms).toISOString()
  if (simdi.getTime() - son.ms > NABIZ_ESIGI_MS) {
    return { durum: 'SINYAL_YOK', metin: `UYAP açık değil: eklentiden ${dk} dakikadır sinyal yok. UYAP'ı açtığınızda çekme kendiliğinden başlar.`, sonGorulme: iso, surum: son.surum, dakikaOnce: dk }
  }
  const taze = sirali.filter((n) => simdi.getTime() - n.ms <= NABIZ_ESIGI_MS)
  const acik = taze.find((n) => n.uyapOturum)
  if (acik) return { durum: 'ACIK', metin: 'UYAP bağlantısı açık.', sonGorulme: new Date(acik.ms).toISOString(), surum: acik.surum, dakikaOnce: Math.max(0, Math.floor((simdi.getTime() - acik.ms) / 60_000)) }
  return { durum: 'OTURUM_KAPALI', metin: 'Eklenti çalışıyor ama UYAP oturumu kapalı. UYAP\'a yeniden giriş yapın; iş kaldığı yerden sürer.', sonGorulme: iso, surum: son.surum, dakikaOnce: dk }
}

// ── Program sayfasındaki canlı görünüm ────────────────────────────────────────
export type IsKaydi = {
  id: string
  tur: string
  durum: string
  adimlarJson: unknown
  ozetJson: unknown
  hata: string | null
  createdAt: Date | string
  alindiAt: Date | string | null
  bittiAt: Date | string | null
  updatedAt: Date | string
  eklentiSurum?: string | null
}

export type IsOzeti = { evrakSayisi?: number | null; yeniEvrak?: number | null; buyukEvrak?: number | null; eslesme?: string | null; eslesmeNot?: string | null; durumMetni?: string | null; uyapAsilAlacak?: number | null }

export type GorunumAdimi = { adim: string; etiket: string; durum: AdimDurumu; mesaj: string | null; sayacMetni: string | null; t: string | null }
export type IsUyarisi = { tur: 'UYAP_KAPALI' | 'OTURUM_KAPALI' | 'USTLENILMEDI' | 'HAREKETSIZ' | 'ZAMAN_ASIMI' | 'HATA' | 'ESLESME'; metin: string }

export type IsGorunumu = {
  id: string
  tur: string
  durum: string
  baslik: string
  surerMi: boolean
  adimlar: GorunumAdimi[]
  uyari: IsUyarisi | null
  ozetMetni: string | null
  baslangic: string
  bitis: string | null
  ulasmaSaniye: number | null
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

function sayacMetni(s: Adim['sayac']): string | null {
  if (!s) return null
  return s.toplam != null ? `${s.n}/${s.toplam}` : String(s.n)
}

function ozetOku(o: unknown): IsOzeti {
  return o && typeof o === 'object' ? (o as IsOzeti) : {}
}

/** Bitmiş işin tek cümlelik özeti (ör. "18 evrak listelendi, 3 yeni evrak indi."). */
export function ozetMetni(is: Pick<IsKaydi, 'tur' | 'durum' | 'ozetJson'>): string | null {
  if (!['TAMAM', 'KISMI'].includes(is.durum)) return null
  if (is.tur === 'KOPILOT') return 'Takip Aç paneli UYAP sekmesinde bu dosyayla açıldı.'
  const o = ozetOku(is.ozetJson)
  const p: string[] = []
  if (o.evrakSayisi != null) p.push(`${o.evrakSayisi} evrak listelendi`)
  if (o.yeniEvrak != null) p.push(`${o.yeniEvrak} yeni evrak indi`)
  if (o.buyukEvrak) p.push(`${o.buyukEvrak} büyük evrak elle eklenmeli`)
  const govde = p.length ? p.join(', ') + '.' : 'UYAP verisi çekildi.'
  return is.durum === 'KISMI' ? `${govde} Bazı adımlar tamamlanamadı.` : govde
}

/**
 * İşi ekranda gösterilecek biçime çevirir. `nabiz` verilirse bekleyen işte "UYAP açık değil" uyarısı
 * ölçülen nabızdan gelir (tahmin değil).
 */
export function isGorunumu(is: IsKaydi, simdi: Date = new Date(), baglanti?: Baglanti | null): IsGorunumu {
  const tanim = adimTanimlari(is.tur)
  const gelen: Adim[] = Array.isArray(is.adimlarJson) ? (is.adimlarJson as Adim[]) : []
  const adimlar: GorunumAdimi[] = tanim.map((t) => {
    const g = gelen.find((a) => a.adim === t.adim)
    return { adim: t.adim, etiket: t.etiket, durum: (g?.durum ?? 'BEKLIYOR') as AdimDurumu, mesaj: g?.mesaj ?? null, sayacMetni: sayacMetni(g?.sayac ?? null), t: g?.t ?? null }
  })
  // "İstek eklentiye ulaştı": eklenti üstlendiyse adımı yazmasa da tamamdır
  if (is.alindiAt && adimlar[0]?.adim === 'ULASTI' && adimlar[0].durum === 'BEKLIYOR') adimlar[0] = { ...adimlar[0], durum: 'TAMAM', t: iso(is.alindiAt) }

  const surerMi = (ACIK_DURUMLAR as readonly string[]).includes(is.durum)
  const olusMs = new Date(is.createdAt).getTime()
  const sonHareketMs = new Date(is.updatedAt).getTime()
  const ulasmaSaniye = is.alindiAt ? Math.max(0, Math.round((new Date(is.alindiAt).getTime() - olusMs) / 1000)) : null
  const o = ozetOku(is.ozetJson)

  let uyari: IsUyarisi | null = null
  if (is.durum === 'BEKLIYOR') {
    if (baglanti && (baglanti.durum === 'SINYAL_YOK' || baglanti.durum === 'HIC_YOK')) uyari = { tur: 'UYAP_KAPALI', metin: baglanti.metin }
    else if (baglanti && baglanti.durum === 'OTURUM_KAPALI') uyari = { tur: 'OTURUM_KAPALI', metin: baglanti.metin }
    else if (simdi.getTime() - olusMs > USTLENME_ESIGI_MS) uyari = { tur: 'USTLENILMEDI', metin: 'Eklenti yanıt vermiyor: eklenti sürümünü (2.0) ve kişisel anahtarınızı kontrol edin.' }
  } else if ((CALISAN_DURUMLAR as readonly string[]).includes(is.durum)) {
    if (simdi.getTime() - sonHareketMs > ZAMAN_ASIMI_MS) uyari = { tur: 'HAREKETSIZ', metin: 'İş 5 dakikadır ilerlemiyor; birazdan zaman aşımına düşer ve sonraki toplu turda yeniden denenir.' }
  } else if (is.durum === 'ZAMAN_ASIMI') {
    uyari = { tur: 'ZAMAN_ASIMI', metin: 'İş 5 dakikada bitmedi (zaman aşımı). Dosya bir sonraki toplu turda yeniden denenir; isterseniz yeniden çekin.' }
  } else if (is.durum === 'HATA') {
    const e = eslesmeMetni(o.eslesme)
    uyari = e ? { tur: 'ESLESME', metin: e } : { tur: 'HATA', metin: `Çekme başarısız: ${is.hata ? String(is.hata).slice(0, 200) : 'bilinmeyen hata'}` }
  } else if (o.eslesme && o.eslesme !== 'OK') {
    const e = eslesmeMetni(o.eslesme)
    if (e) uyari = { tur: 'ESLESME', metin: e }
  }

  const baslik = is.durum === 'BEKLIYOR' ? 'UYAP\'tan çekilecek · eklenti bekleniyor'
    : (CALISAN_DURUMLAR as readonly string[]).includes(is.durum) ? (is.tur === 'KOPILOT' ? 'UYAP\'ta Takip Aç paneli açılıyor' : 'UYAP\'tan çekiliyor')
    : is.durum === 'TAMAM' ? 'UYAP\'tan çekildi'
    : is.durum === 'KISMI' ? 'UYAP\'tan kısmen çekildi'
    : is.durum === 'ZAMAN_ASIMI' ? 'Zaman aşımı'
    : is.durum === 'IPTAL' ? 'İptal edildi'
    : 'Çekme başarısız'

  return {
    id: is.id, tur: is.tur, durum: is.durum, baslik, surerMi, adimlar, uyari,
    ozetMetni: ozetMetni(is), baslangic: new Date(is.createdAt).toISOString(), bitis: iso(is.bittiAt), ulasmaSaniye,
  }
}

// ── Takip talebi mutabakatı ("UYAP takip talebi asıl alacak = programdaki") ───
export type Mutabakat = { durum: 'ESLESIYOR' | 'FARKLI' | 'BILINMIYOR'; metin: string }

export function takipMutabakati(programAsil: number | null | undefined, uyapAsil: number | null | undefined): Mutabakat {
  const p = programAsil == null ? NaN : Number(programAsil)
  const u = uyapAsil == null ? NaN : Number(uyapAsil)
  if (!Number.isFinite(p) || !Number.isFinite(u) || u <= 0) return { durum: 'BILINMIYOR', metin: 'Mutabakat: UYAP asıl alacağı ya da programdaki takip talebi yok.' }
  if (Math.abs(p - u) < 0.01) return { durum: 'ESLESIYOR', metin: 'Mutabakat: UYAP takip talebi asıl alacak = programdaki (eşleşiyor).' }
  return { durum: 'FARKLI', metin: 'Mutabakat: UYAP asıl alacağı programdaki takip talebinden farklı. Kontrol edin.' }
}

// ── Esas no ─────────────────────────────────────────────────────────────────
/** "2026/1234", "2026 / 1234", "2026/1234 E." → "2026/1234"; değilse null. */
export function esasNoCoz(s: unknown): string | null {
  const m = String(s ?? '').match(/\b((?:19|20)\d{2})\s*\/\s*(\d{1,7})\b/)
  return m ? `${m[1]}/${m[2]}` : null
}
