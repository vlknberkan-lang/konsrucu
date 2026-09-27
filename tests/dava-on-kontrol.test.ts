/**
 * S27 · dava ön kontrolü ve çapraz kontrol (kabul testi 3–4): müvekkil onayı yokken kilitli; son güne ≤ 14 gün kala
 * istisnayla açılır; mahkeme türü ↔ arabuluculuk türü çelişkisi kırmızı, yazılı gerekçeyle geçilir; dava şartı
 * arabuluculukta son tutanak yokluğu geçilemez.
 */
import { describe, expect, it } from 'vitest'
import { davaOnKontrol, gecisleriOku, type OnKontrolGirdi } from '@/lib/konsrucu/dava/on-kontrol'
import { caprazKontrol } from '@/lib/konsrucu/dava/capraz-kontrol'

const SIMDI = new Date('2026-09-27T09:00:00Z')
const onay = { id: 'o1', tur: 'DAVA_ACMA', sonuc: 'ONAY', alinmaAt: new Date('2026-08-01'), istisnaGerekce: null, onaylayanUnvan: 'Birim Müdürü' }
const tam: OnKontrolGirdi = {
  onaylar: [onay], ihtiyatliSonGun: new Date('2027-06-23'), onaylananSonGun: new Date('2027-06-23'), yolSecimi: 'ARABULUCULUK_IIK67',
  arabuluculuk: { tur: 'DAVA_SARTI', sonTutanakTarihi: new Date('2026-07-24'), sonuc: 'ANLASAMAMA', sonTutanakBelgeId: 'b1' },
  itirazEdenTeyitliSayisi: 1, itirazEdilenToplam: 1000, takipTalebiVar: true, mahkemeTuru: 'ASLIYE_HUKUK', usul: 'YAZILI',
  vekaletnameVar: true, harcAvansGirildi: false, gecisler: [],
}

describe('davaOnKontrol', () => {
  it('bütün maddeler tamam → imzaya hazır (harç/avans yalnız bilgi)', () => {
    const r = davaOnKontrol(tam, SIMDI)
    expect(r.kilitli).toBe(false)
    expect(r.imzayaHazir).toBe(true)
    expect(r.maddeler.find((m) => m.kod === 'HARC_AVANS')?.durum).toBe('BILGI')
  })
  it('müvekkil onayı yoksa KİLİTLİ ve imzaya hazır değil; onay maddesi gerekçeyle geçilemez', () => {
    const r = davaOnKontrol({ ...tam, onaylar: [], gecisler: [{ kod: 'MUVEKKIL_ONAYI', gerekce: 'geçiyorum çünkü acele' }] }, SIMDI)
    expect(r.kilitli).toBe(true)
    expect(r.imzayaHazir).toBe(false)
    expect(r.maddeler[0]).toMatchObject({ kod: 'MUVEKKIL_ONAYI', durum: 'ENGEL', gecilebilir: false })
  })
  it('kurgusal son güne 10 gün kala istisna gerekçesiyle açılır ve kayda geçer', () => {
    const istisna = { id: 'o2', tur: 'DAVA_ACMA', sonuc: 'BEKLIYOR', alinmaAt: null, istisnaGerekce: 'Müvekkile ulaşılamadı, süre koruması.' }
    const r = davaOnKontrol({ ...tam, onaylar: [istisna], ihtiyatliSonGun: new Date('2026-10-07') }, SIMDI)
    expect(r.kilitli).toBe(false)
    expect(r.maddeler[0]).toMatchObject({ durum: 'GECILDI', gerekce: 'Müvekkile ulaşılamadı, süre koruması.' })
    const uzak = davaOnKontrol({ ...tam, onaylar: [istisna], ihtiyatliSonGun: new Date('2027-06-23') }, SIMDI)
    expect(uzak.kilitli).toBe(true)
  })
  it('dava şartı arabuluculukta son tutanak yoksa ENGEL ve geçilemez', () => {
    const r = davaOnKontrol({ ...tam, arabuluculuk: { tur: 'DAVA_SARTI', sonTutanakTarihi: null, sonuc: null, sonTutanakBelgeId: null }, gecisler: [{ kod: 'SON_TUTANAK', gerekce: 'gerekçe yazdım ama geçmemeli' }] }, SIMDI)
    const m = r.maddeler.find((x) => x.kod === 'SON_TUTANAK')
    expect(m).toMatchObject({ durum: 'ENGEL', gecilebilir: false })
    expect(r.imzayaHazir).toBe(false)
  })
  it('çapraz kontrol çelişkisi kırmızı; yazılı gerekçeyle GECILDI', () => {
    const celiskili = { ...tam, mahkemeTuru: 'ASLIYE_TICARET', arabuluculuk: { ...tam.arabuluculuk!, tur: 'IHTIYARI' } }
    const r = davaOnKontrol(celiskili, SIMDI)
    const ck = r.maddeler.find((m) => m.kod === 'CK-TICARET-IHTIYARI')
    expect(ck).toMatchObject({ durum: 'ENGEL', gecilebilir: true })
    expect(ck?.etiket).toMatch(/TTK 5\/A.*teyit gerekli/)
    expect(r.imzayaHazir).toBe(false)
    const g = davaOnKontrol({ ...celiskili, gecisler: [{ kod: 'CK-TICARET-IHTIYARI', gerekce: 'Temel ilişki haksız fiil; avukat değerlendirmesi.' }] }, SIMDI)
    expect(g.maddeler.find((m) => m.kod === 'CK-TICARET-IHTIYARI')?.durum).toBe('GECILDI')
    expect(g.imzayaHazir).toBe(true)
  })
  it('görevli mahkeme ve usul seçilmemişse eksik (avukat seçer; program önermez)', () => {
    const r = davaOnKontrol({ ...tam, mahkemeTuru: null, usul: null }, SIMDI)
    expect(r.ilkEksik?.kod).toBe('GOREVLI_MAHKEME')
    expect(r.maddeler.find((m) => m.kod === 'USUL')?.durum).toBe('EKSIK')
  })
  it('anlaşma sonucunda dava açılmaz uyarısı; kısmen anlaşma uyarı', () => {
    expect(davaOnKontrol({ ...tam, arabuluculuk: { ...tam.arabuluculuk!, sonuc: 'ANLASMA' } }, SIMDI).maddeler.find((m) => m.kod === 'SON_TUTANAK')?.durum).toBe('ENGEL')
    expect(davaOnKontrol({ ...tam, arabuluculuk: { ...tam.arabuluculuk!, sonuc: 'KISMEN' } }, SIMDI).maddeler.find((m) => m.kod === 'SON_TUTANAK')?.aciklama).toMatch(/anlaşılmayan kalem/)
  })
  it('gecisleriOku onKontrolJson ve Aktivite detayını birleştirir', () => {
    expect(gecisleriOku({ gecisler: [{ kod: 'A', gerekce: 'x' }] }, { tur: 'ON_KONTROL_GECIS', kod: 'B', gerekce: 'y' }, null)).toEqual([{ kod: 'A', gerekce: 'x' }, { tur: 'ON_KONTROL_GECIS', kod: 'B', gerekce: 'y' }])
  })
})

describe('caprazKontrol', () => {
  it('tüketici + ihtiyari → kırmızı (TKHK 73/A teyit gerekli)', () => {
    const u = caprazKontrol({ mahkemeTuru: 'TUKETICI', arabuluculukTuru: 'IHTIYARI', arabuluculukVar: true, sonTutanakVar: true })
    expect(u[0]).toMatchObject({ kod: 'CK-TUKETICI-IHTIYARI', seviye: 'KIRMIZI' })
    expect(u[0].dayanak).toMatch(/teyit gerekli/)
  })
  it('tür seçilmedi → sarı; asliye hukuk + dava şartı çelişki değil', () => {
    expect(caprazKontrol({ mahkemeTuru: 'ASLIYE_TICARET', arabuluculukTuru: null, arabuluculukVar: true, sonTutanakVar: true })[0].seviye).toBe('SARI')
    expect(caprazKontrol({ mahkemeTuru: 'ASLIYE_HUKUK', arabuluculukTuru: 'DAVA_SARTI', arabuluculukVar: true, sonTutanakVar: true })).toEqual([])
  })
})
