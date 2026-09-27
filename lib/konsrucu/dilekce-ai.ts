/**
 * KonsRücü — Dava dilekçesi "AÇIKLAMALAR" olgusal anlatımı (AI) · lib/konsrucu/dilekce-ai.ts
 * Sadece OLGU yazar (kim/ne/nerede/nasıl/kusur/ödeme) — hukuki sebep, Yargıtay, talep ŞABLONDAN gelir.
 * Kaynak: olay bağlamı + dosya künyesi + BELGE METİNLERİ (kaza tutanağı/ekspertiz/hasar dosyası/dekont).
 * Büro üslubunda 2-3 paragraf.
 *
 * ESKİ HAT (F5): app/(app)/akilli-giris/actions.ts · dilekceUret ESKI_DILEKCE_HATTI=acik değilse kapalı.
 * S09: yine de sarmalayıcıya taşındı (yüzey 'dilekce_eski'): maskeli metin, GÖRSELSİZ (ehliyet/ruhsat
 * fotoğrafı gitmez), yanıt sunucuda geri açılır.
 */
import { unvanGecir } from './unvan'
import { aiOturumu, aiKapiHatasiMi, acilamayanUyarisi, type MaskeKaynagi } from '@/lib/ai/cagri'

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
  dekontlar?: { tarih: string | null; tutar: number | null; aciklama: string | null; haricMi: boolean }[]
  alacakliUnvan?: string | null // aktif tenant'ın alacaklı unvanı (Ray / Zurich) — prompttaki "Ray Sigorta" yerine
}

const SISTEM = `Sen Ray Sigorta A.Ş. vekili hukuk bürosunun dava dilekçesi yazarısın. Sana bir rücu dosyasının OLAY BAĞLAMI, künyesi ve BELGE METİNLERİ (kaza tespit tutanağı, görgü/ifade tutanağı, ekspertiz, hasar dosyası, dekontlar) verilir. Görevin: itirazın iptali dava dilekçesinin "AÇIKLAMALAR" kısmının OLGUSAL anlatımını yazmak (2-3 paragraf, resmi dilekçe Türkçesi).

KURALLAR:
- Olguları ÖNCE BELGELERDEN oku (plaka, isim, kaza tarihi/yeri, kusur oranı, ödeme kalemleri, tutanak no). Yapılandırılmış künye ile çelişirse RESMÎ TUTANAĞA güven.
- SADECE OLGU yaz: müvekkil sigortalısı + plaka + poliçe branşı, kaza tarihi/yeri, taraflar/araçlar, kazanın NASIL olduğu, kusur durumu/oranı, ödenen tazminat (mümkünse KALEM KALEM: kime/ne kadar/ne zaman) ve rücu hakkının doğuşu (halefiyet).
- HUKUKİ SEBEP / YARGITAY / KANUN MADDESİ / TALEP YAZMA — şablondan gelir, tekrarlama.
- ASLA UYDURMA. Belgede de yoksa kısa bir ⟨...⟩ yer tutucu bırak (ör. ⟨tutanak no⟩).
- Üslup: "Müvekkil Ray Sigorta A.Ş. nezdinde ... sigortalı bulunan ... plakalı araç, ... tarihinde ..." gibi ağırbaşlı; düz paragraf, madde işareti kullanma (ödeme kalemlerini cümle içinde say).
- Tür "alkol" → promil ve %100 kusur; "olay yeri terk" → terk fiili ve delillerin toplanamaması; "çarpıp kaçma/park" → park halindeki araca çarpıp kaçma — yalnız OLGU düzeyinde.
Sadece anlatım metnini döndür (başlık/JSON yok).`

export async function dilekceAnlatim(g: AnlatimGirdi, ai?: { musteriId?: string; dosyaId?: string }, maske?: MaskeKaynagi): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const oturum = aiOturumu({
    yuzey: 'dilekce_eski',
    ai,
    maske: maske ?? { kisiler: [...g.davalilar.map((d) => d.ad), g.sigortaliUnvan], plakalar: [g.sigortaliPlaka, g.karsiPlaka] },
  })
  // uzun metni künye dökümünden çıkar
  const { belgeMetni: _b, alacakliUnvan: _a, ...kunye } = g
  void _b; void _a
  try {
    const y = await oturum.iste({
      model: MODEL,
      maxTokens: 1800,
      sistem: unvanGecir(SISTEM, g.alacakliUnvan),
      icerik: [
        { tur: 'metin', metin: 'Dosya künyesi (yapılandırılmış):' },
        { tur: 'json', veri: kunye },
        ...(g.belgeMetni && g.belgeMetni.trim() ? [{ tur: 'belge' as const, ad: 'Belge metinleri', metin: g.belgeMetni.slice(0, 120000) }] : []),
        { tur: 'metin', metin: 'Belge metinlerinden yararlanarak AÇIKLAMALAR olgusal anlatımını yaz:' },
      ],
    })
    if (y.kesildi || !y.metin.trim()) return null
    const uyari = acilamayanUyarisi(y.acilamayanJetonlar)
    return y.metin.trim() + (uyari ? `\n⟨${uyari}⟩` : '')
  } catch (e) {
    console.error('dilekceAnlatim hata:', aiKapiHatasiMi(e) ? e.message : e instanceof Error ? e.name : 'bilinmeyen')
    return null
  }
}
