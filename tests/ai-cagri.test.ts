/**
 * lib/ai/cagri.ts — tek AI sarmalayıcısı, SAHTE istemciyle (ağ yok, kredi/defter ai-util'de ve burada taklit).
 * Sınanan yol: kapı → maskele → sızıntı taraması → çağrı → stop_reason → geri açma → jeton kontrolü.
 * YALNIZ SENTETİK veri.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ create: vi.fn(), fabrika: vi.fn() }))
vi.mock('@/lib/konsrucu/ai-util', () => ({
  anthropic: (...args: unknown[]) => { m.fabrika(...args); return { messages: { create: m.create } } },
}))

import { AiGorselKapaliHata, AiReddettiHata, aiOturumu, maskeleyiciKur } from '@/lib/ai/cagri'
import { AiKvkkKapaliHata } from '@/lib/ai/bayrak'
import { MASKELI_ISARET } from '@/lib/ai/isaret'
import { GUVENLIK_BLOGU } from '@/lib/ai/guvenlik-blogu'
import { Maskeleyici } from '@/lib/ai/maske'
import { SizintiHata } from '@/lib/ai/sizinti'
import { tcknUret, tohumlu } from './maske-yardimci'

const R = tohumlu(4242)
const [T1, T2] = [tcknUret(R), tcknUret(R)]
// Uydurma iki borçlu (Python araç testlerindeki uydurma adlar)
const B1 = 'Kerimcan Tuzlaçayır'
const B2 = 'Ferhunde Bıçakçıoğlu'
const KAYNAK = { kisiler: [B1, B2], kimlikler: [T1, T2], plakalar: ['34 KRG 001'], telefonlar: ['0532 111 22 33'] }

const yanit = (text: string, extra: Record<string, unknown> = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], ...extra })
/** create'e giden bütün metin (sistem + içerik) */
function gidenMetin(): string {
  const p = m.create.mock.calls[0][0]
  return JSON.stringify({ s: p.system, c: p.messages })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  vi.stubEnv('AI_ORTAM', 'staging')
  vi.stubEnv('AI_GORSEL', '')
  m.create.mockResolvedValue(yanit('Tamam.'))
})

describe('maskele → çağrı', () => {
  it('giden istekte ham kişisel veri yok; jetonlar, etiketli veri bloğu ve güvenlik bloğu var', async () => {
    const o = aiOturumu({ yuzey: 'soru', ai: { musteriId: 'm1', dosyaId: 'd1' }, maske: KAYNAK })
    await o.iste({
      model: 'x', maxTokens: 10, sistem: 'Sabit sistem metni.', sistemEk: `Footer: ${B2} adına IBAN TR33 0006 1005 1978 6457 8413 26`,
      icerik: [
        { tur: 'belge', ad: `${B1}_ifade.pdf`, metin: `Sürücü ${B1} (TCKN ${T1}) 34 KRG 001 plakalı araçla; ruhsat sahibi ${B2}, T.C. ${T2}. Tel 0532 111 22 33.` },
        { tur: 'metin', metin: `SORU: ${B1} kusurlu mu?` },
      ],
    })
    const giden = gidenMetin()
    for (const ham of [T1, T2, 'Tuzlaçayır', 'Kerimcan', 'Bıçakçıoğlu', 'KRG 001', '111 22 33', '6457']) expect(giden, ham).not.toContain(ham)
    for (const j of ['[KİŞİ-1]', '[KİŞİ-2]', '[TCKN-1]', '[TCKN-2]', '[PLAKA-1]', '[TEL-1]', '[IBAN-1]']) expect(giden).toContain(j)
    const p = m.create.mock.calls[0][0]
    expect(p.system).toContain('Sabit sistem metni.')
    expect(p.system).toContain(GUVENLIK_BLOGU.slice(0, 40))
    expect(p.messages[0].content[0].text).toMatch(/^<belge ad="\[KİŞİ-1\]_ifade\.pdf">\nSürücü \[KİŞİ-1\] \(TCKN \[TCKN-1\]\)/)
    // deterministik: [KİŞİ-1] ilk bilinen borçlu, [TCKN-1] ilk kimlik
    expect(p.messages[0].content[1].text).toBe('SORU: [KİŞİ-1] kusurlu mu?')
    expect(m.fabrika).toHaveBeenCalledWith('test-key', expect.objectContaining({ yuzey: 'soru', musteriId: 'm1', dosyaId: 'd1', maskeli: MASKELI_ISARET }))
  })

  it('yanıt sunucuda geri açılır; iki borçlunun adı karışmaz', async () => {
    m.create.mockResolvedValue(yanit('[KİŞİ-1] sürücü, [KİŞİ-2] ruhsat sahibidir; [TCKN-2] numaralı kişi [PLAKA-1] aracın sahibidir.'))
    const y = await aiOturumu({ yuzey: 'soru', maske: KAYNAK }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: `${B1} ve ${B2}` }] })
    expect(y.metin).toBe(`${B1} sürücü, ${B2} ruhsat sahibidir; ${T2} numaralı kişi 34 KRG 001 aracın sahibidir.`)
    expect(y.maskeliMetin).toContain('[KİŞİ-1] sürücü')
    expect(y.acilamayanJetonlar).toEqual([])
  })

  it('araç girdisi (tool_use) derinlemesine geri açılır', async () => {
    m.create.mockResolvedValue({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'kaydet', input: { borclular: [{ adUnvan: '[KİŞİ-2]', tcVkn: '[TCKN-2]' }], plaka: '[PLAKA-1]' } }] })
    const y = await aiOturumu({ yuzey: 'cikarim', maske: KAYNAK }).iste({
      model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'belge', ad: 'b', metin: `${B2} ${T2}` }], arac: { ad: 'kaydet', aciklama: 'k', sema: { type: 'object' } },
    })
    expect(y.aracGirdisi).toEqual({ borclular: [{ adUnvan: B2, tcVkn: T2 }], plaka: '34 KRG 001' })
    expect(m.create.mock.calls[0][0].tool_choice).toEqual({ type: 'tool', name: 'kaydet' })
  })

  it('yabancı/açılamayan jeton kırmızı kapıya düşer', async () => {
    m.create.mockResolvedValue(yanit('[KİŞİ-9] ve (KİŞİ-1) belirsiz.'))
    const y = await aiOturumu({ yuzey: 'soru', maske: KAYNAK }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: B1 }] })
    expect(new Set(y.acilamayanJetonlar)).toEqual(new Set(['[KİŞİ-9]', '(KİŞİ-1)']))
  })

  it('geriAc:false — dış servise gidecek metin açılmaz', async () => {
    m.create.mockResolvedValue(yanit('[KİŞİ-1] rücu'))
    const y = await aiOturumu({ yuzey: 'emsal', maske: KAYNAK }).iste({ model: 'x', maxTokens: 10, sistem: 'S', geriAc: false, icerik: [{ tur: 'metin', metin: B1 }] })
    expect(y.metin).toBe('[KİŞİ-1] rücu')
    expect(y.metin).not.toContain('Tuzlaçayır')
  })

  it('JSON içerik: değerler maskelenir, kimlik (UUID) alanları korunur', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    await aiOturumu({ yuzey: 'dilekce', maske: KAYNAK }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'json', veri: { taraflar: [{ adUnvan: B1 }], belgeler: [{ kaynak: id, metin: `Davalı ${B2}` }] } }] })
    const gonderilen = JSON.parse(m.create.mock.calls[0][0].messages[0].content[0].text)
    expect(gonderilen).toEqual({ taraflar: [{ adUnvan: '[KİŞİ-1]' }], belgeler: [{ kaynak: id, metin: 'Davalı [KİŞİ-2]' }] })
  })

  it('JSON içerik: SAYI olarak girilmiş TCKN/telefon da maskelenir; küçük sayılar (tutar) olduğu gibi', async () => {
    const T3 = tcknUret(R) // bilinmeyen, kontrol hanesi geçerli
    await aiOturumu({ yuzey: 'dilekce', maske: KAYNAK }).iste({
      model: 'x', maxTokens: 10, sistem: 'S',
      icerik: [{ tur: 'json', veri: { taraf: { tckn: Number(T1), baska: Number(T3), tel: 5321112233 }, tutar: 1250.5, adet: 3 } }],
    })
    const giden = gidenMetin()
    for (const ham of [T1, T3, '5321112233']) expect(giden, ham).not.toContain(ham)
    const gonderilen = JSON.parse(m.create.mock.calls[0][0].messages[0].content[0].text)
    expect(gonderilen.taraf.tckn).toBe('[TCKN-1]')
    expect(gonderilen.taraf.baska).toMatch(/^\[TCKN-\d+\]$/)
    expect(gonderilen.taraf.tel).toMatch(/^\[TEL-\d+\]$/)
    expect(gonderilen.tutar).toBe(1250.5)
    expect(gonderilen.adet).toBe(3)
  })

  it('JSON içerik: maskelenemeyen sayısal kimlik sızıntı kapısına takılır (sayı taramadan kaçamaz)', async () => {
    const maske = new Maskeleyici()
    vi.spyOn(maske, 'maskele').mockImplementation((metin: string) => ({ metin, sayim: {} })) // maskelemeyi atlat (zorlama)
    await expect(aiOturumu({ yuzey: 'dilekce', maske }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'json', veri: { tckn: Number(T2) } }] }))
      .rejects.toBeInstanceOf(SizintiHata)
    expect(m.create).not.toHaveBeenCalled()
  })

  it('bir belgede etiketle bulunan ad ötekinde de maskelenir (önce keşif)', async () => {
    await aiOturumu({ yuzey: 'soru' }).iste({
      model: 'x', maxTokens: 10, sistem: 'S',
      icerik: [{ tur: 'metin', metin: 'Olayda ORHUN KAVAKLIDERE yaralandı.' }, { tur: 'belge', ad: 'tutanak', metin: 'DAVALI : ORHUN KAVAKLIDERE' }],
    })
    expect(gidenMetin()).not.toContain('KAVAKLIDERE')
  })

  it('aynı oturumda tek istemci (kredi bir kez) ve aynı kişi aynı jeton', async () => {
    const o = aiOturumu({ yuzey: 'emsal', maske: KAYNAK })
    await o.iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: B2 }] })
    await o.iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: B2 }] })
    expect(m.fabrika).toHaveBeenCalledTimes(1)
    expect(m.create.mock.calls[0][0].messages[0].content[0].text).toBe('[KİŞİ-2]')
    expect(m.create.mock.calls[1][0].messages[0].content[0].text).toBe('[KİŞİ-2]')
  })
})

describe('sızıntı kapısı', () => {
  it('maskelenmemiş TCKN zorlanırsa "sızıntı: çağrı durduruldu" — istek gitmez', async () => {
    const maske = new Maskeleyici()
    vi.spyOn(maske, 'maskele').mockImplementation((metin: string) => ({ metin, sayim: {} })) // maskelemeyi atlat (zorlama)
    const o = aiOturumu({ yuzey: 'soru', maske })
    await expect(o.iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: `Borçlu TCKN ${T1}` }] })).rejects.toBeInstanceOf(SizintiHata)
    await expect(o.iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: `Borçlu TCKN ${T1}` }] })).rejects.toThrow(/Sızıntı/)
    expect(m.create).not.toHaveBeenCalled()
    expect(m.fabrika).not.toHaveBeenCalled()
  })
  it('sabit sistem metnine yanlışlıkla konmuş kişisel veri de durdurur', async () => {
    const o = aiOturumu({ yuzey: 'soru' })
    await expect(o.iste({ model: 'x', maxTokens: 10, sistem: `Borçlunun TCKN'si ${T1}`, icerik: [] })).rejects.toBeInstanceOf(SizintiHata)
    expect(m.create).not.toHaveBeenCalled()
  })
})

describe('kapılar', () => {
  it('canlıda yüzey bayrağı kapalıysa AiKvkkKapaliHata; hiçbir şey gönderilmez', async () => {
    vi.stubEnv('AI_ORTAM', '')
    const o = aiOturumu({ yuzey: 'soru', maske: KAYNAK })
    await expect(o.iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: B1 }] })).rejects.toBeInstanceOf(AiKvkkKapaliHata)
    expect(m.fabrika).not.toHaveBeenCalled()
    vi.stubEnv('AI_YUZEY_SORU', 'acik')
    await expect(o.iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [{ tur: 'metin', metin: B1 }] })).resolves.toBeTruthy()
  })
  it('görsel: AI_GORSEL kapalıysa ya da yüzeyin görsel izni yoksa gönderilmez', async () => {
    const gorsel = { tur: 'gorsel' as const, mime: 'image/png' as const, b64: 'AAAA' }
    await expect(aiOturumu({ yuzey: 'foto', gorselIzni: true }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [gorsel] })).rejects.toBeInstanceOf(AiGorselKapaliHata)
    vi.stubEnv('AI_GORSEL', 'acik')
    await expect(aiOturumu({ yuzey: 'cikarim' }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [gorsel] })).rejects.toBeInstanceOf(AiGorselKapaliHata)
    expect(m.create).not.toHaveBeenCalled()
    await aiOturumu({ yuzey: 'foto', gorselIzni: true }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [gorsel] })
    expect(m.create.mock.calls[0][0].messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } })
  })
})

describe('stop_reason', () => {
  it('refusal → AiReddettiHata; max_tokens → kesildi', async () => {
    m.create.mockResolvedValueOnce(yanit('', { stop_reason: 'refusal' }))
    await expect(aiOturumu({ yuzey: 'soru' }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [] })).rejects.toBeInstanceOf(AiReddettiHata)
    m.create.mockResolvedValueOnce(yanit('Yarım', { stop_reason: 'max_tokens' }))
    expect((await aiOturumu({ yuzey: 'soru' }).iste({ model: 'x', maxTokens: 10, sistem: 'S', icerik: [] })).kesildi).toBe(true)
  })
})

describe('maskeleyiciKur', () => {
  it('şirket borçlusu yalnız tam yazımla, kişi soyadıyla da maskelenir; kimlik türü haneye göre', () => {
    const mk = maskeleyiciKur({ kisiler: ['Kurgusal Lojistik Ltd. Şti.', B1], kimlikler: [T1, '1234567890', null, ''] })
    const out = mk.maskele(`Kurgusal Lojistik Ltd. Şti. ile Başka Ltd. Şti.; Tuzlaçayır; ${T1}; 1234567890`).metin
    expect(out).toBe('[KİŞİ-1] ile Başka Ltd. Şti.; [KİŞİ-2]; [TCKN-1]; [VKN-1]')
  })
})
