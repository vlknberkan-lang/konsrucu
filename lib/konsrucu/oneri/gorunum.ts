/**
 * KonsRücü — Öneri paneli görünüm kurucusu · lib/konsrucu/oneri/gorunum.ts  (saf; DB yok — sunucuda çağrılır)
 *
 * Yükleyicinin (yukle.ts) okuduğu satırlardan istemci bileşenlerinin verisini kurar:
 *   Bulduklarımız (S18), Rücu sebebi seçimi (S19), Eksik evrak (S19), Yetkili icra seçimi (S19).
 * Kişisel veri burada maskelenir; istemciye ham plaka ya da alıntıdaki TCKN/telefon/IBAN gitmez.
 */
import { alanTanimi, degerEsit, degerGorunum, degerNormal, KAYNAK_ETIKET, type AlanTanimi, type KaynakTuru, type OdemeDegeri, type YetkiliIcraDegeri } from './alanlar'
import { binKatSuphesi, celiskiVar, onaylayabilir, topluOnayUygunMu, type AlanKaydi } from './karar'
import { hugoMetniGenislet } from './kaynaklar'
import { ekranMaskele } from './maske-gorunum'
import { rayEvrakIstekTaslagi } from './ray-istek'
import { yetkiliIcraSecenekleri, type YetkiliIcraBorclu } from './yetkili-icra'
import {
  asgariSetDurumu, bransKodlari, ev07Durumu, gsRejimi, hugoRucuNedeniEsle, k1Etiketi, kodBransaUygunMu,
  RUCU_SEBEBI_KODLARI, RUCU_SEBEBI_TANIM, rucuSebebiKoduMu, type AsgariBelge, type RucuSebebiKodu,
} from '@/lib/konsrucu/rucu-sebebi'
import type {
  AlanSatiri, BulduklarimizVerisi, EksikEvrakVerisi, Engel, KullaniciYetkisi, OneriGorunum, RucuSebebiVerisi, YetkiliIcraVerisi,
} from './tipler'

/** Yükleyicinin okuduğu AlanDegeri satırı. */
export type PanelSatiri = AlanKaydi & {
  sayfa: number | null
  alinti: string | null
  guven: number | null
  onaylayanId: string | null
  onayAt: Date | null
  createdAt: Date
}

export type PanelBelge = { id: string; dosyaAdi: string; storagePath?: string | null }

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const paraYaz = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'

/** Bulduklarımız'da gösterilmeyen alanlar (kendi seçim bileşenleri var). */
const KART_DISI = new Set(['yetkiliIcra'])

function duzeltBaslangic(tanim: AlanTanimi, v: unknown): { deger: string; tarih: string } {
  if (tanim.maskeli) return { deger: '', tarih: '' }
  const x = degerNormal(tanim.tip, v)
  if (x == null) return { deger: '', tarih: '' }
  switch (tanim.tip) {
    case 'PARA': return { deger: String(x).replace('.', ','), tarih: '' }
    case 'ODEME': { const o = x as OdemeDegeri; return { deger: String(o.tutar).replace('.', ','), tarih: o.tarih ?? '' } }
    case 'YETKILI_ICRA': return { deger: (x as YetkiliIcraDegeri).icraDairesi, tarih: '' }
    case 'PLAKA_LISTE': return { deger: (x as string[]).join(', '), tarih: '' }
    default: return { deger: String(x), tarih: '' }
  }
}

function gorunumKur(
  s: PanelSatiri, tanim: AlanTanimi, alanSatirlari: PanelSatiri[], onayli: PanelSatiri | null,
  yetki: KullaniciYetkisi, belgeler: Map<string, PanelBelge>, kullanicilar: Record<string, string>,
): OneriGorunum {
  const belge = s.kaynakBelgeId ? belgeler.get(s.kaynakBelgeId) ?? null : null
  const kaynak = s.kaynakTuru as KaynakTuru
  return {
    id: s.id, alan: s.alan, durum: s.durum as OneriGorunum['durum'],
    deger: degerGorunum(tanim.tip, s.degerJson, tanim.maskeli),
    maskeli: tanim.maskeli,
    kaynakTuru: kaynak, kaynakEtiketi: KAYNAK_ETIKET[kaynak] ?? s.kaynakTuru,
    belgeId: belge?.id ?? null, belgeAdi: belge?.dosyaAdi ?? null, belgeAcilabilir: !!belge?.storagePath,
    sayfa: s.sayfa, alinti: ekranMaskele(s.alinti),
    alintiDurumu: s.alintiDogru === true ? 'DOGRU' : s.alintiDogru === false ? 'KAYNAKSIZ' : 'YOK',
    guven: s.guven, uretici: s.uretici ?? null, createdAt: s.createdAt.toISOString(),
    onaylayanAd: s.onaylayanId ? kullanicilar[s.onaylayanId] ?? null : null, onayAt: iso(s.onayAt),
    onayliylaAyni: !!onayli && onayli.id !== s.id && degerEsit(tanim.tip, onayli.degerJson, s.degerJson),
    topluUygun: topluOnayUygunMu(s, alanSatirlari),
    onaylayabilir: onaylayabilir(yetki, tanim),
    duzelt: duzeltBaslangic(tanim, s.degerJson),
  }
}

// ───────────────────────── Bulduklarımız ─────────────────────────

export function bulduklarimizKur(g: {
  dosyaId: string
  yetki: KullaniciYetkisi
  aiAcik: boolean
  satirlar: readonly PanelSatiri[]
  belgeler: readonly PanelBelge[]
  kullanicilar: Record<string, string>
  /** Hugo'dan gelen rücu tutarı (bin kat kontrolü için; yoksa null). */
  hugoRucuTutari: number | null
  /** Odeme tablosundaki (hesap dışı olmayan) ödemelerin toplamı. */
  odemeToplami: number | null
}): BulduklarimizVerisi {
  const belgeler = new Map(g.belgeler.map((b) => [b.id, b]))
  const gruplar = new Map<string, PanelSatiri[]>()
  for (const s of g.satirlar) {
    if (s.durum !== 'ONERI' && s.durum !== 'ONAYLI') continue
    if (KART_DISI.has(s.alan) || !alanTanimi(s.alan)) continue
    gruplar.set(s.alan, [...(gruplar.get(s.alan) ?? []), s])
  }

  const satirlar: AlanSatiri[] = []
  for (const [alan, liste] of gruplar) {
    const tanim = alanTanimi(alan)!
    const onayliS = liste.find((s) => s.durum === 'ONAYLI') ?? null
    const oneriler = liste
      .filter((s) => s.durum === 'ONERI')
      .sort((a, b) => (b.guven ?? 0) - (a.guven ?? 0) || a.createdAt.getTime() - b.createdAt.getTime())
    satirlar.push({
      alan, etiket: tanim.etiket, tip: tanim.tip, kritik: tanim.kritik, karar: tanim.karar,
      onayli: onayliS ? gorunumKur(onayliS, tanim, liste, onayliS, g.yetki, belgeler, g.kullanicilar) : null,
      oneriler: oneriler.map((s) => gorunumKur(s, tanim, liste, onayliS, g.yetki, belgeler, g.kullanicilar)),
      celiski: celiskiVar(tanim, liste),
    })
  }
  satirlar.sort((a, b) => (alanTanimi(a.alan)!.sira - alanTanimi(b.alan)!.sira) || a.alan.localeCompare(b.alan))

  const engeller: Engel[] = []
  // bin kat: Hugo rücu tutarı ↔ ödeme toplamı (Odeme yoksa bekleyen ödeme önerilerinin toplamı)
  const bekleyenOdemeToplami = satirlar
    .filter((s) => s.tip === 'ODEME')
    .flatMap((s) => (s.onayli ? [] : g.satirlar.filter((x) => x.alan === s.alan && x.durum === 'ONERI').slice(0, 1)))
    .reduce((t, x) => t + ((degerNormal('ODEME', x.degerJson) as OdemeDegeri | null)?.tutar ?? 0), 0)
  const karsilastirma = g.odemeToplami && g.odemeToplami > 0 ? g.odemeToplami : bekleyenOdemeToplami > 0 ? bekleyenOdemeToplami : null
  if (binKatSuphesi(g.hugoRucuTutari, karsilastirma)) {
    const kucuk = (g.hugoRucuTutari ?? 0) < (karsilastirma ?? 0)
    engeller.push({
      tur: 'BIN_KAT', alan: 'rucuTutari', baslik: 'Tutar şüphesi',
      aciklama: `Hugo rücu tutarı (${paraYaz(g.hugoRucuTutari!)}) dekont toplamının (${paraYaz(karsilastirma!)}) yaklaşık ${kucuk ? "1000'de biri" : '1000 katı'}. Hugo hücresi yanlış okunmuş olabilir; tutarı doğrulayın.`,
    })
  }
  for (const s of satirlar) {
    if (!s.celiski) continue
    const degerler = [...(s.onayli ? [s.onayli] : []), ...s.oneriler].map((o) => `${o.kaynakEtiketi}${o.durum === 'ONAYLI' ? ' (onaylı)' : ''}: ${o.deger}`)
    engeller.push({ tur: 'CELISKI', alan: s.alan, baslik: `${s.etiket}: kaynaklar farklı`, aciklama: degerler.join(' · ') })
  }

  const bekleyenler = satirlar.flatMap((s) => s.oneriler)
  const kaynaksiz = satirlar.filter((s) => s.oneriler.some((o) => o.alintiDurumu === 'KAYNAKSIZ')).map((s) => ({ alan: s.alan, etiket: s.etiket }))
  return {
    dosyaId: g.dosyaId, yetki: g.yetki, aiAcik: g.aiAcik, satirlar, engeller,
    bekleyen: bekleyenler.length,
    kritikBekleyen: satirlar.filter((s) => s.kritik).reduce((t, s) => t + s.oneriler.length, 0),
    kaynaksiz,
    topluUygunIds: bekleyenler.filter((o) => o.topluUygun && o.onaylayabilir).map((o) => o.id),
  }
}

// ───────────────────────── Rücu sebebi ─────────────────────────

export function rucuSebebiKur(g: {
  dosyaId: string
  yetki: KullaniciYetkisi
  hugoHam: string | null
  brans: string | null
  satirlar: readonly PanelSatiri[]
  policeTanzim: Date | string | null
  policeBaslangic: Date | string | null
  kullanicilar: Record<string, string>
  /** RucuDosyasi.kaynakJson — oto dışı dosyalarda "Rücu Nedeni Detay" (kaynakJson.aciklama) eşleştiriciye eklenir. */
  kaynakJson?: unknown
}): RucuSebebiVerisi {
  const kodSatirlari = g.satirlar.filter((s) => s.alan === 'rucuSebebiKod')
  const onayliS = kodSatirlari.find((s) => s.durum === 'ONAYLI' && rucuSebebiKoduMu(s.degerJson))
  const onayliKod = onayliS ? (onayliS.degerJson as RucuSebebiKodu) : null
  const oneriler = kodSatirlari
    .filter((s) => s.durum === 'ONERI' && rucuSebebiKoduMu(s.degerJson))
    .sort((a, b) => (b.guven ?? 0) - (a.guven ?? 0))
    .map((s) => {
      const kod = s.degerJson as RucuSebebiKodu
      return { id: s.id, kod, ad: RUCU_SEBEBI_TANIM[kod].ad, kaynakEtiketi: KAYNAK_ETIKET[s.kaynakTuru as KaynakTuru] ?? s.kaynakTuru, guven: s.guven, k1Etiketi: k1Etiketi(kod) }
    })
  const hugo = hugoRucuNedeniEsle(hugoMetniGenislet(g.hugoHam, g.brans, g.kaynakJson), g.brans)
  const uygun = new Set(bransKodlari(g.brans))
  const secenekler = [...RUCU_SEBEBI_KODLARI]
    .sort((a, b) => Number(uygun.has(b)) - Number(uygun.has(a)))
    .map((kod) => ({
      kod, ad: RUCU_SEBEBI_TANIM[kod].ad, k1Etiketi: k1Etiketi(kod), bransUygun: kodBransaUygunMu(kod, g.brans),
      gerekceZorunlu: RUCU_SEBEBI_TANIM[kod].gerekceZorunlu,
    }))
  const etkinKod = onayliKod ?? oneriler[0]?.kod ?? null
  const tanim = etkinKod ? RUCU_SEBEBI_TANIM[etkinKod] : null
  const ev07 = ev07Durumu({ onayliKod, oneriKod: oneriler[0]?.kod ?? hugo.kod, brans: g.brans })
  return {
    dosyaId: g.dosyaId, yetki: g.yetki, hugoHam: g.hugoHam?.trim() || null, brans: g.brans,
    onayli: onayliS && onayliKod ? {
      id: onayliS.id, kod: onayliKod, ad: RUCU_SEBEBI_TANIM[onayliKod].ad, k1Etiketi: k1Etiketi(onayliKod),
      teyitGerekli: RUCU_SEBEBI_TANIM[onayliKod].k1 !== 'DOGRULANDI',
      onaylayanAd: onayliS.onaylayanId ? g.kullanicilar[onayliS.onaylayanId] ?? null : null,
    } : null,
    oneriler,
    hugoAdaylar: hugo.kod ? [] : hugo.adaylar,
    hugoGerekce: g.hugoHam?.trim() ? hugo.gerekce : null,
    secenekler,
    gsRejimi: gsRejimi({ kod: etkinKod, policeTanzim: g.policeTanzim, policeBaslangic: g.policeBaslangic }),
    dayanaklar: tanim ? tanim.dayanaklar.map((d) => ({ ...d })) : [],
    notlar: tanim ? [...tanim.notlar] : [],
    ev07: { gerekli: ev07.gerekli, teyitGerekli: ev07.teyitGerekli, metin: ev07.metin },
  }
}

// ───────────────────────── Eksik evrak ─────────────────────────

export function eksikEvrakKur(g: {
  dosyaId: string
  yetki: KullaniciYetkisi
  onayliKod: RucuSebebiKodu | null
  oneriKod: RucuSebebiKodu | null
  belgeler: readonly AsgariBelge[]
  hukukDosyaNo: string | null
  hasarDosyaNo: string | null
  buroAdi: string | null
}): EksikEvrakVerisi {
  const kod = g.onayliKod ?? g.oneriKod
  if (!kod) {
    return { dosyaId: g.dosyaId, yetki: g.yetki, kod: null, kodAd: null, oneriyeGore: false, k1Etiketi: null, ogeler: [], eksikSayisi: 0, kontrolSayisi: 0, rayTaslagi: null }
  }
  const d = asgariSetDurumu(kod, g.belgeler)
  const istenecek = [
    ...d.eksikler.filter((o) => o.rayIstenir).map((o) => ({ ad: o.ad })),
    ...d.kontrolEdilecekler.filter((o) => o.rayIstenir).map((o) => ({ ad: o.ad, aciklama: 'varsa' })),
  ]
  return {
    dosyaId: g.dosyaId, yetki: g.yetki, kod, kodAd: d.kodAd, oneriyeGore: !g.onayliKod, k1Etiketi: k1Etiketi(kod),
    ogeler: d.ogeler, eksikSayisi: d.eksikler.length, kontrolSayisi: d.kontrolEdilecekler.length,
    rayTaslagi: d.eksikler.length
      ? rayEvrakIstekTaslagi({ hukukDosyaNo: g.hukukDosyaNo, hasarDosyaNo: g.hasarDosyaNo, rucuSebebiAd: d.kodAd, eksikler: istenecek, buroAdi: g.buroAdi })
      : null,
  }
}

// ───────────────────────── Yetkili icra ─────────────────────────

export function yetkiliIcraKur(g: {
  dosyaId: string
  yetki: KullaniciYetkisi
  kazaYeri: string | null
  il: string | null
  borclular: readonly YetkiliIcraBorclu[]
  satirlar: readonly PanelSatiri[]
  eskiDeger: string | null
  kullanicilar: Record<string, string>
}): YetkiliIcraVerisi {
  const { secenekler, uyarilar } = yetkiliIcraSecenekleri({ kazaYeri: g.kazaYeri, il: g.il, borclular: g.borclular })
  const onayliS = g.satirlar.find((s) => s.alan === 'yetkiliIcra' && s.durum === 'ONAYLI') ?? null
  const onayliD = onayliS ? (degerNormal('YETKILI_ICRA', onayliS.degerJson) as YetkiliIcraDegeri | null) : null
  return {
    dosyaId: g.dosyaId, yetki: g.yetki,
    secenekler: secenekler.map((s) => ({ anahtar: s.anahtar, secenek: s.secenek, icraDairesi: s.icraDairesi, baslik: s.baslik, gerekce: s.gerekce, dayanak: s.dayanak, borcluId: s.borcluId })),
    uyarilar,
    onayli: onayliS && onayliD ? {
      id: onayliS.id, icraDairesi: onayliD.icraDairesi, secenek: onayliD.secenek, gerekce: onayliD.gerekce ?? null,
      onaylayanAd: onayliS.onaylayanId ? g.kullanicilar[onayliS.onaylayanId] ?? null : null, onayAt: iso(onayliS.onayAt),
    } : null,
    eskiDeger: onayliS ? null : g.eskiDeger?.trim() || null,
  }
}
