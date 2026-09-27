/**
 * KonsRücü — arabuluculuk son tutanağı · lib/konsrucu/arabuluculuk/son-tutanak.ts (saf, client-safe)
 *
 * 1) Tarih doğrulaması (B02): son tutanak tarihi "bugün" VARSAYILMAZ, ileri tarih ve başvurudan önceki tarih
 *    reddedilir. Eski akışta "Sonuçlandır"a basılan an yazılıyordu; artık tarih yalnız avukattan gelir.
 * 2) Metinden öneri: sürüklenen tutanağın metninden (tarayıcıda çıkarılır, sunucuya/AI'a gitmez) tarih, sonuç ve
 *    numaralar ALINTIYLA önerilir. Kural katmanıdır; avukat onaylamadan hiçbir alana yazılmaz.
 * 3) AR-09: tutanaktaki karşı taraf itiraz eden borçlu değilse uyarı.
 */
import { ARABULUCULUK_SONUCLARI, type ArabuluculukSonucu } from './sabitler'
import { gunNo, haftaSonuMu, ileriTarihMi, isoGunCoz, trTarihCoz } from './tarih'

export type Dogrulama = { ok: true; tarih: Date } | { ok: false; hata: string }

/**
 * Son tutanak tarihini doğrula. `ham` formdan gelen "yyyy-aa-gg"dir; boşsa HATA (varsayılan yok).
 * basvuruTarihi biliniyorsa tutanak ondan önce olamaz.
 */
export function sonTutanakTarihiDogrula(ham: string | null | undefined, opts: { basvuruTarihi?: Date | null; simdi?: Date } = {}): Dogrulama {
  if (!ham || !String(ham).trim()) return { ok: false, hata: 'Son tutanak tarihini girin (tarih kendiliğinden "bugün" alınmaz).' }
  const tarih = isoGunCoz(ham)
  if (!tarih) return { ok: false, hata: 'Son tutanak tarihi geçersiz.' }
  if (ileriTarihMi(tarih, opts.simdi ?? new Date())) return { ok: false, hata: 'Son tutanak tarihi ileri bir gün olamaz.' }
  if (opts.basvuruTarihi && gunNo(tarih) < gunNo(opts.basvuruTarihi)) {
    return { ok: false, hata: 'Son tutanak tarihi başvuru tarihinden önce olamaz.' }
  }
  return { ok: true, tarih }
}

/** Başvuru tarihi uyarıları (engel değil): hafta sonu ya da ileri tarih. */
export function basvuruTarihiUyarilari(tarih: Date | null, simdi: Date = new Date()): string[] {
  if (!tarih) return []
  const u: string[] = []
  if (ileriTarihMi(tarih, simdi)) u.push('Başvuru tarihi ileri bir gün görünüyor: tarihi kontrol edin.')
  if (haftaSonuMu(tarih)) u.push('Başvuru tarihi hafta sonuna denk geliyor: tarihi kontrol edin (resmî tatil listesi denetlenmez).')
  return u
}

// ─────────────────── metinden öneri ───────────────────

export type Alinti = { metin: string; konum: number }
export type SonTutanakOnerisi = {
  tarih: { deger: string; alinti: Alinti } | null // "yyyy-aa-gg"
  sonuc: { deger: ArabuluculukSonucu; alinti: Alinti } | null
  arabuluculukNo: { deger: string; alinti: Alinti } | null
  basvuruNo: { deger: string; alinti: Alinti } | null
  sonTutanakGibi: boolean // metin bir son tutanağa benziyor mu
  uyarilar: string[]
}

const ALINTI_SINIRI = 300

/** Türkçe duyarsız karşılaştırma için normalize (İ/ı → i, büyük/küçük, fazla boşluk). */
export function trNormal(s: string): string {
  return s
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
}

function alintiKes(metin: string, bas: number, son: number): Alinti {
  const pay = Math.max(0, Math.floor((ALINTI_SINIRI - (son - bas)) / 2))
  const a = Math.max(0, bas - pay)
  const b = Math.min(metin.length, son + pay)
  return { metin: metin.slice(a, b).replace(/\s+/g, ' ').trim().slice(0, ALINTI_SINIRI), konum: bas }
}

/**
 * Sonuç kalıpları. Olumsuzlar ÖNCE denenir ("anlaşma sağlanamadı" içinde "anlaşma sağlan" geçer).
 * Kalıplar normalize metin üzerinde (ascii, küçük harf) çalışır.
 */
const SONUC_KALIPLARI: { sonuc: ArabuluculukSonucu; re: RegExp }[] = [
  { sonuc: 'KISMEN', re: /kismen anlas|kismi anlas|bir kisminda anlas/ },
  { sonuc: 'ANLASAMAMA', re: /anlasma(ya)? (saglanamad|varilamad)|anlasamad|anlasamama|uzlasma saglanamad|anlasmaya varamad/ },
  { sonuc: 'KATILMAMA', re: /katilmad|katilmamas|toplantiya gelmed|hazir bulunmad/ },
  { sonuc: 'ULASILAMAMA', re: /ulasilamad|ulasilamamas|iletisim kurulamad/ },
  { sonuc: 'ANLASMA', re: /anlasmaya varild|anlasma saglandi|anlasmislardir|tam anlasma|anlasma ile sonuclan/ },
]

/** Tutanak tarihine işaret eden bağlam sözcükleri (tarih bunların yakınındaysa öncelikli). */
const TARIH_BAGLAM = /(tutanak tarihi|duzenleme tarihi|duzenlenme tarihi|tarih\s*:|tarihinde|son tutanak)/

/**
 * Tutanak metninden öneri çıkar. Hiçbir şeyi kesinleştirmez; her öneri alıntı taşır.
 * Tarih seçimi: bağlam sözcüğüne en yakın tarih; yoksa metindeki EN GEÇ tarih (tutanak, sürecin son belgesidir).
 * İleri tarih önerilmez.
 */
export function sonTutanakOnerisi(metin: string, simdi: Date = new Date()): SonTutanakOnerisi {
  const bos: SonTutanakOnerisi = { tarih: null, sonuc: null, arabuluculukNo: null, basvuruNo: null, sonTutanakGibi: false, uyarilar: [] }
  if (!metin || !metin.trim()) return { ...bos, uyarilar: ['Belgede okunabilir metin yok (taranmış olabilir): alanları elle girin.'] }
  const norm = trNormal(metin)
  // Normalizasyon uzunluğu değiştirmez (tek karakter → tek karakter; yalnız boşluk sıkışması) → konumlar için ayrıca
  // boşluğu sıkıştırılmış özgün metin kullanılır.
  const duz = metin.replace(/\s+/g, ' ')
  const sonTutanakGibi = /son tutanak|arabuluculuk son|arabulucu(luk)? tutanag/.test(norm)
  const uyarilar: string[] = []
  if (!sonTutanakGibi) uyarilar.push('Metin bir arabuluculuk son tutanağına benzemiyor: belgeyi kontrol edin.')

  // tarih
  const tarihler: { d: Date; bas: number; son: number; baglam: boolean }[] = []
  const re = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(duz))) {
    const d = trTarihCoz(`${m[1]}.${m[2]}.${m[3]}`)
    if (!d || ileriTarihMi(d, simdi)) continue
    const onu = trNormal(duz.slice(Math.max(0, m.index - 60), m.index))
    tarihler.push({ d, bas: m.index, son: m.index + m[0].length, baglam: TARIH_BAGLAM.test(onu) })
  }
  let tarih: SonTutanakOnerisi['tarih'] = null
  if (tarihler.length) {
    const baglamli = tarihler.filter((t) => t.baglam)
    const havuz = baglamli.length ? baglamli : tarihler
    const sec = havuz.reduce((a, b) => (b.d.getTime() > a.d.getTime() ? b : a))
    const iso = `${sec.d.getUTCFullYear()}-${String(sec.d.getUTCMonth() + 1).padStart(2, '0')}-${String(sec.d.getUTCDate()).padStart(2, '0')}`
    tarih = { deger: iso, alinti: alintiKes(duz, sec.bas, sec.son) }
    if (!baglamli.length && tarihler.length > 1) uyarilar.push('Tutanak tarihi açıkça etiketlenmemiş: metindeki en geç tarih önerildi, kontrol edin.')
  } else {
    uyarilar.push('Metinde geçerli bir tarih bulunamadı: tarihi elle girin.')
  }

  // sonuç
  let sonuc: SonTutanakOnerisi['sonuc'] = null
  const normDuz = trNormal(duz)
  for (const k of SONUC_KALIPLARI) {
    const r = k.re.exec(normDuz)
    if (r) {
      sonuc = { deger: k.sonuc, alinti: alintiKes(duz, r.index, r.index + r[0].length) }
      break
    }
  }
  if (!sonuc) uyarilar.push('Sonuç ifadesi bulunamadı: sonucu elle seçin.')

  // numaralar
  const no = (etiket: RegExp): { deger: string; alinti: Alinti } | null => {
    const r = etiket.exec(normDuz)
    if (!r) return null
    const sonra = duz.slice(r.index + r[0].length, r.index + r[0].length + 40)
    const n = sonra.match(/[:\s]*([0-9]{4}\s*\/\s*[0-9]+|[0-9]{3,})/)
    if (!n) return null
    return { deger: n[1].replace(/\s+/g, ''), alinti: alintiKes(duz, r.index, r.index + r[0].length + (n.index ?? 0) + n[0].length) }
  }
  return {
    tarih,
    sonuc,
    arabuluculukNo: no(/arabuluculuk (dosya|buro) (no|numarasi)|arabuluculuk no/),
    basvuruNo: no(/basvuru (no|numarasi)/),
    sonTutanakGibi,
    uyarilar,
  }
}

/** Sonuç değeri geçerli mi (CHECK listesi)? */
export function sonucGecerliMi(s: unknown): s is ArabuluculukSonucu {
  return typeof s === 'string' && (ARABULUCULUK_SONUCLARI as readonly string[]).includes(s)
}

// ─────────────────── AR-09 ───────────────────

/** Ad benzerliği için anlamsız ekler (tüzel kişi kalıpları) çıkarılır. */
const TUZEL_EK = /\b(a\.?s\.?|ltd\.?|sti\.?|limited|sirketi|anonim|genel mudurlugu|mudurlugu|baskanligi|bakanligi)\b/g

function adAnahtarlari(ad: string): string[] {
  return trNormal(ad)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(TUZEL_EK, ' ')
    .split(' ')
    .filter((p) => p.length >= 3)
}

/**
 * AR-09: tutanak metninde itiraz eden borçluların adı geçiyor mu? Her borçlu için ad parçalarının en az
 * yarısı metinde bulunmalı. Hiçbiri bulunamazsa uyarı döner. Kişisel veri metinden dışarı yazılmaz; yalnız
 * sayı ve borçlu sırası döner.
 */
export function karsiTarafUyumu(metin: string, itirazEdenAdlari: string[]): { uyumlu: boolean; bulunan: number; toplam: number; uyari: string | null } {
  const toplam = itirazEdenAdlari.length
  if (!metin || toplam === 0) return { uyumlu: true, bulunan: 0, toplam, uyari: null }
  const norm = trNormal(metin).replace(/[^a-z0-9 ]/g, ' ')
  let bulunan = 0
  for (const ad of itirazEdenAdlari) {
    const p = adAnahtarlari(ad)
    if (!p.length) continue
    const eslesen = p.filter((x) => norm.includes(x)).length
    if (eslesen / p.length >= 0.5) bulunan++
  }
  if (bulunan === 0) {
    return { uyumlu: false, bulunan, toplam, uyari: 'Son tutanak ile itiraz eden borçlu farklı görünüyor: kontrol edin (AR-09).' }
  }
  if (bulunan < toplam) {
    return { uyumlu: false, bulunan, toplam, uyari: `İtiraz eden ${toplam} borçludan ${bulunan} tanesi tutanakta bulundu: eksik taraf var mı kontrol edin (AR-09).` }
  }
  return { uyumlu: true, bulunan, toplam, uyari: null }
}
