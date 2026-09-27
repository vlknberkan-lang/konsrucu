import { describe, expect, it } from 'vitest'
import { r0Iik67Teshis, r1TutarTeshis, r2KesinlestiTeshis } from '@/lib/konsrucu/onarim/teshis'
import { isoGundenTarih } from '@/lib/konsrucu/sure/takvim'

const g = (s: string) => isoGundenTarih(s) as Date
const SIMDI = new Date('2026-10-01T07:00:00Z')

describe('S13 · R1 tutar teşhisi (canlı veriden, kurgusal örneklerle)', () => {
  const dosya = (p: Partial<Parameters<typeof r1TutarTeshis>[0][number]>) => ({ id: 'd1', rucuTutari: null, davaMiktari: null, kaynakJson: { ham: {} }, takipAcildi: false, ...p })

  it('ABD biçimli ham hücre 1000 kat küçük okunmuşsa A sınıfı öneri üretir', () => {
    const r = r1TutarTeshis([dosya({ rucuTutari: '1234.57', kaynakJson: { ham: { rucuTutari: '1,234,567.89' } } })])
    expect(r).toEqual([expect.objectContaining({ kod: 'R1', islem: 'GUNCELLE', hedefTablo: 'RucuDosyasi', alan: 'rucuTutari', eskiJson: { deger: '1234.57' }, yeniJson: { deger: '1234567.89' }, guvenSinifi: 'A' })])
    expect(r[0].kanit).toContain('1000 kat')
  })

  it('ondalıksız tek virgüllü değer B; takip açılmış dosya C ("hukuki değerlendirme: Yelda")', () => {
    expect(r1TutarTeshis([dosya({ davaMiktari: '100.00', kaynakJson: { ham: { davaMiktari: '99,999' } } })])[0].guvenSinifi).toBe('B')
    const c = r1TutarTeshis([dosya({ rucuTutari: '1234.57', takipAcildi: true, kaynakJson: { ham: { rucuTutari: '1,234,567.89' } } })])[0]
    expect(c.guvenSinifi).toBe('C')
    expect(c.kanit).toContain('Yelda')
  })

  it('döviz, doğru okunmuş ve 1000 kat deseni olmayan satır önerilmez', () => {
    expect(r1TutarTeshis([
      dosya({ id: 'a', rucuTutari: '1234.56', kaynakJson: { ham: { rucuTutari: '1,234.56 USD' } } }),
      dosya({ id: 'b', rucuTutari: '1234.56', kaynakJson: { ham: { rucuTutari: '1.234,56' } } }),
      dosya({ id: 'c', rucuTutari: '50.00', kaynakJson: { ham: { rucuTutari: '1,234,567.89' } } }),
    ])).toEqual([])
  })
})

describe('S13/S24 · R0 İİK 67 teşhisi (Sure EKLE önerisi)', () => {
  it('itiraz evrakından ihtiyatlı alt sınır önerir; onaylanan günü yazmaz', () => {
    const r = r0Iik67Teshis([{ id: 'd1', mevcutIik67: [], itirazlar: [{ borcluId: null, tarih: g('2026-03-12'), kaynak: 'BELGE', belgeId: 'belge-1', etiket: 'Borca İtiraz Talebi (UYAP evrak tarihi)' }] }], SIMDI)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ kod: 'R0', islem: 'EKLE', hedefTablo: 'Sure', alan: '*', guvenSinifi: 'B' })
    expect(r[0].yeniJson).toMatchObject({ tur: 'IIK67', dayanak: 'İİK 67/1', itirazTarihi: '2026-03-12', onerilenIhtiyatli: '2027-03-12', kaynakBelgeId: 'belge-1' })
    expect(r[0].yeniJson).not.toHaveProperty('onaylananSonGun')
    expect(r[0].kanit).toContain('teyit gerekli')
  })

  it('açık İİK 67 süresi olan dosya ya da borçlu yeniden önerilmez', () => {
    const itiraz = { borcluId: null, tarih: g('2026-03-12'), kaynak: 'BELGE' as const, etiket: 'x' }
    expect(r0Iik67Teshis([{ id: 'd1', mevcutIik67: [{ borcluId: null }], itirazlar: [itiraz] }], SIMDI)).toEqual([])
    expect(r0Iik67Teshis([{ id: 'd1', mevcutIik67: [{ borcluId: 'b1' }], itirazlar: [{ ...itiraz, borcluId: 'b1', kaynak: 'BORCLU_TAKIP' }] }], SIMDI)).toEqual([])
  })

  it('borçlu bazında onaylı kayıt varsa dosya bazındaki evrak izi ayrıca önerilmez; tebliğ tarihi kullanılır', () => {
    const r = r0Iik67Teshis([{ id: 'd1', mevcutIik67: [], itirazlar: [
      { borcluId: 'b1', tarih: g('2026-03-12'), kaynak: 'BORCLU_TAKIP', tebligTarihi: g('2026-04-02'), etiket: 'Onaylı itiraz kaydı' },
      { borcluId: null, tarih: g('2026-03-10'), kaynak: 'BELGE', etiket: 'Borca itiraz evrakı' },
    ] }], SIMDI)
    expect(r).toHaveLength(1)
    expect(r[0].guvenSinifi).toBe('A')
    expect(r[0].yeniJson).toMatchObject({ borcluId: 'b1', tetikTarihi: '2026-04-02', tetikTuru: 'TEBLIG', onerilenIhtiyatli: '2027-04-02' })
  })

  it('sıra: önce son günü yaklaşanlar (artan), sonra geçmiş görünenler (en yakın geçmiş önce)', () => {
    const d = (id: string, tarih: string) => ({ id, mevcutIik67: [], itirazlar: [{ borcluId: null, tarih: g(tarih), kaynak: 'BELGE' as const, etiket: 'x' }] })
    const r = r0Iik67Teshis([d('uzak', '2026-09-01'), d('gecmis-eski', '2024-01-10'), d('yakin', '2025-10-20'), d('gecmis-yakin', '2025-09-01')], SIMDI)
    expect(r.map((x) => x.dosyaId)).toEqual(['yakin', 'uzak', 'gecmis-yakin', 'gecmis-eski'])
    expect(r[2].kanit).toContain('geçmiş görünüyor')
  })
})

describe('S13 · R2 kanıtsız KESİNLEŞTİ teşhisi', () => {
  const d = (p: Partial<Parameters<typeof r2KesinlestiTeshis>[0][number]>) => ({ id: 'd1', durum: 'KESINLESTI', icraEksen: null, gercekKesinlesme: false, itirazIzi: false, ...p })
  it('itiraz izi varsa DURDU_ITIRAZ (B), yoksa BILINMIYOR (C); eski durum alanına dokunmaz', () => {
    const r = r2KesinlestiTeshis([d({ id: 'a' }), d({ id: 'b', itirazIzi: true })])
    expect(r.map((x) => [x.dosyaId, x.alan, x.yeniJson, x.guvenSinifi])).toEqual([
      ['b', 'icraEksen', { deger: 'DURDU_ITIRAZ' }, 'B'],
      ['a', 'icraEksen', { deger: 'BILINMIYOR' }, 'C'],
    ])
  })
  it('gerçek kesinleşme kaydı olan, KESİNLEŞTİ olmayan ya da ekseni zaten aynı olan dosya önerilmez', () => {
    expect(r2KesinlestiTeshis([
      d({ gercekKesinlesme: true }),
      d({ durum: 'ITIRAZ' }),
      d({ icraEksen: 'BILINMIYOR' }),
    ])).toEqual([])
  })
})
