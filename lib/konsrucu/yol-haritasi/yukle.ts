/**
 * KonsRücü — Dosya Yol Haritası · veritabanı okuyucu · lib/konsrucu/yol-haritasi/yukle.ts (SERVER-ONLY)
 *
 * Motorun veritabanına dokunan TEK parçası (06 §8.1 "gercekler.ts"). Sorgu her zaman `musteriId` ile kapsanır
 * (M7); dosya o müvekkile ait değilse null döner. Prova modu bu katmanda da YALNIZ OKUR.
 *
 * Kullanım (server component ya da server action):
 *   const gorunum = await yolHaritasiYukle({ dosyaId, musteriId: aktifMusteriId, prova: searchParams.prova })
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { Gercekler } from './tipler'
import { HAM_SELECT, hamdanGercekler, type HamEk } from './gercekler'
import { onbellekDegisti, onbellekJson, yolHaritasiHesapla, type YolHaritasiGorunum } from './gorunum'
import { provaTarihiCoz } from './prova'
import type { Prisma } from '@prisma/client'

export interface OkuSecenek {
  /** S19 asgari evrak seti bağlanınca eksik listesi buradan verilir (EV-04). */
  zorunluEvrak?: HamEk['zorunluEvrak']
}

/** Dosyanın gerçeklerini müvekkil kapsamıyla okur; bulunamazsa ya da başka müvekkilinse null. */
export async function gerceklerOku(dosyaId: string, musteriId: string, secenek: OkuSecenek = {}): Promise<Gercekler | null> {
  const [ham, ayar, nabiz] = await Promise.all([
    prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId }, select: HAM_SELECT }),
    prisma.ayarlar.findUnique({ where: { musteriId }, select: { alacakliUnvan: true, mersis: true, vekaletnamePath: true } }),
    prisma.eklentiNabiz.findFirst({ where: { musteriId }, orderBy: { sonGorulme: 'desc' }, select: { sonGorulme: true, uyapOturum: true } }),
  ])
  if (!ham) return null
  return hamdanGercekler(ham, { ayar, nabiz, zorunluEvrak: secenek.zorunluEvrak ?? null })
}

export interface YukleSecenek extends OkuSecenek {
  dosyaId: string
  musteriId: string
  /** `?prova=YYYY-MM-DD` değeri; bozuk ya da gelecek tarih yok sayılır (canlı görünüm). */
  prova?: string | string[] | null
  simdi?: Date
}

/** Ekran modeli: gerçekler → (prova kesimi) → sıradaki adım → duraklar → künye. */
export async function yolHaritasiYukle(s: YukleSecenek): Promise<YolHaritasiGorunum | null> {
  const g = await gerceklerOku(s.dosyaId, s.musteriId, s)
  if (!g) return null
  const simdi = s.simdi ?? new Date()
  return yolHaritasiHesapla(g, { simdi, kesim: provaTarihiCoz(s.prova ?? null, simdi) })
}

/**
 * Canlı sonucu `RucuDosyasi.yolHaritasiJson` önbelleğine yazar — yalnız değiştiyse (gereksiz `updatedAt`
 * oynamasını önler). Prova görünümü asla yazılmaz. Dönüş: yazıldı mı.
 */
export async function onbellekGuncelle(gorunum: YolHaritasiGorunum, musteriId: string): Promise<boolean> {
  if (gorunum.prova) return false
  const mevcut = await prisma.rucuDosyasi.findFirst({ where: { id: gorunum.dosyaId, musteriId }, select: { yolHaritasiJson: true } })
  if (!mevcut) return false
  const yeni = onbellekJson(gorunum.sonuc, new Date(gorunum.hesapAt))
  if (!onbellekDegisti(mevcut.yolHaritasiJson, yeni)) return false
  const r = await prisma.rucuDosyasi.updateMany({ where: { id: gorunum.dosyaId, musteriId }, data: { yolHaritasiJson: yeni as Prisma.InputJsonValue } })
  return r.count > 0
}
