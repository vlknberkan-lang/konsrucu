/**
 * Maskeleme saldırı (red-team) regresyonu — araclar/evrak-metin/tests/test_saldiri_bulgulari.py'nin
 * METİN düzeyindeki bulguları (dosya biçimi/OCR bulguları Python aracında kalır). YALNIZ SENTETİK veri.
 * Tablo girdileri, aracın XLSX/CSV/DOCX çıktısındaki 'hücre | hücre' satır biçimiyle yazılmıştır.
 */
import { describe, it, expect } from 'vitest'
import { JETON_RE, Maskeleyici, katla, sezgiselAdlar } from '@/lib/ai/maske'
import { geriAc } from '@/lib/ai/geri-ac'
import { sizintiKontrol } from '@/lib/ai/sizinti'
import { algoritmayaUyanPoliceNo, ayrik, tarihTutarCakismasi, tcknUret, tohumlu } from './maske-yardimci'

const R = tohumlu(3309)
const [T1, T2, T3] = [tcknUret(R), tcknUret(R), tcknUret(R)]
const POL = algoritmayaUyanPoliceNo()
const CAKISMA = tarihTutarCakismasi()

const mask = (metin: string, kisiler: string[] = []) => new Maskeleyici(kisiler).maskele(metin).metin
function sizmaz(metin: string, degerler: string | string[], kisiler: string[] = []): string {
  const out = mask(metin, kisiler)
  for (const d of Array.isArray(degerler) ? degerler : [degerler]) expect(katla(out), `IN: ${metin}\nOUT: ${out}`).not.toContain(katla(d))
  return out
}
const degismez = (metin: string, kisiler: string[] = []) => expect(mask(metin, kisiler)).toBe(metin)

describe('Bulgu 1: satır/başlık son hücresindeki korunan sözcük TCKN\'yi kalkanlamaz', () => {
  it('önceki satırın son hücresi', () => {
    const metin = `TCKN | Borçlu | Alacak | Son İşlem\n${T1} | Hasar A | 1.000,00 TL | Takip\n${T2} | Hasar B | 2.000,00 TL | Ödeme\n${T3} | Hasar C | 3.000,00 TL | Tahsilat`
    const out = sizmaz(metin, [T1, T2, T3])
    expect(out).toContain('1.000,00 TL | Takip')
  })
  it('başlık satırının son sütunu', () => {
    for (const son of ['Poliçe No', 'Hasar No', 'Dosya No', 'Son İşlem']) sizmaz(`Borçlu | TCKN | ${son}\nX Y | ${T1} | 2025/1\n`, T1)
  })
  it('bağlam satır sonunu aşmaz', () => sizmaz(`Hasar Dosya No:\n${T1} numaralı TCKN`, T1))
})

describe('Bulgu 2: korunan etiketler plaka ve telefonu kalkanlamaz', () => {
  it.each([
    ['Kasko Poliçesi 16 BRS 427 plakalı araç', 'BRS'], ['Araç Ruhsatı 06 KLM 4521 incelendi', 'KLM'],
    ['Hasar: 35 TRK 881 plakalı araç', 'TRK'], ['Ekspertiz 16 BRS 42 plakalı araç için yapıldı', 'BRS'], ['Tescil 07 ANT 707', 'ANT'],
    ['Ödeme: 0532 123 45 67 numaralı hattan', '123 45 67'], ['Dosya 0541 222 33 44 ile ilgili aradı', '222 33 44'],
  ])('%s', (metin, deger) => { sizmaz(metin, deger) })
  it('poliçe numarası hâlâ korunur', () => degismez(`Poliçe No: ${POL} Hasar Dosya No: 2025-000123456`))
})

describe('Bulgu 3, 16, 22, 23: tablo bağlamı', () => {
  const TABLO = '## Çalışma sayfası: Takip\n' +
    'Borçlu Adı Soyadı | TCKN | Telefon | Vergi No | Poliçe No | Esas No | Tutar\n' +
    `ĞÜLSÜM ÜÇPINARLIGİL | ${T1} | 5324812763 | 4561237890 | ${POL} | 2025/12345 E. | 12.345.678,90 TL\n` +
    `NURCİHAN ÇÖMLEKSİZ | ${T2} | 5429917735 |  |  | 2024/9876 E. | 1.250,00 TL`
  it('sütun başlığı bağlamı', () => {
    const r = new Maskeleyici().maskele(TABLO)
    for (const d of [T1, T2, '5324812763', '5429917735', '4561237890', 'ÜÇPINARLIGİL', 'ÇÖMLEKSİZ', 'NURCİHAN']) expect(katla(r.metin), d).not.toContain(katla(d))
    for (const k of [POL, '2025/12345 E.', '12.345.678,90 TL', '2024/9876 E.', '1.250,00 TL']) expect(r.metin).toContain(k)
    expect([r.sayim.TEL, r.sayim.VKN, r.sayim['KİŞİ']]).toEqual([2, 1, 2])
    expect(r.metin).toContain('|  |  | 2024/9876 E. |')
  })
  it('poliçe sütunu korunur, TCKN sütunu maskelenir', () => {
    degismez(`Poliçe No | Hasar No | Tutar\n${POL} | 2025-000123 | 12.345,67`)
    const out = mask(`TCKN | Poliçe No | Tutar\n${T1} | ${POL} | 100`)
    expect(out).not.toContain(T1)
    expect(out).toContain(POL)
  })
  it('etiket ayrı satırda', () => {
    sizmaz('Vergi Kimlik No\n7418529630', '7418529630')
    sizmaz('Telefon\n5324812763', '5324812763')
    sizmaz('IBAN No:\n33 0006 1005 1978 6457 8413 26', '6457')
  })
  it.each([
    ['Adı Soyadı | ÇİĞDEM IŞILDAKLI', 'IŞILDAKLI'], ['Davalı | Kamuran Eşmekaya', 'Eşmekaya'], ['Sigortalı | TUNCAY KARAYAZICI', 'KARAYAZICI'],
    ['Sürücü | Meltem Oymakçı', 'Oymakçı'], ['Soyadı | DÜZTEPELİ', 'DÜZTEPELİ'], ['Adı | NEVZAT', 'NEVZAT'],
    ['Telefon | 90 532 481 27 63', '481 27 63'], ['Vergi No | 4561237890', '4561237890'],
  ])('etiket hücresi → değer hücresi: %s', (metin, deger) => { sizmaz(metin, deger) })
  it('tire ayraçlı TCKN etiket hücresinde', () => sizmaz(`T.C. Kimlik No | ${ayrik(T1, '–')}`, T1.slice(0, 3)))
  it('başlık satırı ad sanılmaz', () => {
    for (const s of ['Sürücü | Plaka | Tarih', 'Borçlu | Son Durum | Tutar', 'Davalı | Sigortalı | Rolü']) degismez(s)
  })
  it('Excel\'de sayı telefon (baştaki 0 silinmiş) ve TR\'siz IBAN', () => {
    for (const metin of ['Borçlu | Telefon | Telefon2 | IBAN\nAli Veli | 5051112233 | 905062223344 | 330006100519786457841326', 'Borçlu | Telefon\nAli Veli | 5051112233']) {
      const out = mask(metin)
      for (const ham of ['5051112233', '5062223344', '6457841326', 'Ali Veli']) expect(out, metin).not.toContain(ham)
    }
    expect(mask('Borçlu | Telefon\nAli Veli | 5051112233')).toContain('Borçlu | Telefon')
  })
})

describe('Bulgu 4: ad sezgisinin form biçimleri', () => {
  it.each([
    ['Adı Soyadı ........: IŞIK DÖNMEZOĞLUGİL', ['DÖNMEZOĞLUGİL']], ['ADI SOYADI/UNVANI : | NURCİHAN ÇÖMLEKSİZ', ['ÇÖMLEKSİZ']],
    ['Adı Soyadı / Unvanı: ÖZGÜR ŞIPSEVDİLER', ['ŞIPSEVDİLER']], ['Borçlunun Adı Soyadı/Unvanı: ĞÜLSÜM ÜÇPINARLIGİL', ['ÜÇPINARLIGİL']],
    ['MUHATAP : İLKNUR BÜĞDÜZERLİ', ['BÜĞDÜZERLİ']], ['Talep Eden: ÇİĞDEM IŞILDAKLI', ['IŞILDAKLI']],
    ['Hasar Gören: İLKNUR BÜĞDÜZERLİ', ['BÜĞDÜZERLİ']], ['İhbar Eden: ÖZGÜR ŞIPSEVDİLER', ['ŞIPSEVDİLER']],
    ['Adı : ŞÜKRÜ\nSoyadı : KÖPÜKÇÜLER', ['ŞÜKRÜ', 'KÖPÜKÇÜLER']],
    ['Soyadı: KÖPÜKÇÜLER  Adı: ŞÜKRÜ  Baba Adı: NEVZAT  Ana Adı: FERİŞTAH', ['KÖPÜKÇÜLER', 'ŞÜKRÜ', 'NEVZAT', 'FERİŞTAH']],
    ['Davalı: ŞÜKRÜ\nKÖPÜKÇÜLER', ['ŞÜKRÜ', 'KÖPÜKÇÜLER']],
  ])('%s', (metin, ad) => { sizmaz(metin, ad) })
  it('kişi olmayan ad alanları', () => {
    for (const s of ['Şirket Adı: ABC', 'Dosya Adı: Ekspertiz', 'Ürün Adı: Kasko', 'Kullanıcı adı: admin', 'Adı geçen şirket']) degismez(s)
  })
})

describe('Bulgu 5 ve 11: soyad', () => {
  it('sezgisel kişinin yalnız soyadı', () => {
    const out = sizmaz("Davalı: ÖZGÜR ŞIPSEVDİLER aracıyla çarpmıştır.\nDavalı Şıpsevdiler'in kusuru %100 olarak tespit edilmiştir.", 'Şıpsevdiler')
    expect(out).toContain("Davalı [KİŞİ-1]'in kusuru %100")
  })
  it('ortak soyad yanlış kişiye bağlanmaz', () => {
    const m = new Maskeleyici(['Şükrü Işıldaklı'])
    const out = m.maskele("Davalı: ÇİĞDEM IŞILDAKLI ile eşi Şükrü Işıldaklı. Davalı Işıldaklı'nın kusuru.").metin
    expect(katla(out)).not.toContain('isildakli')
    const son = new RegExp(JETON_RE.source, 'u').exec(out.split('Davalı ').pop()!)![0]
    expect(m.eslesme[son]).not.toBe('Şükrü Işıldaklı')
  })
})

describe('Bulgu 6: orta ad, yalnız ilk ad, "X ve Y Soyad"; geri açmada ad tekrarı yok', () => {
  const LISTE = ['Şükrü Köpükçüler', 'Kerimcan Tuzlaçayır', 'Belgizar Tuzlaçayır']
  it('orta ad / ilk ad / ortak soyad', () => {
    const m = new Maskeleyici(LISTE)
    const out = m.maskele('Sürücü | ŞÜKRÜ KEMAL KÖPÜKÇÜLER\nSayın Şükrü Bey kazayı ihbar etmiştir. Kerimcan ve Belgizar Tuzlaçayır tanıktır. ŞÜKRÜ KEMAL KÖPÜKÇÜLER geldi.').metin
    for (const ham of ['şükrü', 'kemal', 'köpükçüler', 'kerimcan', 'belgizar', 'tuzlaçayır']) expect(katla(out), ham).not.toContain(katla(ham))
    expect(out).toContain('Sayın [KİŞİ-1] Bey')
    const { acik } = geriAc(out, m.eslesme)
    expect(acik).not.toContain('KEMAL Şükrü')
    expect(acik).toContain('Kerimcan Tuzlaçayır ve Belgizar Tuzlaçayır')
  })
  it('sözcük olan ilk ad yalnız güçlü bağlamda', () => {
    const m = new Maskeleyici(['Deniz Kavukçuoğlu'])
    expect(m.maskele('Deniz yoluyla taşıma yapılmıştır.').metin).toBe('Deniz yoluyla taşıma yapılmıştır.')
    expect(m.maskele("Sayın Deniz Hanım, Deniz'in beyanı").metin).toBe("Sayın [KİŞİ-1] Hanım, [KİŞİ-1]'in beyanı")
  })
})

describe('Bulgu 7, 18, 21: dosya adında ve metinde alt çizgili / bitişik / tireli ad', () => {
  it('dosya adında etiketli ad', () => {
    const ad = new Maskeleyici().adMaskele('Davalı_ÖMERCAN_ZEYTİNCİOĞLU_ehliyet.png')
    expect(katla(ad)).not.toContain('zeytincioglu')
    expect(katla(ad)).not.toContain('omercan')
  })
  it('bitişik ve tireli dosya adı', () => {
    const m = new Maskeleyici(['Sevgül Ördekçioğlu'])
    for (const ad of ['SevgulOrdekcioglu_kimlik_fotokopisi.udf', 'Ördekçioğlu-Sevgül tebligat.udf', 'Sevgul_Ordekcioglu_34KRZ482_vekaletname.udf']) {
      const out = m.adMaskele(ad)
      expect(katla(out), ad).not.toContain('sevgul')
      expect(katla(out), ad).not.toContain('ordekcioglu')
      expect(out, ad).not.toContain('34KRZ482')
    }
  })
  it('metinde alt çizgili ad ve plaka', () => {
    const m = new Maskeleyici(['Sevgül Ördekçioğlu'])
    const out = m.maskele('Sigortalı : KORAY SÜTLÜKAYA\nAraç plakası 34 KRZ 482\n1) Sevgul_Ordekcioglu_kimlik.pdf\n2) hasar_34KRZ482_foto.jpg\n3) KORAY_SUTLUKAYA_ifade.udf').metin
    for (const ham of ['sevgul', 'ordekcioglu', 'koray', 'sutlukaya', '34krz482']) expect(katla(out).replace(/ /g, ''), ham).not.toContain(ham)
    expect(out).toContain('hasar_[PLAKA-1]_foto.jpg')
  })
  it('sızıntı kontrolü alt çizgili adı yakalar', () => {
    const s = sizintiKontrol('1) Sevgul_Ordekcioglu_kimlik.pdf\n', new Maskeleyici(['Sevgül Ördekçioğlu']))
    expect(s.temiz).toBe(false)
  })
})

describe('Bulgu 8 ve 9: ayraç varyasyonları', () => {
  it.each([
    ayrik(T1, '–'), ayrik(T1, '—'), ayrik(T1, '  '), ayrik(T1, '\t'), ayrik(T1, ' '), ayrik(T1, ' '),
    `${T1.slice(0, 6)}-\n${T1.slice(6)}`, [...T1].map((c) => String.fromCharCode(0xff10 + Number(c))).join(''),
  ])('TCKN: %j', (y) => { expect(mask(`T.C. Kimlik No: ${y}`)).toContain('[TCKN-1]') })
  it.each([
    ['IBAN: TR33  0006  1005  1978  6457  8413  26', ['6457']], ['IBAN No: 33 0006 1005 1978 6457 8413 26', ['6457']],
    ['Hesap: 330006100519786457841326', ['6457841326']], ['Plaka: 06  KLM  4521', ['KLM']], ['Plaka: 06–KLM–4521', ['KLM']],
    ['Araçlar 34ABC123/06XY456 plakalı', ['ABC', 'XY']], ['Plakalar: 34 ABC 123,06 XY 456', ['ABC', 'XY']],
    ['Vergi No: 456-123-7890', ['7890']], ['e-posta: nurcihan.comleksiz @ ornekposta.com', ['comleksiz']],
  ])('%s', (metin, deger) => { sizmaz(metin, deger) })
  it('PDF metin katmanı çift boşluk', () => {
    const out = mask(`TCKN: ${ayrik(T2, '  ')}\nIBAN: TR33  0006  1005  1978  6457  8413  26\nPlaka: 06  KLM  4521`)
    for (const ham of [T2.slice(0, 3), '6457', 'KLM']) expect(out).not.toContain(ham)
  })
  it.each(['Tel: 90 532 481 27 63', 'Tel: 905324812763', 'Telefon: 0532 - 481 27 63', 'Tel: 0532–481–27–63', 'Tel: 0532/481 27 63',
    'İletişim: 532 481 27 63', 'İrtibat No: 5324812763', 'Telefon\n5324812763'])('telefon: %s', (s) => { sizmaz(s, '481') })
})

describe('Bulgu 10: sızıntı kontrolü bağımsız tarar', () => {
  it('maskeleyicinin kaçırdığı biçimler yakalanır ve ham değer yazılmaz', () => {
    const metinler = [
      `Kimlik: ${T1.slice(0, 3)}/${T1.slice(3, 6)}/${T1.slice(6, 9)}/${T1.slice(9)}\n`, // '/' ayraçlı TCKN
      `Hasar A | 1.000,00 TL | Takip\n${T2} | Hasar B\n`, // korunan satır kalkanı yok
      "Adı Soyadı | ÇİĞDEM IŞILDAKLI\nDavalı Şıpsevdiler'in kusuru\n", // etiketli ad
    ]
    for (const m of metinler) {
      const s = sizintiKontrol(m)
      expect(s.temiz, m).toBe(false)
      const dokum = JSON.stringify(s)
      for (const ham of [T1, T2, 'IŞILDAKLI', 'Şıpsevdiler']) expect(dokum).not.toContain(ham)
    }
  })
  it('temiz çıktı temiz kalır; açık etiketli poliçe no BİLGİ', () => {
    const s = sizintiKontrol(`Davalı [KİŞİ-1] ([TCKN-1])\nPoliçe No: ${POL}\n${CAKISMA} TL tahsil edildi\nYargıtay 17 HD 2019/4567 E.\n`)
    expect(s.temiz, JSON.stringify(s.sizintilar)).toBe(true)
    expect(s.bilgiler).toHaveLength(1)
  })
})

describe('Bulgu 12-15: aşırı maskeleme yok', () => {
  it('tarih + tutar TCKN sanılmaz', () => {
    degismez(`${CAKISMA} TL tahsil edildi`)
    const [gunAy, tutar] = CAKISMA.split(' ')
    degismez(`${gunAy}\n${tutar} TL`)
    degismez(`Tahsilat | ${CAKISMA} TL`)
  })
  it('eski eşlemedeki tarih/daire atfı/kurum yeniden maskelenmez', () => {
    const m = Maskeleyici.eslesmedenKur({
      '[TCKN-1]': CAKISMA.replace(/\./g, '').replace(' ', '').split(',')[0], '[PLAKA-1]': '15 KAS 2024', '[PLAKA-2]': '17 HD 2019', '[KİŞİ-1]': 'Güvence Hesabı',
    })
    const metin = `${CAKISMA} TL; Kaza 15 Kas 2024; Yargıtay 17 HD 2019/4567 E.; Davacı Güvence Hesabı`
    expect(m.maskele(metin).metin).toBe(metin)
  })
  it('kısaltılmış ay ve süre', () => {
    for (const s of ['Kaza 15 Kas 2024 tarihinde', 'tebliğ 20-TEM-2025', '12 Oca 2025', '10 Eki 2025', 'ödeme 03 Ara 2025', 'SÜRE: 1 YIL 10 AY 20 GÜN', '2 YIL 12 AY 24 GÜN']) degismez(s)
    for (const s of ['Plaka 34 KAS 24', 'Plaka 06 ARA 123']) expect(mask(s)).toContain('[PLAKA-1]')
  })
  it('Yargıtay/Danıştay daire atfı', () => {
    for (const s of ['Yargıtay 17 HD 2019/4567 E., 2020/1234 K. sayılı ilamı', 'Danıştay 10 D 2019/5 E.', '17 HD 2019/4567 E. sayılı karar']) degismez(s)
  })
  it('kurum adları kişi sanılmaz', () => {
    for (const s of ['Davacı Güvence Hesabı ile Sayın Hakem Heyeti nezdindeki süreç', 'DAVALI : Güvence Hesabı Müdürlüğü', 'Sayın Uyuşmazlık Hakemi',
      "Davalı İdare'nin işlemi", 'SAYIN BEŞİKTAŞ TAPU MÜDÜRLÜĞÜNE']) {
      expect(sezgiselAdlar(s), s).toEqual([])
      degismez(s)
    }
  })
})

describe('Bulgu 31: geri açma jeton varyantları', () => {
  const ESLESME = { '[KİŞİ-1]': 'Sevgül Ördekçioğlu', '[TCKN-1]': T1 }
  it('bozulmuş jeton yazımları açılır', () => {
    const varyantlar = ['[KİŞİ-1]', '[kişi-1]', '[KISI-1]', '[ KİŞİ - 1 ]', '[KİŞİ–1]', '[KİŞİ—1]', '[KİŞİ‑1]', '[KİŞİ−1]', '[KİŞİ_1]', '[KİŞİ 1]',
      '[KİŞİ-1]', '［KİŞİ-1］']
    const metin = varyantlar.map((v) => `Davalı ${v} aleyhine`).join('\n') + '\nTCKN [TCKN–1]'
    const r = geriAc(metin, ESLESME)
    expect(r.sayi).toBe(varyantlar.length + 1)
    expect(r.bilinmeyen).toEqual([])
    expect(r.acik.split('Sevgül Ördekçioğlu').length - 1).toBe(varyantlar.length)
    expect(r.acik).toContain(`TCKN ${T1}`)
  })
  it('açılamayan ve yabancı jeton uyarılır', () => {
    const r = geriAc('Davalı (KİŞİ-1) ve [KİŞİ-99], TCKN {TCKN-1}', ESLESME)
    expect(new Set(r.bilinmeyen)).toEqual(new Set(['(KİŞİ-1)', '[KİŞİ-99]', '{TCKN-1}']))
  })
})
