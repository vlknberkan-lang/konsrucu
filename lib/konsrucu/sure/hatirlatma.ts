/**
 * KonsRücü — Süre hatırlatma kararı · lib/konsrucu/sure/hatirlatma.ts (saf, client-safe; DB yok)
 *
 * Kural (06 §2(i), 07 S24): hatırlatma ONAYLANAN son güne, yoksa İHTİYATLI öneriye göre, 7, 3 ve 1 gün
 * kala gider. Yeni cron açılmaz; mevcut etkinlik-hatirlatma cron'u (15 dk) bu kararı çağırır.
 *
 * Mükerrer önleme — Sure.hatirlatmaJson (dizi): her kayıt {esik, hedef, kip, gonderildi}.
 *  - Aynı eşik + aynı hedef gün için gerçekten gönderilmiş kayıt varsa bir daha gitmez.
 *  - Hedef gün değişirse (avukat onaylanan günü girdi, durma eklendi) eşikler yeni gün için baştan sayılır.
 *  - Cron birkaç koşu kaçırırsa yalnız GÜNCEL eşik gider (7 ve 3 birlikte yığılmaz).
 *  - Aynı dosya + tür + borçlu için birden çok Sure satırı varsa (ör. R0 aktarımı + UYAP önerisi) tek
 *    hatırlatma gider (06 §3.6 tekilleştirme anahtarı).
 *
 * B52: EMAIL_SERVICE=console iken e-posta GÖNDERİLMEZ; kayıt "gonderildi: false, kip: console" olarak
 * düşer, gönderilmiş sayılmaz. Gerçek kipe geçilince aynı eşik (hâlâ güncelse) gerçekten gönderilir.
 */
import { kalanGun } from '@/lib/konsrucu/format'
import { gunNo, isoGun, tarihOku } from './takvim'
import { ACIK_DURUMLAR, sureTuru } from './turler'

export const HATIRLATMA_ESIKLERI = [7, 3, 1] as const
/** Gerçek kipte başarısız gönderim en çok bu kadar yeniden denenir (her deneme MAIL_HATA'ya düşer). */
export const EN_COK_DENEME = 3
/** Süre hatırlatmaları İstanbul saatiyle bu saatten sonra gönderilir (gece yarısı e-postası gitmesin). */
export const GONDERIM_SAATI = 8

export type HatirlatmaKaydi = {
  esik: number
  hedef: string // YYYY-MM-DD (İstanbul)
  kaynak: 'ONAYLANAN' | 'IHTIYATLI'
  at: string // ISO an
  kip: string // resend | smtp | console
  gonderildi: boolean
  hata?: string
}

type Tarihli = Date | string | null | undefined

export function hatirlatmaGecmisi(j: unknown): HatirlatmaKaydi[] {
  const dizi = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { kayitlar?: unknown }).kayitlar) ? (j as { kayitlar: unknown[] }).kayitlar : []
  return dizi.filter((x): x is HatirlatmaKaydi =>
    !!x && typeof x === 'object' && typeof (x as HatirlatmaKaydi).esik === 'number' && typeof (x as HatirlatmaKaydi).hedef === 'string'
    && typeof (x as HatirlatmaKaydi).gonderildi === 'boolean')
}

/** Hatırlatmanın dayandığı gün: onaylanan, yoksa ihtiyatlı öneri. */
export function hatirlatmaHedefi(s: { onaylananSonGun: Tarihli; onerilenIhtiyatli: Tarihli }): { tarih: Date; kaynak: 'ONAYLANAN' | 'IHTIYATLI' } | null {
  const onay = tarihOku(s.onaylananSonGun)
  if (onay) return { tarih: onay, kaynak: 'ONAYLANAN' }
  const iht = tarihOku(s.onerilenIhtiyatli)
  if (iht) return { tarih: iht, kaynak: 'IHTIYATLI' }
  return null
}

/** Kalan güne göre güncel eşik: 7..4 → 7, 3..2 → 3, 1..0 → 1; pencere dışı ya da geçmiş → null. */
export function guncelEsik(kalan: number): number | null {
  if (kalan < 0) return null
  const uygun = HATIRLATMA_ESIKLERI.filter((e) => kalan <= e)
  return uygun.length ? Math.min(...uygun) : null
}

export type EpostaKipi = { kip: string; gercek: boolean }

/** EMAIL_SERVICE okuması (mail.ts ile aynı varsayılan: console). console = gerçek gönderim yok. */
export function epostaKipi(env: Record<string, string | undefined> = process.env): EpostaKipi {
  const kip = (env.EMAIL_SERVICE || 'console').toLowerCase()
  return { kip, gercek: kip !== 'console' }
}

/** İstanbul saatiyle gönderim penceresinde miyiz? */
export function gonderimSaatiMi(simdi: Date = new Date(), saat = GONDERIM_SAATI): boolean {
  const istSaat = new Date(simdi.getTime() + 3 * 3_600_000).getUTCHours()
  return istSaat >= saat
}

export type HatirlatmaSure = {
  durum: string
  silindiAt?: Tarihli
  tur: string
  onaylananSonGun: Tarihli
  onerilenIhtiyatli: Tarihli
  hatirlatmaJson: unknown
}

export type HatirlatmaKarari =
  | { gonder: true; esik: number; hedef: string; kaynak: 'ONAYLANAN' | 'IHTIYATLI'; kalan: number; hedefTarih: Date }
  | { gonder: false; sebep: string }

export function hatirlatmaKarari(s: HatirlatmaSure, simdi: Date, kip: EpostaKipi, ekGecmis: HatirlatmaKaydi[] = []): HatirlatmaKarari {
  if (s.silindiAt) return { gonder: false, sebep: 'silinmiş' }
  if (!(ACIK_DURUMLAR as readonly string[]).includes(s.durum)) return { gonder: false, sebep: `durum ${s.durum}` }
  if (!sureTuru(s.tur).eposta) return { gonder: false, sebep: 'bu süre türü e-posta almaz' }
  const h = hatirlatmaHedefi(s)
  if (!h) return { gonder: false, sebep: 'son gün yok' }
  const k = kalanGun(h.tarih, simdi)
  const esik = guncelEsik(k)
  if (esik == null) return { gonder: false, sebep: k < 0 ? 'son gün geçti' : 'pencere dışında' }
  const hedef = isoGun(h.tarih)
  const ayni = [...hatirlatmaGecmisi(s.hatirlatmaJson), ...ekGecmis].filter((x) => x.esik === esik && x.hedef === hedef)
  if (ayni.some((x) => x.gonderildi)) return { gonder: false, sebep: 'bu eşik gönderildi' }
  if (!kip.gercek && ayni.some((x) => x.kip === kip.kip)) return { gonder: false, sebep: 'console kipinde kaydedildi' }
  if (kip.gercek && ayni.filter((x) => x.kip === kip.kip && !x.gonderildi).length >= EN_COK_DENEME) return { gonder: false, sebep: 'deneme sınırı' }
  return { gonder: true, esik, hedef, kaynak: h.kaynak, kalan: k, hedefTarih: h.tarih }
}

export function hatirlatmaKaydiEkle(j: unknown, k: HatirlatmaKaydi, enCok = 40): HatirlatmaKaydi[] {
  return [...hatirlatmaGecmisi(j), k].slice(-enCok)
}

export function tekilAnahtar(s: { dosyaId: string; tur: string; borcluId: string | null }): string {
  return `${s.dosyaId}|${s.tur}|${s.borcluId ?? '-'}`
}

type Tekillesen = { id: string; dosyaId: string; tur: string; borcluId: string | null; onaylananSonGun: Tarihli; onerilenIhtiyatli: Tarihli; hatirlatmaJson: unknown }

/**
 * Aynı dosya + tür + borçlu için tek temsilci seçer: onaylanan günü olan (en erken) önce, yoksa en erken
 * ihtiyatlı gün. Diğer satırların geçmişi temsilcinin mükerrer kontrolüne katılır.
 */
export function tekillestir<T extends Tekillesen>(liste: T[]): { sure: T; digerGecmis: HatirlatmaKaydi[]; atlananIds: string[] }[] {
  const gruplar = new Map<string, T[]>()
  for (const s of liste) {
    const a = tekilAnahtar(s)
    gruplar.set(a, [...(gruplar.get(a) ?? []), s])
  }
  const puan = (s: T): [number, number] => {
    const onay = tarihOku(s.onaylananSonGun)
    if (onay) return [0, gunNo(onay)]
    const iht = tarihOku(s.onerilenIhtiyatli)
    return [1, iht ? gunNo(iht) : Number.MAX_SAFE_INTEGER]
  }
  const out: { sure: T; digerGecmis: HatirlatmaKaydi[]; atlananIds: string[] }[] = []
  for (const g of gruplar.values()) {
    const sirali = [...g].sort((a, b) => {
      const pa = puan(a), pb = puan(b)
      return pa[0] - pb[0] || pa[1] - pb[1]
    })
    const [ilk, ...digerleri] = sirali
    out.push({ sure: ilk, digerGecmis: digerleri.flatMap((d) => hatirlatmaGecmisi(d.hatirlatmaJson)), atlananIds: digerleri.map((d) => d.id) })
  }
  return out
}
