/**
 * KonsRücü — Dosya Yol Haritası · KURAL TABLOSU · lib/konsrucu/yol-haritasi/kurallar.ts (saf; client-safe)
 *
 * 06-ana-senaryo-tasarimi.md §8.3'ün satır satır karşılığı: her satır bir `Kural` — kod, sürüm, durak,
 * "Durum / koşul" (kosulMetni + saf `degerlendir`), "Öneri" (oneriMetni + üretilen metin), birincil eylem,
 * rol, öncelik (§8.2 merdiveni), engel, hukuki etiket, kanıt.
 *
 * İlkeler:
 *   - Kural otomatik değişmez; "Bu öneri yanlış" bildirimi test vakasına dönüşür, düzeltme yeni SÜRÜMLE gelir.
 *   - Yapay zekâ hiçbir kuralı tetiklemez (M4). AI önerisi (ör. `yol = IDARI`) yalnız "onayla" adımı doğurur.
 *   - Madde atıfları taslaktır: her birinde "teyit gerekli" yazar. Motor hiçbir süreyi kesinleştirmez; yalnız
 *     `Sure` kayıtlarındaki önerilen/onaylanan günleri okur. İİK 62 penceresinin tebliğ + 7 gün yedeği yalnız
 *     "UYAP'ta teyit edin" kartını tetikler (güvenli yön), hiçbir kayda yazılmaz.
 *   - Riski azaltan hiçbir sonuç (kesinleşme, kapanış, tahsil) kuraldan çıkmaz; kurallar yalnız sorar.
 *   - Kişisel veri yok: borçlular "1. borçlu" diye anılır.
 */
import type { BirincilEylem, DurakNo, GBorclu, GDava, GSure, Gercekler, Kanit, Kural, KuralRol, Oncelik, SenaryoAdimi } from './tipler'
import {
  acikSure, anaDava, arabBittiAnlasmaDisi, bekleyenAlanlar, celisenAlanlar, davaAcildi, dekontToplami, esasNoVar, etkinSonGun,
  gecerliYolSecimi, hazirlikOnayli, idariYolda, itirazOnayli, itirazSinyali, itirazTarihi, kapandi, kesinlesmeTeyitli, kritikAlanMi,
  mevcutDurak, sonGelisme, sureBul, takipVar, tebligBilgisiVar, tebligTarihi, tevziVar, uyapDurumItiraz, uyapKapali, yolOnayKaydi,
} from './olgular'
import { alintiKisa, borcluEtiketi, enErken, gecenGun, gunMetni, istGun, kalan, kisalt, sureAdi, tarihKisa, trNorm, tutarMetni } from './yardimci'
import { durumBilgiAdayiMi } from '@/lib/konsrucu/eksen/aday-onay'
import { halEki } from '@/lib/konsrucu/dilekce-v2/sablon-dil'

// ─────────────────────────── kanıt yardımcıları ───────────────────────────

const OLAY_ADI: Record<string, string> = {
  TEBLIG_SONUCU: 'Ödeme emri tebliğ sonucu',
  TEBLIG_IADE: 'Tebligat iadesi',
  ITIRAZ: 'Borca itiraz',
  DURDURMA_ITIRAZ: 'İtiraz nedeniyle durdurma',
  ITIRAZIN_ALACAKLIYA_TEBLIGI: 'İtirazın alacaklıya tebliği',
  TAHSILAT_BORCLUDAN: 'Tahsilat (UYAP hesap özeti)',
  KESINLESME_SERHI: 'Kesinleşme şerhi',
  DAVA_ACILDI_SINYALI: 'Dava açıldı sinyali',
  ODEME_EMRI_DUZENLENDI: 'Ödeme emri düzenlendi',
  MUVEKKIL_ALACAGINA_HACIZ: 'Müvekkil alacağına haciz',
  IHTIYATI_HACIZ: 'İhtiyati haciz',
  ICRAI_HACIZ: 'İcrai haciz',
}

const ISLEM_ADI: Record<string, string> = {
  TENSIP: 'Tensip zaptı', CEVAP: 'Cevap dilekçesi', CEVABA_CEVAP: 'Cevaba cevap', ARA_KARAR: 'Ara karar',
  BILIRKISI_RAPORU: 'Bilirkişi raporu', KARAR: 'Karar', GEREKCELI_KARAR: 'Gerekçeli karar', ISLEMDEN_KALDIRMA: 'İşlemden kaldırma',
  GOREVSIZLIK: 'Görevsizlik / yetkisizlik kararı', DURUSMA: 'Duruşma', ON_INCELEME: 'Ön inceleme',
}

const ALAN_ADI: Record<string, string> = {
  asilAlacak: 'asıl alacak', rucuTutari: 'rücu tutarı', rucuOrani: 'rücu oranı', rucuSebebiKod: 'rücu sebebi',
  kazaTarihi: 'kaza tarihi', hasarTarihi: 'hasar tarihi', policeNo: 'poliçe no', sigortaliPlaka: 'sigortalı plaka', karsiPlaka: 'karşı plaka',
}

function alanAdi(alan: string): string {
  if (ALAN_ADI[alan]) return ALAN_ADI[alan]
  if (/^odeme/.test(alan)) return /tarih/.test(alan) ? 'ödeme tarihi' : 'ödeme tutarı'
  if (/^borclu/.test(alan)) return 'borçlu bilgisi'
  if (/^kusur/.test(alan)) return 'kusur'
  return alan
}

function belgeKaniti(g: Gercekler, belgeId: string | null | undefined): Kanit | null {
  if (!belgeId) return null
  const b = g.belgeler.find((x) => x.id === belgeId)
  if (!b) return { tur: 'BELGE', id: belgeId, belgeId, etiket: 'Kaynak belge' }
  return { tur: 'BELGE', id: b.id, belgeId: b.id, etiket: b.uyapEvrakTuru ?? b.dosyaAdi, tarih: gunMetni(b.tarih) }
}

function olayKaniti(o: Gercekler['olaylar'][number]): Kanit {
  const kaynak = o.teyit === 'TEYITLI' ? 'onaylı' : o.teyit === 'ADAY' ? 'aday, teyitsiz' : 'eski kayıt'
  return {
    tur: 'OLAY', id: o.id, belgeId: o.kaynakBelgeId,
    etiket: `${OLAY_ADI[o.altTip ?? ''] ?? o.altTip ?? 'UYAP gelişmesi'} (${kaynak}${o.kural ? `, kural ${o.kural}` : ''})`,
    tarih: gunMetni(o.hukukiTarih ?? o.tarih),
  }
}

function sureKaniti(s: GSure): Kanit {
  return {
    tur: 'SURE', id: s.id, belgeId: s.kaynakBelgeId,
    etiket: `${sureAdi(s.tur)} · ${s.dayanak} (teyit gerekli)`,
    tarih: gunMetni(s.tetikTarihi), alinti: alintiKisa(s.kaynakAlinti),
  }
}

function alanKaniti(a: Gercekler['alanlar'][number]): Kanit {
  return {
    tur: 'ALAN', id: a.id, belgeId: a.kaynakBelgeId, sayfa: a.sayfa,
    etiket: `${alanAdi(a.alan)} · kaynak ${a.kaynakTuru}${a.durum === 'ONAYLI' ? ' · onaylı' : ' · öneri'}${a.alintiDogru === false ? ' · kaynaksız' : ''}`,
    alinti: alintiKisa(a.alinti),
  }
}

function borcluKaniti(g: Gercekler, b: GBorclu): Kanit[] {
  const k: Kanit[] = [{ tur: 'BORCLU', id: b.id, etiket: `${borcluEtiketi(b.sira)}${b.tur ? ` (${BORCLU_TUR[b.tur] ?? b.tur})` : ''}` }]
  const t = b.takip
  if (t?.tebligKaynakBelgeId) { const x = belgeKaniti(g, t.tebligKaynakBelgeId); if (x) k.push(x) }
  if (t?.itirazKaynakBelgeId) { const x = belgeKaniti(g, t.itirazKaynakBelgeId); if (x) k.push(x) }
  return k
}

const BORCLU_TUR: Record<string, string> = { GERCEK: 'gerçek kişi', OZEL_TUZEL: 'özel hukuk tüzel kişisi', KAMU: 'kamu idaresi' }

function temiz(k: (Kanit | null | undefined)[]): Kanit[] {
  return k.filter((x): x is Kanit => !!x)
}

/** Müvekkil kısa adı ("Ray Sigorta A.Ş." → "Ray"). */
function muvekkilKisa(g: Gercekler): string {
  const ad = (g.dosya.muvekkilAd ?? '').trim()
  return ad ? ad.split(/\s+/)[0] : 'müvekkil'
}

// ─────────────────────────── ortak koşullar ───────────────────────────

/** GN-02: tutar şüphesi — dekont toplamı ile takip/rücu tutarı arasında ~1000 kat (≥ 200 kat) fark. */
export function tutarSuphesi(g: Gercekler): { tutar: number; dekont: number; oran: number } | null {
  const dekont = dekontToplami(g)
  const tutar = g.takipTalebi?.asilAlacak ?? g.dosya.rucuTutari ?? g.dosya.asilAlacak
  if (!dekont || !tutar || tutar <= 0) return null
  const oran = dekont / tutar
  return oran >= 200 || oran <= 1 / 200 ? { tutar, dekont, oran } : null
}

/** Belge okuması bitti mi (Hazırlık kuralları okuma bitmeden konuşmaz). */
function evrakHazir(g: Gercekler): boolean {
  return g.belgeler.length > 0 && !g.belgeler.some((b) => b.metinDurumu === 'BEKLIYOR')
}

/** Kritik alanlardan onaylı değeri OLMAYANLAR (HZ-02). Bekleyen öneri varsa EV-05 konuşur. */
function onaysizKritikler(g: Gercekler): string[] {
  const onayli = (re: RegExp) => g.alanlar.some((a) => a.durum === 'ONAYLI' && re.test(a.alan))
  const eksik: string[] = []
  if (!onayli(/^(asilAlacak|rucuTutari)$/)) eksik.push('tutar')
  if (!onayli(/^odeme(\[\d+\])?\.tarih$/)) eksik.push('ödeme tarihi')
  return eksik
}

/** Takip hazırlık listesinin eksik maddeleri, listedeki sırayla (06 2(c)). Boşsa liste tamam. */
export function hazirlikEksikleri(g: Gercekler): string[] {
  const e: string[] = []
  if (!g.borclular.length) e.push('borçlu bilgisi')
  else {
    const teyitsiz = g.borclular.filter((b) => !b.teyitli).length
    if (teyitsiz) e.push(`borçlu teyidi (${teyitsiz} borçlu)`)
    const tursuz = g.borclular.filter((b) => !b.tur).length
    if (tursuz) e.push(`borçlu türü (${tursuz} borçlu)`)
  }
  if (!g.dosya.yetkiliIcra?.trim()) e.push('yetkili icra seçimi')
  const tt = g.takipTalebi
  if (!tt?.faizTuru) e.push('faiz türü')
  if (tt?.faizTuru === 'DIGER' && !tt.faizOraniMetni?.trim()) e.push('faiz oranı')
  if (!tt?.faizBaslangicTuru || (tt.faizBaslangicTuru === 'TEK_TARIH' && !tt.faizBaslangic)) e.push('faiz başlangıcı')
  if (!tt?.hesapIziVar) e.push('rücu tutarı hesap izi')
  if (!g.ayar.alacakliUnvanVar || !g.ayar.mersisVar) e.push('müvekkil ayarı (alacaklı unvanı ve MERSİS)')
  if (!g.ayar.vekaletnameVar) e.push('vekâletname')
  return e
}

/** Son kopilot işi durdu mu (TK-02). */
function kopilotDurdu(g: Gercekler) {
  const son = g.senkronIsleri.filter((s) => s.tur === 'KOPILOT').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  return son && ['HATA', 'KISMI', 'ZAMAN_ASIMI'].includes(son.durum) ? son : null
}

/** İİK 62 penceresinin sonu: Sure (onaylanan → ihtiyatlı) ya da yedek olarak tebliğ + 7 gün (yalnız teyit kartı için). */
function iik62Sonu(g: Gercekler, b: GBorclu): { gun: Date; kaynak: 'SURE' | 'YEDEK'; sure: GSure | null } | null {
  const s = sureBul(g, 'IIK62', { borcluId: b.id })
  const sg = s ? etkinSonGun(s) : null
  if (sg) return { gun: sg, kaynak: 'SURE', sure: s }
  const t = tebligTarihi(b)
  return t ? { gun: new Date(t.getTime() + 7 * 86_400_000), kaynak: 'YEDEK', sure: null } : null
}

/** İdareye başvuru tarihi (İYUK kayıtlarından; S06/S24 yazar). */
function idariBasvuruTarihi(g: Gercekler): Date | null {
  const zimni = g.sureler.find((s) => s.tur === 'IYUK_ZIMNI_RET' && s.tetikTarihi)
  if (zimni?.tetikTarihi) return zimni.tetikTarihi
  const b = g.sureler.find((s) => s.tur === 'IYUK13_BASVURU' && s.durum === 'KAPANDI')
  return b?.kapanisAt ?? null
}

function dilekceVar(g: Gercekler, tur: string, f: { davaId?: string; sonra?: Date | null; hazir?: boolean } = {}): boolean {
  return g.dilekceler.some((d) => d.tur === tur
    && (f.davaId === undefined || !d.davaId || d.davaId === f.davaId)
    && (!f.sonra || d.createdAt.getTime() >= f.sonra.getTime())
    && (!f.hazir || ['IMZAYA_HAZIR', 'GONDERILDI_UYAP'].includes(d.sonSurumDurum ?? '') || ['IMZAYA_GIDEN', 'GONDERILDI'].includes(d.durum ?? '')))
}

function islemler(g: Gercekler, d: GDava, tur: string, teyit?: 'TEYITLI' | 'ADAY') {
  return g.davaIslemleri.filter((i) => i.davaId === d.id && i.tur === tur && i.teyit !== 'REDDEDILDI' && (!teyit || i.teyit === teyit))
}

// ─────────────────────────── tablo kurucu ───────────────────────────

type Tanim = Omit<Kural, 'surum' | 'engel' | 'tur' | 'durumu' | 'eylem'> & {
  surum?: number
  engel?: boolean
  tur?: Kural['tur']
  durumu?: Kural['durumu']
  eylem: [string, BirincilEylem['hedef']] | null
}

function kural(t: Tanim): Kural {
  return {
    ...t,
    surum: t.surum ?? 1,
    engel: t.engel ?? t.oncelik === 0,
    tur: t.tur ?? (t.eylem ? 'EYLEM' : 'BEKLEME'),
    durumu: t.durumu ?? 'ETKIN',
    eylem: t.eylem ? { etiket: t.eylem[0], hedef: t.eylem[1] } : null,
  }
}

const S = (...s: SenaryoAdimi[]) => s
const R = (r: KuralRol) => r
const O = (o: Oncelik) => o
const D = (d: DurakNo) => d

// ─────────────────────────── GENEL (her durakta) ───────────────────────────

const GN: Kural[] = [
  kural({
    kod: 'GN-01', grup: 'GN', durak: null, rol: R('A'), oncelik: O(0), senaryo: S('b'),
    kosulMetni: 'Türetilmiş eksen eski durumla ya da UYAP durum metniyle çelişiyor; ya da dosya onarım bekliyor',
    oneriMetni: "Durum teyit gerekiyor: UYAP'ta '…' yazıyor", eylem: ['Durumu teyit et', 'durum-teyit'], hukukiEtiket: null,
    degerlendir(g) {
      const d = g.dosya
      const kanit: Kanit[] = [{ tur: 'DOSYA', id: d.id, etiket: `UYAP durumu: ${d.uyapDurum ?? '—'} · eski durum: ${d.durum}${d.icraEksen ? ` · icra ekseni: ${d.icraEksen}` : ''}` }]
      if (d.onarimDurumu === 'BEKLIYOR' || d.onarimBekleyen > 0) {
        return { metin: 'Durum teyit gerekiyor: dosya veri onarımı bekliyor', neden: `Bu dosyada onaylanmamış ${Math.max(1, d.onarimBekleyen)} onarım satırı var; gösterilen durum güvenilir değil.`, kanit, adet: Math.max(1, d.onarimBekleyen) }
      }
      if (d.icraEksen === 'BILINMIYOR') {
        return { metin: "Durum bilinmiyor, UYAP'ta teyit edin", neden: 'Program bu dosyanın icra durumunu onaylı olgulardan çıkaramadı; tahmin etmiyor.', kanit }
      }
      if (uyapDurumItiraz(g)) {
        const eksenCelisik = d.icraEksen ? !['DURDU_ITIRAZ', 'KISMEN_DURDU'].includes(d.icraEksen) : ['TAKIP_ACILDI', 'TEBLIG_EDILDI', 'KESINLESTI', 'INFAZ', 'TAHSIL'].includes(d.durum)
        if (eksenCelisik) {
          return { metin: `Durum teyit gerekiyor: UYAP'ta '${kisalt(d.uyapDurum, 80)}' yazıyor`, neden: `Programdaki durum (${d.icraEksen ?? d.durum}) UYAP durum metnindeki itirazla çelişiyor.`, kanit }
        }
      }
      if (d.durum === 'KESINLESTI' && d.icraEksen && d.icraEksen !== 'KESINLESTI') {
        return { metin: `Durum teyit gerekiyor: eski kayıtta 'Kesinleşti', yeni hesapta '${d.icraEksen}'`, neden: 'Eski durum alanı kesinleşme gösteriyor ama onaylı bir kesinleşme olgusu yok.', kanit }
      }
      return null
    },
  }),
  kural({
    kod: 'GN-02', grup: 'GN', durak: null, rol: R('A'), oncelik: O(0), senaryo: S('a', 'b'),
    kosulMetni: 'Tutar şüphesi (biçim bayrağı ya da dekontla ~1000 kat oran)',
    oneriMetni: "Tutarı dekont ya da Ray Excel'iyle doğrulayın", eylem: ['Tutarı doğrula', 'tutar-dogrula'], hukukiEtiket: null,
    degerlendir(g) {
      const s = tutarSuphesi(g)
      if (!s) return null
      const kat = s.oran >= 1 ? Math.round(s.oran) : Math.round(1 / s.oran)
      return {
        metin: `Tutarı dekont ya da ${muvekkilKisa(g)} Excel'iyle doğrulayın`,
        neden: `Takip/rücu tutarı ${tutarMetni(s.tutar)}, dekont toplamı ${tutarMetni(s.dekont)}: yaklaşık ${kat} kat fark var (biçim hatası olabilir).`,
        kanit: [{ tur: 'DOSYA', id: g.dosya.id, etiket: `Tutar ${tutarMetni(s.tutar)} · dekont toplamı ${tutarMetni(s.dekont)}` }],
      }
    },
  }),
  kural({
    kod: 'GN-03', grup: 'GN', durak: null, rol: R('H'), oncelik: O(0), senaryo: S('b', 'd'),
    kosulMetni: 'Eşleşme BASKA_DAIRE / BULUNAMADI / COKLU_BELIRSIZ / TARAF_UYUSMAZ',
    oneriMetni: "Daireyi ya da esası kontrol edin (UYAP'ın aday listesiyle)", eylem: ['Düzelt', 'eslesme-duzelt'], hukukiEtiket: null,
    degerlendir(g) {
      const e = g.dosya.uyapEslesme
      const ACIKLAMA: Record<string, string> = {
        BASKA_DAIRE: 'UYAP bu esası başka bir dairede buldu.',
        BULUNAMADI: "UYAP'ta bu daire ve esasla dosya bulunamadı.",
        COKLU_BELIRSIZ: "UYAP'ta birden çok dosya eşleşti; hangisi olduğu belli değil.",
        TARAF_UYUSMAZ: 'Bu UYAP dosyasında alacaklı müvekkil değil (aleyhe dosya olabilir); hiçbir bilgi yazılmadı.',
      }
      if (!e || !ACIKLAMA[e]) return null
      const not = kisalt(g.dosya.uyapEslesmeNot, 140)
      return {
        metin: 'Daireyi ya da esası kontrol edin',
        neden: `${ACIKLAMA[e]}${not ? ` ${not}` : ''}`,
        kanit: [{ tur: 'SENKRON', id: g.dosya.id, etiket: `UYAP eşleşme: ${e}${g.dosya.icraDairesi ? ` · ${g.dosya.icraDairesi}` : ''}${g.dosya.icraDosyaNo ? ` ${g.dosya.icraDosyaNo}` : ''}` }],
      }
    },
  }),
  kural({
    kod: 'GN-04', grup: 'GN', durak: null, rol: R('A+2'), oncelik: O(1), senaryo: S('e', 'i'),
    kosulMetni: 'Onaysız süre; ihtiyatlı son güne ≤ 14 gün ya da geçmiş',
    oneriMetni: 'Son günü onaylayın: [tür], önerilen [tarih]', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'teyit gerekli',
    degerlendir(g, bugun) {
      const l = g.sureler
        .filter((s) => s.durum === 'ACIK' && !s.onaylananSonGun)
        .map((s) => ({ s, gun: s.onerilenIhtiyatli ?? s.onerilenSonGun }))
        .filter((x): x is { s: GSure; gun: Date } => !!x.gun && kalan(x.gun, bugun) <= 14)
        .sort((a, b) => a.gun.getTime() - b.gun.getTime())
      if (!l.length) return null
      const { s, gun } = l[0]
      const n = kalan(gun, bugun)
      return {
        metin: `Son günü onaylayın: ${sureAdi(s.tur)}, önerilen ${tarihKisa(gun)}`,
        neden: `${s.dayanak} (teyit gerekli) için onaylanan son gün yok; ihtiyatlı öneri ${n < 0 ? `${-n} gün önce geçti` : n === 0 ? 'bugün' : `${n} gün sonra`}.`,
        kanit: temiz([sureKaniti(s), belgeKaniti(g, s.kaynakBelgeId)]), sonGun: gun, adet: l.length,
        durak: s.davaId ? 7 : s.arabuluculukId ? 5 : s.tur.startsWith('IYUK') ? 2 : 4,
      }
    },
  }),
  kural({
    kod: 'GN-05', grup: 'GN', durak: null, rol: R('SORUMLU'), oncelik: O(1), senaryo: S('i'),
    kosulMetni: 'Onaylı süreye ≤ 7 gün, kapanış kanıtı yok',
    oneriMetni: '"[İşlem] için son [n] gün"', eylem: ['İşleme git', 'sure-git'], hukukiEtiket: 'teyit gerekli',
    degerlendir(g, bugun) {
      const l = g.sureler
        .filter((s): s is GSure & { onaylananSonGun: Date } => s.durum === 'ACIK' && !!s.onaylananSonGun && !s.kapanisKanitiBelgeId && kalan(s.onaylananSonGun, bugun) <= 7)
        .sort((a, b) => a.onaylananSonGun.getTime() - b.onaylananSonGun.getTime())
      if (!l.length) return null
      const s = l[0]
      const n = kalan(s.onaylananSonGun, bugun)
      const ad = sureAdi(s.tur)
      return {
        metin: n > 0 ? `${ad} için son ${n} gün` : n === 0 ? `${ad} için son gün bugün` : `${ad} son günü ${-n} gün önce geçti: kontrol edin`,
        neden: `Onaylanan son gün ${tarihKisa(s.onaylananSonGun)} (${s.dayanak}, teyit gerekli); kapanış kanıtı yok.`,
        kanit: temiz([sureKaniti(s), belgeKaniti(g, s.kaynakBelgeId)]), sonGun: s.onaylananSonGun, adet: l.length,
        durak: s.davaId ? 7 : s.arabuluculukId ? 5 : 4,
      }
    },
  }),
  kural({
    kod: 'GN-06', grup: 'GN', durak: null, rol: R('H'), oncelik: O(4), senaryo: S('d'), canli: true,
    kosulMetni: 'UYAP işi bekliyor, eklentiden 2 dakikadır nabız yok',
    oneriMetni: "UYAP'ı açın; çekme kendiliğinden başlar", eylem: ["UYAP'ı aç", 'uyap-ac'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      const is = g.senkronIsleri.find((s) => s.durum === 'BEKLIYOR')
      if (!is) return null
      const n = g.nabiz
      const dk = n ? Math.floor((bugun.getTime() - n.sonGorulme.getTime()) / 60_000) : null
      if (n && dk != null && dk < 2 && n.uyapOturum) return null
      return {
        metin: "UYAP'ı açın; çekme kendiliğinden başlar",
        neden: !n ? 'Eklentiden hiç sinyal gelmedi.' : !n.uyapOturum ? 'Eklenti açık ama UYAP oturumu kapalı görünüyor.' : `Eklentiden son sinyal ${dk} dakika önce geldi.`,
        kanit: [{ tur: 'SENKRON', id: is.id, etiket: `Bekleyen UYAP işi (${is.tur})`, tarih: gunMetni(is.createdAt) }],
        durak: 3,
      }
    },
  }),
  kural({
    kod: 'GN-07', grup: 'GN', durak: null, rol: R('H'), oncelik: O(5), senaryo: S('d'),
    kosulMetni: 'Açık dosyada 60 gündür gelişme yok',
    oneriMetni: "Sessiz dosya: UYAP'ı kontrol edin", eylem: ['Şimdi çek', 'uyap-cek'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      if (!esasNoVar(g) || kapandi(g) || g.dosya.durum === 'KAPANDI') return null
      const son = sonGelisme(g, bugun)
      if (!son) return null
      const n = gecenGun(son, bugun)
      if (n < 60) return null
      return { metin: "Sessiz dosya: UYAP'ı kontrol edin", neden: `Son gelişme ${tarihKisa(son)} (${n} gün önce).`, kanit: [{ tur: 'DOSYA', id: g.dosya.id, etiket: 'Son UYAP gelişmesi', tarih: gunMetni(son) }] }
    },
  }),
  kural({
    kod: 'GN-08', grup: 'GN', durak: null, rol: R('-'), oncelik: O(6), senaryo: S('b'), tur: 'BEKLEME',
    kosulMetni: 'Hiçbir kural eşleşmedi',
    oneriMetni: 'Bekleme: "Beklenen: [gelişme] · UYAP [sıklık] kontrol ediliyor"', eylem: null, hukukiEtiket: null,
    degerlendir(g) {
      const durak = mevcutDurak(g)
      const BEKLENEN: Record<DurakNo, string> = {
        1: "Ray'den evrakın gelmesi", 2: 'takip hazırlığının tamamlanması', 3: 'takibin açılması ve esas no',
        4: tebligBilgisiVar(g) ? 'itiraz süresinin dolması ya da yeni UYAP gelişmesi' : 'ödeme emrinin tebliği',
        5: 'arabuluculuk toplantısı ve son tutanak', 6: 'davanın açılması', 7: 'sonraki duruşma ya da ara karar', 8: 'tahsilat ya da kesinleşme',
      }
      const son = g.dosya.uyapSenkronAt
      return {
        metin: `Beklenen: ${BEKLENEN[durak]}`,
        neden: esasNoVar(g)
          ? `UYAP kendiliğinden kontrol ediliyor${son ? `; son kontrol ${tarihKisa(son)}` : ''}. Gelişme gelince onayınıza düşer; yapmanız gereken bir şey yok.`
          : 'Şu an sizden beklenen bir iş yok.',
        kanit: [], durak,
      }
    },
  }),
]

// ─────────────────────────── 1 EVRAK ───────────────────────────

const EV: Kural[] = [
  kural({
    kod: 'EV-01', grup: 'EV', durak: D(1), rol: R('H'), oncelik: O(5), senaryo: S('a'),
    kosulMetni: 'Dosyada evrak yok', oneriMetni: "Ray'den gelen evrakı sürükleyin", eylem: ['Evrak ekle', 'evrak-ekle'], hukukiEtiket: null,
    degerlendir(g) {
      if (g.belgeler.length) return null
      return { metin: `${halEki(muvekkilKisa(g), 'ayrilma')} gelen evrakı sürükleyin`, neden: 'Dosyada henüz evrak yok; fotoğraf, PDF, HEIC ve zip tek hamlede eklenebilir.', kanit: [] }
    },
  }),
  kural({
    kod: 'EV-02', grup: 'EV', durak: D(1), rol: R('-'), oncelik: O(6), senaryo: S('a'), tur: 'BEKLEME',
    kosulMetni: 'Okuma sürüyor', oneriMetni: 'Bekleme: "Okunuyor 14/20"', eylem: null, hukukiEtiket: null,
    degerlendir(g) {
      const bekleyen = g.belgeler.filter((b) => b.metinDurumu === 'BEKLIYOR').length
      if (!bekleyen) return null
      const toplam = g.belgeler.length
      return { metin: `Okunuyor ${toplam - bekleyen}/${toplam}`, neden: 'Evrak sırayla okunuyor; bitince bulduklarımız onayınıza düşer.', kanit: [], adet: bekleyen }
    },
  }),
  kural({
    kod: 'EV-03', grup: 'EV', durak: D(1), rol: R('H'), oncelik: O(4), senaryo: S('a'),
    kosulMetni: 'Kritik türde okunamayan belge var', oneriMetni: '"3 belge okunamadı: yeniden çekin ya da elle girin"', eylem: ['Okunamayanlar', 'okunamayanlar'], hukukiEtiket: null,
    degerlendir(g) {
      const l = g.belgeler.filter((b) => b.metinDurumu === 'OKUNAMADI' && b.kategori !== 'HASAR_FOTO')
      if (!l.length) return null
      return { metin: `${l.length} belge okunamadı: yeniden çekin ya da elle girin`, neden: 'Okunamayan belgeden bilgi çıkarılamaz; telefonun belge tarama moduyla yeniden çekmek çoğu zaman yeter.', kanit: temiz(l.slice(0, 5).map((b) => belgeKaniti(g, b.id))), adet: l.length }
    },
  }),
  kural({
    kod: 'EV-04', grup: 'EV', durak: D(1), rol: R('H'), oncelik: O(4), senaryo: S('a'), durumu: 'VERI_BEKLIYOR',
    veriNotu: 'Asgari evrak seti S19 (lib/evrak/asgari-set.ts, Yelda onaylı). "Bağla" aşaması Gercekler.zorunluEvrak alanını doldurunca etkinleşir.',
    kosulMetni: 'Rücu sebebine göre zorunlu evrak eksik', oneriMetni: '"Eksik: ödeme dekontu"', eylem: ["Ray'e istek taslağı", 'ray-istek'], hukukiEtiket: null,
    degerlendir(g) {
      const e = g.zorunluEvrak?.eksik ?? []
      if (!e.length) return null
      return {
        metin: `Eksik: ${e[0]}${e.length > 1 ? ` (+${e.length - 1})` : ''}`,
        neden: `Rücu sebebinin asgari evrak setinde eksik: ${e.join(', ')}.`, kanit: [], adet: e.length,
        eylem: { etiket: `${muvekkilKisa(g)}'e istek taslağı`, hedef: 'ray-istek' },
      }
    },
  }),
  kural({
    kod: 'EV-05', grup: 'EV', durak: D(1), rol: R('H/A'), oncelik: O(3), senaryo: S('a'),
    kosulMetni: 'Onay bekleyen kritik alan önerisi var', oneriMetni: '"Bulduğumuz 12 bilgiyi kontrol edin (3 kritik)"', eylem: ['Gözden geçir', 'alan-onay'], hukukiEtiket: null,
    degerlendir(g) {
      const l = bekleyenAlanlar(g)
      if (!l.length) return null
      const kritik = l.filter((a) => kritikAlanMi(a.alan)).length
      return {
        metin: `Bulduğumuz ${l.length} bilgiyi kontrol edin${kritik ? ` (${kritik} kritik)` : ''}`,
        neden: `${new Set(l.map((a) => a.kaynakBelgeId).filter(Boolean)).size || 'Bazı'} kaynaktan ${l.length} alan önerildi; ${kritik ? 'kritikler avukat onayı bekliyor' : 'onay bekliyor'}.`,
        kanit: l.slice(0, 5).map(alanKaniti), adet: l.length,
      }
    },
  }),
  kural({
    kod: 'EV-06', grup: 'EV', durak: D(1), rol: R('A'), oncelik: O(3), senaryo: S('a'),
    kosulMetni: 'Kaynaklar çelişiyor (tarih, tutar, plaka)', oneriMetni: '"Çelişkiyi çözün: iki kaynak farklı"', eylem: ['Karşılaştır', 'celiski'], hukukiEtiket: null,
    degerlendir(g) {
      const l = celisenAlanlar(g)
      if (!l.length) return null
      return {
        metin: 'Çelişkiyi çözün: iki kaynak farklı',
        neden: `${l.map(alanAdi).join(', ')} için kaynaklar farklı değer veriyor.`,
        kanit: g.alanlar.filter((a) => l.includes(a.alan)).slice(0, 6).map(alanKaniti), adet: l.length,
      }
    },
  }),
  kural({
    kod: 'EV-07', grup: 'EV', durak: D(1), rol: R('A'), oncelik: O(4), senaryo: S('a'),
    kosulMetni: 'Rücu sebebi kodu yok', oneriMetni: '"Rücu sebebini seçin (öneri: …; GŞ sürümü teyit gerekli)"', eylem: ['Seç', 'rucu-sebebi-sec'], hukukiEtiket: 'GŞ sürümü teyit gerekli',
    degerlendir(g) {
      if (g.dosya.rucuSebebiKod) return null
      const o = g.alanlar.find((a) => a.alan === 'rucuSebebiKod' && a.durum === 'ONERI')
      // evrak okunmadan ve öneri yokken sormaz (önce evrak gelir; 06 2(a))
      if (!o && !evrakHazir(g)) return null
      const oneri = o && typeof o.deger === 'string' ? o.deger : null
      // GŞ (Genel Şartlar) yalnız ZMSS'de vardır; kasko ve oto dışı dosyalarda genel "teyit gerekli" yazılır.
      const teyitMetni = g.dosya.brans === 'ZMMS' || !g.dosya.brans ? 'GŞ sürümü teyit gerekli' : 'teyit gerekli'
      return {
        metin: `Rücu sebebini seçin (${oneri ? `öneri: ${oneri}; ` : ''}${teyitMetni})`,
        neden: 'Eksik evrak listesi ve dilekçe şablonu rücu sebebi koduna bağlı; kodu avukat seçer.',
        kanit: o ? [alanKaniti(o)] : [],
      }
    },
  }),
]

// ─────────────────────────── 2 HAZIRLIK ───────────────────────────

const HZ: Kural[] = [
  kural({
    kod: 'HZ-01', grup: 'HZ', durak: D(2), rol: R('A'), oncelik: O(1), senaryo: S('c'),
    kosulMetni: 'Takip yok; zamanaşımı (Ray tarihi) ≤ 90 gün', oneriMetni: '"Zamanaşımı yakın: önce bu dosya (Ray hesabı, teyit gerekli)"', eylem: ['Hazırlığa git', 'hazirlik'], hukukiEtiket: 'teyit gerekli',
    degerlendir(g, bugun) {
      const z = g.dosya.zamanasimi
      if (!z || takipVar(g) || idariYolda(g) || kapandi(g)) return null
      const n = kalan(z, bugun)
      if (n > 90) return null
      return {
        metin: `Zamanaşımı yakın: önce bu dosya (${muvekkilKisa(g)} hesabı, teyit gerekli)`,
        neden: `${muvekkilKisa(g)}'in zamanaşımı tarihi ${tarihKisa(z)} (${n < 0 ? `${-n} gün önce geçti` : `${n} gün kaldı`}); takip henüz açılmadı.`,
        kanit: [{ tur: 'DOSYA', id: g.dosya.id, etiket: `Zamanaşımı (müvekkil tarihi, teyit gerekli)`, tarih: gunMetni(z) }], sonGun: z,
      }
    },
  }),
  kural({
    kod: 'HZ-02', grup: 'HZ', durak: D(2), rol: R('A'), oncelik: O(3), senaryo: S('c'),
    kosulMetni: 'Kritik alanlar onaysız', oneriMetni: '"Takip hazırlığı için önce kritik bilgileri onaylayın"', eylem: ['Gözden geçir', 'alan-onay'], hukukiEtiket: null,
    degerlendir(g) {
      if (takipVar(g) || idariYolda(g) || !evrakHazir(g)) return null
      if (bekleyenAlanlar(g).some((a) => kritikAlanMi(a.alan))) return null // EV-05 konuşuyor
      const e = onaysizKritikler(g)
      if (!e.length) return null
      return { metin: 'Takip hazırlığı için önce kritik bilgileri onaylayın', neden: `Onaylı değeri olmayan kritik bilgi: ${e.join(', ')}.`, kanit: [] }
    },
  }),
  kural({
    kod: 'HZ-03', grup: 'HZ', durak: D(2), rol: R('H/A'), oncelik: O(4), senaryo: S('c'),
    kosulMetni: 'Hazırlık listesinde eksik (faiz seçimi, hesap izi, borçlu türü…)', oneriMetni: '"Eksik: [ilk eksik madde]"', eylem: ['Tamamla', 'hazirlik'], hukukiEtiket: null,
    degerlendir(g) {
      if (takipVar(g) || idariYolda(g) || !evrakHazir(g)) return null
      const e = hazirlikEksikleri(g)
      if (!e.length) return null
      return {
        metin: `Eksik: ${e[0]}`,
        neden: `Takip hazırlık listesinde ${e.length} eksik madde var: ${e.join(', ')}. Faiz türü, oranı ve başlangıcı seçilmeden takip açılamaz.`,
        kanit: g.takipTalebi ? [{ tur: 'TAKIP_TALEBI', id: g.takipTalebi.id, etiket: 'Takip talebi taslağı' }] : [], adet: e.length,
      }
    },
  }),
  kural({
    kod: 'HZ-04', grup: 'HZ', durak: D(2), rol: R('A'), oncelik: O(5), senaryo: S('c'),
    kosulMetni: 'Liste tamam, avukat onayı yok', oneriMetni: '"Takibe hazırlığı onaylayın"', eylem: ['Onayla', 'hazirlik-onay'], hukukiEtiket: null,
    degerlendir(g) {
      if (takipVar(g) || idariYolda(g) || hazirlikOnayli(g) || !evrakHazir(g)) return null
      if (hazirlikEksikleri(g).length || onaysizKritikler(g).length || bekleyenAlanlar(g).some((a) => kritikAlanMi(a.alan)) || tutarSuphesi(g)) return null
      return { metin: 'Takibe hazırlığı onaylayın', neden: 'Hazırlık listesinin bütün maddeleri tamam; takip talebi avukat onayı bekliyor.', kanit: g.takipTalebi ? [{ tur: 'TAKIP_TALEBI', id: g.takipTalebi.id, etiket: 'Takip talebi taslağı' }] : [] }
    },
  }),
  kural({
    kod: 'HZ-05', grup: 'HZ', durak: D(2), rol: R('A'), oncelik: O(3), senaryo: S('c'),
    kosulMetni: 'Borçlulardan biri kamu idaresi, yol kararı yok', oneriMetni: '"Yol seçin: icra takibi mi, idareye başvuru mu? (İYUK 13, teyit gerekli)"', eylem: ['Yol seç', 'yol-sec-idari'], hukukiEtiket: 'İYUK 13 (teyit gerekli)',
    degerlendir(g) {
      const kamu = g.borclular.filter((b) => b.tur === 'KAMU')
      if (!kamu.length || g.dosya.yolOnayAt || g.dosya.durum === 'IDARI_YOL' || kapandi(g)) return null
      return {
        metin: 'Yol seçin: icra takibi mi, idareye başvuru mu? (İYUK 13, teyit gerekli)',
        neden: `${kamu.map((b) => borcluEtiketi(b.sira)).join(', ')} kamu idaresi; yol kararı kayıtlı değil. AI önerisi bu kararın yerine geçmez.`,
        kanit: kamu.flatMap((b) => borcluKaniti(g, b)),
      }
    },
  }),
]

// ─────────────────────────── İDARİ YOL (B12) ───────────────────────────

const ID: Kural[] = [
  kural({
    kod: 'ID-01', grup: 'ID', durak: D(2), rol: R('A'), oncelik: O(3), senaryo: S('c'),
    kosulMetni: 'AI triyajı "idari" önerdi, avukat yolu onaylamadı', oneriMetni: '"AI idari yol öneriyor (güven %x, gerekçe): yolu onaylayın"', eylem: ['Yolu onayla', 'idari-yol-onay'], hukukiEtiket: 'İYUK (teyit gerekli)',
    degerlendir(g) {
      const d = g.dosya
      if (d.yol !== 'IDARI' || d.yolOnayAt || d.durum === 'IDARI_YOL' || takipVar(g) || kapandi(g)) return null
      const guven = d.yolGuven != null && Number.isFinite(d.yolGuven) ? Math.round(Math.min(1, Math.max(0, d.yolGuven)) * 100) : null
      return {
        metin: `AI idari yol öneriyor${guven != null ? ` (güven %${guven})` : ''}: yolu onaylayın`,
        neden: `${d.yolNeden?.trim() ? `AI gerekçesi: ${kisalt(d.yolNeden, 160)} ` : ''}Öneri durumu değiştirmez; karar avukatındır.`,
        kanit: [{ tur: 'DOSYA', id: d.id, etiket: `AI yol önerisi: idari${guven != null ? ` · güven %${guven}` : ''}` }],
      }
    },
  }),
  kural({
    kod: 'ID-02', grup: 'ID', durak: D(2), rol: R('A'), oncelik: O(4), senaryo: S('c'),
    veriNotu: 'Başvuru tarihi Sure(IYUK_ZIMNI_RET).tetikTarihi ya da kapanmış Sure(IYUK13_BASVURU)\'dan okunur (S06/S24).',
    kosulMetni: 'İdari yol onaylı, idareye başvuru tarihi yok', oneriMetni: '"İdareye başvurun; önerilen son gün [tarih] (İYUK 13/1, teyit gerekli)"', eylem: ['Başvuru tarihini gir', 'idari-basvuru'], hukukiEtiket: 'İYUK 13/1 (teyit gerekli)',
    degerlendir(g) {
      if (!idariYolda(g) || idariBasvuruTarihi(g) || kapandi(g)) return null
      const s = g.sureler.find((x) => x.tur === 'IYUK13_BASVURU' && acikSure(x))
      const gun = s ? etkinSonGun(s) : null
      return {
        metin: `İdareye başvurun; ${gun ? `önerilen son gün ${tarihKisa(gun)} ` : ''}(İYUK 13/1, teyit gerekli)`,
        neden: 'Dosya avukat kararıyla idari yolda; idareye başvuru tarihi kayıtlı değil.',
        kanit: s ? [sureKaniti(s)] : [], sonGun: gun,
      }
    },
  }),
  kural({
    kod: 'ID-03', grup: 'ID', durak: D(2), rol: R('A+2'), oncelik: O(2), senaryo: S('c'),
    kosulMetni: 'Başvuru yapıldı, 30 gün geçti, cevap yok', oneriMetni: '"Zımni ret: dava süresini onaylayın (İYUK 7, teyit gerekli)"', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'İYUK 7 (teyit gerekli)',
    degerlendir(g, bugun) {
      const b = idariBasvuruTarihi(g)
      if (!idariYolda(g) || !b || gecenGun(b, bugun) <= 30) return null
      const dava = g.sureler.find((s) => s.tur === 'IYUK7_DAVA' && s.durum !== 'IPTAL')
      if (dava && (dava.onaylananSonGun || dava.tetikTuru === 'TEBLIG')) return null
      return {
        metin: 'Zımni ret: dava süresini onaylayın (İYUK 7, teyit gerekli)',
        neden: `İdareye başvuru ${tarihKisa(b)}; ${gecenGun(b, bugun)} gün geçti ve kayıtlı cevap yok.`,
        kanit: dava ? [sureKaniti(dava)] : [], sonGun: dava ? etkinSonGun(dava) : null,
      }
    },
  }),
  kural({
    kod: 'ID-04', grup: 'ID', durak: D(2), rol: R('A+2'), oncelik: O(2), senaryo: S('c'),
    kosulMetni: 'Ret cevabı tebliğ edildi', oneriMetni: '"Dava süresini onaylayın (İYUK 7, teyit gerekli)"', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'İYUK 7 (teyit gerekli)',
    degerlendir(g) {
      const s = g.sureler.find((x) => x.tur === 'IYUK7_DAVA' && x.tetikTuru === 'TEBLIG' && acikSure(x) && !x.onaylananSonGun)
      if (!s) return null
      return { metin: 'Dava süresini onaylayın (İYUK 7, teyit gerekli)', neden: `İdarenin ret cevabı ${tarihKisa(s.tetikTarihi)} tarihinde tebliğ edildi; onaylanan son gün yok.`, kanit: temiz([sureKaniti(s), belgeKaniti(g, s.kaynakBelgeId)]), sonGun: etkinSonGun(s) }
    },
  }),
]

// ─────────────────────────── 3 TAKİP ───────────────────────────

const TK: Kural[] = [
  kural({
    kod: 'TK-01', grup: 'TK', durak: D(3), rol: R('A'), oncelik: O(5), senaryo: S('c'),
    kosulMetni: 'Onaylı, tevzi yok, kopilot engeli yok', oneriMetni: '"UYAP\'ta takibi açın (Kopilot)"', eylem: ["UYAP'ta takibi aç", 'kopilot-ac'], hukukiEtiket: null,
    degerlendir(g) {
      if (!hazirlikOnayli(g) || tevziVar(g) || esasNoVar(g) || idariYolda(g) || kapandi(g)) return null
      if (tutarSuphesi(g) || kopilotDurdu(g) || hazirlikEksikleri(g).length) return null
      return {
        metin: "UYAP'ta takibi açın (Kopilot)",
        neden: 'Takibe hazırlık avukatça onaylandı; faiz seçimi ve hesap izi tamam. Kopilot UYAP panelinde bu dosyayı seçili açar.',
        kanit: g.takipTalebi ? [{ tur: 'TAKIP_TALEBI', id: g.takipTalebi.id, etiket: `Takip talebi · asıl alacak ${tutarMetni(g.takipTalebi.asilAlacak)}` }] : [],
      }
    },
  }),
  kural({
    kod: 'TK-02', grup: 'TK', durak: D(3), rol: R('H'), oncelik: O(4), senaryo: S('c'),
    kosulMetni: 'Kopilot durdu (MERNİS yok, ölüm kaydı, kurum unvanı, faiz eşlenemedi)', oneriMetni: '"Takip açılamadı: [sebep]"', eylem: ['Görev aç / Elle aç', 'kopilot-gorev'], hukukiEtiket: null,
    degerlendir(g) {
      const s = kopilotDurdu(g)
      if (!s || tevziVar(g) || esasNoVar(g)) return null
      return {
        metin: `Takip açılamadı: ${kisalt(s.hata, 90) || 'kopilot durdu'}`,
        neden: 'Kopilot UYAP emniyet kontrolünde durdu; sebep giderilince yeniden denenebilir ya da takip elle açılır.',
        kanit: [{ tur: 'SENKRON', id: s.id, etiket: `Kopilot işi · ${s.durum}`, tarih: gunMetni(s.bittiAt ?? s.createdAt) }],
      }
    },
  }),
  kural({
    kod: 'TK-03', grup: 'TK', durak: D(3), rol: R('H'), oncelik: O(5), senaryo: S('d'),
    kosulMetni: 'Tevzi var, bir günden uzun süredir esas no yok', oneriMetni: '"Harç ödendiyse icra esas no\'yu girin"', eylem: ['Esas no gir', 'esas-no-gir'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      if (!tevziVar(g) || esasNoVar(g)) return null
      const at = g.dosya.tevzi?.at ?? g.takipTalebi?.dondurulduAt ?? null
      const kanit: Kanit[] = [{ tur: 'TAKIP_TALEBI', id: g.takipTalebi?.id ?? g.dosya.id, etiket: `Tevzi${g.dosya.tevzi?.birim ? `: ${g.dosya.tevzi.birim}` : ''}`, tarih: gunMetni(at) }]
      if (at && gecenGun(at, bugun) < 1) {
        return { metin: 'Harç ödemesi bekleniyor', neden: 'Tevzi bugün yapıldı; harç UYAP\'ta ödenince dosya esas no alır.', kanit, eylem: null }
      }
      return { metin: "Harç ödendiyse icra esas no'yu girin", neden: `Tevzi ${at ? tarihKisa(at) : 'yapıldı'}; esas no henüz girilmedi.`, kanit }
    },
  }),
  kural({
    kod: 'TK-04', grup: 'TK', durak: D(3), rol: R('H'), oncelik: O(5), senaryo: S('d'), canli: true,
    kosulMetni: 'Esas no var; senkron hiç yok ya da 24 saatten eski', oneriMetni: '"UYAP\'tan şimdi çekin"', eylem: ["Kaydet ve UYAP'tan çek", 'uyap-cek'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      if (!esasNoVar(g) || kapandi(g)) return null
      if (g.senkronIsleri.some((s) => ['BEKLIYOR', 'ALINDI', 'CALISIYOR'].includes(s.durum))) return null
      const son = g.dosya.uyapSenkronAt
      if (son && bugun.getTime() - son.getTime() <= 24 * 3_600_000) return null
      return {
        metin: "UYAP'tan şimdi çekin",
        neden: son ? `Son UYAP çekimi ${tarihKisa(son)}; 24 saatten eski.` : 'Bu dosya UYAP\'tan hiç çekilmedi.',
        kanit: [{ tur: 'SENKRON', id: g.dosya.id, etiket: `${g.dosya.icraDairesi ?? 'İcra dairesi'} ${g.dosya.icraDosyaNo ?? ''}`.trim(), tarih: gunMetni(son) }],
      }
    },
  }),
]

// ─────────────────────────── 4 TEBLİĞ VE İTİRAZ ───────────────────────────

/** Süre başlatan aday (06 §8.2 sınıf 2): icrada tebliğ, itiraz, itirazın alacaklıya tebliği; davada cevap, rapor, gerekçeli karar tebliği. */
const SURE_BASLATAN_OLAY: Record<string, string> = {
  TEBLIG_SONUCU: 'Tebliğ tarihini onaylayın; İİK 62 buna bağlı',
  ITIRAZ: 'İtirazı onaylayın; İİK 67 buna bağlı',
  DURDURMA_ITIRAZ: 'İtirazı onaylayın; İİK 67 buna bağlı',
  ITIRAZIN_ALACAKLIYA_TEBLIGI: 'İtirazın size tebliğ tarihini onaylayın; İİK 67 başlangıcı buna bağlı',
}
const SURE_BASLATAN_ISLEM: Record<string, string> = {
  CEVAP: 'Cevap dilekçesinin tebliğ tarihini onaylayın; cevaba cevap süresi buna bağlı',
  BILIRKISI_RAPORU: 'Bilirkişi raporunun tebliğ tarihini onaylayın; rapora itiraz süresi buna bağlı',
  GEREKCELI_KARAR: 'Gerekçeli kararın tebliğ tarihini onaylayın; kanun yolu süresi buna bağlı',
}
/** TB-02'nin saymadığı adaylar (kendi kuralları var). */
const AYRI_KURALLI_OLAY = new Set([...Object.keys(SURE_BASLATAN_OLAY), 'TEBLIG_IADE', 'TAHSILAT_BORCLUDAN', 'DAVA_ACILDI_SINYALI'])
const AYRI_KURALLI_ISLEM = new Set([...Object.keys(SURE_BASLATAN_ISLEM), 'TENSIP', 'ARA_KARAR', 'KARAR'])

const TB: Kural[] = [
  kural({
    kod: 'TB-01', grup: 'TB', durak: D(4), rol: R('A'), oncelik: O(2), senaryo: S('e'),
    kosulMetni: 'Süre başlatan aday bekliyor (tebliğ, itiraz, itirazın tebliği)', oneriMetni: '"Tebliğ tarihini onaylayın; İİK 62 buna bağlı"', eylem: ['Onayla', 'olay-onay'], hukukiEtiket: 'teyit gerekli',
    degerlendir(g) {
      const olay = g.olaylar
        .filter((o) => o.teyit === 'ADAY' && o.altTip && SURE_BASLATAN_OLAY[o.altTip] && !(o.altTip === 'TEBLIG_SONUCU' && o.sonuc === 'IADE'))
        .sort((a, b) => (a.hukukiTarih ?? a.createdAt).getTime() - (b.hukukiTarih ?? b.createdAt).getTime())
      const islem = g.davaIslemleri
        .filter((i) => i.teyit === 'ADAY' && SURE_BASLATAN_ISLEM[i.tur] && i.tebligTarihi)
        .sort((a, b) => (a.tebligTarihi as Date).getTime() - (b.tebligTarihi as Date).getTime())
      const adet = olay.length + islem.length
      if (!adet) return null
      if (olay.length) {
        const o = olay[0]
        const b = g.borclular.find((x) => x.id === o.borcluId)
        return {
          metin: SURE_BASLATAN_OLAY[o.altTip as string],
          neden: `UYAP'tan ${b ? `${borcluEtiketi(b.sira)} için ` : ''}${(OLAY_ADI[o.altTip as string] ?? 'gelişme').toLocaleLowerCase('tr-TR')} geldi${o.hukukiTarih ? ` (hukuki tarih ${tarihKisa(o.hukukiTarih)})` : ''}; onaylanana kadar süre önerisi teyitsizdir.`,
          kanit: temiz([olayKaniti(o), belgeKaniti(g, o.kaynakBelgeId)]), adet,
        }
      }
      const i = islem[0]
      return {
        metin: SURE_BASLATAN_ISLEM[i.tur], durak: 7,
        neden: `UYAP'tan ${(ISLEM_ADI[i.tur] ?? i.tur).toLocaleLowerCase('tr-TR')} tebliği geldi (${tarihKisa(i.tebligTarihi)}); onaylanana kadar süre önerisi teyitsizdir.`,
        kanit: temiz([{ tur: 'DAVA_ISLEM', id: i.id, etiket: `${ISLEM_ADI[i.tur] ?? i.tur} (aday)`, tarih: gunMetni(i.tebligTarihi) }, belgeKaniti(g, i.kaynakBelgeId)]), adet,
      }
    },
  }),
  kural({
    kod: 'TB-02', grup: 'TB', durak: D(4), rol: R('H'), oncelik: O(3), senaryo: S('e'),
    kosulMetni: 'Diğer aday olaylar bekliyor', oneriMetni: '"UYAP\'tan gelen [n] gelişmeyi onaylayın"', eylem: ['Gözden geçir', 'olay-onay'], hukukiEtiket: null,
    degerlendir(g) {
      // Hiçbir hukuki olgu taşımayan DURUM adayı (yalnız TAHSILAT_SINYALI — bkz. aday-onay.ts durumBilgiAdayiMi)
      // bu "diğer" sayacına GİRMEZ (06 karar 2). Kendi kuralı olan adaylar zaten AYRI_KURALLI_OLAY ile dışarıda
      // (ör. DURDURMA_ITIRAZ → TB-01); MUVEKKIL_ALACAGINA_HACIZ/ICRAI_HACIZ/DIGER gibi GENEL yollu ama hukuken
      // önemli olabilecek adaylar burada ETKİLENMEZ, sayılmaya devam eder.
      const o = g.olaylar.filter((x) => x.teyit === 'ADAY' && !AYRI_KURALLI_OLAY.has(x.altTip ?? '') && !durumBilgiAdayiMi(x))
      const i = g.davaIslemleri.filter((x) => x.teyit === 'ADAY' && !AYRI_KURALLI_ISLEM.has(x.tur))
      const e = g.etkinlikler.filter((x) => x.teyit === 'ADAY')
      const n = o.length + i.length + e.length
      if (!n) return null
      return {
        metin: `UYAP'tan gelen ${n} gelişmeyi onaylayın`,
        neden: 'Riski artıran gelişmeler teyitsiz de görünür; onaylanınca kayda geçer.',
        kanit: [...o.slice(0, 3).map(olayKaniti), ...i.slice(0, 2).map((x) => ({ tur: 'DAVA_ISLEM' as const, id: x.id, etiket: `${ISLEM_ADI[x.tur] ?? x.tur} (aday)`, tarih: gunMetni(x.tarih) }))],
        adet: n, durak: o.length ? 4 : 7,
      }
    },
  }),
  kural({
    kod: 'TB-03', grup: 'TB', durak: D(4), rol: R('-'), oncelik: O(6), senaryo: S('e'), tur: 'BEKLEME',
    kosulMetni: 'Takip var, tebliğ yok, takipten < 15 gün', oneriMetni: 'Bekleme: "Ödeme emrinin tebliği bekleniyor"', eylem: null, hukukiEtiket: null,
    degerlendir(g, bugun) {
      const bas = g.dosya.takipTarihi ?? g.dosya.tevzi?.at ?? null
      if (!esasNoVar(g) || !bas || tebligBilgisiVar(g) || itirazSinyali(g) || mevcutDurak(g) > 4 || gecenGun(bas, bugun) >= 15) return null
      return { metin: 'Ödeme emrinin tebliği bekleniyor', neden: `Takip ${tarihKisa(bas)} tarihinde açıldı. UYAP kendiliğinden kontrol ediliyor; tebliğ gelince onayınıza düşer. Yapmanız gereken bir şey yok.`, kanit: [] }
    },
  }),
  kural({
    kod: 'TB-04', grup: 'TB', durak: D(4), rol: R('H'), oncelik: O(4), senaryo: S('e'),
    kosulMetni: 'Tebliğ sonucu 15 günü aştı', oneriMetni: '"Tebligatı UYAP\'ta kontrol edin"', eylem: ['Şimdi çek', 'uyap-cek'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      const bas = g.dosya.takipTarihi ?? g.dosya.tevzi?.at ?? null
      // arabuluculuk/dava evresine geçmiş (eski) dosyada tebliğ aynası boş olabilir: orada tebligat sorulmaz
      if (!esasNoVar(g) || !bas || tebligBilgisiVar(g) || itirazSinyali(g) || kapandi(g) || mevcutDurak(g) > 4) return null
      const n = gecenGun(bas, bugun)
      if (n < 15) return null
      return { metin: "Tebligatı UYAP'ta kontrol edin", neden: `Takip ${tarihKisa(bas)} tarihinde açıldı (${n} gün); tebliğ sonucu henüz gelmedi.`, kanit: [] }
    },
  }),
  kural({
    kod: 'TB-05', grup: 'TB', durak: D(4), rol: R('A'), oncelik: O(3), senaryo: S('e'),
    kosulMetni: 'Tebliğ İADE / bila', oneriMetni: '"Tebliğ edilemedi: yeni adres ya da TK 21/35 kararı (teyit gerekli)"', eylem: ['Karar ver', 'teblig-karar'], hukukiEtiket: 'Tebligat K. 21/35 (teyit gerekli)',
    degerlendir(g) {
      if (g.sureler.some((s) => s.tur === 'TEBLIGAT_ADRES' && s.durum !== 'IPTAL')) return null
      const iade = g.borclular.filter((b) => {
        if (b.takip?.tebligSonucu === 'TEBLIG') return false
        if (b.takip?.tebligSonucu === 'IADE') return true
        return g.olaylar.some((o) => o.borcluId === b.id && (o.teyit === 'ADAY' || o.teyit === 'TEYITLI') && (o.altTip === 'TEBLIG_IADE' || (o.altTip === 'TEBLIG_SONUCU' && o.sonuc === 'IADE')))
      })
      if (!iade.length) return null
      return {
        metin: 'Tebliğ edilemedi: yeni adres ya da TK 21/35 kararı (teyit gerekli)',
        neden: `${iade.map((b) => borcluEtiketi(b.sira)).join(', ')} için ödeme emri tebliğ edilemedi; İİK 62 süresi başlamadı.`,
        kanit: iade.flatMap((b) => [...borcluKaniti(g, b), ...g.olaylar.filter((o) => o.borcluId === b.id && o.altTip === 'TEBLIG_IADE').slice(0, 1).map(olayKaniti)]),
        adet: iade.length,
      }
    },
  }),
  kural({
    kod: 'TB-06', grup: 'TB', durak: D(4), rol: R('H'), oncelik: O(2), senaryo: S('e'),
    kosulMetni: 'UYAP durum metninde itiraz var, itiraz dilekçesi inmemiş', oneriMetni: '"İtiraz var (UYAP): itiraz dilekçesini çekin"', eylem: ['Şimdi çek', 'uyap-cek'], hukukiEtiket: null,
    degerlendir(g) {
      if (!uyapDurumItiraz(g)) return null
      const olayVar = g.olaylar.some((o) => o.teyit !== 'REDDEDILDI' && o.teyit != null && (o.altTip === 'ITIRAZ' || o.altTip === 'DURDURMA_ITIRAZ'))
      const belgeVar = g.belgeler.some((b) => b.altTur === 'ICRA_ITIRAZ' || /itiraz/.test(trNorm(b.uyapEvrakTuru)))
      if (olayVar || belgeVar || g.borclular.some((b) => b.takip?.itirazVar)) return null
      return {
        metin: 'İtiraz var (UYAP): itiraz dilekçesini çekin',
        neden: `UYAP durum metni "${kisalt(g.dosya.uyapDurum, 80)}" diyor; itiraz dilekçesi programa inmedi. İcra ekseni teyitsiz "durdu - itiraz" gösterir.`,
        kanit: [{ tur: 'SENKRON', id: g.dosya.id, etiket: `UYAP durum metni: ${kisalt(g.dosya.uyapDurum, 80)}`, tarih: gunMetni(g.dosya.uyapSenkronAt) }],
      }
    },
  }),
  kural({
    kod: 'TB-07', grup: 'TB', durak: D(4), rol: R('A'), oncelik: O(3), senaryo: S('e'),
    kosulMetni: 'İtiraz onaylı, kapsam yok', oneriMetni: '"İtiraz kapsamını onaylayın (okuduğumuz: tam itiraz)"', eylem: ['Onayla', 'itiraz-kapsam'], hukukiEtiket: null,
    degerlendir(g) {
      const l = g.borclular.filter((b) => itirazOnayli(g, b) && !b.takip?.itirazTipi)
      if (!l.length) return null
      return { metin: 'İtiraz kapsamını onaylayın', neden: `${l.map((b) => borcluEtiketi(b.sira)).join(', ')} itirazı onaylı; kapsamı (tam / kısmi, itiraz edilen tutar) seçilmedi.`, kanit: l.flatMap((b) => borcluKaniti(g, b)), adet: l.length }
    },
  }),
  kural({
    kod: 'TB-08', grup: 'TB', durak: D(4), rol: R('H'), oncelik: O(2), senaryo: S('e'),
    kosulMetni: 'İtiraz onaylı, alacaklıya tebliğ tarihi yok', oneriMetni: '"İtirazın size tebliğ tarihini girin (İİK 67 başlangıcı)"', eylem: ['Tarih gir', 'itiraz-teblig-tarih'], hukukiEtiket: 'İİK 67 (teyit gerekli)',
    degerlendir(g) {
      if (davaAcildi(anaDava(g))) return null
      if (g.sureler.some((s) => s.tur === 'IIK67' && s.durum === 'KAPANDI')) return null
      const l = g.borclular.filter((b) => itirazOnayli(g, b) && !b.takip?.itirazAlacakliyaTebligTarihi
        && !g.olaylar.some((o) => o.borcluId === b.id && o.altTip === 'ITIRAZIN_ALACAKLIYA_TEBLIGI' && o.teyit === 'ADAY'))
      if (!l.length) return null
      const b = l[0]
      const it = itirazTarihi(g, b)
      const s = sureBul(g, 'IIK67', { borcluId: b.id })
      const ih = s?.onerilenIhtiyatli ?? null
      return {
        metin: 'İtirazın size tebliğ tarihini girin (İİK 67 başlangıcı)',
        neden: `${borcluEtiketi(b.sira)} itiraz etti (onaylı${it ? `, ${tarihKisa(it)}` : ''}); itirazın size tebliğ tarihi girilmedi.${ih ? ` İİK 67 ihtiyatlı son gün ${tarihKisa(ih)} (teyit gerekli).` : ''}`,
        kanit: temiz([...borcluKaniti(g, b), s ? sureKaniti(s) : null]), sonGun: ih, adet: l.length,
      }
    },
  }),
  kural({
    kod: 'TB-09', grup: 'TB', durak: D(4), rol: R('A'), oncelik: O(3), senaryo: S('e'),
    kosulMetni: 'İİK 62 penceresi geçti, itiraz sinyali yok, kesinleşme teyidi yok', oneriMetni: '"UYAP\'ta itiraz yok mu? Teyit edin" (otomatik kesinleşme yok)', eylem: ['Teyit et', 'kesinlesme-teyit'], hukukiEtiket: 'İİK 62 (teyit gerekli)',
    degerlendir(g, bugun) {
      if (kesinlesmeTeyitli(g) || uyapDurumItiraz(g) || kapandi(g)) return null
      const l = g.borclular.map((b) => ({ b, p: iik62Sonu(g, b) }))
        .filter((x): x is { b: GBorclu; p: NonNullable<ReturnType<typeof iik62Sonu>> } => !!x.p && !!tebligTarihi(x.b) && kalan(x.p.gun, bugun) < 0
          && !itirazOnayli(g, x.b) && !g.olaylar.some((o) => o.borcluId === x.b.id && o.teyit === 'ADAY' && (o.altTip === 'ITIRAZ' || o.altTip === 'DURDURMA_ITIRAZ')))
      if (!l.length) return null
      const { b, p } = l[0]
      return {
        metin: "UYAP'ta itiraz yok mu? Teyit edin",
        neden: `${borcluEtiketi(b.sira)} için İİK 62 penceresi ${tarihKisa(p.gun)} tarihinde geçmiş görünüyor (teyit gerekli); itiraz sinyali yok. Kesinleşme kendiliğinden yazılmaz.`,
        kanit: temiz([...borcluKaniti(g, b), p.sure ? sureKaniti(p.sure) : null]), adet: l.length,
      }
    },
  }),
  kural({
    kod: 'TB-10', grup: 'TB', durak: D(4), rol: R('A'), oncelik: O(3), senaryo: S('e'),
    kosulMetni: 'İtiraz, İİK 62 süresinden sonra görünüyor', oneriMetni: '"Gecikmiş itiraz olabilir (İİK 65, teyit gerekli)"', eylem: ['İncele', 'itiraz-incele'], hukukiEtiket: 'İİK 65 (teyit gerekli)',
    degerlendir(g) {
      const l = g.borclular.filter((b) => {
        if (!itirazOnayli(g, b)) return false
        const it = itirazTarihi(g, b)
        const p = iik62Sonu(g, b)
        return !!it && !!p && istGun(it) > istGun(p.gun)
      })
      if (!l.length) return null
      const b = l[0]
      const it = itirazTarihi(g, b) as Date
      const p = iik62Sonu(g, b)
      return {
        metin: 'Gecikmiş itiraz olabilir (İİK 65, teyit gerekli)',
        neden: `${borcluEtiketi(b.sira)} itirazı ${tarihKisa(it)}; İİK 62 penceresi ${tarihKisa(p?.gun)} (teyit gerekli). Program hüküm vermez, kontrol edin.`,
        kanit: temiz([...borcluKaniti(g, b), p?.sure ? sureKaniti(p.sure) : null]), adet: l.length,
      }
    },
  }),
  kural({
    kod: 'TB-11', grup: 'TB', durak: D(4), rol: R('A'), oncelik: O(4), senaryo: S('e'),
    kosulMetni: 'Kısmi itiraz ya da itiraz etmeyen borçlu var', oneriMetni: '"İtiraz edilmeyen kısım için takibe devam"', eylem: ['Talep taslağı', 'talep-taslak'], hukukiEtiket: 'teyit gerekli',
    degerlendir(g, bugun) {
      const itirazcilar = g.borclular.filter((b) => itirazOnayli(g, b))
      if (!itirazcilar.length) return null
      const kismi = itirazcilar.filter((b) => b.takip?.itirazTipi === 'KISMI')
      const etmeyen = g.borclular.filter((b) => !itirazOnayli(g, b) && tebligTarihi(b) && (() => { const p = iik62Sonu(g, b); return !!p && kalan(p.gun, bugun) < 0 })())
      if (!kismi.length && !etmeyen.length) return null
      const ilkItiraz = enErken(itirazcilar.map((b) => itirazTarihi(g, b)))
      if (dilekceVar(g, 'TALEP', { sonra: ilkItiraz })) return null
      return {
        metin: 'İtiraz edilmeyen kısım için takibe devam',
        neden: kismi.length
          ? `${kismi.map((b) => borcluEtiketi(b.sira)).join(', ')} kısmi itiraz etti; itiraz edilmeyen kısım için takip sürebilir (teyit gerekli).`
          : `${etmeyen.map((b) => borcluEtiketi(b.sira)).join(', ')} itiraz etmedi görünüyor; o borçlu için takip sürebilir (teyit gerekli).`,
        kanit: [...kismi, ...etmeyen].flatMap((b) => borcluKaniti(g, b)),
      }
    },
  }),
]

// ─────────────────────────── 5 ARABULUCULUK ───────────────────────────

const AR: Kural[] = [
  kural({
    kod: 'AR-01', grup: 'AR', durak: D(5), rol: R('A'), oncelik: O(4), senaryo: S('f'),
    kosulMetni: 'İtiraz onaylı, yol seçilmedi', oneriMetni: '"Yol seçin: arabuluculuk + itirazın iptali / İİK 68 / genel dava / bırak"', eylem: ['Yol seç', 'yol-sec'], hukukiEtiket: 'İİK 67 / 68 (teyit gerekli)',
    degerlendir(g) {
      const it = g.borclular.filter((b) => itirazOnayli(g, b))
      if (!it.length || gecerliYolSecimi(g, 'ITIRAZ_SONRASI') || g.arabuluculuk || g.davalar.length || kapandi(g)) return null
      return {
        metin: 'Yol seçin: arabuluculuk + itirazın iptali / İİK 68 / genel dava / bırak',
        neden: `${it.map((b) => borcluEtiketi(b.sira)).join(', ')} itirazı onaylı; itiraz sonrası yol kayıtlı değil. Avukat önerir, müvekkil onaylar.`,
        kanit: it.flatMap((b) => borcluKaniti(g, b)),
      }
    },
  }),
  kural({
    kod: 'AR-02', grup: 'AR', durak: D(5), rol: R('A'), oncelik: O(3), senaryo: S('f'),
    kosulMetni: 'Yol seçildi, müvekkil onayı yok', oneriMetni: '"Ray\'den onay isteyin (dava, avans)"', eylem: ['Onay talebi taslağı', 'onay-talebi'], hukukiEtiket: null,
    degerlendir(g) {
      const y = gecerliYolSecimi(g, 'ITIRAZ_SONRASI')
      if (!y || davaAcildi(anaDava(g)) || kapandi(g)) return null
      const o = yolOnayKaydi(g, y)
      const kanit: Kanit[] = temiz([{ tur: 'YOL_SECIMI', id: y.id, etiket: `Yol seçimi: ${YOL_ADI[y.secim] ?? y.secim}`, tarih: gunMetni(y.secimAt) }, o ? { tur: 'ONAY_KAYDI', id: o.id, etiket: `Müvekkil onayı: ${o.sonuc}`, tarih: gunMetni(o.alinmaAt ?? o.istenmeAt) } : null])
      const muv = g.dosya.muvekkilAd ? ` (${g.dosya.muvekkilAd})` : ''
      if (o?.sonuc === 'ONAY') return null
      if (o?.sonuc === 'RET') return { metin: 'Müvekkil yolu onaylamadı: yolu yeniden seçin', neden: `Müvekkil${muv} seçilen yolu onaylamadı.`, kanit, eylem: { etiket: 'Yol seç', hedef: 'yol-sec' } }
      if (o?.istenmeAt) return { metin: `Müvekkil onayı bekleniyor (istendi ${tarihKisa(o.istenmeAt)}): gelince kaydedin`, neden: `Onay talebi müvekkile${muv} gönderildi; yanıt kaydedilmedi. Onay kaydı yokken dava ön kontrolü kilitli.`, kanit, eylem: { etiket: 'Onayı kaydet', hedef: 'onay-kaydet' } }
      return { metin: 'Müvekkilden onay isteyin (dava, avans)', neden: `Yol seçildi (${YOL_ADI[y.secim] ?? y.secim}); dava açma ve avans kararı müvekkilindir${muv}.`, kanit }
    },
  }),
  kural({
    kod: 'AR-03', grup: 'AR', durak: D(5), rol: R('A'), oncelik: O(4), senaryo: S('f'),
    kosulMetni: 'Arabuluculuk türü seçilmedi', oneriMetni: '"Arabuluculuk dava şartı mı? Seçin; belirsizse başvurun (tartışmalı)"', eylem: ['Seç', 'arabuluculuk-tur'], hukukiEtiket: 'HUAK 18/A (teyit gerekli)',
    degerlendir(g) {
      const a = g.arabuluculuk
      const y = gecerliYolSecimi(g, 'ITIRAZ_SONRASI')
      const gerekli = (a && !a.tur && !a.sonuc) || (!a && y?.secim === 'ARABULUCULUK_IIK67')
      if (!gerekli || davaAcildi(anaDava(g))) return null
      return { metin: 'Arabuluculuk dava şartı mı? Seçin; belirsizse başvurun (tartışmalı)', neden: 'Tür varsayılansızdır ve avukat seçer; dava şartı değilse başvurmak bir şey kaybettirmez.', kanit: a ? [{ tur: 'ARABULUCULUK', id: a.id, etiket: 'Arabuluculuk kaydı (tür seçilmedi)' }] : [] }
    },
  }),
  kural({
    kod: 'AR-04', grup: 'AR', durak: D(5), rol: R('H'), oncelik: O(5), senaryo: S('f'),
    kosulMetni: 'Yol = arabuluculuk, başvuru yok', oneriMetni: '"Arabuluculuğa başvurun (bilgiler hazır)"', eylem: ['Başvuru paketi', 'arabuluculuk-basvuru'], hukukiEtiket: null,
    degerlendir(g) {
      const a = g.arabuluculuk
      if (!a || !a.tur || a.basvuruTarihi || a.sonuc || davaAcildi(anaDava(g))) return null
      return { metin: 'Arabuluculuğa başvurun (bilgiler hazır)', neden: 'Arabuluculuk türü seçildi; başvuru tarihi kayıtlı değil.', kanit: [{ tur: 'ARABULUCULUK', id: a.id, etiket: `Arabuluculuk · ${a.tur}` }] }
    },
  }),
  kural({
    kod: 'AR-05', grup: 'AR', durak: D(5), rol: R('H'), oncelik: O(4), senaryo: S('f'),
    kosulMetni: 'Toplantı tarihi geçti, sonuç girilmedi', oneriMetni: '"Toplantı sonucunu girin"', eylem: ['Sonuç gir', 'toplanti-sonuc'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      const a = g.arabuluculuk
      if (!a || a.sonuc) return null
      const t = g.etkinlikler
        .filter((e) => e.tur === 'ARABULUCULUK_TOPLANTISI' && (e.asamaId == null || e.asamaId === a.asamaId) && e.teyit !== 'REDDEDILDI'
          && (e.durum === 'PLANLANDI' || e.durum === 'YAPILDI') && istGun(e.baslar) < istGun(bugun))
        .sort((x, y) => y.baslar.getTime() - x.baslar.getTime())[0]
      if (!t) return null
      return { metin: 'Toplantı sonucunu girin', neden: `Arabuluculuk toplantısı ${tarihKisa(t.baslar)} tarihindeydi; sonuç ya da son tutanak girilmedi.`, kanit: [{ tur: 'ETKINLIK', id: t.id, etiket: 'Arabuluculuk toplantısı', tarih: gunMetni(t.baslar) }] }
    },
  }),
  kural({
    kod: 'AR-06', grup: 'AR', durak: D(5), rol: R('H'), oncelik: O(3), senaryo: S('f'),
    kosulMetni: 'Süreç bitti, son tutanak belgesi ya da tarihi yok', oneriMetni: '"Son tutanağı yükleyin (dava dilekçesine eklenecek)"', eylem: ['Yükle', 'son-tutanak'], hukukiEtiket: null,
    degerlendir(g) {
      const a = g.arabuluculuk
      if (!a?.sonuc || (a.sonTutanakTarihi && a.sonTutanakBelgeId)) return null
      return { metin: 'Son tutanağı yükleyin (dava dilekçesine eklenecek)', neden: `Arabuluculuk sonucu (${SONUC_ADI[a.sonuc] ?? a.sonuc}) girildi; son tutanağın ${!a.sonTutanakTarihi ? 'tarihi' : 'belgesi'} yok.`, kanit: [{ tur: 'ARABULUCULUK', id: a.id, etiket: `Arabuluculuk · ${SONUC_ADI[a.sonuc] ?? a.sonuc}` }] }
    },
  }),
  kural({
    kod: 'AR-07', grup: 'AR', durak: D(5), rol: R('A+2'), oncelik: O(2), senaryo: S('f'),
    kosulMetni: 'Son tutanak onaylandı; İİK 67 onaylanan gün yeniden onay bekliyor', oneriMetni: '"İİK 67 son gününü yeniden onaylayın (durma eklendi)"', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'İİK 67, HUAK 18/A-15 (teyit gerekli)',
    degerlendir(g) {
      const a = g.arabuluculuk
      if (!a?.sonuc || a.sonuc === 'ANLASMA' || !a.sonTutanakTarihi || !a.onayAt || davaAcildi(anaDava(g))) return null
      const s = g.sureler.find((x) => x.tur === 'IIK67' && x.durum === 'ACIK')
      if (!s) return null
      if (s.onaylananSonGun && s.onayAt && s.onayAt.getTime() >= a.onayAt.getTime()) return null
      return {
        metin: 'İİK 67 son gününü yeniden onaylayın (durma eklendi)',
        neden: `Son tutanak ${tarihKisa(a.sonTutanakTarihi)} onaylandı; durmalı öneri ${tarihKisa(s.onerilenSonGun)}, ihtiyatlı öneri ${tarihKisa(s.onerilenIhtiyatli)} (değişmez). Hatırlatmalar yeniden onaya kadar ihtiyatlı güne göre gider.`,
        kanit: temiz([sureKaniti(s), { tur: 'ARABULUCULUK', id: a.id, etiket: 'Son tutanak (onaylı)', tarih: gunMetni(a.sonTutanakTarihi), belgeId: a.sonTutanakBelgeId }]),
        sonGun: s.onerilenIhtiyatli ?? s.onerilenSonGun,
      }
    },
  }),
  kural({
    kod: 'AR-08', grup: 'AR', durak: D(5), rol: R('A'), oncelik: O(5), senaryo: S('f'),
    kosulMetni: 'Son tutanak ANLAŞMA', oneriMetni: '"Anlaşma: taksit ya da tahsil planı kurun (sulh/iskonto onayı)"', eylem: ['Plan kur', 'taksit-plan'], hukukiEtiket: null,
    degerlendir(g) {
      const a = g.arabuluculuk
      if (a?.sonuc !== 'ANLASMA' || g.taksitPlanlari.length || kapandi(g)) return null
      return { metin: 'Anlaşma: taksit ya da tahsil planı kurun (sulh/iskonto onayı)', neden: `Arabuluculuk anlaşmayla bitti${a.sonTutanakTarihi ? ` (${tarihKisa(a.sonTutanakTarihi)})` : ''}; tahsil planı kayıtlı değil.`, kanit: [{ tur: 'ARABULUCULUK', id: a.id, etiket: 'Son tutanak: anlaşma', tarih: gunMetni(a.sonTutanakTarihi), belgeId: a.sonTutanakBelgeId }] }
    },
  }),
  kural({
    kod: 'AR-09', grup: 'AR', durak: D(5), rol: R('A'), oncelik: O(3), senaryo: S('f'), durumu: 'VERI_BEKLIYOR',
    veriNotu: 'Son tutanaktaki taraf ve kalemlerin yapılandırılmış okuması (S26 tutanak çıkarımı) gelince etkinleşir; şemada karşılaştırılabilir alan yok.',
    kosulMetni: 'Tutanaktaki karşı taraf ya da kalem itirazla uyuşmuyor', oneriMetni: '"Son tutanak ile itiraz eden borçlu farklı: kontrol edin"', eylem: ['İncele', 'tutanak-incele'], hukukiEtiket: null,
    degerlendir() { return null },
  }),
]

const YOL_ADI: Record<string, string> = {
  ARABULUCULUK_IIK67: 'arabuluculuk + itirazın iptali', IIK68_KALDIRMA: 'itirazın kaldırılması (İİK 68)', GENEL_ALACAK: 'genel alacak davası', TAKIBI_BIRAK: 'takibi bırak',
  TAKIBE_DEVAM: 'takibe devam', ISTINAF: 'istinaf', TEMYIZ: 'temyiz', KANUN_YOLU_YOK: 'kanun yolu yok', TAKIBI_DARALT: 'takibi daralt',
}
const SONUC_ADI: Record<string, string> = { ANLASMA: 'anlaşma', ANLASAMAMA: 'anlaşamama', ULASILAMAMA: 'ulaşılamama', KATILMAMA: 'katılmama', KISMEN: 'kısmen anlaşma' }

// ─────────────────────────── 6 DAVA AÇILIŞI ───────────────────────────

/** Dava ön kontrolünün eksik maddeleri (06 2(g)); avukat seçimleri varsayılansızdır. */
export function davaOnKontrolEksikleri(g: Gercekler, d: GDava): string[] {
  const e: string[] = []
  if (!g.onayKayitlari.some((o) => o.tur === 'DAVA_ACMA' && o.sonuc === 'ONAY')) e.push('müvekkil onayı (dava açma)')
  if (!d.mahkemeTuru) e.push('görevli mahkeme (avukat seçer)')
  if (!d.usul) e.push('usul (basit / yazılı)')
  if (d.davaDegeri == null) e.push('dava değeri')
  for (const m of d.onKontrol) if (!['TAMAM', 'GECILDI', 'OK'].includes((m.durum ?? '').toUpperCase())) e.push(m.kod.toLocaleLowerCase('tr-TR').replace(/_/g, ' '))
  return e
}

const DA: Kural[] = [
  kural({
    kod: 'DA-01', grup: 'DA', durak: D(6), rol: R('A'), oncelik: O(5), senaryo: S('g'),
    kosulMetni: 'Son tutanak ANLAŞMA dışında, dava yok', oneriMetni: '"Dava ön kontrolünü tamamlayın"', eylem: ['Ön kontrol', 'dava-on-kontrol'], hukukiEtiket: null,
    degerlendir(g) {
      if (!arabBittiAnlasmaDisi(g) || g.davalar.some((d) => d.rolumuz !== 'DAVALI') || kapandi(g)) return null
      if (gecerliYolSecimi(g, 'ITIRAZ_SONRASI')?.secim === 'TAKIBI_BIRAK') return null
      const a = g.arabuluculuk!
      return { metin: 'Dava ön kontrolünü tamamlayın', neden: `Arabuluculuk ${SONUC_ADI[a.sonuc as string] ?? a.sonuc} ile bitti; dava kaydı yok.`, kanit: [{ tur: 'ARABULUCULUK', id: a.id, etiket: `Son tutanak: ${SONUC_ADI[a.sonuc as string] ?? a.sonuc}`, tarih: gunMetni(a.sonTutanakTarihi), belgeId: a.sonTutanakBelgeId }] }
    },
  }),
  kural({
    kod: 'DA-02', grup: 'DA', durak: D(6), rol: R('A'), oncelik: O(4), senaryo: S('g'),
    kosulMetni: 'Ön kontrolde eksik ya da çapraz kontrol uyarısı', oneriMetni: '"Eksik: [ilk madde]"', eylem: ['Tamamla', 'dava-on-kontrol'], hukukiEtiket: null,
    degerlendir(g) {
      const d = anaDava(g)
      if (!d || davaAcildi(d)) return null
      const e = davaOnKontrolEksikleri(g, d)
      if (!e.length) return null
      return { metin: `Eksik: ${e[0]}`, neden: `Dava ön kontrolünde ${e.length} eksik madde var: ${e.join(', ')}. Eksik varken "imzaya hazır" kilitli.`, kanit: [{ tur: 'DAVA', id: d.id, etiket: 'Dava ön kontrolü' }], adet: e.length }
    },
  }),
  kural({
    kod: 'DA-03', grup: 'DA', durak: D(6), rol: R('A'), oncelik: O(5), senaryo: S('g', 'h'),
    kosulMetni: 'Ön kontrol tamam, dilekçe yok', oneriMetni: '"Dava dilekçesini hazırlayın"', eylem: ['Hazırla', 'dava-dilekce'], hukukiEtiket: null,
    degerlendir(g) {
      const d = anaDava(g)
      if (!d || davaAcildi(d) || davaOnKontrolEksikleri(g, d).length || dilekceVar(g, 'DAVA', { davaId: d.id, hazir: true })) return null
      const taslak = dilekceVar(g, 'DAVA', { davaId: d.id })
      return { metin: 'Dava dilekçesini hazırlayın', neden: taslak ? 'Ön kontrol tamam; dava dilekçesi taslakta, imzaya hazır değil.' : 'Ön kontrol tamam; dava dilekçesi yok. Önce dosya kartı onaylanır, sonra taslak üretilir.', kanit: [{ tur: 'DAVA', id: d.id, etiket: 'Dava ön kontrolü tamam' }] }
    },
  }),
  kural({
    kod: 'DA-04', grup: 'DA', durak: D(6), rol: R('A'), oncelik: O(5), senaryo: S('g'),
    kosulMetni: 'Dilekçe imzaya hazır, dava kaydı yok', oneriMetni: '"UYAP\'ta davayı açın; esas no\'yu girin ya da bekleyin"', eylem: ['Esas no gir', 'dava-esas-gir'], hukukiEtiket: null,
    degerlendir(g) {
      const d = anaDava(g)
      if (!d || davaAcildi(d) || !dilekceVar(g, 'DAVA', { davaId: d.id, hazir: true })) return null
      return { metin: "UYAP'ta davayı açın; esas no'yu girin ya da bekleyin", neden: 'Dava dilekçesi imzaya hazır; dava henüz açılmadı ya da esas no girilmedi. Program davayı UYAP senkronunda da arar.', kanit: [{ tur: 'DAVA', id: d.id, etiket: 'Dava (açılış bekliyor)' }] }
    },
  }),
  kural({
    kod: 'DA-05', grup: 'DA', durak: D(6), rol: R('H'), oncelik: O(3), senaryo: S('g'),
    kosulMetni: 'Tevzi formu sinyali ya da ilgili dosya adayı var', oneriMetni: '"Bulunan davayı onaylayın"', eylem: ['Bağla', 'dava-bagla'], hukukiEtiket: null,
    degerlendir(g) {
      const olay = g.olaylar.filter((o) => o.altTip === 'DAVA_ACILDI_SINYALI' && o.teyit === 'ADAY')
      const acik = davaAcildi(anaDava(g))
      const form = acik ? [] : g.belgeler.filter((b) => /tevzi formu/.test(trNorm(b.uyapEvrakTuru ?? b.dosyaAdi)) && (b.uyapDosyaTuru ?? 'ICRA') === 'ICRA')
      if (!olay.length && !form.length) return null
      return {
        metin: 'Bulunan davayı onaylayın',
        neden: olay.length ? 'UYAP senkronu bu icra dosyasına bağlı bir dava sinyali buldu; bağ avukat onayıyla kurulur.' : 'İcra dosyasında hukuk mahkemesi tevzi formu görüldü; dava bağı henüz kurulmadı.',
        kanit: temiz([...olay.slice(0, 2).map(olayKaniti), ...form.slice(0, 2).map((b) => belgeKaniti(g, b.id))]), adet: olay.length + form.length,
      }
    },
  }),
  kural({
    kod: 'DA-06a', grup: 'DA', durak: D(6), rol: R('A'), oncelik: O(2), senaryo: S('g'),
    kosulMetni: 'Dava bağlandı, açılış ≤ İİK 67 onaylanan gün', oneriMetni: '"İİK 67 kaydını kapatın (kanıt: açılış tarihi)"', eylem: ['Kapat', 'sure-onay'], hukukiEtiket: 'İİK 67 (teyit gerekli)',
    degerlendir(g) {
      const d = anaDava(g)
      const s = g.sureler.find((x) => x.tur === 'IIK67' && acikSure(x))
      if (!d?.acilisTarihi || !s?.onaylananSonGun || istGun(d.acilisTarihi) > istGun(s.onaylananSonGun)) return null
      return {
        metin: 'İİK 67 kaydını kapatın (kanıt: açılış tarihi)',
        neden: `Dava ${tarihKisa(d.acilisTarihi)} tarihinde açıldı; onaylanan son gün ${tarihKisa(s.onaylananSonGun)}. Esas no girmek süreyi tek başına kapatmaz; kapanışı avukat onaylar.`,
        kanit: [sureKaniti(s), { tur: 'DAVA', id: d.id, etiket: 'Dava açılış tarihi', tarih: gunMetni(d.acilisTarihi) }], sonGun: s.onaylananSonGun,
      }
    },
  }),
  kural({
    kod: 'DA-06b', grup: 'DA', durak: D(6), rol: R('A'), oncelik: O(0), senaryo: S('g'),
    kosulMetni: 'Dava bağlandı, açılış > İİK 67 onaylanan gün', oneriMetni: '"Açılış tarihi son günden sonra görünüyor: kontrol edin"', eylem: ['İncele', 'dava-incele'], hukukiEtiket: 'İİK 67 (teyit gerekli)',
    degerlendir(g) {
      const d = anaDava(g)
      const s = g.sureler.find((x) => x.tur === 'IIK67' && acikSure(x))
      if (!d?.acilisTarihi || !s) return null
      const sinir = s.onaylananSonGun ?? s.onerilenIhtiyatli
      if (!sinir || istGun(d.acilisTarihi) <= istGun(sinir)) return null
      return {
        metin: 'Açılış tarihi son günden sonra görünüyor: kontrol edin',
        neden: `Dava açılışı ${tarihKisa(d.acilisTarihi)}; ${s.onaylananSonGun ? 'onaylanan' : 'ihtiyatlı önerilen'} son gün ${tarihKisa(sinir)}. Program "süre kaçtı" hükmü vermez; genel alacak davası seçeneği ayrıca değerlendirilebilir (teyit gerekli).`,
        kanit: [sureKaniti(s), { tur: 'DAVA', id: d.id, etiket: 'Dava açılış tarihi', tarih: gunMetni(d.acilisTarihi) }],
      }
    },
  }),
  kural({
    kod: 'DA-07', grup: 'DA', durak: D(6), rol: R('A'), oncelik: O(2), senaryo: S('g'),
    kosulMetni: 'Rolümüz davalı (karşı taraf davası)', oneriMetni: '"Karşı taraf davası: cevap süresini onaylayın (HMK 127, teyit gerekli)"', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'HMK 127 (teyit gerekli)',
    degerlendir(g) {
      const d = g.davalar.find((x) => x.rolumuz === 'DAVALI' && !x.kararTarihi && !g.sureler.some((s) => s.tur === 'HMK127' && s.davaId === x.id && (s.onaylananSonGun || s.durum === 'KAPANDI')))
      if (!d) return null
      const s = g.sureler.find((x) => x.tur === 'HMK127' && x.davaId === d.id && acikSure(x))
      return { metin: 'Karşı taraf davası: cevap süresini onaylayın (HMK 127, teyit gerekli)', neden: 'Bu davada müvekkil davalı; cevap süresinin onaylanan son günü yok.', kanit: temiz([{ tur: 'DAVA', id: d.id, etiket: 'Karşı taraf davası' }, s ? sureKaniti(s) : null]), sonGun: s ? etkinSonGun(s) : null, durak: 7 }
    },
  }),
]

// ─────────────────────────── 7 YARGILAMA ───────────────────────────

/** Açılmış davalar (bizim ve karşı taraf). */
function acikDavalar(g: Gercekler): GDava[] {
  return g.davalar.filter((d) => davaAcildi(d) && !['KESINLESTI'].includes(d.durum))
}

const YR: Kural[] = [
  kural({
    kod: 'YR-01', grup: 'YR', durak: D(7), rol: R('A'), oncelik: O(2), senaryo: S('i'),
    kosulMetni: 'Tensip ya da ara karar geldi; içindeki süreler onaysız', oneriMetni: '"Tensipte 2 kesin süre bulundu, onaylayın"', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'HMK 94 (teyit gerekli)',
    degerlendir(g) {
      for (const d of acikDavalar(g)) {
        const kaynak = [...islemler(g, d, 'TENSIP'), ...islemler(g, d, 'ARA_KARAR')].sort((a, b) => (b.tarih ?? b.createdAt).getTime() - (a.tarih ?? a.createdAt).getTime())
        if (!kaynak.length) continue
        const onaysizSure = g.sureler.filter((s) => s.davaId === d.id && ['ARA_KARAR', 'AVANS', 'DIGER'].includes(s.tur) && s.durum === 'ACIK' && !s.onaylananSonGun)
        const adayKesin = kaynak.filter((i) => i.teyit === 'ADAY').reduce((t, i) => t + i.kesinSureSayisi, 0)
        const n = onaysizSure.length + adayKesin
        if (!n) continue
        const ilk = kaynak[0]
        const yer = ilk.tur === 'TENSIP' ? 'Tensipte' : 'Ara kararda'
        return {
          metin: `${yer} ${n} kesin süre bulundu, onaylayın`,
          neden: `${ISLEM_ADI[ilk.tur]} ${tarihKisa(ilk.tarih)}; içindeki kesin süreler onaylanmadı. Günü kod sayar, "kesin süre ihtarı" işaretini avukat verir.`,
          kanit: temiz([{ tur: 'DAVA_ISLEM', id: ilk.id, etiket: `${ISLEM_ADI[ilk.tur]} (${ilk.teyit === 'ADAY' ? 'aday' : 'onaylı'})`, tarih: gunMetni(ilk.tarih) }, belgeKaniti(g, ilk.kaynakBelgeId), ...onaysizSure.slice(0, 3).map(sureKaniti)]),
          sonGun: enErken(onaysizSure.map(etkinSonGun)), adet: n,
        }
      }
      return null
    },
  }),
  kural({
    kod: 'YR-02', grup: 'YR', durak: D(7), rol: R('A'), oncelik: O(3), senaryo: S('i'),
    kosulMetni: 'Usul alanı boş', oneriMetni: '"Usulü seçin (cevaba cevap süresi buna bağlı)"', eylem: ['Seç', 'usul-sec'], hukukiEtiket: null,
    degerlendir(g) {
      const d = acikDavalar(g).find((x) => !x.usul)
      if (!d) return null
      return { metin: 'Usulü seçin (cevaba cevap süresi buna bağlı)', neden: 'Dava açıldı; usul (basit / yazılı) seçilmedi. Usul boşken cevaba cevap süresi önerilmez.', kanit: [{ tur: 'DAVA', id: d.id, etiket: 'Dava · usul boş' }] }
    },
  }),
  kural({
    kod: 'YR-03', grup: 'YR', durak: D(7), rol: R('A'), oncelik: O(5), senaryo: S('h', 'i'),
    kosulMetni: 'Cevap dilekçesi tebliğ edildi, yazılı usul', oneriMetni: '"Cevaba cevap taslağını hazırlayın"', eylem: ['Taslağı hazırla', 'cevaba-cevap'], hukukiEtiket: 'HMK 136 (teyit gerekli)',
    degerlendir(g) {
      for (const d of acikDavalar(g)) {
        if (d.usul !== 'YAZILI') continue
        const c = islemler(g, d, 'CEVAP', 'TEYITLI').find((i) => i.tebligTarihi)
        if (!c || islemler(g, d, 'CEVABA_CEVAP').length || dilekceVar(g, 'CEVABA_CEVAP', { davaId: d.id, hazir: true })) continue
        const s = sureBul(g, 'HMK136', { davaId: d.id })
        return {
          metin: 'Cevaba cevap taslağını hazırlayın',
          neden: `Cevap dilekçesi ${tarihKisa(c.tebligTarihi)} tarihinde size tebliğ edildi (onaylı); usul yazılı.`,
          kanit: temiz([{ tur: 'DAVA_ISLEM', id: c.id, etiket: 'Cevap dilekçesi tebliği (onaylı)', tarih: gunMetni(c.tebligTarihi) }, belgeKaniti(g, c.kaynakBelgeId), s ? sureKaniti(s) : null]),
          sonGun: s ? etkinSonGun(s) : null,
        }
      }
      return null
    },
  }),
  kural({
    kod: 'YR-04', grup: 'YR', durak: D(7), rol: R('A'), oncelik: O(5), senaryo: S('h', 'i'),
    kosulMetni: 'Cevap dilekçesi tebliğ edildi, basit usul', oneriMetni: '"Cevaba cevap öngörülmüyor (HMK 317, teyit gerekli); beyan gerekir mi?"', eylem: ['Beyan mı?', 'beyan'], hukukiEtiket: 'HMK 317 (teyit gerekli)',
    degerlendir(g) {
      for (const d of acikDavalar(g)) {
        if (d.usul !== 'BASIT') continue
        const c = islemler(g, d, 'CEVAP', 'TEYITLI').find((i) => i.tebligTarihi)
        if (!c || dilekceVar(g, 'BEYAN', { davaId: d.id, sonra: c.tebligTarihi })) continue
        return { metin: 'Cevaba cevap öngörülmüyor (HMK 317, teyit gerekli); beyan gerekir mi?', neden: `Cevap dilekçesi ${tarihKisa(c.tebligTarihi)} tarihinde tebliğ edildi; usul basit.`, kanit: temiz([{ tur: 'DAVA_ISLEM', id: c.id, etiket: 'Cevap dilekçesi tebliği (onaylı)', tarih: gunMetni(c.tebligTarihi) }, belgeKaniti(g, c.kaynakBelgeId)]) }
      }
      return null
    },
  }),
  kural({
    kod: 'YR-05', grup: 'YR', durak: D(7), rol: R('A'), oncelik: O(5), senaryo: S('h', 'i'),
    kosulMetni: 'Bilirkişi raporu tebliğ edildi', oneriMetni: '"Rapor analizi ve itiraz/beyan taslağı"', eylem: ['Analiz et', 'rapor-analiz'], hukukiEtiket: 'HMK 281 (teyit gerekli)',
    degerlendir(g) {
      for (const d of acikDavalar(g)) {
        const r = islemler(g, d, 'BILIRKISI_RAPORU', 'TEYITLI').filter((i) => i.tebligTarihi).sort((a, b) => (b.tebligTarihi as Date).getTime() - (a.tebligTarihi as Date).getTime())[0]
        if (!r || dilekceVar(g, 'BEYAN', { davaId: d.id, sonra: r.tebligTarihi })) continue
        const s = sureBul(g, 'HMK281', { davaId: d.id })
        if (s?.durum === 'KAPANDI') continue
        return {
          metin: 'Rapor analizi ve itiraz/beyan taslağı',
          neden: `Bilirkişi raporu ${tarihKisa(r.tebligTarihi)} tarihinde tebliğ edildi (onaylı); beyan ya da itiraz hazırlanmadı.`,
          kanit: temiz([{ tur: 'DAVA_ISLEM', id: r.id, etiket: 'Bilirkişi raporu tebliği (onaylı)', tarih: gunMetni(r.tebligTarihi) }, belgeKaniti(g, r.kaynakBelgeId), s ? sureKaniti(s) : null]),
          sonGun: s ? etkinSonGun(s) : null,
        }
      }
      return null
    },
  }),
  kural({
    kod: 'YR-06', grup: 'YR', durak: D(7), rol: R('A'), oncelik: O(5), senaryo: S('i'),
    kosulMetni: 'Duruşmaya ≤ 3 gün', oneriMetni: '"Duruşma hazırlık notunu okuyun"', eylem: ['Notu aç', 'durusma-notu'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      const adaylar: { t: Date; ad: string; kanit: Kanit }[] = []
      for (const d of acikDavalar(g)) {
        if (d.onIncelemeTarihi) adaylar.push({ t: d.onIncelemeTarihi, ad: 'Ön inceleme', kanit: { tur: 'DAVA', id: d.id, etiket: 'Ön inceleme (UYAP ayrıntısı)', tarih: gunMetni(d.onIncelemeTarihi) } })
        if (d.sonrakiDurusma) adaylar.push({ t: d.sonrakiDurusma, ad: 'Duruşma', kanit: { tur: 'DAVA', id: d.id, etiket: 'Sonraki duruşma (UYAP ayrıntısı)', tarih: gunMetni(d.sonrakiDurusma) } })
      }
      for (const e of g.etkinlikler) if (e.tur === 'DURUSMA' && e.durum === 'PLANLANDI' && e.teyit !== 'REDDEDILDI') adaylar.push({ t: e.baslar, ad: 'Duruşma', kanit: { tur: 'ETKINLIK', id: e.id, etiket: `Duruşma${e.teyit === 'ADAY' ? ' (UYAP, teyitsiz)' : ''}`, tarih: gunMetni(e.baslar) } })
      const yakin = adaylar.filter((x) => { const n = kalan(x.t, bugun); return n >= 0 && n <= 3 }).sort((a, b) => a.t.getTime() - b.t.getTime())[0]
      if (!yakin) return null
      const n = kalan(yakin.t, bugun)
      return { metin: 'Duruşma hazırlık notunu okuyun', neden: `${yakin.ad} ${tarihKisa(yakin.t)}${n === 0 ? ' (bugün)' : ` (${n} gün sonra)`}.`, kanit: [yakin.kanit], sonGun: yakin.t }
    },
  }),
  kural({
    kod: 'YR-07', grup: 'YR', durak: D(7), rol: R('H'), oncelik: O(4), senaryo: S('i'),
    kosulMetni: 'Duruşma geçti, sonuç girilmedi', oneriMetni: '"Duruşma sonucunu girin (zabıt geldi mi?)"', eylem: ['Sonuç gir', 'durusma-sonuc'], hukukiEtiket: null,
    degerlendir(g, bugun) {
      const e = g.etkinlikler.filter((x) => x.tur === 'DURUSMA' && x.durum === 'PLANLANDI' && x.teyit !== 'REDDEDILDI' && istGun(x.baslar) < istGun(bugun))
        .sort((a, b) => b.baslar.getTime() - a.baslar.getTime())[0]
      if (e) return { metin: 'Duruşma sonucunu girin (zabıt geldi mi?)', neden: `Duruşma ${tarihKisa(e.baslar)} tarihindeydi; sonuç girilmedi.`, kanit: [{ tur: 'ETKINLIK', id: e.id, etiket: 'Duruşma', tarih: gunMetni(e.baslar) }] }
      const d = acikDavalar(g).find((x) => x.sonrakiDurusma && istGun(x.sonrakiDurusma) < istGun(bugun)
        && !g.etkinlikler.some((y) => y.tur === 'DURUSMA' && istGun(y.baslar) === istGun(x.sonrakiDurusma as Date) && y.durum !== 'PLANLANDI'))
      if (!d) return null
      return { metin: 'Duruşma sonucunu girin (zabıt geldi mi?)', neden: `UYAP ayrıntısındaki duruşma ${tarihKisa(d.sonrakiDurusma)} geçti; sonuç girilmedi.`, kanit: [{ tur: 'DAVA', id: d.id, etiket: 'Sonraki duruşma (UYAP ayrıntısı)', tarih: gunMetni(d.sonrakiDurusma) }] }
    },
  }),
  kural({
    kod: 'YR-08', grup: 'YR', durak: D(7), rol: R('A+2'), oncelik: O(1), senaryo: S('i'),
    kosulMetni: 'Dosya işlemden kaldırıldı', oneriMetni: '"Yenileme son gününü onaylayın (HMK 150, teyit gerekli)"', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'HMK 150 (teyit gerekli)',
    degerlendir(g) {
      const d = g.davalar.find((x) => x.durum === 'ISLEMDEN_KALDIRILDI' || islemler(g, x, 'ISLEMDEN_KALDIRMA', 'TEYITLI').length)
      if (!d || g.sureler.some((s) => s.tur === 'HMK150' && s.davaId === d.id && (s.onaylananSonGun || s.durum === 'KAPANDI'))) return null
      const s = g.sureler.find((x) => x.tur === 'HMK150' && x.davaId === d.id && acikSure(x))
      return { metin: 'Yenileme son gününü onaylayın (HMK 150, teyit gerekli)', neden: 'Dava dosyası işlemden kaldırıldı; yenileme süresinin onaylanan son günü yok.', kanit: temiz([{ tur: 'DAVA', id: d.id, etiket: 'Dava · işlemden kaldırıldı' }, s ? sureKaniti(s) : null]), sonGun: s ? etkinSonGun(s) : null }
    },
  }),
  kural({
    kod: 'YR-09', grup: 'YR', durak: D(7), rol: R('A+2'), oncelik: O(1), senaryo: S('i'),
    kosulMetni: 'Görevsizlik ya da yetkisizlik kararı', oneriMetni: '"Gönderme talebi süresini onaylayın (HMK 20, teyit gerekli)"', eylem: ['Onayla', 'sure-onay'], hukukiEtiket: 'HMK 20 (teyit gerekli)',
    degerlendir(g) {
      for (const d of g.davalar) {
        const k = islemler(g, d, 'GOREVSIZLIK', 'TEYITLI')[0]
        if (!k || g.sureler.some((s) => s.tur === 'HMK20' && s.davaId === d.id && (s.onaylananSonGun || s.durum === 'KAPANDI'))) continue
        const s = g.sureler.find((x) => x.tur === 'HMK20' && x.davaId === d.id && acikSure(x))
        return { metin: 'Gönderme talebi süresini onaylayın (HMK 20, teyit gerekli)', neden: `Görevsizlik / yetkisizlik kararı ${tarihKisa(k.tarih)}; gönderme talebi süresinin onaylanan son günü yok.`, kanit: temiz([{ tur: 'DAVA_ISLEM', id: k.id, etiket: 'Görevsizlik / yetkisizlik kararı (onaylı)', tarih: gunMetni(k.tarih) }, s ? sureKaniti(s) : null]), sonGun: s ? etkinSonGun(s) : null }
      }
      return null
    },
  }),
  kural({
    kod: 'YR-10', grup: 'YR', durak: D(7), rol: R('SORUMLU'), oncelik: O(1), senaryo: S('i'),
    kosulMetni: 'Gider ya da delil avansı istendi', oneriMetni: '"Avansı yatırın; kesin süre [tarih] (HMK 120/324, teyit gerekli)"', eylem: ['Süreye git', 'sure-git'], hukukiEtiket: 'HMK 120/324 (teyit gerekli)',
    degerlendir(g) {
      const l = g.sureler.filter((s) => s.tur === 'AVANS' && s.durum === 'ACIK' && !s.kapanisKanitiBelgeId)
        .sort((a, b) => (etkinSonGun(a)?.getTime() ?? Infinity) - (etkinSonGun(b)?.getTime() ?? Infinity))
      if (!l.length) return null
      const s = l[0]
      const gun = etkinSonGun(s)
      return { metin: `Avansı yatırın; ${gun ? `kesin süre ${tarihKisa(gun)} ` : ''}(HMK 120/324, teyit gerekli)`, neden: `Mahkeme avans istedi${s.tetikTarihi ? ` (${tarihKisa(s.tetikTarihi)})` : ''}; yatırıldığına dair kanıt yok.`, kanit: temiz([sureKaniti(s), belgeKaniti(g, s.kaynakBelgeId)]), sonGun: gun, adet: l.length }
    },
  }),
]

// ─────────────────────────── 8 SONUÇ VE TAHSİL ───────────────────────────

const HUKUM_ADI: Record<string, string> = { KABUL: 'kabul', KISMEN_KABUL: 'kısmen kabul', RET: 'ret', DIGER: 'diğer' }

const SN: Kural[] = [
  kural({
    kod: 'SN-01', grup: 'SN', durak: D(8), rol: R('A'), oncelik: O(3), senaryo: S('j'),
    kosulMetni: 'Karar evrakı geldi, karar kartı onaysız', oneriMetni: '"Kararı onaylayın"', eylem: ['Karar kartı', 'karar-karti'], hukukiEtiket: null,
    degerlendir(g) {
      for (const d of g.davalar) {
        if (d.kararOnayAt) continue
        const k = islemler(g, d, 'KARAR')[0]
        if (!k && !d.kararTarihi) continue
        return { metin: 'Kararı onaylayın', neden: `Karar ${tarihKisa(k?.tarih ?? d.kararTarihi)} geldi; karar kartı (hüküm, kabul edilen tutar, giderler) avukat onayı bekliyor.`, kanit: temiz([k ? { tur: 'DAVA_ISLEM', id: k.id, etiket: `Karar (${k.teyit === 'ADAY' ? 'aday' : 'onaylı'})`, tarih: gunMetni(k.tarih) } : { tur: 'DAVA', id: d.id, etiket: 'Karar tarihi', tarih: gunMetni(d.kararTarihi) }, belgeKaniti(g, k?.kaynakBelgeId)]) }
      }
      return null
    },
  }),
  kural({
    kod: 'SN-02', grup: 'SN', durak: D(8), rol: R('A'), oncelik: O(4), senaryo: S('j'),
    kosulMetni: 'Karar onaylı, sonraki yol seçilmedi', oneriMetni: '"Takibe devam ve kanun yolu seçimi (müvekkil onayı)"', eylem: ['Seç', 'karar-sonrasi-yol'], hukukiEtiket: 'HMK 341, 345 (teyit gerekli)',
    degerlendir(g) {
      const d = g.davalar.find((x) => x.kararOnayAt && !x.kesinlesmeTarihi && !gecerliYolSecimi(g, 'KARAR_SONRASI', x.id))
      if (!d) return null
      return { metin: 'Takibe devam ve kanun yolu seçimi (müvekkil onayı)', neden: `Karar onaylı (${HUKUM_ADI[d.hukum ?? ''] ?? 'hüküm'}); takibe devam ve kanun yolu kararı kayıtlı değil. Kanun yolu kararı müvekkilindir.`, kanit: [{ tur: 'DAVA', id: d.id, etiket: `Karar kartı (onaylı) · ${HUKUM_ADI[d.hukum ?? ''] ?? '—'}`, tarih: gunMetni(d.kararTarihi) }] }
    },
  }),
  kural({
    kod: 'SN-03', grup: 'SN', durak: D(8), rol: R('A'), oncelik: O(4), senaryo: S('j'),
    kosulMetni: 'Kısmi kabul', oneriMetni: '"Takibi kabul edilen kısımla daraltın (teyit gerekli)"', eylem: ['Talep taslağı', 'talep-taslak'], hukukiEtiket: 'teyit gerekli',
    degerlendir(g) {
      const d = g.davalar.find((x) => x.kararOnayAt && x.hukum === 'KISMEN_KABUL'
        && gecerliYolSecimi(g, 'KARAR_SONRASI', x.id)?.secim !== 'TAKIBI_DARALT' && !dilekceVar(g, 'TALEP', { sonra: x.kararTarihi }))
      if (!d) return null
      return { metin: 'Takibi kabul edilen kısımla daraltın (teyit gerekli)', neden: 'Karar kısmen kabul; takip talebi kabul edilen kısımla daraltılmadı.', kanit: [{ tur: 'DAVA', id: d.id, etiket: 'Karar: kısmen kabul', tarih: gunMetni(d.kararTarihi) }] }
    },
  }),
  kural({
    kod: 'SN-04', grup: 'SN', durak: D(8), rol: R('H'), oncelik: O(3), senaryo: S('j'),
    kosulMetni: 'Karar var, gerekçeli karar tebliğ tarihi yok', oneriMetni: '"Gerekçeli karar tebliğ tarihini girin (istinaf süresi)"', eylem: ['Tarih gir', 'gerekceli-teblig-tarih'], hukukiEtiket: 'HMK 345 (teyit gerekli)',
    degerlendir(g) {
      const d = g.davalar.find((x) => x.kararOnayAt && !x.gerekceliTebligTarihi && !x.kesinlesmeTarihi)
      if (!d) return null
      return { metin: 'Gerekçeli karar tebliğ tarihini girin (istinaf süresi)', neden: 'Karar onaylı; gerekçeli kararın tebliğ tarihi girilmedi. İstinaf süresi bu tarihe bağlıdır (teyit gerekli).', kanit: [{ tur: 'DAVA', id: d.id, etiket: 'Karar (onaylı)', tarih: gunMetni(d.kararTarihi) }] }
    },
  }),
  kural({
    kod: 'SN-05', grup: 'SN', durak: D(8), rol: R('-'), oncelik: O(6), senaryo: S('j'), tur: 'BILGI', durumu: 'VERI_BEKLIYOR',
    veriNotu: 'Yıllık parasal sınır tablosu (HMK 341, K1 onaylı) programda yok; tablo gelince etkinleşir.',
    kosulMetni: 'Karar parasal sınırın altında olabilir', oneriMetni: 'Bilgi: "Karar kesin olabilir (HMK 341, sınır tablosu teyit gerekli)"', eylem: null, hukukiEtiket: 'HMK 341 (teyit gerekli)',
    degerlendir() { return null },
  }),
  kural({
    kod: 'SN-06', grup: 'SN', durak: D(8), rol: R('A'), oncelik: O(4), senaryo: S('j'),
    kosulMetni: 'UYAP "kapalı", kapanış sebebi yok', oneriMetni: '"Kapanış sebebini seçin (bilinmiyorsa radarda kalır)"', eylem: ['Seç', 'kapanis-sec'], hukukiEtiket: null,
    degerlendir(g) {
      if (!uyapKapali(g) || kapandi(g)) return null
      return { metin: 'Kapanış sebebini seçin (bilinmiyorsa radarda kalır)', neden: `UYAP durum metni "${kisalt(g.dosya.uyapDurum, 60)}"; kapanış sebebi kayıtlı değil. Program kapanışı kendisi yazmaz.`, kanit: [{ tur: 'SENKRON', id: g.dosya.id, etiket: `UYAP durum metni: ${kisalt(g.dosya.uyapDurum, 60)}`, tarih: gunMetni(g.dosya.uyapSenkronAt) }] }
    },
  }),
  kural({
    kod: 'SN-07', grup: 'SN', durak: D(8), rol: R('H'), oncelik: O(4), senaryo: S('j'),
    kosulMetni: 'UYAP hesabındaki "Yatan Para" arttı (fark kadar TAHSILAT_BORCLUDAN adayı)', oneriMetni: '"Tahsilatı onaylayın: [tutar] (UYAP hesap özeti)"', eylem: ['Onayla', 'tahsilat-onay'], hukukiEtiket: null,
    degerlendir(g) {
      const l = g.olaylar.filter((o) => o.altTip === 'TAHSILAT_BORCLUDAN' && o.teyit === 'ADAY')
      if (!l.length) return null
      const toplam = l.reduce((t, o) => t + (o.tutar ?? 0), 0)
      return { metin: `Tahsilatı onaylayın: ${tutarMetni(toplam)} (UYAP hesap özeti)`, neden: 'UYAP hesabındaki "Yatan Para" arttı; tarih senkronda görüldüğü gündür, hukuki tahsil tarihi değildir.', kanit: l.slice(0, 3).map(olayKaniti), adet: l.length }
    },
  }),
  kural({
    kod: 'SN-08', grup: 'SN', durak: D(8), rol: R('A'), oncelik: O(5), senaryo: S('j'), durumu: 'VERI_BEKLIYOR',
    veriNotu: 'Müvekkil bildirimlerinin kaydı (hangi gelişme bildirildi) şemada yok; bildirim kaydı gelince etkinleşir.',
    kosulMetni: 'Kritik gelişme müvekkile bildirilmedi (karar, arabuluculuk sonucu, tahsilat)', oneriMetni: '"Müvekkil bildirim taslağını onaylayın"', eylem: ['Taslağı aç', 'muvekkil-bildirim'], hukukiEtiket: null,
    degerlendir() { return null },
  }),
]

// ─────────────────────────── tablo ───────────────────────────

/** Kural tablosu, 06 §8.3'teki sırayla. Eşit öncelik ve eşit son günde tablo sırası belirleyicidir. */
export const KURALLAR: readonly Kural[] = Object.freeze([...GN, ...EV, ...HZ, ...ID, ...TK, ...TB, ...AR, ...DA, ...YR, ...SN])

export const KURAL_KODLARI: readonly string[] = Object.freeze(KURALLAR.map((k) => k.kod))

export function kuralBul(kod: string): Kural | null {
  return KURALLAR.find((k) => k.kod === kod) ?? null
}

/** Ana senaryonun her adımı (06 §2 a–j) için kurallar — her adımın en az bir birincil eylemli kuralı olmalı. */
export function senaryoKurallari(adim: SenaryoAdimi): Kural[] {
  return KURALLAR.filter((k) => k.senaryo.includes(adim))
}

