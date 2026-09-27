/**
 * KonsRücü — Yapay zekâya gidebilecek görsel adayları · lib/ai/gorsel-aday.ts (saf)
 *
 * S02 (F4; B14) ve 06, 5.5: görüntü MASKELENEMEZ; görsel AI'a giden her sayfa ham kişisel verinin
 * aktarımıdır. Bu yüzden:
 *  - sağlık ve kimlik görselleri (alkol/promil raporu ve bütün sağlık belgeleri, ehliyet, ruhsat, kimlik)
 *    HİÇBİR ZAMAN aday olmaz — kategori ya da dosya adı bunu gösteriyorsa;
 *  - öteki görseller yalnız görsel AI açıkken (AI_GORSEL=acik, açık karar 1c) gönderilebilir.
 * Seçim saf: indirme/çağrı yapmaz; çağıran "0 görsel gönderildi (N görsel KVKK nedeniyle atlandı)"
 * satırını buradan kurar. YASAK listesinin tamlığı açık karar 1c'de Yelda'nın teyidine bağlıdır.
 */
import { trSade } from '@/lib/konsrucu/belge-siniflandir'

/** Kategorisi yüzünden hiçbir zaman AI'a gitmeyen belgeler (aiIzni = YASAK). */
export const HASSAS_KATEGORILER = new Set(['ALKOL', 'EHLIYET', 'RUHSAT'])

// Dosya adında (sadeleştirilmiş) sağlık / kimlik belgesi işareti. Yanlış sınıflanmış (DIGER, HASAR_FOTO)
// belge de yakalanır. Kasıtlı olarak geniş: yanlış pozitif yalnız bir görselin gönderilmemesidir.
const HASSAS_AD = /\b(alkol|promil|kan ornegi|saglik|hastane|epikriz|tahlil|recete|adli tip|darp|doktor raporu|hekim|muayene|ehliyet|surucu belge|ruhsat|tescil belge|kimlik|nufus|tc kimlik|tckn|pasaport|ikametgah)/

const RESIM_UZANTI = /\.(jpe?g|png|webp|gif|heic)$/i

export type GorselAdayGirdi = { kategori: string; dosyaAdi: string; storagePath?: string | null }
export type GorselAdaySonuc<T> = {
  /** Gönderilebilecek görseller (görsel AI kapalıysa her zaman boş). */
  gonderilecek: T[]
  /** Sağlık/kimlik görseli — hiçbir koşulda gönderilmez. */
  hassas: T[]
  /** Görsel AI kapalı olduğu için gönderilmeyen öteki görseller. */
  kapali: T[]
}

/** Belge sağlık ya da kimlik görseli mi (kategori veya dosya adından)? */
export function hassasGorselMi(b: GorselAdayGirdi): boolean {
  if (HASSAS_KATEGORILER.has(b.kategori)) return true
  return HASSAS_AD.test(trSade(b.dosyaAdi)) || HASSAS_AD.test(trSade(b.storagePath ?? ''))
}

/** Belge bir görsel adayı mı (bayt deposunda duran görüntü)? `kategoriler` verilirse yalnız onlar. */
export function gorselMi(b: GorselAdayGirdi, kategoriler?: ReadonlySet<string>): boolean {
  if (!b.storagePath) return false
  if (kategoriler) return kategoriler.has(b.kategori)
  return b.kategori === 'HASAR_FOTO' || RESIM_UZANTI.test(b.storagePath) || RESIM_UZANTI.test(b.dosyaAdi)
}

/**
 * Görsel adaylarını üçe ayırır. `gorselAcik` = görsel AI kapısı (bayrak) VE yüzeyin görsel kullanma izni.
 * `enFazla` yalnız gönderilecekleri sınırlar.
 */
export function gorselAdaylari<T extends GorselAdayGirdi>(
  belgeler: readonly T[],
  o: { gorselAcik: boolean; kategoriler?: ReadonlySet<string>; enFazla?: number },
): GorselAdaySonuc<T> {
  const sonuc: GorselAdaySonuc<T> = { gonderilecek: [], hassas: [], kapali: [] }
  for (const b of belgeler) {
    if (!gorselMi(b, o.kategoriler)) continue
    if (hassasGorselMi(b)) sonuc.hassas.push(b)
    else if (!o.gorselAcik) sonuc.kapali.push(b)
    else sonuc.gonderilecek.push(b)
  }
  if (o.enFazla != null) sonuc.gonderilecek = sonuc.gonderilecek.slice(0, o.enFazla)
  return sonuc
}

/** Aktivite satırı: "0 görsel gönderildi (2 görsel KVKK nedeniyle atlandı)". Aday yoksa boş. */
export function gorselAktiviteMetni(s: GorselAdaySonuc<unknown>, gonderilen = 0): string {
  const atlanan = s.hassas.length + s.kapali.length
  if (!atlanan && !gonderilen) return ''
  return `${gonderilen} görsel gönderildi` + (atlanan ? ` (${atlanan} görsel KVKK nedeniyle atlandı)` : '')
}
