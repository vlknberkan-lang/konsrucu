/**
 * S15 + S23 · D1 ve D2 GERÇEK AKIŞLARI uçtan uca (kurgusal veriyle): takip → tebliğ → itiraz → arabuluculuk → dava.
 *
 * docs/04 §2'deki gün sırası: D1 UETS tebliği (ulaşma 23.06 → hukuki 28.06), kaşe 23.06 / UYAP 24.06 tam itiraz,
 * itirazın alacaklıya tebliği YOK, dosya alacağına haciz, arabuluculuk anlaşamama, Asliye Hukuk'ta derdest dava.
 * D2: 1. tebligat İADE (16.06), 2. tebligat TK 21/2 (25.06, taranmış mazbata), itiraz 26.06, itirazın alacaklıya
 * tebliği 01.07 (UETS), iki borçlu, arabuluculuk, Tüketici mahkemesinde dava.
 *
 * Kök neden kilitleri (docs/04 §3) akış boyunca denetlenir:
 *   K1 itiraz kaçmaz ("İ"), makbuz tahsilat olmaz · K2 haciz kesinleşme değildir, icra ve dava ayrı eksen ·
 *   K3 İADE tebliğ değildir, tebliğ tarihi mazbatadan · K4 İİK 67 önerisi itirazın tebliğinden ya da ihtiyatlı ·
 *   K7 borçlu bazında tebliğ/itiraz (BorcluTakip).
 * Veritabanı bellek içi sahte Prisma; kişisel veri yok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SahteDb } from './eksen-sahte-db'
import { D1_REC, D2_REC, MAZBATA, govde } from './eksen-kurgusal'

const h = vi.hoisted(() => ({ istemci: null as any, izinli: [] as string[] }))
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => h.istemci[k as string] }) }))
vi.mock('@/lib/konsrucu/uyap-auth', () => ({
  uyapKimlik: vi.fn(async () => ({ userId: null, izinli: h.izinli })),
  corsJson: (body: unknown, status = 200) => ({ status, body }),
  preflight: () => ({ status: 204 }),
}))
vi.mock('@/lib/konsrucu/onemli-olay', async (o) => ({ ...(await o<typeof import('@/lib/konsrucu/onemli-olay')>()), onemliOlayTespit: vi.fn() }))
vi.mock('@/lib/konsrucu/teblig-gorev', async (o) => ({
  ...(await o<typeof import('@/lib/konsrucu/teblig-gorev')>()), tebligGorevleriOlustur: vi.fn(), tebligGorevleriKapat: vi.fn(),
}))

import { POST } from '@/app/api/uyap/senkron/route'
import { adayGeriAl, adayOnayla, adayReddet } from '@/lib/konsrucu/eksen/aday-onay-db'
import { eksenYenidenHesapla } from '@/lib/konsrucu/eksen/kaydet'
import { golgeEksenYukle, olayPaneliYukle } from '@/lib/konsrucu/eksen/yukle'
import { isoGundenTarih, isoGun } from '@/lib/konsrucu/eksen/norm'
import type { GelismeKartiVM } from '@/lib/konsrucu/eksen/gorunum'

let db: SahteDb
let M: string
const AVUKAT = 'avukat-1'
const BUGUN = isoGundenTarih('2026-07-20')!

const gonder = async (body: unknown) => (await POST(new Request('http://yerel/api/uyap/senkron', { method: 'POST', body: JSON.stringify(body) }))) as unknown as { status: number; body: any }
const dosyaOku = (id: string) => db.t.rucuDosyasi.find((d) => d.id === id)!
const bt = (borcluId: string) => db.t.borcluTakip.find((x) => x.borcluId === borcluId)
const kart = (kartlar: GelismeKartiVM[], altTip: string) => kartlar.find((k) => k.altTip === altTip)!
const onayla = (dosyaId: string, k: GelismeKartiVM, ek: Record<string, unknown> = {}) => adayOnayla({
  dosyaId, olayId: k.id, kullaniciId: AVUKAT, bugun: BUGUN,
  girdi: {
    altTip: k.oneri.altTip, borcluId: k.oneri.borcluId, tarih: isoGundenTarih(k.oneri.tarih), sonuc: k.oneri.sonuc,
    tebligSekli: k.oneri.tebligSekli, uetsUlasmaTarihi: isoGundenTarih(k.oneri.uetsUlasmaTarihi), ...ek,
  },
})
const panel = async (dosyaId: string) => (await olayPaneliYukle(dosyaId, M, BUGUN))!

beforeEach(() => {
  db = new SahteDb()
  h.istemci = db.istemci()
  M = db.musteri().id
  h.izinli = [M]
  vi.stubEnv('EKSEN_KIPI', 'golge')
})
afterEach(() => vi.unstubAllEnvs())

describe('D1 akışı: kasko, kamu idaresi borçlu, UETS tebliğ, tam itiraz, alacaklıya tebliğ yok', () => {
  it('takip → tebliğ → itiraz → arabuluculuk → dava', async () => {
    // Takip açıldı (kopilot/elle) — S21 kapsamı dışı; dosya TAKİP AÇILDI
    const d = db.dosya(M, { durum: 'TAKIP_ACILDI', takipTarihi: isoGundenTarih('2026-06-21') })
    const b1 = db.borclu(d.id, '[Kurgusal Borçlu İdare] Belediye Başkanlığı', 'KAMU')
    db.ekle('belge', { dosyaId: d.id, dosyaAdi: 'E-Tebligat Mazbatası 2026-06-29.pdf', belgeTarihi: new Date('2026-06-29'), kaynak: 'UYAP_ICRA', extractedText: MAZBATA.d1Uets, metinYontemi: 'METIN_KATMANI' })

    // 1) UYAP senkronu (sahte eklenti 1.9)
    expect((await gonder(govde(d.id, D1_REC))).status).toBe(200)
    expect(dosyaOku(d.id).durum).toBe('ITIRAZ') // K1: "İ" itirazı yakalandı; riski artıran yönde
    expect(dosyaOku(d.id).icraEksen).toBe('DURDU_ITIRAZ')
    expect(dosyaOku(d.id).eksenJson.icra.teyit).toBe('TEYITSIZ')

    // 2) Kartlar: tebliğ adayı mazbatayla zenginleşti (UETS, ulaşma + 5 gün, borçlu eşleşti)
    let p = await panel(d.id)
    expect(p.ipucu?.kural).toBe('TB-01')
    const teblig = kart(p.bekleyen, 'TEBLIG_SONUCU')
    expect(teblig.baslik).toBe('Ödeme emri [Kurgusal Borçlu İdare] Belediye Başkanlığı 28.06.2026 tarihinde UETS (e-tebliğ) ile tebliğ edildi.')
    expect(teblig.kaynak).toMatch(/E-Tebligat Mazbatası 2026-06-29\.pdf/)
    expect(teblig.alinti).toMatch(/ulaştığı tarih: 23\.06\.2026/)
    expect(teblig.oneri).toMatchObject({ borcluId: b1.id, sonuc: 'TEBLIG', tebligSekli: 'UETS', tarih: '2026-06-28', uetsUlasmaTarihi: '2026-06-23' })
    expect(teblig.etki).toBe('İİK 62 önerilen son gün 05.07.2026 açılır (teyit gerekli).')
    expect(teblig.bekleme).toMatch(/Tebliğ bekleniyor · tebliğ sinyali \(teyitsiz\)/)
    const hacizKartlari = p.bekleyen.filter((k) => k.altTip === 'MUVEKKIL_ALACAGINA_HACIZ')
    expect(hacizKartlari).toHaveLength(2)
    expect(hacizKartlari[0].etki).toBeNull() // K2: haciz süre/durum etkisi göstermez

    // 3) Avukat tebliği onaylar → borçlu satırına yazılır
    const r1 = await onayla(d.id, teblig)
    expect(r1.ok).toBe(true)
    expect(bt(b1.id)).toMatchObject({ tebligSonucu: 'TEBLIG', tebligSekli: 'UETS', dosyaId: d.id })
    expect(isoGun(bt(b1.id)!.tebligTarihi)).toBe('2026-06-28')
    expect(isoGun(bt(b1.id)!.uetsUlasmaTarihi)).toBe('2026-06-23')

    // 4) Avukat itirazı kalem kaşesi ve kapsamla onaylar (Düzelt)
    p = await panel(d.id)
    const itiraz = kart(p.bekleyen, 'ITIRAZ')
    expect(itiraz.uyarilar.join(' ')).toMatch(/kalem kaşesi/)
    const r2 = await onayla(d.id, itiraz, { itirazTipi: 'TAM', itirazVerilisTarihi: isoGundenTarih('2026-06-23'), itirazKapsam: { yetki: true, borc: true, faiz: true, feriler: true } })
    expect(r2.ok).toBe(true)
    expect(bt(b1.id)).toMatchObject({ itirazVar: true, itirazTipi: 'TAM' })
    expect(isoGun(bt(b1.id)!.itirazVerilisTarihi)).toBe('2026-06-23')
    expect(isoGun(bt(b1.id)!.itirazUyapTarihi)).toBe('2026-06-24')

    // durum metni adayı artık fazlalık: avukat "itiraz ayrıca onaylandı" diye reddeder (silinmez)
    const dm = kart((await panel(d.id)).bekleyen, 'DURDURMA_ITIRAZ')
    expect((await adayReddet({ dosyaId: d.id, olayId: dm.id, kullaniciId: AVUKAT, gerekce: 'İtiraz evraktan onaylandı' })).ok).toBe(true)
    expect(db.olaylar(d.id).find((o) => o.id === dm.id)!.teyit).toBe('REDDEDILDI')

    // 5) Eksen onaylı; borçlu bloğu: İİK 62 süresinde, İİK 67 ihtiyatlı (alacaklıya tebliğ yok), İİK 78 askıda; Şimdi TB-08
    expect(dosyaOku(d.id).icraEksen).toBe('DURDU_ITIRAZ')
    expect(dosyaOku(d.id).eksenJson.icra).toMatchObject({ teyit: 'TEYITLI', kaynakTuru: 'AVUKAT' })
    p = await panel(d.id)
    expect(p.ipucu?.kural).toBe('TB-08')
    const blok = p.borclular[0]
    expect(blok.alacakliyaTebligEksik).toBe(true)
    expect(blok.turEtiket).toBe('Kamu idaresi')
    const [iik62, iik67, iik78] = blok.sureler
    expect(iik62.metin).toMatch(/önerilen 05\.07\.2026 · itiraz süresinde görünüyor \(teyit gerekli\)/)
    expect(iik62.uyarilar.join(' ')).toMatch(/hafta sonuna/) // uzatılmış gün gösterilmez (güvenli taraf)
    expect(iik67.metin).toMatch(/^ihtiyatlı 23\.06\.2027 · itiraz tarihi 23\.06\.2026 \+ 1 yıl/)
    expect(iik78.metin).toMatch(/askıda/)
    expect(blok.satirlar.find((s) => s.etiket === 'İtiraz')!.metin).toMatch(/^tam \(yetki, borç, faiz, fer'iler\) · kaşe 23\.06\.2026 · UYAP kaydı 24\.06\.2026/)

    // 6) UYAP kesinleşme sinyali gelse de hiçbir şey kesinleşmez
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [{ tip: 'KESINLESTI', tarih: '2026-07-15', aciklama: 'Kesinleşme Bilgisi Kaydedildi' }] })
    expect(dosyaOku(d.id).durum).toBe('ITIRAZ')
    expect(dosyaOku(d.id).icraEksen).toBe('DURDU_ITIRAZ')

    // 7) Arabuluculuk (S26 kaydı): başvuru → DEVAM; son tutanak anlaşamama (onaylı) → SON_TUTANAK_DIGER, dava HAZIRLIK
    const asamaA = db.ekle('asama', { dosyaId: d.id, tur: 'ARABULUCULUK', durum: 'DEVAM', sonuc: null })
    const arb = db.ekle('arabuluculuk', { asamaId: asamaA.id, dosyaId: d.id, tur: 'DAVA_SARTI', basvuruTarihi: isoGundenTarih('2026-07-06'), sonTutanakTarihi: null, sonuc: null, onayAt: null, silindiAt: null })
    await eksenYenidenHesapla(d.id, { kaynakTuru: 'AVUKAT', kullaniciId: AVUKAT, sebep: 'Arabuluculuk başvurusu' })
    expect(dosyaOku(d.id).arabEksen).toBe('DEVAM')
    Object.assign(db.t.arabuluculuk.find((x) => x.id === arb.id)!, { sonTutanakTarihi: isoGundenTarih('2026-07-13'), sonuc: 'ANLASAMAMA', onayAt: new Date() })
    await eksenYenidenHesapla(d.id, { kaynakTuru: 'AVUKAT', kullaniciId: AVUKAT, sebep: 'Son tutanak onaylandı' })
    expect(dosyaOku(d.id)).toMatchObject({ arabEksen: 'SON_TUTANAK_DIGER', davaEksen: 'HAZIRLIK' })

    // 8) Dava (S27 kaydı): Asliye Hukuk'ta itirazın iptali davası derdest; icra ekseni AYRI kalır (K2)
    const asamaD = db.ekle('asama', { dosyaId: d.id, tur: 'DAVA', durum: 'DEVAM', sonuc: null })
    db.ekle('dava', { asamaId: asamaD.id, dosyaId: d.id, tur: 'ITIRAZIN_IPTALI', rolumuz: 'DAVACI', mahkemeTuru: 'ASLIYE_HUKUK', durum: 'DERDEST', derece: 1, acilisTarihi: isoGundenTarih('2026-08-07'), kesinlesmeTarihi: null, kesinlesmeBelgeId: null, kararOnayAt: null, silindiAt: null })
    await eksenYenidenHesapla(d.id, { kaynakTuru: 'AVUKAT', kullaniciId: AVUKAT, sebep: 'Dava kaydı' })
    const son = await golgeEksenYukle(d.id, M)
    expect(son!.rozetler.map((r) => `${r.eksen}:${r.deger}`)).toEqual(['İCRA:DURDU_ITIRAZ', 'ARB:SON_TUTANAK_DIGER', 'DAVA:DERDEST'])
    expect(son!.celiski).toBeNull() // eski durum ITIRAZ ile uyumlu

    // İz: eksen geçişleri gölge yazıldı; hiçbir iz KESİNLEŞTİ'ye gitmedi; avukat eylemleri AVUKAT kaynaklı
    const gecis = db.t.durumGecisi.filter((g) => g.dosyaId === d.id)
    expect(gecis.some((g) => g.yeni === 'KESINLESTI')).toBe(false)
    expect(gecis.filter((g) => g.eksen === 'DAVA').map((g) => g.yeni)).toEqual(['YOK', 'HAZIRLIK', 'DERDEST'])
    expect(gecis.some((g) => g.eksen === 'ICRA' && g.teyit === 'TEYITLI' && g.kaynakTuru === 'AVUKAT')).toBe(true)
    // K1: tahsilat yok; makbuz tahsilat sinyali
    expect(db.olaylar(d.id).some((o) => o.tip === 'TAHSILAT' || o.altTip === 'TAHSILAT_BORCLUDAN')).toBe(false)
  })
})

describe('D2 akışı: iki borçlu, İADE + TK 21/2 (taranmış mazbata), itiraz, itirazın alacaklıya tebliği', () => {
  it('takip → İADE → TK 21/2 tebliğ → itiraz → alacaklıya tebliğ → kısmen durdu → arabuluculuk → dava; geri alma', async () => {
    const d = db.dosya(M, { durum: 'TAKIP_ACILDI', takipTarihi: isoGundenTarih('2026-06-11') })
    const b1 = db.borclu(d.id, '[Kurgusal Borçlu Bir]')
    const b2 = db.borclu(d.id, '[Kurgusal Borçlu İki]')
    db.ekle('belge', { dosyaId: d.id, dosyaAdi: 'Tebligat Mazbatası 2026-06-18.pdf', belgeTarihi: new Date('2026-06-18'), kaynak: 'UYAP_ICRA', extractedText: MAZBATA.d2Iade, metinYontemi: 'METIN_KATMANI' })
    db.ekle('belge', { dosyaId: d.id, dosyaAdi: 'Tebligat Mazbatası 2026-06-30.pdf', belgeTarihi: new Date('2026-06-30'), kaynak: 'UYAP_ICRA', extractedText: MAZBATA.d2Tk21Ocr, metinYontemi: 'OCR', metinGuven: 0.55 })
    db.ekle('belge', { dosyaId: d.id, dosyaAdi: 'E-Tebligat Mazbatası 2026-07-01.pdf', belgeTarihi: new Date('2026-07-01'), kaynak: 'UYAP_ICRA', extractedText: MAZBATA.d2Alacakliya, metinYontemi: 'METIN_KATMANI' })

    await gonder(govde(d.id, D2_REC))
    let p = await panel(d.id)

    // S23 kabul 1: 1. tebligat kartı "tebliğ edilemedi (İADE)"; süre açılmaz
    const iade = kart(p.bekleyen, 'TEBLIG_IADE')
    expect(iade.baslik).toBe('Tebligat [Kurgusal Borçlu Bir] için tebliğ edilemedi (İADE), 18.06.2026.')
    expect(iade.etki).toMatch(/Süre başlamaz/)
    expect(iade.alinti).toMatch(/Bila tebliğ iade/)
    expect(iade.alinti).not.toMatch(/12345678950/) // TCKN ekranda maskeli
    expect((await onayla(d.id, iade)).ok).toBe(true)
    expect(bt(b1.id)).toMatchObject({ tebligSonucu: 'IADE', tebligTarihi: null })
    p = await panel(d.id)
    expect(p.borclular.find((b) => b.borcluId === b1.id)!.sureler[0].metin).toMatch(/Süre başlamadı/)

    // S23 kabul 2: 2. tebligat (TK 21/2, taranmış mazbatadan) onaylanır → borçlu satırına yazılır; İİK 62 önerisi
    const tk = kart(p.bekleyen, 'TEBLIG_SONUCU')
    expect(tk.oneri).toMatchObject({ borcluId: b1.id, sonuc: 'TEBLIG', tebligSekli: 'TK21_2', tarih: '2026-06-25' })
    expect(tk.kaynak).toMatch(/OCR/)
    expect(tk.uyarilar.join(' ')).toMatch(/OCR ile okundu ve güven düşük/)
    expect(tk.alinti).not.toMatch(/0532 111 22 33/) // telefon maskeli
    expect((await onayla(d.id, tk)).ok).toBe(true)
    expect(bt(b1.id)).toMatchObject({ tebligSonucu: 'TEBLIG', tebligSekli: 'TK21_2' })
    p = await panel(d.id)
    // İİK 62: tebliğ 25.06 + 7 = 02.07.2026 (önerilen); onay bekleyen UYAP itirazı varken "itiraz yok mu?" denmez
    expect(p.borclular.find((b) => b.borcluId === b1.id)!.sureler[0].metin).toBe('önerilen 02.07.2026 · UYAP itiraz sinyali var: itirazı onaylayın (teyit gerekli)')

    // S23 kabul 3: itiraz (tam, kaşe tarihi) onaylanır → borçlu 1 "Durdu - itiraz (onaylı)"
    const itiraz = kart(p.bekleyen, 'ITIRAZ')
    expect((await onayla(d.id, itiraz, { borcluIdler: [b1.id], itirazTipi: 'TAM', itirazVerilisTarihi: isoGundenTarih('2026-06-26') })).ok).toBe(true)
    p = await panel(d.id)
    expect(p.borclular.find((b) => b.borcluId === b1.id)!.eksen).toMatchObject({ deger: 'DURDU_ITIRAZ', teyit: 'onaylı' })

    // itirazın size tebliği (UETS mazbatası, okunduğu tarih 01.07) → İİK 67 önerisi 01.07.2027
    const alacakliya = kart(p.bekleyen, 'ITIRAZIN_ALACAKLIYA_TEBLIGI')
    expect(alacakliya.oneri.tarih).toBe('2026-07-01')
    expect(alacakliya.etki).toBe('İİK 67 önerilen son gün 01.07.2027 (teyit gerekli).')
    expect((await onayla(d.id, alacakliya)).ok).toBe(true) // borçlu kendiliğinden: itirazı onaylı tek borçlu
    expect(isoGun(bt(b1.id)!.itirazAlacakliyaTebligTarihi)).toBe('2026-07-01')
    expect(bt(b1.id)!.itirazAlacakliyaTebligKaynak).toBe('UETS_MAZBATA')
    p = await panel(d.id)
    expect(p.borclular.find((b) => b.borcluId === b1.id)!.sureler[1].metin).toMatch(/^önerilen 01\.07\.2027/)

    // S23 kabul 5: iki borçlu farklı durumda → "Kısmen durdu"
    const dm = kart(p.bekleyen, 'DURDURMA_ITIRAZ')
    await adayReddet({ dosyaId: d.id, olayId: dm.id, kullaniciId: AVUKAT, gerekce: 'Borçlu 1 itirazı onaylandı' })
    expect(dosyaOku(d.id).icraEksen).toBe('KISMEN_DURDU')
    expect(p.borclular.find((b) => b.borcluId === b2.id)!.satirlar[0].metin).toBe('Tebliğ bekleniyor')

    // Yanlış onay "geri al" ile çevrilir; iz korunur, önceki değer geri gelir
    const itirazId = itiraz.id
    expect((await adayGeriAl({ dosyaId: d.id, olayId: itirazId, kullaniciId: AVUKAT, gerekce: 'Kaşe tarihi yanlış girildi' })).ok).toBe(true)
    expect(bt(b1.id)).toMatchObject({ itirazVar: null, itirazVerilisTarihi: null, itirazUyapTarihi: null })
    expect(isoGun(bt(b1.id)!.itirazAlacakliyaTebligTarihi)).toBe('2026-07-01') // ayrı onay, dokunulmadı
    expect(db.olaylar(d.id).find((o) => o.id === itirazId)).toMatchObject({ teyit: 'ADAY' })
    expect(db.t.aktivite.some((a) => /Onay geri alındı: Kaşe tarihi yanlış girildi/.test(a.eylem))).toBe(true)
    // itiraz adayı yeniden ADAY: riski artıran sinyal olarak yine görünür (teyitsiz)
    expect(dosyaOku(d.id).eksenJson.borclular.find((b: { borcluId: string }) => b.borcluId === b1.id)).toMatchObject({ deger: 'DURDU_ITIRAZ', teyit: 'TEYITSIZ' })
    // yeniden onay
    p = await panel(d.id)
    expect((await onayla(d.id, kart(p.bekleyen, 'ITIRAZ'), { borcluIdler: [b1.id], itirazTipi: 'TAM', itirazVerilisTarihi: isoGundenTarih('2026-06-26') })).ok).toBe(true)

    // Arabuluculuk (başvuru Pazar gününe denk — uyarı S26'da) ve Tüketici mahkemesinde basit usul dava
    const asamaA = db.ekle('asama', { dosyaId: d.id, tur: 'ARABULUCULUK', durum: 'SONUCLANDI', sonuc: 'anlasilmadi' })
    db.ekle('arabuluculuk', { asamaId: asamaA.id, dosyaId: d.id, tur: 'DAVA_SARTI', basvuruTarihi: isoGundenTarih('2026-06-28'), sonTutanakTarihi: isoGundenTarih('2026-07-20'), sonuc: 'ANLASAMAMA', onayAt: new Date(), silindiAt: null })
    const asamaD = db.ekle('asama', { dosyaId: d.id, tur: 'DAVA', durum: 'DEVAM', sonuc: null })
    db.ekle('dava', { asamaId: asamaD.id, dosyaId: d.id, tur: 'ITIRAZIN_IPTALI', rolumuz: 'DAVACI', mahkemeTuru: 'TUKETICI', usul: 'BASIT', durum: 'DERDEST', derece: 1, acilisTarihi: isoGundenTarih('2026-08-12'), kesinlesmeTarihi: null, kesinlesmeBelgeId: null, kararOnayAt: null, silindiAt: null })
    await eksenYenidenHesapla(d.id, { kaynakTuru: 'AVUKAT', kullaniciId: AVUKAT })
    expect(dosyaOku(d.id)).toMatchObject({ icraEksen: 'KISMEN_DURDU', arabEksen: 'SON_TUTANAK_DIGER', davaEksen: 'DERDEST' })
    // eski durum hiç KESİNLEŞTİ olmadı
    expect(db.t.durumGecisi.some((g) => g.eksen === 'ESKI_DURUM' && g.yeni === 'KESINLESTI')).toBe(false)
  })
})

describe('docs/04 §3 kök nedenleri tekrar etmez (K1–K4, K7)', () => {
  it('K1 "İ" itirazı yakalanır; evrak adından tahsilat doğmaz · K2 haciz kesinleştirmez, olaylar tarih sırasıyla · K3 tebliğ tarihi yükleme günü değil, İADE tebliğ değil · K4 UYAP kapanışı süre görevini kapatmaz · K7 borçlu bazında kayıt', async () => {
    const { tebligGorevleriKapat } = await import('@/lib/konsrucu/teblig-gorev')
    vi.mocked(tebligGorevleriKapat).mockClear()
    const d = db.dosya(M, { durum: 'TAKIP_ACILDI', takipTarihi: isoGundenTarih('2026-06-21') })
    const b1 = db.borclu(d.id, '[Kurgusal Borçlu Bir]')
    const b2 = db.borclu(d.id, '[Kurgusal Borçlu İki]')
    await gonder(govde(d.id, D1_REC))
    const ol = db.olaylar(d.id)
    // K1
    expect(ol.some((o) => o.altTip === 'ITIRAZ')).toBe(true)
    expect(ol.some((o) => o.tip === 'TAHSILAT' || o.altTip === 'TAHSILAT_BORCLUDAN')).toBe(false)
    // K2
    expect(dosyaOku(d.id).durum).toBe('ITIRAZ')
    expect(ol.filter((o) => o.altTip === 'MUVEKKIL_ALACAGINA_HACIZ').length).toBe(2)
    expect(db.t.durumGecisi.some((g) => g.yeni === 'KESINLESTI')).toBe(false)
    // K3: E-Tebligat mazbatasının UYAP'a yüklendiği gün 29.06; aday tebliğ tarihi 28.06 (tebliğ sütunu)
    expect(ol.filter((o) => o.altTip === 'TEBLIG_SONUCU').map((o) => isoGun(o.hukukiTarih))).toEqual(['2026-06-28'])
    await gonder(govde(d.id, D2_REC))
    expect(db.olaylar(d.id).find((o) => o.altTip === 'TEBLIG_IADE')!.sonuc).toBe('IADE')
    // K4: UYAP'tan gelen kapanış görev kapatmaz, durumu değiştirmez
    await gonder({ dosyaId: d.id, icraDosyaNo: '2026/0001', olaylar: [{ tip: 'KAPANDI', tarih: '2026-07-18', aciklama: 'Dosya kapandı' }] })
    expect(vi.mocked(tebligGorevleriKapat).mock.calls.filter((c) => c[1] === 'KAPANDI')).toHaveLength(0)
    expect(dosyaOku(d.id).durum).toBe('ITIRAZ')
    // K7: iki borçlu ayrı izlenir
    const p = await panel(d.id)
    expect(p.borclular.map((b) => b.borcluId).sort()).toEqual([b1.id, b2.id].sort())
    expect(dosyaOku(d.id).eksenJson.borclular).toHaveLength(2)
  })
})

describe('yükleyici kapsamı', () => {
  it('başka müvekkilin dosyası için panel ve gölge eksen yüklenmez', async () => {
    const baska = db.dosya(db.musteri('[Kurgusal Diğer]').id)
    expect(await olayPaneliYukle(baska.id, M)).toBeNull()
    expect(await golgeEksenYukle(baska.id, M)).toBeNull()
  })
})
