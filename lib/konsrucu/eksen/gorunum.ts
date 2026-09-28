/**
 * KonsRücü — Tebliğ-itiraz paneli ve gölge eksen GÖRÜNÜM MODELLERİ · lib/konsrucu/eksen/gorunum.ts (saf, client-safe)
 *
 * 06 §2(e) ekran taslakları: "UYAP'TAN GELEN GELİŞME · onay bekliyor (aday)" kartı, "4 TEBLİĞ VE İTİRAZ ·
 * borçlu bazında" bloğu ve künyedeki gölge eksen satırı ("Yeni hesap: …"). Bu modül yalnız metin ve rol üretir;
 * bileşenler (components/dosya/olay/*) bunları çizer. DB yok, AI yok.
 *
 * Görsel dil: beş rol (risk / onay / tamam / bilgi / gerekmedi) ve rolün yazıyla da söylenmesi ("ONAYSIZ",
 * "TEYİTSİZ"). Tarih gg.aa.yyyy. Kişisel veri (TCKN, telefon, IBAN) alıntılarda maskeli. Hukuki etiket "teyit gerekli".
 */
import { gunEkle, gunNo, gunTR, isoGun, yilEkle } from './norm'
import { ekranMaskele } from './maske'
import { mazbataBelgesiMi, mazbataOku, type MazbataOkuma } from './mazbata'
import { durumBilgiAdayiMi, onayYokNedeni, onayYolu, type OnayYolu } from './aday-onay'
import { sureOnizle, type SureSatiri } from './sure-onizleme'
import type { EksenSonuc } from './turet'
import {
  ALT_TIP_ETIKET, ARAB_ETIKET, DAVA_ETIKET, EKSEN_KAYNAK_ETIKET, ICRA_ETIKET, ITIRAZ_KAPSAM_ANAHTAR, ITIRAZ_KAPSAM_ETIKET,
  SURE_BASLATAN_ALT_TIPLER, TEBLIG_SEKLI_ETIKET, altTipMi, kuralAyir,
  type AltTip, type IcraEksen, type ItirazKapsam, type ItirazTipi, type TebligSekli,
} from './sabitler'

export type Rol = 'risk' | 'onay' | 'tamam' | 'bilgi' | 'gerekmedi'
export const ROL_ETIKET: Record<Rol, string> = { risk: 'RİSK', onay: 'ONAY BEKLİYOR', tamam: 'ONAYLI', bilgi: 'TEYİTSİZ', gerekmedi: 'GEREKMEDİ' }

// ── Girdiler (yukle.ts DB'den doldurur; testler elle kurar) ─────────────────
export type PanelOlay = {
  id: string
  /** DURUM / TAHSILAT / TEBLIG / ITIRAZ / HACIZ / KESINLESTI / KAPANDI (TakipOlayi.tip) — yalnız durumBilgiAdayiMi süzgeci için. */
  tip?: string | null
  altTip: string | null
  teyit: string | null
  borcluId: string | null
  hukukiTarih: Date | null
  tarih: Date | null
  sonuc: string | null
  tebligSekli: string | null
  muhatap: string | null
  kaynakBelgeId: string | null
  kaynakTuru: string | null
  kural: string | null
  aciklama: string | null
  tutar: number | null
  createdAt: Date
  teyitAt: Date | null
  hamJson: unknown
}
export type PanelBelge = {
  id: string; dosyaAdi: string; belgeTarihi: Date | null; extractedText: string | null
  altTur: string | null; uyapEvrakTuru: string | null; metinYontemi: string | null; metinGuven: number | null
}
export type PanelBorcluTakip = {
  id: string; updatedAt: Date
  tebligTarihi: Date | null; tebligSekli: string | null; tebligSonucu: string | null; uetsUlasmaTarihi: Date | null
  itirazVar: boolean | null; itirazVerilisTarihi: Date | null; itirazUyapTarihi: Date | null; itirazTipi: string | null
  itirazKapsamJson: unknown; itirazEdilenTutar: number | null; itirazAlacakliyaTebligTarihi: Date | null; itirazAlacakliyaTebligKaynak: string | null
}
export type PanelBorclu = { id: string; adUnvan: string; tur: string | null; takip: PanelBorcluTakip | null }

// ── Çıktılar ─────────────────────────────────────────────────────────────────
export type KartOnerisi = {
  altTip: AltTip
  borcluId: string | null
  /** "YYYY-MM-DD" */
  tarih: string | null
  sonuc: 'TEBLIG' | 'IADE' | null
  tebligSekli: TebligSekli | null
  uetsUlasmaTarihi: string | null
}

export type GelismeKartiVM = {
  id: string
  altTip: AltTip
  durum: 'ADAY' | 'TEYITLI' | 'REDDEDILDI'
  yol: OnayYolu
  yokNedeni: string | null
  baslik: string
  kaynak: string
  alinti: string | null
  kural: string
  etki: string | null
  bekleme: string | null
  oneri: KartOnerisi
  uyarilar: string[]
  gecikti: boolean
  oncelik: number
  tutar: number | null
  rol: Rol
}

export type BorcluSatiri = { etiket: string; metin: string; rol: Rol }
export type BorcluBlokVM = {
  borcluId: string
  ad: string
  turEtiket: string | null
  eksen: { deger: IcraEksen; etiket: string; teyit: string; rol: Rol } | null
  satirlar: BorcluSatiri[]
  sureler: SureSatiri[]
  alacakliyaTebligEksik: boolean
  /** İyimser kilit: BorcluTakip.updatedAt (ISO) */
  surum: string | null
  /** TB-07 formu için: itiraz onaylıysa mevcut kapsam (yoksa null; form "Kapsamı gir" / "Düzelt" önceki değerleri gösterir). */
  itiraz: { tipi: ItirazTipi | null; kapsam: ItirazKapsam | null; tutar: number | null; kaseTarihi: string | null } | null
}

export type EksenRozetVM = { eksen: 'İCRA' | 'ARB' | 'DAVA'; deger: string; etiket: string; kaynak: string; teyit: string; rol: Rol; notlar: string[] }
export type GolgeEksenVM = { rozetler: EksenRozetVM[]; eskiDurum: string; celiski: string | null }

export type TbIpucu = { kural: string; metin: string; rol: Rol } | null

export type OlayPaneliVM = {
  dosyaId: string
  borclular: BorcluBlokVM[]
  bekleyen: GelismeKartiVM[]
  islenen: GelismeKartiVM[]
  icraOzet: EksenRozetVM | null
  ipucu: TbIpucu
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────
const TUR_ETIKET: Record<string, string> = { GERCEK: 'Gerçek kişi', OZEL_TUZEL: 'Özel hukuk tüzel kişisi', KAMU: 'Kamu idaresi' }
const kisalt = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function borcluAdi(borclular: PanelBorclu[], id: string | null): string | null {
  return id ? borclular.find((b) => b.id === id)?.adUnvan ?? null : null
}

function sekilMetni(s: string | null | undefined): string | null {
  return s && s !== 'BELIRSIZ' && s in TEBLIG_SEKLI_ETIKET ? TEBLIG_SEKLI_ETIKET[s as TebligSekli] : null
}

function hamUyarilar(ham: unknown): string[] {
  const u = ham && typeof ham === 'object' ? (ham as { uyarilar?: unknown }).uyarilar : null
  return Array.isArray(u) ? u.filter((x): x is string => typeof x === 'string') : []
}

/** Aday için en uygun mazbata belgesi: bağlı belge; yoksa (tebliğ ailesinde) ±7 gün içindeki en yakın, başka olaya bağlı olmayan. */
export function kartBelgesi(o: PanelOlay, belgeler: PanelBelge[], bagliBelgeler: ReadonlySet<string>): PanelBelge | null {
  if (o.kaynakBelgeId) return belgeler.find((b) => b.id === o.kaynakBelgeId) ?? null
  const yol = onayYolu(o.altTip)
  if (yol !== 'TEBLIG' && yol !== 'ALACAKLIYA_TEBLIG') return null
  const ref = o.hukukiTarih ?? o.tarih
  if (!ref) return null
  return belgeler
    .filter((b) => !bagliBelgeler.has(b.id) && b.belgeTarihi && mazbataBelgesiMi(b) && Math.abs(gunNo(b.belgeTarihi) - gunNo(ref)) <= 7)
    .sort((a, b) => Math.abs(gunNo(a.belgeTarihi!) - gunNo(ref)) - Math.abs(gunNo(b.belgeTarihi!) - gunNo(ref)))[0] ?? null
}

function baslikKur(altTip: AltTip, o: PanelOlay, ad: string | null, tarih: Date | null, sonuc: string | null, sekil: string | null): string {
  const kime = ad ?? 'borçluya'
  const gun = tarih ? `${gunTR(tarih)} tarihinde ` : ''
  switch (altTip) {
    case 'TEBLIG_SONUCU':
      if (sonuc === 'TEBLIG') return `Ödeme emri ${kime} ${gun}${sekilMetni(sekil) ? `${sekilMetni(sekil)} ile ` : ''}tebliğ edildi.`
      return `UYAP'ta tebliğ kaydı var${tarih ? ` (${gunTR(tarih)})` : ''}: sonucu ve tarihi mazbatadan kontrol edin.`
    case 'TEBLIG_IADE':
      return `Tebligat ${ad ? `${ad} için ` : ''}tebliğ edilemedi (İADE)${tarih ? `, ${gunTR(tarih)}` : ''}.`
    case 'ITIRAZ':
      return `${ad ?? 'Borçlu'} ödeme emrine itiraz etti${tarih ? ` (UYAP kaydı ${gunTR(tarih)})` : ''}.`
    case 'DURDURMA_ITIRAZ':
      return 'UYAP takibi itiraz nedeniyle durdurulmuş gösteriyor; itiraz tarihi bilinmiyor.'
    case 'ITIRAZIN_ALACAKLIYA_TEBLIGI':
      return `İtiraz size (alacaklı vekili) ${tarih ? `${gunTR(tarih)} tarihinde ` : ''}tebliğ edildi.`
    case 'KESINLESME_SERHI':
      return `UYAP'ta kesinleşme kaydı görünüyor${tarih ? ` (${gunTR(tarih)})` : ''}.`
    case 'TAHSILAT_BORCLUDAN':
      return o.aciklama ?? 'UYAP "Yatan Para" arttı.'
    default:
      return `${ALT_TIP_ETIKET[altTip]}${o.aciklama ? `: ${kisalt(ekranMaskele(o.aciklama), 140)}` : ''}`
  }
}

function etkiKur(altTip: AltTip, sonuc: string | null, tarih: Date | null): string | null {
  switch (altTip) {
    case 'TEBLIG_SONUCU':
      return sonuc === 'TEBLIG' && tarih ? `İİK 62 önerilen son gün ${gunTR(gunEkle(tarih, 7))} açılır (teyit gerekli).` : 'Tebliğ onaylanınca İİK 62 süresi önerilir (teyit gerekli).'
    case 'TEBLIG_IADE':
      return 'Süre başlamaz; yeni adres ya da TK 21/35 kararı gerekir (teyit gerekli).'
    case 'ITIRAZ':
    case 'DURDURMA_ITIRAZ':
      return 'Takip bu borçlu için durur; İİK 67 süresi önerilir (teyit gerekli).'
    case 'ITIRAZIN_ALACAKLIYA_TEBLIGI':
      return tarih ? `İİK 67 önerilen son gün ${gunTR(yilEkle(tarih, 1))} (teyit gerekli).` : 'İİK 67 süresi bu tebliğden işler (teyit gerekli).'
    case 'KESINLESME_SERHI':
      return 'Onaylanırsa İCRA ekseni "Kesinleşti" olur. Riski azaltan karardır; yalnız avukat verir.'
    case 'TAHSILAT_BORCLUDAN':
      return 'Para panelinde onaylanınca tahsil edilen tutara eklenir.'
    default:
      return null
  }
}

function beklemeKur(altTip: AltTip): string | null {
  if (altTip === 'TEBLIG_SONUCU') return 'Onaylanana kadar eksen "Tebliğ bekleniyor · tebliğ sinyali (teyitsiz)".'
  if (altTip === 'ITIRAZ' || altTip === 'DURDURMA_ITIRAZ') return 'Onaylanana kadar eksen "Durdu - itiraz (UYAP, teyitsiz)".'
  if (altTip === 'KESINLESME_SERHI') return 'Onaylanana kadar takip kesinleşmiş sayılmaz.'
  if (altTip === 'TEBLIG_IADE') return 'Onaylanana kadar İADE yalnız sinyaldir; süre açılmaz.'
  return null
}

function kaynakKur(o: PanelOlay, belge: PanelBelge | null): string {
  if (belge) return `${belge.dosyaAdi}${belge.belgeTarihi ? ` · ${gunTR(belge.belgeTarihi)}` : ''}${belge.metinYontemi === 'OCR' ? ' · OCR' : ''}`
  if (o.kaynakTuru === 'ELLE') return 'Elle girildi'
  if (o.kaynakTuru === 'UYAP_YAPISAL') return o.altTip === 'TAHSILAT_BORCLUDAN' ? 'UYAP hesap özeti (Yatan Para)' : 'UYAP durum metni'
  return `UYAP evrak listesi${o.aciklama ? `: "${kisalt(ekranMaskele(o.aciklama), 120)}"` : ''}`
}

/** Tek aday → kart görünümü. */
export function gelismeKarti(o: PanelOlay, p: { borclular: PanelBorclu[]; belgeler: PanelBelge[]; bagliBelgeler: ReadonlySet<string>; bugun: Date }): GelismeKartiVM {
  const altTip: AltTip = altTipMi(o.altTip) ? o.altTip : 'DIGER'
  const belge = kartBelgesi(o, p.belgeler, p.bagliBelgeler)
  const okuma: MazbataOkuma | null = belge ? mazbataOku(belge.extractedText, p.borclular, belge.metinYontemi === 'OCR' ? belge.metinGuven : null) : null
  // Öneri: onaylanmış değer > mazbata okuması > aday alanları
  const tebligYolu = onayYolu(altTip) === 'TEBLIG'
  const sonuc = (o.teyit !== 'ADAY' ? o.sonuc : tebligYolu && okuma && okuma.sonuc !== 'BELIRSIZ' ? okuma.sonuc : o.sonuc) as string | null
  const tarih = o.teyit !== 'ADAY' ? o.hukukiTarih : (okuma?.tarih ?? o.hukukiTarih ?? (altTip === 'DURDURMA_ITIRAZ' ? null : o.tarih))
  const sekil = (o.teyit === 'ADAY' && okuma && okuma.sekil !== 'BELIRSIZ' ? okuma.sekil : o.tebligSekli) as TebligSekli | null
  const tekBorclu = p.borclular.length === 1 ? p.borclular[0].id : null
  const borcluId = o.borcluId ?? okuma?.borcluId ?? tekBorclu
  const kartAltTip: AltTip = altTip === 'TEBLIG_SONUCU' && (o.muhatap === 'ALACAKLI_VEKILI' || okuma?.muhatap === 'ALACAKLI_VEKILI') ? 'ITIRAZIN_ALACAKLIYA_TEBLIGI'
    : tebligYolu && sonuc === 'IADE' ? 'TEBLIG_IADE' : altTip
  const yol = onayYolu(kartAltTip)
  const uyarilar = [...(okuma?.uyarilar ?? []), ...hamUyarilar(o.hamJson)]
  if (o.teyit === 'ADAY' && (kartAltTip === 'ITIRAZ') && o.hukukiTarih) uyarilar.push('Tarih UYAP kayıt tarihidir; kalem kaşesi tarihini dilekçeden girin.')
  if (o.teyit === 'ADAY' && kartAltTip === 'DURDURMA_ITIRAZ') uyarilar.push('İtiraz dilekçesi inmediyse "UYAP\'tan çek" ile öncelikli çekin (TB-06).')
  const yas = gunNo(p.bugun) - gunNo(o.createdAt)
  const durum = (o.teyit === 'TEYITLI' || o.teyit === 'REDDEDILDI' ? o.teyit : 'ADAY') as GelismeKartiVM['durum']
  return {
    id: o.id, altTip: kartAltTip, durum, yol, yokNedeni: onayYokNedeni(kartAltTip),
    baslik: baslikKur(kartAltTip, o, borcluAdi(p.borclular, borcluId), tarih, sonuc, sekil),
    kaynak: kaynakKur(o, belge),
    alinti: okuma?.alinti ?? null,
    kural: [o.kural, okuma && o.kural !== okuma.kural ? okuma.kural : null].filter(Boolean).map((k) => { const x = kuralAyir(k); return x.surum != null ? `${x.kod} (sürüm ${x.surum})` : x.kod }).join(' · ') || '—',
    etki: etkiKur(kartAltTip, sonuc, tarih),
    bekleme: durum === 'ADAY' ? beklemeKur(kartAltTip) : null,
    oneri: {
      altTip: kartAltTip, borcluId, tarih: isoGun(tarih), sonuc: sonuc === 'TEBLIG' || sonuc === 'IADE' ? sonuc : null,
      tebligSekli: sekil, uetsUlasmaTarihi: isoGun(okuma?.uetsUlasma ?? null),
    },
    uyarilar: [...new Set(uyarilar)],
    gecikti: durum === 'ADAY' && yas > 3,
    oncelik: SURE_BASLATAN_ALT_TIPLER.includes(kartAltTip) ? 2 : 3,
    tutar: o.tutar,
    rol: durum === 'TEYITLI' ? 'tamam' : durum === 'REDDEDILDI' ? 'gerekmedi' : yas > 3 ? 'risk' : 'onay',
  }
}

function kapsamMetni(k: unknown): string | null {
  if (!k || typeof k !== 'object') return null
  const secili = ITIRAZ_KAPSAM_ANAHTAR.filter((a) => (k as ItirazKapsam)[a])
  return secili.length ? secili.map((a) => ITIRAZ_KAPSAM_ETIKET[a]).join(', ') : null
}

const tl = (n: number) => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} TL`

/** Borçlu bloğu: tebliğ, itiraz, itirazın size tebliği ve süre önizlemeleri. */
export function borcluBloku(b: PanelBorclu, p: { olaylar: PanelOlay[]; eksen: EksenSonuc | null; bugun: Date }): BorcluBlokVM {
  const bt = b.takip
  const aday = p.olaylar.filter((o) => o.teyit === 'ADAY' && (o.borcluId === b.id || !o.borcluId))
  const satirlar: BorcluSatiri[] = []

  if (bt?.tebligSonucu === 'TEBLIG' && bt.tebligTarihi) {
    const s = sekilMetni(bt.tebligSekli)
    const ulasma = bt.tebligSekli === 'UETS' && bt.uetsUlasmaTarihi ? `; ulaşma ${gunTR(bt.uetsUlasmaTarihi)} + 5 gün` : ''
    satirlar.push({ etiket: 'Ödeme emri tebliği', metin: `${gunTR(bt.tebligTarihi)}${s ? ` (${s}${ulasma})` : ''}`, rol: 'tamam' })
  } else if (bt?.tebligSonucu === 'IADE') {
    satirlar.push({ etiket: 'Ödeme emri tebliği', metin: 'Tebliğ edilemedi (İADE): yeni adres ya da TK 21/35 kararı (teyit gerekli)', rol: 'risk' })
  } else if (aday.some((o) => o.altTip === 'TEBLIG_SONUCU' || o.altTip === 'TEBLIG_IADE')) {
    satirlar.push({ etiket: 'Ödeme emri tebliği', metin: 'UYAP\'ta tebliğ sinyali var: kartı onaylayın', rol: 'onay' })
  } else {
    satirlar.push({ etiket: 'Ödeme emri tebliği', metin: 'Tebliğ bekleniyor', rol: 'bilgi' })
  }

  let alacakliyaTebligEksik = false
  if (bt?.itirazVar === true) {
    const tip = bt.itirazTipi === 'KISMI' ? 'kısmi' : bt.itirazTipi === 'TAM' ? 'tam' : 'kapsam girilmedi'
    const kapsam = kapsamMetni(bt.itirazKapsamJson)
    const parca = [
      `${tip}${kapsam ? ` (${kapsam})` : ''}`,
      bt.itirazTipi === 'KISMI' && bt.itirazEdilenTutar != null ? `itiraz edilen ${tl(bt.itirazEdilenTutar)}` : null,
      bt.itirazVerilisTarihi ? `kaşe ${gunTR(bt.itirazVerilisTarihi)}` : 'kaşe tarihi girilmedi',
      bt.itirazUyapTarihi ? `UYAP kaydı ${gunTR(bt.itirazUyapTarihi)}` : null,
    ].filter(Boolean)
    satirlar.push({ etiket: 'İtiraz', metin: parca.join(' · '), rol: bt.itirazTipi ? 'tamam' : 'onay' })
    if (bt.itirazAlacakliyaTebligTarihi) {
      satirlar.push({ etiket: 'İtirazın size tebliği', metin: `${gunTR(bt.itirazAlacakliyaTebligTarihi)} (${bt.itirazAlacakliyaTebligKaynak === 'ELLE' ? 'elle girildi' : 'UETS mazbatası'})`, rol: 'tamam' })
    } else {
      alacakliyaTebligEksik = true
      satirlar.push({ etiket: 'İtirazın size tebliği', metin: 'Girilmedi: UETS\'teki tarihi girin (İİK 67 başlangıcı)', rol: 'risk' })
    }
  } else if (bt?.itirazVar === false) {
    satirlar.push({ etiket: 'İtiraz', metin: 'İtiraz yok (avukat kaydı)', rol: 'tamam' })
  } else if (aday.some((o) => o.altTip === 'ITIRAZ' || o.altTip === 'DURDURMA_ITIRAZ')) {
    satirlar.push({ etiket: 'İtiraz', metin: 'UYAP itiraz sinyali: kartı onaylayın', rol: 'onay' })
  } else {
    satirlar.push({ etiket: 'İtiraz', metin: 'İtiraz sinyali yok', rol: 'gerekmedi' })
  }

  const be = p.eksen?.borclular.find((x) => x.borcluId === b.id)
  const itiraz = bt?.itirazVar === true ? {
    tipi: bt.itirazTipi === 'TAM' || bt.itirazTipi === 'KISMI' ? (bt.itirazTipi as ItirazTipi) : null,
    kapsam: bt.itirazKapsamJson && typeof bt.itirazKapsamJson === 'object' ? (bt.itirazKapsamJson as ItirazKapsam) : null,
    tutar: bt.itirazEdilenTutar,
    kaseTarihi: isoGun(bt.itirazVerilisTarihi),
  } : null
  return {
    borcluId: b.id, ad: b.adUnvan, turEtiket: b.tur ? TUR_ETIKET[b.tur] ?? null : null,
    eksen: be ? { deger: be.deger, etiket: ICRA_ETIKET[be.deger], teyit: be.teyit === 'TEYITLI' ? 'onaylı' : EKSEN_KAYNAK_ETIKET[be.kaynak], rol: eksenRol(be.deger, be.teyit) } : null,
    satirlar,
    sureler: sureOnizle({
      tebligTarihi: bt?.tebligTarihi ?? null, tebligSonucu: bt?.tebligSonucu ?? null, itirazVar: bt?.itirazVar ?? null,
      itirazVerilisTarihi: bt?.itirazVerilisTarihi ?? null, itirazUyapTarihi: bt?.itirazUyapTarihi ?? null,
      itirazAlacakliyaTebligTarihi: bt?.itirazAlacakliyaTebligTarihi ?? null,
      itirazAdayVar: aday.some((o) => o.altTip === 'ITIRAZ' || o.altTip === 'DURDURMA_ITIRAZ'),
    }, p.bugun),
    alacakliyaTebligEksik,
    surum: bt ? bt.updatedAt.toISOString() : null,
    itiraz,
  }
}

function eksenRol(deger: string, teyit: string): Rol {
  if (deger === 'BILINMIYOR') return 'risk'
  if (deger === 'YOK' || deger === 'TAKIP_YOK') return 'gerekmedi'
  return teyit === 'TEYITLI' ? 'tamam' : 'bilgi'
}

/** Eski durumun doğal olarak karşılık geldiği icra ekseni değerleri (GN-01 çelişki ipucu). */
const ESKI_DURUM_ICRA: Record<string, readonly string[]> = {
  HAVUZDA: ['TAKIP_YOK'], INCELENIYOR: ['TAKIP_YOK'], TAKIBE_HAZIR: ['TAKIP_YOK', 'TEVZI'], IDARI_YOL: ['IDARI_YOL', 'TAKIP_YOK'],
  TAKIP_ACILDI: ['TEBLIG_BEKLENIYOR', 'TEVZI', 'ITIRAZ_SURESI'], TEBLIG_EDILDI: ['ITIRAZ_SURESI', 'TEBLIG_BEKLENIYOR'],
  ITIRAZ: ['DURDU_ITIRAZ', 'KISMEN_DURDU'], ARABULUCULUK: ['DURDU_ITIRAZ', 'KISMEN_DURDU'], DAVA: ['DURDU_ITIRAZ', 'KISMEN_DURDU'],
  KESINLESTI: ['KESINLESTI', 'INFAZ'], INFAZ: ['INFAZ', 'KESINLESTI'], TAHSIL: ['TAHSIL'], KAPANDI: ['KAPALI', 'TAHSIL'],
}

export function golgeEksen(s: EksenSonuc, eskiDurum: string): GolgeEksenVM {
  const rozet = (eksen: EksenRozetVM['eksen'], deger: string, etiket: string, e: EksenSonuc['icra'] | EksenSonuc['arab'] | EksenSonuc['dava']): EksenRozetVM => ({
    eksen, deger, etiket, kaynak: e.teyit === 'TEYITLI' ? EKSEN_KAYNAK_ETIKET.AVUKAT : EKSEN_KAYNAK_ETIKET[e.kaynak], teyit: e.teyit, rol: eksenRol(deger, e.teyit), notlar: e.notlar,
  })
  const beklenen = ESKI_DURUM_ICRA[eskiDurum]
  const celiski = s.icra.deger !== 'BILINMIYOR' && beklenen && !beklenen.includes(s.icra.deger)
    ? `Eski durum (${eskiDurum}) ile yeni hesap (${ICRA_ETIKET[s.icra.deger]}) farklı: UYAP'tan teyit edin.`
    : null
  return {
    rozetler: [
      rozet('İCRA', s.icra.deger, ICRA_ETIKET[s.icra.deger], s.icra),
      rozet('ARB', s.arab.deger, ARAB_ETIKET[s.arab.deger], s.arab),
      rozet('DAVA', s.dava.deger, DAVA_ETIKET[s.dava.deger], s.dava),
    ],
    eskiDurum, celiski,
  }
}

/**
 * Tebliğ-itiraz durağının sıradaki adımı (06 §8.3 TB kuralları; S20 yönlendirme motoru için ipucu).
 * Öncelik: süre başlatan aday (TB-01) → İADE kararı (TB-05) → itirazın size tebliği yok (TB-08) → kapsam (TB-07)
 * → diğer adaylar (TB-02). Kural motoru S20'dedir; bu yalnız panel başlığındaki cümledir.
 */
export function tbIpucu(bloklar: BorcluBlokVM[], bekleyen: GelismeKartiVM[]): TbIpucu {
  const sureBaslatan = bekleyen.filter((k) => k.oncelik === 2 && k.yol !== 'YOK')
  if (sureBaslatan.length) {
    const k = sureBaslatan[0]
    const metin = k.yol === 'TEBLIG' ? 'Tebliğ tarihini onaylayın; İİK 62 buna bağlı' : k.yol === 'ITIRAZ' ? 'İtirazı onaylayın; takip bu borçlu için durur' : 'İtirazın size tebliğ tarihini onaylayın (İİK 67 başlangıcı)'
    return { kural: 'TB-01', metin, rol: 'onay' }
  }
  if (bloklar.some((b) => b.satirlar.some((s) => s.etiket === 'Ödeme emri tebliği' && s.rol === 'risk'))) {
    return { kural: 'TB-05', metin: 'Tebliğ edilemedi: yeni adres ya da TK 21/35 kararı verin (teyit gerekli)', rol: 'risk' }
  }
  if (bloklar.some((b) => b.alacakliyaTebligEksik)) return { kural: 'TB-08', metin: 'İtirazın size tebliğ tarihini girin (İİK 67 başlangıcı)', rol: 'risk' }
  if (bloklar.some((b) => b.satirlar.some((s) => s.etiket === 'İtiraz' && s.rol === 'onay' && s.metin.startsWith('kapsam girilmedi')))) {
    return { kural: 'TB-07', metin: 'İtiraz kapsamını onaylayın (tam mı, kısmi mi)', rol: 'onay' }
  }
  const diger = bekleyen.filter((k) => k.yol !== 'YOK')
  if (diger.length) return { kural: 'TB-02', metin: `UYAP'tan gelen ${diger.length} gelişmeyi gözden geçirin`, rol: 'onay' }
  return null
}

/** Paneli kurar: borçlu blokları, bekleyen ve işlenmiş kartlar, icra özeti ve TB ipucu. */
export function olayPaneli(p: {
  dosyaId: string; borclular: PanelBorclu[]; olaylar: PanelOlay[]; belgeler: PanelBelge[]; eksen: EksenSonuc | null; bugun: Date
}): OlayPaneliVM {
  const adaylar = p.olaylar.filter((o) => o.teyit === 'ADAY' || o.teyit === 'TEYITLI' || o.teyit === 'REDDEDILDI')
  const bagli = new Set(adaylar.map((o) => o.kaynakBelgeId).filter((x): x is string => !!x))
  const kart = (o: PanelOlay) => gelismeKarti(o, { borclular: p.borclular, belgeler: p.belgeler, bagliBelgeler: bagli, bugun: p.bugun })
  // Hiçbir hukuki olgu taşımayan DURUM adayı (yalnız TAHSILAT_SINYALI — bkz. aday-onay.ts durumBilgiAdayiMi)
  // onay bekleyen karta ÇIKMAZ (06 karar 2). Kendi onay yolu olan (ör. DURDURMA_ITIRAZ, TEBLIG_IADE) ya da
  // GENEL yollu ama hukuken önemli olabilecek (ör. MUVEKKIL_ALACAGINA_HACIZ) adaylar ETKİLENMEZ. Satır silinmez,
  // yazılmaya devam eder — yalnız bu listeden hariç tutulur.
  const bekleyen = adaylar.filter((o) => o.teyit === 'ADAY' && !durumBilgiAdayiMi(o)).map(kart)
    .sort((a, b) => a.oncelik - b.oncelik || Number(b.gecikti) - Number(a.gecikti))
  const islenen = adaylar.filter((o) => o.teyit !== 'ADAY')
    .sort((a, b) => (b.teyitAt?.getTime() ?? b.createdAt.getTime()) - (a.teyitAt?.getTime() ?? a.createdAt.getTime()))
    .slice(0, 12).map(kart)
  const borclular = p.borclular.map((b) => borcluBloku(b, { olaylar: p.olaylar, eksen: p.eksen, bugun: p.bugun }))
  const icra = p.eksen ? golgeEksen(p.eksen, '').rozetler[0] : null
  return { dosyaId: p.dosyaId, borclular, bekleyen, islenen, icraOzet: icra, ipucu: tbIpucu(borclular, bekleyen) }
}
