import { describe, expect, it } from 'vitest'
import { atifKapisi, atiflariBul, alintiBirebirMi, dosyaIciKunyeler, kunyeKimligi, sabitBlokKaynaklari, yasakCumleleriBul, type KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'
import { MEVZUAT_KATALOGU } from '@/lib/konsrucu/mevzuat/katalog'
import { kopyaVerisi } from '@/lib/konsrucu/mevzuat/yukle'

/** Katalogdan kütüphane satırları (id = künye); durum istenirse ezilir. */
function kutuphane(ez: Record<string, string> = {}, pasif: string[] = []): KutuphaneKaydi[] {
  return MEVZUAT_KATALOGU.map((k) => ({
    id: k.kunye, kunye: k.kunye, tur: k.tur, alinti: k.alinti, etiket: k.etiket, kapsamNotu: k.kapsamNotu,
    durum: ez[k.kunye] ?? k.durum, aktif: !pasif.includes(k.kunye), rucuSebebiKodlari: k.rucuSebebiKodlari,
  }))
}
const tekAtif = (metin: string, kayitlar: KutuphaneKaydi[]) => {
  const r = atifKapisi(metin, kayitlar)
  expect(r.atiflar).toHaveLength(1)
  return r.atiflar[0]
}

describe('atıf kalıpları', () => {
  it.each([
    ['İİK m.67/1 uyarınca', { tur: 'MEVZUAT', kanun: 'IIK', madde: '67', fikra: '1' }],
    ["İİK'nın 67. maddesi uyarınca İPTALİNE", { kanun: 'IIK', madde: '67' }],
    ["2918 sayılı Kanun'un 110. maddesi uyarınca", { kanun: 'KTK', madde: '110' }],
    ['TTK m. 1472 uyarınca sigortalısına ödediği', { kanun: 'TTK', madde: '1472' }],
    ['davalının KTK m. 52/1-b ihlaliyle', { kanun: 'KTK', madde: '52', fikra: '1', bent: 'b' }],
    ['KTK 97 gereğince sigortacıya', { kanun: 'KTK', madde: '97' }],
    ['6502 s.K. m.73/A/1 uyarınca', { kanun: 'TKHK', madde: '73/A', fikra: '1' }],
    ["Türk Ticaret Kanunu'nun 1472. maddesi", { kanun: 'TTK', madde: '1472' }],
  ])('%s', (metin, beklenen) => {
    const b = atiflariBul(metin)
    expect(b).toHaveLength(1)
    expect(b[0].kimlik).toMatchObject(beklenen)
  })

  it('"aynı Kanun" önceki kanuna bağlanır', () => {
    const b = atiflariBul("Karayolları Trafik Kanunu'nun 3. maddesinde tanımlanmış; aynı Kanun'un 7/1-a, f, l bentlerinde görevler sayılmıştır.")
    expect(b.map((x) => [x.kimlik.kanun, x.kimlik.madde])).toEqual([['KTK', '3'], ['KTK', '7']])
  })

  it('iki atıf birbirini yutmaz', () => {
    const b = atiflariBul('ZMSS Genel Şartları ile KTK m.95/2 ve GŞ B.4/c birlikte değerlendirilmelidir; İİK m.67 ve m.68 de anılır.')
    expect(b.map((x) => x.anahtar)).toEqual(['KTK m.95/2', 'ZMSS GŞ B.4/c', 'İİK m.67', 'İİK m.68'])
  })

  it('genel şart bendi sürümüyle ayrıştırılır', () => {
    expect(atiflariBul('ZMSS GŞ B.4/f (2015 metni) uyarınca')[0].kimlik).toMatchObject({ tur: 'GENEL_SART', kanun: 'ZMSS_GS', madde: 'B.4', bent: 'f', surum: '2015' })
    expect(atiflariBul('trafik sigortası genel şartlarının B.4/c maddesi')[0].kimlik).toMatchObject({ kanun: 'ZMSS_GS', madde: 'B.4', bent: 'c' })
    expect(atiflariBul('Genel Şartlar B.4-c bendi')[0].kimlik.kanun).toBe('GS_BELIRSIZ')
  })

  it('içtihat künyeleri: daire, esas ve karar', () => {
    expect(atiflariBul('17. HD 2017/1431')[0].kimlik).toMatchObject({ tur: 'ICTIHAT', mahkeme: 'YARGITAY_17HD', esas: '2017/1431' })
    expect(atiflariBul("Uyuşmazlık Mahkemesi Hukuk Bölümü'nün 27.12.2021 tarih, 2021/583 E., 2021/660 K. sayılı emsal kararında")[0].kimlik)
      .toMatchObject({ mahkeme: 'UM', esas: '2021/583', karar: '2021/660' })
    expect(atiflariBul('Yargıtay Hukuk Genel Kurulu da 27.01.2022 tarihli, 2021/4-859 E. ve 2022/62 K. sayılı kararında')[0].kimlik)
      .toMatchObject({ mahkeme: 'YARGITAY_HGK', esas: '2021/4-859', karar: '2022/62' })
    expect(atiflariBul('İstanbul BAM 17. HD 2023/55 E.')[0].kimlik.mahkeme).toBe('BAM_17HD')
  })

  it('dosya içi künyeler (icra, ilk derece) atıf sayılmaz, ayrıca listelenir', () => {
    const metin = "İstanbul 5. İcra Dairesi'nin 2024/1234 E. sayılı dosyasında ve İstanbul 3. Asliye Hukuk Mahkemesi'nin 2025/77 E. sayılı dosyasında"
    expect(atiflariBul(metin)).toHaveLength(0)
    expect(dosyaIciKunyeler(metin).map((d) => d.metin)).toEqual(['2024/1234 E.', '2025/77 E.'])
  })

  it('katalogdaki her künye (ad kaydı dışında) kendi kimliğine ayrıştırılır', () => {
    for (const k of MEVZUAT_KATALOGU) {
      if (k.kunye.includes('(Kanun adı)')) { expect(kunyeKimligi(k.kunye)).toBeNull(); continue }
      expect(kunyeKimligi(k.kunye), k.kunye).not.toBeNull()
    }
  })
})

describe('K1 atıf kapısı', () => {
  it('kabul 4: "17. HD 2017/1431" → KULLANMA uyarısı', () => {
    const a = tekAtif('Deneme: 17. HD 2017/1431 sayılı karar', kutuphane())
    expect(a.durum).toBe('KULLANMA')
    expect(a.kirmizi).toBe(true)
    expect(a.notlar.join(' ')).toContain('B09')
  })

  it('kabul 4: kütüphanede olmayan atıf → DOĞRULANMADI', () => {
    const a = tekAtif('TBK m.49 uyarınca haksız fiil sorumluluğu', kutuphane())
    expect(a.durum).toBe('DOGRULANMADI')
    expect(a.kirmizi).toBe(true)
  })

  it('yüklenen kayıt teyit gerekli; avukat doğrulayınca kırmızı kalkar', () => {
    expect(tekAtif('İİK m.67/1 uyarınca', kutuphane()).durum).toBe('TEYIT_GEREKLI')
    const a = tekAtif('İİK m.67/1 uyarınca', kutuphane({ 'İİK m.67/1': 'DOGRULANDI' }))
    expect(a).toMatchObject({ durum: 'DOGRULANDI', kirmizi: false, eslesenKaynakId: 'İİK m.67/1' })
  })

  it('maddenin bütününe atıf: bütün parçalar doğrulanmışsa doğrulanmış, biri eksikse teyit gerekli', () => {
    expect(tekAtif('İİK m.67 uyarınca', kutuphane({ 'İİK m.67/1': 'DOGRULANDI' })).durum).toBe('TEYIT_GEREKLI')
    expect(tekAtif('İİK m.67 uyarınca', kutuphane({ 'İİK m.67/1': 'DOGRULANDI', 'İİK m.67/2': 'DOGRULANDI' })).durum).toBe('DOGRULANDI')
  })

  it('fıkralı yazım fıkrasız kaydı kapsar (KTK 52/1-b ↔ KTK m.52/b)', () => {
    expect(tekAtif('KTK m. 52/1-b ihlali', kutuphane({ 'KTK m.52/b': 'DOGRULANDI' })).durum).toBe('DOGRULANDI')
  })

  it('künye biçimi farklıysa eşleşme sayılmaz (HGK "2021/4-859")', () => {
    const kayitlar: KutuphaneKaydi[] = [{ id: 'hgk', kunye: 'Yargıtay HGK 27.01.2022, E.2021/859, K.2022/62', tur: 'ICTIHAT', alinti: 'x', durum: 'DOGRULANDI', aktif: true }]
    expect(tekAtif('HGK 2021/4-859 E. 2022/62 K.', kayitlar).durum).toBe('DOGRULANMADI')
    expect(tekAtif('HGK E.2021/859, K.2022/62', kayitlar).durum).toBe('DOGRULANDI')
    expect(tekAtif('HGK E.2021/859, K.2022/99', kayitlar)).toMatchObject({ durum: 'DOGRULANMADI' })
  })

  it('B.4/f sürümsüz anılırsa KULLANMA; sürümüyle anılırsa kendi kaydı', () => {
    expect(tekAtif('ZMSS GŞ B.4/f uyarınca terk', kutuphane()).durum).toBe('KULLANMA')
    expect(tekAtif('ZMSS GŞ B.4/f (2015 metni) uyarınca', kutuphane({ 'ZMSS GŞ B.4/f (2015 metni)': 'DOGRULANDI' })).durum).toBe('DOGRULANDI')
  })

  it('KTK m.110/2 KULLANMA', () => {
    expect(tekAtif('KTK m.110/2 uyarınca yetkili', kutuphane()).durum).toBe('KULLANMA')
  })

  it('pasife alınmış kayıt yok sayılır', () => {
    expect(tekAtif('İİK m.67/1', kutuphane({ 'İİK m.67/1': 'DOGRULANDI' }, ['İİK m.67/1'])).durum).toBe('DOGRULANMADI')
  })

  it('başka müvekkilden kopyalanan kayıt teyit gerekli başlar (kabul 5)', () => {
    const ray = { id: 'ray-1', tur: 'MEVZUAT', kunye: 'İİK m.67/1', alinti: 'metin', resmiUrl: null, erisimTarihi: null, durum: 'DOGRULANDI', yururlukBas: null, yururlukBit: null, etiket: 'YERLESIK', kapsamNotu: null, rucuSebebiKodlari: [], bilgiBankasiYolu: null, icerikOzet: 'x' }
    const kopya = kopyaVerisi(ray, 'zurich')
    expect(kopya).toMatchObject({ musteriId: 'zurich', durum: 'TEYIT_GEREKLI', kopyaKaynakId: 'ray-1', dogrulayanId: null, yuklemeId: null })
    const zurich: KutuphaneKaydi[] = [{ id: 'z-1', kunye: String(kopya.kunye), tur: 'MEVZUAT', alinti: 'metin', durum: String(kopya.durum), aktif: true }]
    expect(tekAtif('İİK m.67/1', zurich).durum).toBe('TEYIT_GEREKLI')
    expect(kopyaVerisi({ ...ray, durum: 'KULLANMA' }, 'zurich').durum).toBe('KULLANMA')
  })

  it('tırnaklı alıntı birebir değilse doğrulanmış kayıt da DOĞRULANMADI olur (İ03)', () => {
    const kayitlar = kutuphane({ 'İİK m.257/1': 'DOGRULANDI' })
    const dogru = 'İİK m.257/1 uyarınca "rehinle temin edilmemiş ve vadesi gelmiş bir para borcunun alacaklısı (…) ihtiyaten haczettirebilir."'
    expect(tekAtif(dogru, kayitlar).durum).toBe('DOGRULANDI')
    const degismis = 'İİK m.257/1 uyarınca "rehinle temin edilmemiş ve vadesi gelmiş her türlü borcun alacaklısı ihtiyaten haczettirebilir."'
    const a = tekAtif(degismis, kayitlar)
    expect(a.durum).toBe('DOGRULANMADI')
    expect(a.notlar.join(' ')).toContain('birebir')
  })

  it('başka bir alıntının içinde geçen atıf için tırnak kontrolü yapılmaz', () => {
    const metin = 'Kararda "İİK m.257/1 uyarınca alacaklı ihtiyaten haczettirebilir" denilmiştir.'
    const r = atifKapisi(metin, kutuphane({ 'İİK m.257/1': 'DOGRULANDI' }))
    expect(r.atiflar[0].durum).toBe('DOGRULANDI')
  })

  it('alıntı karşılaştırması: kısaltma "(…)" ile yapılır, ekleme yapılamaz', () => {
    const kaynak = 'Sigortacı, sigorta tazminatını ödediğinde, hukuken sigortalının yerine geçer. Sigortalının dava hakkı sigortacıya intikal eder.'
    expect(alintiBirebirMi('Sigortacı, sigorta tazminatını ödediğinde (…) sigortacıya intikal eder.', kaynak)).toBe(true)
    expect(alintiBirebirMi('sigortacı, sigorta tazminatını ödediğinde', kaynak)).toBe(true)
    expect(alintiBirebirMi('Sigortacı, tazminatı ödediğinde, hukuken sigortalının yerine geçer.', kaynak)).toBe(false)
    expect(alintiBirebirMi('sigortacıya intikal eder (…) Sigortacı', kaynak)).toBe(false) // sıra bozuk
  })

  it('yasak cümleler kırmızıdır', () => {
    const metin = [
      'Sürücünün alkollü olması tek başına ve eksiksiz biçimde rücu hakkını doğurmaya yeterlidir.',
      'KTK 110/2 uyarınca merkez ibaresi gereği yetkili mahkeme burasıdır.',
      'HGK 2021/859 E. sayılı kararında paranın değer kaybı ve yargılama süresi gözetilmiştir.',
      '17. HD 2017/1431 kararı uyarınca görevli yargı yeri adli yargıdır.',
      'Yüksek mahkeme içtihatlarında açıkça vurgulandığı üzere idare kusurludur.',
      'İİK m.67 uyarınca paranın değer kaybı gözetilerek tazminat artırılmalıdır.',
    ].join('\n')
    const kodlar = yasakCumleleriBul(metin).map((y) => y.kod)
    expect(kodlar).toEqual(['ALKOL_TEK_BASINA', 'KTK_110_2_MERKEZ', 'HGK_859_EKLEME', '17HD_1431_GOREV', 'KUNYESIZ_ICTIHAT', 'IIK67_DEGER_KAYBI'])
    const r = atifKapisi(metin, kutuphane())
    expect(r.gecti).toBe(false)
    expect(r.yasaklar).toHaveLength(6)
  })

  it('zararsız metin yasak üretmez; doğrulanmış atıflarla kapı geçer', () => {
    const metin = 'Takip talebine itiraz edilmiştir. İİK m.67/1 uyarınca itirazın iptali talep olunur.'
    expect(yasakCumleleriBul(metin)).toHaveLength(0)
    expect(atifKapisi(metin, kutuphane({ 'İİK m.67/1': 'DOGRULANDI' })).gecti).toBe(true)
  })

  it('sabit bloğa yalnız aktif ve DOĞRULANDI kayıtlar, rücu sebebi koduna göre girer (B18)', () => {
    const k = kutuphane({ 'TTK m.1472/1': 'DOGRULANDI', 'KTK m.95/2': 'DOGRULANDI', 'İİK m.67/1': 'DOGRULANDI' })
    expect(sabitBlokKaynaklari(k).map((x) => x.kunye).sort()).toEqual(['KTK m.95/2', 'TTK m.1472/1', 'İİK m.67/1'].sort())
    expect(sabitBlokKaynaklari(k, 'B4_C_ALKOL').map((x) => x.kunye)).toEqual(['İİK m.67/1', 'KTK m.95/2'])
    expect(sabitBlokKaynaklari(k, 'KASKO_HALEFIYET').map((x) => x.kunye)).toEqual(['TTK m.1472/1', 'İİK m.67/1'])
    expect(sabitBlokKaynaklari(kutuphane())).toHaveLength(0) // yükleme sonrası hiçbiri doğrulanmamış
  })

  it('her katalog künyesi kendi kaydıyla eşleşir (kütüphane ↔ ayrıştırıcı tutarlılığı)', () => {
    const hepsi = kutuphane(Object.fromEntries(MEVZUAT_KATALOGU.filter((k) => k.durum !== 'KULLANMA').map((k) => [k.kunye, 'DOGRULANDI'])))
    for (const k of MEVZUAT_KATALOGU) {
      if (k.kunye.includes('(Kanun adı)')) continue
      const r = atifKapisi(k.kunye, hepsi)
      expect(r.atiflar, k.kunye).toHaveLength(1)
      expect(r.atiflar[0].eslesenKaynakId, k.kunye).toBe(k.kunye)
      expect(r.atiflar[0].durum, k.kunye).toBe(k.durum === 'KULLANMA' ? 'KULLANMA' : 'DOGRULANDI')
    }
  })
})
