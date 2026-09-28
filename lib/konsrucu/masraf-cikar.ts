/**
 * KonsRücü — Makbuz/dekont PDF okuyucu (B4) · lib/konsrucu/masraf-cikar.ts  (server-only)
 * UYAP'tan inip Belge (Supabase 'evrak' bucket) olarak duran harç-masraf MAKBUZLARINI Claude ile
 * okuyup Masraf satırlarına çevirir. PDF 'document' bloğu olarak gönderilir → metinli VE taranmış
 * makbuz Claude tarafından okunur (forced tool-use, şema-zorunlu JSON; analiz.ts ile aynı stil).
 *
 * Akış: makbuzCikarPdf (PDF bytes → kalem dizisi) → belgedenMasrafCikar (Belge → cins eşleştirme +
 * dedup + Masraf.create) → dosyaMakbuzlariniTara (dosyadaki tüm DEKONT belgelerini tara).
 *
 * S02/S09: yapay zekâ yedeği (yüzey 'makbuz') lib/ai/cagri.ts sarmalayıcısından geçer — metin varsa
 * MASKELİ metin; PDF/görüntü bloğu yalnız görsel AI kapısı açıkken. Kapalıyken kural katmanı çalışır,
 * sonuç "elle girin" cümlesiyle döner (MAKBUZ_AI_KAPALI).
 */
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { cinsEslesti, ogrenilenMap, normCins } from './masraf-cins'
import { masrafDedupKey, paraGuvenli } from './masraf'
import { pdfMetinCikar } from './pdf-metin'
import { toolCikti } from './ai-util'
import { aiOturumu, aiKapiHatasiMi, jetonluMu, type AiIcerik, type GorselMime, type MaskeKaynagi } from '@/lib/ai/cagri'
import { gorselAiAcik } from '@/lib/ai/bayrak'

// KATMAN 2 (fallback): yerel parser düşemezse / makbuz taranmışsa LLM. Makbuz "oku ve sayıları dök"
// işidir → en ucuz model yeter (Sonnet DEĞİL). Çoğu makbuz Katman 1'de ₺0'a çözülür, buraya azı düşer.
const MODEL_FALLBACK = 'claude-haiku-4-5-20251001'

/** PDF makbuzdan çıkan tek masraf/harç kalemi (henüz cinse bağlanmamış ham). */
export type MakbuzKalem = {
  dekontNo?: string
  makbuzSayi?: string
  makbuzNo?: string
  tarih?: string // YYYY-MM-DD
  tutar: number
  cinsHam: string
  taraf?: 'BIZ' | 'KARSI' | 'BELIRSIZ'
  sorumlu?: string
}

const SCHEMA = {
  type: 'object',
  properties: {
    reddiyatMakbuzuMu: { type: 'boolean', description: 'Belge bir REDDİYAT/TAHSİLAT makbuzu ise true (o zaman kalemler boş bırakılır)' },
    kalemler: {
      type: 'array',
      description: 'Makbuzdaki her masraf/harç kalemi ayrı satır. Tek makbuzda birden çok kalem olabilir.',
      items: {
        type: 'object',
        properties: {
          dekontNo: { type: 'string', description: 'Makbuz/dekont numarası' },
          makbuzSayi: { type: 'string', description: "Makbuz 'Sayı' alanı (varsa)" },
          makbuzNo: { type: 'string', description: "Makbuz 'No' alanı (varsa)" },
          tarih: { type: 'string', description: 'Makbuz tarihi (YYYY-MM-DD)' },
          tutar: { type: 'number', description: 'Kalem tutarı (TL, sayı)' },
          cinsHam: { type: 'string', description: 'Makbuzdaki ham masraf adı (AYNEN)' },
          taraf: { type: 'string', enum: ['BIZ', 'KARSI', 'BELIRSIZ'], description: 'Ödeyen taraf' },
          sorumlu: { type: 'string', description: 'Sorumlu/ödeyen kişi (varsa)' },
        },
        required: ['tutar', 'cinsHam'],
      },
    },
  },
  required: ['kalemler'],
}

// LLM tool çıktısı doğrulama: zarf şekli (kalemler dizi + reddiyat bayrağı) zorunlu; her kalem AYRI
// süzülür (bir bozuk kalem TÜM makbuzu düşürmesin — belgedenMasrafCikar zaten kalem-bazlı filtreler).
const ZMakbuzKalem = z.object({ tutar: z.number(), cinsHam: z.string() }).passthrough()
const ZMakbuzZarf = z.object({ reddiyatMakbuzuMu: z.boolean().optional(), kalemler: z.array(z.unknown()).optional() }).passthrough()

const SISTEM = `Bu bir Türk icra/dava belgesidir (harç-masraf ödeme makbuzu YA DA tahsilat/reddiyat makbuzu olabilir). Görevin: YALNIZ büronun mahkemeye/icraya/PTT'ye ÖDEDİĞİ HARÇ ve MASRAF kalemlerini çıkarmak.

★ BELGE BİR REDDİYAT MAKBUZU veya TAHSİLAT MAKBUZU ise (başlıkta "REDDİYAT MAKBUZU"/"TAHSİLAT MAKBUZU" geçer): reddiyatMakbuzuMu=true yap ve kalemler=[] döndür. Bu belgelerdeki HİÇBİR kalem masraf değildir (tebligat/posta/harç ZATEN ayrı "Masraf Makbuzu"/"Harç Makbuzu"ndan gelir; çift sayma).

ÇIKAR (gerçek masraf/harç): başvurma harcı, peşin harç, tahsil harcı, cezaevi harcı, vekalet (suret) harcı, baro pulu, tebligat/posta gideri, bilirkişi/keşif ücreti, müzekkere gideri, yenileme/tahliye/temyiz/istinaf harçları, gider/delil avansı vb.

ASLA ÇIKARMA — bunlar MASRAF DEĞİL, alacak/tahsilattır; listeye GİRMEMELİ:
- "Asıl Alacak" / anapara
- "İşlemiş Faiz" / "İşlemiş Gün Faizi" / "İşleyen Faiz" / takip faizi
- "Tahsilat" / "Reddiyat" / "Masraf Avansı Tahsilatı" gibi TAHSİL/İADE satırları
- "Vekalet Ücreti" (avukatlık/AAÜT ücreti — gelirdir; ama "Vekalet HARCI" masraftır, ONU çıkar)
- "Bakiye Borç" / "Kapak Hesabı" / genel toplam satırları
Belge bir tahsilat/reddiyat makbuzuysa içindeki anapara/faiz/vekalet ücreti/tahsilat satırlarını TAMAMEN ATLA; sadece gerçek harç/masraf ÖDEME satırı varsa onu al.

Her kalem ayrı satır (bir makbuzda birden çok olabilir). dekontNo = makbuz/dekont numarası; varsa makbuz 'Sayı' ve 'No'. tarih = makbuz tarihi (YYYY-MM-DD). tutar = TL sayı. cinsHam = makbuzdaki ham masraf adı (AYNEN). taraf: ödeyen alacaklı/vekil/büro ise BIZ; borçlu/karşı ise KARSI; belirsizse BELIRSIZ — harç/masrafı genelde alacaklı vekili öder → BIZ. UYDURMA; emin değilsen alanı boş bırak.`

// Tahsilat/reddiyat makbuzundaki alacak kalemleri masraf DEĞİL — LLM kaçırırsa son savunma (kesin dışla).
const MASRAF_DISI = [
  'asil alacak', 'islemis faiz', 'gun faizi', 'isleyen faiz', 'takip faizi',
  'tahsilat', 'reddiyat', 'vekalet ucret', 'avukatlik ucret', 'kapak hesab', 'bakiye borc',
]
/** cinsHam gerçek bir harç/masraf mı (alacak/faiz/tahsilat değil mi)? */
function masrafKalemiMi(cinsHam: string): boolean {
  const n = normCins(cinsHam)
  return !MASRAF_DISI.some((d) => n.includes(d))
}

/** Makbuz baytlarını PDF mi görsel mi olduğunu sihirli baytlardan anlayıp sarmalayıcı bloğu kurar.
 *  Bu blok MASKELENEMEZ: yalnız görsel AI kapısı (AI_GORSEL=acik) açıkken gider (S09). */
function makbuzBlok(bytes: Buffer): AiIcerik {
  const b64 = bytes.toString('base64')
  const h = bytes.subarray(0, 4)
  if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) return { tur: 'pdf', b64 } // %PDF
  const media: GorselMime | null =
    h[0] === 0x89 && h[1] === 0x50 ? 'image/png'
      : h[0] === 0xff && h[1] === 0xd8 ? 'image/jpeg'
      : h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 ? 'image/gif'
      : h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 ? 'image/webp' // RIFF (webp)
      : null
  if (media) return { tur: 'gorsel', mime: media, b64 }
  // bilinmiyor → çoğu UYAP makbuzu PDF; PDF varsay
  return { tur: 'pdf', b64 }
}

/** Yapay zekâ yedeği kapalıyken kullanıcıya gösterilen cümle (kural katmanı çalışmaya devam eder). */
export const MAKBUZ_AI_KAPALI = 'Makbuz yerel olarak okunamadı; yapay zekâ yedeği KVKK düzenlemesi tamamlanana kadar kapalı. Masrafı elle girin.'

// ── KATMAN 1: yerel şablon parser (₺0) — metinli UYAP makbuzunu LLM'siz oku ───────────────────
// UYAP harç/masraf makbuzları çok standart tablolardır. Metin katmanı varsa LLM'e gerek yok:
// satırdan (cins + tutar) çıkar, makbuzdaki "Toplam" ile çapraz doğrula. Toplam tutuyorsa hiçbir
// kalem kaçmamış + tutarlar doğrudur → ₺0. Tutmuyor / metin yok → çağıran ucuz LLM'e düşer.

const paraRe = () => /-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+,\d{1,2}|-?\d+\.\d{1,2}|-?\d{1,9}/g
// satır içi tarih/saat parçaları "tutar" sanılmasın → tutar taramasından ÖNCE temizlenir
const tarihSil = (s: string) =>
  s.replace(/\b\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}\b/g, ' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')

/** Metindeki ilk geçerli tarihi YYYY-MM-DD olarak döndür (gg.aa.yyyy veya yyyy-aa-gg). */
function metinTarih(metin: string): string | undefined {
  const m1 = metin.match(/\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  const m2 = metin.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : undefined
}

/** Makbuz/dekont numarasını etiketten yakala (best-effort; bulunamazsa undefined). */
function metinDekontNo(metin: string): string | undefined {
  const m = metin.match(/(?:makbuz|dekont|tahsilat)\s*(?:no|sayı|sayi|numara|numaras[ıi])\s*[:\-]?\s*([0-9][0-9\/\-.]*)/i)
  return m ? m[1].trim() : undefined
}

/** Satırdaki TUTARI seç: sağdan ilk "para gibi" (ondalık/binlik) token; yoksa en sağdaki sayı.
 *  (Başlıktaki "12. İcra Dairesi" gibi başıboş tamsayıları tutar sanmayı azaltır.) */
function sonTutar(toks: string[]): number | null {
  for (let i = toks.length - 1; i >= 0; i--) if (/[.,]\d/.test(toks[i])) return paraGuvenli(toks[i])
  return paraGuvenli(toks[toks.length - 1])
}

/** "Toplam"/"Genel Toplam"/"Ödenen" satırındaki tutar (genel toplam önceliklidir). */
function metinToplam(metin: string): number | null {
  let genel: number | null = null
  let toplam: number | null = null
  for (const ln of metin.split('\n')) {
    const n = normCins(ln)
    if (!/toplam|odenen/.test(n)) continue
    const toks = tarihSil(ln).match(paraRe())
    if (!toks?.length) continue
    const val = sonTutar(toks)
    if (val == null) continue
    if (/genel toplam/.test(n)) genel = val
    else toplam = val
  }
  return genel ?? toplam
}

// Kalem SAYILMAYAN satırlar: başlık/künye (makbuz, daire, mahkeme, T.C. …) + ara-toplam/sütun başlıkları.
const SATIR_DISI = [
  'makbuz', 'dairesi', 'mudurlug', 'mahkeme', 't c ', 'sayin',
  'toplam', 'odenen', 'bakiye', 'kdv', 'k d v', 'masraf turu', 'harc turu', 'tutar turu', 'aciklama', 'miktar', 'birim fiyat', 'sira no',
]

export type MakbuzParseSonuc = { reddiyat: boolean; kalemler: MakbuzKalem[]; guvenli: boolean }

// ── UYAP "sütun dökümü" makbuz düzeni (Masraf Makbuzu / Sayman Mutemedi Alındısı / Harç makbuzu) ──
// pdfjs bu makbuzlarda metni SÜTUN SÜTUN döker: tutarlar kendi satırında ("732,00 864,61 104,00"), toplam ayrı satırda
// ("1.700,61"), kalem adları en sonda bitişik ("Başvurma Harcı Peşin Harç Vekalet Suret Harcı"), tek kalemli masraf
// makbuzunda cins "Açıklama"dan sonraki cümlede ("Posta Masrafı Yirmisekiz Türk Lirası … tahsil edilmiştir").
// Satır-temelli parser bunu okuyamıyordu → her makbuz AI yedeğine düşüyor, o da KVKK gereği kapalı → Zurich'te 0 masraf.

const SAYI_KOK: [string, number][] = [
  ['milyon', 1_000_000], ['bin', 1000], ['yuz', 100],
  ['doksan', 90], ['seksen', 80], ['yetmis', 70], ['altmis', 60], ['elli', 50], ['kirk', 40], ['otuz', 30], ['yirmi', 20], ['on', 10],
  ['dokuz', 9], ['sekiz', 8], ['yedi', 7], ['alti', 6], ['bes', 5], ['dort', 4], ['uc', 3], ['iki', 2], ['bir', 1],
]
/** "Binyedıyüz", "Yirmisekiz", "Altmışbir" → sayı. Sayı sözcüğü değilse null. */
export function yaziyiSayiyaCevir(kelime: string): number | null {
  let s = normCins(kelime).replace(/\s+/g, '')
  if (!s) return null
  let toplam = 0
  let grup = 0
  while (s) {
    const k = SAYI_KOK.find(([kok]) => s.startsWith(kok))
    if (!k) return null
    const [kok, deger] = k
    s = s.slice(kok.length)
    if (deger === 100) grup = (grup || 1) * 100
    else if (deger >= 1000) { toplam += (grup || 1) * deger; grup = 0 }
    else grup += deger
  }
  return toplam + grup
}

/** "… Türk Lirası … Kuruş tahsil edilmiştir" yazıyla toplam (TL + kuruş). Bulunamazsa null. */
function yaziylaToplam(metin: string): number | null {
  const m = metin.match(/([A-Za-zÇĞİIÖŞÜçğıiöşü]+)\s+Türk\s+Liras[ıi](?:\s+([A-Za-zÇĞİIÖŞÜçğıiöşü]+)\s+Kuru[şs])?\s+tahsil\s+edilmi[şs]tir/iu)
  if (!m) return null
  const tl = yaziyiSayiyaCevir(m[1])
  if (tl == null) return null
  const kurus = m[2] ? yaziyiSayiyaCevir(m[2]) : 0
  return kurus == null ? null : tl + kurus / 100
}

const PARA_TOKEN = /^\d{1,3}(?:\.\d{3})*,\d{2}$/
/** Yalnız para tutarlarından (ve "TL") oluşan satırlar, sırayla. */
function tutarSatirlari(metin: string): number[][] {
  const out: number[][] = []
  for (const ln of metin.split('\n')) {
    const toks = ln.replace(/\bTL\b/g, ' ').trim().split(/\s+/).filter(Boolean)
    if (toks.length && toks.every((t) => PARA_TOKEN.test(t))) out.push(toks.map((t) => paraGuvenli(t) ?? NaN))
  }
  return out.filter((r) => r.every((n) => Number.isFinite(n)))
}

const KALEM_SONU = /(?:Harc[ıi]|Harç|Masraf[ıi]|Masraflar[ıi]|Ücreti|Avans[ıi]|Gideri|Bedeli|Pulu|Vergisi)$/iu
/** Bitişik kalem adlarını ayır: "Başvurma Harcı Peşin Harç Vekalet Suret Harcı" → 3 ad. */
function kalemAdlariniAyir(s: string): string[] {
  const adlar: string[] = []
  let biriken: string[] = []
  for (const w of s.trim().split(/\s+/)) {
    biriken.push(w)
    if (KALEM_SONU.test(w)) { adlar.push(biriken.join(' ')); biriken = [] }
  }
  if (biriken.length) adlar.push(biriken.join(' '))
  return adlar.filter(Boolean)
}

/** Seri + sıra no ("AB2026 318714322 …" / "MSR2026 217490749 …") → makbuz no. */
function uyapMakbuzNo(metin: string): string | undefined {
  const m = metin.match(/\b([A-Z]{2,4}\d{4})\s+(\d{6,})\b/)
  return m ? `${m[1]}/${m[2]}` : undefined
}

/**
 * UYAP sütun dökümü makbuzunu ayrıştır. Düzen tanınmazsa null (çağıran satır-temelli parser'a düşer).
 * guvenli=true yalnız: kalem sayısı = tutar sayısı, tutarların toplamı = makbuz toplamı ve (varsa) yazıyla toplam da aynı.
 */
export function uyapMakbuzParse(metin: string): MakbuzParseSonuc | null {
  if (!/masraf makbuzu|sayman mutemedi alindisi|harc makbuzu|alindi masraf turu|alindi harc turu/.test(normCins(metin))) return null
  const satirlar = tutarSatirlari(metin)
  if (!satirlar.length) return null

  // Tutarlar + toplam: [kalemler] + [toplam] ya da tek kalemde "28,70 TL 28,70 TL" (miktar + toplam aynı satırda)
  let tutarlar: number[]
  let toplam: number
  // Kayan sütun: değişken tutarlı kalem (peşin harç) kendi satırına düşebilir → [ilk satır] [kayan…] [toplam]
  let kayan: number[] = []
  const son = satirlar[satirlar.length - 1]
  if (satirlar.length >= 3 && son.length === 1 && satirlar.slice(1, -1).every((r) => r.length === 1)) {
    tutarlar = satirlar[0]; kayan = satirlar.slice(1, -1).map((r) => r[0]); toplam = son[0]
  } else if (satirlar.length >= 2 && satirlar[1].length === 1) { tutarlar = satirlar[0]; toplam = satirlar[1][0] }
  else if (satirlar[0].length === 2 && Math.abs(satirlar[0][0] - satirlar[0][1]) < 0.005) { tutarlar = [satirlar[0][0]]; toplam = satirlar[0][1] }
  else if (satirlar[0].length === 1) { tutarlar = satirlar[0]; toplam = satirlar[0][0] }
  else return null

  // Kalem adları: "Alındı (Harç|Masraf) Türü <adlar>" ya da tek kalemde "Açıklama <cins> <yazıyla tutar> Türk Lirası"
  let adlar: string[] = []
  const tur = metin.match(/Al[ıi]nd[ıi]\s*\((?:Har[çc]|Masraf)\)\s*T[üu]r[üu][ \t]+([^\n]+)/iu)
  // Adların arkasından yazıyla tutar gelebilir ("Vekalet Suret Harcı Yüzdört Türk Lirası tahsil edilmiştir.") → kes
  const turAdlari = tur ? tur[1].replace(/\s+[A-Za-zÇĞİIÖŞÜçğıiöşü]+\s+Türk\s+Liras[ıi].*$/iu, '') : ''
  if (turAdlari && !/^\s*:?\s*$/.test(turAdlari) && !/Açıklama|Aciklama/iu.test(turAdlari)) adlar = kalemAdlariniAyir(turAdlari)
  if (!adlar.length) {
    const ac = metin.match(/A[çc][ıi]klama\s+([^\n]+?)\s+Türk\s+Liras[ıi]/iu)
    if (ac) {
      const kelimeler = ac[1].trim().split(/\s+/)
      while (kelimeler.length && yaziyiSayiyaCevir(kelimeler[kelimeler.length - 1]) != null) kelimeler.pop()
      if (kelimeler.length) adlar = [kelimeler.join(' ')]
    }
  }
  // Kayan tutarlar "peşin" kalemlere (sırayla), ilk satırdakiler diğer kalemlere (sırayla) gider.
  let kalemTutari: number[] = tutarlar
  if (kayan.length) {
    const pesinSira = adlar.map((a, i) => (/pe[şs]in/iu.test(a) ? i : -1)).filter((i) => i >= 0)
    if (pesinSira.length !== kayan.length || adlar.length !== tutarlar.length + kayan.length) return { reddiyat: false, kalemler: [], guvenli: false }
    const digerler = [...tutarlar]
    const pesinler = [...kayan]
    kalemTutari = adlar.map((_, i) => (pesinSira.includes(i) ? pesinler.shift()! : digerler.shift()!))
  }
  if (!adlar.length || adlar.length !== kalemTutari.length) return { reddiyat: false, kalemler: [], guvenli: false }

  const tarih = metinTarih(metin)
  const makbuzNo = uyapMakbuzNo(metin)
  const kalemler: MakbuzKalem[] = adlar
    .map((cinsHam, i) => ({ cinsHam, tutar: kalemTutari[i], tarih, makbuzNo, taraf: 'BIZ' as const }))
    .filter((k) => k.tutar > 0 && masrafKalemiMi(k.cinsHam))
  const kalemToplam = kalemler.reduce((a, k) => a + k.tutar, 0)
  const yazi = yaziylaToplam(metin)
  const guvenli = kalemler.length === adlar.length && Math.abs(kalemToplam - toplam) < 0.005 && (yazi == null || Math.abs(yazi - toplam) < 0.005)
  return { reddiyat: false, kalemler, guvenli }
}

/**
 * Metinli makbuzu LLM'siz ayrıştır. guvenli=true SADECE makbuzdaki "Toplam" ile çıkarılan kalemlerin
 * toplamı birebir tutuyorsa döner (= hiçbir kalem kaçmadı + tutarlar doğru) → çağıran LLM'e GİTMEZ.
 * guvenli=false → çağıran (ucuz) LLM fallback'ine düşer. reddiyat=true → masraf yok (kesin).
 */
export function makbuzParseMetin(metin: string): MakbuzParseSonuc {
  if (/reddiyat makbuzu|tahsilat makbuzu/.test(normCins(metin))) return { reddiyat: true, kalemler: [], guvenli: true }
  const uyap = uyapMakbuzParse(metin)
  if (uyap?.guvenli) return uyap

  const tarih = metinTarih(metin)
  const dekontNo = metinDekontNo(metin)
  const kalemler: MakbuzKalem[] = []

  for (const ln of metin.split('\n')) {
    const stripped = tarihSil(ln)
    const toks = stripped.match(paraRe())
    if (!toks?.length) continue
    const tutar = sonTutar(toks) // tutar = satırdaki en sağdaki "para gibi" sayı (sütun düzeni)
    if (tutar == null || tutar <= 0) continue

    if (SATIR_DISI.some((d) => normCins(ln).includes(d))) continue // başlık/toplam satırı

    const cinsHam = stripped
      .replace(paraRe(), ' ')
      .replace(/\b(tl|try|₺|trl)\b/gi, ' ')
      .replace(/[.\-:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (cinsHam.length < 3) continue
    if (!masrafKalemiMi(cinsHam)) continue // alacak/faiz/tahsilat → masraf değil
    if (!cinsEslesti(cinsHam).cins) continue // tanınmayan satır → kalem sayma (kaçarsa toplam tutmaz → LLM yakalar)

    kalemler.push({ cinsHam, tutar, tarih, dekontNo, taraf: 'BIZ' })
  }

  const toplam = metinToplam(metin)
  const toplamKalem = kalemler.reduce((a, k) => a + k.tutar, 0)
  const guvenli = kalemler.length >= 1 && toplam != null && Math.abs(toplamKalem - toplam) < 0.5
  return { reddiyat: false, kalemler, guvenli }
}

/**
 * Makbuzdan masraf kalemlerini çıkarır. KATMANLI:
 *   1) Metinli PDF → yerel parser; "Toplam" tutuyorsa LLM'e HİÇ gitmez (₺0).
 *   2) Düşemezse / taranmışsa → ucuz LLM (Haiku); metin varsa metni, yoksa görüntü/PDF bloğunu gönderir.
 * ANTHROPIC_API_KEY yoksa veya hata olursa [] döner.
 */
export async function makbuzCikarPdf(
  pdfBytes: Buffer,
  ipuclari?: { dosyaAdi?: string; alacakliUnvan?: string },
  ai?: { musteriId?: string; dosyaId?: string },
): Promise<MakbuzKalem[]> {
  return (await makbuzCikarDetay(pdfBytes, ipuclari, ai)).kalemler
}

/**
 * makbuzCikarPdf + neden: yapay zekâ yedeği kapalı/durdurulmuşsa `aiKapali` açık bir cümle taşır
 * (kural katmanı yine çalışır; yalnız AI yedeği kapanır — S02). `maske`: dosyadaki bilinen kişiler.
 */
export async function makbuzCikarDetay(
  pdfBytes: Buffer,
  ipuclari?: { dosyaAdi?: string; alacakliUnvan?: string },
  ai?: { musteriId?: string; dosyaId?: string },
  maske?: MaskeKaynagi,
): Promise<{ kalemler: MakbuzKalem[]; aiKapali?: string }> {
  if (!pdfBytes?.length) return { kalemler: [] }

  // KATMAN 1 (₺0): metinli PDF'i yerel oku + şablon parser.
  const metin = await pdfMetinCikar(pdfBytes)
  if (metin) {
    const p = makbuzParseMetin(metin)
    if (p.reddiyat) return { kalemler: [] }
    if (p.guvenli) return { kalemler: p.kalemler } // toplam tuttu → tam ve doğru, LLM'e gerek yok
  }

  // KATMAN 2 (fallback): ucuz LLM (yüzey 'makbuz'). Metin çıktıysa MASKELİ metin; çıkmadıysa PDF/görüntü
  // bloğu — o blok maskelenemez, yalnız görsel AI kapısı açıkken gider.
  if (!process.env.ANTHROPIC_API_KEY) return { kalemler: [] }
  const oturum = aiOturumu({ yuzey: 'makbuz', ai, maske, gorselIzni: true })
  if (!oturum.acikMi() || (!metin && !gorselAiAcik())) return { kalemler: [], aiKapali: MAKBUZ_AI_KAPALI }

  const ipucuSatirlari: string[] = []
  if (ipuclari?.dosyaAdi) ipucuSatirlari.push(`Belge adı: ${ipuclari.dosyaAdi}`)
  if (ipuclari?.alacakliUnvan) ipucuSatirlari.push(`Alacaklı/vekil ünvanı (BIZ tarafı): ${ipuclari.alacakliUnvan}`)
  const ipucu = ipucuSatirlari.length ? `${ipucuSatirlari.join('\n')}\n\n` : ''

  const icerik: AiIcerik[] = metin
    ? [
        { tur: 'metin', metin: `${ipucu}Aşağıdaki makbuz METNİNDEKİ tüm masraf/harç kalemlerini çıkar ve "kaydet" aracını çağır.` },
        { tur: 'belge', ad: 'Makbuz metni', metin: metin.slice(0, 30000) },
      ]
    : [makbuzBlok(pdfBytes), { tur: 'metin', metin: `${ipucu}Yukarıdaki makbuzdaki tüm masraf/harç kalemlerini çıkar ve "kaydet" aracını çağır.` }]

  try {
    const y = await oturum.iste({
      model: MODEL_FALLBACK,
      maxTokens: 3000,
      sistem: SISTEM,
      icerik,
      arac: { ad: 'kaydet', aciklama: 'Makbuzdan çıkarılan masraf kalemlerini kaydet', sema: SCHEMA as Anthropic.Tool.InputSchema },
    })
    if (y.aracGirdisi == null) return { kalemler: [] }
    const zarf = toolCikti(y.aracGirdisi, ZMakbuzZarf, 'makbuzCikarPdf')
    if (!zarf || zarf.reddiyatMakbuzuMu) return { kalemler: [] } // şema tutmadı ya da reddiyat/tahsilat → masraf kalemi yok
    return {
      kalemler: (Array.isArray(zarf.kalemler) ? zarf.kalemler : [])
        .flatMap((k) => { const r = ZMakbuzKalem.safeParse(k); return r.success ? [r.data as MakbuzKalem] : [] })
        // açılamayan jetonlu 'sorumlu' DB'ye yazılmaz
        .map((k) => (jetonluMu(k.sorumlu) ? { ...k, sorumlu: undefined } : k)),
    }
  } catch (e) {
    if (aiKapiHatasiMi(e)) return { kalemler: [], aiKapali: e.name === 'AiKvkkKapaliHata' || e.name === 'AiGorselKapaliHata' ? MAKBUZ_AI_KAPALI : e.message }
    console.error('makbuzCikarPdf (LLM fallback) hata:', e instanceof Error ? e.name : 'bilinmeyen')
    return { kalemler: [] }
  }
}

/** YYYY-MM-DD / ISO → Date; geçersiz/boş → null. */
function tarihToDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

export type BelgeMasrafSonuc = { eklendi: number; atlandi: number; toplam: number; hata?: string }

/**
 * Tek bir Belge'yi (UYAP makbuzu) okuyup Masraf satırları üretir.
 * - Belge bulunamaz / PDF inmezse hata döner.
 * - Cins eşleştirme: tenant Ayarlar.masrafEslestirJson öğrenilen sözlüğü + masraf-cins katmanları.
 * - Dedup: dosya içinde (dosyaId, kaynakRef) varsa atlanır; kaynakRef null ise doğrudan eklenir.
 */
export async function belgedenMasrafCikar(
  belgeId: string,
  opts?: { kullaniciId?: string | null },
): Promise<BelgeMasrafSonuc> {
  try {
    const belge = await prisma.belge.findUnique({
      where: { id: belgeId },
      select: {
        id: true, dosyaId: true, storagePath: true, dosyaAdi: true,
        // bilinen kişiler yalnız maskeleme için (AI yedeğine giden makbuz metninde ad/TCKN jetonlansın)
        dosya: { select: { musteriId: true, sigortaliUnvan: true, borclular: { select: { adUnvan: true, tcVkn: true }, orderBy: { id: 'asc' } } } },
      },
    })
    if (!belge) return { eklendi: 0, atlandi: 0, toplam: 0, hata: 'Belge bulunamadı' }

    // Reddiyat makbuzu (tahsilat/dağıtım) → masraf DEĞİL; tebligat/posta/harç zaten ayrı "Masraf/Harç Makbuzu"ndan
    // gelir (çift sayma). Dosya adından kestir, LLM'e gitme.
    if (/reddiyat/i.test(belge.dosyaAdi || '')) return { eklendi: 0, atlandi: 0, toplam: 0 }

    // Bu belge zaten işlendiyse tekrar çıkarma (idempotent: re-scan + eşzamanlı evrak hook'una karşı).
    const islendiMi = await prisma.masraf.findFirst({ where: { belgeId: belge.id }, select: { id: true } })
    if (islendiMi) return { eklendi: 0, atlandi: 0, toplam: 0 }

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from('evrak').download(belge.storagePath)
    if (error || !data) return { eklendi: 0, atlandi: 0, toplam: 0, hata: `PDF indirilemedi: ${error?.message ?? 'boş'}` }
    const bytes = Buffer.from(await data.arrayBuffer())

    const { kalemler, aiKapali } = await makbuzCikarDetay(bytes, { dosyaAdi: belge.dosyaAdi }, { musteriId: belge.dosya.musteriId, dosyaId: belge.dosyaId }, {
      kisiler: [...(belge.dosya.borclular ?? []).map((b) => b.adUnvan), belge.dosya.sigortaliUnvan],
      kimlikler: (belge.dosya.borclular ?? []).map((b) => b.tcVkn),
    })
    if (!kalemler.length) return { eklendi: 0, atlandi: 0, toplam: 0, ...(aiKapali ? { hata: aiKapali } : {}) }

    // öğrenilen cins sözlüğü (tenant)
    const ayar = await prisma.ayarlar.findUnique({ where: { musteriId: belge.dosya.musteriId }, select: { masrafEslestirJson: true } })
    const ogrenilen = ogrenilenMap(ayar?.masrafEslestirJson ?? null)

    let eklendi = 0
    let atlandi = 0
    const islenmis = new Set<string>() // aynı makbuzda tekrarlı kalem koruması (in-batch)
    for (const kalem of kalemler) {
      const tutar = paraGuvenli(kalem.tutar)
      const cinsHam = (kalem.cinsHam ?? '').toString().trim()
      if (tutar == null || !cinsHam) continue // tutar/cins olmayan kalemi atla (UYDURMA)
      if (!masrafKalemiMi(cinsHam)) continue // alacak/faiz/tahsilat kalemi → masraf DEĞİL, atla

      const { cins, guven } = cinsEslesti(cinsHam, ogrenilen)
      const dekontNo = kalem.dekontNo ? String(kalem.dekontNo).trim() || null : null
      const tarih = tarihToDate(kalem.tarih)
      const kaynakRef = masrafDedupKey({ dekontNo, cinsHam, tutar, tarih: kalem.tarih })

      // dedup: kaynakRef varsa (güçlü anahtar) hem aynı çalıştırmada hem DB'de tekrarı atla
      if (kaynakRef) {
        if (islenmis.has(kaynakRef)) { atlandi++; continue }
        islenmis.add(kaynakRef)
        const mevcut = await prisma.masraf.findFirst({ where: { dosyaId: belge.dosyaId, kaynakRef }, select: { id: true } })
        if (mevcut) { atlandi++; continue }
      }

      try {
        await prisma.masraf.create({
          data: {
            dosyaId: belge.dosyaId,
            belgeId: belge.id,
            tutar,
            tarih,
            dekontNo,
            makbuzSayi: kalem.makbuzSayi ? String(kalem.makbuzSayi).trim() || null : null,
            makbuzNo: kalem.makbuzNo ? String(kalem.makbuzNo).trim() || null : null,
            cinsHam,
            cins,
            cinsGuven: guven,
            taraf: kalem.taraf ?? 'BELIRSIZ',
            sorumlu: kalem.sorumlu ? String(kalem.sorumlu).trim() || null : null,
            durum: 'YENI',
            kaynak: 'UYAP_PDF',
            kaynakRef,
            guven,
          },
        })
        eklendi++
      } catch (e) {
        // eşzamanlı çağrıda unique çakışması (P2002) → mükerrer say, devam et (makbuzu yarım bırakma)
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') { atlandi++; continue }
        throw e
      }
    }

    await prisma.aktivite.create({
      data: {
        dosyaId: belge.dosyaId,
        kullaniciId: opts?.kullaniciId ?? null,
        eylem: `Makbuzdan masraf çıkarıldı: ${eklendi} kalem`,
      },
    })

    return { eklendi, atlandi, toplam: kalemler.length }
  } catch (e) {
    // KVKK: hata nesnesi (Prisma argümanları) makbuzdaki kişi adını taşıyabilir → günlüğe yalnız ad/kod
    console.error('belgedenMasrafCikar hata:', e instanceof Error ? `${e.name}${(e as { code?: string }).code ? ` ${(e as { code?: string }).code}` : ''}` : 'bilinmeyen')
    return { eklendi: 0, atlandi: 0, toplam: 0, hata: e instanceof Error ? e.message : 'bilinmeyen hata' }
  }
}

export type DosyaMasrafTaramaSonuc = { belgeAdedi: number; eklendi: number; atlandi: number }

/**
 * Bir dosyadaki tüm DEKONT (makbuz) belgelerini tarar ve masraf kalemlerine çevirir.
 * Aynı makbuz tekrar taranırsa dedup zaten atlar.
 */
export async function dosyaMakbuzlariniTara(
  dosyaId: string,
  opts?: { kullaniciId?: string | null },
): Promise<DosyaMasrafTaramaSonuc> {
  const belgeler = await prisma.belge.findMany({ where: { dosyaId, kategori: 'DEKONT' }, select: { id: true } })
  let eklendi = 0
  let atlandi = 0
  for (const b of belgeler) {
    const r = await belgedenMasrafCikar(b.id, opts)
    eklendi += r.eklendi
    atlandi += r.atlandi
  }
  return { belgeAdedi: belgeler.length, eklendi, atlandi }
}
