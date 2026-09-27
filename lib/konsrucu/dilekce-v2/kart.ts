/**
 * KonsRücü — Dosya kartı (dilekçenin 1. aşaması) · lib/konsrucu/dilekce-v2/kart.ts (saf; DB yok)
 *
 * S35 (06 §7.3 Aşama 1, 2(h); B04, B08, B19, B38, B40):
 *   - Kod doldurur: taraflar (müvekkil ayarı, DavaTaraf / borçlular), takip talebi tutarları, dava değeri
 *     (itiraz edilen miktar; itirazın iptalinde takip sonrası faiz EKLENMEZ, B04), borçlu bazında itiraz, arabuluculuk
 *     son tutanağı, onaylı rücu sebebi kodu, onaylı alan değerleri, EK listesi (son tutanak ilk sırada).
 *   - Yapay zekâ olguları ayrı gelir (kart-ai.ts); her birinin alıntısı belge metninde bulunmazsa karta giremez.
 *   - Kritik olgular onaylanmadan kart kilitlenmez; kart kilitlenmeden (ONAYLI) aşama 2 başlamaz.
 *   - Kilitli kartta düzeltme yeni sürüm açar (aksiyon katmanı); bu modül yalnız içeriği dönüştürür.
 *
 * Sistem önerir, avukat seçer: mahkeme, usul, davalılar ve talepler `oneriler`de durur; `secimler` yalnız avukatın
 * kaydıyla dolar. Hiçbir fonksiyon kesin son gün, görevli mahkeme ya da talep sonucu kararı vermez.
 */
import { paraTR, tarihTR } from '@/lib/konsrucu/format'
import { alintiBul, type BelgeMetni } from './alinti'
import { isaretleriTasi, savunmaMatrisiKur, type AiSavunma } from './savunma-matrisi'
import {
  AI_KRITIK_ESLEME, KRITIK_ALAN_ADI, KRITIK_ALT_KUME, OLGU_ALANLARI, TALEP_KODLARI,
  type DavaliAdayi, type KartEk, type KartEksik, type KartIcerik, type KartOlgu, type KartSecimler, type KartTuru,
  type KaynaksizOlgu, type KritikAlan, type TalepKodu,
} from './tipler'

// ───────────────────────── girdi (DB anlık görüntüsü; kart-veri.ts kurar) ─────────────────────────

export type KartGirdisi = {
  dosya: {
    id: string; hukukDosyaNo: string | null; icraDairesi: string | null; icraDosyaNo: string | null
    takipTarihi: string | null; rucuSebebi: string | null; rucuSebebiKod: string | null
  }
  musteriUnvani: string | null
  borclular: {
    id: string; adUnvan: string
    takip: {
      itirazVar: boolean | null; itirazTipi: string | null; itirazVerilisTarihi: string | null; itirazUyapTarihi: string | null
      itirazKapsamJson: unknown; itirazEdilenTutar: string | null; itirazKaynakBelgeId: string | null
    } | null
  }[]
  takipTalebi: {
    id: string; surum: number; asilAlacak: string; islemisFaiz: string | null; toplam: string | null
    faizTuru: string | null; faizOraniMetni: string | null; faizBaslangicTuru: string | null; faizBaslangic: string | null
    takipTarihi: string | null; kaynak: string; kaynakBelgeId: string | null
  } | null
  dava: {
    id: string; tur: string | null; mahkemeTuru: string | null; mahkemeYer: string | null; mahkemeNo: string | null
    esasYil: number | null; esasSira: number | null; usul: string | null; davaDegeri: string | null; davaDegeriKaynak: string | null
    taraflar: { id: string; borcluId: string | null; rol: string; itirazEttiMi: boolean | null; adHam: string | null; teyit: string }[]
  } | null
  arabuluculuk: { id: string; tur: string | null; sonTutanakTarihi: string | null; sonuc: string | null; sonTutanakBelgeId: string | null } | null
  alanlar: {
    id: string; alan: string; deger: string; kaynakBelgeId: string | null; sayfa: number | null
    alinti: string | null; alintiDogru: boolean | null; onaylayanId: string | null; onayAt: string | null
  }[]
  belgeler: { id: string; ad: string; altTur: string | null; kategori: string | null; tarih: string | null; metinVar: boolean }[]
  /** Aktif müvekkilin DOĞRULANDI ve aktif kütüphane kayıtları. */
  dayanaklar: { id: string; kunye: string; rucuSebebiKodlari: string[] }[]
}

// ───────────────────────── yardımcılar ─────────────────────────

/** "1234.56" → 123456 kuruş (tamsayı; kayan nokta hatası yok). */
export function kurus(s: string | null | undefined): number | null {
  if (s == null) return null
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(String(s).trim())
  if (!m) return null
  const v = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'))
  return m[1] ? -v : v
}
const tl = (k: number | null) => (k == null ? '—' : paraTR(k / 100))

const MAHKEME_TURU_ADI: Record<string, string> = {
  ASLIYE_HUKUK: 'Asliye Hukuk Mahkemesi', ASLIYE_TICARET: 'Asliye Ticaret Mahkemesi', TUKETICI: 'Tüketici Mahkemesi',
  SULH_HUKUK: 'Sulh Hukuk Mahkemesi', ICRA_HUKUK: 'İcra Hukuk Mahkemesi', BAM: 'Bölge Adliye Mahkemesi', YARGITAY: 'Yargıtay',
}
const ARB_SONUC_ADI: Record<string, string> = {
  ANLASMA: 'anlaşma', ANLASAMAMA: 'anlaşamama', ULASILAMAMA: 'ulaşılamama', KATILMAMA: 'katılmama', KISMEN: 'kısmen anlaşma',
}
const ALAN_ETIKETI: Record<string, string> = {
  asilAlacak: 'Asıl alacak', rucuTutari: 'Rücu tutarı', rucuOrani: 'Rücu oranı', brans: 'Branş', policeNo: 'Poliçe no',
  policeBaslangic: 'Poliçe başlangıcı', policeBitis: 'Poliçe bitişi', policeTanzimTarihi: 'Poliçe tanzim tarihi',
  kazaTarihi: 'Kaza tarihi', kazaYeri: 'Kaza yeri', sigortaliPlaka: 'Sigortalı plaka', karsiPlaka: 'Karşı plaka',
  'kusur.oran': 'Kusur oranı', yetkiliIcra: 'Yetkili icra',
}
const alanEtiketi = (a: string) => ALAN_ETIKETI[a] ?? (/^odeme\[/.test(a) ? 'Ödeme' : a)

export function mahkemeAdi(d: KartGirdisi['dava']): string | null {
  if (!d) return null
  const parca = [d.mahkemeYer, d.mahkemeNo ? `${d.mahkemeNo}.` : null, d.mahkemeTuru ? MAHKEME_TURU_ADI[d.mahkemeTuru] ?? d.mahkemeTuru : null]
  const s = parca.filter(Boolean).join(' ').trim()
  return s || null
}
export function esasNo(d: KartGirdisi['dava']): string | null {
  return d?.esasYil && d.esasSira ? `${d.esasYil}/${d.esasSira} E.` : null
}

function itirazKapsami(j: unknown): string | null {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  const o = j as Record<string, unknown>
  const ad: Record<string, string> = { yetki: 'yetki', borc: 'borç', faiz: 'faiz', feriler: "fer'iler", imza: 'imza' }
  const s = Object.entries(ad).filter(([k]) => o[k] === true).map(([, v]) => v)
  return s.length ? s.join(', ') : null
}

type HamOlgu = Omit<KartOlgu, 'id'>
const hamOlgu = (o: Partial<HamOlgu> & Pick<HamOlgu, 'metin' | 'kaynakTuru' | 'kaynakEtiketi'>): HamOlgu => ({
  alanlar: [], kritik: false, kritikAlan: null, kayitRef: null, belgeId: null, belgeAdi: null, sayfa: null, alinti: null,
  alintiDogru: null, onayli: false, onaylayanId: null, onayAt: null, duzeltildi: false, ...o,
})

// ───────────────────────── dava değeri (B04) ─────────────────────────

export type DavaDegeriOnerisi = { kurus: number; kaynak: string; aciklama: string }

/**
 * Dava değeri önerisi: (1) avukatın Dava kaydı; (2) tam itirazda takip talebindeki toplam (asıl + işlemiş faiz);
 * (3) kısmi itirazda itiraz edilen tutar. Takip tarihinden sonra işleyen faiz hiçbir yolda eklenmez (B04).
 * Birlikte borçlu olanlar aynı borca itiraz ettiği için tutarlar toplanmaz.
 */
export function davaDegeriOnerisi(g: KartGirdisi): DavaDegeriOnerisi | null {
  const kayitli = kurus(g.dava?.davaDegeri)
  if (kayitli != null) return { kurus: kayitli, kaynak: 'Dava kaydı', aciklama: `avukatın dava kaydı${g.dava?.davaDegeriKaynak ? ` (${g.dava.davaDegeriKaynak})` : ''}` }
  const itirazlar = g.borclular.map((b) => b.takip).filter((t): t is NonNullable<typeof t> => !!t && t.itirazVar === true)
  if (!itirazlar.length) return null
  const tt = g.takipTalebi
  if (itirazlar.some((t) => t.itirazTipi === 'TAM') && tt) {
    const toplam = kurus(tt.toplam) ?? ((kurus(tt.asilAlacak) ?? 0) + (kurus(tt.islemisFaiz) ?? 0))
    return { kurus: toplam, kaynak: `Takip talebi (sürüm ${tt.surum})`, aciklama: 'tam itiraz: takip talebindeki asıl alacak ve işlemiş faiz; takip sonrası faiz eklenmez' }
  }
  const kismi = itirazlar.map((t) => kurus(t.itirazEdilenTutar)).filter((x): x is number => x != null)
  if (kismi.length) return { kurus: Math.max(...kismi), kaynak: 'İtiraz kaydı', aciklama: 'kısmi itiraz: itiraz edilen tutar; takip sonrası faiz eklenmez' }
  return null
}

// ───────────────────────── kayıt olguları ─────────────────────────

export function davaliAdaylari(g: KartGirdisi): DavaliAdayi[] {
  const davalilar = (g.dava?.taraflar ?? []).filter((t) => t.rol === 'DAVALI' && t.teyit !== 'REDDEDILDI')
  if (davalilar.length) {
    return davalilar.map((t) => {
      const b = t.borcluId ? g.borclular.find((x) => x.id === t.borcluId) : undefined
      return {
        borcluId: t.borcluId ?? `taraf:${t.id}`, ad: b?.adUnvan ?? t.adHam ?? 'Adı kayıtlı değil',
        itirazVar: t.itirazEttiMi ?? b?.takip?.itirazVar ?? null, itirazTipi: b?.takip?.itirazTipi ?? null,
        itirazTarihi: b?.takip?.itirazVerilisTarihi ?? b?.takip?.itirazUyapTarihi ?? null, davaTarafId: t.id, davaTarafTeyit: t.teyit,
      }
    })
  }
  return g.borclular.map((b) => ({
    borcluId: b.id, ad: b.adUnvan, itirazVar: b.takip?.itirazVar ?? null, itirazTipi: b.takip?.itirazTipi ?? null,
    itirazTarihi: b.takip?.itirazVerilisTarihi ?? b.takip?.itirazUyapTarihi ?? null, davaTarafId: null, davaTarafTeyit: null,
  }))
}

const belgeAdi = (g: KartGirdisi, id: string | null) => (id ? g.belgeler.find((b) => b.id === id)?.ad ?? null : null)

export function kayitOlgulari(g: KartGirdisi, tur: KartTuru): { olgular: HamOlgu[]; eksikler: KartEksik[]; kaynaksizlar: KaynaksizOlgu[] } {
  const alt = KRITIK_ALT_KUME[tur]
  const k = (alan: KritikAlan) => ({ kritik: alt.includes(alan), kritikAlan: alan })
  const olgular: HamOlgu[] = []
  const eksikler: KartEksik[] = []
  const kaynaksizlar: KaynaksizOlgu[] = []

  // Taraflar — davacı müvekkil ayarından (boşsa üretim durur, B19)
  if (g.musteriUnvani?.trim()) {
    olgular.push(hamOlgu({
      metin: `Davacı: ${g.musteriUnvani.trim()}`, kaynakTuru: 'KAYIT', kaynakEtiketi: 'Müvekkil ayarı', ...k('TARAFLAR'),
      kayitRef: { tablo: 'Ayarlar', id: 'musteri' }, tarafRef: { rol: 'DAVACI', borcluId: null, davaTarafId: null },
    }))
  } else {
    eksikler.push({ metin: 'Müvekkil unvanı ayarlarda yok; davacı yazılamaz (B19). Ayarlar → şirket bilgilerinden tamamlayın.', kritik: true, alan: 'TARAFLAR' })
  }
  for (const a of davaliAdaylari(g)) {
    const itiraz = a.itirazVar === true ? `itiraz etti${a.itirazTipi ? ` (${a.itirazTipi === 'TAM' ? 'tam' : 'kısmi'})` : ''}${a.itirazTarihi ? `, ${tarihTR(a.itirazTarihi)}` : ''}`
      : a.itirazVar === false ? 'itiraz etmedi' : 'itiraz kaydı yok'
    olgular.push(hamOlgu({
      metin: `Davalı adayı: ${a.ad} — ${itiraz}`, kaynakTuru: 'KAYIT', ...k('TARAFLAR'),
      kaynakEtiketi: a.davaTarafId ? 'Dava tarafı kaydı' : 'Borçlu kaydı',
      kayitRef: a.davaTarafId ? { tablo: 'DavaTaraf', id: a.davaTarafId } : { tablo: 'Borclu', id: a.borcluId },
      tarafRef: { rol: 'DAVALI', borcluId: a.borcluId.startsWith('taraf:') ? null : a.borcluId, davaTarafId: a.davaTarafId },
    }))
  }

  // Tutar — takip talebi ve dava değeri önerisi
  const tt = g.takipTalebi
  if (tt) {
    olgular.push(hamOlgu({
      metin: `Takip talebi (sürüm ${tt.surum}): asıl alacak ${tl(kurus(tt.asilAlacak))}; işlemiş faiz ${tl(kurus(tt.islemisFaiz))}; toplam ${tl(kurus(tt.toplam))}`,
      kaynakTuru: 'KAYIT', kaynakEtiketi: `Takip talebi (sürüm ${tt.surum}, ${tt.kaynak.toLowerCase()})`, ...k('TUTAR'),
      kayitRef: { tablo: 'TakipTalebi', id: tt.id }, belgeId: tt.kaynakBelgeId, belgeAdi: belgeAdi(g, tt.kaynakBelgeId),
    }))
    const faiz = [tt.faizTuru, tt.faizOraniMetni, tt.faizBaslangic ? `başlangıç ${tarihTR(tt.faizBaslangic)}` : tt.faizBaslangicTuru === 'HER_ODEMEDEN' ? 'her ödemeden itibaren' : null].filter(Boolean)
    if (faiz.length) {
      olgular.push(hamOlgu({
        metin: `Takip talebindeki faiz: ${faiz.join('; ')}`, kaynakTuru: 'KAYIT', kaynakEtiketi: `Takip talebi (sürüm ${tt.surum})`,
        alanlar: ['FAIZ'], kayitRef: { tablo: 'TakipTalebi', id: tt.id }, belgeId: tt.kaynakBelgeId, belgeAdi: belgeAdi(g, tt.kaynakBelgeId),
      }))
    }
  } else if (alt.includes('TUTAR')) {
    eksikler.push({ metin: 'Geçerli takip talebi kaydı yok; tutarlar takip talebinden gelir (takip talebi kartını tamamlayın).', kritik: false, alan: 'TUTAR' })
  }
  const dd = davaDegeriOnerisi(g)
  if (dd) {
    olgular.push(hamOlgu({
      metin: `Dava değeri önerisi: ${tl(dd.kurus)} — ${dd.aciklama}`, kaynakTuru: 'KAYIT', kaynakEtiketi: dd.kaynak, ...k('TUTAR'),
      kayitRef: dd.kaynak === 'Dava kaydı' && g.dava ? { tablo: 'Dava', id: g.dava.id } : tt ? { tablo: 'TakipTalebi', id: tt.id } : null,
    }))
  }

  // İtiraz kapsamı — borçlu bazında
  for (const b of g.borclular) {
    const t = b.takip
    if (!t || t.itirazVar !== true) continue
    const parca = [
      t.itirazTipi === 'TAM' ? 'tam itiraz' : t.itirazTipi === 'KISMI' ? 'kısmi itiraz' : 'itiraz',
      itirazKapsami(t.itirazKapsamJson) ? `kapsam: ${itirazKapsami(t.itirazKapsamJson)}` : 'kapsam kayıtlı değil',
      t.itirazVerilisTarihi ? `veriliş ${tarihTR(t.itirazVerilisTarihi)}` : t.itirazUyapTarihi ? `UYAP kaydı ${tarihTR(t.itirazUyapTarihi)}` : null,
      t.itirazEdilenTutar ? `itiraz edilen ${tl(kurus(t.itirazEdilenTutar))}` : null,
    ].filter(Boolean)
    olgular.push(hamOlgu({
      metin: `İtiraz (${b.adUnvan}): ${parca.join('; ')}`, kaynakTuru: 'KAYIT', kaynakEtiketi: 'Borçlu itiraz kaydı', ...k('ITIRAZ_KAPSAMI'),
      kayitRef: { tablo: 'BorcluTakip', id: b.id }, belgeId: t.itirazKaynakBelgeId, belgeAdi: belgeAdi(g, t.itirazKaynakBelgeId),
    }))
  }

  // Rücu sebebi kodu — yalnız onaylı alandan aynalanan kod (B05)
  if (g.dosya.rucuSebebiKod) {
    const a = g.alanlar.find((x) => x.alan === 'rucuSebebiKod')
    olgular.push(hamOlgu({
      metin: `Rücu sebebi kodu: ${g.dosya.rucuSebebiKod}`, kaynakTuru: 'KAYIT', kaynakEtiketi: a ? 'Onaylı alan (rücu sebebi)' : 'Dosya kaydı', ...k('RUCU_SEBEBI'),
      kayitRef: a ? { tablo: 'AlanDegeri', id: a.id } : { tablo: 'RucuDosyasi', id: g.dosya.id },
      belgeId: a?.kaynakBelgeId ?? null, belgeAdi: belgeAdi(g, a?.kaynakBelgeId ?? null), sayfa: a?.sayfa ?? null, alinti: a?.alinti ?? null,
    }))
  } else if (alt.includes('RUCU_SEBEBI')) {
    eksikler.push({ metin: 'Onaylı rücu sebebi kodu yok; kodu avukat seçer (öneriler ekranı).', kritik: false, alan: 'RUCU_SEBEBI' })
  }
  if (g.dosya.rucuSebebi?.trim()) {
    olgular.push(hamOlgu({ metin: `Müvekkilin rücu nedeni (ham kayıt): ${g.dosya.rucuSebebi.trim()}`, kaynakTuru: 'KAYIT', kaynakEtiketi: 'Dosya kaydı', kayitRef: { tablo: 'RucuDosyasi', id: g.dosya.id } }))
  }

  // Arabuluculuk son tutanağı
  const arb = g.arabuluculuk
  if (arb && (arb.sonTutanakTarihi || arb.sonuc)) {
    olgular.push(hamOlgu({
      metin: `Arabuluculuk son tutanağı: ${arb.sonTutanakTarihi ? tarihTR(arb.sonTutanakTarihi) : 'tarih kayıtlı değil'}; sonuç ${arb.sonuc ? ARB_SONUC_ADI[arb.sonuc] ?? arb.sonuc : 'kayıtlı değil'}${arb.tur ? ` (${arb.tur === 'DAVA_SARTI' ? 'dava şartı' : arb.tur === 'IHTIYARI' ? 'ihtiyari' : 'türü belirsiz'})` : ''}`,
      kaynakTuru: 'KAYIT', kaynakEtiketi: 'Arabuluculuk kaydı', ...k('SON_TUTANAK'),
      kayitRef: { tablo: 'Arabuluculuk', id: arb.id }, belgeId: arb.sonTutanakBelgeId, belgeAdi: belgeAdi(g, arb.sonTutanakBelgeId),
    }))
  }

  // İcra künyesi
  if (g.dosya.icraDairesi || g.dosya.icraDosyaNo) {
    olgular.push(hamOlgu({
      metin: `İcra dosyası: ${[g.dosya.icraDairesi, g.dosya.icraDosyaNo].filter(Boolean).join(' ')}${(tt?.takipTarihi ?? g.dosya.takipTarihi) ? `; takip tarihi ${tarihTR(tt?.takipTarihi ?? g.dosya.takipTarihi)}` : ''}`,
      kaynakTuru: 'KAYIT', kaynakEtiketi: 'Dosya kaydı', kayitRef: { tablo: 'RucuDosyasi', id: g.dosya.id },
    }))
  }

  // Mahkeme ve esas (dava açıldıktan sonraki dilekçeler)
  const mh = mahkemeAdi(g.dava), es = esasNo(g.dava)
  if (mh || es) {
    olgular.push(hamOlgu({
      metin: `Mahkeme ve esas: ${[mh, es].filter(Boolean).join(' ')}`, kaynakTuru: 'KAYIT', kaynakEtiketi: 'Dava kaydı', ...k('MAHKEME_ESAS'),
      kayitRef: g.dava ? { tablo: 'Dava', id: g.dava.id } : null,
    }))
  }

  // Onaylı alan değerleri (alıntısı bulunamamış olan karta giremez)
  for (const a of g.alanlar) {
    if (a.alan === 'rucuSebebiKod') continue
    const metin = `${alanEtiketi(a.alan)}: ${a.deger}`
    if (a.alintiDogru === false) {
      kaynaksizlar.push({ metin, belgeId: a.kaynakBelgeId, belgeAdi: belgeAdi(g, a.kaynakBelgeId), sayfa: a.sayfa, alinti: a.alinti, neden: 'Onaylı alanın alıntısı belgede bulunamamış.' })
      continue
    }
    olgular.push(hamOlgu({
      metin, kaynakTuru: 'ALAN', kaynakEtiketi: 'Onaylı alan', alanlar: [a.alan.startsWith('odeme') ? 'ODEME' : 'DIGER'],
      kayitRef: { tablo: 'AlanDegeri', id: a.id }, belgeId: a.kaynakBelgeId, belgeAdi: belgeAdi(g, a.kaynakBelgeId), sayfa: a.sayfa,
      alinti: a.alinti, alintiDogru: a.alintiDogru, onayli: true, onaylayanId: a.onaylayanId, onayAt: a.onayAt,
    }))
  }
  return { olgular, eksikler, kaynaksizlar }
}

// ───────────────────────── EK listesi ─────────────────────────

const EK_SIRASI: [RegExp, number][] = [
  [/SON_TUTANAK/, 0], [/TAKIP_TALEBI/, 1], [/ODEME_EMRI/, 2], [/TEBLIG/, 3], [/ITIRAZ/, 4], [/POLICE/, 5],
  [/TUTANAK|KTT/, 6], [/EKSPERTIZ/, 7], [/DEKONT/, 8], [/FATURA/, 9],
]
function ekSirasi(b: KartGirdisi['belgeler'][number], sonTutanakBelgeId: string | null): number {
  if (b.id === sonTutanakBelgeId) return -1
  const anahtar = `${b.altTur ?? ''} ${b.kategori ?? ''}`
  for (const [r, s] of EK_SIRASI) if (r.test(anahtar)) return s
  return 50
}

/** EK listesi: belgelerden; son tutanak ilk sırada (06 §7.3). Fotoğraflar ve (dava dilekçesinde) mahkeme evrakı hariç. */
export function ekListesi(g: KartGirdisi, tur: KartTuru): KartEk[] {
  const sonTutanak = g.arabuluculuk?.sonTutanakBelgeId ?? null
  return g.belgeler
    .filter((b) => b.kategori !== 'HASAR_FOTO' && !(tur === 'DAVA' && /^DAVA_/.test(b.altTur ?? '')))
    .map((b) => ({ b, s: ekSirasi(b, sonTutanak) }))
    .sort((x, y) => x.s - y.s || (x.b.tarih ?? '').localeCompare(y.b.tarih ?? '') || x.b.ad.localeCompare(y.b.ad, 'tr'))
    .map(({ b }, i) => ({ belgeId: b.id, ad: b.ad, altTur: b.altTur, sira: i + 1 }))
}

// ───────────────────────── yapay zekâ olguları ─────────────────────────

export type AiOlgu = { metin: string; belgeId: string | null; sayfa: number | null; alinti: string; alanlar: string[] }
export type AiCiktisi = {
  olgular: AiOlgu[]
  /** `olguSiralari`: AI olgu listesindeki 1 tabanlı sıra. */
  celiskiler: { aciklama: string; olguSiralari: number[] }[]
  savunmalar: AiSavunma[]
}

const JETON = /\[(?:TCKN|VKN|TEL|IBAN|EPOSTA|PLAKA|KİŞİ|ADRES|BORCLU)-\d+\]/u

/** AI olgularını alıntı doğrulamasından geçirir. Alıntısı bulunamayan, açılmamış jeton taşıyan olgu kaynaksızdır. */
export function aiOlgulariniDogrula(
  ai: readonly AiOlgu[],
  belgeler: ReadonlyMap<string, BelgeMetni>,
  tur: KartTuru,
): { kabul: { sira: number; olgu: HamOlgu }[]; kaynaksiz: KaynaksizOlgu[] } {
  const alt = KRITIK_ALT_KUME[tur]
  const kabul: { sira: number; olgu: HamOlgu }[] = []
  const kaynaksiz: KaynaksizOlgu[] = []
  const gorulen = new Set<string>()
  ai.forEach((o, i) => {
    const metin = o.metin.trim().replace(/\s+/g, ' ').slice(0, 600)
    const belge = o.belgeId ? belgeler.get(o.belgeId) : undefined
    const ks = (neden: string) => kaynaksiz.push({ metin, belgeId: o.belgeId, belgeAdi: belge?.ad ?? null, sayfa: o.sayfa, alinti: o.alinti || null, neden })
    if (!metin) return
    if (JETON.test(metin) || JETON.test(o.alinti ?? '')) return ks('Yapay zekâ yanıtında açılamayan kişisel veri jetonu var.')
    const r = alintiBul(o.alinti, belge, o.sayfa)
    if (!r.bulundu) return ks(r.neden)
    const anahtar = `${metin.toLocaleLowerCase('tr')}|${o.belgeId}`
    if (gorulen.has(anahtar)) return
    gorulen.add(anahtar)
    const alanlar = o.alanlar.filter((a) => (OLGU_ALANLARI as readonly string[]).includes(a))
    const kritikAlan = alanlar.map((a) => AI_KRITIK_ESLEME[a]).find(Boolean) ?? null
    kabul.push({
      sira: i + 1,
      olgu: hamOlgu({
        metin, kaynakTuru: 'AI', kaynakEtiketi: `${belge!.ad}${r.sayfa != null ? ` s.${r.sayfa}` : ''}`, alanlar: alanlar.length ? alanlar : ['DIGER'],
        kritikAlan, kritik: !!kritikAlan && alt.includes(kritikAlan),
        belgeId: o.belgeId, belgeAdi: belge!.ad, sayfa: r.sayfa, alinti: o.alinti.trim(), alintiDogru: true,
      }),
    })
  })
  return { kabul, kaynaksiz }
}

// ───────────────────────── kartı kur ─────────────────────────

export const bosSecimler = (): KartSecimler => ({
  mahkeme: null, usul: null, esas: null, davalilar: [], talepler: [], arabuluculukGerekmez: false, arabuluculukGerekce: null,
  not: null, kaydedenId: null, kayitAt: null,
})

const esitOlgu = (a: Pick<KartOlgu, 'kaynakTuru' | 'metin' | 'belgeId' | 'sayfa'>, b: Pick<KartOlgu, 'kaynakTuru' | 'metin' | 'belgeId' | 'sayfa'>) =>
  a.kaynakTuru === b.kaynakTuru && a.metin === b.metin && a.belgeId === b.belgeId && a.sayfa === b.sayfa

export type KartKurGirdisi = {
  tur: KartTuru
  girdi: KartGirdisi
  belgeMetinleri: ReadonlyMap<string, BelgeMetni>
  ai?: { cikti: AiCiktisi | null; durum: KartIcerik['ai']['durum']; model: string | null; uyari: string | null }
  baglam?: { okunamayan: string[]; kisaltilan: string[]; aiyaGitmeyen: string[] }
  /** Önceki sürüm: aynı olguların onayı, savunma işaretleri ve avukat seçimleri taşınır. */
  onceki?: KartIcerik | null
}

export function kartIcerigiKur(p: KartKurGirdisi): KartIcerik {
  const { tur, girdi } = p
  const kayit = kayitOlgulari(girdi, tur)
  const ai = p.ai?.cikti ? aiOlgulariniDogrula(p.ai.cikti.olgular, p.belgeMetinleri, tur) : { kabul: [], kaynaksiz: [] }

  // Sıra: kritik kayıt olguları (küme sırasıyla), diğer kayıt ve alan olguları, yapay zekâ olguları
  const kumeSira = (o: HamOlgu) => (o.kritikAlan ? KRITIK_ALT_KUME[tur].indexOf(o.kritikAlan) : 99)
  const kayitSirali = [...kayit.olgular].map((o, i) => ({ o, i })).sort((a, b) => {
    const ka = a.o.kritik ? kumeSira(a.o) : 100, kb = b.o.kritik ? kumeSira(b.o) : 100
    return ka - kb || a.i - b.i
  }).map((x) => x.o)
  const hepsi: HamOlgu[] = [...kayitSirali, ...ai.kabul.map((x) => x.olgu)]
  const tasinanKaynaksiz: KaynaksizOlgu[] = []

  if (p.onceki) {
    // (1) Avukatın düzeltmeleri kaybolmasın: aynı kaynaktaki (belge + alıntı) olgunun metni düzeltilmiş hâliyle kalır;
    //     yeni çıkarımda karşılığı yoksa alıntısı yeniden doğrulanarak eklenir, bulunamazsa kaynaksız düşer.
    const kullanildi = new Set<number>()
    for (const d of p.onceki.olgular.filter((x) => x.duzeltildi && x.kaynakTuru === 'AI')) {
      const i = hepsi.findIndex((o, j) => !kullanildi.has(j) && o.kaynakTuru === 'AI' && o.belgeId === d.belgeId && o.alinti === d.alinti)
      if (i >= 0) {
        kullanildi.add(i)
        hepsi[i] = { ...hepsi[i], metin: d.metin, duzeltildi: true, onayli: d.onayli, onaylayanId: d.onaylayanId, onayAt: d.onayAt }
        continue
      }
      const r = alintiBul(d.alinti, d.belgeId ? p.belgeMetinleri.get(d.belgeId) : undefined, d.sayfa)
      if (r.bulundu) { const { id: _id, ...ham } = d; hepsi.push({ ...ham, sayfa: r.sayfa }) }
      else tasinanKaynaksiz.push({ metin: d.metin, belgeId: d.belgeId, belgeAdi: d.belgeAdi, sayfa: d.sayfa, alinti: d.alinti, neden: `Önceki sürümde düzeltilen olgunun alıntısı artık bulunamadı: ${r.neden}` })
    }
    // (2) Aynı olguların onayı taşınır
    for (let i = 0; i < hepsi.length; i++) {
      const o = hepsi[i]
      const e = p.onceki.olgular.find((x) => esitOlgu(x, o) && x.onayli)
      if (e && !o.onayli) hepsi[i] = { ...o, onayli: true, onaylayanId: e.onaylayanId, onayAt: e.onayAt }
    }
  }
  const olgular: KartOlgu[] = hepsi.map((o, i) => ({ id: `O-${i + 1}`, ...o }))

  const aiIdleri = new Map(ai.kabul.map((x, j) => [x.sira, `O-${kayitSirali.length + j + 1}`]))
  const celiskiler = [
    ...(p.ai?.cikti?.celiskiler ?? []).map((c) => ({
      aciklama: c.aciklama.trim().slice(0, 400), olguIdleri: c.olguSiralari.map((s) => aiIdleri.get(s)).filter((x): x is string => !!x),
    })).filter((c) => c.aciklama),
    ...kodCeliskileri(girdi, olgular),
  ]

  const savunmaSonucu = tur === 'CEVABA_CEVAP' && p.ai?.cikti ? savunmaMatrisiKur(p.ai.cikti.savunmalar, p.belgeMetinleri) : { satirlar: [], kaynaksiz: [] }
  const savunmalar = p.onceki ? isaretleriTasi(savunmaSonucu.satirlar, p.onceki.savunmalar) : savunmaSonucu.satirlar

  const adaylar = davaliAdaylari(girdi)
  const itirazEdenler = adaylar.filter((a) => a.itirazVar === true).map((a) => a.borcluId)
  const oneriTalepler: TalepKodu[] = tur === 'DAVA' && itirazEdenler.length ? ['ITIRAZIN_IPTALI', 'TAKIBIN_DEVAMI', 'YARGILAMA_GIDERI'] : []
  const usul = girdi.dava?.usul === 'YAZILI' || girdi.dava?.usul === 'BASIT' ? girdi.dava.usul : null

  const b = p.baglam ?? { okunamayan: [], kisaltilan: [], aiyaGitmeyen: [] }
  const eksikler: KartEksik[] = [...kayit.eksikler]
  if (b.okunamayan.length) eksikler.push({ metin: `${b.okunamayan.length} belge okunamadı, önce okutun: ${b.okunamayan.join(', ')}`, kritik: false, alan: null })
  for (const ad of b.kisaltilan) eksikler.push({ metin: `Uzun belgenin bir kısmı yapay zekâya gönderilemedi: ${ad}`, kritik: false, alan: null })
  if (tur === 'CEVABA_CEVAP' && usul === 'BASIT') eksikler.push({ metin: 'Basit yargılamada cevaba cevap verilmez (HMK 317, teyit gerekli); beyan dilekçesi düşünün.', kritik: true, alan: null })

  const onceSecim = p.onceki?.secimler
  const secimler: KartSecimler = onceSecim
    ? { ...onceSecim, davalilar: onceSecim.davalilar.filter((id) => adaylar.some((a) => a.borcluId === id)) }
    : bosSecimler()

  return {
    tur,
    olgular,
    kaynaksizlar: [...kayit.kaynaksizlar, ...ai.kaynaksiz, ...tasinanKaynaksiz, ...savunmaSonucu.kaynaksiz],
    secimler,
    oneriler: { mahkeme: mahkemeAdi(girdi.dava), usul, esas: esasNo(girdi.dava), davalilar: itirazEdenler, talepler: oneriTalepler },
    davaliAdaylari: adaylar,
    ekler: ekListesi(girdi, tur),
    eksikler,
    celiskiler,
    savunmalar,
    dayanaklar: girdi.dayanaklar
      .filter((d) => !girdi.dosya.rucuSebebiKod || d.rucuSebebiKodlari.includes(girdi.dosya.rucuSebebiKod))
      .map((d) => ({ kaynakId: d.id, kunye: d.kunye })),
    davaTuru: girdi.dava?.tur ?? null,
    ai: { durum: p.ai?.durum ?? 'YOK', model: p.ai?.model ?? null, uyari: p.ai?.uyari ?? null },
    okunamayanBelgeler: b.okunamayan,
    kisaltilanBelgeler: b.kisaltilan,
    aiyaGitmeyenBelgeler: b.aiyaGitmeyen,
  }
}

/** Kayıtlar arasındaki bilinen çelişkiler (ör. takip talebindeki asıl alacak ↔ onaylı alan). */
export function kodCeliskileri(g: KartGirdisi, olgular: readonly KartOlgu[]): { aciklama: string; olguIdleri: string[] }[] {
  const out: { aciklama: string; olguIdleri: string[] }[] = []
  const tt = g.takipTalebi
  const asil = g.alanlar.find((a) => a.alan === 'asilAlacak')
  if (tt && asil) {
    const k1 = kurus(tt.asilAlacak), k2 = kurus(String(asil.deger).replace(/[^\d.]/g, ''))
    if (k1 != null && k2 != null && k1 !== k2) {
      const ids = olgular.filter((o) => (o.kayitRef?.tablo === 'TakipTalebi' && o.kritikAlan === 'TUTAR') || o.kayitRef?.id === asil.id).map((o) => o.id)
      out.push({ aciklama: `Takip talebindeki asıl alacak (${tl(k1)}) onaylı alan değeriyle (${tl(k2)}) aynı değil.`, olguIdleri: ids })
    }
  }
  const dd = davaDegeriOnerisi(g)
  if (dd && tt) {
    const tavan = kurus(tt.toplam) ?? ((kurus(tt.asilAlacak) ?? 0) + (kurus(tt.islemisFaiz) ?? 0))
    if (dd.kurus > tavan) {
      out.push({ aciklama: `Dava değeri (${tl(dd.kurus)}) takip talebindeki toplamı (${tl(tavan)}) aşıyor; takip sonrası faiz eklenmiş olabilir (B04).`, olguIdleri: olgular.filter((o) => o.kritikAlan === 'TUTAR').map((o) => o.id) })
    }
  }
  return out
}

// ───────────────────────── kapılar ─────────────────────────

export function kilitKontrolu(icerik: KartIcerik): { kilitlenebilir: boolean; nedenler: string[] } {
  const nedenler: string[] = []
  const alt = KRITIK_ALT_KUME[icerik.tur]
  const s = icerik.secimler
  for (const e of icerik.eksikler) if (e.kritik) nedenler.push(e.metin)
  for (const alan of alt) {
    if (alan === 'SON_TUTANAK' && s.arabuluculukGerekmez) {
      if (!s.arabuluculukGerekce?.trim()) nedenler.push('Arabuluculuğun dava şartı olmadığı seçildi; gerekçe yazılmalı.')
      continue
    }
    if (!icerik.olgular.some((o) => o.kritikAlan === alan && o.kritik)) nedenler.push(`Kritik olgu eksik: ${KRITIK_ALAN_ADI[alan]}.`)
  }
  const onaysiz = icerik.olgular.filter((o) => o.kritik && !o.onayli)
  if (onaysiz.length) nedenler.push(`Onay bekleyen kritik olgu: ${onaysiz.map((o) => o.id).join(', ')}.`)
  if (icerik.tur === 'DAVA') {
    if (!s.davalilar.length) nedenler.push('Davalı seçilmedi.')
    if (!s.talepler.length) nedenler.push('Talep seçilmedi.')
    // B08: itirazın iptalinde davalılar yalnız itiraz eden borçlulardan
    if (!icerik.davaTuru || icerik.davaTuru === 'ITIRAZIN_IPTALI') {
      for (const id of s.davalilar) {
        const a = icerik.davaliAdaylari.find((x) => x.borcluId === id)
        if (!a) nedenler.push('Seçilen davalı aday listesinde yok.')
        else if (a.itirazVar !== true) nedenler.push(`Seçilen davalının itiraz kaydı yok: ${a.ad} (B08).`)
      }
    }
  }
  if (icerik.tur === 'CEVABA_CEVAP') {
    const bos = icerik.savunmalar.filter((x) => !x.isaret)
    if (bos.length) nedenler.push(`İşaretlenmemiş savunma: ${bos.map((x) => x.id).join(', ')}.`)
  }
  return { kilitlenebilir: nedenler.length === 0, nedenler: [...new Set(nedenler)] }
}

/** Aşama 2 (dilekçe taslağı) kapısı: kart kilitli (ONAYLI) olmalı ve kilit koşulları hâlâ sağlanmalı. */
export function asama2Kapisi(kart: { durum: string; icerik: KartIcerik } | null): { acik: boolean; nedenler: string[] } {
  if (!kart) return { acik: false, nedenler: ['Dosya kartı hazırlanmadı.'] }
  const k = kilitKontrolu(kart.icerik)
  const nedenler = [...(kart.durum === 'ONAYLI' ? [] : ['Kart kilitlenmedi; önce "Kart doğru – kilitle".']), ...k.nedenler]
  return { acik: nedenler.length === 0, nedenler }
}

// ───────────────────────── dönüşümler (avukat eylemleri) ─────────────────────────

type Kim = { kullaniciId: string; at: string }

export function olgulariOnayla(icerik: KartIcerik, ids: readonly string[], kim: Kim): { ok: true; icerik: KartIcerik } | { ok: false; error: string } {
  const bilinmeyen = ids.filter((id) => !icerik.olgular.some((o) => o.id === id))
  if (bilinmeyen.length) return { ok: false, error: `Kartta olmayan olgu: ${bilinmeyen.join(', ')}` }
  return {
    ok: true,
    icerik: { ...icerik, olgular: icerik.olgular.map((o) => (ids.includes(o.id) ? { ...o, onayli: true, onaylayanId: kim.kullaniciId, onayAt: kim.at } : o)) },
  }
}

export type OlguDuzeltme = { metin: string; kaynak?: { belgeId: string; sayfa: number | null; alinti: string } }

/**
 * Olguyu düzeltir. Kayıt kaynaklı olgu kartta düzeltilmez (tek doğruluk kaynağı: ilgili kayıt düzeltilir).
 * Yeni kaynak verilirse alıntısı `belgeMetinleri`nde bulunmalıdır; bulunamazsa düzeltme reddedilir.
 * Avukatın düzeltmesi onay sayılır; yardımcının düzeltmesi olguyu onaysız bırakır.
 */
export function olguDuzelt(
  icerik: KartIcerik,
  id: string,
  d: OlguDuzeltme,
  belgeMetinleri: ReadonlyMap<string, BelgeMetni>,
  kim: Kim & { avukat: boolean },
): { ok: true; icerik: KartIcerik } | { ok: false; error: string } {
  const o = icerik.olgular.find((x) => x.id === id)
  if (!o) return { ok: false, error: 'Olgu kartta bulunamadı.' }
  if (o.kaynakTuru === 'KAYIT') return { ok: false, error: 'Bu olgu programın kaydından gelir; kartta düzeltilmez. İlgili kaydı düzeltip kartı yeniden hazırlayın.' }
  if (o.kaynakTuru === 'ALAN') return { ok: false, error: 'Bu olgu onaylı alan değerinden gelir; kartta düzeltilmez. Değeri öneriler ekranında düzeltip kartı yeniden hazırlayın.' }
  const metin = d.metin.trim().replace(/\s+/g, ' ')
  if (metin.length < 3 || metin.length > 600) return { ok: false, error: 'Olgu metni 3–600 karakter olmalı.' }
  let kaynak: Pick<KartOlgu, 'belgeId' | 'belgeAdi' | 'sayfa' | 'alinti' | 'alintiDogru' | 'kaynakEtiketi'> = o
  if (d.kaynak) {
    const belge = belgeMetinleri.get(d.kaynak.belgeId)
    const r = alintiBul(d.kaynak.alinti, belge, d.kaynak.sayfa)
    if (!r.bulundu) return { ok: false, error: `${r.neden} Kaynaksız olgu karta giremez.` }
    kaynak = { belgeId: d.kaynak.belgeId, belgeAdi: belge!.ad, sayfa: r.sayfa, alinti: d.kaynak.alinti.trim(), alintiDogru: true, kaynakEtiketi: `${belge!.ad}${r.sayfa != null ? ` s.${r.sayfa}` : ''}` }
  }
  const yeni: KartOlgu = {
    ...o, ...kaynak, metin, duzeltildi: true,
    onayli: kim.avukat, onaylayanId: kim.avukat ? kim.kullaniciId : null, onayAt: kim.avukat ? kim.at : null,
  }
  return { ok: true, icerik: { ...icerik, olgular: icerik.olgular.map((x) => (x.id === id ? yeni : x)) } }
}

export type SecimGirdisi = Omit<KartSecimler, 'kaydedenId' | 'kayitAt'>

export function secimleriUygula(icerik: KartIcerik, s: SecimGirdisi, kim: Kim): { ok: true; icerik: KartIcerik } | { ok: false; error: string } {
  const yabanci = s.davalilar.filter((id) => !icerik.davaliAdaylari.some((a) => a.borcluId === id))
  if (yabanci.length) return { ok: false, error: 'Seçilen davalı bu dosyanın aday listesinde yok.' }
  if (s.talepler.some((t) => !(TALEP_KODLARI as readonly string[]).includes(t))) return { ok: false, error: 'Tanınmayan talep.' }
  const secimler: KartSecimler = {
    mahkeme: s.mahkeme?.trim() || null, usul: s.usul, esas: s.esas?.trim() || null,
    davalilar: [...new Set(s.davalilar)], talepler: [...new Set(s.talepler)],
    arabuluculukGerekmez: s.arabuluculukGerekmez, arabuluculukGerekce: s.arabuluculukGerekce?.trim() || null,
    not: s.not?.trim() || null, kaydedenId: kim.kullaniciId, kayitAt: kim.at,
  }
  return { ok: true, icerik: { ...icerik, secimler } }
}

/** İnkâr tazminatı seçiminde gösterilir: likit alacağı destekleyen kaynaklı olgu sayısı. */
export const likiditeOlguSayisi = (icerik: KartIcerik) => icerik.olgular.filter((o) => o.alanlar.includes('LIKIDITE')).length
