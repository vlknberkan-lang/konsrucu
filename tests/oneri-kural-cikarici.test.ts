/**
 * S18 · kural çıkarıcıları (yapay zekâsız; Varyant B). Kurgusal poliçe, dekont, tutanak ve ekspertiz metinleri —
 * gerçek evrak ya da kişisel veri değildir. Alıntı sayfa metninden kesildiği için doğrulama birebir geçmelidir.
 */
import { describe, expect, it } from 'vitest'
import { kuralCikar, policeSayfasiMi, dekontSayfasiMi, type KuralSayfa } from '@/lib/konsrucu/oneri/kural-cikarici'
import { alintiDogrula } from '@/lib/konsrucu/oneri/alinti'

const POLICE: KuralSayfa = {
  belgeId: 'b-police', sayfaNo: 1, kategori: 'POLICE',
  metin: [
    'KARA ARAÇLARI KASKO SİGORTASI POLİÇESİ',
    'Poliçe No: KRG-2026-000123',
    'Tanzim Tarihi: 02.01.2026',
    'Başlangıç Tarihi: 03.01.2026   Bitiş Tarihi: 03.01.2027',
    'Sigorta Ettiren: Kurgusal Ltd. Şti.',
    'Plaka: 34 KRG 001',
    'Brüt Prim: 12.345,00 TL',
  ].join('\n'),
}
const POLICE_VADE: KuralSayfa = {
  belgeId: 'b-police-2', sayfaNo: 1, kategori: 'DIGER',
  metin: 'Sigorta Ettiren: Kurgusal A.Ş.\nPoliçe Numarası : 99887766\nVade: 15.02.2026 - 15.02.2027',
}
const DEKONT: KuralSayfa = {
  belgeId: 'b-dekont', sayfaNo: 1, kategori: 'DEKONT',
  metin: [
    'KURGU BANKASI HAVALE / EFT DEKONTU',
    'İşlem Tarihi: 14.03.2026',
    'Alıcı: Kurgusal Servis',
    'Tutar: 12.500,00 TL',
    'Masraf Tutarı: 5,00 TL',
    'Açıklama: hasar ödemesi',
  ].join('\n'),
}
const KTT: KuralSayfa = {
  belgeId: 'b-ktt', sayfaNo: 1, kategori: 'TUTANAK',
  metin: [
    'MADDİ HASARLI TRAFİK KAZASI TESPİT TUTANAĞI',
    'Kaza Tarihi ve Saati: 14.03.2026 14:30',
    'A Aracı Plakası: 34 KRG 001',
    'B Aracı Plakası: 06 KR 4567',
    'B Aracı Poliçe No: 11112222',
  ].join('\n'),
}
const EKSPERTIZ: KuralSayfa = { belgeId: 'b-eks', sayfaNo: 2, kategori: 'EKSPERTIZ', metin: 'EKSPERTİZ RAPORU\nHasar Tarihi: 10.03.2026\nOnarım bedeli: 9.000,00 TL' }
const ETIKETSIZ: KuralSayfa = { belgeId: 'b-diger', sayfaNo: 1, kategori: 'DIGER', metin: 'Rapor 12.05.2026 tarihinde düzenlendi. Toplam 4.500,00 TL.' }

const bul = (liste: ReturnType<typeof kuralCikar>, alan: string) => liste.filter((o) => o.alan === alan)

describe('poliçe', () => {
  const o = kuralCikar([POLICE])

  it('poliçe no, tanzim, başlangıç, bitiş ve sigortalı plaka', () => {
    expect(bul(o, 'policeNo').map((x) => x.deger)).toEqual(['KRG-2026-000123'])
    expect(bul(o, 'policeTanzimTarihi').map((x) => x.deger)).toEqual(['2026-01-02'])
    expect(bul(o, 'policeBaslangic').map((x) => x.deger)).toEqual(['2026-01-03'])
    expect(bul(o, 'policeBitis').map((x) => x.deger)).toEqual(['2027-01-03'])
    expect(bul(o, 'sigortaliPlaka').map((x) => x.deger)).toEqual(['34 KRG 001'])
  })

  it('poliçede kaza tarihi ya da ödeme önerilmez (prim tutarı dekont değildir)', () => {
    expect(bul(o, 'kazaTarihi')).toEqual([])
    expect(o.some((x) => x.alan.startsWith('odeme['))).toBe(false)
  })

  it('her öneri KURAL kaynaklı, kural kodlu ve alıntısı sayfada birebir bulunur', () => {
    for (const x of o) {
      expect(x.kaynakTuru).toBe('KURAL')
      expect(x.uretici).toMatch(/^KURAL:[A-Z_]+@1$/)
      expect(x.kaynakBelgeId).toBe('b-police')
      expect(x.sayfa).toBe(1)
      expect(alintiDogrula(x.alinti, [POLICE], { belgeId: x.kaynakBelgeId, sayfa: x.sayfa }).durum, x.alan).toBe('DOGRU')
    }
  })

  it('türü belirsiz sayfada güçlü poliçe işareti varsa vade aralığı okunur', () => {
    expect(policeSayfasiMi(POLICE_VADE)).toBe(true)
    const v = kuralCikar([POLICE_VADE])
    expect(bul(v, 'policeNo').map((x) => x.deger)).toEqual(['99887766'])
    expect(bul(v, 'policeBaslangic').map((x) => [x.deger, x.uretici])).toEqual([['2026-02-15', 'KURAL:POLICE_VADE@1']])
    expect(bul(v, 'policeBitis').map((x) => x.deger)).toEqual(['2027-02-15'])
  })
})

describe('dekont', () => {
  it('tutar ve en yakın işlem tarihi tek ödeme önerisi; banka masrafı ödeme sayılmaz', () => {
    expect(dekontSayfasiMi(DEKONT)).toBe(true)
    const o = kuralCikar([DEKONT])
    expect(o).toHaveLength(1)
    expect(o[0]).toMatchObject({ alan: 'odeme[2026-03-14|12500.00]', deger: { tarih: '2026-03-14', tutar: 12500 }, uretici: 'KURAL:DEKONT@1' })
    expect(alintiDogrula(o[0].alinti, [DEKONT], { belgeId: 'b-dekont', sayfa: 1 }).durum).toBe('DOGRU')
  })

  it('tarih bulunamazsa ödeme tarihsiz ve düşük güvenle önerilir', () => {
    const o = kuralCikar([{ ...DEKONT, metin: 'HAVALE DEKONTU\nTutar: 7.250,50 TL' }])
    expect(o[0]).toMatchObject({ deger: { tarih: null, tutar: 7250.5 }, guven: 0.6 })
  })
})

describe('tutanak ve diğer belgeler', () => {
  it('KTT: kaza tarihi (saatli alıntı) ve plaka listesi; tutanaktaki poliçe no önerilmez', () => {
    const o = kuralCikar([KTT])
    expect(bul(o, 'kazaTarihi')).toHaveLength(1)
    expect(bul(o, 'kazaTarihi')[0]).toMatchObject({ deger: '2026-03-14', uretici: 'KURAL:KAZA_TARIHI@1', guven: 0.85 })
    expect(bul(o, 'kazaTarihi')[0].alinti).toContain('14:30')
    expect(bul(o, 'tutanakPlakalari')[0].deger).toEqual(['34 KRG 001', '06 KR 4567'])
    expect(bul(o, 'policeNo')).toEqual([])
  })

  it('ekspertizdeki "Hasar Tarihi" daha düşük güvenle kaza tarihi önerisi olur', () => {
    const o = kuralCikar([EKSPERTIZ])
    expect(bul(o, 'kazaTarihi')[0]).toMatchObject({ deger: '2026-03-10', uretici: 'KURAL:HASAR_TARIHI@1', guven: 0.65 })
  })

  it('etiketsiz tarih ve tutar öneri olmaz', () => {
    expect(kuralCikar([ETIKETSIZ])).toEqual([])
  })

  it('aynı değer iki sayfada bulunursa bir kez; farklı değerler ayrı öneri (çelişki görünür)', () => {
    const o = kuralCikar([KTT, { ...KTT, belgeId: 'b-ktt-2' }, { ...EKSPERTIZ }])
    expect(bul(o, 'kazaTarihi').map((x) => x.deger)).toEqual(['2026-03-14', '2026-03-10'])
  })

  it('boş sayfa atlanır', () => {
    expect(kuralCikar([{ belgeId: 'b', sayfaNo: 1, metin: '   ' }])).toEqual([])
  })
})
