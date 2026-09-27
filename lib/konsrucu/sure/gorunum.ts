/**
 * KonsRücü — Süre defteri görünüm modeli · lib/konsrucu/sure/gorunum.ts (saf, client-safe)
 *
 * DB satırını (Sure + dosya künyesi) ekranda kullanılan düz, serileştirilebilir SureSatiri'na çevirir;
 * durum etiketi, kalan gün, Şimdi kartı önerisi (GN-04 / GN-05, 06 §8.3) burada hesaplanır.
 * Kişisel veri: borçlu yalnız sıra etiketiyle ("Borçlu 2") gösterilir; TCKN/telefon/IBAN hiç taşınmaz.
 */
import { kalanGun } from '@/lib/konsrucu/format'
import { hesapIziOku } from './hesap'
import { hatirlatmaGecmisi, hatirlatmaHedefi, type HatirlatmaKaydi } from './hatirlatma'
import { gunTR } from './takvim'
import { ACIK_DURUMLAR, GRUP_ETIKET, TEYIT_GEREKLI, sureTuru } from './turler'

type Tarihli = Date | string | null | undefined
const iso = (d: Tarihli): string | null => (d == null ? null : new Date(d).toISOString())

/** Ekranda gösterilen süre satırı (client'a gider — yalnız ISO string ve düz alanlar). */
export type SureSatiri = {
  id: string
  dosyaId: string
  dosyaNo: string
  icraNo: string | null
  borcluId: string | null
  borcluEtiket: string | null
  davaId: string | null
  tur: string
  turEtiket: string
  turAd: string
  grupEtiket: string
  dayanak: string
  kritik: boolean
  tetikAciklama: string
  tetikTarihi: string | null
  tetikTuru: string | null
  uetsUlasmaTarihi: string | null
  hakimSuresiGun: number | null
  kesinSureIhtari: boolean | null
  kaynakAlinti: string | null
  kaynakBelgeId: string | null
  onerilenIhtiyatli: string | null
  onerilenSonGun: string | null
  onaylananSonGun: string | null
  onaylayanAd: string | null
  onayAt: string | null
  bakilanEvrak: string | null
  ikinciTeyitAd: string | null
  ikinciTeyitAt: string | null
  onaylayanId: string | null
  sorumluAd: string | null
  durum: string
  kapanisNot: string | null
  kapanisAt: string | null
  kapanisKanitiBelgeId: string | null
  iz: string[]
  uyarilar: string[]
  eksik: string | null
  hatirlatmalar: HatirlatmaKaydi[]
}

/** DB'den okunan ham satır (Prisma select'iyle aynı şekil). */
export type SureHam = {
  id: string
  dosyaId: string
  borcluId: string | null
  davaId: string | null
  tur: string
  dayanak: string
  kaynakBelgeId: string | null
  kaynakAlinti: string | null
  tetikTarihi: Tarihli
  tetikTuru: string | null
  uetsUlasmaTarihi: Tarihli
  hakimSuresiGun: number | null
  kesinSureIhtari: boolean | null
  onerilenIhtiyatli: Tarihli
  onerilenSonGun: Tarihli
  hesapIziJson: unknown
  onaylananSonGun: Tarihli
  onaylayanId: string | null
  onayAt: Tarihli
  bakilanEvrak: string | null
  ikinciTeyitId: string | null
  ikinciTeyitAt: Tarihli
  sorumluId: string | null
  durum: string
  kapanisKanitiBelgeId: string | null
  kapanisNot: string | null
  kapanisAt: Tarihli
  hatirlatmaJson: unknown
  dosya: { hukukDosyaNo: string | null; hasarDosyaNo: string | null; icraDosyaNo: string | null }
}

export function sureSatirinaCevir(
  s: SureHam,
  ek: { kullaniciAdlari?: Map<string, string>; borcluSirasi?: Map<string, number> } = {},
): SureSatiri {
  const t = sureTuru(s.tur)
  const hi = hesapIziOku(s.hesapIziJson)
  const ad = (id: string | null) => (id ? ek.kullaniciAdlari?.get(id) ?? 'Kayıtlı kullanıcı' : null)
  const sira = s.borcluId ? ek.borcluSirasi?.get(s.borcluId) : undefined
  return {
    id: s.id,
    dosyaId: s.dosyaId,
    dosyaNo: s.dosya.hukukDosyaNo ?? s.dosya.hasarDosyaNo ?? s.dosyaId.slice(0, 8),
    icraNo: s.dosya.icraDosyaNo,
    borcluId: s.borcluId,
    borcluEtiket: s.borcluId ? (sira ? `Borçlu ${sira}` : 'Borçlu') : null,
    davaId: s.davaId,
    tur: s.tur,
    turEtiket: t.etiket,
    turAd: t.ad,
    grupEtiket: GRUP_ETIKET[t.grup],
    dayanak: s.dayanak || t.dayanak,
    kritik: t.kritik,
    tetikAciklama: t.tetik,
    tetikTarihi: iso(s.tetikTarihi),
    tetikTuru: s.tetikTuru,
    uetsUlasmaTarihi: iso(s.uetsUlasmaTarihi),
    hakimSuresiGun: s.hakimSuresiGun,
    kesinSureIhtari: s.kesinSureIhtari,
    kaynakAlinti: s.kaynakAlinti,
    kaynakBelgeId: s.kaynakBelgeId,
    onerilenIhtiyatli: iso(s.onerilenIhtiyatli),
    onerilenSonGun: iso(s.onerilenSonGun),
    onaylananSonGun: iso(s.onaylananSonGun),
    onaylayanAd: ad(s.onaylayanId),
    onayAt: iso(s.onayAt),
    bakilanEvrak: s.bakilanEvrak,
    ikinciTeyitAd: ad(s.ikinciTeyitId),
    ikinciTeyitAt: iso(s.ikinciTeyitAt),
    onaylayanId: s.onaylayanId,
    sorumluAd: ad(s.sorumluId),
    durum: s.durum,
    kapanisNot: s.kapanisNot,
    kapanisAt: iso(s.kapanisAt),
    kapanisKanitiBelgeId: s.kapanisKanitiBelgeId,
    iz: hi?.iz ?? [],
    uyarilar: hi?.uyarilar ?? [],
    eksik: hi?.eksik ?? null,
    hatirlatmalar: hatirlatmaGecmisi(s.hatirlatmaJson),
  }
}

export type GorunumDurumu = 'GECTI' | 'ONAYSIZ' | 'TETIK_BEKLIYOR' | 'KAPANMAYA_HAZIR' | 'ACIK' | 'KAPANDI' | 'IPTAL'
export type Ton = 'danger' | 'warning' | 'info' | 'success' | 'steel' | 'kr'

export const GORUNUM_ETIKET: Record<GorunumDurumu, { label: string; tone: Ton }> = {
  GECTI: { label: 'Son gün geçti', tone: 'danger' },
  ONAYSIZ: { label: 'Onaysız', tone: 'danger' },
  TETIK_BEKLIYOR: { label: 'Tetik bekliyor', tone: 'info' },
  KAPANMAYA_HAZIR: { label: 'Kapanmaya hazır', tone: 'kr' },
  ACIK: { label: 'Açık', tone: 'success' },
  KAPANDI: { label: 'Kapandı', tone: 'steel' },
  IPTAL: { label: 'İptal', tone: 'steel' },
}

type DurumGirdisi = Pick<SureSatiri, 'durum' | 'onaylananSonGun' | 'onerilenIhtiyatli'>

/** Hatırlatmanın ve kalan günün dayandığı gün: onaylanan, yoksa ihtiyatlı öneri. */
export function hedefGun(s: Pick<SureSatiri, 'onaylananSonGun' | 'onerilenIhtiyatli'>): { tarih: string | null; kaynak: 'ONAYLANAN' | 'IHTIYATLI' | null } {
  const h = hatirlatmaHedefi({ onaylananSonGun: s.onaylananSonGun, onerilenIhtiyatli: s.onerilenIhtiyatli })
  return h ? { tarih: h.tarih.toISOString(), kaynak: h.kaynak } : { tarih: null, kaynak: null }
}

export function kalan(s: Pick<SureSatiri, 'onaylananSonGun' | 'onerilenIhtiyatli'>, simdi: Date = new Date()): number | null {
  const h = hedefGun(s)
  return h.tarih ? kalanGun(h.tarih, simdi) : null
}

export function gorunumDurumu(s: DurumGirdisi, simdi: Date = new Date()): GorunumDurumu {
  if (s.durum === 'KAPANDI') return 'KAPANDI'
  if (s.durum === 'IPTAL') return 'IPTAL'
  const k = kalan(s, simdi)
  if (s.durum === 'TETIK_BEKLIYOR' || k == null) return 'TETIK_BEKLIYOR'
  if (k < 0) return 'GECTI'
  if (!s.onaylananSonGun) return 'ONAYSIZ'
  if (s.durum === 'KAPANMAYA_HAZIR') return 'KAPANMAYA_HAZIR'
  return 'ACIK'
}

export function acikMi(s: Pick<SureSatiri, 'durum'>): boolean {
  return (ACIK_DURUMLAR as readonly string[]).includes(s.durum) || s.durum === 'TETIK_BEKLIYOR'
}

const ONCELIK: Record<GorunumDurumu, number> = { GECTI: 0, ONAYSIZ: 1, KAPANMAYA_HAZIR: 2, ACIK: 3, TETIK_BEKLIYOR: 4, KAPANDI: 5, IPTAL: 6 }

/** Defter sırası: geçmiş ve onaysız önce, sonra kalan güne göre. */
export function sureleriSirala<T extends SureSatiri>(liste: T[], simdi: Date = new Date()): T[] {
  return [...liste].sort((a, b) => {
    const da = ONCELIK[gorunumDurumu(a, simdi)], db = ONCELIK[gorunumDurumu(b, simdi)]
    if (da !== db) return da - db
    const ka = kalan(a, simdi) ?? Number.MAX_SAFE_INTEGER, kb = kalan(b, simdi) ?? Number.MAX_SAFE_INTEGER
    return ka - kb
  })
}

/** Şimdi kartı önerisi (06 §8.3). */
export type SureSimdiOnerisi = {
  kod: 'GN-04' | 'GN-05'
  oncelik: 1
  rol: 'A' | 'A+2' | 'Sorumlu'
  metin: string
  eylem: 'Son günü onayla' | 'İşleme git'
  sureId: string
  dosyaId: string
  kalanGun: number
  hedefTarih: string
}

/** GN-04 için pencere: onaysız süre, ihtiyatlı son güne ≤ 14 gün ya da geçmiş. */
export const GN04_GUN = 14
/** GN-05 için pencere: onaylı süreye ≤ 7 gün, kapanış kanıtı yok. */
export const GN05_GUN = 7

export function sureSimdiOnerileri(liste: SureSatiri[], simdi: Date = new Date()): SureSimdiOnerisi[] {
  const out: SureSimdiOnerisi[] = []
  for (const s of liste) {
    if (!(ACIK_DURUMLAR as readonly string[]).includes(s.durum)) continue
    const k = kalan(s, simdi)
    const h = hedefGun(s)
    if (k == null || !h.tarih) continue
    if (!s.onaylananSonGun && k <= GN04_GUN) {
      out.push({
        kod: 'GN-04', oncelik: 1, rol: s.kritik ? 'A+2' : 'A',
        metin: `Son günü onaylayın: ${s.turEtiket}${s.borcluEtiket ? ` (${s.borcluEtiket})` : ''}, önerilen ${gunTR(new Date(h.tarih))} (${TEYIT_GEREKLI})`,
        eylem: 'Son günü onayla', sureId: s.id, dosyaId: s.dosyaId, kalanGun: k, hedefTarih: h.tarih,
      })
    } else if (s.onaylananSonGun && k <= GN05_GUN && !s.kapanisKanitiBelgeId) {
      out.push({
        kod: 'GN-05', oncelik: 1, rol: 'Sorumlu',
        metin: `${s.turAd} için son ${Math.max(k, 0)} gün (${gunTR(new Date(h.tarih))})`,
        eylem: 'İşleme git', sureId: s.id, dosyaId: s.dosyaId, kalanGun: k, hedefTarih: h.tarih,
      })
    }
  }
  // GN-04 (onaysız) her zaman önce; kendi içinde en az kalan önce.
  return out.sort((a, b) => (a.kod === b.kod ? a.kalanGun - b.kalanGun : a.kod === 'GN-04' ? -1 : 1))
}

/** Şimdi kartının en üstündeki süre önerisi (yoksa null). */
export function sureSimdiOnerisi(liste: SureSatiri[], simdi: Date = new Date()): SureSimdiOnerisi | null {
  return sureSimdiOnerileri(liste, simdi)[0] ?? null
}
