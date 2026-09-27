/**
 * KonsRücü — arabuluculuğun İİK 67 süresine etkisi (durma) · lib/konsrucu/arabuluculuk/durma.ts (saf)
 *
 * 06 2(f) "Arka planda":
 *  - Durma YALNIZ başvuru İİK 67 süresi dolmadan yapıldıysa sayılır (geç başvuru: sayılmaz, uyarı).
 *  - Dayanak dava şartı arabuluculukta HUAK 18/A-15; ihtiyaride dayanak farklıdır (HUAK 16). Hepsi "teyit gerekli".
 *  - İİK 67 İHTİYATLI öneri DEĞİŞMEZ. Durmalı öneri yeniden hesaplanır ve ONAYLANAN son gün yeniden onaya düşer
 *    (AR-07). Hatırlatmalar avukat onaylanan günü yeniden girene kadar ihtiyatlı tarihe göre gider.
 *
 * Gün sayımı: son tutanak − başvuru (İstanbul takvim günü). Başvuru ve tutanak gününün sayıma nasıl gireceği
 * hukuki bir sorudur → hesap izinde "sayım yöntemi teyit gerekli" yazar. Tatil uzatması UYGULANMAZ (ihtiyatlı).
 * Bu modül hiçbir tarihi kesinleştirmez: yalnız öneri ve Sure satırına yazılacak alanları üretir.
 */
import type { ArabuluculukTuru } from './sabitler'
import { gunEkle, gunFarki, gunNo, isoGun, trGun } from './tarih'

export type DurmaAraligi = {
  bas: string // yyyy-aa-gg başvuru
  bit: string // yyyy-aa-gg son tutanak
  sebep: 'ARABULUCULUK'
  kaynakBelgeId: string | null
  sayildi: boolean
  gun: number
  dayanak: string
  arabuluculukId?: string
}

export type DurmaSonucu = {
  sayildi: boolean
  gun: number
  dayanak: string
  uyarilar: string[]
  aralik: DurmaAraligi
}

/** Tür → durma dayanağı metni (her zaman "teyit gerekli"). */
export function durmaDayanagi(tur: ArabuluculukTuru | string | null | undefined): string {
  if (tur === 'DAVA_SARTI') return 'HUAK 18/A-15 (teyit gerekli)'
  if (tur === 'IHTIYARI') return 'HUAK 16 · ihtiyari arabuluculukta dayanak farklı (teyit gerekli)'
  return 'Arabuluculuk türü seçilmedi · dayanak belirsiz (teyit gerekli)'
}

/**
 * Durma hesabı. `ihtiyatliSonGun`: İİK 67 ihtiyatlı öneri (durmasız). Başvuru bu günden SONRA ise durma sayılmaz.
 * İhtiyatlı son gün bilinmiyorsa durma "sayıldı" kabul edilmez: önce İİK 67 kaydı gerekir.
 */
export function durmaHesapla(p: {
  basvuruTarihi: Date
  sonTutanakTarihi: Date
  tur: ArabuluculukTuru | string | null | undefined
  ihtiyatliSonGun: Date | null
  kaynakBelgeId?: string | null
  arabuluculukId?: string
}): DurmaSonucu {
  const gun = Math.max(0, gunFarki(p.basvuruTarihi, p.sonTutanakTarihi))
  const dayanak = durmaDayanagi(p.tur)
  const uyarilar: string[] = []
  let sayildi = true
  if (gunNo(p.sonTutanakTarihi) < gunNo(p.basvuruTarihi)) {
    sayildi = false
    uyarilar.push('Son tutanak başvurudan önce görünüyor: tarihleri kontrol edin.')
  }
  if (!p.ihtiyatliSonGun) {
    sayildi = false
    uyarilar.push('İİK 67 ihtiyatlı son günü yok: durma, süre kaydı açılınca hesaplanır.')
  } else if (gunNo(p.basvuruTarihi) > gunNo(p.ihtiyatliSonGun)) {
    sayildi = false
    uyarilar.push(`Geç başvuru: başvuru (${trGun(p.basvuruTarihi)}) İİK 67 ihtiyatlı son gününden (${trGun(p.ihtiyatliSonGun)}) sonra; durma sayılmaz.`)
  }
  if (!p.tur || p.tur === 'BELIRSIZ') uyarilar.push('Arabuluculuk türü belirsiz: durmanın dayanağı avukat seçimine bağlı (teyit gerekli).')
  return {
    sayildi,
    gun,
    dayanak,
    uyarilar,
    aralik: {
      bas: isoGun(p.basvuruTarihi) ?? '',
      bit: isoGun(p.sonTutanakTarihi) ?? '',
      sebep: 'ARABULUCULUK',
      kaynakBelgeId: p.kaynakBelgeId ?? null,
      sayildi,
      gun,
      dayanak,
      ...(p.arabuluculukId ? { arabuluculukId: p.arabuluculukId } : {}),
    },
  }
}

export type SureDurmaGirdi = {
  onerilenIhtiyatli: Date | null
  onerilenSonGun: Date | null
  onaylananSonGun: Date | null
  onaylayanId: string | null
  onayAt: Date | null
  durmaJson: unknown
  hesapIziJson: unknown
}

export type SureDurmaGuncelleme = {
  durmaJson: DurmaAraligi[]
  onerilenSonGun: Date | null
  onaylananSonGun: null
  onaylayanId: null
  onayAt: null
  hesapIziJson: Record<string, unknown>
}

function durmaListesi(v: unknown): DurmaAraligi[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as DurmaAraligi[]) : []
}

/**
 * Bir İİK 67 `Sure` satırına durmayı işle. Aynı arabuluculuk için önceki aralık DEĞİŞTİRİLİR (tekrar onayda çift sayım yok).
 * - onerilenIhtiyatli: DOKUNULMAZ (alan döndürülmez).
 * - onerilenSonGun: ihtiyatlı + sayılan bütün durma günleri.
 * - onaylananSonGun: null'a çekilir; önceki değer hesap izine yazılır → "yeniden onay bekliyor" (AR-07).
 */
export function sureyeDurmaIsle(s: SureDurmaGirdi, d: DurmaSonucu, simdi: Date = new Date()): SureDurmaGuncelleme {
  const onceki = durmaListesi(s.durmaJson).filter((x) => !(d.aralik.arabuluculukId && x.arabuluculukId === d.aralik.arabuluculukId))
  const liste = [...onceki, d.aralik]
  const toplam = liste.filter((x) => x.sayildi).reduce((a, x) => a + (Number(x.gun) || 0), 0)
  const onerilenSonGun = s.onerilenIhtiyatli ? gunEkle(s.onerilenIhtiyatli, toplam) : s.onerilenSonGun
  const iz = s.hesapIziJson && typeof s.hesapIziJson === 'object' && !Array.isArray(s.hesapIziJson) ? { ...(s.hesapIziJson as Record<string, unknown>) } : {}
  return {
    durmaJson: liste,
    onerilenSonGun,
    onaylananSonGun: null,
    onaylayanId: null,
    onayAt: null,
    hesapIziJson: {
      ...iz,
      yenidenOnayBekliyor: true,
      oncekiOnaylanan: s.onaylananSonGun ? isoGun(s.onaylananSonGun) : (iz.oncekiOnaylanan ?? null),
      oncekiOnaylayanId: s.onaylayanId ?? (iz.oncekiOnaylayanId ?? null),
      durmaToplamGun: toplam,
      durmaSayimYontemi: 'son tutanak − başvuru (takvim günü); sayım yöntemi ve tatil uzatması teyit gerekli',
      durmaIslendiAt: simdi.toISOString(),
    },
  }
}

/** AR-07 koşulu: Sure satırı durma sonrası yeniden onay bekliyor mu? */
export function yenidenOnayBekliyorMu(s: { onaylananSonGun: Date | null; hesapIziJson: unknown }): boolean {
  const iz = s.hesapIziJson && typeof s.hesapIziJson === 'object' ? (s.hesapIziJson as Record<string, unknown>) : {}
  return !s.onaylananSonGun && iz.yenidenOnayBekliyor === true
}

/** Onaylanan gün yeniden girildiğinde hesap izindeki bekleme işaretini kaldır. */
export function yenidenOnayIziKapat(hesapIziJson: unknown, onaylayanId: string, simdi: Date = new Date()): Record<string, unknown> {
  const iz = hesapIziJson && typeof hesapIziJson === 'object' && !Array.isArray(hesapIziJson) ? { ...(hesapIziJson as Record<string, unknown>) } : {}
  return { ...iz, yenidenOnayBekliyor: false, yenidenOnaylayanId: onaylayanId, yenidenOnayAt: simdi.toISOString() }
}
