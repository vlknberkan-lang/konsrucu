/**
 * KonsRücü — Bilgi bankası üslup rehberinden `UslupKurali` adayı çıkarımı · lib/konsrucu/dilekce-v2/uslup-kaynak.ts (saf; DB yok, server-only yok)
 *
 * S36/07: `rucu-hukuk-asistani/bilgi-bankasi/dilekce/anatomi-ve-uslup.md` §1 "Mutlak yasaklar (kalite kapısı:
 * ENGEL)" — Y1-Y9 tablosu ("# | Yasak | Neden (D1–D3 kanıtı) | Yerine ne yazılır") ve tablonun hemen altındaki
 * "**Mutlak ifadeler:**" paragrafı — tek dosyadaki tek net biçimde SEPARABLE kural kümesidir (§2-§7 anlatı/kontrol
 * listesi ya da örnek metindir, kural değildir; buraya alınmaz).
 *
 * İdempotentlik notu: `UslupKurali` şemasında (musteriId, kod) gibi doğal bir tekillik anahtarı YOK (yalnız
 * `@@index([musteriId, durum])`; `kaynak='ELLE'` yolundaki tek-satır ekleme akışı hiç kod taşımıyor). Bu yüzden
 * her kuralın kimliği ("Y1" … "Y9", "MUTLAK_IFADELER") `metin` alanının BAŞINA `[Y1] ` biçiminde yazılır ve
 * yükleyici var olan satırları bu önekle eşleştirir (bkz. `uslupYuklemePlani`). Önek kullanıcıya görünür kalır —
 * ekranda kısa, tanınabilir bir etiket olarak da işlev görür (`atiflar.md`deki `#M01` çapalarıyla aynı mantık).
 */
import { createHash } from 'node:crypto'

export type AnatomiKuralAdayi = {
  /** "Y1" … "Y9" ya da "MUTLAK_IFADELER". `metin`in başındaki `[id]` önekiyle aynı. */
  id: string
  /** UslupKurali.kapsam: HEPSI | DAVA | DELIL | CEVABA_CEVAP | BEYAN. */
  kapsam: string
  /** `[id] Yasak … Yerine ne yazılır: …` (Yasak sütunu + varsa "Yerine ne yazılır" sütunu tek metne birleşir). */
  metin: string
  /** "Neden (D1-D3 kanıtı)" sütunu ya da "Mutlak ifadeler" paragrafındaki "Örnek:" cümlesi — somut örnek. */
  ornek: string | null
  bilgiBankasiYolu: string
}

export class UslupKaynakHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj)
    this.name = 'UslupKaynakHatasi'
  }
}

const KAPSAMLAR = ['HEPSI', 'DAVA', 'DELIL', 'CEVABA_CEVAP', 'BEYAN'] as const

/** Y7 "Basit yargılamada cevaba cevap" kuralı yalnız CEVABA_CEVAP türünü kapatır; geri kalanı HEPSİ. */
const KAPSAM_ISTISNASI: Record<string, (typeof KAPSAMLAR)[number]> = { Y7: 'CEVABA_CEVAP' }

function markdownTemizle(s: string): string {
  return s.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]*)\*\*/g, '$1').trim()
}

/** "| Y1 | **a** | b | c |" → ["Y1", "**a**", "b", "c"] (baştaki/sondaki boş hücreler atılır). */
function satiriBol(satir: string): string[] {
  const parcalar = satir.split('|').map((p) => p.trim())
  if (parcalar[0] === '') parcalar.shift()
  if (parcalar[parcalar.length - 1] === '') parcalar.pop()
  return parcalar
}

/**
 * `anatomi-ve-uslup.md`nin ham metninden §1 tablosunu (Y1-Y9) ve "Mutlak ifadeler" paragrafını çıkarır.
 * Bölüm bulunamazsa ya da tablo beklenen 4 kolonu taşımıyorsa `UslupKaynakHatasi` fırlatır (fail loudly).
 */
export function anatomiUslupKurallariCikar(
  md: string,
  bilgiBankasiYolu = 'bilgi-bankasi/dilekce/anatomi-ve-uslup.md#1',
): AnatomiKuralAdayi[] {
  const satirlar = md.replace(/\r\n/g, '\n').split('\n')
  const basIndex = satirlar.findIndex((s) => /^##\s+1\.\s+Mutlak yasaklar/.test(s.trim()))
  if (basIndex < 0) throw new UslupKaynakHatasi('"## 1. Mutlak yasaklar" bölümü bulunamadı.')
  const sonIndex = satirlar.findIndex((s, i) => i > basIndex && /^##\s+\d+\./.test(s.trim()))
  const bolum = satirlar.slice(basIndex, sonIndex < 0 ? satirlar.length : sonIndex)

  const tabloSatirlari = bolum.filter((s) => /^\|/.test(s.trim()))
  if (tabloSatirlari.length < 2) throw new UslupKaynakHatasi('§1 tablosu bulunamadı ya da boş.')
  const baslik = satiriBol(tabloSatirlari[0])
  if (baslik.length < 4) throw new UslupKaynakHatasi(`§1 tablosu 4 kolon bekliyor ("# | Yasak | Neden | Yerine ne yazılır"), ${baslik.length} bulundu.`)

  const adaylar: AnatomiKuralAdayi[] = []
  for (const satir of tabloSatirlari.slice(1)) {
    const h = satiriBol(satir)
    if (/^-+$/.test(h[0] ?? '')) continue // "|---|---|---|---|" ayraç satırı
    if (!/^Y\d+$/.test(h[0] ?? '')) continue // başka bir tablonun satırı olabilir; yalnız Y-id'li satırlar kural
    if (h.length < 4) throw new UslupKaynakHatasi(`${h[0]}: satır 4 kolon taşımıyor.`)
    const [id, yasak, neden, yerine] = h
    const kapsam = KAPSAM_ISTISNASI[id] ?? 'HEPSI'
    const metin = `[${id}] ${markdownTemizle(yasak)}${yerine ? ` Yerine ne yazılır: ${markdownTemizle(yerine)}` : ''}`
    adaylar.push({ id, kapsam, metin, ornek: neden ? markdownTemizle(neden) : null, bilgiBankasiYolu })
  }
  if (!adaylar.length) throw new UslupKaynakHatasi('§1 tablosunda Y-id\'li satır bulunamadı.')

  // "**Mutlak ifadeler:** … Örnek: … Böyle durumlarda …" — tablonun hemen altındaki tek paragraf.
  const mutlakSatiri = bolum.find((s) => /^\*\*Mutlak ifadeler:\*\*/.test(s.trim()))
  if (mutlakSatiri) {
    const duz = markdownTemizle(mutlakSatiri.trim())
    const ornekM = /Örnek:\s*(.*?)(?:\s+Böyle durumlarda\b.*)?$/.exec(duz)
    adaylar.push({
      id: 'MUTLAK_IFADELER',
      kapsam: 'HEPSI',
      metin: `[MUTLAK_IFADELER] ${duz}`,
      ornek: ornekM?.[1]?.trim() || null,
      bilgiBankasiYolu,
    })
  }

  return adaylar
}

/** Adayın içerik özeti (sha256) — yalnız plan hash'inde kullanılır; DB'ye YAZILMAZ (UslupKurali'nde ayrı kolon yok). */
export function uslupIcerikOzeti(a: { kapsam: string; metin: string; ornek: string | null }): string {
  return createHash('sha256').update(JSON.stringify([a.kapsam, a.metin, a.ornek ?? null]), 'utf8').digest('hex')
}

// ───────────────────────── yükleme planı ─────────────────────────

export type MevcutUslupKaydi = { id: string; kapsam: string; metin: string; ornek: string | null; surum: number; durum: string }

export type UslupYuklemeAdimi = { id: string; surum: number; kapsam: string }
export type UslupYuklemePlani = {
  eklenecek: UslupYuklemeAdimi[]
  /** İçerik değişti: yeni sürüm satırı açılır (durum=ONERI); onaylı/var olan satıra dokunulmaz. */
  yeniSurum: (UslupYuklemeAdimi & { oncekiSurum: number; oncekiOnayli: boolean })[]
  ayniKalacak: UslupYuklemeAdimi[]
  ozet: string
}

/**
 * `mevcutlar`: bu müvekkilin (durum != PASİF) satırları arasından `[id] ` önekiyle eşleşenler, id başına en
 * yüksek sürüm alınır (çağıran filtrelemeden vermişse burada da güvenle süzülür).
 */
export function uslupYuklemePlani(mevcutlar: readonly MevcutUslupKaydi[], adaylar: readonly AnatomiKuralAdayi[]): UslupYuklemePlani {
  const idOku = (metin: string) => /^\[([A-Z_0-9]+)\]\s/.exec(metin)?.[1] ?? null
  const mevcutByIdAktif = new Map<string, MevcutUslupKaydi[]>()
  for (const m of mevcutlar) {
    if (m.durum === 'PASIF') continue
    const id = idOku(m.metin)
    if (!id) continue
    const liste = mevcutByIdAktif.get(id) ?? []
    liste.push(m)
    mevcutByIdAktif.set(id, liste)
  }

  const eklenecek: UslupYuklemeAdimi[] = []
  const yeniSurum: UslupYuklemePlani['yeniSurum'] = []
  const ayniKalacak: UslupYuklemeAdimi[] = []
  for (const a of adaylar) {
    const list = [...(mevcutByIdAktif.get(a.id) ?? [])].sort((x, y) => y.surum - x.surum)
    const latest = list[0]
    if (!latest) { eklenecek.push({ id: a.id, surum: 1, kapsam: a.kapsam }); continue }
    const ayni = latest.kapsam === a.kapsam && latest.metin === a.metin && (latest.ornek ?? null) === (a.ornek ?? null)
    if (ayni) { ayniKalacak.push({ id: a.id, surum: latest.surum, kapsam: a.kapsam }); continue }
    yeniSurum.push({ id: a.id, surum: latest.surum + 1, kapsam: a.kapsam, oncekiSurum: latest.surum, oncekiOnayli: latest.durum === 'ONAYLI' })
  }
  const ozet = createHash('sha256')
    .update(JSON.stringify([eklenecek.map((e) => e.id).sort(), yeniSurum.map((y) => `${y.id}@${y.surum}`).sort(), adaylar.map(uslupIcerikOzeti)]), 'utf8')
    .digest('hex')
    .slice(0, 16)
  return { eklenecek, yeniSurum, ayniKalacak, ozet }
}
