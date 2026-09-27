/**
 * KonsRücü — Yetkili icra önerisi · lib/konsrucu/oneri/yetkili-icra.ts  (saf; DB yok — Adli Rehber tablosunu okur)
 *
 * S19 (06 §2(c) adım 4; B07'nin icra tarafı). Program iki seçeneği gerekçesiyle gösterir, SEÇİM AVUKATTADIR:
 *   1. Kaza yeri: mevcut `yetkiliIcraOner` (Adalet Bakanlığı Adli Rehber; ilçenin kendi adliyesi yoksa bağlı adliye).
 *   2. Borçlunun yerleşim yeri: borçlu adresinin ilçe/il kısmından (birden çok borçlu → her biri ayrı seçenek).
 * Dayanak etiketleri "teyit gerekli"dir. AI'ın `yetkiliIcra` önerisi bu alana yazılmaz (alanlar.ts · aiYasak).
 * KTK m.110/2'nin iptal edilen "merkez" ibaresi hiçbir biçimde üretilmez (B07).
 *
 * Ekranda adres gösterilmez; yalnız çözülen ilçe/il ve adliye adı görünür.
 */
import { adliyeBul, trNorm, yetkiliIcraOner, type AdliyeSonuc } from '@/lib/konsrucu/adli-rehber'

export const DAYANAK_KAZA_YERI = 'Haksız fiilin işlendiği yer: HMK m.16, İİK m.50 yollamasıyla (teyit gerekli)'
export const DAYANAK_YERLESIM = 'Borçlunun yerleşim yeri: HMK m.6, İİK m.50 yollamasıyla (teyit gerekli)'
export const DAYANAK_COK_BORCLU = 'Birden çok borçlu: borçlulardan birinin yerleşim yeri (HMK m.7; teyit gerekli)'

export type YetkiliIcraBorclu = { id: string; adUnvan?: string | null; adres?: string | null }

export type YetkiliIcraSecenegi = {
  anahtar: string
  secenek: 'KAZA_YERI' | 'YERLESIM_YERI'
  icraDairesi: string
  adliye: string
  il: string
  kendiAdliyesiVar: boolean
  baslik: string
  gerekce: string
  dayanak: string
  borcluId: string | null
}

const HARF_DISI = /[^A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû\s]/g
const kelimeler = (s: string) => s.replace(HARF_DISI, ' ').split(/\s+/).filter(Boolean)

/**
 * Adresten ilçe ve il (en iyi çaba): "… No:5 D:3 Kadıköy/İSTANBUL" ya da "… Seyhan Adana".
 * Adli Rehber'de bulunamayan ilçe döndürülmez (null) — tahmin yok.
 */
export function adresYerlesimYeri(adres: string | null | undefined): { ilce: string; il: string; kayit: AdliyeSonuc } | null {
  const a = String(adres ?? '').trim()
  if (!a) return null
  let ilAday: string | null = null
  let ilceKelimeleri: string[] = []
  if (a.includes('/')) {
    const parcalar = a.split('/')
    ilAday = kelimeler(parcalar[parcalar.length - 1]).join(' ') || null
    ilceKelimeleri = kelimeler(parcalar[parcalar.length - 2] ?? '')
  } else {
    const k = kelimeler(a)
    ilAday = k[k.length - 1] ?? null
    ilceKelimeleri = k.slice(0, -1)
  }
  if (!ilAday) return null
  for (const n of [1, 2]) {
    if (ilceKelimeleri.length < n) break
    const ilce = ilceKelimeleri.slice(-n).join(' ')
    const r = adliyeBul(ilce, ilAday)
    if (r && trNorm(r.il) === trNorm(ilAday)) return { ilce, il: r.il, kayit: r }
  }
  return null
}

/** İki seçenek ve gerekçeleri. Aynı daireye çıkan seçenekler birleştirilir; çözülemeyenler uyarı olur. */
export function yetkiliIcraSecenekleri(g: {
  kazaYeri?: string | null
  il?: string | null
  borclular: readonly YetkiliIcraBorclu[]
}): { secenekler: YetkiliIcraSecenegi[]; uyarilar: string[] } {
  const secenekler: YetkiliIcraSecenegi[] = []
  const uyarilar: string[] = []

  // 1) kaza yeri
  const kaza = g.kazaYeri || g.il ? yetkiliIcraOner(g.kazaYeri, g.il) : null
  if (kaza) {
    const yalnizIl = !g.kazaYeri
    const bagli = kaza.kendiAdliyesiVar ? '' : ` (${kaza.ilce} ilçesinin kendi adliyesi yok; bağlı olduğu adliye)`
    secenekler.push({
      anahtar: 'KAZA_YERI', secenek: 'KAZA_YERI', icraDairesi: kaza.icraDairesi, adliye: kaza.adliye, il: kaza.il,
      kendiAdliyesiVar: kaza.kendiAdliyesiVar, borcluId: null,
      baslik: 'Kaza yeri',
      gerekce: yalnizIl
        ? `Kaza yeri yok; yalnız il bilgisinden (${g.il}) il merkezi adliyesi bulundu${bagli}. Kaza yerini girin (teyit gerekli).`
        : `Kaza yeri "${g.kazaYeri}" → ${kaza.adliye} adliyesi${bagli}. Kaynak: Adli Rehber.`,
      dayanak: DAYANAK_KAZA_YERI,
    })
    if (yalnizIl) uyarilar.push('Kaza yeri girilmemiş: kaza yeri seçeneği yalnız il bilgisinden türetildi.')
  } else {
    uyarilar.push(g.kazaYeri ? `Kaza yeri "${g.kazaYeri}" Adli Rehber'de bulunamadı; daireyi elle girin.` : 'Kaza yeri girilmemiş.')
  }

  // 2) borçluların yerleşim yeri
  const cok = g.borclular.length > 1
  g.borclular.forEach((b, i) => {
    const etiket = b.adUnvan?.trim() ? b.adUnvan.trim() : `Borçlu ${i + 1}`
    if (!b.adres?.trim()) { uyarilar.push(`${etiket}: adres yok, yerleşim yeri seçeneği çıkarılamadı.`); return }
    const y = adresYerlesimYeri(b.adres)
    if (!y) { uyarilar.push(`${etiket}: adresten ilçe çözülemedi; daireyi elle girin.`); return }
    const bagli = y.kayit.kendiAdliyesiVar ? '' : ` (${y.kayit.ilce} ilçesinin kendi adliyesi yok; bağlı olduğu adliye)`
    secenekler.push({
      anahtar: `YERLESIM_YERI:${b.id}`, secenek: 'YERLESIM_YERI', icraDairesi: y.kayit.icraDairesi, adliye: y.kayit.adliye,
      il: y.kayit.il, kendiAdliyesiVar: y.kayit.kendiAdliyesiVar, borcluId: b.id,
      baslik: `Yerleşim yeri · ${etiket}`,
      gerekce: `${etiket} adresindeki ilçe ${y.ilce}/${y.il} → ${y.kayit.adliye} adliyesi${bagli}. Kaynak: Adli Rehber.`,
      dayanak: cok ? `${DAYANAK_YERLESIM} · ${DAYANAK_COK_BORCLU}` : DAYANAK_YERLESIM,
    })
  })

  // aynı daireye çıkan seçenekleri birleştir (gerekçeler yan yana)
  const birlesik: YetkiliIcraSecenegi[] = []
  for (const s of secenekler) {
    const ayni = birlesik.find((x) => trNorm(x.icraDairesi) === trNorm(s.icraDairesi))
    if (ayni) {
      ayni.gerekce = `${ayni.gerekce} Aynı daire: ${s.baslik.toLocaleLowerCase('tr-TR')}.`
      continue
    }
    birlesik.push({ ...s })
  }
  return { secenekler: birlesik, uyarilar }
}
