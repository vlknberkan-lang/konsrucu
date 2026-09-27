/**
 * KonsRücü — Süre önerisi hesabı · lib/konsrucu/sure/hesap.ts (saf, client-safe; DB yok)
 *
 * Tek giriş: sureOnerisiHesapla(girdi) → { onerilenIhtiyatli, onerilenSonGun, iz, uyarilar, eksik }.
 *
 *  - İHTİYATLI son gün: durmasız, tatil uzatmasız, en erken olası başlangıçtan. UETS'te ulaşma gününden
 *    (5 gün eklenmeden) sayılır. İİK 67'de tebliğ tarihi yoksa itiraz tarihinden (alt sınır). Onaylanan son
 *    gün girilene kadar hatırlatmalar BUNA göre gider.
 *  - ÖNERİLEN (durmalı) son gün: hukuki başlangıçtan (UETS: ulaşmayı izleyen 5. gün), sayılan durma
 *    dönemleri eklenerek. Durma yalnız süre dolmadan başladıysa sayılır.
 *  - ONAYLANAN son gün burada ÜRETİLMEZ; yalnız avukat girer (Sure.onaylananSonGun).
 *
 * Tatil: hafta sonu ve adli tatil yalnız UYARI üretir; süre UZATILMAZ (06 §2(i)). Resmî tatil ve bayramlar
 * kontrol edilmez. Her kural atfı "teyit gerekli"dir.
 */
import { sureTuru, TETIK_TURU_ETIKET, TEYIT_GEREKLI, type SureKurali, type TetikTuru } from './turler'
import { adliTatildeMi, ayEkle, gunAdi, gunBasi, gunEkle, gunFarki, gunNo, gunTR, haftaSonuMu, isoGun, tarihOku, yilEkle } from './takvim'

export type DurmaDonemi = {
  bas: Date | string
  bit: Date | string | null
  sebep: string
  kaynakId?: string | null
}

export type DurmaSonucu = {
  bas: string
  bit: string | null
  sebep: string
  kaynakId: string | null
  gun: number | null
  sayildi: boolean
  not?: string
}

export type Usul = 'YAZILI' | 'BASIT'

export type SureGirdisi = {
  tur: string
  tetikTarihi?: Date | null
  tetikTuru?: TetikTuru | null
  uetsUlasmaTarihi?: Date | null
  hakimSuresiGun?: number | null
  /** İİK 67: itirazın alacaklıya tebliği yoksa ihtiyatlı alt sınırın başlangıcı. */
  itirazTarihi?: Date | null
  /** İYUK 13: eylem tarihi ("her hâlde eylemden 5 yıl"; öğrenme yoksa ihtiyatlı başlangıç). */
  eylemTarihi?: Date | null
  /** HMK 136: yalnız yazılı usulde. Boşsa öneri yapılmaz. */
  usul?: Usul | null
  durmalar?: DurmaDonemi[]
}

export type SureOnerisi = {
  durum: 'ACIK' | 'TETIK_BEKLIYOR'
  onerilenIhtiyatli: Date | null
  onerilenSonGun: Date | null
  /** Hukuki başlangıç (UETS'te ulaşma + 5 gün). */
  baslangic: Date | null
  /** İhtiyatlı hesabın başlangıcı (en erken olası). */
  ihtiyatliBaslangic: Date | null
  durmalar: DurmaSonucu[]
  durmaGun: number
  iz: string[]
  uyarilar: string[]
  /** Öneri yapılamıyorsa kullanıcıdan istenecek tek şey ("Usulü seçin"). */
  eksik: string | null
}

export function kuralMetni(kural: SureKurali, hakimGun?: number | null): string {
  switch (kural.tip) {
    case 'GUN': return kural.gun % 7 === 0 && kural.gun <= 28 ? `${kural.gun / 7} hafta (${kural.gun} gün)` : `${kural.gun} gün`
    case 'AY': return `${kural.ay} ay`
    case 'YIL': return `${kural.yil} yıl`
    case 'HAKIM': return hakimGun ? `${hakimGun} gün (mahkemenin verdiği)` : 'mahkemenin verdiği süre'
  }
}

function ekle(d: Date, kural: SureKurali, hakimGun?: number | null): Date | null {
  switch (kural.tip) {
    case 'GUN': return gunEkle(d, kural.gun)
    case 'AY': return ayEkle(d, kural.ay)
    case 'YIL': return yilEkle(d, kural.yil)
    case 'HAKIM': return hakimGun && hakimGun > 0 ? gunEkle(d, hakimGun) : null
  }
}

function enErken(...ds: (Date | null)[]): Date | null {
  const v = ds.filter((d): d is Date => !!d)
  if (!v.length) return null
  return v.reduce((a, b) => (gunNo(b) < gunNo(a) ? b : a))
}

function tatilUyarilari(d: Date | null, tur: ReturnType<typeof sureTuru>, etiket: string): string[] {
  if (!d) return []
  const out: string[] = []
  if (haftaSonuMu(d)) {
    out.push(`${etiket} son gün (${gunTR(d)}) ${gunAdi(d)}: tatil günü nedeniyle uzama olabilir; motor uzatmadı (${TEYIT_GEREKLI}).`)
  }
  if (adliTatildeMi(d)) {
    if (tur.hakDusurucu) out.push(`${etiket} son gün adli tatil dönemine denk geliyor; hak düşürücü sürede adli tatil uzatması düşünülmez (${TEYIT_GEREKLI}).`)
    else if (tur.grup === 'DAVA') out.push(`${etiket} son gün adli tatilde (20 Temmuz–31 Ağustos): uzama olabilir (HMK 104, ${TEYIT_GEREKLI}); motor uzatmadı.`)
    else out.push(`${etiket} son gün adli tatil dönemine denk geliyor; uzama olup olmadığını kontrol edin (${TEYIT_GEREKLI}).`)
  }
  return out
}

/** Durma dönemlerini sırayla uygular. Süre dolduktan sonra başlayan durma sayılmaz. */
function durmalariUygula(taban: Date, girdi: DurmaDonemi[]): { son: Date | null; gun: number; sonuclar: DurmaSonucu[]; acik: boolean; gec: boolean } {
  const sirali = girdi
    .map((d) => ({ d, b: tarihOku(d.bas), e: tarihOku(d.bit) }))
    .filter((x): x is { d: DurmaDonemi; b: Date; e: Date | null } => !!x.b)
    .sort((a, b) => gunNo(a.b) - gunNo(b.b))
  let son: Date | null = taban
  let toplam = 0
  let acik = false
  let gec = false
  const sonuclar: DurmaSonucu[] = []
  for (const { d, b, e } of sirali) {
    const temel = { bas: isoGun(b), bit: e ? isoGun(e) : null, sebep: d.sebep, kaynakId: d.kaynakId ?? null }
    if (!son) { sonuclar.push({ ...temel, gun: null, sayildi: false, not: 'Önceki durma sürdüğü için hesaplanmadı' }); continue }
    if (gunNo(b) > gunNo(son)) {
      gec = true
      sonuclar.push({ ...temel, gun: null, sayildi: false, not: 'Başvuru süre dolduktan sonra: durma sayılmadı' })
      continue
    }
    if (!e) {
      acik = true
      sonuclar.push({ ...temel, gun: null, sayildi: false, not: 'Sürüyor: bitiş tarihi girilince sayılır' })
      son = null
      continue
    }
    const gun = Math.max(0, gunFarki(b, e))
    son = gunEkle(son, gun)
    toplam += gun
    sonuclar.push({ ...temel, gun, sayildi: true })
  }
  return { son, gun: toplam, sonuclar, acik, gec }
}

export function sureOnerisiHesapla(g: SureGirdisi): SureOnerisi {
  const tur = sureTuru(g.tur)
  const iz: string[] = [`Dayanak: ${tur.dayanak} (${TEYIT_GEREKLI}) · süre ${kuralMetni(tur.kural, g.hakimSuresiGun)} · tetik: ${tur.tetik}`]
  const uyarilar: string[] = []
  const tt: TetikTuru | null = g.tetikTuru ?? null
  const bos = (eksik: string): SureOnerisi => ({
    durum: 'TETIK_BEKLIYOR', onerilenIhtiyatli: null, onerilenSonGun: null, baslangic: null, ihtiyatliBaslangic: null,
    durmalar: [], durmaGun: 0, iz, uyarilar, eksik,
  })

  // Usul kapısı (HMK 136): usul seçilmeden öneri yok; basit usulde cevaba cevap yok.
  if (tur.kod === 'HMK136') {
    if (!g.usul) return bos('Yargılama usulünü seçin (yazılı / basit); cevaba cevap yalnız yazılı usulde verilir.')
    if (g.usul === 'BASIT') {
      uyarilar.push(`Basit yargılama usulünde cevaba cevap dilekçesi verilmez (${TEYIT_GEREKLI}); öneri yapılmadı.`)
      return bos('Usul basit: bu süre türü uygulanmaz.')
    }
  }

  // Mahkemenin verdiği süre: gün sayısı olmadan hesap yok.
  if (tur.kural.tip === 'HAKIM' && !(g.hakimSuresiGun && g.hakimSuresiGun > 0)) {
    return bos('Mahkemenin verdiği süreyi (gün) ara karardan girin.')
  }

  // 1) Başlangıçlar
  let bas: Date | null = null
  let ihtBas: Date | null = null
  const ulasma = g.uetsUlasmaTarihi ?? (tt === 'UETS_ULASMA' ? g.tetikTarihi ?? null : null)
  if (tt === 'UETS_ULASMA' && ulasma) {
    bas = gunEkle(ulasma, 5)
    ihtBas = gunBasi(ulasma)
    iz.push(`UETS ulaşma ${gunTR(ulasma)}; ulaşmayı izleyen 5. günün sonunda tebliğ sayılır → ${gunTR(bas)} (Tebligat K. 7/a, ${TEYIT_GEREKLI}).`)
    iz.push('İhtiyatlı hesap ulaşma gününden başlatıldı (5 gün eklenmedi).')
  } else if (g.tetikTarihi) {
    bas = gunBasi(g.tetikTarihi)
    ihtBas = bas
    iz.push(`${tur.tetik}: ${gunTR(bas)} (${TETIK_TURU_ETIKET[tt ?? 'ELLE']}).`)
    if (g.uetsUlasmaTarihi && tt === 'TEBLIG') {
      const f = gunFarki(g.uetsUlasmaTarihi, bas)
      if (f !== 5) uyarilar.push(`UETS ulaşma (${gunTR(g.uetsUlasmaTarihi)}) ile tebliğ tarihi (${gunTR(bas)}) arasında ${f} gün var; UETS'te tebliğ ulaşmayı izleyen 5. gündür (${TEYIT_GEREKLI}).`)
    }
  }

  let ihtiyatli: Date | null = null
  let durmasiz: Date | null = null

  if (tur.kod === 'IYUK13_BASVURU') {
    // Öğrenmeden 1 yıl, her hâlde eylemden 5 yıl — hangisi önce dolarsa.
    const eylem = g.eylemTarihi ? gunBasi(g.eylemTarihi) : null
    const ogrenmeSon = bas ? yilEkle(bas, 1) : null
    const eylemSon5 = eylem ? yilEkle(eylem, 5) : null
    if (ogrenmeSon) {
      durmasiz = enErken(ogrenmeSon, eylemSon5)
      ihtiyatli = durmasiz
      iz.push(`Öğrenme + 1 yıl = ${gunTR(ogrenmeSon)}${eylemSon5 ? ` · eylem + 5 yıl = ${gunTR(eylemSon5)} · erken olan alındı` : ''}.`)
    } else if (eylem) {
      ihtiyatli = yilEkle(eylem, 1)
      ihtBas = eylem
      iz.push(`Öğrenme tarihi girilmedi: ihtiyatlı öneri eylem tarihinden (${gunTR(eylem)} + 1 yıl = ${gunTR(ihtiyatli)}); öğrenme eylemden önce olamaz.`)
    } else {
      return bos('İdari eylemin öğrenildiği günü ya da eylem (kaza) tarihini girin.')
    }
  } else {
    if (!bas && tur.kod === 'IIK67' && g.itirazTarihi) {
      ihtBas = gunBasi(g.itirazTarihi)
      iz.push(`İtirazın alacaklıya tebliği girilmedi: ihtiyatlı alt sınır itiraz tarihinden (${gunTR(ihtBas)}) hesaplandı (tebliğ tarihi yok).`)
    }
    if (!bas && !ihtBas) {
      return bos(`${tur.tetik} tarihini girin; süre bu tarihle başlar.`)
    }
    ihtiyatli = ihtBas ? ekle(ihtBas, tur.kural, g.hakimSuresiGun) : null
    durmasiz = bas ? ekle(bas, tur.kural, g.hakimSuresiGun) : null
  }

  // 2) Durma (arabuluculuk HUAK 18/A-15, İİK 78/2 …) — yalnız önerilen (durmalı) güne eklenir.
  let onerilen: Date | null = durmasiz
  let durmaSonuclari: DurmaSonucu[] = []
  let durmaGun = 0
  if (g.durmalar?.length) {
    const taban = durmasiz ?? (tur.kod === 'IIK67' ? ihtiyatli : null)
    if (taban) {
      const r = durmalariUygula(taban, g.durmalar)
      durmaSonuclari = r.sonuclar
      durmaGun = r.gun
      for (const d of r.sonuclar) {
        if (d.sayildi) iz.push(`Durma: ${d.sebep} ${gunTR(tarihOku(d.bas))} → ${gunTR(tarihOku(d.bit))} = ${d.gun} gün (${TEYIT_GEREKLI}).`)
      }
      if (r.gec) uyarilar.push(`Geç başvuru: süre dolduktan sonra başlayan durma sayılmadı (${TEYIT_GEREKLI}).`)
      if (r.acik) {
        uyarilar.push('Durma sürüyor (bitiş tarihi yok): durmalı öneri bitiş tarihi girilince hesaplanır. Hatırlatma ihtiyatlı güne göre gider.')
        onerilen = null
      } else if (r.gun > 0) {
        onerilen = r.son
        if (!durmasiz) iz.push('Tebliğ tarihi olmadığı için durmalı öneri de itiraz tarihinden hesaplandı (alt sınır).')
      }
    }
  }

  if (ihtiyatli) iz.push(`İhtiyatlı son gün: ${gunTR(ihtiyatli)} (durmasız, tatil uzatmasız).`)
  if (onerilen) iz.push(`Önerilen son gün: ${gunTR(onerilen)}${durmaGun ? ` (${durmaGun} gün durma dahil)` : ''}.`)
  if (tur.not) iz.push(`Not: ${tur.not}`)

  const tekil = new Set<string>()
  for (const u of [
    ...tatilUyarilari(ihtiyatli, tur, 'İhtiyatlı'),
    ...(onerilen && (!ihtiyatli || gunNo(onerilen) !== gunNo(ihtiyatli)) ? tatilUyarilari(onerilen, tur, 'Önerilen') : []),
  ]) tekil.add(u)
  uyarilar.push(...tekil)

  return {
    durum: ihtiyatli || onerilen ? 'ACIK' : 'TETIK_BEKLIYOR',
    onerilenIhtiyatli: ihtiyatli,
    onerilenSonGun: onerilen,
    baslangic: bas,
    ihtiyatliBaslangic: ihtBas,
    durmalar: durmaSonuclari,
    durmaGun,
    iz,
    uyarilar,
    eksik: ihtiyatli || onerilen ? null : `${tur.tetik} tarihini girin.`,
  }
}

/** Sure.hesapIziJson içeriği: girdi (ISO günler), iz, uyarılar, durmalar. Kişisel veri taşımaz. */
export type HesapIziJson = {
  surum: 1
  hesapAt: string
  girdi: {
    tur: string
    tetikTarihi: string | null
    tetikTuru: string | null
    uetsUlasmaTarihi: string | null
    hakimSuresiGun: number | null
    itirazTarihi: string | null
    eylemTarihi: string | null
    usul: string | null
  }
  iz: string[]
  uyarilar: string[]
  durmalar: DurmaSonucu[]
  eksik: string | null
  oncekiOnaylar?: { sonGun: string; onaylayanId: string | null; onayAt: string | null; sebep: string }[]
}

export function hesapIziJsonu(g: SureGirdisi, o: SureOnerisi, simdi: Date = new Date()): HesapIziJson {
  const gun = (d?: Date | null) => (d ? isoGun(d) : null)
  return {
    surum: 1,
    hesapAt: simdi.toISOString(),
    girdi: {
      tur: g.tur,
      tetikTarihi: gun(g.tetikTarihi),
      tetikTuru: g.tetikTuru ?? null,
      uetsUlasmaTarihi: gun(g.uetsUlasmaTarihi),
      hakimSuresiGun: g.hakimSuresiGun ?? null,
      itirazTarihi: gun(g.itirazTarihi),
      eylemTarihi: gun(g.eylemTarihi),
      usul: g.usul ?? null,
    },
    iz: o.iz,
    uyarilar: o.uyarilar,
    durmalar: o.durmalar,
    eksik: o.eksik,
  }
}

/** hesapIziJson'u güvenle okur (eski/boş satır → null). */
export function hesapIziOku(j: unknown): HesapIziJson | null {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  const o = j as Partial<HesapIziJson>
  if (!Array.isArray(o.iz)) return null
  return {
    surum: 1,
    hesapAt: typeof o.hesapAt === 'string' ? o.hesapAt : '',
    girdi: (o.girdi ?? {}) as HesapIziJson['girdi'],
    iz: o.iz.filter((x): x is string => typeof x === 'string'),
    uyarilar: Array.isArray(o.uyarilar) ? o.uyarilar.filter((x): x is string => typeof x === 'string') : [],
    durmalar: Array.isArray(o.durmalar) ? (o.durmalar as DurmaSonucu[]) : [],
    eksik: typeof o.eksik === 'string' ? o.eksik : null,
    oncekiOnaylar: Array.isArray(o.oncekiOnaylar) ? o.oncekiOnaylar : undefined,
  }
}

/**
 * Tetik ya da durma değişince onaylanan gün yeniden onaya düşer mi? (06 §2(f): "onaylanan son gün yeniden
 * onaya düşer"). Onaylanan gün varsa ve önerilen ya da ihtiyatlı gün değiştiyse evet.
 */
export function yenidenOnayGerekirMi(
  eski: { onaylananSonGun: Date | null; onerilenSonGun: Date | null; onerilenIhtiyatli: Date | null },
  yeni: Pick<SureOnerisi, 'onerilenSonGun' | 'onerilenIhtiyatli'>,
): boolean {
  if (!eski.onaylananSonGun) return false
  const ayni = (a: Date | null, b: Date | null) => (a && b ? gunNo(a) === gunNo(b) : a === b)
  return !ayni(eski.onerilenSonGun, yeni.onerilenSonGun) || !ayni(eski.onerilenIhtiyatli, yeni.onerilenIhtiyatli)
}
