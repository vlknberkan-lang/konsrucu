/**
 * Eklenti olay sınıflandırıcısı (extension/siniflandir.js) — denetim B24 · docs/04 K1 · Faz 1 inceleme kilitleri.
 * Dosya tarayıcı eklentisi için düz JS (modül değil); burada fs + vm ile ayrı bir bağlamda yüklenir,
 * globalThis.KonsSiniflandir üzerinden çağrılır — content.js'in kullandığı yolun aynısı.
 * SUNUCUYLA ÇAPRAZ KİLİT: aynı metin derlemi sunucunun saf fonksiyonlarından da geçirilir (gercekTebligMi,
 * kesinlesmeMetniMi, kismiItirazMi, onemliOlayAdayiMi) — eklenti ile sunucu ayrışırsa test kırılır.
 * Örnek metinler UYAP evrak/safahat TÜR ADLARIdır (docs/05) ya da tür adı kalıbında uydurmadır; kişisel veri
 * YOK, tarihler uydurmadır.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Sunucu modüllerinin prisma import'u DB'ye gitmesin (burada yalnız saf fonksiyonlar kullanılır)
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { borcaItirazMi } from '@/lib/konsrucu/onemli-olay'
import { OLAY_TIPLERI, ASAMA_ITIRAZ_ONEK, onemliOlayAdayiMi, asamaTureviItirazMi } from '@/lib/konsrucu/takip-olay'
import { gercekTebligMi, kesinlesmeMetniMi, kismiItirazMi } from '@/lib/konsrucu/teblig-gorev'

type Sonuc = { tip: string; sunucuTip: string; etiket?: string; ek?: string; hacizTuru?: string } | null
type Olay = { tip: string; tarih: string | null; aciklama: string }
type Snf = {
  surum: string
  SUNUCU_TIPLERI: string[]
  ETIKET: Record<string, string>
  ASAMA_ITIRAZ_ACIKLAMA: string
  trNorm: (s: unknown) => string
  siniflandir: (...parcalar: unknown[]) => Sonuc
  tipFromMetin: (s: unknown) => string | null
  durumdanItiraz: (s: unknown) => boolean
  tebligTarihiSec: (l: unknown[]) => string
  olaylarTuret: (rec: Record<string, unknown>) => Olay[]
}

const KOK = process.cwd()
const kod = readFileSync(path.join(KOK, 'extension', 'siniflandir.js'), 'utf8')
const baglam: { KonsSiniflandir?: Snf } = {}
vm.createContext(baglam)
vm.runInContext(kod, baglam, { filename: 'siniflandir.js' })
const S = baglam.KonsSiniflandir as Snf
// vm bağlamından dönen nesneler başka realm'in prototipini taşır → karşılaştırmadan önce düz JSON'a çevir
const J = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const tip = (...p: unknown[]) => S.siniflandir(...p)?.tip ?? null
const sunucu = (...p: unknown[]) => S.siniflandir(...p)?.sunucuTip ?? null
const UYAP = { kaynak: 'uyap' }
/** Eklentinin bu metinden üreteceği sunucu olayı (tek evrak) — sunucu yan etkisi çapraz kontrolü için. */
const tekOlay = (tur: string) => J(S.olaylarTuret({ evrak: [{ tur, tarih: '2026-07-10' }] }))[0] ?? null

describe('yükleme', () => {
  it('globalThis.KonsSiniflandir tanımlanır', () => {
    expect(S).toBeTruthy()
    expect(typeof S.siniflandir).toBe('function')
    expect(S.surum).toBe('2.0.0') // paket sürümüyle aynı tutulur (kurallar 1.9.0'dan beri değişmedi)
  })

  it('sunucu tip listesi lib/konsrucu/takip-olay OLAY_TIPLERI ile birebir aynı', () => {
    expect(J(S.SUNUCU_TIPLERI)).toEqual([...OLAY_TIPLERI])
  })

  it('aşama türevi itiraz açıklaması sunucu önekiyle başlar (sunucu dosya başına bir kez yazar)', () => {
    expect(S.ASAMA_ITIRAZ_ACIKLAMA.startsWith(ASAMA_ITIRAZ_ONEK)).toBe(true)
    expect(asamaTureviItirazMi({ tip: 'ITIRAZ', aciklama: S.ASAMA_ITIRAZ_ACIKLAMA })).toBe(true)
    expect(S.ASAMA_ITIRAZ_ACIKLAMA.length).toBeLessThanOrEqual(200)
  })
})

describe('trNorm — Türkçe duyarlı normalize', () => {
  it('hatanın kökü: düz toLowerCase "İ"yi i + birleşik nokta yapar, /itiraz/ ıskalar', () => {
    expect('Borca İtiraz'.toLowerCase()).not.toBe('borca itiraz')
    expect(/itiraz/.test('Takibe İtiraz'.toLowerCase())).toBe(false)
    expect(/itiraz/i.test('Takibe İtiraz')).toBe(false) // /i bayrağı da kurtarmıyor
  })

  it('büyük İ / I, ç ş ğ ö ü ı ve şapkalı harfler ASCII küçüğe iner; birleşik nokta kalmaz', () => {
    expect(S.trNorm('Borca İtiraz Talebi')).toBe('borca itiraz talebi')
    expect(S.trNorm('TAKİBE İTİRAZ')).toBe('takibe itiraz')
    expect(S.trNorm('ÇĞŞÖÜ ıI Kâtip')).toBe('cgsou ii katip')
    expect(S.trNorm('İHTİYATİ HACİZ')).toBe('ihtiyati haciz')
    expect(S.trNorm('Kesinleşti')).toBe('kesinlesti')
    expect(S.trNorm('  Tebliğ   Mazbatası ')).toBe('teblig mazbatasi')
    expect(S.trNorm('İ')).not.toMatch(/̇/)
  })

  it('null / undefined / sayı güvenli', () => {
    expect(S.trNorm(null)).toBe('')
    expect(S.trNorm(undefined)).toBe('')
    expect(S.trNorm(7)).toBe('7')
  })
})

// ─── İTİRAZ: beyaz liste (Faz 1 ENGELLEYİCİ) ───

const BORCA_ITIRAZ = [
  'Borca İtiraz Talebi',
  'BORCA İTİRAZ',
  'Takibe İtiraz',
  'Ödeme Emrine İtiraz Dilekçesi',
  'İmzaya İtiraz',
  'Yetki İtirazı',
  'Yetkiye İtiraz',
  'borca itiraz dilekçesi', // küçük harf yazımlar eskisi gibi
  'Borca ve Faize İtiraz',
  'İtiraz Dilekçesi',
  // kısmi itiraz örnekleri (D2) — ITIRAZ gider, sunucu kismiItirazMi ile ayırır
  'Faize İtiraz',
  'Faiz Oranına İtiraz',
  "Fer'ilere İtiraz",
]
const KISMI = ['Faize İtiraz', 'Faiz Oranına İtiraz', "Fer'ilere İtiraz", 'Borca ve Faize İtiraz']

describe('ITIRAZ — yalnız borca / ödeme emrine / takibe / imzaya / yetkiye / faize itiraz', () => {
  it.each(BORCA_ITIRAZ)('%s → ITIRAZ', (m) => {
    expect(tip(m)).toBe('ITIRAZ')
    expect(sunucu(m)).toBe('ITIRAZ')
  })

  it.each(BORCA_ITIRAZ)('%s → sunucuda Önemli Olay adayı', (m) => {
    const o = tekOlay(m)
    expect(o?.tip).toBe('ITIRAZ')
    expect(borcaItirazMi(o!.tip, o!.aciklama)).toBe(true)
    expect(onemliOlayAdayiMi({ ...o!, hamJson: UYAP })).toBe(true)
  })

  it('kısmi itiraz metinleri sunucuda kısmi tanınır; tam itiraz tanınmaz', () => {
    for (const m of KISMI) expect(kismiItirazMi(tekOlay(m)!.aciklama)).toBe(true)
    for (const m of ['Borca İtiraz Talebi', 'Takibe İtiraz', 'İmzaya İtiraz']) expect(kismiItirazMi(tekOlay(m)!.aciklama)).toBe(false)
  })
})

// Borca itiraz OLMAYAN "itiraz" metinleri — hiçbiri ITIRAZ gitmemeli (negatif derlem)
const OLUMSUZ_KESINLESME = [
  'İtirazsız Kesinleşme',
  'Takip itiraz edilmeksizin kesinleşti',
  'İTİRAZ EDİLMEDİĞİNDEN KESİNLEŞMİŞTİR',
  'Süresinde itiraz edilmediğinden takip kesinleşti',
  'Borca itiraz edilmediğinden takip kesinleşmiştir',
]
const OLUMSUZ_OLAYSIZ = ['İtiraz süresi geçti', 'Borçlu itiraz etmedi', 'İtiraz yok']
const BASKA_NITELIK = [
  'Kıymet Takdirine İtiraz',
  'Sıra Cetveline İtiraz',
  'Hacze İtiraz',
  'İhtiyati Hacze İtiraz',
  'İstihkak İddiasına İtiraz',
  'Bilirkişi Raporuna İtiraz',
  'Bilirkişi Raporuna İtiraz Dilekçesi',
  'Haciz İhbarnamesine İtiraz',
  'İcra Emrine İtiraz', // ilamlı takipte İİK 33 — takibi kendiliğinden durdurmaz
  'İcra Emrine İtiraz Dilekçesi',
  'Örnek itiraz notu', // türü belirsiz
]
const ITIRAZ_TEBLIGI = ['İtirazın Alacaklıya Tebliği', 'İtiraz Muhtırası', 'İtirazın Tebliği', 'Borca İtiraz Dilekçesinin Tebliği']
const ITIRAZ_FERAGAT = ['İtirazdan Feragat', 'İtirazın Geri Alınması', 'Borca İtirazdan Feragat', 'Borçlunun İtirazından Vazgeçmesi']
const ITIRAZ_SONRASI = ['İtirazın Kaldırılması Talebi', 'İTİRAZIN İPTALİ DAVASI', 'İtirazın Reddi', 'Borca İtirazın Kaldırılması']

describe('ITIRAZ DEĞİL — negatif derlem (İ düzeltmesiyle canlanan yanlış pozitifler)', () => {
  it.each(OLUMSUZ_KESINLESME)('%s → KESINLESTI (itiraz yokluğu = kesinleşme bildirimi)', (m) => {
    expect(tip(m)).toBe('KESINLESTI')
    expect(kesinlesmeMetniMi(m)).toBe(true) // sunucu da gerçek kesinleşme sayar
  })

  it.each(OLUMSUZ_OLAYSIZ)('%s → olay yok', (m) => {
    expect(S.siniflandir(m)).toBeNull()
  })

  it.each(BASKA_NITELIK)('%s → başka nitelikte itiraz, DURUM + etiket', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('ITIRAZ_DIGER')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(r?.etiket).toMatch(/^İTİRAZ — TÜRÜ BELİRSİZ/)
  })

  it.each(ITIRAZ_TEBLIGI)('%s → itirazın alacaklıya tebliği (İİK 67 başlangıcı olabilir), TEBLIG DEĞİL', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('ITIRAZ_TEBLIGI')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(r?.etiket).toMatch(/^İTİRAZIN ALACAKLIYA TEBLİĞİ/)
  })

  it.each(ITIRAZ_FERAGAT)('%s → feragat / geri alma (tam tersi anlam), DURUM', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('ITIRAZ_FERAGAT')
    expect(r?.sunucuTip).toBe('DURUM')
  })

  it.each(ITIRAZ_SONRASI)('%s → itiraz sonrası işlem, DURUM', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('ITIRAZ_SONRASI')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(r?.etiket).toMatch(/^İTİRAZ SONRASI/)
  })

  it('hiçbiri sunucuda Önemli Olay açmaz, durum değiştirmez (DURUM ya da KESINLESTI gider)', () => {
    for (const m of [...BASKA_NITELIK, ...ITIRAZ_TEBLIGI, ...ITIRAZ_FERAGAT, ...ITIRAZ_SONRASI, ...OLUMSUZ_KESINLESME]) {
      const o = tekOlay(m)
      expect(o, m).not.toBeNull()
      expect(o!.tip, m).not.toBe('ITIRAZ')
      expect(onemliOlayAdayiMi({ ...o!, hamJson: UYAP }), m).toBe(false)
    }
  })

  it('"itiraz edilmesi üzerine" (olumlu) olumsuz sayılmaz', () => {
    expect(tip('Borca itiraz edilmesi üzerine takip durduruldu')).toBe('ITIRAZ')
  })
})

describe('durum / aşama metninden itiraz (docs/05 bulgu 1)', () => {
  it('"Açık (durdurulmuş : Takibe İtiraz)" itiraz sinyalidir', () => {
    expect(S.durumdanItiraz('Açık (durdurulmuş : Takibe İtiraz)')).toBe(true)
    expect(S.durumdanItiraz('AÇIK (DURDURULMUŞ : TAKİBE İTİRAZ)')).toBe(true)
    expect(S.durumdanItiraz('Durdurulmuş - Borca İtiraz')).toBe(true)
  })

  it('itiraz içermeyen ya da borca itiraz olmayan durumlar sinyal değildir', () => {
    expect(S.durumdanItiraz('Açık')).toBe(false)
    expect(S.durumdanItiraz('Kapalı (Tahsil)')).toBe(false)
    expect(S.durumdanItiraz('Açık (İtirazın Kaldırılması)')).toBe(false)
    expect(S.durumdanItiraz('Kesinleşti (itirazsız)')).toBe(false)
    expect(S.durumdanItiraz('')).toBe(false)
    expect(S.durumdanItiraz(null)).toBe(false)
  })
})

// ─── KESİNLEŞTİ: yalnız kayıt / şerh / "takip kesinleşti" ───

describe('KESINLESTI — talep ve silme kesinleşme sayılmaz', () => {
  it.each(['TAKİP KESİNLEŞTİ', 'Kesinleşme Şerhi', 'ÖRNEK KİŞİ Kesinleşme Bilgisi Kaydedildi.', 'Örnek Kişi Kesinleşme Bilgisi Güncellendi.', 'Takip Kesinleşmiştir'])(
    '%s → KESINLESTI (sunucu da gerçek sayar)',
    (m) => {
      expect(tip(m)).toBe('KESINLESTI')
      expect(sunucu(m)).toBe('KESINLESTI')
      expect(kesinlesmeMetniMi(m)).toBe(true)
    },
  )

  it.each(['Takibin Kesinleştirilmesi Talebi', 'Tensip Zaptı Bilgi Girişi (Takibin Kesinleştirilmesi Talebi)', 'Kesinleşme Talebi'])(
    '%s → KESİNLEŞTİRME TALEBİ, DURUM',
    (m) => {
      const r = S.siniflandir(m)
      expect(r?.tip).toBe('KESINLESME_TALEBI')
      expect(r?.sunucuTip).toBe('DURUM')
      expect(r?.etiket).toMatch(/^KESİNLEŞTİRME TALEBİ/)
      expect(kesinlesmeMetniMi(m)).toBe(false) // eski veride KESINLESTI olarak duranları sunucu saymaz
    },
  )

  it.each(['Örnek Kişi Kesinleşme Bilgisi Silindi.', 'Kesinleşme Bilgisi İptal'])('%s → KESİNLEŞME SİLİNDİ, DURUM', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('KESINLESME_SILINDI')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(kesinlesmeMetniMi(m)).toBe(false)
  })

  it('türü belirsiz kesinleşme metni DURUM + etiket', () => {
    expect(S.siniflandir('Kesinleşme Bilgisi')?.tip).toBe('KESINLESME_BELIRSIZ')
    expect(S.siniflandir('Kesinleşme Bilgisi')?.sunucuTip).toBe('DURUM')
  })
})

// ─── TAHSİLAT ───

describe('TAHSILAT değildir — ödeme emri ve büronun yaptığı ödemeler', () => {
  it.each([
    'Ödeme İcra Emri',
    'Ödeme Emri',
    'ÖDEME EMRİ DÜZENLENDİ',
    'Örnek 7 Hazırlandı',
    'İcra Emri',
    'Tahsil Harcı Makbuzu(Sayman Mutemet Alındısı)',
    'Harç Makbuzu',
    'Peşin Harç Tahsil Makbuzu',
    'Masraf Makbuzu',
    'Gider Avansı Tahsilat Makbuzu',
    'Vekalet Pulu Makbuzu',
    'Borçluya Reddiyat', // borçluya ödeme, borçludan tahsilat değil
    'Kıymetli Evrak/Eşya Alındı Makbuzu',
  ])('%s → olay yok', (m) => {
    expect(S.siniflandir(m)).toBeNull()
  })

  it.each(['Borçlu Ödemesi Tahsilat Makbuzu', 'Reddiyat Makbuzu (Borçlu Tarafından Yatırılan)', 'Borçludan Tahsilat'])(
    '%s → TAHSILAT (açıkça borçlu ödemesi)',
    (m) => {
      expect(tip(m)).toBe('TAHSILAT')
      expect(sunucu(m)).toBe('TAHSILAT')
    },
  )

  it.each(['Tahsilat Makbuzu', 'Reddiyat Makbuzu', 'Haricen Tahsil Bildirimi'])('%s → kaynak belirsiz tahsilat izi, DURUM + etiket', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('TAHSILAT_BELIRSIZ')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(r?.etiket).toMatch(/kaynak belirsiz/)
  })

  it('Borçlu Ödeme Taahhüdü → TAAHHÜT (İİK 111), tahsilat değil', () => {
    const r = S.siniflandir('Borçlu Ödeme Taahhüdü')
    expect(r?.tip).toBe('TAAHHUT')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(S.siniflandir('Taahhüt Tutanağı')?.tip).toBe('TAAHHUT')
  })
})

// ─── TEBLİĞ ───

const TEBLIG_METINLERI = [
  'Kapalı E-Tebliğ Mazbatası',
  'Tebliğ Mazbatası',
  'Ödeme Emri Tebliğ Mazbatası',
  'Ödeme İcra Emri Tebliğ Mazbatası', // "icra emri" geçse de ödeme emri
  'E-Tebliğ Mazbatası',
  'Ödeme Emri Tebliğ Edildi',
  'İadeli Taahhütlü Tebligat Mazbatası', // posta türü adı, iade sonucu değil
  'İade-i Taahhütlü Tebliğ Mazbatası',
  'İADELİ TAAHHÜTLÜ TEBLİGAT MAZBATASI',
  'Tebligat Mazbatası (Talep Üzerine)',
  'E-Tebligat Okundu',
  // TK 21/1: "tebliğ edilemediğinden" geçse de muhtara teslim + kapıya yapıştırma GEÇERLİ tebliğdir
  'Tebligat Mazbatası — adreste bulunamadığından tebliğ edilemediğinden muhtara teslim, ihbarname kapıya yapıştırıldı',
]
const IADE_METINLERI = ['Bila Tebliğ Mazbatası', 'BİLA TEBLİĞ', 'Tebligat İade', 'Tebliğ Mazbatası (İade)', 'Ödeme Emri Tebliğ Edilemedi', 'Zarf İade Edildi']

describe('TEBLIG — yalnız ödeme emrinin tebliğinin gerçekleştiğini gösteren metin', () => {
  it.each(TEBLIG_METINLERI)('%s → TEBLIG', (m) => {
    expect(tip(m)).toBe('TEBLIG')
    expect(sunucu(m)).toBe('TEBLIG')
  })

  it.each(TEBLIG_METINLERI)('%s → sunucu da GERÇEK tebliğ sayar (eklenti–sunucu çapraz kilit)', (m) => {
    expect(gercekTebligMi(tekOlay(m)!.aciklama)).toBe(true)
  })

  it.each([
    'Tebligat Talebi',
    'Kapalı Tebligat', // giden tebligat evrakı (docs/05 icra evrak türü)
    'Tebligat Zarfı Gönderildi',
    'Ödeme Emri Tebligata Çıkarıldı',
    'E-Tebligat Gönderildi',
    'Tebligat Masrafı',
  ])('%s → olay yok (talep / gönderim / zarf)', (m) => {
    expect(S.siniflandir(m)).toBeNull()
  })

  it.each([
    'İcra Emri Tebliğ Mazbatası',
    '103 Davetiyesi Tebliğ Mazbatası',
    'Kıymet Takdiri Raporu Tebliğ Mazbatası',
    'Satış İlanı Tebliğ Mazbatası',
    'Ara Karar Tebliğ Mazbatası',
    'Muhtıra Tebliğ Mazbatası',
    '89/2 İhbarname Tebliğ Mazbatası',
  ])('%s → ödeme emri dışı tebliğ: TEBLIG DEĞİL, DURUM + etiket (İİK 78 başlatmaz)', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('TEBLIG_DIGER')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(r?.etiket).toMatch(/^TEBLİĞ — ÖDEME EMRİ DIŞI/)
  })
})

describe('IADE — iade / bila tebliğ TEBLIG olarak GÖNDERİLMEZ', () => {
  it.each(IADE_METINLERI)('%s → IADE, sunucuya DURUM', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('IADE')
    expect(r?.sunucuTip).toBe('DURUM')
    expect(r?.etiket).toMatch(/^İADE/)
  })

  it.each(IADE_METINLERI)('%s → eski sürüm TEBLIG gönderse bile sunucu gerçek tebliğ SAYMAZ (çapraz kilit)', (m) => {
    expect(gercekTebligMi(m)).toBe(false)
  })

  it('yalın "iade" tebligat bağlamı dışında İADE değildir (harç/masraf iadesi)', () => {
    expect(S.siniflandir('Harç İadesi')).toBeNull()
    expect(S.siniflandir('Avans İadesi Reddiyat')).toBeNull()
    expect(tip('Tebligat Masrafı İadesi')).not.toBe('IADE')
  })
})

// ─── HACİZ ───

describe('HACIZ — dosya alacağına haciz / ihtiyati / kaldırma / borçlu malı / belirsiz', () => {
  it.each(['Dosya alacağına haciz', 'Dosya Alacağına Haciz Ekleme/Silme', 'DOSYA ALACAĞINA HACİZ MÜZEKKERESİ'])(
    '%s → dosya alacağı, HACIZ olarak GÖNDERİLMEZ; etiket yönün belirsiz olduğunu söyler',
    (m) => {
      const r = S.siniflandir(m)
      expect(r?.tip).toBe('HACIZ_DOSYA_ALACAGI')
      expect(r?.hacizTuru).toBe('DOSYA_ALACAGI')
      expect(r?.sunucuTip).toBe('DURUM')
      expect(r?.etiket).toMatch(/^DOSYA ALACAĞINA HACİZ \(yönü belirsiz/)
    },
  )

  it.each(['İhtiyati Haciz Kararı', 'İHTİYATİ HACİZ TALEBİ', 'İhtiyati Haczin İnfazı'])('%s → ihtiyati, kesinleşme sayılmaz', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('HACIZ_IHTIYATI')
    expect(r?.sunucuTip).toBe('DURUM')
  })

  it.each(['Araç Haciz Kaldırma', 'Haciz Fekki', 'Banka Haciz Fek Yazısı', 'Haczin Kaldırılması Talebi', 'Taşınmaz Haczinin Silinmesi'])(
    '%s → haciz kaldırma, borçlu malına haciz SAYILMAZ (DURUM)',
    (m) => {
      const r = S.siniflandir(m)
      expect(r?.tip).toBe('HACIZ_KALDIRMA')
      expect(r?.sunucuTip).toBe('DURUM')
    },
  )

  it.each(['Haciz İhbarnamesi (89/1)', 'Araç Haciz Müzekkeresi', 'Borçlunun Taşınmazına Haciz', 'Maaş Haciz Müzekkeresi', 'Banka Hesabına Haciz', 'Maaş Haczi'])(
    '%s → HACIZ (borçlu malı)',
    (m) => {
      const r = S.siniflandir(m)
      expect(r?.tip).toBe('HACIZ')
      expect(r?.sunucuTip).toBe('HACIZ')
      expect(r?.hacizTuru).toBe('BORCLU_MALI')
    },
  )

  it.each(['Haciz Talebi', 'HACİZ MÜZEKKERESİ', 'Haciz Tutanağı'])('%s → HACIZ, tür belirsiz', (m) => {
    const r = S.siniflandir(m)
    expect(r?.tip).toBe('HACIZ')
    expect(r?.hacizTuru).toBe('BELIRSIZ')
    expect(r?.ek).toBe('haciz türü belirsiz')
  })
})

describe('diğer', () => {
  it.each(['Hukuk Mahkemesi Tevzi Formu', 'Vekaletname', 'Takip Talebi', 'Takibin Dayanağı Belge', 'Tensip Zaptı', '', null])(
    '%s → olay yok',
    (m) => {
      expect(S.siniflandir(m)).toBeNull()
    },
  )

  it('evrak türü + açıklama birlikte değerlendirilir', () => {
    expect(tip('Tebliğ Mazbatası', 'Bila Tebliğ')).toBe('IADE')
    expect(tip('Haciz Müzekkeresi', 'Dosya Alacağına Haciz')).toBe('HACIZ_DOSYA_ALACAGI')
  })

  it('tipFromMetin geriye uyumlu imza — iç tip adı döner', () => {
    expect(S.tipFromMetin('Borca İtiraz Talebi')).toBe('ITIRAZ')
    expect(S.tipFromMetin('Ödeme İcra Emri')).toBeNull()
  })

  it('DURUM etiketleri sunucunun borca itiraz desenini İÇERMEZ', () => {
    for (const etiket of Object.values(J(S.ETIKET))) {
      expect(borcaItirazMi('DURUM', etiket), etiket).toBe(false)
    }
  })
})

describe('olaylarTuret — sunucuya giden olaylar', () => {
  it('aşama/durum itirazı: tarih ödeme emri tebliği (alt sınır), açıklama "itiraz tarihi bilinmiyor"', () => {
    const ol = J(S.olaylarTuret({ durum: 'Açık (durdurulmuş : Takibe İtiraz)', tebligTarihi: '2026-03-01', sonEvrakTarihi: '2026-03-10', safahatSon: '2026-03-12', evrak: [], safahat: [] }))
    expect(ol).toEqual([
      { tip: 'TEBLIG', tarih: '2026-03-01', aciklama: 'Tebliğ (UYAP)' },
      { tip: 'ITIRAZ', tarih: '2026-03-01', aciklama: S.ASAMA_ITIRAZ_ACIKLAMA },
    ])
  })

  it('tebliğ tarihi yoksa takip açılış tarihi; ikisi de yoksa aşamadan ITIRAZ üretilmez (her turda "bugün" seli yok)', () => {
    expect(J(S.olaylarTuret({ asama: 'TAKİBE İTİRAZ', acilis: '2026-02-20', safahatSon: '2026-03-12' }))).toEqual([
      { tip: 'ITIRAZ', tarih: '2026-02-20', aciklama: S.ASAMA_ITIRAZ_ACIKLAMA },
    ])
    expect(J(S.olaylarTuret({ durum: 'Açık (durdurulmuş : Takibe İtiraz)', sonEvrakTarihi: '2026-03-10', safahatSon: '2026-03-12' }))).toEqual([])
  })

  it('REGRESYON: aynı kayıt farklı safahatSon / sonEvrakTarihi ile iki kez türetilince AYNI olay (tarih kaymaz)', () => {
    const rec = { durum: 'Açık (durdurulmuş : Takibe İtiraz)', tebligTarihi: '2026-03-01', evrak: [], safahat: [] }
    const a = J(S.olaylarTuret({ ...rec, safahatSon: '2026-09-01', sonEvrakTarihi: '2026-09-01' }))
    const b = J(S.olaylarTuret({ ...rec, safahatSon: '2026-09-20', sonEvrakTarihi: '2026-09-18' }))
    expect(a).toEqual(b)
  })

  it('tarihli itiraz evrakı varsa aşamadan ikinci ITIRAZ eklenmez', () => {
    const ol = J(
      S.olaylarTuret({
        durum: 'Açık (durdurulmuş : Takibe İtiraz)',
        sonEvrakTarihi: '2026-03-10',
        evrak: [{ tur: 'Borca İtiraz Talebi', aciklama: '', tarih: '2026-03-05' }],
      }),
    )
    expect(ol).toEqual([{ tip: 'ITIRAZ', tarih: '2026-03-05', aciklama: 'Borca İtiraz Talebi' }])
  })

  it('TEBLIG olayında tarih önceliği tebliğ tarihi (K3); diğer olaylarda evrak tarihi', () => {
    const ol = J(
      S.olaylarTuret({
        evrak: [
          { tur: 'Tebliğ Mazbatası', tarih: '2026-03-20', tebligTarihi: '2026-03-09' },
          { tur: 'Borca İtiraz Talebi', tarih: '2026-03-12', tebligTarihi: '2026-03-15' },
        ],
      }),
    )
    expect(ol).toEqual([
      { tip: 'TEBLIG', tarih: '2026-03-09', aciklama: 'Tebliğ Mazbatası' },
      { tip: 'ITIRAZ', tarih: '2026-03-12', aciklama: 'Borca İtiraz Talebi' },
    ])
  })

  it('karışık evrak/safahat seti: yanlış TAHSILAT/TEBLIG/HACIZ/ITIRAZ üretilmez, etiketler açıklamada', () => {
    const ol = J(
      S.olaylarTuret({
        evrak: [
          { tur: 'Takip Talebi', tarih: '2026-03-01' },
          { tur: 'Ödeme İcra Emri', tarih: '2026-03-01' },
          { tur: 'Tahsil Harcı Makbuzu(Sayman Mutemet Alındısı)', tarih: '2026-03-01' },
          { tur: 'Tebligat Talebi', tarih: '2026-03-02' },
          { tur: 'Tebliğ Mazbatası', aciklama: 'Bila Tebliğ', tarih: '2026-03-06' },
          { tur: 'Kapalı E-Tebliğ Mazbatası', tarih: '2026-03-09' },
          { tur: 'Borca İtiraz Talebi', tarih: '2026-03-12' },
          { tur: 'Kıymet Takdirine İtiraz', tarih: '2026-05-02' },
        ],
        safahat: [
          { tarih: '2026-03-20', islem: 'Dosya Alacağına Haciz Ekleme/Silme' },
          { tarih: '2026-03-21', islem: 'Haciz Talebi' },
          { tarih: '2026-03-22', islem: 'Takibin Kesinleştirilmesi Talebi' },
        ],
      }),
    )
    expect(ol).toEqual([
      { tip: 'DURUM', tarih: '2026-03-06', aciklama: `${S.ETIKET.IADE} · Tebliğ Mazbatası — Bila Tebliğ` },
      { tip: 'TEBLIG', tarih: '2026-03-09', aciklama: 'Kapalı E-Tebliğ Mazbatası' },
      { tip: 'ITIRAZ', tarih: '2026-03-12', aciklama: 'Borca İtiraz Talebi' },
      { tip: 'DURUM', tarih: '2026-05-02', aciklama: `${S.ETIKET.ITIRAZ_DIGER} · Kıymet Takdirine İtiraz` },
      { tip: 'DURUM', tarih: '2026-03-20', aciklama: `${S.ETIKET.HACIZ_DOSYA_ALACAGI} · Dosya Alacağına Haciz Ekleme/Silme` },
      { tip: 'HACIZ', tarih: '2026-03-21', aciklama: 'Haciz Talebi · haciz türü belirsiz' },
      { tip: 'DURUM', tarih: '2026-03-22', aciklama: `${S.ETIKET.KESINLESME_TALEBI} · Takibin Kesinleştirilmesi Talebi` },
    ])
    expect(ol.some((o) => o.tip === 'TAHSILAT')).toBe(false)
    // sunucu yan etkisi: yalnız gerçek borca itiraz Önemli Olay adayı
    expect(ol.filter((o) => onemliOlayAdayiMi({ ...o, hamJson: UYAP }))).toEqual([{ tip: 'ITIRAZ', tarih: '2026-03-12', aciklama: 'Borca İtiraz Talebi' }])
  })

  it('her olay tipi sunucunun tanıdığı listededir; açıklama ≤ 200 karakter ve etiket/ek kırpılmaz', () => {
    const uzun = 'Dosya Alacağına Haciz ' + 'x'.repeat(400)
    const ol = J(
      S.olaylarTuret({
        tebligTarihi: '2026-03-09',
        evrak: [
          { tur: uzun, tarih: '2026-03-20' },
          { tur: 'Haciz Müzekkeresi ' + 'y'.repeat(400), tarih: '2026-03-21' },
          { tur: 'Bila Tebliğ Mazbatası', tarih: '2026-03-06' },
          { tur: 'İhtiyati Haciz Kararı', tarih: '2026-03-07' },
          { tur: 'İtirazın Kaldırılması Talebi', tarih: '2026-04-01' },
        ],
      }),
    )
    for (const o of ol) {
      expect(OLAY_TIPLERI as readonly string[]).toContain(o.tip)
      expect(o.aciklama.length).toBeLessThanOrEqual(200)
    }
    expect(ol[1].aciklama.startsWith('DOSYA ALACAĞINA HACİZ')).toBe(true)
    expect(ol[2].aciklama.endsWith(' · haciz türü belirsiz')).toBe(true)
  })

  it('rec boş / eksik alanlı olsa da patlamaz', () => {
    expect(J(S.olaylarTuret({}))).toEqual([])
    expect(J(S.olaylarTuret({ evrak: [null, { tur: 'Borca İtiraz Talebi' }], safahat: [null] }))).toEqual([]) // tarihsiz evrak olay üretmez
  })
})

describe('tebligTarihiSec — yapısal tebliğ tarihi yalnız ödeme emri tebliğinden', () => {
  it('en erken tebliğ tarihi seçilir; iade/bila, ödeme emri dışı tebliğ ve itirazın tebliği atlanır', () => {
    const t = S.tebligTarihiSec([
      { tur: 'Bila Tebliğ Mazbatası', tebligTarihi: '2026-03-06' },
      { tur: 'İcra Emri Tebliğ Mazbatası', tebligTarihi: '2026-03-07' },
      { tur: 'İtirazın Alacaklıya Tebliği', tebligTarihi: '2026-03-08' },
      { tur: 'Kapalı E-Tebliğ Mazbatası', tebligTarihi: '2026-03-09' },
      { tur: 'Tebliğ Mazbatası', tebligTarihi: '2026-03-15' },
      { tur: 'Vekaletname', tebligTarihi: '' },
    ])
    expect(t).toBe('2026-03-09')
  })

  it('yalnız iade ya da ödeme emri dışı tebliğ varsa boş döner', () => {
    expect(S.tebligTarihiSec([{ tur: 'Tebligat İade', tebligTarihi: '2026-03-06' }])).toBe('')
    expect(S.tebligTarihiSec([{ tur: 'Kıymet Takdiri Tebliğ Mazbatası', tebligTarihi: '2026-03-06' }])).toBe('')
    expect(S.tebligTarihiSec([])).toBe('')
  })
})

// ─── content.js: gerçekten ÇALIŞTIRILIR (kaynak regex'i değil) ───

/** content.js'i tarayıcı API'leri sahte bir vm bağlamında yükle; test kancası iç fonksiyonları verir. */
function icerikYukle(siniflandiriciIle: boolean) {
  const ctx: Record<string, unknown> = {
    __KONS_TEST__: {},
    console,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    setInterval: () => 0,
    addEventListener: () => undefined,
    postMessage: () => undefined,
    location: { href: 'about:blank' },
    document: { body: null, head: null, addEventListener: () => undefined },
    fetch: async () => {
      throw new Error('testte ağ yok')
    },
    chrome: {
      runtime: { onMessage: { addListener: () => undefined }, getManifest: () => ({ version: '1.9.0' }), sendMessage: () => undefined },
      storage: { local: { get: (_k: unknown, cb: (o: object) => void) => cb({}), set: (_o: unknown, cb?: () => void) => cb?.(), remove: () => undefined } },
    },
  }
  ctx.window = ctx
  vm.createContext(ctx)
  if (siniflandiriciIle) vm.runInContext(kod, ctx, { filename: 'siniflandir.js' })
  vm.runInContext(readFileSync(path.join(KOK, 'extension', 'content.js'), 'utf8'), ctx, { filename: 'content.js' })
  return (ctx.__KONS_TEST__ as {
    icerik: {
      siniflandiriciVar: boolean
      olaylarTuret: (rec: unknown) => Olay[]
      senkronGovde: (h: unknown, rec: unknown, e: unknown) => { olaylar?: Olay[]; durum?: string | null }
    }
  }).icerik
}

describe('content.js — sınıflandırıcıya bağlılık (çalıştırılarak)', () => {
  const rec = { durum: 'Açık (durdurulmuş : Takibe İtiraz)', tebligTarihi: '2026-03-01', evrak: [{ tur: 'Borca İtiraz Talebi', tarih: '2026-03-05' }] }
  const h = { id: 'p1', esasNo: '2026/1' }

  it('siniflandir.js YÜKLENMEMİŞSE hiç olay gönderilmez (yanlış tiple yazmaktansa hiç yazma); durum yine gider', () => {
    const c = icerikYukle(false)
    expect(c.siniflandiriciVar).toBe(false)
    expect(J(c.olaylarTuret(rec))).toEqual([])
    const g = J(c.senkronGovde(h, rec, { eslesme: 'OK' }))
    expect(g.olaylar).toEqual([])
    expect(g.durum).toBe('Açık (durdurulmuş : Takibe İtiraz)')
  })

  it('siniflandir.js yüklüyse content.js olayları sınıflandırıcıdan alır', () => {
    const c = icerikYukle(true)
    expect(c.siniflandiriciVar).toBe(true)
    expect(J(c.senkronGovde(h, rec, { eslesme: 'OK' }).olaylar)).toEqual(J(S.olaylarTuret(rec)))
    expect(J(c.olaylarTuret(rec)).map((o) => o.tip)).toEqual(['TEBLIG', 'ITIRAZ'])
  })
})

describe('eklenti paketi', () => {
  const manifest = JSON.parse(readFileSync(path.join(KOK, 'extension', 'manifest.json'), 'utf8'))

  it('siniflandir.js, content.js ile aynı content_scripts girdisinde ve ondan ÖNCE yüklenir', () => {
    const girdi = (manifest.content_scripts as { js: string[] }[]).find((c) => c.js.includes('content.js'))
    expect(girdi).toBeTruthy()
    expect(girdi!.js.indexOf('siniflandir.js')).toBeGreaterThanOrEqual(0)
    expect(girdi!.js.indexOf('siniflandir.js')).toBeLessThan(girdi!.js.indexOf('content.js'))
  })

  it('manifest sürümü sınıflandırıcı sürümüyle aynı (2.0.0)', () => {
    expect(manifest.version).toBe('2.0.0')
    expect(manifest.version).toBe(S.surum)
  })

  it('content.js eski toLowerCase tabanlı tipFromMetin fonksiyonunu taşımaz', () => {
    const content = readFileSync(path.join(KOK, 'extension', 'content.js'), 'utf8')
    expect(content).not.toMatch(/function tipFromMetin/)
  })
})
