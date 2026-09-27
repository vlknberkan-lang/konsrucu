'use server'

/**
 * KonsRücü — S27 (dava kaydı, Excel dava sütunları, ihtiyati haciz, ön kontrol) ve S31 (karar, kanun yolu, tahsilat
 * onayı, kapanış) · server action'lar · app/(app)/dosya-islem/dava-actions.ts
 *
 * Her action: oturum + aktif müvekkil kapsamı + rol kapısı + zod + Aktivite + revalidatePath. Hukuki kayıtlar
 * silinmez (silindiAt). Alt kayıtlar (DavaTaraf, DavaIslem, IhtiyatiHaciz) dosyaId'yi DAİMA üst davadan alır (M7).
 * Dava açma kararı müvekkilindir: onay kaydı (ya da süre koruma istisnası) yokken ön kontrol ve hazırlık KİLİTLİ.
 * Elle dava kaydı (zaten açılmış davayı programa girmek) kilitli değildir: veri girişidir, "imzaya hazır" değildir.
 */
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { dosyaDurumIlerlet } from '@/lib/konsrucu/durum'
import { musteriOnayiKapisi, type OnayKaydiOzet } from '@/lib/konsrucu/arabuluculuk/onay'
import { gunNo, ileriTarihMi, isoGunCoz } from '@/lib/konsrucu/arabuluculuk/tarih'
import { avukatMi, yazabilir, YETKI_YOK_AVUKAT, YETKI_YOK_YAZMA } from '@/lib/konsrucu/arabuluculuk/yetki'
import { enErkenIhtiyatli } from '@/lib/konsrucu/arabuluculuk/veri'
import {
  davaHazirlikGirdi, davaIslemGirdi, davaKayitGirdi, excelOneriGirdi, gerekceliTebligGirdi, ihtiyatiHacizGirdi, iik67KapatGirdi,
  kapanisGirdi, kararGirdi, kesinlesmeGirdi, onKontrolGecisGirdi, onKontrolSecimGirdi, tahsilatKararGirdi, teyitGirdi, type DavaKayitGirdi,
} from '@/lib/konsrucu/dava/girdi'
import { altKayit, altKayitDosyaDenetle, asamaAynasi, esasCoz, esasMetni, kayitIsaretiOku, kayitIsaretiYaz } from '@/lib/konsrucu/dava/kayit'
import { iik67KapanisKontrol, kapanisNotu } from '@/lib/konsrucu/dava/iik67-kapanis'
import { ihtiyatiHacizDogrula } from '@/lib/konsrucu/dava/ihtiyati-haciz'
import { excelDavaOnerisi, kaynaktanRayDava } from '@/lib/konsrucu/dava/excel-dava'
import { kararKontrol, istinafSureOnerisi } from '@/lib/konsrucu/dava/karar'
import { tahsilatKararVerilebilirMi } from '@/lib/konsrucu/dava/tahsilat-onay'
import { kapanisOnayTuru } from '@/lib/konsrucu/dava/kapali-radar'

export type Sonuc<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }
type Baglam = { kullaniciId: string; musteriId: string; avukat: boolean }

async function baglam(opts: { avukat?: boolean } = {}): Promise<Baglam | { hata: string }> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!yazabilir(dbUser)) return { hata: YETKI_YOK_YAZMA }
  if (opts.avukat && !avukatMi(dbUser)) return { hata: YETKI_YOK_AVUKAT }
  if (!aktifMusteriId) return { hata: 'Aktif müvekkil seçili değil.' }
  return { kullaniciId: dbUser.id, musteriId: aktifMusteriId, avukat: avukatMi(dbUser) }
}

const ilkHata = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? 'Geçersiz girdi'
const dec = (v: number | undefined | null) => (v == null ? null : new Prisma.Decimal(v))
const gun = (s: string | undefined) => (s ? isoGunCoz(s) : null)

function yenile(dosyaId: string) {
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath('/davalar')
}

/** "yyyy-aa-gg[THH:MM]" TR saati → UTC anı (yalnız tarihse gün başı TR). */
function trAn(s: string | undefined): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
  if (!m) return null
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] != null ? +m[4] : 0) - 3, m[5] != null ? +m[5] : 0))
}

async function davaYukle(davaId: string, musteriId: string) {
  return prisma.dava.findFirst({ where: { id: davaId, silindiAt: null, dosya: { musteriId } }, include: { asama: { select: { id: true, detayJson: true } } } })
}

async function onayKapisiDosya(dosyaId: string) {
  const [onaylar, sureler] = await Promise.all([
    prisma.onayKaydi.findMany({ where: { dosyaId, silindiAt: null } }),
    prisma.sure.findMany({ where: { dosyaId, tur: 'IIK67', silindiAt: null }, select: { onerilenIhtiyatli: true, durum: true, silindiAt: true } }),
  ])
  const ozet: OnayKaydiOzet[] = onaylar.map((o) => ({ id: o.id, tur: o.tur, sonuc: o.sonuc, alinmaAt: o.alinmaAt, istisnaGerekce: o.istisnaGerekce, silindiAt: o.silindiAt }))
  return musteriOnayiKapisi('DAVA_ACMA', ozet, { ihtiyatliSonGun: enErkenIhtiyatli(sureler) })
}

/**
 * İİK 67 kayıtlarını dava açılışıyla karşılaştır: açılış ≤ onaylanan → Sure "KAPANMAYA_HAZIR" (kapanışı avukat yapar).
 * Açılış sonraysa hiçbir şey değişmez (DA-06b kırmızısı ekranda). Esas no tek başına kapatmaz.
 */
async function iik67Isaretle(tx: Prisma.TransactionClient, dosyaId: string, acilis: Date | null): Promise<{ hazir: number; sonra: number }> {
  if (!acilis) return { hazir: 0, sonra: 0 }
  const ss = await tx.sure.findMany({ where: { dosyaId, tur: 'IIK67', silindiAt: null, durum: 'ACIK' } })
  let hazir = 0, sonra = 0
  for (const s of ss) {
    const k = iik67KapanisKontrol({ acilisTarihi: acilis, onaylananSonGun: s.onaylananSonGun, onerilenIhtiyatli: s.onerilenIhtiyatli, sureDurumu: s.durum })
    if (k.durum === 'KAPANMAYA_HAZIR') {
      await tx.sure.update({ where: { id: s.id }, data: { durum: 'KAPANMAYA_HAZIR' } })
      hazir++
    } else if (k.durum === 'SONRA') sonra++
  }
  return { hazir, sonra }
}

// ─────────────────── dava kaydı (elle açma formu) ───────────────────

/**
 * Davayı ELLE aç ya da güncelle (mahkeme, esas no, açılış tarihi, taraflar …). Eklenti bulamazsa avukat girer.
 * Açılışta Asama(DAVA) ile BİRLİKTE açılır (varsa uzantısız aşama ya da HAZIRLIK davası kullanılır). Asama aynalanır.
 */
export async function davaKaydet(girdi: DavaKayitGirdi): Promise<Sonuc<{ davaId: string; iik67: { hazir: number; sonra: number } }>> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = davaKayitGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: g.dosyaId, musteriId: b.musteriId }, select: { id: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const esas = g.esas ? esasCoz(g.esas) : null
  if (g.esas && !esas) return { ok: false, error: 'Esas no "2026/384" biçiminde olmalı.' }
  const acilis = gun(g.acilisTarihi)
  if (g.acilisTarihi && !acilis) return { ok: false, error: 'Açılış tarihi geçersiz.' }
  if (acilis && ileriTarihMi(acilis)) return { ok: false, error: 'Açılış tarihi ileri bir gün olamaz.' }
  if (!g.davaId && !esas && !g.mahkemeTuru && !g.mahkemeYer) return { ok: false, error: 'Mahkeme ya da esas no girin.' }
  if (g.davalilar?.some((x) => x.borcluId)) {
    const ids = g.davalilar.map((x) => x.borcluId).filter((x): x is string => !!x)
    const say = await prisma.borclu.count({ where: { id: { in: ids }, dosyaId: g.dosyaId } })
    if (say !== new Set(ids).size) return { ok: false, error: 'Seçilen borçlulardan biri bu dosyaya ait değil.' }
  }
  if (g.arabuluculukId) {
    const a = await prisma.arabuluculuk.findFirst({ where: { id: g.arabuluculukId, dosyaId: g.dosyaId }, select: { id: true } })
    if (!a) return { ok: false, error: 'Arabuluculuk kaydı bu dosyaya ait değil.' }
  }
  const alanlar = {
    ...(g.tur ? { tur: g.tur } : {}),
    ...(g.rolumuz ? { rolumuz: g.rolumuz } : {}),
    ...(g.mahkemeTuru ? { mahkemeTuru: g.mahkemeTuru } : {}),
    ...(g.mahkemeYer !== undefined ? { mahkemeYer: g.mahkemeYer } : {}),
    ...(g.mahkemeNo !== undefined ? { mahkemeNo: g.mahkemeNo } : {}),
    ...(esas ? { esasYil: esas.yil, esasSira: esas.sira } : {}),
    ...(acilis ? { acilisTarihi: acilis } : {}),
    ...(g.usul ? { usul: g.usul } : {}),
    ...(g.davaDegeri != null ? { davaDegeri: dec(g.davaDegeri), davaDegeriKaynak: g.davaDegeriKaynak ?? 'ELLE' } : {}),
    ...(g.arabuluculukId ? { arabuluculukId: g.arabuluculukId } : {}),
    ...(g.ustDosyaNoHam !== undefined ? { ustDosyaNoHam: g.ustDosyaNoHam } : {}),
    ...(g.uyapDosyaId !== undefined ? { uyapDosyaId: g.uyapDosyaId } : {}),
    ...(g.sonrakiDurusma ? { sonrakiDurusma: trAn(g.sonrakiDurusma) } : {}),
    ...(g.onIncelemeTarihi ? { onIncelemeTarihi: trAn(g.onIncelemeTarihi) } : {}),
  }
  try {
    const sonuc = await prisma.$transaction(async (tx) => {
      let dava = g.davaId
        ? await tx.dava.findFirst({ where: { id: g.davaId, dosyaId: g.dosyaId, silindiAt: null } })
        : esas
          ? await tx.dava.findFirst({ where: { dosyaId: g.dosyaId, esasYil: esas.yil, esasSira: esas.sira, silindiAt: null } })
          : null
      if (g.davaId && !dava) throw new Error('Dava bulunamadı.')
      if (!dava) dava = await tx.dava.findFirst({ where: { dosyaId: g.dosyaId, durum: 'HAZIRLIK', silindiAt: null } })
      const yeni = !dava
      if (!dava) {
        const bos = await tx.asama.findFirst({ where: { dosyaId: g.dosyaId, tur: 'DAVA', dava: { is: null } }, orderBy: { createdAt: 'desc' }, select: { id: true } })
        let asamaId = bos?.id
        if (!asamaId) {
          const max = await tx.asama.aggregate({ where: { dosyaId: g.dosyaId }, _max: { sira: true } })
          asamaId = (await tx.asama.create({ data: { dosyaId: g.dosyaId, tur: 'DAVA', sira: (max._max.sira ?? 0) + 1, detayJson: { kaynakTuru: 'ELLE', teyit: 'TEYITLI', girenId: b.kullaniciId } } })).id
        }
        dava = await tx.dava.create({ data: { ...alanlar, asamaId, dosyaId: g.dosyaId, durum: acilis || esas ? 'DERDEST' : 'HAZIRLIK' } })
      } else {
        dava = await tx.dava.update({ where: { id: dava.id }, data: { ...alanlar, ...(dava.durum === 'HAZIRLIK' && (acilis || esas) ? { durum: 'DERDEST' } : {}) } })
      }
      await tx.asama.update({ where: { id: dava.asamaId }, data: asamaAynasi(dava) })
      // taraflar: müvekkil (davacı) satırı yalnız ilk açılışta; davalılar eklenir (mevcutlar tekrar açılmaz)
      if (yeni && (g.rolumuz ?? 'DAVACI') === 'DAVACI') {
        await tx.davaTaraf.create({ data: altKayit(dava, { rol: 'DAVACI', borcluId: null, adHam: null, kaynakTuru: 'ELLE', teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: new Date(), not: 'Müvekkil' }) })
      }
      for (const t of g.davalilar ?? []) {
        const var_ = await tx.davaTaraf.findFirst({ where: { davaId: dava.id, rol: 'DAVALI', silindiAt: null, ...(t.borcluId ? { borcluId: t.borcluId } : { adHam: t.adHam }) }, select: { id: true } })
        if (!var_) await tx.davaTaraf.create({ data: altKayit(dava, { rol: 'DAVALI', borcluId: t.borcluId ?? null, adHam: t.borcluId ? null : t.adHam ?? null, kaynakTuru: 'ELLE', teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: new Date() }) })
      }
      const iik = await iik67Isaretle(tx, g.dosyaId, dava.acilisTarihi)
      await tx.aktivite.create({
        data: { dosyaId: g.dosyaId, kullaniciId: b.kullaniciId, eylem: `Dava kaydı ${yeni ? 'açıldı' : 'güncellendi'} (elle)${esasMetni(dava.esasYil, dava.esasSira) ? ` · ${esasMetni(dava.esasYil, dava.esasSira)}` : ''}`, detayJson: { davaId: dava.id, iik67: iik } },
      })
      return { davaId: dava.id, durum: dava.durum, iik }
    })
    if (sonuc.durum === 'DERDEST') await dosyaDurumIlerlet(g.dosyaId, 'DAVA')
    yenile(g.dosyaId)
    return { ok: true, davaId: sonuc.davaId, iik67: sonuc.iik }
  } catch (e) {
    return { ok: false, error: `Kaydedilemedi: ${(e as Error).message}` }
  }
}

// ─────────────────── dava ön kontrolü ───────────────────

/** Dava hazırlığını başlat (ön kontrolün seçimleri bu HAZIRLIK davasına yazılır). Müvekkil onayı ya da istisna şart. */
export async function davaHazirligiBaslat(girdi: { dosyaId: string }): Promise<Sonuc<{ davaId: string }>> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = davaHazirlikGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: b.musteriId }, select: { id: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const kapi = await onayKapisiDosya(dosya.id)
  if (!kapi.acik) return { ok: false, error: `Dava ön kontrolü kilitli: ${kapi.mesaj}` }
  const id = await prisma.$transaction(async (tx) => {
    const var_ = await tx.dava.findFirst({ where: { dosyaId: dosya.id, durum: 'HAZIRLIK', silindiAt: null }, select: { id: true } })
    if (var_) return var_.id
    const max = await tx.asama.aggregate({ where: { dosyaId: dosya.id }, _max: { sira: true } })
    const asama = await tx.asama.create({ data: { dosyaId: dosya.id, tur: 'DAVA', sira: (max._max.sira ?? 0) + 1, ozet: 'Dava hazırlığı', detayJson: { kaynakTuru: 'ELLE', teyit: 'TEYITLI', girenId: b.kullaniciId } } })
    const d = await tx.dava.create({ data: { asamaId: asama.id, dosyaId: dosya.id, durum: 'HAZIRLIK', rolumuz: 'DAVACI' } })
    await tx.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: b.kullaniciId, eylem: `Dava hazırlığı başlatıldı (${kapi.neden === 'ISTISNA' ? 'süre koruma istisnası' : 'müvekkil onayı'})`, detayJson: { davaId: d.id } } })
    return d.id
  })
  yenile(dosya.id)
  return { ok: true, davaId: id }
}

/** Ön kontrolde avukat seçimleri: görevli mahkeme türü, usul, harç/avans (elle). Program mahkeme önermez. */
export async function onKontrolSecimKaydet(girdi: { davaId: string; mahkemeTuru?: string; usul?: string; harcAvans?: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = onKontrolSecimGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const d = await davaYukle(p.data.davaId, b.musteriId)
  if (!d) return { ok: false, error: 'Dava bulunamadı veya yetkiniz yok.' }
  const kapi = await onayKapisiDosya(d.dosyaId)
  if (!kapi.acik) return { ok: false, error: `Dava ön kontrolü kilitli: ${kapi.mesaj}` }
  const okj = d.onKontrolJson && typeof d.onKontrolJson === 'object' && !Array.isArray(d.onKontrolJson) ? { ...(d.onKontrolJson as Record<string, unknown>) } : {}
  if (p.data.harcAvans !== undefined) okj.harcAvans = p.data.harcAvans
  await prisma.$transaction([
    prisma.dava.update({ where: { id: d.id }, data: { ...(p.data.mahkemeTuru ? { mahkemeTuru: p.data.mahkemeTuru } : {}), ...(p.data.usul ? { usul: p.data.usul } : {}), onKontrolJson: okj as Prisma.InputJsonValue } }),
    prisma.aktivite.create({ data: { dosyaId: d.dosyaId, kullaniciId: b.kullaniciId, eylem: 'Dava ön kontrolü: avukat seçimi kaydedildi', detayJson: { davaId: d.id, mahkemeTuru: p.data.mahkemeTuru ?? null, usul: p.data.usul ?? null } } }),
  ])
  yenile(d.dosyaId)
  return { ok: true }
}

/** Geçilemeyen maddeler: müvekkil onayı (yalnız istisnayla) ve dava şartı arabuluculukta son tutanak yokluğu. */
const GECILEMEZ = new Set(['MUVEKKIL_ONAYI', 'CK-SARTLI-TUTANAK-YOK'])

/** Ön kontrol maddesini YAZILI GEREKÇEYLE geç (06 §8.4). Gerekçe Aktivite'ye ve Dava.onKontrolJson'a yazılır. */
export async function onKontrolMaddesiGec(girdi: { dosyaId: string; kod: string; gerekce: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = onKontrolGecisGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  if (GECILEMEZ.has(g.kod)) return { ok: false, error: 'Bu madde gerekçeyle geçilemez.' }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: g.dosyaId, musteriId: b.musteriId }, select: { id: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const kapi = await onayKapisiDosya(dosya.id)
  if (!kapi.acik) return { ok: false, error: `Dava ön kontrolü kilitli: ${kapi.mesaj}` }
  if (g.kod === 'SON_TUTANAK') {
    const a = await prisma.arabuluculuk.findFirst({ where: { dosyaId: dosya.id, silindiAt: null }, orderBy: { createdAt: 'desc' }, select: { tur: true, sonTutanakTarihi: true } })
    if (a?.tur === 'DAVA_SARTI' && !a.sonTutanakTarihi) return { ok: false, error: 'Dava şartı arabuluculukta son tutanak yokken bu madde geçilemez.' }
  }
  const gecis = { kod: g.kod, gerekce: g.gerekce, gecenId: b.kullaniciId, at: new Date().toISOString() }
  await prisma.$transaction(async (tx) => {
    const d = await tx.dava.findFirst({ where: { dosyaId: dosya.id, durum: 'HAZIRLIK', silindiAt: null } })
    if (d) {
      const okj = d.onKontrolJson && typeof d.onKontrolJson === 'object' && !Array.isArray(d.onKontrolJson) ? { ...(d.onKontrolJson as Record<string, unknown>) } : {}
      const liste = Array.isArray(okj.gecisler) ? [...(okj.gecisler as unknown[])] : []
      okj.gecisler = [...liste, gecis]
      await tx.dava.update({ where: { id: d.id }, data: { onKontrolJson: okj as Prisma.InputJsonValue } })
    }
    await tx.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: b.kullaniciId, eylem: `Dava ön kontrolü: "${g.kod}" maddesi gerekçeyle geçildi`, detayJson: { tur: 'ON_KONTROL_GECIS', ...gecis } } })
  })
  yenile(dosya.id)
  return { ok: true }
}

// ─────────────────── dava işlemleri ve ihtiyati haciz ───────────────────

export async function davaIslemEkle(girdi: { davaId: string; tur: string; tarih?: string; tebligTarihi?: string; referansNo?: string; ozet?: string; kaynakBelgeId?: string }): Promise<Sonuc<{ islemId: string }>> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = davaIslemGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  const d = await davaYukle(g.davaId, b.musteriId)
  if (!d) return { ok: false, error: 'Dava bulunamadı veya yetkiniz yok.' }
  const tarih = gun(g.tarih), teblig = gun(g.tebligTarihi)
  if ((tarih && ileriTarihMi(tarih)) || (teblig && ileriTarihMi(teblig))) return { ok: false, error: 'Tarih ileri bir gün olamaz.' }
  if (tarih && teblig && gunNo(teblig) < gunNo(tarih)) return { ok: false, error: 'Tebliğ tarihi işlem tarihinden önce olamaz.' }
  if (g.kaynakBelgeId) {
    const bel = await prisma.belge.findFirst({ where: { id: g.kaynakBelgeId, dosyaId: d.dosyaId }, select: { id: true } })
    if (!bel) return { ok: false, error: 'Belge bu dosyaya ait değil.' }
  }
  const i = await prisma.$transaction(async (tx) => {
    const k = await tx.davaIslem.create({
      data: altKayit(d, { tur: g.tur, tarih, tebligTarihi: teblig, referansNo: g.referansNo ?? null, ozet: g.ozet ?? null, kaynakBelgeId: g.kaynakBelgeId ?? null, kaynakTuru: 'ELLE', teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: new Date() }),
    })
    await tx.aktivite.create({ data: { dosyaId: d.dosyaId, kullaniciId: b.kullaniciId, eylem: `Dava işlemi eklendi: ${g.tur}`, detayJson: { davaId: d.id, islemId: k.id } } })
    return k
  })
  yenile(d.dosyaId)
  return { ok: true, islemId: i.id }
}

export async function ihtiyatiHacizKaydet(girdi: Record<string, unknown>): Promise<Sonuc<{ id: string; uyari: string | null }>> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = ihtiyatiHacizGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: g.dosyaId, musteriId: b.musteriId }, select: { id: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  let davaId: string | null = null
  if (g.davaId) {
    const d = await prisma.dava.findFirst({ where: { id: g.davaId, silindiAt: null }, select: { id: true, dosyaId: true } })
    if (!d) return { ok: false, error: 'Dava bulunamadı.' }
    try { altKayitDosyaDenetle(d, { dosyaId: dosya.id }) } catch (e) { return { ok: false, error: (e as Error).message } }
    davaId = d.id
  }
  const tarihler = { talepTarihi: gun(g.talepTarihi), kararTarihi: gun(g.kararTarihi), kararTebligTarihi: gun(g.kararTebligTarihi), teminatYatirildiAt: gun(g.teminatYatirildiAt), infazTalepTarihi: gun(g.infazTalepTarihi) }
  const hatalar = ihtiyatiHacizDogrula({ ...tarihler, sonuc: g.sonuc })
  if (hatalar.length) return { ok: false, error: hatalar[0] }
  const veri = { ...tarihler, asama: g.asama, sonuc: g.sonuc, davaId, teminatOrani: g.teminatOrani ?? null, teminatTutari: dec(g.teminatTutari) }
  const id = await prisma.$transaction(async (tx) => {
    let kayitId: string
    if (g.id) {
      const var_ = await tx.ihtiyatiHaciz.findFirst({ where: { id: g.id, dosyaId: dosya.id, silindiAt: null }, select: { id: true } })
      if (!var_) throw new Error('İhtiyati haciz kaydı bulunamadı.')
      kayitId = (await tx.ihtiyatiHaciz.update({ where: { id: var_.id }, data: { ...veri, teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: new Date() } })).id
    } else {
      kayitId = (await tx.ihtiyatiHaciz.create({ data: { ...veri, dosyaId: dosya.id, kaynakTuru: 'ELLE', teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: new Date() } })).id
    }
    await tx.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: b.kullaniciId, eylem: `İhtiyati haciz kaydı: ${g.sonuc}`, detayJson: { ihtiyatiHacizId: kayitId } } })
    return kayitId
  }).catch((e: Error) => e)
  if (id instanceof Error) return { ok: false, error: id.message }
  yenile(dosya.id)
  const uyari = g.sonuc === 'KABUL' || g.sonuc === 'KISMEN' ? 'İİK 261 ve 264 süreleri süre defterinde önerilecek (teyit gerekli).' : null
  return { ok: true, id, uyari }
}

// ─────────────────── İİK 67 kanıtla kapanış ───────────────────

/** DA-06a · İİK 67 kaydını kapat (kanıt: dava açılış tarihi ≤ onaylanan son gün). Yalnız avukat. */
export async function iik67Kapat(girdi: { sureId: string; davaId: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = iik67KapatGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const [s, d] = await Promise.all([
    prisma.sure.findFirst({ where: { id: p.data.sureId, tur: 'IIK67', silindiAt: null, dosya: { musteriId: b.musteriId } } }),
    davaYukle(p.data.davaId, b.musteriId),
  ])
  if (!s || !d || s.dosyaId !== d.dosyaId) return { ok: false, error: 'Süre ya da dava bulunamadı (aynı dosyada olmalı).' }
  const k = iik67KapanisKontrol({ acilisTarihi: d.acilisTarihi, onaylananSonGun: s.onaylananSonGun, onerilenIhtiyatli: s.onerilenIhtiyatli, sureDurumu: s.durum })
  if (k.durum !== 'KAPANMAYA_HAZIR') return { ok: false, error: k.mesaj }
  await prisma.$transaction([
    prisma.sure.update({ where: { id: s.id }, data: { durum: 'KAPANDI', davaId: d.id, kapanisNot: kapanisNotu(d.acilisTarihi as Date, esasMetni(d.esasYil, d.esasSira)), kapatanId: b.kullaniciId, kapanisAt: new Date() } }),
    prisma.aktivite.create({ data: { dosyaId: s.dosyaId, kullaniciId: b.kullaniciId, eylem: 'İİK 67 kaydı kapatıldı (kanıt: dava açılış tarihi)', detayJson: { sureId: s.id, davaId: d.id } } }),
  ])
  yenile(s.dosyaId)
  return { ok: true }
}

// ─────────────────── Ray Excel dava önerisi ───────────────────

/**
 * Ray takip Excel'inin #19–#30 önerisini onayla → Dava (+Asama), DavaTaraf, DavaIslem (#28–#30), IhtiyatiHaciz (#27).
 * Tekrar çalışırsa çift kayıt açmaz (aynı esas + tekilAnahtar). #19/#24 yazılmaz. Yalnız avukat.
 */
export async function excelDavaOnerisiUygula(girdi: { dosyaId: string; islemSutunlari?: (28 | 29 | 30)[]; ihtiyatiHaciz?: boolean; taraflar?: boolean }): Promise<Sonuc<{ davaId: string; eklenen: number }>> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = excelOneriGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: b.musteriId }, select: { id: true, kaynakJson: true, borclular: { select: { id: true, adUnvan: true } } } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const o = excelDavaOnerisi(kaynaktanRayDava(dosya.kaynakJson), dosya.borclular)
  if (o.bos) return { ok: false, error: 'Bu dosyada Excel dava önerisi yok.' }
  if (!o.dava.esasYil && !o.dava.mahkemeHam) return { ok: false, error: 'Excel\'de mahkeme ya da esas yok: davayı elle girin.' }
  const acilis = o.dava.acilisTarihi ? isoGunCoz(o.dava.acilisTarihi) : null
  const sutunlar = new Set(p.data.islemSutunlari ?? [28, 29, 30])
  const simdi = new Date()
  // #26 duruşma: tarih (+ varsa TR saati) → an. Saat yoksa gün başı TR.
  const [dsa, ddk] = (o.dava.sonrakiDurusma?.saat ?? '00:00').split(':').map(Number)
  const durusma = o.dava.sonrakiDurusma ? (() => { const x = isoGunCoz(o.dava.sonrakiDurusma!.tarih); return x ? new Date(x.getTime() + ((dsa - 3) * 60 + ddk) * 60_000) : null })() : null
  try {
    const r = await prisma.$transaction(async (tx) => {
      let eklenen = 0
      let dava = o.dava.esasYil ? await tx.dava.findFirst({ where: { dosyaId: dosya.id, esasYil: o.dava.esasYil, esasSira: o.dava.esasSira, silindiAt: null } }) : null
      if (!dava) {
        const max = await tx.asama.aggregate({ where: { dosyaId: dosya.id }, _max: { sira: true } })
        const asama = await tx.asama.create({ data: { dosyaId: dosya.id, tur: 'DAVA', sira: (max._max.sira ?? 0) + 1, detayJson: { kaynakTuru: 'EXCEL', teyit: 'TEYITLI', girenId: b.kullaniciId } } })
        dava = await tx.dava.create({
          data: {
            asamaId: asama.id, dosyaId: dosya.id, durum: 'DERDEST', rolumuz: 'DAVACI',
            mahkemeTuru: o.dava.mahkemeTuru, mahkemeYer: o.dava.mahkemeYer, mahkemeNo: o.dava.mahkemeNo,
            esasYil: o.dava.esasYil, esasSira: o.dava.esasSira, acilisTarihi: acilis, ustDosyaNoHam: o.dava.ustDosyaNoHam, sonrakiDurusma: durusma,
          },
        })
        await tx.asama.update({ where: { id: asama.id }, data: asamaAynasi(dava) })
        await tx.davaTaraf.create({ data: altKayit(dava, { rol: 'DAVACI', kaynakTuru: 'EXCEL', teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: simdi, not: 'Müvekkil' }) })
        eklenen++
      }
      if (p.data.taraflar !== false) {
        for (const t of o.taraflar) {
          const var_ = await tx.davaTaraf.findFirst({ where: { davaId: dava.id, rol: 'DAVALI', ...(t.borcluId ? { borcluId: t.borcluId } : { adHam: t.adHam }) }, select: { id: true } })
          if (var_) continue
          await tx.davaTaraf.create({ data: altKayit(dava, { rol: 'DAVALI', borcluId: t.borcluId, adHam: t.borcluId ? null : t.adHam, kaynakTuru: 'EXCEL', teyit: t.borcluId ? 'TEYITLI' : 'ADAY', ...(t.borcluId ? { teyitEdenId: b.kullaniciId, teyitAt: simdi } : {}) }) })
          eklenen++
        }
      }
      for (const i of o.islemler.filter((x) => sutunlar.has(x.sutun))) {
        const var_ = await tx.davaIslem.findFirst({ where: { dosyaId: dosya.id, tekilAnahtar: i.tekilAnahtar }, select: { id: true } })
        if (var_) continue
        await tx.davaIslem.create({
          data: altKayit(dava, {
            tur: i.tur, tarih: i.tarih ? isoGunCoz(i.tarih) : null, referansNo: i.referansNo, excelHam: i.excelHam, kaynakTuru: 'EXCEL', tekilAnahtar: i.tekilAnahtar,
            ozet: i.ayristirilamadi ? `Ray Excel #${i.sutun}: ayrıştırılamadı, elle tamamlayın` : `Ray Excel #${i.sutun}`,
            teyit: i.ayristirilamadi ? 'ADAY' : 'TEYITLI', ...(i.ayristirilamadi ? {} : { teyitEdenId: b.kullaniciId, teyitAt: simdi }),
          }),
        })
        eklenen++
      }
      if (o.ihtiyatiHaciz && p.data.ihtiyatiHaciz !== false) {
        const var_ = await tx.ihtiyatiHaciz.findFirst({ where: { davaId: dava.id, kaynakTuru: 'EXCEL' }, select: { id: true } })
        if (!var_) {
          await tx.ihtiyatiHaciz.create({
            data: {
              dosyaId: dava.dosyaId, davaId: dava.id, asama: 'DAVADA', sonuc: o.ihtiyatiHaciz.sonuc ?? 'BEKLIYOR', kararTarihi: o.ihtiyatiHaciz.kararTarihi ? isoGunCoz(o.ihtiyatiHaciz.kararTarihi) : null,
              teminatOrani: o.ihtiyatiHaciz.teminatOrani, excelHam: o.ihtiyatiHaciz.excelHam, kaynakTuru: 'EXCEL',
              teyit: o.ihtiyatiHaciz.ayristirilamadi ? 'ADAY' : 'TEYITLI', ...(o.ihtiyatiHaciz.ayristirilamadi ? {} : { teyitEdenId: b.kullaniciId, teyitAt: simdi }),
            },
          })
          eklenen++
        }
      }
      // #26 → Etkinlik(DURUSMA, kaynak = EXCEL) (06 §3.5). ADAY başlar: UYAP tarihiyle çelişirse ikisi yan yana görünür.
      if (durusma) {
        const var_ = await tx.etkinlik.findFirst({ where: { dosyaId: dosya.id, tur: 'DURUSMA', kaynak: 'EXCEL', baslar: durusma }, select: { id: true } })
        if (!var_) {
          await tx.etkinlik.create({ data: { dosyaId: dosya.id, asamaId: dava.asamaId, tur: 'DURUSMA', baslik: 'Duruşma (Ray Excel #26)', baslar: durusma, kaynak: 'EXCEL', teyit: 'ADAY' } })
          eklenen++
        }
      }
      const iik = await iik67Isaretle(tx, dosya.id, dava.acilisTarihi)
      await tx.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: b.kullaniciId, eylem: `Ray Excel dava önerisi onaylandı: ${eklenen} kayıt`, detayJson: { davaId: dava.id, uyarilar: o.uyarilar, karsilastirma: o.karsilastirma, iik67: iik } as Prisma.InputJsonValue } })
      return { davaId: dava.id, eklenen }
    })
    await dosyaDurumIlerlet(dosya.id, 'DAVA')
    yenile(dosya.id)
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, error: `Uygulanamadı: ${(e as Error).message}` }
  }
}

// ─────────────────── aday kayıt teyidi (geri doldurma, Excel, UYAP) ───────────────────

/** ADAY kaydı teyit et ya da reddet. Dava/Arabuluculuk reddi = silindiAt (hukuki kayıt silinmez). Yalnız avukat. */
export async function kayitTeyit(girdi: { tablo: string; id: string; karar: 'TEYITLI' | 'REDDEDILDI' }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = teyitGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const { tablo, id, karar } = p.data
  const simdi = new Date()
  const teyitVeri = { teyit: karar, teyitEdenId: b.kullaniciId, teyitAt: simdi, ...(karar === 'REDDEDILDI' ? { silindiAt: simdi } : {}) }
  let dosyaId: string | null = null
  if (tablo === 'DAVA_TARAF' || tablo === 'DAVA_ISLEM' || tablo === 'IHTIYATI_HACIZ') {
    const where = { id, dosya: { musteriId: b.musteriId } }
    const k = tablo === 'DAVA_TARAF' ? await prisma.davaTaraf.findFirst({ where, select: { dosyaId: true } })
      : tablo === 'DAVA_ISLEM' ? await prisma.davaIslem.findFirst({ where, select: { dosyaId: true } })
      : await prisma.ihtiyatiHaciz.findFirst({ where, select: { dosyaId: true } })
    if (!k) return { ok: false, error: 'Kayıt bulunamadı veya yetkiniz yok.' }
    dosyaId = k.dosyaId
    if (tablo === 'DAVA_TARAF') await prisma.davaTaraf.update({ where: { id }, data: teyitVeri })
    else if (tablo === 'DAVA_ISLEM') await prisma.davaIslem.update({ where: { id }, data: teyitVeri })
    else await prisma.ihtiyatiHaciz.update({ where: { id }, data: teyitVeri })
  } else {
    const k = tablo === 'DAVA'
      ? await prisma.dava.findFirst({ where: { id, dosya: { musteriId: b.musteriId } }, select: { dosyaId: true, asama: { select: { id: true, detayJson: true } } } })
      : await prisma.arabuluculuk.findFirst({ where: { id, dosya: { musteriId: b.musteriId } }, select: { dosyaId: true, asama: { select: { id: true, detayJson: true } } } })
    if (!k) return { ok: false, error: 'Kayıt bulunamadı veya yetkiniz yok.' }
    dosyaId = k.dosyaId
    const isaret = kayitIsaretiOku(k.asama.detayJson)
    await prisma.$transaction([
      prisma.asama.update({ where: { id: k.asama.id }, data: { detayJson: kayitIsaretiYaz(k.asama.detayJson, { kaynakTuru: isaret.kaynakTuru, teyit: karar, girenId: b.kullaniciId, at: simdi.toISOString() }) as Prisma.InputJsonValue } }),
      ...(karar === 'REDDEDILDI'
        ? [tablo === 'DAVA' ? prisma.dava.update({ where: { id }, data: { silindiAt: simdi } }) : prisma.arabuluculuk.update({ where: { id }, data: { silindiAt: simdi } })]
        : []),
    ])
  }
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: b.kullaniciId, eylem: `Aday kayıt ${karar === 'TEYITLI' ? 'teyit edildi' : 'reddedildi'}: ${tablo}`, detayJson: { tablo, id } } })
  yenile(dosyaId)
  return { ok: true }
}

// ─────────────────── S31 · karar, kanun yolu, kesinleşme ───────────────────

/**
 * Karar kartını ONAYLA (avukat). Kırmızı uyarı (talebe bağlılık) varsa yazılı gerekçe şart. Onayla: Dava karar
 * kolonları + DavaIslem(KARAR) + istinaf Sure (tebliğ yoksa TETIK_BEKLIYOR) + DurumGecisi (gölge) + Aktivite.
 */
export async function kararOnayla(girdi: Record<string, unknown>): Promise<Sonuc<{ uyarilar: string[] }>> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = kararGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  const d = await davaYukle(g.davaId, b.musteriId)
  if (!d) return { ok: false, error: 'Dava bulunamadı veya yetkiniz yok.' }
  const kararTarihi = isoGunCoz(g.kararTarihi)
  if (!kararTarihi) return { ok: false, error: 'Karar tarihi geçersiz.' }
  if (ileriTarihMi(kararTarihi)) return { ok: false, error: 'Karar tarihi ileri bir gün olamaz.' }
  if (d.acilisTarihi && gunNo(kararTarihi) < gunNo(d.acilisTarihi)) return { ok: false, error: 'Karar tarihi dava açılışından önce olamaz.' }
  const talep = await prisma.takipTalebi.findFirst({ where: { dosyaId: d.dosyaId, gecerli: true, silindiAt: null }, orderBy: { surum: 'desc' }, select: { toplam: true, asilAlacak: true } })
  const uyarilar = kararKontrol({
    hukum: g.hukum, kabulAsil: g.kabulAsil ?? null, davaDegeri: d.davaDegeri ? Number(d.davaDegeri) : null, takipToplam: talep ? Number(talep.toplam ?? talep.asilAlacak) : null,
    kararTarihi, vekaletUcretiAleyhe: g.vekaletUcretiAleyhe ?? null, yargilamaGideriAleyhe: g.yargilamaGideriAleyhe ?? null, vekaletUcretiYon: g.vekaletUcretiYon ?? null, inkarTazminatiYon: g.inkarTazminatiYon ?? null,
  })
  const kirmizi = uyarilar.filter((u) => u.seviye === 'KIRMIZI')
  if (kirmizi.some((u) => u.kod === 'KR-HUKUM' || u.kod === 'KR-TARIH')) return { ok: false, error: kirmizi[0].mesaj }
  if (kirmizi.length && (g.kirmiziGerekce ?? '').trim().length < 10) return { ok: false, error: `${kirmizi[0].mesaj} Onaylamak için yazılı gerekçe girin.` }
  const simdi = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.dava.update({
      where: { id: d.id },
      data: {
        kararTarihi, kararNo: g.kararNo ?? null, hukum: g.hukum, kabulAsil: dec(g.kabulAsil), kabulFaizBaslangic: gun(g.kabulFaizBaslangic),
        inkarTazminati: dec(g.inkarTazminati), inkarTazminatiYon: g.inkarTazminatiYon ?? null, yargilamaGideri: dec(g.yargilamaGideri), yargilamaGideriAleyhe: dec(g.yargilamaGideriAleyhe),
        vekaletUcreti: dec(g.vekaletUcreti), vekaletUcretiAleyhe: dec(g.vekaletUcretiAleyhe), vekaletUcretiYon: g.vekaletUcretiYon ?? null,
        kararKaynakBelgeId: g.kararKaynakBelgeId ?? null, kararOnaylayanId: b.kullaniciId, kararOnayAt: simdi, durum: 'KARAR',
      },
    })
    const tekil = `KARAR:${d.id}:${g.kararTarihi}`
    const var_ = await tx.davaIslem.findFirst({ where: { dosyaId: d.dosyaId, tekilAnahtar: tekil }, select: { id: true } })
    if (!var_) await tx.davaIslem.create({ data: altKayit(d, { tur: 'KARAR', tarih: kararTarihi, kaynakBelgeId: g.kararKaynakBelgeId ?? null, kaynakTuru: 'ELLE', teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: simdi, tekilAnahtar: tekil, ozet: `Hüküm: ${g.hukum}` }) })
    const istinaf = await tx.sure.findFirst({ where: { dosyaId: d.dosyaId, davaId: d.id, tur: 'HMK345', silindiAt: null } })
    if (!istinaf) {
      const oneri = d.gerekceliTebligTarihi ? istinafSureOnerisi(d.gerekceliTebligTarihi) : null
      await tx.sure.create({
        data: {
          dosyaId: d.dosyaId, davaId: d.id, tur: 'HMK345', dayanak: 'HMK 345 (teyit gerekli)',
          durum: oneri ? 'ACIK' : 'TETIK_BEKLIYOR', tetikTarihi: d.gerekceliTebligTarihi, tetikTuru: d.gerekceliTebligTarihi ? 'TEBLIG' : null,
          onerilenIhtiyatli: oneri?.onerilenIhtiyatli ?? null, hesapIziJson: (oneri?.hesapIzi ?? { not: 'gerekçeli karar tebliği bekleniyor' }) as Prisma.InputJsonValue,
        },
      })
    }
    await tx.durumGecisi.create({ data: { dosyaId: d.dosyaId, eksen: 'DAVA', eski: d.durum, yeni: 'KARAR', teyit: 'TEYITLI', sebep: 'Karar kartı avukat onayı', kaynakTuru: 'AVUKAT', kaynakId: d.id, kullaniciId: b.kullaniciId, golge: true } })
    await tx.aktivite.create({ data: { dosyaId: d.dosyaId, kullaniciId: b.kullaniciId, eylem: `Karar kartı onaylandı: ${g.hukum}`, detayJson: { davaId: d.id, uyarilar: uyarilar.map((u) => u.kod), kirmiziGerekce: g.kirmiziGerekce ?? null } } })
  })
  yenile(d.dosyaId)
  return { ok: true, uyarilar: uyarilar.map((u) => u.mesaj) }
}

/** SN-04 · gerekçeli karar tebliğ tarihi → istinaf süresi önerisi (ihtiyatlı; avukat onaylar). */
export async function gerekceliTebligKaydet(girdi: { davaId: string; tarih: string }): Promise<Sonuc> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = gerekceliTebligGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const d = await davaYukle(p.data.davaId, b.musteriId)
  if (!d) return { ok: false, error: 'Dava bulunamadı veya yetkiniz yok.' }
  const t = isoGunCoz(p.data.tarih)
  if (!t) return { ok: false, error: 'Tarih geçersiz.' }
  if (ileriTarihMi(t)) return { ok: false, error: 'Tebliğ tarihi ileri bir gün olamaz.' }
  if (d.kararTarihi && gunNo(t) < gunNo(d.kararTarihi)) return { ok: false, error: 'Tebliğ tarihi karar tarihinden önce olamaz.' }
  const oneri = istinafSureOnerisi(t)
  await prisma.$transaction(async (tx) => {
    await tx.dava.update({ where: { id: d.id }, data: { gerekceliTebligTarihi: t } })
    const s = await tx.sure.findFirst({ where: { dosyaId: d.dosyaId, davaId: d.id, tur: 'HMK345', silindiAt: null, durum: { in: ['TETIK_BEKLIYOR', 'ACIK'] } } })
    const veri = { tetikTarihi: t, tetikTuru: 'TEBLIG', onerilenIhtiyatli: oneri.onerilenIhtiyatli, durum: 'ACIK', hesapIziJson: oneri.hesapIzi as Prisma.InputJsonValue }
    if (s) await tx.sure.update({ where: { id: s.id }, data: { ...veri, onaylananSonGun: null, onaylayanId: null, onayAt: null } })
    else await tx.sure.create({ data: { ...veri, dosyaId: d.dosyaId, davaId: d.id, tur: 'HMK345', dayanak: oneri.dayanak } })
    await tx.aktivite.create({ data: { dosyaId: d.dosyaId, kullaniciId: b.kullaniciId, eylem: `Gerekçeli karar tebliğ tarihi girildi: ${p.data.tarih}`, detayJson: { davaId: d.id } } })
  })
  yenile(d.dosyaId)
  return { ok: true }
}

/** Kesinleşme (şerhle). Şerh/tarih olmadan dava "kesinleşti" gösterilmez. Yalnız avukat. */
export async function kesinlesmeKaydet(girdi: { davaId: string; tarih: string; belgeId?: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = kesinlesmeGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const d = await davaYukle(p.data.davaId, b.musteriId)
  if (!d) return { ok: false, error: 'Dava bulunamadı veya yetkiniz yok.' }
  if (!d.kararOnayAt) return { ok: false, error: 'Önce karar kartını onaylayın.' }
  const t = isoGunCoz(p.data.tarih)
  if (!t || ileriTarihMi(t)) return { ok: false, error: 'Kesinleşme tarihi geçersiz.' }
  if (p.data.belgeId) {
    const bel = await prisma.belge.findFirst({ where: { id: p.data.belgeId, dosyaId: d.dosyaId }, select: { id: true } })
    if (!bel) return { ok: false, error: 'Belge bu dosyaya ait değil.' }
  }
  await prisma.$transaction(async (tx) => {
    await tx.dava.update({ where: { id: d.id }, data: { kesinlesmeTarihi: t, kesinlesmeBelgeId: p.data.belgeId ?? null, durum: 'KESINLESTI' } })
    await tx.davaIslem.create({ data: altKayit(d, { tur: 'KESINLESME', tarih: t, kaynakBelgeId: p.data.belgeId ?? null, kaynakTuru: 'ELLE', teyit: 'TEYITLI', teyitEdenId: b.kullaniciId, teyitAt: new Date() }) })
    await tx.aktivite.create({ data: { dosyaId: d.dosyaId, kullaniciId: b.kullaniciId, eylem: `Karar kesinleşti: ${p.data.tarih}`, detayJson: { davaId: d.id } } })
  })
  yenile(d.dosyaId)
  return { ok: true }
}

// ─────────────────── S31 · tahsilat onayı (SN-07) ───────────────────

/** UYAP "Yatan Para" farkından doğan tahsilat adayını onayla ya da reddet. Toplama yalnız TEYITLI girer. */
export async function tahsilatKarar(girdi: { olayId: string; karar: 'TEYITLI' | 'REDDEDILDI'; not?: string }): Promise<Sonuc> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = tahsilatKararGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const o = await prisma.takipOlayi.findFirst({ where: { id: p.data.olayId, dosya: { musteriId: b.musteriId } }, select: { id: true, dosyaId: true, altTip: true, teyit: true, tutar: true } })
  if (!o) return { ok: false, error: 'Tahsilat kaydı bulunamadı veya yetkiniz yok.' }
  const k = tahsilatKararVerilebilirMi(o)
  if (!k.ok) return { ok: false, error: k.hata }
  const r = await prisma.takipOlayi.updateMany({ where: { id: o.id, teyit: 'ADAY' }, data: { teyit: p.data.karar, teyitEdenId: b.kullaniciId, teyitAt: new Date() } })
  if (r.count === 0) return { ok: false, error: 'Bu tahsilat adayı başka biri tarafından karara bağlandı.' }
  await prisma.aktivite.create({ data: { dosyaId: o.dosyaId, kullaniciId: b.kullaniciId, eylem: `Tahsilat ${p.data.karar === 'TEYITLI' ? 'onaylandı' : 'reddedildi'}: ${o.tutar?.toString() ?? '?'} TL (UYAP hesap özeti)`, detayJson: { olayId: o.id, not: p.data.not ?? null } } })
  yenile(o.dosyaId)
  return { ok: true }
}

// ─────────────────── S31 · kapanış sebebi (SN-06) ───────────────────

/** Kapanış sebebini kaydet (yalnız avukat). BILINMIYOR dosyayı radarda tutar. Müvekkil kararı gerektiren sebepte onay şart. */
export async function kapanisSebebiKaydet(girdi: { dosyaId: string; sebep: string; not?: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = kapanisGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: b.musteriId }, select: { id: true, kapanisSebebi: true } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const onayTuru = kapanisOnayTuru(p.data.sebep)
  if (onayTuru) {
    const onay = await prisma.onayKaydi.findFirst({ where: { dosyaId: dosya.id, tur: onayTuru, sonuc: 'ONAY', silindiAt: null }, select: { id: true } })
    if (!onay) return { ok: false, error: 'Bu kapanış sebebi müvekkil kararıdır: önce müvekkil onay kaydını girin.' }
  }
  await prisma.$transaction([
    prisma.rucuDosyasi.update({ where: { id: dosya.id }, data: { kapanisSebebi: p.data.sebep, kapanisAt: p.data.sebep === 'BILINMIYOR' ? null : new Date(), kapanisKaydedenId: b.kullaniciId } }),
    prisma.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: b.kullaniciId, eylem: `Kapanış sebebi: ${p.data.sebep}`, detayJson: { onceki: dosya.kapanisSebebi, not: p.data.not ?? null } } }),
  ])
  yenile(dosya.id)
  return { ok: true }
}
