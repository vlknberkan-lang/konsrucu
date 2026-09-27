/**
 * KonsRücü — karar kartı ve kanun yolu (S31) · lib/konsrucu/dava/karar.ts (saf)
 *
 * 06 2(j): karar okuma YALNIZ öneri üretir; karar kolonlarına avukat onayıyla yazılır. Kod, hüküm fıkrasındaki
 * rakamları dava değeri ve takip talebiyle KARŞILAŞTIRIR:
 *  - Kabul edilen tutar dava değerini aşıyorsa kırmızı (talebe bağlılık, HMK 26 · teyit gerekli).
 *  - Kısmi kabul → "Takibi kabul edilen kısımla daraltın (teyit gerekli)" (SN-03).
 *  - Aleyhe vekâlet ücreti/yargılama gideri → ödeme kaydı istenir, müvekkile bildirilir.
 * Karar onaylanınca açılan adımlar: takibe devam talebi, istinaf (gerekçeli karar tebliğinden; tebliğ yoksa
 * TETİK BEKLİYOR), İİK 78'in kalan süresi, müvekkil bildirim taslağı (SN-08). Kesinlik sınırı için parasal sınır
 * tablosu burada YOK: yalnız "kontrol edin" notu (HMK 341 · teyit gerekli) — sınır uydurulmaz.
 */
import { gunEkle } from '../arabuluculuk/tarih'

export type KararGirdi = {
  hukum: string | null
  kabulAsil: number | null
  davaDegeri: number | null
  takipToplam: number | null
  kararTarihi: Date | null
  vekaletUcretiAleyhe: number | null
  yargilamaGideriAleyhe: number | null
  vekaletUcretiYon: string | null
  inkarTazminatiYon: string | null
}

export type KararUyari = { kod: string; seviye: 'KIRMIZI' | 'SARI' | 'BILGI'; mesaj: string }

export function kararKontrol(k: KararGirdi, simdi: Date = new Date()): KararUyari[] {
  const u: KararUyari[] = []
  if (!k.hukum) u.push({ kod: 'KR-HUKUM', seviye: 'KIRMIZI', mesaj: 'Hüküm seçilmedi.' })
  if (!k.kararTarihi) u.push({ kod: 'KR-TARIH', seviye: 'KIRMIZI', mesaj: 'Karar tarihi girilmedi.' })
  else if (k.kararTarihi.getTime() > simdi.getTime() + 86_400_000) u.push({ kod: 'KR-TARIH', seviye: 'KIRMIZI', mesaj: 'Karar tarihi ileri bir gün olamaz.' })
  if (k.kabulAsil != null && k.davaDegeri != null && k.kabulAsil - k.davaDegeri > 0.005) {
    u.push({ kod: 'KR-TALEBE-BAGLILIK', seviye: 'KIRMIZI', mesaj: 'Kabul edilen tutar dava değerini aşıyor: talebe bağlılık (HMK 26 · teyit gerekli). Kararı ve girdiyi kontrol edin.' })
  }
  if (k.kabulAsil != null && k.takipToplam != null && k.kabulAsil - k.takipToplam > 0.005) {
    u.push({ kod: 'KR-TAKIP-ASIMI', seviye: 'SARI', mesaj: 'Kabul edilen tutar takip talebi toplamını aşıyor: kontrol edin.' })
  }
  if (k.hukum === 'KABUL' && k.kabulAsil != null && k.davaDegeri != null && k.davaDegeri - k.kabulAsil > 0.005) {
    u.push({ kod: 'KR-KABUL-EKSIK', seviye: 'SARI', mesaj: 'Hüküm "kabul" ama kabul edilen tutar dava değerinden az: kısmen kabul olabilir.' })
  }
  if (k.hukum === 'KISMEN_KABUL') u.push({ kod: 'SN-03', seviye: 'SARI', mesaj: 'Kısmi kabul: takibi kabul edilen kısımla daraltın (teyit gerekli).' })
  if ((k.vekaletUcretiAleyhe ?? 0) > 0 || (k.yargilamaGideriAleyhe ?? 0) > 0 || k.vekaletUcretiYon === 'ALEYHE' || k.vekaletUcretiYon === 'IKI_YONLU') {
    u.push({ kod: 'KR-ALEYHE', seviye: 'SARI', mesaj: 'Aleyhe vekâlet ücreti ya da yargılama gideri var: ödeme kaydı girin ve müvekkile bildirin.' })
  }
  u.push({ kod: 'SN-05', seviye: 'BILGI', mesaj: 'Kesinlik sınırı: karar parasal sınırın altında kalıyorsa kesin olabilir (HMK 341 · sınır yıllık, tablo teyit gerekli).' })
  return u
}

export type KararSonrasiAdim = { kod: string; baslik: string; durum: 'ACIK' | 'TETIK_BEKLIYOR' | 'BILGI'; aciklama: string; onayGerekir?: 'KANUN_YOLU' }

/** Karar onayından sonra açılan adımlar. */
export function kararSonrasiAdimlar(d: { hukum: string | null; gerekceliTebligTarihi: Date | null; kesinlesmeTarihi: Date | null; rolumuz: string }): KararSonrasiAdim[] {
  const a: KararSonrasiAdim[] = []
  if (d.rolumuz === 'DAVACI' && (d.hukum === 'KABUL' || d.hukum === 'KISMEN_KABUL')) {
    a.push({ kod: 'TAKIBE_DEVAM', baslik: 'Takibe devam talebi', durum: 'ACIK', aciklama: 'İtirazın iptali kararıyla takibe devam istenebilir; kesinleşmenin beklenip beklenmeyeceği teyit gerekli.' })
  }
  if (d.hukum === 'KISMEN_KABUL') a.push({ kod: 'SN-03', baslik: 'Takibi daralt', durum: 'ACIK', aciklama: 'Takibi kabul edilen kısımla daraltın (teyit gerekli).' })
  a.push({
    kod: 'ISTINAF',
    baslik: 'İstinaf değerlendirmesi',
    durum: d.gerekceliTebligTarihi ? 'ACIK' : 'TETIK_BEKLIYOR',
    aciklama: d.gerekceliTebligTarihi ? 'Süre gerekçeli karar tebliğinden işler (HMK 345 · teyit gerekli). Kanun yolu kararı müvekkilindir.' : 'Gerekçeli karar tebliği bekleniyor: süre tebliğle başlar (HMK 345 · teyit gerekli).',
    onayGerekir: 'KANUN_YOLU',
  })
  if (d.rolumuz === 'DAVACI') a.push({ kod: 'IIK78', baslik: 'İİK 78 kalan süresi', durum: 'BILGI', aciklama: 'İtiraz ve dava sırasında geçen süre haciz isteme süresine sayılmaz; kalan süreyi süre defterinde kontrol edin (İİK 78/2 · teyit gerekli).' })
  a.push({ kod: 'SN-08', baslik: 'Müvekkil bildirim taslağı', durum: 'ACIK', aciklama: 'Kararı müvekkile bildirin (taslak hazır; gönderim elle ve avukat onayıyla).' })
  if (!d.kesinlesmeTarihi) a.push({ kod: 'KESINLESME', baslik: 'Kesinleşme', durum: 'BILGI', aciklama: 'Kesinleşme şerhi yok: dosya "kesinleşti" gösterilmez.' })
  return a
}

/**
 * İstinaf süresi önerisi: gerekçeli karar tebliğinden 2 hafta (HMK 345 · teyit gerekli). İhtiyatlı: tatil uzatması yok.
 * Kesinleştirmez; Sure satırına `onerilenIhtiyatli` olarak yazılır, avukat onaylar.
 */
export function istinafSureOnerisi(tebligTarihi: Date): { onerilenIhtiyatli: Date; dayanak: string; hesapIzi: Record<string, unknown> } {
  return {
    onerilenIhtiyatli: gunEkle(tebligTarihi, 14),
    dayanak: 'HMK 345 (teyit gerekli)',
    hesapIzi: { kural: 'gerekçeli karar tebliği + 2 hafta', tatilUzatmasi: 'uygulanmadı (ihtiyatlı)', not: 'teyit gerekli' },
  }
}
