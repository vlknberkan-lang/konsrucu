/**
 * KonsRücü — Ray'e eksik evrak istek taslağı · lib/konsrucu/oneri/ray-istek.ts  (saf; yapay zekâsız, client-safe)
 *
 * S19 (06 §2(a) "Eksik evrak … Ray'e gidecek istek e-postasının taslağı hazırdır"; EV-04). Program e-postayı
 * GÖNDERMEZ; avukat taslağı kopyalar ya da e-posta programında açar (06 §9.2: müvekkile otomatik e-posta yok).
 * Taslakta kişisel veri yoktur: yalnız Ray'in kendi dosya numaraları (hukuk ve hasar no) ve evrak adları.
 */

export type RayIstekGirdi = {
  hukukDosyaNo?: string | null
  hasarDosyaNo?: string | null
  rucuSebebiAd?: string | null
  eksikler: readonly { ad: string; aciklama?: string | null }[]
  buroAdi?: string | null
}

export type RayIstekTaslagi = { konu: string; govde: string; mailto: string }

const tek = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** Eksik yoksa null. Konu ve gövde düz metin; `mailto` alıcısız (adres avukat seçer). */
export function rayEvrakIstekTaslagi(g: RayIstekGirdi): RayIstekTaslagi | null {
  const eksikler = g.eksikler.map((e) => ({ ad: tek(e.ad), aciklama: tek(e.aciklama) })).filter((e) => e.ad)
  if (!eksikler.length) return null
  const kimlik = [g.hukukDosyaNo ? `Hukuk no ${tek(g.hukukDosyaNo)}` : null, g.hasarDosyaNo ? `Hasar no ${tek(g.hasarDosyaNo)}` : null]
    .filter(Boolean).join(' · ')
  const konu = `Eksik evrak talebi${kimlik ? ` · ${kimlik}` : ''}`
  const satirlar = [
    'Merhaba,',
    '',
    `${kimlik ? `${kimlik} numaralı rücu dosyası` : 'Aşağıdaki rücu dosyası'} için takip hazırlığında şu evrak eksik görünüyor:`,
    '',
    ...eksikler.map((e, i) => `${i + 1}. ${e.ad}${e.aciklama ? ` (${e.aciklama})` : ''}`),
    '',
    ...(g.rucuSebebiAd ? [`Dosyanın rücu sebebi: ${tek(g.rucuSebebiAd)}.`, ''] : []),
    'Paylaşabilirseniz dosyaya ekleyip takibe hazırlığı tamamlayacağız.',
    '',
    'Saygılarımızla,',
    tek(g.buroAdi) || '⟨Büro⟩',
  ]
  const govde = satirlar.join('\n')
  const mailto = `mailto:?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(govde)}`
  return { konu, govde, mailto }
}
