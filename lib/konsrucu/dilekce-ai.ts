/**
 * KonsRücü — Dava dilekçesi "AÇIKLAMALAR" olgusal anlatımı (AI) · lib/konsrucu/dilekce-ai.ts
 * Sadece OLGU yazar (kim/ne/nerede/nasıl/kusur/ödeme) — hukuki sebep, Yargıtay, talep ŞABLONDAN gelir.
 * Kaynak: olay bağlamı + dosya künyesi + BELGE METİNLERİ (kaza tutanağı/ekspertiz/hasar dosyası/dekont) +
 * FOTOĞRAFLAR (ehliyet/ruhsat/tutanak, vision). Büro üslubunda 2-3 paragraf.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { Gorsel } from './analiz'
import { unvanGecir } from './unvan'

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
  // yeni: doğrudan kanıt
  belgeMetni?: string | null
  gorseller?: Gorsel[]
  dekontlar?: { tarih: string | null; tutar: number | null; aciklama: string | null; haricMi: boolean }[]
  alacakliUnvan?: string | null // aktif tenant'ın alacaklı unvanı (Ray / Zurich) — prompttaki "Ray Sigorta" yerine
}

const SISTEM = `Sen Ray Sigorta A.Ş. vekili K/Partners hukuk bürosunun dava dilekçesi yazarısın. Sana bir rücu dosyasının OLAY BAĞLAMI, künyesi, BELGE METİNLERİ (kaza tespit tutanağı, görgü/ifade tutanağı, ekspertiz, hasar dosyası, dekontlar) ve FOTOĞRAFLAR (ehliyet/ruhsat/tutanak) verilir. Görevin: itirazın iptali dava dilekçesinin "AÇIKLAMALAR" kısmının OLGUSAL anlatımını yazmak (2-3 paragraf, resmi dilekçe Türkçesi).

KURALLAR:
- Olguları ÖNCE BELGELERDEN/FOTOĞRAFLARDAN oku (plaka, isim, TCKN, kaza tarihi/yeri, kusur oranı, ödeme kalemleri, tutanak no). Yapılandırılmış künye ile çelişirse RESMÎ TUTANAĞA güven.
- SADECE OLGU yaz: müvekkil sigortalısı + plaka + poliçe branşı, kaza tarihi/yeri, taraflar/araçlar, kazanın NASIL olduğu, kusur durumu/oranı, ödenen tazminat (mümkünse KALEM KALEM: kime/ne kadar/ne zaman) ve rücu hakkının doğuşu (halefiyet).
- HUKUKİ SEBEP / YARGITAY / KANUN MADDESİ / TALEP YAZMA — şablondan gelir, tekrarlama.
- ASLA UYDURMA. Belgede de yoksa kısa bir ⟨...⟩ yer tutucu bırak (ör. ⟨tutanak no⟩).
- Üslup: "Müvekkil Ray Sigorta A.Ş. nezdinde ... sigortalı bulunan ... plakalı araç, ... tarihinde ..." gibi ağırbaşlı; düz paragraf, madde işareti kullanma (ödeme kalemlerini cümle içinde say).
- Tür "alkol" → promil ve %100 kusur; "olay yeri terk" → terk fiili ve delillerin toplanamaması; "çarpıp kaçma/park" → park halindeki araca çarpıp kaçma — yalnız OLGU düzeyinde.
Sadece anlatım metnini döndür (başlık/JSON yok).`

export async function dilekceAnlatim(g: AnlatimGirdi): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const client = new Anthropic({ apiKey: key })
  const imgs = (g.gorseller ?? []).slice(0, 10)
  // base64/uzun metni JSON dökümünden çıkar
  const { gorseller: _g, belgeMetni: _b, alacakliUnvan: _a, ...kunye } = g
  void _g; void _b; void _a
  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: `Dosya künyesi (yapılandırılmış):\n${JSON.stringify(kunye, null, 2)}` },
  ]
  if (g.belgeMetni && g.belgeMetni.trim()) content.push({ type: 'text', text: `\nBELGE METİNLERİ:\n${g.belgeMetni.slice(0, 120000)}` })
  for (const im of imgs) content.push({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.b64 } })
  content.push({ type: 'text', text: `${imgs.length ? `Yukarıda ${imgs.length} fotoğraf da ekli. ` : ''}Belge metinleri ve fotoğraflardan yararlanarak AÇIKLAMALAR olgusal anlatımını yaz:` })
  try {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1800, system: unvanGecir(SISTEM, g.alacakliUnvan), messages: [{ role: 'user', content }] })
    const blok = res.content.find((b) => b.type === 'text')
    return blok && blok.type === 'text' ? blok.text.trim() : null
  } catch (e) {
    console.error('dilekceAnlatim hata:', e)
    return null
  }
}
