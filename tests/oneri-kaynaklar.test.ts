/**
 * S18/S19 · Hugo satırı ve AI sonucu → öneri listesi (kolona yazılmaz). Ray'e istek taslağı (yapay zekâsız).
 * Ekranda maskeleme (TCKN, telefon, IBAN, plaka). Kurgusal değerler; kişisel veri yok.
 */
import { describe, expect, it } from 'vitest'
import { aiOnerileri, hugoOnerileri, listeKaynagi } from '@/lib/konsrucu/oneri/kaynaklar'
import { rayEvrakIstekTaslagi } from '@/lib/konsrucu/oneri/ray-istek'
import { ekranMaskele } from '@/lib/konsrucu/oneri/maske-gorunum'

describe('hugoOnerileri', () => {
  const hugo = { kaynak: 'hugo', ham: { 'Rücu Nedeni': 'Hizmet kusuru', 'Rücu Tutarı': '123,456.00', 'Hasar Tarihi': '10/03/2026' } }

  it('yalnız Hugo/Zurich listesinden gelen dosyada üretilir', () => {
    expect(listeKaynagi(hugo)).toBe('hugo')
    expect(listeKaynagi({ kaynak: 'elle' })).toBeNull()
    expect(hugoOnerileri({ rucuSebebi: 'Hizmet kusuru', brans: 'KASKO', kaynakJson: null })).toEqual([])
  })

  it('"Rücu Nedeni" → kod önerisi (kaynak Hugo, ham hücre alıntı); tutar ve hasar tarihi karşılaştırma önerisi', () => {
    const o = hugoOnerileri({ rucuSebebi: 'Hizmet kusuru', brans: 'KASKO', rucuTutari: 123.46, hasarTarihi: new Date(Date.UTC(2026, 2, 10)), kaynakJson: hugo })
    expect(o.find((x) => x.alan === 'rucuSebebiKod')).toMatchObject({
      deger: 'KASKO_HIZMET_KUSURU', kaynakTuru: 'HUGO', alinti: 'Rücu Nedeni: Hizmet kusuru', uretici: 'HUGO:RUCU_NEDENI@1',
    })
    expect(o.find((x) => x.alan === 'rucuTutari')).toMatchObject({ deger: 123.46, kaynakTuru: 'HUGO', alinti: 'Rücu Tutarı: 123,456.00' })
    expect(o.find((x) => x.alan === 'kazaTarihi')).toMatchObject({ deger: '2026-03-10', kaynakTuru: 'HUGO' })
  })

  it('branş bilinmiyorsa kod önerisi yazılmaz (adaylar seçim bileşeninde görünür)', () => {
    expect(hugoOnerileri({ rucuSebebi: 'Alkollü', brans: null, kaynakJson: hugo }).some((x) => x.alan === 'rucuSebebiKod')).toBe(false)
  })

  it('Zurich listesi "Ray Excel" değil EXCEL kaynağı; poliçe no da öneri olur', () => {
    const o = hugoOnerileri({ rucuSebebi: 'Karşı araç kusurlu', brans: 'KASKO', kaynakJson: { kaynak: 'zurich', policeNo: 'Z-9988' } })
    expect(o.map((x) => [x.alan, x.kaynakTuru])).toEqual([['rucuSebebiKod', 'EXCEL'], ['policeNo', 'EXCEL']])
  })
})

describe('aiOnerileri', () => {
  it('yetkili icra alınmaz; ekspertiz dekontu ödeme önerisi olmaz; kaynak bilgisi taşınır', () => {
    const o = aiOnerileri({
      brans: 'KASKO', asilAlacak: 12500, rucuOrani: '% 100',
      dekontlar: [{ tarih: '2026-03-14', tutar: 12500 }, { tarih: '2026-03-15', tutar: 900, ekspertizMi: true }],
      kaynaklar: { asilAlacak: { belgeId: 'b1', sayfa: 2, alinti: 'Tutar: 12.500,00 TL', guven: 0.9 } },
      ...({ yetkiliIcra: 'Adana İcra Dairesi' } as object),
    })
    expect(o.map((x) => x.alan)).toEqual(['brans', 'asilAlacak', 'rucuOrani', 'odeme[2026-03-14|12500.00]'])
    expect(o.every((x) => x.kaynakTuru === 'AI')).toBe(true)
    expect(o.find((x) => x.alan === 'asilAlacak')).toMatchObject({ kaynakBelgeId: 'b1', sayfa: 2, alinti: 'Tutar: 12.500,00 TL', guven: 0.9 })
  })
})

describe('Ray\'e istek taslağı', () => {
  it('eksik yoksa taslak yok', () => {
    expect(rayEvrakIstekTaslagi({ eksikler: [] })).toBeNull()
  })

  it('konu dosya numaralarını, gövde eksikleri sırayla taşır; mailto alıcısız ve kodlanmış', () => {
    const t = rayEvrakIstekTaslagi({ hukukDosyaNo: 'HK-KURGU-1', hasarDosyaNo: 'HS-KURGU-2', rucuSebebiAd: 'Kasko halefiyeti · karşı araç', eksikler: [{ ad: 'Ödeme dekontu' }, { ad: 'Ekspertiz raporu', aciklama: 'varsa' }] })!
    expect(t.konu).toBe('Eksik evrak talebi · Hukuk no HK-KURGU-1 · Hasar no HS-KURGU-2')
    expect(t.govde).toContain('1. Ödeme dekontu')
    expect(t.govde).toContain('2. Ekspertiz raporu (varsa)')
    expect(t.govde).toContain('⟨Büro⟩')
    expect(t.mailto.startsWith('mailto:?subject=')).toBe(true)
    expect(decodeURIComponent(t.mailto)).toContain('Ödeme dekontu')
  })
})

describe('ekranMaskele', () => {
  it('geçerli TCKN, telefon ve IBAN maskelenir; poliçe no gibi korunan bağlam kalır', () => {
    // Kurgusal, kontrol hanesi tutan uydurma TCKN (10000000146 değil — o kontrol hanesini tutmaz)
    const tckn = '12345678950'
    const m = ekranMaskele(`Sürücü TC: ${tckn} Tel: 0532 000 00 11 IBAN: TR33 0006 1005 1978 6457 8413 26 Poliçe No: 12345678`)!
    expect(m).not.toContain(tckn)
    expect(m).not.toContain('0532 000 00 11')
    expect(m).not.toContain('6457 8413 26')
    expect(m).toContain('Poliçe No: 12345678')
  })

  it('plaka maskelenir; boş ve null korunur', () => {
    expect(ekranMaskele('Plaka: 34 KRG 001')).not.toContain('KRG 001')
    expect(ekranMaskele('')).toBe('')
    expect(ekranMaskele(null)).toBeNull()
  })
})
