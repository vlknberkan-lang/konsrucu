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
  /** Şemada kolonu olmayan kişi/serbest alanlar → kaynakJson'a gider. */
  kaynak: {
    kaynak: 'hugo'
    incelemeyeGonderen: string | null
    inceleyen: string | null
    avYardGonderen: string | null
    aciklama: string | null
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
  if (ham instanceof Date) return Number.isNaN(ham.getTime()) ? null : ham
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

/** İlk çalışma sayfasındaki ilk ~20 satırı tarar, en çok Hugo başlığı eşleşen satırı seçer. */
function baslikBul(matris: string[][]): { idx: number; harita: Record<number, AlanKey>; say: number } {
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

  // Tüm hücreleri GÖRÜNEN metin (display) olarak al — TR ayraçlar ve gg/aa/yyyy korunur.
  const matris = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
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

  const satirlar: HugoDosya[] = []
  const hatalar: SatirHatasi[] = []
  const gorulen = new Set<string>()

  for (let i = baslikIdx + 1; i < matris.length; i++) {
    const row = matris[i] ?? []
    const excelSatir = i + 1 // kullanıcıya 1-bazlı göster
    const al = (k: AlanKey): string => {
      const c = alanKol.get(k)
      return c == null ? '' : String(row[c] ?? '').trim()
    }

    // Eşlenen kolonların tamamı boşsa → boş satır, sessizce atla (hata değil)
    if (kolonlar.every((c) => !String(row[c] ?? '').trim())) continue

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
    for (const [k, c] of alanKol) {
      const v = String(row[c] ?? '').trim()
      if (v) ham[k] = v
    }

    satirlar.push({
      hukukDosyaNo,
      gonderenBirim: metin(al('gonderenBirim')),
      hasarDosyaNo: metin(al('hasarDosyaNo')),
      hasarTarihi: tarihTR(al('hasarTarihi')),
      zamanasimi: tarihTR(al('zamanasimi')),
      rucuSebebi: metin(al('rucuSebebi')),
      rucuOrani: metin(al('rucuOrani')),
      rucuTutari: paraTR(al('rucuTutari')),
      davaMiktari: paraTR(al('davaMiktari')),
      kadroluAvukat: metin(al('kadroluAvukat')),
      sozlesmeliAvukat: metin(al('sozlesmeliAvukat')),
      islemYapanYrd: metin(al('islemYapanYrd')),
      atanmaTarihi: tarihTR(al('atanmaTarihi')),
      bitisTarihi: tarihTR(al('bitisTarihi')),
      hugoDurum: metin(al('hugoDurum')),
      kaynak: {
        kaynak: 'hugo',
        incelemeyeGonderen: metin(al('incelemeyeGonderen')),
        inceleyen: metin(al('inceleyen')),
        avYardGonderen: metin(al('avYardGonderen')),
        aciklama: metin(al('aciklama')),
        ham,
      },
    })
  }

  return { satirlar, hatalar, baslikSatiri: baslikIdx + 1, eslesenKolon: say }
}
