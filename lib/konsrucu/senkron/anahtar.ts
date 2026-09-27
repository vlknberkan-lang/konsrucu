/**
 * KonsRücü — Eklenti anahtarı (S14; F17, B51) · lib/konsrucu/senkron/anahtar.ts (saf; DB yok)
 *
 * Eski düzen: kiracı başına TEK düz metin anahtar (Ayarlar.senkronToken), kişiye bağlı değil, süresiz.
 * Yeni düzen (EklentiAnahtar):
 *  - anahtar kişiye bağlı (kullaniciId) ve bir müvekkil kiracısına bağlı (musteriId);
 *  - düz anahtar SAKLANMAZ: yalnız sha256 özeti (ozet) ve ekranda gösterilen ilk 6 karakter (onek);
 *  - 90 gün sonra kendiliğinden geçersiz olur; iptal edilebilir (satır silinmez, iptalAt dolar);
 *  - pasif kullanıcının ve GÖRÜNTÜLEYEN rolünün anahtarı çalışmaz (eklenti uçları veri yazar).
 *
 * Biçim: "kr2_" + 43 karakter base64url (32 rastgele bayt). Önek eski anahtardan ("kr_" + hex) ayırt eder;
 * eski anahtar yalnız eski uçlarda ve geçiş süresince kabul edilir (uyap-auth.ts).
 */
import { createHash, randomBytes } from 'node:crypto'

export const YENI_ANAHTAR_ONEKI = 'kr2_'
export const ANAHTAR_OMRU_GUN = 90
/** Süre dolumuna bu kadar gün kala ekranda ve eklentide "yakında dolacak" uyarısı çıkar. */
export const ANAHTAR_UYARI_GUN = 14
const GUN_MS = 86_400_000

const YENI_ANAHTAR_RE = /^kr2_[A-Za-z0-9_-]{40,64}$/

/** sha256(anahtar) — onaltılık. Veritabanında aranan tek değer budur. */
export function anahtarOzet(anahtar: string): string {
  return createHash('sha256').update(anahtar, 'utf8').digest('hex')
}

/** Gelen jeton yeni biçimde mi? (Eski "kr_…" anahtarlar false döner.) */
export function yeniAnahtarMi(jeton: string | null | undefined): boolean {
  return !!jeton && YENI_ANAHTAR_RE.test(jeton)
}

export type UretilenAnahtar = { anahtar: string; ozet: string; onek: string; sonKullanma: Date }

/** Yeni anahtar üretir. `anahtar` yalnız bir kez (oluşturma yanıtında) kullanıcıya gösterilir. */
export function anahtarUret(simdi: Date = new Date()): UretilenAnahtar {
  const govde = randomBytes(32).toString('base64url') // 43 karakter
  const anahtar = YENI_ANAHTAR_ONEKI + govde
  return { anahtar, ozet: anahtarOzet(anahtar), onek: govde.slice(0, 6), sonKullanma: new Date(simdi.getTime() + ANAHTAR_OMRU_GUN * GUN_MS) }
}

/** Ekranda gösterilen kısaltma: "kr2_Ab12Cd…". */
export function anahtarGosterim(onek: string): string {
  return `${YENI_ANAHTAR_ONEKI}${onek}…`
}

export type AnahtarDurumu = 'AKTIF' | 'YAKINDA_DOLACAK' | 'SURESI_DOLDU' | 'IPTAL'

/** Anahtarın ekrandaki durumu (iptal > süre doldu > yakında dolacak > aktif). */
export function anahtarDurumu(a: { iptalAt: Date | string | null; sonKullanma: Date | string }, simdi: Date = new Date()): AnahtarDurumu {
  if (a.iptalAt) return 'IPTAL'
  const son = new Date(a.sonKullanma).getTime()
  if (!Number.isFinite(son) || son <= simdi.getTime()) return 'SURESI_DOLDU'
  if (son - simdi.getTime() <= ANAHTAR_UYARI_GUN * GUN_MS) return 'YAKINDA_DOLACAK'
  return 'AKTIF'
}

/** Süre dolumuna kalan tam gün (negatif = doldu). */
export function anahtarKalanGun(sonKullanma: Date | string, simdi: Date = new Date()): number {
  return Math.floor((new Date(sonKullanma).getTime() - simdi.getTime()) / GUN_MS)
}

export type AnahtarKayit = {
  musteriId: string
  iptalAt: Date | null
  sonKullanma: Date
  kullanici: { aktif: boolean; rol: string; musteriler: { musteriId: string }[] } | null
}

export type AnahtarKarari = { ok: true } | { ok: false; sebep: 'IPTAL' | 'SURESI_DOLDU' | 'KULLANICI_PASIF' | 'YETKI_YOK' | 'KAPSAM_DISI' }

/**
 * Anahtar bu istekte kabul edilir mi? Veritabanından okunan satır + kullanıcı ile karar verir.
 *  - iptal edilmiş ya da süresi dolmuş → hayır;
 *  - kullanıcı pasif → hayır; GÖRÜNTÜLEYEN rolü → hayır (eklenti uçları veri yazar; B32);
 *  - kullanıcı artık o müvekkil kiracısının üyesi değil → hayır (kapsam).
 */
export function anahtarKarari(a: AnahtarKayit, simdi: Date = new Date()): AnahtarKarari {
  if (a.iptalAt) return { ok: false, sebep: 'IPTAL' }
  if (new Date(a.sonKullanma).getTime() <= simdi.getTime()) return { ok: false, sebep: 'SURESI_DOLDU' }
  const k = a.kullanici
  if (!k || !k.aktif) return { ok: false, sebep: 'KULLANICI_PASIF' }
  if (k.rol === 'GORUNTULEYEN') return { ok: false, sebep: 'YETKI_YOK' }
  if (!k.musteriler.some((m) => m.musteriId === a.musteriId)) return { ok: false, sebep: 'KAPSAM_DISI' }
  return { ok: true }
}

/** Anahtar oluşturabilir mi? Aktif ve GÖRÜNTÜLEYEN dışı kullanıcı. */
export function anahtarOlusturabilir(k: { aktif?: boolean | null; rol?: string | null } | null | undefined): boolean {
  return !!k && k.aktif !== false && !!k.rol && k.rol !== 'GORUNTULEYEN'
}

/** Anahtarı iptal edebilir mi? Sahibi ya da aynı kiracıda ADMIN. */
export function anahtarIptalEdebilir(k: { id: string; rol: string; aktif?: boolean | null }, anahtarSahibiId: string): boolean {
  if (k.aktif === false) return false
  return k.id === anahtarSahibiId || k.rol === 'ADMIN'
}

/** "sonGorulme" damgası en çok bu sıklıkta yazılır (her istekte yazma yükü olmasın). */
export const SON_GORULME_ARALIK_MS = 60_000

export function sonGorulmeYazilsinMi(sonGorulme: Date | null, simdi: Date = new Date()): boolean {
  return !sonGorulme || simdi.getTime() - new Date(sonGorulme).getTime() >= SON_GORULME_ARALIK_MS
}
