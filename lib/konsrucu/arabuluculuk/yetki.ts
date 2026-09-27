/**
 * KonsRücü — arabuluculuk/dava ekranlarında rol kapıları · lib/konsrucu/arabuluculuk/yetki.ts (saf)
 *
 * Sunucu tarafında da denetlenir (action doğrudan çağrılabilir; düğmeyi gizlemek yetmez).
 *  - Veri girişi (kayıt, toplantı, işlem, tarih): pasif olmayan ve GORUNTULEYEN olmayan herkes (06 §8.3 "H").
 *  - Hukuki karar (tür seçimi, yol seçimi, müvekkil onayı kaydı, son tutanak onayı, İİK 67 kapanışı, karar kartı,
 *    ön kontrol geçişi, kapanış sebebi): yalnız AVUKAT ve ADMIN (06 §8.3 "A").
 */
export type Kullanici = { rol?: string | null; aktif?: boolean | null }

export const YETKI_YOK_YAZMA = 'Bu işlem için yetkiniz yok (görüntüleyen ya da pasif kullanıcı).'
export const YETKI_YOK_AVUKAT = 'Bu kararı yalnız avukat ya da yönetici (ADMIN) verebilir.'

export function yazabilir(k: Kullanici | null | undefined): boolean {
  return !!k && k.aktif !== false && !!k.rol && k.rol !== 'GORUNTULEYEN'
}

export function avukatMi(k: Kullanici | null | undefined): boolean {
  return !!k && k.aktif !== false && (k.rol === 'AVUKAT' || k.rol === 'ADMIN')
}
