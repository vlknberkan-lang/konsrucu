/**
 * KonsRücü — Talep-anında Yargıtay emsal karar arama · lib/konsrucu/emsal-ara.ts
 *
 * Felsefe: 11M kararı toplamak YOK. Bir dosya için, o dosyaya özel emsalı CANLI çek.
 * Resmî kamu kaynağı: karararama.yargitay.gov.tr (login/captcha yok, ücretsiz).
 *   - POST /aramalist        → kelime/daire/tarih filtreli karar listesi (id + künye)
 *   - GET  /getDokuman?id=…  → kararın tam metni (HTML)
 *
 * Akış (dosyadanEmsal): AI dosyadan sorgu üretir → arama → AI alâkalıları seçer →
 * seçilenlerin tam metni çekilir → AI "bu emsal şu yüzden uyar" özeti yazar.
 * Çekilen kararlar çağıran tarafça EmsalKarar olarak cache'lenebilir (korpus organik büyür).
 *
 * Yasal/etik: mahkeme kararları telifsiz; makul hız (dosya başına ~1 sorgu) + cache.
 */
import Anthropic from '@anthropic-ai/sdk'
import { anthropic } from './ai-util'

const BASE = 'https://karararama.yargitay.gov.tr'
const UCUZ_MODEL = 'claude-haiku-4-5-20251001' // sorgu üretimi + ön eleme (katmanlı: önce ucuz)
const DERIN_MODEL = 'claude-sonnet-4-6' // tam metin okuyup alâka gerekçesi

export type EmsalSatir = {
  id: string
  daire: string
  esasNo: string
  kararNo: string
  kararTarihi: string
}

export type EmsalSecim = EmsalSatir & {
  /** Bu kararın dosyaya neden emsal olduğu — tam metinden, kısa gerekçe */
  alaka: string
  /** getDokuman'dan düz metin (cache + dilekçeye dayanak için) */
  metin: string
}

export type EmsalGirdi = {
  olayBaglami: string | null
  olayTuru: string | null
  brans: string | null // ZMMS / Kasko — rücu yönü
  kusurDurumu: string | null
  /** Kullanıcı elle daraltmak isterse serbest metin (AI sorgusunun yerine geçer) */
  elleKelime?: string | null
}

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * karararama rate-limit'i: gecikmesiz/paralel isteklerde generic "Hata Oluştu" döndürüyor.
 * Geçici hatada artan beklemeyle yeniden dener.
 */
async function cekRetry(url: string, init: RequestInit, deneme = 3): Promise<any> {
  let sonHata: unknown
  for (let i = 0; i < deneme; i++) {
    try {
      const res = await fetch(url, init)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: any = await res.json()
      // aramalist hata zarfını içeride taşıyor (HTTP 200 + metadata.FMTY=ERROR)
      if (json?.metadata?.FMTY === 'ERROR' && /Hata Oluştu/.test(json?.metadata?.FMTE ?? '')) {
        throw new Error(json.metadata.FMTE)
      }
      return json
    } catch (e) {
      sonHata = e
      if (i < deneme - 1) await bekle(700 * (i + 1)) // 700ms, 1400ms…
    }
  }
  throw sonHata
}

/**
 * Arama motoru Lucene/Solr tabanlı: % / ( ) : " ~ ^ ? * gibi karakterler parse hatası ("Hata Oluştu")
 * veriyor. Türkçe harf + rakam + boşluk dışındaki her şeyi at, boşlukları sadeleştir.
 */
function temizleKelime(k: string): string {
  return k
    .replace(/[^0-9A-Za-zçğıöşüÇĞİÖŞÜ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Boş bırakılan filtre alanlarıyla tam şema — endpoint eksik alanda generic hata veriyor. */
function aramaGovde(kelime: string, pageSize: number) {
  return {
    data: {
      arananKelime: kelime,
      esasYil: '', esasIlkSiraNo: '', esasSonSiraNo: '',
      kararYil: '', kararIlkSiraNo: '', kararSonSiraNo: '',
      baslangicTarihi: '', bitisTarihi: '',
      siralama: '1', siralamaDirection: 'desc',
      birimYrgKurulDaire: '', birimYrgHukukDaire: '', birimYrgCezaDaire: '',
      pageSize, pageNumber: 1,
    },
  }
}

/** Yargıtay karar arama — kelime sorgusu, künye listesi döner (tam metin yok). */
export async function aramaYargitay(kelimeHam: string, pageSize = 20): Promise<EmsalSatir[]> {
  const kelime = temizleKelime(kelimeHam)
  if (!kelime) return []
  const json = await cekRetry(`${BASE}/aramalist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Sunucu Origin/Referer'sız isteklerde generic "Hata Oluştu" döndürüyor — tarayıcı taklidi şart.
      Origin: BASE,
      Referer: `${BASE}/`,
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify(aramaGovde(kelime, pageSize)),
    // edge/runtime cache'ini bypass et — canlı sonuç istiyoruz
    cache: 'no-store',
  })
  const satirlar: any[] = json?.data?.data ?? []
  return satirlar.map((s) => ({
    id: String(s.id),
    daire: String(s.daire ?? ''),
    esasNo: String(s.esasNo ?? ''),
    kararNo: String(s.kararNo ?? ''),
    kararTarihi: String(s.kararTarihi ?? ''),
  }))
}

/** Kararın tam metni (HTML → düz metin). */
export async function kararMetni(id: string): Promise<string> {
  const json = await cekRetry(`${BASE}/getDokuman?id=${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json', Origin: BASE, Referer: `${BASE}/`, 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store',
  })
  const html: string = json?.data ?? ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const SORGU_SISTEM = `Sen bir Yargıtay karar arama uzmanısın. Sana bir rücu (sigorta geri rücu) dosyasının olay bağlamı verilir. Görevin: Yargıtay Karar Arama motorunda EN İSABETLİ sonucu getirecek 2-5 kelimelik TÜRKÇE arama ifadesi üretmek.
KURALLAR:
- Hukuki terim + olay çekirdeği kullan (ör. "alkollü sürücü rücu", "ehliyetsiz sürücü tazminat rücu", "hatır taşıması rücu", "zamanaşımı trafik sigortası rücu").
- Çok genel ("rücu") veya çok dar (isim/plaka/tarih) olmasın. Özel ad, TCKN, plaka, dosya no YAZMA.
- Sadece arama ifadesini döndür — tırnak/açıklama yok.`

async function sorguUret(client: Anthropic, g: EmsalGirdi): Promise<string> {
  if (g.elleKelime && g.elleKelime.trim()) return g.elleKelime.trim()
  const baglam = [
    g.olayTuru && `Olay türü: ${g.olayTuru}`,
    g.brans && `Branş: ${g.brans}`,
    g.kusurDurumu && `Kusur: ${g.kusurDurumu}`,
    g.olayBaglami && `Bağlam: ${g.olayBaglami.slice(0, 1500)}`,
  ].filter(Boolean).join('\n')
  const res = await client.messages.create({
    model: UCUZ_MODEL, max_tokens: 60, system: SORGU_SISTEM,
    messages: [{ role: 'user', content: `Dosya:\n${baglam}\n\nArama ifadesi:` }],
  })
  const blok = res.content.find((b) => b.type === 'text')
  const k = blok && blok.type === 'text' ? blok.text.trim().replace(/^["'\s]+|["'\s]+$/g, '') : ''
  return k || 'rücu tazminat'
}

const ELE_SISTEM = `Sana bir rücu dosyasının bağlamı ve Yargıtay'dan dönen karar listesi (künye) verilir. Görevin: dosyaya EN ALÂKALI olabilecek kararların index numaralarını seçmek. Daire ve konu uyumuna bak (sigorta/tazminat/rücu daireleri öncelikli). Sadece virgülle ayrılmış index'leri döndür (ör. "1,4,7"). En fazla {N} tane seç.`

async function onEle(client: Anthropic, g: EmsalGirdi, satirlar: EmsalSatir[], n: number): Promise<EmsalSatir[]> {
  const liste = satirlar.map((s, i) => `${i + 1}. [${s.daire}] ${s.esasNo} / ${s.kararNo} (${s.kararTarihi})`).join('\n')
  const baglam = [g.olayTuru, g.brans, g.kusurDurumu, g.olayBaglami?.slice(0, 1000)].filter(Boolean).join(' · ')
  const res = await client.messages.create({
    model: UCUZ_MODEL, max_tokens: 40, system: ELE_SISTEM.replace('{N}', String(n)),
    messages: [{ role: 'user', content: `Dosya: ${baglam}\n\nKararlar:\n${liste}\n\nSeçilen index'ler:` }],
  })
  const blok = res.content.find((b) => b.type === 'text')
  const ham = blok && blok.type === 'text' ? blok.text : ''
  const idx = [...ham.matchAll(/\d+/g)].map((m) => parseInt(m[0], 10) - 1).filter((i) => i >= 0 && i < satirlar.length)
  const secili = [...new Set(idx)].slice(0, n).map((i) => satirlar[i])
  return secili.length ? secili : satirlar.slice(0, n) // AI boş dönerse ilk N
}

const ALAKA_SISTEM = `Sana bir rücu dosyasının bağlamı ve bir Yargıtay kararının TAM METNİ verilir. Görevin: bu kararın dosyaya neden emsal olduğunu 1-2 cümlede, somut hukuki dayanakla yaz (ör. "Alkollü sürücüye %100 kusurla rücuda halefiyeti teyit ediyor; KTK m.98 atfı dilekçeye dayanak."). Karar dosyaya UYMUYORSA tek kelime "UYMAZ" yaz. Süsleme yok, sadece gerekçe.`

async function alakaYaz(client: Anthropic, g: EmsalGirdi, metin: string): Promise<string> {
  const baglam = [g.olayTuru, g.brans, g.kusurDurumu, g.olayBaglami?.slice(0, 800)].filter(Boolean).join(' · ')
  const res = await client.messages.create({
    model: DERIN_MODEL, max_tokens: 200, system: ALAKA_SISTEM,
    messages: [{ role: 'user', content: `Dosya: ${baglam}\n\nKARAR METNİ:\n${metin.slice(0, 30000)}\n\nAlâka gerekçesi:` }],
  })
  const blok = res.content.find((b) => b.type === 'text')
  return blok && blok.type === 'text' ? blok.text.trim() : ''
}

/**
 * Dosya bağlamından canlı emsal bul: sorgu üret → ara → ön ele → tam metin → alâka gerekçesi.
 * @param sayi Döndürülecek nihai emsal sayısı (varsayılan 4).
 */
export async function dosyadanEmsal(g: EmsalGirdi, sayi = 4, ai?: { musteriId?: string; dosyaId?: string }): Promise<{ kelime: string; emsaller: EmsalSecim[] }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY yok')
  const client = anthropic(key, { yuzey: 'emsal', ...ai })

  const kelime = await sorguUret(client, g)
  let satirlar = await aramaYargitay(kelime, 20)
  // Sorgu çok dar → 0 sonuç: son kelimeyi atarak genişlet (en çok 2 kez)
  let genisKelime = kelime
  for (let i = 0; satirlar.length === 0 && i < 2; i++) {
    const parcalar = genisKelime.split(/\s+/)
    if (parcalar.length <= 2) break
    genisKelime = parcalar.slice(0, -1).join(' ')
    satirlar = await aramaYargitay(genisKelime, 20)
  }
  if (!satirlar.length) return { kelime: genisKelime, emsaller: [] }

  const adaylar = await onEle(client, g, satirlar, Math.min(sayi + 2, satirlar.length))

  // Tam metni SIRALI çek (rate-limit) + alâka gerekçesi; "UYMAZ" olanları ele
  const emsaller: EmsalSecim[] = []
  for (const s of adaylar) {
    if (emsaller.length >= sayi) break
    try {
      const metin = await kararMetni(s.id)
      const alaka = await alakaYaz(client, g, metin)
      if (/^uymaz/i.test(alaka)) continue
      emsaller.push({ ...s, alaka, metin })
    } catch {
      // bu kararı atla
    }
  }
  return { kelime: genisKelime, emsaller }
}
