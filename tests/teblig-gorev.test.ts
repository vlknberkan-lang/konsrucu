/**
 * Tebliğ süre görevleri regresyonları (Prisma mock'lu) — İİK m.78 haciz görevi üretimi + kapanış:
 *   • Kapanmış dosyada (durum/UYAP) görev ÜRETİLMEZ (2026-07-11'de 49 yanlış görev iptal edilmişti).
 *   • İtiraz penceresi (m.62) görevi artık üretilmez; yalnız HACİZ görevi doğar.
 *   • Vade = tebliğ + 1 yıl − 30 gün; başlıkta gerçek son gün; 29 Şubat → 28 Şubat (İİK m.19).
 *   • "En erken tebliğ": dosyada vadesi erken/aynı günlü ACIK/ISLEMDE/TAMAMLANDI İİK 78 görevi varsa yenisi
 *     açılmaz; IPTAL görev sayılmaz.
 *   • İTİRAZ GÖREVİ İPTAL ETMEZ (Faz 1 inceleme ENGELLEYİCİ): görev açık kalır, açıklamaya + aktiviteye
 *     "süre işlemiyor olabilir, İİK 67'yi kontrol edin" notu düşer; itiraz varken de görev açılır (notla).
 *   • HACIZ olayı HİÇBİR görevi kapatmaz (dosya alacağına / ihtiyati haciz olabilir — denetim B23/B24).
 *   • İADE / bila tebliğ / tebligat talebi gerçek tebliğ sayılmaz; TK 21/35 pozitif ifadesi üstündür.
 * Sondaki uçtan uca senaryolar takipOlayKaydet'i GERÇEK görev kancalarıyla ve GERÇEK borcaItirazMi ile,
 * bellek içi sahte Prisma üzerinde çalıştırır (D1/D2 benzeri; uydurma veri, kişisel veri yok).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rucuDosyasi: { findUnique: vi.fn(), update: vi.fn() },
    kullanici: { findFirst: vi.fn() },
    takipGorevi: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    takipOlayi: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    asama: { findMany: vi.fn() },
    aktivite: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
// Önemli Olay: borcaItirazMi GERÇEK (saf), yalnız kuyruk yazımı sahte → yan etki sayısı doğrulanır.
vi.mock('@/lib/konsrucu/onemli-olay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/konsrucu/onemli-olay')>()),
  onemliOlayTespit: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import {
  tebligGorevleriOlustur, tebligGorevleriKapat, gercekTebligMi, kismiItirazMi, kesinlesmeMetniMi, hacizSonGun, itirazNotu,
  HACIZ_GOREV_ONEK, ITIRAZ_GOREV_ONEK, HACIZ_UYARI_ERKEN_GUN, ITIRAZ_NOT_ISARETI,
} from '@/lib/konsrucu/teblig-gorev'
import { takipOlayKaydet } from '@/lib/konsrucu/takip-olay'
import { onemliOlayTespit } from '@/lib/konsrucu/onemli-olay'
import { tarihTR } from '@/lib/konsrucu/format'
import { isoGundenTarih } from '@/lib/konsrucu/sure/takvim'
const ist2 = (s: string) => isoGundenTarih(s)!.getTime()

const findUnique = vi.mocked(prisma.rucuDosyasi.findUnique)
const gorevFindFirst = vi.mocked(prisma.takipGorevi.findFirst)
const gorevFindMany = vi.mocked(prisma.takipGorevi.findMany)
const gorevCreate = vi.mocked(prisma.takipGorevi.create)
const gorevUpdate = vi.mocked(prisma.takipGorevi.update)
const updateMany = vi.mocked(prisma.takipGorevi.updateMany)
const olayFindMany = vi.mocked(prisma.takipOlayi.findMany)
const olayFindFirst = vi.mocked(prisma.takipOlayi.findFirst)
const aktiviteCreate = vi.mocked(prisma.aktivite.create)
const onemliTespit = vi.mocked(onemliOlayTespit)

const aktifDosya = { musteriId: 'm1', atananKullaniciId: 'u1', durum: 'TEBLIG_EDILDI', uyapDurum: 'Açık' }
const UYAP = { kaynak: 'uyap' }

beforeEach(() => {
  vi.resetAllMocks() // uçtan uca senaryolar implementasyon değiştirir — her testte sıfırdan
  gorevFindFirst.mockResolvedValue(null as never)
  gorevFindMany.mockResolvedValue([] as never)
  olayFindMany.mockResolvedValue([] as never)
  olayFindFirst.mockResolvedValue(null as never)
  updateMany.mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.asama.findMany).mockResolvedValue([] as never)
})

describe('tebligGorevleriOlustur', () => {
  it('kapanmış dosyada (durum TAHSIL) görev üretmez', async () => {
    findUnique.mockResolvedValueOnce({ ...aktifDosya, durum: 'TAHSIL' } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(gorevCreate).not.toHaveBeenCalled()
  })

  it('UYAP "Kapalı" diyorsa görev üretmez (durum güncel olmasa bile)', async () => {
    findUnique.mockResolvedValueOnce({ ...aktifDosya, uyapDurum: 'İnfazen kapandı' } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(gorevCreate).not.toHaveBeenCalled()
  })

  it('aktif dosyada YALNIZ haciz görevi doğar; itiraz penceresi üretilmez; başlık "haciz isteme hakkı düşer"', async () => {
    findUnique.mockResolvedValueOnce(aktifDosya as never)
    const teblig = new Date(2026, 2, 15) // 15 Mart 2026
    await tebligGorevleriOlustur('d1', teblig, 'u9')
    expect(gorevCreate).toHaveBeenCalledOnce()
    const data = gorevCreate.mock.calls[0][0].data as { baslik: string; aciklama: string; sonTarih: Date; sorumluId: string | null }
    expect(data.baslik.startsWith(HACIZ_GOREV_ONEK)).toBe(true)
    expect(data.baslik.includes(ITIRAZ_GOREV_ONEK)).toBe(false)
    expect(data.baslik).toContain('haciz isteme hakkı düşer')
    expect(data.baslik).not.toContain('takip düşer') // B21: hukuken eksik ifade
    // gerçek son gün = tebliğ + 1 yıl; görev vadesi 30 gün önce
    const hacizSon = new Date(2027, 2, 15)
    expect(data.baslik).toContain(tarihTR(hacizSon))
    const beklenenVade = new Date(hacizSon.getTime() - HACIZ_UYARI_ERKEN_GUN * 86_400_000)
    expect(data.sonTarih.getTime()).toBe(beklenenVade.getTime())
    expect(data.sorumluId).toBe('u1') // dosyanın atananı
    // haciz olayı görevi artık OTOMATİK kapatmıyor — metin bunu vaat etmemeli
    expect(data.aciklama).not.toContain('otomatik kapanır')
    expect(data.aciklama).not.toContain(ITIRAZ_NOT_ISARETI) // itiraz yok → not yok
  })

  it('mükerrer kontrolü AYNI tebliğ günüyle yapılır (önek + vade günü); IPTAL görev sayılmaz', async () => {
    findUnique.mockResolvedValueOnce(aktifDosya as never)
    await tebligGorevleriOlustur('d1', isoGundenTarih('2026-03-15')!, null)
    const vade = new Date(ist2('2027-03-15') - HACIZ_UYARI_ERKEN_GUN * 86_400_000)
    expect(gorevFindFirst).toHaveBeenCalledWith({
      where: {
        dosyaId: 'd1',
        baslik: { startsWith: HACIZ_GOREV_ONEK },
        durum: { in: ['ACIK', 'ISLEMDE', 'TAMAMLANDI'] },
        sonTarih: { gte: vade, lt: new Date(vade.getTime() + 86_400_000) },
      },
      select: { id: true },
    })
  })

  it('dosyada erken/aynı günlü İİK 78 görevi varsa ikinciyi açmaz', async () => {
    findUnique.mockResolvedValueOnce(aktifDosya as never)
    gorevFindFirst.mockResolvedValueOnce({ id: 'g-var' } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(gorevCreate).not.toHaveBeenCalled()
  })

  it('dosyada ITIRAZ olayı varsa görev YİNE açılır, açıklamada itiraz notu olur (m.78/2 — erken hatırlatma güvenli)', async () => {
    findUnique.mockResolvedValueOnce(aktifDosya as never)
    olayFindFirst.mockResolvedValueOnce({ id: 'itiraz-1' } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(olayFindFirst).toHaveBeenCalledWith({ where: { dosyaId: 'd1', tip: 'ITIRAZ' }, select: { id: true } })
    expect(gorevCreate).toHaveBeenCalledOnce()
    const data = gorevCreate.mock.calls[0][0].data as { aciklama: string }
    expect(data.aciklama).toContain(ITIRAZ_NOT_ISARETI)
    expect(data.aciklama).toContain('İİK m.67')
  })

  it.each(['ITIRAZ', 'ARABULUCULUK', 'DAVA'])('itiraz olayı yok ama durum %s → görev açılır, notlu', async (durum) => {
    findUnique.mockResolvedValueOnce({ ...aktifDosya, durum } as never)
    await tebligGorevleriOlustur('d1', new Date(2026, 2, 15), null)
    expect(gorevCreate).toHaveBeenCalledOnce()
    expect((gorevCreate.mock.calls[0][0].data as { aciklama: string }).aciklama).toContain(ITIRAZ_NOT_ISARETI)
  })

  it('29 Şubat tebliğinde son gün 28 Şubat (1 Mart değil — İİK m.19)', async () => {
    findUnique.mockResolvedValueOnce(aktifDosya as never)
    await tebligGorevleriOlustur('d1', new Date(2028, 1, 29), null)
    const data = gorevCreate.mock.calls[0][0].data as { baslik: string }
    expect(data.baslik).toContain(tarihTR(new Date(2029, 1, 28)))
  })
})

describe('hacizSonGun', () => {
  it('tebliğ + 1 yıl; ayın o günü yoksa ayın son günü', () => {
    const ist = (s: string) => isoGundenTarih(s)!.getTime()
    expect(hacizSonGun(isoGundenTarih('2026-03-15')!).getTime()).toBe(ist('2027-03-15'))
    expect(hacizSonGun(isoGundenTarih('2028-02-29')!).getTime()).toBe(ist('2029-02-28'))
    expect(hacizSonGun(isoGundenTarih('2027-02-28')!).getTime()).toBe(ist('2028-02-28'))
  })
  it('İstanbul gece yarısı saklanan tebliğ (UTC 21:00, önceki gün) doğru günden sayılır', () => {
    // 15.03.2026 İstanbul 00:00 = 14.03.2026 21:00 UTC
    expect(hacizSonGun(new Date('2026-03-14T21:00:00Z')).getTime()).toBe(ist2('2027-03-15'))
  })
})

describe('tebligGorevleriKapat — olay tipine göre', () => {
  const onekleri = (i = 0) => {
    const w = updateMany.mock.calls[i][0].where as { OR?: Array<{ baslik: { startsWith: string } }>; baslik?: { startsWith: string } }
    return (w.OR ? w.OR.map((o) => o.baslik.startsWith) : [w.baslik!.startsWith]).sort()
  }

  it('ITIRAZ: itiraz-penceresini kapatır; haciz görevi İPTAL EDİLMEZ, açıklamasına not + aktivite düşer', async () => {
    gorevFindMany.mockResolvedValueOnce([{ id: 'g1', aciklama: 'Ödeme emri tebliğ edildi.' }] as never)
    const tarih = new Date(2026, 0, 15)
    await tebligGorevleriKapat('d1', 'ITIRAZ', { aciklama: 'Borca İtiraz Talebi', tarih, kullaniciId: 'u1' })
    expect(updateMany).toHaveBeenCalledOnce() // yalnız itiraz-penceresi — haciz görevi için updateMany YOK
    expect(onekleri(0)).toEqual([ITIRAZ_GOREV_ONEK])
    expect(gorevFindMany).toHaveBeenCalledWith({
      where: { dosyaId: 'd1', durum: { in: ['ACIK', 'ISLEMDE'] }, baslik: { startsWith: HACIZ_GOREV_ONEK } },
      select: { id: true, aciklama: true },
    })
    expect(gorevUpdate).toHaveBeenCalledOnce()
    const upd = gorevUpdate.mock.calls[0][0] as { where: { id: string }; data: { aciklama: string; durum?: string } }
    expect(upd.where.id).toBe('g1')
    expect(upd.data.durum).toBeUndefined() // durum DEĞİŞMEZ
    expect(upd.data.aciklama.startsWith('Ödeme emri tebliğ edildi.')).toBe(true)
    expect(upd.data.aciklama).toContain(`${ITIRAZ_NOT_ISARETI} (${tarihTR(tarih)})`)
    expect(aktiviteCreate).toHaveBeenCalledOnce()
    const akt = aktiviteCreate.mock.calls[0][0].data as { dosyaId: string; kullaniciId: string | null; eylem: string }
    expect(akt.dosyaId).toBe('d1')
    expect(akt.kullaniciId).toBe('u1')
    expect(akt.eylem).toContain('AÇIK bırakıldı')
    expect(akt.eylem).toContain('İİK m.67')
  })

  it('ITIRAZ: not zaten düşülmüş görev tekrar güncellenmez (idempotent); aktivite yine düşer', async () => {
    gorevFindMany.mockResolvedValueOnce([{ id: 'g1', aciklama: `x\n\n${ITIRAZ_NOT_ISARETI}: …` }] as never)
    await tebligGorevleriKapat('d1', 'ITIRAZ', { aciklama: 'Borca İtiraz Talebi' })
    expect(gorevUpdate).not.toHaveBeenCalled()
    expect(aktiviteCreate).toHaveBeenCalledOnce()
  })

  it('ITIRAZ: açık haciz görevi yoksa yalnız "İİK 67\'yi kontrol edin" aktivitesi düşer', async () => {
    await tebligGorevleriKapat('d1', 'ITIRAZ', { aciklama: null })
    expect(gorevUpdate).not.toHaveBeenCalled()
    expect(aktiviteCreate).toHaveBeenCalledOnce()
    const akt = aktiviteCreate.mock.calls[0][0].data as { eylem: string }
    expect(akt.eylem).toContain('İİK m.67')
    expect(akt.eylem).not.toContain('AÇIK bırakıldı')
  })

  it('KISMİ ITIRAZ: not kısmi olabileceğini söyler; görev yine açık', async () => {
    gorevFindMany.mockResolvedValueOnce([{ id: 'g1', aciklama: null }] as never)
    await tebligGorevleriKapat('d1', 'ITIRAZ', { aciklama: 'Faize İtiraz' })
    const upd = gorevUpdate.mock.calls[0][0] as { data: { aciklama: string } }
    expect(upd.data.aciklama).toContain('KISMİ')
    expect(upd.data.aciklama.startsWith(ITIRAZ_NOT_ISARETI)).toBe(true)
  })

  it('HACIZ hiçbir görevi kapatmaz (dosya alacağına haciz / ihtiyati haciz olabilir)', async () => {
    await tebligGorevleriKapat('d1', 'HACIZ', { aciklama: 'Dosya Alacağına Haciz Ekleme' })
    await tebligGorevleriKapat('d1', 'HACIZ', { aciklama: 'İhtiyati Haciz Kararı' })
    await tebligGorevleriKapat('d1', 'HACIZ')
    expect(updateMany).not.toHaveBeenCalled()
    expect(gorevUpdate).not.toHaveBeenCalled()
  })

  it('KESINLESTI yalnız itiraz-penceresini kapatır (haciz görevi yaşar)', async () => {
    await tebligGorevleriKapat('d1', 'KESINLESTI')
    expect(updateMany).toHaveBeenCalledOnce()
    expect(onekleri()).toEqual([ITIRAZ_GOREV_ONEK])
  })

  it('KAPANDI her iki öneki kapatır', async () => {
    await tebligGorevleriKapat('d1', 'KAPANDI')
    expect(updateMany).toHaveBeenCalledOnce()
    expect(onekleri()).toEqual([HACIZ_GOREV_ONEK, ITIRAZ_GOREV_ONEK].sort())
  })

  it('DURUM/TAHSILAT/TEBLIG hiçbir görevi kapatmaz, not düşmez', async () => {
    await tebligGorevleriKapat('d1', 'DURUM')
    await tebligGorevleriKapat('d1', 'TAHSILAT')
    await tebligGorevleriKapat('d1', 'TEBLIG')
    expect(updateMany).not.toHaveBeenCalled()
    expect(gorevFindMany).not.toHaveBeenCalled()
    expect(aktiviteCreate).not.toHaveBeenCalled()
  })
})

describe('gercekTebligMi — UYAP TEBLIG olayının metni gerçek tebliğ mi?', () => {
  it.each([
    'Tebligat İade',
    'TEBLİGAT İADE MAZBATASI',
    'Bila Tebliğ Mazbatası',
    'BİLA TEBLİĞ',
    'Muhatap adreste bulunamadı, tebliğ edilemedi',
    'Tebliğ imkânsız',
    'Tebligat Talebi',
    'Tebligat çıkarılması talebi',
    'Zarf İade Edildi',
    'Tebliğ Mazbatası (İade)',
  ])('"%s" → gerçek tebliğ DEĞİL', (a) => {
    expect(gercekTebligMi(a)).toBe(false)
  })

  it.each([
    null,
    '',
    'Tebliğ (UYAP)',
    'Tebliğ Mazbatası',
    'Ödeme emri tebliğ edildi',
    'Kapalı E-Tebliğ Mazbatası',
    'TK 21/2 muhtara teslim, haber kâğıdı yapıştırıldı',
    'ziyadesiyle gecikmeli tebliğ', // kelime içi "iade" yanlış negatif üretmez
    // posta TÜRÜ adları iade sonucu değil (eklenti bunları bilerek TEBLIG gönderir)
    'İadeli Taahhütlü Tebligat Mazbatası',
    'İADELİ TAAHHÜTLÜ TEBLİGAT MAZBATASI',
    'İade-i Taahhütlü Tebliğ Mazbatası',
    // "talep" yalnız tebligat talebi olarak dışlanır
    'Tebligat Mazbatası (Talep Üzerine)',
    // TK 21/1: "tebliğ edilemediğinden" geçse de muhtara teslim + kapıya yapıştırma GEÇERLİ tebliğdir
    'Adreste bulunamadığından tebliğ edilemediğinden muhtara teslim, ihbarname kapıya yapıştırıldı',
    'Tebligat Kanunu 35. madde uyarınca tebliğ edildi',
  ])('"%s" → gerçek tebliğ', (a) => {
    expect(gercekTebligMi(a)).toBe(true)
  })
})

describe('kismiItirazMi — kısmi itiraz işaretleri (teyit gerekli)', () => {
  it.each(['KISMİ İTİRAZ', 'Borca kısmi itiraz (faiz)', 'Borca kısmen itiraz', 'Faize İtiraz', 'Faiz Oranına İtiraz', "Fer'ilere itiraz", 'FAİZE VE FERİLERİNE İTİRAZ'])(
    '"%s" → kısmi olabilir',
    (a) => expect(kismiItirazMi(a)).toBe(true),
  )
  it.each(['Borca İtiraz Talebi', 'Takibe İtiraz', null, ''])('"%s" → kısmi değil', (a) => expect(kismiItirazMi(a)).toBe(false))
})

describe('kesinlesmeMetniMi — UYAP KESINLESTI metni', () => {
  it('kayıt / şerh / "takip kesinleşti" gerçek; talep / silme / iptal değil', () => {
    expect(kesinlesmeMetniMi('ÖRNEK KİŞİ Kesinleşme Bilgisi Kaydedildi.')).toBe(true)
    expect(kesinlesmeMetniMi('Kesinleşme Şerhi')).toBe(true)
    expect(kesinlesmeMetniMi('TAKİP KESİNLEŞTİ')).toBe(true)
    expect(kesinlesmeMetniMi('Takibin Kesinleştirilmesi Talebi')).toBe(false)
    expect(kesinlesmeMetniMi('TAKİBİN KESİNLEŞTİRİLMESİ')).toBe(false)
    expect(kesinlesmeMetniMi('Örnek Kişi Kesinleşme Bilgisi Silindi.')).toBe(false)
    expect(kesinlesmeMetniMi('Kesinleşme şerhinin İPTALİ')).toBe(false)
  })
})

describe('itirazNotu', () => {
  it('işaret + tarih + m.78/2 + İİK 67 içerir; kısmi değilse KISMİ demez', () => {
    const n = itirazNotu('Borca İtiraz Talebi', new Date(2026, 0, 15))
    expect(n.startsWith(`${ITIRAZ_NOT_ISARETI} (${tarihTR(new Date(2026, 0, 15))})`)).toBe(true)
    expect(n).toContain('m.78/2')
    expect(n).toContain('İİK m.67')
    expect(n).toContain('teyit gerekli')
    expect(n).not.toContain('KISMİ')
  })
})

describe('uçtan uca senaryolar — takipOlayKaydet + gerçek görev kancaları + gerçek borcaItirazMi (bellek içi Prisma)', () => {
  type Gorev = { id: string; baslik: string; durum: string; sonTarih: Date | null; aciklama: string | null }
  type GorevWhere = {
    durum?: { in: string[] }
    baslik?: { startsWith: string }
    OR?: { baslik: { startsWith: string } }[]
    sonTarih?: { lt: Date }
  }

  /** Tek dosyalık sahte veritabanı. where filtreleri yalnız bu kodun kullandığı biçimleri destekler. */
  function sahteDb(durum: string) {
    const db = {
      durum,
      olaylar: [] as { tip: string; aciklama: string | null; hamJson?: unknown }[],
      gorevler: [] as Gorev[],
      aktiviteler: [] as string[],
    }
    const eslesir = (g: Gorev, w: GorevWhere) =>
      (!w.durum || w.durum.in.includes(g.durum)) &&
      (!w.baslik || g.baslik.startsWith(w.baslik.startsWith)) &&
      (!w.OR || w.OR.some((o) => g.baslik.startsWith(o.baslik.startsWith))) &&
      (!w.sonTarih || (g.sonTarih != null && g.sonTarih.getTime() < w.sonTarih.lt.getTime()))

    findUnique.mockImplementation((async () => ({ ...aktifDosya, durum: db.durum })) as never)
    vi.mocked(prisma.rucuDosyasi.update).mockImplementation(((a: { data: { durum: string } }) => {
      db.durum = a.data.durum
      return a
    }) as never)
    vi.mocked(prisma.$transaction).mockImplementation((async (ops: unknown[]) => ops) as never)
    vi.mocked(prisma.takipOlayi.create).mockImplementation(((a: { data: { tip: string; aciklama: string | null; hamJson?: unknown } }) => {
      db.olaylar.push({ tip: a.data.tip, aciklama: a.data.aciklama, hamJson: a.data.hamJson })
      return { id: `olay-${db.olaylar.length}` }
    }) as never)
    olayFindFirst.mockImplementation((async (a: { where: { tip: string } }) =>
      db.olaylar.some((o) => o.tip === a.where.tip) ? { id: 'var' } : null) as never)
    olayFindMany.mockImplementation((async (a: { where: { tip: string } }) => db.olaylar.filter((o) => o.tip === a.where.tip)) as never)
    gorevFindFirst.mockImplementation((async (a: { where: GorevWhere }) => db.gorevler.find((g) => eslesir(g, a.where)) ?? null) as never)
    gorevFindMany.mockImplementation((async (a: { where: GorevWhere }) => db.gorevler.filter((g) => eslesir(g, a.where))) as never)
    gorevCreate.mockImplementation((async (a: { data: { baslik: string; sonTarih: Date; aciklama: string } }) => {
      const g = { id: `g${db.gorevler.length + 1}`, baslik: a.data.baslik, durum: 'ACIK', sonTarih: a.data.sonTarih, aciklama: a.data.aciklama }
      db.gorevler.push(g)
      return g
    }) as never)
    gorevUpdate.mockImplementation((async (a: { where: { id: string }; data: Partial<Gorev> }) => {
      const g = db.gorevler.find((x) => x.id === a.where.id)!
      Object.assign(g, a.data)
      return g
    }) as never)
    updateMany.mockImplementation((async (a: { where: GorevWhere; data: { durum: string } }) => {
      const hedef = db.gorevler.filter((g) => eslesir(g, a.where))
      for (const g of hedef) g.durum = a.data.durum
      return { count: hedef.length }
    }) as never)
    aktiviteCreate.mockImplementation((async (a: { data: { eylem: string } }) => {
      db.aktiviteler.push(a.data.eylem)
      return a.data
    }) as never)
    return db
  }
  const olay = (tip: string, aciklama: string, tarih: Date) => ({ tip, tarih, tutar: null, aciklama, hamJson: UYAP })

  it('D1 benzeri: tebliğ → itiraz → dosya alacağına haciz; haciz görevi AÇIK ve notlu, tek Önemli Olay', async () => {
    const db = sahteDb('TAKIP_ACILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    expect(db.durum).toBe('TEBLIG_EDILDI')
    expect(db.gorevler).toHaveLength(1)
    expect(db.gorevler[0].baslik).toContain(tarihTR(new Date(2027, 0, 12)))

    await takipOlayKaydet('d1', null, olay('ITIRAZ', 'Borca İtiraz Talebi', new Date(2026, 0, 15)))
    expect(db.durum).toBe('ITIRAZ')
    expect(db.gorevler[0].durum).toBe('ACIK') // İPTAL EDİLMEZ (Faz 1 ENGELLEYİCİ)
    expect(db.gorevler[0].aciklama).toContain(ITIRAZ_NOT_ISARETI)
    expect(db.aktiviteler.some((e) => e.includes('AÇIK bırakıldı'))).toBe(true)
    expect(onemliTespit).toHaveBeenCalledOnce()

    await takipOlayKaydet('d1', null, olay('HACIZ', 'Dosya Alacağına Haciz Ekleme', new Date(2026, 0, 20)))
    await takipOlayKaydet('d1', null, olay('DURUM', 'DOSYA ALACAĞINA HACİZ (yönü belirsiz …) · Dosya Alacağına Haciz Silme', new Date(2026, 1, 3)))
    expect(db.durum).toBe('ITIRAZ') // eskiden KESINLESTI olurdu
    expect(db.gorevler.map((g) => g.durum)).toEqual(['ACIK'])

    // itirazdan sonra gelen GEÇ mazbata (tarihi daha geç) yeni görev açmaz — en erken tebliğin görevi yaşar
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ Mazbatası', new Date(2026, 0, 13)))
    expect(db.gorevler).toHaveLength(1)
    expect(db.durum).toBe('ITIRAZ')
    expect(onemliTespit).toHaveBeenCalledOnce() // HACIZ/DURUM/TEBLIG Önemli Olay açmaz
  })

  it('HACIZ, itirazsız dosyada haciz görevini KAPATMAZ (eskiden IPTAL ediyordu)', async () => {
    const db = sahteDb('TAKIP_ACILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    await takipOlayKaydet('d1', null, olay('HACIZ', 'İhtiyati Haciz Kararı', new Date(2026, 0, 20)))
    expect(db.gorevler.map((g) => g.durum)).toEqual(['ACIK'])
    expect(db.durum).toBe('TEBLIG_EDILDI')
  })

  it('D2 benzeri: talep + iade tebligat → gerçek tebliğ → itiraz; görev yalnız gerçek tebliğ tarihinden, açık kalır', async () => {
    const db = sahteDb('TAKIP_ACILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebligat Talebi', new Date(2026, 1, 1)))
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebligat İade', new Date(2026, 1, 2)))
    expect(db.durum).toBe('TAKIP_ACILDI')
    expect(db.gorevler).toHaveLength(0)

    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ Mazbatası', new Date(2026, 1, 9)))
    expect(db.durum).toBe('TEBLIG_EDILDI')
    expect(db.gorevler).toHaveLength(1)
    expect(db.gorevler[0].baslik).toContain(tarihTR(new Date(2027, 1, 9))) // talep/iade tarihi DEĞİL

    await takipOlayKaydet('d1', null, olay('ITIRAZ', 'BORCA İTİRAZ TALEBİ', new Date(2026, 1, 10)))
    expect(db.durum).toBe('ITIRAZ')
    expect(db.gorevler[0].durum).toBe('ACIK')
    expect(db.olaylar).toHaveLength(4) // her olay kayıtlı
  })

  it('kısmi itiraz: durum ITIRAZ olur, haciz görevi açık ve notu "KISMİ" der', async () => {
    const db = sahteDb('TAKIP_ACILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    await takipOlayKaydet('d1', null, olay('ITIRAZ', 'Faize İtiraz', new Date(2026, 0, 15)))
    expect(db.durum).toBe('ITIRAZ')
    expect(db.gorevler.map((g) => g.durum)).toEqual(['ACIK'])
    expect(db.gorevler[0].aciklama).toContain('KISMİ')
  })

  it('sıra: itiraz tebliğden ÖNCE gelirse görev yine açılır (notlu) — eskiden hiç açılmıyordu', async () => {
    const db = sahteDb('TAKIP_ACILDI')
    await takipOlayKaydet('d1', null, olay('ITIRAZ', 'Borca İtiraz Talebi', new Date(2026, 0, 15)))
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    expect(db.gorevler).toHaveLength(1)
    expect(db.gorevler[0].aciklama).toContain(ITIRAZ_NOT_ISARETI)
  })

  it('sıra: evraktaki itiraz safahattaki kesinleşme kaydından önce işlenir → görev açık, durum KESINLESTI', async () => {
    const db = sahteDb('TAKIP_ACILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    await takipOlayKaydet('d1', null, olay('ITIRAZ', 'Borca İtiraz Talebi', new Date(2026, 0, 15)))
    await takipOlayKaydet('d1', null, olay('KESINLESTI', 'Örnek Kişi Kesinleşme Bilgisi Kaydedildi.', new Date(2026, 0, 25)))
    expect(db.durum).toBe('KESINLESTI')
    expect(db.gorevler.map((g) => g.durum)).toEqual(['ACIK'])
  })

  it('en erken tebliğ: önce geç tarihli görev varsa, sonradan gelen ERKEN tebliğ yeni (erken) görev açar', async () => {
    const db = sahteDb('TAKIP_ACILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ Mazbatası', new Date(2026, 0, 20)))
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    expect(db.gorevler).toHaveLength(2)
    expect(db.gorevler[1].baslik).toContain(tarihTR(new Date(2027, 0, 12)))
    // daha geç üçüncü kayıt: erken görev var → açılmaz
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'E-Tebliğ Mazbatası', new Date(2026, 0, 16)))
    expect(db.gorevler).toHaveLength(2)
  })

  it('IPTAL edilmiş görev mükerrer sayılmaz: aynı tebliğ günü için görev yeniden kurulur', async () => {
    const db = sahteDb('TEBLIG_EDILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    db.gorevler[0].durum = 'IPTAL' // ör. eski HACIZ kancasının yanlış kapattığı görev
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ Mazbatası', new Date(2026, 0, 12)))
    expect(db.gorevler.map((g) => g.durum)).toEqual(['IPTAL', 'ACIK'])
  })

  it('TAMAMLANDI görev (haciz istendi) varken aynı güne yeni görev açılmaz', async () => {
    const db = sahteDb('TEBLIG_EDILDI')
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    db.gorevler[0].durum = 'TAMAMLANDI'
    await takipOlayKaydet('d1', null, olay('TEBLIG', 'Tebliğ Mazbatası', new Date(2026, 0, 12)))
    expect(db.gorevler).toHaveLength(1)
  })
})
