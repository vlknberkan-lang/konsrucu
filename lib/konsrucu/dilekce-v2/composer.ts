/**
 * KonsRücü — Dilekçe birleştirici (aşama 2) · lib/konsrucu/dilekce-v2/composer.ts (saf; client-safe)
 *
 * S36 (06 §7.3 Aşama 2 "Dilekçe"): "Kodun bastığı bloklar: başlık, davacı, vekil, davalılar, konu ve dava
 * değeri, hukuki sebepler, deliller ve EKLER, sonuç ve istem, tarih ve imza. Yapay zekânın yazdığı: yalnız
 * numaralı AÇIKLAMALAR paragrafları … kart dışı olgu kullanılamaz; her olgu cümlesi [O-n] referansı taşır."
 *
 * Bu dosya AI'yı ÇAĞIRMAZ (bkz. paragraf.ts): yalnız (a) kilitli kartı + iskelet bloklarını koddan
 * deterministik olarak basar, (b) paragraf.ts'ten gelen ham AI paragraflarını karta karşı doğrular — kartta
 * karşılığı olmayan (hiçbir `[O-n]` etiketi kartla eşleşmeyen) paragraf SESSİZCE KABUL EDİLMEZ; görünür
 * kalır ama "kaynaksız" olarak işaretlenir ve `olguBaglari`na girmez (06 §7.4-2 olgu kapısının aşama-2 yansıması).
 * (c) metindeki her atfı K1 kapısından (lib/konsrucu/mevzuat/atif.ts) geçirir; doğrulanmamış atıf
 * `⟨DOĞRULANMADI⟩` ile işaretlenir, sessizce geçmez.
 */
import { atifKapisi, type AtifSonuc, type KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'
import { DOGRULANMADI_ISARETI } from '@/lib/konsrucu/mevzuat/sabitler'
import { AI_ISARET, blokIsle, type BaglamDegeri, type BaglamNesnesi, type SablonBlogu, type YerTutucuKaydi } from './sablon-dil'
import type { KartIcerik, TalepKodu } from './tipler'

// ───────────────────────── girdi ─────────────────────────

export type ComposerGirdisi = {
  /** Kilitli (ONAYLI) kart içeriği; kilit kontrolü çağıran katmanda yapılır (asama2Kapisi, kart.ts). */
  kart: KartIcerik
  davaci: { unvan: string | null; adres: string | null; vkn: string | null }
  vekil: { adSoyad: string | null; uets: string | null }
  /** Avukatın seçimi varsa o, yoksa sistemin önerisi (KartIcerik.oneriler). */
  mahkemeAdi: string | null
  esasNo: string | null
  icraDairesi: string | null
  icraEsasNo: string | null
  /** kart.ts · davaDegeriOnerisi() ile hesaplanır; composer kendisi hesaplamaz (tek kaynaktan tek hesap, B04). */
  davaDegeri: { kurus: number; aciklama: string } | null
  /** Talep sonucundaki kapanış tarihi (üretim anı; belge imza satırına basılır). */
  tarih: Date
  /** Aktif müşterinin K1 kütüphanesi (yalnız metindeki atıfları doğrulamak için; hukuki sebepler bloğu
   *  zaten yalnız `kart.dayanaklar`dan basılır — bu liste daha geniş olabilir, AI'nın metne kaçırdığı bir
   *  atıf da yakalansın diye). */
  kutuphane: readonly KutuphaneKaydi[]
}

/** paragraf.ts'in AI'dan aldığı ham çıktı (doğrulanmamış): yuva kimliği + serbest metin. */
export type AiParagrafGirdi = { yuvaId: string; metin: string }

// ───────────────────────── talep metinleri (koddan, B25) ─────────────────────────

export const TALEP_METNI: Record<TalepKodu, string> = {
  ITIRAZIN_IPTALI: 'Davalı tarafın icra takibine vaki itirazının iptaline',
  TAKIBIN_DEVAMI: 'Takibin devamına',
  INKAR_TAZMINATI: 'Takdir edilecek icra inkâr tazminatının davalı taraftan tahsiline',
  YARGILAMA_GIDERI: 'Yargılama giderleri ve vekâlet ücretinin davalı taraf üzerinde bırakılmasına',
  IHTIYATI_HACIZ: 'Davalı taraf hakkında ihtiyati haciz kararı verilmesine',
}

// ───────────────────────── bağlam ─────────────────────────

/** Kilitli karttan ve dosya künyesinden şablonun `{{alan}}`larını dolduracak bağlamı kurar (saf, DB yok). */
export function baglamKur(g: ComposerGirdisi): BaglamNesnesi {
  const secili = new Set(g.kart.secimler.davalilar)
  const davalilar = g.kart.davaliAdaylari.filter((a) => secili.has(a.borcluId)).map((a) => ({ ad: a.ad }))
  const talepler = g.kart.secimler.talepler.map((t) => ({ metin: TALEP_METNI[t] }))
  const hukukiSebepler = g.kart.dayanaklar.map((d) => ({ kunye: d.kunye }))
  const ekler = g.kart.ekler.slice().sort((a, b) => a.sira - b.sira).map((e) => ({ ad: e.ad }))
  return {
    davaci_unvan: g.davaci.unvan, davaci_adres: g.davaci.adres, davaci_vkn: g.davaci.vkn,
    vekil_ad_soyad: g.vekil.adSoyad, vekil_uets: g.vekil.uets,
    mahkeme_adi: g.mahkemeAdi, esas_no: g.esasNo,
    icra_dairesi: g.icraDairesi, icra_esas: g.icraEsasNo,
    dava_degeri: g.davaDegeri ? g.davaDegeri.kurus / 100 : null,
    dava_degeri_aciklama: g.davaDegeri?.aciklama ?? null,
    davalilar, talepler, hukuki_sebepler: hukukiSebepler, ekler,
    tarih: g.tarih,
  } satisfies Record<string, BaglamDegeri>
}

// ───────────────────────── AÇIKLAMALAR paragrafları: karta karşı doğrulama ─────────────────────────

export type ComposerParagraf = {
  yuvaId: string
  blokId: string
  /** Nihai metin: kaynaksızsa ⟨KAYNAKSIZ⟩ uyarısıyla BİRLİKTE (silinmez, avukat görür ve düzeltir). */
  metin: string
  /** Yalnız kartta gerçekten var olan `O-n` kimlikleri (metinde geçen ama kartta olmayanlar sayılmaz). */
  olguIdleri: string[]
  /** Metinde geçtiği hâlde kartta karşılığı olmayan kimlikler (avukat için tanı). */
  gecersizIdler: string[]
  /** true: paragraf hiçbir geçerli kart olgusuna bağlanamadı (06 §7.4-2 "kaynaksız"; sessizce kabul edilmez). */
  kaynaksiz: boolean
  /** false: yapay zekâ hiç çalışmadı/başarısız oldu; metin yalnız yer tutucudur. */
  aiUretti: boolean
}

const O_ID_RE = /\[O-\d+\]/g
const KAYNAKSIZ_ISARETI = '⟨KAYNAKSIZ: bu paragrafın kart olgularıyla bağı doğrulanamadı; avukat kontrol etmeden kullanmayın⟩'

/** Yapay zekânın ham paragraf metnini kart olgu kimlikleriyle doğrular. Kart dışı [O-n] sessizce kabul edilmez. */
function paragrafDogrula(yuvaId: string, blokId: string, hamMetin: string, gecerliIdler: ReadonlySet<string>): ComposerParagraf {
  const gecenler = [...new Set((hamMetin.match(O_ID_RE) ?? []).map((x) => x.slice(1, -1)))]
  const olguIdleri = gecenler.filter((id) => gecerliIdler.has(id))
  const gecersizIdler = gecenler.filter((id) => !gecerliIdler.has(id))
  const kaynaksiz = olguIdleri.length === 0
  const govde = hamMetin.trim()
  const metin = kaynaksiz
    ? `${KAYNAKSIZ_ISARETI}\n${govde}`
    : gecersizIdler.length
      ? `⟨UYARI: geçersiz olgu kimliği kullanıldı: ${gecersizIdler.join(', ')}⟩\n${govde}`
      : govde
  return { yuvaId, blokId, metin, olguIdleri, gecersizIdler, kaynaksiz, aiUretti: true }
}

/** Yapay zekâ hiç çalışmadıysa yuva, talimatın kısaltılmış hâliyle yer tutucu olarak kalır (⟨…⟩ biçiminde). */
function yerTutucuParagraf(yuvaId: string, blokId: string, talimat: string): ComposerParagraf {
  const ozet = talimat.length > 140 ? `${talimat.slice(0, 140)}…` : talimat
  return { yuvaId, blokId, metin: `⟨açıklama: yapay zekâ kullanılamadı; ${ozet}⟩`, olguIdleri: [], gecersizIdler: [], kaynaksiz: false, aiUretti: false }
}

// ───────────────────────── atıf kapısı uygulaması ─────────────────────────

/** Doğrulanmamış (ya da yasak) her atfın hemen ardına ⟨DOĞRULANMADI⟩ ekler; sondan başa doğru (indeksler kaymasın). */
function atifIsaretleriniUygula(metin: string, atiflar: readonly AtifSonuc[]): string {
  const kirmizi = [...atiflar].filter((a) => a.kirmizi).sort((a, b) => b.bas - a.bas)
  let out = metin
  for (const a of kirmizi) out = `${out.slice(0, a.bit)} ${DOGRULANMADI_ISARETI}${out.slice(a.bit)}`
  return out
}

// ───────────────────────── birleştirme ─────────────────────────

export type ComposerSonucu = {
  /** Tam dilekçe metni (Word'e ve düzenleyiciye giden nihai hâl). */
  metin: string
  bloklar: { id: string; baslik: string; metin: string }[]
  yerTutucular: YerTutucuKaydi[]
  paragraflar: ComposerParagraf[]
  /** UI'da "[O-n] tıklanınca kaynak açılıyor" için: paragraf metni ↔ geçerli olgu kimlikleri. */
  olguBaglari: { paragraf: string; olguIdleri: string[] }[]
  atiflar: AtifSonuc[]
  uyarilar: string[]
}

/**
 * İskelet bloklarını bağlamla doldurur, AI paragraflarını (varsa) karta karşı doğrulayıp yerleştirir, atıf
 * kapısından geçirir ve nihai dilekçe metnini döndürür. Saf fonksiyondur: aynı girdi → aynı çıktı; kodun
 * bastığı bloklar (taraflar, değer, EKLER, talep sonucu) `aiSonucu`dan tamamen bağımsızdır.
 */
export function dilekceyiOlustur(g: ComposerGirdisi, bloklar: readonly SablonBlogu[], aiSonucu: readonly AiParagrafGirdi[] | null): ComposerSonucu {
  const baglam = baglamKur(g)
  const islenmisBloklar = bloklar.map((b) => blokIsle(b, baglam))
  const gecerliIdler = new Set(g.kart.olgular.map((o) => o.id))
  const aiMap = new Map((aiSonucu ?? []).map((x) => [x.yuvaId, x.metin]))
  const paragraflar: ComposerParagraf[] = []

  const finalBloklar = islenmisBloklar.map((ib) => {
    let metin = ib.metin
    for (const yuva of ib.aiYuvalari) {
      const ham = aiMap.get(yuva.id)
      const p = ham != null && ham.trim() ? paragrafDogrula(yuva.id, ib.etiket.id, ham, gecerliIdler) : yerTutucuParagraf(yuva.id, ib.etiket.id, yuva.talimat)
      paragraflar.push(p)
      metin = metin.split(AI_ISARET(yuva.id)).join(p.metin)
    }
    return { id: ib.etiket.id, baslik: ib.etiket.baslik, metin }
  })

  let metin = finalBloklar.map((b) => b.metin).filter((s) => s.trim()).join('\n\n')

  // Atıf kapısı (06 §7.4-1): AÇIKLAMALAR bloğu dâhil bütün metin — hukuki sebepler bloğu zaten yalnız
  // DOGRULANDI dayanaklardan basılır ama AI serbest metne kaçırdığı bir atıf varsa da burada yakalanır.
  const atifSonucu = atifKapisi(metin, g.kutuphane)
  metin = atifIsaretleriniUygula(metin, atifSonucu.atiflar)

  const yerTutucular = islenmisBloklar.flatMap((ib) => ib.yerTutucular)
  const uyarilar: string[] = []
  if (paragraflar.some((p) => p.kaynaksiz)) uyarilar.push('Bazı AÇIKLAMALAR paragrafları kart olgularıyla bağlanamadı; "⟨KAYNAKSIZ⟩" işaretli paragrafları düzeltmeden imzaya göndermeyin.')
  if (paragraflar.some((p) => !p.aiUretti)) uyarilar.push('Yapay zekâ çalışmadı; AÇIKLAMALAR yer tutucu olarak bırakıldı, elle yazılmalı.')
  if (yerTutucular.length) uyarilar.push(`${yerTutucular.length} alan doldurulamadı; ⟨…⟩ işaretli yerleri tamamlayın.`)
  if (atifSonucu.kirmiziSayisi > 0) uyarilar.push(`${atifSonucu.kirmiziSayisi} atıf/ifade doğrulanmadı ya da yasaklı; imzadan önce düzeltin.`)

  const olguBaglari = paragraflar.filter((p) => p.olguIdleri.length > 0).map((p) => ({ paragraf: p.metin, olguIdleri: p.olguIdleri }))

  return { metin, bloklar: finalBloklar, yerTutucular, paragraflar, olguBaglari, atiflar: atifSonucu.atiflar, uyarilar }
}
