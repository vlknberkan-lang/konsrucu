/**
 * KonsRücü — Görsel okuma istemi ve yanıt çözücü · lib/konsrucu/evrak-metin/ai-okuma-cozum.ts  (saf)
 *
 * ai-okuma.ts'in modele verdiği sabit talimat (kişisel veri içermez) ve modelin düz metin yanıtını çözen saf
 * fonksiyon. Yanıt biçimi araç çağrısı yerine düz metindir: her modelde (zorunlu araç seçimi olmayanlar dahil)
 * aynı çalışır ve uzun el yazısı dökümü JSON kaçışına takılmaz.
 *
 *   TUR: TUTANAK
 *   GUVEN: 0.9
 *   ---
 *   <belgenin metni>
 */
import type { BelgeKat } from '@/lib/konsrucu/belge-siniflandir'

export const OKUMA_TURLERI = [
  'TUTANAK', 'POLICE', 'EKSPERTIZ', 'DEKONT', 'LEHE', 'SBM', 'EHLIYET', 'RUHSAT', 'ALKOL', 'KIMLIK', 'HASAR_FOTO', 'DIGER',
] as const
export type OkumaTuru = typeof OKUMA_TURLERI[number]

/** Modelin türü → Belge.kategori (KIMLIK için ayrı kategori yok: Diğer + aiIzni YASAK). */
export const TUR_KATEGORI: Record<OkumaTuru, BelgeKat> = {
  TUTANAK: 'TUTANAK', POLICE: 'POLICE', EKSPERTIZ: 'EKSPERTIZ', DEKONT: 'DEKONT', LEHE: 'LEHE', SBM: 'SBM',
  EHLIYET: 'EHLIYET', RUHSAT: 'RUHSAT', ALKOL: 'ALKOL', KIMLIK: 'DIGER', HASAR_FOTO: 'HASAR_FOTO', DIGER: 'DIGER',
}

export const OKUMA_SISTEMI = `Sen bir Türk sigorta rücu dosyasının evrak okuyucususun. Sana tek bir taranmış belge görüntüsü ya da taranmış PDF verilir. İki iş yaparsın: belgenin türünü belirlersin ve belgedeki bütün yazıyı, EL YAZISI DAHİL, olduğu gibi metne çevirirsin. Yorum yapmazsın, özetlemezsin, bilgi uydurmazsın.

Türler:
- TUTANAK: Maddi Hasarlı Trafik Kazası Tespit Tutanağı (KTT), kaza tespit tutanağı, ifade ya da görgü tutanağı, polis/jandarma tutanağı
- POLICE: sigorta poliçesi
- EKSPERTIZ: ekspertiz / hasar tespit raporu
- DEKONT: ödeme dekontu, banka makbuzu, fatura
- LEHE: Lehe / hukuk devir formu, temlikname
- SBM: SBM / Tramer sorgu çıktısı
- EHLIYET: sürücü belgesi
- RUHSAT: araç tescil belgesi (ruhsat)
- ALKOL: alkol raporu ya da herhangi bir sağlık belgesi
- KIMLIK: nüfus cüzdanı, kimlik kartı, pasaport
- HASAR_FOTO: belge değil; araç, hasar, plaka ya da olay yeri fotoğrafı
- DIGER: yukarıdakilerin hiçbiri olmayan belge

Kurallar:
- EHLIYET, RUHSAT, ALKOL, KIMLIK ya da HASAR_FOTO ise METİN YAZMA; yalnız türü ve güveni ver (kişisel ve sağlık verisi saklanmaz).
- Öteki türlerde yazıyı eksiksiz aktar. Form alanlarını "Alan adı: değer" biçiminde, her alan ayrı satırda yaz.
- Kaza tespit tutanağında iki tarafı ayrı başlıkla yaz ("A ARACI" ve "B ARACI"): sürücünün adı soyadı, T.C. kimlik no, sürücü belgesi bilgileri, adresi, telefonu; aracın plakası, markası, işleteni/ruhsat sahibi; sigorta şirketi, poliçe no, acente. Kaza tarihi, saati, yeri (il, ilçe, mahalle/cadde). İşaretlenmiş kaza durumu kutucuklarının metnini yaz (yalnız işaretli olanları). Krokiyi bir iki cümleyle tarif et. Sürücülerin el yazısı beyanlarını kelimesi kelimesine aktar. İmzaların varlığını belirt.
- Rakamları (T.C. kimlik no, plaka, poliçe no, telefon, tutar, tarih) basamak basamak dikkatle oku.
- Okuyamadığın kısmı [okunamadı] ile işaretle; emin olmadığın okumanın sonuna [?] koy. Tahmin edip boşluk doldurma.

Yanıtın YALNIZ şu biçimde olsun, başka hiçbir şey yazma:
TUR: <türlerden biri>
GUVEN: <0 ile 1 arası sayı: türden ne kadar eminsin>
---
<belgenin metni; metin yazılmayacak türlerde boş bırak>`

export const OKUMA_TALIMATI = 'Bu belgenin türünü belirle ve yazısını istenen biçimde metne çevir.'

/** 1. aşama (ayırma): hızlı model, birden çok görsel tek istekte; yalnız tür. Talimat sabit, kişisel veri içermez. */
export const AYIRMA_SISTEMI = `Sen bir Türk sigorta rücu dosyasının evrak ayırıcısısın. Sana numaralı görseller verilir; her birinin türünü söylersin. Metin okumazsın, açıklama yazmazsın.
Türler: TUTANAK (kaza tespit tutanağı, ifade ya da görgü tutanağı), POLICE, EKSPERTIZ, DEKONT (dekont, makbuz, fatura), LEHE, SBM (SBM/Tramer çıktısı), EHLIYET, RUHSAT, ALKOL (alkol ya da sağlık raporu), KIMLIK (nüfus cüzdanı, kimlik kartı, pasaport), HASAR_FOTO (araç, hasar, plaka ya da olay yeri fotoğrafı; belge değil), DIGER (öteki belgeler).
Telefonla çekilmiş ya da ekran görüntüsü olarak alınmış belge de belgedir; türünü ver.
Her görsel için bir satır yaz, başka hiçbir şey yazma:
#<numara>: <TÜR>`

/** Ayırma yanıtını numara sırasıyla türlere çevirir; satırı olmayan ya da bilinmeyen tür null. */
export function ayirmaYanitCoz(yanit: string | null | undefined, adet: number): (OkumaTuru | null)[] {
  const out: (OkumaTuru | null)[] = Array.from({ length: adet }, () => null)
  for (const satir of (yanit ?? '').split(/\r?\n/)) {
    const m = satir.match(/^\s*#?\s*(\d+)\s*[:.)-]\s*\**\s*([A-Za-zÇĞİÖŞÜçğıöşü_]+)/u)
    if (!m) continue
    const i = Number(m[1])
    const tur = m[2].toUpperCase().replace(/İ/g, 'I').replace(/Ü/g, 'U')
    if (i >= 0 && i < adet && (OKUMA_TURLERI as readonly string[]).includes(tur)) out[i] = tur as OkumaTuru
  }
  return out
}

/** Metne çevrilmeyen türler: kişisel/sağlık verisi (KVKK) ya da belge olmayan fotoğraf. */
export const METINSIZ_TURLER: ReadonlySet<OkumaTuru> = new Set<OkumaTuru>(['EHLIYET', 'RUHSAT', 'ALKOL', 'KIMLIK', 'HASAR_FOTO'])

/** Modelin yanıtını çözer; biçim tutmazsa null. Bilinmeyen tür DIGER, bozuk güven 0.5 sayılır. */
export function gorselYanitCoz(yanit: string | null | undefined): { tur: OkumaTuru; guven: number; metin: string } | null {
  const s = (yanit ?? '').replace(/\r\n/g, '\n').trim()
  const turM = s.match(/^\s*T[UÜ]R\s*:\s*([A-ZÇĞİÖŞÜ_]+)/imu)
  if (!turM) return null
  const turHam = turM[1].toUpperCase().replace(/İ/g, 'I').replace(/Ü/g, 'U')
  const tur: OkumaTuru = (OKUMA_TURLERI as readonly string[]).includes(turHam) ? (turHam as OkumaTuru) : 'DIGER'
  const guvenM = s.match(/^\s*G[UÜ]VEN\s*:\s*([0-9]+(?:[.,][0-9]+)?)/imu)
  const g = guvenM ? Number(guvenM[1].replace(',', '.')) : NaN
  const guven = Number.isFinite(g) ? Math.min(1, Math.max(0, g > 1 && g <= 100 ? g / 100 : g)) : 0.5
  const ayrac = s.search(/^\s*-{3,}\s*$/m)
  const metin = ayrac >= 0 ? s.slice(ayrac).replace(/^\s*-{3,}\s*\n?/, '').trim() : ''
  return { tur, guven: Math.round(guven * 100) / 100, metin }
}

export type GorselOkumaOzeti = {
  /** KAPALI: görsel AI kapalı · YOK: bakılacak görüntü yok · TAMAM: okuma denendi */
  durum: 'KAPALI' | 'YOK' | 'TAMAM'
  /** 1. aşamada türüne bakılan görüntü sayısı. */
  bakilan: number
  okunan: number
  /** Okunanlardan tutanak (KTT, ifade, görgü) çıkanlar. */
  tutanak: number
  /** Belge değil, hasar fotoğrafı çıkıp o gruba taşınanlar. */
  fotoAyrilan: number
  /** Kimlik/ehliyet/ruhsat/sağlık: gönderilmeyen ya da metni yazılmayanlar. */
  kvkkAtlanan: number
  hatali: number
  /** Süre bütçesi yüzünden sıraya kalanlar (bir sonraki çalıştırmada okunur). */
  kalan: number
  hata: string | null
}

/** Aktivite ve kullanıcı mesajı için tek cümle (değer içermez). Okuma olmadıysa boş. */
export function gorselOkumaMetni(g: GorselOkumaOzeti | null | undefined): string {
  if (!g || g.durum !== 'TAMAM') return ''
  const p: string[] = []
  if (g.bakilan) p.push(`${g.bakilan} görüntüye bakıldı`)
  if (g.okunan) p.push(`${g.okunan} taranmış belge görsel yapay zekâyla okundu${g.tutanak ? ` (${g.tutanak} tutanak)` : ''}`)
  if (g.fotoAyrilan) p.push(`${g.fotoAyrilan} görüntü hasar fotoğrafı çıktı`)
  if (g.kvkkAtlanan) p.push(`${g.kvkkAtlanan} kimlik/sağlık belgesinin metni KVKK gereği yazılmadı`)
  if (g.hatali) p.push(`${g.hatali} belge okunamadı`)
  if (g.kalan) p.push(`${g.kalan} belge sırada (tekrar çalıştırın)`)
  if (g.hata) p.push(`görsel okuma durdu: ${g.hata}`)
  return p.join(', ')
}
