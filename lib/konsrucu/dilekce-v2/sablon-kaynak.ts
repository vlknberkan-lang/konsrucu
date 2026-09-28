/**
 * KonsRücü — Bilgi bankası şablon md dosyalarından `DilekceSablon` adayı çıkarımı · lib/konsrucu/dilekce-v2/sablon-kaynak.ts (saf; DB yok, server-only yok)
 *
 * S36/07: `rucu-hukuk-asistani/bilgi-bankasi/dilekce/sablonlar/*.md` dosyaları hem metadata tablosu (Tür,
 * Varyant, Kaynak örnek …) hem de `{{...}}` dilinde yazılmış şablon gövdesini (```text bloğu) bir arada taşır.
 * Bu modül DB'ye ve `araclar/sablon-yukle.ts` CLI'sine bağımlı DEĞİLDİR — yalnız metinden yapıya çıkarım yapar,
 * böylece gerçek 5 md dosyasına karşı vitest ile test edilebilir (`tests/dilekce-sablon-kaynak.test.ts`).
 *
 * Dört dosya (kasko, zmss-alkol, cevaba-cevap, delil) tek bir "## N. Şablon metni" bölümü taşır → tek aday,
 * `kod` = dosya adı. `beyan.md` altı ayrı durumun (belge sunma, müzekkere cevabı, …) her biri kendi numaralı
 * bölümünde ayrı bir ```text bloğu taşır → altı aday, `kod` = "beyan-N" (N = bölüm numarası; `bilgiBankasiYolu`
 * `#N` ile aynı bölüme işaret eder, Yelda md dosyasında doğrudan bulur).
 *
 * Varyant çıkarımı (rücu sebebi/mahkeme/usul/davalı türü) metadata tablosunun "Tür" + "Varyant" satırlarından
 * (ya da beyan.md gibi Varyant satırı yoksa bölüm başlığından) anahtar kelimeyle yapılır — kesin olmayan eksen
 * BOŞ bırakılır (iskelet.ts `uyumPuani`: boş eksen "GENEL" sayılır, yanlış varyantı "yakın" diye seçmekten
 * güvenlidir). Rücu sebebi kodu için mevcut `hugoRucuNedeniEsle` (S19) yeniden kullanılır: branş metinden
 * (kasko/ZMSS geçiyor mu) çıkarılamıyorsa kod hiç dönmez (adaylar listesi var ama `kod: null`).
 */
import { createHash } from 'node:crypto'
import { MAHKEME_TURLERI, MAHKEME_TUR_ETIKET } from '@/lib/konsrucu/dava/sabitler'
import { hugoRucuNedeniEsle } from '@/lib/konsrucu/rucu-sebebi'
import type { VaryantAnahtari } from './iskelet'

// ───────────────────────── metadata tablosu ─────────────────────────

export type MdMetaVerisi = Record<string, string>

/** "| Özellik | Değer |" tablosunu (dosyanın ilk `---` ayracına kadarki kısmını) `{Özellik: Değer}` okur. */
export function mdMetaVerisiOku(md: string): MdMetaVerisi {
  const satirlar = md.replace(/\r\n/g, '\n').split('\n')
  const ayracIndex = satirlar.findIndex((s) => /^-{3,}\s*$/.test(s.trim()))
  const blok = ayracIndex >= 0 ? satirlar.slice(0, ayracIndex) : satirlar
  const meta: MdMetaVerisi = {}
  for (const satir of blok) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(satir)
    if (!m) continue
    const anahtar = m[1].trim()
    if (anahtar === 'Özellik' || /^-+$/.test(anahtar)) continue
    if (!(anahtar in meta)) meta[anahtar] = m[2].trim()
  }
  return meta
}

// ───────────────────────── varyant anahtar kelime çıkarımı ─────────────────────────

const temizle = (s: string) => s.replace(/[`*_]/g, '').toLocaleLowerCase('tr')

function mahkemeTuruBul(text: string): string | null {
  const t = temizle(text)
  for (const kod of MAHKEME_TURLERI) {
    if (t.includes(MAHKEME_TUR_ETIKET[kod].toLocaleLowerCase('tr'))) return kod
  }
  return null
}

/** "yalnız/sadece X usul" varsa kesin (diğer geçişleri ez); yoksa iki sözcük de varsa belirsiz → null (GENEL). */
function usulBul(text: string): string | null {
  const t = temizle(text)
  const ozel = /(?:yaln[ıi]z(?:ca)?|sadece)\s+(yazılı|basit)\s+usul/.exec(t)
  if (ozel) return ozel[1] === 'basit' ? 'BASIT' : 'YAZILI'
  const yazili = t.includes('yazılı')
  const basit = t.includes('basit')
  if (yazili && basit) return null
  if (basit) return 'BASIT'
  if (yazili) return 'YAZILI'
  return null
}

function davaliTuruBul(text: string): string | null {
  const t = temizle(text)
  if (t.includes('kamu')) return 'KAMU'
  if (t.includes('gerçek kişi')) return 'GERCEK'
  if (t.includes('tüzel')) return 'OZEL_TUZEL'
  return null
}

/** Branş metinden çıkarılamıyorsa (kasko ve ZMSS ikisi de geçiyor ya da hiçbiri) kod aranmaz — GENEL kalır. */
function rucuSebebiKoduBul(text: string): string | null {
  const t = temizle(text)
  const kaskoVar = t.includes('kasko')
  const zmssVar = t.includes('zmss') || t.includes('zmms')
  const brans = kaskoVar && !zmssVar ? 'KASKO' : zmssVar && !kaskoVar ? 'ZMMS' : undefined
  return hugoRucuNedeniEsle(text, brans).kod
}

/** Serbest metinden varyant ekseni çıkarır; belirsiz eksen `undefined` bırakılır (GENEL). */
export function metinVaryantCikar(text: string): VaryantAnahtari {
  const v: VaryantAnahtari = {}
  const mahkemeTuru = mahkemeTuruBul(text)
  const usul = usulBul(text)
  const davaliTur = davaliTuruBul(text)
  const rucuSebebiKod = rucuSebebiKoduBul(text)
  if (mahkemeTuru) v.mahkemeTuru = mahkemeTuru
  if (usul) v.usul = usul
  if (davaliTur) v.davaliTur = davaliTur
  if (rucuSebebiKod) v.rucuSebebiKod = rucuSebebiKod
  return v
}

function turBul(deger: string): string | null {
  const up = deger.toLocaleUpperCase('tr')
  if (up.includes('CEVABA_CEVAP') || up.includes('CEVABA CEVAP')) return 'CEVABA_CEVAP'
  if (up.includes('DELİL') || up.includes('DELIL')) return 'DELIL'
  if (up.includes('BEYAN')) return 'BEYAN' // "`BEYAN` ve `TALEP`" → BEYAN (KART_TURLERI'nde TALEP yok)
  if (up.includes('DAVA')) return 'DAVA'
  return null
}

// ───────────────────────── md → şablon adayları ─────────────────────────

export type SablonAdayi = {
  /** DilekceSablon.kod adayı: dosya tek adaylıysa dosya adı, çok adaylıysa "dosya-bölümNo". */
  kod: string
  tur: string
  varyantJson: VaryantAnahtari
  /** `{{...}}` dilindeki şablon gövdesi (bloklarJson.kaynak). */
  kaynakMetni: string
  dosyaAdi: string
  bolumNo: number
  bolumBasligi: string
  /** "Kaynak örnek" metadata satırı (kaynakOrnek alanına aynen yazılır). */
  kaynakOrnek: string | null
  bilgiBankasiYolu: string
}

const BASLIK_RE = /^##\s+(\d+)\.\s+(.+?)\s*$/
const FENCE_RE = /```text\r?\n([\s\S]*?)\r?\n```/g

export class SablonKaynakHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj)
    this.name = 'SablonKaynakHatasi'
  }
}

/**
 * Bir bilgi bankası md dosyasının ham metnini `DilekceSablon` adaylarına çevirir. Numaralı `## N. Başlık`
 * bölümleri içindeki ```text bloklarından yalnız `{{!` (blok açıklaması) içerenler şablon sayılır — "Ek
 * paketi", "Alan tablosu" gibi bölümlerdeki tablo/metin blokları görmezden gelinir.
 */
export function mdDenSablonAdaylariCikar(
  md: string,
  dosyaAdi: string,
  kaynakOnek = 'bilgi-bankasi/dilekce/sablonlar',
): SablonAdayi[] {
  const meta = mdMetaVerisiOku(md)
  const turDegeri = meta['Tür']
  const tur = turDegeri ? turBul(turDegeri) : null
  if (!tur) throw new SablonKaynakHatasi(`${dosyaAdi}: metadata tablosunda tanınabilir bir "Tür" satırı yok.`)

  const satirlar = md.replace(/\r\n/g, '\n').split('\n')
  type Bolum = { no: number; baslik: string; basSatir: number; sonSatir: number }
  const bolumler: Bolum[] = []
  satirlar.forEach((satir, i) => {
    const m = BASLIK_RE.exec(satir)
    if (m) bolumler.push({ no: Number(m[1]), baslik: m[2].trim(), basSatir: i, sonSatir: satirlar.length })
  })
  bolumler.forEach((b, i) => { if (i + 1 < bolumler.length) b.sonSatir = bolumler[i + 1].basSatir })

  const hamAdaylar: { bolum: Bolum; govde: string }[] = []
  for (const b of bolumler) {
    const parca = satirlar.slice(b.basSatir, b.sonSatir).join('\n')
    FENCE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = FENCE_RE.exec(parca))) {
      const govde = m[1].trim()
      if (govde.includes('{{!')) hamAdaylar.push({ bolum: b, govde })
    }
  }
  if (!hamAdaylar.length) throw new SablonKaynakHatasi(`${dosyaAdi}: "{{!" içeren bir şablon gövdesi (\`\`\`text bloğu) bulunamadı.`)

  const dosyaSlug = dosyaAdi.replace(/\.md$/i, '')
  const kaynakOrnek = meta['Kaynak örnek'] ?? null
  const tekAday = hamAdaylar.length === 1
  // Tek adaylı dosyalarda (kasko, zmss, cevaba-cevap, delil) varyant metadata "Tür" + "Varyant" satırından;
  // çok adaylı beyan.md'de böyle bir satır yok → her adayın kendi bölüm başlığından çıkarılır.
  const baseVaryant = meta['Varyant'] != null ? metinVaryantCikar(`${turDegeri ?? ''} ${meta['Varyant']}`) : null

  return hamAdaylar.map(({ bolum, govde }) => ({
    kod: tekAday ? dosyaSlug : `${dosyaSlug}-${bolum.no}`,
    tur,
    varyantJson: baseVaryant ?? metinVaryantCikar(bolum.baslik),
    kaynakMetni: govde,
    dosyaAdi,
    bolumNo: bolum.no,
    bolumBasligi: bolum.baslik,
    kaynakOrnek,
    bilgiBankasiYolu: `${kaynakOnek}/${dosyaAdi}#${bolum.no}`,
  }))
}

// ───────────────────────── içerik özeti (sha256) ─────────────────────────

/** Adayın içerik özeti — mevzuat/yukle.ts'deki `icerikOzeti` ile aynı desen: "değişecek / aynı kalacak" ayrımının tek ölçüsü. */
export function sablonIcerikOzeti(a: { tur: string; kod: string; varyantJson: VaryantAnahtari; kaynakMetni: string }): string {
  const v = a.varyantJson
  const kanonik = JSON.stringify([a.tur, a.kod, v.rucuSebebiKod ?? null, v.mahkemeTuru ?? null, v.usul ?? null, v.davaliTur ?? null, a.kaynakMetni])
  return createHash('sha256').update(kanonik, 'utf8').digest('hex')
}

// ───────────────────────── yükleme planı ─────────────────────────

export type MevcutSablonKaydi = { id: string; kod: string; surum: number; icerikOzet: string | null; aktif: boolean; onayAt: Date | string | null }

export type SablonYuklemeAdimi = { kod: string; surum: number; tur: string; bolumBasligi: string }
export type SablonYuklemePlani = {
  eklenecek: SablonYuklemeAdimi[]
  /** İçerik değişti: yeni sürüm satırı açılır, var olan (özellikle onaylı) satıra hiç dokunulmaz. */
  yeniSurum: (SablonYuklemeAdimi & { oncekiSurum: number; oncekiOnayli: boolean })[]
  ayniKalacak: SablonYuklemeAdimi[]
  /** DB'de bu kodda kayıt var ama bu yüklemenin adayları arasında yok (elle eklenmiş ya da eski dosya): dokunulmaz. */
  katalogDisi: string[]
  ozet: string
}

export function sablonYuklemePlani(mevcutlar: readonly MevcutSablonKaydi[], adaylar: readonly SablonAdayi[]): SablonYuklemePlani {
  const kodlar = new Set<string>()
  for (const a of adaylar) {
    if (kodlar.has(a.kod)) throw new SablonKaynakHatasi(`Aynı kod iki kez üretildi: ${a.kod}`)
    kodlar.add(a.kod)
  }
  const mevcutByKod = new Map<string, MevcutSablonKaydi[]>()
  for (const m of mevcutlar) {
    const list = mevcutByKod.get(m.kod) ?? []
    list.push(m)
    mevcutByKod.set(m.kod, list)
  }

  const eklenecek: SablonYuklemeAdimi[] = []
  const yeniSurum: SablonYuklemePlani['yeniSurum'] = []
  const ayniKalacak: SablonYuklemeAdimi[] = []
  for (const a of adaylar) {
    const list = [...(mevcutByKod.get(a.kod) ?? [])].sort((x, y) => y.surum - x.surum)
    const latest = list[0]
    const adim: SablonYuklemeAdimi = { kod: a.kod, surum: latest ? latest.surum + 1 : 1, tur: a.tur, bolumBasligi: a.bolumBasligi }
    if (!latest) { eklenecek.push(adim); continue }
    if (latest.icerikOzet === sablonIcerikOzeti(a)) { ayniKalacak.push({ ...adim, surum: latest.surum }); continue }
    yeniSurum.push({ ...adim, oncekiSurum: latest.surum, oncekiOnayli: !!latest.onayAt })
  }
  const katalogDisi = [...mevcutByKod.keys()].filter((k) => !kodlar.has(k))
  const ozet = createHash('sha256')
    .update(JSON.stringify([eklenecek.map((e) => e.kod).sort(), yeniSurum.map((y) => `${y.kod}@${y.surum}`).sort(), adaylar.map(sablonIcerikOzeti)]), 'utf8')
    .digest('hex')
    .slice(0, 16)
  return { eklenecek, yeniSurum, ayniKalacak, katalogDisi, ozet }
}
