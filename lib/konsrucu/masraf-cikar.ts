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
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { cinsEslesti, ogrenilenMap } from './masraf-cins'
import { masrafDedupKey } from './masraf'

const MODEL = 'claude-sonnet-4-6' // makbuz okuma: çok-kalemli harç dökümü + taranmış görüntü → güçlü model

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

const SISTEM = `Bu bir Türk icra/dava harç-masraf MAKBUZU/dekontudur. Her masraf/harç kalemini ayrı satır olarak çıkar. Bir makbuzda birden çok kalem olabilir (başvurma harcı + peşin harç + ... ayrı satır). dekontNo = makbuz/dekont numarası; varsa makbuz 'Sayı' ve 'No' alanlarını da yakala. tarih = makbuz tarihi (YYYY-MM-DD). tutar = TL sayı. cinsHam = makbuzdaki ham masraf adı (AYNEN). taraf: ödeyen alacaklı/vekil/büro ise BIZ; borçlu/karşı taraf ise KARSI; belli değilse BELIRSIZ — icra açılış/takip harç-masraflarını genelde alacaklı vekili öder → BIZ. UYDURMA; emin değilsen alanı boş bırak.`

/**
 * PDF makbuzu Claude'a 'document' bloğu olarak gönderip masraf kalemlerini çıkarır.
 * ANTHROPIC_API_KEY yoksa veya hata olursa [] döner.
 */
export async function makbuzCikarPdf(
  pdfBytes: Buffer,
  ipuclari?: { dosyaAdi?: string; alacakliUnvan?: string },
): Promise<MakbuzKalem[]> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !pdfBytes?.length) return []
  const client = new Anthropic({ apiKey: key })

  const ipucuSatirlari: string[] = []
  if (ipuclari?.dosyaAdi) ipucuSatirlari.push(`Belge adı: ${ipuclari.dosyaAdi}`)
  if (ipuclari?.alacakliUnvan) ipucuSatirlari.push(`Alacaklı/vekil ünvanı (BIZ tarafı): ${ipuclari.alacakliUnvan}`)

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBytes.toString('base64') },
    },
    {
      type: 'text',
      text: ipucuSatirlari.length
        ? `${ipucuSatirlari.join('\n')}\n\nYukarıdaki makbuzdaki tüm masraf/harç kalemlerini çıkar ve "kaydet" aracını çağır.`
        : 'Yukarıdaki makbuzdaki tüm masraf/harç kalemlerini çıkar ve "kaydet" aracını çağır.',
    },
  ]

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SISTEM,
      messages: [{ role: 'user', content }],
      tools: [{ name: 'kaydet', description: 'Makbuzdan çıkarılan masraf kalemlerini kaydet', input_schema: SCHEMA as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: 'kaydet' },
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return []
    const kalemler = (block.input as { kalemler?: unknown }).kalemler
    return Array.isArray(kalemler) ? (kalemler as MakbuzKalem[]) : []
  } catch (e) {
    console.error('makbuzCikarPdf hata:', e)
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

/** Güvenli sayı (string/number/null → number | null). */
function guvenliTutar(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return null
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
    for (const kalem of kalemler) {
      const tutar = guvenliTutar(kalem.tutar)
      const cinsHam = (kalem.cinsHam ?? '').toString().trim()
      if (tutar == null || !cinsHam) continue // tutar/cins olmayan kalemi atla (UYDURMA)

      const { cins, guven } = cinsEslesti(cinsHam, ogrenilen)
      const dekontNo = kalem.dekontNo ? String(kalem.dekontNo).trim() || null : null
      const tarih = tarihToDate(kalem.tarih)
      const kaynakRef = masrafDedupKey({ dekontNo, cinsHam, tutar, tarih: kalem.tarih })

      // dedup: aynı makbuz kalemi bu dosyada zaten varsa atla (kaynakRef null ise dedup uygulanmaz)
      if (kaynakRef) {
        const mevcut = await prisma.masraf.findFirst({ where: { dosyaId: belge.dosyaId, kaynakRef }, select: { id: true } })
        if (mevcut) {
          atlandi++
          continue
        }
      }

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
