/**
 * KonsRücü — dava kaydı yardımcıları · lib/konsrucu/dava/kayit.ts (saf, client-safe)
 *
 * - Esas no ve mahkeme adı ayrıştırma (Excel #20/#21, elle giriş, UYAP adı). Ayrıştırılamayan değer uydurulmaz:
 *   alan boş kalır ve "ayrıştırılamadı" uyarısı döner.
 * - `Asama(DAVA)` ↔ `Dava` aynası (06 §3.6: asıl kaynak uzantıdır; Asama.kimlikNo/birim/baslangic aynalanır).
 * - Alt kayıt kapsamı (M7, 06 §3.1 ilke 3): DavaTaraf/DavaIslem/IhtiyatiHaciz'in dosyaId'si ÜST kaydınkiyle aynı olmak
 *   zorundadır; yazma yardımcısı bunu denetler.
 * - Kayıt kaynağı ve teyit işareti: Arabuluculuk/Dava/Asama tablolarında kaynakTuru/teyit kolonu yok →
 *   işaret Asama.detayJson'da taşınır ({kaynakTuru, teyit}).
 */
import { MAHKEME_TUR_ETIKET, type MahkemeTuru } from './sabitler'

export type EsasNo = { yil: number; sira: number }

/** "2026/384", "2026 / 384 E.", "2026/384 Esas" → {2026, 384}. Yıl 1990–2100 arası olmalı. */
export function esasCoz(ham: string | null | undefined): EsasNo | null {
  if (!ham) return null
  const m = String(ham).match(/(\d{4})\s*\/\s*(\d{1,7})/)
  if (!m) return null
  const yil = Number(m[1]), sira = Number(m[2])
  if (yil < 1990 || yil > 2100 || sira < 1) return null
  return { yil, sira }
}

export function esasMetni(yil: number | null | undefined, sira: number | null | undefined): string | null {
  return yil && sira ? `${yil}/${sira}` : null
}

export type MahkemeCozum = { tur: MahkemeTuru | null; yer: string | null; no: string | null; ham: string; ayristirilamadi: boolean }

const TUR_KALIP: { tur: MahkemeTuru; re: RegExp }[] = [
  { tur: 'ASLIYE_TICARET', re: /asliye\s+ticaret/i },
  { tur: 'ASLIYE_HUKUK', re: /asliye\s+hukuk/i },
  { tur: 'TUKETICI', re: /t[üu]ketici/i },
  { tur: 'SULH_HUKUK', re: /sulh\s+hukuk/i },
  { tur: 'ICRA_HUKUK', re: /icra\s+hukuk/i },
  { tur: 'BAM', re: /b[öo]lge\s+adliye/i },
  { tur: 'YARGITAY', re: /yarg[ıi]tay/i },
]

/**
 * "Ankara 51. Asliye Hukuk Mahkemesi" → {ASLIYE_HUKUK, 'Ankara', '51'}; "Sakarya Tüketici Mahkemesi" → {TUKETICI, 'Sakarya', null}.
 * Yer = tür ifadesinden (ve numaradan) önceki kısım. Tür bulunamazsa tur=null, ayristirilamadi=true.
 */
export function mahkemeCoz(ham: string | null | undefined): MahkemeCozum | null {
  if (!ham) return null
  const s = String(ham).replace(/\s+/g, ' ').trim()
  if (!s) return null
  const k = TUR_KALIP.map((x) => ({ ...x, m: x.re.exec(s) })).find((x) => x.m)
  if (!k || !k.m) return { tur: null, yer: null, no: null, ham: s, ayristirilamadi: true }
  const once = s.slice(0, k.m.index).trim()
  const nm = once.match(/^(.*?)(?:\s+(\d{1,3})\s*\.?)$/)
  const yer = (nm ? nm[1] : once).trim() || null
  const no = nm ? nm[2] : null
  return { tur: k.tur, yer, no, ham: s, ayristirilamadi: false }
}

/** Mahkeme görünen adı: "Ankara 51. Asliye Hukuk" (uydurma ek yok). */
export function mahkemeAdi(d: { mahkemeTuru?: string | null; mahkemeYer?: string | null; mahkemeNo?: string | null }): string | null {
  const tur = d.mahkemeTuru ? MAHKEME_TUR_ETIKET[d.mahkemeTuru as MahkemeTuru] ?? d.mahkemeTuru : null
  const p = [d.mahkemeYer, d.mahkemeNo ? `${d.mahkemeNo}.` : null, tur].filter(Boolean)
  return p.length ? p.join(' ') : null
}

/** Dava → Asama(DAVA) aynası. */
export function asamaAynasi(d: { mahkemeTuru?: string | null; mahkemeYer?: string | null; mahkemeNo?: string | null; esasYil?: number | null; esasSira?: number | null; acilisTarihi?: Date | null }) {
  const birim = mahkemeAdi(d)
  return {
    kimlikNo: esasMetni(d.esasYil, d.esasSira),
    birim: birim ? `${birim} Mahkemesi` : null,
    baslangic: d.acilisTarihi ?? null,
  }
}

/** Arabuluculuk → Asama(ARABULUCULUK) aynası. */
export function arabuluculukAsamaAynasi(a: { uyapDosyaNo?: string | null; buroNo?: string | null; basvuruNo?: string | null; basvuruTarihi?: Date | null; sonTutanakTarihi?: Date | null }) {
  return {
    kimlikNo: a.uyapDosyaNo ?? a.buroNo ?? a.basvuruNo ?? null,
    baslangic: a.basvuruTarihi ?? null,
    bitis: a.sonTutanakTarihi ?? null,
  }
}

export class KapsamHatasi extends Error {
  constructor(m: string) {
    super(m)
    this.name = 'KapsamHatasi'
  }
}

/** Alt kayıt dosyaId'si üst kaydınkiyle aynı mı? Değilse yazma DURUR (M7). */
export function altKayitDosyaDenetle(ust: { dosyaId: string }, alt: { dosyaId: string }): void {
  if (!ust.dosyaId || ust.dosyaId !== alt.dosyaId) throw new KapsamHatasi('Alt kaydın dosyası üst kaydın dosyasıyla aynı değil: yazma durduruldu.')
}

/** Alt kayıt verisini üst kayıttan türet: dosyaId DAİMA üst kayıttan gelir (istemciden gelmez). */
export function altKayit<T extends Record<string, unknown>>(ust: { id: string; dosyaId: string }, veri: T): T & { davaId: string; dosyaId: string } {
  const sonuc = { ...veri, davaId: ust.id, dosyaId: ust.dosyaId }
  altKayitDosyaDenetle(ust, sonuc)
  return sonuc
}

export type KayitIsareti = { kaynakTuru: string; teyit: 'ADAY' | 'TEYITLI' | 'REDDEDILDI'; girenId?: string | null; at?: string }

/** Asama.detayJson'dan kaynak/teyit işaretini oku. İşaretsiz (eski) kayıt elle girilmiş ve teyitli sayılır. */
export function kayitIsaretiOku(detayJson: unknown): KayitIsareti {
  const d = detayJson && typeof detayJson === 'object' && !Array.isArray(detayJson) ? (detayJson as Record<string, unknown>) : {}
  const gd = d.geriDoldurma && typeof d.geriDoldurma === 'object' ? (d.geriDoldurma as Record<string, unknown>) : null
  const kaynakTuru = typeof d.kaynakTuru === 'string' ? d.kaynakTuru : gd && typeof gd.kaynakTuru === 'string' ? gd.kaynakTuru : 'ELLE'
  const t = typeof d.teyit === 'string' ? d.teyit : gd && typeof gd.teyit === 'string' ? gd.teyit : 'TEYITLI'
  const teyit = t === 'ADAY' || t === 'REDDEDILDI' ? t : 'TEYITLI'
  return { kaynakTuru, teyit }
}

/** detayJson'a işareti birleştir (mevcut alanlar korunur). */
export function kayitIsaretiYaz(detayJson: unknown, isaret: KayitIsareti): Record<string, unknown> {
  const d = detayJson && typeof detayJson === 'object' && !Array.isArray(detayJson) ? { ...(detayJson as Record<string, unknown>) } : {}
  if (d.geriDoldurma && typeof d.geriDoldurma === 'object') d.geriDoldurma = { ...(d.geriDoldurma as Record<string, unknown>), teyit: isaret.teyit }
  return { ...d, kaynakTuru: isaret.kaynakTuru, teyit: isaret.teyit, ...(isaret.girenId ? { girenId: isaret.girenId } : {}), ...(isaret.at ? { isaretAt: isaret.at } : {}) }
}
