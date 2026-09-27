/**
 * S02 + S09 · AI yüzey kapısı: sekiz yüzeyin her biri CANLI kipte reddedilir (Anthropic'e istek gitmez,
 * AiKullanim'a satır yazılmaz), STAGING kipinde (kurgusal veri) çalışır. Hiçbir yüzey maskeli
 * sarmalayıcıdan (lib/ai/cagri.ts) geçmeden AI çağıramaz — kaynak taramasıyla denetlenir.
 * SDK, kredi defteri, veritabanı ve Yargıtay ucu SAHTEDİR (ağ yok). YALNIZ SENTETİK veri.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const m = vi.hoisted(() => ({
  create: vi.fn(), sdkSecenek: vi.fn(), kullanimLogla: vi.fn(), krediDus: vi.fn(), krediIade: vi.fn(),
  ctx: vi.fn(), findMusteri: vi.fn(), findDosya: vi.fn(), ayarlar: vi.fn(), ciktiCreate: vi.fn(), aktivite: vi.fn(),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class SahteAnthropic {
    messages = { create: m.create }
    constructor(o: unknown) { m.sdkSecenek(o) }
  },
}))
vi.mock('@/lib/konsrucu/ai-kredi', () => ({
  KREDI_BEDELI: { cikarim: 3, dilekce: 3, emsal: 2, soru: 1, yol: 1, makbuz: 0, foto: 0 },
  aiDurduruldu: () => false,
  AiDurdurulduHata: class extends Error {},
  KrediYetersizHata: class extends Error {},
  krediDus: m.krediDus, krediIade: m.krediIade, kullanimLogla: m.kullanimLogla,
}))
vi.mock('@/lib/konsrucu/pdf-metin', () => ({ pdfMetinCikar: async () => 'KURGUSAL MAKBUZ\nOkunamayan satır düzeni' }))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => {
  const db = { musteri: { findFirst: m.findMusteri }, rucuDosyasi: { findFirst: m.findDosya }, uretilenCikti: { create: m.ciktiCreate }, ayarlar: { findUnique: m.ayarlar }, aktivite: { create: m.aktivite } }
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } }
})

import { anthropic, aiKapisi, AI_ZAMAN_ASIMI_MS, AI_YENIDEN_DENEME } from '@/lib/konsrucu/ai-util'
import { AI_YUZEYLERI, AiKvkkKapaliHata, KVKK_KAPALI_MESAJI } from '@/lib/ai/bayrak'
import { MASKELI_ISARET } from '@/lib/ai/isaret'
import { analizEt, enIyiHasarFotolari } from '@/lib/konsrucu/analiz'
import { dilekceAnlatim } from '@/lib/konsrucu/dilekce-ai'
import { dosyaSor, dosyaYolGoster } from '@/lib/konsrucu/dosya-sor'
import { dosyadanEmsal } from '@/lib/konsrucu/emsal-ara'
import { makbuzCikarDetay, MAKBUZ_AI_KAPALI } from '@/lib/konsrucu/masraf-cikar'
import { davaTaslagiUret } from '@/app/(app)/dilekceler/actions'

const METIN = 'Kurgusal kaza tespit tutanağı. Sürücü ORHUN KAVAKLIDERE, 34 KRG 001 plakalı araç.'
const UZUN = '1. Kurgusal değerlendirme metni; dosyadaki belgelere göre özet ve öneri. ' + 'x'.repeat(80)

function sahteYanit(p: { tools?: { name: string; input_schema: { properties?: Record<string, unknown> } }[] }) {
  const arac = p.tools?.[0]
  if (!arac) return { stop_reason: 'end_turn', content: [{ type: 'text', text: UZUN }], usage: { input_tokens: 1, output_tokens: 1 } }
  const girdi = arac.name === 'sec' ? { secilenler: [0] }
    : arac.input_schema.properties?.kalemler ? { kalemler: [{ tutar: 54.4, cinsHam: 'Başvurma Harcı' }] }
    : { yol: 'klasik', yolGuven: 0.8, olayTuru: 'trafik kazası', borclular: [{ adUnvan: '[KİŞİ-1]', rol: 'SURUCU', teyit: 'TEYIT_GEREK' }], aciklama: '[PLAKA-1] plakalı araç', olayBaglami: 'Kurgusal', teyit: [] }
  return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: arac.name, input: girdi }], usage: { input_tokens: 1, output_tokens: 1 } }
}

type Deneme = { calistir: () => Promise<unknown>; kapali: (sonuc: unknown, hata: string | null) => boolean; acik: (sonuc: unknown) => boolean }
const onHataIle = async (f: (onHata: (s: string) => void) => Promise<unknown>) => { let h: string | null = null; const r = await f((s) => { h = s }); return { r, h } }

/** Sekiz yüzey: canlıda nasıl reddedildiği ve staging'de nasıl çalıştığı. */
const YUZEYLER: Record<string, Deneme> = {
  cikarim: {
    calistir: () => onHataIle((onHata) => analizEt(METIN, { onHata, maske: { kisiler: ['ORHUN KAVAKLIDERE'], plakalar: ['34 KRG 001'] } })),
    kapali: (s) => (s as { r: unknown; h: string }).r === null && (s as { h: string }).h === KVKK_KAPALI_MESAJI,
    acik: (s) => { const r = (s as { r: { borclular: { adUnvan: string }[]; aciklama: string } }).r; return r.borclular[0].adUnvan === 'ORHUN KAVAKLIDERE' && r.aciklama === '34 KRG 001 plakalı araç' },
  },
  foto: {
    calistir: () => onHataIle((onHata) => enIyiHasarFotolari([{ mime: 'image/png', b64: 'AAAA' }], 2, {}, onHata)),
    kapali: (s) => (s as { r: unknown }).r === null && (s as { h: string }).h === KVKK_KAPALI_MESAJI,
    acik: (s) => JSON.stringify((s as { r: unknown }).r) === '[0]',
  },
  dilekce_eski: {
    calistir: () => dilekceAnlatim({ olayBaglami: METIN, olayTuru: null, brans: null, sigortaliPlaka: '34 KRG 001', karsiPlaka: null, sigortaliUnvan: null, kazaTarihi: null, kazaYeri: null, davalilar: [{ ad: 'ORHUN KAVAKLIDERE', rol: 'SURUCU' }], asilAlacak: null, rucuOrani: null, kusurDurumu: null, odemeBilgi: null }),
    kapali: (s) => s === null,
    acik: (s) => typeof s === 'string' && s.startsWith('1. Kurgusal'),
  },
  soru: {
    calistir: () => dosyaSor(METIN, 'Kusur kimde?'),
    kapali: (s) => (s as { ok: boolean; error: string }).ok === false && (s as { error: string }).error === KVKK_KAPALI_MESAJI,
    acik: (s) => (s as { ok: boolean }).ok === true,
  },
  yol: {
    calistir: () => dosyaYolGoster(METIN),
    kapali: (s) => (s as { ok: boolean; error: string }).ok === false && (s as { error: string }).error === KVKK_KAPALI_MESAJI,
    acik: (s) => (s as { ok: boolean }).ok === true,
  },
  emsal: {
    calistir: () => dosyadanEmsal({ olayBaglami: METIN, olayTuru: 'trafik', brans: 'KASKO', kusurDurumu: '%100' }, 1).catch((e) => e),
    kapali: (s) => s instanceof AiKvkkKapaliHata,
    acik: (s) => (s as { emsaller: unknown[] }).emsaller?.length === 1,
  },
  makbuz: {
    calistir: () => makbuzCikarDetay(Buffer.from('%PDF-1.4 kurgusal')),
    kapali: (s) => (s as { aiKapali?: string }).aiKapali === MAKBUZ_AI_KAPALI && (s as { kalemler: unknown[] }).kalemler.length === 0,
    acik: (s) => (s as { kalemler: unknown[] }).kalemler.length === 1,
  },
  dilekce: {
    calistir: () => davaTaslagiUret({ dosyaId: '00000000-0000-4000-8000-000000000001', tur: 'BEYAN', talimat: 'Kurgusal talimat.' }),
    kapali: (s) => (s as { ok: boolean }).ok === false && (s as { error: string }).error.startsWith(KVKK_KAPALI_MESAJI),
    acik: (s) => (s as { ok: boolean }).ok === true,
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  for (const k of Object.keys(process.env)) if (/^AI_(YUZEY_|ORTAM|MASKESIZ|GORSEL)|^ESKI_DILEKCE_HATTI$/.test(k)) vi.stubEnv(k, '')
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  m.create.mockImplementation(async (p) => sahteYanit(p))
  m.ctx.mockResolvedValue({ dbUser: { id: 'kurgusal-avukat', aktif: true, rol: 'AVUKAT' }, aktifMusteriId: 'kurgusal-musteri' })
  m.findMusteri.mockResolvedValue({ id: 'kurgusal-musteri' })
  m.ayarlar.mockResolvedValue(null)
  m.ciktiCreate.mockResolvedValue({ id: 'kurgusal-cikti' })
  m.findDosya.mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001', musteriId: 'kurgusal-musteri', hukukDosyaNo: 'H-1', borclular: [{ adUnvan: 'ORHUN KAVAKLIDERE', rol: 'SURUCU', tcVkn: null }],
    belgeler: [{ id: '00000000-0000-4000-8000-000000000003', dosyaAdi: 'tutanak.pdf', extractedText: METIN, kategori: 'TUTANAK' }],
    asamalar: [], notlar: [], olaylar: [], ciktilar: [], odemeler: [],
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('aramalist')
      ? { data: { data: [{ id: '1', daire: '17. Hukuk Dairesi', esasNo: '2020/1', kararNo: '2021/2', kararTarihi: '01.01.2021' }] } }
      : { data: '<p>Kurgusal karar metni.</p>' }),
  })))
})

describe('sekiz yüzey', () => {
  it('yüzey listesi planla aynı: sekiz yüzey', () => {
    expect(AI_YUZEYLERI.map((y) => y.yuzey).sort()).toEqual(Object.keys(YUZEYLER).sort())
  })

  it.each(Object.keys(YUZEYLER))('%s — canlıda reddedilir: istek gitmez, AiKullanim satırı yazılmaz, kredi düşmez', async (yuzey) => {
    const d = YUZEYLER[yuzey]
    const sonuc = await d.calistir()
    expect(d.kapali(sonuc, null), JSON.stringify(sonuc)).toBe(true)
    expect(m.create).not.toHaveBeenCalled()
    expect(m.kullanimLogla).not.toHaveBeenCalled()
    expect(m.krediDus).not.toHaveBeenCalled()
    if (yuzey === 'emsal') expect(fetch).not.toHaveBeenCalled() // Yargıtay'a da gidilmez
  })

  it.each(Object.keys(YUZEYLER))('%s — staging kipinde maskeli sarmalayıcıdan geçip çalışır', async (yuzey) => {
    vi.stubEnv('AI_ORTAM', 'staging')
    if (yuzey === 'foto') vi.stubEnv('AI_GORSEL', 'acik')
    if (yuzey === 'dilekce_eski') vi.stubEnv('ESKI_DILEKCE_HATTI', 'acik')
    const d = YUZEYLER[yuzey]
    const sonuc = await d.calistir()
    expect(d.acik(sonuc), JSON.stringify(sonuc)).toBe(true)
    expect(m.create).toHaveBeenCalled()
    // hiçbir çağrıda ham sentetik ad/plaka gitmedi
    for (const [p] of m.create.mock.calls) {
      const giden = JSON.stringify(p)
      expect(giden).not.toContain('KAVAKLIDERE')
      expect(giden).not.toContain('KRG 001')
    }
    expect(m.kullanimLogla).toHaveBeenCalled()
  })

  it.each(Object.keys(YUZEYLER).filter((y) => y !== 'dilekce_eski'))('%s — canlıda yalnız kendi bayrağıyla açılır (karar 1a)', async (yuzey) => {
    vi.stubEnv(`AI_YUZEY_${yuzey.toUpperCase()}`, 'acik')
    if (yuzey === 'foto') vi.stubEnv('AI_GORSEL', 'acik')
    const d = YUZEYLER[yuzey]
    expect(d.acik(await d.calistir())).toBe(true)
  })

  it('eski dilekçe yüzeyi hat bayrağı kapalıyken staging\'de de kapalı', async () => {
    vi.stubEnv('AI_ORTAM', 'staging')
    expect(await YUZEYLER.dilekce_eski.calistir()).toBeNull()
    expect(m.create).not.toHaveBeenCalled()
  })

  it('cikarim: açılamayan jeton kimlik alanından ayıklanır ve kırmızı kapı uyarısı çağırana bildirilir', async () => {
    vi.stubEnv('AI_ORTAM', 'staging')
    m.create.mockResolvedValue({
      stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'tool_use', name: 'kaydet', input: {
        yol: 'klasik', yolGuven: 0.8, olayTuru: 'trafik kazası', olayBaglami: 'Kurgusal', teyit: [], aciklama: '[KİŞİ-9] ile [PLAKA-1]',
        borclular: [{ adUnvan: '[KİŞİ-1]', rol: 'SURUCU', teyit: 'TEYIT_GEREK' }, { adUnvan: '[KİŞİ-9]', rol: 'DIGER', teyit: 'TEYIT_GEREK' }],
      } }],
    })
    let uyari: string | null = null
    const r = await analizEt(METIN, { onUyari: (u) => { uyari = u }, maske: { kisiler: ['ORHUN KAVAKLIDERE'], plakalar: ['34 KRG 001'] } })
    expect(r?.borclular.map((b) => b.adUnvan)).toEqual(['ORHUN KAVAKLIDERE']) // uydurma jetonlu borçlu eklenmez
    expect(uyari).toContain('[KİŞİ-9]')
    expect(uyari).not.toContain('KAVAKLIDERE')
  })

  it('görsel AI kapalıyken (varsayılan) foto yüzeyi staging\'de de görüntü göndermez', async () => {
    vi.stubEnv('AI_ORTAM', 'staging')
    const { r, h } = await onHataIle((onHata) => enIyiHasarFotolari([{ mime: 'image/png', b64: 'AAAA' }], 2, {}, onHata))
    expect(r).toBeNull()
    expect(h).toMatch(/Görsel yapay zekâ/)
    expect(m.create).not.toHaveBeenCalled()
  })
})

describe('ai-util kapısı (maskesiz çağrı)', () => {
  const params = { model: 'claude-haiku-4-5', max_tokens: 5, messages: [{ role: 'user' as const, content: 'x' }] }
  it.each(AI_YUZEYLERI.map((y) => y.yuzey))('%s — işaretsiz (maskesiz) çağrı canlıda reddedilir', async (yuzey) => {
    const c = anthropic('test-key', { yuzey, musteriId: 'kurgusal-musteri' })
    await expect(c.messages.create(params)).rejects.toBeInstanceOf(AiKvkkKapaliHata)
    expect(m.create).not.toHaveBeenCalled()
    expect(m.kullanimLogla).not.toHaveBeenCalled()
    expect(m.krediDus).not.toHaveBeenCalled()
  })
  it('işaretli çağrı da yüzey bayrağı kapalıysa reddedilir; açıkken geçer ve deftere yazılır', async () => {
    const c = anthropic('test-key', { yuzey: 'soru', musteriId: 'kurgusal-musteri', maskeli: MASKELI_ISARET })
    await expect(c.messages.create(params)).rejects.toBeInstanceOf(AiKvkkKapaliHata)
    vi.stubEnv('AI_YUZEY_SORU', 'acik')
    m.create.mockResolvedValue({ stop_reason: 'end_turn', content: [], usage: { input_tokens: 1, output_tokens: 1 } })
    await c.messages.create(params)
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.kullanimLogla).toHaveBeenCalledWith(expect.objectContaining({ yuzey: 'soru', musteriId: 'kurgusal-musteri' }))
  })
  it('AI_MASKESIZ=acik ya da staging maskesiz çağrıya izin verir', () => {
    expect(() => aiKapisi({ yuzey: 'soru' })).toThrow(AiKvkkKapaliHata)
    vi.stubEnv('AI_MASKESIZ', 'acik')
    expect(() => aiKapisi({ yuzey: 'soru' })).not.toThrow()
    vi.stubEnv('AI_MASKESIZ', '')
    vi.stubEnv('AI_ORTAM', 'staging')
    expect(() => aiKapisi({ yuzey: 'soru' })).not.toThrow()
  })
  it('B54: SDK zaman aşımı fonksiyon sınırının altında, 1 yeniden deneme', () => {
    anthropic('test-key', { yuzey: 'soru' })
    expect(m.sdkSecenek).toHaveBeenCalledWith(expect.objectContaining({ timeout: AI_ZAMAN_ASIMI_MS, maxRetries: AI_YENIDEN_DENEME }))
    expect(AI_ZAMAN_ASIMI_MS).toBeLessThanOrEqual(100_000)
    expect(AI_YENIDEN_DENEME).toBe(1)
  })
})

describe('kaynak taraması: AI yalnız sarmalayıcıdan çağrılır', () => {
  const KOK = path.resolve(__dirname, '..')
  function dosyalar(dizin: string): string[] {
    const tam = path.join(KOK, dizin)
    if (!fs.existsSync(tam)) return []
    return fs.readdirSync(tam, { withFileTypes: true }).flatMap((e) => {
      const g = path.join(dizin, e.name)
      if (e.isDirectory()) return e.name === 'node_modules' || e.name.startsWith('.') ? [] : dosyalar(g)
      return /\.(ts|tsx)$/.test(e.name) ? [g.replace(/\\/g, '/')] : []
    })
  }
  // yorumlar atılır (açıklamada geçen "anthropic()" çağrı sayılmasın)
  const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  const kaynaklar = ['app', 'lib', 'components'].flatMap(dosyalar).map((f) => ({ f, s: yorumsuz(fs.readFileSync(path.join(KOK, f), 'utf8')) }))

  it('anthropic() fabrikasını yalnız lib/ai/cagri.ts çağırır', () => {
    const cagiranlar = kaynaklar.filter(({ f, s }) => f !== 'lib/konsrucu/ai-util.ts' && /\banthropic\s*\(/.test(s)).map(({ f }) => f)
    expect(cagiranlar).toEqual(['lib/ai/cagri.ts'])
  })
  it('SDK istemcisi yalnız ai-util.ts\'te kurulur', () => {
    expect(kaynaklar.filter(({ s }) => /new\s+Anthropic\s*\(/.test(s)).map(({ f }) => f)).toEqual(['lib/konsrucu/ai-util.ts'])
  })
  it('SDK değer olarak (type-only olmayan import, require, dinamik import) yalnız ai-util.ts\'te yüklenir', () => {
    const deger = /import\s+(?!type\b)[^;]*?from\s*['"]@anthropic-ai\/sdk['"]|require\(\s*['"]@anthropic-ai\/sdk['"]\s*\)|import\(\s*['"]@anthropic-ai\/sdk['"]\s*\)/
    expect(kaynaklar.filter(({ s }) => deger.test(s)).map(({ f }) => f)).toEqual(['lib/konsrucu/ai-util.ts'])
  })
  it('Anthropic API\'sine doğrudan HTTP çağrısı yok (SDK dışı yol)', () => {
    expect(kaynaklar.filter(({ s }) => /api\.anthropic\.com/i.test(s)).map(({ f }) => f)).toEqual([])
  })
  it('maskeli işaretini yalnız ai-util.ts (denetler) ve cagri.ts (koyar) içe aktarır', () => {
    const aktaranlar = kaynaklar.filter(({ s }) => /from ['"](?:@\/lib\/ai\/isaret|\.\/isaret)['"]/.test(s)).map(({ f }) => f).sort()
    expect(aktaranlar).toEqual(['lib/ai/cagri.ts', 'lib/konsrucu/ai-util.ts'])
  })
  it.each(AI_YUZEYLERI.map((y) => [y.yuzey, y.kod.split(' · ')[0]]))('%s yüzeyi (%s) sarmalayıcıdan geçer', (yuzey, dosya) => {
    const s = kaynaklar.find((k) => k.f === dosya)?.s ?? ''
    expect(s).toMatch(/aiOturumu\(/)
    expect(s).toContain(`yuzey: '${yuzey}'`)
  })
})
