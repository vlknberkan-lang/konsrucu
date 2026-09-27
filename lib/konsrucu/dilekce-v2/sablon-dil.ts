/**
 * KonsRücü — Dilekçe şablon dili · lib/konsrucu/dilekce-v2/sablon-dil.ts (saf; client-safe)
 *
 * S36 (06 §7.1 "İskelet"; bilgi-bankasi/dilekce/sablonlar/*.md §1 "Söz dizimi"):
 *   {{alan}}                  programın doldurduğu değer; yoksa ⟨alan adı⟩ yer tutucusu (sabit olgu yok, B06)
 *   {{alan|para|tarih|buyuk|buyuk_ilk|yonelme|ilgi|bulunma|ayrilma}}   biçim ve Türkçe hâl ekleri (zincirlenebilir)
 *   {{#k}} … {{/k}}           koşul doğruysa; liste alanında her öğe için (öğede `ilk`, `son` bayrakları)
 *   {{^k}} … {{/k}}           koşul yanlışsa ya da liste boşsa
 *   {{! [B01 BAŞLIK] YARI …}} açıklama; üst düzeyde blok başlatır (kimlik, başlık, blok türü)
 *   {{AI: talimat}}           yapay zekânın dosya kartından yazacağı paragraf yuvası
 *   {{n}}                     blok içinde kesintisiz madde numarası
 *   ⟨atıf: doğrulama bekliyor⟩ düz metindir; composer atıf kapısıyla işler
 *
 * Şablon hiçbir olguyu kendisi taşımaz: bütün dosyaya özgü değerler bağlamdan gelir, gelmeyen değer yer tutucu olur.
 */
import { tarihTR } from '@/lib/konsrucu/format'

// ───────────────────────── türler ─────────────────────────

export const BLOK_TURLERI = ['SABİT', 'AİLE', 'YARI', 'ÖZGÜ', 'ÖNERİ', 'UYARLAMA'] as const
export type BlokTuru = (typeof BLOK_TURLERI)[number]

export const FILTRELER = ['para', 'tarih', 'buyuk', 'buyuk_ilk', 'yonelme', 'ilgi', 'bulunma', 'ayrilma'] as const
export type Filtre = (typeof FILTRELER)[number]

export type Dugum =
  | { t: 'metin'; s: string }
  | { t: 'alan'; ad: string; filtreler: Filtre[] }
  | { t: 'bolum'; ad: string; ters: boolean; cocuklar: Dugum[] }
  | { t: 'ai'; talimat: Dugum[] }
  | { t: 'aciklama'; s: string; blok: BlokEtiketi | null }
  | { t: 'n' }

export type BlokEtiketi = { id: string; baslik: string; tur: BlokTuru | null; aciklama: string }

export type BaglamDegeri = string | number | boolean | Date | null | undefined | BaglamNesnesi[]
export type BaglamNesnesi = { [alan: string]: BaglamDegeri }

export class SablonHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj)
    this.name = 'SablonHatasi'
  }
}

/** Yer tutucu işaretleri (06 §7.4-5; rubrik §1.1). */
export const YER_TUTUCU_RE = /⟨[^⟩\n]{1,200}⟩/gu
/** Alan adlarının okunur Türkçesi (şablon alan adları ASCII yazılmıştır). Listede olmayan ad alt çizgisiz yazılır. */
const ALAN_OKUNUS: Record<string, string> = {
  yol_adi: 'yol adı', kaza_il: 'kaza ili', kaza_ilce: 'kaza ilçesi', kaza_saati: 'kaza saati', kaza_tarihi: 'kaza tarihi',
  davaci_unvan: 'davacı unvanı', davaci_kisa_unvan: 'davacı kısa unvanı', davaci_vkn: 'davacı VKN', davaci_adres: 'davacı adresi',
  vekil_ad_soyad: 'vekil adı soyadı', vekil_uets: 'vekil UETS', davali_unvan: 'davalı unvanı', davali_vkn: 'davalı VKN',
  davali_adres: 'davalı adresi', davali_tckn: 'davalı TCKN', davali_ad_soyad: 'davalı adı soyadı', mahkeme_il: 'mahkeme ili',
  mahkeme_adi: 'mahkeme adı', esas_no: 'esas no', icra_dairesi: 'icra dairesi', icra_esas: 'icra esas no', police_no: 'poliçe no',
  police_turu: 'poliçe türü', sigortali_ad: 'sigortalı', surucu_ad: 'sürücü', hayvan_turu: 'hayvan türü', carpma_bolgesi: 'çarpma bölgesi',
  istikamet_bas: 'istikamet başı', istikamet_son: 'istikamet sonu', ktt_birim: 'tutanağı düzenleyen birim', odeme_tarihi: 'ödeme tarihi',
  asil_alacak: 'asıl alacak', islemis_faiz: 'işlemiş faiz', takip_cikisi: 'takip çıkışı', itiraz_edilen_tutar: 'itiraz edilen tutar',
  itiraz_kapsam_metni: 'itiraz kapsamı', son_tutanak_tarihi: 'son tutanak tarihi', cevap_tarihi: 'cevap dilekçesinin tarihi',
  hasar_dosya_no: 'hasar dosya no', faiz_turu_metni: 'faiz türü', takip_tarihi: 'takip tarihi', tensip_tarihi: 'tensip tarihi',
  // S36 (composer.ts, iskelet.ts): aşama 2 künye ve talep alanları
  dava_degeri: 'dava değeri', dava_degeri_aciklama: 'dava değeri açıklaması', hedef_belge: 'hedef belge',
}
export const yerTutucu = (ad: string) => `⟨${ALAN_OKUNUS[ad] ?? ad.replace(/_/g, ' ')}⟩`
/** Metinde yapay zekâ yuvasının yerini tutan işaret (composer değiştirir; dışarı çıkmaz). */
export const AI_ISARET = (id: string) => `\u0000AI:${id}\u0000`
export const AI_ISARET_RE = /\u0000AI:([^\u0000]+)\u0000/g

// ───────────────────────── ayrıştırma ─────────────────────────

type Jeton = { t: 'metin'; s: string } | { t: 'etiket'; ic: string }

function jetonla(src: string): Jeton[] {
  const out: Jeton[] = []
  let i = 0
  while (i < src.length) {
    const j = src.indexOf('{{', i)
    if (j < 0) { out.push({ t: 'metin', s: src.slice(i) }); break }
    if (j > i) out.push({ t: 'metin', s: src.slice(i, j) })
    let d = 1
    let k = j + 2
    while (k < src.length) {
      if (src.startsWith('{{', k)) { d++; k += 2; continue }
      if (src.startsWith('}}', k)) { d--; if (d === 0) break; k += 2; continue }
      k++
    }
    if (d !== 0) throw new SablonHatasi(`Kapanmayan etiket: "${src.slice(j, j + 40)}…"`)
    out.push({ t: 'etiket', ic: src.slice(j + 2, k) })
    i = k + 2
  }
  return out
}

const ALAN_ADI = /^[A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-zÇĞİÖŞÜçğıöşü0-9_.]*$/

/** "! [B06 TUTANAK VE KUSUR] YARI · kaynak …" → blok etiketi. */
export function blokEtiketiOku(aciklama: string): BlokEtiketi | null {
  const m = /^\s*\[([^\]\s]+)(?:\s+([^\]]*))?\]\s*([\s\S]*)$/u.exec(aciklama)
  if (!m) return null
  const kalan = m[3] ?? ''
  const tur = (kalan.match(/SABİT|AİLE|YARI|ÖZGÜ|ÖNERİ|UYARLAMA/u)?.[0] ?? null) as BlokTuru | null
  return { id: m[1], baslik: (m[2] ?? '').trim(), tur, aciklama: kalan.trim() }
}

export function sablonAyristir(src: string): Dugum[] {
  const kok: Dugum[] = []
  const yigin: { ad: string; cocuklar: Dugum[] }[] = [{ ad: '', cocuklar: kok }]
  const ekle = (d: Dugum) => yigin[yigin.length - 1].cocuklar.push(d)
  for (const j of jetonla(src.replace(/\r\n/g, '\n'))) {
    if (j.t === 'metin') { ekle({ t: 'metin', s: j.s }); continue }
    const ic = j.ic
    const bas = ic.trimStart()
    if (bas.startsWith('!')) {
      const s = bas.slice(1).trim()
      ekle({ t: 'aciklama', s, blok: blokEtiketiOku(s) })
    } else if (/^AI\s*:/u.test(bas)) {
      ekle({ t: 'ai', talimat: sablonAyristir(bas.replace(/^AI\s*:\s*/u, '').trim()) })
    } else if (bas.startsWith('#') || bas.startsWith('^')) {
      const ad = bas.slice(1).trim()
      if (!ALAN_ADI.test(ad)) throw new SablonHatasi(`Geçersiz koşul adı: "${ad}"`)
      const cocuklar: Dugum[] = []
      ekle({ t: 'bolum', ad, ters: bas.startsWith('^'), cocuklar })
      yigin.push({ ad, cocuklar })
    } else if (bas.startsWith('/')) {
      const ad = bas.slice(1).trim()
      const ust = yigin.pop()
      if (!ust || ust.ad !== ad || yigin.length === 0) throw new SablonHatasi(`Beklenmeyen kapanış: {{/${ad}}}${ust?.ad ? ` (açık: ${ust.ad})` : ''}`)
    } else if (bas.trim() === 'n') {
      ekle({ t: 'n' })
    } else {
      const [ad, ...f] = bas.split('|').map((x) => x.trim())
      if (!ALAN_ADI.test(ad)) throw new SablonHatasi(`Geçersiz alan: "{{${ic}}}"`)
      const bilinmeyen = f.filter((x) => !(FILTRELER as readonly string[]).includes(x))
      if (bilinmeyen.length) throw new SablonHatasi(`Bilinmeyen biçim: ${bilinmeyen.join(', ')} ({{${ic}}})`)
      ekle({ t: 'alan', ad, filtreler: f as Filtre[] })
    }
  }
  if (yigin.length !== 1) throw new SablonHatasi(`Kapanmayan koşul: {{#${yigin[yigin.length - 1].ad}}}`)
  return kok
}

// ───────────────────────── bloklar ─────────────────────────

export type SablonBlogu = { etiket: BlokEtiketi; dugumler: Dugum[] }

/** Üst düzey blok açıklamalarından bölünmüş bloklar. İlk açıklamadan önceki metin "GIRIS" bloğudur. */
export function bloklaraBol(dugumler: readonly Dugum[]): SablonBlogu[] {
  const out: SablonBlogu[] = []
  let cari: SablonBlogu = { etiket: { id: 'GIRIS', baslik: '', tur: null, aciklama: '' }, dugumler: [] }
  for (const d of dugumler) {
    if (d.t === 'aciklama' && d.blok) {
      if (cari.dugumler.some((x) => x.t !== 'metin' || x.s.trim())) out.push(cari)
      cari = { etiket: d.blok, dugumler: [] }
      continue
    }
    cari.dugumler.push(d)
  }
  if (cari.dugumler.some((x) => x.t !== 'metin' || x.s.trim()) || !out.length) out.push(cari)
  return out
}

/** Şablonda geçen alan ve koşul adları (onay ekranı ve alan tablosu denetimi için). */
export function sablonAlanlari(dugumler: readonly Dugum[]): { alanlar: string[]; kosullar: string[]; aiYuvasi: number } {
  const alanlar = new Set<string>()
  const kosullar = new Set<string>()
  let aiYuvasi = 0
  const gez = (ds: readonly Dugum[]) => {
    for (const d of ds) {
      if (d.t === 'alan') alanlar.add(d.ad)
      else if (d.t === 'bolum') { kosullar.add(d.ad); gez(d.cocuklar) }
      else if (d.t === 'ai') { aiYuvasi++; gez(d.talimat) }
    }
  }
  gez(dugumler)
  return { alanlar: [...alanlar].sort(), kosullar: [...kosullar].sort(), aiYuvasi }
}

// ───────────────────────── Türkçe biçim ─────────────────────────

const UNLULER = 'aeıioöuüâîû'
const KALIN = 'aıouâû'
const SERT = 'fstkçşhp'
/** Harf adları (kısaltmalar harf harf okunur: KGM → "ka-ge-me"). */
const HARF_ADI: Record<string, string> = {
  a: 'a', b: 'be', c: 'ce', ç: 'çe', d: 'de', e: 'e', f: 'fe', g: 'ge', ğ: 'yumuşakge', h: 'he', ı: 'ı', i: 'i', j: 'je',
  k: 'ka', l: 'le', m: 'me', n: 'ne', o: 'o', ö: 'ö', p: 'pe', r: 're', s: 'se', ş: 'şe', t: 'te', u: 'u', ü: 'ü',
  v: 've', y: 'ye', z: 'ze', q: 'kü', w: 've', x: 'iks',
}
/** Sayının okunuşunun sonu (hâl eki için yeterli). */
function sayiOkunusu(rakamlar: string): string {
  const n = rakamlar.replace(/^0+/, '')
  if (!n) return 'sıfır'
  if (/000$/.test(n)) return 'bin'
  if (/00$/.test(n)) return 'yüz'
  const onlar: Record<string, string> = { '1': 'on', '2': 'yirmi', '3': 'otuz', '4': 'kırk', '5': 'elli', '6': 'altmış', '7': 'yetmiş', '8': 'seksen', '9': 'doksan' }
  if (/0$/.test(n)) return onlar[n.at(-2) ?? '1'] ?? 'on'
  const birler: Record<string, string> = { '1': 'bir', '2': 'iki', '3': 'üç', '4': 'dört', '5': 'beş', '6': 'altı', '7': 'yedi', '8': 'sekiz', '9': 'dokuz' }
  return birler[n.at(-1)!] ?? 'bir'
}

const kucuk = (s: string) => s.toLocaleLowerCase('tr')
const buyukHarfMi = (c: string) => c !== kucuk(c)

type Okunus = { ses: string; ozel: boolean; kisaltma: boolean; buyukYaz: boolean }

function okunus(deger: string): Okunus {
  const t = deger.trim()
  const kelimeler = t.split(/\s+/)
  const son = kelimeler[kelimeler.length - 1]
  const ozel = /^[\p{Lu}\d[⟨(]/u.test(t)
  const harfler = son.replace(/[^\p{L}\d]/gu, '')
  if (/\d$/.test(harfler) || !harfler) return { ses: sayiOkunusu(harfler.replace(/\D/g, '') || '1'), ozel: true, kisaltma: true, buyukYaz: false }
  const kucukSon = kucuk(harfler)
  const unluVar = [...kucukSon].some((c) => UNLULER.includes(c))
  const kisaltma = son.includes('.') || !unluVar
  if (kisaltma) {
    const sonHarf = kucuk(harfler.at(-1)!)
    return { ses: HARF_ADI[sonHarf] ?? sonHarf, ozel: true, kisaltma: true, buyukYaz: false }
  }
  const buyukYaz = [...harfler].every((c) => !/\p{L}/u.test(c) || buyukHarfMi(c)) && harfler.length > 1
  return { ses: kucukSon, ozel, kisaltma: false, buyukYaz }
}

export type Hal = 'yonelme' | 'ilgi' | 'bulunma' | 'ayrilma'

/**
 * Türkçe hâl eki. Özel ad ve kısaltmada kesme işaretiyle ("Ahmet'e", "KGM'nin", "İcra Dairesi'nin"); tamlama
 * sonundaki iyelik ekinden sonra "n" kaynaştırması ("… Otoyolu'nda"); cins isimde k/p/t/ç yumuşaması ("köpeğe").
 */
export function halEki(deger: string, hal: Hal): string {
  const t = deger.trimEnd()
  if (!t) return t
  const o = okunus(t)
  const sesler = [...o.ses]
  const sonUnlu = [...sesler].reverse().find((c) => UNLULER.includes(c)) ?? 'e'
  const kalin = KALIN.includes(sonUnlu)
  const sonSes = sesler[sesler.length - 1] ?? 'e'
  const unluBiter = UNLULER.includes(sonSes)
  const kelimeSayisi = t.split(/\s+/).length
  // Tamlama: çok kelimeli özel ad, son kelime iyelik ekiyle biter ("… Dairesi", "… Müdürlüğü", "… Otoyolu").
  // Kişi adları ("… Ali", "… Kuzu") yakalanmasın diye yalnız tamlama başına özgü sonlar.
  const iyelik = o.ozel && !o.kisaltma && kelimeSayisi >= 2 && unluBiter
    && /(?:s[ıiuü]|ğ[ıiuü]|yolu|kanunu|kurumu|l[ae]r[ıi]|birliği|odası)$/u.test(o.ses)
  const dortlu = (): string => ('aı'.includes(sonUnlu) ? 'ı' : 'ei'.includes(sonUnlu) ? 'i' : 'ou'.includes(sonUnlu) ? 'u' : 'ü')
  let ek: string
  if (hal === 'yonelme') ek = `${iyelik ? 'n' : unluBiter ? 'y' : ''}${kalin ? 'a' : 'e'}`
  else if (hal === 'ilgi') ek = `${unluBiter ? 'n' : ''}${dortlu()}n`
  else {
    const sert = !unluBiter && SERT.includes(sonSes)
    const kok = `${iyelik ? 'n' : ''}${sert ? 't' : 'd'}${kalin ? 'a' : 'e'}`
    ek = hal === 'bulunma' ? kok : `${kok}n`
  }
  if (o.buyukYaz) ek = ek.toLocaleUpperCase('tr')
  if (o.ozel) return `${t}'${ek}`
  // Cins isim: ünlüyle başlayan ekte son sert ünsüz yumuşar (çok heceli sözcükte)
  const heceSayisi = [...kucuk(t.split(/\s+/).pop()!)].filter((c) => UNLULER.includes(c)).length
  if (UNLULER.includes(ek[0]) && heceSayisi >= 2) {
    const govde = t.slice(0, -1)
    const sonHarf = t.slice(-1)
    const yumusak: Record<string, string> = { k: govde.endsWith('n') ? 'g' : 'ğ', p: 'b', t: 'd', ç: 'c' }
    if (yumusak[sonHarf]) return `${govde}${yumusak[sonHarf]}${ek}`
  }
  return `${t}${ek}`
}

/** "1234.56" | 1234.56 | "1.234,56" → "1.234,56" (TL metinde ayrıca yazılır). */
export function paraBicim(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : null
  const s = String(v).trim()
  if (/^-?\d+(?:\.\d{1,2})?$/.test(s)) return paraBicim(Number(s))
  if (/^-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/.test(s)) return s.includes(',') ? s : `${s},00`
  return null
}

/** ISO | "YYYY-MM-DD" | "GG.AA.YYYY" | Date → "GG.AA.YYYY" (İstanbul günü). */
export function tarihBicim(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : tarihTR(v)
  const s = String(v).trim()
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.replace(/\//g, '.')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return tarihTR(`${s}T00:00:00.000Z`)
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const r = tarihTR(s); return r === '—' ? null : r }
  return null
}

function filtreUygula(v: unknown, f: Filtre): string | null {
  if (f === 'para') return paraBicim(v)
  if (f === 'tarih') return tarihBicim(v)
  const deger = v instanceof Date ? tarihBicim(v) ?? '' : String(v)
  switch (f) {
    case 'buyuk': return deger.toLocaleUpperCase('tr')
    case 'buyuk_ilk': return deger ? deger.charAt(0).toLocaleUpperCase('tr') + deger.slice(1) : deger
    default: return halEki(deger, f)
  }
}

// ───────────────────────── işleme (render) ─────────────────────────

export type YerTutucuKaydi = { alan: string; blokId: string; neden: 'EKSIK' | 'BICIM' }
export type AiYuvasi = { id: string; blokId: string; talimat: string }

export type IslenmisBlok = {
  etiket: BlokEtiketi
  metin: string
  yerTutucular: YerTutucuKaydi[]
  aiYuvalari: AiYuvasi[]
  kullanilanAlanlar: string[]
}

const bos = (v: BaglamDegeri) => v == null || v === false || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v))

function degerBul(ad: string, kapsam: readonly BaglamNesnesi[]): BaglamDegeri {
  for (let i = kapsam.length - 1; i >= 0; i--) {
    if (Object.prototype.hasOwnProperty.call(kapsam[i], ad)) return kapsam[i][ad]
  }
  return undefined
}

export function blokIsle(blok: SablonBlogu, baglam: BaglamNesnesi): IslenmisBlok {
  const yerTutucular: YerTutucuKaydi[] = []
  const aiYuvalari: AiYuvasi[] = []
  const kullanilan = new Set<string>()
  let n = 0
  const id = blok.etiket.id

  const isle = (ds: readonly Dugum[], kapsam: BaglamNesnesi[], talimatIci: boolean): string => {
    let out = ''
    for (const d of ds) {
      if (d.t === 'metin') out += d.s
      else if (d.t === 'aciklama') continue
      else if (d.t === 'n') out += String(++n)
      else if (d.t === 'alan') {
        const ham = degerBul(d.ad, kapsam)
        if (bos(ham) || Array.isArray(ham) || typeof ham === 'boolean') {
          out += yerTutucu(d.ad)
          if (!talimatIci) yerTutucular.push({ alan: d.ad, blokId: id, neden: 'EKSIK' })
          continue
        }
        kullanilan.add(d.ad)
        let s: string | null = ham instanceof Date ? tarihBicim(ham) : String(ham)
        let cari: unknown = ham
        for (const f of d.filtreler) {
          s = filtreUygula(cari, f)
          if (s == null) break
          cari = s
        }
        if (s == null) {
          out += yerTutucu(d.ad)
          if (!talimatIci) yerTutucular.push({ alan: d.ad, blokId: id, neden: 'BICIM' })
        } else out += s
      } else if (d.t === 'bolum') {
        const v = degerBul(d.ad, kapsam)
        if (d.ters) { if (bos(v)) out += isle(d.cocuklar, kapsam, talimatIci) }
        else if (Array.isArray(v)) {
          v.forEach((oge, i) => { out += isle(d.cocuklar, [...kapsam, { ...oge, ilk: i === 0, son: i === v.length - 1 }], talimatIci) })
        } else if (!bos(v)) out += isle(d.cocuklar, kapsam, talimatIci)
      } else if (d.t === 'ai') {
        const yuvaId = `${id}#${aiYuvalari.length + 1}`
        aiYuvalari.push({ id: yuvaId, blokId: id, talimat: isle(d.talimat, kapsam, true).replace(/\s+/g, ' ').trim() })
        out += AI_ISARET(yuvaId)
      }
    }
    return out
  }
  const ham = isle(blok.dugumler, [baglam], false)
  return { etiket: blok.etiket, metin: bosluklariDuzenle(ham), yerTutucular, aiYuvalari, kullanilanAlanlar: [...kullanilan].sort() }
}

/** Satır sonu boşlukları, satır içi çift boşluk ve üçten fazla boş satır (otomatik düzelt, anatomi §6.3). */
export function bosluklariDuzenle(s: string): string {
  return s
    .split('\n')
    .map((satir) => {
      const girinti = /^[\t ]*/.exec(satir)![0]
      const govde = satir.slice(girinti.length).replace(/[ \t]{2,}/g, ' ').replace(/\s+([,;.])(?=\s|$)/g, '$1').trimEnd()
      return govde ? girinti + govde : ''
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Satır bir ara başlık mı ("AÇIKLAMALAR", "2. Hasar Tespiti ve Tazminat Ödemesi", "DELİLLER")? */
export function araBaslikMi(satir: string): boolean {
  const t = satir.trim()
  if (!t || t.length > 80 || /[,;.:]$/.test(t) && !/^[A-ZÇĞİÖŞÜ ]+:$/.test(t)) return false
  if (/^\d{1,2}\.\s+\p{Lu}[^.!?;]{1,70}$/u.test(t)) return true
  return /^[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ ]{3,40}$/u.test(t)
}
