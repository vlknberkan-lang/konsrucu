/**
 * KonsRücü — Dosya AKTİFLİK kapısı · lib/konsrucu/aktiflik.ts  (client-safe; DB/Prisma yok)
 *
 * TEK KAYNAK: bir dosya tekrarlayan/pahalı otomasyona — UYAP poll (eklenti hedef listesi), evrak
 * indirme, masraf AI çıkarımı — dahil edilmeli mi? Kapanmış dosyaları döngüden düşürür (maliyet + boşa-loop).
 *
 * İki sinyal:
 *   1) dosya.durum (yaşam döngüsü)  → TAHSIL / KAPANDI / IDARI_YOL = kapalı.
 *   2) uyapDurum (UYAP'ın serbest metni) → açık/kapalı için YETKİLİ kaynak (hafıza: uyap-dosya-durum-kontrol).
 *      UYAP "Kapalı"/"Kapandı"/"İnfazen kapandı" derse, dosya.durum güncellenmemiş olsa bile loop'tan çıkar.
 *
 * Kapı yalnız OTOMASYON kapsamını daraltır — dosya silinmez, detay ekranı + elle işlem etkilenmez.
 */

/** Yaşam döngüsünde "kapalı" sayılan durum kodları (Prisma where `durum: { notIn }` ile aynı). */
export const KAPALI_DURUMLAR = ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] as const

/**
 * UYAP'ın serbest durum metni dosyanın KAPALI olduğunu mu söylüyor?
 * "Kapalı" → "kapal", "Kapandı"/"İnfazen kapandı" → "kapan" köküyle yakalanır (Türkçe büyük/küçük İ/ı
 * sorunundan kaçınmak için ASCII kökünde case-insensitive regex). "Açık"/"Derdest" → false.
 */
export function uyapKapaliMi(uyapDurum: string | null | undefined): boolean {
  if (!uyapDurum) return false
  return /kapa(l|n)/i.test(uyapDurum)
}

/** Dosya tekrarlayan otomasyona dahil edilmeli mi? (kapalı durum / UYAP-kapalı → false) */
export function dosyaAktif(d: { durum?: string | null; uyapDurum?: string | null }): boolean {
  if (d.durum && (KAPALI_DURUMLAR as readonly string[]).includes(d.durum)) return false
  if (uyapKapaliMi(d.uyapDurum)) return false
  return true
}
