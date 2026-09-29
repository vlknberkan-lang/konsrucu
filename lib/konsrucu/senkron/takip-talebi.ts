/**
 * KonsRücü — Takip talebi: faiz seçimi, talep metni, alacak ve rücu hesap izi · lib/konsrucu/senkron/takip-talebi.ts
 * (saf; DB yok, istemciye güvenli)
 *
 * S21 (06 §2(c); B04, B10, B26):
 *  - Faiz türü, oranı ve başlangıcı için VARSAYILAN YOKTUR; avukat seçmeden kopilot kilitlidir.
 *  - Talep metni ("dosyaAciklama_48_4") seçimden kurulur; UYAP'ın hazır metnindeki "%......" boşluğu kalmaz.
 *  - UYAP faiz türü kodları: yalnız keşif kaydıyla kanıtlanmış olan eşlenir (FAIZT00002 "Adi Kanuni Faiz",
 *    keşif 2026-07-06, mevcut kopilot gövdesi). Başka seçim için kopilot durur: "Faiz türünü UYAP'ta elle seçin".
 *    Faiz türü tarafların tacir olup olmadığına ve işin niteliğine bağlıdır: seçim avukatındır (teyit gerekli).
 *  - İşlemiş faiz, oran tablosunun kapsamadığı dönemde HESAPLANMAZ (B26): "oran tablosu bu dönemi kapsamıyor".
 *  - Rücu tutarı hesap izi: dekont toplamı × rücu oranı. Sovtaj, muafiyet ve kusur oranı K1 (Yelda) teyidi
 *    gelene kadar formüle KATILMAZ; yalnız "dahil edilmedi" satırı olarak görünür (kural uydurulmaz).
 *
 * ÇAPRAZ KİLİT: faizTalepMetni() ve kopilotFaizDestekli() eklentideki extension/saf.js'in aynı adlı
 * fonksiyonlarıyla birebir aynı sonucu verir (tests/eklenti-tevzi-govdesi.test.ts).
 */
import { faizHesapla, sonDekontTarihi, type DekontGirdi, type FaizOrani } from '@/lib/konsrucu/faiz'

export const FAIZ_TURLERI = ['YASAL', 'AVANS', 'DIGER'] as const
export type FaizTuru = (typeof FAIZ_TURLERI)[number]
export const FAIZ_TURU_ETIKET: Record<FaizTuru, string> = { YASAL: 'Yasal faiz', AVANS: 'Avans faizi', DIGER: 'Diğer (sabit oran)' }

export const FAIZ_BASLANGIC_TURLERI = ['HER_ODEMEDEN', 'TEK_TARIH'] as const
export type FaizBaslangicTuru = (typeof FAIZ_BASLANGIC_TURLERI)[number]
export const FAIZ_BASLANGIC_ETIKET: Record<FaizBaslangicTuru, string> = { HER_ODEMEDEN: 'Her ödeme tarihinden', TEK_TARIH: 'Tek tarihten' }

/** faizOraniMetni'nin "değişen oranlarda" değeri (yasal / avans faizinde mevzuattaki değişen oran). */
export const ORAN_DEGISEN = 'değişen oranlarda'

export type FaizSecimi = {
  faizTuru: string | null
  faizOraniMetni: string | null
  faizBaslangicTuru: string | null
  faizBaslangic: string | Date | null // TEK_TARIH'te zorunlu
}

export type OranCozumu = { tip: 'DEGISEN' } | { tip: 'YUZDE'; yuzde: number }

/** faizOraniMetni → "değişen oranlarda" ya da yıllık yüzde. Çözülemezse null. */
export function oranCoz(metin: string | null | undefined): OranCozumu | null {
  const s = String(metin ?? '').trim().toLocaleLowerCase('tr')
  if (!s) return null
  if (s.includes('değişen') || s.includes('degisen')) return { tip: 'DEGISEN' }
  const m = s.match(/^%?\s*(\d{1,3}(?:[.,]\d{1,4})?)\s*%?$/)
  if (!m) return null
  const yuzde = Number(m[1].replace(',', '.'))
  return Number.isFinite(yuzde) && yuzde > 0 && yuzde <= 200 ? { tip: 'YUZDE', yuzde } : null
}

function isoGun(d: string | Date | null | undefined): string | null {
  if (d == null || d === '') return null
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return null
  // İstanbul günü (UTC+3, DST yok)
  return new Date(x.getTime() + 3 * 3_600_000).toISOString().slice(0, 10)
}

function ggaayyyy(iso: string): string {
  const [y, a, g] = iso.split('-')
  return `${g}.${a}.${y}`
}

/** Eksik faiz seçimleri (boşsa seçim tamamdır). Varsayılan yoktur: boş alan eksiktir. */
export function faizSecimiEksikleri(s: FaizSecimi | null | undefined): string[] {
  const e: string[] = []
  if (!s || !s.faizTuru || !(FAIZ_TURLERI as readonly string[]).includes(s.faizTuru)) e.push('Faiz türü seçilmedi')
  const oran = oranCoz(s?.faizOraniMetni)
  if (!oran) e.push('Faiz oranı seçilmedi')
  else if (s?.faizTuru === 'DIGER' && oran.tip !== 'YUZDE') e.push('Diğer faiz türünde yıllık oran (%) girilmeli')
  if (!s || !s.faizBaslangicTuru || !(FAIZ_BASLANGIC_TURLERI as readonly string[]).includes(s.faizBaslangicTuru)) e.push('Faiz başlangıcı seçilmedi')
  else if (s.faizBaslangicTuru === 'TEK_TARIH' && !isoGun(s.faizBaslangic)) e.push('Faiz başlangıç tarihi girilmedi')
  return e
}

/**
 * Takip talebinin faiz cümlesi (UYAP "dosyaAciklama_48_4"). Seçim eksikse null — "%......" hiçbir zaman üretilmez.
 * Örnek: "Alacağın her bir ödeme tarihinden itibaren tahsili tarihine kadar değişen oranlarda yasal faizi, masraf ve
 * vekalet ücreti ile tahsili, kısmi ödemelerde BK.100'e göre yapılmasını talep ederim."
 */
export function faizTalepMetni(s: FaizSecimi | null | undefined): string | null {
  if (!s || faizSecimiEksikleri(s).length) return null
  const oran = oranCoz(s.faizOraniMetni) as OranCozumu
  const bas = s.faizBaslangicTuru === 'TEK_TARIH' ? `${ggaayyyy(isoGun(s.faizBaslangic) as string)} tarihinden itibaren` : 'her bir ödeme tarihinden itibaren'
  const oranMetni = oran.tip === 'DEGISEN' ? 'değişen oranlarda' : `yıllık %${String(oran.yuzde).replace('.', ',')} oranında`
  const tur = s.faizTuru === 'YASAL' ? 'yasal faizi' : s.faizTuru === 'AVANS' ? 'avans faizi' : 'faizi'
  return `Alacağın ${bas} tahsili tarihine kadar ${oranMetni} ${tur}, masraf ve vekalet ücreti ile tahsili, kısmi ödemelerde BK.100'e göre yapılmasını talep ederim.`
}

/**
 * Kopilot bu seçimi UYAP'a aktarabilir mi? Yalnız keşifle kanıtlanmış kod: yasal faiz + değişen oran →
 * FAIZT00002 "Adi Kanuni Faiz". Diğer her seçimde kopilot durur ve "Faiz türünü UYAP'ta elle seçin" der.
 */
export function kopilotFaizDestekli(s: FaizSecimi | null | undefined): boolean {
  if (!s || faizSecimiEksikleri(s).length) return false
  const oran = oranCoz(s.faizOraniMetni)
  return s.faizTuru === 'YASAL' && oran?.tip === 'DEGISEN'
}

// ── İşlemiş faiz (kopilot ve önizleme AYNI hesabı kullanır) ────────────────────
export type AlacakGirdisi = {
  anapara: number
  islemisFaizElle: number | null // TakipTalebi.islemisFaiz ya da RucuDosyasi.faizTutari (elle)
  dekontlar: DekontGirdi[]
  faizBaslangic: string | null // YYYY-MM-DD; boşsa son dekont tarihi (ihtiyatlı)
  faizBitis: string | null // YYYY-MM-DD; boşsa bugün
  oranlar: FaizOrani[]
  bugun: string // YYYY-MM-DD (İstanbul günü)
}

export type AlacakSonucu = {
  anapara: number
  islemisFaiz: number | null
  toplam: number | null
  faizBaslangic: string | null
  faizBitis: string
  kaynak: 'ELLE' | 'HESAP' | 'YOK'
  uyari: string | null
}

const yuvarla = (n: number) => Math.round(n * 100) / 100

/** Oran tablosu bu başlangıç tarihini kapsıyor mu? (En eski oran başlangıçtan sonraysa kapsamaz — B26.) */
export function oranKapsami(oranlar: FaizOrani[], baslangic: string): { ok: boolean; enEski: string | null } {
  const tarihler = oranlar.map((o) => o.baslangic).filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)).sort()
  if (!tarihler.length) return { ok: false, enEski: null }
  return { ok: tarihler[0] <= baslangic, enEski: tarihler[0] }
}

export function takipAlacakHesapla(g: AlacakGirdisi): AlacakSonucu {
  const anapara = yuvarla(Math.max(0, Number(g.anapara) || 0))
  const faizBaslangic = g.faizBaslangic ?? sonDekontTarihi(g.dekontlar)
  const faizBitis = g.faizBitis ?? g.bugun
  if (g.islemisFaizElle != null && Number.isFinite(g.islemisFaizElle)) {
    const f = yuvarla(g.islemisFaizElle)
    return { anapara, islemisFaiz: f, toplam: yuvarla(anapara + f), faizBaslangic, faizBitis, kaynak: 'ELLE', uyari: null }
  }
  if (!(anapara > 0)) return { anapara, islemisFaiz: null, toplam: null, faizBaslangic, faizBitis, kaynak: 'YOK', uyari: 'Asıl alacak yok.' }
  if (!faizBaslangic) return { anapara, islemisFaiz: null, toplam: null, faizBaslangic, faizBitis, kaynak: 'YOK', uyari: 'Faiz başlangıcı yok (dekont tarihi eksik).' }
  const kapsam = oranKapsami(g.oranlar, faizBaslangic)
  if (!kapsam.ok) {
    return {
      anapara, islemisFaiz: null, toplam: null, faizBaslangic, faizBitis, kaynak: 'YOK',
      uyari: kapsam.enEski
        ? `Faiz oran tablosu bu dönemi kapsamıyor (en eski oran ${ggaayyyy(kapsam.enEski)}; başlangıç ${ggaayyyy(faizBaslangic)}). Ayarlar > Faiz oranlarını tamamlayın ya da işlemiş faizi elle girin.`
        : 'Faiz oran tablosu boş. Ayarlar > Faiz oranlarını girin ya da işlemiş faizi elle girin.',
    }
  }
  if (faizBitis <= faizBaslangic) return { anapara, islemisFaiz: 0, toplam: anapara, faizBaslangic, faizBitis, kaynak: 'HESAP', uyari: null }
  const h = faizHesapla(anapara, new Date(faizBaslangic + 'T00:00:00'), new Date(faizBitis + 'T00:00:00'), g.oranlar)
  const f = h ? h.faiz : 0
  return { anapara, islemisFaiz: f, toplam: yuvarla(anapara + f), faizBaslangic, faizBitis, kaynak: 'HESAP', uyari: null }
}

// ── Rücu tutarı hesap izi (B10) ─────────────────────────────────────────────
export type HesapIziGirdisi = {
  dekontlar: { tarih: string | null; tutar: number; haricMi: boolean }[]
  rucuOrani: string | null
  hugoRucuTutari: number | null
  sovtaj?: number | null
  muafiyet?: number | null
  kusurOrani?: string | null
  /**
   * Müvekkil Excel'indeki rücu tutarı ESAS mı (Zurich: çok sayıda ödeme yapılmış olabilir, gerçek rücu tutarı
   * Excel'dekidir). true ve tutar varsa asıl alacak = Excel tutarı; dekont × oran yalnız karşılaştırma satırıdır.
   */
  excelEsas?: boolean
}

export type HesapIziAdimi = { etiket: string; deger: string; not?: string }

export type HesapIzi = {
  formulSurumu: string
  dekontSayisi: number
  dekontToplami: number
  haricToplam: number
  oran: number | null
  oranMetni: string | null
  asilAlacak: number | null
  hugoRucuTutari: number | null
  fark: number | null
  tutarli: boolean | null
  adimlar: HesapIziAdimi[]
  dahilEdilmeyen: HesapIziAdimi[]
  durdu: string | null
}

/** Formülün sürümü; K1 (Yelda) teyidi gelince yeni sürümle sovtaj/muafiyet/kusur eklenir. */
export const HESAP_FORMUL_SURUMU = 'v1 · dekont toplamı × rücu oranı (sovtaj, muafiyet, kusur K1 teyidi bekliyor)'
export const HESAP_FORMUL_SURUMU_EXCEL = "v1 · müvekkil Excel'indeki rücu tutarı (dekont × oran bilgi amaçlı)"

const tl = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' TL'

/** "% 100" → 1 · "%50" → 0,5 · "50" → 0,5 · "0,5" → 0,5 · "1/2" → 0,5. Belirsiz ("1") ya da bozuk → null. */
export function rucuOraniCoz(metin: string | null | undefined): number | null {
  const s = String(metin ?? '').trim().replace(/\s+/g, '')
  if (!s) return null
  const kesir = s.match(/^(\d+)\/(\d+)$/)
  if (kesir) { const a = Number(kesir[1]), b = Number(kesir[2]); return b > 0 && a <= b ? a / b : null }
  const yuzde = s.includes('%')
  const n = Number(s.replace('%', '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  if (yuzde) return n <= 100 ? n / 100 : null
  if (n > 1 && n <= 100) return n / 100
  if (n < 1) return n
  return null // "1" — %1 mi %100 mü belirsiz: tahmin yürütülmez
}

export function rucuHesapIzi(g: HesapIziGirdisi): HesapIzi {
  const dahil = g.dekontlar.filter((d) => !d.haricMi && Number.isFinite(d.tutar) && d.tutar > 0)
  const haric = g.dekontlar.filter((d) => d.haricMi && Number.isFinite(d.tutar) && d.tutar > 0)
  const dekontToplami = yuvarla(dahil.reduce((s, d) => s + d.tutar, 0))
  const haricToplam = yuvarla(haric.reduce((s, d) => s + d.tutar, 0))
  const oran = rucuOraniCoz(g.rucuOrani)
  const adimlar: HesapIziAdimi[] = [
    { etiket: 'Dekont toplamı', deger: tl(dekontToplami), not: `${dahil.length} ödeme${haric.length ? ` · ${haric.length} ödeme hariç (ekspertiz vb., ${tl(haricToplam)})` : ''}` },
    { etiket: 'Rücu oranı', deger: oran != null ? `%${String(yuvarla(oran * 100)).replace('.', ',')}` : (g.rucuOrani ?? '—'), not: g.rucuOrani ? `kaynak: "${g.rucuOrani}"` : 'dosyada rücu oranı yok' },
  ]
  const dahilEdilmeyen: HesapIziAdimi[] = []
  if (g.sovtaj != null && g.sovtaj > 0) dahilEdilmeyen.push({ etiket: 'Sovtaj', deger: tl(g.sovtaj), not: 'formüle dahil edilmedi (K1 teyidi bekleniyor)' })
  if (g.muafiyet != null && g.muafiyet > 0) dahilEdilmeyen.push({ etiket: 'Muafiyet', deger: tl(g.muafiyet), not: 'formüle dahil edilmedi (K1 teyidi bekleniyor)' })
  if (g.kusurOrani) dahilEdilmeyen.push({ etiket: 'Kusur oranı', deger: g.kusurOrani, not: 'formüle dahil edilmedi (K1 teyidi bekleniyor)' })

  const hugo = g.hugoRucuTutari != null && Number.isFinite(g.hugoRucuTutari) ? yuvarla(g.hugoRucuTutari) : null
  if (g.excelEsas && hugo != null && hugo > 0) {
    // Excel tutarı esas: dekont hesabı yapılabiliyorsa yalnız bilgi olarak yazılır, onayı durdurmaz.
    const hesap = dahil.length && oran != null ? yuvarla(dekontToplami * oran) : null
    const fark = hesap != null ? yuvarla(hugo - hesap) : null
    if (hesap != null) adimlar.push({ etiket: 'Dekont × oran', deger: tl(hesap), not: fark != null && Math.abs(fark) >= 0.5 ? `Excel tutarından fark: ${tl(fark)} (bilgi)` : 'Excel tutarıyla aynı' })
    adimlar.push({ etiket: 'Asıl alacak', deger: tl(hugo), not: "müvekkil Excel'indeki rücu tutarı esas alındı" })
    return {
      formulSurumu: HESAP_FORMUL_SURUMU_EXCEL, dekontSayisi: dahil.length, dekontToplami, haricToplam, oran, oranMetni: g.rucuOrani ?? null,
      asilAlacak: hugo, hugoRucuTutari: hugo, fark, tutarli: true, adimlar, dahilEdilmeyen, durdu: null,
    }
  }

  let durdu: string | null = null
  if (!dahil.length) durdu = 'Dosyada ödeme (dekont) yok; hesap yapılamadı.'
  else if (oran == null) durdu = g.rucuOrani ? `Rücu oranı "${g.rucuOrani}" okunamadı; oranı düzeltin.` : 'Rücu oranı yok; hesap yapılamadı.'
  const asilAlacak = durdu ? null : yuvarla(dekontToplami * (oran as number))
  if (asilAlacak != null) adimlar.push({ etiket: 'Asıl alacak', deger: tl(asilAlacak), not: 'dekont toplamı × rücu oranı' })

  const fark = asilAlacak != null && hugo != null ? yuvarla(hugo - asilAlacak) : null
  const tutarli = fark == null ? null : Math.abs(fark) < 0.5
  if (hugo != null) adimlar.push({ etiket: 'Hugo rücu tutarı', deger: tl(hugo), not: fark == null ? undefined : tutarli ? 'hesapla aynı (fark yok)' : `hesaptan fark: ${tl(fark)}` })

  return {
    formulSurumu: HESAP_FORMUL_SURUMU, dekontSayisi: dahil.length, dekontToplami, haricToplam, oran, oranMetni: g.rucuOrani ?? null,
    asilAlacak, hugoRucuTutari: hugo, fark, tutarli, adimlar, dahilEdilmeyen, durdu,
  }
}

// ── Kilit: "Takibe hazır" ve "UYAP'ta takibi aç" ─────────────────────────────
export type TakipTalebiOzeti = FaizSecimi & {
  asilAlacak: number | null
  hesapIziOnayli: boolean
  dondurulduAt: string | Date | null
}

/** Takip talebi tarafındaki kilit sebepleri (hazırlık listesinin faiz ve hesap izi maddeleri). */
export function takipTalebiKilitSebepleri(t: TakipTalebiOzeti | null | undefined): string[] {
  if (!t) return ['Takip talebi yok: faiz türü, oranı ve başlangıcı seçilmedi', 'Rücu tutarı hesap izi onaylanmadı']
  const s = [...faizSecimiEksikleri(t)]
  if (!t.hesapIziOnayli) s.push('Rücu tutarı hesap izi onaylanmadı')
  if (!(Number(t.asilAlacak) > 0)) s.push('Asıl alacak yok')
  const metin = faizTalepMetni(t)
  if (metin && metin.includes('%......')) s.push('Talep metninde "%......" boşluğu kaldı')
  return s
}

/** Hazırlık listesi (S20) için tek satırlık faiz maddesi. */
export function faizHazirlikMaddesi(t: FaizSecimi | null | undefined): { tamam: boolean; metin: string } {
  const e = faizSecimiEksikleri(t)
  if (e.length) return { tamam: false, metin: 'Faiz türü, oranı ve başlangıcı seçilmedi' }
  const tur = FAIZ_TURU_ETIKET[t!.faizTuru as FaizTuru]
  const bas = t!.faizBaslangicTuru === 'TEK_TARIH' ? `${ggaayyyy(isoGun(t!.faizBaslangic) as string)} tarihinden` : 'her ödeme tarihinden'
  return { tamam: true, metin: `Faiz: ${tur}, ${oranCoz(t!.faizOraniMetni)?.tip === 'DEGISEN' ? 'değişen oranlarda' : t!.faizOraniMetni}, ${bas}` }
}

// ── Değişmez kayıt: taslak, dondur, sürüm ─────────────────────────────────────
export type SurumKarari = 'OLUSTUR' | 'GUNCELLE' | 'YENI_SURUM'

/**
 * Takip talebine yazarken ne yapılır? Geçerli kayıt yoksa ilk sürüm açılır; tevzide dondurulmamış taslak
 * yerinde güncellenir; dondurulmuş kayıt ASLA değişmez — düzeltme yeni sürüm açar (eskisi gecerli=false kalır).
 */
export function surumKarari(mevcut: { dondurulduAt: Date | string | null } | null | undefined): SurumKarari {
  if (!mevcut) return 'OLUSTUR'
  return mevcut.dondurulduAt ? 'YENI_SURUM' : 'GUNCELLE'
}

/** Onaylı hesap izi hâlâ geçerli mi? (Onaydan sonra dekont ya da oran değiştiyse yeniden onay gerekir.) */
export function hesapIziHalaGecerli(onayliAsil: number | null | undefined, guncelAsil: number | null | undefined): boolean {
  if (onayliAsil == null || guncelAsil == null) return false
  return Math.abs(Number(onayliAsil) - Number(guncelAsil)) < 0.005
}

export { isoGun as takipIsoGun, ggaayyyy as takipTarihTR }
