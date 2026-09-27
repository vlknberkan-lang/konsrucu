/**
 * S23 · Aday onayı → BorcluTakip aynası (lib/konsrucu/eksen/aday-onay.ts saf plan + aday-onay-db.ts işlem).
 *
 * Kilitler: borçlu bazında onay (B08), İADE tebliği ezmez (K3), kısmi itirazda tutar zorunlu, kaşe ≤ UYAP kayıt,
 * ileri tarih yok, üzerine yazma açık onayla, kesinleşme ikinci onayla, M7 (borçlu bu dosyanın), iyimser kilit
 * (iki sekme), işlem geri sarma, geri alma önceki değeri getirir. Sahte veritabanı; kişisel veri yok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SahteDb } from './eksen-sahte-db'

const h = vi.hoisted(() => ({ istemci: null as any }))
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => h.istemci[k as string] }) }))

import { itirazKapsamPlani, onayPlani, onayYolu, yazilanlaAyniMi, izdenAlanlar, izeCevir, type OnayAday, type MevcutBorcluTakip } from '@/lib/konsrucu/eksen/aday-onay'
import { adayGeriAl, adayOnayla, adayReddet, alacakliyaTebligElle, itirazKapsamGir } from '@/lib/konsrucu/eksen/aday-onay-db'
import { isoGun, isoGundenTarih } from '@/lib/konsrucu/eksen/norm'

const G = (s: string) => isoGundenTarih(s)!
const BUGUN = G('2026-07-20')
const aday = (altTip: string, p: Partial<OnayAday> = {}): OnayAday => ({
  id: 'o1', altTip, teyit: 'ADAY', borcluId: null, hukukiTarih: G('2026-06-25'), tarih: G('2026-06-25'), sonuc: null, tebligSekli: null,
  muhatap: null, kaynakBelgeId: null, kaynakTuru: 'UYAP_EVRAK', kural: 'EK1-TEST@1', ...p,
})
const mevcut = (borcluId: string, p: Partial<MevcutBorcluTakip> = {}): MevcutBorcluTakip => ({
  id: `bt-${borcluId}`, borcluId, updatedAt: new Date('2026-07-01'), tebligTarihi: null, tebligSekli: null, tebligSonucu: null, uetsUlasmaTarihi: null,
  tebligKaynakBelgeId: null, itirazVar: null, itirazVerilisTarihi: null, itirazUyapTarihi: null, itirazTipi: null, itirazKapsamJson: null,
  itirazEdilenTutar: null, itirazKaynakBelgeId: null, itirazAlacakliyaTebligTarihi: null, itirazAlacakliyaTebligKaynak: null, ...p,
})
const iki = [{ id: 'b1' }, { id: 'b2' }]
const plan = (a: OnayAday, girdi: Record<string, unknown> = {}, p: { borclular?: { id: string }[]; mevcutlar?: MevcutBorcluTakip[]; takipTarihi?: Date | null } = {}) =>
  onayPlani({ aday: a, girdi, borclular: p.borclular ?? iki, mevcutlar: p.mevcutlar ?? [], takipTarihi: p.takipTarihi ?? G('2026-06-11'), bugun: BUGUN })

describe('onay yolu', () => {
  it('kart formu alt tipe göre; tahsilat ve dava bağı bu kartta onaylanmaz', () => {
    expect(onayYolu('TEBLIG_SONUCU')).toBe('TEBLIG')
    expect(onayYolu('TEBLIG_IADE')).toBe('TEBLIG')
    expect(onayYolu('DURDURMA_ITIRAZ')).toBe('ITIRAZ')
    expect(onayYolu('ITIRAZIN_ALACAKLIYA_TEBLIGI')).toBe('ALACAKLIYA_TEBLIG')
    expect(onayYolu('KESINLESME_SERHI')).toBe('KESINLESME')
    expect(onayYolu('MUVEKKIL_ALACAGINA_HACIZ')).toBe('GENEL')
    expect(onayYolu('TAHSILAT_BORCLUDAN')).toBe('YOK')
    expect(plan(aday('TAHSILAT_BORCLUDAN'))).toEqual({ ok: false, hata: 'Tahsilat onayı Para panelinden yapılır.' })
  })
})

describe('tebliğ onayı (borçlu bazında)', () => {
  it('iki borçlu varken borçlu seçilmeden onaylanmaz; seçilen borçlu dosyanın olmalı (M7)', () => {
    expect(plan(aday('TEBLIG_SONUCU', { sonuc: 'TEBLIG' }))).toMatchObject({ ok: false, hata: expect.stringMatching(/hangi borçlu/) })
    expect(plan(aday('TEBLIG_SONUCU', { sonuc: 'TEBLIG' }), { borcluId: 'yabanci' })).toMatchObject({ ok: false, hata: expect.stringMatching(/bu dosyaya ait değil/) })
  })
  it('tek borçluda borçlu kendiliğinden; sonuç BELİRSİZ ise seçilmeden onaylanmaz', () => {
    expect(plan(aday('TEBLIG_SONUCU', { sonuc: 'BELIRSIZ' }), {}, { borclular: [{ id: 'b1' }] })).toMatchObject({ ok: false, hata: expect.stringMatching(/sonucunu seçin/) })
    const p = plan(aday('TEBLIG_SONUCU', { sonuc: 'TEBLIG', tebligSekli: 'TK21_2' }), {}, { borclular: [{ id: 'b1' }] })
    expect(p.ok && p.aynalar[0]).toMatchObject({ borcluId: 'b1', alanlar: { tebligSonucu: 'TEBLIG', tebligSekli: 'TK21_2' } })
  })
  it('UETS: tarih yoksa ulaşma + 5 gün yazılır ve uyarılır', () => {
    const p = plan(aday('TEBLIG_SONUCU', { hukukiTarih: null }), { borcluId: 'b1', sonuc: 'TEBLIG', tebligSekli: 'UETS', uetsUlasmaTarihi: G('2026-06-23') })
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(isoGun(p.aynalar[0].alanlar.tebligTarihi!)).toBe('2026-06-28')
    expect(isoGun(p.aynalar[0].alanlar.uetsUlasmaTarihi!)).toBe('2026-06-23')
    expect(p.uyarilar.join(' ')).toMatch(/ulaşma \+ 5 gün/)
  })
  it('ileri tarih reddedilir; takip öncesi tarih uyarı alır', () => {
    expect(plan(aday('TEBLIG_SONUCU'), { borcluId: 'b1', sonuc: 'TEBLIG', tarih: G('2026-08-01') })).toMatchObject({ ok: false, hata: 'İleri bir tarih girilemez.' })
    const p = plan(aday('TEBLIG_SONUCU'), { borcluId: 'b1', sonuc: 'TEBLIG', tarih: G('2026-06-01') })
    expect(p.ok && p.uyarilar.join(' ')).toMatch(/takip tarihinden önce/)
  })
  it('onaylı tebliğin üzerine başka tarih ancak "üzerine yaz" ile', () => {
    const m = [mevcut('b1', { tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25') })]
    expect(plan(aday('TEBLIG_SONUCU'), { borcluId: 'b1', sonuc: 'TEBLIG', tarih: G('2026-06-26') }, { mevcutlar: m })).toMatchObject({ ok: false, hata: expect.stringMatching(/üzerine yaz/) })
    expect(plan(aday('TEBLIG_SONUCU'), { borcluId: 'b1', sonuc: 'TEBLIG', tarih: G('2026-06-26'), ustuneYaz: true }, { mevcutlar: m }).ok).toBe(true)
    expect(plan(aday('TEBLIG_SONUCU'), { borcluId: 'b1', sonuc: 'TEBLIG', tarih: G('2026-06-25') }, { mevcutlar: m }).ok).toBe(true) // aynı gün: sorun yok
  })
  it('K3: İADE onaylı tebliği EZMEZ (bilgi olarak tutulur); tebliğ yoksa İADE yazılır, süre başlamaz', () => {
    const m = [mevcut('b1', { tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25') })]
    const ezmez = plan(aday('TEBLIG_IADE', { sonuc: 'IADE' }), { borcluId: 'b1' }, { mevcutlar: m })
    expect(ezmez.ok && ezmez.aynalar).toEqual([])
    const yazar = plan(aday('TEBLIG_IADE', { sonuc: 'IADE' }), { borcluId: 'b1' })
    expect(yazar.ok && yazar.aynalar[0].alanlar).toMatchObject({ tebligSonucu: 'IADE', tebligTarihi: null })
    expect(yazar.ok && yazar.uyarilar.join(' ')).toMatch(/Süre başlamadı/)
  })
  it('alacaklı vekiline yapılan tebliğ "itirazın size tebliği" olarak onaylanır', () => {
    const p = plan(aday('TEBLIG_SONUCU', { muhatap: 'ALACAKLI_VEKILI', hukukiTarih: G('2026-07-01') }), { borcluId: 'b1' }, { mevcutlar: [mevcut('b1', { itirazVar: true, itirazUyapTarihi: G('2026-06-26') })] })
    expect(p.ok && p.altTip).toBe('ITIRAZIN_ALACAKLIYA_TEBLIGI')
    expect(p.ok && p.aynalar[0].alanlar).toMatchObject({ itirazAlacakliyaTebligKaynak: 'UETS_MAZBATA' })
  })
})

describe('itiraz onayı', () => {
  it('kısmi itirazda tutar zorunlu; tam itirazda tutar yazılmaz', () => {
    expect(plan(aday('ITIRAZ'), { borcluId: 'b1', itirazTipi: 'KISMI' })).toMatchObject({ ok: false, hata: expect.stringMatching(/tutar zorunludur/) })
    const k = plan(aday('ITIRAZ'), { borcluId: 'b1', itirazTipi: 'KISMI', itirazEdilenTutar: 1234.56 })
    expect(k.ok && k.aynalar[0].alanlar.itirazEdilenTutar).toBe(1234.56)
    const t = plan(aday('ITIRAZ'), { borcluId: 'b1', itirazTipi: 'TAM', itirazEdilenTutar: 5 })
    expect(t.ok && t.aynalar[0].alanlar.itirazEdilenTutar).toBeNull()
  })
  it('kalem kaşesi UYAP kayıt tarihinden sonra olamaz; kaşe yoksa İİK 67 uyarısı', () => {
    expect(plan(aday('ITIRAZ', { hukukiTarih: G('2026-06-24') }), { borcluId: 'b1', itirazVerilisTarihi: G('2026-06-25') })).toMatchObject({ ok: false, hata: expect.stringMatching(/Kalem kaşesi/) })
    const p = plan(aday('ITIRAZ', { hukukiTarih: G('2026-06-24') }), { borcluId: 'b1', itirazTipi: 'TAM' })
    expect(p.ok && p.uyarilar.join(' ')).toMatch(/Kalem kaşesi tarihi girilmedi/)
  })
  it('birden çok borçlu tek kartta; gecikmiş itiraz uyarısı (İİK 65, teyit gerekli)', () => {
    const m = [mevcut('b1', { tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-10') })]
    const p = plan(aday('ITIRAZ', { hukukiTarih: G('2026-06-24') }), { borcluIdler: ['b1', 'b2'], itirazTipi: 'TAM' }, { mevcutlar: m })
    expect(p.ok && p.aynalar.map((a) => a.borcluId)).toEqual(['b1', 'b2'])
    expect(p.ok && p.uyarilar.join(' ')).toMatch(/İİK 65/)
  })
  it('durum metni adayı tarihsiz onaylanabilir (itiraz var); tarih girilirse UYAP tarihi olur', () => {
    const p = plan(aday('DURDURMA_ITIRAZ', { hukukiTarih: null, tarih: G('2026-06-11') }), { borcluId: 'b1' })
    expect(p.ok && p.aynalar[0].alanlar).toMatchObject({ itirazVar: true, itirazUyapTarihi: null })
    expect(p.ok && p.uyarilar.join(' ')).toMatch(/İtiraz tarihi yok/)
  })
  it('onaylı itirazın üzerine farklı tarih "üzerine yaz" ister', () => {
    const m = [mevcut('b1', { itirazVar: true, itirazVerilisTarihi: G('2026-06-23') })]
    expect(plan(aday('ITIRAZ'), { borcluId: 'b1', itirazVerilisTarihi: G('2026-06-20') }, { mevcutlar: m })).toMatchObject({ ok: false })
  })
})

describe('itirazın size tebliği ve kesinleşme', () => {
  it('borçlu: itirazı onaylı tek borçlu kendiliğinden seçilir; itirazdan önce olamaz', () => {
    const m = [mevcut('b1', { itirazVar: true, itirazVerilisTarihi: G('2026-06-26') }), mevcut('b2')]
    const p = plan(aday('ITIRAZIN_ALACAKLIYA_TEBLIGI', { hukukiTarih: G('2026-07-01') }), {}, { mevcutlar: m })
    expect(p.ok && p.aynalar[0].borcluId).toBe('b1')
    expect(plan(aday('ITIRAZIN_ALACAKLIYA_TEBLIGI', { hukukiTarih: G('2026-06-20') }), {}, { mevcutlar: m })).toMatchObject({ ok: false, hata: expect.stringMatching(/itirazdan önce/) })
  })
  it('kesinleşme riski azaltır: ikinci onay kutusu olmadan onaylanmaz', () => {
    expect(plan(aday('KESINLESME_SERHI'))).toMatchObject({ ok: false, hata: expect.stringMatching(/ikinci onay/) })
    const p = plan(aday('KESINLESME_SERHI'), { kesinlesmeOnay: true })
    expect(p.ok && p.aynalar).toEqual([])
  })
  it('işlenmiş aday tekrar onaylanmaz', () => {
    expect(plan(aday('ITIRAZ', { teyit: 'TEYITLI' }), { borcluId: 'b1' })).toMatchObject({ ok: false, hata: expect.stringMatching(/az önce işlendi/) })
  })
})

describe('TB-07 itiraz kapsamı (onaylı itiraz)', () => {
  const k = (m: MevcutBorcluTakip | undefined, girdi: Record<string, unknown>) => itirazKapsamPlani({ mevcut: m, girdi: girdi as never, bugun: BUGUN })
  const onayli = mevcut('b1', { itirazVar: true, itirazUyapTarihi: G('2026-06-24'), tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-20') })
  it('itiraz onaylı değilse kapsam girilemez', () => {
    expect(k(undefined, { itirazTipi: 'TAM' })).toMatchObject({ ok: false, hata: expect.stringMatching(/önce itiraz kartını onaylayın/) })
    expect(k(mevcut('b1', { itirazVar: null }), { itirazTipi: 'TAM' })).toMatchObject({ ok: false })
  })
  it('kısmide tutar zorunlu; tamda tutar silinir; kapsam korunur ya da değişir', () => {
    expect(k(onayli, { itirazTipi: 'KISMI' })).toMatchObject({ ok: false, hata: expect.stringMatching(/tutar zorunludur/) })
    const p1 = k({ ...onayli, itirazEdilenTutar: 500, itirazKapsamJson: { faiz: true } }, { itirazTipi: 'TAM' })
    expect(p1.ok && p1.alanlar).toMatchObject({ itirazTipi: 'TAM', itirazEdilenTutar: null, itirazKapsamJson: { faiz: true } })
    const p2 = k(onayli, { itirazTipi: 'KISMI', itirazEdilenTutar: 1234.56, itirazKapsam: { faiz: true, feriler: true } })
    expect(p2.ok && p2.alanlar).toMatchObject({ itirazTipi: 'KISMI', itirazEdilenTutar: 1234.56, itirazKapsamJson: { faiz: true, feriler: true } })
    expect(p2.ok && p2.aktivite).toBe("İtiraz kapsamı girildi: kısmi (faiz, fer'iler) · 1.234,56 TL")
    expect(p2.ok && p2.uyarilar.join(' ')).toMatch(/takibe devam/)
  })
  it('kaşe: ileri tarih yok, UYAP kaydından sonra olamaz, onaylı kaşe "üzerine yaz" ister; gecikmiş itiraz uyarısı', () => {
    expect(k(onayli, { itirazTipi: 'TAM', itirazVerilisTarihi: G('2026-07-21') })).toMatchObject({ ok: false, hata: 'İleri bir tarih girilemez.' })
    expect(k(onayli, { itirazTipi: 'TAM', itirazVerilisTarihi: G('2026-06-25') })).toMatchObject({ ok: false, hata: expect.stringMatching(/UYAP kayıt tarihinden sonra/) })
    const kaseli = { ...onayli, itirazVerilisTarihi: G('2026-06-23') }
    expect(k(kaseli, { itirazTipi: 'TAM', itirazVerilisTarihi: G('2026-06-22') })).toMatchObject({ ok: false, hata: expect.stringMatching(/üzerine yaz/) })
    expect(k(kaseli, { itirazTipi: 'TAM', itirazVerilisTarihi: G('2026-06-22'), ustuneYaz: true }).ok).toBe(true)
    // tebliğ 20.06 + 7 = 27.06 < kaşe yok, UYAP 24.06 → uyarı yok; kaşe yoksa İİK 67 uyarısı
    const p = k(onayli, { itirazTipi: 'TAM' })
    expect(p.ok && p.uyarilar.join(' ')).toMatch(/Kalem kaşesi tarihi girilmedi/)
    const gec = k(mevcut('b1', { itirazVar: true, itirazUyapTarihi: G('2026-07-10'), tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-20') }), { itirazTipi: 'TAM', itirazVerilisTarihi: G('2026-07-09') })
    expect(gec.ok && gec.uyarilar.join(' ')).toMatch(/gecikmiş itiraz olabilir \(İİK 65, teyit gerekli\)/)
  })
})

describe('iz yardımcıları', () => {
  it('iz ISO tarih taşır ve geri çevrilir; jsonb anahtar sırası karşılaştırmayı bozmaz', () => {
    const iz = izeCevir({ tebligTarihi: G('2026-06-25'), itirazKapsamJson: { yetki: true, borc: true } })
    expect(typeof iz.tebligTarihi).toBe('string')
    expect(izdenAlanlar(iz).tebligTarihi).toBeInstanceOf(Date)
    expect(yazilanlaAyniMi({ tebligTarihi: G('2026-06-25'), itirazKapsamJson: { borc: true, yetki: true } }, iz)).toBe(true)
    expect(yazilanlaAyniMi({ tebligTarihi: G('2026-06-26'), itirazKapsamJson: { borc: true, yetki: true } }, iz)).toBe(false)
  })
})

describe('veritabanı işlemi (sahte Prisma)', () => {
  let db: SahteDb
  let d: Record<string, any>
  let b1: Record<string, any>
  beforeEach(() => {
    db = new SahteDb()
    h.istemci = db.istemci()
    d = db.dosya(db.musteri().id, { takipTarihi: G('2026-06-11') })
    b1 = db.borclu(d.id, '[Kurgusal Borçlu Bir]')
    vi.stubEnv('EKSEN_KIPI', 'golge')
  })
  afterEach(() => vi.unstubAllEnvs())
  const adayEkle = (p: Record<string, unknown>) => db.ekle('takipOlayi', { dosyaId: d.id, tip: 'DURUM', teyit: 'ADAY', kaynakTuru: 'UYAP_EVRAK', kural: 'EK1-TEST@1', hamJson: { kaynak: 'uyap' }, borcluId: null, sonuc: null, tebligSekli: null, muhatap: null, kaynakBelgeId: null, ...p })

  it('onay: aday TEYITLI, BorcluTakip açılır (dosyaId = borçlunun dosyası), Aktivite ve onay izi yazılır, eksen yeniden hesaplanır', async () => {
    const o = adayEkle({ altTip: 'TEBLIG_SONUCU', sonuc: 'TEBLIG', tebligSekli: 'TK21_2', hukukiTarih: G('2026-06-25') })
    const r = await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', girdi: {}, bugun: BUGUN })
    expect(r).toMatchObject({ ok: true })
    const olay = db.t.takipOlayi.find((x) => x.id === o.id)!
    expect(olay).toMatchObject({ teyit: 'TEYITLI', teyitEdenId: 'av1', borcluId: b1.id })
    expect(olay.hamJson.onayIzi.borclular[0].borcluId).toBe(b1.id)
    expect(db.t.borcluTakip[0]).toMatchObject({ borcluId: b1.id, dosyaId: d.id, tebligSonucu: 'TEBLIG', guncelleyenId: 'av1' })
    expect(db.t.aktivite.some((a) => /^Tebliğ onaylandı: 25\.06\.2026/.test(a.eylem))).toBe(true)
    // süre defterine İİK 62 ÖNERİSİ düştü (onaylanan son gün yok)
    expect(db.t.sure).toHaveLength(1)
    expect(db.t.sure[0]).toMatchObject({ tur: 'IIK62', borcluId: b1.id, dosyaId: d.id, durum: 'ACIK', tetikTuru: 'TEBLIG', dayanak: 'İİK 62/1' })
    expect(db.t.sure[0].onaylananSonGun ?? null).toBeNull()
    expect(r.ok && r.uyarilar.join(' ')).toMatch(/İİK 62 önerisi süre defterine eklendi: ihtiyatlı 02\.07\.2026/)
    expect(db.t.rucuDosyasi[0].icraEksen).toBe('ITIRAZ_SURESI')
    expect(db.t.durumGecisi.some((g) => g.eksen === 'ICRA' && g.kaynakTuru === 'AVUKAT' && g.kullaniciId === 'av1')).toBe(true)
  })
  it('iki sekme: ikinci onay "az önce onaylandı/işlendi" der, hiçbir şey yazmaz', async () => {
    const o = adayEkle({ altTip: 'ITIRAZ', hukukiTarih: G('2026-06-26') })
    expect((await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', girdi: { itirazTipi: 'TAM' }, bugun: BUGUN })).ok).toBe(true)
    const r2 = await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av2', girdi: { itirazTipi: 'KISMI', itirazEdilenTutar: 10 }, bugun: BUGUN })
    expect(r2).toMatchObject({ ok: false, error: expect.stringMatching(/az önce/) })
    expect(db.t.borcluTakip[0].itirazTipi).toBe('TAM')
  })
  it('borçlu kaydı araya değişirse (iyimser kilit) işlem GERİ SARILIR: aday ADAY kalır', async () => {
    const bt = db.ekle('borcluTakip', { borcluId: b1.id, dosyaId: d.id, tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25') })
    const o = adayEkle({ altTip: 'ITIRAZ', hukukiTarih: G('2026-06-26') })
    // okunan updatedAt ile yazma anı arasında başka bir işlem satırı değiştiriyor
    const istemci = db.istemci()
    const asilFindMany = istemci.borcluTakip.findMany
    istemci.borcluTakip.findMany = (a: unknown) => {
      const sonuc = asilFindMany(a)
      return { then: (ok: (v: unknown) => unknown, red?: (e: unknown) => unknown) => sonuc.then((v: unknown) => { db.guncelle('borcluTakip', db.t.borcluTakip.find((x) => x.id === bt.id)!, { tebligSekli: 'UETS' }); return ok(v) }, red) }
    }
    h.istemci = istemci
    const r = await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', girdi: { itirazTipi: 'TAM' }, bugun: BUGUN })
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Borçlu kaydı bu arada değişti/) })
    expect(db.t.takipOlayi.find((x) => x.id === o.id)!.teyit).toBe('ADAY')
    expect(db.t.borcluTakip[0].itirazVar ?? null).toBeNull()
  })
  it('başka dosyanın adayı bu dosya üzerinden onaylanamaz', async () => {
    const baska = db.dosya(db.musteri('[Kurgusal Diğer]').id)
    const o = db.ekle('takipOlayi', { dosyaId: baska.id, tip: 'DURUM', altTip: 'ITIRAZ', teyit: 'ADAY' })
    expect(await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', girdi: {}, bugun: BUGUN })).toMatchObject({ ok: false, error: 'Gelişme bulunamadı.' })
  })
  it('ret: REDDEDILDI (silinmez), gerekçe Aktivite\'de; geri alınınca ADAY', async () => {
    const o = adayEkle({ altTip: 'ITIRAZ', hukukiTarih: G('2026-06-26') })
    expect((await adayReddet({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', gerekce: 'Harç iadesi, itiraz değil' })).ok).toBe(true)
    expect(db.t.takipOlayi.find((x) => x.id === o.id)!.teyit).toBe('REDDEDILDI')
    expect(db.t.aktivite.at(-1)!.detayJson).toMatchObject({ tur: 'ADAY_RET', gerekce: 'Harç iadesi, itiraz değil' })
    expect((await adayGeriAl({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', gerekce: 'Yanlışlıkla reddedildi' })).ok).toBe(true)
    expect(db.t.takipOlayi.find((x) => x.id === o.id)!.teyit).toBe('ADAY')
  })
  it('geri alma: borçlu alanları önceki değere döner; satır arada değiştiyse geri alma yapılmaz', async () => {
    const o = adayEkle({ altTip: 'ITIRAZ', hukukiTarih: G('2026-06-26') })
    await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', girdi: { itirazTipi: 'TAM', itirazKapsam: { yetki: true, borc: true } }, bugun: BUGUN })
    // değişmediyse geri alınır
    expect((await adayGeriAl({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', gerekce: 'Yanlış borçlu' })).ok).toBe(true)
    expect(db.t.borcluTakip[0]).toMatchObject({ itirazVar: null, itirazTipi: null, itirazKapsamJson: null })
    expect(db.t.takipOlayi.find((x) => x.id === o.id)!.hamJson.geriAlma.gerekce).toBe('Yanlış borçlu')
    // yeniden onay, sonra başka biri kapsamı değiştirir → geri alma reddedilir
    await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', girdi: { itirazTipi: 'TAM' }, bugun: BUGUN })
    db.guncelle('borcluTakip', db.t.borcluTakip[0], { itirazTipi: 'KISMI' })
    expect(await adayGeriAl({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', gerekce: 'Deneme geri alma' })).toMatchObject({ ok: false, error: expect.stringMatching(/onaydan sonra değişti/) })
    expect(db.t.takipOlayi.find((x) => x.id === o.id)!.teyit).toBe('TEYITLI')
  })
  it('TB-07 kapsam: iyimser kilit (ekranın sürümü), Aktivite izi (önceki/yazılan), eksen KISMEN_DURDU', async () => {
    const o = adayEkle({ altTip: 'ITIRAZ', hukukiTarih: G('2026-06-26') })
    await adayOnayla({ dosyaId: d.id, olayId: o.id, kullaniciId: 'av1', girdi: {}, bugun: BUGUN })
    const bt = db.t.borcluTakip[0]
    expect(bt.itirazTipi).toBeNull()
    // eski sürümle gönderim reddedilir
    expect(await itirazKapsamGir({ dosyaId: d.id, borcluId: b1.id, kullaniciId: 'av1', surum: new Date('2020-01-01'), girdi: { itirazTipi: 'TAM' }, bugun: BUGUN })).toMatchObject({ ok: false, error: expect.stringMatching(/bu arada değişti/) })
    // başka dosyanın borçlusu
    const baska = db.dosya(db.musteri('[Kurgusal Diğer]').id)
    const yabanci = db.borclu(baska.id, '[Kurgusal Yabancı]')
    expect(await itirazKapsamGir({ dosyaId: d.id, borcluId: yabanci.id, kullaniciId: 'av1', girdi: { itirazTipi: 'TAM' }, bugun: BUGUN })).toMatchObject({ ok: false, error: expect.stringMatching(/bu dosyaya ait değil/) })
    const r = await itirazKapsamGir({ dosyaId: d.id, borcluId: b1.id, kullaniciId: 'av1', surum: bt.updatedAt, girdi: { itirazTipi: 'KISMI', itirazEdilenTutar: 2500, itirazKapsam: { faiz: true } }, bugun: BUGUN })
    expect(r.ok).toBe(true)
    expect(db.t.borcluTakip[0]).toMatchObject({ itirazTipi: 'KISMI', itirazKapsamJson: { faiz: true }, guncelleyenId: 'av1' })
    expect(Number(db.t.borcluTakip[0].itirazEdilenTutar)).toBe(2500)
    const akt = db.t.aktivite.find((a) => a.detayJson?.tur === 'ITIRAZ_KAPSAM')!
    expect(akt.detayJson).toMatchObject({ borcluId: b1.id, onceki: { itirazTipi: null }, yazilan: { itirazTipi: 'KISMI', itirazEdilenTutar: 2500 } })
    expect(db.t.rucuDosyasi[0].icraEksen).toBe('KISMEN_DURDU')
  })
  it('TB-08 "Tarih gir": aday olmadan elle kayıt (kaynak ELLE) + borçlu aynası; geri alınınca kayıt geçersiz (silinmez)', async () => {
    db.ekle('borcluTakip', { borcluId: b1.id, dosyaId: d.id, itirazVar: true, itirazVerilisTarihi: G('2026-06-23') })
    const r = await alacakliyaTebligElle({ dosyaId: d.id, kullaniciId: 'yrd1', girdi: { tarih: G('2026-07-02') }, bugun: BUGUN })
    expect(r.ok).toBe(true)
    const elle = db.t.takipOlayi.find((x) => x.kaynakTuru === 'ELLE')!
    expect(elle).toMatchObject({ altTip: 'ITIRAZIN_ALACAKLIYA_TEBLIGI', teyit: 'TEYITLI', borcluId: b1.id, kural: 'EL-ALACAKLIYA-TEBLIG@1' })
    expect(db.t.borcluTakip[0]).toMatchObject({ itirazAlacakliyaTebligKaynak: 'ELLE' })
    expect(isoGun(db.t.borcluTakip[0].itirazAlacakliyaTebligTarihi)).toBe('2026-07-02')
    expect((await adayGeriAl({ dosyaId: d.id, olayId: elle.id, kullaniciId: 'av1', gerekce: 'Tarih yanlış girildi' })).ok).toBe(true)
    expect(db.t.takipOlayi.find((x) => x.id === elle.id)!.teyit).toBe('REDDEDILDI')
    expect(db.t.borcluTakip[0].itirazAlacakliyaTebligTarihi).toBeNull()
  })
})
