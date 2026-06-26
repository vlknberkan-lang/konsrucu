/**
 * KonsRücü — Makbuz/dekont PDF okuyucu (B4) · lib/konsrucu/masraf-cikar.ts  (server-only)
 * UYAP'tan inip Belge (Supabase 'evrak' bucket) olarak duran harç-masraf MAKBUZLARINI Claude ile
 * okuyup Masraf satırlarına çevirir. PDF 'document' bloğu olarak gönderilir → metinli VE taranmış
 * makbuz Claude tarafından okunur (forced tool-use, şema-zorunlu JSON; analiz.ts ile aynı stil).
 *
 * Akış: makbuzCikarPdf (PDF bytes → kalem dizisi) → belgedenMasrafCikar (Belge → cins eşleştirme +
 * dedup + Masraf.create) → dosyaMakbuzlariniTara (dosyadaki tüm DEKONT belgelerini tara).
 */
import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { cinsEslesti, ogrenilenMap, normCins } from './masraf-cins'
import { masrafDedupKey, paraGuvenli } from './masraf'
import { pdfMetinCikar } from './pdf-metin'

// KATMAN 2 (fallback): yerel parser düşemezse / makbuz taranmışsa LLM. Makbuz "oku ve sayıları dök"
// işidir → en ucuz model yeter (Sonnet DEĞİL). Çoğu makbuz Katman 1'de ₺0'a çözülür, buraya azı düşer.
const MODEL_FALLBACK = 'claude-haiku-4-5'

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

/** Makbuz baytlarını PDF mi görsel mi olduğunu sihirli baytlardan anlayıp uygun Claude bloğu kurar. */
function makbuzBlok(bytes: Buffer): Anthropic.ContentBlockParam {
  const data = bytes.toString('base64')
  const h = bytes.subarray(0, 4)
  if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) // %PDF
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  const media: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null =
    h[0] === 0x89 && h[1] === 0x50 ? 'image/png'
      : h[0] === 0xff && h[1] === 0xd8 ? 'image/jpeg'
      : h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 ? 'image/gif'
      : h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 ? 'image/webp' // RIFF (webp)
      : null
  if (media) return { type: 'image', source: { type: 'base64', media_type: media, data } }
  // bilinmiyor → çoğu UYAP makbuzu PDF; PDF varsay
  return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
}

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

/**
 * Metinli makbuzu LLM'siz ayrıştır. guvenli=true SADECE makbuzdaki "Toplam" ile çıkarılan kalemlerin
 * toplamı birebir tutuyorsa döner (= hiçbir kalem kaçmadı + tutarlar doğru) → çağıran LLM'e GİTMEZ.
 * guvenli=false → çağıran (ucuz) LLM fallback'ine düşer. reddiyat=true → masraf yok (kesin).
 */
export function makbuzParseMetin(metin: string): MakbuzParseSonuc {
  if (/reddiyat makbuzu|tahsilat makbuzu/.test(normCins(metin))) return { reddiyat: true, kalemler: [], guvenli: true }

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
): Promise<MakbuzKalem[]> {
  if (!pdfBytes?.length) return []

  // KATMAN 1 (₺0): metinli PDF'i yerel oku + şablon parser.
  const metin = await pdfMetinCikar(pdfBytes)
  if (metin) {
    const p = makbuzParseMetin(metin)
    if (p.reddiyat) return []
    if (p.guvenli) return p.kalemler // toplam tuttu → tam ve doğru, LLM'e gerek yok
  }

  // KATMAN 2 (fallback): ucuz LLM. Metin çıktıysa metni gönder (vision'dan ucuz); çıkmadıysa belge/görüntü.
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return []
  const client = new Anthropic({ apiKey: key })

  const ipucuSatirlari: string[] = []
  if (ipuclari?.dosyaAdi) ipucuSatirlari.push(`Belge adı: ${ipuclari.dosyaAdi}`)
  if (ipuclari?.alacakliUnvan) ipucuSatirlari.push(`Alacaklı/vekil ünvanı (BIZ tarafı): ${ipuclari.alacakliUnvan}`)
  const ipucu = ipucuSatirlari.length ? `${ipucuSatirlari.join('\n')}\n\n` : ''

  const content: Anthropic.ContentBlockParam[] = metin
    ? [{ type: 'text', text: `${ipucu}Aşağıdaki makbuz METNİNDEKİ tüm masraf/harç kalemlerini çıkar ve "kaydet" aracını çağır.\n\n--- MAKBUZ METNİ ---\n${metin.slice(0, 30000)}` }]
    : [makbuzBlok(pdfBytes), { type: 'text', text: `${ipucu}Yukarıdaki makbuzdaki tüm masraf/harç kalemlerini çıkar ve "kaydet" aracını çağır.` }]

  try {
    const res = await client.messages.create({
      model: MODEL_FALLBACK,
      max_tokens: 3000,
      system: SISTEM,
      messages: [{ role: 'user', content }],
      tools: [{ name: 'kaydet', description: 'Makbuzdan çıkarılan masraf kalemlerini kaydet', input_schema: SCHEMA as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: 'kaydet' },
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return []
    const input = block.input as { kalemler?: unknown; reddiyatMakbuzuMu?: boolean }
    if (input.reddiyatMakbuzuMu) return [] // reddiyat/tahsilat makbuzu → masraf kalemi yok
    return Array.isArray(input.kalemler) ? (input.kalemler as MakbuzKalem[]) : []
  } catch (e) {
    console.error('makbuzCikarPdf (LLM fallback) hata:', e)
    return []
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
      select: { id: true, dosyaId: true, storagePath: true, dosyaAdi: true, dosya: { select: { musteriId: true } } },
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

    const kalemler = await makbuzCikarPdf(bytes, { dosyaAdi: belge.dosyaAdi })
    if (!kalemler.length) return { eklendi: 0, atlandi: 0, toplam: 0 }

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
    console.error('belgedenMasrafCikar hata:', e)
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
