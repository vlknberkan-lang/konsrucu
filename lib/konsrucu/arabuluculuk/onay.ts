/**
 * KonsRücü — müvekkil onayı kapısı · lib/konsrucu/arabuluculuk/onay.ts (saf)
 *
 * Dava açma, takibi bırakma, sulh/iskonto ve kanun yolu kararı MÜVEKKİLİNDİR (06 2(f), 2(j); B16):
 * avukat önerir, sigortacı onaylar, onay `OnayKaydi`'na yazılır. Onay kaydı yokken dava ön kontrolü ve
 * "imzaya hazır" KİLİTLİDİR.
 *
 * Tek istisna (açık karar 4, varsayılan "engel + istisna"): İİK 67 İHTİYATLI son güne 14 gün ya da daha az
 * kaldıysa avukat YAZILI GEREKÇEYLE kilidi açar; istisna `OnayKaydi.istisnaGerekce`'ye yazılır ve müvekkile
 * bildirim taslağı hazırlanır. Sulh/iskonto ve kanun yolunda istisna yoktur.
 */
import { GEREKCE_ASGARI, ONAY_ISTISNA_ESIK_GUN, type OnayTuru } from './sabitler'
import { gunFarki } from './tarih'

export type OnayKaydiOzet = {
  id: string
  tur: string
  sonuc: string // BEKLIYOR | ONAY | RET
  alinmaAt: Date | null
  istisnaGerekce: string | null
  silindiAt?: Date | null
  tutar?: number | null
  onaylayanUnvan?: string | null
  davaId?: string | null
}

export type KapiDurumu =
  | { acik: true; neden: 'ONAY'; onay: OnayKaydiOzet }
  | { acik: true; neden: 'ISTISNA'; onay: OnayKaydiOzet }
  | { acik: false; neden: 'RET'; mesaj: string; istisnaMumkun: boolean; kalanGun: number | null }
  | { acik: false; neden: 'YOK' | 'BEKLIYOR'; mesaj: string; istisnaMumkun: boolean; kalanGun: number | null }

/** Canlı (silinmemiş) onay kayıtları, en yeni önce. */
function canli(onaylar: OnayKaydiOzet[], tur: string, davaId?: string | null): OnayKaydiOzet[] {
  return onaylar
    .filter((o) => !o.silindiAt && o.tur === tur && (davaId === undefined || !o.davaId || o.davaId === davaId))
    .sort((a, b) => (b.alinmaAt?.getTime() ?? 0) - (a.alinmaAt?.getTime() ?? 0))
}

/** İstisna mümkün mü: yalnız DAVA_ACMA'da ve ihtiyatlı son güne ≤ 14 gün kaldıysa (geçmişse de). */
export function istisnaMumkunMu(tur: OnayTuru | string, ihtiyatliSonGun: Date | null, simdi: Date = new Date()): { mumkun: boolean; kalanGun: number | null } {
  if (tur !== 'DAVA_ACMA' || !ihtiyatliSonGun) return { mumkun: false, kalanGun: ihtiyatliSonGun ? gunFarki(simdi, ihtiyatliSonGun) : null }
  const kalanGun = gunFarki(simdi, ihtiyatliSonGun)
  return { mumkun: kalanGun <= ONAY_ISTISNA_ESIK_GUN, kalanGun }
}

/**
 * Müvekkil onayı kapısı. En son ONAY kaydı kapıyı açar; son karar RET ise kapalıdır (yeni onay gerekir).
 * `istisnaGerekce` taşıyan BEKLIYOR kaydı, yalnız istisna koşulu (≤ 14 gün) hâlâ geçerliyse kapıyı açar.
 */
export function musteriOnayiKapisi(
  tur: OnayTuru,
  onaylar: OnayKaydiOzet[],
  opts: { ihtiyatliSonGun?: Date | null; simdi?: Date; davaId?: string | null } = {},
): KapiDurumu {
  const simdi = opts.simdi ?? new Date()
  const liste = canli(onaylar, tur, opts.davaId)
  const { mumkun, kalanGun } = istisnaMumkunMu(tur, opts.ihtiyatliSonGun ?? null, simdi)
  const karar = liste.find((o) => o.sonuc === 'ONAY' || o.sonuc === 'RET')
  if (karar?.sonuc === 'ONAY') return { acik: true, neden: 'ONAY', onay: karar }
  const istisna = liste.find((o) => o.sonuc === 'BEKLIYOR' && (o.istisnaGerekce ?? '').trim().length >= GEREKCE_ASGARI)
  if (istisna && mumkun) return { acik: true, neden: 'ISTISNA', onay: istisna }
  if (karar?.sonuc === 'RET') {
    return { acik: false, neden: 'RET', mesaj: 'Müvekkil bu kararı reddetti: yeni onay olmadan ilerlenemez.', istisnaMumkun: mumkun, kalanGun }
  }
  const bekliyor = liste.some((o) => o.sonuc === 'BEKLIYOR')
  return {
    acik: false,
    neden: bekliyor ? 'BEKLIYOR' : 'YOK',
    mesaj: bekliyor ? 'Müvekkil onayı bekleniyor.' : 'Müvekkil onayı kayıtlı değil: önce onay talebi gönderin.',
    istisnaMumkun: mumkun,
    kalanGun,
  }
}

/** İstisna girdisini doğrula (sunucu tarafı; düğmeyi gizlemek yetmez). */
export function istisnaDogrula(p: { tur: string; gerekce: string | null | undefined; ihtiyatliSonGun: Date | null; simdi?: Date }): { ok: true } | { ok: false; hata: string } {
  if (p.tur !== 'DAVA_ACMA') return { ok: false, hata: 'Süre koruma istisnası yalnız dava açma onayında kullanılabilir.' }
  if (!p.ihtiyatliSonGun) return { ok: false, hata: 'İİK 67 ihtiyatlı son günü olmadan istisna kullanılamaz.' }
  const { mumkun, kalanGun } = istisnaMumkunMu(p.tur, p.ihtiyatliSonGun, p.simdi)
  if (!mumkun) return { ok: false, hata: `İstisna yalnız ihtiyatlı son güne ${ONAY_ISTISNA_ESIK_GUN} gün ya da daha az kaldığında kullanılabilir (kalan ${kalanGun} gün).` }
  if ((p.gerekce ?? '').trim().length < GEREKCE_ASGARI) return { ok: false, hata: 'İstisna için yazılı gerekçe girin.' }
  return { ok: true }
}

/** "Telefon hazır" özetindeki onay sınırı: en son SULH_ISKONTO ONAY kaydının tutarı. */
export function onaySiniri(onaylar: OnayKaydiOzet[]): { tutar: number | null; unvan: string | null; tarih: Date | null } | null {
  const o = canli(onaylar, 'SULH_ISKONTO').find((x) => x.sonuc === 'ONAY')
  return o ? { tutar: o.tutar ?? null, unvan: o.onaylayanUnvan ?? null, tarih: o.alinmaAt } : null
}
