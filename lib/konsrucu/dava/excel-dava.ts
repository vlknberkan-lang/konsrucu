/**
 * KonsRücü — Ray takip Excel'i dava sütunları (#19–#30) → dava önerisi · lib/konsrucu/dava/excel-dava.ts (saf)
 *
 * 06 §3.5 tablosunun dava yarısı. Excel'den gelen her değer ÖNERİDİR; avukat onaylayınca şu alanlara yazılır:
 *   #20 → Dava.mahkemeTuru/Yer/No (Asama.birim aynalanır) · #21 → Dava.esasYil/Sira (Asama.kimlikNo)
 *   #22 → DavaTaraf(DAVALI) (borçlu listesiyle eşleştirilir; ad ekranda maskeli) · #23 → Dava.ustDosyaNoHam
 *   #25 → Dava.acilisTarihi (İİK 67 kapanış kontrolü) · #26 → Dava.sonrakiDurusma
 *   #27 → IhtiyatiHaciz · #28 → DavaIslem(DEKONT_SUNUMU, referansNo = iş emri no) · #29 → DavaIslem(DELIL_DILEKCESI)
 *   #30 → DavaIslem(MUZEKKERE | MUZEKKERE_CEVABI)
 *   #19, #24 → YAZILMAZ: yalnız karşılaştırma için saklanır (eksenlerden türetilir).
 * Serbest metin ayrıştırılamazsa yalnız `excelHam`'lı kayıt ve "ayrıştırılamadı, elle tamamlayın" etiketi.
 */
import type { RayTakipDava } from '@/lib/import/hugo'
import { trNormal } from '../arabuluculuk/son-tutanak'
import { ihtiyatiHacizExcelCoz, type IhtiyatiHacizExcel } from './ihtiyati-haciz'
import { esasCoz, mahkemeCoz } from './kayit'
import type { DavaIslemTuru, MahkemeTuru } from './sabitler'

export type ExcelIslemOnerisi = {
  sutun: 28 | 29 | 30
  tur: DavaIslemTuru
  referansNo: string | null
  excelHam: string
  tarih: string | null
  ayristirilamadi: boolean
  tekilAnahtar: string
}

export type ExcelTarafOnerisi = { rol: 'DAVALI'; borcluId: string | null; adHam: string; eslesme: 'BORCLU' | 'YOK' }

export type ExcelDavaOnerisi = {
  dava: {
    mahkemeTuru: MahkemeTuru | null
    mahkemeYer: string | null
    mahkemeNo: string | null
    mahkemeHam: string | null
    esasYil: number | null
    esasSira: number | null
    acilisTarihi: string | null
    ustDosyaNoHam: string | null
    sonrakiDurusma: { tarih: string; saat: string | null } | null
  }
  karsilastirma: { sonDurum: string | null; davaSonDurum: string | null }
  taraflar: ExcelTarafOnerisi[]
  islemler: ExcelIslemOnerisi[]
  ihtiyatiHaciz: IhtiyatiHacizExcel | null
  uyarilar: string[]
  bos: boolean
}

/** "17829529370 iş emri ile sunulmuştur" → "17829529370" (iş emri / referans no: en az 6 hane). */
export function isEmriNo(ham: string | null | undefined): string | null {
  if (!ham) return null
  const m = String(ham).match(/\b(\d{6,})\b/)
  return m ? m[1] : null
}

function tarihBul(ham: string): string | null {
  const m = ham.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/)
  if (!m) return null
  const g = Number(m[1]), a = Number(m[2]), y = Number(m[3])
  const d = new Date(Date.UTC(y, a - 1, g))
  if (d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return null
  return `${y}-${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`
}

const TUZEL = /\b(a s|as|ltd|sti|limited|sirketi|anonim|genel mudurlugu|mudurlugu|baskanligi|bakanligi|belediyesi)\b/g
function adAnahtar(s: string): string {
  return trNormal(s).replace(/[^a-z0-9 ]/g, ' ').replace(TUZEL, ' ').replace(/\s+/g, ' ').trim()
}

/** #22 hücresini davalılara böl ve borçlulara eşle (ad benzerliği; eşleşmeyen adHam ile kalır). */
export function davalilariEsle(ham: string | null, borclular: { id: string; adUnvan: string }[]): ExcelTarafOnerisi[] {
  if (!ham) return []
  const parcalar = ham.split(/\r?\n|;|\+|\s\/\s|\s-\s/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length >= 2)
  const bAnah = borclular.map((b) => ({ id: b.id, a: adAnahtar(b.adUnvan) }))
  const kullanilan = new Set<string>()
  return parcalar.map((p) => {
    const a = adAnahtar(p)
    const es = bAnah.find((b) => !kullanilan.has(b.id) && b.a && a && (b.a === a || b.a.includes(a) || a.includes(b.a)))
    if (es) kullanilan.add(es.id)
    return { rol: 'DAVALI' as const, borcluId: es?.id ?? null, adHam: p, eslesme: es ? ('BORCLU' as const) : ('YOK' as const) }
  })
}

export function excelDavaOnerisi(d: RayTakipDava | null | undefined, borclular: { id: string; adUnvan: string }[] = []): ExcelDavaOnerisi {
  const bos: ExcelDavaOnerisi = {
    dava: { mahkemeTuru: null, mahkemeYer: null, mahkemeNo: null, mahkemeHam: null, esasYil: null, esasSira: null, acilisTarihi: null, ustDosyaNoHam: null, sonrakiDurusma: null },
    karsilastirma: { sonDurum: null, davaSonDurum: null },
    taraflar: [],
    islemler: [],
    ihtiyatiHaciz: null,
    uyarilar: [],
    bos: true,
  }
  if (!d) return bos
  const uyarilar: string[] = []
  const mc = mahkemeCoz(d.mahkeme)
  if (d.mahkeme && mc?.ayristirilamadi) uyarilar.push('#20 MAHKEME ayrıştırılamadı: mahkeme türünü elle seçin.')
  const es = esasCoz(d.esas)
  if (d.esas && !es) uyarilar.push('#21 ESAS ayrıştırılamadı: esas no\'yu elle girin.')
  const esasAnahtar = es ? `${es.yil}/${es.sira}` : 'esassiz'

  const islemler: ExcelIslemOnerisi[] = []
  if (d.dekont) {
    const no = isEmriNo(d.dekont)
    islemler.push({ sutun: 28, tur: 'DEKONT_SUNUMU', referansNo: no, excelHam: d.dekont, tarih: tarihBul(d.dekont), ayristirilamadi: !no, tekilAnahtar: `EXCEL:${esasAnahtar}:28` })
  }
  if (d.delilDilekcesi) {
    const no = isEmriNo(d.delilDilekcesi)
    const tarih = tarihBul(d.delilDilekcesi)
    islemler.push({ sutun: 29, tur: 'DELIL_DILEKCESI', referansNo: no, excelHam: d.delilDilekcesi, tarih, ayristirilamadi: !no && !tarih, tekilAnahtar: `EXCEL:${esasAnahtar}:29` })
  }
  if (d.muzekkereCevap) {
    const n = trNormal(d.muzekkereCevap).trim()
    const no = isEmriNo(d.muzekkereCevap)
    const cevapGeldi = /^(evet|geldi|cevap geldi|cevaplandi)\b/.test(n)
    const bekliyor = /^(hayir|yok|bekleniyor|gelmedi)\b/.test(n)
    islemler.push({
      sutun: 30,
      tur: cevapGeldi ? 'MUZEKKERE_CEVABI' : 'MUZEKKERE',
      referansNo: no,
      excelHam: d.muzekkereCevap,
      tarih: tarihBul(d.muzekkereCevap),
      ayristirilamadi: !no && !(cevapGeldi || bekliyor),
      tekilAnahtar: `EXCEL:${esasAnahtar}:30`,
    })
    if (cevapGeldi && !no) uyarilar.push('#30 MÜZEKKERE CEVAP yalnız "cevap geldi" diyor: muhatap ve yazı no\'yu elle tamamlayın.')
  }
  for (const i of islemler) if (i.ayristirilamadi) uyarilar.push(`#${i.sutun} ayrıştırılamadı, elle tamamlayın.`)

  const ih = d.ihtiyatiHaciz ? ihtiyatiHacizExcelCoz(d.ihtiyatiHaciz) : null
  if (ih?.ayristirilamadi) uyarilar.push('#27 İHTİYATİ HACİZ ayrıştırılamadı, elle tamamlayın.')
  if (d.durusmaHam && !d.durusma) uyarilar.push(`#26 DURUŞMA TARİHİ tarih değil ("${d.durusmaHam.slice(0, 40)}"): duruşma kaydı açılmaz.`)
  if (!d.acilisTarihi && (d.mahkeme || d.esas)) uyarilar.push('#25 DAVA AÇILIŞ TARİHİ yok: İİK 67 kapanış kontrolü yapılamaz.')

  const taraflar = davalilariEsle(d.davali, borclular)
  if (taraflar.some((t) => t.eslesme === 'YOK')) uyarilar.push('#22 DAVALI borçlu listesiyle eşleşmedi: tarafı kontrol edin.')

  return {
    dava: {
      mahkemeTuru: mc?.tur ?? null,
      mahkemeYer: mc?.yer ?? null,
      mahkemeNo: mc?.no ?? null,
      mahkemeHam: d.mahkeme,
      esasYil: es?.yil ?? null,
      esasSira: es?.sira ?? null,
      acilisTarihi: d.acilisTarihi,
      ustDosyaNoHam: d.ustDosyaNo,
      sonrakiDurusma: d.durusma,
    },
    karsilastirma: { sonDurum: d.sonDurum, davaSonDurum: d.davaSonDurum },
    taraflar,
    islemler,
    ihtiyatiHaciz: ih && ih.kayitGerekli ? ih : null,
    uyarilar,
    bos: !(d.mahkeme || d.esas || d.acilisTarihi || d.davali || taraflar.length || islemler.length || ih?.kayitGerekli),
  }
}

/** kaynakJson içinden rayTakip.dava'yı güvenle oku (eski satırlarda yok). */
export function kaynaktanRayDava(kaynakJson: unknown): RayTakipDava | null {
  const k = kaynakJson && typeof kaynakJson === 'object' ? (kaynakJson as Record<string, unknown>) : null
  const r = k?.rayTakip && typeof k.rayTakip === 'object' ? (k.rayTakip as Record<string, unknown>) : null
  const d = r?.dava && typeof r.dava === 'object' ? (r.dava as RayTakipDava) : null
  return d
}
