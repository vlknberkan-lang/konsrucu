/**
 * KonsRücü — "6 Dava açılışı" (DA-01 … DA-07) ve "8 Sonuç ve tahsil" (SN-01 … SN-08) kuralları
 * lib/konsrucu/dava/kurallar.ts (saf)
 *
 * 06 §8.3 tablosunun kod karşılığı; "Bağla" aşaması lib/yonlendirme/kurallar.ts'e bağlar. Yapay zekâ kural
 * tetiklemez: girdiler onaylı kayıtlar ve aday sayılarıdır (aday kanıt yalnız "onayla" adımı doğurur).
 */
import type { KuralSonucu } from '../arabuluculuk/kurallar'
import { iik67KapanisKontrol } from './iik67-kapanis'
import { kapaliRadarda } from './kapali-radar'
import type { OnKontrolSonucu } from './on-kontrol'

export type DavaGercekleri = {
  arabuluculuk: { sonuc: string | null; sonTutanakTarihi: Date | null } | null
  yolSecimi: string | null
  dava: {
    rolumuz: string
    acilisTarihi: Date | null
    hukum: string | null
    kararOnayAt: Date | null
    gerekceliTebligTarihi: Date | null
  } | null
  onKontrol: OnKontrolSonucu | null
  dilekceDurumu: 'YOK' | 'TASLAK' | 'IMZAYA_HAZIR'
  davaAdayiVar: boolean
  iik67: { durum: string; onaylananSonGun: Date | null; onerilenIhtiyatli: Date | null } | null
  kararEvrakiVar: boolean
  kararSonrasiYolSecildi: boolean
  uyapDurum: string | null
  kapanisSebebi: string | null
  tahsilatAdayi: { sayi: number; tutar: number | null }
  bildirimBekleyen: string[]
}

const para = (n: number | null) => (n == null ? '' : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' TL')

export function davaKurallari(g: DavaGercekleri): KuralSonucu[] {
  const out: KuralSonucu[] = []
  const d = g.dava
  const a = g.arabuluculuk
  const davaYolu = (!!a?.sonTutanakTarihi && a.sonuc !== 'ANLASMA') || (!!g.yolSecimi && ['IIK68_KALDIRMA', 'GENEL_ALACAK'].includes(g.yolSecimi))

  if (!d && davaYolu) {
    if (g.onKontrol && !g.onKontrol.imzayaHazir && g.onKontrol.ilkEksik) {
      out.push({ kod: 'DA-02', surum: 1, oneri: `Eksik: ${g.onKontrol.ilkEksik.baslik.toLocaleLowerCase('tr')}`, eylem: 'Tamamla', hedef: 'on-kontrol', rol: 'A', oncelik: 4 })
    } else if (!g.onKontrol) {
      out.push({ kod: 'DA-01', surum: 1, oneri: 'Dava ön kontrolünü tamamlayın', eylem: 'Ön kontrol', hedef: 'on-kontrol', rol: 'A', oncelik: 5 })
    }
    if (g.onKontrol?.imzayaHazir && g.dilekceDurumu === 'YOK') {
      out.push({ kod: 'DA-03', surum: 1, oneri: 'Dava dilekçesini hazırlayın', eylem: 'Hazırla', hedef: 'dilekce', rol: 'A', oncelik: 5 })
    }
    if (g.dilekceDurumu === 'IMZAYA_HAZIR') {
      out.push({ kod: 'DA-04', surum: 1, oneri: "UYAP'ta davayı açın; esas no'yu girin ya da bekleyin", eylem: 'Esas no gir', hedef: 'dava-kayit', rol: 'A', oncelik: 5 })
    }
  }
  if (g.davaAdayiVar) out.push({ kod: 'DA-05', surum: 1, oneri: 'Bulunan davayı onaylayın', eylem: 'Bağla', hedef: 'aday-dava', rol: 'H', oncelik: 3 })
  if (d && g.iik67) {
    const k = iik67KapanisKontrol({ acilisTarihi: d.acilisTarihi, onaylananSonGun: g.iik67.onaylananSonGun, onerilenIhtiyatli: g.iik67.onerilenIhtiyatli, sureDurumu: g.iik67.durum })
    if (k.durum === 'KAPANMAYA_HAZIR') out.push({ kod: 'DA-06a', surum: 1, oneri: 'İİK 67 kaydını kapatın (kanıt: açılış tarihi)', eylem: 'Kapat', hedef: 'iik67-kapanis', rol: 'A', oncelik: 2 })
    if (k.durum === 'SONRA') out.push({ kod: 'DA-06b', surum: 1, oneri: 'Açılış tarihi son günden sonra görünüyor: kontrol edin', eylem: 'İncele', hedef: 'iik67-kapanis', rol: 'A', oncelik: 0, etiket: 'teyit gerekli' })
  }
  if (d?.rolumuz === 'DAVALI') out.push({ kod: 'DA-07', surum: 1, oneri: 'Karşı taraf davası: cevap süresini onaylayın (HMK 127, teyit gerekli)', eylem: 'Onayla', hedef: 'sure', rol: 'A', oncelik: 2, etiket: 'HMK 127 · teyit gerekli' })

  if (d && g.kararEvrakiVar && !d.kararOnayAt) out.push({ kod: 'SN-01', surum: 1, oneri: 'Kararı onaylayın', eylem: 'Karar kartı', hedef: 'karar-karti', rol: 'A', oncelik: 3 })
  if (d?.kararOnayAt) {
    if (!g.kararSonrasiYolSecildi) out.push({ kod: 'SN-02', surum: 1, oneri: 'Takibe devam ve kanun yolu seçimi (müvekkil onayı)', eylem: 'Seç', hedef: 'karar-karti', rol: 'A', oncelik: 4 })
    if (d.hukum === 'KISMEN_KABUL') out.push({ kod: 'SN-03', surum: 1, oneri: 'Takibi kabul edilen kısımla daraltın (teyit gerekli)', eylem: 'Talep taslağı', hedef: 'karar-karti', rol: 'A', oncelik: 4, etiket: 'teyit gerekli' })
    if (!d.gerekceliTebligTarihi) out.push({ kod: 'SN-04', surum: 1, oneri: 'Gerekçeli karar tebliğ tarihini girin (istinaf süresi)', eylem: 'Tarih gir', hedef: 'karar-karti', rol: 'H', oncelik: 3 })
    out.push({ kod: 'SN-05', surum: 1, oneri: 'Karar kesin olabilir (HMK 341, sınır tablosu teyit gerekli)', eylem: '', hedef: 'karar-karti', rol: 'A', oncelik: 6, etiket: 'HMK 341 · teyit gerekli' })
  }
  if (kapaliRadarda({ uyapDurum: g.uyapDurum, kapanisSebebi: g.kapanisSebebi })) {
    out.push({ kod: 'SN-06', surum: 1, oneri: 'Kapanış sebebini seçin (bilinmiyorsa radarda kalır)', eylem: 'Seç', hedef: 'kapanis', rol: 'A', oncelik: 4 })
  }
  if (g.tahsilatAdayi.sayi > 0) {
    const tutar = g.tahsilatAdayi.tutar == null ? '' : `: ${para(g.tahsilatAdayi.tutar)}`
    out.push({ kod: 'SN-07', surum: 1, oneri: `Tahsilatı onaylayın${tutar} (UYAP hesap özeti)`, eylem: 'Onayla', hedef: 'tahsilat', rol: 'H', oncelik: 4 })
  }
  if (g.bildirimBekleyen.length) out.push({ kod: 'SN-08', surum: 1, oneri: 'Müvekkil bildirim taslağını onaylayın', eylem: 'Taslağı aç', hedef: 'bildirim', rol: 'A', oncelik: 5 })
  return out.sort((x, y) => x.oncelik - y.oncelik)
}
