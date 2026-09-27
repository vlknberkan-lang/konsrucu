/**
 * lib/ai/maske.ts birim testleri — araclar/evrak-metin/tests/test_maskele.py'nin TypeScript karşılığı.
 * YALNIZ SENTETİK veri (tests/maske-yardimci.ts). Dosya okuma/yazma testleri (kaydet/yukle) yerine
 * bellekteki eşlemeden kurma (eslesmedenKur) sınanır: sunucuda kalıcı eşleme tablosu yoktur.
 */
import { describe, it, expect } from 'vitest'
import { JETON_RE, Maskeleyici, katla, normallestir, sezgiselAdlar, tcknGecerli, trBuyuk, trKucuk } from '@/lib/ai/maske'
import { LISTE_KISILER, gecersizTckn, tcknUret, tohumlu } from './maske-yardimci'

const R = tohumlu(20260927)
const [T1, T2, T3, T4] = [tcknUret(R), tcknUret(R), tcknUret(R), tcknUret(R)]
const maskele = (metin: string, kisiler: string[] = LISTE_KISILER) => new Maskeleyici(kisiler).maskele(metin).metin
const jetonlar = (s: string) => [...s.matchAll(new RegExp(JETON_RE.source, 'gu'))].map((m) => m[0])

describe('Türkçe harf işlemleri', () => {
  it('küçük/büyük harf', () => {
    expect(trKucuk('İSTANBUL IŞIK')).toBe('istanbul ışık')
    expect(trBuyuk('istanbul ışık')).toBe('İSTANBUL IŞIK')
    expect(trKucuk('İİİ')).toHaveLength(3) // 'İ'.toLowerCase() iki birim olur
  })
  it('katla uzunluğu korur ve yazımları eşitler', () => {
    for (const s of ['İLKAY IŞIKGÖZ', 'İlkay Işıkgöz', 'ilkay ışıkgöz', 'ILKAY ISIKGOZ', 'Çağrı Şüküroğlu']) expect(katla(s)).toHaveLength(s.length)
    expect(katla('İLKAY IŞIKGÖZ')).toBe(katla('ilkay ışıkgöz'))
    expect(katla('İLKAY IŞIKGÖZ')).toBe('ilkay isikgoz')
  })
  it('normalleştirme', () => {
    expect(normallestir('a\r\nb­ c')).toBe('a\nb c')
    expect(normallestir('İsmail'.normalize('NFD'))).toBe('İsmail')
    expect(normallestir('i̇smail')).toBe('ismail')
  })
})

describe('TCKN', () => {
  it('algoritma', () => {
    expect(tcknGecerli(T1)).toBe(true)
    expect(tcknGecerli(gecersizTckn(T1))).toBe(false)
    expect(tcknGecerli('0' + T1.slice(1))).toBe(false)
  })
  it('yazımlar tek jetona iner', () => {
    const t = T1
    const yazimlar = [t, `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6, 9)} ${t.slice(9)}`, `${t.slice(0, 3)}.${t.slice(3, 6)}.${t.slice(6, 9)}.${t.slice(9)}`,
      `${t.slice(0, 3)}-${t.slice(3, 6)}-${t.slice(6, 9)}-${t.slice(9)}`, `${t.slice(0, 6)}\n${t.slice(6)}`, t.split('').join(' ')]
    const m = new Maskeleyici()
    for (const y of yazimlar) {
      const r = m.maskele(`T.C. Kimlik No: ${y} olan kişi`)
      expect(r.metin, y).toBe('T.C. Kimlik No: [TCKN-1] olan kişi')
      expect(r.sayim.TCKN).toBe(1)
    }
    expect(m.eslesme['[TCKN-1]']).toBe(t)
  })
  it('kontrol hanesi geçersiz 11 hane maskelenmez', () => {
    const g = gecersizTckn(T2)
    expect(maskele(`Numara ${g}`)).toBe(`Numara ${g}`)
  })
  it('belgeler arası tutarlılık', () => {
    const m = new Maskeleyici()
    const a = m.maskele(`Borçlu TCKN ${T1}, diğer ${T2}`).metin
    const b = m.maskele(`İkinci belge: ${T2} ve ${T1.slice(0, 3)} ${T1.slice(3, 6)} ${T1.slice(6, 9)} ${T1.slice(9)}`).metin
    expect(a).toBe('Borçlu TCKN [TCKN-1], diğer [TCKN-2]')
    expect(b).toBe('İkinci belge: [TCKN-2] ve [TCKN-1]')
  })
})

describe('desenler', () => {
  it('VKN (bağlamlı) — bağlamsız 10 hane korunur', () => {
    for (const etiket of ['VKN: ', 'V.K.N. ', 'Vergi No: ', 'Vergi Kimlik No: ', 'VERGİ NUMARASI : ', 'Vergi Dairesi: Kadıköy VKN ']) {
      const out = maskele(`${etiket}1234567890 kayıtlı`)
      expect(out, etiket).toContain('[VKN-1]')
      expect(out).not.toContain('1234567890')
    }
    expect(maskele('Vergi No: 123 456 7890')).toBe('Vergi No: [VKN-1]')
    expect(maskele('Referans 1234567890')).toBe('Referans 1234567890')
  })
  it('telefon yazımları', () => {
    for (const y of ['+90 532 123 45 67', '+905321234567', '0532 123 45 67', '05321234567', '(0532) 123 45 67', '0 (532) 123 45 67',
      '(532) 123 45 67', '0212 555 12 34', '0532-123-45-67', '0090 532 123 4567']) {
      expect(maskele(`Telefon ${y} numarası`), y).toBe('Telefon [TEL-1] numarası')
    }
    expect(maskele('GSM: 532 123 45 67')).toBe('GSM: [TEL-1]')
    const m = new Maskeleyici()
    expect([m.maskele('tel 0532 123 45 67').metin, m.maskele('cep +90 532 1234567').metin]).toEqual(['tel [TEL-1]', 'cep [TEL-1]'])
  })
  it('IBAN', () => {
    for (const y of ['TR33 0006 1005 1978 6457 8413 26', 'TR330006100519786457841326', 'tr33 0006 1005 1978 6457 8413 26', 'TR33-0006-1005-1978-6457-8413-26']) {
      expect(maskele(`IBAN: ${y}.`), y).toBe('IBAN: [IBAN-1].')
    }
  })
  it('e-posta', () => {
    expect(maskele('e-posta: ilkay.isik_42@ornek-alan.com.tr adresine')).toBe('e-posta: [EPOSTA-1] adresine')
  })
  it('plaka yazımları', () => {
    for (const y of ['34 ABC 123', '34ABC123', '34-ABC-123', '06 abc 12', '81 A 1234', '01 AB 1234', '34 abc 1234']) {
      expect(maskele(`Araç plakası ${y} olup`), y).toBe('Araç plakası [PLAKA-1] olup')
    }
    const m = new Maskeleyici()
    expect(m.maskele('34 ABC 123').metin).toBe(m.maskele('34abc123').metin)
  })
  it('plaka yanlış pozitifi yok (esas no plaka sanılmaz)', () => {
    for (const s of ['2 yıl 12 ay 24 gün', '2025/12 E 2025/34 K', 'toplam 100 TL 50 kuruş', '%18 KDV 100 TL', '90 AB 123', '00 AB 123', 'Madde 12', '12 kg 45 gr', 'Esas No: 2026/123']) {
      expect(maskele(s), s).toBe(s)
    }
  })
})

describe('kişi adları', () => {
  it('liste yazımları', () => {
    for (const y of ['İlkay Işıkgöz', 'İLKAY IŞIKGÖZ', 'ilkay ışıkgöz', 'ILKAY ISIKGOZ', 'Işıkgöz İlkay', 'IŞIKGÖZ, İlkay', 'İlkay\nIşıkgöz', 'İlkay Işık-\ngöz', 'Işıkgöz']) {
      expect(maskele(`Sigortalı olmayan ${y} tarafından`), y).toBe('Sigortalı olmayan [KİŞİ-1] tarafından')
    }
  })
  it('ek ve kesme', () => {
    expect(maskele("İLKAY IŞIKGÖZ'ün aracı")).toBe("[KİŞİ-1]'ün aracı")
  })
  it('üç kelimeli ad', () => {
    const m = new Maskeleyici(LISTE_KISILER)
    expect(m.maskele('Oğuzhan Çamurlu Değirmenci geldi. Oğuzhan Değirmenci ve DEĞİRMENCİ Oğuzhan').metin).toBe('[KİŞİ-1] geldi. [KİŞİ-1] ve [KİŞİ-1]')
  })
  it('aynı kişi aynı jeton', () => {
    const m = new Maskeleyici(LISTE_KISILER)
    expect(m.maskele('İlkay Işıkgöz ve Ferhunde Bıçakçıoğlu').metin).toBe('[KİŞİ-1] ve [KİŞİ-2]')
    expect(m.maskele('FERHUNDE BIÇAKÇIOĞLU ile IŞIKGÖZ').metin).toBe('[KİŞİ-2] ile [KİŞİ-1]')
    expect(m.eslesme['[KİŞİ-1]']).toBe('İlkay Işıkgöz')
  })
  it('ortak soyad ayrı jeton alır', () => {
    const out = new Maskeleyici(['Kerimhan Tuzcuoğlu', 'Belgin Tuzcuoğlu']).maskele('Kerimhan Tuzcuoğlu, Belgin Tuzcuoğlu ve TUZCUOĞLU').metin
    expect(new Set(jetonlar(out)).size).toBe(3)
    expect(katla(out)).not.toContain('uzcuo')
  })
  it('etiket sezgisi', () => {
    const ornekler: Record<string, string> = {
      'DAVALI : ORHUN KAVAKLIDERE (TCKN: yok)': 'ORHUN KAVAKLIDERE',
      'Sürücü Gülfidan Kaşıkçı olay yerinde': 'Gülfidan Kaşıkçı',
      'Adı Soyadı: NEBAHAT KÜPELİOĞLU Baba Adı: ALİ': 'NEBAHAT KÜPELİOĞLU',
      'Sayın Tolgahan Sarımsakçı,': 'Tolgahan Sarımsakçı',
      'Davalı Vekili: Av. Mehmet Emin Zırhlıoğlu': 'Mehmet Emin Zırhlıoğlu',
      'Ruhsat Sahibi: SEVDİGÜL ÇÖMLEKÇİ': 'SEVDİGÜL ÇÖMLEKÇİ',
      'Borçlu\nFIRAT OKLUBAŞ': 'FIRAT OKLUBAŞ',
    }
    for (const [metin, ad] of Object.entries(ornekler)) {
      expect(sezgiselAdlar(metin), metin).toContain(ad)
      const out = maskele(metin, [])
      expect(out, metin).toContain('[KİŞİ-1]')
      for (const k of ad.split(' ')) expect(katla(out), metin).not.toContain(katla(k))
    }
  })
  it('sezgisel adın etiketsiz geçişi de maskelenir (önce keşif)', () => {
    const m = new Maskeleyici()
    m.kesfet('DAVALI : ORHUN KAVAKLIDERE')
    expect(m.maskele('Kaza, ORHUN KAVAKLIDERE idaresindeki araçla, Kavaklıdere Orhun ...', false).metin).toBe('Kaza, [KİŞİ-1] idaresindeki araçla, [KİŞİ-1] ...')
  })
  it('ad bir sonraki alan etiketinde biter', () => {
    const s = 'Sigortalı: SELAHATTİN NURİ TEZCANLAR  Sigorta Ettiren: Doğan Oto Kiralama A.Ş.'
    expect(sezgiselAdlar(s)).toEqual(['SELAHATTİN NURİ TEZCANLAR'])
    expect(maskele(s, [])).toBe('Sigortalı: [KİŞİ-1]  Sigorta Ettiren: Doğan Oto Kiralama A.Ş.')
    expect(sezgiselAdlar('Davalı VELİ KAYAALTI')).toEqual(['VELİ KAYAALTI'])
  })
  it('şirket ve etiket dışı ifade kişi sayılmaz', () => {
    for (const s of ['DAVACI : RAY SİGORTA A.Ş.', 'Davalı : XYZ LOJİSTİK TİCARET LTD. ŞTİ.', 'Davalı ABC OTOMOTİV SANAYİ VE TİCARET ANONİM ŞİRKETİ',
      'Sürücü Belgesi Sınıfı: B', 'DAVALI ŞİRKETİN SORUMLULUĞU', 'Sayın İSTANBUL 5. ASLİYE TİCARET MAHKEMESİ HAKİMLİĞİNE', 'SAYIN MAHKEMEYE',
      'Davalı Taraf Vekili', 'Sigortalı Araç Plakası', 'Davalı Türkiye Sigorta A.Ş. vekili']) {
      expect(sezgiselAdlar(s), s).toEqual([])
      expect(maskele(s, []), s).toBe(s)
    }
  })
  it('şirket adı yalnız tam yazımıyla maskelenir (tamAdEkle)', () => {
    const m = new Maskeleyici()
    m.tamAdEkle('Kurgusal Nakliyat Ltd. Şti.')
    const out = m.maskele('Borçlu Kurgusal Nakliyat Ltd. Şti. ile Başka Ltd. Şti. görüştü').metin
    expect(out).toBe('Borçlu [KİŞİ-1] ile Başka Ltd. Şti. görüştü')
  })
})

describe('adres', () => {
  it('kişisel adres maskelenir, il/ilçe korunur', () => {
    expect(maskele('Adres: Atatürk Mah. Cumhuriyet Cad. No:12 D:3 Kadıköy/İSTANBUL adresinde')).toBe('Adres: [ADRES-1] Kadıköy/İSTANBUL adresinde')
    const out = maskele('ikamet eden 19 Mayıs Mahallesi Gül Sokak No: 5 Kat: 2 Daire: 4, Çankaya/ANKARA')
    expect(out).toContain('[ADRES-1]')
    expect(out).not.toContain('Gül Sokak')
    expect(out).not.toContain('Mayıs')
    expect(out).toContain('Çankaya/ANKARA')
  })
  it('mahkeme "Mah." kısaltması ve kamusal yer adres değildir', () => {
    for (const s of ['İstanbul 5. Asliye Ticaret Mah. 2025/1 E.', 'Kadıköy 3. Sulh Hukuk Mah. Hakimliği', 'Esas No: 2025/12345 Karar No: 2025/77',
      'kaza Bağdat Caddesi üzerinde meydana geldi', 'Atatürk Mah. sakinleri']) expect(maskele(s), s).toBe(s)
  })
})

describe('korunacaklar', () => {
  const KORUNACAK = `İSTANBUL ANADOLU 5. ASLİYE TİCARET MAHKEMESİ HAKİMLİĞİNE
Sayın İSTANBUL 5. ASLİYE TİCARET MAHKEMESİ HAKİMLİĞİNE
Esas No: 2025/12345 E.  Karar No: 2025/678 K.
İstanbul 12. İcra Dairesi 2024/9876 Esas sayılı dosya
DAVACI : RAY SİGORTA A.Ş.
Davalı sigorta şirketi Türkiye Sigorta A.Ş. ile ANADOLU ANONİM TÜRK SİGORTA ŞİRKETİ
Kaza tarihi: 01.02.2025 saat 14:30; 3 Mart 2025; 2025-03-04
Hasar bedeli 12.345,67 TL; toplam 12.345.678,90 TL; 1.250,00 TL; faiz %25, % 12,5 oranında
Poliçe No: ${T3}  Hasar No: ${T4}  Hasar Dosya No: 2025-000123456  Poliçe Numarası : 4410029988
6098 sayılı TBK m. 49, KTK 85. madde, 2918 sayılı Kanun'un 97. maddesi, HMK 107
Kadıköy/İSTANBUL, Çankaya/Ankara, Bornova İzmir, Konak
Davalı Taraf Vekili; Sürücü Belgesi Sınıfı: B; 2 yıl 3 ay 15 gün
İstanbul 5. Asliye Ticaret Mah. 2025/1 E.
`
  it('mahkeme, esas/karar, tarih, tutar, poliçe/hasar no, madde, il/ilçe değişmez', () => {
    const r = new Maskeleyici(LISTE_KISILER).maskele(KORUNACAK)
    expect(r.metin).toBe(normallestir(KORUNACAK))
    expect(Object.values(r.sayim).reduce((a, b) => a + b, 0)).toBe(0)
  })
  it('algoritmaya uyan poliçe no korunur ama kişinin TCKN\'si maskelenir', () => {
    expect(maskele(`Poliçe No: ${T3} Sigortalı TCKN: ${T1}`)).toBe(`Poliçe No: ${T3} Sigortalı TCKN: [TCKN-1]`)
  })
})

describe('dosya adı ve bellekteki eşleme', () => {
  it('dosya adı maskelenir', () => {
    const m = new Maskeleyici(LISTE_KISILER)
    const ad = m.adMaskele(`Ilkay_Isikgoz_${T1}_34ABC123_vekaletname.udf`)
    expect(ad).not.toContain(T1)
    expect(katla(ad)).not.toContain('isikgoz')
    expect(ad).not.toContain('34ABC123')
    expect(ad.endsWith('vekaletname.udf')).toBe(true)
    expect(m.adMaskele('2025_ekspertiz_raporu.pdf')).toBe('2025_ekspertiz_raporu.pdf')
  })
  it('eşlemeden kurulan maskeleyici aynı jetonları verir (eslesmedenKur)', () => {
    const m = new Maskeleyici(LISTE_KISILER)
    m.maskele(`İlkay Işıkgöz ${T1} DAVALI : ORHUN KAVAKLIDERE 0532 123 45 67`)
    const m2 = Maskeleyici.eslesmedenKur(m.eslesme, LISTE_KISILER)
    expect(m2.maskele(`${T2} ${T1} Orhun Kavaklıdere IŞIKGÖZ 05321234567`).metin).toBe('[TCKN-2] [TCKN-1] [KİŞİ-2] [KİŞİ-1] [TEL-1]')
  })
  it('bilinen değer (degerEkle) sırası deterministik jeton verir', () => {
    const kur = () => { const m = new Maskeleyici(); m.degerEkle('TCKN', T2); m.degerEkle('TCKN', T1); return m }
    expect(kur().maskele(`${T1} ve ${T2}`).metin).toBe('[TCKN-2] ve [TCKN-1]')
    expect(kur().maskele(`${T1} ve ${T2}`).metin).toBe(kur().maskele(`${T1} ve ${T2}`).metin)
  })
})
