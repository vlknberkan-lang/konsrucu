/**
 * KonsRücü — Katman 3 (LLM asistanı) · lib/konsrucu/analiz.ts  (server-only)
 * İşlenen belge metninden GERÇEK rücu zekâsını çıkarır: triyaj (yol+güven+neden),
 * borçlular, kusur/oluş şekli, takip-aç açıklaması, bağımsız teyit önerileri.
 * Forced tool-use ile şema-zorunlu JSON. Model ucuz katman = Haiku (gerekirse sonnet).
 */
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001' // ucuz; kalite için 'claude-sonnet-4-6'

export type BorcluLLM = { adUnvan: string; tcVkn?: string; adres?: string; rol?: string; kaynak?: string; teyit?: string }
export type TeyitLLM = { not: string; tip: 'oneri' | 'uyari' | 'ok' }
export type AnalizSonuc = {
  yol: 'klasik' | 'idari' | 'belirsiz'
  yolGuven: number
  yolNeden?: string
  brans?: string
  sigortaliUnvan?: string
  sigortaliPlaka?: string
  karsiPlaka?: string
  il?: string
  kazaYeri?: string
  olusSekli?: string
  kusurDurumu?: string
  asilAlacak?: number
  rucuTutari?: number
  rucuOrani?: string
  yetkiliIcra?: string
  muhatapOzet?: string
  borclular: BorcluLLM[]
  aciklama: string
  teyit: TeyitLLM[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    yol: { type: 'string', enum: ['klasik', 'idari', 'belirsiz'], description: 'Triyaj kararı' },
    yolGuven: { type: 'number', description: '0-1 arası güven' },
    yolNeden: { type: 'string', description: 'kısa gerekçe' },
    brans: { type: 'string', enum: ['KASKO', 'ZMMS', 'OTO_DISI', ''], description: 'poliçe branşı' },
    sigortaliUnvan: { type: 'string' },
    sigortaliPlaka: { type: 'string' },
    karsiPlaka: { type: 'string' },
    il: { type: 'string', description: 'kaza ili' },
    kazaYeri: { type: 'string' },
    olusSekli: { type: 'string', description: 'kazanın oluş şekli (anlatım)' },
    kusurDurumu: { type: 'string' },
    asilAlacak: { type: 'number', description: 'ödenen tazminat — TAM tutar (TL, sayı)' },
    rucuTutari: { type: 'number', description: 'rücuen talep edilecek tutar = ödenen tazminatın KUSUR PAYI (Lehe formundaki RÜCU TUTARI). Tam kusurda asilAlacak ile aynı; kısmi kusurda asilAlacak × kusur oranı.' },
    rucuOrani: { type: 'string', description: 'kusur/rücu oranı, ör. "%50" / "%100"' },
    yetkiliIcra: { type: 'string', description: 'kaza yerine göre yetkili icra dairesi önerisi' },
    muhatapOzet: { type: 'string', description: 'idari ise KGM bölge/işletmeci; klasik ise borçlu özeti' },
    borclular: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          adUnvan: { type: 'string' },
          tcVkn: { type: 'string' },
          adres: { type: 'string' },
          rol: { type: 'string', enum: ['RUHSAT_SAHIBI', 'SURUCU', 'ISVEREN', 'KAT_MALIKI', 'YONETIM', 'DIGER'] },
          kaynak: { type: 'string', description: 'Lehe/ekspertiz/tutanak/tescil' },
          teyit: { type: 'string', enum: ['TEYIT_EDILDI', 'TEYIT_GEREK', 'SUPHE'] },
        },
        required: ['adUnvan', 'rol', 'teyit'],
      },
    },
    aciklama: { type: 'string', description: 'UYAP takip açıklama metni (sabit kalıp + footer)' },
    teyit: {
      type: 'array',
      items: {
        type: 'object',
        properties: { not: { type: 'string' }, tip: { type: 'string', enum: ['oneri', 'uyari', 'ok'] } },
        required: ['not', 'tip'],
      },
    },
  },
  required: ['yol', 'yolGuven', 'borclular', 'aciklama', 'teyit'],
}

const SISTEM = `Sen Ray Sigorta A.Ş. vekili K/Partners hukuk bürosunun rücu uzmanısın. Sana bir hasar dosyasının belgelerinden çıkarılmış HAM METİN verilir (poliçe, Lehe formu, ekspertiz raporu, kaza tespit tutanağı, dekont). Yapılandırılmış rücu alanlarını çıkar ve "kaydet" aracını çağır.

KURALLAR:
- ASLA UYDURMA. Metinde yoksa alanı boş bırak; emin değilsen borçlu teyit'ini TEYIT_GEREK yap.
- TRİYAJ (yol): kusurlu KARŞI taraf/sürücü/araç sahibi belliyse → "klasik" (kişi-kişi rücu icra). KASKO hizmet kusuru (yol/işaretleme eksikliği → muhatap KGM veya özel yol işletmecisi), tek taraflı, yola düşen cisim → "idari". Net değilse → "belirsiz". yolGuven 0-1 ver.
- YETKİLİ İCRA = KAZA YERİ (haksız fiilin işlendiği yer), borçlunun ikameti DEĞİL.
- BORÇLU çoklu/müteselsil olabilir: ruhsat sahibi/işleten + sürücü + (ticari araçta) işveren. Branşa göre yön: KASKO → kusurlu KARŞI taraf; ZMMS → KENDİ sigortalı taraf (poliçe ihlali: alkol/ehliyetsiz). Borçlu ↔ plaka bağı belgesizse o borçlunun teyit'i = TEYIT_GEREK ve teyit listesine "tescil/işleten sorgusu (EGM/SBM) önerilir" notunu ekle.
- ★ EN ÖNCELİKLİ KAYNAK = LEHE / HUKUK DEVİR FORMU. Dosyada "LEHE HUKUK DEVİR FORMU" varsa borçluyu ORADAN al; fotoğraf/araçtan tahmin etme. O formdaki "RÜCU MUHATABI / MUHATAPLARI" satırındaki kişi(ler) borçludur (ad-soyad + TCKN/VKN birebir). "RÜCU GEREKÇESİ" (ör. YAYA, ALKOL, IŞIK İHLALİ), "RÜCU TUTARI", "ÖDEME TUTARI", "HASAR TARİHİ", "BRANŞ" da buradan gelir. asilAlacak = ÖDEME TUTARI, rucuTutari = RÜCU TUTARI (sayı olarak).
- MUHATAP YAYA/BİSİKLETLİ/PİYADE ise: borçlu rol = DIGER, adUnvan'a "(yaya)" ekle; yolNeden/muhatapOzet'e "kusurlu yaya" yaz. Yayada plaka/araç ARAMA.
- KUSUR ORANI: Kaza tespit tutanağı varsa oradan oku. Tutanak yoksa, RÜCU TUTARI ÷ ÖDEME TUTARI oranı kusur payını verir (ör. rücu, ödemenin yarısı ise ~%50 kusur). Bunu kusurDurumu'na yaz.
- MÜKERRER EVRAK: Aynı poliçe/ekspertiz/dekont farklı adlarla birden çok gelebilir. Tek varlık say; borçluyu/muhatabı TEKRARLAMA, çelişki yoksa birleştir.
- ★ TUTAR AYRIMI (kısmi kusurda HASARI BÖL): asilAlacak = ÖDENEN tazminat (tam). rucuTutari = RÜCUEN talep edilecek = ödenen × kusur oranı. Ör. %50 kusur + ödeme 71.214,81 → rucuTutari 35.607,41. Lehe formunda RÜCU TUTARI yazılıysa onu rucuTutari yap; yoksa asilAlacak × kusurOranı hesapla. rucuOrani'na yüzdeyi yaz (ör "%50"). Tam kusurda (%100) ikisi eşittir. Birden çok dekont varsa asilAlacak için TOPLA. ÖNEMLİ: rücu < ödeme ise oran RAKAMLARDAN gelir (yarısı → %50); yaya/tam kusur olsa bile rakam bölünmüşse %100 VARSAYMA, kusurDurumu ile rucuOrani tutarlı olsun.
- AÇIKLAMA (UYAP takip metni) şu sabit kalıpta olsun: "[KAZA TARİHİ] tarihinde Ray Sigorta A.Ş nezdinde sigortalı bulunan [SİG.PLAKA] plakalı araç ile [KARŞI PLAKA] plakalı [araç/motosiklet] arasında meydana gelen trafik kazası neticesinde sigortalıya ödenen tazminatın kusurlu taraftan rücu bedeline ilişkindir." Sonuna footer satırını ekle. DETAY VERME (promil, tazminat türü yazma). Karşı plaka yoksa kalıbı minimal uyarla. Borçlu tartışmalıysa nötr bitir.
- TEYİT NOTLARI: bağımsız doğrulayıcı gözüyle eksik/şüpheli noktaları (borçlu-plaka bağı belgesiz, el yazısı beyandan okunan plaka, hasar-ödeme tutar farkı, sürücü≠sahip≠sigortalı karışıklığı) "oneri"/"uyari" olarak yaz; doğrulanmış güçlü noktaları "ok".
Hepsi Türkçe.`

export async function analizEt(metin: string, footer?: string): Promise<AnalizSonuc | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !metin.trim()) return null
  const client = new Anthropic({ apiKey: key })
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SISTEM + (footer ? `\nAçıklama footer'ı (sonuna ekle): ${footer}` : '\nFooter yoksa "K/Partners" iletişim satırı bırak.'),
      messages: [{ role: 'user', content: `Belge metni:\n\n${metin.slice(0, 150000)}` }],
      tools: [{ name: 'kaydet', description: 'Çıkarılan rücu alanlarını kaydet', input_schema: SCHEMA as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: 'kaydet' },
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return null
    return block.input as AnalizSonuc
  } catch (e) {
    console.error('analizEt hata:', e)
    return null
  }
}
