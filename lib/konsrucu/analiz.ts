/**
 * KonsRücü — Katman 3 (LLM asistanı) · lib/konsrucu/analiz.ts  (server-only)
 * İşlenen belge metninden GERÇEK rücu zekâsını çıkarır: triyaj (yol+güven+neden),
 * borçlular, kusur/oluş şekli, takip-aç açıklaması, bağımsız teyit önerileri.
 * Forced tool-use ile şema-zorunlu JSON. Model ucuz katman = Haiku (gerekirse sonnet).
 */
import Anthropic from '@anthropic-ai/sdk'
import { unvanGecir } from './unvan'

const MODEL = 'claude-sonnet-4-6' // dedektif çıkarım: çok-belge bağlam + mentor akıl yürütme → güçlü model (haiku yetersiz)

export type BorcluLLM = { adUnvan: string; tcVkn?: string; telefon?: string; adres?: string; rol?: string; kaynak?: string; teyit?: string }
export type TeyitLLM = { not: string; tip: 'oneri' | 'uyari' | 'ok' }
export type DekontLLM = { tarih?: string; tutar?: number; ekspertizMi?: boolean; aciklama?: string }
export type AnalizSonuc = {
  yol: 'klasik' | 'idari' | 'belirsiz'
  yolGuven: number
  yolNeden?: string
  olayTuru?: string
  brans?: string
  sigortaliUnvan?: string
  sigortaliTelefon?: string
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
  dekontlar?: DekontLLM[]
  aciklama: string
  olayBaglami: string
  sonrakiAdimlar?: string[]
  teyit: TeyitLLM[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    yol: { type: 'string', enum: ['klasik', 'idari', 'belirsiz'], description: 'Triyaj kararı' },
    yolGuven: { type: 'number', description: '0-1 arası güven' },
    yolNeden: { type: 'string', description: 'kısa gerekçe' },
    olayTuru: { type: 'string', description: 'Olayın türü (kanıttan): "trafik kazası (iki araç)", "çizme/kasıtlı zarar (vandalizm)", "tek taraflı", "sabit cisme çarpma", "hırsızlık", "yangın", "hizmet/yol kusuru (idari)", "yaya" vb. TÜM mantık (borçlu, karşı plaka, açıklama, öneri) buna göre kurulur.' },
    brans: { type: 'string', enum: ['KASKO', 'ZMMS', 'OTO_DISI', ''], description: 'poliçe branşı' },
    sigortaliUnvan: { type: 'string' },
    sigortaliTelefon: { type: 'string', description: 'sigortalının iletişim telefonu (varsa; poliçe/Lehe/başvuru formundan). Yoksa boş bırak.' },
    sigortaliPlaka: { type: 'string' },
    karsiPlaka: { type: 'string', description: 'Karşı aracın plakası — YALNIZ araç-araç çarpışmasında. Vandalizm/çizme, tek taraflı, hırsızlık, yangın, yaya olaylarında BOŞ bırak (karşı araç yoktur).' },
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
          telefon: { type: 'string', description: 'borçlunun telefonu (varsa; tutanak/beyan/Lehe formundan). Yoksa boş bırak.' },
          adres: { type: 'string' },
          rol: { type: 'string', enum: ['RUHSAT_SAHIBI', 'SURUCU', 'ISVEREN', 'KAT_MALIKI', 'YONETIM', 'DIGER'] },
          kaynak: { type: 'string', description: 'Lehe/ekspertiz/tutanak/tescil' },
          teyit: { type: 'string', enum: ['TEYIT_EDILDI', 'TEYIT_GEREK', 'SUPHE'] },
        },
        required: ['adUnvan', 'rol', 'teyit'],
      },
    },
    dekontlar: {
      type: 'array',
      description: 'Belgelerdeki ÖDEME dekontları/makbuz/havale/EFT kayıtları. Her gerçek ödeme bir kalem. Ekspertiz ücreti ödemesi de kalem olur ama ekspertizMi=true (faiz anaparasına DAHİL EDİLMEZ).',
      items: {
        type: 'object',
        properties: {
          tarih: { type: 'string', description: 'ödeme/dekont tarihi, YYYY-MM-DD' },
          tutar: { type: 'number', description: 'ödeme tutarı (TL, sayı)' },
          ekspertizMi: { type: 'boolean', description: 'true = ekspertiz/eksper ücreti ödemesi → faiz anaparasına dahil etme' },
          aciklama: { type: 'string', description: 'kısa etiket (ör. "tazminat ödemesi", "ekspertiz ücreti", "2. taksit")' },
        },
        required: ['tutar'],
      },
    },
    aciklama: { type: 'string', description: 'UYAP takip açıklama metni (sabit kalıp + footer)' },
    olayBaglami: { type: 'string', description: 'Olayın yeniden kurulmuş bağlamı: ne zaman/nerede/hangi araçlar-kişiler/nasıl oldu/kusur kimde — her kritik olgu HANGİ belgeden (kaza tespit/görgü/ifade tutanağı, bilirkişi raporu...). Borçlu ve kusur önerisinin DAYANAĞI; bağlam kurmadan öneri verme.' },
    sonrakiAdimlar: { type: 'array', items: { type: 'string' }, description: 'Eksik/şüpheli bilgide MENTOR önerileri: somut, eyleme dönük adımlar (kime ne sorulacak, hangi sorgu/teyit yapılacak — ör. "Sigortalıyı ara, karşı sürücünün TCKN/iletişimini iste").' },
    teyit: {
      type: 'array',
      items: {
        type: 'object',
        properties: { not: { type: 'string' }, tip: { type: 'string', enum: ['oneri', 'uyari', 'ok'] } },
        required: ['not', 'tip'],
      },
    },
  },
  required: ['yol', 'yolGuven', 'olayTuru', 'borclular', 'aciklama', 'olayBaglami', 'teyit'],
}

const SISTEM = `Sen Ray Sigorta A.Ş. vekili K/Partners hukuk bürosunun rücu DEDEKTİFİ ve MENTORUSUN. Sana bir hasar dosyasının TÜM belgelerinden çıkarılmış ham metin verilir: kaza tespit tutanağı, görgü tutanağı, ifade/beyan tutanakları, bilirkişi raporu, ekspertiz raporu, poliçe, ruhsat, ehliyet, alkol/promil raporu, dekontlar ve Ray'in İÇ "Lehe / Hukuk Devir Formu". METNİN YANI SIRA dosyadaki FOTOĞRAFLAR da ek görüntü olarak verilir — ehliyet, ruhsat, tutanak ve plaka fotoğraflarındaki isim/TCKN/plaka bilgilerini de OKU ve bağlama kat (OCR metni eksik olabilir, görüntüye bak). Önce OLAYIN BAĞLAMINI kur, sonra alanları çıkar ve "kaydet" aracını çağır.

★★ ANA İŞ — ÖNCE OLAY BAĞLAMINI KUR ("olayBaglami"): Bütün belgeleri TEK TEK, baştan sona oku. Olayı yeniden inşa et: ne zaman, nerede, hangi araçlar/plakalar, hangi kişiler (sürücü / araç sahibi / işleten / yaya / tanık), kaza NASIL meydana geldi, KUSUR kimde ve hangi orana göre. Her kritik olgunun HANGİ BELGEDEN geldiğini söyle (ör. "kaza tespit tutanağına göre…", "görgü tutanağındaki tanık X'in beyanına göre…", "ifade tutanağında sürücü…", "bilirkişi raporunda %… kusur"). BAĞLAMI KURMADAN borçlu/kusur ÖNERME — öneri bu bağlamdan çıkmalı.

★★ OLAY TÜRÜNÜ BELİRLE — HER DOSYA İKİ-ARAÇLI TRAFİK KAZASI DEĞİLDİR ("olayTuru"): Türü kanıttan oku, TÜM mantığı (borçlu, karşı plaka, açıklama, öneri) ona göre kur:
 (a) Araç-araç trafik kazası → karşı sürücü/araç sahibi borçlu, karşı plaka geçerli.
 (b) ÇİZME / kasıtlı zarar / VANDALİZM → KARŞI ARAÇ YOKTUR; borçlu = zararı veren KİŞİ (şikayet/savcılık/iddianame dosyasındaki fail/şüpheli). karsiPlaka BOŞ bırak; "karşı plaka / tescil-işleten sorgusu" ÖNERME → onun yerine "faili şikayet ve savcılık dosyasından tespit et, kimlik/TCKN'sini al" öner.
 (c) Tek taraflı / sabit cisme çarpma → karşı araç yok.
 (d) Hırsızlık / (e) yangın → karşı araç/plaka arama; muhatabı olaya göre belirle.
 (f) Hizmet/yol kusuru → idari yol, muhatap KGM/işletmeci. (g) Yaya → karşı araç yok, fail yaya.
OLMAYAN bir karşı aracı/plakayı ASLA UYDURMA; tür araç-araç çarpışması değilse karsiPlaka BOŞ kalsın ve plaka odaklı öneri verme.

★★ LEHE FORMUNA KİLİTLENME: "Lehe / Hukuk Devir Formu" Ray'in İÇ talep formudur ve GÜVENİLİR DEĞİLDİR — özellikle "RÜCU MUHATABI / MUHATAPLARI" ve TCKN alanları HATALI olabilir (aynı TCKN farklı dosyalarda yanlışlıkla tekrarlayabilir). Lehe formunu yalnız bir İPUCU/başlangıç olarak kullan; borçluyu ve kusuru TUTANAKLARLA (kaza tespit, görgü, ifade, bilirkişi) ÇAPRAZ DOĞRULA. Çelişki varsa RESMÎ TUTANAĞA güven; Lehe'deki sapmayı "olayBaglami" ve "sonrakiAdimlar"da açıkça belirt ve o borçlunun teyit'ini SUPHE/TEYIT_GEREK yap. Borçlunun kimliği olayın GERÇEĞİNDEN gelir, formun yazdığından değil.

★★ FARKLI İSİMLER = AYRI ROLLER → ÇOKLU BORÇLU: Olayı fiilen yapan SÜRÜCÜYÜ kanıtlardan tespit et — şikayet/ifade tutanağındaki isim, EKTEKİ FOTOĞRAFLARDAKİ ehliyet/ruhsat, kaza tespit tutanağı. Bu sürücü Lehe formundaki muhataptan FARKLIYSA, kişileri "aynı kişi" VARSAYMA: genelde AYRI rollerdir (kusurlu SÜRÜCÜ + RUHSAT SAHİBİ/İŞLETEN) → MÜTESELSİL sorumlulukla İKİSİNİ DE borçlu yaz. Tek bir isme (Lehe muhatabına) İNDİRGEME. Hangi ismin hangi belgeden/rolden geldiğini olayBaglami'nda açıkla; bağ kuramadığın borçluya teyit=TEYIT_GEREK + sonrakiAdimlar'a tescil/MERNİS sorgusu ekle.

★★ MENTOR — EKSİK BİLGİDE YOL GÖSTER ("sonrakiAdimlar"): Bir bilgi yoksa UYDURMA; bunun yerine SOMUT, eyleme dönük adımlar yaz (kime ne sorulacak, hangi sorgu yapılacak). Örnekler:
 - TCKN bulunamadıysa → "Sigortalıyı ara: kaza günü karşı taraf sürücüsünün ad-soyad / TCKN / iletişim bilgisini sor" ve/veya "Görgü/ifade tutanağındaki isimle Nüfus(MERNİS) ya da EGM/SBM tescil-işleten sorgusu yap".
 - Borçlu ↔ plaka bağı belgesizse → "Plaka [X] için EGM tescil/işleten sorgusu — ruhsat sahibi/işleteni doğrula".
 - Sürücü ≠ araç sahibi ise → "Müteselsil sorumluluk için ikisini de borçlu ekle; işleten sıfatını ruhsattan teyit et".
 - Kusur oranı net değilse → "Kaza tespit tutanağı / bilirkişi raporundan kusur oranını teyit et".
Her adım tek cümle ve uygulanabilir olsun.

DİĞER KURALLAR:
- ASLA UYDURMA. Metinde yoksa alanı boş bırak; emin değilsen borçlu teyit'ini TEYIT_GEREK yap.
- TRİYAJ (yol): kusurlu KARŞI taraf/sürücü/araç sahibi belliyse → "klasik" (kişi-kişi rücu icra). KASKO hizmet kusuru (yol/işaretleme eksikliği → muhatap KGM veya özel yol işletmecisi), tek taraflı, yola düşen cisim → "idari". Net değilse → "belirsiz". yolGuven 0-1 ver.
- YETKİLİ İCRA = KAZA YERİ (haksız fiilin işlendiği yer), borçlunun ikameti DEĞİL.
- BORÇLU çoklu/müteselsil olabilir: ruhsat sahibi/işleten + sürücü + (ticari araçta) işveren. Branşa göre yön: KASKO → kusurlu KARŞI taraf; ZMMS → KENDİ sigortalı taraf (poliçe ihlali: alkol/ehliyetsiz).
- MUHATAP YAYA/BİSİKLETLİ/PİYADE ise: borçlu rol = DIGER, adUnvan'a "(yaya)" ekle; yolNeden/muhatapOzet'e "kusurlu yaya" yaz. Yayada plaka/araç ARAMA.
- KUSUR ORANI: Kaza tespit tutanağı/bilirkişi varsa oradan oku. Yoksa RÜCU TUTARI ÷ ÖDEME TUTARI oranı kusur payını verir (rücu, ödemenin yarısı ise ~%50). kusurDurumu'na yaz.
- MÜKERRER EVRAK: Aynı poliçe/ekspertiz/dekont farklı adlarla birden çok gelebilir. Tek varlık say; borçluyu TEKRARLAMA, çelişki yoksa birleştir.
- ★ TUTAR AYRIMI (kısmi kusurda HASARI BÖL): asilAlacak = ÖDENEN tazminat (tam, ekspertiz hariç dekont toplamı). rucuTutari = ödenen × kusur oranı (ör. %50 kusur + 71.214,81 → 35.607,41). Lehe'de RÜCU TUTARI yazsa onu kullan; ama rakam ödemenin yarısıysa oran %50'dir — yaya/tam kusur olsa bile rakam bölünmüşse %100 VARSAYMA. rucuOrani'na yüzdeyi yaz; kusurDurumu ile tutarlı olsun.
- AÇIKLAMA (UYAP takip metni) OLAY TÜRÜNE göre:
  · Araç-araç trafik kazası → "[KAZA TARİHİ] tarihinde Ray Sigorta A.Ş nezdinde sigortalı bulunan [SİG.PLAKA] plakalı araç ile [KARŞI PLAKA] plakalı [araç/motosiklet] arasında meydana gelen trafik kazası neticesinde sigortalıya ödenen tazminatın kusurlu taraftan rücu bedeline ilişkindir."
  · ÇİZME / kasıtlı zarar / vandalizm → "[TARİH] tarihinde Ray Sigorta A.Ş nezdinde sigortalı bulunan [SİG.PLAKA] plakalı araca verilen zarar nedeniyle sigortalıya ödenen tazminatın zarar veren taraftan rücuen tahsiline ilişkindir." (KARŞI PLAKA/araç YAZMA.)
  · Tek taraflı / hırsızlık / yangın / diğer → kalıbı OLAYA uydur; OLMAYAN karşı araç/plaka YAZMA.
  Sonuna footer satırını ekle. DETAY VERME (promil, tazminat türü yazma). Borçlu tartışmalıysa nötr bitir.
- ★ DEKONTLAR: Belgelerdeki her ödeme/dekont/makbuz/havale/EFT kaydını "dekontlar" dizisine yaz (tarih=YYYY-MM-DD, tutar=sayı). Mükerrer kopyayı TEK kalem say. EKSPERTİZ ödemesini de yaz ama ekspertizMi=true (faize dahil değil). Taksitler ayrı kalem. asilAlacak = ekspertiz HARİÇ ödemelerin toplamı.
- TELEFON: sigortalının/borçlunun iletişim telefonu geçiyorsa ilgili alana yaz (rakamları olduğu gibi). Plaka, poliçe no, TCKN gibi sayıları telefon SANMA.
- TEYİT NOTLARI: bağımsız doğrulayıcı gözüyle eksik/şüpheli noktaları (borçlu-plaka bağı belgesiz, el yazısı beyandan plaka, hasar-ödeme farkı, sürücü≠sahip≠sigortalı) "oneri"/"uyari"; doğrulanmış güçlü noktaları "ok".
Hepsi Türkçe.`

export type Gorsel = { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; b64: string }

/**
 * Hasar fotoğrafı adayları arasından İCRA DOSYASINA konacak, araçtaki hasarın AÇIK göründüğü en iyi n
 * fotoğrafı seçer (0-tabanlı indeks listesi döner). Ucuz görsel ayıklama → Haiku. Yoksa/uygunsuzsa null.
 */
export async function enIyiHasarFotolari(gorseller: Gorsel[], n = 2): Promise<number[] | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !gorseller.length) return null
  const client = new Anthropic({ apiKey: key })
  const imgs = gorseller.slice(0, 12)
  const content: Anthropic.ContentBlockParam[] = []
  imgs.forEach((g, i) => {
    content.push({ type: 'text', text: `Fotoğraf #${i}:` })
    content.push({ type: 'image', source: { type: 'base64', media_type: g.mime, data: g.b64 } })
  })
  content.push({ type: 'text', text: `Yukarıdaki ${imgs.length} fotoğraf bir kasko/trafik hasar dosyasına ait. İcra dosyasına EK olarak konacak, ARAÇTAKİ HASARIN AÇIK GÖRÜLDÜĞÜ en iyi ${n} fotoğrafı seç (hasarlı bölge net görünen araç kareleri). Belge/ekran görüntüsü, ehliyet/ruhsat, plaka yakını, kişi ya da alakasız kareleri SEÇME. En fazla ${n} indeks döndür; uygun yoksa daha az.` })
  const SCHEMA = {
    type: 'object',
    properties: {
      secilenler: { type: 'array', items: { type: 'number' }, description: `araçtaki hasarın açık göründüğü en iyi ${n} fotoğrafın 0-tabanlı indeksleri (en iyiden kötüye)` },
      gerekce: { type: 'string', description: 'kısa gerekçe' },
    },
    required: ['secilenler'],
  }
  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: 'Sen bir hasar dosyası görsel ayıklayıcısısın. Yalnızca aracın gövdesindeki hasarın açıkça göründüğü fotoğrafları seçersin; belge taraması, kimlik/ruhsat, plaka yakını ve alakasız kareleri elersin.',
      messages: [{ role: 'user', content }],
      tools: [{ name: 'sec', description: 'En iyi hasar fotoğraflarının indekslerini döndür', input_schema: SCHEMA as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: 'sec' },
    })
    const block = res.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return null
    const out = block.input as { secilenler?: unknown }
    const idx = Array.isArray(out.secilenler) ? (out.secilenler as unknown[]).filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < imgs.length) : []
    return Array.from(new Set(idx)).slice(0, n)
  } catch (e) {
    console.error('enIyiHasarFotolari hata:', e)
    return null
  }
}

export async function analizEt(metin: string, footer?: string, gorseller?: Gorsel[], ogrenilenKurallar?: string, alacakliUnvan?: string | null): Promise<AnalizSonuc | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || !metin.trim()) return null
  const client = new Anthropic({ apiKey: key })
  const imgs = (gorseller ?? []).slice(0, 12)
  const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: `Belge metni:\n\n${metin.slice(0, 150000)}` }]
  for (const g of imgs) content.push({ type: 'image', source: { type: 'base64', media_type: g.mime, data: g.b64 } })
  if (imgs.length) content.push({ type: 'text', text: `Yukarıdaki ${imgs.length} fotoğrafı da incele (ehliyet/ruhsat/tutanak/plaka); metinde olmayan isim/TCKN/plakayı görüntüden oku ve bağlama kat.` })
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4500,
      system: unvanGecir(SISTEM, alacakliUnvan) + (footer ? `\nAçıklama footer'ı (sonuna ekle): ${footer}` : '\nFooter yoksa "K/Partners" iletişim satırı bırak.') + (ogrenilenKurallar ?? ''),
      messages: [{ role: 'user', content }],
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
