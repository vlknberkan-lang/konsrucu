/**
 * KonsRücü — Üslup kartı → sistem istemi eki · lib/konsrucu/dilekce-v2/uslup.ts (saf; client-safe)
 *
 * S36 (06 §7.1 "Üslup kartı"): "Yelda'nın 10–15 kuralı: hitap, paragraf uzunluğu, talep formülleri, tarih ve
 * tutar yazımı, delil listesi biçimi, kaçınılan ifadeler; 2–3 maskeli örnek paragraf." Kurallar MÜVEKKİL
 * bazındadır ve avukat onaylıdır: yalnız `durum === 'ONAYLI'` olanlar AI'ya gider (06 §7.5: "onaysız ve
 * otomatik öğrenme yoktur" — bu kural burada da geçerli, `ONERI` durumundaki adaylar prompt'a girmez).
 */
import type { KartTuru } from './tipler'

/** `UslupKurali` satırının bu modül için gereken alanları (sunucu tipi burada tekrar edilmez). */
export type UslupKuraliKaydi = {
  id: string
  /** HEPSI | DAVA | DELIL | CEVABA_CEVAP | BEYAN */
  kapsam: string
  metin: string
  ornek: string | null
  /** ONERI | ONAYLI | PASIF */
  durum: string
}

const EN_COK_ORNEK = 3

/** Bu türe uygulanan onaylı kurallar: HEPSI + türe özgü; sıra deterministiktir (HEPSI önce, sonra id). */
export function uygulanacakKurallar(kurallar: readonly UslupKuraliKaydi[], tur: KartTuru): UslupKuraliKaydi[] {
  return kurallar
    .filter((k) => k.durum === 'ONAYLI' && (k.kapsam === 'HEPSI' || k.kapsam === tur))
    .sort((a, b) => (a.kapsam === b.kapsam ? a.id.localeCompare(b.id) : a.kapsam === 'HEPSI' ? -1 : 1))
}

/**
 * Sistem istemine eklenecek üslup bölümü (deterministik metin). Onaylı kural yoksa null döner; çağıran bu
 * durumda `sistemEk` göndermez ve model varsayılan (nötr) üslupla yazar — bu bir hata değildir, yalnız bu
 * müvekkil için henüz onaylı üslup kartı yok demektir.
 */
export function uslupIstemi(kurallar: readonly UslupKuraliKaydi[], tur: KartTuru): string | null {
  const uygulanan = uygulanacakKurallar(kurallar, tur)
  if (!uygulanan.length) return null
  const kurallarMetni = uygulanan.map((k, i) => `${i + 1}. ${k.metin.trim()}`).join('\n')
  const ornekler = uygulanan.map((k) => k.ornek?.trim()).filter((x): x is string => !!x).slice(0, EN_COK_ORNEK)
  const ornekBlok = ornekler.length
    ? `\n\nBu büronun onaylı örnek paragrafları (yalnız biçem ve ton için; içindeki olguları KOPYALAMA):\n${ornekler.map((o, i) => `Örnek ${i + 1}: ${o}`).join('\n')}`
    : ''
  return `BU BÜRONUN ONAYLI ÜSLUP KURALLARI (uy; kart olgularıyla çelişiyorsa olgular önceliklidir):\n${kurallarMetni}${ornekBlok}`
}
