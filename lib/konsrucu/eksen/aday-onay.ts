/**
 * KonsRücü — Aday onayı → BorcluTakip AYNASI · lib/konsrucu/eksen/aday-onay.ts (saf plan)
 *
 * Plan S23 (`lib/icra/aday-onay.ts` karşılığı): tebliğ, itiraz ve itirazın alacaklıya tebliği BORÇLU BAZINDA
 * öneri kartıyla onaylanır (06 §2(e); B08). Onaylanan değer `BorcluTakip`e aynalanır; aday `TEYITLI` olur.
 * Bu modül SAF planı kurar (hangi alan, hangi değer, hangi uyarı); veritabanı işlemi aday-onay-db.ts'tedir.
 *
 * Kurallar:
 *   • İADE tebliğ değildir: onaylı bir tebliğin üzerine İADE yazılmaz; süre başlamaz (docs/04 K3).
 *   • Onaylı tebliğ ya da itirazın üzerine başka tarih ancak açık "üzerine yaz" onayıyla yazılır.
 *   • Kısmi itirazda itiraz edilen tutar zorunludur (06 §2(e) "Ne ters gidebilir").
 *   • Kalem kaşesi UYAP kayıt tarihinden sonra olamaz; ileri tarih kabul edilmez (tarih uydurulmaz).
 *   • Kesinleşme riski azaltır: yalnız ikinci onayla (kesinlesmeOnay) ve yalnız avukat (eylem katmanı denetler).
 *   • Tahsilat (UYAP Yatan Para) onayı Para panelinin işidir (S31); dava bağı dava kartının (S27–S28).
 */
import { ayniGun, gunEkle, gunNo, gunTR } from './norm'
import {
  ALT_TIP_ETIKET, ITIRAZ_KAPSAM_ANAHTAR, ITIRAZ_KAPSAM_ETIKET, KURAL, type AltTip, type ItirazKapsam, type ItirazTipi, type Muhatap, type TebligSekli,
} from './sabitler'

export type OnayAday = {
  id: string
  altTip: string | null
  teyit: string | null
  borcluId: string | null
  hukukiTarih: Date | null
  /** Olayın eklentideki tarihi (hukuki tarih boşsa öneri olarak) */
  tarih: Date | null
  sonuc: string | null
  tebligSekli: string | null
  muhatap: string | null
  kaynakBelgeId: string | null
  kaynakTuru: string | null
  kural: string | null
}

export type BorcluTakipAlanlari = {
  tebligTarihi: Date | null
  tebligSekli: string | null
  tebligSonucu: string | null
  uetsUlasmaTarihi: Date | null
  tebligKaynakBelgeId: string | null
  itirazVar: boolean | null
  itirazVerilisTarihi: Date | null
  itirazUyapTarihi: Date | null
  itirazTipi: string | null
  itirazKapsamJson: ItirazKapsam | null
  itirazEdilenTutar: number | null
  itirazKaynakBelgeId: string | null
  itirazAlacakliyaTebligTarihi: Date | null
  itirazAlacakliyaTebligKaynak: string | null
}

export type MevcutBorcluTakip = { id: string; borcluId: string; updatedAt: Date } & BorcluTakipAlanlari

export type OnayGirdisi = {
  /** Düzelt: aile içinde yeniden sınıflandırma (ör. alacaklı vekiline giden tebliğ → itirazın size tebliği) */
  altTip?: AltTip | null
  borcluId?: string | null
  /** İtiraz birden çok borçluya aitse */
  borcluIdler?: string[] | null
  tarih?: Date | null
  sonuc?: 'TEBLIG' | 'IADE' | null
  tebligSekli?: TebligSekli | null
  uetsUlasmaTarihi?: Date | null
  itirazVerilisTarihi?: Date | null
  itirazTipi?: ItirazTipi | null
  itirazKapsam?: ItirazKapsam | null
  itirazEdilenTutar?: number | null
  kesinlesmeOnay?: boolean
  ustuneYaz?: boolean
}

export type OnayYolu = 'TEBLIG' | 'ITIRAZ' | 'ALACAKLIYA_TEBLIG' | 'KESINLESME' | 'GENEL' | 'YOK'

/** Hangi kart formu, hangi onay yolu? */
export function onayYolu(altTip: string | null): OnayYolu {
  switch (altTip) {
    case 'TEBLIG_SONUCU':
    case 'TEBLIG_IADE':
      return 'TEBLIG'
    case 'ITIRAZ':
    case 'DURDURMA_ITIRAZ':
      return 'ITIRAZ'
    case 'ITIRAZIN_ALACAKLIYA_TEBLIGI':
      return 'ALACAKLIYA_TEBLIG'
    case 'KESINLESME_SERHI':
      return 'KESINLESME'
    case 'TAHSILAT_BORCLUDAN':
    case 'DAVA_ACILDI_SINYALI':
      return 'YOK'
    default:
      return 'GENEL'
  }
}

/** Onay yolu YOK olan adayın neden bu kartta onaylanmadığı. */
export function onayYokNedeni(altTip: string | null): string | null {
  if (altTip === 'TAHSILAT_BORCLUDAN') return 'Tahsilat onayı Para panelinden yapılır.'
  if (altTip === 'DAVA_ACILDI_SINYALI') return 'Dava bağı "Bulunan dava" kartından onaylanır.'
  return null
}

const DUZELTME_AILESI: readonly AltTip[] = ['TEBLIG_SONUCU', 'TEBLIG_IADE', 'ITIRAZ', 'DURDURMA_ITIRAZ', 'ITIRAZIN_ALACAKLIYA_TEBLIGI']

export type OnayPlani =
  | { ok: false; hata: string }
  | {
      ok: true
      altTip: AltTip
      olay: { hukukiTarih: Date | null; sonuc: string | null; tebligSekli: string | null; borcluId: string | null; muhatap: Muhatap | null }
      /** Borçlu başına yazılacak alanlar ve önceki değerler (geri alma için) */
      aynalar: { borcluId: string; mevcutId: string | null; beklenenGuncelleme: Date | null; alanlar: Partial<BorcluTakipAlanlari>; onceki: Partial<BorcluTakipAlanlari> }[]
      uyarilar: string[]
      aktivite: string
    }

function sec<T extends keyof BorcluTakipAlanlari>(m: MevcutBorcluTakip | undefined, anahtarlar: readonly T[]): Partial<BorcluTakipAlanlari> {
  const o: Partial<BorcluTakipAlanlari> = {}
  for (const k of anahtarlar) (o as Record<string, unknown>)[k] = m ? m[k] : null
  return o
}

const TEBLIG_ALANLARI = ['tebligTarihi', 'tebligSekli', 'tebligSonucu', 'uetsUlasmaTarihi', 'tebligKaynakBelgeId'] as const
const ITIRAZ_ALANLARI = ['itirazVar', 'itirazVerilisTarihi', 'itirazUyapTarihi', 'itirazTipi', 'itirazKapsamJson', 'itirazEdilenTutar', 'itirazKaynakBelgeId'] as const
const ALACAKLIYA_ALANLARI = ['itirazAlacakliyaTebligTarihi', 'itirazAlacakliyaTebligKaynak'] as const

/** Tek borçlu varsa onu, yoksa girdiyi, yoksa adayın borçlusunu seçer. */
function borcluCoz(girdi: OnayGirdisi, aday: OnayAday, borclular: { id: string }[], tercih?: (b: { id: string }) => boolean): string | null {
  if (girdi.borcluId) return girdi.borcluId
  if (aday.borcluId) return aday.borcluId
  if (borclular.length === 1) return borclular[0].id
  if (tercih) {
    const uygun = borclular.filter(tercih)
    if (uygun.length === 1) return uygun[0].id
  }
  return null
}

/**
 * Onay planı. `bugun` ileri tarih denetimi içindir. `mevcutlar` dosyanın BorcluTakip satırlarıdır (silinmemiş).
 * `borclular` yalnız BU dosyanın borçluları olmalı (M7: BorcluTakip.dosyaId = Borclu.dosyaId).
 */
export function onayPlani(p: {
  aday: OnayAday
  girdi: OnayGirdisi
  borclular: { id: string }[]
  mevcutlar: MevcutBorcluTakip[]
  takipTarihi: Date | null
  bugun: Date
}): OnayPlani {
  const { aday, girdi, borclular, mevcutlar, bugun } = p
  if (aday.teyit !== 'ADAY') return { ok: false, hata: 'Bu gelişme az önce işlendi; sayfayı yenileyin.' }
  let altTip = (aday.altTip ?? 'DIGER') as AltTip
  if (girdi.altTip && girdi.altTip !== altTip) {
    if (!DUZELTME_AILESI.includes(altTip) || !DUZELTME_AILESI.includes(girdi.altTip)) return { ok: false, hata: 'Bu gelişmenin türü bu kartta değiştirilemez.' }
    altTip = girdi.altTip
  }
  // Alacaklı vekiline yapılan tebliğ ödeme emri tebliği değildir → itirazın size tebliği.
  if (altTip === 'TEBLIG_SONUCU' && aday.muhatap === 'ALACAKLI_VEKILI' && !girdi.altTip) altTip = 'ITIRAZIN_ALACAKLIYA_TEBLIGI'
  const yol = onayYolu(altTip)
  if (yol === 'YOK') return { ok: false, hata: onayYokNedeni(altTip) ?? 'Bu gelişme burada onaylanmaz.' }

  const ileri = (d: Date | null | undefined) => !!d && gunNo(d) > gunNo(bugun)
  for (const d of [girdi.tarih, girdi.uetsUlasmaTarihi, girdi.itirazVerilisTarihi]) {
    if (ileri(d)) return { ok: false, hata: 'İleri bir tarih girilemez.' }
  }
  const borcluIdSet = new Set(borclular.map((b) => b.id))
  const mevcutBul = (id: string) => mevcutlar.find((m) => m.borcluId === id)
  const uyarilar: string[] = []
  const takipOncesi = (d: Date | null) => !!d && !!p.takipTarihi && gunNo(d) < gunNo(p.takipTarihi)

  // ── GENEL ve KESİNLEŞME: yalnız aday teyidi, ayna yok ──
  if (yol === 'GENEL' || yol === 'KESINLESME') {
    if (yol === 'KESINLESME' && girdi.kesinlesmeOnay !== true) {
      return { ok: false, hata: 'Kesinleşme riski azaltan bir karardır: ikinci onay kutusunu işaretleyin.' }
    }
    const tarih = girdi.tarih ?? aday.hukukiTarih
    if (yol === 'KESINLESME') uyarilar.push('İCRA ekseni kesinleşti olarak hesaplanır; eski durum alanı değiştirilmedi.')
    return {
      ok: true, altTip, uyarilar, aynalar: [],
      olay: { hukukiTarih: tarih, sonuc: aday.sonuc, tebligSekli: aday.tebligSekli, borcluId: girdi.borcluId ?? aday.borcluId, muhatap: (aday.muhatap as Muhatap | null) ?? null },
      aktivite: `UYAP gelişmesi onaylandı: ${ALT_TIP_ETIKET[altTip] ?? altTip}${tarih ? ` · ${gunTR(tarih)}` : ''}`,
    }
  }

  // ── TEBLİĞ ──
  if (yol === 'TEBLIG') {
    const borcluId = borcluCoz(girdi, aday, borclular)
    if (!borcluId) return { ok: false, hata: 'Tebliğin hangi borçluya yapıldığını seçin.' }
    if (!borcluIdSet.has(borcluId)) return { ok: false, hata: 'Seçilen borçlu bu dosyaya ait değil.' }
    const sonuc = girdi.sonuc ?? (altTip === 'TEBLIG_IADE' ? 'IADE' : aday.sonuc === 'IADE' ? 'IADE' : aday.sonuc === 'TEBLIG' ? 'TEBLIG' : null)
    if (!sonuc) return { ok: false, hata: 'Tebliğ sonucunu seçin: tebliğ edildi mi, İADE mi?' }
    const sekil = (girdi.tebligSekli ?? (aday.tebligSekli as TebligSekli | null) ?? 'BELIRSIZ') as TebligSekli
    const ulasma = girdi.uetsUlasmaTarihi ?? null
    let tarih = girdi.tarih ?? aday.hukukiTarih
    if (sonuc === 'TEBLIG' && !tarih && sekil === 'UETS' && ulasma) {
      tarih = gunEkle(ulasma, 5)
      uyarilar.push(`Tebliğ tarihi UETS ulaşma + 5 gün olarak yazıldı: ${gunTR(tarih)} (Tebligat K. 7/a, teyit gerekli).`)
    }
    if (ileri(tarih)) return { ok: false, hata: 'İleri bir tarih girilemez.' }
    const m = mevcutBul(borcluId)
    if (sonuc === 'TEBLIG') {
      if (!tarih) return { ok: false, hata: 'Hukuki tebliğ tarihini girin (mazbatadaki tarih).' }
      if (takipOncesi(tarih)) uyarilar.push('Tebliğ tarihi takip tarihinden önce görünüyor: kontrol edin.')
      if (m?.tebligSonucu === 'TEBLIG' && m.tebligTarihi && !ayniGun(m.tebligTarihi, tarih) && !girdi.ustuneYaz) {
        return { ok: false, hata: `Bu borçluda onaylı tebliğ var (${gunTR(m.tebligTarihi)}). Değiştirmek için "üzerine yaz"ı işaretleyin.` }
      }
      const alanlar: Partial<BorcluTakipAlanlari> = {
        tebligTarihi: tarih, tebligSekli: sekil, tebligSonucu: 'TEBLIG',
        uetsUlasmaTarihi: sekil === 'UETS' ? ulasma ?? m?.uetsUlasmaTarihi ?? null : null,
        tebligKaynakBelgeId: aday.kaynakBelgeId ?? m?.tebligKaynakBelgeId ?? null,
      }
      if (m?.itirazVar === true) {
        const it = m.itirazVerilisTarihi ?? m.itirazUyapTarihi
        if (it && gunNo(it) > gunNo(gunEkle(tarih, 7))) uyarilar.push('İtiraz tebliğden 7 günden sonra görünüyor: gecikmiş itiraz olabilir (İİK 65, teyit gerekli).')
      }
      return {
        ok: true, altTip: 'TEBLIG_SONUCU', uyarilar,
        olay: { hukukiTarih: tarih, sonuc: 'TEBLIG', tebligSekli: sekil, borcluId, muhatap: 'BORCLU' },
        aynalar: [{ borcluId, mevcutId: m?.id ?? null, beklenenGuncelleme: m?.updatedAt ?? null, alanlar, onceki: sec(m, TEBLIG_ALANLARI) }],
        aktivite: `Tebliğ onaylandı: ${gunTR(tarih)} · ${sekil}`,
      }
    }
    // İADE
    if (m?.tebligSonucu === 'TEBLIG') {
      uyarilar.push(`Borçluda onaylı tebliğ var (${gunTR(m.tebligTarihi)}); İADE kaydı bilgi olarak tutuldu, tebliğ değiştirilmedi.`)
      return {
        ok: true, altTip: 'TEBLIG_IADE', uyarilar, aynalar: [],
        olay: { hukukiTarih: tarih, sonuc: 'IADE', tebligSekli: sekil, borcluId, muhatap: 'BORCLU' },
        aktivite: `İADE tebligat onaylandı (bilgi): ${gunTR(tarih)}`,
      }
    }
    uyarilar.push('Tebliğ edilemedi: yeni adres ya da TK 21/35 kararı gerekir (teyit gerekli). Süre başlamadı.')
    return {
      ok: true, altTip: 'TEBLIG_IADE', uyarilar,
      olay: { hukukiTarih: tarih, sonuc: 'IADE', tebligSekli: sekil, borcluId, muhatap: 'BORCLU' },
      aynalar: [{
        borcluId, mevcutId: m?.id ?? null, beklenenGuncelleme: m?.updatedAt ?? null,
        alanlar: { tebligSonucu: 'IADE', tebligSekli: sekil, tebligTarihi: null, tebligKaynakBelgeId: aday.kaynakBelgeId ?? m?.tebligKaynakBelgeId ?? null },
        onceki: sec(m, TEBLIG_ALANLARI),
      }],
      aktivite: `İADE tebligat onaylandı: ${gunTR(tarih)}`,
    }
  }

  // ── İTİRAZ ──
  if (yol === 'ITIRAZ') {
    const hedefler = (girdi.borcluIdler?.length ? girdi.borcluIdler : [borcluCoz(girdi, aday, borclular)]).filter((x): x is string => !!x)
    if (!hedefler.length) return { ok: false, hata: 'İtiraz eden borçluyu seçin.' }
    if (hedefler.some((b) => !borcluIdSet.has(b))) return { ok: false, hata: 'Seçilen borçlu bu dosyaya ait değil.' }
    const uyapTarihi = altTip === 'DURDURMA_ITIRAZ' ? girdi.tarih ?? null : girdi.tarih ?? aday.hukukiTarih
    const verilis = girdi.itirazVerilisTarihi ?? null
    if (ileri(uyapTarihi)) return { ok: false, hata: 'İleri bir tarih girilemez.' }
    if (verilis && uyapTarihi && gunNo(verilis) > gunNo(uyapTarihi)) return { ok: false, hata: 'Kalem kaşesi tarihi UYAP kayıt tarihinden sonra olamaz.' }
    const tip = girdi.itirazTipi ?? null
    const tutar = girdi.itirazEdilenTutar ?? null
    if (tip === 'KISMI' && !(tutar != null && tutar > 0)) return { ok: false, hata: 'Kısmi itirazda itiraz edilen tutar zorunludur.' }
    if (!tip) uyarilar.push('İtiraz kapsamı girilmedi: tam mı kısmi mi, sonra onaylayın.')
    if (!verilis && !uyapTarihi) uyarilar.push('İtiraz tarihi yok: İİK 67 hesaplanamaz; dilekçedeki kalem kaşesi tarihini girin (teyit gerekli).')
    else if (!verilis) uyarilar.push('Kalem kaşesi tarihi girilmedi: İİK 67 ihtiyatlı önerisi UYAP kayıt tarihinden hesaplanır, gerçek son gün daha erken olabilir.')
    if (takipOncesi(verilis ?? uyapTarihi)) uyarilar.push('İtiraz tarihi takip tarihinden önce görünüyor: kontrol edin.')
    const aynalar: Extract<OnayPlani, { ok: true }>['aynalar'] = []
    for (const borcluId of hedefler) {
      const m = mevcutBul(borcluId)
      if (m?.itirazVar === true && !girdi.ustuneYaz) {
        const eskiT = m.itirazVerilisTarihi ?? m.itirazUyapTarihi
        const yeniT = verilis ?? uyapTarihi
        if (eskiT && yeniT && !ayniGun(eskiT, yeniT)) return { ok: false, hata: `Bu borçluda onaylı itiraz var (${gunTR(eskiT)}). Değiştirmek için "üzerine yaz"ı işaretleyin.` }
      }
      if (m?.tebligSonucu === 'TEBLIG' && m.tebligTarihi) {
        const it = verilis ?? uyapTarihi
        if (it && gunNo(it) > gunNo(gunEkle(m.tebligTarihi, 7))) uyarilar.push('İtiraz tebliğden 7 günden sonra görünüyor: gecikmiş itiraz olabilir (İİK 65, teyit gerekli).')
      }
      aynalar.push({
        borcluId, mevcutId: m?.id ?? null, beklenenGuncelleme: m?.updatedAt ?? null,
        alanlar: {
          itirazVar: true,
          itirazVerilisTarihi: verilis ?? m?.itirazVerilisTarihi ?? null,
          itirazUyapTarihi: uyapTarihi ?? m?.itirazUyapTarihi ?? null,
          itirazTipi: tip ?? m?.itirazTipi ?? null,
          itirazKapsamJson: girdi.itirazKapsam ?? m?.itirazKapsamJson ?? null,
          itirazEdilenTutar: tip === 'TAM' ? null : tutar ?? m?.itirazEdilenTutar ?? null,
          itirazKaynakBelgeId: aday.kaynakBelgeId ?? m?.itirazKaynakBelgeId ?? null,
        },
        onceki: sec(m, ITIRAZ_ALANLARI),
      })
    }
    return {
      ok: true, altTip: altTip === 'DURDURMA_ITIRAZ' ? 'DURDURMA_ITIRAZ' : 'ITIRAZ', uyarilar, aynalar,
      olay: { hukukiTarih: uyapTarihi ?? verilis, sonuc: null, tebligSekli: null, borcluId: hedefler.length === 1 ? hedefler[0] : null, muhatap: null },
      aktivite: `İtiraz onaylandı${tip ? ` (${tip === 'TAM' ? 'tam' : 'kısmi'})` : ''}${verilis ? ` · kaşe ${gunTR(verilis)}` : ''}${uyapTarihi ? ` · UYAP ${gunTR(uyapTarihi)}` : ''} · ${hedefler.length} borçlu`,
    }
  }

  // ── İTİRAZIN ALACAKLIYA TEBLİĞİ ──
  const borcluId = borcluCoz(girdi, aday, borclular, (b) => mevcutBul(b.id)?.itirazVar === true)
  if (!borcluId) return { ok: false, hata: 'Hangi borçlunun itirazının size tebliğ edildiğini seçin.' }
  if (!borcluIdSet.has(borcluId)) return { ok: false, hata: 'Seçilen borçlu bu dosyaya ait değil.' }
  const tarih = girdi.tarih ?? aday.hukukiTarih
  if (!tarih) return { ok: false, hata: 'İtirazın size tebliğ tarihini girin (UETS\'teki tarih).' }
  if (ileri(tarih)) return { ok: false, hata: 'İleri bir tarih girilemez.' }
  const m = mevcutBul(borcluId)
  if (m?.itirazVar !== true) uyarilar.push('Bu borçlunun itirazı henüz onaylanmadı; önce itirazı onaylayın.')
  const it = m?.itirazVerilisTarihi ?? m?.itirazUyapTarihi
  if (it && gunNo(tarih) < gunNo(it)) return { ok: false, hata: 'İtirazın tebliği itirazdan önce olamaz.' }
  if (m?.itirazAlacakliyaTebligTarihi && !ayniGun(m.itirazAlacakliyaTebligTarihi, tarih) && !girdi.ustuneYaz) {
    return { ok: false, hata: `Bu borçlu için itirazın size tebliği zaten girilmiş (${gunTR(m.itirazAlacakliyaTebligTarihi)}). Değiştirmek için "üzerine yaz"ı işaretleyin.` }
  }
  const kaynak = aday.kaynakTuru === 'ELLE' ? 'ELLE' : 'UETS_MAZBATA'
  uyarilar.push('İİK 67 önerisi bu tarihten hesaplanır (teyit gerekli); onaylanan son günü süre defterinde girin.')
  return {
    ok: true, altTip: 'ITIRAZIN_ALACAKLIYA_TEBLIGI', uyarilar,
    olay: { hukukiTarih: tarih, sonuc: 'TEBLIG', tebligSekli: (girdi.tebligSekli ?? aday.tebligSekli ?? null) as string | null, borcluId, muhatap: 'ALACAKLI_VEKILI' },
    aynalar: [{
      borcluId, mevcutId: m?.id ?? null, beklenenGuncelleme: m?.updatedAt ?? null,
      alanlar: { itirazAlacakliyaTebligTarihi: tarih, itirazAlacakliyaTebligKaynak: kaynak },
      onceki: sec(m, ALACAKLIYA_ALANLARI),
    }],
    aktivite: `İtirazın size tebliği onaylandı: ${gunTR(tarih)} (${kaynak === 'ELLE' ? 'elle' : 'UETS mazbatası'})`,
  }
}

// ── TB-07: onaylı itirazın KAPSAMI (tam / kısmi, itiraz edilenler, tutar, kalem kaşesi) ─────────────────
export type KapsamGirdisi = {
  itirazTipi: ItirazTipi
  itirazKapsam?: ItirazKapsam | null
  itirazEdilenTutar?: number | null
  itirazVerilisTarihi?: Date | null
  ustuneYaz?: boolean
}

export type KapsamPlani =
  | { ok: false; hata: string }
  | { ok: true; alanlar: Partial<BorcluTakipAlanlari>; onceki: Partial<BorcluTakipAlanlari>; uyarilar: string[]; aktivite: string }

const KAPSAM_ALANLARI = ['itirazTipi', 'itirazKapsamJson', 'itirazEdilenTutar', 'itirazVerilisTarihi'] as const

/**
 * İtiraz ONAYLANDIKTAN sonra kapsamın girilmesi ya da düzeltilmesi (06 §8.3 TB-07; "Kısmi itiraz: kapsam tutarı
 * zorunlu olur"). Yalnız onaylı itirazı olan borçluya yazılır; itiraz yoksa önce itiraz kartı onaylanmalı.
 * Kalem kaşesi değişikliği süreyi (İİK 67 ihtiyatlı alt sınırı) etkilediği için onaylı kaşenin üzerine ancak
 * "üzerine yaz" ile yazılır. Tarih uydurulmaz; ileri tarih kabul edilmez.
 */
export function itirazKapsamPlani(p: { mevcut: MevcutBorcluTakip | undefined; girdi: KapsamGirdisi; bugun: Date }): KapsamPlani {
  const { mevcut: m, girdi, bugun } = p
  if (m?.itirazVar !== true) return { ok: false, hata: 'Bu borçlunun itirazı onaylı değil: önce itiraz kartını onaylayın.' }
  const tip = girdi.itirazTipi
  const tutar = girdi.itirazEdilenTutar ?? null
  if (tip === 'KISMI' && !(tutar != null && tutar > 0)) return { ok: false, hata: 'Kısmi itirazda itiraz edilen tutar zorunludur.' }
  const kase = girdi.itirazVerilisTarihi ?? null
  if (kase && gunNo(kase) > gunNo(bugun)) return { ok: false, hata: 'İleri bir tarih girilemez.' }
  if (kase && m.itirazUyapTarihi && gunNo(kase) > gunNo(m.itirazUyapTarihi)) return { ok: false, hata: 'Kalem kaşesi tarihi UYAP kayıt tarihinden sonra olamaz.' }
  if (kase && m.itirazVerilisTarihi && !ayniGun(kase, m.itirazVerilisTarihi) && !girdi.ustuneYaz) {
    return { ok: false, hata: `Kalem kaşesi tarihi zaten girilmiş (${gunTR(m.itirazVerilisTarihi)}). Değiştirmek için "üzerine yaz"ı işaretleyin.` }
  }
  const uyarilar: string[] = []
  const yeniKase = kase ?? m.itirazVerilisTarihi
  if (yeniKase && m.tebligSonucu === 'TEBLIG' && m.tebligTarihi && gunNo(yeniKase) > gunNo(gunEkle(m.tebligTarihi, 7))) {
    uyarilar.push('İtiraz tebliğden 7 günden sonra görünüyor: gecikmiş itiraz olabilir (İİK 65, teyit gerekli).')
  }
  if (tip === 'KISMI') uyarilar.push('Kısmi itiraz: itiraz edilmeyen kısım için takibe devam adımı açılır (teyit gerekli).')
  if (!yeniKase) uyarilar.push('Kalem kaşesi tarihi girilmedi: İİK 67 ihtiyatlı önerisi UYAP kayıt tarihinden hesaplanır, gerçek son gün daha erken olabilir.')
  const kapsam = girdi.itirazKapsam !== undefined ? girdi.itirazKapsam ?? null : m.itirazKapsamJson
  const alanlar: Partial<BorcluTakipAlanlari> = {
    itirazTipi: tip,
    itirazKapsamJson: kapsam,
    itirazEdilenTutar: tip === 'TAM' ? null : tutar,
    itirazVerilisTarihi: yeniKase ?? null,
  }
  const secili = kapsam ? ITIRAZ_KAPSAM_ANAHTAR.filter((k) => kapsam[k]) : []
  return {
    ok: true, alanlar, onceki: sec(m, KAPSAM_ALANLARI), uyarilar,
    aktivite: `İtiraz kapsamı girildi: ${tip === 'TAM' ? 'tam' : 'kısmi'}${secili.length ? ` (${secili.map((k) => ITIRAZ_KAPSAM_ETIKET[k]).join(', ')})` : ''}${tip === 'KISMI' && tutar != null ? ` · ${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tutar)} TL` : ''}${yeniKase ? ` · kaşe ${gunTR(yeniKase)}` : ''}`,
  }
}

/** Elle "Tarih gir" (TB-08) için sentetik aday — tek yol aynı plan fonksiyonundan geçer. */
export function elleAlacakliyaTebligAdayi(borcluId: string | null): OnayAday {
  return {
    id: 'elle', altTip: 'ITIRAZIN_ALACAKLIYA_TEBLIGI', teyit: 'ADAY', borcluId, hukukiTarih: null, tarih: null,
    sonuc: null, tebligSekli: null, muhatap: 'ALACAKLI_VEKILI', kaynakBelgeId: null, kaynakTuru: 'ELLE', kural: KURAL.EL_ALACAKLIYA_TEBLIG,
  }
}

// ── Onay izi (geri alma) — TakipOlayi.hamJson.onayIzi içinde; tarihler ISO ────────────────
export type OnayIzi = {
  altTipOnceki: string | null
  borclular: { borcluId: string; mevcutId: string | null; onceki: Record<string, unknown>; yazilan: Record<string, unknown> }[]
  kim: string
  at: string
}

export function izDegeri(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString()
  if (v && typeof v === 'object' && 'toNumber' in (v as object) && typeof (v as { toNumber: unknown }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return v ?? null
}

export function izeCevir(a: Partial<BorcluTakipAlanlari>): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(a)) o[k] = izDegeri(v)
  return o
}

const TARIH_ALANLARI = new Set(['tebligTarihi', 'uetsUlasmaTarihi', 'itirazVerilisTarihi', 'itirazUyapTarihi', 'itirazAlacakliyaTebligTarihi'])

/** İzdeki değerleri yazılabilir alanlara geri çevirir (ISO → Date). */
export function izdenAlanlar(o: Record<string, unknown>): Partial<BorcluTakipAlanlari> {
  const a: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) a[k] = TARIH_ALANLARI.has(k) && typeof v === 'string' ? new Date(v) : v
  return a as Partial<BorcluTakipAlanlari>
}

/** Anahtar sırasından bağımsız JSON (Postgres jsonb anahtarları yeniden sıralar). */
function kararliJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(kararliJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${kararliJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}

/** Mevcut satır, onayın yazdığı değerlerle hâlâ aynı mı? (geri almada iyimser kilit) */
export function yazilanlaAyniMi(mevcut: Partial<Record<string, unknown>> | null | undefined, yazilan: Record<string, unknown>): boolean {
  if (!mevcut) return false
  return Object.entries(yazilan).every(([k, v]) => kararliJson(izDegeri(mevcut[k])) === kararliJson(v))
}
