/**
 * KonsRücü — UYAP olayından ADAY üretimi · lib/konsrucu/eksen/aday-siniflandir.ts (saf, client-safe)
 *
 * Eklenti 1.8 ve 1.9'un gönderdiği `olaylar[]` (tip + tarih + açıklama) burada SUNUCUDA yeniden okunur ve
 * hukuki anlamını taşıyan alt tipe çevrilir (06 M1; plan S15: "eski olaylar da aday, kural eklenti-1.x").
 *
 * Eklenti 1.9 ayrıntılı iç tipleri (İADE, dosya alacağına haciz, ihtiyati haciz, itirazın alacaklıya tebliği,
 * kesinleştirme talebi, türü belirsiz tahsilat …) sunucuya DURUM tipiyle ve açıklamanın BAŞINDAKİ ETİKETLE
 * gönderir (extension/siniflandir.js ETIKET). Bu modül o etiketleri tanır; 1.8'in etiketsiz olaylarını da
 * metinden yeniden okur (Türkçe "İ" düzeltmeli normalize ile — docs/04 K1).
 *
 * Kök neden kilitleri (docs/04 §3):
 *  • K1  Evrak adından TAHSİLAT türetilmez: 1.8'in TAHSILAT'ı, makbuzlar ve reddiyat TAHSILAT_SINYALI /
 *        MASRAF_MAKBUZU / REDDIYAT olur; gerçek tahsilat yalnız UYAP "Yatan Para" farkından doğar (tahsilat.ts).
 *        Ödeme emri tahsilat değildir.
 *  • K2  "Dosya alacağına haciz" ve ihtiyati haciz ayrı alt tiptir; hiçbiri kesinleşme sayılmaz.
 *  • K3  İADE / bila tebliğ, tebligat talebi ve gönderimi TEBLİĞ SONUCU değildir; tebliğ şekli ve muhatap
 *        metinden önerilir, hukuki tarih avukat onayıyla kesinleşir.
 *  • Durum metninden türeyen itirazın tarihi İTİRAZ TARİHİ DEĞİLDİR → hukukiTarih BOŞ kalır ("tarih teyit gerekli").
 *
 * Buradaki eşlemeler METİN SEZGİSİDİR, hukuki tespit değildir; her aday avukat onayı bekler (teyit gerekli).
 */
import { trNorm } from './norm'
import { KURAL, type AltTip, type KaynakTuru, type Muhatap, type TebligSekli, type TebligSonuc } from './sabitler'

/** Eklenti 1.9'un aşama/durum metninden türettiği itiraz açıklamasının öneki (takip-olay.ts ASAMA_ITIRAZ_ONEK ile aynı). */
const ASAMA_ITIRAZ_ONEK_NORM = trNorm("Takibe itiraz (UYAP aşama")

export type EklentiOlayi = {
  /** Eklentinin gönderdiği ham tip (beyaz listeye katlanmadan önce). */
  tip: string
  aciklama: string | null
  /** Eklentinin gönderdiği tarih (evrak/tebliğ/safahat tarihi); hukuki tarih DEĞİLDİR. */
  tarih: Date | null
}

export type AdayOneri = {
  altTip: AltTip
  kural: string
  kaynakTuru: KaynakTuru
  /** Önerilen hukuki tarih. Tarihi bilinmeyen (durum metni) ya da hukuki anlamı olmayan olayda null. */
  hukukiTarih: Date | null
  sonuc: TebligSonuc | null
  tebligSekli: TebligSekli | null
  muhatap: Muhatap | null
  /** Kullanıcıya gösterilecek kısa not ("tarih teyit gerekli" gibi). */
  not: string | null
}

// ── Eklenti 1.9 etiketleri (extension/siniflandir.js ETIKET; normalize edilmiş başlangıçlar) ──
// `ic`: eklentinin İÇ tip adı (extension/siniflandir.js ETIKET anahtarı). Eklenti 1.9 bunları DURUM + etiketle
// gönderir; ileride tip alanında doğrudan gönderirse (IADE, HACIZ_DOSYA_ALACAGI …) aynı alt tipe çevrilir.
const ETIKET_DESEN: readonly { ic: string; re: RegExp; altTip: AltTip; kural: string; not?: string; sonuc?: TebligSonuc; muhatap?: Muhatap }[] = [
  { ic: 'IADE', re: /^iade \(tebligat iade/, altTip: 'TEBLIG_IADE', kural: KURAL.EK1_TEBLIG_IADE, sonuc: 'IADE', not: 'Tebliğ edilemedi (İADE): süre başlamaz (teyit gerekli).' },
  { ic: 'TEBLIG_DIGER', re: /^teblig — odeme emri disi/, altTip: 'DIGER', kural: KURAL.EK1_TEBLIG_DIGER, not: 'Ödeme emri dışı evrakın tebliği; İİK 62 süresini başlatmaz (teyit gerekli).' },
  { ic: 'HACIZ_DOSYA_ALACAGI', re: /^dosya alacagina haciz/, altTip: 'MUVEKKIL_ALACAGINA_HACIZ', kural: KURAL.EK1_HACIZ_DOSYA_ALACAGI, not: 'Müvekkilin bu dosyadaki alacağına başka dosyadan konan haciz olabilir; kesinleşme sayılmaz (teyit gerekli).' },
  { ic: 'HACIZ_IHTIYATI', re: /^ihtiyati haciz/, altTip: 'IHTIYATI_HACIZ', kural: KURAL.EK1_HACIZ_IHTIYATI, not: 'İhtiyati haciz kesinleşme göstergesi değildir (teyit gerekli).' },
  { ic: 'HACIZ_KALDIRMA', re: /^haciz kaldirma/, altTip: 'DIGER', kural: KURAL.EK1_HACIZ_DIGER, not: 'Haczin kaldırılması; haciz sayılmadı.' },
  { ic: 'ITIRAZ_SONRASI', re: /^itiraz sonrasi islem/, altTip: 'DIGER', kural: KURAL.EK1_ITIRAZ_DIGER, not: 'İtirazdan sonraki işlem (kaldırma, iptal, ret); itiraz olayı sayılmadı.' },
  { ic: 'ITIRAZ_TEBLIGI', re: /^itirazin alacakliya teblig/, altTip: 'ITIRAZIN_ALACAKLIYA_TEBLIGI', kural: KURAL.EK1_ITIRAZ_TEBLIGI, muhatap: 'ALACAKLI_VEKILI', not: 'İİK 67 süresi bu tebliğden işleyebilir (teyit gerekli).' },
  { ic: 'ITIRAZ_FERAGAT', re: /^itirazdan feragat/, altTip: 'DIGER', kural: KURAL.EK1_ITIRAZ_DIGER, not: 'İtirazdan feragat ya da geri alma sinyali: takip kesinleşmiş olabilir; avukat baksın (teyit gerekli).' },
  { ic: 'ITIRAZ_DIGER', re: /^itiraz — turu belirsiz/, altTip: 'DIGER', kural: KURAL.EK1_ITIRAZ_DIGER, not: 'Türü belirsiz itiraz; ödeme emrine itiraz sayılmadı (teyit gerekli).' },
  { ic: 'KESINLESME_TALEBI', re: /^kesinlestirme talebi/, altTip: 'DIGER', kural: KURAL.EK1_KESINLESME_DIGER, not: 'Kesinleştirme talebi kesinleşme değildir.' },
  { ic: 'KESINLESME_SILINDI', re: /^kesinlesme silindi/, altTip: 'DIGER', kural: KURAL.EK1_KESINLESME_DIGER, not: 'Kesinleşme kaydı silindi ya da iptal edildi; avukat baksın.' },
  { ic: 'KESINLESME_BELIRSIZ', re: /^kesinlesme — turu belirsiz/, altTip: 'DIGER', kural: KURAL.EK1_KESINLESME_DIGER, not: 'Türü belirsiz kesinleşme metni; kesinleşme sayılmadı (teyit gerekli).' },
  { ic: 'TAHSILAT_BELIRSIZ', re: /^tahsilat \/ reddiyat \(kaynak belirsiz/, altTip: 'TAHSILAT_SINYALI', kural: KURAL.EK1_TAHSILAT_SINYALI, not: 'Evrak adından gelen tahsilat izi; tahsilat sayılmadı. Gerçek tahsilat UYAP "Yatan Para" farkından gelir.' },
  { ic: 'TAHSILAT_SINYALI', re: /^tahsilat sinyali/, altTip: 'TAHSILAT_SINYALI', kural: KURAL.EK1_TAHSILAT_SINYALI, not: 'Evrak adından gelen tahsilat izi; tahsilat sayılmadı.' },
  { ic: 'TAAHHUT', re: /^taahhut \(iik 111/, altTip: 'DIGER', kural: KURAL.EK1_DIGER, not: 'Ödeme taahhüdü; tahsilat sayılmadı (teyit gerekli).' },
]

// ── Metin desenleri (trNorm çıktısı; eklentinin desenleriyle hizalı) ──
const RE = {
  bilaIade: /bila\s*-?\s*teblig|teblig\s+(edilemed|yapilamad|imkansiz)/,
  iadeKelime: /(^|[^a-z])iade(?!li)/,
  iadeTaahhut: /iade\s*-?\s*i\s+taahhut|iadeli\s+taahhut/g,
  iadeParasal: /masraf|harc|avans|ucret|gider|bedel|\bpara\b/,
  tebligPozitif: /teblig\s+(edildi|edilmistir|olundu)|tebellug|muhtara\s+teslim(?!\s+edilemed)|(kapiya|kapisina|haber\s+kagidi)\s+(\S+\s+)?yapistir|okundu\s+sayil|\btk\s*(m(adde|d)?\.?\s*)?(21|35)\b/,
  tebligatTalebi: /teblig\w*\s+(cikarilmasi\s+|gonderilmesi\s+|yapilmasi\s+)?tale[pb]/,
  tebligatGonderim: /kapali\s+teblig|\bzarf|teblig\w*\s+gonder|posta(ya)?\s+ver/,
  uets: /\buets\b|e-?\s?teblig|elektronik\s+teblig|okundu\s+sayil|ulastig/,
  tk21_1: /21\s*[/.]\s*1\b/,
  tk21_2: /21\s*[/.]\s*2\b|muhtar\w*\s+teslim/,
  tk35: /\btk\s*(m(adde|d)?\.?\s*)?35\b|\b35\s*\.?\s*madde/,
  alacakliVekili: /alacakli\s+vekil/,
  odemeEmri: /odeme\s+(icra\s+)?emri|ornek\s*(no\s*:?\s*)?7\b/,
  parasalMakbuz: /harc|masraf|vekalet\s+pulu|\bpul\b|avans|sayman|mutemet/,
  reddiyat: /reddiyat/,
  dosyaAlacagi: /dosya(daki)?\s+alacag/,
  ihtiyati: /ihtiyati\s+hac/,
  hacizKaldirma: /kaldir|(^|[^a-z])fek(k|\b)|(^|[^a-z])silme|silin/,
  borcluMali: /borclu\s+malina\s+haciz|borclu|\barac|tasinmaz|gayrimenkul|\bmaas|\bbanka|mevduat|menkul|ihbarname/,
  // Kesinleşme KAYDI (talep / silme değil) — eklentinin kesinlesKayit deseniyle hizalı
  kesinlesTalep: /kesinlestiril|kesinles\w*\s+(\S+\s+)?tale[pb]|tale[pb]\w*\s+(\S+\s+)?kesinles/,
  kesinlesSilme: /kesinles\w*\s+(bilgisi\s+|serhi\s+)?(silin|silme|iptal|kaldir)|(silin|iptal)\w*\s+kesinles/,
  kesinlesKayit: /kesinlesme\s+bilgisi\s+(kaydedil|guncellen|giril)|kesinlesme\s+serh|takip(in)?\s+(\S+\s+){0,3}kesinles(ti|mis)|itirazsiz\s+kesinles|(^|[^a-z])kesinles(ti|mistir|mis)([^a-z]|$)/,
  davaSinyali: /hukuk\s+mahkemesi\s+tevzi|itirazin\s+iptali\s+dava|dava\s+acildi/,
  // Borca itiraz (güçlü + zayıf); başka nitelikteki itiraz (icra emri, kıymet takdiri …) DIGER kalır
  borcaItiraz: /borca\s+(ve\s+\S+\s+)?itiraz|odeme\s+emrine\s+itiraz|takibe\s+itiraz|imzaya\s+itiraz|yetki(ye)?\s+itiraz|itiraz\s+dilek|faiz\w*\s+(\S+\s+)?itiraz/,
  // UYAP durum metni: "Açık (durdurulmuş : Takibe İtiraz)" (docs/05 bulgu 1)
  durumItiraz: /durdurul\w*\s*:?\s*(\S+\s+){0,2}itiraz|itiraz\w*\s*(\S+\s+){0,2}durdur/,
} as const

/** Tebliğ şekli önerisi (metin sezgisi; teyit gerekli). */
export function tebligSekliOner(t: string): TebligSekli {
  if (RE.uets.test(t)) return 'UETS'
  if (RE.tk21_1.test(t)) return 'TK21_1'
  if (RE.tk21_2.test(t)) return 'TK21_2'
  if (RE.tk35.test(t)) return 'TK35'
  if (/bizzat|muhatabin\s+kendisine|kendisine\s+teslim/.test(t)) return 'MUHATABA'
  return 'BELIRSIZ'
}

function iadeMi(t: string): boolean {
  if (RE.tebligPozitif.test(t)) return false // TK 21 / 35 tebliği geçerli tebliğdir
  if (RE.bilaIade.test(t)) return true
  const u = t.replace(RE.iadeTaahhut, ' ')
  return /teblig|mazbata|\bzarf/.test(u) && RE.iadeKelime.test(u) && !RE.iadeParasal.test(u)
}

function oneri(altTip: AltTip, kural: string, p: Partial<AdayOneri> = {}): AdayOneri {
  return {
    altTip, kural,
    kaynakTuru: p.kaynakTuru ?? 'UYAP_EVRAK',
    hukukiTarih: p.hukukiTarih ?? null,
    sonuc: p.sonuc ?? null,
    tebligSekli: p.tebligSekli ?? null,
    muhatap: p.muhatap ?? null,
    not: p.not ?? null,
  }
}

/** Tebliğ türü metin (TEBLIG tipli ya da etiketsiz) → aday. */
function tebligOku(t: string, tarih: Date | null): AdayOneri {
  if (iadeMi(t)) return oneri('TEBLIG_IADE', KURAL.EK1_TEBLIG_IADE, { hukukiTarih: tarih, sonuc: 'IADE', tebligSekli: tebligSekliOner(t), not: 'Tebliğ edilemedi (İADE): süre başlamaz (teyit gerekli).' })
  if (!RE.tebligPozitif.test(t) && RE.tebligatTalebi.test(t)) return oneri('TEBLIGAT_TALEBI', KURAL.EK1_TEBLIGAT_TALEBI, { not: 'Tebliğden önceki işlem; tebliğ tarihi değildir.' })
  if (!RE.tebligPozitif.test(t) && !/mazbata|okundu/.test(t) && RE.tebligatGonderim.test(t)) return oneri('TEBLIGAT_GONDERIM', KURAL.EK1_TEBLIGAT_GONDERIM, { not: 'Tebligat gönderildi; sonuç henüz yok.' })
  const muhatap: Muhatap = RE.alacakliVekili.test(t) ? 'ALACAKLI_VEKILI' : 'BELIRSIZ'
  const sonuc: TebligSonuc = RE.tebligPozitif.test(t) ? 'TEBLIG' : 'BELIRSIZ'
  return oneri('TEBLIG_SONUCU', KURAL.EK1_TEBLIG, {
    hukukiTarih: tarih, sonuc, tebligSekli: tebligSekliOner(t), muhatap,
    not: 'UYAP tebliğ kaydı; hukuki tebliğ tarihini ve şeklini mazbatadan kontrol edin (teyit gerekli).',
  })
}

/**
 * Eklentinin gönderdiği TEK olay → aday önerisi. Hiçbir zaman null dönmez (bilinmeyen = DIGER, eksene girmez).
 * `tip` eklentinin HAM tipidir (TEBLIG | ITIRAZ | KESINLESTI | TAHSILAT | HACIZ | KAPANDI | DURUM | bilinmeyen).
 */
export function eklentiOlayiniSinifla(o: EklentiOlayi): AdayOneri {
  const tip = String(o.tip ?? '').trim().toUpperCase()
  const t = trNorm(o.aciklama)
  const tarih = o.tarih && !Number.isNaN(o.tarih.getTime()) ? o.tarih : null

  // 1) Eklenti 1.9 etiketleri (DURUM tipiyle gelir; tip ne olursa olsun etiket önceliklidir). İç tip adı
  //    tip alanında doğrudan gelirse (ileriki sürüm ya da 1.9'un katlanmamış gövdesi) aynı eşleme uygulanır.
  for (const e of ETIKET_DESEN) {
    if (e.ic !== tip && !e.re.test(t)) continue
    const hukukiTarih = e.altTip === 'DIGER' || e.altTip === 'TAHSILAT_SINYALI' ? null : tarih
    return oneri(e.altTip, e.kural, {
      hukukiTarih, sonuc: e.sonuc ?? null, muhatap: e.muhatap ?? null, not: e.not ?? null,
      tebligSekli: e.altTip === 'TEBLIG_IADE' || e.altTip === 'ITIRAZIN_ALACAKLIYA_TEBLIGI' ? tebligSekliOner(t) : null,
    })
  }

  switch (tip) {
    case 'TEBLIG':
      return tebligOku(t, tarih)

    case 'ITIRAZ': {
      // Aşama/durum metninden türeyen itiraz: tarih yalnız ALT SINIR (tebliğ ya da takip açılışı) → hukukiTarih BOŞ.
      if (t.startsWith(ASAMA_ITIRAZ_ONEK_NORM)) {
        return oneri('DURDURMA_ITIRAZ', KURAL.EK1_ITIRAZ_ASAMA, {
          kaynakTuru: 'UYAP_YAPISAL', hukukiTarih: null,
          not: 'UYAP takibi itiraz nedeniyle durdurulmuş gösteriyor; itiraz tarihi bilinmiyor (tarih teyit gerekli).',
        })
      }
      // UYAP evrak tarihi itirazın UYAP KAYIT tarihidir; kalem kaşesi daha erken olabilir (docs/04 §2 D1).
      return oneri('ITIRAZ', KURAL.EK1_ITIRAZ, {
        hukukiTarih: tarih,
        not: 'Tarih UYAP kayıt tarihidir; kalem kaşesi tarihini itiraz dilekçesinden kontrol edin (teyit gerekli).',
      })
    }

    case 'KESINLESTI':
      if (!RE.kesinlesTalep.test(t) && !RE.kesinlesSilme.test(t) && (RE.kesinlesKayit.test(t) || !t)) {
        return oneri('KESINLESME_SERHI', KURAL.EK1_KESINLESME, {
          hukukiTarih: tarih,
          not: 'UYAP kesinleşme sinyali; takip avukat onayı olmadan kesinleşmiş sayılmaz (teyit gerekli).',
        })
      }
      return oneri('DIGER', KURAL.EK1_KESINLESME_DIGER, { not: 'Kesinleşme talebi ya da silme kaydı; kesinleşme sayılmadı.' })

    case 'TAHSILAT':
      // K1: evrak adından gelen tahsilat hiçbir zaman tahsilat değildir.
      if (RE.odemeEmri.test(t)) return oneri('ODEME_EMRI_DUZENLENDI', KURAL.EK1_ODEME_EMRI, { hukukiTarih: tarih, not: 'Ödeme emri düzenlendi; tahsilat değildir.' })
      if (RE.parasalMakbuz.test(t)) return oneri('MASRAF_MAKBUZU', KURAL.EK1_MASRAF, { not: 'Büronun ödediği harç ya da masraf; tahsilat değildir.' })
      if (RE.reddiyat.test(t)) return oneri('REDDIYAT', KURAL.EK1_REDDIYAT, { not: 'Reddiyat evrakı; tahsilat sayılmadı (teyit gerekli).' })
      return oneri('TAHSILAT_SINYALI', KURAL.EK1_TAHSILAT_SINYALI, { not: 'Evrak adından gelen tahsilat izi; tahsilat sayılmadı. Gerçek tahsilat UYAP "Yatan Para" farkından gelir.' })

    case 'HACIZ':
      if (RE.dosyaAlacagi.test(t)) return oneri('MUVEKKIL_ALACAGINA_HACIZ', KURAL.EK1_HACIZ_DOSYA_ALACAGI, { hukukiTarih: tarih, not: 'Müvekkilin bu dosyadaki alacağına başka dosyadan konan haciz olabilir; kesinleşme sayılmaz (teyit gerekli).' })
      if (RE.ihtiyati.test(t)) return oneri('IHTIYATI_HACIZ', KURAL.EK1_HACIZ_IHTIYATI, { hukukiTarih: tarih, not: 'İhtiyati haciz kesinleşme göstergesi değildir (teyit gerekli).' })
      if (RE.hacizKaldirma.test(t)) return oneri('DIGER', KURAL.EK1_HACIZ_DIGER, { not: 'Haczin kaldırılması; haciz sayılmadı.' })
      if (RE.borcluMali.test(t)) return oneri('ICRAI_HACIZ', KURAL.EK1_HACIZ_BORCLU, { hukukiTarih: tarih, not: 'Borçlu malına haciz sinyali (teyit gerekli).' })
      return oneri('DIGER', KURAL.EK1_HACIZ_DIGER, { not: 'Haciz türü belirsiz; borçlu malına haciz sayılmadı (teyit gerekli).' })

    case 'KAPANDI':
      return oneri('DIGER', KURAL.EK1_KAPANIS_SINYALI, { not: 'UYAP kapanış sinyali; dosyayı yalnız avukat kapatır (kapanış sebebi sorulur).' })

    default: {
      // DURUM ya da bilinmeyen tip: etiketsiz metni yeniden oku (1.8 ve 1.9'un etiketlenmemiş olayları)
      if (RE.davaSinyali.test(t)) return oneri('DAVA_ACILDI_SINYALI', KURAL.EK1_DAVA_SINYALI, { hukukiTarih: tarih, not: 'UYAP\'ta dava açıldığına dair sinyal; bağlamayı avukat onaylar.' })
      if (/teblig|mazbata/.test(t) && (iadeMi(t) || RE.tebligPozitif.test(t))) return tebligOku(t, tarih)
      if (RE.borcaItiraz.test(t) && !/kaldiril|iptal|redd|feragat/.test(t)) {
        return oneri('ITIRAZ', KURAL.EK1_ITIRAZ, { hukukiTarih: tarih, not: 'Tarih UYAP kayıt tarihidir; kalem kaşesi tarihini kontrol edin (teyit gerekli).' })
      }
      return oneri('DIGER', KURAL.EK1_DIGER, {})
    }
  }
}

/**
 * UYAP durum metni itiraz diyor mu? ("Açık (durdurulmuş : Takibe İtiraz)", "TAKİBE İTİRAZ" aşaması).
 * İtirazın BİRİNCİ sinyalidir (06 §2(e)); tarih taşımaz. İtirazın kaldırılması/iptali/feragati sayılmaz.
 */
export function durumMetniItirazMi(metin: unknown): boolean {
  const t = trNorm(metin)
  if (!t) return false
  if (/kaldiril|iptal|feragat|redd/.test(t)) return false
  return RE.durumItiraz.test(t) || RE.borcaItiraz.test(t)
}

/** Durum metni itiraz sinyali → aday (dosya başına tek; tarih yok). */
export function durumMetniItirazAdayi(): AdayOneri {
  return oneri('DURDURMA_ITIRAZ', KURAL.UY_DURUM_ITIRAZ, {
    kaynakTuru: 'UYAP_YAPISAL', hukukiTarih: null,
    not: 'UYAP durum metni takibin itiraz nedeniyle durduğunu söylüyor; itiraz tarihi bilinmiyor (tarih teyit gerekli).',
  })
}
