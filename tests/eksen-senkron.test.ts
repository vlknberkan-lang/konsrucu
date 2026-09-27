/**
 * S15 · POST /api/uyap/senkron — aday olaylar, gölge eksen, tahsilat kuralı; eklenti 1.8/1.9 ile GERİYE UYUM.
 *
 * Sahte eklenti: gövdeler eklentinin GERÇEK sınıflandırıcısıyla (extension/siniflandir.js) üretilir
 * (tests/eksen-kurgusal.ts). Veritabanı bellek içi sahte Prisma'dır (tests/eksen-sahte-db.ts); canlıya bağlanılmaz.
 * Plan 07 S15 kabul testleri 1–5 burada otomatik: d1-ham, olay listesi, d2-ham, yatan-para (iki kez), kesinleşme adayı.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SahteDb } from './eksen-sahte-db'
import { D1_REC, D2_REC, govde } from './eksen-kurgusal'

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
import { tebligGorevleriOlustur } from '@/lib/konsrucu/teblig-gorev'

let db: SahteDb
let M: string

async function gonder(body: unknown, anahtar = 'gecerli-anahtar-1234567890') {
  const r = (await POST(new Request('http://yerel/api/uyap/senkron', { method: 'POST', headers: { authorization: `Bearer ${anahtar}` }, body: JSON.stringify(body) }))) as unknown as { status: number; body: any }
  return r
}
const adaylar = (dosyaId: string) => db.olaylar(dosyaId).filter((o) => o.teyit === 'ADAY')
const altTipler = (dosyaId: string) => adaylar(dosyaId).map((o) => o.altTip).sort()
const dosyaOku = (id: string) => db.t.rucuDosyasi.find((d) => d.id === id)!

beforeEach(() => {
  db = new SahteDb()
  h.istemci = db.istemci()
  M = db.musteri().id
  h.izinli = [M]
  h.userId = null
  vi.stubEnv('EKSEN_KIPI', 'golge')
  vi.stubEnv('UYAP_OLAY_DURUM', '')
  vi.mocked(tebligGorevleriOlustur).mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('kimlik ve kapsam', () => {
  it('geçersiz anahtar → 401; başka müvekkilin dosyası → 404', async () => {
    const d = db.dosya(M)
    expect((await gonder(govde(d.id, D1_REC), 'yanlis-anahtar-000000000000')).status).toBe(401)
    const baska = db.dosya(db.musteri('[Kurgusal Diğer]').id)
    expect((await gonder(govde(baska.id, D1_REC))).status).toBe(404)
    expect(db.olaylar(baska.id)).toHaveLength(0)
  })
})

describe('S15 kabul 1–2: d1-ham', () => {
  it('eski durum yalnız asimetrik kurala göre değişir; gölge eksen "Durdu - itiraz (UYAP, teyitsiz)"', async () => {
    const d = db.dosya(M, { durum: 'TAKIP_ACILDI' })
    db.borclu(d.id, '[Kurgusal Borçlu İdare]', 'KAMU')
    const r = await gonder(govde(d.id, D1_REC))
    expect(r.status).toBe(200)
    expect(r.body.yeniAday).toBeGreaterThan(0)
    const dosya = dosyaOku(d.id)
    expect(dosya.durum).toBe('ITIRAZ') // itiraz riski artırır → eski durum da görür
    expect(dosya.icraEksen).toBe('DURDU_ITIRAZ')
    expect(dosya.eksenJson.icra).toMatchObject({ teyit: 'TEYITSIZ', kaynakTuru: 'UYAP' })
    expect(dosya.eksenHesapAt).toBeInstanceOf(Date)
    // gölge iz: üç eksen golge=true; eski durum değişimi ayrıca (golge=false)
    const gecis = db.t.durumGecisi.filter((g) => g.dosyaId === d.id)
    expect(gecis.filter((g) => g.golge).map((g) => g.eksen).sort()).toEqual(['ARAB', 'DAVA', 'ICRA'])
    expect(gecis.find((g) => g.eksen === 'ESKI_DURUM')).toMatchObject({ eski: 'TAKIP_ACILDI', yeni: 'ITIRAZ', golge: false, kaynakTuru: 'KURAL' })
  })
  it('olay listesi: dosya alacağına hacizler "müvekkil alacağına haciz", makbuz "tahsilat sinyali"; tahsilat toplamı 0', async () => {
    const d = db.dosya(M)
    db.borclu(d.id, '[Kurgusal Borçlu İdare]', 'KAMU')
    await gonder(govde(d.id, D1_REC))
    expect(altTipler(d.id)).toEqual(['DURDURMA_ITIRAZ', 'ITIRAZ', 'MUVEKKIL_ALACAGINA_HACIZ', 'MUVEKKIL_ALACAGINA_HACIZ', 'TAHSILAT_SINYALI', 'TEBLIG_SONUCU'])
    // yapısal "Tebliğ (UYAP)" aynı günlü mazbatanın kopyası: ayrı kart açmaz (satır eski yoldan yazılır, teyit null)
    expect(db.olaylar(d.id).filter((o) => o.aciklama === 'Tebliğ (UYAP)').every((o) => o.teyit == null)).toBe(true)
    // K1: TAHSILAT tipli hiçbir satır yok, TAHSILAT_BORCLUDAN yok
    expect(db.olaylar(d.id).some((o) => o.tip === 'TAHSILAT')).toBe(false)
    expect(db.olaylar(d.id).some((o) => o.altTip === 'TAHSILAT_BORCLUDAN')).toBe(false)
    // K2: hiçbir satır kesinleşme değil, dosya KESİNLEŞTİ değil
    expect(dosyaOku(d.id).durum).not.toBe('KESINLESTI')
    // durum metni adayı tarihsiz; Aktivite "tarih teyit gerekli"
    const dm = db.olaylar(d.id).find((o) => o.altTip === 'DURDURMA_ITIRAZ')!
    expect(dm.hukukiTarih).toBeNull()
    expect(db.t.aktivite.some((a) => /tarih teyit gerekli/.test(a.eylem))).toBe(true)
  })
  it('aynı gövde ikinci kez: yeni olay ve yeni aday oluşmaz (idempotent)', async () => {
    const d = db.dosya(M)
    db.borclu(d.id, '[Kurgusal Borçlu İdare]', 'KAMU')
    await gonder(govde(d.id, D1_REC))
    const olaySayisi = db.olaylar(d.id).length
    const gecisSayisi = db.t.durumGecisi.length
    const r = await gonder(govde(d.id, D1_REC))
    expect(r.body).toMatchObject({ yeniOlay: 0, yeniAday: 0 })
    expect(db.olaylar(d.id)).toHaveLength(olaySayisi)
    expect(db.t.durumGecisi).toHaveLength(gecisSayisi) // eksen değişmedi → iz yok
  })
})

describe('S15 kabul 3: d2-ham', () => {
  it('İADE tebligat "tebliğ sonucu: İADE" adayı; İADE\'den süre görevi açılmaz; tek tebliğ adayı', async () => {
    const d = db.dosya(M)
    db.borclu(d.id, '[Kurgusal Borçlu Bir]')
    db.borclu(d.id, '[Kurgusal Borçlu İki]')
    await gonder(govde(d.id, D2_REC))
    const iade = adaylar(d.id).filter((o) => o.altTip === 'TEBLIG_IADE')
    expect(iade).toHaveLength(1)
    expect(iade[0].sonuc).toBe('IADE')
    expect(adaylar(d.id).filter((o) => o.altTip === 'TEBLIG_SONUCU')).toHaveLength(1)
    expect(adaylar(d.id).filter((o) => o.altTip === 'ITIRAZIN_ALACAKLIYA_TEBLIGI')).toHaveLength(1)
    // görev yalnız gerçek tebliğden (TK 21/2 mazbatası) — İADE süre başlatmaz
    const cagrilar = vi.mocked(tebligGorevleriOlustur).mock.calls.map((c) => (c[1] as Date).toISOString().slice(0, 10))
    expect(cagrilar).not.toContain('2026-06-18')
  })
})

describe('S15 kabul 4: yatan-para (SEN-10)', () => {
  it('0 → 1.000 TL: "Tahsilat (UYAP Yatan Para) 1.000 TL" adayı; aynı gövde ikinci kez → yeni aday yok', async () => {
    const d = db.dosya(M, { uyapHesapJson: { tahsilat: 0 } })
    const b = govde(d.id, D1_REC, { tahsilat: 1000, olaylar: [] })
    const r1 = await gonder(b)
    const t = db.olaylar(d.id).filter((o) => o.altTip === 'TAHSILAT_BORCLUDAN')
    expect(t).toHaveLength(1)
    expect(Number(t[0].tutar)).toBe(1000)
    expect(t[0]).toMatchObject({ teyit: 'ADAY', kaynakTuru: 'UYAP_YAPISAL', hukukiTarih: null, tip: 'DURUM' })
    expect(t[0].aciklama).toMatch(/1\.000,00 TL/)
    expect(r1.body.yeniAday).toBeGreaterThanOrEqual(1)
    await gonder(b)
    expect(db.olaylar(d.id).filter((o) => o.altTip === 'TAHSILAT_BORCLUDAN')).toHaveLength(1)
  })
  it('Yatan Para azalırsa aday yok, kontrol notu Aktivite\'de', async () => {
    const d = db.dosya(M, { uyapHesapJson: { tahsilat: 1000 } })
    await gonder(govde(d.id, D1_REC, { tahsilat: 400, olaylar: [] }))
    expect(db.olaylar(d.id).some((o) => o.altTip === 'TAHSILAT_BORCLUDAN')).toBe(false)
    expect(db.t.aktivite.some((a) => /Yatan Para" toplamı azaldı/.test(a.eylem))).toBe(true)
  })
})

describe('S15 kabul 5: kesinleşme adayı', () => {
  it('UYAP kesinleşme kaydı: eski durum değişmez (asimetrik), eksen KESİNLEŞTİ olmaz, aday onay bekler', async () => {
    const d = db.dosya(M, { durum: 'TEBLIG_EDILDI' })
    db.borclu(d.id, '[Kurgusal Borçlu Bir]')
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', durum: 'Açık', olaylar: [{ tip: 'KESINLESTI', tarih: '2026-07-15', aciklama: 'Örnek Kişi Kesinleşme Bilgisi Kaydedildi.' }] })
    const dosya = dosyaOku(d.id)
    expect(dosya.durum).toBe('TEBLIG_EDILDI')
    expect(dosya.icraEksen).not.toBe('KESINLESTI')
    expect(adaylar(d.id).map((o) => o.altTip)).toEqual(['KESINLESME_SERHI'])
    expect(dosya.eksenJson.icra.notlar.join(' ')).toMatch(/kesinleşme sinyali/)
  })
  it('UYAP_OLAY_DURUM=eski ile Faz 1 davranışına dönülebilir (geri dönüş yolu)', async () => {
    vi.stubEnv('UYAP_OLAY_DURUM', 'eski')
    const d = db.dosya(M, { durum: 'TEBLIG_EDILDI' })
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [{ tip: 'KESINLESTI', tarih: '2026-07-15', aciklama: 'Örnek Kişi Kesinleşme Bilgisi Kaydedildi.' }] })
    expect(dosyaOku(d.id).durum).toBe('KESINLESTI')
  })
})

describe('geriye uyum ve bayrak kapalıyken', () => {
  it('EKSEN_KIPI kapalı: aday kolonu, tahsilat adayı ve DurumGecisi yazılmaz; asimetrik kural ve TAHSİLAT katlama sürer', async () => {
    vi.stubEnv('EKSEN_KIPI', '')
    const d = db.dosya(M, { durum: 'TEBLIG_EDILDI', uyapHesapJson: { tahsilat: 0 } })
    const r = await gonder(govde(d.id, D1_REC, { tahsilat: 500 }))
    expect(r.body.yeniAday).toBe(0)
    expect(db.olaylar(d.id).every((o) => o.teyit == null)).toBe(true)
    expect(db.t.durumGecisi).toHaveLength(0)
    expect(dosyaOku(d.id).icraEksen).toBeNull()
    expect(db.olaylar(d.id).some((o) => o.tip === 'TAHSILAT')).toBe(false)
    expect(dosyaOku(d.id).durum).toBe('ITIRAZ')
  })
  it('eklenti 1.8: TAHSILAT tipli evrak "TAHSİLAT SİNYALİ" etiketli DURUM olur; eski biçimde kayıtlıysa tekrar yazılmaz', async () => {
    const d = db.dosya(M)
    db.ekle('takipOlayi', { dosyaId: d.id, tip: 'TAHSILAT', tarih: new Date('2026-06-21'), aciklama: 'Harç Makbuzu', hamJson: { kaynak: 'uyap' } })
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [
      { tip: 'TAHSILAT', tarih: '2026-06-21', aciklama: 'Harç Makbuzu' },
      { tip: 'TAHSILAT', tarih: '2026-06-22', aciklama: 'Reddiyat Makbuzu' },
    ] })
    const yeni = db.olaylar(d.id).filter((o) => o.tarih?.toISOString().startsWith('2026-06-22'))
    expect(yeni).toHaveLength(1)
    expect(yeni[0]).toMatchObject({ tip: 'DURUM', altTip: 'REDDIYAT', hamJson: { kaynak: 'uyap', hamTip: 'TAHSILAT', kaynakTip: 'TAHSILAT' } })
    expect(yeni[0].aciklama).toMatch(/^TAHSİLAT SİNYALİ \(evrak adından; tahsilat sayılmadı\) · Reddiyat Makbuzu/)
    expect(db.olaylar(d.id).filter((o) => o.tarih?.toISOString().startsWith('2026-06-21'))).toHaveLength(1)
  })
  it('tarihsiz olaya "bugün" yazılmaz; bilinmeyen tip DURUM\'a katlanır', async () => {
    const d = db.dosya(M)
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [{ tip: 'YENI_TIP', aciklama: 'Hukuk Mahkemesi Tevzi Formu' }] })
    const o = db.olaylar(d.id)[0]
    expect(o.tarih).toBeNull()
    expect(o).toMatchObject({ tip: 'DURUM', altTip: 'DAVA_ACILDI_SINYALI', hamJson: { hamTip: 'YENI_TIP' } })
    expect(dosyaOku(d.id).davaEksen).toBe('YOK') // sinyal davayı açık saymaz
  })
  it('yeni olay tipleri (IADE, dosya alacağına haciz, itirazın alacaklıya tebliği) DURUM etiketiyle ya da iç tip adıyla gelse de kabul edilir', async () => {
    const d = db.dosya(M, { durum: 'TAKIP_ACILDI' })
    db.borclu(d.id, '[Kurgusal Borçlu Bir]')
    const r = await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [
      // 1.9 biçimi: DURUM + açıklama etiketi
      { tip: 'DURUM', tarih: '2026-06-18', aciklama: 'İADE (tebligat iade / bila tebliğ — tebliğ sayılmadı) · Tebligat Mazbatası' },
      // olası ileriki biçim: iç tip adı doğrudan
      { tip: 'HACIZ_DOSYA_ALACAGI', tarih: '2026-06-26', aciklama: 'Dosya Alacağına Haciz Ekleme' },
      { tip: 'ITIRAZ_TEBLIGI', tarih: '2026-07-01', aciklama: 'E-Tebligat' },
    ] })
    expect(r.status).toBe(200)
    const ol = db.olaylar(d.id)
    expect(ol.every((o) => o.tip === 'DURUM')).toBe(true) // eski durum makinesine girmez
    expect(ol.map((o) => o.altTip).sort()).toEqual(['ITIRAZIN_ALACAKLIYA_TEBLIGI', 'MUVEKKIL_ALACAGINA_HACIZ', 'TEBLIG_IADE'])
    expect(ol.find((o) => o.altTip === 'MUVEKKIL_ALACAGINA_HACIZ')!.hamJson).toMatchObject({ hamTip: 'HACIZ_DOSYA_ALACAGI' })
    expect(dosyaOku(d.id).durum).toBe('TAKIP_ACILDI') // İADE tebliğ değil, haciz kesinleşme değil
    expect(dosyaOku(d.id).icraEksen).toBe('TEBLIG_BEKLENIYOR')
  })
  it('olaylar tarih sırasıyla işlenir: aynı partide geç tebliğ erken itirazın durumunu geri çekemez', async () => {
    const d = db.dosya(M, { durum: 'TAKIP_ACILDI' })
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [
      { tip: 'TEBLIG', tarih: '2026-06-28', aciklama: 'E-Tebligat Mazbatası' },
      { tip: 'ITIRAZ', tarih: '2026-06-24', aciklama: 'Borca İtiraz Talebi' },
    ] })
    expect(dosyaOku(d.id).durum).toBe('ITIRAZ')
  })
  it('yeni kişi anahtarıyla gelen olayın Aktivite satırı kişiye yazılır', async () => {
    h.userId = 'kullanici-1'
    const d = db.dosya(M)
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [{ tip: 'ITIRAZ', tarih: '2026-06-24', aciklama: 'Borca İtiraz Talebi' }] })
    expect(db.t.aktivite.some((a) => a.kullaniciId === 'kullanici-1' && /Takip olayı/.test(a.eylem))).toBe(true)
  })
})
