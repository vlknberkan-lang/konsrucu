/**
 * S02/S09 · akilli-giris sunucu eylemlerinde KVKK kapıları (mock DB; kurgusal kayıtlar):
 *  - aiCikar görselsiz çalışır; Aktivite "0 görsel gönderildi (N görsel KVKK nedeniyle atlandı)";
 *    bilinen kayıtlar maske kaynağı olarak analizEt'e verilir; kapalı yüzey mesajı olduğu gibi döner.
 *  - hasarFotoSecAI görsel AI kapalıyken fotoğraf indirmez ("elle seçin").
 *  - emsalBul yüzey kapalıyken dosyayı okumaz.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getUser: vi.fn(), kullanici: vi.fn(), dosyaBul: vi.fn(), dosyaGuncelle: vi.fn(), aktivite: vi.fn(), ayarlar: vi.fn(),
  transaction: vi.fn(), analizEt: vi.fn(), foto: vi.fn(), emsal: vi.fn(), indir: vi.fn(), belgeCreateMany: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'kurgusal-musteri' }) }) }))
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`) } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: m.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ download: m.indir }) } }) }))
vi.mock('@/lib/konsrucu/analiz', () => ({ analizEt: m.analizEt, enIyiHasarFotolari: m.foto }))
vi.mock('@/lib/konsrucu/emsal-ara', () => ({ dosyadanEmsal: m.emsal }))
vi.mock('@/lib/konsrucu/ai-kredi', () => ({ dosyaLimitKontrol: vi.fn() }))
vi.mock('@/lib/konsrucu/mentor-kural', () => ({ mentorKurallariOku: vi.fn(async () => []), mentorKurallariMetne: () => '' }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    kullanici: { findUnique: m.kullanici },
    rucuDosyasi: { findUnique: m.dosyaBul, update: m.dosyaGuncelle },
    belge: { createMany: m.belgeCreateMany },
    aktivite: { create: m.aktivite },
    ayarlar: { findUnique: m.ayarlar },
    $transaction: m.transaction,
  },
}))
import { aiCikar, belgeEkle, emsalBul, hasarFotoSecAI } from '@/app/(app)/akilli-giris/actions'
import { ELLE_YUKLEME_METIN_SINIRI } from '@/lib/konsrucu/evrak-metin/ortak'
import { KVKK_KAPALI_MESAJI } from '@/lib/ai/bayrak'

const dosya = () => ({
  musteriId: 'kurgusal-musteri', durum: 'INCELENIYOR', cikarimJson: {},
  yol: null, brans: null, sigortaliUnvan: 'Kurgusal Sigortalı', sigortaliTelefon: null, sigortaliPlaka: '34 KRG 001', karsiPlaka: null,
  il: null, kazaYeri: null, olusSekli: null, kusurDurumu: null, asilAlacak: null, rucuTutari: null, rucuOrani: null, yetkiliIcra: null, muhatapOzet: null,
  belgeler: [
    { extractedText: 'Kurgusal kaza tespit tutanağı metni.', kategori: 'TUTANAK', dosyaAdi: 'tutanak.pdf', storagePath: 'd/tutanak.pdf' },
    { extractedText: null, kategori: 'ALKOL', dosyaAdi: 'alkol_raporu.jpg', storagePath: 'd/alkol_raporu.jpg' }, // SEN-02 benzeri kurgusal görsel
  ],
  borclular: [{ adUnvan: '[Kurgusal Borçlu 1]', tcVkn: null, telefon: null, teyitDurumu: 'TEYIT_GEREK' }],
  odemeler: [],
})
const ANALIZ = { yol: 'klasik', yolGuven: 0.9, olayTuru: 'kurgusal', olayBaglami: 'Kurgusal', aciklama: 'Kurgusal', teyit: [], sonrakiAdimlar: [], borclular: [], dekontlar: [] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  for (const k of Object.keys(process.env)) if (/^AI_(YUZEY_|ORTAM|GORSEL)/.test(k)) vi.stubEnv(k, '')
  m.getUser.mockResolvedValue({ data: { user: { id: 'kurgusal-avukat' } } })
  m.kullanici.mockResolvedValue({ id: 'kurgusal-avukat', rol: 'AVUKAT', aktif: true, musteriler: [{ musteriId: 'kurgusal-musteri' }] })
  m.dosyaBul.mockResolvedValue(dosya())
  m.ayarlar.mockResolvedValue(null)
  m.dosyaGuncelle.mockReturnValue('guncelle')
  m.aktivite.mockReturnValue('aktivite')
  m.transaction.mockResolvedValue([])
})

describe('aiCikar', () => {
  it('görsel gönderilmez; Aktivite "0 görsel gönderildi (1 görsel KVKK nedeniyle atlandı)"; bilinen kayıtlar maske kaynağı', async () => {
    m.analizEt.mockResolvedValue(structuredClone(ANALIZ))
    const r = await aiCikar('kurgusal-dosya')
    expect(r.ok).toBe(true)
    expect(m.indir).not.toHaveBeenCalled() // görsel indirilmedi
    const [metin, secenek] = m.analizEt.mock.calls[0]
    expect(metin).toContain('Kurgusal kaza tespit tutanağı')
    expect(secenek).not.toHaveProperty('gorseller')
    expect(secenek.maske.kisiler).toEqual(['[Kurgusal Borçlu 1]', 'Kurgusal Sigortalı'])
    expect(secenek.maske.plakalar).toContain('34 KRG 001')
    const akt = m.aktivite.mock.calls[0][0].data
    expect(akt.eylem).toContain('0 görsel gönderildi (1 görsel KVKK nedeniyle atlandı)')
    expect(akt.detayJson).toMatchObject({ gorselGonderilen: 0, gorselKvkkAtlanan: 1, gorselHassas: 1 })
  })
  it('yanıtta açılamayan jeton kaldıysa (kırmızı kapı) uyarı Aktivite\'ye ve sonuca yazılır; değer içermez', async () => {
    const UYARI = 'Yapay zekâ yanıtında açılamayan jeton var ([KİŞİ-9]); bu kısımlar uydurulmuş olabilir, elle kontrol edin.'
    m.analizEt.mockImplementation(async (_m: string, s: { onUyari?: (x: string) => void }) => { s.onUyari?.(UYARI); return structuredClone(ANALIZ) })
    const r = await aiCikar('kurgusal-dosya')
    expect(r).toMatchObject({ ok: true, uyari: UYARI })
    const akt = m.aktivite.mock.calls[0][0].data
    expect(akt.eylem).toContain(`⚠ ${UYARI}`)
    expect(akt.detayJson).toMatchObject({ acilamayanJeton: true })
  })
  it('jeton uyarısı yoksa Aktivite temiz, sonuçta uyari alanı yok', async () => {
    m.analizEt.mockResolvedValue(structuredClone(ANALIZ))
    const r = await aiCikar('kurgusal-dosya')
    expect(r).not.toHaveProperty('uyari')
    expect(m.aktivite.mock.calls[0][0].data.eylem).not.toContain('⚠')
    expect(m.aktivite.mock.calls[0][0].data.detayJson).toMatchObject({ acilamayanJeton: false })
  })
  it('yüzey kapalıysa KVKK cümlesi olduğu gibi döner; dosyaya yazılmaz', async () => {
    m.analizEt.mockImplementation(async (_m: string, s: { onHata?: (x: string) => void }) => { s.onHata?.(KVKK_KAPALI_MESAJI); return null })
    const r = await aiCikar('kurgusal-dosya')
    expect(r).toEqual({ ok: false, error: KVKK_KAPALI_MESAJI })
    expect(m.transaction).not.toHaveBeenCalled()
  })
})

describe('hasarFotoSecAI', () => {
  it('görsel AI kapalıyken fotoğraf indirilmez, dosya okunmaz; "elle seçin"', async () => {
    vi.stubEnv('AI_ORTAM', 'staging') // staging bile görseli açmaz
    const r = await hasarFotoSecAI('kurgusal-dosya')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/elle seçin/)
    expect(m.dosyaBul).not.toHaveBeenCalled()
    expect(m.indir).not.toHaveBeenCalled()
    expect(m.foto).not.toHaveBeenCalled()
  })
  it('görsel AI açıkken bile kimlik/ehliyet adlı "hasar fotoğrafı" gönderilmez', async () => {
    vi.stubEnv('AI_GORSEL', 'acik')
    vi.stubEnv('AI_YUZEY_FOTO', 'acik')
    m.dosyaBul.mockResolvedValue({ musteriId: 'kurgusal-musteri', cikarimJson: {}, belgeler: [{ id: 'b1', storagePath: 'd/ehliyet_on.jpg', dosyaAdi: 'ehliyet_on.jpg', kategori: 'HASAR_FOTO' }] })
    const r = await hasarFotoSecAI('kurgusal-dosya')
    expect(r.ok).toBe(false)
    expect(m.indir).not.toHaveBeenCalled()
  })
})

describe('emsalBul', () => {
  it('yüzey kapalıyken dosya okunmaz, arama yapılmaz', async () => {
    const r = await emsalBul('kurgusal-dosya')
    expect(r).toEqual({ ok: false, error: KVKK_KAPALI_MESAJI })
    expect(m.dosyaBul).not.toHaveBeenCalled()
    expect(m.emsal).not.toHaveBeenCalled()
  })
  it('açıkken bilinen kişi ve plakalar maske kaynağı olarak verilir', async () => {
    vi.stubEnv('AI_YUZEY_EMSAL', 'acik')
    m.dosyaBul.mockResolvedValue({ id: 'kurgusal-dosya', musteriId: 'kurgusal-musteri', brans: 'KASKO', kusurDurumu: null, cikarimJson: {}, sigortaliUnvan: 'Kurgusal Sigortalı', sigortaliPlaka: '34 KRG 001', karsiPlaka: null, borclular: [{ adUnvan: '[Kurgusal Borçlu 1]' }] })
    m.emsal.mockResolvedValue({ kelime: 'rücu', emsaller: [] })
    expect((await emsalBul('kurgusal-dosya')).ok).toBe(true)
    expect(m.emsal.mock.calls[0][3]).toEqual({ kisiler: ['[Kurgusal Borçlu 1]', 'Kurgusal Sigortalı'], plakalar: ['34 KRG 001', null] })
  })
})

describe('belgeEkle (S16 · elle yükleme)', () => {
  it('sınırı aşan metin sessizce kesilmez: işaretle saklanır, Aktivite kesilen belge sayısını yazar', async () => {
    const uzun = 'Kurgusal rapor satırı.\n'.repeat(10_000) // ~230 bin karakter
    const r = await belgeEkle('kurgusal-dosya', [
      { dosyaAdi: 'uzun.txt', kategori: 'DIGER', extractedText: uzun },
      { dosyaAdi: 'kisa.txt', kategori: 'DIGER', extractedText: 'Kurgusal kısa not.' },
      { dosyaAdi: 'tarama.pdf', kategori: 'DIGER', extractedText: null },
    ])
    expect(r.ok).toBe(true)
    const veri = m.belgeCreateMany.mock.calls[0][0].data
    expect(veri[0].extractedText.length).toBeLessThanOrEqual(ELLE_YUKLEME_METIN_SINIRI)
    expect(veri[0].extractedText).toMatch(/METİN KESİLDİ: toplam \d+ karakter/)
    expect(veri[1].extractedText).toBe('Kurgusal kısa not.')
    expect(veri[2].extractedText).toBeNull()
    expect(m.aktivite.mock.calls[0][0].data.eylem).toContain('1 belgenin metni boyut sınırında kesildi')
  })
})
