'use server'

/**
 * KonsRücü — Takip talebi, faiz seçimi, kopilot ve Ray Excel'inin icra sütunları · server action'lar
 * app/(app)/dosya-islem/takip-talebi-actions.ts  (S21; 06 §2(c), §3.5; B04, B10, B26)
 *
 * Hepsi: oturum + aktif müvekkil (musteriId) kapsamı + rol kontrolü + zod doğrulama. Karar niteliğindeki
 * işler (faiz seçimi, hesap izi onayı, Excel önerisi onayı, "UYAP'ta takibi aç") YALNIZ AVUKAT ve YÖNETİCİ.
 *
 *   takipTalebiGetir      — ekran modeli: faiz seçimi, önizleme, hesap izi, kilit sebepleri. Salt okur.
 *   faizSeciminiKaydet    — faiz türü, oranı ve başlangıcı (VARSAYILAN YOK). Dondurulmuş kayıtta yeni sürüm.
 *   hesapIziniOnayla      — rücu tutarı hesap izi (dekont toplamı × rücu oranı) onayı; asıl alacak aynalanır.
 *   uyaptaTakibiAc        — kilit yoksa SenkronIs(KOPILOT): eklenti UYAP'ta Takip Aç panelini bu dosyayla açar.
 *                           UYAP'a hiçbir şey yazmaz; gönderim eklentide avukatın "Gönder" + onay kutusuyla kalır.
 *   rayExcelIcraOnizle    — Excel'i okur, #11–#18 önerilerini dosyalara eşler (kuru; yazmaz).
 *   rayExcelIcraIceAktar  — önerileri AlanDegeri(EXCEL, ONERI) olarak yazar; aynı öneri iki kez açılmaz.
 *   excelOnerileriGetir   — bir dosyanın Excel icra önerileri. Salt okur.
 *   excelOnerisiOnayla    — öneriyi onaylar ve hedef alana yazar (onaylı esas no → dosya /api/uyap/hedefler'e girer;
 *                           iş kuyruğu açıksa öncelikli SenkronIs(ICRA) da açılır).
 *   excelOnerisiReddet    — öneriyi reddeder (satır silinmez).
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DosyaDurum, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { ileriMi } from '@/lib/konsrucu/durum'
import { takipTalebiGorunumu, takipTalebiYaz, type HesapIziOnayi, type TakipTalebiGorunumu } from '@/lib/konsrucu/senkron/takip-talebi-db'
import { FAIZ_BASLANGIC_TURLERI, FAIZ_TURLERI, faizSecimiEksikleri, rucuHesapIzi } from '@/lib/konsrucu/senkron/takip-talebi'
import { ICRA_ALANLARI, ICRA_SUTUN_ALANI, degerAyni, rayExcelIcraCozumle } from '@/lib/konsrucu/senkron/ray-excel-icra'
import { dosyaSonIsi, isOlustur } from '@/lib/konsrucu/senkron/is-kuyrugu'
import { esasNoCoz, isGorunumu, type IsGorunumu } from '@/lib/konsrucu/senkron/is-saf'
import { sunucuOzellikleri } from '@/lib/konsrucu/senkron/ozellikler'

export type TakipIslemSonuc = { ok: boolean; error?: string; bilgi?: string }
export type TakipTalebiGetirSonuc = { ok: boolean; error?: string; gorunum?: TakipTalebiGorunumu; avukat?: boolean; kopilotIsi?: IsGorunumu | null; kuyrukAcik?: boolean }

export type ExcelOnizlemeSatiri = {
  excelSatir: number
  hukukDosyaNo: string
  dosyaId: string | null
  oneriler: { no: number; alan: string; etiket: string; deger: string | number; ham: string; mevcut: string | number | null; ayni: boolean }[]
  sorunlar: string[]
}
export type ExcelOnizlemeSonuc = {
  ok: boolean
  error?: string
  satirlar?: ExcelOnizlemeSatiri[]
  hatalar?: { satir: number; sebep: string }[]
  eslesenSutunlar?: number[]
  ozet?: { satir: number; dosyaBulunan: number; oneri: number; bulunamayan: string[] }
}
export type ExcelIceAktarSonuc = { ok: boolean; error?: string; acilan?: number; atlanan?: number; bulunamayan?: string[] }

export type ExcelOnerisi = {
  id: string
  alan: string
  etiket: string
  deger: string | number
  durum: string
  kaynak: string | null
  createdAt: string
  onayAt: string | null
}
export type ExcelOnerileriSonuc = { ok: boolean; error?: string; oneriler?: ExcelOnerisi[]; avukat?: boolean }

const AVUKAT_ROLLERI = ['AVUKAT', 'ADMIN'] as const
const avukatMi = (rol: string) => (AVUKAT_ROLLERI as readonly string[]).includes(rol)
const uuid = z.string().uuid('Geçersiz kimlik')
const EXCEL_BOYUT_SINIRI = 5 * 1024 * 1024

function ilkHata(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'Geçersiz girdi'
}

type Kapsam = { hata: string } | { hata: null; kullaniciId: string; kullaniciAd: string; rol: string; musteriId: string }

async function kapsam(yazma: boolean): Promise<Kapsam> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif) return { hata: 'Hesabınız pasif; işlem yapılamaz.' }
  if (yazma && dbUser.rol === 'GORUNTULEYEN') return { hata: 'Bu işlem için yetkiniz yok (görüntüleyen rolü).' }
  if (!aktifMusteriId) return { hata: 'Aktif müvekkil bulunamadı.' }
  return { hata: null, kullaniciId: dbUser.id, kullaniciAd: dbUser.ad, rol: dbUser.rol, musteriId: aktifMusteriId }
}

/** Karar işleri: yalnız avukat ve yönetici. */
async function avukatKapsami(): Promise<Kapsam> {
  const k = await kapsam(true)
  if (k.hata !== null) return k
  if (!avukatMi(k.rol)) return { hata: 'Bu karar yalnız avukat ya da yönetici tarafından verilebilir.' }
  return k
}

function yenile(dosyaId: string) {
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath(`/dosya/${dosyaId}`)
}

async function dosyaBul(dosyaId: string, musteriId: string) {
  return prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId },
    select: { id: true, durum: true, rucuTutari: true, asilAlacak: true, rucuOrani: true, kaynakJson: true, cikarimJson: true, icraDosyaNo: true, icraDairesi: true },
  })
}

// ─────────────────────────── takip talebi ───────────────────────────

export async function takipTalebiGetir(girdi: { dosyaId: string }): Promise<TakipTalebiGetirSonuc> {
  const p = z.object({ dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const gorunum = await takipTalebiGorunumu(p.data.dosyaId, k.musteriId)
  if (!gorunum) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const son = await dosyaSonIsi(p.data.dosyaId, [k.musteriId])
  const kopilotIsi = son && son.tur === 'KOPILOT' ? isGorunumu(son) : null
  return { ok: true, gorunum, avukat: avukatMi(k.rol), kopilotIsi, kuyrukAcik: sunucuOzellikleri().isKuyrugu }
}

const faizSema = z.object({
  dosyaId: uuid,
  faizTuru: z.enum(FAIZ_TURLERI, { message: 'Faiz türünü seçin' }),
  faizOraniMetni: z.string().trim().min(1, 'Faiz oranını seçin').max(60),
  faizBaslangicTuru: z.enum(FAIZ_BASLANGIC_TURLERI, { message: 'Faiz başlangıcını seçin' }),
  faizBaslangic: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı').nullish(),
})

/** Faiz türü, oranı ve başlangıcı — varsayılan yok; avukat seçer (teyit gerekli: tacir olup olmama, işin niteliği). */
export async function faizSeciminiKaydet(girdi: { dosyaId: string; faizTuru: string; faizOraniMetni: string; faizBaslangicTuru: string; faizBaslangic?: string | null }): Promise<TakipIslemSonuc> {
  const p = faizSema.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const eksik = faizSecimiEksikleri({ ...p.data, faizBaslangic: p.data.faizBaslangic ?? null })
  if (eksik.length) return { ok: false, error: eksik.join('; ') }
  const k = await avukatKapsami()
  if (k.hata !== null) return { ok: false, error: k.hata }
  const dosya = await dosyaBul(p.data.dosyaId, k.musteriId)
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const tek = p.data.faizBaslangicTuru === 'TEK_TARIH' && p.data.faizBaslangic ? new Date(`${p.data.faizBaslangic}T00:00:00.000Z`) : null
  const varsayilanAsil = dosya.rucuTutari != null ? Number(dosya.rucuTutari) : dosya.asilAlacak != null ? Number(dosya.asilAlacak) : 0
  const sonuc = await prisma.$transaction(async (tx) => {
    const r = await takipTalebiYaz(tx, dosya.id, {
      faizTuru: p.data.faizTuru, faizOraniMetni: p.data.faizOraniMetni, faizBaslangicTuru: p.data.faizBaslangicTuru, faizBaslangic: tek,
    }, varsayilanAsil)
    await tx.aktivite.create({
      data: {
        dosyaId: dosya.id, kullaniciId: k.kullaniciId,
        eylem: `Takip talebi faiz seçimi: ${p.data.faizTuru} · ${p.data.faizOraniMetni} · ${p.data.faizBaslangicTuru === 'TEK_TARIH' ? p.data.faizBaslangic : 'her ödeme tarihinden'}${r.islem === 'YENI_SURUM' ? ` (yeni sürüm ${r.surum})` : ''}`,
        detayJson: { takipTalebiId: r.id, surum: r.surum, islem: r.islem },
      },
    })
    return r
  })
  yenile(dosya.id)
  return { ok: true, bilgi: sonuc.islem === 'YENI_SURUM' ? `Takip talebi dondurulmuştu; düzeltme sürüm ${sonuc.surum} olarak kaydedildi.` : 'Faiz seçimi kaydedildi.' }
}

/** Rücu tutarı hesap izi onayı: dekont toplamı × rücu oranı → asıl alacak (eski kolon aynı işlemde aynalanır). */
export async function hesapIziniOnayla(girdi: { dosyaId: string }): Promise<TakipIslemSonuc> {
  const p = z.object({ dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await avukatKapsami()
  if (k.hata !== null) return { ok: false, error: k.hata }
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: p.data.dosyaId, musteriId: k.musteriId },
    select: { id: true, rucuOrani: true, rucuTutari: true, odemeler: { select: { tarih: true, tutar: true, haricMi: true } } },
  })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const iz = rucuHesapIzi({
    dekontlar: dosya.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi })),
    rucuOrani: dosya.rucuOrani,
    hugoRucuTutari: dosya.rucuTutari != null ? Number(dosya.rucuTutari) : null,
  })
  if (iz.durdu || iz.asilAlacak == null) return { ok: false, error: iz.durdu ?? 'Hesap yapılamadı.' }
  const onay: HesapIziOnayi = { kullaniciId: k.kullaniciId, kullaniciAd: k.kullaniciAd, at: new Date().toISOString(), asilAlacak: iz.asilAlacak }
  const asil = iz.asilAlacak
  await prisma.$transaction(async (tx) => {
    const r = await takipTalebiYaz(tx, dosya.id, { asilAlacak: asil, hesapIziJson: { ...iz, onay } as unknown as Prisma.InputJsonValue, onaylayanId: k.kullaniciId }, asil)
    // 06 §3.6: eski kolon onay anında aynı işlemde aynalanır (eski kod okumaya devam eder)
    await tx.rucuDosyasi.update({ where: { id: dosya.id }, data: { asilAlacak: new Prisma.Decimal(asil.toFixed(2)) } })
    await tx.aktivite.create({
      data: {
        dosyaId: dosya.id, kullaniciId: k.kullaniciId,
        eylem: `Rücu tutarı hesap izi onaylandı: asıl alacak ${asil.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL${iz.tutarli === false ? ' (Hugo tutarıyla fark var)' : ''}`,
        detayJson: { takipTalebiId: r.id, surum: r.surum, formul: iz.formulSurumu, fark: iz.fark },
      },
    })
  })
  yenile(dosya.id)
  return { ok: true, bilgi: iz.tutarli === false ? 'Hesap izi onaylandı. Dikkat: Hugo rücu tutarıyla fark var.' : 'Hesap izi onaylandı.' }
}

/** "UYAP'ta takibi aç": kilit yoksa kopilot işi açar. Eklenti paneli bu dosyayla açar; gönderim avukatta kalır. */
export async function uyaptaTakibiAc(girdi: { dosyaId: string }): Promise<TakipIslemSonuc & { isId?: string }> {
  const p = z.object({ dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await avukatKapsami()
  if (k.hata !== null) return { ok: false, error: k.hata }
  const g = await takipTalebiGorunumu(p.data.dosyaId, k.musteriId)
  if (!g) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  if (g.tevziEdildi) return { ok: false, error: 'Bu dosyada tevzi yapılmış; takip yeniden açılamaz. Esas no gelince "Kaydet ve UYAP\'tan çek" ile girin.' }
  if (g.kilitSebepleri.length) return { ok: false, error: `Takip açılamaz: ${g.kilitSebepleri.join('; ')}` }
  if (!g.kopilotDestekli) return { ok: false, error: 'Bu faiz seçimi kopilotla aktarılamıyor (UYAP kodu keşifle teyit edilmedi). Takibi UYAP\'ta elle açın; faiz türünü elle seçin.' }
  if (!sunucuOzellikleri().isKuyrugu) return { ok: false, error: 'Programdan açma şu an kapalı. UYAP sekmesinde KonsLaw panelinden "⚖ Takip Aç"a basın; dosya orada listelenir.' }
  const is = await isOlustur({ musteriId: k.musteriId, dosyaId: g.dosyaId, tur: 'KOPILOT', hedef: { takipTalebiId: g.takipTalebi?.id ?? null }, isteyenId: k.kullaniciId })
  await prisma.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: k.kullaniciId, eylem: 'UYAP\'ta takibi aç istendi (kopilot paneli)', detayJson: { isId: is.id } } })
  yenile(g.dosyaId)
  return { ok: true, isId: is.id, bilgi: 'UYAP sekmesinde KonsLaw paneli bu dosyayla açılacak. Özeti kontrol edip "Gönder"e siz basarsınız.' }
}

// ─────────────────────────── Ray Excel'i: icra sütunları (#11–#18) ───────────────────────────

async function excelOku(fd: FormData): Promise<{ hata: string } | { hata: null; buf: Uint8Array }> {
  const f = fd.get('file')
  if (!(f instanceof File)) return { hata: 'Excel dosyası seçilmedi.' }
  if (f.size > EXCEL_BOYUT_SINIRI) return { hata: 'Excel en çok 5 MB olabilir.' }
  if (!/\.(xlsx|xls)$/i.test(f.name)) return { hata: 'Yalnız .xlsx ya da .xls dosyası yükleyin.' }
  return { hata: null, buf: new Uint8Array(await f.arrayBuffer()) }
}

function mevcutDeger(alan: string, d: { icraDosyaNo: string | null; icraDairesi: string | null; kaynakJson: unknown; takipTarihi?: Date | null; islemYapanYrd?: string | null }, toplam: number | null): string | number | null {
  if (alan === 'icraDosyaNo') return d.icraDosyaNo
  if (alan === 'icraDairesi') return d.icraDairesi
  if (alan === 'takipTarihi') return d.takipTarihi ? d.takipTarihi.toISOString().slice(0, 10) : null
  if (alan === 'islemYapanYrd') return d.islemYapanYrd ?? null
  if (alan === 'takipTalebi.toplam') return toplam
  if (alan.startsWith('kaynakJson.')) {
    const v = ((d.kaynakJson ?? {}) as Record<string, unknown>)[alan.slice('kaynakJson.'.length)]
    return v == null ? null : String(v)
  }
  return null
}

/** Kuru önizleme: yazmaz. */
export async function rayExcelIcraOnizle(fd: FormData): Promise<ExcelOnizlemeSonuc> {
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const e = await excelOku(fd)
  if (e.hata !== null) return { ok: false, error: e.hata }
  const c = rayExcelIcraCozumle(e.buf)
  if (!c.satirlar.length && c.hatalar.length) return { ok: false, error: c.hatalar[0].sebep, hatalar: c.hatalar }
  const nolar = c.satirlar.map((s) => s.hukukDosyaNo)
  const dosyalar = nolar.length
    ? await prisma.rucuDosyasi.findMany({
        where: { musteriId: k.musteriId, hukukDosyaNo: { in: nolar } },
        select: {
          id: true, hukukDosyaNo: true, icraDosyaNo: true, icraDairesi: true, kaynakJson: true, takipTarihi: true, islemYapanYrd: true,
          takipTalepleri: { where: { gecerli: true, silindiAt: null }, take: 1, select: { toplam: true } },
        },
      })
    : []
  const harita = new Map(dosyalar.map((d) => [d.hukukDosyaNo as string, d]))
  const satirlar: ExcelOnizlemeSatiri[] = c.satirlar.map((s) => {
    const d = harita.get(s.hukukDosyaNo) ?? null
    const toplam = d?.takipTalepleri[0]?.toplam != null ? Number(d.takipTalepleri[0].toplam) : null
    return {
      excelSatir: s.excelSatir,
      hukukDosyaNo: s.hukukDosyaNo,
      dosyaId: d?.id ?? null,
      oneriler: s.oneriler.map((o) => {
        const mevcut = d ? mevcutDeger(o.alan, d, toplam) : null
        return { ...o, mevcut, ayni: mevcut != null && degerAyni(mevcut, o.deger) }
      }),
      sorunlar: s.sorunlar,
    }
  })
  const bulunamayan = satirlar.filter((s) => !s.dosyaId).map((s) => s.hukukDosyaNo)
  return {
    ok: true, satirlar, hatalar: c.hatalar, eslesenSutunlar: c.eslesenSutunlar,
    ozet: { satir: satirlar.length, dosyaBulunan: satirlar.length - bulunamayan.length, oneri: satirlar.reduce((t, s) => t + (s.dosyaId ? s.oneriler.filter((o) => !o.ayni).length : 0), 0), bulunamayan },
  }
}

/** Önerileri AlanDegeri(EXCEL, ONERI) olarak yazar. Mevcut değerle aynı olan ve zaten açık olan öneri atlanır. */
export async function rayExcelIcraIceAktar(fd: FormData): Promise<ExcelIceAktarSonuc> {
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const on = await rayExcelIcraOnizle(fd)
  if (!on.ok || !on.satirlar) return { ok: false, error: on.error ?? 'Excel okunamadı.' }
  let acilan = 0
  let atlanan = 0
  for (const s of on.satirlar) {
    if (!s.dosyaId) continue
    const acik = await prisma.alanDegeri.findMany({
      where: { dosyaId: s.dosyaId, alan: { in: ICRA_ALANLARI }, durum: { in: ['ONERI', 'ONAYLI'] }, silindiAt: null },
      select: { alan: true, degerJson: true, durum: true },
    })
    for (const o of s.oneriler) {
      if (o.ayni || acik.some((a) => a.alan === o.alan && degerAyni((a.degerJson as { deger?: unknown } | null)?.deger, o.deger))) { atlanan++; continue }
      await prisma.alanDegeri.create({
        data: {
          dosyaId: s.dosyaId, alan: o.alan, degerJson: { deger: o.deger, ham: o.ham, sutun: o.no } as Prisma.InputJsonValue,
          kaynakTuru: 'EXCEL', uretici: `ray-excel #${o.no} · satır ${s.excelSatir}`, durum: 'ONERI',
        },
      })
      acilan++
    }
  }
  if (acilan) {
    await prisma.aktivite.create({ data: { kullaniciId: k.kullaniciId, eylem: `Ray Excel'i içe aktarıldı (icra sütunları): ${acilan} öneri açıldı, ${atlanan} atlandı`, detayJson: { bulunamayan: on.ozet?.bulunamayan ?? [] } } })
  }
  for (const s of on.satirlar) if (s.dosyaId) yenile(s.dosyaId)
  return { ok: true, acilan, atlanan, bulunamayan: on.ozet?.bulunamayan ?? [] }
}

export async function excelOnerileriGetir(girdi: { dosyaId: string }): Promise<ExcelOnerileriSonuc> {
  const p = z.object({ dosyaId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(false)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: k.musteriId }, select: { id: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const rows = await prisma.alanDegeri.findMany({
    where: { dosyaId: dosya.id, kaynakTuru: 'EXCEL', alan: { in: ICRA_ALANLARI }, durum: { in: ['ONERI', 'ONAYLI'] }, silindiAt: null },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, alan: true, degerJson: true, durum: true, uretici: true, createdAt: true, onayAt: true },
  })
  const etiket = new Map(Object.values(ICRA_SUTUN_ALANI).map((x) => [x.alan, x.etiket]))
  return {
    ok: true,
    avukat: avukatMi(k.rol),
    oneriler: rows.map((r) => ({
      id: r.id, alan: r.alan, etiket: etiket.get(r.alan) ?? r.alan,
      deger: ((r.degerJson ?? {}) as { deger?: string | number }).deger ?? '',
      durum: r.durum, kaynak: r.uretici, createdAt: r.createdAt.toISOString(), onayAt: r.onayAt ? r.onayAt.toISOString() : null,
    })),
  }
}

/** Excel önerisini onayla ve hedef alana yaz (06 §3.5). */
export async function excelOnerisiOnayla(girdi: { alanDegeriId: string }): Promise<TakipIslemSonuc> {
  const p = z.object({ alanDegeriId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await avukatKapsami()
  if (k.hata !== null) return { ok: false, error: k.hata }
  const o = await prisma.alanDegeri.findFirst({
    where: { id: p.data.alanDegeriId, kaynakTuru: 'EXCEL', silindiAt: null, dosya: { musteriId: k.musteriId } },
    select: { id: true, dosyaId: true, alan: true, degerJson: true, durum: true },
  })
  if (!o) return { ok: false, error: 'Öneri bulunamadı.' }
  if (o.durum === 'ONAYLI') return { ok: true, bilgi: 'Bu öneri zaten onaylı.' }
  if (o.durum !== 'ONERI') return { ok: false, error: 'Bu öneri artık geçerli değil.' }
  if (!ICRA_ALANLARI.includes(o.alan)) return { ok: false, error: 'Bu alan bu ekrandan onaylanamaz.' }
  const deger = ((o.degerJson ?? {}) as { deger?: string | number }).deger
  if (deger == null || deger === '') return { ok: false, error: 'Önerinin değeri boş.' }
  const dosya = await dosyaBul(o.dosyaId, k.musteriId)
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.alanDegeri.updateMany({ where: { dosyaId: o.dosyaId, alan: o.alan, durum: 'ONAYLI', silindiAt: null }, data: { durum: 'ESKIDI' } })
      const r = await tx.alanDegeri.updateMany({ where: { id: o.id, durum: 'ONERI' }, data: { durum: 'ONAYLI', onaylayanId: k.kullaniciId, onayAt: new Date() } })
      if (r.count !== 1) throw new Error('AZ_ONCE')
      if (o.alan === 'icraDosyaNo') {
        await tx.rucuDosyasi.update({
          where: { id: o.dosyaId },
          data: { icraDosyaNo: String(deger), durum: ileriMi(dosya.durum, DosyaDurum.TAKIP_ACILDI) ? DosyaDurum.TAKIP_ACILDI : undefined },
        })
      } else if (o.alan === 'icraDairesi') {
        await tx.rucuDosyasi.update({ where: { id: o.dosyaId }, data: { icraDairesi: String(deger) } })
      } else if (o.alan === 'takipTarihi') {
        await tx.rucuDosyasi.update({ where: { id: o.dosyaId }, data: { takipTarihi: new Date(`${String(deger)}T00:00:00.000Z`) } })
      } else if (o.alan === 'islemYapanYrd') {
        await tx.rucuDosyasi.update({ where: { id: o.dosyaId }, data: { islemYapanYrd: String(deger) } })
      } else if (o.alan.startsWith('kaynakJson.')) {
        const anahtar = o.alan.slice('kaynakJson.'.length)
        const kj = (dosya.kaynakJson && typeof dosya.kaynakJson === 'object' ? dosya.kaynakJson : {}) as Record<string, unknown>
        await tx.rucuDosyasi.update({ where: { id: o.dosyaId }, data: { kaynakJson: { ...kj, [anahtar]: String(deger) } as Prisma.InputJsonValue } })
      } else if (o.alan === 'takipTalebi.toplam') {
        const varsayilanAsil = dosya.asilAlacak != null ? Number(dosya.asilAlacak) : dosya.rucuTutari != null ? Number(dosya.rucuTutari) : 0
        await takipTalebiYaz(tx, o.dosyaId, { toplam: Number(deger) }, varsayilanAsil)
      }
      await tx.aktivite.create({
        data: { dosyaId: o.dosyaId, kullaniciId: k.kullaniciId, eylem: `Excel önerisi onaylandı: ${o.alan} = ${String(deger)}`, detayJson: { alanDegeriId: o.id, kaynak: 'EXCEL' } },
      })
    })
  } catch (e) {
    if ((e as Error).message === 'AZ_ONCE' || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
      return { ok: false, error: 'Bu alan az önce başka bir sekmede onaylandı; sayfayı yenileyin.' }
    }
    return { ok: false, error: `Onaylanamadı: ${(e as Error).message}` }
  }
  // İcra no girildi → öncelikli anlık çekme (S22). Kuyruk kapalıysa dosya toplu turda çekilir (hedeflere girdi).
  let cekmeBilgi = ''
  if (o.alan === 'icraDosyaNo' && sunucuOzellikleri().isKuyrugu) {
    const esas = esasNoCoz(deger)
    if (esas) {
      const tevzi = ((dosya.cikarimJson ?? {}) as { tevzi?: { uyapDosyaId?: string | null; birimAdi?: string | null } }).tevzi
      const is = await isOlustur({
        musteriId: k.musteriId, dosyaId: o.dosyaId, tur: 'ICRA',
        hedef: { daire: dosya.icraDairesi ?? tevzi?.birimAdi ?? null, esas, uyapDosyaId: tevzi?.uyapDosyaId ?? null }, isteyenId: k.kullaniciId,
      })
      cekmeBilgi = is.yeni ? ' UYAP\'tan çekme sıraya alındı.' : ' Bu dosya için çekme zaten sürüyor.'
    }
  }
  yenile(o.dosyaId)
  return { ok: true, bilgi: o.alan === 'icraDosyaNo' ? `Esas no onaylandı; dosya UYAP senkron hedeflerine girdi.${cekmeBilgi}` : 'Öneri onaylandı.' }
}

export async function excelOnerisiReddet(girdi: { alanDegeriId: string }): Promise<TakipIslemSonuc> {
  const p = z.object({ alanDegeriId: uuid }).safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(true)
  if (k.hata !== null) return { ok: false, error: k.hata }
  const o = await prisma.alanDegeri.findFirst({ where: { id: p.data.alanDegeriId, kaynakTuru: 'EXCEL', durum: 'ONERI', silindiAt: null, dosya: { musteriId: k.musteriId } }, select: { id: true, dosyaId: true, alan: true } })
  if (!o) return { ok: false, error: 'Öneri bulunamadı ya da artık açık değil.' }
  await prisma.alanDegeri.update({ where: { id: o.id }, data: { durum: 'REDDEDILDI' } })
  await prisma.aktivite.create({ data: { dosyaId: o.dosyaId, kullaniciId: k.kullaniciId, eylem: `Excel önerisi reddedildi: ${o.alan}`, detayJson: { alanDegeriId: o.id } } })
  yenile(o.dosyaId)
  return { ok: true, bilgi: 'Öneri reddedildi.' }
}
