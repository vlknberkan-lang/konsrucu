/**
 * KonsLaw — UYAP Senkron · saf.js (v2.0.0)
 * Tarayıcıya ve UYAP'a DOKUNMAYAN saf yardımcılar. manifest.json'da content.js'ten ÖNCE yüklenir;
 * globalThis.KonsSaf üzerinden çağrılır. Testte (tests/eklenti-*.test.ts) node:vm ile ayrı bağlamda yüklenir.
 *
 * İçerik:
 *  1) Faiz seçimi (S21): varsayılan YOK; talep metni seçimden kurulur, "%......" kalmaz.
 *     ÇAPRAZ KİLİT: faizSecimiEksikleri / oranCoz / faizTalepMetni / kopilotFaizDestekli, sunucudaki
 *     lib/konsrucu/senkron/takip-talebi.ts ile BİREBİR aynı sonucu verir (test kilitler).
 *  2) UYAP faiz türü kodu: yalnız keşif kaydıyla kanıtlanmış kod (FAIZT00002 "Adi Kanuni Faiz", 2026-07-06).
 *     Eşlenemeyen seçimde kopilot DURUR: "Faiz türünü UYAP'ta elle seçin".
 *  3) tevziGovdesi(h, u): Takip Aç kopilotunun tevzi / harç kuru prova gövdesi. Yapı keşif kaydındaki gövdeyle
 *     aynıdır; yalnız faizBilgileri ve dosyaAciklama_48_4 programdaki seçimden gelir. Gövdeyi GÖNDERMEZ —
 *     gönderim content.js'te, avukatın özet ekranında "Gönder"e basması ve onay kutusuyla olur (değişmedi).
 */
(function (kok) {
  "use strict";

  var FAIZ_TURLERI = ["YASAL", "AVANS", "DIGER"];
  var FAIZ_BASLANGIC_TURLERI = ["HER_ODEMEDEN", "TEK_TARIH"];
  var FAIZ_TURU_ETIKET = { YASAL: "Yasal faiz", AVANS: "Avans faizi", DIGER: "Diğer (sabit oran)" };

  /** Keşifle kanıtlanmış UYAP faiz türü kodları. Yeni kod ancak keşif kaydıyla eklenir (uydurulmaz). */
  var FAIZ_UYAP_KODLARI = {
    YASAL_DEGISEN: { tktId: "FAIZT00002", kod: "00002", aciklama: "Adi Kanuni Faiz", kodTuru: "FAIZT" },
  };

  function oranCoz(metin) {
    var s = String(metin == null ? "" : metin).trim().toLocaleLowerCase("tr");
    if (!s) return null;
    if (s.indexOf("değişen") >= 0 || s.indexOf("degisen") >= 0) return { tip: "DEGISEN" };
    var m = s.match(/^%?\s*(\d{1,3}(?:[.,]\d{1,4})?)\s*%?$/);
    if (!m) return null;
    var yuzde = Number(m[1].replace(",", "."));
    return isFinite(yuzde) && yuzde > 0 && yuzde <= 200 ? { tip: "YUZDE", yuzde: yuzde } : null;
  }

  function isoGun(d) {
    if (d == null || d === "") return null;
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    var x = new Date(d);
    if (isNaN(x.getTime())) return null;
    return new Date(x.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  }

  function ggaa(iso, ayrac) {
    var p = String(iso).split("-");
    return p[2] + ayrac + p[1] + ayrac + p[0];
  }

  function faizSecimiEksikleri(s) {
    var e = [];
    if (!s || !s.faizTuru || FAIZ_TURLERI.indexOf(s.faizTuru) < 0) e.push("Faiz türü seçilmedi");
    var oran = oranCoz(s && s.faizOraniMetni);
    if (!oran) e.push("Faiz oranı seçilmedi");
    else if (s && s.faizTuru === "DIGER" && oran.tip !== "YUZDE") e.push("Diğer faiz türünde yıllık oran (%) girilmeli");
    if (!s || !s.faizBaslangicTuru || FAIZ_BASLANGIC_TURLERI.indexOf(s.faizBaslangicTuru) < 0) e.push("Faiz başlangıcı seçilmedi");
    else if (s.faizBaslangicTuru === "TEK_TARIH" && !isoGun(s.faizBaslangic)) e.push("Faiz başlangıç tarihi girilmedi");
    return e;
  }

  function faizTalepMetni(s) {
    if (!s || faizSecimiEksikleri(s).length) return null;
    var oran = oranCoz(s.faizOraniMetni);
    var bas = s.faizBaslangicTuru === "TEK_TARIH" ? ggaa(isoGun(s.faizBaslangic), ".") + " tarihinden itibaren" : "her bir ödeme tarihinden itibaren";
    var oranMetni = oran.tip === "DEGISEN" ? "değişen oranlarda" : "yıllık %" + String(oran.yuzde).replace(".", ",") + " oranında";
    var tur = s.faizTuru === "YASAL" ? "yasal faizi" : s.faizTuru === "AVANS" ? "avans faizi" : "faizi";
    return "Alacağın " + bas + " tahsili tarihine kadar " + oranMetni + " " + tur + ", masraf ve vekalet ücreti ile tahsili, kısmi ödemelerde BK.100'e göre yapılmasını talep ederim.";
  }

  /** Seçimin UYAP faiz türü kodu; kanıtlanmış kod yoksa null (kopilot durur). */
  function faizUyapKodu(s) {
    if (!s || faizSecimiEksikleri(s).length) return null;
    var oran = oranCoz(s.faizOraniMetni);
    if (s.faizTuru === "YASAL" && oran && oran.tip === "DEGISEN") return FAIZ_UYAP_KODLARI.YASAL_DEGISEN;
    return null;
  }

  function kopilotFaizDestekli(s) {
    return !!faizUyapKodu(s);
  }

  /**
   * Kopilot "Hazırla"dan ÖNCE (UYAP'a tek istek gitmeden) faiz ön kontrolü. Hata varsa kopilot durur.
   * h.faiz: program /api/uyap/takip-hedefler'den gelir; eski program (faiz yok) → durur.
   */
  function faizOnKontrol(h) {
    var faiz = h && h.faiz;
    if (!faiz) return { ok: false, hata: "Faiz türü, oranı ve başlangıcı programda seçilmedi — dosyanın takip talebi panelinden seçin." };
    var eksik = faizSecimiEksikleri(faiz);
    if (eksik.length) return { ok: false, hata: "Faiz seçimi eksik: " + eksik.join(", ") + " — programda takip talebi panelinden tamamlayın." };
    var kod = faizUyapKodu(faiz);
    if (!kod) return { ok: false, hata: "Faiz türünü UYAP'ta elle seçin: \"" + (FAIZ_TURU_ETIKET[faiz.faizTuru] || faiz.faizTuru) + " · " + faiz.faizOraniMetni + "\" seçimi kopilotla aktarılamıyor (UYAP kodu keşifle teyit edilmedi). Takibi UYAP'ta elle açın." };
    var talep = faizTalepMetni(faiz);
    if (!talep || talep.indexOf("%......") >= 0) return { ok: false, hata: "Talep metni kurulamadı — faiz seçimini kontrol edin." };
    if (faiz.talepMetni && faiz.talepMetni !== talep) return { ok: false, hata: "Program ile eklentinin faiz metni uyuşmuyor — eklentiyi güncelleyin ya da takibi elle açın." };
    return { ok: true, kod: kod, talep: talep };
  }

  function varsayilanRid() { return Math.random().toString(36).slice(2, 10); }

  /**
   * Tevzi / harç kuru prova gövdesi (keşif kaydı 2026-07-06 ile aynı yapı).
   * h: program hedefi { alacak: {anapara, islemisFaiz, faizBaslangic}, aciklama, adliye: {ilKodu, il}, faiz }
   * u: UYAP'tan canlı çözülen parçalar { adliye, sekilAd, yolAd, mahiyet: {name, value}, tarafList, rid? }
   * Dönüş: { ok: true, govde, faizKodu, talepMetni } | { ok: false, hata }
   */
  function tevziGovdesi(h, u) {
    var on = faizOnKontrol(h);
    if (!on.ok) return on;
    var rid = (u && typeof u.rid === "function") ? u.rid : varsayilanRid;
    var tarafList = u.tarafList || [];
    var tumTarafIdx = tarafList.map(function (_, ix) { return ix; });
    var kalemler = [{
      selectedTarafHashKeyList: tumTarafIdx, selectedTarafList: tumTarafIdx.join(","),
      temelBilgileri: {
        alacakTutariTL: h.alacak.anapara, alacakTutari: h.alacak.anapara,
        selectedParaBirimi: "PRBRMTL", selectedParaBirimiAciklama: "TL-Türk Lirası", selectedParaBirimiKod: "TL-Türk Lirası",
        KDV: false, aciklama: "Asıl Alacak",
        selectedAlacakKalemKodu: { alacakKalemKodAciklama: "Diğer Asıl Alacağı", alacakKalemKod: 3 },
      },
      faizBilgileri: {
        selectedFaizTuru: { tktId: on.kod.tktId, kod: on.kod.kod, aciklama: on.kod.aciklama, kodTuru: on.kod.kodTuru },
        faizOraniKurus: 0, selectedFaizSureTipi: "2", selectedFaizSureTipiAdi: "Yıllık",
      },
      id: 0,
    }];
    if (h.alacak.islemisFaiz > 0) kalemler.push({
      selectedTarafHashKeyList: tumTarafIdx, selectedTarafList: tumTarafIdx.join(","),
      temelBilgileri: {
        alacakTutariTL: h.alacak.islemisFaiz, alacakTutari: h.alacak.islemisFaiz,
        selectedParaBirimi: "PRBRMTL", selectedParaBirimiAciklama: "TL-Türk Lirası", selectedParaBirimiKod: "TL-Türk Lirası",
        KDV: false, aciklama: "İşlemiş Faiz",
        selectedAlacakKalemKodu: { alacakKalemKodAciklama: "Diğer Faiz Alacağı", alacakKalemKod: 6 },
      },
      faizBilgileri: {},
      id: 1,
    });
    var adliye = u.adliye;
    var idb = {
      selectedIl: { il: h.adliye.ilKodu, ad: h.adliye.il, ilceler: [], kodAciklamaCiksin: false, bolgeId: 0, buyuksehir: false, takbisIlKodu: 0 },
      kotaKullanimSekliText: "Avukat", kotaKullanimSekli: 0,
      selectedAdliye: adliye, adliyeBirimId: adliye.adliyeBirimID, adliyeIsmi: adliye.adliyeIsmi,
      selectedTakipTuru: { name: "İlamsız Takip", value: 1 }, takipTuru: 1, takipTuruText: "İlamsız Takip",
      selectedTakipSekli: { name: u.sekilAd, value: 0 }, takipSekli: 0, takipSekliText: u.sekilAd,
      selectedTakipYolu: { name: u.yolAd, value: 0 }, takipYolu: 0, takipYoluText: u.yolAd,
      dosyaTevziTipiBanka: false, dosyaTevziTipiGayrimenkul: false,
      dosyaAciklama_48_4: on.talep,
      dosyaAciklama_48_9: "Haciz Yolu",
      ipotekRehinAciklama: "",
      selectedTakipMahiyeti: u.mahiyet.value, mahiyetId: u.mahiyet.value, mahiyetText: u.mahiyet.name,
      selectedDosyaKriterleri: [{ kod: "bk", mahiyetAdi: "B.K. 100.Madde", zorunlu: true, degistirilemez: true }],
      dosyaKriterList: "bk", dosyaKriterTextList: "B.K. 100.Madde",
      showHacizTahliyeValue: false, hacizOnayValue: false, tahliyeOnayValue: false,
    };
    var ilamsiz = [{
      ilamsizTipi: "diger", alacakNo: "", alacakTarihi: h.alacak.faizBaslangic && /^\d{4}-\d{2}-\d{2}/.test(h.alacak.faizBaslangic) ? ggaa(h.alacak.faizBaslangic.slice(0, 10), "/") : "",
      meblagi: h.alacak.anapara, meblagTuruAciklama: "TL-Türk Lirası", meblagTuru: "PRBRMTL",
      aciklama: h.aciklama, id: rid(), alacakKalemleri: kalemler,
    }];
    return {
      ok: true,
      faizKodu: on.kod,
      talepMetni: on.talep,
      govde: {
        IcraDosyaBilgileri: JSON.stringify(idb),
        TarafList: JSON.stringify(tarafList),
        IlamsizList: JSON.stringify(ilamsiz),
        IlamliList: "[]",
        TahsilatList: "[]",
      },
    };
  }

  // ── İş kuyruğu (S22) yardımcıları ──────────────────────────────────────────
  /** Eklentinin ürettiği rastgele cihaz kimliği (kişisel veri değil; kurulum başına bir kez). */
  function cihazKimligiUret(rastgele) {
    var r = typeof rastgele === "function" ? rastgele : Math.random;
    var s = "";
    var harf = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < 24; i++) s += harf.charAt(Math.floor(r() * harf.length));
    return "ck_" + s;
  }

  /** Yeni biçim (kişiye bağlı) anahtar mı? Eski kiracı anahtarı "kr_…" ile başlar. */
  function yeniAnahtarMi(t) { return /^kr2_[A-Za-z0-9_-]{40,64}$/.test(String(t || "")); }

  /**
   * Anahtar listesini tekilleştirir: aynı müvekkil (musteriId) için yeni anahtar varsa eski anahtar kullanılmaz
   * ("yeni anahtar ayarlanınca ona geçilsin"). Kimliği bilinmeyen anahtar olduğu gibi kalır (geri uyum).
   * bilgi: { [anahtar]: { musteriId, tur: "YENI" | "ESKI" } }
   */
  function anahtarlariTekillestir(liste, bilgi) {
    var b = bilgi || {};
    var yeniMusteri = {};
    (liste || []).forEach(function (t) { var x = b[t]; if (x && x.musteriId && (x.tur === "YENI" || yeniAnahtarMi(t))) yeniMusteri[x.musteriId] = true; });
    var gorulen = {};
    return (liste || []).filter(function (t) {
      if (!t || gorulen[t]) return false;
      gorulen[t] = true;
      var x = b[t];
      if (x && x.musteriId && !(x.tur === "YENI" || yeniAnahtarMi(t)) && yeniMusteri[x.musteriId]) return false;
      return true;
    });
  }

  var api = {
    surum: "2.0.0",
    FAIZ_TURLERI: FAIZ_TURLERI,
    FAIZ_BASLANGIC_TURLERI: FAIZ_BASLANGIC_TURLERI,
    FAIZ_TURU_ETIKET: FAIZ_TURU_ETIKET,
    FAIZ_UYAP_KODLARI: FAIZ_UYAP_KODLARI,
    oranCoz: oranCoz,
    faizSecimiEksikleri: faizSecimiEksikleri,
    faizTalepMetni: faizTalepMetni,
    faizUyapKodu: faizUyapKodu,
    kopilotFaizDestekli: kopilotFaizDestekli,
    faizOnKontrol: faizOnKontrol,
    tevziGovdesi: tevziGovdesi,
    cihazKimligiUret: cihazKimligiUret,
    yeniAnahtarMi: yeniAnahtarMi,
    anahtarlariTekillestir: anahtarlariTekillestir,
  };
  kok.KonsSaf = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
