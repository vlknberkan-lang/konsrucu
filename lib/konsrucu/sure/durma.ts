/**
 * KonsRücü — Arabuluculuk kaydından durma dönemi · lib/konsrucu/sure/durma.ts (saf)
 *
 * 06 §2(f): dava şartı arabuluculukta dayanak HUAK 18/A-15; ihtiyari arabuluculukta dayanak farklıdır
 * (HUAK 16) — ikisi de "teyit gerekli". Başvuru tarihi olmayan kayıt durma üretmez. Son tutanak yoksa
 * durma "sürüyor" sayılır (durmalı öneri bitişi bekler; hatırlatma ihtiyatlı güne göre gider).
 * Durmanın sayılıp sayılmadığına (süre dolmadan başvurulmuş mu) hesap.ts karar verir.
 */
import type { DurmaDonemi } from './hesap'
import { TEYIT_GEREKLI } from './turler'

export type ArabuluculukOzu = {
  id: string
  tur: string | null
  basvuruTarihi: Date | string | null
  sonTutanakTarihi: Date | string | null
}

export function arabuluculukSebebi(tur: string | null): string {
  if (tur === 'DAVA_SARTI') return `Arabuluculuk (HUAK 18/A-15, ${TEYIT_GEREKLI})`
  if (tur === 'IHTIYARI') return `İhtiyari arabuluculuk (HUAK 16; dayanak farklı, ${TEYIT_GEREKLI})`
  return `Arabuluculuk (türü seçilmedi, ${TEYIT_GEREKLI})`
}

export function arabuluculukDurmalari(kayitlar: ArabuluculukOzu[]): DurmaDonemi[] {
  return kayitlar
    .filter((a) => a.basvuruTarihi)
    .map((a) => ({ bas: a.basvuruTarihi as Date | string, bit: a.sonTutanakTarihi, sebep: arabuluculukSebebi(a.tur), kaynakId: a.id }))
}
