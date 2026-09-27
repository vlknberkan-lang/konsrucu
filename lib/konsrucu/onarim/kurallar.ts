/**
 * KonsRücü — Veri Onarımı kuralları · lib/konsrucu/onarim/kurallar.ts (saf; DB yok)
 *
 * Kaynak: 06 §6.2–6.4, 07 S13, 08 §4.
 *  - Partiler en çok 20 satırdır.
 *  - Durum ve süre etkileyen satırlar (R0, R2, R3, R5, R7) TEK TEK onaylanır; toplu onay yoktur.
 *  - Mekanik parti (R1, para biçimi): toplu onay ancak 5 örnek Hugo ve dekontla ELLE teyit edildikten
 *    sonra açılır ve yalnız güven sınıfı A (yüksek) satırları kapsar; B ve C satırları yine tek tek.
 *  - Satır durumları: KURU → ONAYLI | REDDEDILDI → UYGULANDI | ATLANDI → GERI_ALINDI. VeriOnarim silinmez.
 */

export const ONARIM_KODLARI = ['R0', 'R1', 'R2', 'R3', 'R5', 'R7'] as const
export type OnarimKodu = (typeof ONARIM_KODLARI)[number]

export const SATIR_DURUMLARI = ['KURU', 'ONAYLI', 'REDDEDILDI', 'UYGULANDI', 'ATLANDI', 'GERI_ALINDI'] as const
export type SatirDurumu = (typeof SATIR_DURUMLARI)[number]

export const GUVEN_SINIFLARI = ['A', 'B', 'C'] as const
export type GuvenSinifi = (typeof GUVEN_SINIFLARI)[number]

export const PARTI_EN_COK = 20
export const ORNEK_TEYIT_ESIGI = 5
export const ORNEK_TEYIT_ONEKI = 'ÖRNEK TEYİT'
export const TOPLU_ONAY_NOTU = 'TOPLU ONAY (5 örnek elle teyit edildikten sonra)'

export type KodMeta = { etiket: string; aciklama: string; topluOnay: boolean; durumEtkiler: boolean; partiEtiketi: string }

export const KOD_META: Record<OnarimKodu, KodMeta> = {
  R0: { etiket: 'İİK 67 süre aktarımı', aciklama: 'Satır satır onaylanır (hak düşürücü süre; toplu onay yok). Uygulanınca Sure satırı açılır.', topluOnay: false, durumEtkiler: false, partiEtiketi: 'IIK67' },
  R1: { etiket: 'Tutar (para biçimi)', aciklama: 'Toplu onay yalnız 5 örnek Hugo ve dekontla elle teyit edildikten sonra ve yalnız A sınıfı satırlarda açılır.', topluOnay: true, durumEtkiler: false, partiEtiketi: 'TUTAR' },
  R2: { etiket: 'Kanıtsız KESİNLEŞTİ', aciklama: 'Durum satırları tek tek onaylanır; yalnız yeni icra ekseni yazılır.', topluOnay: false, durumEtkiler: true, partiEtiketi: 'DURUM' },
  R3: { etiket: 'Kaçmış itirazlar', aciklama: 'Tek tek onaylanır.', topluOnay: false, durumEtkiler: true, partiEtiketi: 'ITIRAZ' },
  R5: { etiket: 'İİK 78 görevleri', aciklama: 'Tek tek onaylanır; toplu iptal yok.', topluOnay: false, durumEtkiler: true, partiEtiketi: 'IIK78' },
  R7: { etiket: 'D1–D3 geri doldurma', aciklama: 'Tek tek onaylanır.', topluOnay: false, durumEtkiler: false, partiEtiketi: 'GERIDOLDUR' },
}

export function kodMeta(kod: string): KodMeta {
  return (KOD_META as Record<string, KodMeta>)[kod] ?? { etiket: kod, aciklama: 'Tek tek onaylanır.', topluOnay: false, durumEtkiler: true, partiEtiketi: kod }
}

export const DURUM_KODLARI: readonly string[] = ONARIM_KODLARI.filter((k) => KOD_META[k].durumEtkiler)

export type SatirKarari = 'ONAYLA' | 'REDDET' | 'SONRA' | 'KARARI_GERI_AL'

/** Avukat kararının satır durumuna etkisi. Uygulanmış satırlar karar ile değil "geri al" ile döner. */
export function kararGecisi(durum: string, karar: SatirKarari): { ok: true; yeni: SatirDurumu } | { ok: false; hata: string } {
  if (karar === 'SONRA') {
    return durum === 'KURU' ? { ok: true, yeni: 'KURU' } : { ok: false, hata: 'Yalnız kuru satır sonraya bırakılabilir.' }
  }
  if (karar === 'ONAYLA') {
    return durum === 'KURU' ? { ok: true, yeni: 'ONAYLI' } : { ok: false, hata: 'Yalnız kuru satır onaylanabilir.' }
  }
  if (karar === 'REDDET') {
    return durum === 'KURU' || durum === 'ONAYLI' ? { ok: true, yeni: 'REDDEDILDI' } : { ok: false, hata: 'Uygulanmış satır reddedilemez; önce geri alın.' }
  }
  // KARARI_GERI_AL
  return durum === 'ONAYLI' || durum === 'REDDEDILDI' ? { ok: true, yeni: 'KURU' } : { ok: false, hata: 'Yalnız onaylı ya da reddedilmiş (uygulanmamış) satırın kararı geri alınabilir.' }
}

/** Satırın "örnek teyidi" sayılıp sayılmadığı: tek tek onaylanmış, notu örnek önekiyle başlıyor, geri alınmamış. */
export function ornekTeyitliMi(s: { durum: string; not: string | null }): boolean {
  return (s.durum === 'ONAYLI' || s.durum === 'UYGULANDI') && (s.not ?? '').startsWith(ORNEK_TEYIT_ONEKI)
}

export function topluOnayDurumu(kod: string, ornekSayisi: number): { acik: boolean; sebep: string } {
  if (!kodMeta(kod).topluOnay) return { acik: false, sebep: 'Bu partide toplu onay yok; satırlar tek tek onaylanır.' }
  if (ornekSayisi < ORNEK_TEYIT_ESIGI) return { acik: false, sebep: `Toplu onay için önce ${ORNEK_TEYIT_ESIGI} örnek Hugo ve dekontla elle teyit edilmeli (${ornekSayisi}/${ORNEK_TEYIT_ESIGI}).` }
  return { acik: true, sebep: '' }
}

/** Toplu onayın kapsayabileceği satır: kuru ve A sınıfı. */
export function topluOnaylanabilirMi(s: { durum: string; guvenSinifi: string }): boolean {
  return s.durum === 'KURU' && s.guvenSinifi === 'A'
}

export function partiAdi(kod: string, etiket: string, sira: number): string {
  return `${kod}-${etiket}-${String(sira).padStart(2, '0')}`
}

/** "R1-TUTAR-07" → 7 (aynı önekte sıra devam etsin). */
export function partiSirasi(parti: string, onek: string): number | null {
  if (!parti.startsWith(`${onek}-`)) return null
  const n = Number(parti.slice(onek.length + 1))
  return Number.isInteger(n) && n > 0 ? n : null
}

export function partilereBol<T>(satirlar: T[], kod: string, etiket: string, baslangicSira = 1, boyut = PARTI_EN_COK): { parti: string; satirlar: T[] }[] {
  const out: { parti: string; satirlar: T[] }[] = []
  for (let i = 0; i < satirlar.length; i += boyut) {
    out.push({ parti: partiAdi(kod, etiket, baslangicSira + out.length), satirlar: satirlar.slice(i, i + boyut) })
  }
  return out
}

/**
 * RucuDosyasi.onarimDurumu ("Durum teyit gerekiyor" bandı, GN-01): dosyanın DURUM etkileyen onarım
 * satırlarından türetilir. Bekleyen (KURU/ONAYLI), atlanan ya da geri alınan satır varsa BEKLIYOR; hepsi
 * uygulanmış ya da reddedilmişse ONARILDI; hiç satır yoksa null (dokunulmaz).
 */
export function onarimDurumuHesapla(durumlar: readonly string[]): 'BEKLIYOR' | 'ONARILDI' | null {
  if (!durumlar.length) return null
  if (durumlar.some((d) => d === 'KURU' || d === 'ONAYLI' || d === 'ATLANDI' || d === 'GERI_ALINDI')) return 'BEKLIYOR'
  return 'ONARILDI'
}

export const DURUM_ETIKET: Record<SatirDurumu, { label: string; tone: 'steel' | 'info' | 'danger' | 'success' | 'warning' | 'kr' }> = {
  KURU: { label: 'Kuru', tone: 'steel' },
  ONAYLI: { label: 'Onaylı', tone: 'info' },
  REDDEDILDI: { label: 'Reddedildi', tone: 'danger' },
  UYGULANDI: { label: 'Uygulandı', tone: 'success' },
  ATLANDI: { label: 'Atlandı', tone: 'warning' },
  GERI_ALINDI: { label: 'Geri alındı', tone: 'kr' },
}
