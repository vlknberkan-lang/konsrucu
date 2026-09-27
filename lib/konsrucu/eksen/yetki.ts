/**
 * KonsRücü — Onay kartı yetkileri · lib/konsrucu/eksen/yetki.ts (saf, client-safe)
 *
 * 06 §2 "Bilgi sınıfları" ve §8.3 rol sütunu: tebliğ, itiraz ve kesinleşme ONAYI, adayın reddi ve onayın geri
 * alınması KARARDIR → yalnız AVUKAT ya da ADMIN (TB-01, TB-07; kesinleşme riski azaltır). İtirazın size tebliğ
 * tarihini girmek (TB-08 "Tarih gir") ve evraktan yeniden okumak HAZIRLIKTIR → avukat yardımcısı da yapabilir.
 * GÖRÜNTÜLEYEN ve pasif kullanıcı hiçbir şey yazamaz. Sunucu eylemi bu kontrolü her çağrıda yeniden yapar.
 */

export type OlayEylemi = 'ONAY' | 'TARIH_GIR' | 'OKU'

const ROLLER: Record<OlayEylemi, readonly string[]> = {
  ONAY: ['AVUKAT', 'ADMIN'],
  TARIH_GIR: ['AVUKAT', 'ADMIN', 'AVUKAT_YRD'],
  OKU: ['AVUKAT', 'ADMIN', 'AVUKAT_YRD'],
}

export const OLAY_YETKI_YOK: Record<OlayEylemi, string> = {
  ONAY: 'Bu onayı yalnız avukat ya da yönetici (ADMIN) verebilir. Adım avukat onayını bekliyor.',
  TARIH_GIR: 'Bu işlem için yetkiniz yok.',
  OKU: 'Bu işlem için yetkiniz yok.',
}

export function olayYetkisi(k: { rol?: string | null; aktif?: boolean | null } | null | undefined, eylem: OlayEylemi): boolean {
  if (!k || k.aktif === false || !k.rol) return false
  return ROLLER[eylem].includes(k.rol)
}
