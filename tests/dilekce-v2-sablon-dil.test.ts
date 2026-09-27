import { describe, expect, it } from 'vitest'
import {
  araBaslikMi, blokIsle, bloklaraBol, halEki, paraBicim, sablonAlanlari, sablonAyristir, SablonHatasi, tarihBicim, AI_ISARET,
} from '@/lib/konsrucu/dilekce-v2/sablon-dil'

const isle = (src: string, baglam: Record<string, unknown> = {}) => {
  const bloklar = bloklaraBol(sablonAyristir(src))
  return bloklar.map((b) => blokIsle(b, baglam as never))
}

describe('şablon dili: ayrıştırma', () => {
  it('blok açıklamaları üst düzeyde blok başlatır; kimlik, başlık ve tür okunur', () => {
    const src = '{{! [B01 BAŞLIK] YARI · kaynak: D1 }}\nT.C.\n{{! [B02 TARAFLAR] SABİT (davacı) + ÖZGÜ }}\nDAVACI\t: {{davaci_unvan}}\n'
    const b = bloklaraBol(sablonAyristir(src))
    expect(b.map((x) => [x.etiket.id, x.etiket.baslik, x.etiket.tur])).toEqual([['B01', 'BAŞLIK', 'YARI'], ['B02', 'TARAFLAR', 'SABİT']])
  })

  it('koşul içindeki açıklama blok bölmez', () => {
    const src = '{{! [B09-K] YARI }}\n{{#kismi}}A {{! [B09-K2] ÖNERİ }} B{{/kismi}}'
    const b = bloklaraBol(sablonAyristir(src))
    expect(b).toHaveLength(1)
    expect(blokIsle(b[0], { kismi: true }).metin).toBe('A B')
  })

  it('kapanmayan koşul, yanlış kapanış ve bilinmeyen biçim hata verir', () => {
    expect(() => sablonAyristir('{{#a}} x')).toThrow(SablonHatasi)
    expect(() => sablonAyristir('{{#a}} x {{/b}}')).toThrow(SablonHatasi)
    expect(() => sablonAyristir('{{tutar|dolar}}')).toThrow(/Bilinmeyen biçim/)
  })

  it('iç içe süslü parantezli AI yuvası ayrıştırılır; talimat içindeki alan işlenir', () => {
    const r = isle('{{! [Z10-Ö] ÖNERİ }}{{AI: Doğrulanmış alıntıyı ({{alinti}}) kullan.}}', { alinti: 'örnek alıntı' })[0]
    expect(r.aiYuvalari).toEqual([{ id: 'Z10-Ö#1', blokId: 'Z10-Ö', talimat: 'Doğrulanmış alıntıyı (örnek alıntı) kullan.' }])
    expect(r.metin).toBe(AI_ISARET('Z10-Ö#1'))
  })

  it('alan ve koşul listesi çıkarılır', () => {
    const s = sablonAlanlari(sablonAyristir('{{a}} {{#k}}{{b|para}}{{/k}} {{AI: x {{c}}}}'))
    expect(s).toEqual({ alanlar: ['a', 'b', 'c'], kosullar: ['k'], aiYuvasi: 1 })
  })
})

describe('şablon dili: işleme', () => {
  it('eksik alan ⟨alan adı⟩ yer tutucusu olur ve kaydedilir (sabit olgu yok)', () => {
    const r = isle('{{! [B05 OLAY] ÖZGÜ }}Kaza {{kaza_tarihi|tarih}} tarihinde {{yol_adi|bulunma}} olmuştur.', { kaza_tarihi: '2026-01-10' })[0]
    expect(r.metin).toBe('Kaza 10.01.2026 tarihinde ⟨yol adı⟩ olmuştur.')
    expect(r.yerTutucular).toEqual([{ alan: 'yol_adi', blokId: 'B05', neden: 'EKSIK' }])
    expect(r.kullanilanAlanlar).toEqual(['kaza_tarihi'])
  })

  it('biçimsiz tutar yer tutucu olur (tahmin edilmez)', () => {
    const r = isle('{{! [B04] YARI }}{{asil|para}} TL', { asil: 'beş bin' })[0]
    expect(r.metin).toBe('⟨asil⟩ TL')
    expect(r.yerTutucular[0].neden).toBe('BICIM')
  })

  it('liste koşulu her öğe için tekrarlanır; son bayrağı ayırıcıyı yönetir', () => {
    const r = isle('{{! [X] YARI }}{{#kalemler}}{{ad}} {{tutar|para}} TL{{^son}}, {{/son}}{{/kalemler}}', {
      kalemler: [{ ad: 'Servis', tutar: '1000' }, { ad: 'Sigortalı', tutar: 2500.5 }],
    })[0]
    expect(r.metin).toBe('Servis 1.000,00 TL, Sigortalı 2.500,50 TL')
  })

  it('olumsuz koşul yalnız değer yok ya da yanlışken basar', () => {
    const src = '{{! [B04] YARI }}{{^kismi}}TAM{{/kismi}}{{#kismi}}KISMİ{{/kismi}}'
    expect(isle(src, { kismi: false })[0].metin).toBe('TAM')
    expect(isle(src, { kismi: true })[0].metin).toBe('KISMİ')
  })

  it('{{n}} blok içinde kesintisiz numara verir, bloklar arasında sıfırlanır', () => {
    const src = '{{! [A] SABİT }}{{n}}- a\n{{#ek}}{{n}}- ek\n{{/ek}}{{n}}- b\n{{! [B] SABİT }}{{n}}- c'
    const [a, b] = isle(src, { ek: false })
    expect(a.metin).toBe('1- a\n2- b')
    expect(b.metin).toBe('1- c')
  })

  it('boşluklar düzenlenir: satır sonu, çift boşluk, üçten fazla boş satır; sekme girintisi korunur', () => {
    const r = isle('{{! [A] SABİT }}X  Y ,\n\n\n\n\tUETS  (1)   ')[0]
    expect(r.metin).toBe('X Y,\n\n\tUETS (1)')
  })
})

describe('Türkçe biçim', () => {
  it('hâl ekleri: özel ad, kısaltma, tamlama ve cins isim', () => {
    expect(halEki('Ahmet', 'yonelme')).toBe("Ahmet'e")
    expect(halEki('Ayşe', 'yonelme')).toBe("Ayşe'ye")
    expect(halEki('KGM', 'ilgi')).toBe("KGM'nin")
    expect(halEki('Örnek Sigorta A.Ş.', 'ilgi')).toBe("Örnek Sigorta A.Ş.'nin")
    expect(halEki('Örnek 1. İcra Dairesi', 'ilgi')).toBe("Örnek 1. İcra Dairesi'nin")
    expect(halEki('Örnek Otoyolu', 'bulunma')).toBe("Örnek Otoyolu'nda")
    expect(halEki('köpek', 'yonelme')).toBe('köpeğe')
    expect(halEki('köpek', 'ayrilma')).toBe('köpekten')
    expect(halEki('köpek', 'ilgi')).toBe('köpeğin')
    expect(halEki('Ayşe Kuzu', 'yonelme')).toBe("Ayşe Kuzu'ya")
    expect(halEki('AHMET YILMAZ', 'yonelme')).toBe("AHMET YILMAZ'A")
    expect(halEki('2026/100', 'ilgi')).toBe("2026/100'ün")
  })

  it('biçim zinciri soldan sağa uygulanır', () => {
    expect(isle('{{! [A] SABİT }}{{ad|buyuk|yonelme}}', { ad: 'Ayşe Kuzu' })[0].metin).toBe("AYŞE KUZU'YA")
  })

  it('para ve tarih biçimi', () => {
    expect(paraBicim('1234567.8')).toBe('1.234.567,80')
    expect(paraBicim('5.000')).toBe('5.000,00')
    expect(paraBicim('abc')).toBeNull()
    expect(tarihBicim('2026-03-20T21:00:00.000Z')).toBe('21.03.2026')
    expect(tarihBicim('26/12/2024')).toBe('26.12.2024')
    expect(tarihBicim('dün')).toBeNull()
  })

  it('ara başlık tanıma', () => {
    expect(araBaslikMi('AÇIKLAMALAR')).toBe(true)
    expect(araBaslikMi('2. Hasar Tespiti ve Tazminat Ödemesi')).toBe(true)
    expect(araBaslikMi('Davalı taraf, yasal süresi içerisinde itiraz etmiştir.')).toBe(false)
    expect(araBaslikMi('MÜVEKKİL SİGORTA ŞİRKETİ ÖDEME YAPMIŞTIR.')).toBe(false)
  })
})
