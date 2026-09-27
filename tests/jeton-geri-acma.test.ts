import { describe, expect, it } from 'vitest'
import { geriAc, jetonKaldiMi } from '@/lib/ai/geri-ac'
import { kaliteRaporu, type KaliteGirdi } from '@/lib/konsrucu/dilekce-v2/kapilar'

// S37 (06 §7.4-6; 06 §7.4 madde 6 "jetonların geri açılması sonrası doğrulama"). Bu dosya, dilekçe kalite
// kapısının (K7_KVKK) jeton geri açma sonrası doğrulamasını kurgusal jetonlarla dener — gerçek kişi/kurum yok.
const TEMIZ_GIRDI: KaliteGirdi = {
  metin: '',
  kutuphane: [],
  atifOnaylari: [],
  davaliAdaylari: [],
  secilenDavalilar: [],
  celiskiler: [],
  davaDegeriKurus: null,
  takip: null,
  digerMusteriAdlari: [],
  tensip: { davaSartiArabuluculuk: false, sonTutanakEkVar: false, vekaletnameVar: true },
}

describe('jeton geri açma: bilinen jetonlar tamamen açılınca kapı geçer', () => {
  it('standart biçimli jetonlar (KİŞİ, TCKN) eşlemeyle açılır; metinde jeton kalmaz', () => {
    const ham = 'Borçlu [KİŞİ-1], TCKN [TCKN-1] ile 10.01.2026 tarihinde görüşülmüştür.'
    const eslesme = { '[KİŞİ-1]': 'A**** Y*****', '[TCKN-1]': '12345678901' }
    const { acik, sayi, bilinmeyen } = geriAc(ham, eslesme)
    expect(sayi).toBe(2)
    expect(bilinmeyen).toEqual([])
    expect(jetonKaldiMi(acik)).toBe(false)

    const r = kaliteRaporu({ ...TEMIZ_GIRDI, metin: acik })
    expect(r.kirmizi.some((b) => b.kod === 'K7_KVKK')).toBe(false)
    expect(r.imzayaHazirOlabilir).toBe(true)
  })

  it('esnek yazım (iç boşluklu, "E-POSTA") jeton da tanınır ve açılır', () => {
    const ham = 'Sayın [ KİŞİ - 2 ] ile [E-POSTA-1] üzerinden yazışılmıştır.'
    const eslesme = { '[KİŞİ-2]': 'M**** K***', '[EPOSTA-1]': 'k***@ornek.com' }
    const { acik, sayi, bilinmeyen } = geriAc(ham, eslesme)
    expect(sayi).toBe(2)
    expect(bilinmeyen).toEqual([])
    expect(jetonKaldiMi(acik)).toBe(false)
    expect(kaliteRaporu({ ...TEMIZ_GIRDI, metin: acik }).kirmizi.some((b) => b.kod === 'K7_KVKK')).toBe(false)
  })
})

describe('jeton geri açma: açılamayan ya da yabancı jeton kalırsa "imzaya hazır" kilitlenir', () => {
  it('eşlemede karşılığı olmayan jeton "bilinmeyen" listesine düşer ve metinde açılmadan kalır', () => {
    const ham = 'Borçlu [KİŞİ-1] ile [KİŞİ-9] görüşülmüştür.'
    const eslesme = { '[KİŞİ-1]': 'A**** Y*****' } // [KİŞİ-9] için kayıtlı eşleme yok
    const { acik, bilinmeyen } = geriAc(ham, eslesme)
    expect(bilinmeyen).toContain('[KİŞİ-9]')
    expect(jetonKaldiMi(acik)).toBe(true)
  })

  it('açılmamış jeton metinde kalınca K7_KVKK kırmızıdır ve "imzaya hazır" kilitlenir', () => {
    const ham = 'Borçlu [KİŞİ-1] ile [KİŞİ-9] görüşülmüştür.'
    const eslesme = { '[KİŞİ-1]': 'A**** Y*****' }
    const { acik } = geriAc(ham, eslesme)
    const r = kaliteRaporu({ ...TEMIZ_GIRDI, metin: acik })
    expect(r.kirmizi.some((b) => b.kod === 'K7_KVKK')).toBe(true)
    expect(r.imzayaHazirOlabilir).toBe(false)
  })

  it('bozuk/yabancı köşeli ayraç biçimi ("artık" jeton görünümü) de kırmızıdır', () => {
    const metin = 'Görüşme notu: (KİŞİ-99) ile telefon görüşmesi yapıldı.'
    expect(jetonKaldiMi(metin)).toBe(true)
    const r = kaliteRaporu({ ...TEMIZ_GIRDI, metin })
    expect(r.kirmizi.some((b) => b.kod === 'K7_KVKK')).toBe(true)
  })

  it('birden çok bilinen jeton türü (IBAN, PLAKA) da eksiksiz açılmalıdır; biri eksik kalırsa kilitli kalır', () => {
    const ham = 'IBAN [IBAN-1], plaka [PLAKA-1] ve adres [ADRES-1] dosyada kayıtlıdır.'
    const tamEslesme = { '[IBAN-1]': 'TR** **** **** **** **** **** **', '[PLAKA-1]': '34 XX 000', '[ADRES-1]': 'Kurgusal adres' }
    const tamAcik = geriAc(ham, tamEslesme).acik
    expect(jetonKaldiMi(tamAcik)).toBe(false)
    expect(kaliteRaporu({ ...TEMIZ_GIRDI, metin: tamAcik }).imzayaHazirOlabilir).toBe(true)

    const eksikEslesme = { '[IBAN-1]': 'TR** **** **** **** **** **** **', '[PLAKA-1]': '34 XX 000' } // ADRES-1 eksik
    const eksikAcik = geriAc(ham, eksikEslesme).acik
    expect(jetonKaldiMi(eksikAcik)).toBe(true)
    const r = kaliteRaporu({ ...TEMIZ_GIRDI, metin: eksikAcik })
    expect(r.kirmizi.some((b) => b.kod === 'K7_KVKK')).toBe(true)
    expect(r.imzayaHazirOlabilir).toBe(false)
  })
})
