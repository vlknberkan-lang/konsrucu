/**
 * S15 · UYAP olayından ADAY üretimi (lib/konsrucu/eksen/aday-siniflandir.ts) — docs/04 §3 kök neden kilitleri.
 *
 * ÇAPRAZ KİLİT: eklentinin GERÇEK sınıflandırıcısı (extension/siniflandir.js, 1.9) vm ile yüklenir; D1 ve D2
 * desenindeki kurgusal evrak listesinden sunucuya giden `olaylar` üretilir ve sunucu sınıflandırıcısından geçirilir.
 * Eklenti etiketleri değişirse bu test kırılır. Evrak adları UYAP tür adı kalıbındadır; tarihler kurgusaldır
 * (docs/04 §2'deki gün sırası korunur); kişisel veri yok.
 */
import { describe, it, expect } from 'vitest'
import {
  durumMetniItirazAdayi, durumMetniItirazMi, eklentiOlayiniSinifla, tebligSekliOner,
} from '@/lib/konsrucu/eksen/aday-siniflandir'
import { trNorm, isoGun } from '@/lib/konsrucu/eksen/norm'
import { TAHSILAT_SINYALI_ETIKET } from '@/lib/konsrucu/eksen/sabitler'
import { d1Olaylari, d2Olaylari, eklenti, type EklentiOlay } from './eksen-kurgusal'

const S = eklenti()
const J = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const sinifla = (o: EklentiOlay) => eklentiOlayiniSinifla({ tip: o.tip, aciklama: o.aciklama, tarih: o.tarih ? new Date(o.tarih) : null })

describe('trNorm — Türkçe "İ" (docs/04 K1)', () => {
  it('"Borca İtiraz" ve "TAKİBE İTİRAZ" ASCII desenle eşleşir', () => {
    expect(trNorm('Borca İtiraz Talebi')).toBe('borca itiraz talebi')
    expect(trNorm('TAKİBE İTİRAZ')).toBe('takibe itiraz')
    expect(trNorm('  Kâtip   Kaşesi ')).toBe('katip kasesi')
  })
})

describe('D1 deseni — eklenti 1.9 olayları → sunucu adayları', () => {
  const ol = d1Olaylari()
  const adaylar = ol.map((o) => ({ o, a: sinifla(o) }))
  const bul = (alt: string) => adaylar.filter((x) => x.a.altTip === alt)

  it('borca itiraz ITIRAZ adayı olur; tarih UYAP kayıt tarihidir ve kaşe uyarısı taşır', () => {
    const it = bul('ITIRAZ')
    expect(it).toHaveLength(1)
    expect(isoGun(it[0].a.hukukiTarih)).toBe('2026-06-24')
    expect(it[0].a.not).toMatch(/kalem kaşesi/)
  })
  it('dosya alacağına haciz "müvekkil alacağına haciz" olur; hiçbiri kesinleşme sayılmaz (K2)', () => {
    expect(bul('MUVEKKIL_ALACAGINA_HACIZ')).toHaveLength(2)
    expect(bul('KESINLESME_SERHI')).toHaveLength(0)
    expect(bul('ICRAI_HACIZ')).toHaveLength(0)
  })
  it('tahsilat makbuzu TAHSILAT_SINYALI olur; hiçbir olaydan TAHSILAT_BORCLUDAN doğmaz (K1)', () => {
    expect(bul('TAHSILAT_SINYALI')).toHaveLength(1)
    expect(bul('TAHSILAT_BORCLUDAN')).toHaveLength(0)
  })
  it('ödeme emri, harç makbuzu ve tebligat talebi olay üretmez (eklenti) — tebliğ sonucu yalnız mazbatadan', () => {
    expect(ol.some((o) => /Harç|Ödeme İcra Emri|Tebligat Talebi/.test(o.aciklama))).toBe(false)
    const t = bul('TEBLIG_SONUCU')
    expect(t.length).toBeGreaterThanOrEqual(1)
    expect(t.every((x) => isoGun(x.a.hukukiTarih) === '2026-06-28')).toBe(true)
    expect(t.some((x) => x.a.tebligSekli === 'UETS')).toBe(true)
  })
})

describe('D2 deseni — İADE ve TK 21/2 ayrımı, itirazın alacaklıya tebliği', () => {
  const adaylar = d2Olaylari().map((o) => sinifla(o))
  it('1. tebligat İADE: TEBLIG_IADE, sonuç İADE (tebliğ sayılmaz — K3)', () => {
    const iade = adaylar.filter((a) => a.altTip === 'TEBLIG_IADE')
    expect(iade).toHaveLength(1)
    expect(iade[0].sonuc).toBe('IADE')
  })
  it('2. tebligat: tebliğ ADAYI 25.06; eklenti yalnız evrak türünü gönderdiği için sonuç ve şekil BELİRSİZ (mazbatadan gelir — S23)', () => {
    const t = adaylar.filter((a) => a.altTip === 'TEBLIG_SONUCU')
    expect(t.length).toBeGreaterThanOrEqual(1)
    expect(t.every((a) => isoGun(a.hukukiTarih) === '2026-06-25')).toBe(true)
    expect(t[0].sonuc).toBe('BELIRSIZ')
    expect(t[0].tebligSekli).toBe('BELIRSIZ')
  })
  it('itirazın alacaklıya tebliği ayrı alt tip, muhatap alacaklı vekili', () => {
    const t = adaylar.filter((a) => a.altTip === 'ITIRAZIN_ALACAKLIYA_TEBLIGI')
    expect(t).toHaveLength(1)
    expect(t[0].muhatap).toBe('ALACAKLI_VEKILI')
    expect(isoGun(t[0].hukukiTarih)).toBe('2026-07-01')
  })
})

describe('durum metni ve aşama türevi itiraz — tarih UYDURULMAZ', () => {
  it('"Açık (durdurulmuş : Takibe İtiraz)" itiraz sinyalidir; kaldırma/iptal değildir', () => {
    expect(durumMetniItirazMi('Açık (durdurulmuş : Takibe İtiraz)')).toBe(true)
    expect(durumMetniItirazMi('TAKİBE İTİRAZ')).toBe(true)
    expect(durumMetniItirazMi('Açık')).toBe(false)
    expect(durumMetniItirazMi('İtirazın Kaldırılması')).toBe(false)
    expect(durumMetniItirazMi(null)).toBe(false)
  })
  it('durum metni adayı DURDURMA_ITIRAZ, hukuki tarih BOŞ', () => {
    const a = durumMetniItirazAdayi()
    expect(a.altTip).toBe('DURDURMA_ITIRAZ')
    expect(a.hukukiTarih).toBeNull()
    expect(a.not).toMatch(/tarih teyit gerekli/)
  })
  it('eklentinin aşama türevi itirazı (tarih = tebliğ/açılış alt sınırı) DURDURMA_ITIRAZ olur ve tarih taşımaz', () => {
    const ol = J(S.olaylarTuret({ durum: 'Açık (durdurulmuş : Takibe İtiraz)', tebligTarihi: '2026-03-01', evrak: [], safahat: [] }))
    const it = ol.find((o) => o.tip === 'ITIRAZ')!
    expect(it).toBeTruthy()
    const a = sinifla(it)
    expect(a.altTip).toBe('DURDURMA_ITIRAZ')
    expect(a.hukukiTarih).toBeNull()
  })
})

describe('eklenti 1.8 etiketsiz olayları sunucuda yeniden okunur', () => {
  const t = (tip: string, aciklama: string, tarih = '2026-07-01') => eklentiOlayiniSinifla({ tip, aciklama, tarih: new Date(tarih) })
  it.each([
    ['TAHSILAT', 'Ödeme İcra Emri', 'ODEME_EMRI_DUZENLENDI'],
    ['TAHSILAT', 'Harç Tahsil Makbuzu', 'MASRAF_MAKBUZU'],
    ['TAHSILAT', 'Reddiyat Makbuzu', 'REDDIYAT'],
    ['TAHSILAT', 'Tahsilat', 'TAHSILAT_SINYALI'],
    ['TEBLIG', 'Tebligat Talebi', 'TEBLIGAT_TALEBI'],
    ['TEBLIG', 'Kapalı Tebligat', 'TEBLIGAT_GONDERIM'],
    ['TEBLIG', 'Bila Tebliğ Mazbatası', 'TEBLIG_IADE'],
    ['TEBLIG', 'Tebligat Mazbatası - tebliğ edilemedi', 'TEBLIG_IADE'],
    ['TEBLIG', 'Tebligat Mazbatası (adreste bulunamadığından muhtara teslim, TK 21)', 'TEBLIG_SONUCU'],
    ['HACIZ', 'Dosya Alacağına Haciz Ekleme', 'MUVEKKIL_ALACAGINA_HACIZ'],
    ['HACIZ', 'İhtiyati Haciz Kararı', 'IHTIYATI_HACIZ'],
    ['HACIZ', 'Araç Haczi (borçlu)', 'ICRAI_HACIZ'],
    ['HACIZ', 'Haczin Kaldırılması', 'DIGER'],
    ['KESINLESTI', 'Takibin Kesinleştirilmesi Talebi', 'DIGER'],
    ['KESINLESTI', 'Kesinleşme Bilgisi Silindi', 'DIGER'],
    ['KESINLESTI', 'Örnek Kişi Kesinleşme Bilgisi Kaydedildi.', 'KESINLESME_SERHI'],
    ['KAPANDI', 'Dosya kapandı', 'DIGER'],
    ['DURUM', 'Hukuk Mahkemesi Tevzi Formu', 'DAVA_ACILDI_SINYALI'],
    ['DURUM', 'Kıymet Takdirine İtiraz', 'DIGER'],
    ['BILINMEYEN', 'Borca İtiraz Dilekçesi', 'ITIRAZ'],
  ])('%s "%s" → %s', (tip, aciklama, beklenen) => {
    expect(t(tip, aciklama).altTip).toBe(beklenen)
  })
  it('sunucunun yeni TAHSİLAT SİNYALİ etiketi de tanınır', () => {
    expect(t('DURUM', `${TAHSILAT_SINYALI_ETIKET} · Tahsilat Makbuzu`).altTip).toBe('TAHSILAT_SINYALI')
  })
  it('hiçbir evrak adı TAHSILAT_BORCLUDAN üretmez (tahsilat yalnız Yatan Para farkından)', () => {
    const metinler = ['Tahsilat Makbuzu', 'Borçlu Tarafından Yatırılan Para', 'Reddiyat', 'Haricen Tahsil', 'Tahsil Harcı']
    for (const tip of ['TAHSILAT', 'DURUM', 'TEBLIG']) for (const m of metinler) expect(t(tip, m).altTip).not.toBe('TAHSILAT_BORCLUDAN')
  })
  it('kesinleşme sinyali uyarısı: onay olmadan kesinleşmiş sayılmaz', () => {
    expect(t('KESINLESTI', 'Kesinleşme Bilgisi Kaydedildi').not).toMatch(/avukat onayı olmadan/)
  })
})

describe('eklenti 1.9 etiketlerinin hepsi tanınır (etiket değişirse test kırılır)', () => {
  const beklenen: Record<string, string> = {
    IADE: 'TEBLIG_IADE', TEBLIG_DIGER: 'DIGER', HACIZ_DOSYA_ALACAGI: 'MUVEKKIL_ALACAGINA_HACIZ', HACIZ_IHTIYATI: 'IHTIYATI_HACIZ',
    HACIZ_KALDIRMA: 'DIGER', ITIRAZ_SONRASI: 'DIGER', ITIRAZ_TEBLIGI: 'ITIRAZIN_ALACAKLIYA_TEBLIGI', ITIRAZ_FERAGAT: 'DIGER',
    ITIRAZ_DIGER: 'DIGER', KESINLESME_TALEBI: 'DIGER', KESINLESME_SILINDI: 'DIGER', KESINLESME_BELIRSIZ: 'DIGER',
    TAHSILAT_BELIRSIZ: 'TAHSILAT_SINYALI', TAAHHUT: 'DIGER',
  }
  it.each(Object.entries(S.ETIKET))('%s', (anahtar, etiket) => {
    expect(beklenen[anahtar], `yeni etiket: ${anahtar}`).toBeDefined()
    const a = eklentiOlayiniSinifla({ tip: 'DURUM', aciklama: `${etiket} · Örnek Evrak`, tarih: new Date('2026-07-01') })
    expect(a.altTip).toBe(beklenen[anahtar])
  })
  it.each(Object.keys(S.ETIKET))('iç tip adı tip alanında doğrudan gelirse de tanınır: %s', (anahtar) => {
    const a = eklentiOlayiniSinifla({ tip: anahtar, aciklama: 'Örnek Evrak', tarih: new Date('2026-07-01') })
    expect(a.altTip).toBe(beklenen[anahtar])
  })
  it('IADE iç tipi: sonuç İADE, süre başlamaz; dosya alacağına haciz kesinleşme sayılmaz', () => {
    const iade = eklentiOlayiniSinifla({ tip: 'IADE', aciklama: 'Tebligat Mazbatası', tarih: new Date('2026-06-18') })
    expect(iade).toMatchObject({ altTip: 'TEBLIG_IADE', sonuc: 'IADE' })
    expect(iade.not).toMatch(/süre başlamaz/)
    expect(eklentiOlayiniSinifla({ tip: 'hacız_dosya_alacagi', aciklama: '', tarih: null }).altTip).not.toBe('KESINLESME_SERHI')
  })
})

describe('tebliğ şekli önerisi', () => {
  it.each([
    ['e-tebligat mazbatasi', 'UETS'],
    ['uets ulastigi tarih', 'UETS'],
    ['tk 21/1 geregi', 'TK21_1'],
    ['muhtara teslim', 'TK21_2'],
    ['tk 35 geregi', 'TK35'],
    ['bizzat kendisine teslim', 'MUHATABA'],
    ['mazbata', 'BELIRSIZ'],
  ])('%s → %s', (m, s) => expect(tebligSekliOner(trNorm(m))).toBe(s))
})
