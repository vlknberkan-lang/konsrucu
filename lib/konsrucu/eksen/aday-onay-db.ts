/**
 * KonsRücü — Aday onayı VERİTABANI işlemleri · lib/konsrucu/eksen/aday-onay-db.ts (server)
 *
 * aday-onay.ts'in saf planını TEK İŞLEMDE uygular:
 *   • iyimser kilit (aday): `updateMany … WHERE teyit = 'ADAY'` → 0 satır = "az önce işlendi" (iki sekme yarışı);
 *   • iyimser kilit (borçlu): mevcut BorcluTakip `updatedAt` değişmediyse yazılır, değiştiyse işlem geri sarılır;
 *   • M7: BorcluTakip.dosyaId = Borclu.dosyaId (borçlu yalnız bu dosyanın borçlularından seçilir);
 *   • iz: onayın önceki ve yazılan değerleri `TakipOlayi.hamJson.onayIzi`ne, özet `Aktivite`ye;
 *   • eksen: işlemden sonra gölge eksen yeniden hesaplanır (kaynak AVUKAT; DurumGecisi izi);
 *   • süre: işlemden sonra etkilenen borçlunun İİK 62 / 67 ÖNERİSİ süre defterinde açılır ya da güncellenir
 *     (sure-kopru.ts; S24 motoru). Köprü ayrı işlemdedir: hatası onayı geri sarmaz, uyarı olarak döner.
 * Hukuki kayıt silinmez: geri alma aday durumunu ve borçlu alanlarını ÖNCEKİ değere döndürür, ret REDDEDILDI yazar.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  elleAlacakliyaTebligAdayi, itirazKapsamPlani, izdenAlanlar, izeCevir, onayPlani, yazilanlaAyniMi,
  type BorcluTakipAlanlari, type KapsamGirdisi, type MevcutBorcluTakip, type OnayAday, type OnayGirdisi, type OnayIzi,
} from './aday-onay'
import { eksenYenidenHesapla } from './kaydet'
import { KURAL } from './sabitler'
import { kopruUygula } from './sure-kopru'

export type IslemSonucu = { ok: true; uyarilar: string[] } | { ok: false; error: string }

class IslemHatasi extends Error {}

const ADAY_SELECT = {
  id: true, dosyaId: true, altTip: true, teyit: true, borcluId: true, hukukiTarih: true, tarih: true, sonuc: true,
  tebligSekli: true, muhatap: true, kaynakBelgeId: true, kaynakTuru: true, kural: true, hamJson: true,
} as const

const BT_SELECT = {
  id: true, borcluId: true, updatedAt: true, tebligTarihi: true, tebligSekli: true, tebligSonucu: true, uetsUlasmaTarihi: true,
  tebligKaynakBelgeId: true, itirazVar: true, itirazVerilisTarihi: true, itirazUyapTarihi: true, itirazTipi: true,
  itirazKapsamJson: true, itirazEdilenTutar: true, itirazKaynakBelgeId: true, itirazAlacakliyaTebligTarihi: true,
  itirazAlacakliyaTebligKaynak: true,
} as const

type Tx = Prisma.TransactionClient

function mevcutCevir(r: Record<string, unknown>): MevcutBorcluTakip {
  const t = r.itirazEdilenTutar as { toNumber?: () => number } | number | null
  return {
    ...(r as unknown as MevcutBorcluTakip),
    itirazEdilenTutar: t == null ? null : typeof t === 'number' ? t : typeof t.toNumber === 'function' ? t.toNumber() : Number(t),
    itirazKapsamJson: (r.itirazKapsamJson as MevcutBorcluTakip['itirazKapsamJson']) ?? null,
  }
}

function yazimVerisi(a: Partial<BorcluTakipAlanlari>, kullaniciId: string): Prisma.BorcluTakipUncheckedUpdateInput {
  const { itirazKapsamJson, itirazEdilenTutar, ...geri } = a
  const d: Prisma.BorcluTakipUncheckedUpdateInput = { ...geri, guncelleyenId: kullaniciId }
  if (itirazKapsamJson !== undefined) d.itirazKapsamJson = itirazKapsamJson === null ? Prisma.DbNull : (itirazKapsamJson as Prisma.InputJsonValue)
  if (itirazEdilenTutar !== undefined) d.itirazEdilenTutar = itirazEdilenTutar === null ? null : new Prisma.Decimal(itirazEdilenTutar)
  return d
}

/** Borçlu satırına iyimser kilitle yazar; yoksa açar (borcluId tekil → eşzamanlı açılış P2002 ile geri sarılır). */
async function borcluTakipYaz(tx: Tx, p: { dosyaId: string; borcluId: string; mevcutId: string | null; beklenenGuncelleme: Date | null; alanlar: Partial<BorcluTakipAlanlari>; kullaniciId: string }) {
  const veri = yazimVerisi(p.alanlar, p.kullaniciId)
  if (p.mevcutId) {
    const g = await tx.borcluTakip.updateMany({
      where: { id: p.mevcutId, dosyaId: p.dosyaId, ...(p.beklenenGuncelleme ? { updatedAt: p.beklenenGuncelleme } : {}) },
      data: veri as Prisma.BorcluTakipUncheckedUpdateManyInput,
    })
    if (g.count === 0) throw new IslemHatasi('Borçlu kaydı bu arada değişti; sayfayı yenileyip tekrar deneyin.')
    return
  }
  await tx.borcluTakip.create({ data: { ...(veri as object), borcluId: p.borcluId, dosyaId: p.dosyaId } as Prisma.BorcluTakipUncheckedCreateInput })
}

async function onayCekirdegi(tx: Tx, p: { dosyaId: string; aday: OnayAday & { hamJson?: unknown }; girdi: OnayGirdisi; kullaniciId: string; bugun: Date; elle?: boolean }) {
  const [borclular, dosya] = await Promise.all([
    tx.borclu.findMany({ where: { dosyaId: p.dosyaId }, select: { id: true } }),
    tx.rucuDosyasi.findUnique({ where: { id: p.dosyaId }, select: { takipTarihi: true } }),
  ])
  const mevcutlar = (await tx.borcluTakip.findMany({ where: { dosyaId: p.dosyaId, silindiAt: null }, select: BT_SELECT })).map((r) => mevcutCevir(r as unknown as Record<string, unknown>))
  const plan = onayPlani({ aday: p.aday, girdi: p.girdi, borclular, mevcutlar, takipTarihi: dosya?.takipTarihi ?? null, bugun: p.bugun })
  if (!plan.ok) throw new IslemHatasi(plan.hata)

  const simdi = new Date()
  const iz: OnayIzi = {
    altTipOnceki: p.aday.altTip,
    borclular: plan.aynalar.map((a) => ({ borcluId: a.borcluId, mevcutId: a.mevcutId, onceki: izeCevir(a.onceki), yazilan: izeCevir(a.alanlar) })),
    kim: p.kullaniciId, at: simdi.toISOString(),
  }
  let olayId = p.aday.id
  if (p.elle) {
    const o = await tx.takipOlayi.create({
      data: {
        dosyaId: p.dosyaId, tip: 'DURUM', tarih: plan.olay.hukukiTarih, aciklama: 'İtirazın size tebliği (elle girildi)',
        altTip: plan.altTip, teyit: 'TEYITLI', kaynakTuru: 'ELLE', kural: KURAL.EL_ALACAKLIYA_TEBLIG, borcluId: plan.olay.borcluId,
        hukukiTarih: plan.olay.hukukiTarih, sonuc: plan.olay.sonuc, tebligSekli: plan.olay.tebligSekli, muhatap: plan.olay.muhatap,
        teyitEdenId: p.kullaniciId, teyitAt: simdi, hamJson: { kaynak: 'elle', onayIzi: iz } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    olayId = o.id
  } else {
    const ham = p.aday.hamJson && typeof p.aday.hamJson === 'object' && !Array.isArray(p.aday.hamJson) ? (p.aday.hamJson as Record<string, unknown>) : {}
    const g = await tx.takipOlayi.updateMany({
      where: { id: p.aday.id, dosyaId: p.dosyaId, teyit: 'ADAY' },
      data: {
        teyit: 'TEYITLI', teyitEdenId: p.kullaniciId, teyitAt: simdi, altTip: plan.altTip,
        hukukiTarih: plan.olay.hukukiTarih, sonuc: plan.olay.sonuc, tebligSekli: plan.olay.tebligSekli,
        borcluId: plan.olay.borcluId, muhatap: plan.olay.muhatap,
        hamJson: { ...ham, onayIzi: iz } as unknown as Prisma.InputJsonValue,
      },
    })
    if (g.count === 0) throw new IslemHatasi('Bu gelişme az önce onaylandı ya da değişti; sayfayı yenileyin.')
  }
  for (const a of plan.aynalar) {
    await borcluTakipYaz(tx, { dosyaId: p.dosyaId, borcluId: a.borcluId, mevcutId: a.mevcutId, beklenenGuncelleme: a.beklenenGuncelleme, alanlar: a.alanlar, kullaniciId: p.kullaniciId })
  }
  await tx.aktivite.create({
    data: {
      dosyaId: p.dosyaId, kullaniciId: p.kullaniciId, eylem: plan.aktivite,
      detayJson: { tur: 'ADAY_ONAY', olayId, altTip: plan.altTip, kural: p.aday.kural, uyarilar: plan.uyarilar, borclular: plan.aynalar.map((a) => a.borcluId) } as Prisma.InputJsonValue,
    },
  })
  return { olayId, uyarilar: plan.uyarilar, borcluIdler: plan.aynalar.map((a) => a.borcluId) }
}

function hataMetni(e: unknown): string {
  if (e instanceof IslemHatasi) return e.message
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'Aynı kayıt bu sırada başka bir oturumda açıldı; sayfayı yenileyin.'
  return `İşlem tamamlanamadı: ${(e as Error)?.message ?? 'bilinmeyen hata'}`
}

async function eksenGuncelle(dosyaId: string, olayId: string, kullaniciId: string, sebep: string) {
  try {
    await eksenYenidenHesapla(dosyaId, { kaynakTuru: 'AVUKAT', kaynakId: olayId, kullaniciId, sebep })
  } catch (e) {
    console.error('eksen yeniden hesap:', (e as Error).message) // onay geçerli kalır; eksen bir sonraki senkronda düzelir
  }
}

/** Etkilenen borçluların süre önerilerini eşitler (ayrı işlem; hata onayı bozmaz, uyarı döner). */
async function sureKoprusu(dosyaId: string, borcluIdler: string[], kullaniciId: string, olayId: string | null): Promise<string[]> {
  const out: string[] = []
  for (const borcluId of [...new Set(borcluIdler)]) {
    try {
      out.push(...(await prisma.$transaction((tx) => kopruUygula(tx, { dosyaId, borcluId, kullaniciId, olayId }))))
    } catch (e) {
      console.error('süre köprüsü:', (e as Error).message)
      out.push('Süre önerisi süre defterine yazılamadı: süreyi defterden elle ekleyin (teyit gerekli).')
    }
  }
  return out
}

/** Aday onayı (Doğru / Düzelt ile). Rol ve kapsam denetimi çağıran eylemdedir. */
export async function adayOnayla(p: { dosyaId: string; olayId: string; kullaniciId: string; girdi: OnayGirdisi; bugun?: Date }): Promise<IslemSonucu> {
  try {
    const r = await prisma.$transaction(async (tx) => {
      const aday = await tx.takipOlayi.findFirst({ where: { id: p.olayId, dosyaId: p.dosyaId }, select: ADAY_SELECT })
      if (!aday) throw new IslemHatasi('Gelişme bulunamadı.')
      return onayCekirdegi(tx, { dosyaId: p.dosyaId, aday, girdi: p.girdi, kullaniciId: p.kullaniciId, bugun: p.bugun ?? new Date() })
    })
    const sure = await sureKoprusu(p.dosyaId, r.borcluIdler, p.kullaniciId, r.olayId)
    await eksenGuncelle(p.dosyaId, r.olayId, p.kullaniciId, 'Aday onayı')
    return { ok: true, uyarilar: [...r.uyarilar, ...sure] }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

/** TB-08 "Tarih gir": aday olmadan itirazın alacaklıya tebliği (kaynak ELLE). */
export async function alacakliyaTebligElle(p: { dosyaId: string; kullaniciId: string; girdi: OnayGirdisi; bugun?: Date }): Promise<IslemSonucu> {
  try {
    const r = await prisma.$transaction((tx) =>
      onayCekirdegi(tx, { dosyaId: p.dosyaId, aday: elleAlacakliyaTebligAdayi(p.girdi.borcluId ?? null), girdi: p.girdi, kullaniciId: p.kullaniciId, bugun: p.bugun ?? new Date(), elle: true }))
    const sure = await sureKoprusu(p.dosyaId, r.borcluIdler, p.kullaniciId, r.olayId)
    await eksenGuncelle(p.dosyaId, r.olayId, p.kullaniciId, 'İtirazın size tebliği (elle)')
    return { ok: true, uyarilar: [...r.uyarilar, ...sure] }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

/** "Yanlış — gerekçe yaz": aday REDDEDILDI (silinmez); gerekçe Aktivite'de. */
export async function adayReddet(p: { dosyaId: string; olayId: string; kullaniciId: string; gerekce: string }): Promise<IslemSonucu> {
  try {
    await prisma.$transaction(async (tx) => {
      const aday = await tx.takipOlayi.findFirst({ where: { id: p.olayId, dosyaId: p.dosyaId }, select: { id: true, altTip: true, teyit: true, kural: true } })
      if (!aday) throw new IslemHatasi('Gelişme bulunamadı.')
      const g = await tx.takipOlayi.updateMany({ where: { id: p.olayId, dosyaId: p.dosyaId, teyit: 'ADAY' }, data: { teyit: 'REDDEDILDI', teyitEdenId: p.kullaniciId, teyitAt: new Date() } })
      if (g.count === 0) throw new IslemHatasi('Bu gelişme az önce işlendi; sayfayı yenileyin.')
      await tx.aktivite.create({
        data: {
          dosyaId: p.dosyaId, kullaniciId: p.kullaniciId, eylem: `UYAP gelişmesi yanlış bulundu: ${p.gerekce.slice(0, 300)}`,
          detayJson: { tur: 'ADAY_RET', olayId: p.olayId, altTip: aday.altTip, kural: aday.kural, gerekce: p.gerekce } as Prisma.InputJsonValue,
        },
      })
    })
    await eksenGuncelle(p.dosyaId, p.olayId, p.kullaniciId, 'Aday reddedildi')
    return { ok: true, uyarilar: [] }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

/**
 * Onayı ya da reddi geri al: aday tekrar ADAY olur; onayın borçlu satırına yazdığı alanlar ÖNCEKİ değerlerine döner.
 * Borçlu satırı onaydan sonra başka bir işlemle değiştiyse geri alma yapılmaz (iyimser kilit).
 */
export async function adayGeriAl(p: { dosyaId: string; olayId: string; kullaniciId: string; gerekce: string }): Promise<IslemSonucu> {
  try {
    const borcluIdler = await prisma.$transaction(async (tx) => {
      const olay = await tx.takipOlayi.findFirst({ where: { id: p.olayId, dosyaId: p.dosyaId }, select: { id: true, teyit: true, altTip: true, kaynakTuru: true, hamJson: true } })
      if (!olay) throw new IslemHatasi('Gelişme bulunamadı.')
      if (olay.teyit !== 'TEYITLI' && olay.teyit !== 'REDDEDILDI') throw new IslemHatasi('Bu gelişme zaten onay bekliyor.')
      const ham = olay.hamJson && typeof olay.hamJson === 'object' && !Array.isArray(olay.hamJson) ? { ...(olay.hamJson as Record<string, unknown>) } : {}
      const iz = ham.onayIzi as OnayIzi | undefined
      if (olay.teyit === 'TEYITLI' && iz?.borclular?.length) {
        for (const b of iz.borclular) {
          const mevcut = await tx.borcluTakip.findFirst({ where: { borcluId: b.borcluId, dosyaId: p.dosyaId }, select: BT_SELECT })
          if (!yazilanlaAyniMi(mevcut as unknown as Record<string, unknown> | null, b.yazilan)) {
            throw new IslemHatasi('Borçlu kaydı onaydan sonra değişti; geri alma yapılamadı. Değeri kartta düzeltin.')
          }
          const geri = yazimVerisi(izdenAlanlar(b.onceki), p.kullaniciId)
          const g = await tx.borcluTakip.updateMany({ where: { id: mevcut!.id, dosyaId: p.dosyaId, updatedAt: mevcut!.updatedAt }, data: geri as Prisma.BorcluTakipUncheckedUpdateManyInput })
          if (g.count === 0) throw new IslemHatasi('Borçlu kaydı bu arada değişti; sayfayı yenileyip tekrar deneyin.')
        }
      }
      const eskiTeyit = olay.teyit
      delete ham.onayIzi
      const yeniTeyit = olay.kaynakTuru === 'ELLE' ? 'REDDEDILDI' : 'ADAY' // elle girilen kayıt geri alınınca geçersiz sayılır (silinmez)
      const g = await tx.takipOlayi.updateMany({
        where: { id: p.olayId, dosyaId: p.dosyaId, teyit: eskiTeyit },
        data: {
          teyit: yeniTeyit, teyitEdenId: null, teyitAt: null,
          ...(iz?.altTipOnceki && olay.kaynakTuru !== 'ELLE' ? { altTip: iz.altTipOnceki } : {}),
          hamJson: { ...ham, geriAlma: { kim: p.kullaniciId, at: new Date().toISOString(), onceki: eskiTeyit, gerekce: p.gerekce.slice(0, 500) } } as Prisma.InputJsonValue,
        },
      })
      if (g.count === 0) throw new IslemHatasi('Bu gelişme bu arada değişti; sayfayı yenileyin.')
      await tx.aktivite.create({
        data: {
          dosyaId: p.dosyaId, kullaniciId: p.kullaniciId,
          eylem: `${eskiTeyit === 'TEYITLI' ? 'Onay' : 'Ret'} geri alındı: ${p.gerekce.slice(0, 300)}`,
          detayJson: { tur: 'ADAY_GERI_AL', olayId: p.olayId, onceki: eskiTeyit, gerekce: p.gerekce } as Prisma.InputJsonValue,
        },
      })
      return eskiTeyit === 'TEYITLI' ? (iz?.borclular ?? []).map((b) => b.borcluId) : []
    })
    const sure = await sureKoprusu(p.dosyaId, borcluIdler, p.kullaniciId, p.olayId)
    await eksenGuncelle(p.dosyaId, p.olayId, p.kullaniciId, 'Onay geri alındı')
    return { ok: true, uyarilar: sure }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}

/**
 * TB-07: onaylı itirazın kapsamı (tam / kısmi, itiraz edilenler, tutar, kalem kaşesi). Aday gerekmez; borçlu
 * satırına iyimser kilitle yazılır (`surum` = ekranın gördüğü BorcluTakip.updatedAt). Önceki ve yazılan değerler
 * Aktivite izinde kalır; kaşe değişirse İİK 67 önerisi güncellenir.
 */
export async function itirazKapsamGir(p: {
  dosyaId: string; borcluId: string; kullaniciId: string; girdi: KapsamGirdisi; surum?: Date | null; bugun?: Date
}): Promise<IslemSonucu> {
  try {
    const r = await prisma.$transaction(async (tx) => {
      const borclu = await tx.borclu.findFirst({ where: { id: p.borcluId, dosyaId: p.dosyaId }, select: { id: true } })
      if (!borclu) throw new IslemHatasi('Seçilen borçlu bu dosyaya ait değil.')
      const ham = await tx.borcluTakip.findFirst({ where: { borcluId: p.borcluId, dosyaId: p.dosyaId, silindiAt: null }, select: BT_SELECT })
      const mevcut = ham ? mevcutCevir(ham as unknown as Record<string, unknown>) : undefined
      if (mevcut && p.surum && mevcut.updatedAt.getTime() !== p.surum.getTime()) throw new IslemHatasi('Borçlu kaydı bu arada değişti; sayfayı yenileyip tekrar deneyin.')
      const plan = itirazKapsamPlani({ mevcut, girdi: p.girdi, bugun: p.bugun ?? new Date() })
      if (!plan.ok) throw new IslemHatasi(plan.hata)
      const g = await tx.borcluTakip.updateMany({
        where: { id: mevcut!.id, dosyaId: p.dosyaId, updatedAt: mevcut!.updatedAt },
        data: yazimVerisi(plan.alanlar, p.kullaniciId) as Prisma.BorcluTakipUncheckedUpdateManyInput,
      })
      if (g.count === 0) throw new IslemHatasi('Borçlu kaydı bu arada değişti; sayfayı yenileyip tekrar deneyin.')
      await tx.aktivite.create({
        data: {
          dosyaId: p.dosyaId, kullaniciId: p.kullaniciId, eylem: plan.aktivite,
          detayJson: { tur: 'ITIRAZ_KAPSAM', borcluId: p.borcluId, onceki: izeCevir(plan.onceki), yazilan: izeCevir(plan.alanlar), uyarilar: plan.uyarilar } as Prisma.InputJsonValue,
        },
      })
      return { uyarilar: plan.uyarilar, btId: mevcut!.id }
    })
    const sure = await sureKoprusu(p.dosyaId, [p.borcluId], p.kullaniciId, null)
    await eksenGuncelle(p.dosyaId, r.btId, p.kullaniciId, 'İtiraz kapsamı')
    return { ok: true, uyarilar: [...r.uyarilar, ...sure] }
  } catch (e) {
    return { ok: false, error: hataMetni(e) }
  }
}
