/**
 * S18/S19 · server action güvenliği (app/(app)/dosya-islem/oneri-actions.ts): oturum + aktif müvekkil kapsamı,
 * rol denetimi (GORUNTULEYEN yazamaz; rücu sebebi ve yetkili icra yalnız avukat), zod, hata eşleme (P2002 →
 * "az önce onaylandı"), yetkili icra seçeneklerinin sunucuda yeniden hesaplanması, revalidatePath.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  ctx: vi.fn(), dosyaBul: vi.fn(), dosyaTek: vi.fn(), alanBul: vi.fn(), aktivite: vi.fn(), revalidate: vi.fn(),
  oneriOnayla: vi.fn(), elleOnayla: vi.fn(), oneriReddet: vi.fn(), topluOnayla: vi.fn(), onerileriKaydet: vi.fn(), dosyaSayfalari: vi.fn(),
  aiCalistir: vi.fn(), aiYaz: vi.fn(),
}))
vi.mock('@/lib/konsrucu/oneri/ai-oneri', () => ({ aiOneriCalistir: m.aiCalistir, aiSonucunuYaz: m.aiYaz }))
vi.mock('@/lib/konsrucu/db', () => ({ ctx: m.ctx }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/prisma', () => {
  const tx = { rucuDosyasi: { findUnique: m.dosyaTek }, alanDegeri: { findFirst: m.alanBul }, aktivite: { create: m.aktivite } }
  return {
    prisma: {
      rucuDosyasi: { findFirst: m.dosyaBul }, alanDegeri: { findFirst: m.alanBul }, aktivite: { create: m.aktivite },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock('@/lib/konsrucu/oneri/servis', async (orijinal) => ({
  ...(await orijinal<typeof import('@/lib/konsrucu/oneri/servis')>()),
  oneriOnayla: m.oneriOnayla, elleOnayla: m.elleOnayla, oneriReddet: m.oneriReddet, topluOnayla: m.topluOnayla,
  onerileriKaydet: m.onerileriKaydet, dosyaSayfalari: m.dosyaSayfalari,
}))

import {
  kuralOnerileriniUretEylem, oneriDegeriniGosterEylem, oneriDuzeltEylem, oneriOnaylaEylem, oneriReddetEylem,
  onerileriTopluOnaylaEylem, rucuSebebiSecEylem, yetkiliIcraSecEylem,
} from '@/app/(app)/dosya-islem/oneri-actions'
import { OneriHata } from '@/lib/konsrucu/oneri/servis'

const dosyaId = '00000000-0000-4000-8000-000000000001'
const oneriId = '00000000-0000-4000-8000-000000000002'
const kullanici = (rol: string, aktif = true) => ({ dbUser: { id: 'u1', rol, aktif }, aktifMusteriId: 'tenant-1' })

beforeEach(() => {
  vi.resetAllMocks()
  m.ctx.mockResolvedValue(kullanici('AVUKAT'))
  m.dosyaBul.mockResolvedValue({ id: dosyaId, musteri: { aktif: true } })
  m.oneriOnayla.mockResolvedValue({ onayliId: 'x', alan: 'policeNo' })
  m.elleOnayla.mockResolvedValue({ onayliId: 'y', degismedi: false })
  m.topluOnayla.mockResolvedValue({ onaylanan: 1, atlanan: 0 })
  m.onerileriKaydet.mockResolvedValue({ eklenen: 2, atlanan: 1, eskiyen: 0, gecersiz: [], kaynaksiz: 0 })
  m.dosyaSayfalari.mockResolvedValue([])
  m.aiCalistir.mockResolvedValue({ durum: 'KAPALI' })
})

describe('kapsam ve rol', () => {
  it.each([['GORUNTULEYEN', true], ['AVUKAT', false]])('rol %s (aktif: %s) hiçbir eylemi yazamaz', async (rol, aktif) => {
    m.ctx.mockResolvedValue(kullanici(rol, aktif))
    const sonuclar = await Promise.all([
      oneriOnaylaEylem({ dosyaId, oneriId, beklenenOnayliId: null }),
      oneriReddetEylem({ dosyaId, oneriId }),
      kuralOnerileriniUretEylem({ dosyaId }),
      rucuSebebiSecEylem({ dosyaId, kod: 'B4_F', beklenenOnayliId: null }),
      oneriDegeriniGosterEylem({ dosyaId, oneriId }),
    ])
    expect(sonuclar.every((r) => !r.ok)).toBe(true)
    expect(m.dosyaBul).not.toHaveBeenCalled()
    expect(m.oneriOnayla).not.toHaveBeenCalled()
    expect(m.aktivite).not.toHaveBeenCalled()
  })

  it('dosya yalnız aktif müvekkil kapsamında aranır; başka müvekkilin dosyası bulunamaz', async () => {
    m.dosyaBul.mockResolvedValue(null)
    const r = await oneriOnaylaEylem({ dosyaId, oneriId, beklenenOnayliId: null })
    expect(r).toEqual({ ok: false, error: 'Dosya bulunamadı veya erişiminiz yok.' })
    expect(m.dosyaBul).toHaveBeenCalledWith(expect.objectContaining({ where: { id: dosyaId, musteriId: 'tenant-1' } }))
    expect(m.oneriOnayla).not.toHaveBeenCalled()
  })

  it('pasif müvekkilde değişiklik yapılamaz', async () => {
    m.dosyaBul.mockResolvedValue({ id: dosyaId, musteri: { aktif: false } })
    expect((await oneriReddetEylem({ dosyaId, oneriId })).ok).toBe(false)
    expect(m.oneriReddet).not.toHaveBeenCalled()
  })

  it('geçersiz kimlik zod\'da durur', async () => {
    expect(await oneriOnaylaEylem({ dosyaId: 'x', oneriId, beklenenOnayliId: null })).toEqual({ ok: false, error: 'Geçersiz istek.' })
    expect(m.ctx).not.toHaveBeenCalled()
  })

  it('yardımcı rücu sebebi ve yetkili icra seçemez', async () => {
    m.ctx.mockResolvedValue(kullanici('AVUKAT_YRD'))
    expect((await rucuSebebiSecEylem({ dosyaId, kod: 'B4_F', beklenenOnayliId: null })).ok).toBe(false)
    expect((await yetkiliIcraSecEylem({ dosyaId, anahtar: 'KAZA_YERI', beklenenOnayliId: null })).ok).toBe(false)
    expect(m.elleOnayla).not.toHaveBeenCalled()
  })
})

describe('onay ve hata eşleme', () => {
  it('onay: servis kullanıcı ve yetkiyle çağrılır; iki yol da tazelenir', async () => {
    expect(await oneriOnaylaEylem({ dosyaId, oneriId, beklenenOnayliId: null })).toEqual({ ok: true })
    expect(m.oneriOnayla).toHaveBeenCalledWith(expect.anything(), { dosyaId, oneriId, beklenenOnayliId: null, kullaniciId: 'u1', yetki: { duzenleyebilir: true, kararVerebilir: true } })
    expect(m.revalidate).toHaveBeenCalledWith(`/akilli-giris/${dosyaId}`)
    expect(m.revalidate).toHaveBeenCalledWith(`/dosya/${dosyaId}`)
  })

  it('tekil indeks yarışı (P2002) "az önce onaylandı" olur; servis hatası metniyle döner', async () => {
    m.oneriOnayla.mockRejectedValueOnce(Object.assign(new Error('Unique'), { code: 'P2002' }))
    expect((await oneriOnaylaEylem({ dosyaId, oneriId, beklenenOnayliId: null })) as { error: string }).toMatchObject({ error: expect.stringMatching(/az önce/) })
    m.oneriOnayla.mockRejectedValueOnce(new OneriHata('KILIT_DEGISTI', 'Bu alan az önce başka bir değerle onaylandı ya da değişti; sayfayı yenileyip tekrar bakın.'))
    expect(await oneriOnaylaEylem({ dosyaId, oneriId, beklenenOnayliId: null })).toEqual({ ok: false, error: expect.stringMatching(/başka bir değerle/) })
    m.oneriOnayla.mockRejectedValueOnce(new Error('bağlantı koptu: postgres://gizli'))
    const r = await oneriOnaylaEylem({ dosyaId, oneriId, beklenenOnayliId: null })
    expect(r).toEqual({ ok: false, error: 'İşlem tamamlanamadı; sayfayı yenileyip tekrar deneyin.' })
    expect(m.revalidate).not.toHaveBeenCalled()
  })

  it('düzeltme: ödemede tutar + tarih nesnesi kurulur; anlaşılamayan değer reddedilir', async () => {
    m.alanBul.mockResolvedValue({ alan: 'odeme[2026-03-14|12500.00]' })
    await oneriDuzeltEylem({ dosyaId, oneriId, beklenenOnayliId: null, deger: '12.000,00', tarih: '2026-03-15' })
    expect(m.oneriOnayla).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duzeltilmisDeger: { tutar: '12.000,00', tarih: '2026-03-15' } }))
    m.alanBul.mockResolvedValue({ alan: 'kazaTarihi' })
    const r = await oneriDuzeltEylem({ dosyaId, oneriId, beklenenOnayliId: null, deger: 'dün' })
    expect(r).toEqual({ ok: false, error: 'Kaza tarihi: değer anlaşılamadı. Biçimi kontrol edin.' })
  })

  it('toplu onay sonucu döner', async () => {
    expect(await onerileriTopluOnaylaEylem({ dosyaId, oneriIds: [oneriId] })).toEqual({ ok: true, onaylanan: 1, atlanan: 0 })
  })
})

describe('rücu sebebi ve yetkili icra', () => {
  it('GŞ-DİĞER gerekçesiz seçilemez; gerekçe Aktivite\'ye yazılır', async () => {
    expect((await rucuSebebiSecEylem({ dosyaId, kod: 'GS_DIGER', beklenenOnayliId: null })).ok).toBe(false)
    expect(m.elleOnayla).not.toHaveBeenCalled()
    const r = await rucuSebebiSecEylem({ dosyaId, kod: 'GS_DIGER', beklenenOnayliId: null, gerekce: 'Kurgusal gerekçe: poliçe özel şartı' })
    expect(r).toEqual({ ok: true })
    expect(m.elleOnayla).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ alan: 'rucuSebebiKod', deger: 'GS_DIGER', uretici: 'SECIM:RUCU_SEBEBI' }))
    expect(m.aktivite).toHaveBeenCalledWith({ data: expect.objectContaining({ detayJson: expect.objectContaining({ tur: 'RUCU_SEBEBI_GEREKCE', kod: 'GS_DIGER' }) }) })
  })

  it('tanımsız kod zod\'da durur', async () => {
    expect((await rucuSebebiSecEylem({ dosyaId, kod: 'UYDURMA' as never, beklenenOnayliId: null })).ok).toBe(false)
  })

  it('oto dışı OD-DİĞER de gerekçesiz seçilemez (zod enum yeni kodları otomatik kabul eder)', async () => {
    expect((await rucuSebebiSecEylem({ dosyaId, kod: 'OD_DIGER', beklenenOnayliId: null })).ok).toBe(false)
    expect(m.elleOnayla).not.toHaveBeenCalled()
    const r = await rucuSebebiSecEylem({ dosyaId, kod: 'OD_DIGER', beklenenOnayliId: null, gerekce: 'Kurgusal gerekçe: apartman yönetimi sorumluluğu' })
    expect(r).toEqual({ ok: true })
    expect(m.elleOnayla).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ alan: 'rucuSebebiKod', deger: 'OD_DIGER', uretici: 'SECIM:RUCU_SEBEBI' }))
  })

  it('oto dışı halefiyet kodu (OD_KOMSU_SU) gerekçesiz seçilebilir', async () => {
    const r = await rucuSebebiSecEylem({ dosyaId, kod: 'OD_KOMSU_SU', beklenenOnayliId: null })
    expect(r).toEqual({ ok: true })
  })

  it('yetkili icra: seçenek sunucuda dosya verisinden yeniden hesaplanır (istemcinin daire adına güvenilmez)', async () => {
    m.dosyaTek.mockResolvedValue({ kazaYeri: 'Seyhan', il: 'Adana', borclular: [] })
    expect(await yetkiliIcraSecEylem({ dosyaId, anahtar: 'KAZA_YERI', beklenenOnayliId: null })).toEqual({ ok: true })
    expect(m.elleOnayla).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      alan: 'yetkiliIcra', deger: expect.objectContaining({ icraDairesi: 'Adana İcra Dairesi', secenek: 'KAZA_YERI' }),
    }))
  })

  it('artık olmayan seçenek ve boş elle daire reddedilir', async () => {
    m.dosyaTek.mockResolvedValue({ kazaYeri: 'Seyhan', il: 'Adana', borclular: [] })
    expect(await yetkiliIcraSecEylem({ dosyaId, anahtar: 'YERLESIM_YERI:yok', beklenenOnayliId: null })).toEqual({ ok: false, error: expect.stringMatching(/artık geçerli değil/) })
    expect(await yetkiliIcraSecEylem({ dosyaId, anahtar: 'ELLE', beklenenOnayliId: null })).toEqual({ ok: false, error: 'İcra dairesinin adını yazın.' })
    expect(m.elleOnayla).not.toHaveBeenCalled()
  })

  it('elle daire kabul edilir', async () => {
    await yetkiliIcraSecEylem({ dosyaId, anahtar: 'ELLE', elleDaire: 'Kurgu İcra Dairesi', beklenenOnayliId: null })
    expect(m.elleOnayla).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deger: { icraDairesi: 'Kurgu İcra Dairesi', secenek: 'ELLE', gerekce: 'Avukat elle girdi.' } }))
  })
})

describe('kural önerileri ve kişisel veri', () => {
  it('kural + Hugo önerileri tek işlemde yazılır ve Aktivite\'ye özetlenir', async () => {
    m.dosyaTek.mockResolvedValue({ rucuSebebi: 'Hizmet kusuru', brans: 'KASKO', rucuTutari: null, hasarTarihi: null, kaynakJson: { kaynak: 'hugo' } })
    m.dosyaSayfalari.mockResolvedValue([{ belgeId: 'b', sayfaNo: 1, metin: 'Poliçe No: KRG-1234', kategori: 'POLICE', altTur: null }])
    const r = await kuralOnerileriniUretEylem({ dosyaId })
    expect(r).toEqual({ ok: true, eklenen: 2, atlanan: 1, kaynaksiz: 0, ai: 'KAPALI', aiHata: null, yeniBorclu: 0, yazilanAlan: 0 })
    const oneriler = m.onerileriKaydet.mock.calls[0][2] as { alan: string; kaynakTuru: string }[]
    expect(oneriler.map((o) => [o.alan, o.kaynakTuru])).toEqual([['policeNo', 'KURAL'], ['rucuSebebiKod', 'HUGO']])
    expect(m.aiYaz).not.toHaveBeenCalled()
    expect(m.aktivite).toHaveBeenCalledWith({ data: expect.objectContaining({ eylem: expect.stringContaining('2 yeni') }) })
  })

  it('yapay zekâ açıkken önerileri kural önerileriyle aynı işlemde kaydedilir; kart dışı alanlar ve borçlu yazılır', async () => {
    const analiz = { yol: 'klasik', yolGuven: 0.9, borclular: [], aciklama: 'Kurgusal', olayBaglami: '', teyit: [] }
    m.aiCalistir.mockResolvedValue({ durum: 'TAMAM', oneriler: [{ alan: 'asilAlacak', deger: 12500, kaynakTuru: 'AI' }], analiz, uyari: null, gorselNotu: '' })
    m.aiYaz.mockResolvedValue({ yazilanAlanlar: ['olusSekli'], yeniBorclu: 1, farkliDeger: 0, onayDustu: true })
    m.dosyaTek.mockResolvedValue({ rucuSebebi: null, brans: null, rucuTutari: null, hasarTarihi: null, kaynakJson: null })
    const r = await kuralOnerileriniUretEylem({ dosyaId })
    expect(r).toMatchObject({ ok: true, ai: 'TAMAM', aiHata: null, yeniBorclu: 1, yazilanAlan: 1 })
    const oneriler = m.onerileriKaydet.mock.calls[0][2] as { alan: string; kaynakTuru: string }[]
    expect(oneriler.map((o) => [o.alan, o.kaynakTuru])).toContainEqual(['asilAlacak', 'AI'])
    expect(m.aiYaz).toHaveBeenCalledWith(expect.anything(), dosyaId, analiz)
    expect(m.aktivite).toHaveBeenCalledWith({ data: expect.objectContaining({ eylem: expect.stringMatching(/yapay zekâ: 1 öneri.*onay sıfırlandı/) }) })
  })

  it('yapay zekâ hata verirse kural önerileri yine kaydedilir ve hata kullanıcıya döner', async () => {
    m.aiCalistir.mockResolvedValue({ durum: 'HATA', hata: 'Yapay zekâ çıkarımı başarısız: kurgusal' })
    m.dosyaTek.mockResolvedValue({ rucuSebebi: null, brans: null, rucuTutari: null, hasarTarihi: null, kaynakJson: null })
    const r = await kuralOnerileriniUretEylem({ dosyaId })
    expect(r).toMatchObject({ ok: true, eklenen: 2, ai: 'HATA', aiHata: 'Yapay zekâ çıkarımı başarısız: kurgusal' })
    expect(m.onerileriKaydet).toHaveBeenCalled()
    expect(m.aiYaz).not.toHaveBeenCalled()
    expect(m.aktivite).toHaveBeenCalledWith({ data: expect.objectContaining({ eylem: expect.stringContaining('yapay zekâ çalışmadı') }) })
  })

  it('yazma yetkisi olmayan kullanıcı için yapay zekâ hiç çağrılmaz', async () => {
    m.ctx.mockResolvedValue(kullanici('GORUNTULEYEN'))
    const r = await kuralOnerileriniUretEylem({ dosyaId })
    expect(r.ok).toBe(false)
    expect(m.aiCalistir).not.toHaveBeenCalled()
  })

  it('"Göster" ham değeri döndürür ve her açış Aktivite\'ye yazılır', async () => {
    m.alanBul.mockResolvedValue({ alan: 'karsiPlaka', degerJson: '34 KRG 001', alinti: 'Plaka: 34 KRG 001' })
    const r = await oneriDegeriniGosterEylem({ dosyaId, oneriId })
    expect(r).toEqual({ ok: true, deger: '34 KRG 001', alinti: 'Plaka: 34 KRG 001' })
    expect(m.alanBul).toHaveBeenCalledWith(expect.objectContaining({ where: { id: oneriId, dosyaId, silindiAt: null } }))
    expect(m.aktivite).toHaveBeenCalledWith({ data: expect.objectContaining({ eylem: 'Kişisel veri gösterildi: Karşı taraf plaka (öneri)' }) })
  })
})
