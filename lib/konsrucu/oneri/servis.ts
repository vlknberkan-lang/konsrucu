/**
 * KonsRücü — Öneri servisi (veritabanı) · lib/konsrucu/oneri/servis.ts  (SUNUCU; Prisma işlem istemcisiyle)
 *
 * S18 (M5; F13 kalıcı; B36, B37, B38). Bütün fonksiyonlar bir Prisma işlem istemcisi (`tx`) alır; çağıran
 * `prisma.$transaction(tx => …)` içinde çağırır. Böylece öneri satırı, alan kilidi, eski kolona ayna ve Aktivite
 * TEK İŞLEMDE yazılır; bir adım düşerse hiçbiri kalmaz.
 *
 *   onerileriKaydet  — kural/Hugo/AI önerilerini yazar. ONAYLI satıra hiç dokunmaz (alan kilidi). Alıntıyı dosyanın
 *                      sayfalarında doğrular (kaynaksız → alintiDogru = false). Kaynak belge başka dosyanınsa bağ düşer.
 *   oneriOnayla      — iyimser kilit: yalnız `durum = 'ONERI'` satır onaylanır; ikinci sekme "az önce onaylandı" alır.
 *                      Alanın mevcut kilidi, kullanıcının gördüğü kilitten farklıysa (başkası değiştirmiş) işlem durur.
 *                      Düzeltmeyle onayda öneri REDDEDILDI olur, düzeltilen değer ELLE kaynaklı ONAYLI satırdır.
 *   elleOnayla       — öneri olmadan değer seçimi (rücu sebebi, yetkili icra, elle düzeltme).
 *   oneriReddet      — öneriyi reddeder (yeniden çıkarımda aynı kaynaktan aynı değer tekrar önerilmez).
 *   topluOnayla      — yalnız toplu onaya uygun (deterministik, kritik olmayan, kilitsiz, çelişkisiz) öneriler.
 *
 * Hukuki kayıt: AlanDegeri silinmez; yalnız durum değişir (ESKIDI/REDDEDILDI) ya da `silindiAt` dolar.
 * Onay, eski kolona yazıldığında cikarimJson.onay (avukatın "takibe hazır" onayı) düşer — takibe giden veri değişti.
 */
import 'server-only'
import { Prisma } from '@prisma/client'
import { alanTanimi, aynaPlani, degerEsit, degerGorunum, degerNormal, odemeAnahtari, KAYNAK_ETIKET, type AlanTanimi, type KaynakTuru } from './alanlar'
import { alintiDogrula, alintiDogruDegeri, sayfaIndeksi, type SayfaMetni } from './alinti'
import { calismaPlani, onaylayabilir, oneriHazirla, topluOnayUygunMu, KARAR_YETKI_YOK, YETKI_YOK, type AlanKaydi, type HazirOneri } from './karar'
import type { KullaniciYetkisi, YeniOneri } from './tipler'

export type Db = Prisma.TransactionClient

export type OneriHataKodu = 'BULUNAMADI' | 'AZ_ONCE_ONAYLANDI' | 'GECERSIZ' | 'KILIT_DEGISTI' | 'DEGER_GECERSIZ' | 'YETKI'

export class OneriHata extends Error {
  readonly kod: OneriHataKodu
  constructor(kod: OneriHataKodu, mesaj: string) {
    super(mesaj)
    this.name = 'OneriHata'
    this.kod = kod
  }
}

/** Kısmi tekil indeks (dosya + alan başına tek ONAYLI) yarışta P2002 atar → "az önce onaylandı". */
export function tekilIhlalMi(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002'
}

/** Alıntısı belge sayfasında doğrulanan kaynaklar. */
const BELGE_KAYNAKLI: ReadonlySet<string> = new Set(['AI', 'KURAL'])

const KAYIT_SEC = { id: true, alan: true, degerJson: true, kaynakTuru: true, kaynakBelgeId: true, durum: true, alintiDogru: true, uretici: true } as const

// ───────────────────────── yazma ─────────────────────────

export type KayitSonucu = { eklenen: number; atlanan: number; eskiyen: number; gecersiz: string[]; kaynaksiz: number }

/** Dosyanın sayfa metinleri: BelgeSayfa; sayfası olmayan eski belgelerde extractedText tek sayfa sayılır. */
export async function dosyaSayfalari(db: Db, dosyaId: string): Promise<(SayfaMetni & { kategori: string | null; altTur: string | null })[]> {
  const [sayfalar, belgeler] = await Promise.all([
    db.belgeSayfa.findMany({ where: { dosyaId }, select: { belgeId: true, sayfaNo: true, metin: true }, orderBy: [{ belgeId: 'asc' }, { sayfaNo: 'asc' }] }),
    db.belge.findMany({ where: { dosyaId, silindiAt: null }, select: { id: true, kategori: true, altTur: true, extractedText: true } }),
  ])
  const tur = new Map(belgeler.map((b) => [b.id, { kategori: b.kategori as string | null, altTur: b.altTur }]))
  const sayfaliBelge = new Set(sayfalar.map((s) => s.belgeId))
  const out = sayfalar.filter((s) => tur.has(s.belgeId)).map((s) => ({ ...s, ...tur.get(s.belgeId)! }))
  for (const b of belgeler) {
    if (sayfaliBelge.has(b.id) || !b.extractedText?.trim()) continue
    out.push({ belgeId: b.id, sayfaNo: 1, metin: b.extractedText, kategori: b.kategori as string | null, altTur: b.altTur })
  }
  return out
}

/**
 * Önerileri yaz. `sayfalar` verilmezse ve alıntılı öneri varsa dosyanın sayfaları okunur.
 * ONAYLI satır değişmez; aynı kaynağın artık üretmediği eski öneri ESKIDI olur.
 */
export async function onerileriKaydet(db: Db, dosyaId: string, yeniler: readonly YeniOneri[], secenek: { sayfalar?: readonly SayfaMetni[] } = {}): Promise<KayitSonucu> {
  const gecersiz: string[] = []
  let hazir: HazirOneri[] = []
  for (const y of yeniler) {
    const h = oneriHazirla(y)
    if (h.ok) hazir.push(h.oneri)
    else gecersiz.push(h.sebep)
  }
  if (!hazir.length) return { eklenen: 0, atlanan: 0, eskiyen: 0, gecersiz, kaynaksiz: 0 }

  // kaynak belge bu dosyanın mı? (başka dosyanın/müvekkilin belgesine bağ kurulmaz)
  const belgeIdleri = [...new Set(hazir.map((h) => h.kaynakBelgeId).filter((x): x is string => !!x))]
  const alintili = hazir.some((h) => h.alinti && BELGE_KAYNAKLI.has(h.kaynakTuru))
  let sayfalar = secenek.sayfalar
  if (alintili && !sayfalar) sayfalar = await dosyaSayfalari(db, dosyaId)
  if (belgeIdleri.length) {
    const gecerli = new Set((await db.belge.findMany({ where: { dosyaId, id: { in: belgeIdleri } }, select: { id: true } })).map((b) => b.id))
    hazir = hazir.map((h) => (h.kaynakBelgeId && !gecerli.has(h.kaynakBelgeId) ? { ...h, kaynakBelgeId: null, sayfa: null } : h))
  }

  // alıntı doğrulaması
  const idx = sayfalar ? sayfaIndeksi(sayfalar) : []
  const dogruluk = new Map<HazirOneri, boolean | null>()
  hazir = hazir.map((h) => {
    // Hugo/Excel/UYAP satırının "alıntısı" hücre ya da alan metnidir; belge sayfasında aranmaz (null kalır).
    if (!h.alinti || !BELGE_KAYNAKLI.has(h.kaynakTuru)) { dogruluk.set(h, null); return h }
    const s = alintiDogrula(h.alinti, idx, { belgeId: h.kaynakBelgeId, sayfa: h.sayfa })
    const yeni = s.durum === 'DOGRU' ? { ...h, kaynakBelgeId: s.belgeId, sayfa: s.sayfa } : h
    dogruluk.set(yeni, alintiDogruDegeri(s))
    return yeni
  })

  const alanlar = [...new Set(hazir.map((h) => h.alan))]
  const mevcut = await db.alanDegeri.findMany({ where: { dosyaId, silindiAt: null, alan: { in: alanlar } }, select: KAYIT_SEC })
  const plan = calismaPlani(mevcut as AlanKaydi[], hazir)

  if (plan.eskitilecek.length) {
    await db.alanDegeri.updateMany({ where: { id: { in: plan.eskitilecek }, dosyaId, durum: 'ONERI' }, data: { durum: 'ESKIDI' } })
  }
  if (plan.eklenecek.length) {
    await db.alanDegeri.createMany({
      data: plan.eklenecek.map((h) => ({
        dosyaId, alan: h.alan, degerJson: h.deger as Prisma.InputJsonValue, kaynakTuru: h.kaynakTuru,
        kaynakBelgeId: h.kaynakBelgeId, sayfa: h.sayfa, alinti: h.alinti, alintiDogru: dogruluk.get(h) ?? null,
        guven: h.guven, uretici: h.uretici, durum: 'ONERI',
      })),
    })
  }
  return {
    eklenen: plan.eklenecek.length, atlanan: plan.atlanan.length, eskiyen: plan.eskitilecek.length, gecersiz,
    kaynaksiz: plan.eklenecek.filter((h) => dogruluk.get(h) === false).length,
  }
}

// ───────────────────────── ayna (M5) ─────────────────────────

const gunIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

/** Onaylı değeri eski kolona (ya da Odeme'ye) yaz. Faiz başlangıcına dokunulmaz. Takip verisi değiştiyse onay düşer. */
async function aynala(db: Db, dosyaId: string, tanim: AlanTanimi, deger: unknown): Promise<void> {
  const p = aynaPlani(tanim, deger)
  if (!p) return
  const dosya = await db.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { cikarimJson: true } })
  const cj = dosya?.cikarimJson && typeof dosya.cikarimJson === 'object' && !Array.isArray(dosya.cikarimJson) ? { ...(dosya.cikarimJson as Record<string, unknown>) } : null
  let onayDus: Record<string, unknown> | null = null
  if (cj && 'onay' in cj) {
    delete cj.onay
    onayDus = cj
  }
  if (p.tur === 'KOLON') {
    const v = typeof p.deger === 'number' ? new Prisma.Decimal(p.deger.toFixed(2)) : p.deger
    const data = { [p.kolon]: v, ...(onayDus ? { cikarimJson: onayDus as Prisma.InputJsonValue } : {}) } as Prisma.RucuDosyasiUpdateInput
    await db.rucuDosyasi.update({ where: { id: dosyaId }, data })
    return
  }
  const odemeler = await db.odeme.findMany({ where: { dosyaId }, select: { tarih: true, tutar: true } })
  const var_ = odemeler.some((o) => o.tutar != null && odemeAnahtari({ tarih: gunIso(o.tarih), tutar: Number(o.tutar) }) === p.anahtar)
  if (var_) return
  await db.odeme.create({
    data: { dosyaId, tarih: p.tarih, tutar: new Prisma.Decimal(p.tutar.toFixed(2)), aciklama: 'Dekont önerisinden (onaylı)', anaOdemeMi: false, haricMi: false },
  })
  if (onayDus) await db.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: onayDus as Prisma.InputJsonValue } })
}

// ───────────────────────── onay ─────────────────────────

type OnayGirdisi = {
  dosyaId: string
  kullaniciId: string
  yetki: KullaniciYetkisi
  /** Kullanıcının ekranda gördüğü kilit (ONAYLI satır id'si) — yoksa null. İyimser kilit. */
  beklenenOnayliId: string | null
}

async function kilitDenetle(db: Db, dosyaId: string, alan: string, beklenen: string | null): Promise<{ id: string; degerJson: unknown } | null> {
  const mevcut = await db.alanDegeri.findFirst({ where: { dosyaId, alan, durum: 'ONAYLI', silindiAt: null }, select: { id: true, degerJson: true } })
  if ((mevcut?.id ?? null) !== (beklenen ?? null)) {
    throw new OneriHata('KILIT_DEGISTI', 'Bu alan az önce başka bir değerle onaylandı ya da değişti; sayfayı yenileyip tekrar bakın.')
  }
  return mevcut
}

async function kilidiBirak(db: Db, id: string): Promise<void> {
  const r = await db.alanDegeri.updateMany({ where: { id, durum: 'ONAYLI' }, data: { durum: 'ESKIDI' } })
  if (r.count === 0) throw new OneriHata('KILIT_DEGISTI', 'Bu alan az önce değişti; sayfayı yenileyip tekrar bakın.')
}

/** Onaylı değerle aynı değerdeki bekleyen öneriler artık gereksiz → ESKIDI. */
async function ayniDegerliBekleyenleriEskit(db: Db, dosyaId: string, tanim: AlanTanimi, alan: string, deger: unknown, haric: string[]): Promise<void> {
  const bekleyen = await db.alanDegeri.findMany({ where: { dosyaId, alan, durum: 'ONERI', silindiAt: null, id: { notIn: haric } }, select: { id: true, degerJson: true } })
  const ids = bekleyen.filter((b) => degerEsit(tanim.tip, b.degerJson, deger)).map((b) => b.id)
  if (ids.length) await db.alanDegeri.updateMany({ where: { id: { in: ids }, durum: 'ONERI' }, data: { durum: 'ESKIDI' } })
}

async function aktiviteYaz(db: Db, dosyaId: string, kullaniciId: string, eylem: string, detay: Record<string, unknown>): Promise<void> {
  await db.aktivite.create({ data: { dosyaId, kullaniciId, eylem, detayJson: detay as Prisma.InputJsonValue } })
}

/** Öneriyi onayla (ya da düzelterek onayla). Döner: onaylı satırın id'si. */
export async function oneriOnayla(db: Db, g: OnayGirdisi & { oneriId: string; duzeltilmisDeger?: unknown }): Promise<{ onayliId: string; alan: string }> {
  const oneri = await db.alanDegeri.findFirst({
    where: { id: g.oneriId, dosyaId: g.dosyaId, silindiAt: null },
    select: { id: true, alan: true, degerJson: true, kaynakTuru: true, durum: true, onaylayanId: true },
  })
  if (!oneri) throw new OneriHata('BULUNAMADI', 'Öneri bulunamadı.')
  if (oneri.durum === 'ONAYLI') throw new OneriHata('AZ_ONCE_ONAYLANDI', 'Bu öneri az önce onaylandı.')
  if (oneri.durum !== 'ONERI') throw new OneriHata('GECERSIZ', 'Bu öneri artık geçerli değil (reddedildi ya da yenisi geldi); sayfayı yenileyin.')
  const tanim = alanTanimi(oneri.alan)
  if (!tanim) throw new OneriHata('GECERSIZ', 'Bu alan artık desteklenmiyor.')
  if (!onaylayabilir(g.yetki, tanim)) throw new OneriHata('YETKI', tanim.kritik || tanim.karar ? KARAR_YETKI_YOK : YETKI_YOK)

  const duzeltme = g.duzeltilmisDeger !== undefined
  const deger = degerNormal(tanim.tip, duzeltme ? g.duzeltilmisDeger : oneri.degerJson)
  if (deger == null) throw new OneriHata('DEGER_GECERSIZ', `${tanim.etiket}: geçersiz değer.`)

  const kilit = await kilitDenetle(db, g.dosyaId, oneri.alan, g.beklenenOnayliId)
  if (kilit) await kilidiBirak(db, kilit.id)

  const simdi = new Date()
  let onayliId = oneri.id
  const ayniMi = !duzeltme || degerEsit(tanim.tip, deger, oneri.degerJson)
  if (ayniMi) {
    const r = await db.alanDegeri.updateMany({
      where: { id: oneri.id, dosyaId: g.dosyaId, durum: 'ONERI' },
      data: { durum: 'ONAYLI', onaylayanId: g.kullaniciId, onayAt: simdi },
    })
    if (r.count === 0) throw new OneriHata('AZ_ONCE_ONAYLANDI', 'Bu öneri az önce onaylandı.')
  } else {
    const r = await db.alanDegeri.updateMany({
      where: { id: oneri.id, dosyaId: g.dosyaId, durum: 'ONERI' },
      data: { durum: 'REDDEDILDI', onaylayanId: g.kullaniciId, onayAt: simdi },
    })
    if (r.count === 0) throw new OneriHata('AZ_ONCE_ONAYLANDI', 'Bu öneri az önce işlendi.')
    const yeni = await db.alanDegeri.create({
      data: {
        dosyaId: g.dosyaId, alan: oneri.alan, degerJson: deger as Prisma.InputJsonValue, kaynakTuru: 'ELLE',
        uretici: `DUZELTME:${oneri.id}`, durum: 'ONAYLI', onaylayanId: g.kullaniciId, onayAt: simdi,
      },
      select: { id: true },
    })
    onayliId = yeni.id
  }
  await ayniDegerliBekleyenleriEskit(db, g.dosyaId, tanim, oneri.alan, deger, [oneri.id, onayliId])
  await aynala(db, g.dosyaId, tanim, deger)
  const kaynak = KAYNAK_ETIKET[oneri.kaynakTuru as KaynakTuru] ?? oneri.kaynakTuru
  await aktiviteYaz(db, g.dosyaId, g.kullaniciId,
    `${tanim.etiket} ${ayniMi ? 'onaylandı' : 'düzeltilip onaylandı'}: ${degerGorunum(tanim.tip, deger, tanim.maskeli)} (kaynak: ${ayniMi ? kaynak : 'elle'})`,
    { tur: ayniMi ? 'ALAN_ONAY' : 'ALAN_DUZELTME', alan: oneri.alan, oneriId: oneri.id, onayliId, kaynakTuru: oneri.kaynakTuru, oncekiOnayliId: kilit?.id ?? null },
  )
  return { onayliId, alan: oneri.alan }
}

/**
 * Öneri olmadan değer onayla (rücu sebebi seçimi, yetkili icra seçimi, boş alana elle değer).
 * Aynı değerde bekleyen öneri varsa o onaylanır (kaynağı korunur). Değer zaten onaylıysa işlem yapılmaz.
 */
export async function elleOnayla(db: Db, g: OnayGirdisi & { alan: string; deger: unknown; uretici?: string }): Promise<{ onayliId: string; degismedi: boolean }> {
  const tanim = alanTanimi(g.alan)
  if (!tanim) throw new OneriHata('GECERSIZ', 'Bilinmeyen alan.')
  if (!onaylayabilir(g.yetki, tanim)) throw new OneriHata('YETKI', tanim.kritik || tanim.karar ? KARAR_YETKI_YOK : YETKI_YOK)
  const deger = degerNormal(tanim.tip, g.deger)
  if (deger == null) throw new OneriHata('DEGER_GECERSIZ', `${tanim.etiket}: geçersiz değer.`)

  const kilit = await kilitDenetle(db, g.dosyaId, g.alan, g.beklenenOnayliId)
  if (kilit && degerEsit(tanim.tip, kilit.degerJson, deger) && JSON.stringify(degerNormal(tanim.tip, kilit.degerJson)) === JSON.stringify(deger)) {
    return { onayliId: kilit.id, degismedi: true }
  }
  const bekleyen = await db.alanDegeri.findMany({ where: { dosyaId: g.dosyaId, alan: g.alan, durum: 'ONERI', silindiAt: null }, select: { id: true, degerJson: true } })
  const esi = bekleyen.find((b) => degerEsit(tanim.tip, b.degerJson, deger) && JSON.stringify(degerNormal(tanim.tip, b.degerJson)) === JSON.stringify(deger))
  if (esi) {
    const r = await oneriOnayla(db, { ...g, oneriId: esi.id })
    return { onayliId: r.onayliId, degismedi: false }
  }
  if (kilit) await kilidiBirak(db, kilit.id)
  const yeni = await db.alanDegeri.create({
    data: {
      dosyaId: g.dosyaId, alan: g.alan, degerJson: deger as Prisma.InputJsonValue, kaynakTuru: 'ELLE',
      uretici: g.uretici ? g.uretici.slice(0, 120) : 'ELLE', durum: 'ONAYLI', onaylayanId: g.kullaniciId, onayAt: new Date(),
    },
    select: { id: true },
  })
  await ayniDegerliBekleyenleriEskit(db, g.dosyaId, tanim, g.alan, deger, [yeni.id])
  await aynala(db, g.dosyaId, tanim, deger)
  await aktiviteYaz(db, g.dosyaId, g.kullaniciId, `${tanim.etiket} seçildi: ${degerGorunum(tanim.tip, deger, tanim.maskeli)} (elle)`, {
    tur: 'ALAN_ELLE', alan: g.alan, onayliId: yeni.id, oncekiOnayliId: kilit?.id ?? null, uretici: g.uretici ?? 'ELLE',
  })
  return { onayliId: yeni.id, degismedi: false }
}

/** Öneriyi reddet. Aynı kaynaktan aynı değer yeniden çıkarımda tekrar önerilmez (karar.ts · REDDEDILMIS). */
export async function oneriReddet(db: Db, g: { dosyaId: string; oneriId: string; kullaniciId: string; yetki: KullaniciYetkisi; gerekce?: string | null }): Promise<void> {
  if (!g.yetki.duzenleyebilir) throw new OneriHata('YETKI', YETKI_YOK)
  const oneri = await db.alanDegeri.findFirst({ where: { id: g.oneriId, dosyaId: g.dosyaId, silindiAt: null }, select: { id: true, alan: true, degerJson: true, durum: true, kaynakTuru: true } })
  if (!oneri) throw new OneriHata('BULUNAMADI', 'Öneri bulunamadı.')
  const r = await db.alanDegeri.updateMany({ where: { id: oneri.id, dosyaId: g.dosyaId, durum: 'ONERI' }, data: { durum: 'REDDEDILDI', onaylayanId: g.kullaniciId, onayAt: new Date() } })
  if (r.count === 0) throw new OneriHata(oneri.durum === 'ONAYLI' ? 'AZ_ONCE_ONAYLANDI' : 'GECERSIZ', oneri.durum === 'ONAYLI' ? 'Bu öneri az önce onaylandı.' : 'Bu öneri artık geçerli değil.')
  const tanim = alanTanimi(oneri.alan)
  await aktiviteYaz(db, g.dosyaId, g.kullaniciId, `${tanim?.etiket ?? oneri.alan} önerisi reddedildi${tanim ? `: ${degerGorunum(tanim.tip, oneri.degerJson, tanim.maskeli)}` : ''}`, {
    tur: 'ALAN_RET', alan: oneri.alan, oneriId: oneri.id, kaynakTuru: oneri.kaynakTuru, gerekce: g.gerekce?.slice(0, 500) ?? null,
  })
}

/** Toplu onay: yalnız uygun öneriler; uygun olmayanlar atlanır (hata değil). */
export async function topluOnayla(db: Db, g: { dosyaId: string; oneriIds: readonly string[]; kullaniciId: string; yetki: KullaniciYetkisi }): Promise<{ onaylanan: number; atlanan: number }> {
  if (!g.yetki.duzenleyebilir) throw new OneriHata('YETKI', YETKI_YOK)
  const secili = await db.alanDegeri.findMany({ where: { id: { in: [...g.oneriIds] }, dosyaId: g.dosyaId, silindiAt: null }, select: KAYIT_SEC })
  const alanlar = [...new Set(secili.map((s) => s.alan))]
  const tum = await db.alanDegeri.findMany({ where: { dosyaId: g.dosyaId, silindiAt: null, alan: { in: alanlar }, durum: { in: ['ONERI', 'ONAYLI'] } }, select: KAYIT_SEC })
  let onaylanan = 0
  const islenenAlan = new Set<string>()
  for (const s of secili as AlanKaydi[]) {
    const tanim = alanTanimi(s.alan)
    if (!tanim || islenenAlan.has(s.alan) || !onaylayabilir(g.yetki, tanim)) continue
    if (!topluOnayUygunMu(s, (tum as AlanKaydi[]).filter((x) => x.alan === s.alan))) continue
    await oneriOnayla(db, { dosyaId: g.dosyaId, oneriId: s.id, kullaniciId: g.kullaniciId, yetki: g.yetki, beklenenOnayliId: null })
    islenenAlan.add(s.alan)
    onaylanan++
  }
  return { onaylanan, atlanan: g.oneriIds.length - onaylanan }
}
