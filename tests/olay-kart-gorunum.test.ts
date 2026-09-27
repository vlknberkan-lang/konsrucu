/**
 * S23 · Kart ve borçlu bloğu GÖRÜNÜM MODELLERİ (lib/konsrucu/eksen/gorunum.ts, sure-onizleme.ts).
 * 06 §2(e) taslakları: kart cümlesi, Kaynak, Alıntı, Kural, Etkisi, "Onaylanana kadar …"; borçlu bloğu satırları;
 * İİK 62/67/78 önerileri "teyit gerekli"; Şimdi ipucu TB-01/05/07/08/02; gölge eksen ve çelişki. Kişisel veri yok.
 */
import { describe, it, expect } from 'vitest'
import { borcluBloku, gelismeKarti, golgeEksen, olayPaneli, tbIpucu, type PanelBorclu, type PanelOlay } from '@/lib/konsrucu/eksen/gorunum'
import { iik62Onizle, iik67Onizle, iik78Onizle, sureOnizle } from '@/lib/konsrucu/eksen/sure-onizleme'
import { eksenTuret } from '@/lib/konsrucu/eksen/turet'
import { isoGundenTarih } from '@/lib/konsrucu/eksen/norm'

const G = (s: string) => isoGundenTarih(s)!
const BUGUN = G('2026-07-20')
let n = 0
const olay = (altTip: string, p: Partial<PanelOlay> = {}): PanelOlay => ({
  id: `o${++n}`, altTip, teyit: 'ADAY', borcluId: null, hukukiTarih: G('2026-06-25'), tarih: G('2026-06-25'), sonuc: null, tebligSekli: null,
  muhatap: null, kaynakBelgeId: null, kaynakTuru: 'UYAP_EVRAK', kural: 'EK1-TEBLIG@1', aciklama: 'Tebligat Mazbatası', tutar: null,
  createdAt: G('2026-07-19'), teyitAt: null, hamJson: { kaynak: 'uyap' }, ...p,
})
const borclu = (id: string, ad: string, takip: Partial<NonNullable<PanelBorclu['takip']>> | null = null, tur: string | null = 'GERCEK'): PanelBorclu => ({
  id, adUnvan: ad, tur,
  takip: takip ? {
    id: `bt-${id}`, updatedAt: new Date('2026-07-01'), tebligTarihi: null, tebligSekli: null, tebligSonucu: null, uetsUlasmaTarihi: null,
    itirazVar: null, itirazVerilisTarihi: null, itirazUyapTarihi: null, itirazTipi: null, itirazKapsamJson: null, itirazEdilenTutar: null,
    itirazAlacakliyaTebligTarihi: null, itirazAlacakliyaTebligKaynak: null, ...takip,
  } : null,
})
const B1 = borclu('b1', '[Kurgusal Borçlu Bir]')
const ctx = { borclular: [B1], belgeler: [], bagliBelgeler: new Set<string>(), bugun: BUGUN }

describe('gelişme kartı', () => {
  it('tebliğ kartı: cümle, etki (İİK 62 önerilen, teyit gerekli), bekleme satırı, kural sürümü', () => {
    const k = gelismeKarti(olay('TEBLIG_SONUCU', { sonuc: 'TEBLIG', tebligSekli: 'TK21_2', borcluId: 'b1' }), ctx)
    expect(k.baslik).toBe('Ödeme emri [Kurgusal Borçlu Bir] 25.06.2026 tarihinde TK 21/2 ile tebliğ edildi.')
    expect(k.etki).toBe('İİK 62 önerilen son gün 02.07.2026 açılır (teyit gerekli).')
    expect(k.bekleme).toMatch(/tebliğ sinyali \(teyitsiz\)/)
    expect(k.kural).toBe('EK1-TEBLIG (sürüm 1)')
    expect(k.yol).toBe('TEBLIG')
    expect(k.oncelik).toBe(2)
    expect(k.oneri).toMatchObject({ borcluId: 'b1', tarih: '2026-06-25', sonuc: 'TEBLIG', tebligSekli: 'TK21_2' })
  })
  it('sonucu belirsiz UYAP tebliğ kaydı: "mazbatadan kontrol edin"', () => {
    expect(gelismeKarti(olay('TEBLIG_SONUCU', { sonuc: 'BELIRSIZ' }), ctx).baslik).toMatch(/sonucu ve tarihi mazbatadan kontrol edin/)
  })
  it('itiraz kartı UYAP kayıt tarihini ayırır ve kaşe uyarısı taşır; durum metni kartı TB-06 ipucu verir', () => {
    const k = gelismeKarti(olay('ITIRAZ', { hukukiTarih: G('2026-06-24') }), ctx)
    expect(k.baslik).toBe('[Kurgusal Borçlu Bir] ödeme emrine itiraz etti (UYAP kaydı 24.06.2026).')
    expect(k.uyarilar.join(' ')).toMatch(/kalem kaşesi/)
    const dm = gelismeKarti(olay('DURDURMA_ITIRAZ', { hukukiTarih: null, kaynakTuru: 'UYAP_YAPISAL' }), ctx)
    expect(dm.oneri.tarih).toBeNull() // tarih uydurulmaz
    expect(dm.kaynak).toBe('UYAP durum metni')
    expect(dm.uyarilar.join(' ')).toMatch(/TB-06/)
  })
  it('3 günü aşan aday kırmızı (risk)', () => {
    const k = gelismeKarti(olay('ITIRAZ', { createdAt: G('2026-07-10') }), ctx)
    expect(k.gecikti).toBe(true)
    expect(k.rol).toBe('risk')
    expect(gelismeKarti(olay('ITIRAZ', { createdAt: G('2026-07-18') }), ctx).rol).toBe('onay')
  })
  it('tahsilat ve dava sinyali bu kartta onaylanmaz; kesinleşme etkisi "yalnız avukat"', () => {
    const t = gelismeKarti(olay('TAHSILAT_BORCLUDAN', { kaynakTuru: 'UYAP_YAPISAL', aciklama: 'Tahsilat (UYAP Yatan Para) 1.000,00 TL', tutar: 1000 }), ctx)
    expect(t).toMatchObject({ yol: 'YOK', yokNedeni: 'Tahsilat onayı Para panelinden yapılır.', kaynak: 'UYAP hesap özeti (Yatan Para)', tutar: 1000 })
    expect(gelismeKarti(olay('KESINLESME_SERHI'), ctx).etki).toMatch(/yalnız avukat/)
  })
  it('evrak açıklaması kaynakta kişisel verisi maskeli gösterilir', () => {
    const k = gelismeKarti(olay('DIGER', { aciklama: 'Muhatap TCKN 12345678950 tel 0532 111 22 33' }), ctx)
    expect(k.kaynak).not.toMatch(/12345678950|0532 111 22 33/)
    expect(k.baslik).not.toMatch(/12345678950/)
  })
  it('alacaklı vekiline giden tebliğ kartı "itirazın size tebliği" olarak gösterilir ve İİK 67 önerisi verir', () => {
    const k = gelismeKarti(olay('TEBLIG_SONUCU', { muhatap: 'ALACAKLI_VEKILI', hukukiTarih: G('2026-07-01') }), ctx)
    expect(k.altTip).toBe('ITIRAZIN_ALACAKLIYA_TEBLIGI')
    expect(k.etki).toBe('İİK 67 önerilen son gün 01.07.2027 (teyit gerekli).')
  })
})

describe('süre önizlemeleri (öneri; kesinleştirilmez)', () => {
  const g = (p: Record<string, unknown>) => ({ tebligTarihi: null, tebligSonucu: null, itirazVar: null, itirazVerilisTarihi: null, itirazUyapTarihi: null, itirazAlacakliyaTebligTarihi: null, ...p })
  it('D2: tebliğ 25.06 (TK 21/2) → İİK 62 önerilen 02.07.2026; itiraz 26.06 süresinde', () => {
    const s = iik62Onizle(g({ tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25'), itirazVar: true, itirazVerilisTarihi: G('2026-06-26') }), BUGUN)
    expect(s.metin).toBe('önerilen 02.07.2026 · itiraz süresinde görünüyor (teyit gerekli)')
    expect(s.uyarilar).toEqual([])
  })
  it('D1: UETS tebliğ 28.06 → İİK 62 önerilen 05.07.2026 (Pazar): uzatılmış gün gösterilmez, uyarı yazılır', () => {
    const s = iik62Onizle(g({ tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-28') }), G('2026-06-29'))
    expect(s.metin).toBe('önerilen 05.07.2026 (teyit gerekli)')
    expect(s.rol).toBe('risk') // ≤ 14 gün
    expect(s.uyarilar.join(' ')).toMatch(/hafta sonuna/)
  })
  it('itiraz tebliğden 7 gün sonra: gecikmiş itiraz olabilir (İİK 65)', () => {
    expect(iik62Onizle(g({ tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-10'), itirazVar: true, itirazUyapTarihi: G('2026-06-24') }), BUGUN).metin).toMatch(/İİK 65/)
  })
  it('İADE: süre başlamadı; 7 gün geçti itiraz yok: kesinleşme otomatik yazılmaz', () => {
    expect(iik62Onizle(g({ tebligSonucu: 'IADE' }), BUGUN).metin).toMatch(/Süre başlamadı/)
    expect(iik62Onizle(g({ tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25') }), BUGUN).metin).toMatch(/kesinleşme otomatik yazılmaz/)
  })
  it('İİK 67: D1 ihtiyatlı 23.06.2027 (tebliğ yok); D2 önerilen 01.07.2027 (itirazın tebliğinden)', () => {
    expect(iik67Onizle(g({ itirazVar: true, itirazVerilisTarihi: G('2026-06-23'), itirazUyapTarihi: G('2026-06-24') }), BUGUN).metin)
      .toMatch(/^ihtiyatlı 23\.06\.2027 · itiraz tarihi 23\.06\.2026 \+ 1 yıl/)
    expect(iik67Onizle(g({ itirazVar: true, itirazAlacakliyaTebligTarihi: G('2026-07-01') }), BUGUN).metin).toMatch(/^önerilen 01\.07\.2027/)
  })
  it('İİK 67: kaşe yoksa UYAP tarihinden, "daha erken olabilir" uyarısıyla; tarih yoksa hesaplanmaz (risk)', () => {
    const s = iik67Onizle(g({ itirazVar: true, itirazUyapTarihi: G('2026-06-24') }), BUGUN)
    expect(s.uyarilar.join(' ')).toMatch(/daha erken olabilir/)
    expect(iik67Onizle(g({ itirazVar: true }), BUGUN)).toMatchObject({ rol: 'risk', sonGun: null })
  })
  it('İİK 78: itirazda askıda; itiraz yoksa tebliğ + 1 yıl', () => {
    expect(iik78Onizle(g({ itirazVar: true }), BUGUN).metin).toMatch(/askıda/)
    expect(iik78Onizle(g({ tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25') }), BUGUN).metin).toMatch(/^önerilen 25\.06\.2027/)
  })
  it('hiçbir satır "onaylanan" son gün yazmaz (onay S24 süre defterinde)', () => {
    const hepsi = sureOnizle(g({ tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25'), itirazVar: true, itirazAlacakliyaTebligTarihi: G('2026-07-01') }), BUGUN)
    expect(hepsi.every((s) => !/onaylanan: \d/.test(s.metin))).toBe(true)
    expect(hepsi.filter((s) => s.sonGun).every((s) => /teyit gerekli/.test(s.metin))).toBe(true)
  })
})

describe('borçlu bloğu ve Şimdi ipucu', () => {
  it('onaylı İADE: tebliğ satırı risk; ipucu TB-05', () => {
    const b = borcluBloku(borclu('b1', 'X', { tebligSonucu: 'IADE' }), { olaylar: [], eksen: null, bugun: BUGUN })
    expect(b.satirlar[0]).toMatchObject({ etiket: 'Ödeme emri tebliği', rol: 'risk' })
    expect(tbIpucu([b], [])).toMatchObject({ kural: 'TB-05' })
  })
  it('onaylı itiraz, alacaklıya tebliğ yok: satır risk, [Tarih gir] açılır; ipucu TB-08', () => {
    const b = borcluBloku(borclu('b1', 'X', { itirazVar: true, itirazTipi: 'TAM', itirazVerilisTarihi: G('2026-06-23') }), { olaylar: [], eksen: null, bugun: BUGUN })
    expect(b.alacakliyaTebligEksik).toBe(true)
    expect(b.satirlar.find((s) => s.etiket === 'İtirazın size tebliği')).toMatchObject({ rol: 'risk' })
    expect(tbIpucu([b], [])).toMatchObject({ kural: 'TB-08' })
  })
  it('kapsamı girilmemiş itiraz → TB-07; kısmi itirazda tutar gösterilir', () => {
    const b = borcluBloku(borclu('b1', 'X', { itirazVar: true, itirazAlacakliyaTebligTarihi: G('2026-07-01') }), { olaylar: [], eksen: null, bugun: BUGUN })
    expect(tbIpucu([b], [])).toMatchObject({ kural: 'TB-07' })
    const k = borcluBloku(borclu('b1', 'X', { itirazVar: true, itirazTipi: 'KISMI', itirazEdilenTutar: 1234.56, itirazKapsamJson: { faiz: true } }), { olaylar: [], eksen: null, bugun: BUGUN })
    expect(k.satirlar.find((s) => s.etiket === 'İtiraz')!.metin).toMatch(/^kısmi \(faiz\) · itiraz edilen 1\.234,56 TL/)
  })
  it('süre başlatan aday varken ipucu TB-01; yalnız diğer adaylar varsa TB-02; hiçbir şey yoksa null', () => {
    const b = borcluBloku(B1, { olaylar: [], eksen: null, bugun: BUGUN })
    const teblig = gelismeKarti(olay('TEBLIG_SONUCU', { sonuc: 'TEBLIG', borcluId: 'b1' }), ctx)
    const haciz = gelismeKarti(olay('MUVEKKIL_ALACAGINA_HACIZ'), ctx)
    expect(tbIpucu([b], [haciz, teblig])).toMatchObject({ kural: 'TB-01' })
    expect(tbIpucu([b], [haciz])).toMatchObject({ kural: 'TB-02' })
    expect(tbIpucu([b], [])).toBeNull()
  })
  it('borçlu türü etiketi ve iyimser kilit sürümü', () => {
    const b = borcluBloku(borclu('b1', 'X', { tebligSonucu: 'TEBLIG', tebligTarihi: G('2026-06-25') }, 'KAMU'), { olaylar: [], eksen: null, bugun: BUGUN })
    expect(b.turEtiket).toBe('Kamu idaresi')
    expect(b.surum).toBe(new Date('2026-07-01').toISOString())
  })
})

describe('panel ve gölge eksen', () => {
  it('panel: bekleyenler süre başlatan önce; işlenenler ayrı; icra özeti', () => {
    const olaylar = [
      olay('MUVEKKIL_ALACAGINA_HACIZ'),
      olay('ITIRAZ', { borcluId: 'b1' }),
      olay('TEBLIG_SONUCU', { teyit: 'TEYITLI', sonuc: 'TEBLIG', borcluId: 'b1', teyitAt: G('2026-07-02') }),
      olay('ITIRAZ', { teyit: null }), // eski satır: panele girmez
    ]
    const eksen = eksenTuret({ durum: 'ITIRAZ', icraDosyaNo: 'x', takipTarihi: null, yolOnayli: false, kapanisSebebi: null, kapanisAt: null, borclular: [{ id: 'b1', takip: null }], olaylar, arabuluculuk: null, yolSecimi: null, davalar: [], eskiAsamalar: [] })
    const p = olayPaneli({ dosyaId: 'd1', borclular: [B1], olaylar, belgeler: [], eksen, bugun: BUGUN })
    expect(p.bekleyen.map((k) => k.altTip)).toEqual(['ITIRAZ', 'MUVEKKIL_ALACAGINA_HACIZ'])
    expect(p.islenen.map((k) => k.durum)).toEqual(['TEYITLI'])
    expect(p.icraOzet).toMatchObject({ eksen: 'İCRA', deger: 'DURDU_ITIRAZ', kaynak: 'UYAP, teyitsiz', rol: 'bilgi' })
  })
  it('gölge eksen: eski durum KESİNLEŞTİ ama yeni hesap "Durdu - itiraz" → çelişki uyarısı (GN-01)', () => {
    const eksen = eksenTuret({ durum: 'KESINLESTI', icraDosyaNo: 'x', takipTarihi: null, yolOnayli: false, kapanisSebebi: null, kapanisAt: null, borclular: [{ id: 'b1', takip: null }], olaylar: [olay('ITIRAZ')].map((o) => ({ ...o })), arabuluculuk: null, yolSecimi: null, davalar: [], eskiAsamalar: [] })
    const g = golgeEksen(eksen, 'KESINLESTI')
    expect(g.rozetler[0]).toMatchObject({ deger: 'DURDU_ITIRAZ', etiket: 'Durdu - itiraz', kaynak: 'UYAP, teyitsiz' })
    expect(g.celiski).toMatch(/Eski durum \(KESINLESTI\) ile yeni hesap \(Durdu - itiraz\) farklı/)
    expect(golgeEksen(eksen, 'ITIRAZ').celiski).toBeNull()
  })
})
