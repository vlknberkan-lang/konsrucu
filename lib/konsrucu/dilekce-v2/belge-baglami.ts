/**
 * KonsRücü — Dosya kartı için belge bağlamı · lib/konsrucu/dilekce-v2/belge-baglami.ts (saf)
 *
 * 06 §7.3 ve 2(h) "Ne ters gidebilir": okunamayan belge adıyla gösterilir; uzun belgede kısaltılan bölüm adıyla
 * gösterilir. Bugünkü masanın kör bağlam kurucusunun (belge başına 6.000, toplam 55.000 karakter, en yeni önce; B40)
 * yerine: türe göre asıl kaynak belgeler önce, sayfa işaretli, bütçe aşılırsa hangi belgenin kısaldığı kayıtlı.
 * KVKK: `aiIzni = YASAK` (alkol, sağlık, kimlik …) belgeler yapay zekâya hiç gitmez.
 */
import type { BelgeMetni } from './alinti'
import type { KartTuru } from './tipler'
import { sonucBolumunuCikar } from './turler/beyan'

export type BaglamBelgesi = {
  id: string
  ad: string
  altTur: string | null
  kategori: string | null
  tarih: string | null
  metinDurumu: string | null
  aiIzni: string | null
  metin: BelgeMetni | null
}

export type SecilenBelge = { ref: string; belgeId: string; ad: string; metin: string }

export const BELGE_UST_SINIR = 30_000
export const HEDEF_BELGE_UST_SINIR = 80_000 // cevaba cevapta cevap, beyanda rapor TAM okunur
export const TOPLAM_UST_SINIR = 160_000

const ONCELIK: Record<KartTuru, RegExp[]> = {
  DAVA: [/ITIRAZ/, /SON_TUTANAK/, /TAKIP_TALEBI/, /ODEME_EMRI/, /DEKONT/, /TUTANAK|KTT/, /POLICE/, /EKSPERTIZ/, /LEHE|SBM/],
  DELIL: [/TENSIP/, /ARA_KARAR/, /DAVA_CEVAP/, /SON_TUTANAK/, /DEKONT/, /TUTANAK|KTT/, /POLICE/, /EKSPERTIZ/],
  CEVABA_CEVAP: [/DAVA_CEVAP/, /ITIRAZ/, /TUTANAK|KTT/, /DEKONT/, /EKSPERTIZ/, /POLICE/, /SON_TUTANAK/],
  BEYAN: [/BILIRKISI/, /MUZEKKERE/, /ARA_KARAR/, /TENSIP/, /DAVA_CEVAP/, /DEKONT/, /TUTANAK|KTT/],
}
/** Bu türde tam okunması gereken hedef belge (06 §7.3 bağlam planı). */
const HEDEF: Partial<Record<KartTuru, RegExp>> = { CEVABA_CEVAP: /DAVA_CEVAP/, BEYAN: /BILIRKISI|MUZEKKERE_CEVAB|ARA_KARAR/ }

const OKUNAMADI = new Set(['OKUNAMADI', 'BEKLIYOR', 'KVKK_ATLANDI'])

function oncelik(b: BaglamBelgesi, tur: KartTuru): number {
  const anahtar = `${b.altTur ?? ''} ${b.kategori ?? ''}`
  const i = ONCELIK[tur].findIndex((r) => r.test(anahtar))
  return i < 0 ? 100 : i
}

function sayfaliMetin(m: BelgeMetni): string {
  return m.sayfalar.map((s) => (s.sayfaNo != null ? `[Sayfa ${s.sayfaNo}]\n${s.metin.trim()}` : s.metin.trim())).join('\n\n')
}

export function belgeBaglamiKur(belgeler: readonly BaglamBelgesi[], tur: KartTuru): {
  secilen: SecilenBelge[]
  okunamayan: string[]
  kisaltilan: string[]
  aiyaGitmeyen: string[]
} {
  const okunamayan: string[] = []
  const aiyaGitmeyen: string[] = []
  const kisaltilan: string[] = []
  const adaylar: BaglamBelgesi[] = []
  for (const b of belgeler) {
    if (b.kategori === 'HASAR_FOTO') continue // görsel; metin hattının konusu değil
    if (b.aiIzni === 'YASAK') { aiyaGitmeyen.push(b.ad); continue }
    const metinVar = !!b.metin?.sayfalar.some((s) => s.metin?.trim())
    if (!metinVar || OKUNAMADI.has(b.metinDurumu ?? '')) { if (b.metinDurumu !== 'GEREKSIZ') okunamayan.push(b.ad); continue }
    adaylar.push(b)
  }
  adaylar.sort((a, b) => oncelik(a, tur) - oncelik(b, tur) || (b.tarih ?? '').localeCompare(a.tarih ?? '') || a.ad.localeCompare(b.ad, 'tr'))

  const hedef = HEDEF[tur]
  const secilen: SecilenBelge[] = []
  let kalan = TOPLAM_UST_SINIR
  for (const b of adaylar) {
    if (kalan <= 500) { kisaltilan.push(b.ad); continue }
    const tam = sayfaliMetin(b.metin!)
    const hedefBelgeMi = !!hedef?.test(`${b.altTur ?? ''}`)
    const sinir = Math.min(hedefBelgeMi ? HEDEF_BELGE_UST_SINIR : BELGE_UST_SINIR, kalan)
    let metin = tam
    if (tam.length > sinir) {
      // Hedef belgede (bilirkişi raporu, ara karar) SONUÇ/KANAAT bölümü son sayfada olsa da kesilmez (06
      // §5.7-4, B40): bölüm bulunur ve bütçeye sığarsa metnin ortası kısaltılır, SONUÇ bölümü tam eklenir.
      const sonuc = hedefBelgeMi ? sonucBolumunuCikar(tam) : { bulunduMu: false as const, govde: '' }
      const NOT_ISARETI = '\n[… belgenin ortası gönderilmedi; SONUÇ/KANAAT bölümü tam aşağıdadır …]\n'
      if (sonuc.bulunduMu && sonuc.govde.length > 0 && sonuc.govde.length < sinir - NOT_ISARETI.length) {
        const onSinir = Math.max(sinir - sonuc.govde.length - NOT_ISARETI.length, 0)
        metin = `${tam.slice(0, onSinir)}${NOT_ISARETI}${sonuc.govde}`
      } else {
        metin = `${tam.slice(0, sinir)}\n[… belgenin kalanı gönderilmedi]`
      }
      kisaltilan.push(b.ad)
    }
    kalan -= metin.length
    secilen.push({ ref: `B-${secilen.length + 1}`, belgeId: b.id, ad: b.ad, metin })
  }
  return { secilen, okunamayan, kisaltilan, aiyaGitmeyen }
}
