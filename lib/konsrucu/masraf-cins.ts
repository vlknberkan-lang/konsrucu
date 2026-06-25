/**
 * KonsRücü — Masraf cinsi eşleştirme (B2) · lib/konsrucu/masraf-cins.ts
 * UYAP/makbuzdan gelen HAM açıklamayı Sayfa2'deki 63 sabit kaleme bağlar:
 *   1) öğrenilen sözlük (kullanıcı seçimi)  2) tam eşleşme  3) alias sözlüğü
 *   4) içerme (substring)                   5) bulanık (token + levenshtein)
 * Eşik altı → cins=null ("Eşleştirilmedi" rozeti + manuel seçim). Manuel seçim sözlüğe öğretilir.
 * Bağımlılık yok (ağır JSON import etmez) → client picker MASRAF_CINSLERI'ni masraf.ts'ten alır.
 */
import { MASRAF_CINSLERI } from './masraf'

/** Eşleşmenin "otomatik kabul" eşiği — altı "Eşleştirilmedi" sayılır. */
export const CINS_ESIK = 0.62

/** Türkçe-duyarlı normalize (adli-rehber trNorm ile aynı mantık; ağır JSON çekmemek için kopya). */
export function normCins(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/[()]/g, ' ') // parantez İÇERİĞİ ayırt edici (Nispi/Maktu, Satış/Taşıt) — silme, sadece parantezi aç
    .toLocaleLowerCase('tr-TR')
    .replace(/[âā]/g, 'a').replace(/[îī]/g, 'i').replace(/[ûū]/g, 'u')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Okunur alias sözlüğü (UYAP isimleri ↔ Sayfa2 kalemi). Anahtarlar yüklenirken normalize edilir.
const ALIAS_HAM: Record<string, string> = {
  // harçlar
  'başvurma harcı': 'Başvuru Harcı',
  'başvuru harcı': 'Başvuru Harcı',
  'icra başvurma harcı': 'İcra Başvuru Harcı',
  'peşin harç': 'Peşin Harç',
  'peşin harc': 'Peşin Harç',
  'tahsil harcı': 'Tahsil Harcı',
  'cezaevi harcı': 'Cezaevi Harcı',
  'cezaevi yapı harcı': 'Cezaevi Harcı',
  'vekalet harcı': 'Vekalet Harcı',
  'vekâlet harcı': 'Vekalet Harcı',
  'vekalet suret harcı': 'Vekalet Harcı',
  'baro pulu': 'Baro Pulu',
  'baro pul': 'Baro Pulu',
  'suret harcı': 'Suret Harcı',
  'tahliye harcı': 'Tahliye Harcı',
  'tamamlama harcı': 'Tamamlama Harcı',
  'yenileme harcı': 'Yenileme Harcı',
  'feragat harcı': 'Feragat Harcı',
  'müdahil harcı': 'Müdahil Harcı',
  'karar düzeltme harcı': 'Karar Düzeltme Harcı',
  'bakiye ilam harcı': 'Bakiye İlam Harcı',
  'ilam harcı': 'Bakiye İlam Harcı',
  'bakiye ilam harcı faizi': 'Bakiye İlam Harcı Faizi',
  'tehiri icra harcı': 'Tehiri İcra Harcı',
  'tehir-i icra harcı': 'Tehiri İcra Harcı',
  'yürütmeyi durdurma harcı': 'Yürütmeyi Durdurma Harcı',
  'yd harcı': 'Yürütmeyi Durdurma Harcı',
  'ihtiyati haciz harcı': 'İhtiyati Haciz Harcı',
  'islah harcı': 'İslah Harcı',
  'keşif harcı': 'Keşif Harcı',
  'temyiz harcı': 'Temyiz Harcı',
  'temyiz yoluna başvurma harcı': 'Temyiz Yoluna Başvurma Harcı',
  'temyiz başvurma harcı': 'Temyiz Yoluna Başvurma Harcı',
  'temyiz karar harcı': 'Temyiz Karar Harcı (Maktu)',
  'istinaf harcı': 'İstinaf Harcı',
  'istinaf kanun yoluna başvurma harcı': 'İstinaf Kanun Yoluna Başvurma Harcı',
  'istinaf başvurma harcı': 'İstinaf Kanun Yoluna Başvurma Harcı',
  'istinaf karar harcı': 'İstinaf Karar Harcı (Maktu)',
  'haciz,teslim ve satış harcı': 'Haciz,Teslim ve Satış Harcı',
  'haciz teslim ve satış harcı': 'Haciz,Teslim ve Satış Harcı',
  'haciz teslim satış harcı': 'Haciz,Teslim ve Satış Harcı',
  'tahkim itiraz ücreti': 'Tahkim İtiraz Ücreti',
  // tebligat / posta
  'tebligat gideri': 'Tebliğ Gideri',
  'tebligat masrafı': 'Tebliğ Gideri',
  'tebliğ gideri': 'Tebliğ Gideri',
  'tebliğ masrafı': 'Tebliğ Gideri',
  'tebligat ücreti': 'Tebliğ Gideri',
  'posta masrafı': 'Posta Gideri',
  'posta gideri': 'Posta Gideri',
  'ptt masrafı': 'Posta Gideri',
  'ptt gideri': 'Posta Gideri',
  'aps tebliğ': 'APS Tebliğ',
  'aps ücreti': 'APS Tebliğ',
  'aps gideri': 'APS Tebliğ',
  'ilanen tebliğ': 'İlanen Tebliğ',
  'ilan gideri': 'İlanen Tebliğ',
  "tk m.35'e göre tebliğ": "TK m.35'e göre Tebliğ",
  '35 e göre tebliğ': "TK m.35'e göre Tebliğ",
  'tebligat kanunu 35': "TK m.35'e göre Tebliğ",
  'temyiz posta gideri': 'Temyiz Posta Gideri',
  // avans / gider / masraf
  'gider avansı': 'Gider Avansı',
  'delil avansı': 'Delil Avansı',
  'dosya masrafı': 'Dosya Masrafı',
  'dosya gideri': 'Dosya Masrafı',
  'dosya araştırma ücreti': 'Dosya Araştırma Ücreti',
  'fotokopi ücreti': 'Fotokopi Ücreti',
  'fotokopi gideri': 'Fotokopi Ücreti',
  'müzekkere gideri': 'Müzekkere Tezkere Gideri',
  'tezkere gideri': 'Müzekkere Tezkere Gideri',
  'müzekkere tezkere gideri': 'Müzekkere Tezkere Gideri',
  'noter masrafı': 'Noter Masrafları',
  'noter masrafları': 'Noter Masrafları',
  'noter ücreti': 'Noter Masrafları',
  'tercüme gideri': 'Tercüme Gideri',
  'çeviri gideri': 'Tercüme Gideri',
  'haciz gideri': 'Haciz Gideri',
  'keşif masrafı': 'Keşif Masrafı',
  'keşif gideri': 'Keşif Masrafı',
  'keşif avansı': 'Keşif Masrafı',
  'satış avansı': 'Masraf Avansı (Satış Avansı)',
  'masraf avansı satış avansı': 'Masraf Avansı (Satış Avansı)',
  'taşıt ücreti': 'Masraf Avansı (Taşıt Ücreti)',
  'taşıt avansı': 'Masraf Avansı (Taşıt Ücreti)',
  'yakalama avansı': 'Yakalama Avansı',
  'yurtdışı rücu masrafı': 'Yurtdışı Rücu Masrafı',
  'yurt dışı rücu masrafı': 'Yurtdışı Rücu Masrafı',
  // bilirkişi
  'bilirkişi ücreti': 'Birinci Bilirkişi Ücreti',
  'birinci bilirkişi ücreti': 'Birinci Bilirkişi Ücreti',
  'ikinci bilirkişi ücreti': 'İkinci Bilirkişi Ücreti',
  'birinci ek bilirkişi ücreti': 'Birinci Ek Bilirkişi Ücreti',
  'ikinci ek bilirkişi ücreti': 'İkinci Ek Bilirkişi Ücreti',
  // yol / konaklama / adli tıp
  'yolluk masrafı': 'Yolluk Masrafı',
  'yolluk': 'Yolluk Masrafı',
  'yol gideri': 'Yolluk Masrafı',
  'yol masrafı': 'Yolluk Masrafı',
  'yol gideri akaryakıt': 'Yol Gideri Akaryakıt',
  'akaryakıt gideri': 'Yol Gideri Akaryakıt',
  'yol gideri bilet': 'Yol Gideri Bilet',
  'otobüs bileti': 'Yol Gideri Bilet',
  'uçak bileti': 'Yol Gideri Bilet',
  'konaklama ücreti': 'Konaklama Ücreti',
  'konaklama gideri': 'Konaklama Ücreti',
  'adli tıp masrafı': 'Adli Tıp Masrafı',
  'teminat': 'Teminat',
  // diğer
  'muhtelif diğer': 'Muhtelif Diğer',
  'muhtelif': 'Muhtelif Diğer',
  'sair masraf': 'Muhtelif Diğer',
  'diğer masraf': 'Muhtelif Diğer',
}

// Normalize edilmiş arama yapıları (yüklemede bir kez kurulur).
const CANON_NORM = new Map<string, string>() // norm → kanonik
for (const c of MASRAF_CINSLERI) CANON_NORM.set(normCins(c), c)
const ALIAS_NORM = new Map<string, string>() // norm(alias) → kanonik
for (const [k, v] of Object.entries(ALIAS_HAM)) ALIAS_NORM.set(normCins(k), v)

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

function benzerlik(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length)
  const ta = new Set(a.split(' ').filter(Boolean))
  const tb = new Set(b.split(' ').filter(Boolean))
  let kesisim = 0
  ta.forEach((t) => { if (tb.has(t)) kesisim++ })
  const jac = kesisim / (ta.size + tb.size - kesisim || 1)
  return Math.max(lev, jac)
}

export type CinsSonuc = { cins: string | null; guven: number }

/** Öğrenilen sözlüğü (Ayarlar.masrafEslestirJson) normalize edilmiş Map'e çevir. */
export function ogrenilenMap(json: unknown): Map<string, string> {
  const m = new Map<string, string>()
  if (json && typeof json === 'object') {
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      if (typeof v === 'string' && MASRAF_CINSLERI.includes(v)) m.set(normCins(k), v)
    }
  }
  return m
}

/**
 * Ham açıklamayı 63 kalemden birine bağla. Eşik altı → { cins: null }.
 * @param ham        UYAP/makbuz ham metni
 * @param ogrenilen  kullanıcının önceden öğrettiği eşlemeler (ogrenilenMap çıktısı)
 */
export function cinsEslesti(ham: string | null | undefined, ogrenilen?: Map<string, string>): CinsSonuc {
  const n = normCins(ham)
  if (!n) return { cins: null, guven: 0 }
  if (ogrenilen?.has(n)) return { cins: ogrenilen.get(n)!, guven: 1 }
  if (CANON_NORM.has(n)) return { cins: CANON_NORM.get(n)!, guven: 0.99 }
  if (ALIAS_NORM.has(n)) return { cins: ALIAS_NORM.get(n)!, guven: 0.95 }

  // içerme: ham, bir kalemin/alias'ın normunu kapsıyorsa (en uzun eşleşme kazanır)
  let icerenCins: string | null = null
  let icerenLen = 0
  const taraTara = (key: string, cins: string) => {
    if (key.length < 5) return // kısa/genel token'larda aşırı eşleşmeyi önle
    const eslesir = n.includes(key) || (n.length >= 5 && key.includes(n))
    if (eslesir && key.length > icerenLen) {
      icerenLen = key.length
      icerenCins = cins
    }
  }
  CANON_NORM.forEach((cins, key) => taraTara(key, cins))
  ALIAS_NORM.forEach((cins, key) => taraTara(key, cins))
  // içerme güveni 0.8 → UI'daki dusukGuven (<0.85) eşiğinin ALTINDA: sarı nokta ile "kontrol et" işaretlenir
  if (icerenCins) return { cins: icerenCins, guven: 0.8 }

  // bulanık: kanonik + alias anahtarları içinde en yakın
  let enIyi: string | null = null
  let enIyiSkor = 0
  const dene = (key: string, cins: string) => {
    const s = benzerlik(n, key)
    if (s > enIyiSkor) { enIyiSkor = s; enIyi = cins }
  }
  CANON_NORM.forEach((cins, key) => dene(key, cins))
  ALIAS_NORM.forEach((cins, key) => dene(key, cins))
  if (enIyi && enIyiSkor >= CINS_ESIK) return { cins: enIyi, guven: Number(enIyiSkor.toFixed(2)) }
  return { cins: null, guven: Number(enIyiSkor.toFixed(2)) }
}

/** Manuel seçimi öğrenilen sözlüğe ekle (normalize anahtar). Persist eden taraf Ayarlar'a yazar. */
export function ogret(mevcut: unknown, ham: string, cins: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (mevcut && typeof mevcut === 'object') {
    for (const [k, v] of Object.entries(mevcut as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
  }
  const key = normCins(ham)
  if (key && MASRAF_CINSLERI.includes(cins)) out[key] = cins
  return out
}
