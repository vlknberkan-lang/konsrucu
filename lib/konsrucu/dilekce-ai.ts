/**
 * KonsRücü — Dava dilekçesi "AÇIKLAMALAR" olgusal anlatımı (AI) · lib/konsrucu/dilekce-ai.ts
 * Sadece OLGU yazar (kim/ne/nerede/nasıl/kusur/ödeme) — hukuki sebep, Yargıtay, talep ŞABLONDAN gelir.
 * Bizim olay bağlamımızdan (cikarimJson.olayBaglami) + dosya verisinden, büro üslubunda 2-3 paragraf.
 */
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6'

export type AnlatimGirdi = {
  olayBaglami: string | null
  olayTuru: string | null
  brans: string | null
  sigortaliPlaka: string | null
  karsiPlaka: string | null
  sigortaliUnvan: string | null
  kazaTarihi: string | null
  kazaYeri: string | null
  davalilar: { ad: string; rol: string | null }[]
  asilAlacak: number | null
  rucuOrani: string | null
  kusurDurumu: string | null
  odemeBilgi: string | null
}

const SISTEM = `Sen Ray Sigorta A.Ş. vekili K/Partners hukuk bürosunun dava dilekçesi yazarısın. Sana bir rücu dosyasının OLAY BAĞLAMI ve künyesi verilir. Görevin: itirazın iptali dava dilekçesinin "AÇIKLAMALAR" kısmının OLGUSAL anlatımını yazmak (2-3 paragraf, resmi dilekçe Türkçesi).

KURALLAR:
- SADECE OLGU yaz: müvekkil sigortalısı + plaka + poliçe branşı, kaza tarihi/yeri, taraflar/araçlar, kazanın NASIL olduğu, kusur durumu/oranı, sigortalıya/mağdura ödenen tazminat ve kime ödendiği, rücu hakkının doğuşu (halefiyet) — verilen bilgilerden.
- HUKUKİ SEBEP / YARGITAY KARARI / KANUN MADDESİ / TALEP YAZMA — onlar şablondan gelir, tekrarlama.
- ASLA UYDURMA. Verilmeyen tutar/isim/plaka/tarih için kısa bir ⟨...⟩ yer tutucu bırak (ör. ⟨ödeme tarihi⟩).
- Üslup: "Müvekkil Ray Sigorta A.Ş. nezdinde ... sigortalı bulunan ... plakalı araç, ... tarihinde ... " gibi, sample dilekçelerdeki ağırbaşlı dil. Abartma, madde işareti kullanma, düz paragraf yaz.
- Olay türü "alkol" ise alkol/promil ve %100 kusuru; "olay yeri terk" ise terk fiilini ve delillerin toplanamamasını; "çarpıp kaçma/park" ise park halindeki araca çarpıp kaçmayı vurgula — ama yalnız OLGU düzeyinde.
Sadece anlatım metnini döndür (başlık/JSON yok).`

export async function dilekceAnlatim(g: AnlatimGirdi): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const client = new Anthropic({ apiKey: key })
  const veri = JSON.stringify(g, null, 2)
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SISTEM,
      messages: [{ role: 'user', content: `Dosya verisi ve olay bağlamı:\n\n${veri}\n\nAÇIKLAMALAR olgusal anlatımını yaz:` }],
    })
    const blok = res.content.find((b) => b.type === 'text')
    return blok && blok.type === 'text' ? blok.text.trim() : null
  } catch (e) {
    console.error('dilekceAnlatim hata:', e)
    return null
  }
}
