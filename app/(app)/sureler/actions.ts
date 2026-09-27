'use server'
/**
 * KonsRücü — Süre defteri işlemleri · app/(app)/sureler/actions.ts
 *
 * Kural (06 §2(i), 07 S24): sistem ÖNERİR (ihtiyatlı + durmalı gün), avukat ONAYLAR (onaylanan son gün).
 *  - Öneri ekleme ve tetik girişi: ADMIN, AVUKAT, AVUKAT_YRD.
 *  - Onay, ikinci teyit, kapatma, iptal, test hatırlatması: yalnız ADMIN ve AVUKAT.
 *  - GORUNTULEYEN ve pasif kullanıcı hiçbir şey yazamaz.
 * Kapsam: her sorgu aktif müvekkilin (musteriId) dosyası üzerinden. Hukuki kayıt silinmez; iptal bir durumdur.
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { hesapIziJsonu, hesapIziOku, sureOnerisiHesapla, yenidenOnayGerekirMi, type SureGirdisi, type Usul } from '@/lib/konsrucu/sure/hesap'
import { arabuluculukDurmalari } from '@/lib/konsrucu/sure/durma'
import { kapanisDogrula } from '@/lib/konsrucu/sure/kapanis'
import { epostaKipi } from '@/lib/konsrucu/sure/hatirlatma'
import { sureHatirlatmaMail } from '@/lib/konsrucu/sure/hatirlatma-mail'
import { gunNo, gunTR, isoGun, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'
import { SURE_TUR_KODLARI, TETIK_TURLERI, sureTuru, type TetikTuru } from '@/lib/konsrucu/sure/turler'
import { kalanGun } from '@/lib/konsrucu/format'

export type SureSonuc = { ok: true; id?: string; uyari?: string } | { ok: false; error: string }

const ONAY_ROLLERI: readonly string[] = ['ADMIN', 'AVUKAT']
const GIRIS_ROLLERI: readonly string[] = ['ADMIN', 'AVUKAT', 'AVUKAT_YRD']
const KAPALI: readonly string[] = ['KAPANDI', 'IPTAL']
const BASE = process.env.RAPOR_BASE_URL || 'https://konsrucu.vercel.app'

type Yetkili = { kullanici: { id: string; ad: string; eposta: string; rol: string }; musteriId: string }

async function yetki(roller: readonly string[], hata: string): Promise<{ ok: true; y: Yetkili } | { ok: false; error: string }> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || !roller.includes(dbUser.rol)) return { ok: false, error: hata }
  if (!aktifMusteriId) return { ok: false, error: 'Aktif müşteri bulunamadı.' }
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true } })
  if (!musteri) return { ok: false, error: 'Bu müşteri pasif olduğu için süre defterine yazılamaz.' }
  return { ok: true, y: { kullanici: { id: dbUser.id, ad: dbUser.ad, eposta: dbUser.eposta, rol: dbUser.rol }, musteriId: aktifMusteriId } }
}

const gunAlani = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı').refine((s) => isoGundenTarih(s) != null, 'Geçersiz tarih')
const gun = (s: string | null | undefined) => (s ? isoGundenTarih(s) : null)
const ileriMi = (d: Date | null, simdi: Date) => !!d && gunNo(d) > gunNo(simdi)

function yenile(dosyaId: string) {
  revalidatePath('/sureler')
  revalidatePath(`/akilli-giris/${dosyaId}`)
}

function hataMetni(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? 'Geçersiz girdi.'
  return (e as Error)?.message || 'Beklenmeyen hata.'
}

/** Dosyanın arabuluculuk kayıtlarından İİK 67 durma dönemleri (yalnız İİK 67'de kullanılır). */
async function iik67Durmalari(dosyaId: string) {
  const kayitlar = await prisma.arabuluculuk.findMany({
    where: { dosyaId, silindiAt: null, basvuruTarihi: { not: null } },
    select: { id: true, tur: true, basvuruTarihi: true, sonTutanakTarihi: true },
    orderBy: { basvuruTarihi: 'asc' },
  })
  return { kayitlar, durmalar: arabuluculukDurmalari(kayitlar) }
}

// ───────────────────────────── öneri ekle ─────────────────────────────

const OnerSema = z.object({
  dosyaId: z.string().uuid(),
  tur: z.enum(SURE_TUR_KODLARI),
  borcluId: z.string().uuid().nullish(),
  davaId: z.string().uuid().nullish(),
  tetikTarihi: gunAlani.nullish(),
  tetikTuru: z.enum(TETIK_TURLERI).nullish(),
  uetsUlasmaTarihi: gunAlani.nullish(),
  hakimSuresiGun: z.number().int().min(1).max(3650).nullish(),
  itirazTarihi: gunAlani.nullish(),
  eylemTarihi: gunAlani.nullish(),
  usul: z.enum(['YAZILI', 'BASIT']).nullish(),
  kesinSureIhtari: z.boolean().nullish(),
  kaynakAlinti: z.string().trim().max(2000).nullish(),
  kaynakBelgeId: z.string().uuid().nullish(),
  dayanak: z.string().trim().max(200).nullish(),
})
export type SureOnerGirdi = z.input<typeof OnerSema>

export async function sureOner(input: SureOnerGirdi): Promise<SureSonuc> {
  const yt = await yetki(GIRIS_ROLLERI, 'Süre önerisi ekleme yetkiniz yok.')
  if (!yt.ok) return yt
  const { kullanici, musteriId } = yt.y
  try {
    const g = OnerSema.parse(input)
    const simdi = new Date()
    const t = sureTuru(g.tur)
    const tarihler = { tetik: gun(g.tetikTarihi), uets: gun(g.uetsUlasmaTarihi), itiraz: gun(g.itirazTarihi), eylem: gun(g.eylemTarihi) }
    if (Object.values(tarihler).some((d) => ileriMi(d, simdi))) return { ok: false, error: 'Tetik, UETS, itiraz ve eylem tarihleri ileri bir gün olamaz.' }

    const dosya = await prisma.rucuDosyasi.findFirst({
      where: { id: g.dosyaId, musteriId },
      select: { id: true, borclular: { select: { id: true } } },
    })
    if (!dosya) return { ok: false, error: 'Dosya aktif müşteride bulunamadı veya erişiminiz yok.' }
    if (g.borcluId && !dosya.borclular.some((b) => b.id === g.borcluId)) return { ok: false, error: 'Seçilen borçlu bu dosyaya ait değil.' }
    if (t.borcluBazinda && !g.borcluId && dosya.borclular.length > 0) return { ok: false, error: `${t.etiket} borçlu bazında tutulur; borçluyu seçin.` }

    let usul: Usul | null = g.usul ?? null
    if (g.davaId) {
      const dava = await prisma.dava.findFirst({ where: { id: g.davaId, dosyaId: dosya.id, silindiAt: null }, select: { id: true, usul: true } })
      if (!dava) return { ok: false, error: 'Seçilen dava bu dosyaya ait değil.' }
      if (!usul && (dava.usul === 'YAZILI' || dava.usul === 'BASIT')) usul = dava.usul
    }
    if (g.kaynakBelgeId) {
      const b = await prisma.belge.findFirst({ where: { id: g.kaynakBelgeId, dosyaId: dosya.id }, select: { id: true } })
      if (!b) return { ok: false, error: 'Kaynak evrak bu dosyaya ait değil.' }
    }

    // Tekilleştirme (06 §3.6): aynı dosya + tür + borçlu için açık tek süre. Mahkemenin verdiği süreler (avans,
    // ara karar, diğer) birden çok olabilir.
    if (t.kural.tip !== 'HAKIM') {
      const var_ = await prisma.sure.findFirst({
        where: { dosyaId: dosya.id, tur: g.tur, borcluId: g.borcluId ?? null, silindiAt: null, durum: { notIn: [...KAPALI] } },
        select: { id: true },
      })
      if (var_) return { ok: false, error: `${t.etiket} bu dosyada${g.borcluId ? ' bu borçlu için' : ''} zaten açık. Tetik tarihini defterdeki satırdan güncelleyin.` }
    }

    const ab = g.tur === 'IIK67' ? await iik67Durmalari(dosya.id) : { kayitlar: [], durmalar: [] }
    const girdi: SureGirdisi = {
      tur: g.tur,
      tetikTarihi: tarihler.tetik,
      tetikTuru: (g.tetikTuru ?? null) as TetikTuru | null,
      uetsUlasmaTarihi: tarihler.uets,
      hakimSuresiGun: g.hakimSuresiGun ?? null,
      itirazTarihi: tarihler.itiraz,
      eylemTarihi: tarihler.eylem,
      usul,
      durmalar: ab.durmalar,
    }
    const oneri = sureOnerisiHesapla(girdi)
    const iz = hesapIziJsonu(girdi, oneri, simdi)

    const sure = await prisma.$transaction(async (tx) => {
      const s = await tx.sure.create({
        data: {
          dosyaId: dosya.id,
          borcluId: g.borcluId ?? null,
          davaId: g.davaId ?? null,
          arabuluculukId: ab.kayitlar[0]?.id ?? null,
          tur: g.tur,
          dayanak: g.tur === 'DIGER' && g.dayanak ? g.dayanak : t.dayanak,
          kaynakBelgeId: g.kaynakBelgeId ?? null,
          kaynakAlinti: g.kaynakAlinti || null,
          tetikTarihi: tarihler.tetik,
          tetikTuru: g.tetikTuru ?? null,
          uetsUlasmaTarihi: tarihler.uets ?? (g.tetikTuru === 'UETS_ULASMA' ? tarihler.tetik : null),
          hakimSuresiGun: g.hakimSuresiGun ?? null,
          kesinSureIhtari: g.kesinSureIhtari ?? null,
          durmaJson: oneri.durmalar.length ? (oneri.durmalar as unknown as Prisma.InputJsonValue) : undefined,
          onerilenIhtiyatli: oneri.onerilenIhtiyatli,
          onerilenSonGun: oneri.onerilenSonGun,
          hesapIziJson: iz as unknown as Prisma.InputJsonValue,
          durum: oneri.durum,
        },
        select: { id: true },
      })
      await tx.aktivite.create({
        data: {
          dosyaId: dosya.id,
          kullaniciId: kullanici.id,
          eylem: `Süre önerisi eklendi: ${t.etiket}${oneri.onerilenIhtiyatli ? ` · ihtiyatlı ${gunTR(oneri.onerilenIhtiyatli)}` : ' · tetik bekliyor'} (teyit gerekli)`,
          detayJson: { sureId: s.id, tur: g.tur },
        },
      })
      return s
    })
    yenile(dosya.id)
    return { ok: true, id: sure.id, uyari: oneri.eksik ?? (oneri.uyarilar[0] || undefined) }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

// ───────────────────────────── onay ─────────────────────────────

const OnaySema = z.object({
  sureId: z.string().uuid(),
  onaylananSonGun: gunAlani,
  bakilanEvrak: z.string().trim().min(3, 'Bakılan evrakı yazın (ör. "İtirazın tebliğ mazbatası, UETS").').max(500),
})

async function sureBul(sureId: string, musteriId: string) {
  return prisma.sure.findFirst({
    where: { id: sureId, silindiAt: null, dosya: { musteriId } },
    select: {
      id: true, dosyaId: true, tur: true, durum: true, borcluId: true, onaylananSonGun: true, onaylayanId: true, onayAt: true,
      onerilenSonGun: true, onerilenIhtiyatli: true, hesapIziJson: true, ikinciTeyitId: true,
      tetikTarihi: true, tetikTuru: true, uetsUlasmaTarihi: true, hakimSuresiGun: true,
    },
  })
}

export async function sureOnayla(input: z.input<typeof OnaySema>): Promise<SureSonuc> {
  const yt = await yetki(ONAY_ROLLERI, 'Son günü yalnız avukat onaylar.')
  if (!yt.ok) return yt
  const { kullanici, musteriId } = yt.y
  try {
    const g = OnaySema.parse(input)
    const s = await sureBul(g.sureId, musteriId)
    if (!s) return { ok: false, error: 'Süre bulunamadı veya erişiminiz yok.' }
    if (KAPALI.includes(s.durum)) return { ok: false, error: 'Kapanmış ya da iptal edilmiş süre onaylanamaz.' }
    const yeni = isoGundenTarih(g.onaylananSonGun) as Date
    const t = sureTuru(s.tur)
    const kiyas = s.onerilenSonGun ?? s.onerilenIhtiyatli
    const uyari = kiyas && gunNo(yeni) > gunNo(kiyas)
      ? `Onaylanan gün (${gunTR(yeni)}) önerilen günden (${gunTR(kiyas)}) sonra; kaynak evrakı yeniden kontrol edin.`
      : undefined

    const hi = hesapIziOku(s.hesapIziJson)
    const oncekiOnaylar = [...(hi?.oncekiOnaylar ?? []), ...(s.onaylananSonGun ? [{ sonGun: isoGun(s.onaylananSonGun), onaylayanId: s.onaylayanId, onayAt: s.onayAt?.toISOString() ?? null, sebep: 'Yeni onayla değişti' }] : [])]
    const r = await prisma.$transaction(async (tx) => {
      const u = await tx.sure.updateMany({
        where: { id: s.id, silindiAt: null, durum: { notIn: [...KAPALI] }, dosya: { musteriId } },
        data: {
          onaylananSonGun: yeni,
          onaylayanId: kullanici.id,
          onayAt: new Date(),
          bakilanEvrak: g.bakilanEvrak,
          ikinciTeyitId: null, // ikinci teyit eski güne aitti
          ikinciTeyitAt: null,
          ...(s.durum === 'TETIK_BEKLIYOR' ? { durum: 'ACIK' } : {}),
          ...(hi && oncekiOnaylar.length ? { hesapIziJson: { ...hi, oncekiOnaylar } as unknown as Prisma.InputJsonValue } : {}),
        },
      })
      if (u.count === 0) return u
      await tx.aktivite.create({
        data: {
          dosyaId: s.dosyaId,
          kullaniciId: kullanici.id,
          eylem: `Süre onaylandı: ${t.etiket} son gün ${gunTR(yeni)}${s.onaylananSonGun ? ` (önceki ${gunTR(s.onaylananSonGun)})` : ''}`,
          detayJson: { sureId: s.id, eski: s.onaylananSonGun ? isoGun(s.onaylananSonGun) : null, yeni: g.onaylananSonGun, bakilanEvrak: g.bakilanEvrak },
        },
      })
      return u
    })
    if (r.count === 0) return { ok: false, error: 'Süre bu arada değişti; sayfayı yenileyip yeniden deneyin.' }
    yenile(s.dosyaId)
    return { ok: true, id: s.id, uyari: t.kritik ? [uyari, 'Kritik süre: ekipten ikinci bir kişinin teyidi önerilir.'].filter(Boolean).join(' ') : uyari }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

export async function sureIkinciTeyit(input: { sureId: string }): Promise<SureSonuc> {
  const yt = await yetki(ONAY_ROLLERI, 'İkinci teyidi yalnız avukat verir.')
  if (!yt.ok) return yt
  const { kullanici, musteriId } = yt.y
  try {
    const { sureId } = z.object({ sureId: z.string().uuid() }).parse(input)
    const s = await sureBul(sureId, musteriId)
    if (!s) return { ok: false, error: 'Süre bulunamadı veya erişiminiz yok.' }
    if (!s.onaylananSonGun) return { ok: false, error: 'Önce onaylanan son gün girilmeli.' }
    if (s.onaylayanId === kullanici.id) return { ok: false, error: 'İkinci teyit, günü onaylayan kişiden başka biri tarafından verilmeli.' }
    const u = await prisma.sure.updateMany({
      where: { id: s.id, silindiAt: null, onaylananSonGun: s.onaylananSonGun, dosya: { musteriId } },
      data: { ikinciTeyitId: kullanici.id, ikinciTeyitAt: new Date() },
    })
    if (u.count === 0) return { ok: false, error: 'Onaylanan gün bu arada değişti; yeniden kontrol edin.' }
    await prisma.aktivite.create({
      data: { dosyaId: s.dosyaId, kullaniciId: kullanici.id, eylem: `Süreye ikinci teyit: ${sureTuru(s.tur).etiket} ${gunTR(s.onaylananSonGun)}`, detayJson: { sureId: s.id } },
    })
    yenile(s.dosyaId)
    return { ok: true, id: s.id }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

// ───────────────────────────── tetik güncelle ─────────────────────────────

const TetikSema = z.object({
  sureId: z.string().uuid(),
  tetikTarihi: gunAlani.nullish(),
  tetikTuru: z.enum(TETIK_TURLERI).nullish(),
  uetsUlasmaTarihi: gunAlani.nullish(),
  hakimSuresiGun: z.number().int().min(1).max(3650).nullish(),
  itirazTarihi: gunAlani.nullish(),
  eylemTarihi: gunAlani.nullish(),
  usul: z.enum(['YAZILI', 'BASIT']).nullish(),
})

/** Tetik (tebliğ vb.) girilince öneri yeniden hesaplanır; onaylanan gün değiştiyse yeniden onaya düşer. */
export async function sureTetikGuncelle(input: z.input<typeof TetikSema>): Promise<SureSonuc> {
  const yt = await yetki(GIRIS_ROLLERI, 'Süre güncelleme yetkiniz yok.')
  if (!yt.ok) return yt
  const { kullanici, musteriId } = yt.y
  try {
    const g = TetikSema.parse(input)
    const s = await sureBul(g.sureId, musteriId)
    if (!s) return { ok: false, error: 'Süre bulunamadı veya erişiminiz yok.' }
    if (KAPALI.includes(s.durum)) return { ok: false, error: 'Kapanmış ya da iptal edilmiş sürenin tetiği değiştirilemez.' }
    if (s.onaylananSonGun && !ONAY_ROLLERI.includes(kullanici.rol)) return { ok: false, error: 'Onaylanmış sürenin tetiğini yalnız avukat değiştirebilir.' }
    const simdi = new Date()
    const hi = hesapIziOku(s.hesapIziJson)
    const once = hi?.girdi
    const secim = <T,>(yeni: T | null | undefined, eski: T | null | undefined): T | null => (yeni !== undefined ? yeni ?? null : eski ?? null)
    const tetik = g.tetikTarihi !== undefined ? gun(g.tetikTarihi) : s.tetikTarihi
    const uets = g.uetsUlasmaTarihi !== undefined ? gun(g.uetsUlasmaTarihi) : s.uetsUlasmaTarihi
    const itiraz = g.itirazTarihi !== undefined ? gun(g.itirazTarihi) : gun(once?.itirazTarihi)
    const eylem = g.eylemTarihi !== undefined ? gun(g.eylemTarihi) : gun(once?.eylemTarihi)
    if ([tetik, uets, itiraz, eylem].some((d) => ileriMi(d ?? null, simdi))) return { ok: false, error: 'Tarihler ileri bir gün olamaz.' }
    const ab = s.tur === 'IIK67' ? await iik67Durmalari(s.dosyaId) : { kayitlar: [], durmalar: [] }
    const girdi: SureGirdisi = {
      tur: s.tur,
      tetikTarihi: tetik ?? null,
      tetikTuru: secim(g.tetikTuru, s.tetikTuru) as TetikTuru | null,
      uetsUlasmaTarihi: uets ?? null,
      hakimSuresiGun: secim(g.hakimSuresiGun, s.hakimSuresiGun),
      itirazTarihi: itiraz,
      eylemTarihi: eylem,
      usul: secim(g.usul, (once?.usul as Usul | null | undefined) ?? null),
      durmalar: ab.durmalar,
    }
    const oneri = sureOnerisiHesapla(girdi)
    const yenidenOnay = yenidenOnayGerekirMi(s, oneri)
    const iz = hesapIziJsonu(girdi, oneri, simdi)
    const oncekiOnaylar = [...(hi?.oncekiOnaylar ?? []), ...(yenidenOnay && s.onaylananSonGun ? [{ sonGun: isoGun(s.onaylananSonGun), onaylayanId: s.onaylayanId, onayAt: s.onayAt?.toISOString() ?? null, sebep: 'Tetik/durma değişti; yeniden onay' }] : [])]
    const t = sureTuru(s.tur)
    const u = await prisma.$transaction(async (tx) => {
      const r = await tx.sure.updateMany({
        where: { id: s.id, silindiAt: null, durum: { notIn: [...KAPALI] }, dosya: { musteriId } },
        data: {
          tetikTarihi: tetik ?? null,
          tetikTuru: girdi.tetikTuru,
          uetsUlasmaTarihi: uets ?? null,
          hakimSuresiGun: girdi.hakimSuresiGun,
          durmaJson: oneri.durmalar.length ? (oneri.durmalar as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          onerilenIhtiyatli: oneri.onerilenIhtiyatli,
          onerilenSonGun: oneri.onerilenSonGun,
          hesapIziJson: { ...iz, ...(oncekiOnaylar.length ? { oncekiOnaylar } : {}) } as unknown as Prisma.InputJsonValue,
          durum: s.onaylananSonGun && !yenidenOnay ? s.durum : oneri.durum,
          ...(yenidenOnay ? { onaylananSonGun: null, onaylayanId: null, onayAt: null, ikinciTeyitId: null, ikinciTeyitAt: null } : {}),
        },
      })
      if (r.count === 0) return r
      await tx.aktivite.create({
        data: {
          dosyaId: s.dosyaId,
          kullaniciId: kullanici.id,
          eylem: `Süre tetiği güncellendi: ${t.etiket}${oneri.onerilenIhtiyatli ? ` · ihtiyatlı ${gunTR(oneri.onerilenIhtiyatli)}` : ''}${yenidenOnay ? ' · onaylanan gün yeniden onay bekliyor' : ''}`,
          detayJson: { sureId: s.id, yenidenOnay },
        },
      })
      return r
    })
    if (u.count === 0) return { ok: false, error: 'Süre bu arada değişti; sayfayı yenileyip yeniden deneyin.' }
    yenile(s.dosyaId)
    return { ok: true, id: s.id, uyari: yenidenOnay ? 'Önerilen gün değişti; onaylanan son gün yeniden onay bekliyor. Hatırlatma ihtiyatlı güne göre gider.' : oneri.eksik ?? undefined }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

// ───────────────────────────── kapat / iptal ─────────────────────────────

const KapatSema = z.object({
  sureId: z.string().uuid(),
  kapanisKanitiBelgeId: z.string().uuid().nullish(),
  kapanisNot: z.string().trim().max(1000).nullish(),
})

export async function sureKapat(input: z.input<typeof KapatSema>): Promise<SureSonuc> {
  const yt = await yetki(ONAY_ROLLERI, 'Süreyi yalnız avukat kapatır.')
  if (!yt.ok) return yt
  const { kullanici, musteriId } = yt.y
  try {
    const g = KapatSema.parse(input)
    const k = kapanisDogrula({ kanitBelgeId: g.kapanisKanitiBelgeId, not: g.kapanisNot })
    if (!k.ok) return { ok: false, error: k.hata }
    const s = await sureBul(g.sureId, musteriId)
    if (!s) return { ok: false, error: 'Süre bulunamadı veya erişiminiz yok.' }
    if (KAPALI.includes(s.durum)) return { ok: false, error: 'Süre zaten kapalı.' }
    if (g.kapanisKanitiBelgeId) {
      const b = await prisma.belge.findFirst({ where: { id: g.kapanisKanitiBelgeId, dosyaId: s.dosyaId }, select: { id: true } })
      if (!b) return { ok: false, error: 'Kanıt evrakı bu dosyaya ait değil.' }
    }
    const u = await prisma.sure.updateMany({
      where: { id: s.id, silindiAt: null, durum: { notIn: [...KAPALI] }, dosya: { musteriId } },
      data: { durum: 'KAPANDI', kapanisKanitiBelgeId: g.kapanisKanitiBelgeId ?? null, kapanisNot: g.kapanisNot || null, kapatanId: kullanici.id, kapanisAt: new Date() },
    })
    if (u.count === 0) return { ok: false, error: 'Süre bu arada değişti; sayfayı yenileyin.' }
    await prisma.aktivite.create({
      data: { dosyaId: s.dosyaId, kullaniciId: kullanici.id, eylem: `Süre kapatıldı: ${sureTuru(s.tur).etiket}`, detayJson: { sureId: s.id, kanitBelgeId: g.kapanisKanitiBelgeId ?? null } },
    })
    yenile(s.dosyaId)
    return { ok: true, id: s.id }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

export async function sureIptalEt(input: { sureId: string; gerekce: string }): Promise<SureSonuc> {
  const yt = await yetki(ONAY_ROLLERI, 'Süreyi yalnız avukat iptal eder.')
  if (!yt.ok) return yt
  const { kullanici, musteriId } = yt.y
  try {
    const g = z.object({ sureId: z.string().uuid(), gerekce: z.string().trim().min(5, 'İptal gerekçesini yazın.').max(500) }).parse(input)
    const s = await sureBul(g.sureId, musteriId)
    if (!s) return { ok: false, error: 'Süre bulunamadı veya erişiminiz yok.' }
    if (KAPALI.includes(s.durum)) return { ok: false, error: 'Süre zaten kapalı.' }
    const u = await prisma.sure.updateMany({
      where: { id: s.id, silindiAt: null, durum: { notIn: [...KAPALI] }, dosya: { musteriId } },
      data: { durum: 'IPTAL', kapanisNot: `İptal: ${g.gerekce}`, kapatanId: kullanici.id, kapanisAt: new Date() },
    })
    if (u.count === 0) return { ok: false, error: 'Süre bu arada değişti; sayfayı yenileyin.' }
    await prisma.aktivite.create({
      data: { dosyaId: s.dosyaId, kullaniciId: kullanici.id, eylem: `Süre iptal edildi: ${sureTuru(s.tur).etiket} · ${g.gerekce}`, detayJson: { sureId: s.id } },
    })
    yenile(s.dosyaId)
    return { ok: true, id: s.id }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

// ───────────────────────────── test hatırlatması ─────────────────────────────

/**
 * Seçilen süre için test hatırlatmasını YALNIZ işlemi yapan avukatın e-postasına gönderir (kabul testi 3).
 * hatirlatmaJson'a yazılmaz (gerçek eşikleri etkilemez). console kipinde gönderilmez ve bunu açıkça söyler (B52).
 */
export async function sureTestHatirlatmasi(input: { sureId: string }): Promise<SureSonuc> {
  const yt = await yetki(ONAY_ROLLERI, 'Test hatırlatmasını yalnız avukat gönderir.')
  if (!yt.ok) return yt
  const { kullanici, musteriId } = yt.y
  try {
    const { sureId } = z.object({ sureId: z.string().uuid() }).parse(input)
    const s = await prisma.sure.findFirst({
      where: { id: sureId, silindiAt: null, dosya: { musteriId } },
      select: { id: true, tur: true, dayanak: true, dosyaId: true, onaylananSonGun: true, onerilenIhtiyatli: true, dosya: { select: { hukukDosyaNo: true, hasarDosyaNo: true, icraDosyaNo: true } } },
    })
    if (!s) return { ok: false, error: 'Süre bulunamadı veya erişiminiz yok.' }
    const hedef = s.onaylananSonGun ?? s.onerilenIhtiyatli
    if (!hedef) return { ok: false, error: 'Bu sürenin son günü yok (tetik bekliyor).' }
    const t = sureTuru(s.tur)
    const mail = sureHatirlatmaMail({
      aliciAd: kullanici.ad.split(/\s+/)[0] || 'Avukat',
      sure: { turEtiket: t.etiket, turAd: t.ad, dayanak: s.dayanak, hedefTarih: hedef, hedefKaynak: s.onaylananSonGun ? 'ONAYLANAN' : 'IHTIYATLI', kalanGun: kalanGun(hedef) },
      dosya: { dosyaNo: s.dosya.hukukDosyaNo ?? s.dosya.hasarDosyaNo ?? s.dosyaId.slice(0, 8), icraNo: s.dosya.icraDosyaNo },
      dosyaUrl: `${BASE}/akilli-giris/${s.dosyaId}`,
      test: true,
    })
    const kip = epostaKipi()
    if (!kip.gercek) {
      const { sistemOlayKaydet } = await import('@/lib/konsrucu/sistem-olay')
      await sistemOlayKaydet('MAIL_HATA', 'sure-test-hatirlatma', "E-posta kipi 'console': süre test hatırlatması gönderilmedi", { sureId: s.id })
      return { ok: true, id: s.id, uyari: "E-posta kipi 'console': e-posta GÖNDERİLMEDİ. Hatırlatmaların gitmesi için EMAIL_SERVICE ayarlanmalı." }
    }
    const { mailGonder } = await import('@/lib/konsrucu/mail')
    const r = await mailGonder({ to: kullanici.eposta, konu: mail.konu, html: mail.html, text: mail.text })
    if (!r.ok) return { ok: false, error: `Test e-postası gönderilemedi: ${r.error ?? 'bilinmeyen hata'}` }
    return { ok: true, id: s.id, uyari: `Test e-postası ${kullanici.eposta} adresine gönderildi.` }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}
