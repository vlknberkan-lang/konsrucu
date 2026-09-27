/**
 * S22 · Anlık senkron: saf kurallar (lib/konsrucu/senkron/is-saf.ts) — adım doğrulama ve birleştirme (tek yazıcı:
 * eklenti), "UYAP bağlı mı?" (son nabızdan ölçülür; 2 dk eşik), canlı panelin uyarıları (90 sn üstlenilmedi,
 * 5 dk hareketsiz, zaman aşımı, eşleşme sorunları), takip talebi mutabakatı ve esas no ayrıştırma.
 */
import { describe, it, expect } from 'vitest'
import {
  adimBirlestir, adimDogrula, baglantiDurumu, eslesmeMetni, esasNoCoz, isGorunumu, ozetMetni, takipMutabakati,
  ICRA_ADIMLARI, NABIZ_ESIGI_MS, USTLENME_ESIGI_MS, ZAMAN_ASIMI_MS, type IsKaydi,
} from '@/lib/konsrucu/senkron/is-saf'

const T0 = new Date('2026-09-27T11:02:10Z')
const sn = (n: number) => new Date(T0.getTime() + n * 1000)

function is(o: Partial<IsKaydi> = {}): IsKaydi {
  return { id: 'is-1', tur: 'ICRA', durum: 'BEKLIYOR', adimlarJson: null, ozetJson: null, hata: null, createdAt: T0, alindiAt: null, bittiAt: null, updatedAt: T0, ...o }
}

describe('adım doğrulama', () => {
  it('bilinen adım ve durum kabul edilir; sayaç ve mesaj temizlenir', () => {
    const a = adimDogrula('ICRA', { adim: 'evrak_indirme', durum: 'calisiyor', sayac: { n: 7, toplam: 18 }, mesaj: '  Ödeme İcra Emri \n ' })
    expect(a).toEqual({ adim: 'EVRAK_INDIRME', durum: 'CALISIYOR', sayac: { n: 7, toplam: 18 }, mesaj: 'Ödeme İcra Emri' })
  })
  it('bilinmeyen adım / durum reddedilir (serbest metin ekrana ve DB\'ye akmaz)', () => {
    expect(adimDogrula('ICRA', { adim: 'UYAPA_YAZ', durum: 'TAMAM' })).toBeNull()
    expect(adimDogrula('ICRA', { adim: 'HESAP', durum: 'BITTI' })).toBeNull()
    expect(adimDogrula('KOPILOT', { adim: 'EVRAK_INDIRME', durum: 'TAMAM' })).toBeNull()
    expect(adimDogrula('KOPILOT', { adim: 'PANEL_ACILDI', durum: 'TAMAM' })?.adim).toBe('PANEL_ACILDI')
  })
  it('mesaj 300 karakterle sınırlı; bozuk sayaç atılır', () => {
    const a = adimDogrula('ICRA', { adim: 'HESAP', durum: 'TAMAM', mesaj: 'x'.repeat(1000), sayac: { n: 'a', toplam: 3 } })
    expect(a?.mesaj?.length).toBe(300)
    expect(a?.sayac).toBeNull()
  })
})

describe('adım birleştirme (tek yazıcı: eklenti)', () => {
  it('aynı adım yerinde güncellenir, sırası korunur; yenisi sona eklenir', () => {
    let l = adimBirlestir([], { adim: 'ULASTI', durum: 'TAMAM' }, sn(4))
    l = adimBirlestir(l, { adim: 'ESLESTIRME', durum: 'CALISIYOR' }, sn(5))
    l = adimBirlestir(l, { adim: 'ESLESTIRME', durum: 'TAMAM', mesaj: 'daire doğrulandı' }, sn(9))
    expect(l.map((a) => [a.sira, a.adim, a.durum])).toEqual([[0, 'ULASTI', 'TAMAM'], [1, 'ESLESTIRME', 'TAMAM']])
    expect(l[1].t).toBe(sn(9).toISOString())
    expect(l[1].mesaj).toBe('daire doğrulandı')
  })
  it('bozuk JSON güvenle yok sayılır', () => {
    expect(adimBirlestir('bozuk', { adim: 'HESAP', durum: 'TAMAM' }, T0)).toHaveLength(1)
    expect(adimBirlestir([null, { x: 1 }], { adim: 'HESAP', durum: 'TAMAM' }, T0)).toHaveLength(1)
  })
})

describe('UYAP bağlantısı — son nabızdan ölçülür', () => {
  const nabiz = (msOnce: number, uyapOturum = true, cihaz = 'ck_aaaaaaaaaaaaaaaaaaaaaaaa') => ({ cihaz, surum: '2.0.0', uyapOturum, sonGorulme: new Date(T0.getTime() - msOnce) })
  it('hiç nabız yoksa "henüz sinyal gelmedi"', () => {
    expect(baglantiDurumu([], T0).durum).toBe('HIC_YOK')
  })
  it('2 dakikadan eski nabız → "UYAP açık değil"', () => {
    const b = baglantiDurumu([nabiz(NABIZ_ESIGI_MS + 1000)], T0)
    expect(b.durum).toBe('SINYAL_YOK')
    expect(b.metin).toContain('UYAP açık değil')
    expect(b.metin).toContain('2 dakikadır')
  })
  it('taze nabız + UYAP oturumu açık → açık', () => {
    expect(baglantiDurumu([nabiz(10_000)], T0)).toMatchObject({ durum: 'ACIK', surum: '2.0.0', dakikaOnce: 0 })
  })
  it('taze nabız ama oturum kapalı → yeniden giriş uyarısı', () => {
    expect(baglantiDurumu([nabiz(10_000, false)], T0).durum).toBe('OTURUM_KAPALI')
  })
  it('iki cihazdan biri açıksa açık sayılır', () => {
    expect(baglantiDurumu([nabiz(5_000, false, 'ck_bbbbbbbbbbbbbbbbbbbbbbbb'), nabiz(30_000, true)], T0).durum).toBe('ACIK')
  })
})

describe('canlı panel görünümü', () => {
  const acik = baglantiDurumu([{ cihaz: 'ck_aaaaaaaaaaaaaaaaaaaaaaaa', surum: '2.0.0', uyapOturum: true, sonGorulme: T0 }], T0)
  const kapali = baglantiDurumu([{ cihaz: 'ck_aaaaaaaaaaaaaaaaaaaaaaaa', surum: '2.0.0', uyapOturum: true, sonGorulme: new Date(T0.getTime() - 3 * 60_000) }], T0)

  it('bütün icra adımları ekranda sırayla; raporlanmayan adım "bekliyor"', () => {
    const g = isGorunumu(is({ durum: 'CALISIYOR', alindiAt: sn(4), updatedAt: sn(20), adimlarJson: adimBirlestir([], { adim: 'ESLESTIRME', durum: 'TAMAM' }, sn(8)) }), sn(21), acik)
    expect(g.adimlar.map((a) => a.adim)).toEqual(ICRA_ADIMLARI.map((a) => a.adim))
    expect(g.adimlar[0]).toMatchObject({ adim: 'ULASTI', durum: 'TAMAM' }) // üstlenildiyse ulaştı
    expect(g.adimlar[1].durum).toBe('TAMAM')
    expect(g.adimlar[2].durum).toBe('BEKLIYOR')
    expect(g.surerMi).toBe(true)
    expect(g.ulasmaSaniye).toBe(4)
    expect(g.uyari).toBeNull()
  })

  it('evrak indirme sayacı "7/18" biçiminde', () => {
    const l = adimBirlestir([], { adim: 'EVRAK_INDIRME', durum: 'CALISIYOR', sayac: { n: 7, toplam: 18 }, mesaj: 'Tebliğ Mazbatası' }, sn(30))
    const g = isGorunumu(is({ durum: 'CALISIYOR', alindiAt: sn(3), updatedAt: sn(30), adimlarJson: l }), sn(31), acik)
    expect(g.adimlar.find((a) => a.adim === 'EVRAK_INDIRME')).toMatchObject({ sayacMetni: '7/18', mesaj: 'Tebliğ Mazbatası' })
  })

  it('bekleyen iş + eklentiden 2 dakikadır sinyal yok → "UYAP açık değil"', () => {
    expect(isGorunumu(is(), sn(5), kapali).uyari?.tur).toBe('UYAP_KAPALI')
  })

  it('bağlantı açık ama iş 90 saniyede üstlenilmedi → "eklenti yanıt vermiyor" rehberi', () => {
    expect(isGorunumu(is(), sn(USTLENME_ESIGI_MS / 1000 - 1), acik).uyari).toBeNull()
    const u = isGorunumu(is(), sn(USTLENME_ESIGI_MS / 1000 + 1), acik).uyari
    expect(u?.tur).toBe('USTLENILMEDI')
    expect(u?.metin).toContain('sürümünü')
  })

  it('5 dakikadır ilerlemeyen iş uyarılır; zaman aşımı kendi cümlesiyle', () => {
    const c = is({ durum: 'CALISIYOR', alindiAt: sn(2), updatedAt: sn(10) })
    expect(isGorunumu(c, new Date(sn(10).getTime() + ZAMAN_ASIMI_MS + 1000), acik).uyari?.tur).toBe('HAREKETSIZ')
    const z = isGorunumu(is({ durum: 'ZAMAN_ASIMI', bittiAt: sn(400) }), sn(401), acik)
    expect(z.uyari?.tur).toBe('ZAMAN_ASIMI')
    expect(z.surerMi).toBe(false)
  })

  it('aleyhe dosya (TARAF_UYUSMAZ) düz Türkçe: bağlanmadı, hiçbir şey yazılmadı', () => {
    const g = isGorunumu(is({ durum: 'HATA', ozetJson: { eslesme: 'TARAF_UYUSMAZ' }, bittiAt: sn(20) }), sn(21), acik)
    expect(g.uyari?.tur).toBe('ESLESME')
    expect(g.uyari?.metin).toContain('aleyhe')
    expect(eslesmeMetni('BASKA_DAIRE')).toContain('başka bir dairede')
    expect(eslesmeMetni('OTURUM')).toContain('Yeniden giriş')
    expect(eslesmeMetni('OK')).toBeNull()
  })

  it('bitince tek cümlelik özet', () => {
    expect(ozetMetni({ tur: 'ICRA', durum: 'TAMAM', ozetJson: { evrakSayisi: 18, yeniEvrak: 3 } })).toBe('18 evrak listelendi, 3 yeni evrak indi.')
    expect(ozetMetni({ tur: 'ICRA', durum: 'KISMI', ozetJson: { evrakSayisi: 2, yeniEvrak: 0 } })).toContain('Bazı adımlar')
    expect(ozetMetni({ tur: 'KOPILOT', durum: 'TAMAM', ozetJson: null })).toContain('Takip Aç paneli')
    expect(ozetMetni({ tur: 'ICRA', durum: 'HATA', ozetJson: null })).toBeNull()
  })
})

describe('takip talebi mutabakatı ve esas no', () => {
  it('UYAP asıl alacak = programdaki → eşleşiyor; farklıysa uyarı; eksikse bilinmiyor', () => {
    expect(takipMutabakati(1000.5, 1000.5).durum).toBe('ESLESIYOR')
    expect(takipMutabakati(1000.5, 1000).durum).toBe('FARKLI')
    expect(takipMutabakati(null, 1000).durum).toBe('BILINMIYOR')
    expect(takipMutabakati(1000, null).durum).toBe('BILINMIYOR')
  })
  it('esas no biçimleri', () => {
    expect(esasNoCoz('2026/1234')).toBe('2026/1234')
    expect(esasNoCoz(' 2026 / 77 E.')).toBe('2026/77')
    expect(esasNoCoz('1234')).toBeNull()
    expect(esasNoCoz('')).toBeNull()
  })
})
