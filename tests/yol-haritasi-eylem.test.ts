/**
 * Dosya Yol Haritası — ekranın saf kuralları (S20; 06 §2 "Ekran kuralları", "Görsel dil"): birincil eylemin
 * hedefi, rol farkı (yardımcıya "avukat onayını bekliyor"), anlam rengi ve yazılı karşılığı, tarih gösterimi.
 * (Bileşenlerin JSX çizimi vitest yapılandırmasında `jsx: preserve` olduğu için burada çizilmez; bileşenler bu
 * saf yardımcıları kullanır.)
 */
import { describe, expect, it } from 'vitest'
import { KURALLAR, bosGercekler, yolHaritasiHesapla } from '@/lib/konsrucu/yol-haritasi'
import { EYLEM_CAPA, ROL_METNI, adimTonu, belgeAdresi, eylemHref, eylemYetkisi, gunGoster, kalanMetni } from '@/components/dosya/yol-haritasi/eylem'

describe('birincil eylem hedefi', () => {
  it('kural tablosundaki her birincil eylem hedefinin panel çapası var (yh-…)', () => {
    for (const k of KURALLAR) if (k.eylem) expect(EYLEM_CAPA[k.eylem.hedef], k.kod).toMatch(/^yh-[a-z-]+$/)
  })
  it('eylemHref: verilen eşleme önce, yoksa sayfa içi çapa', () => {
    expect(eylemHref('sure-onay')).toBe('#yh-sureler')
    expect(eylemHref('sure-onay', { 'sure-onay': '/sureler?dosya=1' })).toBe('/sureler?dosya=1')
    expect(eylemHref('kopilot-ac', { 'sure-onay': '/x' })).toBe('#yh-takip')
  })
  it('Neden? belge adresi yer tutucudan kurulur ve kodlanır', () => {
    expect(belgeAdresi('/akilli-giris/x?belge={belgeId}', 'a b')).toBe('/akilli-giris/x?belge=a%20b')
    expect(belgeAdresi(undefined, 'a')).toBeNull()
  })
})

describe('rol farkı', () => {
  it.each([
    ['A', 'AVUKAT', 'YAPABILIR'], ['A', 'ADMIN', 'YAPABILIR'], ['A', 'AVUKAT_YRD', 'AVUKAT_ONAYI_BEKLIYOR'], ['A+2', 'AVUKAT_YRD', 'AVUKAT_ONAYI_BEKLIYOR'],
    ['H', 'AVUKAT_YRD', 'YAPABILIR'], ['H/A', 'AVUKAT_YRD', 'YAPABILIR'], ['SORUMLU', 'AVUKAT_YRD', 'YAPABILIR'], ['H', 'GORUNTULEYEN', 'SALT_OKUR'], ['A', null, 'SALT_OKUR'],
  ] as const)('eylemYetkisi(%s, %s) = %s', (kuralRol, rol, beklenen) => {
    expect(eylemYetkisi(kuralRol, rol)).toBe(beklenen)
  })
  it('her kural rolünün ekranda yazılı karşılığı var; A+2 ikinci teyidi söyler', () => {
    for (const k of KURALLAR) expect(ROL_METNI[k.rol], k.kod).toBeTruthy()
    expect(ROL_METNI['A+2']).toContain('ikinci teyit')
  })
})

describe('görsel dil', () => {
  it('renk yalnız anlam taşır ve yazıyla da söylenir', () => {
    expect(adimTonu({ engel: true, oncelik: 0, tur: 'EYLEM' })).toEqual({ tone: 'danger', etiket: 'ENGEL' })
    expect(adimTonu({ engel: false, oncelik: 1, tur: 'EYLEM' })).toEqual({ tone: 'danger', etiket: 'SÜRE RİSKİ' })
    expect(adimTonu({ engel: false, oncelik: 2, tur: 'EYLEM' })).toEqual({ tone: 'warning', etiket: 'ONAY BEKLİYOR' })
    expect(adimTonu({ engel: false, oncelik: 3, tur: 'EYLEM' })).toEqual({ tone: 'warning', etiket: 'ONAY BEKLİYOR' })
    expect(adimTonu({ engel: false, oncelik: 5, tur: 'EYLEM' })).toEqual({ tone: 'steel', etiket: 'SIRADAKİ İŞ' })
    expect(adimTonu({ engel: false, oncelik: 6, tur: 'BEKLEME' })).toEqual({ tone: 'info', etiket: 'BEKLİYORUZ' })
  })
  it('tarih gg.aa.yyyy (saat dilimi kaydırmadan), kalan gün metni', () => {
    expect(gunGoster('2027-01-25')).toBe('25.01.2027')
    expect(gunGoster(null)).toBe('—')
    expect([kalanMetni(0), kalanMetni(11), kalanMetni(-3), kalanMetni(null)]).toEqual(['bugün', '11 gün kaldı', '3 gün geçti', null])
  })
})

describe('görünüm modeli ekrana hazır ve serileştirilebilir', () => {
  it('Date içermez (sunucu → istemci sınırı), tek cümle ve sekiz durak taşır', () => {
    const v = yolHaritasiHesapla(bosGercekler(), { simdi: new Date('2026-09-27T09:00:00Z') })
    const gidis = JSON.parse(JSON.stringify(v))
    expect(gidis).toEqual(v)
    expect(v.tekCumle).toBe("Şimdi: Ray'den gelen evrakı sürükleyin.")
    expect(v.duraklar.map((d) => d.ad)).toEqual(['Evrak', 'Hazırlık', 'Takip', 'Tebliğ ve itiraz', 'Arabuluculuk', 'Dava açılışı', 'Yargılama', 'Sonuç ve tahsil'])
    expect(v.duraklar[0].durum).toBe('SIMDI')
    expect(v.bugun).toBe('2026-09-27')
  })
})
