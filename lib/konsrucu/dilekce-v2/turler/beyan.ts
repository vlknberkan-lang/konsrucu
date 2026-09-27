/**
 * KonsRücü — Beyan dilekçesi: hedef belgenin SONUÇ bölümü çıkarımı · lib/konsrucu/dilekce-v2/turler/beyan.ts (saf)
 *
 * S39 (06 §5.7-4; B40): "Bölüm çıkarıcı: uzun belgelerde 'SONUÇ / KANAAT / NETİCE-İ TALEP / HÜKÜM' bölümleri
 * ayrı yakalanır. Bilirkişi raporunun sonu kesilmez." Bu saf fonksiyon, belge bağlamı bütçesi aşıldığında
 * (belge-baglami.ts · belgeBaglamiKur) hedef belgenin (bilirkişi raporu, ara karar) SONUÇ bölümünü, belgenin
 * geri kalanı kısaltılsa bile bağlama tam olarak eklemek için kullanılır: rapor sonu genelde en son sayfadadır
 * ve bugüne kadarki "baştan kes" davranışı bu bölümü kaybediyordu.
 *
 * Enjeksiyon notu (06 §5.7-6, B56): bu fonksiyon metni yalnız VERİ olarak işler — "SONUÇ" ya da "KANAAT" gibi
 * bir başlığın hemen ardından karşı tarafın ya da bilirkişinin yazdığı herhangi bir ifade (bir talimat cümlesi
 * dâhil) hiçbir şekilde yorumlanmaz, çalıştırılmaz; olduğu gibi gövdeye kopyalanır.
 */

export type SonucBolumu = {
  bulunduMu: boolean
  /** Eşleşen başlığın kendisi (ör. "SONUÇ VE KANAAT"), yoksa null. */
  baslik: string | null
  /** Başlıktan (başlık dahil) metnin sonuna kadar olan gövde; bulunamadıysa boş metin. */
  govde: string
  /** Bölümün orijinal metindeki başlangıç indeksi; bulunamadıysa null. */
  baslangic: number | null
}

/**
 * Rapor/karar sonu bölüm başlıkları: satırın (neredeyse) tamamını tek başına kaplayan "SONUÇ", "SONUÇ VE
 * KANAAT", "KANAATİMİZ", "NETİCE-İ TALEP", "NETİCE VE TALEP" ya da "HÜKÜM" ifadesi. Yalnızca satır başı –
 * satır sonu eşleşir; bir cümlenin ortasında geçen "…sonuç olarak…" gibi ifadeler yakalanmaz.
 */
const BASLIK_RE = /^[ \t]*((?:SONUÇ|SONUC)(?:\s+VE\s+KANAAT(?:İMİZ|IMIZ)?)?|KANAAT(?:İMİZ|IMIZ)?|NETİCE[-\s]*İ?\s*TALEP|NETİCE\s+VE\s+TALEP|HÜKÜM)\s*:?[ \t]*$/iu

/**
 * Metindeki SON eşleşen SONUÇ/KANAAT/NETİCE-İ TALEP/HÜKÜM başlığından itibaren metnin sonuna kadar olan
 * bölümü döndürür. Rapor sonu genelde en son sayfadadır; belgede birden çok aday satır varsa (ör. içindekiler
 * listesinde geçen "SONUÇ" satırı) metnin SONUNA en yakın olan esas alınır. Hiç eşleşme yoksa `bulunduMu:
 * false` döner; çağıran o zaman eski (baştan kısaltma) davranışına düşer.
 */
export function sonucBolumunuCikar(metin: string): SonucBolumu {
  const satirlar = metin.split(/\r?\n/)
  const konumlar: number[] = []
  let konum = 0
  for (const s of satirlar) {
    konumlar.push(konum)
    konum += s.length + 1 // '\n' ile bölündüğü için +1 (son satırda fazladan sayılsa da kullanılmıyor)
  }
  let sonIndeks = -1
  let sonBaslik: string | null = null
  satirlar.forEach((satir, i) => {
    const m = BASLIK_RE.exec(satir)
    if (m) { sonIndeks = i; sonBaslik = m[1].trim() }
  })
  if (sonIndeks < 0) return { bulunduMu: false, baslik: null, govde: '', baslangic: null }
  const baslangic = konumlar[sonIndeks]
  return { bulunduMu: true, baslik: sonBaslik, govde: metin.slice(baslangic).trim(), baslangic }
}
