/**
 * KonsRücü — Öneri kartı tipleri · lib/konsrucu/oneri/tipler.ts  (yalnız tip; client-safe)
 *
 * Sunucudaki yükleyici (yukle.ts) bu şekilleri kurar; istemci bileşenleri (components/dosya/oneri/*) yalnız bunları
 * okur. Kişisel veriler (plaka, alıntıdaki TCKN/telefon/IBAN) sunucuda maskelenmiş gelir; ham değer ancak
 * "Göster" eylemiyle ve Aktivite kaydıyla açılır.
 */
import type { AlanDurumu, AlanTipi, KaynakTuru } from './alanlar'
import type { AsgariSetOgesi, EvrakTuru, GsRejimSonucu, RucuSebebiKodu } from '@/lib/konsrucu/rucu-sebebi'

/** Yazılacak yeni öneri (kural, Hugo, Excel, UYAP ya da AI kaynaklı). */
export type YeniOneri = {
  alan: string
  deger: unknown
  kaynakTuru: KaynakTuru
  kaynakBelgeId?: string | null
  sayfa?: number | null
  alinti?: string | null
  guven?: number | null
  /** Model + prompt sürümü ya da kural kodu ("KURAL:DEKONT@1", "HUGO:RUCU_NEDENI@1"). */
  uretici?: string | null
}

export type KullaniciYetkisi = {
  /** Öneriyi reddedebilir, kritik olmayanı onaylayabilir (AVUKAT_YRD dahil). */
  duzenleyebilir: boolean
  /** Kritik alanı onaylar, rücu sebebi ve yetkili icrayı seçer (AVUKAT, ADMIN). */
  kararVerebilir: boolean
}

export type OneriGorunum = {
  id: string
  alan: string
  durum: AlanDurumu
  /** Ekranda gösterilen (gerekirse maskeli) değer metni. */
  deger: string
  /** Değer maskeli mi? ("Göster" düğmesi yalnız bunda) */
  maskeli: boolean
  kaynakTuru: KaynakTuru
  kaynakEtiketi: string
  belgeId: string | null
  belgeAdi: string | null
  /** Belge önizlemede açılabilir mi (Storage'da baytı var mı)? */
  belgeAcilabilir: boolean
  sayfa: number | null
  /** Maskelenmiş alıntı (en çok 300 karakter). */
  alinti: string | null
  alintiDurumu: 'DOGRU' | 'KAYNAKSIZ' | 'YOK'
  guven: number | null
  uretici: string | null
  createdAt: string
  onaylayanAd: string | null
  onayAt: string | null
  /** Onaylı değerle aynı mı (yalnız ONERI satırlarında anlamlı). */
  onayliylaAyni: boolean
  /** Toplu onaya uygun mu (karar.ts · topluOnayUygunMu). */
  topluUygun: boolean
  /** Bu kullanıcı onaylayabilir mi? */
  onaylayabilir: boolean
  /**
   * Düzeltme girdisinin başlangıç değerleri: `deger` (para "1234,56", tarih "YYYY-MM-DD", metin; ödemede tutar),
   * `tarih` (yalnız ödemede). Maskeli alanda ikisi de boştur (ham değer istemciye gitmez).
   */
  duzelt: { deger: string; tarih: string }
}

export type AlanSatiri = {
  alan: string
  etiket: string
  tip: AlanTipi
  kritik: boolean
  karar: boolean
  onayli: OneriGorunum | null
  oneriler: OneriGorunum[]
  /** Aynı alanda farklı değerli öneriler ya da onaylıdan farklı öneri. */
  celiski: boolean
}

export type Engel = { tur: 'BIN_KAT' | 'CELISKI'; baslik: string; aciklama: string; alan?: string }

export type BulduklarimizVerisi = {
  dosyaId: string
  yetki: KullaniciYetkisi
  /** AI çıkarım yüzeyi açık mı (kapalıyken kart yalnız KURAL ve HUGO ile dolar — Varyant B). */
  aiAcik: boolean
  satirlar: AlanSatiri[]
  engeller: Engel[]
  bekleyen: number
  kritikBekleyen: number
  kaynaksiz: { alan: string; etiket: string }[]
  topluUygunIds: string[]
}

export type RucuSebebiSecenegi = {
  kod: RucuSebebiKodu
  ad: string
  k1Etiketi: string
  bransUygun: boolean
  /** GŞ-DİĞER ve OD-DİĞER gibi "diğer" kodlarında avukat gerekçesi zorunlu (RucuSebebiTanimi.gerekceZorunlu). */
  gerekceZorunlu: boolean
}

export type RucuSebebiVerisi = {
  dosyaId: string
  yetki: KullaniciYetkisi
  /** Hugo "Rücu Nedeni" ham metni (RucuDosyasi.rucuSebebi; kişisel veri değil). */
  hugoHam: string | null
  brans: string | null
  onayli: { id: string; kod: RucuSebebiKodu; ad: string; k1Etiketi: string; teyitGerekli: boolean; onaylayanAd: string | null } | null
  /** Bekleyen kod önerileri (Hugo ya da diğer kaynak). */
  oneriler: { id: string; kod: RucuSebebiKodu; ad: string; kaynakEtiketi: string; guven: number | null; k1Etiketi: string }[]
  /** Hugo metninden kod önerilemediyse adaylar ve gerekçe. */
  hugoAdaylar: RucuSebebiKodu[]
  hugoGerekce: string | null
  secenekler: RucuSebebiSecenegi[]
  gsRejimi: GsRejimSonucu
  dayanaklar: { etiket: string; not?: string }[]
  notlar: string[]
  ev07: { gerekli: boolean; teyitGerekli: boolean; metin: string }
}

export type EksikEvrakVerisi = {
  dosyaId: string
  yetki: KullaniciYetkisi
  /** Rücu sebebi seçilmemişse null: liste yerine "önce rücu sebebini seçin". */
  kod: RucuSebebiKodu | null
  kodAd: string | null
  /** Onaylı değil, öneriden gelen kodla hesaplandıysa true ("öneriye göre"). */
  oneriyeGore: boolean
  k1Etiketi: string | null
  ogeler: (AsgariSetOgesi & { tur: EvrakTuru })[]
  eksikSayisi: number
  kontrolSayisi: number
  /** Ray'e istek taslağı (eksik ve Ray'den istenecek evrak varsa). */
  rayTaslagi: { konu: string; govde: string; mailto: string } | null
}

export type YetkiliIcraSecenekGorunum = {
  anahtar: string
  secenek: 'KAZA_YERI' | 'YERLESIM_YERI'
  icraDairesi: string
  baslik: string
  gerekce: string
  dayanak: string
  borcluId: string | null
}

export type YetkiliIcraVerisi = {
  dosyaId: string
  yetki: KullaniciYetkisi
  secenekler: YetkiliIcraSecenekGorunum[]
  uyarilar: string[]
  onayli: { id: string; icraDairesi: string; secenek: string; gerekce: string | null; onaylayanAd: string | null; onayAt: string | null } | null
  /** Eski kolondaki onaysız değer (ör. eski AI çıkarımının yazdığı) — yalnız bilgi. */
  eskiDeger: string | null
}

/** "Yapay zekâ çıkarımı" kartı: çalıştırma düğmesi + son çıkarımın özeti (cikarimJson; metinler maskeli). */
export type AiCikarimVerisi = {
  dosyaId: string
  yetki: KullaniciYetkisi
  /** AI çıkarım yüzeyi açık mı. Kapalıyken düğme yalnız kural ve Excel önerilerini üretir. */
  aiAcik: boolean
  /** Görsel okuma açık mı (AI_GORSEL): taranmış belgeler düğmeyle görsel yapay zekâyla okunur. */
  gorselAcik: boolean
  /** Metni okunmuş belge sayısı (yapay zekânın okuyabileceği). */
  metinliBelge: number
  /** Metni olmayan, henüz incelenmemiş belge. Görsel AI açıkken bütün görüntü ve PDF'ler (düğme hepsine bakar);
   *  kapalıyken yalnız fotoğraf dışı olanlar (taranmış görüntü, ör. el yazılı tutanak). */
  metinsizBelge: number
  /** Son başarılı yapay zekâ çıkarımı (eski ya da yeni ekrandan). */
  sonCalisma: { at: string; kim: string | null } | null
  olayTuru: string | null
  yol: string | null
  yolGuven: number | null
  olayBaglami: string | null
  ozet: string | null
  teyitler: { tip: 'oneri' | 'uyari' | 'ok'; not: string }[]
  sonrakiAdimlar: string[]
}

export type HapBorclu = {
  id: string
  adUnvan: string
  /** Maskeli T.C./VKN (ör. •••••••••92) ya da null. */
  kimlik: string | null
  rol: string
  kaynak: string | null
  teyit: 'TEYIT_EDILDI' | 'TEYIT_GEREK' | 'SUPHE'
}

/** "Hap bilgiler" kartı (lib/konsrucu/oneri/hap.ts): tek son kontrolün ön görünümü. Alan satırları Bulduklarımız'dan. */
export type HapVerisi = {
  dosyaId: string
  yetki: KullaniciYetkisi
  /** Son "Hap bilgileri kontrol ettim" (cikarimJson.onay). */
  kontrol: { kim: string | null; tarih: string | null } | null
  borclular: HapBorclu[]
  /** Onaylı değeri olmayan, farklı değerli önerisi olan alanlar (seçim ister). */
  celiskiAlanlar: string[]
  /** Seçilmemiş seçim alanlarının etiketleri (rücu sebebi, yetkili icra). */
  eksikSecim: string[]
  /** Kontrol isteyen ödeme önerisi id → gerekçe (kartta işaretsiz gelir). */
  odemeSuphe: Record<string, string>
  /** Onaylı yetkili icra dairesi (Bulduklarımız'da gösterilmez; kendi seçicisi var). */
  yetkiliIcra: string | null
  /** Düğmeye basınca onaylanacak bilgi sayısı (ödemeler dahil, işaretsizler hariç). */
  onaylanacak: number
}

export type OneriPaneli = {
  aiCikarim: AiCikarimVerisi
  hap: HapVerisi
  bulduklarimiz: BulduklarimizVerisi
  rucuSebebi: RucuSebebiVerisi
  eksikEvrak: EksikEvrakVerisi
  yetkiliIcra: YetkiliIcraVerisi
}
