/**
 * KonsRücü — Tensip provası · lib/konsrucu/dilekce-v2/tensip-provasi.ts (saf; client-safe)
 *
 * S37 (06 §7.4-7; 07 S37). Dilekçe, tensip zaptı yazılacakmış gibi sabit bir kontrol listesinden geçer: dava
 * şartları (HMK 114–115), zorunlu unsurlar (HMK 119), dava şartı arabuluculukta son tutanak eki, vekâletname,
 * harç satırı. Ölçüt: "süre verilecek eksik = 0, usulden ret sebebi = 0". Bu kontrol listesi Dava ön kontrol
 * kapısından (lib/konsrucu/dava/on-kontrol.ts, dava AÇILMADAN önce çalışır) ayrıdır: burası dilekçenin son
 * hâlini, imza öncesinde, hâkimin ilk göreceği hâliyle tarar (06 §8.4 "üç kapı ayrı kontrol listesi").
 *
 * Yalnız SON TUTANAK EKİ maddesi kırmızıdır (imzayı kilitler); diğer maddeler bilgi/teyit amaçlıdır — avukat
 * onaylı gerekçeyle geçebilir (kapilar.ts bu bilgiyi K8_TENSIP altında yalnız son tutanak için kullanır).
 */

export type TensipMaddeDurumu = 'TAMAM' | 'EKSIK' | 'ENGEL'
export type TensipMaddesi = { kod: string; baslik: string; durum: TensipMaddeDurumu; aciklama: string }

export type TensipGirdi = {
  /** Arabuluculuk bu dosyada dava şartı mı (Arabuluculuk.tur === 'DAVA_SARTI') VE avukat gerekçeli "gerekmez"
   *  demiş mi (KartSecimler.arabuluculukGerekmez + arabuluculukGerekce) — o zaman istisna kabul edilir. */
  davaSartiArabuluculuk: boolean
  sonTutanakEkVar: boolean
  vekaletnameVar: boolean
  /** Dilekçenin nihai metni (yalnız zorunlu başlık taraması için; hukuki değerlendirme yapılmaz). */
  metin: string
}

export type TensipSonucu = {
  maddeler: TensipMaddesi[]
  /** Dolu ise imzayı kilitleyen tek kırmızı neden (06 §7.4-7); diğer maddeler bilgilendirmedir. */
  kirmiziMesaj: string | null
}

const ZORUNLU_BASLIKLAR: { kod: string; baslik: string; re: RegExp }[] = [
  { kod: 'ACIKLAMALAR', baslik: 'Açıklamalar (vakıalar)', re: /AÇIKLAMALAR/u },
  { kod: 'SONUC_ISTEM', baslik: 'Sonuç ve istem', re: /SONUÇ\s+VE\s+İSTEM/iu },
]

/** Sabit kontrol listesi (06 §7.4-7). Yalnız `SON_TUTANAK_EKI` maddesi ENGEL olabilir. */
export function tensipProvasi(g: TensipGirdi): TensipSonucu {
  const maddeler: TensipMaddesi[] = []
  let kirmiziMesaj: string | null = null

  if (g.davaSartiArabuluculuk && !g.sonTutanakEkVar) {
    kirmiziMesaj = 'Dava şartı arabuluculukta son tutanak eki yok (HUAK 18/A); tensipte "dava şartı yokluğu" nedeniyle usulden ret riski var.'
    maddeler.push({ kod: 'SON_TUTANAK_EKI', baslik: 'Son tutanak eki', durum: 'ENGEL', aciklama: kirmiziMesaj })
  } else {
    maddeler.push({
      kod: 'SON_TUTANAK_EKI', baslik: 'Son tutanak eki', durum: 'TAMAM',
      aciklama: g.davaSartiArabuluculuk ? 'Son tutanak EK listesinde var.' : 'Arabuluculuk bu dosyada dava şartı sayılmıyor.',
    })
  }

  for (const z of ZORUNLU_BASLIKLAR) {
    const varMi = z.re.test(g.metin)
    maddeler.push({
      kod: z.kod, baslik: z.baslik, durum: varMi ? 'TAMAM' : 'EKSIK',
      aciklama: varMi ? 'Metinde bulunuyor.' : `"${z.baslik}" bölümü metinde görünmüyor; HMK 119 zorunlu unsuru teyit edin.`,
    })
  }

  maddeler.push({
    kod: 'VEKALETNAME', baslik: 'Vekâletname', durum: g.vekaletnameVar ? 'TAMAM' : 'EKSIK',
    aciklama: g.vekaletnameVar ? 'Dosyada vekâletname evrakı var.' : 'Dosyada vekâletname evrakı bulunamadı; teyit gerekli.',
  })
  maddeler.push({ kod: 'HARC_AVANS', baslik: 'Harç ve gider avansı', durum: 'EKSIK', aciklama: 'Tutar tarife hesabından değil elle girilir; teyit gerekli (ertelendi).' })

  return { maddeler, kirmiziMesaj }
}
