/**
 * KonsRücü — tahsilat onay kartı ve para toplamı (S31, SN-07) · lib/konsrucu/dava/tahsilat-onay.ts (saf)
 *
 * 06 2(j), §3.6: tahsilat YALNIZ UYAP hesabındaki "Yatan Para" farkından doğar: fark kadar
 * `TakipOlayi(altTip = TAHSILAT_BORCLUDAN, teyit = ADAY)` (S15, lib/icra/tahsilat.ts). Bu modül:
 *  - onay bekleyen adayları listeler (SN-07 kartı),
 *  - Para paneli ve Ray raporu toplamını YALNIZ onaylı (TEYITLI) TAHSILAT_BORCLUDAN'dan hesaplar.
 * Evrak adından gelen iz (TAHSILAT_SINYALI, eski tip=TAHSILAT satırları, "Tahsilat Makbuzu") HİÇBİR toplama girmez.
 * Tarih "senkronda görüldü" tarihidir, hukuki tahsil tarihi değildir.
 */

export type TahsilatOlayi = {
  id: string
  tip: string
  altTip: string | null
  teyit: string | null
  tutar: number | null
  tarih: Date | null
  createdAt: Date
  aciklama?: string | null
}

export const TAHSILAT_ALT_TIP = 'TAHSILAT_BORCLUDAN'

/** Onay bekleyen tahsilat adayları (SN-07). */
export function tahsilatAdaylari(olaylar: TahsilatOlayi[]): TahsilatOlayi[] {
  return olaylar.filter((o) => o.altTip === TAHSILAT_ALT_TIP && o.teyit === 'ADAY' && (o.tutar ?? 0) > 0)
}

/** Onaylı tahsil toplamı: yalnız TEYITLI TAHSILAT_BORCLUDAN. */
export function tahsilToplami(olaylar: TahsilatOlayi[]): number {
  const t = olaylar
    .filter((o) => o.altTip === TAHSILAT_ALT_TIP && o.teyit === 'TEYITLI')
    .reduce((a, o) => a + (o.tutar ?? 0), 0)
  return Math.round(t * 100) / 100
}

/** Para paneli: talep / tahsil / kalan. Talep bilinmiyorsa kalan hesaplanmaz. */
export function paraOzeti(p: { talep: number | null; olaylar: TahsilatOlayi[] }): { talep: number | null; tahsil: number; kalan: number | null; bekleyenAday: number } {
  const tahsil = tahsilToplami(p.olaylar)
  const bekleyenAday = tahsilatAdaylari(p.olaylar).length
  return { talep: p.talep, tahsil, kalan: p.talep != null ? Math.round((p.talep - tahsil) * 100) / 100 : null, bekleyenAday }
}

/** Onay/ret sunucu kontrolü: yalnız ADAY TAHSILAT_BORCLUDAN karara bağlanabilir. */
export function tahsilatKararVerilebilirMi(o: Pick<TahsilatOlayi, 'altTip' | 'teyit'>): { ok: true } | { ok: false; hata: string } {
  if (o.altTip !== TAHSILAT_ALT_TIP) return { ok: false, hata: 'Bu kayıt UYAP "Yatan Para" farkından doğan bir tahsilat adayı değil: toplama giremez.' }
  if (o.teyit !== 'ADAY') return { ok: false, hata: 'Bu tahsilat adayı zaten karara bağlanmış.' }
  return { ok: true }
}
