'use server'

/**
 * KonsRücü — Eklenti anahtarı ve anlık UYAP senkronu · server action'lar · app/(app)/dosya-islem/senkron-actions.ts
 *
 * Hepsi: oturum + aktif müvekkil (musteriId) kapsamı + rol kontrolü + zod doğrulama.
 *
 *   eklentiAnahtarlariGetir   — kişisel anahtarlar (yönetici: müvekkilin tüm anahtarları) + UYAP bağlantısı. Salt okur.
 *   eklentiAnahtarOlustur     — yeni kişisel anahtar; düz anahtar YALNIZ bu yanıtta bir kez döner (S14, B51).
 *   eklentiAnahtarIptal       — iptal (satır silinmez; iptalAt). Sahibi ya da yönetici.
 *   icraNoKaydetVeCek         — "Kaydet ve UYAP'tan çek": esas no'yu yazar ve öncelikli SenkronIs(ICRA) açar (S22).
 *   uyaptanCek                — kayıtlı esas no ile yeniden çek (öncelikli iş).
 *   senkronIsDurumu           — canlı ilerleme paneli (program sayfası 2 sn'de bir sorar). Yalnız takılı işi
 *                               ZAMAN_ASIMI'na çeker (tembel kapanış); başka hiçbir şey yazmaz.
 *   senkronIsIptalEt          — henüz alınmamış işi iptal eder.
 *   uyapBaglantiGetir         — "UYAP bağlantısı: açık · son sinyal N dk önce" (son nabızdan ölçülür).
 *
 * Görüntüleyen rolü ve pasif kullanıcı yazamaz (B32). Hukuki kayıt açılmaz; SenkronIs işletim kaydıdır.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { ileriMi } from '@/lib/konsrucu/durum'
import {
  anahtarDurumu, anahtarGosterim, anahtarIptalEdebilir, anahtarKalanGun, anahtarOlusturabilir, anahtarUret, type AnahtarDurumu,
} from '@/lib/konsrucu/senkron/anahtar'
import { dosyaSonIsi, isIptal, isOlustur, isTakiliMi, senkronIsZamanAsimi, sonNabizlar } from '@/lib/konsrucu/senkron/is-kuyrugu'
import { baglantiDurumu, esasNoCoz, isGorunumu, takipMutabakati, type Baglanti, type IsGorunumu, type IsOzeti, type Mutabakat } from '@/lib/konsrucu/senkron/is-saf'
import { sunucuOzellikleri } from '@/lib/konsrucu/senkron/ozellikler'

export type SenkronIslemSonuc = { ok: boolean; error?: string; bilgi?: string }

export type EklentiAnahtarSatiri = {
  id: string
  ad: string | null
  gosterim: string
  durum: AnahtarDurumu
  kalanGun: number
  sonKullanma: string
  sonGorulme: string | null
  createdAt: string
  sahibiAd: string | null
  benim: boolean
}

export type EklentiAnahtarlariSonuc = {
  ok: boolean
  error?: string
  anahtarlar?: EklentiAnahtarSatiri[]
  olusturabilir?: boolean
  yonetici?: boolean
  baglanti?: Baglanti
}

export type AnahtarOlusturSonuc = { ok: boolean; error?: string; anahtar?: string; satir?: EklentiAnahtarSatiri }

export type SenkronIsDurumuSonuc = {
  ok: boolean
  error?: string
  is?: IsGorunumu | null
  baglanti?: Baglanti
  mutabakat?: Mutabakat | null
  kuyrukAcik?: boolean
}

export type CekSonuc = { ok: boolean; error?: string; bilgi?: string; isId?: string; kuyrukKapali?: boolean }

const ENCOK_AKTIF_ANAHTAR = 5

const uuid = z.string().uuid('Geçersiz kimlik')

function ilkHata(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Geçersiz girdi'
}

type Kapsam = { hata: string } | { hata: null; kullaniciId: string; rol: string; aktif: boolean; musteriId: string }

/** Oturum + aktif müvekkil + rol. `yazma` true ise görüntüleyen ve pasif kullanıcı reddedilir. */
async function kapsam(yazma: boolean): Promise<Kapsam> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif) return { hata: 'Hesabınız pasif; işlem yapılamaz.' }
  if (yazma && dbUser.rol === 'GORUNTULEYEN') return { hata: 'Bu işlem için yetkiniz yok (görüntüleyen rolü).' }
  if (!aktifMusteriId) return { hata: 'Aktif müvekkil bulunamadı.' }
  return { hata: null, kullaniciId: dbUser.id, rol: dbUser.rol, aktif: dbUser.aktif, musteriId: aktifMusteriId }
}

function yenile(dosyaId: string) {
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath(`/dosya/${dosyaId}`)
}

function satir(a: { id: string; ad: string | null; onek: string; iptalAt: Date | null; sonKullanma: Date; sonGorulme: Date | null; createdAt: Date; kullaniciId: string; kullanici?: { ad: string } | null }, benimId: string, simdi = new Date()): EklentiAnahtarSatiri {
  return {
    id: a.id,
    ad: a.ad,
    gosterim: anahtarGosterim(a.onek),
    durum: anahtarDurumu(a, simdi),
    kalanGun: anahtarKalanGun(a.sonKullanma, simdi),
    sonKullanma: a.sonKullanma.toISOString(),
    sonGorulme: a.sonGorulme ? a.sonGorulme.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    sahibiAd: a.kullanici?.ad ?? null,
    benim: a.kullaniciId === benimId,
  }
}

// ─────────────────────────── eklenti anahtarları (S14) ───────────────────────────

export async function eklentiAnahtarlariGetir(): Promise<EklentiAnahtarlariSonuc> {
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const yonetici = k.rol === 'ADMIN'
  const rows = await prisma.eklentiAnahtar.findMany({
    where: { musteriId: k.musteriId, ...(yonetici ? {} : { kullaniciId: k.kullaniciId }) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, ad: true, onek: true, iptalAt: true, sonKullanma: true, sonGorulme: true, createdAt: true, kullaniciId: true, kullanici: { select: { ad: true } } },
  })
  const baglanti = baglantiDurumu(await sonNabizlar([k.musteriId]))
  return {
    ok: true,
    anahtarlar: rows.map((r) => satir(r, k.kullaniciId)),
    olusturabilir: anahtarOlusturabilir({ aktif: k.aktif, rol: k.rol }),
    yonetici,
    baglanti,
  }
}

const olusturSema = z.object({ ad: z.string().trim().max(60, 'Ad en çok 60 karakter olabilir').optional() })

export async function eklentiAnahtarOlustur(girdi: { ad?: string }): Promise<AnahtarOlusturSonuc> {
  const p = olusturSema.safeParse(girdi ?? {})
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  if (!anahtarOlusturabilir({ aktif: k.aktif, rol: k.rol })) return { ok: false, error: 'Bu işlem için yetkiniz yok.' }
  const simdi = new Date()
  const aktifSayi = await prisma.eklentiAnahtar.count({ where: { musteriId: k.musteriId, kullaniciId: k.kullaniciId, iptalAt: null, sonKullanma: { gt: simdi } } })
  if (aktifSayi >= ENCOK_AKTIF_ANAHTAR) return { ok: false, error: `En çok ${ENCOK_AKTIF_ANAHTAR} etkin anahtarınız olabilir. Kullanmadığınız bir anahtarı iptal edin.` }
  const u = anahtarUret(simdi)
  const ad = p.data.ad || null
  const a = await prisma.eklentiAnahtar.create({
    data: { musteriId: k.musteriId, kullaniciId: k.kullaniciId, ozet: u.ozet, onek: u.onek, ad, sonKullanma: u.sonKullanma },
    select: { id: true, ad: true, onek: true, iptalAt: true, sonKullanma: true, sonGorulme: true, createdAt: true, kullaniciId: true, kullanici: { select: { ad: true } } },
  })
  await prisma.aktivite.create({
    data: { kullaniciId: k.kullaniciId, eylem: `Eklenti anahtarı oluşturuldu: ${anahtarGosterim(u.onek)}${ad ? ` (${ad})` : ''}`, detayJson: { anahtarId: a.id, musteriId: k.musteriId } },
  })
  revalidatePath('/ayarlar')
  return { ok: true, anahtar: u.anahtar, satir: satir(a, k.kullaniciId, simdi) }
}

export async function eklentiAnahtarIptal(girdi: { id: string }): Promise<SenkronIslemSonuc> {
  const p = z.object({ id: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const a = await prisma.eklentiAnahtar.findFirst({ where: { id: p.data.id, musteriId: k.musteriId }, select: { id: true, kullaniciId: true, onek: true, iptalAt: true } })
  if (!a) return { ok: false, error: 'Anahtar bulunamadı.' }
  if (!anahtarIptalEdebilir({ id: k.kullaniciId, rol: k.rol, aktif: k.aktif }, a.kullaniciId)) return { ok: false, error: 'Bu anahtarı yalnız sahibi ya da yönetici iptal edebilir.' }
  if (a.iptalAt) return { ok: true, bilgi: 'Anahtar zaten iptal edilmiş.' }
  await prisma.eklentiAnahtar.update({ where: { id: a.id }, data: { iptalAt: new Date() } })
  await prisma.aktivite.create({ data: { kullaniciId: k.kullaniciId, eylem: `Eklenti anahtarı iptal edildi: ${anahtarGosterim(a.onek)}`, detayJson: { anahtarId: a.id, musteriId: k.musteriId } } })
  revalidatePath('/ayarlar')
  return { ok: true, bilgi: 'Anahtar iptal edildi. Bu anahtarla gelen istekler artık reddedilir.' }
}

// ─────────────────────────── anlık senkron (S22) ───────────────────────────

const icraNoSema = z.object({
  dosyaId: uuid,
  esasNo: z.string().trim().min(3, 'İcra esas no girin (ör. 2026/1234)').max(40),
  daire: z.string().trim().max(160, 'Daire adı çok uzun').optional(),
})

type TevziJson = { tevzi?: { uyapDosyaId?: string | null; birimAdi?: string | null } }

/** "Kaydet ve UYAP'tan çek": esas no'yu yazar; iş kuyruğu açıksa öncelikli SenkronIs(ICRA) açar. */
export async function icraNoKaydetVeCek(girdi: { dosyaId: string; esasNo: string; daire?: string }): Promise<CekSonuc> {
  const p = icraNoSema.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const esas = esasNoCoz(p.data.esasNo)
  if (!esas) return { ok: false, error: 'Esas no "2026/1234" biçiminde olmalı.' }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: p.data.dosyaId, musteriId: k.musteriId },
    select: { id: true, durum: true, icraDosyaNo: true, icraDairesi: true, cikarimJson: true },
  })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const tevzi = ((dosya.cikarimJson ?? {}) as TevziJson).tevzi
  const daire = p.data.daire || dosya.icraDairesi || tevzi?.birimAdi || null

  // Aynı daire + esas başka bir dosyada mı? (esas no tek başına kimlik değildir; daire ile birlikte)
  if (daire) {
    const cakisan = await prisma.rucuDosyasi.findFirst({
      where: { musteriId: k.musteriId, id: { not: dosya.id }, icraDosyaNo: esas, icraDairesi: { equals: daire, mode: 'insensitive' } },
      select: { hukukDosyaNo: true },
    })
    if (cakisan) return { ok: false, error: `Bu daire ve esas no başka bir dosyada kayıtlı (${cakisan.hukukDosyaNo ?? 'hukuk no yok'}).` }
  }

  await prisma.$transaction([
    prisma.rucuDosyasi.update({
      where: { id: dosya.id },
      data: {
        icraDosyaNo: esas,
        icraDairesi: daire,
        // yalnız ileri yön: tebliğ/itiraz/dava evresindeki dosyada esas no düzeltmek durumu geri çekmesin
        durum: ileriMi(dosya.durum, DosyaDurum.TAKIP_ACILDI) ? DosyaDurum.TAKIP_ACILDI : undefined,
      },
    }),
    prisma.aktivite.create({
      data: {
        dosyaId: dosya.id, kullaniciId: k.kullaniciId,
        eylem: `İcra esas no kaydedildi: ${daire ?? 'daire —'} ${esas}`,
        detayJson: { onceki: { daire: dosya.icraDairesi, esas: dosya.icraDosyaNo }, yeni: { daire, esas } },
      },
    }),
  ])

  const oz = sunucuOzellikleri()
  if (!oz.isKuyrugu) {
    yenile(dosya.id)
    return { ok: true, kuyrukKapali: true, bilgi: 'Esas no kaydedildi. Anlık çekme şu an kapalı; dosya eklentinin bir sonraki toplu turunda (en geç 30 dk) çekilir.' }
  }
  const is = await isOlustur({ musteriId: k.musteriId, dosyaId: dosya.id, tur: 'ICRA', hedef: { daire, esas, uyapDosyaId: tevzi?.uyapDosyaId ?? null }, isteyenId: k.kullaniciId })
  yenile(dosya.id)
  return { ok: true, isId: is.id, bilgi: is.yeni ? 'Esas no kaydedildi; UYAP\'tan çekme sıraya alındı.' : 'Esas no kaydedildi; bu dosya için çekme zaten sürüyor.' }
}

/** Kayıtlı esas no ile yeniden çek (öncelikli iş). */
export async function uyaptanCek(girdi: { dosyaId: string }): Promise<CekSonuc> {
  const p = z.object({ dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: k.musteriId }, select: { id: true, icraDosyaNo: true, icraDairesi: true, cikarimJson: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const esas = esasNoCoz(dosya.icraDosyaNo)
  if (!esas) return { ok: false, error: 'Önce icra esas no girin.' }
  if (!sunucuOzellikleri().isKuyrugu) return { ok: true, kuyrukKapali: true, bilgi: 'Anlık çekme şu an kapalı; dosya eklentinin bir sonraki toplu turunda çekilir.' }
  const tevzi = ((dosya.cikarimJson ?? {}) as TevziJson).tevzi
  const is = await isOlustur({ musteriId: k.musteriId, dosyaId: dosya.id, tur: 'ICRA', hedef: { daire: dosya.icraDairesi, esas, uyapDosyaId: tevzi?.uyapDosyaId ?? null }, isteyenId: k.kullaniciId })
  await prisma.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: k.kullaniciId, eylem: `UYAP'tan anlık çekme istendi: ${dosya.icraDairesi ?? ''} ${esas}`.trim(), detayJson: { isId: is.id } } })
  yenile(dosya.id)
  return { ok: true, isId: is.id, bilgi: is.yeni ? 'UYAP\'tan çekme sıraya alındı.' : 'Bu dosya için çekme zaten sürüyor.' }
}

/**
 * S28 · "UYAP'ta davayı ara": eklentiye DAVA_KESIF işi açar. Eklenti avukatın açık hukuk dosyalarını tarar; bu
 * icraya bağlı dava bulunursa dava bölümünde "Bu dava bizim, bağla" kartı çıkar. Dava no elle girilmez.
 */
export async function uyaptaDavaAra(girdi: { dosyaId: string }): Promise<CekSonuc> {
  const p = z.object({ dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: k.musteriId }, select: { id: true, icraDosyaNo: true, icraDairesi: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const esas = esasNoCoz(dosya.icraDosyaNo)
  if (!esas) return { ok: false, error: 'Önce icra esas no girin: dava, icra numarasıyla bulunur.' }
  const oz = sunucuOzellikleri()
  if (!oz.isKuyrugu || !oz.hukuk) return { ok: true, kuyrukKapali: true, bilgi: 'UYAP dava araması sunucuda kapalı; eklenti davaları günlük turda tarar.' }
  const is = await isOlustur({ musteriId: k.musteriId, dosyaId: dosya.id, tur: 'DAVA_KESIF', hedef: { daire: dosya.icraDairesi, esas }, isteyenId: k.kullaniciId })
  await prisma.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: k.kullaniciId, eylem: `UYAP'ta dava araması istendi: ${dosya.icraDairesi ?? ''} ${esas}`.trim(), detayJson: { isId: is.id } } })
  yenile(dosya.id)
  return { ok: true, isId: is.id, bilgi: is.yeni ? "UYAP'ta dava araması sıraya alındı." : 'Bu dosya için dava araması zaten sürüyor.' }
}

/** Canlı ilerleme paneli için son iş + bağlantı + takip talebi mutabakatı. Salt okur. */
export async function senkronIsDurumu(girdi: { dosyaId: string }): Promise<SenkronIsDurumuSonuc> {
  const p = z.object({ dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: k.musteriId }, select: { id: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const simdi = new Date()
  let [is, nabizlar] = await Promise.all([dosyaSonIsi(dosya.id, [k.musteriId]), sonNabizlar([k.musteriId])])
  // Tembel kapanış: sağlık cron'u seyrek çalışsa da takılı iş (5 dk hareketsiz / 24 sa üstlenilmemiş) ekranda
  // zamanında ZAMAN_ASIMI olur ve Sistem Olayları'na yazılır. Yalnız bu dosya ve bu müvekkil kapsamında.
  if (is && isTakiliMi(is, simdi)) {
    const r = await senkronIsZamanAsimi(simdi, { musteriIds: [k.musteriId], dosyaId: dosya.id })
    if (r.hareketsiz || r.ustlenilmeyen) is = await dosyaSonIsi(dosya.id, [k.musteriId])
  }
  const baglanti = baglantiDurumu(nabizlar, simdi)
  let mutabakat: Mutabakat | null = null
  if (is && is.tur === 'ICRA' && ['TAMAM', 'KISMI'].includes(is.durum)) {
    const uyapAsil = ((is.ozetJson ?? {}) as IsOzeti).uyapAsilAlacak ?? null
    if (uyapAsil != null) {
      const tt = await prisma.takipTalebi.findFirst({ where: { dosyaId: dosya.id, gecerli: true, silindiAt: null }, select: { asilAlacak: true } })
      mutabakat = takipMutabakati(tt ? Number(tt.asilAlacak) : null, uyapAsil)
    }
  }
  return { ok: true, is: is ? isGorunumu(is, simdi, baglanti) : null, baglanti, mutabakat, kuyrukAcik: sunucuOzellikleri().isKuyrugu }
}

export async function senkronIsIptalEt(girdi: { isId: string; dosyaId: string }): Promise<SenkronIslemSonuc> {
  const p = z.object({ isId: uuid, dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const is = await prisma.senkronIs.findFirst({ where: { id: p.data.isId, dosyaId: p.data.dosyaId, musteriId: k.musteriId }, select: { id: true } })
  if (!is) return { ok: false, error: 'İş bulunamadı.' }
  const ok = await isIptal(p.data.isId, [k.musteriId])
  if (!ok) return { ok: false, error: 'İş iptal edilemedi: eklenti işi almış ya da iş bitmiş.' }
  await prisma.aktivite.create({ data: { dosyaId: p.data.dosyaId, kullaniciId: k.kullaniciId, eylem: 'UYAP anlık çekme iptal edildi', detayJson: { isId: p.data.isId } } }).catch(() => null)
  yenile(p.data.dosyaId)
  return { ok: true, bilgi: 'İş iptal edildi.' }
}

export async function uyapBaglantiGetir(): Promise<{ ok: boolean; error?: string; baglanti?: Baglanti; kuyrukAcik?: boolean }> {
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  return { ok: true, baglanti: baglantiDurumu(await sonNabizlar([k.musteriId])), kuyrukAcik: sunucuOzellikleri().isKuyrugu }
}
