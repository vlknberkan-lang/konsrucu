/**
 * KonsRücü — Sızıntı kapısı · lib/ai/sizinti.ts (saf)
 *
 * rucu-hukuk-asistani/araclar/evrak-metin/kontrol.py'nin metin düzeyindeki karşılığı (06, 5.6; S09).
 * AI'a gidecek MASKELİ metinde kalmış kişisel veri şüphesini arar: maskeleyicinin desenleri + bilinen
 * değerler + bilinen kişiler + bağımsız kaba taramalar (ayraçtan bağımsız TCKN, etiketten sonra kalmış ad).
 * Kapı: "sızıntı 0" — bulgu varsa çağrı YAPILMAZ (SizintiHata).
 *
 * Hata ve günlükte ham değer YAZILMAZ; yalnız tür, satır ve yıldızlı biçim (ör. 1234*******).
 * Yalnız aynı satırda/hücrede ya da sütun başlığında 'Poliçe No', 'Hasar No', 'Esas No' gibi açık
 * etiketle korunan numaralar sızıntı sayılmaz; BİLGİ olarak döner.
 */
import { Maskeleyici, normallestir, tekBosluk, type JetonTuru } from './maske'

export type SizintiBulgusu = { tur: JetonTuru; satir: number; yildizli: string; korunan: boolean }
export type SizintiSonucu = { temiz: boolean; sizintilar: SizintiBulgusu[]; bilgiler: SizintiBulgusu[] }

/** Değeri tanınmayacak biçimde yıldızlar (ilk birkaç karakter kalır). */
export function yildizla(tur: string, deger: string): string {
  const d = tekBosluk(String(deger))
  if (tur === 'KİŞİ' || tur === 'ADRES') return d.split(' ').filter(Boolean).map((k) => k[0] + '*'.repeat(k.length - 1)).join(' ')
  if (tur === 'EPOSTA') return d.slice(0, 2) + '***@***'
  const sade = d.replace(/[\s.\-()+]/g, '')
  return sade.slice(0, 4) + '*'.repeat(Math.max(0, sade.length - 4))
}

/** Tek bir metni tarar. `maske`: bilinen kişi/değerleri taşıyan maskeleyici (yoksa yalnız desenler). */
export function sizintiKontrol(metin0: string, maske: Maskeleyici = new Maskeleyici()): SizintiSonucu {
  const metin = normallestir(metin0)
  const sonuc: SizintiSonucu = { temiz: true, sizintilar: [], bilgiler: [] }
  const gorulen = new Set<string>()
  for (const b of maske.sizintiTara(metin)) {
    let satir = 1
    for (let i = 0; i < b.bas; i++) if (metin.charCodeAt(i) === 10) satir++
    const anahtar = `${satir}\u0000${b.tur}\u0000${b.anahtar}`
    if (gorulen.has(anahtar)) continue
    gorulen.add(anahtar)
    const kb: SizintiBulgusu = { tur: b.tur, satir, yildizli: yildizla(b.tur, metin.slice(b.bas, b.son)), korunan: b.korunan }
    ;(b.korunan ? sonuc.bilgiler : sonuc.sizintilar).push(kb)
  }
  sonuc.temiz = sonuc.sizintilar.length === 0
  return sonuc
}

/** Tür → adet özeti (ham değer içermez): "2 TCKN, 1 KİŞİ". */
export function sizintiOzeti(bulgular: readonly SizintiBulgusu[]): string {
  const say = new Map<string, number>()
  for (const b of bulgular) say.set(b.tur, (say.get(b.tur) ?? 0) + 1)
  return [...say].map(([t, n]) => `${n} ${t}`).join(', ')
}

export class SizintiHata extends Error {
  readonly bulgular: SizintiBulgusu[]
  constructor(bulgular: SizintiBulgusu[]) {
    super(`Sızıntı: maskelenmemiş kişisel veri şüphesi bulundu (${sizintiOzeti(bulgular)}); yapay zekâ çağrısı durduruldu.`)
    this.name = 'SizintiHata'
    this.bulgular = bulgular
  }
}

/** Parçaların her birini tarar; sızıntı varsa SizintiHata fırlatır (çağrı yapılmaz). */
export function sizintiKapisi(parcalar: readonly string[], maske: Maskeleyici): void {
  const hepsi: SizintiBulgusu[] = []
  for (const p of parcalar) if (p) hepsi.push(...sizintiKontrol(p, maske).sizintilar)
  if (hepsi.length) throw new SizintiHata(hepsi)
}
