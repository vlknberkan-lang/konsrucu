/**
 * KonsRücü — Atıf kalıpları ve atıf kapısı (K1) · lib/konsrucu/mevzuat/atif.ts (saf; client-safe)
 *
 * S33 (06 §7.4-1; B09, B18; bilgi-bankasi/dilekce/atiflar.md §3):
 *   - Metindeki her mevzuat ("m.", "md.", "maddesi", "İİK 67"), genel şart ("B.4/c", "B.4-f") ve içtihat
 *     ("17. HD", "HGK", "UM", "E./K.") atfı bulunur ve kimliğe çevrilir (kanun + madde + fıkra + bent + sürüm |
 *     mahkeme + esas + karar).
 *   - Kimlik, müvekkilin kütüphanesindeki (`MevzuatKaynak`, yalnız `aktif`) kayıtların künyesiyle AYNI ayrıştırıcıdan
 *     geçerek karşılaştırılır. Eşleşme yoksa "DOĞRULANMADI". Künye biçimi farklıysa (ör. "2021/4-859" ↔ "2021/859")
 *     eşleşme sayılmaz: kapı birebirdir, güvenli taraftadır.
 *   - Atfın hemen ardındaki tırnaklı alıntı, kaydın birebir alıntısıyla karşılaştırılır; "(…)" dışında fark varsa
 *     atıf DOĞRULANMADI olur (İ03 dersi).
 *   - Yasak cümleler (atiflar.md §3.7) ayrıca bulunur.
 *
 * Hukuki karar vermez. Yalnız DOGRULANDI eşleşme kırmızı değildir; gerisi imzayı kilitler (S37 avukat onayıyla açar).
 * Dosya içi künyeler (icra, ilk derece mahkemesi, arabuluculuk esas numaraları) bu kapının konusu değildir; olgu
 * kapısında (S37) kontrol edilir ve `dosyaIci` listesinde yalnız bilgi olarak döner.
 */
import type { AtifDurum, MevzuatTuru } from './sabitler'

// ───────────────────────── yardımcılar ─────────────────────────

const W = 'A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû'
const SOL = `(?<![${W}0-9])`
const SAG = `(?![${W}])`
const rx = (src: string, flags = 'gu') => new RegExp(src, flags)

/** Karşılaştırma için: boşluk tekleştirme, tırnak/kesme birliği, yumuşak tire yok. */
export function metinNormal(s: string): string {
  return s
    .replace(/­/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ───────────────────────── kanunlar ─────────────────────────

type KanunTanimi = { kod: string; tur: 'MEVZUAT' | 'GENEL_SART'; ad: string; desen: string }

const KANUNLAR: KanunTanimi[] = [
  { kod: 'IIK', tur: 'MEVZUAT', ad: 'İİK', desen: `${SOL}(?:İİK|IIK|İcra\\s+ve\\s+İflas\\s+Kanunu|İcra\\s+İflas\\s+Kanunu|2004\\s+sayılı)${SAG}` },
  { kod: 'TTK', tur: 'MEVZUAT', ad: 'TTK', desen: `${SOL}(?:TTK|Türk\\s+Ticaret\\s+Kanunu|6102\\s+sayılı)${SAG}` },
  { kod: 'KTK', tur: 'MEVZUAT', ad: 'KTK', desen: `${SOL}(?:KTK|Karayolları\\s+Trafik\\s+Kanunu|2918\\s+sayılı)${SAG}` },
  { kod: 'KTY', tur: 'MEVZUAT', ad: 'KTY', desen: `${SOL}(?:KTY|Karayolları\\s+Trafik\\s+Yönetmeliği)${SAG}` },
  { kod: 'TBK', tur: 'MEVZUAT', ad: 'TBK', desen: `${SOL}(?:TBK|Türk\\s+Borçlar\\s+Kanunu|6098\\s+sayılı)${SAG}` },
  { kod: 'TMK', tur: 'MEVZUAT', ad: 'TMK', desen: `${SOL}(?:TMK|Türk\\s+Medeni\\s+Kanunu|4721\\s+sayılı)${SAG}` },
  { kod: 'HMK', tur: 'MEVZUAT', ad: 'HMK', desen: `${SOL}(?:HMK|Hukuk\\s+Muhakemeleri\\s+Kanunu|6100\\s+sayılı)${SAG}` },
  { kod: 'TKHK', tur: 'MEVZUAT', ad: '6502 s.K.', desen: `${SOL}(?:TKHK|Tüketicinin\\s+Korunması\\s+Hakkında\\s+Kanun|6502\\s+sayılı|6502\\s+s\\.\\s*K\\.)` },
  { kod: 'K6001', tur: 'MEVZUAT', ad: '6001 s.K.', desen: `${SOL}(?:6001\\s+sayılı|6001\\s+s\\.\\s*K\\.)` },
  {
    kod: 'ZMSS_GS', tur: 'GENEL_SART', ad: 'ZMSS GŞ',
    desen: `${SOL}(?:(?:ZMSS|ZMMS)${SAG}|Zorunlu\\s+Mali\\s+(?:Sorumluluk|Mesuliyet)\\s+Sigortası|[Tt]rafik\\s+[Ss]igortası\\s+[Gg]enel\\s+[Şş]artlar[${W}]*)`,
  },
  { kod: 'KASKO_GS', tur: 'GENEL_SART', ad: 'Kasko GŞ', desen: `(?:Kasko\\s+Sigortası\\s+Genel\\s+Şartlar[${W}]*|Kasko\\s+GŞ)` },
]
const AYNI_DESEN = `${SOL}[Aa]ynı\\s+(?:Kanun|kanun|Yönetmelik|yönetmelik|Genel\\s+Şartlar)`

export const KANUN_ADI: Record<string, string> = Object.fromEntries([
  ...KANUNLAR.map((k) => [k.kod, k.ad]),
  ['GS_BELIRSIZ', 'Genel şart (türü belirsiz)'],
  ['BELIRSIZ', 'Kanun belirsiz'],
])

type KanunIzi = { kod: string; bas: number; bit: number }

function kanunlariBul(metin: string): KanunIzi[] {
  const izler: KanunIzi[] = []
  for (const k of KANUNLAR) for (const m of metin.matchAll(rx(k.desen))) izler.push({ kod: k.kod, bas: m.index!, bit: m.index! + m[0].length })
  for (const m of metin.matchAll(rx(AYNI_DESEN))) izler.push({ kod: 'AYNI', bas: m.index!, bit: m.index! + m[0].length })
  return izler.sort((a, b) => a.bas - b.bas || b.bit - a.bit)
}

// ───────────────────────── mahkemeler ─────────────────────────

const MAHKEME_DESENLERI: { desen: string; kod: (m: RegExpMatchArray) => string }[] = [
  { desen: `(?:Yargıtay\\s+)?(?:Hukuk\\s+Genel\\s+Kurulu|${SOL}Y?HGK${SAG})`, kod: () => 'YARGITAY_HGK' },
  { desen: `(?:Yargıtay\\s+)?(?:Ceza\\s+Genel\\s+Kurulu|${SOL}Y?CGK${SAG})`, kod: () => 'YARGITAY_CGK' },
  { desen: `${SOL}(\\d{1,2})\\s*\\.\\s*(?:Hukuk\\s+Dairesi|HD${SAG}|H\\.\\s?D\\.)`, kod: (m) => `${m[1]}HD` },
  { desen: `${SOL}(\\d{1,2})\\s*\\.\\s*(?:Ceza\\s+Dairesi|CD${SAG}|C\\.\\s?D\\.)`, kod: (m) => `${m[1]}CD` },
  { desen: `(?:Uyuşmazlık\\s+Mahkemesi|${SOL}UM${SAG})`, kod: () => 'UM' },
  { desen: `(?:Anayasa\\s+Mahkemesi|${SOL}AYM${SAG})`, kod: () => 'AYM' },
  { desen: `Danıştay(?:\\s+(\\d{1,2})\\s*\\.\\s*(?:Daire(?:si)?|D\\.?))?`, kod: (m) => (m[1] ? `DANISTAY_${m[1]}D` : 'DANISTAY') },
]

type MahkemeIzi = { kod: string; bas: number; bit: number }

function mahkemeleriBul(metin: string): MahkemeIzi[] {
  const izler: MahkemeIzi[] = []
  for (const d of MAHKEME_DESENLERI) {
    for (const m of metin.matchAll(rx(d.desen))) {
      let kod = d.kod(m)
      if (/^\d+(HD|CD)$/.test(kod)) {
        const once = metin.slice(Math.max(0, m.index! - 60), m.index!)
        kod = /Bölge\s+Adliye|BAM/.test(once) ? `BAM_${kod}` : `YARGITAY_${kod}`
      }
      izler.push({ kod, bas: m.index!, bit: m.index! + m[0].length })
    }
  }
  // İç içe (ör. "Yargıtay Hukuk Genel Kurulu" içinde "HGK" yok ama "Uyuşmazlık Mahkemesi" + "UM") → en uzun kalır
  izler.sort((a, b) => a.bas - b.bas || b.bit - a.bit)
  const sonuc: MahkemeIzi[] = []
  for (const iz of izler) if (!sonuc.some((s) => iz.bas < s.bit && iz.bit > s.bas)) sonuc.push(iz)
  return sonuc
}

export const MAHKEME_ADI = (kod: string | null | undefined): string => {
  if (!kod) return 'Mahkeme belirtilmemiş'
  if (kod === 'YARGITAY_HGK') return 'Yargıtay HGK'
  if (kod === 'YARGITAY_CGK') return 'Yargıtay CGK'
  if (kod === 'UM') return 'Uyuşmazlık Mahkemesi'
  if (kod === 'AYM') return 'Anayasa Mahkemesi'
  if (kod === 'DANISTAY') return 'Danıştay'
  let m = /^YARGITAY_(\d+)(HD|CD)$/.exec(kod)
  if (m) return `Yargıtay ${m[1]}. ${m[2]}`
  m = /^BAM_(\d+)(HD|CD)$/.exec(kod)
  if (m) return `BAM ${m[1]}. ${m[2]}`
  m = /^DANISTAY_(\d+)D$/.exec(kod)
  if (m) return `Danıştay ${m[1]}. D.`
  return kod
}

// ───────────────────────── numara belirteçleri (E./K.) ─────────────────────────

type NoIzi = { tip: 'E' | 'K' | 'CIPLAK'; deger: string; bas: number; bit: number }
const NUM = `(\\d{4})\\s*\\/\\s*((?:\\d{1,2}\\s*-\\s*)?\\d{1,6})(?!\\d)`

function numaralariBul(metin: string): NoIzi[] {
  const izler: NoIzi[] = []
  const ekle = (tip: NoIzi['tip'], m: RegExpMatchArray, yilGrup: number) => {
    const deger = `${m[yilGrup]}/${m[yilGrup + 1].replace(/\s+/g, '')}`
    izler.push({ tip, deger, bas: m.index!, bit: m.index! + m[0].length })
  }
  for (const m of metin.matchAll(rx(`${SOL}(?:E\\.|Esas(?:\\s*No)?\\s*:?)\\s*${NUM}`))) ekle('E', m, 1)
  for (const m of metin.matchAll(rx(`${SOL}${NUM}\\s*(?:E\\.|Esas${SAG})`))) ekle('E', m, 1)
  for (const m of metin.matchAll(rx(`${SOL}(?:K\\.|Karar(?:\\s*No)?\\s*:?)\\s*${NUM}`))) ekle('K', m, 1)
  for (const m of metin.matchAll(rx(`${SOL}${NUM}\\s*(?:K\\.|Karar${SAG})`))) ekle('K', m, 1)
  // İşaretsiz: yalnız işaretli bir belirteçle çakışmıyorsa
  for (const m of metin.matchAll(rx(`${SOL}${NUM}`))) {
    const bas = m.index!, bit = bas + m[0].length
    if (!izler.some((i) => bas < i.bit && bit > i.bas)) ekle('CIPLAK', m, 1)
  }
  return izler.sort((a, b) => a.bas - b.bas)
}

// ───────────────────────── madde kalıpları ─────────────────────────

const NO = `(\\d{1,4})(?:\\s*\\/\\s*([A-Z])(?![${W}]))?(?:\\s*\\/\\s*(\\d{1,2})(?!\\d))?(?:\\s*[-\\/]\\s*([a-zçğıöşü])(?![${W}]))?`
/** m., md., mad. + numara */
const A_DESEN = `${SOL}(?:[mM]|[mM]d|[mM]ad)\\.\\s*${NO}`
/** madde + numara */
const B_DESEN = `${SOL}[mM]adde\\s+${NO}`
/** numara + (.) + madde(si…) */
const C_DESEN = `${SOL}${NO}\\s*\\.?\\s*[mM]adde(?:si|sinin|sine|sinde|sini|de|leri|lerinde)?${SAG}`
/** kanun izinin hemen ardından: ek + (m.) + numara */
const D_ARDI = `^(?:['’]?[a-zçğıöşü]{1,5})?\\s*(?:[mM](?:d|ad)?\\.\\s*)?${NO}`
/** genel şart: B.4/c, B.4-f, B.4.3, C.11/2 (+ "(2015 metni)") */
const E_DESEN = `${SOL}([A-D])\\s*\\.\\s*(\\d{1,2})\\s*(?:\\/|-|\\.)\\s*([a-zçğıöşü]|\\d{1,2})(?![${W}0-9])(?:\\s*\\(\\s*(20\\d{2})(?:\\s*metni)?\\s*\\))?`

export type AtifKimligi = {
  tur: MevzuatTuru
  kanun?: string
  madde?: string
  fikra?: string
  bent?: string
  surum?: string
  mahkeme?: string | null
  esas?: string
  karar?: string
}

export type AtifBulgu = {
  bas: number
  bit: number
  metin: string
  kimlik: AtifKimligi
  /** Okunur, tek biçimli künye ("İİK m.67/1", "Yargıtay 17. HD E.2017/1431"). */
  anahtar: string
}

type Aday = AtifBulgu & { oncelik: number }

function noKimligi(m: RegExpMatchArray, i: number): Pick<AtifKimligi, 'madde' | 'fikra' | 'bent'> {
  const madde = m[i + 1] ? `${m[i]}/${m[i + 1]}` : m[i]
  return { madde, fikra: m[i + 2] || undefined, bent: m[i + 3] || undefined }
}

export function anahtarYaz(k: AtifKimligi): string {
  if (k.tur === 'ICTIHAT') return `${MAHKEME_ADI(k.mahkeme)} E.${k.esas}${k.karar ? `, K.${k.karar}` : ''}`
  const ad = KANUN_ADI[k.kanun ?? 'BELIRSIZ'] ?? k.kanun
  if (k.tur === 'GENEL_SART') return `${ad} ${k.madde}/${k.bent ?? ''}${k.surum ? ` (${k.surum} metni)` : ''}`.trim()
  return `${ad} m.${k.madde}${k.fikra ? `/${k.fikra}` : ''}${k.bent ? `${k.fikra ? '-' : '/'}${k.bent}` : ''}`
}

/** Metindeki mevzuat, genel şart ve içtihat atıflarını sırasıyla döndürür (dosya içi künyeler hariç). */
export function atiflariBul(metin: string): AtifBulgu[] {
  const kanunlar = kanunlariBul(metin)
  const adaylar: Aday[] = []

  const oncekiKanun = (bas: number, pencere: number, yalnizGs = false): KanunIzi | null => {
    let secilen: KanunIzi | null = null
    for (const k of kanunlar) {
      if (k.bit > bas) break
      if (bas - k.bit > pencere) continue
      if (yalnizGs && !['ZMSS_GS', 'KASKO_GS'].includes(k.kod)) continue
      secilen = k
    }
    return secilen
  }
  const cozKanun = (iz: KanunIzi | null, bas: number): string => {
    if (!iz) return 'BELIRSIZ'
    if (iz.kod !== 'AYNI') return iz.kod
    // "aynı Kanun" → kendinden önceki gerçek kanun
    for (let i = kanunlar.length - 1; i >= 0; i--) {
      const k = kanunlar[i]
      if (k.bit <= iz.bas && k.kod !== 'AYNI' && bas - k.bit < 600) return k.kod
    }
    return 'BELIRSIZ'
  }
  const kanunTuru = (kod: string): MevzuatTuru => (KANUNLAR.find((k) => k.kod === kod)?.tur ?? 'MEVZUAT')
  const mevzuatEkle = (bas: number, bit: number, kanun: string, no: Pick<AtifKimligi, 'madde' | 'fikra' | 'bent'>, oncelik: number) => {
    const tur = kanunTuru(kanun)
    const kimlik: AtifKimligi = { tur, kanun, ...no }
    adaylar.push({ bas, bit, metin: metin.slice(bas, bit), kimlik, anahtar: anahtarYaz(kimlik), oncelik })
  }

  // E: genel şart bentleri
  for (const m of metin.matchAll(rx(E_DESEN))) {
    const bas = m.index!, bit = bas + m[0].length
    const iz = oncekiKanun(bas, 140, true)
    const kanun = iz ? iz.kod : 'GS_BELIRSIZ'
    const kimlik: AtifKimligi = { tur: 'GENEL_SART', kanun, madde: `${m[1]}.${m[2]}`, bent: m[3], surum: m[4] || undefined }
    // Kapsam yalnız bendin kendisi: aradaki başka atıflar (ör. KTK m.95/2) yutulmasın
    adaylar.push({ bas, bit, metin: metin.slice(bas, bit), kimlik, anahtar: anahtarYaz(kimlik), oncelik: 4 })
  }
  // D: kanun izinin hemen ardından numara
  for (const k of kanunlar) {
    const ardi = metin.slice(k.bit, k.bit + 40)
    const m = rx(D_ARDI, 'u').exec(ardi)
    if (!m) continue
    const sonra = ardi.slice(m[0].length)
    if (/^\s*sayılı/.test(sonra)) continue // "2004 sayılı" gibi kanun numarası, madde değil
    mevzuatEkle(k.bas, k.bit + m[0].length, cozKanun(k, k.bas), noKimligi(m, 1), 3)
  }
  // A, B, C: numara + kanun geriye bakışla
  for (const [desen, oncelik] of [[A_DESEN, 2], [B_DESEN, 2], [C_DESEN, 1]] as const) {
    for (const m of metin.matchAll(rx(desen))) {
      const bas = m.index!, bit = bas + m[0].length
      const iz = oncekiKanun(bas, 80)
      mevzuatEkle(bas, bit, cozKanun(iz, bas), noKimligi(m, 1), oncelik)
    }
  }

  // İçtihat: mahkeme + ardından gelen E./K. numaraları
  const mahkemeler = mahkemeleriBul(metin)
  const numaralar = numaralariBul(metin)
  const kullanilan = new Set<NoIzi>()
  mahkemeler.forEach((mh, i) => {
    const sinir = Math.min(mh.bit + 130, mahkemeler[i + 1]?.bas ?? Infinity)
    const pencere = numaralar.filter((n) => n.bas >= mh.bit && n.bas < sinir)
    const esas = pencere.find((n) => n.tip === 'E') ?? pencere.find((n) => n.tip === 'CIPLAK')
    if (!esas) return
    const karar = pencere.find((n) => n.tip === 'K' && n.bas > esas.bas) ?? pencere.find((n) => n.tip === 'K')
    kullanilan.add(esas)
    if (karar) kullanilan.add(karar)
    const bit = Math.max(esas.bit, karar?.bit ?? 0)
    const kimlik: AtifKimligi = { tur: 'ICTIHAT', mahkeme: mh.kod, esas: esas.deger, karar: karar?.deger }
    adaylar.push({ bas: mh.bas, bit, metin: metin.slice(mh.bas, bit), kimlik, anahtar: anahtarYaz(kimlik), oncelik: 5 })
  })
  // Mahkemesiz E./K.: emsal bağlamındaysa künyesi eksik içtihat; değilse dosya içi künye (kapsam dışı)
  for (const n of numaralar) {
    if (kullanilan.has(n) || n.tip !== 'E') continue
    if (dosyaIciMi(metin, n.bas, n.bit)) continue
    const once = metin.slice(Math.max(0, n.bas - 150), n.bas)
    const sonra = metin.slice(n.bit, n.bit + 80)
    if (!/(emsal|içtihat|Yargıtay|Danıştay|kararında|kararı)/i.test(once + sonra)) continue
    const karar = numaralar.find((x) => x.tip === 'K' && x.bas > n.bit && x.bas - n.bit < 40)
    const kimlik: AtifKimligi = { tur: 'ICTIHAT', mahkeme: null, esas: n.deger, karar: karar?.deger }
    const bit = karar?.bit ?? n.bit
    adaylar.push({ bas: n.bas, bit, metin: metin.slice(n.bas, bit), kimlik, anahtar: anahtarYaz(kimlik), oncelik: 5 })
  }

  // Çakışanlardan önceliği yüksek (eşitse uzun) olan kalır
  adaylar.sort((a, b) => b.oncelik - a.oncelik || (b.bit - b.bas) - (a.bit - a.bas) || a.bas - b.bas)
  const secilen: Aday[] = []
  for (const a of adaylar) if (!secilen.some((s) => a.bas < s.bit && a.bit > s.bas)) secilen.push(a)
  return secilen.sort((a, b) => a.bas - b.bas).map(({ oncelik: _o, ...r }) => r)
}

const DOSYA_ICI_DESEN = /(İcra\s+Dairesi|icra\s+dosya|İcra\s+Müdürlüğü|Asliye|Sulh\s+Hukuk|Tüketici\s+Mahkemesi|Ceza\s+Mahkemesi|Ticaret\s+Mahkemesi|Arabuluculuk|arabulucu|Başsavcılığı|soruşturma|Noterliği|dosyamız|takip\s+dosyası)/i

function dosyaIciMi(metin: string, bas: number, bit: number): boolean {
  const once = metin.slice(Math.max(0, bas - 90), bas)
  const sonra = metin.slice(bit, bit + 60)
  return DOSYA_ICI_DESEN.test(once) || /^\s*(?:E\.?\s*)?(?:sayılı\s+)?(?:icra\s+)?(?:takip\s+)?dosya/i.test(sonra)
}

/** Dosya içi künyeler (icra, ilk derece, arabuluculuk esas numaraları): K1'in değil olgu kapısının konusu. */
export function dosyaIciKunyeler(metin: string): { metin: string; bas: number; bit: number }[] {
  return numaralariBul(metin)
    .filter((n) => n.tip === 'E' && dosyaIciMi(metin, n.bas, n.bit))
    .map((n) => ({ metin: metin.slice(n.bas, n.bit), bas: n.bas, bit: n.bit }))
}

// ───────────────────────── kütüphane eşleştirme ─────────────────────────

export type KutuphaneKaydi = {
  id: string
  kunye: string
  tur: string
  alinti: string
  durum: string
  etiket?: string | null
  aktif: boolean
  resmiUrl?: string | null
  kapsamNotu?: string | null
  rucuSebebiKodlari?: string[]
}

/** Künyeyi atıf kimliğine çevirir (atıf ayrıştırıcısıyla aynı yol). Madde/numara yoksa null. */
export function kunyeKimligi(kunye: string): AtifKimligi | null {
  const b = atiflariBul(kunye)
  return b[0]?.kimlik ?? null
}

type Eslesme = { kayit: KutuphaneKaydi; derece: 'TAM' | 'GENIS' | 'DAR' }

function alanUyumu(atif?: string, kayit?: string): 'ESIT' | 'GENIS' | 'DAR' | null {
  if (atif === kayit) return 'ESIT'
  if (kayit === undefined) return 'GENIS' // kayıt bütün maddeyi/bendi kapsar
  if (atif === undefined) return 'DAR' // atıf bütün maddeyi anıyor, kayıt bir parçası
  return null
}

function eslestir(atif: AtifKimligi, kayit: AtifKimligi): 'TAM' | 'GENIS' | 'DAR' | 'KARAR_FARKLI' | null {
  if (atif.tur === 'ICTIHAT' || kayit.tur === 'ICTIHAT') {
    if (atif.tur !== kayit.tur || !atif.mahkeme || atif.mahkeme !== kayit.mahkeme || atif.esas !== kayit.esas) return null
    if (atif.karar && kayit.karar && atif.karar !== kayit.karar) return 'KARAR_FARKLI'
    return 'TAM'
  }
  if (atif.kanun !== kayit.kanun || atif.madde !== kayit.madde) return null
  const uyumlar = [alanUyumu(atif.fikra, kayit.fikra), alanUyumu(atif.bent, kayit.bent), alanUyumu(atif.surum, kayit.surum)]
  if (uyumlar.includes(null)) return null
  if (uyumlar.every((u) => u === 'ESIT')) return 'TAM'
  if (uyumlar.includes('DAR')) return 'DAR'
  return 'GENIS'
}

export type AtifSonuc = {
  bas: number
  bit: number
  metin: string
  tur: MevzuatTuru
  anahtar: string
  durum: AtifDurum
  eslesenKaynakId: string | null
  eslesenKunye: string | null
  notlar: string[]
  /** İmzayı kilitler mi? Yalnız DOGRULANDI (ve alıntısı birebir) atıf kırmızı değildir. */
  kirmizi: boolean
}

const SIRA: Record<string, number> = { DOGRULANDI: 2, TEYIT_GEREKLI: 1 }
const kayitDurumu = (d: string): AtifDurum => (d === 'DOGRULANDI' || d === 'TEYIT_GEREKLI' || d === 'KULLANMA' ? d : 'DOGRULANMADI')

// ───────────────────────── tırnaklı alıntı ─────────────────────────

type TirnakBolgesi = { bas: number; bit: number; ic: string }

function tirnakBolgeleri(metin: string): TirnakBolgesi[] {
  const b: TirnakBolgesi[] = []
  for (const m of metin.matchAll(/“([^”]{1,3000})”|"([^"\n]{1,3000})"|«([^»]{1,3000})»/g)) {
    b.push({ bas: m.index!, bit: m.index! + m[0].length, ic: m[1] ?? m[2] ?? m[3] ?? '' })
  }
  return b
}

/**
 * Tırnaklı alıntı kaydın birebir alıntısında var mı? "(…)", "…" ve "..." ile kısaltılmış parçaların her biri
 * sırasıyla aranır; yalnız parçanın ilk harfinin büyük/küçük farkı hoş görülür (cümle içine alma).
 */
export function alintiBirebirMi(alinti: string, kaynak: string): boolean {
  const k = metinNormal(kaynak)
  const parcalar = metinNormal(alinti)
    .split(/\(\s*(?:…|\.\.\.)\s*\)|…|\.\.\.|\[\s*(?:…|\.\.\.)\s*\]/)
    .map((p) => p.trim().replace(/^[,;:]\s*/, '').replace(/\s*[,;:]$/, ''))
    .filter((p) => p.length >= 3)
  if (!parcalar.length) return false
  let konum = 0
  for (const p of parcalar) {
    let i = k.indexOf(p, konum)
    if (i < 0) {
      const alt = p.charAt(0) === p.charAt(0).toLocaleUpperCase('tr') ? p.charAt(0).toLocaleLowerCase('tr') + p.slice(1) : p.charAt(0).toLocaleUpperCase('tr') + p.slice(1)
      i = k.indexOf(alt, konum)
    }
    if (i < 0) return false
    konum = i + p.length
  }
  return true
}

// ───────────────────────── yasak cümleler (atiflar.md §3.7) ─────────────────────────

export type YasakBulgu = { kod: string; aciklama: string; bas: number; bit: number; metin: string }

type YasakKurali = { kod: string; aciklama: string; capa: RegExp; es: (pencere: string) => boolean; pencere: number }

const YASAK_KURALLARI: YasakKurali[] = [
  {
    kod: 'ALKOL_TEK_BASINA', pencere: 160,
    aciklama: '"Alkollü olmak tek başına rücu hakkını doğurmaya yeterlidir" kalıbı Yargıtay 11. HD 2025/2402 kararıyla çelişir (M21).',
    capa: /tek\s+başına/giu, es: (p) => /alkol/iu.test(p),
  },
  {
    kod: 'KTK_110_2_MERKEZ', pencere: 160,
    aciklama: 'KTK m.110/2’nin iptal edilmiş "merkez" ibaresi kullanılamaz (AYM 14.03.2024, E.2023/79; B07).',
    capa: /110\s*\/\s*2/gu, es: (p) => /merkez/iu.test(p),
  },
  {
    kod: 'IIK67_DEGER_KAYBI', pencere: 110,
    aciklama: '"İİK 67 uyarınca paranın değer kaybı gözetilerek" kalıbı kanunda yoktur; büronun kendi talebi olarak ayrı cümlede yazılır (M05, B09).',
    capa: /paranın\s+değer\s+kayb/giu, es: (p) => /(?:İİK|IIK|İcra\s+ve\s+İflas)[^\n]{0,40}?67(?!\d)|67\.?\s*madde/iu.test(p),
  },
  {
    kod: 'HGK_859_EKLEME', pencere: 220,
    aciklama: 'HGK 2021/859 kararına "paranın değer kaybı / yargılama süresi" ölçütü eklenemez (İ02, B09).',
    capa: /2021\s*\/\s*(?:4\s*-\s*)?859/gu, es: (p) => /paranın\s+değer\s+kayb|yargılama\s+sür/iu.test(p),
  },
  {
    kod: '17HD_1431_GOREV', pencere: 200,
    aciklama: '17. HD 2017/1431 kararı görev ya da yargı yolu cümlesine dayanak gösterilemez (B09).',
    capa: /2017\s*\/\s*1431/gu, es: (p) => /görev|yargı\s+yolu|adli\s+yargı|idari\s+yargı/iu.test(p),
  },
  {
    kod: 'KUNYESIZ_ICTIHAT', pencere: 160,
    aciklama: 'Künyesiz içtihat atfı yapılamaz ("yüksek mahkeme içtihatları", "yerleşik içtihatlar"); künye ve karar metniyle yazılır ya da büronun kendi değerlendirmesi olarak ("kanaatimizce") ifade edilir (İ04).',
    capa: /(?:yüksek\s+mahkeme(?:nin|lerin)?|yerleşik)\s+içtihat/giu, es: (p) => !/\d{4}\s*\/\s*\d{1,6}/u.test(p),
  },
]

export function yasakCumleleriBul(metin: string): YasakBulgu[] {
  const out: YasakBulgu[] = []
  for (const k of YASAK_KURALLARI) {
    for (const m of metin.matchAll(k.capa)) {
      // Aynı paragraf içinde, çapanın ±pencere kadar çevresi
      const parBas = Math.max(metin.lastIndexOf('\n', m.index!) + 1, m.index! - k.pencere)
      const sonrakiSatir = metin.indexOf('\n', m.index!)
      const parBit = Math.min(sonrakiSatir < 0 ? metin.length : sonrakiSatir, m.index! + m[0].length + k.pencere)
      const pencere = metin.slice(parBas, parBit)
      if (k.es(pencere)) {
        if (!out.some((o) => o.kod === k.kod && o.bas === parBas)) out.push({ kod: k.kod, aciklama: k.aciklama, bas: parBas, bit: parBit, metin: pencere.trim() })
      }
    }
  }
  return out.sort((a, b) => a.bas - b.bas)
}

// ───────────────────────── kapı ─────────────────────────

export type AtifKapisiSonucu = {
  atiflar: AtifSonuc[]
  yasaklar: YasakBulgu[]
  dosyaIci: { metin: string; bas: number; bit: number }[]
  kirmiziSayisi: number
  /** Bütün atıflar DOGRULANDI ve yasak cümle yok. */
  gecti: boolean
}

/**
 * K1 atıf kapısı. `kayitlar` aktif müvekkilin kütüphanesidir (başka müvekkilin kaydı verilmemeli; Ray kaydı
 * Zurich dosyasında geçerli sayılmaz). Pasif (`aktif = false`) kayıtlar yok sayılır.
 */
export function atifKapisi(metin: string, kayitlar: readonly KutuphaneKaydi[]): AtifKapisiSonucu {
  const aktifler = kayitlar
    .filter((k) => k.aktif)
    .map((k) => ({ kayit: k, kimlik: kunyeKimligi(k.kunye) }))
    .filter((x): x is { kayit: KutuphaneKaydi; kimlik: AtifKimligi } => !!x.kimlik)
  const bulgular = atiflariBul(metin)
  const tirnaklar = tirnakBolgeleri(metin)

  const atiflar = bulgular.map((b, i): AtifSonuc => {
    const notlar: string[] = []
    const eslesmeler: Eslesme[] = []
    let kararFarkli = false
    for (const { kayit, kimlik } of aktifler) {
      const e = eslestir(b.kimlik, kimlik)
      if (e === 'KARAR_FARKLI') kararFarkli = true
      else if (e) eslesmeler.push({ kayit, derece: e })
    }
    const temel = { bas: b.bas, bit: b.bit, metin: b.metin, tur: b.kimlik.tur, anahtar: b.anahtar }
    const sonuc = (durum: AtifDurum, kayit: KutuphaneKaydi | null): AtifSonuc => ({
      ...temel, durum, eslesenKaynakId: kayit?.id ?? null, eslesenKunye: kayit?.kunye ?? null, notlar, kirmizi: durum !== 'DOGRULANDI',
    })

    if (b.kimlik.kanun === 'BELIRSIZ') notlar.push('Hangi kanunun maddesi olduğu anlaşılamadı; kanun adıyla birlikte yazın.')
    if (b.kimlik.kanun === 'GS_BELIRSIZ') notlar.push('Hangi genel şartın bendi olduğu anlaşılamadı (ZMSS GŞ, Kasko GŞ …).')
    if (b.kimlik.tur === 'ICTIHAT' && !b.kimlik.mahkeme) notlar.push('Mahkeme ya da daire belirtilmemiş; künye tam yazılmalı.')
    if (kararFarkli) notlar.push('Karar numarası kütüphanedeki kayıtla uyuşmuyor.')

    const tam = eslesmeler.filter((e) => e.derece === 'TAM')
    let durum: AtifDurum = 'DOGRULANMADI'
    let kayit: KutuphaneKaydi | null = null
    if (tam.length) {
      const kullanma = tam.find((e) => e.kayit.durum === 'KULLANMA')
      if (kullanma) {
        notlar.push(kullanma.kayit.kapsamNotu?.trim() || 'Bu atıf kütüphanede "kullanma" olarak işaretli.')
        return sonuc('KULLANMA', kullanma.kayit)
      }
      const en = tam.sort((a, b2) => (SIRA[b2.kayit.durum] ?? 0) - (SIRA[a.kayit.durum] ?? 0))[0]
      durum = kayitDurumu(en.kayit.durum)
      kayit = en.kayit
    } else {
      const digerleri = eslesmeler.filter((e) => e.kayit.durum !== 'KULLANMA')
      if (digerleri.length) {
        // Genel atıf birden çok parçaya denk geliyorsa en zayıf durum geçerli
        const zayif = digerleri.sort((a, b2) => (SIRA[a.kayit.durum] ?? 0) - (SIRA[b2.kayit.durum] ?? 0))[0]
        durum = kayitDurumu(zayif.kayit.durum)
        kayit = zayif.kayit
        if (zayif.derece === 'DAR') notlar.push('Atıf maddenin bütününe; kütüphanede yalnız ilgili fıkra/bent kayıtları var.')
      }
    }
    if (durum === 'TEYIT_GEREKLI') notlar.push('Kütüphanede var, avukat doğrulaması bekliyor.')
    if (durum === 'DOGRULANMADI' && !kararFarkli && !notlar.length) notlar.push('Kütüphanede eşleşen kayıt yok.')

    // Tırnaklı alıntı kontrolü: atıf başka bir alıntının içinde değilse, hemen ardındaki tırnak bu atfındır
    if (kayit && durum !== 'DOGRULANMADI') {
      const icinde = tirnaklar.some((t) => b.bas > t.bas && b.bit < t.bit)
      const sonraki = bulgular[i + 1]?.bas ?? Infinity
      const tirnak = icinde ? null : tirnaklar.find((t) => t.bas >= b.bit && t.bas - b.bit <= 250 && t.bas < sonraki)
      if (tirnak && !alintiBirebirMi(tirnak.ic, kayit.alinti)) {
        notlar.push('Tırnak içindeki metin kütüphanedeki alıntıyla birebir değil; kelime değiştirilmiş olabilir.')
        durum = 'DOGRULANMADI'
      }
    }
    return sonuc(durum, kayit)
  })

  const yasaklar = yasakCumleleriBul(metin)
  const kirmiziSayisi = atiflar.filter((a) => a.kirmizi).length + yasaklar.length
  return { atiflar, yasaklar, dosyaIci: dosyaIciKunyeler(metin), kirmiziSayisi, gecti: kirmiziSayisi === 0 }
}

/**
 * Sabit (kodla basılan) hukuki sebepler bloğuna girebilecek kayıtlar: yalnız aktif ve DOGRULANDI.
 * `rucuSebebiKod` verilirse yalnız o koda bağlı kayıtlar (B18: TTK 1472 her rücu türüne basılmaz).
 */
export function sabitBlokKaynaklari<T extends Pick<KutuphaneKaydi, 'aktif' | 'durum' | 'rucuSebebiKodlari'>>(
  kayitlar: readonly T[],
  rucuSebebiKod?: string | null,
): T[] {
  return kayitlar.filter((k) => k.aktif && k.durum === 'DOGRULANDI' && (!rucuSebebiKod || (k.rucuSebebiKodlari ?? []).includes(rucuSebebiKod)))
}
