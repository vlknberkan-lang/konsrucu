'use server'

/**
 * KonsRücü — Tebliğ ve itiraz onay kartı eylemleri · app/(app)/dosya-islem/olay-actions.ts
 *
 * S23 (tebliğ ve itiraz onay kartları) ve S15 (aday olaylar): UYAP'tan gelen ADAY gelişme kartında
 * [Doğru] / [Düzelt] / [Yanlış — gerekçe yaz], onayın geri alınması, TB-07 "İtiraz kapsamı", TB-08 "Tarih gir" ve
 * "evraktan yeniden oku". Onaylar süre defterine İİK 62 / 67 ÖNERİSİ düşürür (onaylanan son gün yalnız avukattan, S24).
 *
 * Her eylem: oturum + AKTİF müvekkil kapsamı (dosya `musteriId = aktifMusteriId` ile bulunur; pasif müvekkilde
 * yazılmaz) + rol denetimi (lib/konsrucu/eksen/yetki) + zod doğrulaması; yazma tek Prisma işleminde (aday durumu,
 * BorcluTakip aynası, Aktivite); ardından gölge eksen yeniden hesaplanır ve revalidatePath.
 * Hukuki kayıt silinmez: ret REDDEDILDI yazar, geri alma önceki değeri geri koyar ve izi saklar.
 * Sistem önerir, avukat onaylar; kesinleşme gibi riski azaltan karar ikinci onay ister.
 */
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { sayiTR } from '@/lib/konsrucu/sayi'
import { adayGeriAl, adayOnayla, adayReddet, alacakliyaTebligElle, itirazKapsamGir } from '@/lib/konsrucu/eksen/aday-onay-db'
import type { OnayGirdisi } from '@/lib/konsrucu/eksen/aday-onay'
import { mazbataAdaylariniIsle } from '@/lib/konsrucu/eksen/mazbata-aday'
import { eksenYenidenHesapla } from '@/lib/konsrucu/eksen/kaydet'
import { isoGundenTarih } from '@/lib/konsrucu/eksen/norm'
import { ITIRAZ_TIPI, TEBLIG_SEKLI } from '@/lib/konsrucu/eksen/sabitler'
import { OLAY_YETKI_YOK, olayYetkisi, type OlayEylemi } from '@/lib/konsrucu/eksen/yetki'

export type OlayEylemSonucu = { ok: true; uyarilar?: string[]; bilgi?: string } | { ok: false; error: string }

const id = z.string().uuid()
const gun = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçersiz tarih biçimi.')
const bosNull = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional())

const KapsamSema = z.object({
  yetki: z.boolean().optional(), borc: z.boolean().optional(), faiz: z.boolean().optional(),
  feriler: z.boolean().optional(), imza: z.boolean().optional(),
})

const OnaySema = z.object({
  dosyaId: id,
  olayId: id,
  altTip: bosNull(z.enum(['TEBLIG_SONUCU', 'TEBLIG_IADE', 'ITIRAZ', 'DURDURMA_ITIRAZ', 'ITIRAZIN_ALACAKLIYA_TEBLIGI'])),
  borcluId: bosNull(id),
  borcluIdler: z.array(id).max(20).nullable().optional(),
  tarih: bosNull(gun),
  sonuc: bosNull(z.enum(['TEBLIG', 'IADE'])),
  tebligSekli: bosNull(z.enum(TEBLIG_SEKLI)),
  uetsUlasmaTarihi: bosNull(gun),
  itirazVerilisTarihi: bosNull(gun),
  itirazTipi: bosNull(z.enum(ITIRAZ_TIPI)),
  itirazKapsam: KapsamSema.nullable().optional(),
  itirazEdilenTutar: bosNull(z.union([z.number(), z.string().max(30)])),
  kesinlesmeOnay: z.boolean().optional(),
  ustuneYaz: z.boolean().optional(),
})
export type AdayOnayGirdisi = z.input<typeof OnaySema>

const GerekceSema = z.object({ dosyaId: id, olayId: id, gerekce: z.string().trim().min(5, 'Gerekçe en az 5 karakter olmalı').max(500) })
export type AdayGerekceGirdisi = z.input<typeof GerekceSema>

const KapsamGirSema = z.object({
  dosyaId: id,
  borcluId: id,
  itirazTipi: z.enum(ITIRAZ_TIPI),
  itirazKapsam: KapsamSema.nullable().optional(),
  itirazEdilenTutar: bosNull(z.union([z.number(), z.string().max(30)])),
  itirazVerilisTarihi: bosNull(gun),
  ustuneYaz: z.boolean().optional(),
  /** Ekranın gördüğü BorcluTakip.updatedAt (ISO) — iyimser kilit */
  surum: bosNull(z.string().datetime()),
})
export type ItirazKapsamGirdisi = z.input<typeof KapsamGirSema>

const TarihGirSema = z.object({ dosyaId: id, borcluId: bosNull(id), tarih: gun, tebligSekli: bosNull(z.enum(TEBLIG_SEKLI)), ustuneYaz: z.boolean().optional() })
export type AlacakliyaTebligGirdisi = z.input<typeof TarihGirSema>

function yenile(dosyaId: string) {
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath(`/dosya/${dosyaId}`)
  revalidatePath('/sureler') // onaylar süre defterine öneri düşürür
}

function ilkHata(e: z.ZodError): string {
  const m = e.issues[0]?.message
  return m && !/^Invalid|expected/i.test(m) ? m : 'Geçersiz istek: alanları kontrol edin.'
}

/** Oturum + aktif müvekkil + dosya kapsamı + rol. */
async function kapsam(dosyaId: string, eylem: OlayEylemi): Promise<{ hata: string } | { kullaniciId: string }> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!olayYetkisi(dbUser, eylem)) return { hata: OLAY_YETKI_YOK[eylem] }
  if (!aktifMusteriId) return { hata: 'Aktif müşteri bulunamadı.' }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId: aktifMusteriId }, select: { id: true, musteri: { select: { aktif: true } } } })
  if (!dosya) return { hata: 'Dosya bulunamadı veya erişiminiz yok.' }
  if (!dosya.musteri.aktif) return { hata: 'Bu müşteri pasif olduğu için değişiklik yapılamaz.' }
  return { kullaniciId: dbUser.id }
}

const tarihCevir = (s: string | null | undefined) => (s ? isoGundenTarih(s) : null)

function tutarCevir(v: number | string | null | undefined): number | null | 'HATA' {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : sayiTR(v)
  if (!Number.isFinite(n) || n <= 0 || n > 1e12) return 'HATA'
  return Math.round(n * 100) / 100
}

/** [Doğru] ve [Düzelt]: adayı (düzeltilmiş değerlerle) onayla; borçlu satırına aynala. Yalnız AVUKAT/ADMIN. */
export async function adayOnaylaEylem(input: AdayOnayGirdisi): Promise<OlayEylemSonucu> {
  const p = OnaySema.safeParse(input)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(p.data.dosyaId, 'ONAY')
  if ('hata' in k) return { ok: false, error: k.hata }
  const d = p.data
  const tutar = tutarCevir(d.itirazEdilenTutar)
  if (tutar === 'HATA') return { ok: false, error: 'İtiraz edilen tutar okunamadı (örnek: 1.234,56).' }
  for (const t of [d.tarih, d.uetsUlasmaTarihi, d.itirazVerilisTarihi]) {
    if (t && !isoGundenTarih(t)) return { ok: false, error: 'Geçersiz tarih.' }
  }
  const girdi: OnayGirdisi = {
    altTip: d.altTip ?? null, borcluId: d.borcluId ?? null, borcluIdler: d.borcluIdler ?? null,
    tarih: tarihCevir(d.tarih), sonuc: d.sonuc ?? null, tebligSekli: d.tebligSekli ?? null,
    uetsUlasmaTarihi: tarihCevir(d.uetsUlasmaTarihi), itirazVerilisTarihi: tarihCevir(d.itirazVerilisTarihi),
    itirazTipi: d.itirazTipi ?? null, itirazKapsam: d.itirazKapsam ?? null, itirazEdilenTutar: tutar,
    kesinlesmeOnay: d.kesinlesmeOnay === true, ustuneYaz: d.ustuneYaz === true,
  }
  const r = await adayOnayla({ dosyaId: d.dosyaId, olayId: d.olayId, kullaniciId: k.kullaniciId, girdi })
  if (!r.ok) return r
  yenile(d.dosyaId)
  return { ok: true, uyarilar: r.uyarilar }
}

/** [Yanlış — gerekçe yaz]: adayı reddet (silinmez). Yalnız AVUKAT/ADMIN: riski artıran sinyali kapatmak karardır. */
export async function adayReddetEylem(input: AdayGerekceGirdisi): Promise<OlayEylemSonucu> {
  const p = GerekceSema.safeParse(input)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(p.data.dosyaId, 'ONAY')
  if ('hata' in k) return { ok: false, error: k.hata }
  const r = await adayReddet({ ...p.data, kullaniciId: k.kullaniciId })
  if (!r.ok) return r
  yenile(p.data.dosyaId)
  return { ok: true }
}

/** Onayı ya da reddi geri al (yanlış onay "düzelt" ile geri çevrilir; iz DurumGecisi ve Aktivite'de). */
export async function adayGeriAlEylem(input: AdayGerekceGirdisi): Promise<OlayEylemSonucu> {
  const p = GerekceSema.safeParse(input)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(p.data.dosyaId, 'ONAY')
  if ('hata' in k) return { ok: false, error: k.hata }
  const r = await adayGeriAl({ ...p.data, kullaniciId: k.kullaniciId })
  if (!r.ok) return r
  yenile(p.data.dosyaId)
  return { ok: true }
}

/** TB-08 [Tarih gir]: itirazın size (alacaklı vekiline) tebliğ tarihi — İİK 67 başlangıcı. Avukat yardımcısı da girebilir. */
export async function alacakliyaTebligTarihiGirEylem(input: AlacakliyaTebligGirdisi): Promise<OlayEylemSonucu> {
  const p = TarihGirSema.safeParse(input)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const tarih = isoGundenTarih(p.data.tarih)
  if (!tarih) return { ok: false, error: 'Geçersiz tarih.' }
  const k = await kapsam(p.data.dosyaId, 'TARIH_GIR')
  if ('hata' in k) return { ok: false, error: k.hata }
  const r = await alacakliyaTebligElle({
    dosyaId: p.data.dosyaId, kullaniciId: k.kullaniciId,
    girdi: { borcluId: p.data.borcluId ?? null, tarih, tebligSekli: p.data.tebligSekli ?? null, ustuneYaz: p.data.ustuneYaz === true },
  })
  if (!r.ok) return r
  yenile(p.data.dosyaId)
  return { ok: true, uyarilar: r.uyarilar }
}

/** TB-07 [Kapsamı gir]: onaylı itirazın kapsamı (tam / kısmi, tutar, kalem kaşesi). Yalnız AVUKAT/ADMIN (karar). */
export async function itirazKapsamGirEylem(input: ItirazKapsamGirdisi): Promise<OlayEylemSonucu> {
  const p = KapsamGirSema.safeParse(input)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const k = await kapsam(p.data.dosyaId, 'ONAY')
  if ('hata' in k) return { ok: false, error: k.hata }
  const d = p.data
  const tutar = tutarCevir(d.itirazEdilenTutar)
  if (tutar === 'HATA') return { ok: false, error: 'İtiraz edilen tutar okunamadı (örnek: 1.234,56).' }
  const kase = tarihCevir(d.itirazVerilisTarihi)
  if (d.itirazVerilisTarihi && !kase) return { ok: false, error: 'Geçersiz tarih.' }
  const r = await itirazKapsamGir({
    dosyaId: d.dosyaId, borcluId: d.borcluId, kullaniciId: k.kullaniciId, surum: d.surum ? new Date(d.surum) : null,
    girdi: { itirazTipi: d.itirazTipi, itirazKapsam: d.itirazKapsam, itirazEdilenTutar: tutar, itirazVerilisTarihi: kase, ustuneYaz: d.ustuneYaz === true },
  })
  if (!r.ok) return r
  yenile(d.dosyaId)
  return { ok: true, uyarilar: r.uyarilar }
}

/** "Evraktan yeniden oku": okunmuş mazbatalardan adayları üret/zenginleştir, gölge ekseni yeniden hesapla. */
export async function mazbatalariOkuEylem(input: { dosyaId: string }): Promise<OlayEylemSonucu> {
  const p = z.object({ dosyaId: id }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Geçersiz istek.' }
  const k = await kapsam(p.data.dosyaId, 'OKU')
  if ('hata' in k) return { ok: false, error: k.hata }
  try {
    const r = await mazbataAdaylariniIsle(p.data.dosyaId)
    await eksenYenidenHesapla(p.data.dosyaId, { sebep: 'Mazbatalar yeniden okundu', kullaniciId: k.kullaniciId }).catch(() => null)
    yenile(p.data.dosyaId)
    return { ok: true, bilgi: r.yeni + r.zengin ? `${r.yeni} yeni gelişme, ${r.zengin} gelişme mazbatayla güncellendi.` : 'Okunmuş yeni mazbata bulunamadı.' }
  } catch (e) {
    return { ok: false, error: `Evrak okunamadı: ${(e as Error).message}` }
  }
}
