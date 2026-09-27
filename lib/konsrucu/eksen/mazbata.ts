/**
 * KonsRücü — Tebliğ mazbatası okuma · lib/konsrucu/eksen/mazbata.ts (saf, client-safe; yapay zekâsız)
 *
 * Plan S23 (`lib/uyap/mazbata.ts` karşılığı): mazbata metninden (metin katmanı ya da OCR) tebliğin SONUCU,
 * ŞEKLİ, TARİHİ ve MUHATABI deterministik kalıplarla önerilir. Sonuç bir ÖNERİDİR; avukat kartta onaylar.
 *
 * Kurallar (06 §2(e) "Arka planda"; docs/04 K3):
 *   • İADE ile tebliğ ayrımı evrak ADINDAN değil mazbata METNİNDEN yapılır: "bila", "tebliğ edilemedi",
 *     "adreste bulunamadı" (muhtara teslim yoksa) → İADE. Tek başına "iade" kelimesi kalıp DEĞİLDİR
 *     (harç iadesine de takılır).
 *   • "muhtara teslim", "21/2" → TK 21/2 (21/1 açıkça yazıyorsa TK 21/1). TK 21 tebliği GEÇERLİ tebliğdir.
 *   • UETS'te "ulaştığı tarih" → ulaşma tarihi; hukuki tebliğ ulaşmayı izleyen 5. günün sonudur
 *     (Tebligat K. 7/a — teyit gerekli). Metinde açık tebliğ/okundu tarihi yazıyorsa o önerilir.
 *   • Muhatap, metindeki adın borçlu listesiyle SUNUCUDA eşleştirilmesiyle bulunur; eşleşmezse "borçlu belirsiz".
 *     Alacaklı vekiline giden e-tebliğ "itirazın alacaklıya tebliği" adayıdır.
 *   • Tarih UYDURULMAZ: okunamazsa boş kalır ve kart "tarihi girin" der.
 */
import { gunEkle, trNorm, trTarihParse } from './norm'
import { tebligSekliOner } from './aday-siniflandir'
import { ekranMaskele } from './maske'
import { KURAL, type Muhatap, type TebligSekli, type TebligSonuc } from './sabitler'

/** UETS: ulaşmayı izleyen 5. gün tebliğ sayılır (Tebligat K. 7/a — teyit gerekli). */
export const UETS_TEBLIG_GUN = 5

export type MazbataBorclu = { id: string; adUnvan: string }

export type MazbataOkuma = {
  sonuc: TebligSonuc
  sekil: TebligSekli
  /** Önerilen hukuki tebliğ tarihi (İADE'de mazbatanın düzenlenme/iade tarihi; tebliğ tarihi değildir). */
  tarih: Date | null
  uetsUlasma: Date | null
  muhatap: Muhatap
  borcluId: string | null
  /** Ekranda gösterilecek kısa alıntı (kişisel veri maskeli). */
  alinti: string | null
  kural: string
  uyarilar: string[]
}

const TARIH = String.raw`(\d{1,2}[./-]\d{1,2}[./-]\d{4})`

const RE = {
  bila: /bila\s*-?\s*teblig/,
  edilemedi: /teblig\s+(edilemed|yapilamad|imkansiz)|teblig\w*\s+mumkun\s+olmad/,
  adresteYok: /adreste\s+(bulunamad|taninmad)|adresi?\s+(taninmiyor|yanlis|eksik|gecersiz)|adresten\s+(tasinmis|ayrilmis)|tasinmis\s+olup/,
  muhtaraTeslim: /muhtar\w*\s+teslim(?!\s+edilemed)/, // "muhtara", "muhtarına"
  yapistir: /(kapiya|kapisina|haber\s+kagidi)\s+(\S+\s+){0,3}yapistir/,
  // UETS'te "ulaştığı tarih" ve "okunduğu tarih" satırı elektronik tebliğin gerçekleştiğini gösterir.
  pozitif: /teblig\s+(edildi|edilmistir|olundu)|tebellug|bizzat|kendisine\s+teslim|imzasi\s+alin|okundu\s+sayil|okundu\w*\s+tarih|ulast\w*\s+(\S+\s+){0,2}tarih|muhtar\w*\s+teslim(?!\s+edilemed)/,
  uets: /\buets\b|elektronik\s+teblig|e-?\s?teblig|ulastig|okundu\s+sayil/,
  alacakliVekili: /alacakli\s+vekil|alacakli\s+avukat/,
  muhatabaTeslim: /bizzat|muhatabin\s+kendisine|kendisine\s+teslim|imzasi\s+alin/,
  ulasma: new RegExp(String.raw`ulast\w*\s+(\S+\s+){0,2}tarih\w*\s*:?\s*` + TARIH),
  okundu: new RegExp(String.raw`(okundu\w*\s+(\S+\s+){0,2}tarih\w*|teblig\s+tarihi|tebellug\s+tarihi)\s*:?\s*` + TARIH),
  tarihliFiil: new RegExp(TARIH + String.raw`\s+tarihinde\s+(\S+\s+){0,8}(teslim|teblig|yapistir|tebellug)`),
  herhangiTarih: new RegExp(TARIH),
}

function tokenlar(ad: string): string[] {
  return trNorm(ad).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((x) => x.length >= 3).slice(0, 3)
}

/** Metindeki adı borçlu listesiyle eşleştirir: tek eşleşme → kimlik; birden çok ya da hiç → null. */
export function borcluEslestir(metin: string, borclular: MazbataBorclu[]): { borcluId: string | null; adet: number } {
  const t = ` ${trNorm(metin).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `
  const eslesen = borclular.filter((b) => {
    const tk = tokenlar(b.adUnvan)
    return tk.length > 0 && tk.every((x) => t.includes(` ${x} `))
  })
  return { borcluId: eslesen.length === 1 ? eslesen[0].id : null, adet: eslesen.length }
}

function alintiKes(ham: string, desen: RegExp): string | null {
  // Boşlukları sadeleştirilmiş ham metin ile normalize hâli karakter karakter hizalıdır (trNorm harf sayısını
  // korur: "İ" → "i", "ç" → "c"); konum normalize metinde bulunur, alıntı ham metinden kesilir.
  const tek = ham.replace(/\s+/g, ' ').trim()
  const m = desen.exec(trNorm(tek))
  if (!m) return null
  const bas = Math.max(0, m.index - 60)
  const son = Math.min(tek.length, m.index + m[0].length + 60)
  const parca = tek.slice(bas, son).trim()
  return parca ? `…${ekranMaskele(parca)}…` : null
}

/**
 * Mazbata metni → tebliğ önerisi. Metin boşsa null. `ocrGuven` (0–1) düşükse uyarı eklenir.
 */
export function mazbataOku(metin: string | null | undefined, borclular: MazbataBorclu[] = [], ocrGuven?: number | null): MazbataOkuma | null {
  const ham = String(metin ?? '')
  const t = trNorm(ham)
  if (!t || t.length < 10) return null
  const uyarilar: string[] = []
  if (ocrGuven != null && ocrGuven < 0.6) uyarilar.push(`Metin OCR ile okundu ve güven düşük (%${Math.round(ocrGuven * 100)}); tarihi belgeden kontrol edin.`)

  // Sonuç: açık pozitif ifade (TK 21 dahil) İADE ifadesinden üstündür ("adreste bulunamadığından muhtara teslim").
  const pozitif = RE.pozitif.test(t) || RE.yapistir.test(t)
  const iade = !pozitif && (RE.bila.test(t) || RE.edilemedi.test(t) || RE.adresteYok.test(t))
  const sonuc: TebligSonuc = iade ? 'IADE' : pozitif ? 'TEBLIG' : 'BELIRSIZ'

  // Şekil
  let sekil: TebligSekli = tebligSekliOner(t)
  if (sekil === 'BELIRSIZ' && RE.muhatabaTeslim.test(t)) sekil = 'MUHATABA'
  if (sekil === 'TK21_2' && RE.muhtaraTeslim.test(t) && !/21\s*[/.]\s*2/.test(t)) {
    uyarilar.push('Muhtara teslim yazıyor; TK 21/1 mi 21/2 mi olduğunu mazbatadan teyit edin.')
  }

  // Tarihler
  const ulasmaM = RE.ulasma.exec(t)
  const uetsUlasma = ulasmaM ? trTarihParse(ulasmaM[ulasmaM.length - 1]) : null
  const okunduM = RE.okundu.exec(t)
  const acikTarih = okunduM ? trTarihParse(okunduM[okunduM.length - 1]) : null
  const fiilM = RE.tarihliFiil.exec(t)
  const fiilTarih = fiilM ? trTarihParse(fiilM[1]) : null
  let tarih: Date | null = null
  let kural: string = KURAL.MZ_BELIRSIZ
  if (sonuc === 'IADE') {
    kural = KURAL.MZ_IADE
    tarih = fiilTarih ?? acikTarih ?? null
  } else if (sekil === 'UETS') {
    kural = KURAL.MZ_UETS
    if (acikTarih) tarih = acikTarih
    else if (uetsUlasma) {
      tarih = gunEkle(uetsUlasma, UETS_TEBLIG_GUN)
      uyarilar.push(`Tebliğ tarihi ulaşma + ${UETS_TEBLIG_GUN} gün olarak önerildi (Tebligat K. 7/a, teyit gerekli).`)
    }
  } else if (sekil === 'TK21_1' || sekil === 'TK21_2') {
    kural = KURAL.MZ_TK21
    tarih = acikTarih ?? fiilTarih
  } else if (sekil === 'TK35') {
    kural = KURAL.MZ_TK35
    tarih = acikTarih ?? fiilTarih
  } else if (sekil === 'MUHATABA') {
    kural = KURAL.MZ_MUHATABA
    tarih = acikTarih ?? fiilTarih
  } else {
    tarih = acikTarih ?? fiilTarih
  }
  if (!tarih && sonuc !== 'IADE') uyarilar.push('Tebliğ tarihi metinden okunamadı: mazbatayı açıp tarihi girin.')
  // Birden çok tarih var ama hiçbiri bir fiile bağlanamadıysa tahmin yapılmaz
  if (!tarih && RE.herhangiTarih.test(t) && sonuc !== 'IADE') uyarilar.push('Metinde tarih var ama tebliğe bağlanamadı; tahmin yapılmadı.')

  // Muhatap
  let muhatap: Muhatap = 'BELIRSIZ'
  let borcluId: string | null = null
  if (RE.alacakliVekili.test(t)) {
    muhatap = 'ALACAKLI_VEKILI'
  } else {
    const e = borcluEslestir(ham, borclular)
    if (e.borcluId) { muhatap = 'BORCLU'; borcluId = e.borcluId }
    else if (e.adet > 1) uyarilar.push('Metin birden çok borçluyla eşleşiyor: borçluyu seçin.')
    else if (borclular.length) uyarilar.push('Borçlu belirsiz: mazbatadaki ad borçlu listesiyle eşleşmedi.')
  }

  // Alıntı: kararı doğuran ifadenin çevresi (ilk eşleşen desen)
  const desenler = sonuc === 'IADE' ? [RE.bila, RE.edilemedi, RE.adresteYok]
    : sekil === 'UETS' ? [RE.ulasma, RE.okundu, RE.uets]
      : [RE.tarihliFiil, RE.muhtaraTeslim, RE.yapistir, RE.pozitif]
  const desen = desenler.find((d) => d.test(t)) ?? null
  return { sonuc, sekil, tarih, uetsUlasma, muhatap, borcluId, alinti: desen ? alintiKes(ham, desen) : null, kural, uyarilar }
}

/** Belge mazbata gibi mi görünüyor (alt tür, UYAP türü ya da dosya adı)? */
export function mazbataBelgesiMi(b: { altTur?: string | null; uyapEvrakTuru?: string | null; dosyaAdi?: string | null }): boolean {
  if (b.altTur === 'ICRA_TEBLIG_MAZBATASI') return true
  const t = trNorm(`${b.uyapEvrakTuru ?? ''} ${b.dosyaAdi ?? ''}`)
  return /mazbata|teblig\s*(evraki|belgesi|sonuc)|e-?\s?teblig|bila/.test(t) && !/talep|dilekce/.test(t)
}
