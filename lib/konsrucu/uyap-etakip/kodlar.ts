/**
 * KonsRücü — UYAP e-Takip XML kod tabloları · lib/konsrucu/uyap-etakip/kodlar.ts
 * Kaynak: docs/uyap-etakip/KodluBilgilerData.xml (UYAP 06.03.2026 paketi) + exchange.dtd (sürüm 1.2).
 * Yalnız rücu **İlamsız (Örnek 7)** takip için gereken alt küme. (Daire/il-ilçe kodları import anında UI'da seçilir.)
 */

// mahiyetKodu (KodluBilgilerData.xml · <mahiyetKodu>) — rücu = genel para alacağı, İlamsız Örnek 7
export const MAHIYET = {
  BELGESIZ_ORNEK7: '1307', // "Belgesiz - Örnek 7"
  DIGER_ORNEK7: '1407', // "Diğer - Örnek 7"
} as const

// faiz tip kodları (<faizIsmi>)
export const FAIZ_TIP = {
  REESKONT_ISKONTO: 'FAIZT00001',
  ADI_KANUNI: 'FAIZT00002', // = "Adi Kanuni Faiz" (Ayarlar'daki "Yasal faiz")
  DIGER: 'FAIZT00003',
  REESKONT_AVANS: 'FAIZT00007', // ticari işlerde avans faizi
  UFE: 'FAIZT00009',
} as const

export const FAIZ_TIP_ADI: Record<string, string> = {
  FAIZT00001: 'Reeskont İskonto',
  FAIZT00002: 'Adi Kanuni Faiz',
  FAIZT00003: 'Diğer',
  FAIZT00007: 'Reeskont Avans',
  FAIZT00009: 'ÜFE',
}

/** Ayarlar.faizTuru metnini UYAP faiz tip koduna çevir (varsayılan: yasal/kanuni faiz). */
export function faizTipKodFromTuru(faizTuru?: string | null): string {
  const t = (faizTuru ?? '').toLocaleLowerCase('tr')
  if (t.includes('avans') || t.includes('reeskont') || t.includes('ticari')) return FAIZ_TIP.REESKONT_AVANS
  if (t.includes('üfe') || t.includes('ufe')) return FAIZ_TIP.UFE
  return FAIZ_TIP.ADI_KANUNI
}

// rolTur (<rolTur>) — rücuda Ray hep ALACAKLI, muhatap BORÇLU
export const ROL = {
  ALACAKLI: { rolID: '21', Rol: 'ALACAKLI' },
  BORCLU: { rolID: '22', Rol: 'BORÇLU/MÜFLİS' },
} as const

// alacak kalem kodları (<alacakKalemKodlar>) — ilamsız "Diğer" grubu
export const ALACAK_KALEM = {
  DIGER_ASIL: { kod: '3', adi: 'Diğer Asıl Alacağı', tip: '3', turu: '1' },
  DIGER_FAIZ: { kod: '6', adi: 'Diğer Faiz Alacağı', tip: '3', turu: '2' },
  DIGER_MASRAF: { kod: '5', adi: 'Diğer Masraf Alacağı', tip: '3', turu: '0' },
  VEKALET_ILAMSIZ: { kod: '6668', adi: 'Avukatlık Ücreti', tip: '0', turu: '1' },
} as const

// adres türleri (<adresTuru>) — MERNİS yerleşim yeri = "Yurt İçi İkametgah"
export const ADRES_TURU = {
  IKAMETGAH: 'ADRTR00001',
  ISYERI: 'ADRTR00002',
  ETEBLIGAT: 'ADRTR00013',
} as const

/**
 * Rücu takibi preset'i. ✅ DOĞRULANDI (KodluBilgilerData.xml kod tabloları, 06.03.2026 paketi):
 *   takipTuru=1 → "İlamsız Takip" · takipYolu=0 → "Genel Haciz Yoluyla Takip"
 *   takipSekli=0 → "İlamsız Takiplerde Ödeme Emri (Örnek 7 / eski 49)" · dosyaTuru=0 (DTD'de tek geçerli)
 * `dosyaTipi` (DTD'de #REQUIRED, CDATA) → "35" "Esas Dosyası" (icraDosyaTurleri tablosu, satır 2187).
 *   Tablo-destekli seçim: "0" tabloda yok (placeholder'dı); rücu ilamsız takip = esas dosyası. Nihai onay
 *   ilk gerçek yükleme (pilot) ile gelir — UYAP ret verirse buradan değiştir.
 */
export const TAKIP_PRESET = {
  dosyaTipi: '35', // ✅ icraDosyaTurleri kod 35 "Esas Dosyası" (pilotla nihai teyit)
  dosyaTuru: '0', // ✅ DTD: yalnız "0" geçerli
  takipTuru: '1', // ✅ "İlamsız Takip"
  takipYolu: '0', // ✅ "Genel Haciz Yoluyla Takip"
  takipSekli: '0', // ✅ "İlamsız Takiplerde Ödeme Emri (Örnek 7)"
  mahiyetKodu: MAHIYET.DIGER_ORNEK7, // ✅ 1407 "Diğer - Örnek 7" — hukuken teyitli (rücu = genel para alacağı; 1307 Belgesiz DEĞİL)
  BK84MaddeUygulansin: 'H',
  BSMVUygulansin: 'H',
  KKDFUygulansin: 'H',
} as const
