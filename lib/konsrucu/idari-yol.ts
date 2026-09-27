/**
 * KonsRücü — İdari yol kararı · lib/konsrucu/idari-yol.ts  (saf; DB/Prisma yok, client-safe)
 *
 * Sorun (F18; B12): AI triyajı `yol = 'idari'` dediğinde dosya açılışta ONAYSIZ İDARİ_YOL durumuna
 * geçiyordu; İDARİ_YOL da "kapalı" sayıldığı için görev hatırlatması ve zamanaşımı radarı susuyordu.
 *
 * Kural (S06):
 *   - AI'ın yol önerisi DURUMU DEĞİŞTİRMEZ. Dosya İNCELENİYOR açılır; öneri `yol`, `yolGuven`, `yolNeden`
 *     alanlarında kalır ve Dosya Detay'da "AI idari yol öneriyor" bandıyla avukata sorulur.
 *   - İDARİ_YOL'a yalnız AVUKAT ya da ADMIN geçirir (sunucu tarafında da denetlenir: action doğrudan
 *     çağrılabilir, düğmeyi gizlemek yetmez). Onay `Aktivite`'ye yazılır; `yolOnaylayanId` kolonu 003 SQL'iyle
 *     gelir (B1b) — o zamana kadar tek iz Aktivite.detayJson'dur.
 *   - Yalnız takip ÖNCESİ bir dosya idari yola alınabilir: takip açılmış dosyada icra dosyası vardır.
 *
 * Hukuki not: idari yolun hangi borçlularda zorunlu/uygun olduğu (kamu idaresi, YİD işletmecisi ayrımı) ve
 * İYUK 13 / 7 süreleri bu modülde KURAL OLARAK YOKTUR — teyit gerekli (açık karar 20; süreler S24'te).
 */

/** İdari yola geçişi onaylayabilen roller (Prisma `Rol` enum değerleri). */
export const IDARI_YOL_ONAY_ROLLERI = ['AVUKAT', 'ADMIN'] as const

/** İdari yola alınabilen durumlar: takip öncesi. (İDARİ_YOL zaten oradaysa tekrar alınmaz.) */
export const IDARI_YOLA_ALINABILIR = ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'] as const

/** Yetkisiz kullanıcıya dönen standart hata. */
export const IDARI_YOL_YETKI_YOK = 'İdari yola geçişi yalnız avukat ya da yönetici (ADMIN) onaylayabilir.'

/** Kullanıcı idari yol kararını verebilir mi? (AVUKAT/ADMIN ve pasifleştirilmemiş.) */
export function idariYolOnaylayabilir(k: { rol?: string | null; aktif?: boolean | null } | null | undefined): boolean {
  if (!k || k.aktif === false) return false
  return !!k.rol && (IDARI_YOL_ONAY_ROLLERI as readonly string[]).includes(k.rol)
}

/** Dosya bu durumdayken idari yola alınabilir mi? */
export function idariYolaAlinabilirMi(durum: string | null | undefined): boolean {
  return !!durum && (IDARI_YOLA_ALINABILIR as readonly string[]).includes(durum)
}

/** Dosya Detay bandı görünsün mü: AI idari yol önerdi, dosya henüz idari yolda değil ve takip öncesi. */
export function idariYolOnerisiBekliyor(d: { yol?: string | null; durum?: string | null }): boolean {
  return d.yol === 'IDARI' && idariYolaAlinabilirMi(d.durum)
}

/** Güven değerini yüzdeye çevir (0–1 → %; bozuksa null). */
export function guvenYuzde(g: number | null | undefined): number | null {
  if (g == null || !Number.isFinite(g)) return null
  return Math.round(Math.min(1, Math.max(0, g)) * 100)
}

/** "İdari yola al" Aktivite metni: kim karar verdi + AI önerisinin güveni ve gerekçesi (kısaltılmış). */
export function idariYolAktiviteMetni(p: { yolGuven?: number | null; yolNeden?: string | null; oncekiDurum: string }): string {
  const g = guvenYuzde(p.yolGuven)
  const neden = (p.yolNeden ?? '').replace(/\s+/g, ' ').trim()
  const nedenKisa = neden.length > 160 ? `${neden.slice(0, 157)}…` : neden
  return `İdari yola alındı (avukat kararı; önceki durum ${p.oncekiDurum})` +
    (g != null ? ` · AI önerisi güven %${g}` : '') +
    (nedenKisa ? ` · gerekçe: ${nedenKisa}` : '')
}
