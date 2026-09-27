/**
 * S07 · Yeniden çıkarım koruması (F13; B36, B37) — lib/konsrucu/cikarim-birlestir + aiCikar.
 * Kabul: dolu alan ezilmez (farklı değer öneri olur), cikarimJson'daki tevzi/dayanak korunur, borçlu silinmez,
 * AI dekontu ödeme ve faiz başlangıcı olmaz (öneri olur). Veriler kurgusaldır; kişisel veri yok.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  cikarimBirlestir, onerileriOku, alanOnerisiniKaldir, dekontOnerisiniKaldir, ayniDeger, dekontAnahtari,
  type BirlestirGirdi,
} from '@/lib/konsrucu/cikarim-birlestir'

type B = { adUnvan: string; tcVkn?: string | null; teyit?: string }
const SIMDI = new Date('2026-09-27T10:00:00.000Z')

/** Boş dosya + boş AI sonucu; testler yalnız ilgilendiği alanı doldurur. */
function girdi(p: { mevcut?: Partial<BirlestirGirdi<B>['mevcut']>; ai?: Partial<BirlestirGirdi<B>['ai']> } = {}): BirlestirGirdi<B> {
  return {
    mevcut: { alanlar: {}, cikarimJson: null, borclular: [], odemeler: [], ...p.mevcut },
    ai: { alanlar: {}, analiz: {}, borclular: [], dekontlar: [], ...p.ai },
    simdi: SIMDI,
  }
}

describe('alanlar — yalnız boş alan yazılır', () => {
  it('boş alana AI değeri yazılır', () => {
    const r = cikarimBirlestir(girdi({ ai: { alanlar: { sigortaliPlaka: '34 KRG 001', asilAlacak: 12000 } } as never }))
    expect(r.yazilacak).toEqual({ sigortaliPlaka: '34 KRG 001', asilAlacak: 12000 })
    expect(r.oneriler).toEqual([])
    expect(r.degisti).toBe(true)
  })

  it('avukatın düzelttiği asıl alacak EZİLMEZ; farklı AI değeri öneri olur (alan, mevcut, önerilen, zaman)', () => {
    const r = cikarimBirlestir(girdi({ mevcut: { alanlar: { asilAlacak: 10000 } }, ai: { alanlar: { asilAlacak: 12000 } } as never }))
    expect(r.yazilacak).toEqual({})
    expect(r.oneriler).toEqual([{ alan: 'asilAlacak', mevcut: 10000, onerilen: 12000, zaman: SIMDI.toISOString() }])
    expect(r.degisti).toBe(false)
    expect(onerileriOku(r.cikarimJson).alanlar).toHaveLength(1)
  })

  it('aynı değer (büyük/küçük harf, boşluk, kuruş farkı yok) öneri üretmez', () => {
    const r = cikarimBirlestir(girdi({
      mevcut: { alanlar: { sigortaliPlaka: '34 KRG 001', asilAlacak: '1500.00', il: 'İstanbul' } },
      ai: { alanlar: { sigortaliPlaka: '34krg001', asilAlacak: 1500, il: 'istanbul' } } as never,
    }))
    expect(r.yazilacak).toEqual({})
    expect(r.oneriler).toEqual([])
    expect(r.cikarimJson.oneriler).toBeUndefined()
  })

  it('AI boş döndürdüğü alana dokunmaz', () => {
    const r = cikarimBirlestir(girdi({ mevcut: { alanlar: { kazaYeri: 'Kurgusal İlçe' } }, ai: { alanlar: { kazaYeri: '  ', brans: null } } as never }))
    expect(r.yazilacak).toEqual({})
    expect(r.oneriler).toEqual([])
  })

  it('yol farklıysa öneri olur ve güven/gerekçe öneriye eklenir; aynıysa güven/gerekçe tazelenir', () => {
    const farkli = cikarimBirlestir(girdi({ mevcut: { alanlar: { yol: 'KLASIK' } }, ai: { alanlar: { yol: 'IDARI' }, yolGuven: 0.8, yolNeden: 'Kurgusal gerekçe' } as never }))
    expect(farkli.yazilacak).toEqual({})
    expect(farkli.oneriler[0]).toMatchObject({ alan: 'yol', mevcut: 'KLASIK', onerilen: 'IDARI', ek: { yolGuven: 0.8, yolNeden: 'Kurgusal gerekçe' } })

    const ayni = cikarimBirlestir(girdi({ mevcut: { alanlar: { yol: 'KLASIK' } }, ai: { alanlar: { yol: 'KLASIK' }, yolGuven: 0.9, yolNeden: 'Yeni gerekçe' } as never }))
    expect(ayni.yazilacak).toEqual({ yolGuven: 0.9, yolNeden: 'Yeni gerekçe' })
    expect(ayni.degisti).toBe(false) // yalnız AI'ın kendi bilgisi tazelendi → onay düşmez
  })

  it('UYAP takip açıklaması (cikarimJson.aciklama) doluysa korunur, farklı AI metni öneri olur', () => {
    const r = cikarimBirlestir(girdi({
      mevcut: { cikarimJson: { aciklama: 'Avukatın düzelttiği açıklama' } },
      ai: { alanlar: { aciklama: 'AI açıklaması' } } as never,
    }))
    expect(r.cikarimJson.aciklama).toBe('Avukatın düzelttiği açıklama')
    expect(r.oneriler).toEqual([{ alan: 'aciklama', mevcut: 'Avukatın düzelttiği açıklama', onerilen: 'AI açıklaması', zaman: SIMDI.toISOString() }])
    const bos = cikarimBirlestir(girdi({ mevcut: { cikarimJson: {} }, ai: { alanlar: { aciklama: 'AI açıklaması' } } as never }))
    expect(bos.cikarimJson.aciklama).toBe('AI açıklaması')
    expect(bos.yazilacak).toEqual({}) // açıklama kolon değil, cikarimJson'a yazılır
    expect(bos.degisti).toBe(true)
  })
})

describe('cikarimJson — birleştirilir, baştan yazılmaz', () => {
  const eski = {
    tevzi: { birimAdi: 'Kurgusal İcra Dairesi', dosyaAcilisTarihi: '2026-09-01' },
    dayanakFotoIds: ['belge-1', 'belge-2'],
    alanlar: { plaka: ['34 KRG 001'] },
    ozelAnahtar: { korunur: true },
    olayTuru: 'eski olay türü',
    teyit: [{ not: 'eski risk', tip: 'uyari' }],
    onay: { ok: true, kim: 'Kurgusal Avukat', tarih: '2026-09-20T00:00:00.000Z' },
  }

  it('tevzi, dayanak fotoğrafları ve bilinmeyen anahtarlar yerinde; AI analiz anahtarları tazelenir', () => {
    const r = cikarimBirlestir(girdi({ mevcut: { cikarimJson: eski }, ai: { analiz: { olayTuru: 'yeni olay türü', teyit: [], sonrakiAdimlar: ['Kurgusal adım'], olayBaglami: null } } }))
    expect(r.cikarimJson.tevzi).toEqual(eski.tevzi)
    expect(r.cikarimJson.dayanakFotoIds).toEqual(eski.dayanakFotoIds)
    expect(r.cikarimJson.alanlar).toEqual(eski.alanlar)
    expect(r.cikarimJson.ozelAnahtar).toEqual({ korunur: true })
    expect(r.cikarimJson.olayTuru).toBe('yeni olay türü')
    expect(r.cikarimJson.teyit).toEqual([])
    expect(r.cikarimJson.sonrakiAdimlar).toEqual(['Kurgusal adım'])
    expect('olayBaglami' in r.cikarimJson).toBe(false) // AI döndürmediyse eski (yok) kalır, null yazılmaz
  })

  it('veri değişmediyse avukat onayı korunur; alan yazıldıysa ya da borçlu eklendiyse düşer', () => {
    expect(cikarimBirlestir(girdi({ mevcut: { cikarimJson: eski } })).cikarimJson.onay).toEqual(eski.onay)
    expect(cikarimBirlestir(girdi({ mevcut: { cikarimJson: eski }, ai: { alanlar: { karsiPlaka: '06 KRG 002' } } as never })).cikarimJson.onay).toBeUndefined()
    expect(cikarimBirlestir(girdi({ mevcut: { cikarimJson: eski }, ai: { borclular: [{ adUnvan: '[Kurgusal Borçlu 2]' }] } })).cikarimJson.onay).toBeUndefined()
  })

  it('girdi nesnesi değiştirilmez (saf)', () => {
    const kopya = JSON.parse(JSON.stringify(eski))
    cikarimBirlestir(girdi({ mevcut: { cikarimJson: eski }, ai: { alanlar: { karsiPlaka: '06 KRG 002' }, dekontlar: [{ tarih: '2026-01-15', tutar: 500 }] } as never }))
    expect(eski).toEqual(kopya)
  })

  it('eski öneri: AI aynı alanı yeniden döndürürse tazelenir, döndürmezse kalır', () => {
    const cj = { oneriler: { alanlar: [
      { alan: 'asilAlacak', mevcut: 10000, onerilen: 11000, zaman: '2026-09-01T00:00:00.000Z' },
      { alan: 'kusurDurumu', mevcut: '%50', onerilen: '%100', zaman: '2026-09-01T00:00:00.000Z' },
    ], dekontlar: [] } }
    const r = cikarimBirlestir(girdi({ mevcut: { alanlar: { asilAlacak: 10000, kusurDurumu: '%50' }, cikarimJson: cj }, ai: { alanlar: { asilAlacak: 12000 } } as never }))
    const o = onerileriOku(r.cikarimJson).alanlar
    expect(o.find((x) => x.alan === 'kusurDurumu')?.onerilen).toBe('%100')
    expect(o.find((x) => x.alan === 'asilAlacak')?.onerilen).toBe(12000)
    expect(o).toHaveLength(2)
  })
})

describe('borçlular — hiçbiri silinmez', () => {
  const mevcut = [
    { adUnvan: '[Kurgusal Borçlu 1]', tcVkn: null },
    { adUnvan: '[Kurgusal Borçlu 3]', tcVkn: '1234567890' },
  ]
  it('mevcutla (ad ya da VKN) eşleşen AI borçlusu eklenmez; yenisi eklenir; AI içi mükerrer tek sayılır', () => {
    const r = cikarimBirlestir(girdi({
      mevcut: { borclular: mevcut },
      ai: { borclular: [
        { adUnvan: '[kurgusal borçlu 1]' },
        { adUnvan: '[Kurgusal Borçlu 3 Ltd]', tcVkn: '1234567890' },
        { adUnvan: '[Kurgusal Borçlu 2]', teyit: 'TEYIT_EDILDI' },
        { adUnvan: '[Kurgusal  Borçlu 2]' },
        { adUnvan: '   ' },
      ] },
    }))
    expect(r.yeniBorclular.map((b) => b.adUnvan)).toEqual(['[Kurgusal Borçlu 2]'])
  })
  it('AI hiç borçlu döndürmezse liste değişmez', () => {
    expect(cikarimBirlestir(girdi({ mevcut: { borclular: mevcut } })).yeniBorclular).toEqual([])
  })
})

describe('dekontlar — ödeme olmaz, öneri olur', () => {
  it('AI dekontu öneri listesine gider; mevcut ödemeyle aynı gün+tutar olan önerilmez; AI içi mükerrer tek', () => {
    const r = cikarimBirlestir(girdi({
      mevcut: { odemeler: [{ tarih: new Date('2026-01-10T00:00:00.000Z'), tutar: 5000 }] },
      ai: { dekontlar: [
        { tarih: new Date('2026-01-10T00:00:00.000Z'), tutar: new Prisma.Decimal(5000) },
        { tarih: new Date('2026-02-01T00:00:00.000Z'), tutar: 7000, haricMi: false, aciklama: 'Kurgusal havale' },
        { tarih: '2026-02-01', tutar: '7000.00' },
        { tarih: '2026-02-05', tutar: 350, haricMi: true },
        { tarih: null, tutar: 0 },
      ] },
    }))
    expect(r.dekontOnerileri.map((d) => [d.tarih, d.tutar, d.haricMi])).toEqual([['2026-02-01', 7000, false], ['2026-02-05', 350, true]])
    expect(r.dekontOnerileri[0].anahtar).toBe(dekontAnahtari('2026-02-01', 7000))
    expect(onerileriOku(r.cikarimJson).dekontlar).toHaveLength(2)
    expect(r.degisti).toBe(false) // dekont önerisi veri değişikliği değildir
  })
  it('bekleyen dekont önerisi tekrar eklenmez; bu arada elle ödemeye girmişse listeden düşer', () => {
    const cj = { oneriler: { alanlar: [], dekontlar: [
      { anahtar: dekontAnahtari('2026-02-01', 7000), tarih: '2026-02-01', tutar: 7000, haricMi: false, aciklama: null, zaman: 'z' },
      { anahtar: dekontAnahtari('2026-03-01', 900), tarih: '2026-03-01', tutar: 900, haricMi: false, aciklama: null, zaman: 'z' },
    ] } }
    const r = cikarimBirlestir(girdi({
      mevcut: { cikarimJson: cj, odemeler: [{ tarih: '2026-03-01', tutar: 900 }] },
      ai: { dekontlar: [{ tarih: '2026-02-01', tutar: 7000 }] },
    }))
    expect(r.dekontOnerileri).toEqual([])
    expect(onerileriOku(r.cikarimJson).dekontlar.map((d) => d.tarih)).toEqual(['2026-02-01'])
  })
})

describe('öneri listesi yardımcıları', () => {
  it('onerileriOku bozuk kayıtları atlar', () => {
    const o = onerileriOku({ oneriler: { alanlar: [{ alan: 'yokAlan', mevcut: 1, onerilen: 2 }, { alan: 'il', mevcut: '', onerilen: 'X' }, 'bozuk'], dekontlar: [{ tutar: -5 }, null] } })
    expect(o).toEqual({ alanlar: [], dekontlar: [] })
    expect(onerileriOku(null)).toEqual({ alanlar: [], dekontlar: [] })
  })
  it('kaldırma öteki anahtarları korur; liste boşalınca oneriler anahtarı silinir', () => {
    const cj = { tevzi: { birimAdi: 'Kurgusal' }, oneriler: { alanlar: [{ alan: 'il', mevcut: 'A', onerilen: 'B', zaman: 'z' }], dekontlar: [{ anahtar: 'k', tarih: null, tutar: 10, haricMi: false, aciklama: null, zaman: 'z' }] } }
    const a = alanOnerisiniKaldir(cj, 'il')
    expect(a.tevzi).toEqual(cj.tevzi)
    expect(onerileriOku(a).alanlar).toEqual([])
    const b = dekontOnerisiniKaldir(a, 'k')
    expect(b.oneriler).toBeUndefined()
    expect(b.tevzi).toEqual(cj.tevzi)
  })
  it('ayniDeger para alanında kuruş, metinde harf/boşluk duyarsız', () => {
    expect(ayniDeger('asilAlacak', '1500.004', 1500)).toBe(true)
    expect(ayniDeger('asilAlacak', 1500, 1500.5)).toBe(false)
    expect(ayniDeger('sigortaliPlaka', '34 krg 001', '34KRG001')).toBe(true)
  })
})

// ───────────────── aiCikar (server action) — birleştirici gerçekten kullanılıyor mu ─────────────────

const m = vi.hoisted(() => ({
  getUser: vi.fn(), kullanici: vi.fn(), dosyaBul: vi.fn(), dosyaGuncelle: vi.fn(), borcluSil: vi.fn(), aktivite: vi.fn(),
  ayarlar: vi.fn(), transaction: vi.fn(), analizEt: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'kurgusal-musteri' }) }) }))
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`) } }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: m.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ download: vi.fn() }) } }) }))
vi.mock('@/lib/konsrucu/analiz', () => ({ analizEt: m.analizEt, enIyiHasarFotolari: vi.fn() }))
vi.mock('@/lib/konsrucu/ai-kredi', () => ({ dosyaLimitKontrol: vi.fn() }))
vi.mock('@/lib/konsrucu/mentor-kural', () => ({ mentorKurallariOku: vi.fn(async () => []), mentorKurallariMetne: () => '' }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    kullanici: { findUnique: m.kullanici },
    rucuDosyasi: { findUnique: m.dosyaBul, update: m.dosyaGuncelle },
    borclu: { deleteMany: m.borcluSil },
    aktivite: { create: m.aktivite },
    ayarlar: { findUnique: m.ayarlar },
    $transaction: m.transaction,
  },
}))
import { aiCikar } from '@/app/(app)/akilli-giris/actions'

/** Her testte taze kayıt (Decimal örneği structuredClone'da prototipini kaybeder). */
const kurgusalDosya = () => ({
  musteriId: 'kurgusal-musteri', durum: 'INCELENIYOR',
  yol: 'KLASIK', brans: 'KASKO', sigortaliUnvan: null, sigortaliTelefon: null, sigortaliPlaka: null, karsiPlaka: null,
  il: null, kazaYeri: null, olusSekli: null, kusurDurumu: null,
  asilAlacak: new Prisma.Decimal(10000), // avukat elle düzeltti
  rucuTutari: null, rucuOrani: null, yetkiliIcra: null, muhatapOzet: null,
  cikarimJson: {
    tevzi: { birimAdi: 'Kurgusal İcra Dairesi' }, dayanakFotoIds: ['belge-1'],
    aciklama: 'Avukatın düzelttiği açıklama', onay: { ok: true, kim: 'Kurgusal Avukat' },
  },
  belgeler: [{ extractedText: 'Kurgusal kaza tespit tutanağı metni.', kategori: 'TUTANAK', dosyaAdi: 'tutanak.pdf', storagePath: '' }],
  borclular: [{ adUnvan: '[Kurgusal Borçlu 1]', tcVkn: null, teyitDurumu: 'TEYIT_GEREK' }], // elle eklenmiş, teyitsiz
  odemeler: [],
})
const KURGUSAL_ANALIZ = {
  yol: 'klasik', yolGuven: 0.9, yolNeden: 'Kurgusal gerekçe', brans: 'KASKO', olayTuru: 'kurgusal', olayBaglami: 'Kurgusal bağlam',
  sigortaliPlaka: '34 KRG 001', asilAlacak: 12000, aciklama: 'AI açıklaması', teyit: [], sonrakiAdimlar: [],
  borclular: [{ adUnvan: '[Kurgusal Borçlu 1]', rol: 'SURUCU', teyit: 'TEYIT_GEREK' }, { adUnvan: '[Kurgusal Borçlu 2]', rol: 'ARAC_SAHIBI', teyit: 'TEYIT_EDILDI' }],
  dekontlar: [{ tarih: '2026-01-15', tutar: 12000 }],
}

describe('aiCikar — S07 koruması uçtan uca (mock DB)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.getUser.mockResolvedValue({ data: { user: { id: 'kurgusal-avukat' } } })
    m.kullanici.mockResolvedValue({ id: 'kurgusal-avukat', ad: 'Kurgusal Avukat', rol: 'AVUKAT', aktif: true, musteriler: [{ musteriId: 'kurgusal-musteri' }] })
    m.dosyaBul.mockResolvedValue(kurgusalDosya())
    m.ayarlar.mockResolvedValue(null)
    m.analizEt.mockResolvedValue(structuredClone(KURGUSAL_ANALIZ))
    m.dosyaGuncelle.mockReturnValue('guncelle')
    m.aktivite.mockReturnValue('aktivite')
    m.transaction.mockResolvedValue([])
  })

  it('düzeltilen tutarı korur, boş alanı doldurur, borçlu silmez, dekontu ödemeye yazmaz, tevziyi korur', async () => {
    const r = await aiCikar('kurgusal-dosya')
    expect(r.ok).toBe(true)
    expect(m.borcluSil).not.toHaveBeenCalled()
    expect(m.transaction).toHaveBeenCalledWith(['guncelle', 'aktivite'])

    const data = m.dosyaGuncelle.mock.calls[0][0].data
    expect(data.asilAlacak).toBeUndefined() // 10.000 korunur
    expect(data.sigortaliPlaka).toBe('34 KRG 001') // boştu → yazıldı
    expect(data.yol).toBeUndefined() // aynı yol, yeniden yazılmaz
    expect(data.odemeler).toBeUndefined() // AI dekontu Odeme olmaz
    expect('faizBaslangic' in data).toBe(false) // faiz başlangıcı değişmez

    const cj = data.cikarimJson
    expect(cj.tevzi).toEqual({ birimAdi: 'Kurgusal İcra Dairesi' })
    expect(cj.dayanakFotoIds).toEqual(['belge-1'])
    expect(cj.aciklama).toBe('Avukatın düzelttiği açıklama')
    expect(cj.onay).toBeUndefined() // plaka yazıldı → onay düştü
    const o = onerileriOku(cj)
    expect(o.alanlar.map((x) => [x.alan, x.mevcut, x.onerilen])).toEqual([['asilAlacak', 10000, 12000], ['aciklama', 'Avukatın düzelttiği açıklama', 'AI açıklaması']])
    expect(o.dekontlar.map((d) => [d.tarih, d.tutar])).toEqual([['2026-01-15', 12000]])

    // yalnız eşleşmeyen borçlu eklenir ve TEYİTSİZ eklenir (AI "TEYIT_EDILDI" dese de)
    expect(data.borclular.create).toEqual([expect.objectContaining({ adUnvan: '[Kurgusal Borçlu 2]', teyitDurumu: 'TEYIT_GEREK' })])

    const akt = m.aktivite.mock.calls[0][0].data
    expect(akt.eylem).toContain('öneri listesinde')
    expect(akt.detayJson).toMatchObject({ tur: 'AI_CIKARIM_BIRLESTIR', yazilan: ['sigortaliPlaka'], oneriAlanlari: ['asilAlacak', 'aciklama'], dekontOnerisi: 1, yeniBorclu: 1 })
  })

  it('başka müvekkilin dosyasına yazmaz', async () => {
    m.dosyaBul.mockResolvedValue({ ...kurgusalDosya(), musteriId: 'baska-musteri' })
    expect((await aiCikar('kurgusal-dosya')).ok).toBe(false)
    expect(m.analizEt).not.toHaveBeenCalled()
    expect(m.transaction).not.toHaveBeenCalled()
  })
})
