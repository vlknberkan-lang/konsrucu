/**
 * KonsRücü — Anlık senkron iş kuyruğu: veritabanı katmanı · lib/konsrucu/senkron/is-kuyrugu.ts (server-only)
 *
 * Kurallar (06 §2(d); 07 S22):
 *  - Atomik üstlenme: `UPDATE … WHERE id = ? AND durum = 'BEKLIYOR' AND musteriId IN (kapsam)`. İki eklenti
 *    (iki sekme, iki bilgisayar) aynı işi alamaz; başka müvekkilin anahtarı işi hiç göremez (404).
 *  - Adım yazımının tek yazıcısı işi üstlenen eklentidir (aynı cihaz); iş bitince adım yazılamaz.
 *  - 5 dakika hareketsiz iş ZAMAN_ASIMI olur (sağlık cron'u `senkronIsZamanAsimi()` çağırır) ve SistemOlay'a düşer.
 *  - İşletim kaydıdır (Cascade); hukuki kayıt değildir. Kişiye bağlı iz: isteyenId (program), anahtarId (eklenti).
 */
import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sistemOlayKaydet } from '@/lib/konsrucu/sistem-olay'
import {
  ACIK_DURUMLAR, BITIS_DURUMLARI, CALISAN_DURUMLAR, ZAMAN_ASIMI_MS, adimBirlestir, adimDogrula,
  type AdimGirdisi, type BitisDurumu, type IsTuru, type NabizSatiri,
} from './is-saf'

type Kimlik = { izinli: string[]; userId: string | null; anahtarId?: string | null }
type Hata = { ok: false; status: 400 | 404 | 409; error: string }

const CIHAZ_RE = /^[A-Za-z0-9_-]{8,64}$/
const SURUM_RE = /^\d+(\.\d+){0,3}$/

export function cihazGecerli(c: unknown): c is string {
  return typeof c === 'string' && CIHAZ_RE.test(c)
}
function surumTemiz(s: unknown): string | null {
  const x = String(s ?? '').trim()
  return SURUM_RE.test(x) ? x : null
}

// ── Program tarafı ──────────────────────────────────────────────────────────

/**
 * İş açar. Aynı dosya ve türde sürmekte olan (BEKLIYOR/ALINDI/CALISIYOR) iş varsa yenisini açmaz, onu döndürür
 * ("Kaydet ve UYAP'tan çek"e iki kez basmak kuyruğu şişirmesin).
 */
export async function isOlustur(p: { musteriId: string; dosyaId: string; tur: IsTuru; hedef: Record<string, unknown>; isteyenId: string | null }): Promise<{ id: string; yeni: boolean }> {
  const acik = await prisma.senkronIs.findFirst({
    where: { dosyaId: p.dosyaId, musteriId: p.musteriId, tur: p.tur, durum: { in: [...ACIK_DURUMLAR] } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })
  if (acik) return { id: acik.id, yeni: false }
  const is = await prisma.senkronIs.create({
    data: { musteriId: p.musteriId, dosyaId: p.dosyaId, tur: p.tur, hedefJson: p.hedef as Prisma.InputJsonValue, isteyenId: p.isteyenId },
    select: { id: true },
  })
  return { id: is.id, yeni: true }
}

/** Kullanıcı sıradaki (henüz üstlenilmemiş) işi iptal eder. Hukuki kayıt değildir; satır kalır (IPTAL). */
export async function isIptal(id: string, musteriIds: string[]): Promise<boolean> {
  const r = await prisma.senkronIs.updateMany({ where: { id, musteriId: { in: musteriIds }, durum: 'BEKLIYOR' }, data: { durum: 'IPTAL', bittiAt: new Date() } })
  return r.count === 1
}

/** Dosyanın en son işi (canlı panel). */
export async function dosyaSonIsi(dosyaId: string, musteriIds: string[]) {
  return prisma.senkronIs.findFirst({
    where: { dosyaId, musteriId: { in: musteriIds } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, tur: true, durum: true, adimlarJson: true, ozetJson: true, hata: true, createdAt: true, alindiAt: true, bittiAt: true, updatedAt: true, eklentiSurum: true },
  })
}

/** Kiracının son nabızları ("UYAP bağlı mı?"). */
export async function sonNabizlar(musteriIds: string[]): Promise<NabizSatiri[]> {
  if (!musteriIds.length) return []
  return prisma.eklentiNabiz.findMany({
    where: { musteriId: { in: musteriIds } },
    orderBy: { sonGorulme: 'desc' },
    take: 10,
    select: { cihaz: true, surum: true, uyapOturum: true, sonGorulme: true },
  })
}

// ── Eklenti tarafı ──────────────────────────────────────────────────────────

/** Nabız: eklenti 10 sn'de bir iş sırasını sorarken yazar. (musteriId, cihaz) başına tek satır. */
export async function nabizYaz(k: Kimlik, n: { cihaz: string; surum: unknown; uyapOturum: boolean }, simdi: Date = new Date()): Promise<void> {
  const surum = surumTemiz(n.surum) ?? '?'
  for (const musteriId of k.izinli) {
    await prisma.eklentiNabiz.upsert({
      where: { musteriId_cihaz: { musteriId, cihaz: n.cihaz } },
      create: { musteriId, cihaz: n.cihaz, surum, uyapOturum: n.uyapOturum, sonGorulme: simdi, kullaniciId: k.userId, anahtarId: k.anahtarId ?? null },
      update: { surum, uyapOturum: n.uyapOturum, sonGorulme: simdi, kullaniciId: k.userId, anahtarId: k.anahtarId ?? null },
    })
  }
}

/** Bekleyen işler: en eski önce (hepsi "öncelikli"dir; toplu tur bunlardan sonra gelir). */
export async function siradakiIsler(musteriIds: string[], limit = 5): Promise<{ id: string; tur: string }[]> {
  if (!musteriIds.length) return []
  return prisma.senkronIs.findMany({
    where: { musteriId: { in: musteriIds }, durum: 'BEKLIYOR' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true, tur: true },
  })
}

export type IsHedefi = {
  id: string // program dosya kimliği
  icraDosyaNo: string | null
  daire: string | null
  alacakliUnvan: string | null
  hukukDosyaNo: string | null
  uyapDosyaId: string | null
}
export type UstlenilenIs = { id: string; tur: string; dosyaId: string; hedef: IsHedefi }

/** Atomik üstlenme. Aynı işi ikinci eklenti alamaz (409); başka kiracının işi görünmez (404). */
export async function isUstlen(id: string, k: Kimlik, cihaz: string, surum: unknown, simdi: Date = new Date()): Promise<{ ok: true; is: UstlenilenIs } | Hata> {
  const r = await prisma.senkronIs.updateMany({
    where: { id, musteriId: { in: k.izinli }, durum: 'BEKLIYOR' },
    data: {
      durum: 'ALINDI', alindiAt: simdi, cihaz, eklentiSurum: surumTemiz(surum), anahtarId: k.anahtarId ?? null,
      adimlarJson: adimBirlestir([], { adim: 'ULASTI', durum: 'TAMAM' }, simdi) as unknown as Prisma.InputJsonValue,
    },
  })
  if (r.count !== 1) {
    const var_ = await prisma.senkronIs.findFirst({ where: { id, musteriId: { in: k.izinli } }, select: { durum: true } })
    return var_ ? { ok: false, status: 409, error: `iş zaten ${var_.durum === 'BEKLIYOR' ? 'alınıyor' : 'başka bir eklentide ya da bitmiş'} (${var_.durum})` } : { ok: false, status: 404, error: 'iş bulunamadı' }
  }
  const is = await prisma.senkronIs.findUnique({
    where: { id },
    select: {
      id: true, tur: true, dosyaId: true, hedefJson: true, musteriId: true,
      dosya: { select: { id: true, icraDosyaNo: true, icraDairesi: true, yetkiliIcra: true, hukukDosyaNo: true, cikarimJson: true } },
    },
  })
  if (!is) return { ok: false, status: 404, error: 'iş bulunamadı' }
  const ayar = await prisma.ayarlar.findUnique({ where: { musteriId: is.musteriId }, select: { alacakliUnvan: true } })
  const h = (is.hedefJson ?? {}) as { daire?: string | null; esas?: string | null; uyapDosyaId?: string | null }
  const tevzi = ((is.dosya.cikarimJson ?? {}) as { tevzi?: { uyapDosyaId?: string | null } }).tevzi
  return {
    ok: true,
    is: {
      id: is.id,
      tur: is.tur,
      dosyaId: is.dosyaId,
      hedef: {
        id: is.dosya.id,
        icraDosyaNo: h.esas ?? is.dosya.icraDosyaNo ?? null,
        daire: h.daire ?? is.dosya.icraDairesi ?? is.dosya.yetkiliIcra ?? null,
        alacakliUnvan: ayar?.alacakliUnvan ?? null,
        hukukDosyaNo: is.dosya.hukukDosyaNo ?? null,
        uyapDosyaId: h.uyapDosyaId ?? tevzi?.uyapDosyaId ?? null,
      },
    },
  }
}

/** Adım yaz. Yalnız işi üstlenen cihaz, iş sürerken. */
export async function adimYaz(id: string, k: Kimlik, cihaz: string, girdi: AdimGirdisi, simdi: Date = new Date()): Promise<{ ok: true } | Hata> {
  const is = await prisma.senkronIs.findFirst({ where: { id, musteriId: { in: k.izinli } }, select: { durum: true, tur: true, cihaz: true, adimlarJson: true } })
  if (!is) return { ok: false, status: 404, error: 'iş bulunamadı' }
  if (!(CALISAN_DURUMLAR as readonly string[]).includes(is.durum)) return { ok: false, status: 409, error: `iş sürmüyor (${is.durum})` }
  if (is.cihaz && is.cihaz !== cihaz) return { ok: false, status: 409, error: 'iş başka bir cihazda' }
  const adim = adimDogrula(is.tur, girdi)
  if (!adim) return { ok: false, status: 400, error: 'geçersiz adım' }
  const adimlar = adimBirlestir(is.adimlarJson, adim, simdi)
  const r = await prisma.senkronIs.updateMany({
    where: { id, durum: { in: [...CALISAN_DURUMLAR] }, ...(is.cihaz ? { cihaz: is.cihaz } : {}) },
    data: { durum: 'CALISIYOR', adimlarJson: adimlar as unknown as Prisma.InputJsonValue },
  })
  if (r.count !== 1) return { ok: false, status: 409, error: 'iş bu arada bitti ya da zaman aşımına düştü' }
  return { ok: true }
}

const OZET_SAYI = ['evrakSayisi', 'yeniEvrak', 'buyukEvrak', 'uyapAsilAlacak'] as const
const OZET_METIN = ['eslesme', 'eslesmeNot', 'durumMetni'] as const

/** Eklentinin gönderdiği özetten yalnız bilinen alanlar (serbest JSON DB'yi kirletmesin). */
export function ozetTemizle(o: unknown): Record<string, number | string> {
  const out: Record<string, number | string> = {}
  if (!o || typeof o !== 'object') return out
  const x = o as Record<string, unknown>
  for (const k of OZET_SAYI) { const n = Number(x[k]); if (x[k] != null && Number.isFinite(n)) out[k] = Math.round(n * 100) / 100 }
  for (const k of OZET_METIN) { if (x[k] != null && String(x[k]).trim()) out[k] = String(x[k]).replace(/\s+/g, ' ').trim().slice(0, 300) }
  return out
}

/** İşi bitir (TAMAM | KISMI | HATA). Aktivite satırı işi üstlenen kişinin adıyla yazılır. */
export async function isBitir(id: string, k: Kimlik, cihaz: string, g: { durum: unknown; ozet?: unknown; hata?: unknown }, simdi: Date = new Date()): Promise<{ ok: true } | Hata> {
  const durum = String(g.durum ?? '').trim().toUpperCase()
  if (!(BITIS_DURUMLARI as readonly string[]).includes(durum)) return { ok: false, status: 400, error: 'geçersiz bitiş durumu' }
  const is = await prisma.senkronIs.findFirst({ where: { id, musteriId: { in: k.izinli } }, select: { durum: true, cihaz: true, dosyaId: true, tur: true } })
  if (!is) return { ok: false, status: 404, error: 'iş bulunamadı' }
  if (!(CALISAN_DURUMLAR as readonly string[]).includes(is.durum)) return { ok: false, status: 409, error: `iş sürmüyor (${is.durum})` }
  if (is.cihaz && is.cihaz !== cihaz) return { ok: false, status: 409, error: 'iş başka bir cihazda' }
  const ozet = ozetTemizle(g.ozet)
  const hata = g.hata == null ? null : String(g.hata).replace(/\s+/g, ' ').trim().slice(0, 500) || null
  const r = await prisma.senkronIs.updateMany({
    where: { id, durum: { in: [...CALISAN_DURUMLAR] }, ...(is.cihaz ? { cihaz: is.cihaz } : {}) },
    data: { durum: durum as BitisDurumu, ozetJson: ozet as Prisma.InputJsonValue, hata, bittiAt: simdi },
  })
  if (r.count !== 1) return { ok: false, status: 409, error: 'iş bu arada bitti ya da zaman aşımına düştü' }
  const etiket = is.tur === 'KOPILOT' ? 'UYAP Takip Aç paneli açıldı' : `UYAP anlık senkron ${durum === 'TAMAM' ? 'tamamlandı' : durum === 'KISMI' ? 'kısmen tamamlandı' : 'başarısız'}`
  await prisma.aktivite.create({ data: { dosyaId: is.dosyaId, kullaniciId: k.userId, eylem: etiket, detayJson: { isId: id, ...ozet, ...(hata ? { hata } : {}) } as Prisma.InputJsonValue } }).catch(() => null)
  return { ok: true }
}

// ── Sağlık cron'u ───────────────────────────────────────────────────────────

/** Üstlenilmeyen iş bu süreden sonra da kuyrukta kalmaz (UYAP günlerce kapalı kaldıysa toplu tur zaten çeker). */
export const BEKLEME_SINIRI_MS = 24 * 3_600_000

/** Zaman aşımı taramasının kapsamı. Boşsa kiracılar arası (sağlık ucu); doluysa yalnız o müvekkil / dosya. */
export type ZamanAsimiKapsami = { musteriIds?: string[]; dosyaId?: string }

/** Bu iş zaman aşımına düşmüş mü? (Canlı panel okurken tembel kapanış için; cron'la aynı eşikler.) */
export function isTakiliMi(is: { durum: string; createdAt: Date | string; updatedAt: Date | string }, simdi: Date = new Date()): boolean {
  if ((CALISAN_DURUMLAR as readonly string[]).includes(is.durum)) return simdi.getTime() - new Date(is.updatedAt).getTime() > ZAMAN_ASIMI_MS
  if (is.durum === 'BEKLIYOR') return simdi.getTime() - new Date(is.createdAt).getTime() > BEKLEME_SINIRI_MS
  return false
}

/**
 * Takılı işleri kapatır: 5 dakikadır hareketsiz ALINDI/CALISIYOR → ZAMAN_ASIMI; 24 saattir üstlenilmemiş
 * BEKLIYOR → ZAMAN_ASIMI. Kapatılan varsa SistemOlay'a tek satır yazar (Ayarlar > Sistem Olayları).
 * Çağıranlar: GET /api/uyap/is/saglik (cron; kiracılar arası, `@@index([durum, updatedAt])`) ve canlı panel
 * (`senkronIsDurumu`, yalnız o dosya) — cron seyrek çalışsa da takılı iş ekranda 5 dakikada kapanır.
 */
export async function senkronIsZamanAsimi(simdi: Date = new Date(), kapsam: ZamanAsimiKapsami = {}): Promise<{ hareketsiz: number; ustlenilmeyen: number }> {
  const esik = new Date(simdi.getTime() - ZAMAN_ASIMI_MS)
  const beklemeEsik = new Date(simdi.getTime() - BEKLEME_SINIRI_MS)
  if (kapsam.musteriIds && !kapsam.musteriIds.length) return { hareketsiz: 0, ustlenilmeyen: 0 }
  const kosul = {
    ...(kapsam.musteriIds ? { musteriId: { in: kapsam.musteriIds } } : {}),
    ...(kapsam.dosyaId ? { dosyaId: kapsam.dosyaId } : {}),
  }
  const takili = await prisma.senkronIs.findMany({
    where: { ...kosul, durum: { in: [...CALISAN_DURUMLAR] }, updatedAt: { lt: esik } },
    select: { id: true, musteriId: true, dosyaId: true, tur: true, cihaz: true, durum: true },
    take: 500,
  })
  const eski = await prisma.senkronIs.findMany({
    where: { ...kosul, durum: 'BEKLIYOR', createdAt: { lt: beklemeEsik } },
    select: { id: true, musteriId: true, dosyaId: true, tur: true },
    take: 500,
  })
  let hareketsiz = 0
  let ustlenilmeyen = 0
  if (takili.length) {
    const r = await prisma.senkronIs.updateMany({
      where: { id: { in: takili.map((t) => t.id) }, durum: { in: [...CALISAN_DURUMLAR] }, updatedAt: { lt: esik } },
      data: { durum: 'ZAMAN_ASIMI', hata: '5 dakika hareketsiz kaldı (sağlık bekçisi)', bittiAt: simdi },
    })
    hareketsiz = r.count
  }
  if (eski.length) {
    const r = await prisma.senkronIs.updateMany({
      where: { id: { in: eski.map((t) => t.id) }, durum: 'BEKLIYOR' },
      data: { durum: 'ZAMAN_ASIMI', hata: '24 saat içinde hiçbir eklenti üstlenmedi', bittiAt: simdi },
    })
    ustlenilmeyen = r.count
  }
  if (hareketsiz || ustlenilmeyen) {
    await sistemOlayKaydet('SENKRON_UYARI', 'uyap-is-kuyrugu', `Anlık senkron: ${hareketsiz} iş 5 dakika hareketsiz kaldı, ${ustlenilmeyen} iş 24 saatte üstlenilmedi (ZAMAN_ASIMI). Dosyalar sonraki toplu turda yeniden denenir.`, {
      hareketsiz: takili.map((t) => ({ id: t.id, musteriId: t.musteriId, dosyaId: t.dosyaId, tur: t.tur, cihaz: t.cihaz, onceki: t.durum })),
      ustlenilmeyen: eski.map((t) => ({ id: t.id, musteriId: t.musteriId, dosyaId: t.dosyaId, tur: t.tur })),
    })
  }
  return { hareketsiz, ustlenilmeyen }
}
