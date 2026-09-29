'use server'

/**
 * KonsRücü — Öneri kartı ve rücu sebebi eylemleri · app/(app)/dosya-islem/oneri-actions.ts
 *
 * S18 (öneri kartları, alan kilidi, kural çıkarıcıları) ve S19 (rücu sebebi kodu, asgari evrak, yetkili icra).
 * Her eylem: oturum + aktif müvekkil kapsamı (dosya `musteriId = aktifMusteriId` ile bulunur) + rol denetimi +
 * zod doğrulaması; yazma tek Prisma işleminde (öneri, kilit, eski kolona ayna, Aktivite); sonunda revalidatePath.
 *
 * Roller: GORUNTULEYEN hiçbir şey yazamaz. AVUKAT_YRD kritik olmayan öneriyi onaylar/reddeder ve belgelerden önerileri
 * (kural, Excel; yüzey açıksa yapay zekâ) yeniden üretir. Kritik alan (tutar, ödeme, kaza tarihi), rücu sebebi ve yetkili icra yalnız AVUKAT/ADMIN.
 * Hukuki kayıt silinmez: öneri reddedilir ya da eskir; kilit değişince eski onaylı satır ESKIDI olur.
 */
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { alanTanimi, degerNormal } from '@/lib/konsrucu/oneri/alanlar'
import { kullaniciYetkisi, KARAR_YETKI_YOK, YETKI_YOK } from '@/lib/konsrucu/oneri/karar'
import { kuralCikar } from '@/lib/konsrucu/oneri/kural-cikarici'
import { hugoOnerileri } from '@/lib/konsrucu/oneri/kaynaklar'
import { aiOneriCalistir, aiSonucunuYaz, type AiOneriSonucu, type AiYazimSonucu } from '@/lib/konsrucu/oneri/ai-oneri'
import { gorselOkumaMetni } from '@/lib/konsrucu/evrak-metin/ai-okuma-cozum'
import { yetkiliIcraSecenekleri } from '@/lib/konsrucu/oneri/yetkili-icra'
import {
  dosyaSayfalari, elleOnayla, oneriOnayla, oneriReddet, onerileriKaydet, OneriHata, tekilIhlalMi, topluOnayla,
} from '@/lib/konsrucu/oneri/servis'
import { RUCU_SEBEBI_KODLARI, RUCU_SEBEBI_TANIM } from '@/lib/konsrucu/rucu-sebebi'
import type { KullaniciYetkisi } from '@/lib/konsrucu/oneri/tipler'

type Hata = { ok: false; error: string }
type Tamam<T extends object = object> = { ok: true } & T

const id = z.string().uuid()
const kilitId = z.string().uuid().nullable()

function yenile(dosyaId: string) {
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath(`/dosya/${dosyaId}`)
}

/** Oturum + aktif müvekkil + dosya kapsamı. Yazma eylemlerinde pasif müvekkil ve yetkisiz kullanıcı durur. */
async function kapsam(dosyaId: string): Promise<{ hata: string } | { kullaniciId: string; yetki: KullaniciYetkisi }> {
  const { dbUser, aktifMusteriId } = await ctx()
  const yetki = kullaniciYetkisi(dbUser)
  if (!yetki.duzenleyebilir) return { hata: YETKI_YOK }
  if (!aktifMusteriId) return { hata: 'Aktif müşteri bulunamadı.' }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId: aktifMusteriId }, select: { id: true, musteri: { select: { aktif: true } } } })
  if (!dosya) return { hata: 'Dosya bulunamadı veya erişiminiz yok.' }
  if (!dosya.musteri.aktif) return { hata: 'Bu müşteri pasif olduğu için değişiklik yapılamaz.' }
  return { kullaniciId: dbUser.id, yetki }
}

function hataMetni(e: unknown): string {
  if (e instanceof OneriHata) return e.message
  if (tekilIhlalMi(e)) return 'Bu alan az önce başka biri tarafından onaylandı; sayfayı yenileyip tekrar bakın.'
  return 'İşlem tamamlanamadı; sayfayı yenileyip tekrar deneyin.'
}

// ───────────────────────── onay, düzeltme, ret ─────────────────────────

const onayGirdi = z.object({ dosyaId: id, oneriId: id, beklenenOnayliId: kilitId })

/** [Doğru] — öneriyi olduğu gibi onayla (alan kilitlenir, eski kolona aynı işlemde yazılır). */
export async function oneriOnaylaEylem(input: z.input<typeof onayGirdi>): Promise<Tamam | Hata> {
  const p = onayGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz istek.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  try {
    await prisma.$transaction((tx) => oneriOnayla(tx, { ...p.data, kullaniciId: k.kullaniciId, yetki: k.yetki }))
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
  yenile(p.data.dosyaId)
  return { ok: true }
}

const duzeltGirdi = z.object({
  dosyaId: id, oneriId: id, beklenenOnayliId: kilitId,
  deger: z.string().trim().min(1).max(300),
  /** Yalnız ödeme önerisinde: YYYY-MM-DD */
  tarih: z.string().trim().max(10).optional(),
})

/** [Düzelt] — avukatın değeriyle onayla. Öneri reddedilir; düzeltilen değer "Elle" kaynaklı kilit olur. */
export async function oneriDuzeltEylem(input: z.input<typeof duzeltGirdi>): Promise<Tamam | Hata> {
  const p = duzeltGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Değer boş ya da çok uzun.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  try {
    await prisma.$transaction(async (tx) => {
      const oneri = await tx.alanDegeri.findFirst({ where: { id: p.data.oneriId, dosyaId: p.data.dosyaId, silindiAt: null }, select: { alan: true } })
      const tanim = alanTanimi(oneri?.alan)
      if (!oneri || !tanim) throw new OneriHata('BULUNAMADI', 'Öneri bulunamadı.')
      const ham: unknown =
        tanim.tip === 'ODEME' ? { tutar: p.data.deger, tarih: p.data.tarih || null }
        : tanim.tip === 'PLAKA_LISTE' ? p.data.deger.split(/[,;]+/)
        : p.data.deger
      if (degerNormal(tanim.tip, ham) == null) throw new OneriHata('DEGER_GECERSIZ', `${tanim.etiket}: değer anlaşılamadı. Biçimi kontrol edin.`)
      await oneriOnayla(tx, { dosyaId: p.data.dosyaId, oneriId: p.data.oneriId, beklenenOnayliId: p.data.beklenenOnayliId, duzeltilmisDeger: ham, kullaniciId: k.kullaniciId, yetki: k.yetki })
    })
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
  yenile(p.data.dosyaId)
  return { ok: true }
}

const retGirdi = z.object({ dosyaId: id, oneriId: id, gerekce: z.string().trim().max(500).optional() })

/** [Yanlış] — öneriyi reddet (aynı kaynaktan aynı değer yeniden çıkarımda tekrar önerilmez). */
export async function oneriReddetEylem(input: z.input<typeof retGirdi>): Promise<Tamam | Hata> {
  const p = retGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz istek.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  try {
    await prisma.$transaction((tx) => oneriReddet(tx, { ...p.data, kullaniciId: k.kullaniciId, yetki: k.yetki }))
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
  yenile(p.data.dosyaId)
  return { ok: true }
}

const topluGirdi = z.object({ dosyaId: id, oneriIds: z.array(id).min(1).max(100) })

/** Toplu onay — yalnız deterministik kaynaklı, kritik olmayan, kilitsiz ve çelişkisiz öneriler (06 §9.1). */
export async function onerileriTopluOnaylaEylem(input: z.input<typeof topluGirdi>): Promise<Tamam<{ onaylanan: number; atlanan: number }> | Hata> {
  const p = topluGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz istek.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  try {
    const r = await prisma.$transaction((tx) => topluOnayla(tx, { ...p.data, kullaniciId: k.kullaniciId, yetki: k.yetki }))
    yenile(p.data.dosyaId)
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

// ───────────────────────── kural önerilerini üret ─────────────────────────

const dosyaGirdi = z.object({ dosyaId: id })

type BulSonucu = {
  eklenen: number; atlanan: number; kaynaksiz: number
  /** Yapay zekâ adımı: KAPALI (yüzey kapalı) · METIN_YOK · HATA · TAMAM */
  ai: AiOneriSonucu['durum']; aiHata: string | null; yeniBorclu: number; yazilanAlan: number
  /** Taranmış belge görsel okuması: özet cümlesi (okuma olmadıysa boş) ve görsel AI kapalı mı. */
  gorsel: string; gorselKapali: boolean
}

/**
 * "Belgelerden yeniden bul" — kural katmanı ve Hugo/Excel satırı; AI_YUZEY_CIKARIM açıksa yapay zekâ da
 * (lib/konsrucu/oneri/ai-oneri). Okunan sayfalardan öneri üretir; onaylı alanlara dokunmaz. AI kapalıyken kart
 * yalnız kural ve Excel önerileriyle dolar (Varyant B). AI hata verirse kural önerileri yine kaydedilir.
 */
export async function kuralOnerileriniUretEylem(input: z.input<typeof dosyaGirdi>): Promise<Tamam<BulSonucu> | Hata> {
  const p = dosyaGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz istek.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  // Model çağrısı uzun sürer: işlemin DIŞINDA çalışır ki işlem zaman aşımına düşmesin.
  const ai = await aiOneriCalistir(p.data.dosyaId)
  try {
    const r = await prisma.$transaction(async (tx) => {
      const dosya = await tx.rucuDosyasi.findUnique({ where: { id: p.data.dosyaId }, select: { rucuSebebi: true, brans: true, rucuTutari: true, hasarTarihi: true, kaynakJson: true } })
      const sayfalar = await dosyaSayfalari(tx, p.data.dosyaId)
      const oneriler = [...kuralCikar(sayfalar), ...(dosya ? hugoOnerileri(dosya) : []), ...(ai.durum === 'TAMAM' ? ai.oneriler : [])]
      const s = await onerileriKaydet(tx, p.data.dosyaId, oneriler, { sayfalar })
      const y = ai.durum === 'TAMAM' ? await aiSonucunuYaz(tx, p.data.dosyaId, ai.analiz) : null
      await tx.aktivite.create({
        data: {
          dosyaId: p.data.dosyaId, kullaniciId: k.kullaniciId,
          eylem: bulAktiviteMetni(s, ai, y),
          detayJson: {
            tur: 'KURAL_ONERI', sayfa: sayfalar.length, ...s, ai: ai.durum,
            ...(ai.durum === 'TAMAM' ? { aiOneri: ai.oneriler.length, acilamayanJeton: !!ai.uyari } : {}),
            ...(gorselOzeti(ai) ? { gorselOkuma: gorselOzeti(ai) } : {}),
            ...(y ? { yazilan: y.yazilanAlanlar, yeniBorclu: y.yeniBorclu, farkliDeger: y.farkliDeger } : {}),
          } as Prisma.InputJsonValue,
        },
      })
      return { s, y }
    }, { timeout: 20_000 })
    yenile(p.data.dosyaId)
    return {
      ok: true, eklenen: r.s.eklenen, atlanan: r.s.atlanan, kaynaksiz: r.s.kaynaksiz,
      ai: ai.durum, aiHata: ai.durum === 'HATA' ? ai.hata : null,
      yeniBorclu: r.y?.yeniBorclu ?? 0, yazilanAlan: r.y?.yazilanAlanlar.length ?? 0,
      gorsel: gorselOkumaMetni(gorselOzeti(ai)), gorselKapali: (gorselOzeti(ai)?.durum ?? 'KAPALI') === 'KAPALI',
    }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

const gorselOzeti = (ai: AiOneriSonucu) => (ai.durum === 'KAPALI' ? null : ai.gorsel ?? null)

function bulAktiviteMetni(s: { eklenen: number; atlanan: number }, ai: AiOneriSonucu, y: AiYazimSonucu | null): string {
  const kaynak = ai.durum === 'TAMAM' ? 'kural, Hugo ve yapay zekâ' : 'kural ve Hugo'
  let m = `Belgelerden öneriler bulundu (${kaynak}): ${s.eklenen} yeni, ${s.atlanan} zaten vardı`
  const g = gorselOkumaMetni(gorselOzeti(ai))
  if (g) m += ` · ${g}`
  if (ai.durum === 'TAMAM' && y) {
    m += ` · yapay zekâ: ${ai.oneriler.length} öneri, ${y.yazilanAlanlar.length} boş alan dolduruldu, ${y.yeniBorclu} yeni borçlu (teyitsiz)`
    if (y.onayDustu) m += ' · onay sıfırlandı'
    if (ai.gorselNotu) m += ` · ${ai.gorselNotu}`
    if (ai.uyari) m += ` · ⚠ ${ai.uyari}`
  } else if (ai.durum === 'HATA') {
    m += ` · yapay zekâ çalışmadı: ${ai.hata}`
  }
  return m
}

// ───────────────────────── rücu sebebi (S19) ─────────────────────────

const rucuGirdi = z.object({
  dosyaId: id, beklenenOnayliId: kilitId,
  kod: z.enum(RUCU_SEBEBI_KODLARI),
  gerekce: z.string().trim().max(1000).optional(),
})

/** Rücu sebebi kodunu seç (yalnız avukat). GŞ-DİĞER'de gerekçe zorunlu; gerekçe Aktivite'ye yazılır. */
export async function rucuSebebiSecEylem(input: z.input<typeof rucuGirdi>): Promise<Tamam | Hata> {
  const p = rucuGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz rücu sebebi kodu.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  if (!k.yetki.kararVerebilir) return { ok: false, error: KARAR_YETKI_YOK }
  const tanim = RUCU_SEBEBI_TANIM[p.data.kod]
  if (tanim.gerekceZorunlu && (p.data.gerekce ?? '').length < 10) return { ok: false, error: 'Bu kod için kısa bir gerekçe yazın (en az 10 karakter).' }
  try {
    await prisma.$transaction(async (tx) => {
      const r = await elleOnayla(tx, {
        dosyaId: p.data.dosyaId, alan: 'rucuSebebiKod', deger: p.data.kod, beklenenOnayliId: p.data.beklenenOnayliId,
        kullaniciId: k.kullaniciId, yetki: k.yetki, uretici: 'SECIM:RUCU_SEBEBI',
      })
      if (p.data.gerekce) {
        await tx.aktivite.create({
          data: {
            dosyaId: p.data.dosyaId, kullaniciId: k.kullaniciId, eylem: `Rücu sebebi gerekçesi: ${tanim.ad}`,
            detayJson: { tur: 'RUCU_SEBEBI_GEREKCE', kod: p.data.kod, onayliId: r.onayliId, gerekce: p.data.gerekce } as Prisma.InputJsonValue,
          },
        })
      }
    })
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
  yenile(p.data.dosyaId)
  return { ok: true }
}

// ───────────────────────── yetkili icra (S19) ─────────────────────────

const icraGirdi = z.object({
  dosyaId: id, beklenenOnayliId: kilitId,
  /** 'KAZA_YERI' | 'YERLESIM_YERI:<borcluId>' | 'ELLE' */
  anahtar: z.string().trim().min(1).max(80),
  elleDaire: z.string().trim().max(120).optional(),
})

/**
 * Yetkili icra dairesini seç (yalnız avukat). Seçenekler sunucuda dosya verisinden yeniden hesaplanır; istemcinin
 * gönderdiği daire adına güvenilmez (ELLE hariç). AI'ın yetkili icra önerisi bu alana hiç yazılmaz.
 */
export async function yetkiliIcraSecEylem(input: z.input<typeof icraGirdi>): Promise<Tamam | Hata> {
  const p = icraGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz seçim.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  if (!k.yetki.kararVerebilir) return { ok: false, error: 'Yetkili icra dairesini yalnız avukat ya da yönetici (ADMIN) seçebilir.' }
  try {
    await prisma.$transaction(async (tx) => {
      let deger: { icraDairesi: string; secenek: 'KAZA_YERI' | 'YERLESIM_YERI' | 'ELLE'; gerekce?: string }
      if (p.data.anahtar === 'ELLE') {
        if (!p.data.elleDaire) throw new OneriHata('DEGER_GECERSIZ', 'İcra dairesinin adını yazın.')
        deger = { icraDairesi: p.data.elleDaire, secenek: 'ELLE', gerekce: 'Avukat elle girdi.' }
      } else {
        const dosya = await tx.rucuDosyasi.findUnique({
          where: { id: p.data.dosyaId },
          select: { kazaYeri: true, il: true, borclular: { select: { id: true, adUnvan: true, adres: true }, orderBy: { id: 'asc' } } },
        })
        const s = dosya ? yetkiliIcraSecenekleri(dosya).secenekler.find((x) => x.anahtar === p.data.anahtar) : null
        if (!s) throw new OneriHata('GECERSIZ', 'Bu seçenek artık geçerli değil (kaza yeri ya da borçlu adresi değişmiş olabilir); sayfayı yenileyin.')
        deger = { icraDairesi: s.icraDairesi, secenek: s.secenek, gerekce: `${s.gerekce} ${s.dayanak}` }
      }
      await elleOnayla(tx, {
        dosyaId: p.data.dosyaId, alan: 'yetkiliIcra', deger, beklenenOnayliId: p.data.beklenenOnayliId,
        kullaniciId: k.kullaniciId, yetki: k.yetki, uretici: `SECIM:YETKILI_ICRA:${deger.secenek}`,
      })
    })
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
  yenile(p.data.dosyaId)
  return { ok: true }
}

// ───────────────────────── kişisel veriyi göster ─────────────────────────

const gosterGirdi = z.object({ dosyaId: id, oneriId: id })

/** Maskeli değeri ve alıntıyı açar; her açış Aktivite'ye yazılır (06 §2 "Maskeleme"). */
export async function oneriDegeriniGosterEylem(input: z.input<typeof gosterGirdi>): Promise<Tamam<{ deger: string; alinti: string | null }> | Hata> {
  const p = gosterGirdi.safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz istek.' }
  const k = await kapsam(p.data.dosyaId)
  if ('hata' in k) return { ok: false, error: k.hata }
  const s = await prisma.alanDegeri.findFirst({ where: { id: p.data.oneriId, dosyaId: p.data.dosyaId, silindiAt: null }, select: { alan: true, degerJson: true, alinti: true } })
  const tanim = alanTanimi(s?.alan)
  if (!s || !tanim) return { ok: false, error: 'Öneri bulunamadı.' }
  const x = degerNormal(tanim.tip, s.degerJson)
  const deger = Array.isArray(x) ? x.join(', ') : x == null ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x)
  await prisma.aktivite.create({
    data: {
      dosyaId: p.data.dosyaId, kullaniciId: k.kullaniciId, eylem: `Kişisel veri gösterildi: ${tanim.etiket} (öneri)`,
      detayJson: { tur: 'KISISEL_VERI_GOSTER', alan: s.alan, oneriId: p.data.oneriId } as Prisma.InputJsonValue,
    },
  })
  return { ok: true, deger, alinti: s.alinti }
}
