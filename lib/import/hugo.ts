/**
 * KonsRücü — Hugo tevdiye Excel'i içe aktarma · SAF parse + TR normalize katmanı
 * lib/import/hugo.ts
 *
 * Burada DB / React YOK. Girdi bir dosya tamponu (Buffer/ArrayBuffer), çıktı
 * normalize edilmiş satırlar + satır bazlı hata listesi. Server action bu çıktıyı
 * `RucuDosyasi`'na yazar (bkz. app/(app)/akilli-giris/iceri-aktar/actions.ts).
 *
 * Kurallar (CLAUDE.md):
 *  - Para `1.234.567,89` → number; çok-değerli hücre ("A + B") TOPLANIR; aşırı/bozuk → null.
 *  - Tarih `gg/aa/yyyy` → Date; geçersiz tarih (ör. 36/03/2025) → null (satırı ATMA, patlatma).
 *  - Oran `% 100` text korunur.
 *  - Başlık satırı esnek bulunur; kolonlar sıraya değil, başlık ADINA göre eşlenir.
 */
import * as XLSX from 'xlsx'

/** `RucuDosyasi`'na doğrudan yazılacak, Hugo kolonlarından eşlenmiş tek satır. */
export type HugoDosya = {
  hukukDosyaNo: string // UPSERT anahtarı — zorunlu
  gonderenBirim: string | null
  hasarDosyaNo: string | null
  hasarTarihi: Date | null
  zamanasimi: Date | null
  rucuSebebi: string | null
  rucuOrani: string | null // "% 100" → metin korunur
  rucuTutari: number | null
  davaMiktari: number | null
  kadroluAvukat: string | null
  sozlesmeliAvukat: string | null
  islemYapanYrd: string | null
  atanmaTarihi: Date | null // Başlangıç Tarihi
  bitisTarihi: Date | null
  hugoDurum: string | null // Durumu
  // Zurich (Hukuki Takip) listesinde hazır gelen, şemada doğrudan karşılığı olan alanlar.
  // (Hugo listesinde yoktur → bu satırlarda null kalır.)
  brans: string | null // "KASKO" / "YANGIN" — yazımda Brans enum'a eşlenir
  sigortaliUnvan: string | null // "Sigortalı Adı"
  kazaYeri: string | null // "Hasar Yeri" = yetkili icra yeri (HMK m.16)
  il: string | null
  faizBaslangic: Date | null // "Tazminat Ödeme Tarihi" (ödeme = faiz başlangıcı)
  /** Şemada kolonu olmayan kişi/serbest alanlar → kaynakJson'a gider. */
  kaynak: {
    kaynak: 'hugo' | 'zurich'
    incelemeyeGonderen: string | null
    inceleyen: string | null
    avYardGonderen: string | null
    aciklama: string | null
    policeNo: string | null // Zurich "Poliçe No"
    hasarTutari: string | null // ham: brüt hasar (asıl alacak DEĞİL — bakiye kovalanır)
    tahsilEdilen: string | null // ham: önceden tahsilat (bakiye = hasar×oran − tahsilat)
    tazminatOdeme: string | null // ham
    ham: Record<string, string> // ham hücre değerleri (denetim izi)
  }
}

export type SatirHatasi = { satir: number; sebep: string }

export type HugoParseSonuc = {
  satirlar: HugoDosya[]
  hatalar: SatirHatasi[]
  baslikSatiri: number | null // 1-bazlı Excel satır no
  eslesenKolon: number
}

/** Server action'ın UI'a döndürdüğü özet (saf tip — 'use server' kısıtından uzak tutulur). */
export type ImportSonuc = {
  toplam: number
  eklenen: number
  atlanan: number // tenant'ta zaten var (mevcut) → ezilmedi
  hatali: number
  baslikSatiri: number | null
  eslesenKolon: number
  hatalar: SatirHatasi[]
}

type AlanKey =
  | 'gonderenBirim'
  | 'hukukDosyaNo'
  | 'hasarDosyaNo'
  | 'hasarTarihi'
  | 'zamanasimi'
  | 'rucuSebebi'
  | 'rucuOrani'
  | 'rucuTutari'
  | 'davaMiktari'
  | 'kadroluAvukat'
  | 'sozlesmeliAvukat'
  | 'islemYapanYrd'
  | 'atanmaTarihi'
  | 'bitisTarihi'
  | 'hugoDurum'
  | 'incelemeyeGonderen'
  | 'inceleyen'
  | 'avYardGonderen'
  | 'aciklama'
  // Zurich (Hukuki Takip) listesine özgü kolonlar
  | 'brans'
  | 'sigortaliUnvan'
  | 'kazaYeri'
  | 'policeNo'
  | 'tazminatOdeme'
  | 'hasarTutari'
  | 'tahsilEdilen'

/** Başlık adı (kanonik) → alan. Sıra değişebilir; eşleme ada göredir. */
const BASLIK_ESLEME: Record<string, AlanKey> = {
  gonderenbirim: 'gonderenBirim',
  hukukdosyano: 'hukukDosyaNo',
  hasardosyano: 'hasarDosyaNo',
  hasartarihi: 'hasarTarihi',
  zamanasimi: 'zamanasimi',
  rucusebebi: 'rucuSebebi',
  rucuorani: 'rucuOrani',
  rucututari: 'rucuTutari',
  davamiktari: 'davaMiktari',
  kadroluavukat: 'kadroluAvukat',
  sozlesmeliavukat: 'sozlesmeliAvukat',
  incelemeyegonderen: 'incelemeyeGonderen',
  inceleyen: 'inceleyen',
  avyardgonderen: 'avYardGonderen',
  islemyapanavyard: 'islemYapanYrd',
  aciklama: 'aciklama',
  baslangictarihi: 'atanmaTarihi',
  bitistarihi: 'bitisTarihi',
  durumu: 'hugoDurum',

  // ── Zurich "Hukuki Takip" listesi eş anlamlıları ──
  // Aynı kavramlar farklı başlıklarla gelir; mevcut alanlara eşlenir (bir sayfa ya Hugo ya Zurich).
  hasarbrans: 'brans', // "Hasar Branş" (KASKO / YANGIN)
  zamanasimitarihi: 'zamanasimi', // "Zaman Aşımı Tarihi"
  bakiyerucututari: 'rucuTutari', // "Bakiye Rücu Tutarı" — takipte kovalanan kalan tutar
  tahsiledilenrucututari: 'tahsilEdilen', // ham audit (bakiye = hasar×oran − bu)
  hasartutari: 'hasarTutari', // ham audit (brüt hasar)
  rucunedeni: 'rucuSebebi', // "Rücu Nedeni"
  rucunedenidetay: 'aciklama', // "Rücu Nedeni Detay"
  sigortaliadi: 'sigortaliUnvan', // "Sigortalı Adı"
  policeno: 'policeNo', // "Poliçe No"
  hasaryeri: 'kazaYeri', // "Hasar Yeri" = yetkili icra yeri
  tazminatodemetarihi: 'tazminatOdeme', // "Tazminat Ödeme Tarihi" → faiz başlangıcı
  atananburo: 'kadroluAvukat', // "Atanan Büro" → sorumlu avukat etiketi
}

const TR_HARF = /[çğıİöşüÇĞÖŞÜI]/g
const TR_ASCII: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u', I: 'i',
}

/** Başlık karşılaştırması için kanonik biçim: Türkçe→ascii, küçük harf, yalnız harf+rakam. */
export function kanonik(s: unknown): string {
  return String(s ?? '')
    .replace(TR_HARF, (c) => TR_ASCII[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function metin(ham: unknown): string | null {
  if (ham == null) return null
  const s = String(ham).trim()
  return s ? s : null
}

/** Rücu oranı metnini kanonikleştir: çıplak sayı ("100", "75") → "% 100". "% 100" zaten korunur. */
function oranMetin(ham: unknown): string | null {
  const s = metin(ham)
  if (!s) return null
  if (/^%?\s*\d+([.,]\d+)?\s*%?$/.test(s)) return `% ${s.replace(/[%\s]/g, '')}`
  return s
}

/** Hücre (typed) → görüntülenebilir denetim metni: sayı → düz metin, metin → trim. */
function hucreMetin(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/** tarihTR'nin (UTC gece-yarısı) sonucunu denetim için yyyy-aa-gg'ye çevirir. */
function isoTarih(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Tarih olan alanlar — ham denetim dökümünde seri no yerine yyyy-aa-gg yazmak için. */
const TARIH_ALANLARI = new Set<AlanKey>(['hasarTarihi', 'zamanasimi', 'atanmaTarihi', 'bitisTarihi', 'tazminatOdeme'])

/** Aşırı/bozuk değeri ele; Decimal(14,2) sınırı içinde, 2 ondalığa yuvarla. */
function sinirla(n: number): number | null {
  if (!Number.isFinite(n) || Math.abs(n) >= 1e12) return null
  return Math.round(n * 100) / 100
}

/** Tek bir TR para tokeni → number | null. */
function tekPara(s: string): number | null {
  let t = s.replace(/\s/g, '')
  if (!t) return null
  const virgul = t.includes(',')
  const nokta = t.includes('.')
  if (virgul) {
    // TR biçim: virgül ondalık, nokta binlik
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (nokta) {
    // Yalnız nokta: binlik grubu (1.234.567) mu, ondalık (1234.56) mı?
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
    // aksi halde nokta = ondalık; olduğu gibi bırak
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return sinirla(Number(t))
}

/**
 * TR para hücresi → number | null.
 *  - "1.234.567,89" → 1234567.89
 *  - "1.250,00 + 2.000,00" → 3250  (çok-değerli hücre TOPLANIR)
 *  - bozuk/aşırı → null
 */
export function paraTR(ham: unknown): number | null {
  if (ham == null) return null
  if (typeof ham === 'number') return Number.isFinite(ham) ? sinirla(ham) : null
  let s = String(ham).trim()
  if (!s) return null
  s = s.replace(/₺|tl|try|tutar/gi, ' ').trim()
  if (!s) return null

  if (s.includes('+')) {
    const parcalar = s.split('+').map((p) => p.trim()).filter(Boolean)
    if (parcalar.length > 1) {
      let toplam = 0
      for (const p of parcalar) {
        const v = tekPara(p)
        if (v == null) return null // bir parça bozuksa hücre güvenilmez
        toplam += v
      }
      return sinirla(toplam)
    }
  }
  return tekPara(s)
}

/**
 * TR tarih hücresi → Date | null. Geçersiz (36/03/2025, 31/02/2025) → null (asla throw etmez).
 * gg/aa/yyyy · gg.aa.yyyy · gg-aa-yyyy; 2 haneli yıl → 2000+.
 * Savunmacı: yalnız rakamdan oluşan Excel seri numarasını da çözer.
 */
export function tarihTR(ham: unknown): Date | null {
  if (ham == null) return null
  // Gerçek hücre tarihi (cellDates) → yerel takvim G/A/Y'sini UTC gece-yarısına sabitle (TZ kayması yok).
  if (ham instanceof Date) {
    if (Number.isNaN(ham.getTime())) return null
    return new Date(Date.UTC(ham.getFullYear(), ham.getMonth(), ham.getDate()))
  }
  const s = String(ham).trim()
  if (!s) return null

  const m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/)
  if (m) {
    let gun = Number(m[1])
    const ay = Number(m[2])
    let yil = Number(m[3])
    if (yil < 100) yil += 2000
    if (ay < 1 || ay > 12 || gun < 1 || gun > 31) return null
    const d = new Date(Date.UTC(yil, ay - 1, gun))
    // Taşma kontrolü: 36/03 veya 31/02 → JS tarihi kaydırır, yakala
    if (d.getUTCFullYear() !== yil || d.getUTCMonth() !== ay - 1 || d.getUTCDate() !== gun) return null
    return d
  }

  // Excel seri numarası (1899-12-30 epoch) — yalnız date kolonlarında çağrıldığı için güvenli fallback
  if (/^\d{4,6}$/.test(s)) {
    const seri = Number(s)
    if (seri > 0 && seri < 100000) {
      const d = new Date(Math.round((seri - 25569) * 86400 * 1000))
      return Number.isNaN(d.getTime()) ? null : d
    }
  }
  return null
}

/** İlk çalışma sayfasındaki ilk ~20 satırı tarar, en çok başlığı eşleşen satırı seçer. */
function baslikBul(matris: unknown[][]): { idx: number; harita: Record<number, AlanKey>; say: number } {
  let idx = -1
  let enIyi = 0
  let enIyiHarita: Record<number, AlanKey> = {}
  const tara = Math.min(matris.length, 20)
  for (let i = 0; i < tara; i++) {
    const row = matris[i] ?? []
    const harita: Record<number, AlanKey> = {}
    const kullanilan = new Set<AlanKey>()
    for (let c = 0; c < row.length; c++) {
      const key = BASLIK_ESLEME[kanonik(row[c])]
      if (key && !kullanilan.has(key)) {
        harita[c] = key
        kullanilan.add(key)
      }
    }
    if (kullanilan.size > enIyi) {
      enIyi = kullanilan.size
      idx = i
      enIyiHarita = harita
    }
  }
  return { idx, harita: enIyiHarita, say: enIyi }
}

/** Hugo Excel tamponunu (.xls/.xlsx) çözümle → normalize satırlar + hatalar. */
export function hugoCozumle(buf: Buffer | ArrayBuffer | Uint8Array): HugoParseSonuc {
  const bos: HugoParseSonuc = { satirlar: [], hatalar: [], baslikSatiri: null, eslesenKolon: 0 }

  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer)
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(u8, { type: 'array', cellDates: false })
  } catch (e) {
    return { ...bos, hatalar: [{ satir: 0, sebep: `Excel okunamadı: ${(e as Error).message}` }] }
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { ...bos, hatalar: [{ satir: 0, sebep: 'Çalışma sayfası bulunamadı' }] }

  // HAM (typed) oku: sayı→number, tarih→Excel seri no (number), metin→string. cellDates KAPALI.
  // Neden display değil: Zurich dosyasında tarih/para hücreleri GERÇEK sayı/tarih ve görünen
  // biçimleri ABD yerelinde ("7/18/24" = ay/gün, "77,508.00") çıkıyor — display'i TR olarak
  // parse etmek ay/günü ters çevirir ve binlik/ondalığı 1000× bozar.
  // Neden cellDates KAPALI: SheetJS'in Date üretimi epoch hatasıyla 1 gün geri kayıyor
  // (45491 → 2024-07-17T20:59Z). Ham seri no (45491) timezone'dan bağımsızdır; tarihTR onu
  // saf UTC formülüyle 2024-07-18'e çevirir. Hugo'nun TR-metin hücreleri de string olarak
  // aynı parser'lara düşer (geriye uyumlu).
  const matris = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  })

  const { idx: baslikIdx, harita, say } = baslikBul(matris)
  if (baslikIdx < 0 || say < 3) {
    return { ...bos, eslesenKolon: say, hatalar: [{ satir: 0, sebep: 'Başlık satırı bulunamadı (Hugo kolon adları eşleşmedi)' }] }
  }

  // alan → kolon indeksi (al() için ters harita)
  const alanKol = new Map<AlanKey, number>()
  for (const [c, key] of Object.entries(harita)) alanKol.set(key, Number(c))
  const kolonlar = [...alanKol.values()]

  // Zurich'e özgü kolonlar görüldüyse kaynağı 'zurich' damgala (denetim izi + downstream ipucu).
  const zurichFormat =
    alanKol.has('brans') || alanKol.has('sigortaliUnvan') || alanKol.has('policeNo') || alanKol.has('tahsilEdilen')

  const satirlar: HugoDosya[] = []
  const hatalar: SatirHatasi[] = []
  const gorulen = new Set<string>()

  for (let i = baslikIdx + 1; i < matris.length; i++) {
    const row = matris[i] ?? []
    const excelSatir = i + 1 // kullanıcıya 1-bazlı göster
    // hucre: HAM typed değer (sayı/Date/metin). al: denetim/metin için güvenli string (Date→yyyy-aa-gg).
    const hucre = (k: AlanKey): unknown => {
      const c = alanKol.get(k)
      return c == null ? null : row[c]
    }
    const al = (k: AlanKey): string => hucreMetin(hucre(k))

    // Eşlenen kolonların tamamı boşsa → boş satır, sessizce atla (hata değil)
    if (kolonlar.every((c) => !hucreMetin(row[c]))) continue

    const hukukDosyaNo = al('hukukDosyaNo')
    if (!hukukDosyaNo) {
      hatalar.push({ satir: excelSatir, sebep: 'Hukuk Dosya No boş — eşleştirme yapılamaz' })
      continue
    }
    if (gorulen.has(hukukDosyaNo)) {
      hatalar.push({ satir: excelSatir, sebep: `Dosyada mükerrer Hukuk No: ${hukukDosyaNo}` })
      continue
    }
    gorulen.add(hukukDosyaNo)

    const ham: Record<string, string> = {}
    for (const k of alanKol.keys()) {
      // Tarih alanları seri no olarak gelir → denetim için yyyy-aa-gg yaz; diğerleri düz metin.
      let v: string
      if (TARIH_ALANLARI.has(k)) {
        const d = tarihTR(hucre(k))
        v = d ? isoTarih(d) : ''
      } else {
        v = al(k)
      }
      if (v) ham[k] = v
    }

    const hasarYeri = metin(al('kazaYeri')) // Zurich "Hasar Yeri" — il düzeyinde gelir
    const tazminatOdeme = tarihTR(hucre('tazminatOdeme')) // = faiz başlangıcı (ödeme tarihi)
    satirlar.push({
      hukukDosyaNo,
      gonderenBirim: metin(al('gonderenBirim')),
      hasarDosyaNo: metin(al('hasarDosyaNo')),
      hasarTarihi: tarihTR(hucre('hasarTarihi')),
      zamanasimi: tarihTR(hucre('zamanasimi')),
      rucuSebebi: metin(al('rucuSebebi')),
      rucuOrani: oranMetin(al('rucuOrani')),
      rucuTutari: paraTR(hucre('rucuTutari')),
      davaMiktari: paraTR(hucre('davaMiktari')),
      kadroluAvukat: metin(al('kadroluAvukat')),
      sozlesmeliAvukat: metin(al('sozlesmeliAvukat')),
      islemYapanYrd: metin(al('islemYapanYrd')),
      atanmaTarihi: tarihTR(hucre('atanmaTarihi')),
      bitisTarihi: tarihTR(hucre('bitisTarihi')),
      hugoDurum: metin(al('hugoDurum')),
      brans: metin(al('brans')),
      sigortaliUnvan: metin(al('sigortaliUnvan')),
      kazaYeri: hasarYeri,
      il: hasarYeri, // Zurich listesinde kaza yeri = il; ilçe sonradan AI/UYAP ile incelir
      faizBaslangic: tazminatOdeme,
      kaynak: {
        kaynak: zurichFormat ? 'zurich' : 'hugo',
        incelemeyeGonderen: metin(al('incelemeyeGonderen')),
        inceleyen: metin(al('inceleyen')),
        avYardGonderen: metin(al('avYardGonderen')),
        aciklama: metin(al('aciklama')),
        policeNo: metin(al('policeNo')),
        hasarTutari: metin(al('hasarTutari')),
        tahsilEdilen: metin(al('tahsilEdilen')),
        tazminatOdeme: tazminatOdeme ? isoTarih(tazminatOdeme) : null,
        ham,
      },
    })
  }

  return { satirlar, hatalar, baslikSatiri: baslikIdx + 1, eslesenKolon: say }
}
