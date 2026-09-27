/**
 * KonsRücü — müvekkile gidecek yazıların TASLAĞI (yapay zekâsız) · lib/konsrucu/arabuluculuk/bildirim-taslak.ts
 *
 * Onay talebi (AR-02), arabuluculuk sonucu, karar ve tahsilat bildirimleri (SN-08) sabit şablondan kurulur.
 * Program hiçbir şeyi GÖNDERMEZ: avukat taslağı kopyalar, kendi kanalından elle gönderir ve "gönderildi" diye
 * işaretler. Kişisel veri (TCKN, telefon, IBAN) şablona girmez; borçlular sıra numarasıyla anılır.
 */
import { ARABULUCULUK_SONUC_ETIKET, ITIRAZ_SONRASI_ETIKET, KARAR_SONRASI_ETIKET, ONAY_TUR_ETIKET, type ArabuluculukSonucu, type ItirazSonrasiYol, type KararSonrasiYol, type OnayTuru } from './sabitler'
import { trGun } from './tarih'

const para = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' TL'

export type TaslakKunye = {
  musteriUnvani: string | null
  hukukDosyaNo: string | null
  hasarDosyaNo: string | null
  icraDairesi: string | null
  icraEsas: string | null
}

function baslik(k: TaslakKunye, konu: string): string[] {
  return [
    `Sayın ${k.musteriUnvani ?? 'Müvekkilimiz'} Rücu Birimi,`,
    '',
    `Konu: ${konu}`,
    `Dosya: ${[k.hukukDosyaNo && `hukuk no ${k.hukukDosyaNo}`, k.hasarDosyaNo && `hasar no ${k.hasarDosyaNo}`, k.icraDairesi, k.icraEsas].filter(Boolean).join(' · ') || '—'}`,
    '',
  ]
}

const IMZA = ['', 'Onayınızı ya da talimatınızı bu yazıya yanıt olarak iletmenizi rica ederiz.', '', 'Saygılarımızla,', '[Vekil]']

/** AR-02 · onay talebi taslağı (yol seçimine göre). */
export function onayTalebiTaslagi(p: {
  kunye: TaslakKunye
  onayTuru: OnayTuru
  yol?: ItirazSonrasiYol | KararSonrasiYol | null
  gerekce?: string | null
  takipToplam?: number | null
  itirazEdilen?: number | null
  ekonomi?: { harc?: string | null; avans?: string | null; hacizSonucu?: string | null; malvarligi?: string | null } | null
  ihtiyatliSonGun?: Date | null
}): string {
  const yolEt = p.yol ? (ITIRAZ_SONRASI_ETIKET as Record<string, string>)[p.yol] ?? (KARAR_SONRASI_ETIKET as Record<string, string>)[p.yol] ?? p.yol : null
  const e = p.ekonomi ?? {}
  return [
    ...baslik(p.kunye, `${ONAY_TUR_ETIKET[p.onayTuru]} için onay talebi`),
    yolEt ? `Önerdiğimiz yol: ${yolEt}.` : '',
    p.gerekce ? `Gerekçe: ${p.gerekce}` : '',
    p.takipToplam != null ? `Takip toplamı: ${para(p.takipToplam)}.` : '',
    p.itirazEdilen != null ? `İtiraz edilen tutar: ${para(p.itirazEdilen)}.` : '',
    e.harc ? `Tahmini harç: ${e.harc}.` : '',
    e.avans ? `Tahmini gider avansı: ${e.avans}.` : '',
    e.hacizSonucu ? `Haciz sonucu: ${e.hacizSonucu}.` : '',
    e.malvarligi ? `Borçlu malvarlığı: ${e.malvarligi}.` : '',
    p.ihtiyatliSonGun ? `Süre: İİK 67 için ihtiyatlı son gün ${trGun(p.ihtiyatliSonGun)} (teyit gerekli). Bu tarihten önce talimatınıza ihtiyacımız var.` : '',
    ...IMZA,
  ].filter((s, i, a) => s !== '' || (i > 0 && a[i - 1] !== '')).join('\n')
}

/** Süre koruma istisnasıyla açılan dava için müvekkile bildirim taslağı (açık karar 4). */
export function istisnaBildirimTaslagi(p: { kunye: TaslakKunye; ihtiyatliSonGun: Date | null; gerekce: string }): string {
  return [
    ...baslik(p.kunye, 'Süreyi korumak için dava açma kararı hakkında bilgilendirme'),
    `İİK 67 için ihtiyatlı son gün ${trGun(p.ihtiyatliSonGun)} (teyit gerekli) yaklaştığından ve onayınız henüz ulaşmadığından, hak kaybını önlemek amacıyla dava hazırlığına başlanmıştır.`,
    `Gerekçe: ${p.gerekce}`,
    'Davanın açılması ya da açılmaması konusundaki talimatınızı en kısa sürede iletmenizi rica ederiz.',
    '',
    'Saygılarımızla,',
    '[Vekil]',
  ].join('\n')
}

/** SN-08 · arabuluculuk sonucu bildirimi. */
export function arabuluculukSonucBildirimi(p: { kunye: TaslakKunye; sonuc: ArabuluculukSonucu; sonTutanakTarihi: Date; sonrakiAdim?: string | null }): string {
  return [
    ...baslik(p.kunye, 'Arabuluculuk sonucu'),
    `Arabuluculuk süreci ${trGun(p.sonTutanakTarihi)} tarihli son tutanakla "${ARABULUCULUK_SONUC_ETIKET[p.sonuc]}" olarak sonuçlanmıştır.`,
    p.sonuc === 'KISMEN' ? 'Anlaşılamayan kalemler için dava yolu açıktır; dava yalnız anlaşılamayan kalemle sınırlı olacaktır.' : '',
    p.sonrakiAdim ? `Önerdiğimiz sonraki adım: ${p.sonrakiAdim}` : '',
    ...IMZA,
  ].filter(Boolean).join('\n')
}

/** SN-08 · karar bildirimi. */
export function kararBildirimi(p: {
  kunye: TaslakKunye
  mahkeme: string | null
  esas: string | null
  kararTarihi: Date | null
  hukum: string | null
  kabulAsil: number | null
  davaDegeri: number | null
  aleyheVekalet: number | null
  aleyheGider: number | null
}): string {
  const hukumEt: Record<string, string> = { KABUL: 'davanın kabulüne', KISMEN_KABUL: 'davanın kısmen kabulüne', RET: 'davanın reddine', DIGER: 'diğer' }
  return [
    ...baslik(p.kunye, 'Dava kararı hakkında bilgilendirme'),
    `${p.mahkeme ?? 'Mahkeme'} ${p.esas ?? ''} esas sayılı dosyada ${trGun(p.kararTarihi)} tarihinde ${hukumEt[p.hukum ?? ''] ?? 'karar'} karar verilmiştir.`,
    p.kabulAsil != null ? `Kabul edilen asıl alacak: ${para(p.kabulAsil)}${p.davaDegeri != null ? ` (dava değeri ${para(p.davaDegeri)})` : ''}.` : '',
    p.aleyheVekalet ? `Aleyhimize hükmedilen vekâlet ücreti: ${para(p.aleyheVekalet)} (ödeme kaydı gerekir).` : '',
    p.aleyheGider ? `Aleyhimize hükmedilen yargılama gideri: ${para(p.aleyheGider)}.` : '',
    'Kanun yoluna başvuru ya da takibe devam konusundaki talimatınızı bekliyoruz. Kanun yolu süresi gerekçeli kararın tebliğinden itibaren işler (teyit gerekli).',
    ...IMZA,
  ].filter(Boolean).join('\n')
}

/** SN-08 · tahsilat bildirimi (yalnız ONAYLI UYAP "Yatan Para" farkı). */
export function tahsilatBildirimi(p: { kunye: TaslakKunye; tutar: number; gorulmeTarihi: Date | null; toplamTahsil: number }): string {
  return [
    ...baslik(p.kunye, 'Tahsilat bilgilendirmesi'),
    `İcra dosyasına ${para(p.tutar)} tutarında tahsilat yatırıldığı ${trGun(p.gorulmeTarihi)} tarihinde UYAP hesap özetinde görülmüştür (hukuki tahsil tarihi değildir).`,
    `Dosyadaki onaylı toplam tahsilat: ${para(p.toplamTahsil)}.`,
    '',
    'Saygılarımızla,',
    '[Vekil]',
  ].join('\n')
}
