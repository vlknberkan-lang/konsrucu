/**
 * S15 birleştirme — "bir olay = bir kart" (üretimde doğrulandı: Zurich ilk senkronda 448 ADAY satırı, UYAP aynı
 * olayı safahat + evrak listesi + "Tensip Zaptı Bilgi Girişi (…)" gibi birden çok yerde farklı metinle gösterdiği
 * için 2-3 kart açıyordu). Kapsam:
 *   1) adayGrupAnahtari (saf) — grup anahtarı kuralı.
 *   2) POST /api/uyap/senkron — aynı hukuki olayın birden çok kaynağı TEK ADAY satırına toplanır; kaynaklar
 *      hamJson'a eklenir; tekrar senkron mükerrer eklemez (idempotent); tarihsiz aday hiç birleşmez; farklı gün
 *      birleşmez.
 *   3) durumBilgiAdayiMi / adayKartSayisi — "DURUM" kanalından gelen, kendi onay yolu olmayan aday onay bekleyen
 *      sayaç/karttan hariç; kendi onay yolu olan (DURDURMA_ITIRAZ, TEBLIG_IADE) ETKİLENMEZ.
 *   4) Riski AZALTAN geçişler (KESINLESTI/INFAZ/TAHSIL/KAPANDI) yalnız avukat onaylı olgudan yazılır — ADAY tek
 *      başına asla yeterli değildir; birleştirme (append-only hamJson) bunu DEĞİŞTİRMEZ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SahteDb } from './eksen-sahte-db'
import { adayGrupAnahtari } from '@/lib/konsrucu/eksen/tekil'
import { durumBilgiAdayiMi } from '@/lib/konsrucu/eksen/aday-onay'
import { adayKartSayisi } from '@/lib/konsrucu/eksen/aday-birlestir'
import { icraTuret, type EksenGirdi } from '@/lib/konsrucu/eksen/turet'

const h = vi.hoisted(() => ({ istemci: null as any, izinli: [] as string[], userId: null as string | null }))
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => h.istemci[k as string] }) }))
vi.mock('@/lib/konsrucu/uyap-auth', () => ({
  uyapKimlik: vi.fn(async (req: Request) => (req.headers.get('authorization') === 'Bearer gecerli-anahtar-1234567890' ? { userId: h.userId, izinli: h.izinli } : null)),
  corsJson: (body: unknown, status = 200) => ({ status, body }),
  preflight: () => ({ status: 204 }),
}))
vi.mock('@/lib/konsrucu/onemli-olay', async (o) => ({ ...(await o<typeof import('@/lib/konsrucu/onemli-olay')>()), onemliOlayTespit: vi.fn() }))
vi.mock('@/lib/konsrucu/teblig-gorev', async (o) => ({
  ...(await o<typeof import('@/lib/konsrucu/teblig-gorev')>()), tebligGorevleriOlustur: vi.fn(), tebligGorevleriKapat: vi.fn(),
}))

import { POST } from '@/app/api/uyap/senkron/route'

let db: SahteDb
let M: string

async function gonder(body: unknown) {
  const r = (await POST(new Request('http://yerel/api/uyap/senkron', {
    method: 'POST', headers: { authorization: 'Bearer gecerli-anahtar-1234567890' }, body: JSON.stringify(body),
  }))) as unknown as { status: number; body: any }
  return r
}
const adaylar = (dosyaId: string) => db.olaylar(dosyaId).filter((o) => o.teyit === 'ADAY')

beforeEach(() => {
  db = new SahteDb()
  h.istemci = db.istemci()
  M = db.musteri().id
  h.izinli = [M]
  h.userId = null
  vi.stubEnv('EKSEN_KIPI', 'golge')
  vi.stubEnv('UYAP_OLAY_DURUM', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('adayGrupAnahtari (saf)', () => {
  it('aynı dosya+altTip+hukuki gün+borçlu → aynı anahtar; farklı gün/altTip/borçlu → farklı anahtar', () => {
    const p = { dosyaId: 'd1', altTip: 'ITIRAZ', hukukiTarih: new Date('2026-08-17T00:00:00.000Z'), borcluId: null }
    expect(adayGrupAnahtari(p)).toBe(adayGrupAnahtari({ ...p, hukukiTarih: new Date('2026-08-17T09:00:00.000Z') })) // saat farkı aynı güne düşer
    expect(adayGrupAnahtari(p)).not.toBe(adayGrupAnahtari({ ...p, hukukiTarih: new Date('2026-08-18') }))
    expect(adayGrupAnahtari(p)).not.toBe(adayGrupAnahtari({ ...p, altTip: 'TEBLIG_SONUCU' }))
    expect(adayGrupAnahtari(p)).not.toBe(adayGrupAnahtari({ ...p, borcluId: 'b1' }))
  })
  it('hukuki tarih yoksa null döner (birleşme yok — ürün kararı)', () => {
    expect(adayGrupAnahtari({ dosyaId: 'd1', altTip: 'DIGER', hukukiTarih: null })).toBeNull()
  })
})

describe('POST /api/uyap/senkron — aynı olayın birden çok kaynağı tek karta toplanır', () => {
  it('safahat + evrak listesi + tensip zaptı (aynı gün, farklı metin) → TEK ITIRAZ adayı; diğer 2 kaynak hamJson.kaynaklar\'a eklenir', async () => {
    const d = db.dosya(M)
    const r = await gonder({
      dosyaId: d.id, icraDosyaNo: '2026/0001',
      olaylar: [
        { tip: 'ITIRAZ', tarih: '2026-07-13', aciklama: 'Borçlu X hakkında Takibe İtiraz safahat satırı' },
        { tip: 'ITIRAZ', tarih: '2026-07-13', aciklama: 'Borca İtiraz Talebi' },
        { tip: 'ITIRAZ', tarih: '2026-07-13', aciklama: 'Tensip Zaptı Bilgi Girişi (Borca İtiraz Talebi)' },
      ],
    })
    expect(r.status).toBe(200)
    const itirazlar = adaylar(d.id).filter((o) => o.altTip === 'ITIRAZ')
    expect(itirazlar).toHaveLength(1) // BİR olay = BİR kart
    expect(r.body.birlesenKaynak).toBe(2) // 2 kaynak var olan karta eklendi, yeni satır açmadı
    const kaynaklar = (itirazlar[0].hamJson as any).kaynaklar
    expect(kaynaklar).toHaveLength(2)
    expect(kaynaklar.map((k: any) => k.aciklama)).toEqual(['Borca İtiraz Talebi', 'Tensip Zaptı Bilgi Girişi (Borca İtiraz Talebi)'])
  })

  it('aynı gövde tekrar gönderilirse kaynaklar mükerrer eklenmez (tekilAnahtar idempotent)', async () => {
    const d = db.dosya(M)
    const govde = {
      dosyaId: d.id, icraDosyaNo: '2026/0001',
      olaylar: [
        { tip: 'ITIRAZ', tarih: '2026-07-13', aciklama: 'Borçlu X hakkında Takibe İtiraz safahat satırı' },
        { tip: 'ITIRAZ', tarih: '2026-07-13', aciklama: 'Borca İtiraz Talebi' },
      ],
    }
    await gonder(govde)
    const oncekiKaynakSayisi = ((adaylar(d.id).find((o) => o.altTip === 'ITIRAZ')!.hamJson as any).kaynaklar ?? []).length
    expect(oncekiKaynakSayisi).toBe(1)
    const r2 = await gonder(govde) // aynen tekrar
    expect(r2.body.birlesenKaynak).toBe(0) // ikinci kaynak zaten kayıtlı; tekrar eklenmedi
    const sonrakiKaynakSayisi = ((adaylar(d.id).find((o) => o.altTip === 'ITIRAZ')!.hamJson as any).kaynaklar ?? []).length
    expect(sonrakiKaynakSayisi).toBe(1)
    expect(adaylar(d.id).filter((o) => o.altTip === 'ITIRAZ')).toHaveLength(1)
  })

  it('farklı gün → birleşmez, iki ayrı ITIRAZ adayı açılır', async () => {
    const d = db.dosya(M)
    await gonder({
      dosyaId: d.id, icraDosyaNo: '2026/0001',
      olaylar: [
        { tip: 'ITIRAZ', tarih: '2026-07-13', aciklama: 'Borca İtiraz Talebi' },
        { tip: 'ITIRAZ', tarih: '2026-07-20', aciklama: 'Borca İtiraz Talebi (başka bir gün)' },
      ],
    })
    expect(adaylar(d.id).filter((o) => o.altTip === 'ITIRAZ')).toHaveLength(2)
  })

  it('hukuki tarihi olmayan aday (TAHSILAT_SINYALI) hiç birleşmez — her biri ayrı satır kalır', async () => {
    const d = db.dosya(M)
    await gonder({
      dosyaId: d.id, icraDosyaNo: '2026/0001',
      olaylar: [
        { tip: 'TAHSILAT', tarih: '2026-06-21', aciklama: 'Harç Makbuzu' },
        { tip: 'TAHSILAT', tarih: '2026-06-22', aciklama: 'Reddiyat Makbuzu' },
      ],
    })
    // Harç Makbuzu → MASRAF_MAKBUZU (aday değil, TOPLAMA_GIRMEZ ama adayKolon yine yazılır); Reddiyat → REDDIYAT.
    // İkisi de hukukiTarih=null taşır (TAHSILAT_SINYALI ailesi); farklı altTip olduğundan zaten grup da farklı,
    // ama asıl nokta: aynı altTip olsa bile tarihsiz olduğu için hiç birleşmeyeceğidir (adayGrupAnahtari testi).
    expect(db.olaylar(d.id).filter((o) => o.teyit === 'ADAY')).toHaveLength(2)
  })

  it('DURDURMA_ITIRAZ dosya başına tek adaydır (kendi mekanizması); grup birleştirmesine ihtiyaç duymaz', async () => {
    const d = db.dosya(M)
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', durum: 'Açık (durdurulmuş : Takibe İtiraz)', olaylar: [] })
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', durum: 'Açık (durdurulmuş : Takibe İtiraz)', olaylar: [] })
    expect(adaylar(d.id).filter((o) => o.altTip === 'DURDURMA_ITIRAZ')).toHaveLength(1)
  })
})

describe('durumBilgiAdayiMi / adayKartSayisi — "DURUM" hiçbir hukuki olgu taşımayan adaylar onay bekleyenden hariç', () => {
  it('yalnız TAHSILAT_SINYALI (tip=DURUM) hariç tutulur — kapsam bilerek dar (bkz. aday-onay.ts yorum)', () => {
    expect(durumBilgiAdayiMi({ tip: 'DURUM', altTip: 'TAHSILAT_SINYALI' })).toBe(true)
    // TAHSILAT dışı hamTip'ten TAHSILAT_SINYALI doğmaz (yalnız kontrol amaçlı, tip başka olsa da dar kapsam etkilenmez)
    expect(durumBilgiAdayiMi({ tip: 'HACIZ', altTip: 'TAHSILAT_SINYALI' })).toBe(false)
    // Kendi onay yolu olanlar (DURDURMA_ITIRAZ, TEBLIG_IADE, KESINLESME_SERHI) tip=DURUM olsa da hariç TUTULMAZ.
    expect(durumBilgiAdayiMi({ tip: 'DURUM', altTip: 'DURDURMA_ITIRAZ' })).toBe(false)
    expect(durumBilgiAdayiMi({ tip: 'DURUM', altTip: 'TEBLIG_IADE' })).toBe(false)
    expect(durumBilgiAdayiMi({ tip: 'DURUM', altTip: 'KESINLESME_SERHI' })).toBe(false)
    // GENEL yol olsa da (MUVEKKIL_ALACAGINA_HACIZ, DIGER, ICRAI_HACIZ) "hukuki olgu taşımaz" DEMEK DEĞİL —
    // eksen-senaryo-d1-d2.test.ts K2 senaryosu MUVEKKIL_ALACAGINA_HACIZ'ın bekleyen'de KALMASINI zorunlu kılıyor.
    expect(durumBilgiAdayiMi({ tip: 'DURUM', altTip: 'MUVEKKIL_ALACAGINA_HACIZ' })).toBe(false)
    expect(durumBilgiAdayiMi({ tip: 'DURUM', altTip: 'DIGER' })).toBe(false)
    expect(durumBilgiAdayiMi({ tip: 'DURUM', altTip: 'ICRAI_HACIZ' })).toBe(false)
  })

  it('adayKartSayisi: DURUM/GENEL adayları saymaz, kalanları grup anahtarına göre bire indirger, tarihsiz her biri kendi kartıdır', () => {
    const dosyaId = 'd1'
    const rows = [
      { dosyaId, tip: 'DURUM', altTip: 'TAHSILAT_SINYALI', hukukiTarih: null, borcluId: null }, // sayılmaz
      { dosyaId, tip: 'DURUM', altTip: 'TAHSILAT_SINYALI', hukukiTarih: null, borcluId: null }, // sayılmaz
      { dosyaId, tip: 'ITIRAZ', altTip: 'ITIRAZ', hukukiTarih: new Date('2026-07-13'), borcluId: null }, // 1 kart
      { dosyaId, tip: 'ITIRAZ', altTip: 'ITIRAZ', hukukiTarih: new Date('2026-07-13'), borcluId: null }, // aynı grup, ayrı sayılmaz
      { dosyaId, tip: 'DURUM', altTip: 'DURDURMA_ITIRAZ', hukukiTarih: null, borcluId: null }, // kendi onay yolu var, tarihsiz → kendi kartı
      { dosyaId, tip: 'HACIZ', altTip: 'ICRAI_HACIZ', hukukiTarih: null, borcluId: null }, // tarihsiz → kendi kartı
    ]
    expect(adayKartSayisi(rows)).toBe(3) // ITIRAZ(1) + DURDURMA_ITIRAZ(1) + ICRAI_HACIZ(1); 2x TAHSILAT_SINYALI hariç
  })
})

describe('Riski AZALTAN geçişler yalnız avukat onaylı olgudan (06 karar 3) — birleştirme bunu değiştirmez', () => {
  const bosGirdi = (olaylar: EksenGirdi['olaylar']): EksenGirdi => ({
    durum: 'TEBLIG_EDILDI', icraDosyaNo: '2026/0001', takipTarihi: new Date('2026-06-01'), yolOnayli: false,
    kapanisSebebi: null, kapanisAt: null, borclular: [], olaylar, arabuluculuk: null, yolSecimi: null, davalar: [], eskiAsamalar: [],
  })

  it('yalnız ADAY kesinleşme sinyali → icra ekseni KESINLESTI/INFAZ olmaz', () => {
    const g = bosGirdi([{ id: 'o1', altTip: 'KESINLESME_SERHI', teyit: 'ADAY', borcluId: null, hukukiTarih: new Date('2026-07-01'), sonuc: null, kural: null }])
    const { icra } = icraTuret(g)
    expect(icra.deger).not.toBe('KESINLESTI')
    expect(icra.deger).not.toBe('INFAZ')
    expect(icra.teyit).toBe('TEYITSIZ')
  })
  it('TEYITLI kesinleşme sinyali VARSA icra ekseni KESINLESTI olur (yalnız avukat onayından sonra)', () => {
    const g = bosGirdi([{ id: 'o1', altTip: 'KESINLESME_SERHI', teyit: 'TEYITLI', borcluId: null, hukukiTarih: new Date('2026-07-01'), sonuc: null, kural: null }])
    const { icra } = icraTuret(g)
    expect(icra.deger).toBe('KESINLESTI')
    expect(icra.teyit).toBe('TEYITLI')
  })
  it('TAHSIL/KAPALI yalnız dosya.kapanisAt+kapanisSebebi ile gelir (TakipOlayi\'den DEĞİL); ADAY olaylar bunu tetiklemez', () => {
    const g = bosGirdi([{ id: 'o1', altTip: 'ICRAI_HACIZ', teyit: 'ADAY', borcluId: null, hukukiTarih: new Date('2026-07-01'), sonuc: null, kural: null }])
    const { icra } = icraTuret(g)
    expect(icra.deger).not.toBe('TAHSIL')
    expect(icra.deger).not.toBe('KAPALI')
  })

  it('POST /api/uyap/senkron: KESINLESTI-etiketli olay birden çok kez (aynı+farklı metin) senkronlansa da dosya durumu ve eksen risk azaltmaz', async () => {
    const d = db.dosya(M, { durum: 'TEBLIG_EDILDI' })
    db.borclu(d.id, '[Kurgusal Borçlu Bir]')
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [{ tip: 'KESINLESTI', tarih: '2026-07-15', aciklama: 'Örnek Kişi Kesinleşme Bilgisi Kaydedildi.' }] })
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [{ tip: 'KESINLESTI', tarih: '2026-07-15', aciklama: 'Tensip Zaptı Bilgi Girişi (Kesinleşme Bilgisi Kaydedildi.)' }] })
    const dosya = db.t.rucuDosyasi.find((x) => x.id === d.id)!
    expect(dosya.durum).toBe('TEBLIG_EDILDI') // asimetrik: UYAP kesinleşmesi eski durumu değiştirmez
    expect(dosya.icraEksen).not.toBe('KESINLESTI')
    expect(dosya.icraEksen).not.toBe('INFAZ')
    expect(dosya.icraEksen).not.toBe('TAHSIL')
    // BİRLEŞTİ: tek satır, ikinci metin hamJson.kaynaklar'a eklendi — teyit hiçbir yerde otomatik TEYITLI olmadı.
    const satirlar = adaylar(d.id).filter((o) => o.altTip === 'KESINLESME_SERHI')
    expect(satirlar).toHaveLength(1)
    expect(satirlar[0].teyit).toBe('ADAY')
    expect((satirlar[0].hamJson as any).kaynaklar).toHaveLength(1)
  })
})
