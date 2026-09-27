/**
 * KonsRücü — "5 Arabuluculuk" durağının kuralları (AR-01 … AR-09) · lib/konsrucu/arabuluculuk/kurallar.ts (saf)
 *
 * 06 §8.3 tablosunun kod karşılığı. Yönlendirme motoru (lib/yonlendirme/kurallar.ts, "Bağla" aşaması) bu
 * fonksiyonu `Gercekler`'den kurduğu dilimle çağırır. Yapay zekâ hiçbir kuralı tetiklemez; girdiler yalnız
 * onaylı/avukat kayıtlarından gelir. Hukuki etiketler "teyit gerekli" taşır.
 */
import { musteriOnayiKapisi, type OnayKaydiOzet } from './onay'
import { YOL_ONAY_TURU, type ItirazSonrasiYol } from './sabitler'
import { gunNo } from './tarih'

export type KuralRol = 'H' | 'A' | 'A+2'
export type KuralSonucu = {
  kod: string
  surum: number
  oneri: string
  eylem: string // birincil eylemin düğme adı
  hedef: string // bileşen/çapa (Bağla aşaması eşler)
  rol: KuralRol
  oncelik: number // 0 veri engeli … 6 bilgi (06 §8.2)
  etiket?: string // hukuki etiket (teyit gerekli)
}

export type ArabuluculukGercekleri = {
  itirazOnayli: boolean
  yolSecimi: { secim: string } | null // GECERLI, ITIRAZ_SONRASI
  onaylar: OnayKaydiOzet[]
  arabuluculuk: {
    tur: string | null
    basvuruTarihi: Date | null
    sonTutanakTarihi: Date | null
    sonTutanakBelgeId: string | null
    sonuc: string | null
    onayAt: Date | null
  } | null
  toplantilar: { baslar: Date; durum: string }[]
  iik67YenidenOnayBekleyen: number
  karsiTarafUyumsuz: boolean
  davaVar: boolean
  ihtiyatliSonGun: Date | null
}

export function arabuluculukKurallari(g: ArabuluculukGercekleri, simdi: Date = new Date()): KuralSonucu[] {
  const out: KuralSonucu[] = []
  const yol = g.yolSecimi?.secim ?? null
  const a = g.arabuluculuk

  if (g.itirazOnayli && !yol) {
    out.push({ kod: 'AR-01', surum: 1, oneri: 'Yol seçin: arabuluculuk + itirazın iptali / İİK 68 / genel dava / bırak', eylem: 'Yol seç', hedef: 'yol-secimi', rol: 'A', oncelik: 4 })
  }
  if (yol) {
    const onayTuru = YOL_ONAY_TURU[yol as ItirazSonrasiYol] ?? null
    if (onayTuru) {
      const kapi = musteriOnayiKapisi(onayTuru, g.onaylar, { ihtiyatliSonGun: g.ihtiyatliSonGun, simdi })
      if (!kapi.acik) out.push({ kod: 'AR-02', surum: 1, oneri: "Ray'den onay isteyin (dava, avans)", eylem: 'Onay talebi taslağı', hedef: 'onay-kaydi', rol: 'A', oncelik: 3 })
    }
  }
  const arabYolu = yol === 'ARABULUCULUK_IIK67' || !!a
  if (arabYolu && (!a || !a.tur)) {
    out.push({ kod: 'AR-03', surum: 1, oneri: 'Arabuluculuk dava şartı mı? Seçin; belirsizse başvurun (tartışmalı)', eylem: 'Seç', hedef: 'arabuluculuk-tur', rol: 'A', oncelik: 4, etiket: 'teyit gerekli' })
  }
  // AR-04 · başvuru adımı TÜR SEÇİLMEDEN açılmaz (07 S26 kabul 3). "Belirsiz" seçildiyse başvuru önerilir: dava şartı
  // değilse bir şey kaybedilmez, dava şartıysa usulden ret önlenir (06 2(f)).
  if (yol === 'ARABULUCULUK_IIK67' && a?.tur && !a.basvuruTarihi && !g.davaVar) {
    const belirsiz = a.tur === 'BELIRSIZ'
    out.push({
      kod: 'AR-04', surum: 1,
      oneri: belirsiz ? 'Tür belirsiz: arabuluculuğa başvurun (dava şartı değilse kayıp yok, dava şartıysa usulden ret önlenir)' : 'Arabuluculuğa başvurun (bilgiler hazır)',
      eylem: 'Başvuru paketi', hedef: 'arabuluculuk-basvuru', rol: 'H', oncelik: 5, ...(belirsiz ? { etiket: 'teyit gerekli' } : {}),
    })
  }
  if (g.toplantilar.some((t) => t.durum === 'PLANLANDI' && gunNo(t.baslar) < gunNo(simdi))) {
    out.push({ kod: 'AR-05', surum: 1, oneri: 'Toplantı sonucunu girin', eylem: 'Sonuç gir', hedef: 'arabuluculuk-toplanti', rol: 'H', oncelik: 4 })
  }
  const surecBitti = !!a && (!!a.sonuc || g.davaVar || g.toplantilar.some((t) => t.durum === 'YAPILDI'))
  if (a && surecBitti && (!a.sonTutanakTarihi || !a.sonTutanakBelgeId)) {
    out.push({ kod: 'AR-06', surum: 1, oneri: 'Son tutanağı yükleyin (dava dilekçesine eklenecek)', eylem: 'Yükle', hedef: 'son-tutanak', rol: 'H', oncelik: 3 })
  }
  if (a?.onayAt && g.iik67YenidenOnayBekleyen > 0) {
    out.push({ kod: 'AR-07', surum: 1, oneri: 'İİK 67 son gününü yeniden onaylayın (durma eklendi)', eylem: 'Onayla', hedef: 'durma', rol: 'A+2', oncelik: 2, etiket: 'HUAK 18/A-15 · teyit gerekli' })
  }
  if (a?.onayAt && (a.sonuc === 'ANLASMA' || a.sonuc === 'KISMEN')) {
    // Sulh ve iskonto kararı müvekkilindir (06 2(f)): onay kaydı yoksa önce o istenir; sonra taksit/tahsil planı.
    const sulh = musteriOnayiKapisi('SULH_ISKONTO', g.onaylar, { simdi })
    out.push(sulh.acik
      ? { kod: 'AR-08', surum: 1, oneri: 'Anlaşma: taksit ya da tahsil planı kurun', eylem: 'Plan kur', hedef: 'taksit', rol: 'A', oncelik: 5 }
      : { kod: 'AR-08', surum: 1, oneri: 'Anlaşma müvekkil kararıdır: sulh/iskonto onay kaydını girin', eylem: 'Onay kaydı', hedef: 'onay-kaydi', rol: 'A', oncelik: 3 })
  }
  if (g.karsiTarafUyumsuz) {
    out.push({ kod: 'AR-09', surum: 1, oneri: 'Son tutanak ile itiraz eden borçlu farklı: kontrol edin', eylem: 'İncele', hedef: 'son-tutanak', rol: 'A', oncelik: 3 })
  }
  return out.sort((x, y) => x.oncelik - y.oncelik)
}
