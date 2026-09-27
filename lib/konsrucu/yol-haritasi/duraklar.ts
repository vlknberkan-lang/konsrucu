/**
 * KonsRücü — Dosya Yol Haritası · duraklar ve eksen özeti · lib/konsrucu/yol-haritasi/duraklar.ts (saf; client-safe)
 *
 * Ekranın "YOL HARİTASI" bölümü (06 §2 iskelet): sekiz durak, her biri tek satırlık özet. Yalnız "şimdi" olan durak
 * açık gelir; bitmiş duraklar tek satırdır; gerekmeyen duraklar gri ve "gerekmedi" yazılıdır (takip kesinleşince
 * 5–7, arabuluculukta anlaşma olunca 6–7, idari yolda 3–5).
 *
 * Künye eksenleri: kayıtlı eksen (S15 önbelleği) varsa o, kaynağıyla ("avukat onaylı" / "UYAP, teyitsiz");
 * yoksa ya da provadaysa olgulardan kaba bir TAHMİN — "tahmin, teyit edin" etiketiyle. Tahmin riski azaltan
 * yöne asla gitmez: kesinleşme teyitsizse "Kesinleşti" yazılmaz.
 */
import type { DurakNo, Gercekler, SiradakiAdimSonuc } from './tipler'
import {
  anaDava, davaAcildi, esasNoVar, gecerliYolSecimi, idariYolda, itirazOnayli, itirazSinyali, kapandi, kesinlesmeTeyitli,
  mevcutDurak, takipVar, tebligTarihi, tevziVar,
} from './olgular'
import { borcluEtiketi, tarihKisa, tutarMetni } from './yardimci'

export const DURAK_ADI: Record<DurakNo, string> = {
  1: 'Evrak', 2: 'Hazırlık', 3: 'Takip', 4: 'Tebliğ ve itiraz', 5: 'Arabuluculuk', 6: 'Dava açılışı', 7: 'Yargılama', 8: 'Sonuç ve tahsil',
}

export type DurakDurumu = 'TAMAM' | 'SIMDI' | 'DEVAM' | 'SIRADA' | 'GEREKMEDI'

export interface DurakGorunum {
  no: DurakNo
  ad: string
  durum: DurakDurumu
  /** Tek satırlık özet (kişisel veri yok). */
  ozet: string
  /** Özette dikkat isteyen madde (ör. "İtirazın size tebliği: girilmedi"). */
  uyari: string | null
}

function gerekmeyenler(g: Gercekler): Set<DurakNo> {
  const s = new Set<DurakNo>()
  if (idariYolda(g)) { s.add(3); s.add(4); s.add(5) }
  if (kesinlesmeTeyitli(g) && !itirazSinyali(g)) { s.add(5); s.add(6); s.add(7) }
  if (g.arabuluculuk?.sonuc === 'ANLASMA') { s.add(6); s.add(7) }
  const yol = gecerliYolSecimi(g, 'ITIRAZ_SONRASI')?.secim
  if (yol === 'TAKIBI_BIRAK') { s.add(5); s.add(6); s.add(7) }
  if (yol === 'IIK68_KALDIRMA' || yol === 'GENEL_ALACAK') s.add(5)
  return s
}

function ozet(g: Gercekler, no: DurakNo): { ozet: string; uyari: string | null } {
  switch (no) {
    case 1: {
      const n = g.belgeler.length
      if (!n) return { ozet: 'Henüz evrak yok.', uyari: null }
      const okunan = g.belgeler.filter((b) => b.metinDurumu && !['BEKLIYOR', 'OKUNAMADI'].includes(b.metinDurumu)).length
      const okunamayan = g.belgeler.filter((b) => b.metinDurumu === 'OKUNAMADI').length
      const bekleyen = g.belgeler.filter((b) => b.metinDurumu === 'BEKLIYOR').length
      return {
        ozet: `${n} belge · ${okunan} okundu${bekleyen ? ` · ${bekleyen} okunuyor` : ''}`,
        uyari: okunamayan ? `${okunamayan} okunamadı` : null,
      }
    }
    case 2: {
      const tt = g.takipTalebi
      if (tt?.onaylayanId || g.dosya.eskiOnay) return { ozet: `Avukat onayı${g.dosya.eskiOnay?.at ? ` ${tarihKisa(g.dosya.eskiOnay.at)}` : ''}${tt?.asilAlacak ? ` · asıl alacak ${tutarMetni(tt.asilAlacak)}` : ''}`, uyari: null }
      const bekleyen = g.alanlar.filter((a) => a.durum === 'ONERI').length
      return { ozet: bekleyen ? `${bekleyen} bilgi onay bekliyor` : 'Hazırlık sürüyor', uyari: null }
    }
    case 3: {
      if (esasNoVar(g)) return { ozet: `${g.dosya.icraDairesi ?? 'İcra dairesi'} ${g.dosya.icraDosyaNo}${g.dosya.uyapSenkronAt ? ` · son çekme ${tarihKisa(g.dosya.uyapSenkronAt)}` : ' · UYAP\'tan çekilmedi'}`, uyari: null }
      if (tevziVar(g)) return { ozet: `Tevzi edildi${g.dosya.tevzi?.birim ? `: ${g.dosya.tevzi.birim}` : ''}; esas no bekleniyor`, uyari: null }
      return { ozet: 'Takip açılmadı', uyari: null }
    }
    case 4: {
      if (!g.borclular.length) return { ozet: 'Borçlu kaydı yok', uyari: null }
      const parca = g.borclular.map((b) => {
        const t = b.takip
        const teb = tebligTarihi(b)
        const bits = [borcluEtiketi(b.sira)]
        if (t?.tebligSonucu === 'IADE') bits.push('tebliğ edilemedi')
        else if (teb) bits.push(`tebliğ ${tarihKisa(teb)}`)
        else bits.push('tebliğ yok')
        if (itirazOnayli(g, b)) bits.push(`${t?.itirazTipi === 'KISMI' ? 'kısmi' : t?.itirazTipi === 'TAM' ? 'tam' : ''} itiraz`.trim())
        return bits.join(': ')
      })
      const eksikTeblig = g.borclular.some((b) => itirazOnayli(g, b) && !b.takip?.itirazAlacakliyaTebligTarihi)
      return { ozet: parca.join(' · '), uyari: eksikTeblig && !davaAcildi(anaDava(g)) ? 'İtirazın size tebliği: girilmedi' : null }
    }
    case 5: {
      const a = g.arabuluculuk
      const y = gecerliYolSecimi(g, 'ITIRAZ_SONRASI')
      if (!a) return { ozet: y ? `Yol seçildi: ${y.secim === 'ARABULUCULUK_IIK67' ? 'arabuluculuk + itirazın iptali' : y.secim.toLocaleLowerCase('tr-TR').replace(/_/g, ' ')}` : 'Başlamadı', uyari: null }
      const bits: string[] = []
      if (a.basvuruTarihi) bits.push(`başvuru ${tarihKisa(a.basvuruTarihi)}`)
      if (a.sonTutanakTarihi) bits.push(`son tutanak ${tarihKisa(a.sonTutanakTarihi)}`)
      if (a.sonuc) bits.push(a.sonuc.toLocaleLowerCase('tr-TR').replace(/_/g, ' '))
      return { ozet: bits.length ? bits.join(' · ') : 'Kayıt açıldı', uyari: a.sonuc && !a.sonTutanakBelgeId ? 'Son tutanak belgesi yok' : null }
    }
    case 6: {
      const d = anaDava(g)
      if (!d) return { ozet: 'Dava yok', uyari: null }
      if (davaAcildi(d)) return { ozet: `Açılış ${tarihKisa(d.acilisTarihi)}${d.mahkemeTuru ? ` · ${d.mahkemeTuru.toLocaleLowerCase('tr-TR').replace(/_/g, ' ')}` : ''}`, uyari: null }
      return { ozet: 'Ön kontrol sürüyor', uyari: null }
    }
    case 7: {
      const d = anaDava(g)
      if (!davaAcildi(d)) return { ozet: 'Başlamadı', uyari: null }
      const bits: string[] = [d!.durum === 'DERDEST' ? 'Derdest' : d!.durum.toLocaleLowerCase('tr-TR').replace(/_/g, ' ')]
      if (d!.onIncelemeTarihi) bits.push(`ön inceleme ${tarihKisa(d!.onIncelemeTarihi)}`)
      if (d!.sonrakiDurusma) bits.push(`sonraki duruşma ${tarihKisa(d!.sonrakiDurusma)}`)
      return { ozet: bits.join(' · '), uyari: !d!.usul ? 'Usul seçilmedi' : null }
    }
    case 8: {
      const d = anaDava(g)
      const bits: string[] = []
      if (d?.kararTarihi) bits.push(`karar ${tarihKisa(d.kararTarihi)}${d.hukum ? ` · ${d.hukum.toLocaleLowerCase('tr-TR').replace(/_/g, ' ')}` : ''}${d.kararOnayAt ? '' : ' (onaysız)'}`)
      if (g.dosya.uyapTahsilat) bits.push(`UYAP yatan para ${tutarMetni(g.dosya.uyapTahsilat)}`)
      if (kapandi(g)) bits.push(`kapandı: ${String(g.dosya.kapanisSebebi).toLocaleLowerCase('tr-TR').replace(/_/g, ' ')}`)
      return { ozet: bits.length ? bits.join(' · ') : 'Başlamadı', uyari: null }
    }
  }
}

/** Sekiz durağın durumu ve özeti. `sonuc` verilirse Şimdi adımının durağı "SIMDI" olur. */
export function durakDurumlari(g: Gercekler, sonuc?: SiradakiAdimSonuc | null): DurakGorunum[] {
  const mevcut = mevcutDurak(g)
  const simdiDurak = (sonuc?.simdi?.durak ?? sonuc?.bekleme?.durak ?? null) as DurakNo | null
  const gerekmedi = gerekmeyenler(g)
  const l: DurakGorunum[] = []
  for (const no of [1, 2, 3, 4, 5, 6, 7, 8] as DurakNo[]) {
    let durum: DurakDurumu
    if (simdiDurak === no) durum = 'SIMDI'
    else if (no === mevcut) durum = simdiDurak == null ? 'SIMDI' : 'DEVAM'
    else if (no < mevcut) durum = gerekmedi.has(no) ? 'GEREKMEDI' : 'TAMAM'
    else durum = gerekmedi.has(no) ? 'GEREKMEDI' : 'SIRADA'
    const o = ozet(g, no)
    l.push({ no, ad: DURAK_ADI[no], durum, ozet: durum === 'GEREKMEDI' ? 'Gerekmedi' : o.ozet, uyari: durum === 'GEREKMEDI' ? null : o.uyari })
  }
  return l
}

// ─────────────────────────── eksenler (künye) ───────────────────────────

export type EksenKaynagi = 'AVUKAT_ONAYLI' | 'UYAP_TEYITSIZ' | 'TAHMIN'

export interface EksenGorunum {
  eksen: 'ICRA' | 'ARB' | 'DAVA'
  deger: string
  etiket: string
  kaynak: EksenKaynagi
  /** Ekranda rozetin yanında yazan kaynak metni. */
  kaynakMetni: string
}

const ICRA_ETIKET: Record<string, string> = {
  TAKIP_YOK: 'Takip yok', IDARI_YOL: 'İdari yol', TEVZI: 'Tevzi edildi', TEBLIG_BEKLENIYOR: 'Tebliğ bekleniyor', ITIRAZ_SURESI: 'İtiraz süresinde',
  DURDU_ITIRAZ: 'Durdu - itiraz', KISMEN_DURDU: 'Kısmen durdu', KESINLESTI: 'Kesinleşti', INFAZ: 'İnfaz', TAHSIL: 'Tahsil', KAPALI: 'Kapalı',
  BILINMIYOR: 'Bilinmiyor', KESINLESME_TEYIDI: 'Kesinleşme teyidi bekleniyor',
}
const ARB_ETIKET: Record<string, string> = { YOK: 'Yok', HAZIRLIK: 'Hazırlık', DEVAM: 'Sürüyor', SON_TUTANAK_ANLASMA: 'Son tutanak - anlaşma', SON_TUTANAK_DIGER: 'Son tutanak' }
const DAVA_ETIKET: Record<string, string> = {
  YOK: 'Yok', HAZIRLIK: 'Hazırlık', DERDEST: 'Derdest', ISLEMDEN_KALDIRILDI: 'İşlemden kaldırıldı', KARAR: 'Karar', KANUN_YOLU: 'Kanun yolu', KESINLESTI: 'Kesinleşti',
}

const KAYNAK_METNI: Record<EksenKaynagi, string> = { AVUKAT_ONAYLI: 'avukat onaylı', UYAP_TEYITSIZ: 'UYAP, teyitsiz', TAHMIN: 'tahmin, teyit edin' }

function icraTahmin(g: Gercekler): { deger: string; kaynak: EksenKaynagi } {
  if (idariYolda(g)) return { deger: 'IDARI_YOL', kaynak: 'AVUKAT_ONAYLI' }
  if (!takipVar(g)) return { deger: 'TAKIP_YOK', kaynak: 'TAHMIN' }
  if (!esasNoVar(g) && tevziVar(g)) return { deger: 'TEVZI', kaynak: 'TAHMIN' }
  const itirazcilar = g.borclular.filter((b) => itirazOnayli(g, b))
  if (itirazcilar.length) return { deger: itirazcilar.length < g.borclular.length ? 'KISMEN_DURDU' : 'DURDU_ITIRAZ', kaynak: 'AVUKAT_ONAYLI' }
  if (itirazSinyali(g)) return { deger: 'DURDU_ITIRAZ', kaynak: 'UYAP_TEYITSIZ' }
  if (kesinlesmeTeyitli(g)) return { deger: 'KESINLESTI', kaynak: 'AVUKAT_ONAYLI' }
  if (g.borclular.some((b) => tebligTarihi(b))) return { deger: 'ITIRAZ_SURESI', kaynak: 'TAHMIN' }
  return { deger: 'TEBLIG_BEKLENIYOR', kaynak: 'TAHMIN' }
}

function arbTahmin(g: Gercekler): string {
  const a = g.arabuluculuk
  if (!a) return gecerliYolSecimi(g, 'ITIRAZ_SONRASI')?.secim === 'ARABULUCULUK_IIK67' ? 'HAZIRLIK' : 'YOK'
  if (a.sonuc === 'ANLASMA') return 'SON_TUTANAK_ANLASMA'
  if (a.sonuc) return 'SON_TUTANAK_DIGER'
  return a.basvuruTarihi ? 'DEVAM' : 'HAZIRLIK'
}

function davaTahmin(g: Gercekler): string {
  const d = anaDava(g) ?? g.davalar[0] ?? null
  if (!d) return 'YOK'
  if (!davaAcildi(d)) return 'HAZIRLIK'
  if (d.kesinlesmeTarihi) return 'KESINLESTI'
  if (d.kararOnayAt) return 'KARAR'
  return d.durum === 'KARAR' || d.durum === 'KESINLESTI' ? 'DERDEST' : d.durum
}

function kayitliKaynak(teyit: string | null): EksenKaynagi {
  return teyit === 'TEYITLI' ? 'AVUKAT_ONAYLI' : 'UYAP_TEYITSIZ'
}

/** Künyedeki üç eksen rozeti. Provada kayıtlı önbellek kullanılmaz (bugünü yansıtır). */
export function eksenOzeti(g: Gercekler): EksenGorunum[] {
  const prova = !!g.kesimTarihi
  const d = g.dosya
  const icra = !prova && d.icraEksen
    ? { deger: d.icraEksen, kaynak: kayitliKaynak(d.eksenTeyit.icra) }
    : icraTahmin(g)
  const arb = !prova && d.arabEksen ? { deger: d.arabEksen, kaynak: kayitliKaynak(d.eksenTeyit.arab) } : { deger: arbTahmin(g), kaynak: 'TAHMIN' as EksenKaynagi }
  const dava = !prova && d.davaEksen ? { deger: d.davaEksen, kaynak: kayitliKaynak(d.eksenTeyit.dava) } : { deger: davaTahmin(g), kaynak: 'TAHMIN' as EksenKaynagi }
  return [
    { eksen: 'ICRA', deger: icra.deger, etiket: ICRA_ETIKET[icra.deger] ?? icra.deger, kaynak: icra.kaynak, kaynakMetni: KAYNAK_METNI[icra.kaynak] },
    { eksen: 'ARB', deger: arb.deger, etiket: ARB_ETIKET[arb.deger] ?? arb.deger, kaynak: arb.kaynak, kaynakMetni: KAYNAK_METNI[arb.kaynak] },
    { eksen: 'DAVA', deger: dava.deger, etiket: DAVA_ETIKET[dava.deger] ?? dava.deger, kaynak: dava.kaynak, kaynakMetni: KAYNAK_METNI[dava.kaynak] },
  ]
}
