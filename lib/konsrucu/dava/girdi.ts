/**
 * KonsRücü — dava, karar, tahsilat ve kapanış girdi şemaları (zod) · lib/konsrucu/dava/girdi.ts
 * Server action'lar ve testler aynı şemayı kullanır. Tarih "yyyy-aa-gg"; boş dize = alan yok. Varsayılan değer
 * YOK: mahkeme türü, usul, hüküm avukattan gelir.
 */
import { z } from 'zod'
import { GEREKCE_ASGARI } from '../arabuluculuk/sabitler'
import { istegeBagliPara, istegeBagliTarih, kimlik } from '../arabuluculuk/girdi'
import { DAVA_ISLEM_TURLERI, DAVA_TURLERI, HUKUMLER, IH_ASAMALARI, IH_SONUCLARI, KAPANIS_SEBEPLERI, MAHKEME_TURLERI, USULLER, VEKALET_YON_DEGERLERI, YON_DEGERLERI } from './sabitler'

const kisaMetin = (n: number) => z.string().trim().max(n).optional().transform((s) => (s ? s : undefined))
const istegeBagliSaatliTarih = z
  .string()
  .trim()
  .optional()
  .transform((s) => (s ? s : undefined))
  .refine((s) => s === undefined || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s), { message: 'Tarih geçersiz' })

export const davaliGirdi = z.object({ borcluId: kimlik.optional(), adHam: kisaMetin(300) }).refine((x) => !!x.borcluId || !!x.adHam, { message: 'Davalı için borçlu seçin ya da ad girin' })

export const davaKayitGirdi = z.object({
  dosyaId: kimlik,
  davaId: kimlik.optional(),
  tur: z.enum(DAVA_TURLERI).optional(),
  rolumuz: z.enum(['DAVACI', 'DAVALI']).optional(),
  mahkemeTuru: z.enum(MAHKEME_TURLERI).optional(),
  mahkemeYer: kisaMetin(120),
  mahkemeNo: kisaMetin(10),
  esas: kisaMetin(40), // "2026/384"
  acilisTarihi: istegeBagliTarih,
  usul: z.enum(USULLER).optional(),
  davaDegeri: istegeBagliPara,
  davaDegeriKaynak: z.enum(['ITIRAZ_EDILEN', 'TAKIP_TALEBI', 'ELLE']).optional(),
  arabuluculukId: kimlik.optional(),
  ustDosyaNoHam: kisaMetin(120),
  uyapDosyaId: kisaMetin(120),
  sonrakiDurusma: istegeBagliSaatliTarih,
  onIncelemeTarihi: istegeBagliSaatliTarih,
  davalilar: z.array(davaliGirdi).max(20).optional(),
})
export type DavaKayitGirdi = z.input<typeof davaKayitGirdi>

export const davaHazirlikGirdi = z.object({ dosyaId: kimlik })

export const onKontrolSecimGirdi = z.object({
  davaId: kimlik,
  mahkemeTuru: z.enum(MAHKEME_TURLERI).optional(),
  usul: z.enum(USULLER).optional(),
  harcAvans: kisaMetin(300),
})

export const onKontrolGecisGirdi = z.object({
  dosyaId: kimlik,
  kod: z.string().trim().min(2).max(40),
  gerekce: z.string().trim().min(GEREKCE_ASGARI, { message: 'Yazılı gerekçe girin' }).max(2000),
})

export const davaIslemGirdi = z.object({
  davaId: kimlik,
  tur: z.enum(DAVA_ISLEM_TURLERI),
  tarih: istegeBagliTarih,
  tebligTarihi: istegeBagliTarih,
  referansNo: kisaMetin(120),
  ozet: kisaMetin(2000),
  kaynakBelgeId: kimlik.optional(),
})

export const ihtiyatiHacizGirdi = z.object({
  dosyaId: kimlik,
  id: kimlik.optional(),
  davaId: kimlik.optional(),
  asama: z.enum(IH_ASAMALARI),
  talepTarihi: istegeBagliTarih,
  sonuc: z.enum(IH_SONUCLARI),
  kararTarihi: istegeBagliTarih,
  kararTebligTarihi: istegeBagliTarih,
  teminatOrani: kisaMetin(40),
  teminatTutari: istegeBagliPara,
  teminatYatirildiAt: istegeBagliTarih,
  infazTalepTarihi: istegeBagliTarih,
})

export const iik67KapatGirdi = z.object({ sureId: kimlik, davaId: kimlik })

export const kararGirdi = z.object({
  davaId: kimlik,
  kararTarihi: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Karar tarihini girin' }),
  kararNo: kisaMetin(60),
  hukum: z.enum(HUKUMLER, { message: 'Hükmü seçin' }),
  kabulAsil: istegeBagliPara,
  kabulFaizBaslangic: istegeBagliTarih,
  inkarTazminati: istegeBagliPara,
  inkarTazminatiYon: z.enum(YON_DEGERLERI).optional(),
  yargilamaGideri: istegeBagliPara,
  yargilamaGideriAleyhe: istegeBagliPara,
  vekaletUcreti: istegeBagliPara,
  vekaletUcretiAleyhe: istegeBagliPara,
  vekaletUcretiYon: z.enum(VEKALET_YON_DEGERLERI).optional(),
  kararKaynakBelgeId: kimlik.optional(),
  kirmiziGerekce: kisaMetin(2000),
})

export const gerekceliTebligGirdi = z.object({ davaId: kimlik, tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tebliğ tarihini girin' }) })
export const kesinlesmeGirdi = z.object({ davaId: kimlik, tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), belgeId: kimlik.optional() })

export const tahsilatKararGirdi = z.object({ olayId: kimlik, karar: z.enum(['TEYITLI', 'REDDEDILDI']), not: kisaMetin(500) })

export const kapanisGirdi = z.object({ dosyaId: kimlik, sebep: z.enum(KAPANIS_SEBEPLERI), not: kisaMetin(1000) })

export const bildirimGirdi = z.object({
  dosyaId: kimlik,
  konu: z.enum(['ONAY_TALEBI', 'ISTISNA', 'ARABULUCULUK_SONUCU', 'KARAR', 'TAHSILAT']),
  refId: kimlik.optional(),
})

export const teyitGirdi = z.object({
  tablo: z.enum(['DAVA', 'ARABULUCULUK', 'DAVA_TARAF', 'DAVA_ISLEM', 'IHTIYATI_HACIZ']),
  id: kimlik,
  karar: z.enum(['TEYITLI', 'REDDEDILDI']),
})

export const excelOneriGirdi = z.object({ dosyaId: kimlik, islemSutunlari: z.array(z.union([z.literal(28), z.literal(29), z.literal(30)])).optional(), ihtiyatiHaciz: z.boolean().optional(), taraflar: z.boolean().optional() })
