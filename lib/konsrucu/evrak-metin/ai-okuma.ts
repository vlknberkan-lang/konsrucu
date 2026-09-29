/**
 * KonsRücü — Taranmış evrakı görsel yapay zekâyla okuma · lib/konsrucu/evrak-metin/ai-okuma.ts  (server-only)
 *
 * Yerel katman görüntüdeki yazıyı okuyamaz; türü de yalnız en-boy oranından tahmin eder (yatay çekilmiş kaza tespit
 * tutanağı "Hasar fotoğrafı", telefon ekran görüntüsü poliçe "Hasar fotoğrafı" olur — 1199772 vakası, 2026-09-29).
 * Görsel AI açıksa (AI_GORSEL=acik + yüzey 'cikarim') her görüntüye BİR KEZ bakılır:
 *   1. aşama · ayırma (hızlı model, 8 görsel/istek): tür. Fotoğraf → Hasar fotoğrafı (metinDurumu GEREKSIZ);
 *      ehliyet/ruhsat/kimlik/sağlık → tür işaretlenir, metin YAZILMAZ (aiIzni YASAK, KVKK_ATLANDI).
 *   2. aşama · okuma (en güçlü model, belge başına): belge çıkanlar ve metinsiz taranmış PDF'ler el yazısı dahil
 *      metne çevrilir (extractedText, metinDurumu AI_OKUMA). Tür son kararı bu aşamadadır.
 * Sonraki her çıkarım (analizEt, kural katmanı, eksik evrak, dayanak seçimi) bu metni MASKELİ kullanır; görüntü
 * bir daha gitmez. Avukatın elle seçtiği tür (güven 1) değişmez.
 *
 * KVKK (06, 5.5): görüntü maskelenemez — görsel AI'ı açmak avukatın kararıdır (2026-09-29). Adı ya da kategorisi
 * sağlık/kimlik olan belge hiç gönderilmez (gorsel-aday).
 */
import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'
import { gorselAiAcik, yuzeyAcik } from '@/lib/ai/bayrak'
import { aiOturumu, aiKapiHatasiMi, type AiOturumu, type GorselMime } from '@/lib/ai/cagri'
import { hassasGorselMi } from '@/lib/ai/gorsel-aday'
import { ELLE_YUKLEME_METIN_SINIRI, metniSinirla } from './ortak'
import {
  ayirmaYanitCoz, AYIRMA_SISTEMI, gorselYanitCoz, METINSIZ_TURLER, OKUMA_SISTEMI, OKUMA_TALIMATI, TUR_KATEGORI,
  type GorselOkumaOzeti, type OkumaTuru,
} from './ai-okuma-cozum'

export { gorselOkumaMetni, type GorselOkumaOzeti } from './ai-okuma-cozum'

/** 2. aşama: el yazısı okuma doğruluğu için en güçlü güncel model; akıl yürütme gereksiz → düşük efor. */
export const GORSEL_OKUMA_MODEL = 'claude-opus-5-5'
/** 1. aşama: yalnız tür ayırma — hızlı ve ucuz model yeter. */
export const GORSEL_AYIRMA_MODEL = 'claude-haiku-4-5'
const YONTEM = 'AI_GORSEL@1'
const RESIM = /\.(jpe?g|png|webp|gif)$/i
const PDF = /\.pdf$/i
/** API sınırları: görsel ≤ 5 MB; istek ≤ 32 MB (base64 ≈ ×1,33). */
const RESIM_EN_BUYUK = 4_500_000
const PDF_EN_BUYUK = 15_000_000
const AYIRMA_GRUP = 8
const AYIRMA_GRUP_BAYT = 16_000_000
const EN_FAZLA_DENEME = 2

/** Görsel okuma açık mı (yüzey + görsel kapısı)? */
export function gorselOkumaAcik(): boolean {
  return yuzeyAcik('cikarim') && gorselAiAcik()
}

function baytTuru(buf: Buffer): GorselMime | 'pdf' | null {
  if (buf.length < 12) return null
  if (buf.toString('ascii', 0, 4) === '%PDF') return 'pdf'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

// Postgres text alanı NUL/C0 kontrol baytlarını kabul etmez (tab/satır sonu korunur).
const temizle = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

type Aday = { id: string; dosyaAdi: string; storagePath: string; kategori: string; confidence: number | null; okumaDeneme: number }
type Hazir = Aday & { tur: GorselMime | 'pdf'; buf: Buffer }
type Admin = ReturnType<typeof createAdminClient>
/** Çalıştırma bağlamı: özet sayaçları + bu çalıştırmada sonuca bağlanan belgeler (kalan = aday − işlenen). */
type Baglam = { ozet: GorselOkumaOzeti; islenen: Set<string> }

const bos = (durum: GorselOkumaOzeti['durum']): GorselOkumaOzeti => ({ durum, bakilan: 0, okunan: 0, tutanak: 0, fotoAyrilan: 0, kvkkAtlanan: 0, hatali: 0, kalan: 0, hata: null })

/** Sınırlı eşzamanlılıkla çalıştırır; süre dolunca ya da durdurucu hata olunca yeni iş başlatmaz. */
async function havuz<T>(isler: readonly T[], paralel: number, bitis: number, c: Baglam, f: (x: T) => Promise<void>): Promise<void> {
  let i = 0
  const isci = async () => { while (i < isler.length && Date.now() < bitis && !c.ozet.hata) await f(isler[i++]) }
  await Promise.all(Array.from({ length: Math.min(paralel, isler.length) }, isci))
}

/**
 * Dosyada türüne henüz bakılmamış görüntüleri ve metinsiz taranmış PDF'leri işler. ASLA fırlatmaz. Süre bütçesi
 * dolunca yeni iş başlatmaz; kalanlar sonraki çalıştırmada işlenir (işlenen belge bir daha aday olmaz).
 */
export async function taranmisBelgeleriOku(dosyaId: string, o: { butceMs?: number; paralel?: number } = {}): Promise<GorselOkumaOzeti> {
  if (!gorselOkumaAcik()) return bos('KAPALI')
  const c: Baglam = { ozet: bos('TAMAM'), islenen: new Set() }
  const { ozet } = c
  let adaySayisi = 0
  try {
    const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
    if (!dosya) return bos('YOK')
    const hamlar = await prisma.belge.findMany({
      where: {
        dosyaId, silindiAt: null, kaynakRef: null, extractedText: null, NOT: { storagePath: '' }, okumaDeneme: { lt: EN_FAZLA_DENEME },
        AND: [{ OR: [{ metinDurumu: null }, { metinDurumu: 'BEKLIYOR' }] }, { OR: [{ aiIzni: null }, { aiIzni: { not: 'YASAK' } }] }],
      },
      select: { id: true, dosyaAdi: true, storagePath: true, kategori: true, confidence: true, okumaDeneme: true },
      orderBy: { createdAt: 'asc' },
    })
    const adaylar: Aday[] = []
    for (const b of hamlar) {
      if (!RESIM.test(b.dosyaAdi) && !RESIM.test(b.storagePath) && !PDF.test(b.dosyaAdi) && !PDF.test(b.storagePath)) continue
      if (hassasGorselMi(b)) {
        // adından/kategorisinden kimlik ya da sağlık belgesi: hiç gönderilmez, bir daha aday olmaz
        await prisma.belge.update({ where: { id: b.id }, data: { aiIzni: 'YASAK', metinDurumu: 'KVKK_ATLANDI' } }).catch(() => null)
        ozet.kvkkAtlanan++
        continue
      }
      adaylar.push(b)
    }
    adaySayisi = adaylar.length
    if (!adaylar.length) return { ...ozet, durum: ozet.kvkkAtlanan ? 'TAMAM' : 'YOK' }

    // Tek oturum: kredi işlem başına bir kez düşer (ilk çağrı tek başına yapılır ki rezerv yarışmasın).
    const oturum = aiOturumu({ yuzey: 'cikarim', ai: { musteriId: dosya.musteriId, dosyaId }, gorselIzni: true })
    const bitis = Date.now() + (o.butceMs ?? 100_000)
    const paralel = o.paralel ?? 5
    const admin = createAdminClient()

    // baytlar (indirilemeyen ya da uygunsuz olan başarısız sayılır)
    const hazirlar: Hazir[] = []
    await havuz(adaylar, 8, bitis, c, async (b) => {
      const h = await indir(admin, b, c)
      if (h) hazirlar.push(h)
    })

    // 1. aşama: görseller türe ayrılır; PDF doğrudan okumaya gider
    const okunacak: Hazir[] = hazirlar.filter((h) => h.tur === 'pdf')
    const gruplar: Hazir[][] = []
    for (const h of hazirlar.filter((x) => x.tur !== 'pdf')) {
      const son = gruplar[gruplar.length - 1]
      if (son && son.length < AYIRMA_GRUP && son.reduce((t, x) => t + x.buf.length, 0) + h.buf.length <= AYIRMA_GRUP_BAYT) son.push(h)
      else gruplar.push([h])
    }
    const ayir = async (g: Hazir[]) => {
      const turler = await ayirmaIste(oturum, g, c)
      for (let i = 0; i < g.length; i++) {
        const t = turler[i]
        if (!t) { if (!c.ozet.hata) await basarisiz(g[i], 'türü ayrılamadı', c); continue }
        ozet.bakilan++
        if (METINSIZ_TURLER.has(t)) await yaz(g[i], t, 0.9, '', c)
        else okunacak.push(g[i])
      }
    }
    if (gruplar.length) {
      await ayir(gruplar[0])
      await havuz(gruplar.slice(1), paralel, bitis, c, ayir)
    }

    // 2. aşama: belgeler metne çevrilir (tür son kararı burada)
    await havuz(okunacak, paralel, bitis, c, (h) => belgeOku(oturum, h, c))
  } catch (e) {
    ozet.hata = e instanceof Error ? e.message.slice(0, 200) : 'bilinmeyen hata'
  }
  ozet.kalan = Math.max(0, adaySayisi - c.islenen.size)
  return ozet
}

async function indir(admin: Admin, b: Aday, c: Baglam): Promise<Hazir | null> {
  try {
    const { data, error } = await admin.storage.from('evrak').download(b.storagePath)
    if (error || !data) { await basarisiz(b, `indirilemedi: ${error?.message ?? 'boş yanıt'}`, c); return null }
    const buf = Buffer.from(await data.arrayBuffer())
    const tur = baytTuru(buf)
    if (!tur) { await basarisiz(b, 'desteklenmeyen biçim (JPEG, PNG, WEBP, GIF ya da PDF değil)', c); return null }
    if (buf.length > (tur === 'pdf' ? PDF_EN_BUYUK : RESIM_EN_BUYUK)) { await basarisiz(b, 'dosya görsel okuma için çok büyük', c); return null }
    return { ...b, tur, buf }
  } catch (e) {
    await basarisiz(b, `indirilemedi: ${(e as Error).message}`, c)
    return null
  }
}

async function basarisiz(b: Aday, neden: string, c: Baglam): Promise<void> {
  c.ozet.hatali++
  c.islenen.add(b.id)
  const deneme = b.okumaDeneme + 1
  await prisma.belge.update({
    where: { id: b.id },
    data: { okumaDeneme: deneme, okumaHata: neden.slice(0, 300), ...(deneme >= EN_FAZLA_DENEME ? { metinDurumu: 'OKUNAMADI' } : {}) },
  }).catch(() => null)
}

/** Kapı/kredi/acil fren hatası bütün işi durdurur; geçici API hatası yalnız o isteği. */
function durduranHataMi(e: unknown): boolean {
  const ad = (e as Error)?.name
  return aiKapiHatasiMi(e) || ad === 'KrediYetersizHata' || ad === 'AiDurdurulduHata'
}

async function ayirmaIste(oturum: AiOturumu, g: Hazir[], c: Baglam): Promise<(OkumaTuru | null)[]> {
  try {
    const y = await oturum.iste({
      model: GORSEL_AYIRMA_MODEL,
      maxTokens: 60 + g.length * 20,
      sistem: AYIRMA_SISTEMI,
      icerik: [
        ...g.flatMap((h, i) => [{ tur: 'metin' as const, metin: `#${i}:` }, { tur: 'gorsel' as const, mime: h.tur as GorselMime, b64: h.buf.toString('base64') }]),
        { tur: 'metin', metin: `Yukarıdaki ${g.length} görselin her biri için "#numara: TÜR" satırı yaz.` },
      ],
      geriAc: false,
    })
    return ayirmaYanitCoz(y.metin, g.length)
  } catch (e) {
    if (durduranHataMi(e)) c.ozet.hata = (e as Error).message
    return g.map(() => null)
  }
}

async function belgeOku(oturum: AiOturumu, h: Hazir, c: Baglam): Promise<void> {
  let yanit: string
  try {
    const y = await oturum.iste({
      model: GORSEL_OKUMA_MODEL,
      maxTokens: 16000,
      efor: 'low',
      sistem: OKUMA_SISTEMI,
      icerik: [
        h.tur === 'pdf' ? { tur: 'pdf', b64: h.buf.toString('base64') } : { tur: 'gorsel', mime: h.tur, b64: h.buf.toString('base64') },
        { tur: 'metin', metin: OKUMA_TALIMATI },
      ],
      geriAc: false, // giden metin sabit talimat; maskeli jeton yok
    })
    yanit = y.metin
    if (y.kesildi) yanit += '\n[metnin sonu uzunluk sınırında kesildi]'
  } catch (e) {
    if (durduranHataMi(e)) { c.ozet.hata = (e as Error).message; return }
    return basarisiz(h, `yapay zekâ okuyamadı: ${e instanceof Error ? e.name : 'hata'}`, c)
  }
  const r = gorselYanitCoz(yanit)
  if (!r) return basarisiz(h, 'yanıt biçimi çözülemedi', c)
  await yaz(h, r.tur, r.guven, r.metin, c)
}

async function yaz(b: Aday, tur: OkumaTuru, guvenHam: number, metin: string, c: Baglam): Promise<void> {
  const { ozet } = c
  c.islenen.add(b.id)
  const elleSecildi = (b.confidence ?? 0) >= 1 // avukatın seçtiği tür korunur (güven 1 yalnız elle seçimde)
  const kategori = elleSecildi ? undefined : TUR_KATEGORI[tur]
  const confidence = elleSecildi ? undefined : Math.min(guvenHam, 0.99)
  const ortak = { okumaDeneme: b.okumaDeneme + 1, okumaHata: null, metinYontemi: YONTEM }
  let data: Prisma.BelgeUpdateInput
  if (tur === 'EHLIYET' || tur === 'RUHSAT' || tur === 'ALKOL' || tur === 'KIMLIK') {
    ozet.kvkkAtlanan++
    data = { ...ortak, kategori, confidence, aiIzni: 'YASAK', metinDurumu: 'KVKK_ATLANDI' }
  } else if (tur === 'HASAR_FOTO') {
    if (!elleSecildi && b.kategori !== 'HASAR_FOTO') ozet.fotoAyrilan++
    data = { ...ortak, kategori, confidence, metinDurumu: 'GEREKSIZ' }
  } else {
    const k = metniSinirla(temizle(metin), ELLE_YUKLEME_METIN_SINIRI)
    if (!k.metin.trim()) {
      ozet.hatali++
      data = { ...ortak, kategori, confidence, metinDurumu: 'OKUNAMADI', okumaHata: 'belgede okunabilir yazı bulunamadı' }
    } else {
      ozet.okunan++
      if ((kategori ?? b.kategori) === 'TUTANAK') ozet.tutanak++
      data = { ...ortak, kategori, confidence, extractedText: k.metin, metinDurumu: 'AI_OKUMA', metinGuven: confidence ?? null }
    }
  }
  await prisma.belge.update({ where: { id: b.id }, data }).catch(() => { ozet.hatali++ })
}
