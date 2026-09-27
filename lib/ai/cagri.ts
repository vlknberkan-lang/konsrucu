/**
 * KonsRücü — Tek AI sarmalayıcısı · lib/ai/cagri.ts (sunucu)
 *
 * S09 (06, 5.6; F19; B14, B54, B56): sekiz AI yüzeyinin hepsi bu yoldan geçer:
 *   kapı (yüzey bayrağı + görsel kapısı) → maskele (önce keşif, sonra maskeleme) → sızıntı taraması
 *   (bulgu varsa çağrı durur) → çağrı (lib/konsrucu/ai-util · kredi + AiKullanim) → stop_reason
 *   kontrolü → geri açma (bellekte) → açılmamış/yabancı jeton kontrolü.
 *
 * Maskeli işaretini (lib/ai/isaret.ts) YALNIZ bu dosya koyar; işaretsiz çağrı canlıda reddedilir.
 * Kalıcı eşleme tablosu yoktur: Maskeleyici bu oturumun belleğinde yaşar ve oturumla biter.
 * Çok adımlı akışlar (emsal: sorgu → eleme → gerekçe) aynı oturumu kullanır: kredi bir kez düşer,
 * aynı kişi her adımda aynı jetonu alır.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic } from '@/lib/konsrucu/ai-util'
import { MASKELI_ISARET } from './isaret'
import { Maskeleyici, firmaMi, tcknGecerli, tabloOnbellegiTemizle, JETON_TURLERI } from './maske'
import { derinGeriAc, geriAc } from './geri-ac'
import { sizintiKapisi } from './sizinti'
import { GUVENLIK_BLOGU, veriBlogu } from './guvenlik-blogu'
import { AiKvkkKapaliHata, GORSEL_KAPALI_MESAJI, gorselAiAcik, yuzeyAcik, type AiYuzey } from './bayrak'

export type GorselMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/** İstek içeriği: çağıran anlamı söyler, sarmalayıcı maskeler ve Anthropic bloğunu kurar. */
export type AiIcerik =
  | { tur: 'metin'; metin: string } // maskelenir
  | { tur: 'belge'; ad: string; metin: string } // maskelenir, etiketli veri bloğuna sarılır
  | { tur: 'json'; veri: unknown } // metin değerleri maskelenir, JSON olarak gider
  | { tur: 'gorsel'; mime: GorselMime; b64: string } // yalnız görsel kapısı açıksa
  | { tur: 'pdf'; b64: string } // yalnız görsel kapısı açıksa

export type AiIstek = {
  model: string
  maxTokens: number
  /** Sabit sistem metni (kodda yazılı; maskelenmez, desen taramasından geçer). */
  sistem: string
  /** Dinamik sistem eki (açıklama footer'ı, öğrenilen kurallar …) — maskelenir. */
  sistemEk?: string
  icerik: AiIcerik[]
  /** Zorunlu araç çağrısı (forced tool-use). */
  arac?: { ad: string; aciklama: string; sema: Anthropic.Tool.InputSchema }
  /** false: yanıt geri AÇILMAZ (ör. dış servise gidecek arama ifadesi). Varsayılan true. */
  geriAc?: boolean
}

export type AiYanit = {
  /** Geri açılmış metin (text blokları). */
  metin: string
  /** Geri açılmış araç girdisi (tool_use input) ya da null. */
  aracGirdisi: unknown
  /** Modelin jetonlu ham metni (geri açılmamış). */
  maskeliMetin: string
  /** stop_reason === 'max_tokens': yanıt yarım kaldı. */
  kesildi: boolean
  /** Açılamayan ya da yabancı jetonlar ([KİŞİ-9], (KİŞİ-1) …) — kırmızı kapı. */
  acilamayanJetonlar: string[]
  /** Maskelenen öğe sayıları (tür → adet; değer içermez). */
  sayim: Record<string, number>
}

export class AiGorselKapaliHata extends AiKvkkKapaliHata {
  constructor(yuzey: string) {
    super(yuzey, GORSEL_KAPALI_MESAJI)
    this.name = 'AiGorselKapaliHata'
  }
}

export class AiReddettiHata extends Error {
  constructor() {
    super('Yapay zekâ isteği yanıtlamayı reddetti; sonuç kaydedilmedi.')
    this.name = 'AiReddettiHata'
  }
}

export class AiAnahtarYokHata extends Error {
  constructor() {
    super('AI anahtarı (ANTHROPIC_API_KEY) sunucuda tanımlı değil.')
    this.name = 'AiAnahtarYokHata'
  }
}

// ───────────────────────────── maskeleyici kaynağı ─────────────────────────────
type Deger = string | null | undefined
/** Dosyadaki kayıtlardan bilinen kişisel veriler. Sıra deterministiktir (aynı girdi → aynı jetonlar). */
export type MaskeKaynagi = {
  /** Bilinen kişi adları (borçlular DB sırasıyla, sigortalı, sürücü …). Şirket adları yalnız tam yazımla maskelenir. */
  kisiler?: Deger[]
  /** TCKN (11 hane) / VKN (10 hane). */
  kimlikler?: Deger[]
  telefonlar?: Deger[]
  plakalar?: Deger[]
  epostalar?: Deger[]
  ibanlar?: Deger[]
}

/** Bilinen kayıtlarla hazırlanmış maskeleyici (kalıcı eşleme yok; bellekte). */
export function maskeleyiciKur(k: MaskeKaynagi = {}): Maskeleyici {
  const m = new Maskeleyici()
  const temiz = (xs?: Deger[]) => (xs ?? []).map((x) => (x ?? '').trim()).filter(Boolean)
  for (const ad of temiz(k.kisiler)) {
    // Şirket/kurum (Ltd. Şti., A.Ş., Sigorta …) kişisel veri değildir ama tek kişilik işletme adı kişi adı
    // taşıyabilir: tam yazımı maskelenir, parçaları ('Şti.', 'Sigorta') her yerde jetona dönmez.
    if (ad.split(/\s+/).some(firmaMi)) m.tamAdEkle(ad, { jetonAyir: true })
    else m.kisiEkle(ad, { jetonAyir: true })
  }
  for (const x of temiz(k.kimlikler)) {
    const d = x.replace(/\D/g, '')
    if (d.length === 11) m.degerEkle('TCKN', d)
    else if (d.length === 10) m.degerEkle('VKN', d)
    else if (d.length >= 10 && tcknGecerli(d.slice(-11))) m.degerEkle('TCKN', d.slice(-11))
  }
  for (const x of temiz(k.telefonlar)) if (x.replace(/\D/g, '').length >= 10) m.degerEkle('TEL', x)
  for (const x of temiz(k.plakalar)) if (/\d{2}\s*-?\s*[A-Za-zÇĞİÖŞÜçğıöşü]{1,3}\s*-?\s*\d{2,4}/u.test(x)) m.degerEkle('PLAKA', x.toUpperCase())
  for (const x of temiz(k.epostalar)) if (x.includes('@')) m.degerEkle('EPOSTA', x)
  for (const x of temiz(k.ibanlar)) if (x.replace(/\D/g, '').length === 24) m.degerEkle('IBAN', x)
  return m
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** JSON değerindeki metinleri (kimlik alanları hariç) sırayla gezer. 10+ haneli tam sayılar da metin
 *  olarak aynı yoldan geçer: sayı olarak girilmiş TCKN/VKN/telefon maskelenmeden ve sızıntı taramasına
 *  girmeden gitmesin (tutar gibi zararsız sayı yalnız metne döner; model için fark yok). */
function jsonGez(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === 'string') return UUID.test(v) ? v : f(v)
  if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 1e9) return f(String(v))
  if (Array.isArray(v)) return v.map((x) => jsonGez(x, f))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, jsonGez(x, f)]))
  return v
}

// ───────────────────────────── oturum ─────────────────────────────
export type AiOturumSecenek = {
  yuzey: AiYuzey
  ai?: { musteriId?: string; dosyaId?: string }
  /** Bilinen kişisel veriler; verilmezse yalnız desen + etiket sezgisiyle maskelenir. */
  maske?: Maskeleyici | MaskeKaynagi
  /** Bu yüzey görüntü/PDF bloğu gönderebilir mi (ayrıca AI_GORSEL=acik gerekir). */
  gorselIzni?: boolean
}

export class AiOturumu {
  readonly yuzey: AiYuzey
  readonly maske: Maskeleyici
  private readonly ai: { musteriId?: string; dosyaId?: string }
  private readonly gorselIzni: boolean
  private istemci: Anthropic | null = null

  constructor(o: AiOturumSecenek) {
    this.yuzey = o.yuzey
    this.ai = o.ai ?? {}
    this.gorselIzni = !!o.gorselIzni
    this.maske = o.maske instanceof Maskeleyici ? o.maske : maskeleyiciKur(o.maske)
  }

  /** Yüzey canlıda açık mı? (çağrı yapmadan önce erken dönüş için) */
  acikMi(): boolean {
    return yuzeyAcik(this.yuzey)
  }

  /** Metni bu oturumun eşlemesiyle maskeler (keşif dahil). */
  maskele(metin: string): string {
    return this.maske.maskele(metin).metin
  }

  /** Jetonlu metni bu oturumun eşlemesiyle açar. */
  geriAc(metin: string): { acik: string; bilinmeyen: string[] } {
    const r = geriAc(metin, this.maske.eslesme)
    return { acik: r.acik, bilinmeyen: r.bilinmeyen }
  }

  async iste(istek: AiIstek): Promise<AiYanit> {
    // 1) KAPI — kapalı yüzeyde hiçbir şey yapılmaz (kredi düşmez, AiKullanim'a satır yazılmaz)
    if (!yuzeyAcik(this.yuzey)) throw new AiKvkkKapaliHata(this.yuzey)
    const gorselVar = istek.icerik.some((c) => c.tur === 'gorsel' || c.tur === 'pdf')
    if (gorselVar && !(this.gorselIzni && gorselAiAcik())) throw new AiGorselKapaliHata(this.yuzey)
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new AiAnahtarYokHata()

    // 2) MASKELE — önce bütün parçalar keşfedilir (bir belgede etiketle bulunan ad ötekinde de maskelensin)
    const m = this.maske
    const metinler: string[] = []
    if (istek.sistemEk) metinler.push(istek.sistemEk)
    for (const c of istek.icerik) {
      if (c.tur === 'metin') metinler.push(c.metin)
      else if (c.tur === 'belge') metinler.push(c.ad, c.metin)
      else if (c.tur === 'json') jsonGez(c.veri, (s) => { metinler.push(s); return s })
    }
    for (const t of metinler) m.kesfet(t)
    const sayim: Record<string, number> = {}
    const mask = (s: string) => {
      const r = m.maskele(s, false)
      for (const [t, n] of Object.entries(r.sayim)) sayim[t] = (sayim[t] ?? 0) + n
      return r.metin
    }
    const taranacak: string[] = []
    const sistemEk = istek.sistemEk ? mask(istek.sistemEk) : ''
    if (sistemEk) taranacak.push(sistemEk)
    const bloklar: Anthropic.ContentBlockParam[] = []
    for (const c of istek.icerik) {
      if (c.tur === 'metin') {
        const t = mask(c.metin)
        taranacak.push(t)
        bloklar.push({ type: 'text', text: t })
      } else if (c.tur === 'belge') {
        const ad = mask(c.ad), t = mask(c.metin)
        taranacak.push(ad, t)
        bloklar.push({ type: 'text', text: veriBlogu(ad, t) })
      } else if (c.tur === 'json') {
        const v = jsonGez(c.veri, (s) => { const t = mask(s); taranacak.push(t); return t })
        bloklar.push({ type: 'text', text: JSON.stringify(v) })
      } else if (c.tur === 'gorsel') {
        bloklar.push({ type: 'image', source: { type: 'base64', media_type: c.mime, data: c.b64 } })
      } else {
        bloklar.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: c.b64 } })
      }
    }

    // 3) SIZINTI TARAMASI — maskeli dinamik metin bilinen kişilerle; sabit sistem metni yalnız desenlerle
    try {
      sizintiKapisi(taranacak, m)
      sizintiKapisi([istek.sistem], new Maskeleyici())
    } finally {
      tabloOnbellegiTemizle() // ham belge metni modül önbelleğinde kalmasın
    }

    // 4) ÇAĞRI — kredi + AiKullanim defteri ai-util'de; işaret yalnız burada konur
    if (!this.istemci) this.istemci = anthropic(key, { yuzey: this.yuzey, ...this.ai, maskeli: MASKELI_ISARET })
    const res = await this.istemci.messages.create({
      model: istek.model,
      max_tokens: istek.maxTokens,
      system: `${istek.sistem}${sistemEk ? `\n${sistemEk}` : ''}\n\n${GUVENLIK_BLOGU}`,
      messages: [{ role: 'user', content: bloklar }],
      ...(istek.arac
        ? {
            tools: [{ name: istek.arac.ad, description: istek.arac.aciklama, input_schema: istek.arac.sema }],
            tool_choice: { type: 'tool' as const, name: istek.arac.ad },
          }
        : {}),
    })

    // 5) STOP REASON — reddetme sonucu kaydedilmez; yarım kalan yanıt çağırana bildirilir
    if ((res.stop_reason as string | null) === 'refusal') throw new AiReddettiHata()
    const kesildi = res.stop_reason === 'max_tokens'

    // 6) GERİ AÇ + jeton kontrolü
    const maskeliMetin = (res.content ?? []).flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
    const aracBlok = (res.content ?? []).find((b) => b.type === 'tool_use')
    const aracHam = aracBlok && aracBlok.type === 'tool_use' ? aracBlok.input : null
    if (istek.geriAc === false) {
      return { metin: maskeliMetin, aracGirdisi: aracHam, maskeliMetin, kesildi, acilamayanJetonlar: [], sayim }
    }
    const eslesme = m.eslesme
    const metinAcik = geriAc(maskeliMetin, eslesme)
    const bilinmeyen = [...metinAcik.bilinmeyen]
    const arac = aracHam == null ? null : derinGeriAc(aracHam, eslesme, bilinmeyen).deger
    return { metin: metinAcik.acik, aracGirdisi: arac, maskeliMetin, kesildi, acilamayanJetonlar: bilinmeyen, sayim }
  }
}

export function aiOturumu(o: AiOturumSecenek): AiOturumu {
  return new AiOturumu(o)
}

/** Tek çağrılık kısa yol. */
export function aiCagri(o: AiOturumSecenek, istek: AiIstek): Promise<AiYanit> {
  return new AiOturumu(o).iste(istek)
}

/** Kapı / sızıntı hatası mı? (çağıranlar bu hataların mesajını kullanıcıya olduğu gibi gösterir) */
export function aiKapiHatasiMi(e: unknown): e is Error {
  return e instanceof Error && ['AiKvkkKapaliHata', 'AiGorselKapaliHata', 'SizintiHata', 'AiReddettiHata', 'AiAnahtarYokHata'].includes(e.name)
}

/** Açılamayan jeton uyarısı (kullanıcıya): ham değer içermez, yalnız jetonun kendisi. */
export function acilamayanUyarisi(jetonlar: readonly string[]): string | null {
  if (!jetonlar.length) return null
  return `Yapay zekâ yanıtında açılamayan jeton var (${jetonlar.slice(0, 5).join(', ')}${jetonlar.length > 5 ? ' …' : ''}); bu kısımlar uydurulmuş olabilir, elle kontrol edin.`
}

/** Metin alanlarında kalmış jeton biçimindeki değerleri temizler (DB'ye jeton yazılmasın). */
export function jetonluMu(s: unknown): boolean {
  return typeof s === 'string' && new RegExp(`\\[(?:${JETON_TURLERI.join('|')})-\\d+\\]`, 'u').test(s)
}
