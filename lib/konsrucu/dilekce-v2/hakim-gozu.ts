/**
 * KonsRücü — Hâkim gözü (sarı uyarı) · lib/konsrucu/dilekce-v2/hakim-gozu.ts (saf; client-safe)
 *
 * S37 (06 §7.4-8; 07 S37). "İkinci bir model geçişi hakim-ilk-derece kontrol listesiyle çalışır; metni yeniden
 * yazmaz, yalnız {sorun, konum, gerekçe, önem} listesi döndürür." Bu sürümde YAPAY ZEKÂ ÇAĞRISI YOKTUR: basit,
 * kural tabanlı sezgiler (uzun paragraf, cümle tekrarı, uzun cümle, belirsiz ifade). Sonuç HER ZAMAN SARIDIR —
 * imzayı kilitlemez (kapilar.ts bunu yalnız `sari[]`e ekler).
 */

export type HakimGozuOnem = 'DUSUK' | 'ORTA' | 'YUKSEK'
export type HakimGozuBulgusu = { kod: string; sorun: string; konum: string; gerekce: string; onem: HakimGozuOnem }

const UZUN_PARAGRAF_KARAKTER = 900
const UZUN_CUMLE_KELIME = 60
const KISA_OZET = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n).trim()}…` : s.trim())

const BELIRSIZ_IFADELER = [
  'sanırım', 'galiba', 'muhtemelen', 'büyük ihtimalle', 'büyük olasılıkla', 'herhalde', 'belki',
  'gibi görünüyor', 'gibi gözüküyor', 'sanki', 'olsa gerek', 'olabilir', 'sanılmaktadır',
]

function paragraflaraBol(metin: string): string[] {
  return metin.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

/** Nokta/ünlem/soru işaretiyle biten kabaca cümle bölme (hukuk metninde kısaltmalar için mükemmel değil, sezgiseldir). */
function cumlelereBol(paragraf: string): string[] {
  return paragraf.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])/u).map((c) => c.trim()).filter(Boolean)
}

const cumleAnahtari = (c: string) => c.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()

/** Kural tabanlı, deterministik sezgiler. Aynı girdi → aynı çıktı; sıra metindeki konuma göredir. */
export function hakimGozu(metin: string): HakimGozuBulgusu[] {
  const bulgular: HakimGozuBulgusu[] = []
  if (!metin.trim()) return bulgular

  const paragraflar = paragraflaraBol(metin)
  const cumleSayaci = new Map<string, { adet: number; ornek: string }>()

  for (const p of paragraflar) {
    if (p.length > UZUN_PARAGRAF_KARAKTER) {
      bulgular.push({
        kod: 'UZUN_PARAGRAF', sorun: 'Paragraf çok uzun', konum: KISA_OZET(p),
        gerekce: `Paragraf ${p.length} karakter; uzun paragraflar hâkimin ilk okumasında atlanabilir. Kısa, numaralı cümlelere bölmek okunabilirliği artırır.`,
        onem: 'ORTA',
      })
    }
    for (const c of cumlelereBol(p)) {
      if (c.split(/\s+/).filter(Boolean).length > UZUN_CUMLE_KELIME) {
        bulgular.push({
          kod: 'UZUN_CUMLE', sorun: 'Cümle çok uzun', konum: KISA_OZET(c),
          gerekce: 'Cümle 60 kelimeden uzun; iki ayrı cümleye bölünmesi anlaşılırlığı artırır.',
          onem: 'DUSUK',
        })
      }
      const anahtar = cumleAnahtari(c)
      if (anahtar.length >= 20) {
        const kayit = cumleSayaci.get(anahtar)
        if (kayit) kayit.adet++
        else cumleSayaci.set(anahtar, { adet: 1, ornek: c })
      }
      const altMetin = c.toLocaleLowerCase('tr')
      for (const ifade of BELIRSIZ_IFADELER) {
        if (altMetin.includes(ifade)) {
          bulgular.push({
            kod: 'BELIRSIZ_IFADE', sorun: `Belirsiz ifade: "${ifade}"`, konum: KISA_OZET(c),
            gerekce: 'Hukuki metinde kesinlik beklenir; belirsiz ifade hâkimde tereddüt yaratabilir. Olgu netse doğrudan, netleşmediyse "kanaatimizce" gibi büronun kendi değerlendirmesi olarak yazılmalı.',
            onem: 'ORTA',
          })
        }
      }
    }
  }

  for (const { adet, ornek } of cumleSayaci.values()) {
    if (adet > 1) {
      bulgular.push({
        kod: 'TEKRAR', sorun: `Cümle ${adet} kez tekrar ediyor`, konum: KISA_OZET(ornek),
        gerekce: 'Aynı cümlenin birden çok yerde tekrarı metni gereksiz uzatır ve dikkat dağıtır.',
        onem: 'DUSUK',
      })
    }
  }

  return bulgular
}
