/**
 * KonsRücü — Öneri kararları (saf) · lib/konsrucu/oneri/karar.ts  (DB yok, client-safe)
 *
 * S18 (M5; F13 kalıcı; B36, B37, B38). Veritabanına gitmeden şu soruları cevaplar:
 *   - Kim onaylayabilir? (kritik alan ve karar alanı: AVUKAT/ADMIN; diğerleri: AVUKAT_YRD de)
 *   - Yeni öneri yazılsın mı? Onaylı değerle aynıysa, aynı kaynaktan aynı değer zaten varsa ya da reddedildiyse ATLANIR.
 *     Aynı kaynağın (tür + belge) eski önerisi bu çalıştırmada üretilmediyse ESKİR. ONAYLI satıra HİÇBİR otomasyon
 *     dokunmaz (alan kilidi); farklı yeni değer ayrı öneri olarak kilidin yanında bekler.
 *   - Toplu onaya uygun mu? Yalnız kritik olmayan, toplu onaylanabilir alanda, deterministik kaynakta (kural kodu +
 *     doğrulanmış birebir alıntı ya da UYAP yapısal alanı), kilitsiz ve çelişkisiz öneri (06 §9.1).
 *   - Bin kat tutar şüphesi (06 §2(a) "ENGEL").
 */
import { alanTanimi, degerEsit, degerNormal, type AlanDegeriJson, type AlanDurumu, type AlanTanimi, type KaynakTuru, KAYNAK_TURLERI } from './alanlar'
import { alintiKisalt } from './alinti'
import type { KullaniciYetkisi, YeniOneri } from './tipler'

// ───────────────────────── yetki ─────────────────────────

export const KARAR_ROLLERI = ['AVUKAT', 'ADMIN'] as const
export const DUZENLEYEN_ROLLERI = ['AVUKAT', 'ADMIN', 'AVUKAT_YRD'] as const

export function kullaniciYetkisi(k: { rol?: string | null; aktif?: boolean | null } | null | undefined): KullaniciYetkisi {
  if (!k || k.aktif === false || !k.rol) return { duzenleyebilir: false, kararVerebilir: false }
  return {
    duzenleyebilir: (DUZENLEYEN_ROLLERI as readonly string[]).includes(k.rol),
    kararVerebilir: (KARAR_ROLLERI as readonly string[]).includes(k.rol),
  }
}

/** Bu alanı bu kullanıcı onaylayabilir mi? Kritik ve karar alanları yalnız avukat. */
export function onaylayabilir(y: KullaniciYetkisi, tanim: AlanTanimi): boolean {
  return tanim.kritik || tanim.karar ? y.kararVerebilir : y.duzenleyebilir
}

export const YETKI_YOK = 'Bu işlem için yetkiniz yok.'
export const KARAR_YETKI_YOK = 'Bu bilgiyi yalnız avukat ya da yönetici (ADMIN) onaylayabilir.'

// ───────────────────────── kayıt biçimi ─────────────────────────

/** AlanDegeri satırının bu modülün ihtiyaç duyduğu kısmı. */
export type AlanKaydi = {
  id: string
  alan: string
  degerJson: unknown
  kaynakTuru: string
  kaynakBelgeId: string | null
  durum: string
  alintiDogru?: boolean | null
  uretici?: string | null
}

/** Normalize edilmiş, yazılmaya hazır öneri. */
export type HazirOneri = {
  alan: string
  tanim: AlanTanimi
  deger: AlanDegeriJson
  kaynakTuru: KaynakTuru
  kaynakBelgeId: string | null
  sayfa: number | null
  alinti: string | null
  guven: number | null
  uretici: string | null
}

/** Ham öneriyi doğrula ve normalize et. Bilinmeyen alan, geçersiz değer ya da AI'ın yasak alanı → reddedilir. */
export function oneriHazirla(y: YeniOneri): { ok: true; oneri: HazirOneri } | { ok: false; sebep: string } {
  const tanim = alanTanimi(y.alan)
  if (!tanim) return { ok: false, sebep: `Bilinmeyen alan: ${y.alan}` }
  if (!(KAYNAK_TURLERI as readonly string[]).includes(y.kaynakTuru)) return { ok: false, sebep: `Bilinmeyen kaynak türü: ${y.kaynakTuru}` }
  if (y.kaynakTuru === 'AI' && tanim.aiYasak) return { ok: false, sebep: `${tanim.etiket} alanına AI önerisi yazılmaz; seçim avukattadır.` }
  const deger = degerNormal(tanim.tip, y.deger)
  if (deger == null) return { ok: false, sebep: `${tanim.etiket}: geçersiz değer` }
  const guven = typeof y.guven === 'number' && Number.isFinite(y.guven) ? Math.min(1, Math.max(0, y.guven)) : null
  const sayfa = typeof y.sayfa === 'number' && Number.isInteger(y.sayfa) && y.sayfa > 0 ? y.sayfa : null
  return {
    ok: true,
    oneri: {
      alan: y.alan, tanim, deger, kaynakTuru: y.kaynakTuru,
      kaynakBelgeId: y.kaynakBelgeId || null, sayfa, alinti: alintiKisalt(y.alinti), guven,
      uretici: y.uretici ? String(y.uretici).slice(0, 120) : null,
    },
  }
}

// ───────────────────────── yazma planı ─────────────────────────

export type CalismaPlani = {
  eklenecek: HazirOneri[]
  /** Aynı kaynağın bu çalıştırmada artık üretmediği eski ONERI satırları → ESKIDI. */
  eskitilecek: string[]
  atlanan: { oneri: HazirOneri; sebep: 'ONAYLI_AYNI' | 'AYNI_ONERI_VAR' | 'REDDEDILMIS' | 'CALISMADA_TEKRAR' }[]
}

const grupAnahtari = (alan: string, kaynak: string, belge: string | null) => `${alan}\u0000${kaynak}\u0000${belge ?? ''}`

/**
 * Bir çıkarım çalıştırmasının (kural, Hugo, AI …) sonucunu dosyadaki mevcut satırlarla karşılaştır.
 * `mevcut`: dosyanın silinmemiş AlanDegeri satırları (bu çalıştırmadan ÖNCEKİ anlık görüntü).
 * ONAYLI satır hiçbir zaman eskitilmez ya da değiştirilmez.
 */
export function calismaPlani(mevcut: readonly AlanKaydi[], yeniler: readonly HazirOneri[]): CalismaPlani {
  const eklenecek: HazirOneri[] = []
  const atlanan: CalismaPlani['atlanan'] = []
  const gorulen = new Set<string>()
  const grupDegerleri = new Map<string, HazirOneri[]>()

  for (const y of yeniler) {
    const k = `${y.alan}\u0000${JSON.stringify(y.deger)}\u0000${y.kaynakTuru}`
    if (gorulen.has(k)) { atlanan.push({ oneri: y, sebep: 'CALISMADA_TEKRAR' }); continue }
    gorulen.add(k)
    const g = grupAnahtari(y.alan, y.kaynakTuru, y.kaynakBelgeId)
    grupDegerleri.set(g, [...(grupDegerleri.get(g) ?? []), y])

    const ayniAlan = mevcut.filter((m) => m.alan === y.alan)
    if (ayniAlan.some((m) => m.durum === 'ONAYLI' && degerEsit(y.tanim.tip, m.degerJson, y.deger))) {
      atlanan.push({ oneri: y, sebep: 'ONAYLI_AYNI' }); continue
    }
    const ayniKaynakAyniDeger = ayniAlan.filter((m) => m.kaynakTuru === y.kaynakTuru && degerEsit(y.tanim.tip, m.degerJson, y.deger))
    if (ayniKaynakAyniDeger.some((m) => m.durum === 'REDDEDILDI')) { atlanan.push({ oneri: y, sebep: 'REDDEDILMIS' }); continue }
    if (ayniKaynakAyniDeger.some((m) => m.durum === 'ONERI')) { atlanan.push({ oneri: y, sebep: 'AYNI_ONERI_VAR' }); continue }
    eklenecek.push(y)
  }

  const eskitilecek: string[] = []
  for (const m of mevcut) {
    if (m.durum !== 'ONERI') continue
    const grup = grupDegerleri.get(grupAnahtari(m.alan, m.kaynakTuru, m.kaynakBelgeId))
    if (!grup) continue // bu kaynak bu çalıştırmada bu alan için bir şey üretmedi → eski öneri yerinde kalır
    if (!grup.some((y) => degerEsit(y.tanim.tip, m.degerJson, y.deger))) eskitilecek.push(m.id)
  }
  return { eklenecek, eskitilecek, atlanan }
}

// ───────────────────────── toplu onay ve çelişki ─────────────────────────

/** Deterministik kaynak: kural kodu + doğrulanmış birebir alıntı, ya da UYAP yapısal alanı (06 §9.1). */
export function deterministikMi(k: Pick<AlanKaydi, 'kaynakTuru' | 'alintiDogru' | 'uretici'>): boolean {
  if (k.kaynakTuru === 'KURAL') return k.alintiDogru === true && !!k.uretici && k.uretici.startsWith('KURAL:')
  if (k.kaynakTuru === 'UYAP') return !!k.uretici
  return false
}

/** Alanda çelişki var mı: bekleyen önerilerde birden çok farklı değer ya da onaylıdan farklı bekleyen öneri. */
export function celiskiVar(tanim: AlanTanimi, satirlar: readonly AlanKaydi[]): boolean {
  const aktif = satirlar.filter((s) => s.durum === 'ONERI' || s.durum === 'ONAYLI')
  for (let i = 0; i < aktif.length; i++) {
    for (let j = i + 1; j < aktif.length; j++) {
      if (!degerEsit(tanim.tip, aktif[i].degerJson, aktif[j].degerJson)) return true
    }
  }
  return false
}

/** Öneri toplu onaylanabilir mi? `alanSatirlari`: aynı dosya + aynı alanın ONERI/ONAYLI satırları. */
export function topluOnayUygunMu(satir: AlanKaydi, alanSatirlari: readonly AlanKaydi[]): boolean {
  if (satir.durum !== 'ONERI') return false
  const tanim = alanTanimi(satir.alan)
  if (!tanim || !tanim.topluOnaylanabilir || tanim.kritik || tanim.karar) return false
  if (!deterministikMi(satir)) return false
  if (alanSatirlari.some((s) => s.durum === 'ONAYLI')) return false
  return !celiskiVar(tanim, alanSatirlari)
}

// ───────────────────────── bin kat tutar şüphesi ─────────────────────────

/**
 * İki tutar arasında ~1000 kat fark var mı? (Hugo'daki "123,456.00" → 123,46 okuma hatası; 06 §2(a) ENGEL, S03.)
 * Oran 700–1400 arasındaysa şüphelidir.
 */
export function binKatSuphesi(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null || !(a > 0) || !(b > 0)) return false
  const r = Math.max(a, b) / Math.min(a, b)
  return r >= 700 && r <= 1400
}

/** Durum geçerli mi (CHECK kısıtıyla aynı liste). */
export const durumMu = (d: unknown): d is AlanDurumu => d === 'ONERI' || d === 'ONAYLI' || d === 'REDDEDILDI' || d === 'ESKIDI'
