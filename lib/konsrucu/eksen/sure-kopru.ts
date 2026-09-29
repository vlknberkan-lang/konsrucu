/**
 * KonsRücü — Onay kartından SÜRE DEFTERİNE köprü · lib/konsrucu/eksen/sure-kopru.ts
 *
 * 06 §2(e) "Kaydedilen veri: … onaylanınca BorcluTakip, Sure (İİK 62, 67 …)". Tebliğ, itiraz ve itirazın size
 * tebliği borçlu bazında onaylanınca süre defterinde (S24) ÖNERİ açılır ya da güncellenir; hesap S24'ün saf
 * motorundan (lib/konsrucu/sure/hesap) geçer, burada kural yazılmaz. İlkeler:
 *
 *   • Sistem yalnız ÖNERİ yazar (ihtiyatlı + durmalı gün); onaylanan son gün yalnız avukattan (S24 onay formu).
 *   • Onaylı bir sürenin tetiğine DOKUNULMAZ: yeni tarih uyarı olarak döner, avukat defterde günceller.
 *   • Onay geri alınınca, köprünün açtığı ve henüz onaylanmamış öneri İPTAL olur (silinmez; kapanış notuyla).
 *     Avukatın elle açtığı ya da defterde değiştirdiği süre iptal edilmez.
 *   • İİK 78 bilerek açılmaz: itiraz ve dava süresince işlemez (İİK 78/2, teyit gerekli); borçlu bloğunda önizleme
 *     olarak görünür, gerekirse avukat defterden ekler.
 *
 * Saf plan (kopruPlani) + işlem içi uygulama (kopruUygula). Her iki uç da dosya ve borçlu kapsamında çalışır.
 */
import type { Prisma } from '@prisma/client'
import { hesapIziJsonu, hesapIziOku, sureOnerisiHesapla, type DurmaDonemi, type SureGirdisi } from '@/lib/konsrucu/sure/hesap'
import { arabuluculukDurmalari } from '@/lib/konsrucu/sure/durma'
import { sureTuru } from '@/lib/konsrucu/sure/turler'
import { gunNo, gunTR, isoGun } from './norm'
import type { BorcluTakipAlanlari } from './aday-onay'

/** İİK 68 (29.09): itirazla birlikte İİK 67'nin yanında öneri olarak açılır (e-postası yok; bkz. sure/turler). */
export const KOPRU_TURLERI = ['IIK62', 'IIK67', 'IIK68'] as const
export type KopruTur = (typeof KOPRU_TURLERI)[number]

/** Köprünün açtığı sürenin izi (Sure.hesapIziJson.kopru). Defterde güncellenince iz kaybolur → süre avukatındır. */
export const KOPRU_KAYNAK = 'ADAY_ONAY'

const KAPALI_SURE = ['KAPANDI', 'IPTAL'] as const

export type KopruTakip = Pick<
  BorcluTakipAlanlari,
  'tebligTarihi' | 'tebligSekli' | 'tebligSonucu' | 'uetsUlasmaTarihi' | 'tebligKaynakBelgeId'
  | 'itirazVar' | 'itirazVerilisTarihi' | 'itirazUyapTarihi' | 'itirazKaynakBelgeId' | 'itirazAlacakliyaTebligTarihi'
>

export type KopruSure = {
  id: string
  tur: string
  durum: string
  onaylananSonGun: Date | null
  hesapIziJson: unknown
  updatedAt: Date
}

export type KopruIslemi =
  | { islem: 'AC'; tur: KopruTur; girdi: SureGirdisi; kaynakBelgeId: string | null }
  | { islem: 'GUNCELLE'; tur: KopruTur; sureId: string; beklenen: Date; girdi: SureGirdisi; kopruIzi: unknown }
  | { islem: 'IPTAL'; tur: KopruTur; sureId: string; beklenen: Date }
  | { islem: 'UYAR'; tur: KopruTur; sureId: string; metin: string }

const enErken = (ds: (Date | null | undefined)[]): Date | null =>
  ds.filter((d): d is Date => !!d).reduce<Date | null>((a, b) => (!a || gunNo(b) < gunNo(a) ? b : a), null)

/** BorcluTakip → S24 süre girdisi. Dayanak olgu yoksa null (süre gerekmez ya da geri alındı). */
export function kopruGirdisi(tur: KopruTur, bt: KopruTakip | null | undefined, durmalar: DurmaDonemi[] = []): SureGirdisi | null {
  if (!bt) return null
  if (tur === 'IIK62') {
    if (bt.tebligSonucu !== 'TEBLIG' || !bt.tebligTarihi) return null
    // UETS: ihtiyatlı hesap ulaşma gününden, hukuki başlangıç ulaşma + 5 gün (S24 motoru; Tebligat K. 7/a, teyit gerekli)
    if (bt.tebligSekli === 'UETS' && bt.uetsUlasmaTarihi) {
      return { tur, tetikTarihi: bt.uetsUlasmaTarihi, tetikTuru: 'UETS_ULASMA', uetsUlasmaTarihi: bt.uetsUlasmaTarihi }
    }
    return { tur, tetikTarihi: bt.tebligTarihi, tetikTuru: 'TEBLIG', uetsUlasmaTarihi: null }
  }
  if (bt.itirazVar !== true) return null
  // İİK 67: itirazın size tebliği varsa başlangıç o; yoksa ihtiyatlı alt sınır itiraz tarihinden (kaşe ya da UYAP, erken olan)
  const itirazTarihi = enErken([bt.itirazVerilisTarihi, bt.itirazUyapTarihi])
  return {
    tur,
    tetikTarihi: bt.itirazAlacakliyaTebligTarihi ?? null,
    tetikTuru: bt.itirazAlacakliyaTebligTarihi ? 'TEBLIG' : null,
    uetsUlasmaTarihi: null,
    itirazTarihi,
    durmalar,
  }
}

/** Girdinin karşılaştırma anahtarı (tetik, tetik türü, UETS ulaşma, itiraz tarihi — gün düzeyinde). */
export function girdiAnahtari(g: { tetikTarihi?: Date | string | null; tetikTuru?: string | null; uetsUlasmaTarihi?: Date | string | null; itirazTarihi?: Date | string | null }): string {
  const gun = (v: Date | string | null | undefined) => (v instanceof Date ? isoGun(v) : typeof v === 'string' && v ? v.slice(0, 10) : '-')
  return [gun(g.tetikTarihi), g.tetikTuru ?? '-', gun(g.uetsUlasmaTarihi), gun(g.itirazTarihi)].join('|')
}

export function kopruIziVarMi(hesapIziJson: unknown): boolean {
  return !!hesapIziJson && typeof hesapIziJson === 'object' && (hesapIziJson as { kopru?: { kaynak?: unknown } }).kopru?.kaynak === KOPRU_KAYNAK
}

/**
 * Saf plan: borçlunun güncel BorcluTakip'i ve o borçlunun AÇIK süreleri (KAPANDI/IPTAL değil) → yapılacaklar.
 * `ilgili`: yalnız bu türlere bakılır (ör. kapsam girişi yalnız İİK 67'yi etkiler).
 */
export function kopruPlani(p: {
  bt: KopruTakip | null | undefined
  acikSureler: KopruSure[]
  durmalar?: DurmaDonemi[]
  ilgili?: readonly KopruTur[]
}): KopruIslemi[] {
  const out: KopruIslemi[] = []
  for (const tur of p.ilgili ?? KOPRU_TURLERI) {
    const g = kopruGirdisi(tur, p.bt, tur === 'IIK67' ? p.durmalar ?? [] : [])
    const s = p.acikSureler.filter((x) => x.tur === tur && !(KAPALI_SURE as readonly string[]).includes(x.durum))[0]
    const etiket = sureTuru(tur).etiket
    if (!g) {
      if (s && kopruIziVarMi(s.hesapIziJson)) {
        if (!s.onaylananSonGun) out.push({ islem: 'IPTAL', tur, sureId: s.id, beklenen: s.updatedAt })
        else out.push({ islem: 'UYAR', tur, sureId: s.id, metin: `${etiket} son günü onaylı ama dayandığı onay geri alındı: süre defterinde kontrol edin (teyit gerekli).` })
      }
      continue
    }
    const kaynakBelgeId = tur === 'IIK62' ? p.bt?.tebligKaynakBelgeId ?? null : p.bt?.itirazKaynakBelgeId ?? null
    if (!s) { out.push({ islem: 'AC', tur, girdi: g, kaynakBelgeId }); continue }
    const eski = hesapIziOku(s.hesapIziJson)?.girdi
    if (eski && girdiAnahtari(eski) === girdiAnahtari(g)) continue
    if (s.onaylananSonGun) {
      const yeni = g.tetikTarihi ?? g.itirazTarihi ?? null
      out.push({ islem: 'UYAR', tur, sureId: s.id, metin: `${etiket} son günü onaylı (${gunTR(s.onaylananSonGun)}); onaylanan yeni tarih${yeni ? ` (${gunTR(yeni)})` : ''} süreyi değiştirebilir: süre defterinde tetiği güncelleyin (teyit gerekli).` })
      continue
    }
    out.push({ islem: 'GUNCELLE', tur, sureId: s.id, beklenen: s.updatedAt, girdi: g, kopruIzi: (s.hesapIziJson as { kopru?: unknown } | null)?.kopru ?? null })
  }
  return out
}

type Tx = Prisma.TransactionClient

/**
 * Planı işlem içinde uygular (çağıranın $transaction'ı). Dönüş: kullanıcıya gösterilecek uyarılar.
 * Süre satırı bu arada değiştiyse (updatedAt) o satır atlanır ve uyarı döner — onay işlemi bozulmaz.
 */
export async function kopruUygula(tx: Tx, p: {
  dosyaId: string
  borcluId: string
  kullaniciId: string
  olayId?: string | null
  ilgili?: readonly KopruTur[]
  simdi?: Date
}): Promise<string[]> {
  const simdi = p.simdi ?? new Date()
  const [bt, sureler, arab] = await Promise.all([
    tx.borcluTakip.findFirst({
      where: { borcluId: p.borcluId, dosyaId: p.dosyaId, silindiAt: null },
      select: {
        tebligTarihi: true, tebligSekli: true, tebligSonucu: true, uetsUlasmaTarihi: true, tebligKaynakBelgeId: true,
        itirazVar: true, itirazVerilisTarihi: true, itirazUyapTarihi: true, itirazKaynakBelgeId: true, itirazAlacakliyaTebligTarihi: true,
      },
    }),
    tx.sure.findMany({
      where: { dosyaId: p.dosyaId, borcluId: p.borcluId, tur: { in: [...KOPRU_TURLERI] }, silindiAt: null, durum: { notIn: [...KAPALI_SURE] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tur: true, durum: true, onaylananSonGun: true, hesapIziJson: true, updatedAt: true },
    }),
    tx.arabuluculuk.findMany({
      where: { dosyaId: p.dosyaId, silindiAt: null, basvuruTarihi: { not: null } },
      orderBy: { basvuruTarihi: 'asc' },
      select: { id: true, tur: true, basvuruTarihi: true, sonTutanakTarihi: true },
    }),
  ])
  const plan = kopruPlani({ bt: bt as KopruTakip | null, acikSureler: sureler, durmalar: arabuluculukDurmalari(arab), ilgili: p.ilgili })
  const uyarilar: string[] = []
  for (const i of plan) {
    const t = sureTuru(i.tur)
    if (i.islem === 'UYAR') { uyarilar.push(i.metin); continue }
    if (i.islem === 'IPTAL') {
      const r = await tx.sure.updateMany({
        where: { id: i.sureId, dosyaId: p.dosyaId, updatedAt: i.beklenen, onaylananSonGun: null, durum: { notIn: [...KAPALI_SURE] } },
        data: { durum: 'IPTAL', kapanisNot: 'Dayandığı onay geri alındı: otomatik süre önerisi iptal edildi (silinmedi).', kapatanId: p.kullaniciId, kapanisAt: simdi },
      })
      if (r.count) {
        await tx.aktivite.create({ data: { dosyaId: p.dosyaId, kullaniciId: p.kullaniciId, eylem: `Süre önerisi iptal edildi: ${t.etiket} (dayandığı onay geri alındı)`, detayJson: { tur: 'SURE_KOPRU', islem: 'IPTAL', sureId: i.sureId } as Prisma.InputJsonValue } })
        uyarilar.push(`${t.etiket} önerisi iptal edildi (dayandığı onay geri alındı).`)
      }
      continue
    }
    const oneri = sureOnerisiHesapla(i.girdi)
    const iz = { ...hesapIziJsonu(i.girdi, oneri, simdi), kopru: i.islem === 'AC' ? { kaynak: KOPRU_KAYNAK, olayId: p.olayId ?? null, at: simdi.toISOString() } : i.kopruIzi ?? undefined }
    const ortak = {
      tetikTarihi: i.girdi.tetikTarihi ?? null,
      tetikTuru: i.girdi.tetikTuru ?? null,
      uetsUlasmaTarihi: i.girdi.uetsUlasmaTarihi ?? null,
      onerilenIhtiyatli: oneri.onerilenIhtiyatli,
      onerilenSonGun: oneri.onerilenSonGun,
      hesapIziJson: iz as unknown as Prisma.InputJsonValue,
      durum: oneri.durum,
    }
    const gunMetni = oneri.onerilenIhtiyatli ? `ihtiyatlı ${gunTR(oneri.onerilenIhtiyatli)}` : 'tetik bekliyor'
    if (i.islem === 'AC') {
      const s = await tx.sure.create({
        data: {
          dosyaId: p.dosyaId, borcluId: p.borcluId, tur: i.tur, dayanak: t.dayanak, kaynakBelgeId: i.kaynakBelgeId,
          arabuluculukId: i.tur === 'IIK67' ? (i.girdi.durmalar?.[0]?.kaynakId ?? null) : null,
          ...(oneri.durmalar.length ? { durmaJson: oneri.durmalar as unknown as Prisma.InputJsonValue } : {}),
          ...ortak,
        },
        select: { id: true },
      })
      await tx.aktivite.create({ data: { dosyaId: p.dosyaId, kullaniciId: p.kullaniciId, eylem: `Süre önerisi eklendi: ${t.etiket} · ${gunMetni} (teyit gerekli)`, detayJson: { tur: 'SURE_KOPRU', islem: 'AC', sureId: s.id, olayId: p.olayId ?? null } as Prisma.InputJsonValue } })
      uyarilar.push(`${t.etiket} önerisi süre defterine eklendi: ${gunMetni} (teyit gerekli); onaylanan son günü defterde girin.`)
      continue
    }
    const r = await tx.sure.updateMany({
      where: { id: i.sureId, dosyaId: p.dosyaId, updatedAt: i.beklenen, onaylananSonGun: null, durum: { notIn: [...KAPALI_SURE] } },
      data: { ...ortak, ...(oneri.durmalar.length ? { durmaJson: oneri.durmalar as unknown as Prisma.InputJsonValue } : {}) },
    })
    if (!r.count) { uyarilar.push(`${t.etiket} önerisi bu arada değişti; süre defterinde kontrol edin.`); continue }
    await tx.aktivite.create({ data: { dosyaId: p.dosyaId, kullaniciId: p.kullaniciId, eylem: `Süre önerisi güncellendi: ${t.etiket} · ${gunMetni} (teyit gerekli)`, detayJson: { tur: 'SURE_KOPRU', islem: 'GUNCELLE', sureId: i.sureId, olayId: p.olayId ?? null } as Prisma.InputJsonValue } })
    uyarilar.push(`${t.etiket} önerisi güncellendi: ${gunMetni} (teyit gerekli).`)
  }
  return uyarilar
}
