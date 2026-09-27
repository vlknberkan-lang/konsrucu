/**
 * KonsRücü — Kural çıkarıcıları (yapay zekâsız) · lib/konsrucu/oneri/kural-cikarici.ts  (saf; client-safe)
 *
 * S18 (06 §2(a) adım 5 "Kural katmanı"; Varyant B). Okunan belge metninde (BelgeSayfa ya da eski Belge.extractedText)
 * kalıplarla şunları bulur ve `AlanDegeri(kaynakTuru = KURAL)` önerisi üretir:
 *   - poliçe numarası, tanzim tarihi, başlangıç ve bitiş (yalnız poliçe sayfasında),
 *   - kaza tarihi (poliçe ve dekont dışındaki sayfalarda; etiketli),
 *   - plaka (poliçede sigortalı plaka; tutanakta plaka listesi),
 *   - dekont tutarı ve tarihi (yalnız dekont sayfasında; masraf/komisyon satırları hariç).
 * Alıntı sayfa metninin kendisinden kesilir; bu yüzden alıntı doğrulaması birebir geçer. Etiketsiz tarih ya da
 * tutar ASLA öneri olmaz (yanlış veri üretmemek, "güvenli hata" tarafı).
 *
 * Hiçbir değer kolonlara yazılmaz; hepsi öneridir, avukat onaylar.
 */
import type { YeniOneri } from './tipler'
import { odemeAlanAnahtari, paraNormal, plakaNormal, tarihNormal } from './alanlar'
import { alintiKatla, alintiKisalt } from './alinti'

export type KuralSayfa = {
  belgeId: string
  sayfaNo: number
  metin: string
  /** Belge.kategori (BelgeKategori) ve Belge.altTur — sayfa türünü belirler. */
  kategori?: string | null
  altTur?: string | null
}

export const KURAL_SURUM = 1
const u = (kod: string) => `KURAL:${kod}@${KURAL_SURUM}`

// ───────────────────────── Türkçe duyarsız etiket kalıpları ─────────────────────────

const HARF_SINIF: Record<string, string> = {
  i: '[iİIı]', ı: '[ıIiİ]', ç: '[çÇcC]', c: '[cCçÇ]', ş: '[şŞsS]', s: '[sSşŞ]', ğ: '[ğĞgG]', g: '[gGğĞ]',
  ü: '[üÜuU]', u: '[uUüÜ]', ö: '[öÖoO]', o: '[oOöÖ]',
}
/** "poliçe no" → Türkçe harf ve büyük/küçük harf duyarsız kalıp kaynağı (kelime arası boşluk esnek). */
function et(ifade: string): string {
  let r = ''
  for (const ch of ifade) {
    if (ch === ' ') r += '\\s*'
    else if (HARF_SINIF[ch]) r += HARF_SINIF[ch]
    else if (/[a-z]/.test(ch)) r += `[${ch}${ch.toUpperCase()}]`
    else r += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return r
}
const ya = (...ifadeler: string[]) => `(?:${ifadeler.map(et).join('|')})`
/** Etiket ile değer arası: boşluk, iki nokta, nokta, tire. */
const AYRAC = '\\s*[:：.\\-]?\\s*'
const TARIH = '(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})'
const SAAT = '(?:\\s*(?:[Ss]aat\\s*[:]?\\s*)?(\\d{1,2})[:.](\\d{2}))?'
/** Etiketin kelime başında başlaması: öncesinde harf olmamalı. */
const BAS = '(?:^|[^A-Za-zÇĞİÖŞÜçğıöşü])'

const gunIso = (g: string, a: string, y: string) => tarihNormal(`${g}.${a}.${y}`)

type Bulgu = { bas: number; son: number; metin: string }
function hepsi(re: RegExp, metin: string): (RegExpExecArray & { bas: number })[] {
  const out: (RegExpExecArray & { bas: number })[] = []
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = g.exec(metin))) {
    // BAS önekindeki harf-dışı karakteri alıntıdan çıkar
    const onek = m[0].length - m[0].replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+/, '').length
    out.push(Object.assign(m, { bas: m.index + onek }))
    if (m[0].length === 0) g.lastIndex++
  }
  return out
}
const kes = (metin: string, bas: number, son: number): Bulgu => ({ bas, son, metin: metin.slice(bas, son).replace(/[-\s]+$/, '') })

// ───────────────────────── sayfa türleri ─────────────────────────

const icerir = (katli: string, ...ifadeler: string[]) => ifadeler.some((i) => katli.includes(i))
const altTurIcerir = (s: KuralSayfa, parca: string) => (s.altTur ?? '').toUpperCase().includes(parca)
const turBelirsiz = (s: KuralSayfa) => !s.kategori || s.kategori === 'DIGER'

export function policeSayfasiMi(s: KuralSayfa, katli = alintiKatla(s.metin)): boolean {
  if (s.kategori === 'POLICE' || altTurIcerir(s, 'POLICE')) return true
  return turBelirsiz(s) && icerir(katli, 'tanzim tarihi', 'brut prim', 'net prim', 'sigorta ettiren')
}
export function dekontSayfasiMi(s: KuralSayfa, katli = alintiKatla(s.metin)): boolean {
  if (s.kategori === 'DEKONT' || altTurIcerir(s, 'DEKONT')) return true
  return turBelirsiz(s) && icerir(katli, 'dekont')
}
export function tutanakSayfasiMi(s: KuralSayfa, katli = alintiKatla(s.metin)): boolean {
  if (s.kategori === 'TUTANAK' || altTurIcerir(s, 'TUTANAK') || altTurIcerir(s, 'KTT')) return true
  return turBelirsiz(s) && icerir(katli, 'kaza tespit tutanagi')
}

// ───────────────────────── kalıplar ─────────────────────────

const RE_POLICE_NO = new RegExp(`${BAS}${et('poliçe')}\\s*${ya('numarası', 'nosu', 'no')}${AYRAC}([A-Za-z0-9][A-Za-z0-9\\-/]{3,39})`, 'g')
const RE_TANZIM = new RegExp(`${BAS}${et('tanzim')}\\s*${ya('tarihi', 'tarih')}?${AYRAC}${TARIH}`, 'g')
const RE_BASLANGIC = new RegExp(`${BAS}(?:${ya('poliçe', 'vade', 'sigorta')}\\s*)?${ya('başlangıç tarihi', 'başlangıç', 'başlama tarihi')}${AYRAC}${TARIH}`, 'g')
const RE_BITIS = new RegExp(`${BAS}(?:${ya('poliçe', 'vade', 'sigorta')}\\s*)?${ya('bitiş tarihi', 'bitiş', 'sona erme tarihi')}${AYRAC}${TARIH}`, 'g')
const RE_VADE_ARALIK = new RegExp(`${BAS}${ya('vade', 'sigorta süresi', 'poliçe süresi', 'geçerlilik süresi')}${AYRAC}${TARIH}\\s*(?:-|–|—|${et('ile')})\\s*${TARIH}`, 'g')
const RE_KAZA_TARIHI = new RegExp(`${BAS}(${ya('kaza tarihi', 'kaza tarih', 'kazanın tarihi', 'olay tarihi')}|${et('hasar tarihi')})(?:\\s*${et('ve saati')})?${AYRAC}${TARIH}${SAAT}`, 'g')
const RE_PLAKA_ETIKETLI = new RegExp(`${BAS}${et('plaka')}(?:${ya('sı', 'no', 'numarası')})?${AYRAC}(\\d{2}\\s?[A-Za-z]{1,3}\\s?\\d{2,5})(?![0-9])`, 'g')
const TUTAR = '(\\d{1,3}(?:\\.\\d{3})+,\\d{2}|\\d{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+,\\d{2}|\\d+\\.\\d{2}|\\d{1,3}(?:\\.\\d{3})+|\\d+)'
const RE_DEKONT_TUTAR = new RegExp(
  `${BAS}${ya('işlem tutarı', 'havale tutarı', 'eft tutarı', 'fast tutarı', 'ödenen tutar', 'ödeme tutarı', 'transfer tutarı', 'gönderilen tutar', 'tutarı', 'tutar')}${AYRAC}(?:TL|TRY|₺)?\\s*${TUTAR}\\s*(?:TL|TRY|₺)?`,
  'g',
)
const RE_DEKONT_TARIH = new RegExp(`${BAS}${ya('işlem tarihi', 'ödeme tarihi', 'havale tarihi', 'dekont tarihi', 'valör tarihi', 'valör', 'tarih')}${AYRAC}${TARIH}`, 'g')
/** Dekontta ödeme sayılmayan tutar satırları (banka masrafı, vergi…). */
const TUTAR_HARIC = ['masraf', 'komisyon', 'bsmv', 'ucret', 'vergi', 'kesinti', 'bakiye', 'limit']

const enYakin = <T extends { bas: number }>(liste: T[], bas: number): T | null =>
  liste.reduce<T | null>((en, x) => (!en || Math.abs(x.bas - bas) < Math.abs(en.bas - bas) ? x : en), null)

// ───────────────────────── çıkarıcılar ─────────────────────────

function policeCikar(s: KuralSayfa): YeniOneri[] {
  const out: YeniOneri[] = []
  const temel = { kaynakTuru: 'KURAL' as const, kaynakBelgeId: s.belgeId, sayfa: s.sayfaNo }
  for (const m of hepsi(RE_POLICE_NO, s.metin)) {
    const no = m[1].replace(/[-/]+$/, '')
    if ((no.match(/\d/g) ?? []).length < 4) continue
    out.push({ ...temel, alan: 'policeNo', deger: no.toUpperCase(), alinti: alintiKisalt(kes(s.metin, m.bas, m.index + m[0].length).metin), guven: 0.9, uretici: u('POLICE_NO') })
  }
  const tarihOneri = (re: RegExp, alan: string, kod: string, g = 1) => {
    for (const m of hepsi(re, s.metin)) {
      const iso = gunIso(m[g], m[g + 1], m[g + 2])
      if (!iso) continue
      out.push({ ...temel, alan, deger: iso, alinti: alintiKisalt(kes(s.metin, m.bas, m.index + m[0].length).metin), guven: 0.85, uretici: u(kod) })
    }
  }
  tarihOneri(RE_TANZIM, 'policeTanzimTarihi', 'POLICE_TANZIM')
  tarihOneri(RE_BASLANGIC, 'policeBaslangic', 'POLICE_BASLANGIC')
  tarihOneri(RE_BITIS, 'policeBitis', 'POLICE_BITIS')
  for (const m of hepsi(RE_VADE_ARALIK, s.metin)) {
    const b = gunIso(m[1], m[2], m[3]), e = gunIso(m[4], m[5], m[6])
    if (!b || !e || e <= b) continue
    const alinti = alintiKisalt(kes(s.metin, m.bas, m.index + m[0].length).metin)
    out.push({ ...temel, alan: 'policeBaslangic', deger: b, alinti, guven: 0.8, uretici: u('POLICE_VADE') })
    out.push({ ...temel, alan: 'policeBitis', deger: e, alinti, guven: 0.8, uretici: u('POLICE_VADE') })
  }
  for (const m of hepsi(RE_PLAKA_ETIKETLI, s.metin)) {
    const p = plakaNormal(m[1])
    if (!p) continue
    out.push({ ...temel, alan: 'sigortaliPlaka', deger: p, alinti: alintiKisalt(kes(s.metin, m.bas, m.index + m[0].length).metin), guven: 0.8, uretici: u('PLAKA_POLICE') })
  }
  return out
}

function kazaTarihiCikar(s: KuralSayfa): YeniOneri[] {
  const out: YeniOneri[] = []
  for (const m of hepsi(RE_KAZA_TARIHI, s.metin)) {
    const iso = gunIso(m[2], m[3], m[4])
    if (!iso) continue
    const hasarEtiketi = alintiKatla(m[1]).startsWith('hasar')
    out.push({
      alan: 'kazaTarihi', deger: iso, kaynakTuru: 'KURAL', kaynakBelgeId: s.belgeId, sayfa: s.sayfaNo,
      alinti: alintiKisalt(kes(s.metin, m.bas, m.index + m[0].length).metin),
      guven: hasarEtiketi ? 0.65 : 0.85, uretici: u(hasarEtiketi ? 'HASAR_TARIHI' : 'KAZA_TARIHI'),
    })
  }
  return out
}

function tutanakPlakaCikar(s: KuralSayfa): YeniOneri[] {
  const bulgular = hepsi(RE_PLAKA_ETIKETLI, s.metin)
    .map((m) => ({ p: plakaNormal(m[1]), m }))
    .filter((x): x is { p: string; m: RegExpExecArray & { bas: number } } => !!x.p)
  const plakalar = [...new Set(bulgular.map((x) => x.p))]
  if (!plakalar.length) return []
  const ilk = bulgular[0].m
  return [{
    alan: 'tutanakPlakalari', deger: plakalar, kaynakTuru: 'KURAL', kaynakBelgeId: s.belgeId, sayfa: s.sayfaNo,
    alinti: alintiKisalt(kes(s.metin, ilk.bas, ilk.index + ilk[0].length).metin), guven: 0.75, uretici: u('PLAKA_TUTANAK'),
  }]
}

function dekontCikar(s: KuralSayfa): YeniOneri[] {
  const tarihler = hepsi(RE_DEKONT_TARIH, s.metin)
    .map((m) => ({ bas: m.bas, son: m.index + m[0].length, iso: gunIso(m[1], m[2], m[3]) }))
    .filter((x): x is { bas: number; son: number; iso: string } => !!x.iso)
  const out: YeniOneri[] = []
  const gorulen = new Set<string>()
  for (const m of hepsi(RE_DEKONT_TUTAR, s.metin)) {
    const once = alintiKatla(s.metin.slice(Math.max(0, m.bas - 24), m.bas))
    const etiket = alintiKatla(m[0])
    if (TUTAR_HARIC.some((h) => once.endsWith(h) || new RegExp(`${h}\\s*$`).test(once) || etiket.startsWith(h))) continue
    const tutar = paraNormal(m[1])
    if (tutar == null) continue
    const t = enYakin(tarihler, m.bas)
    const tarih = t && Math.abs(t.bas - m.bas) <= 400 ? t.iso : null
    const anahtar = odemeAlanAnahtari({ tarih, tutar })
    if (gorulen.has(anahtar)) continue
    gorulen.add(anahtar)
    const tutarSon = m.index + m[0].length
    const bas = t && tarih ? Math.min(t.bas, m.bas) : m.bas
    const son = t && tarih ? Math.max(t.son, tutarSon) : tutarSon
    const alinti = son - bas <= 200 ? kes(s.metin, bas, son).metin : kes(s.metin, m.bas, tutarSon).metin
    out.push({
      alan: anahtar, deger: { tarih, tutar }, kaynakTuru: 'KURAL', kaynakBelgeId: s.belgeId, sayfa: s.sayfaNo,
      alinti: alintiKisalt(alinti), guven: tarih ? 0.85 : 0.6, uretici: u('DEKONT'),
    })
  }
  return out
}

/**
 * Sayfalardan kural önerileri. Aynı alan + aynı değer birden çok sayfada bulunursa yalnız ilki önerilir; farklı
 * değerler ayrı öneri olarak kalır (çelişki ekranda görünür, avukat seçer).
 */
export function kuralCikar(sayfalar: readonly KuralSayfa[]): YeniOneri[] {
  const out: YeniOneri[] = []
  const gorulen = new Set<string>()
  for (const s of sayfalar) {
    if (!s.metin || !s.metin.trim()) continue
    const katli = alintiKatla(s.metin)
    const police = policeSayfasiMi(s, katli)
    const dekont = !police && dekontSayfasiMi(s, katli)
    const adaylar: YeniOneri[] = []
    if (police) adaylar.push(...policeCikar(s))
    if (dekont) adaylar.push(...dekontCikar(s))
    if (!police && !dekont) {
      adaylar.push(...kazaTarihiCikar(s))
      if (tutanakSayfasiMi(s, katli)) adaylar.push(...tutanakPlakaCikar(s))
    }
    for (const a of adaylar) {
      const k = `${a.alan}::${JSON.stringify(a.deger)}`
      if (gorulen.has(k)) continue
      gorulen.add(k)
      out.push(a)
    }
  }
  return out
}
