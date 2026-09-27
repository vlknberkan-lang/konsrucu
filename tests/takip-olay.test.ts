/**
 * takipOlayKaydet regresyonları (Prisma mock'lu) — en riskli yazma yolunun davranış kilitleri:
 *   • TAHSILAT dosya durumunu İLERLETMEZ (eski bug: kısmi tahsilat açık dosyayı TAHSIL'e çekiyordu).
 *   • HACIZ durumu DEĞİŞTİRMEZ (eski bug: dosya alacağına haciz D1'i KESINLESTI yaptı — denetim B23/B24).
 *   • ITIRAZ: TAKIP_ACILDI/TEBLIG_EDILDI → ITIRAZ; KESINLESTI → geri dönüş yalnız gerçek kesinleşme KAYDI
 *     yoksa (UYAP talep/silme kaydı sayılmaz) ve hedef aşamaya göre DAVA / ARABULUCULUK / ITIRAZ;
 *     ARABULUCULUK/DAVA/INFAZ/TAHSIL/KAPANDI/IDARI_YOL'a dokunmaz.
 *   • UYAP'tan gelen İADE / bila tebliğ / tebligat talebi TEBLIG_EDILDI yapmaz, süre görevi üretmez;
 *     ELLE girilen tebliğ her zaman gerçektir.
 *   • Aşama türevi itiraz dosya başına bir kez yazılır; UYAP kaynaklı DURUM Önemli Olay açmaz.
 *   • Geç gelen TEBLIG ileri evredeki dosyayı GERİ çekemez; olayın kendisi yine kaydedilir.
 * Senaryo testleri (D1/D2 benzeri) uydurma verilerle; kişisel veri yok.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DosyaDurum } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rucuDosyasi: { findUnique: vi.fn(), update: vi.fn((a: unknown) => a) },
    takipOlayi: { create: vi.fn(() => ({ id: 'olay-1' })), findFirst: vi.fn(), findMany: vi.fn() },
    asama: { findMany: vi.fn() },
    aktivite: { create: vi.fn(() => ({ id: 'akt-1' })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))
// borcaItirazMi GERÇEK (saf); yalnız kuyruk yazımı sahte.
vi.mock('@/lib/konsrucu/onemli-olay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/konsrucu/onemli-olay')>()),
  onemliOlayTespit: vi.fn(),
}))
// Saf sınıflandırıcılar (gercekTebligMi, kesinlesmeMetniMi) gerçek kalır; DB'ye giden görev kancaları sahte.
vi.mock('@/lib/konsrucu/teblig-gorev', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/konsrucu/teblig-gorev')>()),
  tebligGorevleriOlustur: vi.fn(),
  tebligGorevleriKapat: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import {
  takipOlayKaydet, olayHedefDurum, tebligSayilirMi, kesinlesmeKaydiMi, onemliOlayAdayiMi, asamaTureviItirazMi,
  ASAMA_ITIRAZ_ONEK,
} from '@/lib/konsrucu/takip-olay'
import { tebligGorevleriOlustur, tebligGorevleriKapat } from '@/lib/konsrucu/teblig-gorev'
import { onemliOlayTespit } from '@/lib/konsrucu/onemli-olay'

const findUnique = vi.mocked(prisma.rucuDosyasi.findUnique)
const update = vi.mocked(prisma.rucuDosyasi.update)
const olayCreate = vi.mocked(prisma.takipOlayi.create)
const olayFindFirst = vi.mocked(prisma.takipOlayi.findFirst)
const olayFindMany = vi.mocked(prisma.takipOlayi.findMany)
const asamaFindMany = vi.mocked(prisma.asama.findMany)
const gorevOlustur = vi.mocked(tebligGorevleriOlustur)
const gorevKapat = vi.mocked(tebligGorevleriKapat)
const onemliTespit = vi.mocked(onemliOlayTespit)

const UYAP = { kaynak: 'uyap' }
const olay = (tip: string, aciklama: string | null = null, tarih = new Date(2026, 6, 1), hamJson?: { kaynak: string }) =>
  ({ tip, tarih, tutar: null, aciklama, ...(hamJson ? { hamJson } : {}) })
const uyapOlay = (tip: string, aciklama: string | null = null, tarih = new Date(2026, 6, 1)) => olay(tip, aciklama, tarih, UYAP)

beforeEach(() => {
  vi.clearAllMocks()
  // Senaryo testleri implementasyon değiştirir — her testte varsayılana dön.
  findUnique.mockReset()
  update.mockImplementation(((a: unknown) => a) as never)
  olayCreate.mockImplementation((() => ({ id: 'olay-1' })) as never)
  olayFindFirst.mockReset()
  olayFindFirst.mockResolvedValue(null as never)
  olayFindMany.mockReset()
  olayFindMany.mockResolvedValue([] as never)
  asamaFindMany.mockReset()
  asamaFindMany.mockResolvedValue([] as never)
})

/**
 * Bellek içi sahte dosya: durum + olay listesi + aşamalar. findUnique/update/create/findFirst/findMany bunun
 * üzerinden çalışır, böylece ardışık olaylar gerçek akıştaki gibi birbirinin sonucunu görür.
 */
function sahteDosya(baslangic: DosyaDurum, asamalar: { tur: string }[] = []) {
  const d = { durum: baslangic, olaylar: [] as { tip: string; aciklama: string | null; hamJson?: unknown }[] }
  findUnique.mockImplementation((async () => ({ durum: d.durum })) as never)
  update.mockImplementation(((a: { data: { durum: DosyaDurum } }) => {
    d.durum = a.data.durum
    return a
  }) as never)
  olayCreate.mockImplementation(((a: { data: { tip: string; aciklama: string | null; hamJson?: unknown } }) => {
    d.olaylar.push({ tip: a.data.tip, aciklama: a.data.aciklama, hamJson: a.data.hamJson })
    return { id: `olay-${d.olaylar.length}` }
  }) as never)
  olayFindFirst.mockImplementation((async (a: { where: { tip: string } }) =>
    d.olaylar.find((o) => o.tip === a.where.tip) ? { id: 'var' } : null) as never)
  olayFindMany.mockImplementation((async (a: { where: { tip: string } }) => d.olaylar.filter((o) => o.tip === a.where.tip)) as never)
  asamaFindMany.mockImplementation((async () => asamalar) as never)
  return d
}

describe('takipOlayKaydet — olay → durum', () => {
  it('TAHSILAT durumu asla ilerletmez (kısmi tahsilat kapatmaz)', async () => {
    await takipOlayKaydet('d1', null, olay('TAHSILAT'))
    expect(findUnique).not.toHaveBeenCalled() // eşleme dışı tip için durum sorgusu bile yok
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce() // olay kaydı yine düşer
  })

  it('HACIZ durumu DEĞİŞTİRMEZ (dosya alacağına haciz ≠ kesinleşme); olay yine kaydedilir', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TEBLIG_EDILDI } as never)
    await takipOlayKaydet('d1', null, uyapOlay('HACIZ', 'Dosya Alacağına Haciz Ekleme'))
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce()
  })

  it('geç gelen TEBLIG, DAVA dosyayı geri çekemez; olay yine kaydedilir', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.DAVA } as never)
    await takipOlayKaydet('d1', null, olay('TEBLIG'))
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce()
  })

  it('TEBLIG, TAKIP_ACILDI dosyayı TEBLIG_EDILDI yapar (normal akış)', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TAKIP_ACILDI } as never)
    await takipOlayKaydet('d1', null, olay('TEBLIG'))
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.TEBLIG_EDILDI } })
  })

  it("UYAP'tan İADE tebligat TEBLIG_EDILDI yapmaz ve süre görevi üretmez; olay yine kaydedilir", async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TAKIP_ACILDI } as never)
    await takipOlayKaydet('d1', null, uyapOlay('TEBLIG', 'Tebligat İade Mazbatası'))
    expect(update).not.toHaveBeenCalled()
    expect(gorevOlustur).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce()
  })

  it("UYAP'tan tebligat TALEBİ süre görevi üretmez", async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TAKIP_ACILDI } as never)
    await takipOlayKaydet('d1', null, uyapOlay('TEBLIG', 'Tebligat Talebi'))
    expect(gorevOlustur).not.toHaveBeenCalled()
  })

  it('ELLE girilen tebliğ, metninde "bila / iade" geçse de gerçek sayılır (avukat kararı makineden üstün)', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TAKIP_ACILDI } as never)
    const tarih = new Date(2026, 5, 3)
    await takipOlayKaydet('d1', 'u1', olay('TEBLIG', 'Bila dönen tebligat TK 21/2 ile yeniden tebliğ edildi', tarih))
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.TEBLIG_EDILDI } })
    expect(gorevOlustur).toHaveBeenCalledWith('d1', tarih, 'u1')
  })

  it('gerçek TEBLIG görev kancasını tebliğ tarihiyle çağırır', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TAKIP_ACILDI } as never)
    const tarih = new Date(2026, 5, 25)
    await takipOlayKaydet('d1', 'u1', uyapOlay('TEBLIG', 'Tebliğ (UYAP)', tarih))
    expect(gorevOlustur).toHaveBeenCalledWith('d1', tarih, 'u1')
    expect(gorevKapat).not.toHaveBeenCalled()
  })

  it('ITIRAZ kapanış/not kancasına açıklama + tarih + kullanıcıyla gider', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.TEBLIG_EDILDI } as never)
    const tarih = new Date(2026, 6, 2)
    await takipOlayKaydet('d1', 'u1', olay('ITIRAZ', 'Borca İtiraz Talebi', tarih))
    expect(gorevKapat).toHaveBeenCalledWith('d1', 'ITIRAZ', { aciklama: 'Borca İtiraz Talebi', tarih, kullaniciId: 'u1' })
  })

  it('bilinmeyen tip (DURUM vb.) durum değiştirmez ama kaydedilir — kör nokta kalmasın', async () => {
    await takipOlayKaydet('d1', null, olay('DURUM'))
    expect(update).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce()
  })
})

describe('takipOlayKaydet — ITIRAZ durum kuralları', () => {
  it.each([DosyaDurum.TAKIP_ACILDI, DosyaDurum.TEBLIG_EDILDI])('%s → ITIRAZ', async (mevcut) => {
    findUnique.mockResolvedValueOnce({ durum: mevcut } as never)
    await takipOlayKaydet('d1', null, olay('ITIRAZ'))
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.ITIRAZ } })
  })

  it('KESINLESTI, kesinleşme olayı YOKSA (haciz kaynaklı) → ITIRAZ', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.KESINLESTI } as never)
    await takipOlayKaydet('d1', null, olay('ITIRAZ'))
    expect(olayFindMany).toHaveBeenCalledWith({ where: { dosyaId: 'd1', tip: 'KESINLESTI' }, select: { aciklama: true, hamJson: true } })
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.ITIRAZ } })
  })

  it('KESINLESTI, gerçek kesinleşme KAYDI VARSA korunur (gecikmiş/kısmi itiraz — avukat karar verir)', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.KESINLESTI } as never)
    olayFindMany.mockResolvedValueOnce([{ aciklama: 'ÖRNEK KİŞİ Kesinleşme Bilgisi Kaydedildi.', hamJson: UYAP }] as never)
    await takipOlayKaydet('d1', null, olay('ITIRAZ'))
    expect(update).not.toHaveBeenCalled()
    expect(asamaFindMany).not.toHaveBeenCalled()
    expect(olayCreate).toHaveBeenCalledOnce()
  })

  it('KESINLESTI ama tek "kesinleşme" olayı UYAP TALEP / SİLME kaydıysa gerçek sayılmaz → ITIRAZ', async () => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.KESINLESTI } as never)
    olayFindMany.mockResolvedValueOnce([
      { aciklama: 'Takibin Kesinleştirilmesi Talebi', hamJson: UYAP },
      { aciklama: 'Örnek Kişi Kesinleşme Bilgisi Silindi.', hamJson: UYAP },
    ] as never)
    await takipOlayKaydet('d1', null, olay('ITIRAZ'))
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: DosyaDurum.ITIRAZ } })
  })

  it.each([
    [[{ tur: 'DAVA' }, { tur: 'ARABULUCULUK' }], DosyaDurum.DAVA],
    [[{ tur: 'ARABULUCULUK' }], DosyaDurum.ARABULUCULUK],
  ] as const)('KESINLESTI geri dönüşü aşamaya bakar: %j → %s (D1 DAVA\'daydı)', async (asamalar, beklenen) => {
    findUnique.mockResolvedValueOnce({ durum: DosyaDurum.KESINLESTI } as never)
    asamaFindMany.mockResolvedValueOnce(asamalar as never)
    await takipOlayKaydet('d1', null, olay('ITIRAZ'))
    expect(asamaFindMany).toHaveBeenCalledWith({
      where: { dosyaId: 'd1', tur: { in: ['ARABULUCULUK', 'DAVA'] }, durum: { not: 'IPTAL' } },
      select: { tur: true },
    })
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { durum: beklenen } })
  })

  it.each([
    DosyaDurum.ARABULUCULUK, DosyaDurum.DAVA, DosyaDurum.INFAZ,
    DosyaDurum.TAHSIL, DosyaDurum.KAPANDI, DosyaDurum.IDARI_YOL,
  ])('%s geri alınmaz', async (mevcut) => {
    findUnique.mockResolvedValueOnce({ durum: mevcut } as never)
    await takipOlayKaydet('d1', null, olay('ITIRAZ'))
    expect(update).not.toHaveBeenCalled()
    expect(olayFindMany).not.toHaveBeenCalled() // kesinleşme sorgusu yalnız KESINLESTI'de
    expect(olayCreate).toHaveBeenCalledOnce()
  })
})

describe('olayHedefDurum — saf kural tablosu', () => {
  it('HACIZ hiçbir durumda hedef üretmez', () => {
    for (const d of Object.values(DosyaDurum)) expect(olayHedefDurum({ tip: 'HACIZ' }, d)).toBeUndefined()
  })
  it('KESINLESTI olayı genel ileri kuralını korur (ITIRAZ → KESINLESTI ileri)', () => {
    expect(olayHedefDurum({ tip: 'KESINLESTI' }, DosyaDurum.ITIRAZ)).toBe(DosyaDurum.KESINLESTI)
    expect(olayHedefDurum({ tip: 'KESINLESTI' }, DosyaDurum.INFAZ)).toBeUndefined()
  })
  it('ITIRAZ, ITIRAZ dosyada değişiklik üretmez', () => {
    expect(olayHedefDurum({ tip: 'ITIRAZ' }, DosyaDurum.ITIRAZ)).toBeUndefined()
  })
  it('KESINLESTI → geri dönüş gerçek kesinleşme bayrağına ve aşama evresine bağlı', () => {
    expect(olayHedefDurum({ tip: 'ITIRAZ' }, DosyaDurum.KESINLESTI, { gercekKesinlesmeVar: false })).toBe(DosyaDurum.ITIRAZ)
    expect(olayHedefDurum({ tip: 'ITIRAZ' }, DosyaDurum.KESINLESTI, { gercekKesinlesmeVar: true })).toBeUndefined()
    expect(olayHedefDurum({ tip: 'ITIRAZ' }, DosyaDurum.KESINLESTI, { asamaEvresi: 'DAVA' })).toBe(DosyaDurum.DAVA)
    expect(olayHedefDurum({ tip: 'ITIRAZ' }, DosyaDurum.KESINLESTI, { asamaEvresi: 'ARABULUCULUK' })).toBe(DosyaDurum.ARABULUCULUK)
  })
  it("UYAP'tan bila tebliğ TEBLIG_EDILDI üretmez; elle girilen ya da açıklamasız TEBLIG üretir", () => {
    expect(olayHedefDurum({ tip: 'TEBLIG', aciklama: 'BİLA TEBLİĞ MAZBATASI', hamJson: UYAP }, DosyaDurum.TAKIP_ACILDI)).toBeUndefined()
    expect(olayHedefDurum({ tip: 'TEBLIG', aciklama: 'BİLA TEBLİĞ MAZBATASI' }, DosyaDurum.TAKIP_ACILDI)).toBe(DosyaDurum.TEBLIG_EDILDI)
    expect(olayHedefDurum({ tip: 'TEBLIG', aciklama: null, hamJson: UYAP }, DosyaDurum.TAKIP_ACILDI)).toBe(DosyaDurum.TEBLIG_EDILDI)
  })
})

describe('saf yardımcılar', () => {
  it('tebligSayilirMi: süzgeç yalnız UYAP kaynaklıya', () => {
    expect(tebligSayilirMi({ aciklama: 'Tebligat İade', hamJson: UYAP })).toBe(false)
    expect(tebligSayilirMi({ aciklama: 'Tebligat İade' })).toBe(true)
    expect(tebligSayilirMi({ aciklama: 'Tebligat İade', hamJson: { kaynak: 'taksit' } })).toBe(true)
    expect(tebligSayilirMi({ aciklama: 'İadeli Taahhütlü Tebligat Mazbatası', hamJson: UYAP })).toBe(true)
  })

  it('kesinlesmeKaydiMi: UYAP talep/silme sayılmaz; elle girilen her zaman sayılır', () => {
    expect(kesinlesmeKaydiMi({ aciklama: 'ÖRNEK KİŞİ Kesinleşme Bilgisi Kaydedildi.', hamJson: UYAP })).toBe(true)
    expect(kesinlesmeKaydiMi({ aciklama: 'TAKİP KESİNLEŞTİ', hamJson: UYAP })).toBe(true)
    expect(kesinlesmeKaydiMi({ aciklama: 'Takibin Kesinleştirilmesi Talebi', hamJson: UYAP })).toBe(false)
    expect(kesinlesmeKaydiMi({ aciklama: 'Tensip Zaptı Bilgi Girişi (Takibin Kesinleştirilmesi Talebi)', hamJson: UYAP })).toBe(false)
    expect(kesinlesmeKaydiMi({ aciklama: 'Örnek Kişi Kesinleşme Bilgisi Silindi.', hamJson: UYAP })).toBe(false)
    expect(kesinlesmeKaydiMi({ aciklama: 'Kesinleşme şerhinin iptali', hamJson: UYAP })).toBe(false)
    expect(kesinlesmeKaydiMi({ aciklama: 'Takibin kesinleştirilmesi talebi — kabul, kesinleşti' })).toBe(true) // elle
  })

  it('onemliOlayAdayiMi: UYAP kaynaklı yalnız ITIRAZ; elle girilen DURUM açıklamadan da tetikler', () => {
    expect(onemliOlayAdayiMi({ tip: 'ITIRAZ', aciklama: 'Borca İtiraz Talebi', hamJson: UYAP })).toBe(true)
    expect(onemliOlayAdayiMi({ tip: 'DURUM', aciklama: 'İTİRAZDAN FERAGAT / GERİ ALMA (…) · Borca İtirazdan Feragat', hamJson: UYAP })).toBe(false)
    expect(onemliOlayAdayiMi({ tip: 'DURUM', aciklama: 'İTİRAZ — TÜRÜ BELİRSİZ (…) · Bilirkişi Raporuna İtiraz Dilekçesi', hamJson: UYAP })).toBe(false)
    expect(onemliOlayAdayiMi({ tip: 'DURUM', aciklama: 'Müvekkil bildirdi: borca itiraz geldi' })).toBe(true)
    expect(onemliOlayAdayiMi({ tip: 'DURUM', aciklama: 'not' })).toBe(false)
  })

  it('asamaTureviItirazMi: yalnız ITIRAZ + önek', () => {
    expect(asamaTureviItirazMi({ tip: 'ITIRAZ', aciklama: `${ASAMA_ITIRAZ_ONEK} — itiraz tarihi bilinmiyor)` })).toBe(true)
    expect(asamaTureviItirazMi({ tip: 'ITIRAZ', aciklama: 'Takibe itiraz (UYAP aşama)' })).toBe(true) // ≤1.8.0 metni
    expect(asamaTureviItirazMi({ tip: 'DURUM', aciklama: 'Takibe itiraz (UYAP aşama)' })).toBe(false)
    expect(asamaTureviItirazMi({ tip: 'ITIRAZ', aciklama: 'Borca İtiraz Talebi' })).toBe(false)
  })
})

describe('Önemli Olay kancası', () => {
  it('UYAP ITIRAZ → Önemli Olay; UYAP DURUM (türev itiraz metni) → açılmaz', async () => {
    findUnique.mockResolvedValue({ durum: DosyaDurum.TEBLIG_EDILDI } as never)
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi'))
    await takipOlayKaydet('d1', null, uyapOlay('DURUM', 'İTİRAZDAN FERAGAT / GERİ ALMA (itiraz sayılmadı) · Borca İtirazdan Feragat'))
    await takipOlayKaydet('d1', null, uyapOlay('DURUM', 'İTİRAZIN ALACAKLIYA TEBLİĞİ / MUHTIRA (…) · Borca İtiraz Dilekçesinin Tebliği'))
    expect(onemliTespit).toHaveBeenCalledOnce()
    expect(onemliTespit.mock.calls[0][0]).toMatchObject({ dosyaId: 'd1', baslik: 'Borca İtiraz Talebi' })
  })
})

describe('aşama türevi itiraz — dosya başına bir kez', () => {
  const asama = (tarih: Date) => uyapOlay('ITIRAZ', `${ASAMA_ITIRAZ_ONEK} — itiraz tarihi bilinmiyor; tarih ödeme emri tebliği)`, tarih)

  it('aynı dosya farklı tarihlerle iki kez senkronlanırsa tek olay, tek Önemli Olay', async () => {
    const d = sahteDosya(DosyaDurum.TEBLIG_EDILDI)
    await takipOlayKaydet('d1', null, asama(new Date(2026, 8, 1)))
    await takipOlayKaydet('d1', null, asama(new Date(2026, 8, 20)))
    expect(d.olaylar.filter((o) => o.tip === 'ITIRAZ')).toHaveLength(1)
    expect(onemliTespit).toHaveBeenCalledOnce()
    expect(d.durum).toBe(DosyaDurum.ITIRAZ)
  })

  it('dosyada gerçek ITIRAZ olayı varsa aşama türevi hiç yazılmaz', async () => {
    const d = sahteDosya(DosyaDurum.TEBLIG_EDILDI)
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi', new Date(2026, 7, 3)))
    await takipOlayKaydet('d1', null, asama(new Date(2026, 7, 1)))
    expect(d.olaylar.map((o) => o.aciklama)).toEqual(['Borca İtiraz Talebi'])
    expect(onemliTespit).toHaveBeenCalledOnce()
  })
})

describe('senaryolar (uydurma veri)', () => {
  it('D1 benzeri: takip → tebliğ → itiraz → dosya alacağına haciz → ITIRAZ kalır', async () => {
    const d = sahteDosya(DosyaDurum.TAKIP_ACILDI)
    await takipOlayKaydet('d1', null, uyapOlay('TEBLIG', 'Tebliğ (UYAP)', new Date(2026, 0, 12)))
    expect(d.durum).toBe(DosyaDurum.TEBLIG_EDILDI)
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi', new Date(2026, 0, 15)))
    expect(d.durum).toBe(DosyaDurum.ITIRAZ)
    await takipOlayKaydet('d1', null, uyapOlay('HACIZ', 'Dosya Alacağına Haciz Ekleme', new Date(2026, 0, 20)))
    await takipOlayKaydet('d1', null, uyapOlay('HACIZ', 'Dosya Alacağına Haciz Silme', new Date(2026, 1, 3)))
    expect(d.durum).toBe(DosyaDurum.ITIRAZ)
    expect(d.olaylar.map((o) => o.tip)).toEqual(['TEBLIG', 'ITIRAZ', 'HACIZ', 'HACIZ']) // hepsi kayıtlı
    // görev kancaları: tebliğde üret, itirazda not düş, hacizde de çağrılır (kapatmaması teblig-gorev testinde)
    expect(gorevOlustur).toHaveBeenCalledOnce()
    expect(gorevKapat.mock.calls.map((c) => c[1])).toEqual(['ITIRAZ', 'HACIZ', 'HACIZ'])
  })

  it('D1 benzeri, sıra ters: haciz itirazdan ÖNCE gelirse de dosya ITIRAZ olur', async () => {
    const d = sahteDosya(DosyaDurum.TEBLIG_EDILDI)
    await takipOlayKaydet('d1', null, uyapOlay('HACIZ', 'Dosya Alacağına Haciz Ekleme'))
    expect(d.durum).toBe(DosyaDurum.TEBLIG_EDILDI) // eskiden burada KESINLESTI olurdu ve itiraz geri çekemezdi
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi'))
    expect(d.durum).toBe(DosyaDurum.ITIRAZ)
  })

  it('eski eşlemenin bıraktığı haciz kaynaklı KESINLESTI, yeni itirazla ITIRAZ olur', async () => {
    const d = sahteDosya(DosyaDurum.KESINLESTI)
    d.olaylar.push({ tip: 'HACIZ', aciklama: 'Dosya Alacağına Haciz Ekleme', hamJson: UYAP }) // kesinleşme olayı YOK
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi'))
    expect(d.durum).toBe(DosyaDurum.ITIRAZ)
  })

  it('D1 gerçek şekli: haciz kaynaklı KESINLESTI + dava aşaması → itirazla DAVA\'ya döner (ITIRAZ\'a değil)', async () => {
    const d = sahteDosya(DosyaDurum.KESINLESTI, [{ tur: 'DAVA' }])
    d.olaylar.push({ tip: 'KESINLESTI', aciklama: 'Takibin Kesinleştirilmesi Talebi', hamJson: UYAP }) // talep ≠ kesinleşme
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi'))
    expect(d.durum).toBe(DosyaDurum.DAVA)
  })

  it('D2 benzeri: iade tebligat → gerçek tebliğ → itiraz; görev yalnız gerçek tebliğ tarihinden', async () => {
    const d = sahteDosya(DosyaDurum.TAKIP_ACILDI)
    await takipOlayKaydet('d1', null, uyapOlay('TEBLIG', 'Tebligat İade', new Date(2026, 1, 2)))
    expect(d.durum).toBe(DosyaDurum.TAKIP_ACILDI) // iade tebliğ değil
    expect(gorevOlustur).not.toHaveBeenCalled()
    const gercekTeblig = new Date(2026, 1, 9)
    await takipOlayKaydet('d1', null, uyapOlay('TEBLIG', 'Tebliğ Mazbatası', gercekTeblig))
    expect(d.durum).toBe(DosyaDurum.TEBLIG_EDILDI)
    expect(gorevOlustur).toHaveBeenCalledOnce()
    expect(gorevOlustur).toHaveBeenCalledWith('d1', gercekTeblig, null)
    const itirazTarihi = new Date(2026, 1, 10)
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'BORCA İTİRAZ TALEBİ', itirazTarihi))
    expect(d.durum).toBe(DosyaDurum.ITIRAZ)
    expect(gorevKapat).toHaveBeenCalledWith('d1', 'ITIRAZ', { aciklama: 'BORCA İTİRAZ TALEBİ', tarih: itirazTarihi, kullaniciId: null })
  })

  it('itirazdan sonra gelen geç TEBLIG ve gerçek KESINLESTI olayı: TEBLIG geri çekemez, KESINLESTI ilerletir', async () => {
    const d = sahteDosya(DosyaDurum.ITIRAZ)
    await takipOlayKaydet('d1', null, uyapOlay('TEBLIG', 'Tebliğ Mazbatası'))
    expect(d.durum).toBe(DosyaDurum.ITIRAZ)
    await takipOlayKaydet('d1', null, uyapOlay('KESINLESTI', 'Örnek Kişi Kesinleşme Bilgisi Kaydedildi.'))
    expect(d.durum).toBe(DosyaDurum.KESINLESTI)
    // artık gerçek kesinleşme kaydı var → sonradan gelen itiraz durumu geri almaz
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi'))
    expect(d.durum).toBe(DosyaDurum.KESINLESTI)
  })

  it('sıra: evraktaki itiraz safahattaki kesinleşme KAYDINDAN önce işlense de sonuç KESINLESTI', async () => {
    const d = sahteDosya(DosyaDurum.TEBLIG_EDILDI)
    await takipOlayKaydet('d1', null, uyapOlay('ITIRAZ', 'Borca İtiraz Talebi'))
    await takipOlayKaydet('d1', null, uyapOlay('KESINLESTI', 'Örnek Kişi Kesinleşme Bilgisi Kaydedildi.'))
    expect(d.durum).toBe(DosyaDurum.KESINLESTI)
  })
})
