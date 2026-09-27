/**
 * KonsLaw — UYAP Senkron · siniflandir.js — UYAP metninden OLAY SINIFLANDIRMA (saf fonksiyonlar)
 *
 * v1.9.0'da content.js'ten ayrıldı: DOM / chrome.* / ağ YOK, yalnız metin → olay. Böylece vitest'te
 * fs + vm ile yüklenip gerçek UYAP evrak adı örnekleriyle test edilir (tests/eklenti-siniflandir.test.ts).
 * manifest'te content.js'ten ÖNCE yüklenir (aynı isolated world) → content.js globalThis.KonsSiniflandir'i kullanır.
 *
 * NEDEN (denetim B24 · docs/04 K1): eski tipFromMetin
 *  1) String.toLowerCase() Türkçe değil: "İ" → "i̇" (i + U+0307 birleşik nokta) → "Borca İtiraz Talebi",
 *     "Takibe İtiraz" /itiraz/ ile EŞLEŞMİYORDU → gerçek itirazlar sessizce kaçıyordu.
 *  2) "Ödeme İcra Emri", harç/masraf/tahsil harcı makbuzları → TAHSILAT; tebligat talebi, zarf, İADE
 *     mazbatası → TEBLIG (→ yanlış İİK 62/78 görevi); müvekkilin alacağına başka dosyadan konan
 *     "dosya alacağına haciz" → HACIZ (→ sunucu dosyayı KESİNLEŞTİ'ye çekiyordu, D1 vakası).
 *
 * İTİRAZ BEYAZ LİSTESİ (Faz 1 inceleme, 2026-09-27): "İ" düzeltmesi çıplak /itiraz/ deseninin kapsamını çok
 * genişletti — "İtirazsız Kesinleşme", "Takip itiraz edilmeksizin kesinleşti", "Kıymet Takdirine İtiraz",
 * "İtirazdan Feragat" gibi metinler de ITIRAZ oluyordu. Sunucu ITIRAZ'ı borca itiraz sayar (Önemli Olay,
 * KESİNLEŞTİ → İTİRAZ geri dönüşü). Artık ITIRAZ YALNIZ borca / ödeme emrine / takibe / imzaya / yetkiye /
 * faize itiraz ve itiraz dilekçesi için üretilir; sıra: olumsuz → feragat → itirazın tebliği → itiraz
 * sonrası → güçlü borca itiraz → başka nitelikte itiraz → zayıf borca itiraz → türü belirsiz (DURUM).
 * Aynı sadelikte KESİNLEŞTİ de daraltıldı: talep / silme / türü belirsiz kesinleşme metni KESINLESTI DEĞİL.
 *
 * İÇ TİP ↔ SUNUCU TİPİ: sunucu (app/api/uyap/senkron → lib/konsrucu/takip-olay.ts OLAY_TIPLERI) yalnız
 * TEBLIG · ITIRAZ · KESINLESTI · TAHSILAT · HACIZ · KAPANDI · DURUM tanır. Ayrıntılı iç tipler (IADE,
 * dosya alacağına haciz, ihtiyati haciz, itiraz sonrası işlem, …) sunucuya DURUM olarak gider — DURUM
 * dosya durumunu ilerletmez, süre görevi açıp kapatmaz, UYAP kaynaklıysa Önemli Olay açmaz — ayrım
 * açıklamanın başındaki ETİKETLE görünür. Sunucu Faz 2'de bu tipleri tanıyınca yalnız SUNUCU_TIPLERI güncellenir.
 *
 * SUNUCUYLA AYNI KURAL: TEBLIG gönderilen her metnin sunucuda da gerçek tebliğ sayılması (gercekTebligMi)
 * ve aşama türevi itiraz açıklamasının sunucu önekiyle (ASAMA_ITIRAZ_ONEK) başlaması testte ÇAPRAZ kilitlidir.
 *
 * HUKUKİ NOT: buradaki ayrımlar METİN SEZGİSİDİR, hukuki tespit değildir. Her kural "teyit gerekli"
 * etiketlidir; kesin olay değil ADAY olaydır (B24 önerisi: durum ilerletmeden önce avukat/belge teyidi).
 */
(function (kok) {
  "use strict";
  if (kok.KonsSiniflandir) return; // çift yükleme (sayfa içi yeniden enjeksiyon) — ilk tanım kalsın

  // Sunucunun kabul ettiği tipler — lib/konsrucu/takip-olay.ts OLAY_TIPLERI ile AYNI tutulmalı.
  // Listede olmayan iç tip sunucuya DURUM olarak gider (sunucu da bilinmeyeni DURUM'a katlıyor;
  // biz açıkça DURUM gönderiyoruz ki davranış sunucu katlamasına bağlı kalmasın).
  const SUNUCU_TIPLERI = ["TEBLIG", "ITIRAZ", "KESINLESTI", "TAHSILAT", "HACIZ", "KAPANDI", "DURUM"];

  // Durum/aşama metninden türeyen itiraz olayının açıklaması. Sunucu (takip-olay.ts ASAMA_ITIRAZ_ONEK =
  // "Takibe itiraz (UYAP aşama") bu önekle gelen ITIRAZ'ı dosya başına BİR KEZ yazar ve dosyada başka ITIRAZ
  // olayı varsa hiç yazmaz. Öneki DEĞİŞTİRME (testte kilitli).
  const ASAMA_ITIRAZ_ACIKLAMA =
    "Takibe itiraz (UYAP aşama — itiraz tarihi bilinmiyor; tarih ödeme emri tebliği/takip açılışıdır, UYAP'tan bakın)";

  // DURUM'a katlanan iç tiplerin açıklama ETİKETİ (açıklamanın başına yazılır).
  // DİKKAT: sunucunun borcaItirazMi() açıklamada 'borca itiraz' / 'odeme emrine itiraz' / 'itiraz dilek'
  // arar → etiketler bu kalıpları İÇERMEMELİ (testte kilitli). Sunucu ayrıca UYAP kaynaklı DURUM'dan
  // Önemli Olay açmaz (takip-olay.ts onemliOlayAdayiMi) — ama etiket kuralı yine korunur.
  const ETIKET = {
    IADE: "İADE (tebligat iade / bila tebliğ — tebliğ sayılmadı)",
    TEBLIG_DIGER: "TEBLİĞ — ÖDEME EMRİ DIŞI EVRAK (İİK 78 süresini başlatmaz sayıldı — teyit gerekli)",
    HACIZ_DOSYA_ALACAGI: "DOSYA ALACAĞINA HACİZ (yönü belirsiz, müvekkil aleyhine olabilir — borçlu malına haciz sayılmadı, teyit gerekli)",
    HACIZ_IHTIYATI: "İHTİYATİ HACİZ (kesinleşme sayılmadı)",
    HACIZ_KALDIRMA: "HACİZ KALDIRMA / FEK (haciz sayılmadı)",
    ITIRAZ_SONRASI: "İTİRAZ SONRASI İŞLEM (ITIRAZ olayı sayılmadı)",
    ITIRAZ_TEBLIGI: "İTİRAZIN ALACAKLIYA TEBLİĞİ / MUHTIRA (İİK 67 süresi buradan işleyebilir — teyit gerekli)",
    ITIRAZ_FERAGAT: "İTİRAZDAN FERAGAT / GERİ ALMA (itiraz sayılmadı — takip kesinleşmiş olabilir, teyit gerekli)",
    ITIRAZ_DIGER: "İTİRAZ — TÜRÜ BELİRSİZ (takibe/ödeme emrine yönelik sayılmadı, teyit gerekli)",
    KESINLESME_TALEBI: "KESİNLEŞTİRME TALEBİ (kesinleşme sayılmadı)",
    KESINLESME_SILINDI: "KESİNLEŞME SİLİNDİ / İPTAL — avukat baksın",
    KESINLESME_BELIRSIZ: "KESİNLEŞME — TÜRÜ BELİRSİZ (kesinleşme sayılmadı, teyit gerekli)",
    TAHSILAT_BELIRSIZ: "TAHSİLAT / REDDİYAT (kaynak belirsiz — tahsilat sayılmadı, teyit gerekli)",
    TAAHHUT: "TAAHHÜT (İİK 111 — tahsilat sayılmadı, teyit gerekli)",
  };
  // Sunucuya HACIZ olarak giden hacizlerde açıklamanın SONUNA eklenen tür notu.
  const HACIZ_EK = { BORCLU_MALI: "borçlu malına haciz", BELIRSIZ: "haciz türü belirsiz" };
  const ACIKLAMA_MAX = 200;
  const tr = (s) => String(s == null ? "" : s).trim();

  /**
   * Türkçe duyarlı normalize: tr-TR küçük harf + birleşik işaretleri sil (İ'nin U+0307 noktası,
   * ç ş ğ ö ü â î û) + ı → i + boşluk sadeleştir. Sonuç ASCII desenlerle güvenle aranır:
   *   "Borca İtiraz Talebi" → "borca itiraz talebi" · "TAKİBE İTİRAZ" → "takibe itiraz" · "Kâtip" → "katip".
   * tr-TR yerel ayarı yoksa bile doğru: varsayılan küçültmenin ürettiği "i̇" NFD'de i + U+0307'dir, silinir.
   */
  function trNorm(s) {
    let t = String(s == null ? "" : s);
    try { t = t.toLocaleLowerCase("tr-TR"); } catch (e) { t = t.toLowerCase(); }
    return t
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ─── desenler (trNorm çıktısı üzerinde; hepsi ASCII) ───
  const RE = {
    itiraz: /itiraz/,
    // (1) İtirazın YOKLUĞUNU ya da süresini anlatan metin — itiraz DEĞİL, çoğu kez kesinleşme bildirimi:
    // "İtirazsız Kesinleşme", "Takip itiraz edilmeksizin kesinleşti", "İTİRAZ EDİLMEDİĞİNDEN KESİNLEŞMİŞTİR".
    // DİKKAT: "itiraz edilmesi üzerine" (olumlu) eşleşmez — yalnız edilmed/edilmem/edilmeksizin.
    itirazOlumsuz: /itirazsiz|itiraz\s+(edilmed|edilmem|edilmeksizin|etmed|etmem|etmeksizin|yapilmad|olmad|bulunmad|vaki\s+olmad|yok\b)|itiraz\s+sure/,
    // (2) İtirazdan feragat / geri alma — takip kesinleşir, süre İŞLER (tam tersi anlam). — teyit gerekli
    itirazFeragat: /itiraz(dan|indan|in|ini|inin)?\s+(\S+\s+)?(feragat|vazgec|geri\s*al|geri\s*cek)/,
    // (3) İtirazın alacaklıya tebliği / itiraz muhtırası (İİK 62/2): İİK 67'nin 1 yıllık süresi buradan işler
    // (B01 — teyit gerekli). Ayrı etiketle DURUM; "tebliğ" içerdiği için TEBLIG kuralından ÖNCE yakalanır.
    itirazTeblig: /itiraz(in|a)?\s+(dilekcesinin\s+)?(alacakliya\s+)?teblig|itirazin\s+alacakliya|itiraz\s+muhtira/,
    // (4) İtirazdan SONRA gelen işlemler: itirazın kaldırılması (İİK 68/68-a) / iptali (İİK 67) / reddi.
    itirazSonrasi: /itiraz(in|inin)\s+(kaldiril|iptal|redd)/,
    // (5) GÜÇLÜ borca itiraz — itirazın kendisi (kurallar.cjs itirazEslesmeGucu GUCLU listesiyle hizalı;
    // "icra emrine itiraz" HARİÇ: ilamlı takipte İİK 33 başvurusudur, takibi kendiliğinden durdurmaz).
    borcaItirazGuclu: /borca\s+(ve\s+\S+\s+)?itiraz|odeme\s+emrine\s+itiraz|takibe\s+itiraz|imzaya\s+itiraz|yetki(ye)?\s+itiraz/,
    // (6) Başka NİTELİKTE itiraz — borca itiraz DEĞİL: icra emri (İİK 33), haciz ihbarnamesi (İİK 89/2),
    // kıymet takdiri (128/a), sıra cetveli (142), hacze / ihtiyati hacze (265), istihkak (96 vd.), bilirkişi
    // raporu, masraf/harç, ihale/satış … — teyit gerekli
    itirazBaskaNitelik: /(icra\s+emr|ihbarname|kiymet\s+takdir|sira\s+cetvel|hacz|haciz|istihkak|bilirkisi|rapor|ihale|satis|tahliye|masraf|harc|vekalet\s+ucret|kesif|tensip|ara\s+karar|memur\s+islem|sikayet)\w*\s+(\S+\s+)?itiraz/,
    // (7) ZAYIF borca itiraz: itiraz dilekçesi, faize / fer'ilere / asıl alacağa itiraz (kısmi itiraz —
    // sunucu kismiItirazMi bunu açıklamadan okur). Başka nitelik kontrolünden SONRA: "Bilirkişi Raporuna
    // İtiraz Dilekçesi" borca itiraz değildir.
    borcaItirazZayif: /itiraz\s+dilek|faiz\w*\s+(\S+\s+)?itiraz|fer'?ile?r\w*\s+itiraz|asil\s+alacag\w*\s+itiraz/,
    haciz: /haciz|hacz[ei]/, // "haciz", "haczi", "haczin", "hacze", "haczedildi"
    // "Dosya alacağına haciz": docs/04 D1'de müvekkilin BU dosyadaki alacağına başka icra dosyalarından
    // konan haciz ("Dosya Alacağına Haciz Ekleme/Silme"). Aynı ad, bizim borçlunun başka dosyadaki
    // alacağına koyduğumuz haczi de anlatabilir — metinden ayrılamaz → güvenli taraf: durum ilerletme.
    // Müvekkil aleyhineyse dosyaya yatan para haczeden dosyaya reddiyat edilebilir. — teyit gerekli
    hacizDosyaAlacagi: /dosya(daki)?\s+alacag/,
    // İhtiyati haciz kesinleşme göstergesi değildir (İİK 257, 264 son f.; B23/B24) — teyit gerekli
    hacizIhtiyati: /ihtiyati\s+hac/,
    // Haczin kaldırılması / fekki / silinmesi — haciz DEĞİL (kurallar.cjs hacizTuru KALDIRMA ile hizalı)
    hacizKaldirma: /kaldir|(^|[^a-z])fek(k|\b)|(^|[^a-z])silme|silin/,
    // Borçlu malı işaretleri: açıkça "borçlu" ya da borçlunun malvarlığı türleri (araç, taşınmaz, maaş,
    // banka, menkul) ya da haciz ihbarnamesi (İİK 89/1 — borçlunun üçüncü kişideki alacağı). — teyit gerekli
    hacizBorclu: /borclu|\barac(?!ilig)|\btasit|tasinmaz|gayrimenkul|\btapu|\bmaas|\bbanka|mevduat|menkul|ihbarname|89\s*[\/.-]\s*1\b/,
    kesinles: /kesinles/,
    // Kesinleştirme TALEBİ (alacaklı vekilinin talebi; itiraz varsa reddedilir) — kesinleşme DEĞİL
    kesinlesTalep: /kesinlestiril|kesinles\w*\s+(\S+\s+)?tale[pb]|tale[pb]\w*\s+(\S+\s+)?kesinles/,
    // Kesinleşme kaydının silinmesi / iptali — kesinleşme DEĞİL, avukat baksın
    kesinlesSilme: /kesinles\w*\s+(bilgisi\s+|serhi\s+)?(silin|silme|iptal|kaldir)|(silin|iptal)\w*\s+kesinles/,
    // YALNIZ bunlar KESINLESTI: icra dairesinin kesinleşme kaydı ("<borçlu> Kesinleşme Bilgisi Kaydedildi"),
    // kesinleşme şerhi, "takip kesinleşti" / "… kesinleşmiştir" bildirimi, itirazsız kesinleşme. — teyit gerekli
    kesinlesKayit: /kesinlesme\s+bilgisi\s+(kaydedil|guncellen|giril)|kesinlesme\s+serh|takip(in)?\s+(\S+\s+){0,3}kesinles(ti|mis)|itirazsiz\s+kesinles|(^|[^a-z])kesinles(ti|mistir|mis)([^a-z]|$)/,
    tebligat: /teblig|tebligat|mazbata|\bzarf/,
    // İade/bila: "bila tebliğ", "tebliğ edilemedi/yapılamadı/imkânsız" kendi başına yeterli;
    // yalın "iade" ise YALNIZ tebligat bağlamında ve parasal değilse (harç/masraf iadesi ≠ tebligat iadesi).
    iadeAcik: /bila\s*-?\s*teblig|teblig\s+(edilemed|yapilamad|imkansiz)/,
    iadeKelime: /(^|[^a-z])iade(?!li)/,
    iadeTaahhut: /iade\s*-?\s*i\s+taahhut|iadeli\s+taahhut/g, // posta türü adı, iade sonucu DEĞİL
    iadeParasal: /masraf|harc|avans|ucret|gider|bedel|\bpara\b/,
    // Tebliğin YAPILDIĞINI açıkça söyleyen ifade — olumsuz ifadeden ÜSTÜN. TK 21/1 mazbatasında "adreste
    // bulunamadığından tebliğ edilemediğinden muhtara teslim, ihbarname kapıya yapıştırıldı" geçer; bu GEÇERLİ
    // bir tebliğdir, tebliğ tarihi ihbarnamenin yapıştırıldığı gündür (TK 21 — teyit gerekli). Sunucudaki
    // gercekTebligMi ile AYNI kural (testte çapraz kilitli).
    tebligPozitif: /teblig\s+(edildi|edilmistir|olundu)|tebellug|muhtara\s+teslim(?!\s+edilemed)|(kapiya|kapisina|haber\s+kagidi)\s+(\S+\s+)?yapistir|\btk\s*(m(adde|d)?\.?\s*)?(21|35)\b|\b(21|35)\s*\.\s*madde/,
    // Tebliğin GERÇEKLEŞTİĞİNİ gösteren metin: mazbata (e-tebliğ mazbatası dahil) ya da "tebliğ edildi".
    // Tebligat talebi / gönderimi / zarf / "Kapalı Tebligat" (giden evrak) bunları taşımaz → olay DEĞİL.
    tebligGerceklesti: /mazbata|teblig\s+(edildi|edilmis|olundu)|tebellug|okundu/,
    // ÖDEME EMRİ DIŞI evrakın tebliği: icra emri, 103 davetiyesi, kıymet takdiri, satış/ihale ilanı, muhtıra,
    // karar/tensip/bilirkişi, 89/1-2-3 ihbarnamesi. İİK 78 süresi ödeme emrinin tebliğinden işler → bunlar
    // TEBLIG gönderilmez (ayrı tarihli, gerçek son günden SONRAKİ görev doğururlardı). — teyit gerekli
    tebligDiger: /icra\s+emri|davetiye|kiymet\s+takdir|satis|ihale|muhtira|karar|bilirkisi|tensip|dava\s+dilekce|cevap\s+dilekce|89\s*[\/.-]\s*[123]\b/,
    odemeEmriAcik: /odeme\s+(icra\s+)?emr|ornek\s*(no\s*:?\s*)?7\b/,
    // Ödeme emri DÜZENLENMESİ (tahsilat değil; tebliği ayrıca mazbatayla gelir)
    odemeEmri: /odeme\s+(icra\s+)?emri|icra\s+emri|ornek\s*(no\s*:?\s*)?7\b/,
    // Büronun yaptığı ödemeler: harç, masraf, tahsil harcı, vekâlet pulu, gider avansı, sayman mutemet alındısı
    parasalMakbuz: /harc|masraf|vekalet\s+pulu|\bpul\b|avans|sayman|mutemet/,
    // Borçlu ödeme taahhüdü (İİK 111 taahhüt tutanağı) — ödeme DEĞİL; ihlali ayrı sonuç doğurur (İİK 340 — teyit gerekli)
    taahhut: /taahhu[td]/, // "taahhüt", "taahhüdü" (ünsüz yumuşaması)
    tahsilatBelge: /tahsil|reddiyat|odeme|odedi|yatiril|yatirdi|makbuz/,
    // Kaynağı metinden anlaşılmayan tahsilat izi: yalın tahsilat / reddiyat makbuzu, haricen tahsil. Dosyaya
    // yatan para da olabilir, büronun avans iadesi de → TAHSILAT değil, etiketli DURUM. — teyit gerekli
    tahsilatYalin: /tahsilat\s+makbuz|reddiyat|haricen\s+tahsil/,
    borclu: /borclu/,
    borcluya: /borcluya/, // borçluya reddiyat/iade = borçluya ödeme, borçludan tahsilat değil
  };

  function iadeMi(t) {
    if (RE.tebligPozitif.test(t)) return false; // TK 21 / 35 tebliği geçerli (bkz. desen notu)
    if (RE.iadeAcik.test(t)) return true;
    const u = t.replace(RE.iadeTaahhut, " ");
    return RE.tebligat.test(u) && RE.iadeKelime.test(u) && !RE.iadeParasal.test(u);
  }

  function sonuc(tip, ekstra) {
    const r = { tip, sunucuTip: SUNUCU_TIPLERI.indexOf(tip) >= 0 ? tip : "DURUM" };
    if (ETIKET[tip]) r.etiket = ETIKET[tip];
    return ekstra ? Object.assign(r, ekstra) : r;
  }

  /** "kesinleş" geçen metin: talep → silme → kayıt (KESINLESTI) → türü belirsiz. */
  function kesinlesmeSinifla(t) {
    if (RE.kesinlesTalep.test(t)) return sonuc("KESINLESME_TALEBI");
    if (RE.kesinlesSilme.test(t)) return sonuc("KESINLESME_SILINDI");
    if (RE.kesinlesKayit.test(t)) return sonuc("KESINLESTI");
    return sonuc("KESINLESME_BELIRSIZ");
  }

  /** "itiraz" geçen metin — sıra önemlidir (dosya başı notu). */
  function itirazSinifla(t) {
    if (RE.itirazOlumsuz.test(t)) return RE.kesinles.test(t) ? kesinlesmeSinifla(t) : null;
    if (RE.itirazFeragat.test(t)) return sonuc("ITIRAZ_FERAGAT");
    if (RE.itirazTeblig.test(t)) return sonuc("ITIRAZ_TEBLIGI");
    if (RE.itirazSonrasi.test(t)) return sonuc("ITIRAZ_SONRASI");
    if (RE.borcaItirazGuclu.test(t)) return sonuc("ITIRAZ");
    if (RE.itirazBaskaNitelik.test(t)) return sonuc("ITIRAZ_DIGER");
    if (RE.borcaItirazZayif.test(t)) return sonuc("ITIRAZ");
    return sonuc("ITIRAZ_DIGER");
  }

  /**
   * UYAP metni (evrak türü + açıklama, ya da safahat işlemi) → olay adayı | null.
   * Dönüş: { tip (iç tip), sunucuTip, etiket?, ek?, hacizTuru? } — null = olay üretme.
   * Sıra önemlidir (ilk eşleşen kazanır): itiraz → haciz → kesinleşme → tebligat → ödeme emri →
   * parasal makbuz → taahhüt → tahsilat. Özel kurallar genel "tebli"/"tahsil" kalıplarından ÖNCE gelir (B24).
   */
  function siniflandir() {
    const t = trNorm(Array.prototype.slice.call(arguments).filter(Boolean).join(" "));
    if (!t) return null;

    if (RE.itiraz.test(t)) return itirazSinifla(t);

    if (RE.haciz.test(t)) {
      if (RE.hacizDosyaAlacagi.test(t)) return sonuc("HACIZ_DOSYA_ALACAGI", { hacizTuru: "DOSYA_ALACAGI" });
      if (RE.hacizIhtiyati.test(t)) return sonuc("HACIZ_IHTIYATI", { hacizTuru: "IHTIYATI" });
      if (RE.hacizKaldirma.test(t)) return sonuc("HACIZ_KALDIRMA", { hacizTuru: "KALDIRMA" });
      if (RE.hacizBorclu.test(t)) return sonuc("HACIZ", { hacizTuru: "BORCLU_MALI", ek: HACIZ_EK.BORCLU_MALI });
      return sonuc("HACIZ", { hacizTuru: "BELIRSIZ", ek: HACIZ_EK.BELIRSIZ });
    }

    if (RE.kesinles.test(t)) return kesinlesmeSinifla(t);

    if (RE.tebligat.test(t)) {
      // İADE, "tebliğ edildi"den ÖNCE: bila tebliğ süreyi başlatmaz (B24) → TEBLIG gönderilmez.
      if (iadeMi(t)) return sonuc("IADE");
      if (!RE.tebligGerceklesti.test(t) && !RE.tebligPozitif.test(t)) return null; // talep / gönderim / zarf / kapalı tebligat
      // Ödeme emri dışı evrakın tebliği İİK 78'i başlatmaz → DURUM (ödeme emri açıkça yazıyorsa TEBLIG kalır)
      if (RE.tebligDiger.test(t) && !RE.odemeEmriAcik.test(t)) return sonuc("TEBLIG_DIGER");
      return sonuc("TEBLIG");
    }

    if (RE.odemeEmri.test(t)) return null; // "Ödeme İcra Emri", "Örnek 7 hazırlandı" → tahsilat DEĞİL
    if (RE.parasalMakbuz.test(t)) return null; // harç / masraf / tahsil harcı / vekâlet pulu makbuzu
    if (RE.taahhut.test(t)) return sonuc("TAAHHUT");

    // Borçludan tahsilat YALNIZ reddiyat/tahsilat evrakı açıkça borçlu ödemesini gösteriyorsa.
    if (RE.tahsilatBelge.test(t) && RE.borclu.test(t) && !RE.borcluya.test(t)) return sonuc("TAHSILAT");
    // Yalın "Tahsilat Makbuzu" / "Reddiyat Makbuzu" / "haricen tahsil": kaynak belirsiz → etiketli DURUM
    // (gerçek tahsilat tutarı hesap özetinde: yapilmisBorcTahsilati). — teyit gerekli
    if (RE.tahsilatYalin.test(t) && !RE.borcluya.test(t)) return sonuc("TAHSILAT_BELIRSIZ");

    return null;
  }

  /** Geriye uyum: eski tipFromMetin imzası — iç tip adı ya da null. */
  function tipFromMetin(s) {
    const r = siniflandir(s);
    return r ? r.tip : null;
  }

  /**
   * Dosya durumu / aşama metninden itiraz sinyali. UYAP icra listesinde durum "Açık (durdurulmuş :
   * Takibe İtiraz)" biçiminde gelir (docs/05 bulgu 1) — Türkçe normalize edilince güvenle yakalanır.
   * Yalnız borca itiraz niteliğindeki metin sayılır (itirazın kaldırılması/iptali vb. SAYILMAZ).
   */
  function durumdanItiraz(metin) {
    const r = siniflandir(metin);
    return !!(r && r.tip === "ITIRAZ");
  }

  /** Olay açıklaması: DURUM'a katlanan tipte ETİKET önde, haciz türü notu sonda; toplam ≤ 200 karakter. */
  function aciklamaKur(s, taban) {
    const metin = String(taban == null ? "" : taban).trim();
    const on = s && s.etiket ? s.etiket + " · " : "";
    const son = s && s.ek ? " · " + s.ek : "";
    const yer = Math.max(0, ACIKLAMA_MAX - on.length - son.length);
    return (on + metin.slice(0, yer) + son).slice(0, ACIKLAMA_MAX);
  }

  /**
   * Dosyanın yapısal tebliğ tarihi: evrak listesindeki EN ERKEN tebliğ tarihi — yalnız TEBLIG sınıflanan
   * (ya da sınıflanamayan) evrakın. İADE/bila, ödeme emri dışı tebliğ (icra emri, davetiye, kıymet takdiri…),
   * itirazın alacaklıya tebliği ve haciz ihbarnamesi evrakının tarihi "Tebliğ (UYAP)" olayı doğurmaz.
   */
  function tebligTarihiSec(evrakListesi) {
    const tarihler = [];
    for (const e of evrakListesi || []) {
      if (!e || !e.tebligTarihi) continue;
      const s = siniflandir(e.tur, e.aciklama);
      if (s && s.tip !== "TEBLIG") continue;
      tarihler.push(e.tebligTarihi);
    }
    return tarihler.sort()[0] || "";
  }

  /**
   * rec (content.js'in topladığı dosya kaydı) → sunucuya gidecek olaylar [{tip, tarih, aciklama}].
   * tip DAİMA SUNUCU_TIPLERI içindedir. Açıklaması DEĞİŞMEYEN olaylar eski sürümle birebir aynı
   * metni taşır (sunucu tekrarı tip+tarih+açıklama ile eler → yeniden yazım olmaz).
   */
  function olaylarTuret(rec) {
    const ol = [];
    const ekle = (tip, tarih, aciklama) => { if (tip) ol.push({ tip, tarih: tarih || null, aciklama: String(aciklama || "").slice(0, ACIKLAMA_MAX) }); };
    if (!rec) return ol;
    if (rec.tebligTarihi) ekle("TEBLIG", rec.tebligTarihi, "Tebliğ (UYAP)");
    for (const ev of rec.evrak || []) {
      if (!ev) continue;
      const s = siniflandir(ev.tur, ev.aciklama);
      if (!s) continue;
      // TEBLIG'de önce TEBLİĞ tarihi (docs/04 K3): mazbatanın evrak/dönüş tarihi gerçek tebliğden SONRADIR →
      // evrak tarihinden kurulan İİK 78 son günü gerçekte olduğundan geç çıkar (tehlikeli yön).
      const tarih = s.sunucuTip === "TEBLIG" ? ev.tebligTarihi || ev.tarih : ev.tarih || ev.tebligTarihi;
      if (!tarih) continue;
      // Taban metin eskisi gibi tür (yoksa açıklama) — değişmeyen olaylar sunucuda mükerrer yazılmasın.
      // DURUM'a katlanan YENİ olaylarda açıklama da eklenir: "İADE"yi doğuran ifade çoğu kez oradadır.
      let taban = ev.tur || ev.aciklama;
      if (s.sunucuTip === "DURUM" && ev.tur && ev.aciklama && tr(ev.aciklama) !== tr(ev.tur)) taban = tr(ev.tur) + " — " + tr(ev.aciklama);
      ekle(s.sunucuTip, tarih, aciklamaKur(s, taban));
    }
    for (const sf of rec.safahat || []) {
      if (!sf) continue;
      const s = siniflandir(sf.islem);
      if (s && sf.tarih) ekle(s.sunucuTip, sf.tarih, aciklamaKur(s, sf.islem));
    }
    // Aşama/durum metni itiraz diyorsa ("Açık (durdurulmuş : Takibe İtiraz)") ve tarihli itiraz olayı yoksa:
    // tarih SABİT ve GÜVENLİ TARAFTA seçilir — ödeme emri tebliği, yoksa takip açılışı. İtiraz bunlardan önce
    // olamaz → bu tarih itiraz tarihinin ALT SINIRIDIR (B01 önerisi). Eskiden son safahat/evrak tarihi
    // kullanılıyordu: her turda değişiyor (sunucuda yeni olay + yeni Önemli Olay) ve gerçek itirazdan SONRAKİ
    // bir tarih veriyordu (İİK 67 son günü geç görünür). Tarih hiç yoksa olay ÜRETİLMEZ. Sunucu bu olayı dosya
    // başına bir kez yazar (takip-olay.ts ASAMA_ITIRAZ_ONEK).
    if (!ol.some((o) => o.tip === "ITIRAZ") && (durumdanItiraz(rec.asama) || durumdanItiraz(rec.durum))) {
      const t = rec.tebligTarihi || rec.acilis || "";
      if (t) ekle("ITIRAZ", t, ASAMA_ITIRAZ_ACIKLAMA);
    }
    return ol;
  }

  kok.KonsSiniflandir = Object.freeze({
    surum: "1.9.0",
    SUNUCU_TIPLERI: SUNUCU_TIPLERI.slice(),
    ETIKET: Object.assign({}, ETIKET),
    HACIZ_EK: Object.assign({}, HACIZ_EK),
    ASAMA_ITIRAZ_ACIKLAMA,
    trNorm, siniflandir, tipFromMetin, durumdanItiraz, aciklamaKur, tebligTarihiSec, olaylarTuret,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
