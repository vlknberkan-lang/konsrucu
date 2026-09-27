'use server'

/**
 * KonsRücü — S26 · arabuluculuk, yol seçimi ve müvekkil onayı · server action'lar
 * app/(app)/dosya-islem/arabuluculuk-actions.ts
 *
 * Her action: oturum + aktif müvekkil kapsamı (dosya `musteriId` ile aranır) + rol kapısı (lib/konsrucu/arabuluculuk/yetki)
 * + zod doğrulama + Aktivite + revalidatePath. Hukuki kayıtlar silinmez (silindiAt). Tarih varsayılanı yoktur:
 * son tutanak tarihi "bugün" alınmaz, ileri tarih reddedilir (B02). Arabuluculuk türünü avukat seçer (açık karar 3).
 */
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ctx } from '@/lib/konsrucu/db'
import { dosyaDurumIlerlet } from '@/lib/konsrucu/durum'
import {
  arabuluculukKayitGirdi, iik67YenidenOnayGirdi, istisnaGirdi, onayKaydiGirdi, sonTutanakGirdi, toplantiGirdi,
  toplantiSonucGirdi, turSecimGirdi, yolSecimiGirdi, type ArabuluculukKayitGirdi,
} from '@/lib/konsrucu/arabuluculuk/girdi'
import { basvuruTarihiUyarilari, karsiTarafUyumu, sonTutanakTarihiDogrula } from '@/lib/konsrucu/arabuluculuk/son-tutanak'
import { durmaHesapla, sureyeDurmaIsle, yenidenOnayIziKapat } from '@/lib/konsrucu/arabuluculuk/durma'
import { istisnaDogrula } from '@/lib/konsrucu/arabuluculuk/onay'
import { istisnaBildirimTaslagi } from '@/lib/konsrucu/arabuluculuk/bildirim-taslak'
import { ASAMA_SONUC_AYNA, ACIK_SURE_DURUMLARI } from '@/lib/konsrucu/arabuluculuk/sabitler'
import { gunNo, ileriTarihMi, isoGunCoz } from '@/lib/konsrucu/arabuluculuk/tarih'
import { avukatMi, yazabilir, YETKI_YOK_AVUKAT, YETKI_YOK_YAZMA } from '@/lib/konsrucu/arabuluculuk/yetki'
import { enErkenIhtiyatli } from '@/lib/konsrucu/arabuluculuk/veri'
import { arabuluculukAsamaAynasi } from '@/lib/konsrucu/dava/kayit'
import { bildirimGirdi } from '@/lib/konsrucu/dava/girdi'

export type Sonuc<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

type Baglam = { kullaniciId: string; musteriId: string; avukat: boolean }

/** Oturum + aktif müvekkil + yazma yetkisi. `avukat: true` istenirse AVUKAT/ADMIN şartı. */
async function baglam(opts: { avukat?: boolean } = {}): Promise<Baglam | { hata: string }> {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!yazabilir(dbUser)) return { hata: YETKI_YOK_YAZMA }
  if (opts.avukat && !avukatMi(dbUser)) return { hata: YETKI_YOK_AVUKAT }
  if (!aktifMusteriId) return { hata: 'Aktif müvekkil seçili değil.' }
  return { kullaniciId: dbUser.id, musteriId: aktifMusteriId, avukat: avukatMi(dbUser) }
}

async function dosyaVar(dosyaId: string, musteriId: string): Promise<boolean> {
  const d = await prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId }, select: { id: true } })
  return !!d
}

/** Arabuluculuk kaydını kapsamla yükle (dosya aktif müvekkilde olmalı). */
async function arabYukle(id: string, musteriId: string) {
  return prisma.arabuluculuk.findFirst({ where: { id, silindiAt: null, dosya: { musteriId } }, include: { asama: true } })
}

const ilkHata = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? 'Geçersiz girdi'

function yenile(dosyaId: string) {
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath('/davalar')
}

/** datetime-local ("yyyy-aa-ggTSS:DD") TR saati (UTC+3) → UTC anı; yalnız tarih verilirse 10:00 TR. */
function trAn(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], (m[4] != null ? +m[4] : 10) - 3, m[5] != null ? +m[5] : 0))
  return Number.isNaN(d.getTime()) ? null : d
}

// ─────────────────── kayıt (elle açma formu) ───────────────────

/**
 * Arabuluculuk kaydını ELLE aç ya da güncelle: büro/dosya no, başvuru, arabulucu, süreç başlangıcı, konu.
 * Açılışta Asama(ARABULUCULUK) ile BİRLİKTE açılır (varsa uzantısız aşama yeniden kullanılır). Tür yalnız avukattan.
 */
export async function arabuluculukKaydet(girdi: ArabuluculukKayitGirdi): Promise<Sonuc<{ arabuluculukId: string; uyarilar: string[] }>> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = arabuluculukKayitGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  if (g.tur && !b.avukat) return { ok: false, error: 'Arabuluculuk türünü yalnız avukat seçebilir.' }
  if (!(await dosyaVar(g.dosyaId, b.musteriId))) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const basvuru = g.basvuruTarihi ? isoGunCoz(g.basvuruTarihi) : null
  if (g.basvuruTarihi && !basvuru) return { ok: false, error: 'Başvuru tarihi geçersiz.' }
  if (basvuru && ileriTarihMi(basvuru)) return { ok: false, error: 'Başvuru tarihi ileri bir gün olamaz.' }
  const surec = g.surecBaslangic ? isoGunCoz(g.surecBaslangic) : null
  const veri = {
    ...(g.tur ? { tur: g.tur, turGerekce: g.turGerekce ?? null } : {}),
    basvuruTarihi: basvuru,
    basvuruNo: g.basvuruNo ?? null,
    buroNo: g.buroNo ?? null,
    uyapDosyaNo: g.uyapDosyaNo ?? null,
    arabulucu: g.arabulucu ?? null,
    surecBaslangic: surec,
    konuMetni: g.konuMetni ?? null,
  }
  const ayna = arabuluculukAsamaAynasi({ ...veri })
  try {
    const id = await prisma.$transaction(async (tx) => {
      if (g.arabuluculukId) {
        const mevcut = await tx.arabuluculuk.findFirst({ where: { id: g.arabuluculukId, dosyaId: g.dosyaId, silindiAt: null }, select: { id: true, asamaId: true } })
        if (!mevcut) throw new Error('Arabuluculuk kaydı bulunamadı.')
        await tx.arabuluculuk.update({ where: { id: mevcut.id }, data: veri })
        await tx.asama.update({ where: { id: mevcut.asamaId }, data: { kimlikNo: ayna.kimlikNo, baslangic: ayna.baslangic } })
        await tx.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: b.kullaniciId, eylem: 'Arabuluculuk kaydı güncellendi', detayJson: { arabuluculukId: mevcut.id } } })
        return mevcut.id
      }
      const acik = await tx.arabuluculuk.findFirst({ where: { dosyaId: g.dosyaId, silindiAt: null }, select: { id: true } })
      if (acik) throw new Error('Bu dosyada açık bir arabuluculuk kaydı var: onu güncelleyin.')
      const bos = await tx.asama.findFirst({ where: { dosyaId: g.dosyaId, tur: 'ARABULUCULUK', arabuluculuk: { is: null } }, orderBy: { createdAt: 'desc' }, select: { id: true, detayJson: true } })
      let asamaId: string
      if (bos) {
        asamaId = bos.id
        await tx.asama.update({ where: { id: bos.id }, data: { kimlikNo: ayna.kimlikNo ?? undefined, baslangic: ayna.baslangic ?? undefined } })
      } else {
        const max = await tx.asama.aggregate({ where: { dosyaId: g.dosyaId }, _max: { sira: true } })
        const a = await tx.asama.create({
          data: { dosyaId: g.dosyaId, tur: 'ARABULUCULUK', kimlikNo: ayna.kimlikNo, baslangic: ayna.baslangic, sira: (max._max.sira ?? 0) + 1, detayJson: { kaynakTuru: 'ELLE', teyit: 'TEYITLI', girenId: b.kullaniciId } },
        })
        asamaId = a.id
      }
      const yeni = await tx.arabuluculuk.create({ data: { ...veri, asamaId, dosyaId: g.dosyaId } })
      await tx.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: b.kullaniciId, eylem: 'Arabuluculuk kaydı açıldı (elle)', detayJson: { arabuluculukId: yeni.id, asamaId } } })
      return yeni.id
    })
    if (!g.arabuluculukId) await dosyaDurumIlerlet(g.dosyaId, 'ARABULUCULUK')
    yenile(g.dosyaId)
    return { ok: true, arabuluculukId: id, uyarilar: basvuruTarihiUyarilari(basvuru) }
  } catch (e) {
    return { ok: false, error: `Kaydedilemedi: ${(e as Error).message}` }
  }
}

/** AR-03 · arabuluculuk türünü seç (dava şartı / ihtiyari / belirsiz). Varsayılan yok; yalnız avukat. */
export async function arabuluculukTurSec(girdi: { arabuluculukId: string; tur: string; turGerekce?: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = turSecimGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const a = await arabYukle(p.data.arabuluculukId, b.musteriId)
  if (!a) return { ok: false, error: 'Arabuluculuk kaydı bulunamadı veya yetkiniz yok.' }
  await prisma.$transaction([
    prisma.arabuluculuk.update({ where: { id: a.id }, data: { tur: p.data.tur, turGerekce: p.data.turGerekce ?? null } }),
    prisma.aktivite.create({ data: { dosyaId: a.dosyaId, kullaniciId: b.kullaniciId, eylem: `Arabuluculuk türü seçildi: ${p.data.tur}`, detayJson: { arabuluculukId: a.id, onceki: a.tur, gerekce: p.data.turGerekce ?? null } } }),
  ])
  yenile(a.dosyaId)
  return { ok: true }
}

// ─────────────────── toplantılar ───────────────────

export async function arabuluculukToplantiEkle(girdi: { arabuluculukId: string; baslar: string; yer?: string; online?: boolean }): Promise<Sonuc<{ etkinlikId: string }>> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = toplantiGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const a = await arabYukle(p.data.arabuluculukId, b.musteriId)
  if (!a) return { ok: false, error: 'Arabuluculuk kaydı bulunamadı veya yetkiniz yok.' }
  const baslar = trAn(p.data.baslar)
  if (!baslar) return { ok: false, error: 'Toplantı tarihi geçersiz.' }
  const e = await prisma.etkinlik.create({
    data: { dosyaId: a.dosyaId, asamaId: a.asamaId, tur: 'ARABULUCULUK_TOPLANTISI', baslik: 'Arabuluculuk toplantısı', baslar, yer: p.data.yer ?? null, online: !!p.data.online, kaynak: 'ELLE', teyit: 'TEYITLI' },
  })
  yenile(a.dosyaId)
  revalidatePath('/takvim')
  return { ok: true, etkinlikId: e.id }
}

/** AR-05 · toplantı sonucu (yapıldı / yapılmadı / ertelendi / iptal). */
export async function arabuluculukToplantiSonucu(girdi: { etkinlikId: string; durum: string; sonucNot?: string }): Promise<Sonuc> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = toplantiSonucGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const e = await prisma.etkinlik.findFirst({ where: { id: p.data.etkinlikId, tur: 'ARABULUCULUK_TOPLANTISI', dosya: { musteriId: b.musteriId } }, select: { id: true, dosyaId: true } })
  if (!e) return { ok: false, error: 'Toplantı bulunamadı veya yetkiniz yok.' }
  await prisma.etkinlik.update({ where: { id: e.id }, data: { durum: p.data.durum, sonucNot: p.data.sonucNot ?? null } })
  yenile(e.dosyaId)
  return { ok: true }
}

// ─────────────────── son tutanak ───────────────────

/**
 * Sürüklenen son tutanağı dosyaya belge olarak ekle (bayt tarayıcıdan Storage'a yüklenir; burada meta + metin).
 * Metin yalnız dosyada saklanır; AI'a gitmez. Döner: belgeId (sonTutanakOnayla'ya bağlanır).
 */
export async function sonTutanakBelgesiEkle(dosyaId: string, belge: { dosyaAdi: string; storagePath?: string; extractedText?: string | null }): Promise<Sonuc<{ belgeId: string }>> {
  const b = await baglam()
  if ('hata' in b) return { ok: false, error: b.hata }
  if (!(await dosyaVar(dosyaId, b.musteriId))) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const ad = String(belge?.dosyaAdi ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 255)
  if (!ad) return { ok: false, error: 'Belge adı yok.' }
  const metin = belge.extractedText ? String(belge.extractedText).replace(/\u0000/g, '').slice(0, 200_000) : null
  const yol = String(belge.storagePath ?? '')
  if (yol && !yol.startsWith(`${dosyaId}/`)) return { ok: false, error: 'Belge yolu bu dosyaya ait değil.' }
  const k = await prisma.belge.create({
    data: { dosyaId, kategori: 'TUTANAK', altTur: 'ARB_SON_TUTANAK', dosyaAdi: ad, storagePath: yol, extractedText: metin, kaynak: 'ELLE', uyapDosyaTuru: 'ARABULUCULUK', metinDurumu: metin ? 'METIN_KATMANI' : 'BEKLIYOR' },
    select: { id: true },
  })
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: b.kullaniciId, eylem: 'Arabuluculuk son tutanağı eklendi', detayJson: { belgeId: k.id } } })
  yenile(dosyaId)
  return { ok: true, belgeId: k.id }
}

/**
 * Son tutanağı ONAYLA (avukat). Tarih zorunlu, ileri tarih ve başvurudan önceki tarih reddedilir.
 * Onayla birlikte: Asama sonuçlanır; açık İİK 67 kayıtlarına durma işlenir → durmalı öneri kayar, ihtiyatlı DEĞİŞMEZ,
 * onaylanan son gün "yeniden onay bekliyor"a düşer (AR-07); DurumGecisi (gölge) ve Aktivite yazılır.
 */
export async function sonTutanakOnayla(girdi: {
  arabuluculukId: string; sonTutanakTarihi: string; sonuc: string; sonTutanakBelgeId?: string
  katilmayanTaraf?: string; anlasilanKalemler?: string; anlasilmayanKalemler?: string; konuMetni?: string
}): Promise<Sonuc<{ durma: { gun: number; sayildi: boolean; uyarilar: string[] } | null; yenidenOnay: number; uyarilar: string[] }>> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = sonTutanakGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  const a = await arabYukle(g.arabuluculukId, b.musteriId)
  if (!a) return { ok: false, error: 'Arabuluculuk kaydı bulunamadı veya yetkiniz yok.' }
  const t = sonTutanakTarihiDogrula(g.sonTutanakTarihi, { basvuruTarihi: a.basvuruTarihi })
  if (!t.ok) return { ok: false, error: t.hata }
  let belgeMetni: string | null = null
  if (g.sonTutanakBelgeId) {
    const belge = await prisma.belge.findFirst({ where: { id: g.sonTutanakBelgeId, dosyaId: a.dosyaId, silindiAt: null }, select: { id: true, extractedText: true } })
    if (!belge) return { ok: false, error: 'Seçilen belge bu dosyaya ait değil.' }
    belgeMetni = belge.extractedText
  }
  const uyarilar: string[] = []
  if (g.sonuc === 'KISMEN' && !g.anlasilmayanKalemler) uyarilar.push('Kısmen anlaşma: anlaşılmayan kalemleri yazın (dava yalnız onlarla sınırlı).')
  if (!g.sonTutanakBelgeId && !a.sonTutanakBelgeId) uyarilar.push('Son tutanak belgesi bağlanmadı: dava dilekçesine eklenmesi gerekir (AR-06).')
  if (g.sonuc === 'ANLASMA' || g.sonuc === 'KISMEN') {
    // Sulh/iskonto müvekkil kararıdır: tutanak olmuş bir olguyu kaydeder (engellenmez) ama onay kaydı yoksa uyarı (AR-08).
    const sulh = await prisma.onayKaydi.findFirst({ where: { dosyaId: a.dosyaId, tur: 'SULH_ISKONTO', sonuc: 'ONAY', silindiAt: null }, select: { id: true } })
    if (!sulh) uyarilar.push('Anlaşma müvekkil kararıdır: sulh/iskonto onay kaydı yok. Müvekkil onayını kayda geçirin (AR-08).')
  }
  if (belgeMetni) {
    const itirazlar = await prisma.borcluTakip.findMany({ where: { dosyaId: a.dosyaId, silindiAt: null, itirazVar: true }, select: { borclu: { select: { adUnvan: true } } } })
    const k = karsiTarafUyumu(belgeMetni, itirazlar.map((x) => x.borclu.adUnvan))
    if (k.uyari) uyarilar.push(k.uyari)
  }

  const sureler = await prisma.sure.findMany({ where: { dosyaId: a.dosyaId, tur: 'IIK67', silindiAt: null, durum: { in: [...ACIK_SURE_DURUMLARI] } } })
  const ozet: { gun: number; sayildi: boolean; uyarilar: string[] }[] = []
  const simdi = new Date()
  const guncellemeler = a.basvuruTarihi
    ? sureler.map((s) => {
        const d = durmaHesapla({ basvuruTarihi: a.basvuruTarihi as Date, sonTutanakTarihi: t.tarih, tur: a.tur, ihtiyatliSonGun: s.onerilenIhtiyatli, kaynakBelgeId: g.sonTutanakBelgeId ?? a.sonTutanakBelgeId, arabuluculukId: a.id })
        ozet.push({ gun: d.gun, sayildi: d.sayildi, uyarilar: d.uyarilar })
        return { id: s.id, veri: sureyeDurmaIsle(s, d, simdi) }
      })
    : []
  if (!a.basvuruTarihi) uyarilar.push('Başvuru tarihi yok: durma hesaplanamadı. Başvuru tarihini girip tutanağı yeniden onaylayın.')

  const kismenJson = g.anlasilanKalemler || g.anlasilmayanKalemler ? { anlasilan: g.anlasilanKalemler ?? null, anlasilmayan: g.anlasilmayanKalemler ?? null } : undefined
  const eksenYeni = g.sonuc === 'ANLASMA' ? 'SON_TUTANAK_ANLASMA' : 'SON_TUTANAK_DIGER'
  try {
    await prisma.$transaction(async (tx) => {
      await tx.arabuluculuk.update({
        where: { id: a.id },
        data: {
          sonTutanakTarihi: t.tarih, sonuc: g.sonuc, sonTutanakBelgeId: g.sonTutanakBelgeId ?? a.sonTutanakBelgeId,
          katilmayanTaraf: g.katilmayanTaraf ?? a.katilmayanTaraf, konuMetni: g.konuMetni ?? a.konuMetni,
          ...(kismenJson ? { kismenJson: kismenJson as Prisma.InputJsonValue } : {}),
          onaylayanId: b.kullaniciId, onayAt: simdi,
        },
      })
      await tx.asama.update({ where: { id: a.asamaId }, data: { durum: 'SONUCLANDI', sonuc: ASAMA_SONUC_AYNA[g.sonuc], bitis: t.tarih } })
      for (const u of guncellemeler) {
        await tx.sure.update({
          where: { id: u.id },
          data: {
            durmaJson: u.veri.durmaJson as unknown as Prisma.InputJsonValue,
            onerilenSonGun: u.veri.onerilenSonGun,
            onaylananSonGun: null, onaylayanId: null, onayAt: null,
            hesapIziJson: u.veri.hesapIziJson as Prisma.InputJsonValue,
          },
        })
      }
      await tx.durumGecisi.create({ data: { dosyaId: a.dosyaId, eksen: 'ARAB', eski: a.sonuc ? 'SON_TUTANAK' : 'DEVAM', yeni: eksenYeni, teyit: 'TEYITLI', sebep: 'Son tutanak avukat onayı', kaynakTuru: 'AVUKAT', kaynakId: a.id, kullaniciId: b.kullaniciId, golge: true } })
      await tx.aktivite.create({
        data: {
          dosyaId: a.dosyaId, kullaniciId: b.kullaniciId,
          eylem: `Arabuluculuk son tutanağı onaylandı: ${g.sonuc}${guncellemeler.length ? ` · ${guncellemeler.length} İİK 67 kaydı yeniden onay bekliyor` : ''}`,
          detayJson: { arabuluculukId: a.id, sonTutanakTarihi: g.sonTutanakTarihi, sonuc: g.sonuc, durma: ozet } as Prisma.InputJsonValue,
        },
      })
    })
  } catch (e) {
    return { ok: false, error: `Onaylanamadı: ${(e as Error).message}` }
  }
  yenile(a.dosyaId)
  return { ok: true, durma: ozet[0] ?? null, yenidenOnay: guncellemeler.length, uyarilar: [...uyarilar, ...ozet.flatMap((o) => o.uyarilar)] }
}

/**
 * AR-07 · İİK 67 son gününü yeniden onayla (durma eklendi). Yalnız avukat. Önerilen durmalı günden (yoksa ihtiyatlıdan)
 * İLERİ bir gün onaylanamaz: fark varsa önce hesap/kayıt düzeltilir.
 */
export async function iik67SonGunYenidenOnayla(girdi: { sureId: string; sonGun: string; bakilanEvrak?: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = iik67YenidenOnayGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const s = await prisma.sure.findFirst({ where: { id: p.data.sureId, tur: 'IIK67', silindiAt: null, dosya: { musteriId: b.musteriId } } })
  if (!s) return { ok: false, error: 'Süre kaydı bulunamadı veya yetkiniz yok.' }
  if (s.durum === 'KAPANDI' || s.durum === 'IPTAL') return { ok: false, error: 'Kapalı süre yeniden onaylanamaz.' }
  const gun = isoGunCoz(p.data.sonGun)
  if (!gun) return { ok: false, error: 'Son gün geçersiz.' }
  const tavan = s.onerilenSonGun ?? s.onerilenIhtiyatli
  if (tavan && gunNo(gun) > gunNo(tavan)) return { ok: false, error: 'Onaylanan gün önerilen son günden ileri olamaz: hesap kaydını kontrol edin.' }
  await prisma.$transaction([
    prisma.sure.update({
      where: { id: s.id },
      data: { onaylananSonGun: gun, onaylayanId: b.kullaniciId, onayAt: new Date(), bakilanEvrak: p.data.bakilanEvrak ?? s.bakilanEvrak, hesapIziJson: yenidenOnayIziKapat(s.hesapIziJson, b.kullaniciId) as Prisma.InputJsonValue },
    }),
    prisma.aktivite.create({ data: { dosyaId: s.dosyaId, kullaniciId: b.kullaniciId, eylem: `İİK 67 son günü yeniden onaylandı: ${p.data.sonGun}`, detayJson: { sureId: s.id } } }),
  ])
  yenile(s.dosyaId)
  return { ok: true }
}

// ─────────────────── yol seçimi ve müvekkil onayı ───────────────────

/** AR-01 / SN-02 · yol seçimi (avukat önerir). Önceki GECERLI seçim ESKIDI olur (silinmez). */
export async function yolSec(girdi: { dosyaId: string; asama: 'ITIRAZ_SONRASI' | 'KARAR_SONRASI'; secim: string; davaId?: string; gerekce?: string; ekonomi?: Record<string, string | undefined> }): Promise<Sonuc<{ yolSecimiId: string }>> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = yolSecimiGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  const itirazYolu = ['ARABULUCULUK_IIK67', 'IIK68_KALDIRMA', 'GENEL_ALACAK', 'TAKIBI_BIRAK'].includes(g.secim)
  if ((g.asama === 'ITIRAZ_SONRASI') !== itirazYolu) return { ok: false, error: 'Seçilen yol bu aşamaya ait değil.' }
  if (!(await dosyaVar(g.dosyaId, b.musteriId))) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  if (g.davaId) {
    const d = await prisma.dava.findFirst({ where: { id: g.davaId, dosyaId: g.dosyaId, silindiAt: null }, select: { id: true } })
    if (!d) return { ok: false, error: 'Dava bu dosyaya ait değil.' }
  }
  const yeni = await prisma.$transaction(async (tx) => {
    await tx.yolSecimi.updateMany({ where: { dosyaId: g.dosyaId, asama: g.asama, durum: 'GECERLI', silindiAt: null, ...(g.davaId ? { davaId: g.davaId } : {}) }, data: { durum: 'ESKIDI' } })
    const y = await tx.yolSecimi.create({
      data: { dosyaId: g.dosyaId, asama: g.asama, secim: g.secim, davaId: g.davaId ?? null, gerekce: g.gerekce ?? null, ekonomiJson: (g.ekonomi ?? undefined) as Prisma.InputJsonValue | undefined, secenId: b.kullaniciId },
    })
    await tx.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: b.kullaniciId, eylem: `Yol seçildi (${g.asama}): ${g.secim}`, detayJson: { yolSecimiId: y.id, gerekce: g.gerekce ?? null } } })
    return y
  })
  yenile(g.dosyaId)
  return { ok: true, yolSecimiId: yeni.id }
}

/** AR-02 · müvekkil onay kaydı (talep, onay ya da ret). ONAY/RET için alınma tarihi zorunlu, ileri tarih yok. */
export async function onayKaydiKaydet(girdi: {
  dosyaId: string; tur: string; sonuc: string; istenmeTarihi?: string; alinmaTarihi?: string; onaylayanUnvan?: string
  belgeId?: string; tutar?: string | number; yolSecimiId?: string; davaId?: string
}): Promise<Sonuc<{ onayId: string }>> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = onayKaydiGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const g = p.data
  if (!(await dosyaVar(g.dosyaId, b.musteriId))) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const alinma = g.alinmaTarihi ? isoGunCoz(g.alinmaTarihi) : null
  const istenme = g.istenmeTarihi ? isoGunCoz(g.istenmeTarihi) : null
  if (g.sonuc !== 'BEKLIYOR' && !alinma) return { ok: false, error: 'Müvekkil kararının tarihini girin.' }
  if ((alinma && ileriTarihMi(alinma)) || (istenme && ileriTarihMi(istenme))) return { ok: false, error: 'Tarih ileri bir gün olamaz.' }
  if (g.sonuc !== 'BEKLIYOR' && !g.onaylayanUnvan) return { ok: false, error: 'Onayı veren unvanı girin.' }
  if (g.belgeId) {
    const bel = await prisma.belge.findFirst({ where: { id: g.belgeId, dosyaId: g.dosyaId }, select: { id: true } })
    if (!bel) return { ok: false, error: 'Onay belgesi bu dosyaya ait değil.' }
  }
  const k = await prisma.$transaction(async (tx) => {
    const o = await tx.onayKaydi.create({
      data: {
        dosyaId: g.dosyaId, tur: g.tur, sonuc: g.sonuc, istenmeAt: istenme, alinmaAt: alinma, onaylayanUnvan: g.onaylayanUnvan ?? null,
        belgeId: g.belgeId ?? null, tutar: g.tutar != null ? new Prisma.Decimal(g.tutar) : null, yolSecimiId: g.yolSecimiId ?? null, davaId: g.davaId ?? null, kaydedenId: b.kullaniciId,
      },
    })
    await tx.aktivite.create({ data: { dosyaId: g.dosyaId, kullaniciId: b.kullaniciId, eylem: `Müvekkil onay kaydı: ${g.tur} · ${g.sonuc}`, detayJson: { onayId: o.id } } })
    return o
  })
  yenile(g.dosyaId)
  return { ok: true, onayId: k.id }
}

/**
 * Açık karar 4 · süre koruma istisnası: İİK 67 ihtiyatlı son güne ≤ 14 gün kaldıysa avukat YAZILI GEREKÇEYLE dava
 * ön kontrolünü açar. Kayıt OnayKaydi(DAVA_ACMA, BEKLIYOR, istisnaGerekce); müvekkile bildirim taslağı döner.
 */
export async function onayIstisnasiKaydet(girdi: { dosyaId: string; gerekce: string }): Promise<Sonuc<{ onayId: string; bildirimTaslagi: string }>> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = istisnaGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  const dosya = await prisma.rucuDosyasi.findFirst({ where: { id: p.data.dosyaId, musteriId: b.musteriId }, select: { id: true, hukukDosyaNo: true, hasarDosyaNo: true, icraDairesi: true, icraDosyaNo: true, musteri: { select: { ad: true } } } })
  if (!dosya) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const sureler = await prisma.sure.findMany({ where: { dosyaId: dosya.id, tur: 'IIK67', silindiAt: null }, select: { onerilenIhtiyatli: true, durum: true, silindiAt: true } })
  const ihtiyatli = enErkenIhtiyatli(sureler)
  const d = istisnaDogrula({ tur: 'DAVA_ACMA', gerekce: p.data.gerekce, ihtiyatliSonGun: ihtiyatli })
  if (!d.ok) return { ok: false, error: d.hata }
  const o = await prisma.$transaction(async (tx) => {
    const k = await tx.onayKaydi.create({ data: { dosyaId: dosya.id, tur: 'DAVA_ACMA', sonuc: 'BEKLIYOR', istisnaGerekce: p.data.gerekce, kaydedenId: b.kullaniciId } })
    await tx.aktivite.create({ data: { dosyaId: dosya.id, kullaniciId: b.kullaniciId, eylem: 'Süre koruma istisnası: müvekkil onayı beklenmeden dava ön kontrolü açıldı', detayJson: { onayId: k.id, gerekce: p.data.gerekce } } })
    return k
  })
  const ayar = await prisma.ayarlar.findUnique({ where: { musteriId: b.musteriId }, select: { alacakliUnvan: true } })
  yenile(dosya.id)
  return {
    ok: true,
    onayId: o.id,
    bildirimTaslagi: istisnaBildirimTaslagi({ kunye: { musteriUnvani: ayar?.alacakliUnvan ?? dosya.musteri.ad, hukukDosyaNo: dosya.hukukDosyaNo, hasarDosyaNo: dosya.hasarDosyaNo, icraDairesi: dosya.icraDairesi, icraEsas: dosya.icraDosyaNo }, ihtiyatliSonGun: ihtiyatli, gerekce: p.data.gerekce }),
  }
}

/**
 * Müvekkile yazı elle gönderildi (onay talebi, istisna, arabuluculuk sonucu, karar, tahsilat). Program göndermez;
 * avukat gönderdiğini işaretler (SN-08 kapanır). Onay talebinde ilgili OnayKaydi.istenmeAt dolar.
 */
export async function musteriBildirimiGonderildi(girdi: { dosyaId: string; konu: string; refId?: string }): Promise<Sonuc> {
  const b = await baglam({ avukat: true })
  if ('hata' in b) return { ok: false, error: b.hata }
  const p = bildirimGirdi.safeParse(girdi)
  if (!p.success) return { ok: false, error: ilkHata(p.error) }
  if (!(await dosyaVar(p.data.dosyaId, b.musteriId))) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok.' }
  const simdi = new Date()
  await prisma.$transaction(async (tx) => {
    if (p.data.konu === 'ONAY_TALEBI' && p.data.refId) {
      await tx.onayKaydi.updateMany({ where: { id: p.data.refId, dosyaId: p.data.dosyaId, istenmeAt: null }, data: { istenmeAt: simdi } })
    }
    await tx.aktivite.create({ data: { dosyaId: p.data.dosyaId, kullaniciId: b.kullaniciId, eylem: `Müvekkile bildirim gönderildi (elle): ${p.data.konu}`, detayJson: { tur: 'MUSTERI_BILDIRIMI', konu: p.data.konu, refId: p.data.refId ?? null } } })
  })
  yenile(p.data.dosyaId)
  return { ok: true }
}
