/**
 * KonsRücü — UYAP e-Takip XML üretici · lib/konsrucu/uyap-etakip/xml.ts (saf, bağımlılıksız)
 * Bir rücu dosyasından exchange.dtd (sürüm 1.2) uyumlu `exchangeData` XML'i üretir.
 * Rücu = İlamsız (Örnek 7) genel para alacağı. Borçlu adresi MERNİS'e bırakılır (yalnız TC verilir).
 * Çıktıyı UYAP Avukat Portal → İcra Takibi → "Takip Açılış-XML" içe aktarır; e-imza+harç kullanıcıda.
 */
import { TAKIP_PRESET, ROL, ALACAK_KALEM, ADRES_TURU, faizTipKodFromTuru, FAIZ_TIP_ADI } from './kodlar'

export type XmlAlacakli = { unvan: string; vergiNo?: string | null; mersis?: string | null; iban?: string | null; adres?: string | null }
export type XmlVekil = { ad?: string | null; soyad?: string | null; tcKimlikNo?: string | null; baroNo?: string | null; tbbNo?: string | null; adres?: string | null }
export type XmlBorcluAdres = { il?: string | null; ilce?: string | null; acik?: string | null }
export type XmlBorclu = { adUnvan: string; tcVkn?: string | null; kurumMu?: boolean; adres?: XmlBorcluAdres | null }
export type XmlFaiz = { baslangic?: string | null; bitis?: string | null; oran?: string | number | null; tutar?: string | number | null; faizTuru?: string | null }

export type TakipXmlGirdi = {
  alacakli: XmlAlacakli
  vekil?: XmlVekil | null
  borclular: XmlBorclu[]
  asilAlacak: string | number // = rucuTutari (kusur payı)
  faiz?: XmlFaiz | null
  aciklama?: string | null
  mahiyetKodu?: string
  talepEdilenHak?: string | null // dosya@alacaklininTalepEttigiHak (UYAP zorunlu) — varsayılan "Alacak"
  dosyaBelirleyici?: string | null // = hukukDosyaNo — geri eşleştirme için
}

// "Takip XML hazırla" önizleme/düzenleme veri şekli (server action ↔ client panel arası; saf modülde
// tutulur çünkü actions.ts 'use server' yalnız async fonksiyon export edebilir).
export type TakipXmlBorclu = { adUnvan: string; tcVkn: string | null; kurumMu: boolean; adres?: string | null }
export type TakipXmlOnizleme = {
  ok: boolean
  error?: string
  alacakliUnvan?: string
  alacakliMersis?: string | null
  alacakliVergiNo?: string | null
  alacakliIban?: string | null
  vekilAd?: string | null
  borclular?: TakipXmlBorclu[]
  yetkiliIcra?: string | null
  asilAlacak?: string
  faizBaslangic?: string
  faizTuru?: string
  faizTutar?: string
  aciklama?: string
  faizOranlar?: { baslangic: string; oran: number }[]
  bugun?: string
  uyarilar?: string[]
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** YYYY-MM-DD → GG/AA/YYYY (UYAP tarih biçimi). */
const trDate = (iso?: string | null) => {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** Tutarı XML biçimine getir (nokta ondalık, 2 hane). TR ve makine biçimini tolere eder. */
const tut = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : (() => {
    const c = String(v ?? '').replace(/[^\d.,-]/g, '')
    const norm = c.includes(',') && c.lastIndexOf(',') > c.lastIndexOf('.') ? c.replace(/\./g, '').replace(',', '.') : c.replace(/,/g, '')
    return Number(norm)
  })()
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

/** Tam adı ad + soyad'a böl (son kelime soyad). Kurumlar için kullanılmaz. */
function adSoyad(tam: string): { adi: string; soyadi: string } {
  const p = String(tam ?? '').trim().split(/\s+/).filter(Boolean)
  if (p.length <= 1) return { adi: p[0] ?? '', soyadi: '' }
  return { adi: p.slice(0, -1).join(' '), soyadi: p[p.length - 1] }
}

const attrs = (pairs: Array<[string, string | null | undefined]>) =>
  pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}="${esc(v)}"`).join(' ')

/** `<adres>` elemanı — açık adres / il verilmişse üret, yoksa boş (borçluda boş = MERNİS). */
function adresEl(adresTuru: string, a?: { il?: string | null; ilce?: string | null; acik?: string | null } | null): string {
  if (!a || (!a.acik && !a.il)) return ''
  return `<adres ${attrs([['adresTuru', adresTuru], ['il', a.il], ['ilce', a.ilce], ['adres', a.acik]])}/>`
}

function tarafAlacakli(a: XmlAlacakli): string {
  const kurum = attrs([
    ['kurumAdi', a.unvan], ['vergiNo', a.vergiNo], ['mersisNo', a.mersis], ['kamuOzel', 'O'], ['harcDurumu', '1'],
  ])
  return [
    `  <taraf>`,
    `    <kisiKurumBilgileri ad="${esc(a.unvan)}"><kurum ${kurum}/>${adresEl(ADRES_TURU.ISYERI, { acik: a.adres })}</kisiKurumBilgileri>`,
    `    <rolTur rolID="${ROL.ALACAKLI.rolID}" Rol="${esc(ROL.ALACAKLI.Rol)}"/>`,
    a.iban ? `    <iban no="${esc(a.iban)}"/>` : '',
    `  </taraf>`,
  ].filter(Boolean).join('\n')
}

function tarafBorclu(b: XmlBorclu): string {
  let inner: string
  if (b.kurumMu) {
    inner = `<kurum ${attrs([['kurumAdi', b.adUnvan], ['vergiNo', b.tcVkn], ['kamuOzel', 'O'], ['harcDurumu', '1']])}/>`
  } else {
    const { adi, soyadi } = adSoyad(b.adUnvan)
    inner = `<kisiTumBilgileri ${attrs([['adi', adi], ['soyadi', soyadi], ['tcKimlikNo', b.tcVkn]])}/>`
  }
  // Adres MERNİS'e bırakılır; yalnız elimizde açık adres varsa eklenir (İkametgah/yerleşim yeri türü).
  const adres = adresEl(ADRES_TURU.IKAMETGAH, b.adres)
  return [
    `  <taraf>`,
    `    <kisiKurumBilgileri ad="${esc(b.adUnvan)}">${inner}${adres}</kisiKurumBilgileri>`,
    `    <rolTur rolID="${ROL.BORCLU.rolID}" Rol="${esc(ROL.BORCLU.Rol)}"/>`,
    `  </taraf>`,
  ].join('\n')
}

function vekilBlok(v: XmlVekil): string {
  const vekilAttr = attrs([
    ['baroNo', v.baroNo], ['tbbNo', v.tbbNo], ['tcKimlikNo', v.tcKimlikNo], ['adi', v.ad], ['soyadi', v.soyad],
    ['vekilTipi', 'S'], ['borcluVekiliMi', 'H'],
  ])
  const kisi = attrs([['adi', v.ad], ['soyadi', v.soyad], ['tcKimlikNo', v.tcKimlikNo]])
  const adres = adresEl(ADRES_TURU.ISYERI, { acik: v.adres })
  return [
    `  <VekilKisi>`,
    `    <vekil ${vekilAttr}/>`,
    `    <kisiTumBilgileri ${kisi}/>`,
    adres ? `    ${adres}` : '',
    `  </VekilKisi>`,
  ].filter(Boolean).join('\n')
}

function alacakBlok(asil: string | number, faiz?: XmlFaiz | null): string {
  const asilTut = tut(asil)
  const k = ALACAK_KALEM.DIGER_ASIL
  let faizEl = ''
  if (faiz && (faiz.oran != null || faiz.tutar != null || faiz.baslangic)) {
    const tk = faizTipKodFromTuru(faiz.faizTuru)
    const fa = attrs([
      ['baslangicTarihi', trDate(faiz.baslangic)], ['bitisTarihi', trDate(faiz.bitis)],
      ['faizOran', faiz.oran != null ? String(faiz.oran) : ''],
      ['faizTipKod', tk], ['faizTipKodAciklama', FAIZ_TIP_ADI[tk] ?? ''],
      ['faizTutar', faiz.tutar != null && faiz.tutar !== '' ? tut(faiz.tutar) : ''],
    ])
    faizEl = `\n        <faiz ${fa}/>`
  }
  return [
    `  <digerAlacak digerAlacakAciklama="Rücu alacağı" tutar="${asilTut}">`,
    `    <alacakKalemi ${attrs([['alacakKalemKod', k.kod], ['alacakKalemAdi', k.adi], ['alacakKalemTutar', asilTut], ['alacakKalemTip', k.tip], ['alacakKalemKodTuru', k.turu]])}>${faizEl}`,
    `    </alacakKalemi>`,
    `  </digerAlacak>`,
  ].join('\n')
}

/** Tek dosyanın `<dosya>` bloğu (toplu XML için birden çok dosya alt alta dizilir). */
export function dosyaBlok(g: TakipXmlGirdi): string {
  const P = TAKIP_PRESET
  const dosyaAttrs = attrs([
    ['dosyaTipi', P.dosyaTipi], ['dosyaTuru', P.dosyaTuru], ['takipTuru', P.takipTuru],
    ['takipYolu', P.takipYolu], ['takipSekli', P.takipSekli], ['mahiyetKodu', g.mahiyetKodu ?? P.mahiyetKodu],
    ['alacaklininTalepEttigiHak', (g.talepEdilenHak ?? '').trim() || 'Alacak'], // UYAP: "Alacaklının talep ettiği hak" zorunlu
    ['BK84MaddeUygulansin', P.BK84MaddeUygulansin], ['BSMVUygulansin', P.BSMVUygulansin], ['KKDFUygulansin', P.KKDFUygulansin],
    ['dosyaBelirleyicisi', g.dosyaBelirleyici], ['aciklama48e9', g.aciklama],
  ])
  const ic: string[] = [tarafAlacakli(g.alacakli)]
  if (g.vekil && (g.vekil.ad || g.vekil.soyad)) ic.push(vekilBlok(g.vekil))
  for (const b of g.borclular) ic.push(tarafBorclu(b))
  ic.push(alacakBlok(g.asilAlacak, g.faiz))
  return `<dosya ${dosyaAttrs}>\n${ic.join('\n')}\n</dosya>`
}

/** Tek bir rücu dosyası için tam `exchangeData` XML belgesi. */
export function takipXmlUret(g: TakipXmlGirdi): string {
  return takipXmlUretToplu([g])
}

/** Birden çok dosya için tek `exchangeData` belgesi (aynı icra dairesine giden grup). */
export function takipXmlUretToplu(liste: TakipXmlGirdi[]): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<exchangeData>`,
    `<exchangeHeader versiyon="1.2"/>`,
    `<dosyalar>`,
    liste.map(dosyaBlok).join('\n'),
    `</dosyalar>`,
    `</exchangeData>`,
    ``,
  ].join('\n')
}
