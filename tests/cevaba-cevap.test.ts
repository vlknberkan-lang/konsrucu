import { describe, expect, it, vi } from 'vitest'
import { aiOturumu, type AiYanit } from '@/lib/ai/cagri'
import type { BelgeMetni } from '@/lib/konsrucu/dilekce-v2/alinti'
import { aciklamaParagraflariniUret } from '@/lib/konsrucu/dilekce-v2/paragraf'
import { savunmaIsaretle, savunmaMatrisiKur, type AiSavunma } from '@/lib/konsrucu/dilekce-v2/savunma-matrisi'
import type { SavunmaSatiri } from '@/lib/konsrucu/dilekce-v2/tipler'
import { cevabaCevapUygunMu, cevaplanacakBaglam } from '@/lib/konsrucu/dilekce-v2/turler/cevaba-cevap'

// Kurgusal cevap dilekçesi (gerçek kişi, dosya no yok) — S39 kabul 1: "SEN-01'in kurgusal cevap
// dilekçesinden savunma matrisi (sayfa atıflı); 3 savunmayı 'cevaplanacak' işaretle."
const cevapBelgeId = 'b-cevap-1'
const cevapBelgesi: BelgeMetni = {
  belgeId: cevapBelgeId,
  ad: 'Cevap dilekçesi.pdf',
  sayfalar: [
    { sayfaNo: 1, metin: 'DAVALI CEVAPLARI\nÖncelikle husumet itirazımızı bildiririz; müvekkilimiz doğru taraf değildir.' },
    { sayfaNo: 2, metin: 'Talep zamanaşımına uğramıştır, TBK m.72 uyarınca zamanaşımı def\'imizi ileri sürüyoruz.' },
    { sayfaNo: 3, metin: 'Kaza tamamen karşı sürücünün kusuruyla meydana gelmiştir; müvekkilimizin kusuru bulunmamaktadır.' },
    { sayfaNo: 4, metin: 'Talep edilen tutar likit değildir; alacak belirsizdir ve hesap yöntemi tartışmalıdır.' },
  ],
}
const belgeler = new Map([[cevapBelgeId, cevapBelgesi]])

const aiSavunmalar: AiSavunma[] = [
  { baslik: 'Husumet itirazı', konu: 'HUSUMET', belgeId: cevapBelgeId, sayfa: 1, alinti: 'müvekkilimiz doğru taraf değildir' },
  { baslik: 'Zamanaşımı def\'i', konu: 'ZAMANASIMI', belgeId: cevapBelgeId, sayfa: 2, alinti: 'zamanaşımı def\'imizi ileri sürüyoruz' },
  { baslik: 'Kusur itirazı', konu: 'KUSUR', belgeId: cevapBelgeId, sayfa: 3, alinti: 'müvekkilimizin kusuru bulunmamaktadır' },
  { baslik: 'Likidite itirazı', konu: 'LIKIDITE', belgeId: cevapBelgeId, sayfa: 4, alinti: 'alacak belirsizdir ve hesap yöntemi tartışmalıdır' },
  // Cevap dilekçesinde geçmeyen, kurgusal/uydurma bir "savunma" — sayfa atfı doğrulanamadığı için matrise girmemeli.
  { baslik: 'Uydurma savunma', konu: 'GOREV_YETKI', belgeId: cevapBelgeId, sayfa: 1, alinti: 'bu cümle cevap dilekçesinde hiç geçmiyor' },
]

const avukat = { kullaniciId: 'avukat-1', at: '2026-09-27T10:00:00.000Z' }

function matrisKurVeIsaretle(): SavunmaSatiri[] {
  const { satirlar, kaynaksiz } = savunmaMatrisiKur(aiSavunmalar, belgeler)
  expect(satirlar).toHaveLength(4) // uydurma savunma kaynaksız düştü
  expect(kaynaksiz).toHaveLength(1)
  // Avukat 3 savunmayı "cevaplanacak", birini "önemsiz" işaretler.
  let s = satirlar
  for (const id of ['S-1', 'S-2', 'S-3']) s = savunmaIsaretle(s, id, 'CEVAPLANACAK', avukat.kullaniciId, avukat.at)!
  s = savunmaIsaretle(s, 'S-4', 'ONEMSIZ', avukat.kullaniciId, avukat.at)!
  return s
}

describe('savunma matrisi: sayfa atıflı çıkarım (S39 kabul 1)', () => {
  it('her savunma cevap dilekçesindeki gerçek sayfaya atıflıdır; uydurma savunma kaynaksız düşer', () => {
    const { satirlar, kaynaksiz } = savunmaMatrisiKur(aiSavunmalar, belgeler)
    expect(satirlar.map((s) => s.sayfa)).toEqual([1, 2, 3, 4])
    expect(satirlar.map((s) => s.konu)).toEqual(['HUSUMET', 'ZAMANASIMI', 'KUSUR', 'LIKIDITE'])
    expect(kaynaksiz[0].metin).toBe('Savunma: Uydurma savunma')
  })

  it('avukat 3 savunmayı "cevaplanacak" işaretler; kalanı "önemsiz" olarak kalır', () => {
    const s = matrisKurVeIsaretle()
    expect(s.filter((x) => x.isaret === 'CEVAPLANACAK')).toHaveLength(3)
    expect(s.find((x) => x.id === 'S-4')?.isaret).toBe('ONEMSIZ')
  })
})

describe('cevaplanacakBaglam (S39 kabul 2: yalnız işaretli savunmalar)', () => {
  it('yalnız "cevaplanacak" işaretli savunmaları döndürür; "önemsiz" ve işaretsiz olanları hariç tutar', () => {
    const s = matrisKurVeIsaretle()
    const baglam = cevaplanacakBaglam(s)
    expect(baglam.map((b) => b.id)).toEqual(['S-1', 'S-2', 'S-3'])
    expect(baglam.every((b) => 'alinti' in b && 'baslik' in b && 'konu' in b)).toBe(true)
    expect(baglam.find((b) => b.id === 'S-4')).toBeUndefined()
  })

  it('hiç savunma işaretlenmemişse boş bağlam döner', () => {
    const { satirlar } = savunmaMatrisiKur(aiSavunmalar, belgeler)
    expect(cevaplanacakBaglam(satirlar)).toEqual([])
  })
})

describe('usul süzgeci: yalnız yazılı usulde cevaba cevap (S39 kabul 3)', () => {
  it('basit usulde (SEN-02) cevaba cevap önerilmez/üretilmez; HMK 317 gerekçesiyle', () => {
    const r = cevabaCevapUygunMu('BASIT')
    expect(r.uygun).toBe(false)
    expect(r.neden).toMatch(/HMK 317/)
  })
  it('yazılı usulde ya da usul henüz kayıtlı değilken engellenmez', () => {
    expect(cevabaCevapUygunMu('YAZILI')).toEqual({ uygun: true, neden: null })
    expect(cevabaCevapUygunMu(null)).toEqual({ uygun: true, neden: null })
  })
})

describe('paragraf.ts: AÇIKLAMALAR üretimine yalnız işaretli savunmalar gider', () => {
  it('cevaplanacakSavunmalar verilince sistem talimatı genişler ve JSON gövdesine eklenir', async () => {
    const oturum = aiOturumu({ yuzey: 'dilekce' })
    const iste = vi.fn(async (_istek: unknown): Promise<AiYanit> => ({
      metin: '', maskeliMetin: '', kesildi: false, acilamayanJetonlar: [], sayim: {},
      aracGirdisi: { paragraflar: [{ yuvaId: 'B04#1', metin: '1. Karşı tarafın zamanaşımı def\'i yerinde değildir [O-1].' }] },
    }))
    oturum.iste = iste as unknown as typeof oturum.iste

    const baglam = cevaplanacakBaglam(matrisKurVeIsaretle())
    await aciklamaParagraflariniUret({
      oturum, tur: 'CEVABA_CEVAP', uslupEki: null,
      yuvalar: [{ id: 'B04#1', talimat: 'Savunmalara karşılık ver.' }],
      olgular: [{ id: 'O-1', metin: 'Ödeme 10.01.2026 tarihinde yapılmıştır.' }],
      cevaplanacakSavunmalar: baglam,
    })

    expect(iste).toHaveBeenCalledTimes(1)
    const istek = iste.mock.calls[0][0] as { sistem: string; icerik: { tur: string; veri: unknown }[] }
    expect(istek.sistem).toMatch(/cevaplanacakSavunmalar/)
    const veri = istek.icerik.find((c) => c.tur === 'json')!.veri as { cevaplanacakSavunmalar?: unknown[] }
    expect(veri.cevaplanacakSavunmalar).toHaveLength(3)
  })

  it('cevaplanacakSavunmalar verilmezse (ör. DAVA türü) JSON gövdesine hiç girmez, sistem tabanı değişmez', async () => {
    const oturum = aiOturumu({ yuzey: 'dilekce' })
    const iste = vi.fn(async (_istek: unknown): Promise<AiYanit> => ({
      metin: '', maskeliMetin: '', kesildi: false, acilamayanJetonlar: [], sayim: {},
      aracGirdisi: { paragraflar: [{ yuvaId: 'B05#1', metin: '1. Sigortalı şirket halef olmuştur [O-1].' }] },
    }))
    oturum.iste = iste as unknown as typeof oturum.iste

    await aciklamaParagraflariniUret({
      oturum, tur: 'DAVA', uslupEki: null,
      yuvalar: [{ id: 'B05#1', talimat: 'Olayı anlat.' }],
      olgular: [{ id: 'O-1', metin: 'Ödeme yapılmıştır.' }],
    })

    const istek = iste.mock.calls[0][0] as { sistem: string; icerik: { tur: string; veri: unknown }[] }
    expect(istek.sistem).not.toMatch(/cevaplanacakSavunmalar/)
    const veri = istek.icerik.find((c) => c.tur === 'json')!.veri as Record<string, unknown>
    expect('cevaplanacakSavunmalar' in veri).toBe(false)
  })
})
