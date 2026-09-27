import { describe, expect, it } from 'vitest'
import { avukatRoluMu } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { kaliteRaporu, type KaliteGirdi } from '@/lib/konsrucu/dilekce-v2/kapilar'
import type { DavaliAdayi } from '@/lib/konsrucu/dilekce-v2/tipler'
import type { KutuphaneKaydi } from '@/lib/konsrucu/mevzuat/atif'

// Kurgusal dosya (gerçek kişi, TCKN, plaka, poliçe, dosya no yok). Davacı "Zurich" — S37 kabul 4'teki senaryoyu
// yansıtır: aktif müvekkil Zurich'ken metne başka müvekkilin (Ray) adı karışmamalı.
const kutuphane: KutuphaneKaydi[] = [
  { id: 'm1', kunye: 'TTK m.1472/1', tur: 'MEVZUAT', alinti: 'Sigortacı, ödediği tazminat tutarınca hukuken sigortalının yerine geçer.', durum: 'DOGRULANDI', aktif: true },
]

const davaliAdaylari: DavaliAdayi[] = [
  { borcluId: 'br1', ad: 'Davalı Bir', itirazVar: true, itirazTipi: 'TAM', itirazTarihi: '2026-03-20T00:00:00.000Z', davaTarafId: null, davaTarafTeyit: null },
  { borcluId: 'br2', ad: 'Davalı İki', itirazVar: false, itirazTipi: null, itirazTarihi: null, davaTarafId: null, davaTarafTeyit: null },
]

const TEMIZ_METIN = `ÖRNEK ASLİYE HUKUK MAHKEMESİ

DAVACI\t: Zurich Sigorta A.Ş.
VEKİLİ\t: Av. Örnek Vekil
DAVALI 1\t: Davalı Bir

KONU\t: Örnek 1. İcra Dairesi 2026/100 sayılı icra takibine vaki itirazın iptali ile takibin devamı talebimizden ibarettir.

DAVA DEĞERİ\t: 10.250,50 TL (tam itiraz)

AÇIKLAMALAR

1. Sigortalı şirket, hasar bedelini ödeyerek halef olmuştur [O-2]. TTK m.1472/1 uyarınca sigortacı, ödediği tazminat tutarınca hukuken sigortalının yerine geçer.

HUKUKİ NEDENLER
1. TTK m.1472/1

HUKUKİ DELİLLER
1. Son tutanak.pdf

SONUÇ VE İSTEM\t: Yukarıda arz ve izah edilen nedenlerle;
1. Davalı tarafın icra takibine vaki itirazının iptaline,
2. Yargılama giderleri ve vekâlet ücretinin davalı taraf üzerinde bırakılmasına karar verilmesini vekaleten arz ve talep ederiz. 27.09.2026

Av. Örnek Vekil
Davacı Vekili`

function girdi(ez: Partial<KaliteGirdi> = {}): KaliteGirdi {
  return {
    metin: TEMIZ_METIN,
    kutuphane,
    atifOnaylari: [],
    davaliAdaylari,
    secilenDavalilar: ['br1'],
    celiskiler: [],
    davaDegeriKurus: 1025050,
    takip: { gecerli: true, faizTuru: 'YASAL', toplamKurus: 1025050 },
    digerMusteriAdlari: ['Ray Sigorta A.Ş.'],
    tensip: { davaSartiArabuluculuk: false, sonTutanakEkVar: true, vekaletnameVar: true },
    ...ez,
  }
}

describe('kaliteRaporu: temiz dilekçe imzaya hazır olabilir', () => {
  it('hiçbir kırmızı kural tetiklenmez', () => {
    const r = kaliteRaporu(girdi())
    expect(r.kirmizi).toEqual([])
    expect(r.imzayaHazirOlabilir).toBe(true)
  })
})

describe('kaliteRaporu: kırmızı kapılar (06 §7.4, her kural için bir vaka)', () => {
  it('K1_ATIF: kütüphanede karşılığı olmayan atıf kırmızıdır; tek tek onaylanınca açılır', () => {
    const metin = TEMIZ_METIN.replace('TTK m.1472/1 uyarınca', 'İİK m.67 uyarınca')
    const g = girdi({ metin })
    const r1 = kaliteRaporu(g)
    const bulgu = r1.kirmizi.find((b) => b.kod === 'K1_ATIF' && b.atif)
    expect(bulgu).toBeTruthy()
    expect(r1.imzayaHazirOlabilir).toBe(false)

    // Avukat tek tek onaylayınca (kim, ne zaman, resmî bağlantı) aynı anahtarlı atıf artık kırmızı sayılmaz.
    const r2 = kaliteRaporu({
      ...g,
      atifOnaylari: [{ anahtar: bulgu!.atif!.anahtar, metin: bulgu!.atif!.metin, onaylayanId: 'avukat-1', at: '2026-09-27T00:00:00.000Z', resmiUrl: 'https://www.mevzuat.gov.tr/ornek' }],
    })
    expect(r2.kirmizi.some((b) => b.kod === 'K1_ATIF')).toBe(false)
  })

  it('K2_OLGU: kart dışı / kaynaksız AÇIKLAMA paragrafı (⟨KAYNAKSIZ⟩) kırmızıdır', () => {
    const metin = `${TEMIZ_METIN}\n⟨KAYNAKSIZ: bu paragrafın kart olgularıyla bağı doğrulanamadı; avukat kontrol etmeden kullanmayın⟩\nSürücü saatte 150 km hızla gidiyordu.`
    const r = kaliteRaporu(girdi({ metin }))
    expect(r.kirmizi.some((b) => b.kod === 'K2_OLGU')).toBe(true)
    expect(r.imzayaHazirOlabilir).toBe(false)
  })

  it('K3_TUTARLILIK: metindeki dava değeri karttaki hesaplanan değerle uyuşmuyor', () => {
    const metin = TEMIZ_METIN.replace('10.250,50 TL', '99.999,99 TL')
    const r = kaliteRaporu(girdi({ metin }))
    expect(r.kirmizi.some((b) => b.kod === 'K3_TUTARLILIK')).toBe(true)
  })

  it('K3_TUTARLILIK: kart seviyesinde bilinen bir çelişki de kırmızıdır', () => {
    const r = kaliteRaporu(girdi({ celiskiler: [{ aciklama: 'Takip talebindeki asıl alacak onaylı alan değeriyle aynı değil.' }] }))
    expect(r.kirmizi.some((b) => b.kod === 'K3_TUTARLILIK')).toBe(true)
  })

  it('K4_TALEP_TAKIP: talep sonucuna takip talebinde olmayan faiz türü eklenince kırmızı', () => {
    const metin = `${TEMIZ_METIN}\nAlacağın avans faizi ile birlikte tahsili talep olunur.`
    const r = kaliteRaporu(girdi({ metin })) // takip.faizTuru: YASAL — metindeki "avans faizi" uyuşmuyor
    expect(r.kirmizi.some((b) => b.kod === 'K4_TALEP_TAKIP')).toBe(true)
  })

  it('K4_TALEP_TAKIP: dava değeri geçerli takip talebindeki toplamı aşınca kırmızı', () => {
    const r = kaliteRaporu(girdi({ davaDegeriKurus: 2_000_000, takip: { gecerli: true, faizTuru: 'YASAL', toplamKurus: 1_025_050 } }))
    expect(r.kirmizi.some((b) => b.kod === 'K4_TALEP_TAKIP')).toBe(true)
  })

  it('K5_DAVALI: davalılara itiraz etmeyen borçlu eklenince kırmızı', () => {
    const r = kaliteRaporu(girdi({ secilenDavalilar: ['br1', 'br2'] }))
    expect(r.kirmizi.some((b) => b.kod === 'K5_DAVALI' && b.mesaj.includes('Davalı İki'))).toBe(true)
  })

  it('K6_YER_TUTUCU: kalmış yer tutucu kırmızıdır', () => {
    const metin = `${TEMIZ_METIN}\nMahkeme ⟨mahkeme adı⟩ tarafından karar verilecektir.`
    const r = kaliteRaporu(girdi({ metin }))
    expect(r.kirmizi.some((b) => b.kod === 'K6_YER_TUTUCU')).toBe(true)
  })

  it('K6_YER_TUTUCU: doldurulmamış {{alan}} ve boş "[...]" ayracı da kırmızıdır', () => {
    const r1 = kaliteRaporu(girdi({ metin: `${TEMIZ_METIN}\n{{dava_degeri}}` }))
    expect(r1.kirmizi.some((b) => b.kod === 'K6_YER_TUTUCU')).toBe(true)
    const r2 = kaliteRaporu(girdi({ metin: `${TEMIZ_METIN}\nDavalı adresi [...] olarak kayıtlıdır.` }))
    expect(r2.kirmizi.some((b) => b.kod === 'K6_YER_TUTUCU')).toBe(true)
  })

  it('K7_KVKK: başka müvekkilin adı metinde geçince kırmızı (Zurich dosyasında "RAY")', () => {
    const metin = `${TEMIZ_METIN}\nRay Sigorta A.Ş. adına yapılan ödeme de dikkate alınmıştır.`
    const r = kaliteRaporu(girdi({ metin }))
    expect(r.kirmizi.some((b) => b.kod === 'K7_KVKK')).toBe(true)
    expect(r.imzayaHazirOlabilir).toBe(false)
  })

  it('K7_KVKK: açılmamış maskeleme jetonu kalınca kırmızı', () => {
    const metin = `${TEMIZ_METIN}\nBorçlu [KİŞİ-3] ile görüşülmüştür.`
    const r = kaliteRaporu(girdi({ metin }))
    expect(r.kirmizi.some((b) => b.kod === 'K7_KVKK')).toBe(true)
  })

  it('K8_TENSIP: dava şartı arabuluculukta son tutanak eki yoksa kırmızı', () => {
    const r = kaliteRaporu(girdi({ tensip: { davaSartiArabuluculuk: true, sonTutanakEkVar: false, vekaletnameVar: true } }))
    expect(r.kirmizi.some((b) => b.kod === 'K8_TENSIP')).toBe(true)
    expect(r.imzayaHazirOlabilir).toBe(false)
  })

  it('K8_TENSIP: son tutanak eki varsa ya da arabuluculuk dava şartı değilse kırmızı olmaz', () => {
    const r1 = kaliteRaporu(girdi({ tensip: { davaSartiArabuluculuk: true, sonTutanakEkVar: true, vekaletnameVar: true } }))
    expect(r1.kirmizi.some((b) => b.kod === 'K8_TENSIP')).toBe(false)
    const r2 = kaliteRaporu(girdi({ tensip: { davaSartiArabuluculuk: false, sonTutanakEkVar: false, vekaletnameVar: true } }))
    expect(r2.kirmizi.some((b) => b.kod === 'K8_TENSIP')).toBe(false)
  })
})

describe('kaliteRaporu: sarı uyarılar (hâkim gözü) imzayı hiç kilitlemez', () => {
  it('uzun paragraf ve eksik tensip bilgi maddesi sarıya düşer; kırmızı yoksa imzaya hazır olabilir', () => {
    const uzunParagraf = 'A'.repeat(950)
    const r = kaliteRaporu(girdi({
      metin: `${TEMIZ_METIN}\n\n${uzunParagraf}`,
      tensip: { davaSartiArabuluculuk: false, sonTutanakEkVar: true, vekaletnameVar: false },
    }))
    expect(r.sari.length).toBeGreaterThan(0)
    expect(r.kirmizi).toEqual([])
    expect(r.imzayaHazirOlabilir).toBe(true)
  })

  it('belirsiz ifade ve cümle tekrarı sarı uyarı üretir', () => {
    const metin = `${TEMIZ_METIN}\n\nSanırım müvekkil zarara uğramıştır. Müvekkil zarara uğramıştır. Müvekkil zarara uğramıştır.`
    const r = kaliteRaporu(girdi({ metin }))
    expect(r.sari.some((s) => s.mesaj.includes('Belirsiz ifade') || s.mesaj.includes('tekrar'))).toBe(true)
  })
})

describe('rol kapısı: "İmzaya hazır"ı yalnız ADMIN/AVUKAT yapabilir (06 §7.4)', () => {
  it('avukat yardımcısı ve görüntüleyen "imzaya hazır" yapamaz', () => {
    expect(avukatRoluMu('AVUKAT_YRD')).toBe(false)
    expect(avukatRoluMu('GORUNTULEYEN')).toBe(false)
  })
  it('ADMIN ve AVUKAT yapabilir', () => {
    expect(avukatRoluMu('AVUKAT')).toBe(true)
    expect(avukatRoluMu('ADMIN')).toBe(true)
  })
})
