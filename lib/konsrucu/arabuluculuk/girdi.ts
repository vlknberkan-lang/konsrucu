/**
 * KonsRücü — arabuluculuk, yol seçimi ve onay kaydı girdi şemaları (zod) · lib/konsrucu/arabuluculuk/girdi.ts
 * Server action'lar ve testler aynı şemayı kullanır. Tarihler "yyyy-aa-gg"; boş dize = alan yok.
 */
import { z } from 'zod'
import { ARABULUCULUK_SONUCLARI, ARABULUCULUK_TURLERI, GEREKCE_ASGARI, ITIRAZ_SONRASI_YOLLAR, KARAR_SONRASI_YOLLAR, ONAY_SONUCLARI, ONAY_TURLERI } from './sabitler'

export const kimlik = z.string().uuid({ message: 'Geçersiz kimlik' })
/** İsteğe bağlı tarih: "" → undefined; biçim yyyy-aa-gg. */
export const istegeBagliTarih = z
  .string()
  .trim()
  .optional()
  .transform((s) => (s ? s : undefined))
  .refine((s) => s === undefined || /^\d{4}-\d{2}-\d{2}$/.test(s), { message: 'Tarih yyyy-aa-gg biçiminde olmalı' })
const kisaMetin = (n: number) => z.string().trim().max(n).optional().transform((s) => (s ? s : undefined))
/** Para: "1.234,56" ya da "1234.56" → number; boş → undefined. */
export const istegeBagliPara = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v, c) => {
    if (v === undefined || v === '') return undefined
    if (typeof v === 'number') return v
    const s = v.trim().replace(/\s|TL|₺/gi, '')
    const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, ''))
    if (!Number.isFinite(n) || n < 0 || n >= 1e12) {
      c.addIssue({ code: 'custom', message: 'Tutar geçersiz' })
      return z.NEVER
    }
    return Math.round(n * 100) / 100
  })

export const arabuluculukKayitGirdi = z.object({
  dosyaId: kimlik,
  arabuluculukId: kimlik.optional(),
  tur: z.enum(ARABULUCULUK_TURLERI).optional(), // varsayılan YOK
  turGerekce: kisaMetin(2000),
  basvuruTarihi: istegeBagliTarih,
  basvuruNo: kisaMetin(100),
  buroNo: kisaMetin(100),
  uyapDosyaNo: kisaMetin(100),
  arabulucu: kisaMetin(200),
  surecBaslangic: istegeBagliTarih,
  konuMetni: kisaMetin(4000),
})
export type ArabuluculukKayitGirdi = z.input<typeof arabuluculukKayitGirdi>

export const turSecimGirdi = z.object({
  arabuluculukId: kimlik,
  tur: z.enum(ARABULUCULUK_TURLERI, { message: 'Arabuluculuk türünü seçin' }),
  turGerekce: kisaMetin(2000),
})

export const toplantiGirdi = z.object({
  arabuluculukId: kimlik,
  baslar: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, { message: 'Toplantı tarihi geçersiz' }),
  yer: kisaMetin(200),
  online: z.boolean().optional(),
})

export const toplantiSonucGirdi = z.object({
  etkinlikId: kimlik,
  durum: z.enum(['YAPILDI', 'YAPILMADI', 'ERTELENDI', 'IPTAL']),
  sonucNot: kisaMetin(2000),
})

export const sonTutanakGirdi = z.object({
  arabuluculukId: kimlik,
  sonTutanakTarihi: z.string().trim(), // doğrulama son-tutanak.ts'te (varsayılan yok, ileri tarih yok)
  sonuc: z.enum(ARABULUCULUK_SONUCLARI, { message: 'Sonucu seçin' }),
  sonTutanakBelgeId: kimlik.optional(),
  katilmayanTaraf: kisaMetin(300),
  anlasilanKalemler: kisaMetin(2000),
  anlasilmayanKalemler: kisaMetin(2000),
  konuMetni: kisaMetin(4000),
})

export const yolSecimiGirdi = z.object({
  dosyaId: kimlik,
  asama: z.enum(['ITIRAZ_SONRASI', 'KARAR_SONRASI']),
  secim: z.enum([...ITIRAZ_SONRASI_YOLLAR, ...KARAR_SONRASI_YOLLAR] as [string, ...string[]]),
  davaId: kimlik.optional(),
  gerekce: kisaMetin(4000),
  ekonomi: z
    .object({ harc: kisaMetin(200), avans: kisaMetin(200), hacizSonucu: kisaMetin(300), malvarligi: kisaMetin(300) })
    .optional(),
})

export const onayKaydiGirdi = z.object({
  dosyaId: kimlik,
  tur: z.enum(ONAY_TURLERI),
  sonuc: z.enum(ONAY_SONUCLARI),
  istenmeTarihi: istegeBagliTarih,
  alinmaTarihi: istegeBagliTarih,
  onaylayanUnvan: kisaMetin(200),
  belgeId: kimlik.optional(),
  tutar: istegeBagliPara,
  yolSecimiId: kimlik.optional(),
  davaId: kimlik.optional(),
})

export const istisnaGirdi = z.object({
  dosyaId: kimlik,
  gerekce: z.string().trim().min(GEREKCE_ASGARI, { message: 'Yazılı gerekçe girin' }).max(4000),
})

export const iik67YenidenOnayGirdi = z.object({
  sureId: kimlik,
  sonGun: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Son gün yyyy-aa-gg biçiminde olmalı' }),
  bakilanEvrak: kisaMetin(500),
})
